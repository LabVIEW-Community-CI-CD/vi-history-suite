// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the vi-repository-index@v1 activity-ranked survey
// orchestrator (VHS-REQ-662.6).
import { describe, expect, it, vi } from 'vitest';

import type { GitHistoryEntry } from '../../src/git/gitCli';
import {
  buildViRepositoryIndex,
  VI_REPOSITORY_INDEX_SCHEMA,
  ViRepositoryIndexDeps,
  ViRepositoryIndexInput
} from '../../src/semantic/viRepositoryIndex';

function entry(hash: string, authorDate: string, subject: string): GitHistoryEntry {
  return { hash, authorDate, authorName: 'Dev', subject, body: '' };
}

interface Harness {
  deps: ViRepositoryIndexDeps;
  listTrackedFiles: ReturnType<typeof vi.fn>;
  getFileHistoryCount: ReturnType<typeof vi.fn>;
  getFileHistoryEntries: ReturnType<typeof vi.fn>;
}

function makeHarness(
  files: string[],
  counts: Record<string, number>,
  latest: Record<string, GitHistoryEntry>
): Harness {
  const listTrackedFiles = vi.fn(async () => files);
  const getFileHistoryCount = vi.fn(async (_root: string, rel: string) => counts[rel] ?? 0);
  const getFileHistoryEntries = vi.fn(async (_root: string, rel: string) => {
    const found = latest[rel];
    return found ? [found] : [];
  });
  const deps = {
    listTrackedFiles,
    getFileHistoryCount,
    getFileHistoryEntries
  } as unknown as ViRepositoryIndexDeps;
  return { deps, listTrackedFiles, getFileHistoryCount, getFileHistoryEntries };
}

function input(overrides: Partial<ViRepositoryIndexInput> = {}): ViRepositoryIndexInput {
  return { repositoryRoot: '/repo', ...overrides };
}

describe('buildViRepositoryIndex', () => {
  it('surveys tracked VIs ranked by revision activity', async () => {
    const files = ['README.md', 'vis/A.vi', 'src/B.VI', 'docs/x.txt', 'vis/C.vi'];
    const harness = makeHarness(
      files,
      { 'vis/A.vi': 2, 'src/B.VI': 5, 'vis/C.vi': 5 },
      {
        'vis/A.vi': entry('a1', '2026-07-01T00:00:00Z', 'edit A'),
        'src/B.VI': entry('b1', '2026-07-10T00:00:00Z', 'edit B'),
        'vis/C.vi': entry('c1', '2026-07-05T00:00:00Z', 'edit C')
      }
    );

    const index = await buildViRepositoryIndex(input(), harness.deps);

    expect(index.schema).toBe(VI_REPOSITORY_INDEX_SCHEMA);
    // .vi and .VI both count (case-insensitive); non-VI files are excluded.
    expect(index.viCount).toBe(3);
    expect(index.indexedCount).toBe(3);
    // Ranked by revisionCount desc, then path asc: B.VI(5), C.vi(5), A.vi(2).
    expect(index.vis.map((entryItem) => entryItem.relativePath)).toEqual([
      'src/B.VI',
      'vis/C.vi',
      'vis/A.vi'
    ]);
    expect(index.vis[0]).toMatchObject({ relativePath: 'src/B.VI', revisionCount: 5 });
    expect(index.vis[0].latestCommit).toMatchObject({ hash: 'b1', subject: 'edit B' });
    expect(index.narrative).toContain('tracks 3 VIs');
    expect(index.narrative).toContain('Most revised: src/B.VI (5 revisions)');
    expect(index.narrative).toContain('Most recently changed: src/B.VI');
  });

  it('selects the most recently changed VI chronologically across timezone offsets', async () => {
    // Same calendar day, different offsets: A is 17:00 UTC (later), B is 10:00
    // UTC (earlier). A lexicographic compare of the %aI strings wrongly ranks
    // "T12:00:00+02:00" ahead of "T09:00:00-08:00".
    const harness = makeHarness(
      ['vis/A.vi', 'vis/B.vi'],
      { 'vis/A.vi': 3, 'vis/B.vi': 3 },
      {
        'vis/A.vi': entry('a1', '2026-07-15T09:00:00-08:00', 'later in real time'),
        'vis/B.vi': entry('b1', '2026-07-15T12:00:00+02:00', 'earlier in real time')
      }
    );

    const index = await buildViRepositoryIndex(input(), harness.deps);

    expect(index.narrative).toContain('Most recently changed: vis/A.vi');
    expect(index.narrative).not.toContain('Most recently changed: vis/B.vi');
  });

  it('caps the number of detailed VIs but reports the true total', async () => {
    const harness = makeHarness(['a.vi', 'b.vi', 'c.vi'], { 'a.vi': 1, 'b.vi': 1, 'c.vi': 1 }, {});
    const index = await buildViRepositoryIndex(input({ maxVis: 2 }), harness.deps);
    expect(index.viCount).toBe(3);
    expect(index.indexedCount).toBe(2);
    expect(index.narrative).toContain('tracks 3 VIs (showing 2)');
    expect(harness.getFileHistoryCount).toHaveBeenCalledTimes(2);
  });

  it('floors maxVis at 1', async () => {
    const harness = makeHarness(['a.vi', 'b.vi', 'c.vi'], { 'a.vi': 1, 'b.vi': 2, 'c.vi': 3 }, {});
    const index = await buildViRepositoryIndex(input({ maxVis: 0 }), harness.deps);
    expect(index.viCount).toBe(3);
    expect(index.indexedCount).toBe(1);
  });

  it('reports no VIs for a repository without any', async () => {
    const harness = makeHarness(['README.md', 'src/x.ts'], {}, {});
    const index = await buildViRepositoryIndex(input(), harness.deps);
    expect(index.viCount).toBe(0);
    expect(index.vis).toEqual([]);
    expect(index.narrative).toContain('No tracked VIs were found');
  });

  it('handles a VI with no commit history', async () => {
    const harness = makeHarness(['staged.vi'], { 'staged.vi': 0 }, {});
    const index = await buildViRepositoryIndex(input(), harness.deps);
    expect(index.vis[0]).toEqual({ relativePath: 'staged.vi', revisionCount: 0 });
    expect(index.vis[0].latestCommit).toBeUndefined();
  });

  it('requires a repository root', async () => {
    const { deps } = makeHarness([], {}, {});
    await expect(buildViRepositoryIndex(input({ repositoryRoot: '' }), deps)).rejects.toThrow(
      'repositoryRoot is required'
    );
  });
});
