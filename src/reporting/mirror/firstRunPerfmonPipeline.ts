// First-run perfmon pipeline (VHS-REQ-707).
//
// The actor-agnostic capstone that composes the whole perfmon contract into one
// call: build the capture plan, run the capture around the first-run comparison
// (the ONE injected boundary), parse the PDH-CSV, assemble the artifact, and
// render both the pull-request comment and the TDMS channel model. A Vagrant
// self-hosted runner and a Docker container actor each supply only their own
// `capture` function; everything downstream is shared, so both mirror sources
// print the same comment and feed the same TDMS embedding.
//
// Design (reporting-orchestration guardrails): pure except the injected capture
// boundary. No process spawn, no filesystem, no clock unless injected.

import {
  buildWindowsPerfmonCapturePlan,
  type PerfmonCapturePlan,
  type PerfmonCaptureRequest
} from './perfmonCapturePlan';
import {
  buildFirstRunPerfmonArtifact,
  parsePdhCsv,
  renderFirstRunPerfmonPrComment,
  type FirstRunPerfmonArtifact,
  type PerfmonActorSource,
  type PerfmonCycleMeasurement
} from './perfmonSampleSeries';
import {
  buildPerfmonTdmsModel,
  type PerfmonTdmsLabviewFrameMetadata,
  type PerfmonTdmsModel
} from './perfmonTdmsModel';
import type { FrameStreamReference } from './labviewFrameCorrelation';
import {
  correlateFirstRunPerfmonLaunch,
  type FirstRunPerfmonLaunchCorrelation
} from './firstRunPerfmonLaunchCorrelation';

/** The raw result of executing a capture plan around the first-run comparison. */
export interface PerfmonCaptureResult {
  /** The PDH-CSV text logman wrote (fed straight into the parser). */
  readonly csvText: string;
  /** Epoch ms when capture started (comparison window start). */
  readonly startMs?: number;
  /** Epoch ms when capture stopped (comparison window end). */
  readonly endMs?: number;
  /** Per-cycle timing observed during the run, if the harness measured it. */
  readonly cycles?: readonly PerfmonCycleMeasurement[];
}

export interface FirstRunPerfmonPipelineInput {
  readonly request: PerfmonCaptureRequest;
  readonly source: PerfmonActorSource;
  readonly actor: string;
  /** Cycle timing supplied directly (overrides any cycles the capture returns). */
  readonly cycles?: readonly PerfmonCycleMeasurement[];
  /**
   * Optional LabVIEW launch enrichment (VHS-REQ-718): the raw launch-log text
   * plus the deterministic replay-frame stream captured alongside it. When
   * supplied, the pipeline reconciles the perfmon capture start with the LabVIEW
   * launch markers, places each marker in a replay frame, and stamps both onto
   * the TDMS model. Best-effort: a malformed log never breaks the perfmon
   * artifact / PR comment / TDMS channel contract.
   */
  readonly labviewLaunch?: {
    readonly logText: string;
    readonly frameStream: FrameStreamReference;
  };
}

export interface FirstRunPerfmonPipelineDeps {
  /** Execute the plan around the comparison and return the raw trace + window. */
  readonly capture: (plan: PerfmonCapturePlan) => PerfmonCaptureResult;
  /** Clock for `capturedAtIso` when the capture returns no window. Defaults to Date.now. */
  readonly now?: () => number;
}

export interface FirstRunPerfmonPipelineResult {
  readonly plan: PerfmonCapturePlan;
  readonly artifact: FirstRunPerfmonArtifact;
  readonly prComment: string;
  readonly tdmsModel: PerfmonTdmsModel;
  /**
   * The LabVIEW launch correlation outcome, present only when `labviewLaunch`
   * input was supplied. An explicit staged outcome (`correlated` or
   * `unavailable` with a reason), never a throw.
   */
  readonly launchCorrelation?: FirstRunPerfmonLaunchCorrelation;
}

/**
 * Run the full first-run perfmon pipeline for one mirror actor. Fail-closed on a
 * capture result that is not a PDH-CSV string. Deterministic given a
 * deterministic `capture` and `now`.
 */
export function runFirstRunPerfmonPipeline(
  input: FirstRunPerfmonPipelineInput,
  deps: FirstRunPerfmonPipelineDeps
): FirstRunPerfmonPipelineResult {
  if (typeof deps.capture !== 'function') {
    throw new Error('runFirstRunPerfmonPipeline requires a capture function.');
  }
  const now = deps.now ?? ((): number => Date.now());

  const plan = buildWindowsPerfmonCapturePlan(input.request);
  const captured = deps.capture(plan);
  if (!captured || typeof captured.csvText !== 'string') {
    throw new Error('capture must return a { csvText } PDH-CSV string.');
  }

  const perf = parsePdhCsv(captured.csvText);

  const hasWindow =
    typeof captured.startMs === 'number' &&
    Number.isFinite(captured.startMs) &&
    typeof captured.endMs === 'number' &&
    Number.isFinite(captured.endMs) &&
    // A reversed window (end before start) is nonsensical; treat it as no window
    // rather than rendering a negative wall duration into the PR comment.
    captured.endMs >= captured.startMs;
  const wallMs = hasWindow ? (captured.endMs as number) - (captured.startMs as number) : null;
  const capturedAtIso = hasWindow
    ? new Date(captured.startMs as number).toISOString()
    : new Date(now()).toISOString();

  const cycles = input.cycles ?? captured.cycles ?? [];

  const artifact = buildFirstRunPerfmonArtifact({
    source: input.source,
    actor: input.actor,
    capturedAtIso,
    perf,
    wallMs,
    cycles
  });

  // Optional LabVIEW launch enrichment (VHS-REQ-718): reconcile the perfmon
  // capture start with the LabVIEW launch markers and place them in the replay
  // frame stream, then stamp both onto the TDMS. Best-effort — an `unavailable`
  // outcome leaves the TDMS metadata unstamped but never breaks the pipeline.
  let launchCorrelation: FirstRunPerfmonLaunchCorrelation | undefined;
  let tdmsMetadata: PerfmonTdmsLabviewFrameMetadata | undefined;
  if (input.labviewLaunch) {
    launchCorrelation = correlateFirstRunPerfmonLaunch({
      perfmonCapturedAtIso: capturedAtIso,
      labviewLogText: input.labviewLaunch.logText,
      frameStream: input.labviewLaunch.frameStream
    });
    if (launchCorrelation.status === 'correlated') {
      tdmsMetadata = launchCorrelation.tdmsMetadata;
    }
  }

  return {
    plan,
    artifact,
    prComment: renderFirstRunPerfmonPrComment(artifact),
    tdmsModel: buildPerfmonTdmsModel(artifact, tdmsMetadata),
    ...(launchCorrelation ? { launchCorrelation } : {})
  };
}
