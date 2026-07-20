/**
 * VHS-REQ-699: integration seam between the pure single-pass comparison-preview
 * pipeline state machine (`runComparisonPreviewPipeline`) and the live comparison
 * runtime-execution path.
 *
 * The orchestrator in `comparisonPreviewPipeline.ts` is deliberately runtime-free:
 * it composes injected boundaries and returns a `ComparisonPreviewPipelineResult`.
 * This module maps that result onto the retained runtime-evidence shape
 * (`ComparisonPipelineCycleRecord[]`) and classifies whether the preview
 * validation gate short-circuited the comparison, so the caller in
 * `comparisonReportRuntimeExecution.ts` can attach the per-cycle evidence to the
 * packet and, on a preview-validation failure, surface an actionable
 * `staged-vi-preview-validation-failed` signal instead of running the fragile
 * CreateComparisonReport cycle. Kept pure and injectable so it stays
 * deterministically unit-testable without a LabVIEW runtime.
 */
import { ComparisonPipelineCycleRecord } from './comparisonReportPacket';
import {
  ComparisonPreviewPipelineResult,
  PipelineCycleResult,
  StagedPreviewRenderResult,
  StagedSide
} from './comparisonPreviewPipeline';
import type { ComparisonReportPacketRecord } from './comparisonReportPacket';

/** Stable failure reason surfaced when a staged VI fails its preview-load gate. */
export const STAGED_VI_PREVIEW_VALIDATION_FAILED = 'staged-vi-preview-validation-failed';

/** Input to the staged-VI preview validator (one preview cycle side). */
export interface StagedViPreviewValidatorInput {
  side: StagedSide;
  /** Absolute path to the staged VI on disk for this side. */
  viFilePath: string;
  record: ComparisonReportPacketRecord;
}

/**
 * Renders a preview of one staged VI to validate it loads before the fragile
 * comparison cycle. Injected into the runtime-execution path so the comparison
 * core stays testable without a LabVIEW runtime; the production action wires the
 * real renderer (always-on across providers).
 */
export type StagedViPreviewValidator = (
  input: StagedViPreviewValidatorInput
) => Promise<StagedPreviewRenderResult>;

/** Maps one pipeline cycle result to its retained runtime-evidence record. */
export function toPipelineCycleRecord(result: PipelineCycleResult): ComparisonPipelineCycleRecord {
  const record: ComparisonPipelineCycleRecord = {
    state: result.state,
    outcome: result.outcome
  };
  if (result.failureReason !== undefined) {
    record.failureReason = result.failureReason;
  }
  if (result.cycle) {
    record.durationMs = result.cycle.durationMs;
    if (result.cycle.interCycleGapMs !== undefined) {
      record.interCycleGapMs = result.cycle.interCycleGapMs;
    }
  }
  return record;
}

/**
 * Maps a full pipeline pass to its ordered per-cycle evidence records
 * (PREVIEW_LEFT, PREVIEW_RIGHT, COMPARISON).
 */
export function toPipelineCycleRecords(
  pipeline: ComparisonPreviewPipelineResult
): ComparisonPipelineCycleRecord[] {
  return [
    toPipelineCycleRecord(pipeline.previewLeft),
    toPipelineCycleRecord(pipeline.previewRight),
    toPipelineCycleRecord(pipeline.comparison)
  ];
}

/**
 * True when the pipeline short-circuited the comparison because a staged VI
 * failed its preview-load validation gate (i.e. FAILED before the comparison
 * cycle ran, with the comparison recorded as `skipped`).
 */
export function isPreviewValidationFailure(pipeline: ComparisonPreviewPipelineResult): boolean {
  return (
    pipeline.finalState === 'FAILED' &&
    pipeline.comparison.outcome === 'skipped' &&
    pipeline.failureReason === STAGED_VI_PREVIEW_VALIDATION_FAILED
  );
}
