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
  StagedSide,
  StagingStateResult,
  UnstagingStateResult,
  ValidationStateResult
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

/** Maps one LabVIEW cycle result to its retained runtime-evidence record. */
export function toPipelineCycleRecord(result: PipelineCycleResult): ComparisonPipelineCycleRecord {
  const record: ComparisonPipelineCycleRecord = {
    state: result.state,
    outcome: result.outcome
  };
  if (result.input !== undefined) {
    record.input = result.input;
  }
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

/** Maps the STAGING state to its retained runtime-evidence record. */
export function toStagingRecord(result: StagingStateResult): ComparisonPipelineCycleRecord {
  const record: ComparisonPipelineCycleRecord = {
    state: 'STAGING',
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

/** Maps the VALIDATION decision state to its retained runtime-evidence record. */
export function toValidationRecord(result: ValidationStateResult): ComparisonPipelineCycleRecord {
  const record: ComparisonPipelineCycleRecord = {
    state: 'VALIDATION',
    outcome: result.outcome
  };
  if (result.rejectedSide !== undefined) {
    record.input = result.rejectedSide;
  }
  if (result.failureReason !== undefined) {
    record.failureReason = result.failureReason;
  }
  return record;
}

/** Maps the UNSTAGING state (its diagnostic status) to a runtime-evidence record. */
export function toUnstagingRecord(result: UnstagingStateResult): ComparisonPipelineCycleRecord {
  const record: ComparisonPipelineCycleRecord = {
    state: 'UNSTAGING',
    outcome: result.status
  };
  if (result.failureReason !== undefined) {
    record.failureReason = result.failureReason;
  }
  // Retain the concrete staged artifacts UNSTAGING acted on so the evidence names
  // the actual files removed vs kept (VHS-REQ-699 / VHS-REQ-147).
  if (result.removedPaths && result.removedPaths.length > 0) {
    record.removedPaths = result.removedPaths;
  }
  if (result.retainedPaths && result.retainedPaths.length > 0) {
    record.retainedPaths = result.retainedPaths;
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
 * Maps a full pipeline pass to its ordered per-state evidence records:
 * STAGING, PREVIEW_LEFT, PREVIEW_RIGHT, VALIDATION, COMPARISON, UNSTAGING.
 */
export function toPipelineCycleRecords(
  pipeline: ComparisonPreviewPipelineResult
): ComparisonPipelineCycleRecord[] {
  return [
    toStagingRecord(pipeline.staging),
    toPipelineCycleRecord(pipeline.previewLeft),
    toPipelineCycleRecord(pipeline.previewRight),
    toValidationRecord(pipeline.validation),
    toPipelineCycleRecord(pipeline.comparison),
    toUnstagingRecord(pipeline.unstaging)
  ];
}

/**
 * True when the pipeline rejected the comparison because a staged VI failed its
 * preview-load validation (VALIDATION rejected a rendered pair, naming the failing
 * side; the comparison was recorded as `skipped`) — as opposed to a staging
 * failure or a genuine comparison failure.
 */
export function isPreviewValidationFailure(pipeline: ComparisonPreviewPipelineResult): boolean {
  return (
    pipeline.finalState === 'FAILED' &&
    pipeline.validation.outcome === 'rejected' &&
    pipeline.validation.rejectedSide !== undefined &&
    pipeline.comparison.outcome === 'skipped' &&
    pipeline.failureReason === STAGED_VI_PREVIEW_VALIDATION_FAILED
  );
}
