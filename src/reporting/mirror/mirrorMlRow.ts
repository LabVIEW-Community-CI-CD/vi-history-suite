import type { MirrorBitness } from './mirrorParityDigest';

/**
 * Mirror-Mode ML-consumable parity corpus (VHS-REQ-708).
 *
 * The mirror-benchmark ledger (VHS-REQ-707) is a normalized store optimized for
 * idempotent recording and the deterministic reconciler gate. ML training/eval
 * wants a different shape: a FLAT, tidy table (one row per run), stable column
 * names as feature keys, units baked into the names, and features / targets /
 * labels / traceability separated with explicit nullable missingness (never a
 * spurious 0). This module is the pure projection from the ledger to that table
 * plus the cross-OS (Windows-vs-Linux) performance-parity verdict.
 *
 * Sample-system traceability is first-class: every row carries the join keys for
 * (which sample VI) x (which system fingerprint) x (which revision). The
 * projection is deterministic and PII-free (no host paths / usernames), so the
 * emitted corpus is directly consumable by a model. Pure, Node-built-in only,
 * authors no `.vi` binaries.
 */

export interface MirrorLedgerActor {
  readonly actor: string;
  readonly role: string;
  readonly capturedFrom: string;
  readonly os: string;
  readonly cpuModel: string;
  readonly cpuLogical: number;
  readonly ramTotalMb: number;
  readonly diskFreeGb: number;
  readonly labviewBuild: string;
  readonly labviewBitness: MirrorBitness;
}

export interface MirrorLedgerRun {
  readonly parityKey: string;
  readonly actorRef: string;
  readonly sourceRevision: string;
  readonly fixture: { readonly viPath: string; readonly fixtureSha: string; readonly recipe: string };
  readonly mode: string;
  readonly outcome: string;
  readonly reportSha256: string;
  readonly previewImageCount: number;
  readonly wallMs: number;
}

export interface MirrorMlLedger {
  readonly actors: Readonly<Record<string, MirrorLedgerActor>>;
  readonly runs: readonly MirrorLedgerRun[];
}

/** One flat ML row (schema vi-history-suite/mirror-benchmark-mlrow@v1). */
export interface MirrorMlRow {
  // traceability (categorical join keys)
  readonly runParityKey: string;
  readonly runActorRef: string;
  readonly runSourceRevision: string;
  readonly sampleViPath: string;
  readonly sampleFixtureSha: string;
  readonly sampleRecipe: string;
  // features (capability fingerprint; units in the name)
  readonly featActor: string;
  readonly featRole: string;
  readonly featOs: string;
  readonly featCpuModel: string;
  readonly featCpuLogical: number;
  readonly featRamTotalMb: number;
  readonly featDiskFreeGb: number;
  readonly featLabviewBitness: string;
  readonly featLabviewBuild: string;
  readonly featModeCold: 0 | 1;
  // targets (observations)
  readonly targetWallMs: number;
  readonly targetWallMsPerCore: number | null;
  readonly targetPreviewImageCount: number;
  // labels
  readonly labelOutcome: string;
  readonly labelReportSha256: string;
}

export const MIRROR_MLROW_SCHEMA_ID = 'vi-history-suite/mirror-benchmark-mlrow@v1';

function assertLedger(ledger: unknown): asserts ledger is MirrorMlLedger {
  if (
    !ledger ||
    typeof ledger !== 'object' ||
    typeof (ledger as MirrorMlLedger).actors !== 'object' ||
    (ledger as MirrorMlLedger).actors === null ||
    Array.isArray((ledger as MirrorMlLedger).actors) ||
    !Array.isArray((ledger as MirrorMlLedger).runs)
  ) {
    throw new Error('Mirror ML ledger must have an object `actors` and an array `runs`.');
  }
}

/**
 * Project the ledger into flat ML rows (one per run). Fail-closed on a run that
 * references an unknown actor so the corpus can never contain an unjoinable row.
 */
