/**
 * Mirror-Mode parity reconciler (VHS-REQ-707, Phase 4).
 *
 * The reconciler is the deterministic, queue-safe REQUIRED-gate logic: it reads
 * the committed `vi-history-suite/mirror-benchmark@v1` ledger (a data-at-rest
 * read, never a live image pull, per ADR-0028) and, per `parityKey`, decides
 * whether the mirrors AGREE. Correctness parity is the load-bearing signal: every
 * present actor run that completed `ok` for a parityKey must produce the SAME
 * `reportSha256` (the single value all mirrors must agree on).
 *
 * Freshness / outage policy (VHS-REQ-707.6): the Vagrant LEFT channel bound to the
 * queued revision is the hard precondition; the Docker RIGHT channel's parity is
 * enforced only when a fresh right-channel record bound to the queued revision
 * exists. When fresh right evidence is absent (e.g. a registry outage produced no
 * output), right-channel parity is advisory so the outage cannot block the queue —
 * while still enforcing parity whenever fresh evidence IS present.
 *
 * Pure and dependency-free (Node built-ins only); authors no `.vi` binaries. The
 * ledger is passed in already-parsed so this stays unit-testable; a thin CLI reads
 * the committed file and applies the gate.
 */

export type MirrorActorRole = 'tangled-left' | 'tangled-right' | 'decoupled';

/** A run row as stored in the mirror-benchmark ledger (subset used by the gate). */
export interface MirrorRunRow {
  readonly parityKey: string;
  readonly actorRef: string;
  readonly sourceRevision: string;
  readonly mode: string;
  readonly outcome: string;
  readonly reportSha256: string;
}

/** The interned actor fingerprint (subset used by the gate). */
export interface MirrorActorEntry {
  readonly role: MirrorActorRole;
}

export interface MirrorLedger {
  readonly actors: Readonly<Record<string, MirrorActorEntry>>;
  readonly runs: readonly MirrorRunRow[];
}

export interface ReconcileOptions {
  /** The revision being gated (the queued PR/merge-group revision). */
  readonly queuedRevision: string;
  /** Which role is the hard merge precondition (default tangled-left). */
  readonly requiredLeftRole?: MirrorActorRole;
  /** Which role is the advisory-on-absence right channel (default tangled-right). */
  readonly rightRole?: MirrorActorRole;
}

export type ParityGate = 'pass' | 'fail' | 'advisory';

export interface ParityVerdict {
  readonly parityKey: string;
  /** Distinct actorRefs with an `ok` run for this parityKey at the queued revision. */
  readonly actorsPresent: readonly string[];
  /** Distinct reportSha256 values among those `ok` runs. */
  readonly reportDigests: readonly string[];
  /** True when all present `ok` runs agree on reportSha256 (<=1 distinct digest). */
  readonly reportSha256Agree: boolean;
  /** A fresh left-channel `ok` run bound to the queued revision exists. */
  readonly leftChannelFresh: boolean;
  /** A fresh right-channel `ok` run bound to the queued revision exists. */
  readonly rightChannelFresh: boolean;
  /** Right-channel parity is advisory (absent fresh right evidence). */
  readonly rightAdvisory: boolean;
  readonly gate: ParityGate;
  /** Stable machine reason for the gate decision. */
  readonly reason: string;
}

