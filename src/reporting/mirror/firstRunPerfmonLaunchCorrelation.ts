// First-run perfmon <-> LabVIEW launch correlation stage (VHS-REQ-718, epic #2344).
//
// The composing stage that turns a first-run perfmon capture plus a real LabVIEW
// launch log and its replay-frame stream into the launch telemetry the mirror
// pipeline embeds: it parses the launch log, reconciles the perfmon capture
// start (UTC) with the LabVIEW markers (local wall-clock) to epoch ms, places
// each launch marker in a replay frame, and produces the TDMS metadata that
// stamps both onto the perfmon TDMS model.
//
// Design (reporting-orchestration guardrails): pure + deterministic, no I/O. It
// is BEST-EFFORT and fail-closed — a malformed log or an out-of-range marker
// yields an explicit `unavailable` outcome with a reason string, NEVER a throw,
// so the LabVIEW correlation can never break the primary perfmon artifact /
// PR comment / TDMS channel contract it enriches.

import {
  postVerifyLabviewFrameCorrelation,
  type FrameStreamReference,
  type LabviewFrameCorrelation
} from './labviewFrameCorrelation';
import { parseLabVIEWLaunchTiming, type LabVIEWLaunchTiming } from './labviewLaunchTiming';
import {
  correlatePerfmonWithLabviewLog,
  localIsoToEpochMs,
  type PerfmonLabviewCorrelation
} from './perfmonLabviewCorrelation';
import type { PerfmonTdmsLabviewFrameMetadata } from './perfmonTdmsModel';

export interface FirstRunPerfmonLaunchInput {
  /** Perfmon capture start, UTC ISO with an explicit zone (from the artifact). */
  readonly perfmonCapturedAtIso: string;
  /** Raw LabVIEW / LabVIEWCLI application log text for the launch. */
  readonly labviewLogText: string;
  /** The deterministic replay-frame stream captured alongside the launch. */
  readonly frameStream: FrameStreamReference;
}

/** Explicit staged outcome: the launch telemetry, or an `unavailable` reason. */
export type FirstRunPerfmonLaunchCorrelation =
  | {
      readonly status: 'correlated';
      readonly launchTiming: LabVIEWLaunchTiming;
      readonly correlation: PerfmonLabviewCorrelation;
      readonly frameCorrelation: LabviewFrameCorrelation;
      readonly tdmsMetadata: PerfmonTdmsLabviewFrameMetadata;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

/**
 * VHS-REQ-718.3: compose the LabVIEW-launch correlation for a first-run perfmon
 * capture. Best-effort and fail-closed — returns an `unavailable` outcome (never
 * throws) when the log cannot be parsed, the time bases cannot be reconciled, or
 * a marker cannot be placed in the frame stream, so the primary perfmon contract
 * is never broken by the enrichment.
 */
export function correlateFirstRunPerfmonLaunch(
  input: FirstRunPerfmonLaunchInput
): FirstRunPerfmonLaunchCorrelation {
  let launchTiming: LabVIEWLaunchTiming;
  try {
    launchTiming = parseLabVIEWLaunchTiming(input.labviewLogText);
  } catch (err) {
    return { status: 'unavailable', reason: `labview-log-parse-failed: ${(err as Error).message}` };
  }

  let correlation: PerfmonLabviewCorrelation;
  try {
    correlation = correlatePerfmonWithLabviewLog({
      perfmonCapturedAtIso: input.perfmonCapturedAtIso,
      labview: {
        processStartIso: launchTiming.processStartIso,
        executionReadyIso: launchTiming.executionReadyIso
      }
    });
  } catch (err) {
    return { status: 'unavailable', reason: `perfmon-labview-correlation-failed: ${(err as Error).message}` };
  }

  // The correlation above already validated processStartIso to epoch ms, so this
  // conversion is guaranteed; a null (impossible here) still fails closed at the
  // frame stage's finite-instant guard rather than corrupting the output.
  const processStartEpochMs = localIsoToEpochMs(launchTiming.processStartIso) as number;
  const executionReadyEpochMs =
    launchTiming.executionReadyIso !== null ? localIsoToEpochMs(launchTiming.executionReadyIso) : null;

  let frameCorrelation: LabviewFrameCorrelation;
  try {
    frameCorrelation = postVerifyLabviewFrameCorrelation({
      frame: input.frameStream,
      labview: { processStartEpochMs, executionReadyEpochMs }
    });
  } catch (err) {
    return { status: 'unavailable', reason: `frame-post-verification-failed: ${(err as Error).message}` };
  }

  const tdmsMetadata: PerfmonTdmsLabviewFrameMetadata = {
    labviewProcessStartIso: launchTiming.processStartIso,
    labviewExecutionReadyIso: launchTiming.executionReadyIso ?? undefined,
    frameRateHz: frameCorrelation.frameRateHz,
    frameCount: input.frameStream.frameCount,
    epochMsAtFrameZero: input.frameStream.epochMsAtFrameZero
  };

  return { status: 'correlated', launchTiming, correlation, frameCorrelation, tdmsMetadata };
}
