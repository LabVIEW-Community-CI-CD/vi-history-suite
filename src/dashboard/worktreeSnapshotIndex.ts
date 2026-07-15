import type { ComparisonReportType } from '../reporting/comparisonReportPlan';

/**
 * VHS-REQ-641 (Phase 3, issue #1366): persisted retention index for
 * working-tree (uncommitted) comparisons.
 *
 * A working-tree comparison stages uncommitted on-disk bytes whose "selected"
 * side is the constant `WORKTREE` sentinel — it has no git hash, so the
 * dashboard (which rediscovers retained committed pairs by rebuilding pair-IDs
 * from the commit list) cannot rediscover a retained working-tree snapshot.
 * This index is the durable record that makes retained working-tree snapshots
 * discoverable: one index file per repo/VI (`fileId`), listing each retained
 * snapshot content-addressed by the staged working-tree bytes
 * (`deriveWorktreeSnapshotIdentity`).
 *
 * This module is the pure data model + garbage-collection core: it performs no
 * I/O and no archiving. Wiring the writer at the archive seam, the dashboard
 * reader, and the settings-driven retention limit are separate slices.
 */

export const WORKTREE_SNAPSHOT_INDEX_SCHEMA = 'vi-history-suite/worktree-snapshot-index@v1';

/** Index filename colocated with a VI's retained report history (`report-history/<repoId>/<fileId>/`). */
export const WORKTREE_SNAPSHOT_INDEX_FILENAME = 'worktree-snapshots.json';

/** Default keep-last-N retention limit when the setting is unset (0 disables retention). */
export const DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT = 5;

export interface WorktreeSnapshotRecord {
  /** Content-addressed identity of the staged working-tree bytes (`deriveWorktreeSnapshotIdentity`). */
  snapshotId: string;
  /** The retained pair-ID under which this snapshot's archive lives. */
  pairId: string;
  /** The other (base) side the snapshot was compared against: a commit hash or the `WORKTREE` sentinel. */
  baseHash: string;
  /** The comparison report type. */
  reportType: ComparisonReportType;
  /** ISO 8601 timestamp when the snapshot was retained. */
  retainedAt: string;
  /** The VI's repository-relative path at capture time (display/provenance). */
  relativePath: string;
}

export interface WorktreeSnapshotIndex {
  schema: typeof WORKTREE_SNAPSHOT_INDEX_SCHEMA;
  /** Retained snapshots, newest first. */
  snapshots: WorktreeSnapshotRecord[];
}

export interface AppendWorktreeSnapshotResult {
  /** The index after inserting the record and applying the retention limit. */
  index: WorktreeSnapshotIndex;
  /**
   * Records removed by the retention limit (or by disabling retention). Callers
   * use these to delete the corresponding retained archive directories.
   */
  evicted: WorktreeSnapshotRecord[];
}

const REPORT_TYPES: ReadonlySet<string> = new Set<ComparisonReportType>(['diff', 'print']);

export function createEmptyWorktreeSnapshotIndex(): WorktreeSnapshotIndex {
  return { schema: WORKTREE_SNAPSHOT_INDEX_SCHEMA, snapshots: [] };
}

/**
 * Distinct-snapshot identity within an index: the same staged bytes compared
 * against the same base side and report type is the SAME retained pair. Keeping
 * the key on all three makes a repeated compare of unchanged content idempotent
 * (no duplicate, no growth) while changed content yields a new distinct entry.
 */
function snapshotKey(record: Pick<WorktreeSnapshotRecord, 'reportType' | 'baseHash' | 'snapshotId'>): string {
  return `${record.reportType}\n${record.baseHash}\n${record.snapshotId}`;
}

function normalizeRetentionLimit(retentionLimit: number): number {
  if (!Number.isFinite(retentionLimit)) {
    return DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT;
  }
  return Math.max(0, Math.floor(retentionLimit));
}

/**
 * Inserts `record` (newest-first), de-duplicating an existing entry with the
 * same snapshot identity so a repeated compare of unchanged content is
 * idempotent, then applies the keep-last-N retention limit. A limit of 0
 * disables retention (everything is evicted, including the new record). Pure:
 * returns a new index plus the evicted records so a caller can delete their
 * archives.
 */
export function appendWorktreeSnapshotRecord(
  index: WorktreeSnapshotIndex,
  record: WorktreeSnapshotRecord,
  retentionLimit: number
): AppendWorktreeSnapshotResult {
  const key = snapshotKey(record);
  const withoutDuplicate = index.snapshots.filter((snapshot) => snapshotKey(snapshot) !== key);
  const ordered = [record, ...withoutDuplicate];
  const limit = normalizeRetentionLimit(retentionLimit);
  const kept = limit <= 0 ? [] : ordered.slice(0, limit);
  const evicted = limit <= 0 ? ordered : ordered.slice(limit);
  return {
    index: { schema: WORKTREE_SNAPSHOT_INDEX_SCHEMA, snapshots: kept },
    evicted
  };
}

function parseSnapshotRecord(value: unknown): WorktreeSnapshotRecord | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const { snapshotId, pairId, baseHash, reportType, retainedAt, relativePath } = candidate;
  if (
    typeof snapshotId !== 'string' ||
    typeof pairId !== 'string' ||
    typeof baseHash !== 'string' ||
    typeof reportType !== 'string' ||
    !REPORT_TYPES.has(reportType) ||
    typeof retainedAt !== 'string' ||
    typeof relativePath !== 'string' ||
    snapshotId.length === 0 ||
    pairId.length === 0
  ) {
    return undefined;
  }
  return {
    snapshotId,
    pairId,
    baseHash,
    reportType: reportType as ComparisonReportType,
    retainedAt,
    relativePath
  };
}

/**
 * Parses a persisted index document, fail-closed at the top level (a wrong
 * schema or shape yields `undefined`) but resilient per record (a single
 * malformed entry is skipped rather than discarding the whole index).
 */
export function parseWorktreeSnapshotIndex(raw: string): WorktreeSnapshotIndex | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.schema !== WORKTREE_SNAPSHOT_INDEX_SCHEMA || !Array.isArray(candidate.snapshots)) {
    return undefined;
  }
  const snapshots: WorktreeSnapshotRecord[] = [];
  for (const entry of candidate.snapshots) {
    const record = parseSnapshotRecord(entry);
    if (record) {
      snapshots.push(record);
    }
  }
  return { schema: WORKTREE_SNAPSHOT_INDEX_SCHEMA, snapshots };
}

/** Serializes the index as byte-stable 2-space JSON with a trailing newline. */
export function serializeWorktreeSnapshotIndex(index: WorktreeSnapshotIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}
