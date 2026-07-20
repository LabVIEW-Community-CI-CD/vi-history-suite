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
  type StagedPreviewRenderResult,
  type StagedSide
} from '../../src/reporting/comparisonPreviewPipeline';

/**
 * VHS-REQ-699.1 / VHS-REQ-699.2 / VHS-REQ-699.4 / VHS-REQ-699.5: the integration
 * seam maps the pure pipeline state machine onto retained per-cycle runtime
 * evidence (pipelineCycles) and classifies the preview-validation short-circuit
 * that the always-on live-comparison wiring surfaces.
 */
function buildPipeline(
  renders: Record<StagedSide, StagedPreviewRenderResult>,
  comparison: ComparisonRunResult
) {
  return runComparisonPreviewPipeline({
    renderStagedPreview: (side) => Promise.resolve(renders[side]),
    runComparison: () => Promise.resolve(comparison)
  });
}

describe('comparisonPreviewPipelineIntegration', () => {
  it('maps a clean pass to three ordered cycle records with timing', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true }
    );

    const records = toPipelineCycleRecords(pipeline);

    expect(records.map((r) => r.state)).toEqual(['PREVIEW_LEFT', 'PREVIEW_RIGHT', 'COMPARISON']);
    expect(records.map((r) => r.outcome)).toEqual(['rendered', 'rendered', 'compared']);
    for (const record of records) {
      expect(typeof record.durationMs).toBe('number');
      expect(record.failureReason).toBeUndefined();
    }
    expect(isPreviewValidationFailure(pipeline)).toBe(false);
  });

  it('marks a preview-validation short-circuit and leaves the skipped comparison unmetered', async () => {
    const pipeline = await buildPipeline(
      {
        left: { rendered: false, failureReason: 'labview-preview-operation-load-failed' },
        right: { rendered: true }
      },
      { succeeded: true }
    );

    const records = toPipelineCycleRecords(pipeline);
    const comparison = records[2];

    expect(comparison.outcome).toBe('skipped');
    expect(comparison.failureReason).toBe(STAGED_VI_PREVIEW_VALIDATION_FAILED);
    // A skipped cycle carries no timing.
    expect(comparison.durationMs).toBeUndefined();
    expect(comparison.interCycleGapMs).toBeUndefined();
    expect(isPreviewValidationFailure(pipeline)).toBe(true);
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

  it('omits interCycleGapMs from the first cycle record', async () => {
    const pipeline = await buildPipeline(
      { left: { rendered: true }, right: { rendered: true } },
      { succeeded: true }
    );

    const first = toPipelineCycleRecord(pipeline.previewLeft);
    expect(first.state).toBe('PREVIEW_LEFT');
    // The shared meter reports no inter-cycle gap for the first measured cycle.
    expect(first.interCycleGapMs).toBeUndefined();
  });
});
