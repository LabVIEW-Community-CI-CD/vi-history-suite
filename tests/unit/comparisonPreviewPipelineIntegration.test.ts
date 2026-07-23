import { describe, expect, it } from 'vitest';

import {
  STAGED_VI_PREVIEW_VALIDATION_FAILED,
  isPreviewValidationFailure,
  toPipelineCycleRecord,
  toPipelineCycleRecords,
  toStagingRecord,
  toUnstagingRecord
} from '../../src/reporting/comparisonPreviewPipelineIntegration';
import {
  runComparisonPreviewPipeline,
  type ComparisonRunResult,
  type PipelineCycleResult,
  type StageInputsResult,
  type StagedPair,
  type StagedPreviewRenderResult,
  type StagedSide,
  type StagingStateResult,
  type UnstageInputsResult,
  type UnstagingStateResult
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

describe('comparisonPreviewPipelineIntegration record mappers (untimed / no-gap branches)', () => {
  function measurement(durationMs: number, interCycleGapMs: number | undefined) {
    return {
      cycleIndex: 1,
      startedAtMs: 100,
      endedAtMs: 100 + durationMs,
      durationMs,
      interCycleGapMs,
      outcome: 'measured'
    };
  }

  it('omits durationMs and interCycleGapMs from a cycle record with no timing', () => {
    const result: PipelineCycleResult = { state: 'COMPARISON', outcome: 'compared' };
    const record = toPipelineCycleRecord(result);
    expect(record).toEqual({ state: 'COMPARISON', outcome: 'compared' });
    expect(record.durationMs).toBeUndefined();
    expect(record.interCycleGapMs).toBeUndefined();
  });

  it('retains durationMs but omits interCycleGapMs when a cycle carries duration without a gap', () => {
    const result: PipelineCycleResult = {
      state: 'PREVIEW_LEFT',
      outcome: 'rendered',
      input: 'left',
      cycle: measurement(7, undefined)
    };
    const record = toPipelineCycleRecord(result);
    expect(record.durationMs).toBe(7);
    expect(record.interCycleGapMs).toBeUndefined();
  });

  it('omits timing from a staging record with no cycle', () => {
    const result: StagingStateResult = {
      state: 'STAGING',
      outcome: 'failed',
      failureReason: 'left-staged-input-missing'
    };
    const record = toStagingRecord(result);
    expect(record).toEqual({ state: 'STAGING', outcome: 'failed', failureReason: 'left-staged-input-missing' });
    expect(record.durationMs).toBeUndefined();
  });

  it('retains both durationMs and interCycleGapMs when a staging cycle carries a gap', () => {
    const result: StagingStateResult = {
      state: 'STAGING',
      outcome: 'already-staged',
      cycle: measurement(4, 2)
    };
    const record = toStagingRecord(result);
    expect(record.durationMs).toBe(4);
    expect(record.interCycleGapMs).toBe(2);
  });

  it('omits timing from an unstaging record with no cycle', () => {
    const result: UnstagingStateResult = { state: 'UNSTAGING', status: 'removed' };
    const record = toUnstagingRecord(result);
    expect(record).toEqual({ state: 'UNSTAGING', outcome: 'removed' });
    expect(record.durationMs).toBeUndefined();
    expect(record.interCycleGapMs).toBeUndefined();
  });

  it('retains durationMs but omits interCycleGapMs when an unstaging cycle has no gap', () => {
    const result: UnstagingStateResult = {
      state: 'UNSTAGING',
      status: 'removed',
      cycle: measurement(9, undefined)
    };
    const record = toUnstagingRecord(result);
    expect(record.durationMs).toBe(9);
    expect(record.interCycleGapMs).toBeUndefined();
  });
});
