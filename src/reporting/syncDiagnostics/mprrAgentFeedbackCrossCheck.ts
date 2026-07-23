/**
 * Deterministic packet-derived agent-feedback cross-check (VHS-REQ-710 family).
 *
 * Mirrors mprr's ADR-0041 boundary (Successor Schema Paired Sealed Segments And
 * Deterministic Agent Feedback) for the calibration surface. The core principle:
 * the agent's PRIMARY feedback surface is PACKET-DERIVED (the deterministic
 * authoritative representation), and a screenshot is a FALLBACK PROOF and
 * CROSS-CHECK surface — never the primary. Calibration feedback is authoritative
 * only when the independent screenshot witness AGREES with the packet-derived
 * authoritative contract, within a bounded sealed-feedback budget (ADR-0041's
 * 10-second target), and it fails closed above that budget. Otherwise the result
 * is advisory agent/operator assistance that never overrides the authority floor.
 *
 * The primary lookup key is the packet timestamp; a shared segment identity binds
 * the paired sealed segment. Pure and deterministic: no I/O, no clock.
 */

import {
  evaluateMprrCalibration,
  type EvaluateMprrCalibrationInput,
  type MprrCalibrationResult
} from './mprrCalibrationSurface';

export const MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA = 'vi-history-suite/mprr-agent-feedback-cross-check@v1';
export const MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA_VERSION = 1;

/** ADR-0041 first sealed-publication target: 10 seconds. */
export const MPRR_SEALED_FEEDBACK_BUDGET_MS = 10_000;

export type AgentFeedbackClassification = 'authoritative' | 'advisory' | 'fail-closed';

export interface MprrAgentFeedbackCrossCheckInput {
  /** Primary external lookup key (ADR-0041): the packet timestamp in milliseconds. */
  readonly packetTimestampMs: number;
  /** Shared identity of the paired sealed segment the feedback resolves to. */
  readonly segmentId: string;
  /** The screenshot fallback witness sampled against the calibration contract. */
  readonly screenshot: EvaluateMprrCalibrationInput;
  /** Measured sealed-feedback lag from published-readable to resolved feedback. */
  readonly feedbackLatencyMs: number;
  /** Sealed-feedback budget; defaults to the ADR-0041 10-second target. */
  readonly feedbackBudgetMs?: number;
}

export interface MprrAgentFeedbackCrossCheck {
  readonly schema: typeof MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA;
  readonly schemaVersion: typeof MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA_VERSION;
  readonly segmentId: string;
  readonly packetTimestampMs: number;
  /** The primary feedback surface is always packet-derived (screenshot is the cross-check). */
  readonly primarySurface: 'packet-derived';
  /** The screenshot cross-check verdict against the calibration contract. */
  readonly calibration: MprrCalibrationResult;
  /** True when the screenshot witness agrees with the packet-derived authoritative contract. */
  readonly crossCheckPass: boolean;
  readonly feedbackLatencyMs: number;
  readonly feedbackBudgetMs: number;
  readonly withinFeedbackBudget: boolean;
  /** Authoritative only when cross-checked and within budget; fail-closed above budget; advisory otherwise. */
  readonly classification: AgentFeedbackClassification;
  readonly summary: string;
}

/**
 * Resolve deterministic packet-derived agent feedback for a calibration segment,
 * cross-checked against the screenshot witness and bounded by the sealed-feedback
 * budget. Fail-closed on a non-finite packet timestamp, an empty segment id, or a
 * negative latency. Pure and deterministic.
 */
export function crossCheckMprrAgentFeedback(input: MprrAgentFeedbackCrossCheckInput): MprrAgentFeedbackCrossCheck {
  if (!Number.isFinite(input.packetTimestampMs)) {
    throw new Error('packetTimestampMs must be a finite number of milliseconds.');
  }
  if (typeof input.segmentId !== 'string' || input.segmentId.trim().length === 0) {
    throw new Error('segmentId must be a non-empty string.');
  }
  if (!Number.isFinite(input.feedbackLatencyMs) || input.feedbackLatencyMs < 0) {
    throw new Error('feedbackLatencyMs must be a non-negative number of milliseconds.');
  }

  const feedbackBudgetMs = input.feedbackBudgetMs ?? MPRR_SEALED_FEEDBACK_BUDGET_MS;
  const calibration = evaluateMprrCalibration(input.screenshot);
  const crossCheckPass = calibration.calibrated;
  const withinFeedbackBudget = input.feedbackLatencyMs <= feedbackBudgetMs;

  let classification: AgentFeedbackClassification;
  if (!withinFeedbackBudget) {
    classification = 'fail-closed';
  } else if (crossCheckPass) {
    classification = 'authoritative';
  } else {
    classification = 'advisory';
  }

  const summary =
    `agent-feedback ${classification} for segment ${input.segmentId} @ t=${input.packetTimestampMs}ms — ` +
    `packet-derived primary, screenshot cross-check ${crossCheckPass ? 'agrees' : `disagrees (${calibration.fault})`}, ` +
    `feedback ${input.feedbackLatencyMs}ms/${feedbackBudgetMs}ms budget`;

  return {
    schema: MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA,
    schemaVersion: MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA_VERSION,
    segmentId: input.segmentId,
    packetTimestampMs: input.packetTimestampMs,
    primarySurface: 'packet-derived',
    calibration,
    crossCheckPass,
    feedbackLatencyMs: input.feedbackLatencyMs,
    feedbackBudgetMs,
    withinFeedbackBudget,
    classification,
    summary
  };
}