export function projectMirrorMlRows(ledger: MirrorMlLedger): MirrorMlRow[] {
  assertLedger(ledger);
  return ledger.runs.map((run) => {
    const fp = ledger.actors[run.actorRef];
    if (!fp) {
      throw new Error(`Mirror ML row references unknown actorRef ${run.actorRef}.`);
    }
    const wallMsPerCore = fp.cpuLogical > 0 ? Number((run.wallMs / fp.cpuLogical).toFixed(3)) : null;
    return {
      runParityKey: run.parityKey,
      runActorRef: run.actorRef,
      runSourceRevision: run.sourceRevision,
      sampleViPath: run.fixture.viPath,
      sampleFixtureSha: run.fixture.fixtureSha,
      sampleRecipe: run.fixture.recipe,
      featActor: fp.actor,
      featRole: fp.role,
      featOs: fp.os,
      featCpuModel: fp.cpuModel,
      featCpuLogical: fp.cpuLogical,
      featRamTotalMb: fp.ramTotalMb,
      featDiskFreeGb: fp.diskFreeGb,
      featLabviewBitness: fp.labviewBitness,
      featLabviewBuild: fp.labviewBuild,
      featModeCold: run.mode === 'cold' ? 1 : 0,
      targetWallMs: run.wallMs,
      targetWallMsPerCore: wallMsPerCore,
      targetPreviewImageCount: run.previewImageCount,
      labelOutcome: run.outcome,
      labelReportSha256: run.reportSha256
    };
  });
}

export type OsAxis = 'windows' | 'linux' | 'other';

/** Classify a row's OS onto the primary Windows-vs-Linux parity axis. */
export function classifyOsAxis(os: string): OsAxis {
  if (/windows/i.test(os)) return 'windows';
  if (/linux|ubuntu|debian/i.test(os)) return 'linux';
  return 'other';
}

export interface PerfParityVerdict {
  readonly parityKey: string;
  readonly windowsPresent: boolean;
  readonly linuxPresent: boolean;
  /** All `ok` rows agree on reportSha256 (correctness label). */
  readonly correctnessParity: boolean;
  /**
   * Capability-normalized Windows-vs-Linux wall spread as a percentage of the
   * faster side, or null when a side is absent (explicit missingness, never 0).
   * Advisory signal only — never a merge gate.
   */
  readonly perfDeltaPct: number | null;
}

function mean(values: number[]): number {
  return values.reduce((s, x) => s + x, 0) / values.length;
}

/**
 * Compute the cross-OS performance-parity verdict per parityKey from ML rows:
 * correctness parity (reportSha256 agreement among `ok` rows) plus the
 * capability-normalized Windows-vs-Linux latency delta (advisory). A missing OS
 * side yields an explicit presence flag false and a null delta.
 */
export function computePerfParityVerdicts(rows: readonly MirrorMlRow[]): PerfParityVerdict[] {
  const byKey = new Map<string, MirrorMlRow[]>();
  for (const row of rows) {
    const list = byKey.get(row.runParityKey) ?? [];
    list.push(row);
    byKey.set(row.runParityKey, list);
  }
  const verdicts: PerfParityVerdict[] = [];
  for (const [parityKey, group] of [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const windows = group.filter((r) => classifyOsAxis(r.featOs) === 'windows');
    const linux = group.filter((r) => classifyOsAxis(r.featOs) === 'linux');
    const windowsPresent = windows.length > 0;
    const linuxPresent = linux.length > 0;

    const okDigests = new Set(group.filter((r) => r.labelOutcome === 'ok').map((r) => r.labelReportSha256));
    const correctnessParity = okDigests.size <= 1;

    let perfDeltaPct: number | null = null;
    if (windowsPresent && linuxPresent) {
      const w = mean(windows.map((r) => r.targetWallMsPerCore).filter((x): x is number => x != null));
      const l = mean(linux.map((r) => r.targetWallMsPerCore).filter((x): x is number => x != null));
      const base = Math.min(w, l);
      perfDeltaPct = base > 0 ? Number((((Math.max(w, l) - base) / base) * 100).toFixed(1)) : 0;
    }
    verdicts.push({ parityKey, windowsPresent, linuxPresent, correctnessParity, perfDeltaPct });
  }
  return verdicts;
}
