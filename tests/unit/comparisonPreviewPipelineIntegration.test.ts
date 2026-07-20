import { describe, expect, it } from 'vitest';

import {
  STAGED_VI_PREVIEW_VALIDATION_FAILED,
  isPreviewValidationFailure,
  toPipelineCycleRecord,
  toPipelineCycleRecords
} from '../../src/reporting/comparisonPreviewPipelineIntegration';
import {
  runComparisonPreviewPipeline,
  type ComparisonRunResult,
  type StageInputsResult,
  type StagedPair,
  type StagedPreviewRenderResult,
  type StagedSide,
  type UnstageInputsResult
} from '../../src/reporting/comparisonPreviewPipeline';

/**
 * VHS-REQ-699.1 / VHS-REQ-699.2 / VHS-REQ-699.4 / VHS-REQ-699.5 / VHS-REQ-699.6 / VHS-REQ-699.7:
 * the integration seam maps the pure pipeline state machine onto retained
 * per-state runtime evidence (pipelineCycles) covering STAGING, both previews,
 * VALIDATION, COMPARISON and UNSTAGING, and classifies the preview-validation
 * rejection that the always-on live-comparison wiring surfaces.
 */
const PAIR: StagedPair = { leftPath: '/staged/left.vi', rightPath: '/staged/right.vi' };

function buildPipeline(
  renders: Record<StagedSide, StagedPreviewRenderResult>,
  comparison: ComparisonRunResult,
  options: { stage?: StageInputsResult; unstage?: UnstageInputsResult } = {}
) {
  return runComparisonPreviewPipeline({
    stageInputs: () =>
      Promise.resolve(options.stage ?? { outcome: 'already-staged', staged: PAIR }),
    renderStagedPreview: (side) => Promise.resolve(renders[side]),
    runComparison: () => Promise.resolve(comparison),
    unstageInputs: () => Promise.resolve(options.unstage ?? { status: 'already-clean' })
  });
}

describe('comparisonPreviewPipelineIntegration', () => {
  it('maps a clean pass to six ordered state records with timing', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true },
      { unstage: { status: 'removed' } }
    );

    const records = toPipelineCycleRecords(pipeline);

    expect(records.map((r) => r.state)).toEqual([
      'STAGING',
      'PREVIEW_LEFT',
      'PREVIEW_RIGHT',
      'VALIDATION',
      'COMPARISON',
      'UNSTAGING'
    ]);
    expect(records.map((r) => r.outcome)).toEqual([
      'already-staged',
      'rendered',
      'rendered',
      'admitted',
      'compared',
      'removed'
    ]);
    // Preview cycle records carry their staged-side input.
    expect(records[1].input).toBe('left');
    expect(records[2].input).toBe('right');
    // Timed states carry a numeric duration (VALIDATION is a pure decision, untimed).
    for (const record of records) {
      if (record.state !== 'VALIDATION') {
        expect(typeof record.durationMs).toBe('number');
      }
      expect(record.failureReason).toBeUndefined();
    }
    expect(isPreviewValidationFailure(pipeline)).toBe(false);
  });

  it('marks a preview-validation rejection, naming the side, and skips the comparison', async () => {
    const pipeline = await buildPipeline(
      {
        left: { rendered: false, failureReason: 'labview-preview-operation-load-failed' },
        right: { rendered: true }
      },
      { succeeded: true }
    );

    const records = toPipelineCycleRecords(pipeline);
    const validation = records.find((r) => r.state === 'VALIDATION');
    const comparison = records.find((r) => r.state === 'COMPARISON');

    expect(validation?.outcome).toBe('rejected');
    expect(validation?.input).toBe('left');
    expect(validation?.failureReason).toBe(STAGED_VI_PREVIEW_VALIDATION_FAILED);
    expect(comparison?.outcome).toBe('skipped');
    expect(comparison?.failureReason).toBe(STAGED_VI_PREVIEW_VALIDATION_FAILED);
    // A skipped cycle carries no timing.
    expect(comparison?.durationMs).toBeUndefined();
    expect(comparison?.interCycleGapMs).toBeUndefined();
    expect(isPreviewValidationFailure(pipeline)).toBe(true);
  });

  it('does not classify a staging failure as a preview-validation failure', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true },
      { stage: { outcome: 'failed', failureReason: 'left-staged-input-missing' } }
    );

    const records = toPipelineCycleRecords(pipeline);
    expect(records[0]).toMatchObject({ state: 'STAGING', outcome: 'failed', failureReason: 'left-staged-input-missing' });
    // Staging failure is a rejection, but not a preview-validation failure.
    expect(isPreviewValidationFailure(pipeline)).toBe(false);
  });

  it('does not classify a genuine comparison failure as a preview-validation failure', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: false, failureReason: 'command-exited-nonzero' }
    );

    expect(isPreviewValidationFailure(pipeline)).toBe(false);
    expect(toPipelineCycleRecord(pipeline.comparison)).toMatchObject({
      state: 'COMPARISON',
      outcome: 'failed',
      failureReason: 'command-exited-nonzero'
    });
  });

  it('carries the UNSTAGING diagnostic status and reason into its evidence record', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true },
      { unstage: { status: 'partial', failureReason: 'right-retained' } }
    );

    const records = toPipelineCycleRecords(pipeline);
    const unstaging = records.find((r) => r.state === 'UNSTAGING');
    expect(unstaging?.outcome).toBe('partial');
    expect(unstaging?.failureReason).toBe('right-retained');
  });

  it('carries the actual removed/retained staged artifacts into the UNSTAGING record', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true },
      {
        unstage: {
          status: 'removed',
          removedPaths: ['/staging/left.vi', '/staging/right.vi'],
          retainedPaths: ['/report/diff.html', '/report/metadata.json']
        }
      }
    );

    const records = toPipelineCycleRecords(pipeline);
    const unstaging = records.find((r) => r.state === 'UNSTAGING');
    expect(unstaging?.outcome).toBe('removed');
    expect(unstaging?.removedPaths).toEqual(['/staging/left.vi', '/staging/right.vi']);
    expect(unstaging?.retainedPaths).toEqual(['/report/diff.html', '/report/metadata.json']);
  });

  it('omits empty removed/retained arrays from the UNSTAGING record', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true },
      { unstage: { status: 'already-clean', removedPaths: [], retainedPaths: [] } }
    );

    const records = toPipelineCycleRecords(pipeline);
    const unstaging = records.find((r) => r.state === 'UNSTAGING');
    expect(unstaging?.outcome).toBe('already-clean');
    expect(unstaging?.removedPaths).toBeUndefined();
    expect(unstaging?.retainedPaths).toBeUndefined();
  });

  it('omits interCycleGapMs from the first (staging) state record', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true }
    );

    const records = toPipelineCycleRecords(pipeline);
    expect(records[0].state).toBe('STAGING');
    // The shared meter reports no inter-state gap for the first measured state.
    expect(records[0].interCycleGapMs).toBeUndefined();
  });
});
