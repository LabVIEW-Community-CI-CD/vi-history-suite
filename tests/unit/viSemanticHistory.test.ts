import { describe, expect, it, vi } from 'vitest';

import type { GitHistoryEntry } from '../../src/git/gitCli';
import type { CompareViRevisionsResult } from '../../src/semantic/compareViRevisions';
import type { ViSemanticComparisonModel } from '../../src/semantic/viSemanticModel';
import {
  buildViSemanticHistory,
  VI_SEMANTIC_HISTORY_SCHEMA,
  ViSemanticHistoryDeps,
  ViSemanticHistoryInput
} from '../../src/semantic/viSemanticHistory';

function entry(hash: string, subject: string, day: number): GitHistoryEntry {
  return {
    hash,
    authorDate: `2026-07-${String(day).padStart(2, '0')}T00:00:00Z`,
    authorName: 'Dev',
    subject,
    body: ''
  };
}

function completed(surfaces: string[], narrative: string, baseHash: string): CompareViRevisionsResult {
  return {
    status: 'completed',
    hasDifferences: surfaces.length > 0,
    model: {
      changedSurfaces: surfaces,
      narrative,
      hasDifferences: surfaces.length > 0,
      vi: { title: 'LabVIEW VI Comparison Report' },
      revisions: { baseHash, selectedHash: 'newer' }
    } as unknown as ViSemanticComparisonModel,
    runtime: { provider: 'linux-container', state: 'succeeded', reportFilePath: '/t/r.html' }
  };
}

interface Harness {
  deps: ViSemanticHistoryDeps;
  listHistory: ReturnType<typeof vi.fn>;
  compare: ReturnType<typeof vi.fn>;
}

function makeHarness(entries: GitHistoryEntry[], results: CompareViRevisionsResult[]): Harness {
  const listHistory = vi.fn(async () => entries);
  let call = 0;
  const compare = vi.fn(async () => results[call++]);
  const deps = {
    getFileHistoryEntries: listHistory,
    compareViRevisions: compare
  } as unknown as ViSemanticHistoryDeps;
  return { deps, listHistory, compare };
}

function input(overrides: Partial<ViSemanticHistoryInput> = {}): ViSemanticHistoryInput {
  return { repositoryRoot: '/repo', relativePath: 'vis/Widget.vi', ...overrides };
}

describe('buildViSemanticHistory', () => {
  it('builds a newest-first timeline across adjacent revisions', async () => {
    const entries = [entry('cccc', 'tweak front panel', 3), entry('bbbb', 'rewire', 2), entry('aaaa', 'init', 1)];
    const harness = makeHarness(entries, [
      completed(['front-panel'], 'The front panel differs.', 'bbbb'),
      completed(['block-diagram'], 'The block diagram differs.', 'aaaa')
    ]);

    const history = await buildViSemanticHistory(input(), harness.deps);

    expect(history.schema).toBe(VI_SEMANTIC_HISTORY_SCHEMA);
    expect(history.revisionCount).toBe(3);
    expect(history.comparedStepCount).toBe(2);
    // Newest transition first: b -> c, then a -> b.
    expect(history.steps[0]).toMatchObject({
      selectedHash: 'cccc',
      subject: 'tweak front panel',
      changedSurfaces: ['front-panel']
    });
    expect(history.steps[1]).toMatchObject({ selectedHash: 'bbbb', changedSurfaces: ['block-diagram'] });
    expect(harness.compare).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ baseHash: 'bbbb', selectedHash: 'cccc' })
    );
    expect(harness.listHistory).toHaveBeenCalledWith(expect.any(String), 'vis/Widget.vi', 3);
    expect(history.totals).toMatchObject({
      changingStepCount: 2,
      frontPanelChangeCount: 1,
      blockDiagramChangeCount: 1,
      blockedOrFailedStepCount: 0
    });
    expect(history.narrative).toContain('Across 2 compared revisions');
    expect(history.narrative).toContain('2 changed the VI');
    expect(history.narrative).toContain('front panel (1)');
    expect(history.narrative).toContain('block diagram (1)');
    expect(history.narrative).toContain('Most recent change (Dev, "tweak front panel")');
  });

  it('records a blocked step without aborting the timeline', async () => {
    const entries = [entry('cccc', 'edit', 3), entry('bbbb', 'edit', 2), entry('aaaa', 'init', 1)];
    const harness = makeHarness(entries, [
      completed(['front-panel'], 'The front panel differs.', 'bbbb'),
      { status: 'blocked-selection', reason: 'docker-daemon-unreachable' }
    ]);

    const history = await buildViSemanticHistory(input(), harness.deps);

    expect(history.steps[1]).toMatchObject({
      status: 'blocked-selection',
      hasDifferences: false,
      reason: 'docker-daemon-unreachable'
    });
    expect(history.steps[1].narrative).toContain('blocked-selection');
    expect(history.totals).toMatchObject({ changingStepCount: 1, blockedOrFailedStepCount: 1 });
    expect(history.narrative).toContain('1 comparison could not be completed');
  });

  it('reports no comparable history for a single revision', async () => {
    const harness = makeHarness([entry('cccc', 'only', 3)], []);
    const history = await buildViSemanticHistory(input(), harness.deps);
    expect(history.comparedStepCount).toBe(0);
    expect(history.narrative).toContain('has no comparable revision history');
    expect(harness.compare).not.toHaveBeenCalled();
  });

  it('caps and floors the revision walk depth', async () => {
    const entries = [entry('cccc', 'x', 3), entry('bbbb', 'x', 2)];
    const listHistory = vi.fn(async () => entries);
    const compare = vi.fn(async () => completed([], 'No LabVIEW differences.', 'bbbb'));
    const deps = {
      getFileHistoryEntries: listHistory,
      compareViRevisions: compare
    } as unknown as ViSemanticHistoryDeps;

    await buildViSemanticHistory(input({ maxRevisions: 100 }), deps);
    expect(listHistory).toHaveBeenLastCalledWith(expect.any(String), 'vis/Widget.vi', 20);

    await buildViSemanticHistory(input({ maxRevisions: 1 }), deps);
    expect(listHistory).toHaveBeenLastCalledWith(expect.any(String), 'vis/Widget.vi', 2);
  });

  it('rejects a missing repository root or a traversing path', async () => {
    const { deps } = makeHarness([], []);
    await expect(buildViSemanticHistory(input({ repositoryRoot: '' }), deps)).rejects.toThrow(
      'repositoryRoot is required'
    );
    await expect(
      buildViSemanticHistory(input({ relativePath: '/etc/passwd' }), deps)
    ).rejects.toThrow('repository-relative');
    await expect(
      buildViSemanticHistory(input({ relativePath: '../../secrets.vi' }), deps)
    ).rejects.toThrow('escapes the repository root');
  });
});