export interface ReconcileResult {
  readonly queuedRevision: string;
  readonly verdicts: readonly ParityVerdict[];
  /** Overall gate: worst of the per-parityKey gates (fail > advisory > pass). */
  readonly gate: ParityGate;
  /** parityKeys whose gate is `fail`. */
  readonly failures: readonly string[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The ledger envelope this reconciler consumes (Phase 1 writer contract). */
const MIRROR_BENCHMARK_SCHEMA_ID = 'vi-history-suite/mirror-benchmark@v1';
const MIRROR_BENCHMARK_SCHEMA_VERSION = 1;

function assertLedger(ledger: unknown): asserts ledger is MirrorLedger {
  if (
    !ledger ||
    typeof ledger !== 'object' ||
    typeof (ledger as MirrorLedger).actors !== 'object' ||
    (ledger as MirrorLedger).actors === null ||
    Array.isArray((ledger as MirrorLedger).actors) ||
    !Array.isArray((ledger as MirrorLedger).runs)
  ) {
    throw new Error('Mirror ledger must have an object `actors` and an array `runs`.');
  }
  // When the ledger carries the self-describing envelope, it MUST match the
  // Phase 1 contract (same fail-closed posture as the writer / ML projection) so
  // a drifted/wrong file cannot satisfy the required gate.
  const envelope = ledger as { $schema?: unknown; schemaVersion?: unknown };
  const hasEnvelope = envelope.$schema !== undefined || envelope.schemaVersion !== undefined;
  if (
    hasEnvelope &&
    (envelope.$schema !== MIRROR_BENCHMARK_SCHEMA_ID || envelope.schemaVersion !== MIRROR_BENCHMARK_SCHEMA_VERSION)
  ) {
    throw new Error(
      `Mirror ledger has an unexpected envelope ($schema=${JSON.stringify(envelope.$schema)}, ` +
        `schemaVersion=${JSON.stringify(envelope.schemaVersion)}); expected ${MIRROR_BENCHMARK_SCHEMA_ID} v${MIRROR_BENCHMARK_SCHEMA_VERSION}.`
    );
  }
}

/** Role of a run's actor, or undefined if the actor is not interned. */
function roleOf(ledger: MirrorLedger, actorRef: string): MirrorActorRole | undefined {
  const entry = ledger.actors[actorRef];
  return entry ? entry.role : undefined;
}

/**
 * Reconcile the ledger for a queued revision. Returns per-parityKey verdicts and
 * an overall gate. Only `ok` runs bound to the queued revision count toward
 * parity; a missing channel is recorded as not-fresh (explicit), never a
 * spurious pass.
 */
export function reconcileMirrorParity(ledger: MirrorLedger, options: ReconcileOptions): ReconcileResult {
  assertLedger(ledger);
  const queuedRevision = options.queuedRevision;
  if (typeof queuedRevision !== 'string' || queuedRevision.trim().length === 0) {
    throw new Error('reconcileMirrorParity requires a non-empty queuedRevision.');
  }
  const requiredLeftRole = options.requiredLeftRole ?? 'tangled-left';
  const rightRole = options.rightRole ?? 'tangled-right';

  // Group `ok` runs at the queued revision by parityKey. A malformed reportSha256
  // is rejected fail-closed (corrupted/hand-edited evidence must never satisfy the
  // gate by "agreeing" on garbage).
  const groups = new Map<string, MirrorRunRow[]>();
  for (const run of ledger.runs) {
    if (run.outcome !== 'ok') continue;
    if (run.sourceRevision !== queuedRevision) continue;
    if (!isReportDigest(run.reportSha256)) {
      throw new Error(
        `Mirror ledger run (parityKey ${String(run.parityKey).slice(0, 12)}…) has a malformed reportSha256; refusing to reconcile.`
      );
    }
    const list = groups.get(run.parityKey) ?? [];
    list.push(run);
    groups.set(run.parityKey, list);
  }

  const verdicts: ParityVerdict[] = [];
  for (const [parityKey, runs] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const actorsPresent = [...new Set(runs.map((r) => r.actorRef))].sort();
    const reportDigests = [...new Set(runs.map((r) => r.reportSha256))].sort();
    const reportSha256Agree = reportDigests.length <= 1;

    const leftChannelFresh = runs.some((r) => roleOf(ledger, r.actorRef) === requiredLeftRole);
    const rightChannelFresh = runs.some((r) => roleOf(ledger, r.actorRef) === rightRole);
    const rightAdvisory = !rightChannelFresh;

    let gate: ParityGate;
    let reason: string;
    if (!leftChannelFresh) {
      // The hard precondition is absent -> the gate cannot pass.
      gate = 'fail';
      reason = 'left-channel-missing';
    } else if (!reportSha256Agree) {
      gate = 'fail';
      reason = 'report-digest-divergence';
    } else if (rightChannelFresh) {
      gate = 'pass';
      reason = 'both-channels-agree';
    } else {
      // Left fresh + agrees, right evidence absent -> advisory (outage immunity).
      gate = 'advisory';
      reason = 'right-channel-advisory-absent';
    }
    verdicts.push({
      parityKey,
      actorsPresent,
      reportDigests,
      reportSha256Agree,
      leftChannelFresh,
      rightChannelFresh,
      rightAdvisory,
      gate,
      reason
    });
  }

  const failures = verdicts.filter((v) => v.gate === 'fail').map((v) => v.parityKey);
  // Fresh left-channel evidence for the queued revision is a HARD precondition:
  // an empty verdict set (left run failed / wrong revision / empty ledger) must
  // NOT pass. Surface it as an explicit synthetic failure so the CLI exits nonzero.
  const anyLeftEvidence = verdicts.some((v) => v.leftChannelFresh);
  if (verdicts.length === 0 || !anyLeftEvidence) {
    return {
      queuedRevision,
      verdicts,
      gate: 'fail',
      failures: failures.length > 0 ? failures : ['<no-left-evidence-for-revision>']
    };
  }
  const overall: ParityGate = failures.length > 0
    ? 'fail'
    : verdicts.some((v) => v.gate === 'advisory')
      ? 'advisory'
      : 'pass';

  return { queuedRevision, verdicts, gate: overall, failures };
}

/** True when a value is a well-formed lower-case sha256 hex digest. */
export function isReportDigest(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}
