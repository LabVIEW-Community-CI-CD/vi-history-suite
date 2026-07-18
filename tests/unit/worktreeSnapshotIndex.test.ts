// Requirement coverage: VHS-REQ-641 (working-tree comparison). Verifies the
// Phase 3 persisted retention-index data model and garbage collection
// (VHS-REQ-641.7, issue #1366).
import { describe, expect, it } from 'vitest';

import {
  appendWorktreeSnapshotRecord,
  createEmptyWorktreeSnapshotIndex,
  DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT,
  parseWorktreeSnapshotIndex,
  serializeWorktreeSnapshotIndex,
  WORKTREE_SNAPSHOT_INDEX_SCHEMA,
  type WorktreeSnapshotRecord
} from '../../src/dashboard/worktreeSnapshotIndex';

function record(overrides: Partial<WorktreeSnapshotRecord> = {}): WorktreeSnapshotRecord {
  return {
    snapshotId: 'aaaa000000000000',
    pairId: 'pair-aaaa',
    baseHash: 'base1234',
    reportType: 'diff',
    retainedAt: '2026-07-15T00:00:00.000Z',
    relativePath: 'vis/Sample.vi',
    ...overrides
  };
}

describe('worktreeSnapshotIndex (VHS-REQ-641.7)', () => {
  it('starts empty with the versioned schema tag', () => {
    const index = createEmptyWorktreeSnapshotIndex();
    expect(index.schema).toBe(WORKTREE_SNAPSHOT_INDEX_SCHEMA);
    expect(index.snapshots).toEqual([]);
  });

  it('inserts new snapshots newest-first', () => {
    let index = createEmptyWorktreeSnapshotIndex();
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'aaaa', pairId: 'p-a' }), 5).index;
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'bbbb', pairId: 'p-b' }), 5).index;
    expect(index.snapshots.map((s) => s.snapshotId)).toEqual(['bbbb', 'aaaa']);
  });

  it('is idempotent for a repeated compare of unchanged content (no duplicate, no growth)', () => {
    let index = createEmptyWorktreeSnapshotIndex();
    const first = appendWorktreeSnapshotRecord(index, record({ retainedAt: '2026-07-15T00:00:00.000Z' }), 5);
    index = first.index;
    const second = appendWorktreeSnapshotRecord(
      index,
      record({ retainedAt: '2026-07-15T01:00:00.000Z' }),
      5
    );
    expect(second.index.snapshots).toHaveLength(1);
    // The refreshed timestamp is retained (moved to front, not duplicated).
    expect(second.index.snapshots[0].retainedAt).toBe('2026-07-15T01:00:00.000Z');
    expect(second.evicted).toEqual([]);
  });

  it('treats changed content, base, or report type as a distinct snapshot', () => {
    let index = createEmptyWorktreeSnapshotIndex();
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'aaaa' }), 5).index;
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'bbbb' }), 5).index;
    index = appendWorktreeSnapshotRecord(index, record({ baseHash: 'other' }), 5).index;
    index = appendWorktreeSnapshotRecord(index, record({ reportType: 'print' }), 5).index;
    expect(index.snapshots).toHaveLength(4);
  });

  it('applies keep-last-N retention and reports evicted records', () => {
    let index = createEmptyWorktreeSnapshotIndex();
    for (let i = 0; i < 4; i += 1) {
      index = appendWorktreeSnapshotRecord(index, record({ snapshotId: `s${i}`, pairId: `p${i}` }), 2).index;
    }
    const last = appendWorktreeSnapshotRecord(index, record({ snapshotId: 's-final', pairId: 'p-final' }), 2);
    expect(last.index.snapshots.map((s) => s.snapshotId)).toEqual(['s-final', 's3']);
    expect(last.evicted.map((s) => s.snapshotId)).toEqual(['s2']);
  });

  it('disables retention when the limit is 0 (everything evicted, including the new record)', () => {
    const index = createEmptyWorktreeSnapshotIndex();
    const result = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'zzzz' }), 0);
    expect(result.index.snapshots).toEqual([]);
    expect(result.evicted.map((s) => s.snapshotId)).toEqual(['zzzz']);
  });

  it('clamps a negative or fractional limit and falls back to the default for non-finite', () => {
    let index = createEmptyWorktreeSnapshotIndex();
    // Fractional floors to 1.
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'a' }), 1.9).index;
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'b' }), 1.9).index;
    expect(index.snapshots.map((s) => s.snapshotId)).toEqual(['b']);
    // Negative clamps to 0 (disabled).
    const negative = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'c' }), -3);
    expect(negative.index.snapshots).toEqual([]);
    // Non-finite falls back to the default.
    expect(DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT).toBe(5);
    const fallback = appendWorktreeSnapshotRecord(
      createEmptyWorktreeSnapshotIndex(),
      record(),
      Number.NaN
    );
    expect(fallback.index.snapshots).toHaveLength(1);
  });

  it('round-trips through serialize/parse with a trailing newline', () => {
    let index = createEmptyWorktreeSnapshotIndex();
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'aaaa' }), 5).index;
    index = appendWorktreeSnapshotRecord(index, record({ snapshotId: 'bbbb' }), 5).index;
    const serialized = serializeWorktreeSnapshotIndex(index);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(parseWorktreeSnapshotIndex(serialized)).toEqual(index);
  });

  it('fails closed on invalid JSON, wrong schema, or non-array snapshots', () => {
    expect(parseWorktreeSnapshotIndex('not json')).toBeUndefined();
    expect(parseWorktreeSnapshotIndex(JSON.stringify({ schema: 'other', snapshots: [] }))).toBeUndefined();
    expect(
      parseWorktreeSnapshotIndex(
        JSON.stringify({ schema: WORKTREE_SNAPSHOT_INDEX_SCHEMA, snapshots: {} })
      )
    ).toBeUndefined();
  });

  it('skips malformed records but keeps valid ones (resilient read)', () => {
    const document = JSON.stringify({
      schema: WORKTREE_SNAPSHOT_INDEX_SCHEMA,
      snapshots: [
        record({ snapshotId: 'good' }),
        { snapshotId: 'missing-fields' },
        { ...record({ snapshotId: 'bad-type' }), reportType: 'nope' },
        record({ snapshotId: 'good2' })
      ]
    });
    const parsed = parseWorktreeSnapshotIndex(document);
    expect(parsed?.snapshots.map((s) => s.snapshotId)).toEqual(['good', 'good2']);
  });
});
