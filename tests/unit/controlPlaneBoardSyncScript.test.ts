import { describe, expect, it } from 'vitest';

// VHS-REQ-695 (epic #2144): board-sync SHADOW MODE. Deterministic unit tests of
// the pure item join, the shadow renderer, the orchestration over injected live
// boundaries, and fail-closed-on-auth — all with synthetic truth and no GitHub.

const {
  BoardSyncAuthError,
  buildBoardSyncItems,
  renderShadowPlan,
  collectBoardSyncPlan,
  runGh,
  defaultReadProjectItems,
  defaultReadVerifiedClosures
} = require('../../scripts/controlPlaneBoardSync.js') as {
  BoardSyncAuthError: new (m: string) => Error;
  buildBoardSyncItems: (items: unknown, closures: unknown) => Array<Record<string, unknown>>;
  renderShadowPlan: (updates: unknown, options?: Record<string, unknown>) => string;
  collectBoardSyncPlan: (deps: Record<string, unknown>) => { items: unknown[]; updates: Array<Record<string, unknown>> };
  runGh: (args: string[], deps?: Record<string, unknown>) => string;
  defaultReadProjectItems: (deps?: Record<string, unknown>) => Array<Record<string, unknown>>;
  defaultReadVerifiedClosures: (numbers: number[], deps?: Record<string, unknown>) => Map<number, boolean>;
};

function fakeSpawn(result: Record<string, unknown>) {
  return () => ({ status: 0, stdout: '', stderr: '', ...result });
}

const PROJECT_ITEMS = [
  { itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready' },
  { itemId: 'B', number: 2, status: 'Done', evidence: 'Proven' },
  { itemId: 'C', number: 3, status: 'Todo', evidence: 'None' }
];

describe('controlPlaneBoardSync: buildBoardSyncItems (VHS-REQ-695.1)', () => {
  it('joins board items with verified closures, never inferring closure', () => {
    const items = buildBoardSyncItems(PROJECT_ITEMS, { 1: true, 2: true });
    expect(items).toEqual([
      { itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready', linkedPrMerged: true },
      { itemId: 'B', number: 2, status: 'Done', evidence: 'Proven', linkedPrMerged: true },
      { itemId: 'C', number: 3, status: 'Todo', evidence: 'None', linkedPrMerged: false }
    ]);
  });

  it('accepts a Map of closures and treats unknown numbers as not-closed', () => {
    const items = buildBoardSyncItems(PROJECT_ITEMS, new Map([[3, true]]));
    expect(items.find((i) => i.number === 3)?.linkedPrMerged).toBe(true);
    expect(items.find((i) => i.number === 1)?.linkedPrMerged).toBe(false);
  });

  it('drops malformed items and defaults missing fields to empty strings', () => {
    const items = buildBoardSyncItems(
      [{ itemId: 'A', number: 1 }, { itemId: 'X' }, null, { number: 5 }],
      {}
    );
    expect(items).toEqual([{ itemId: 'A', number: 1, status: '', evidence: '', linkedPrMerged: false }]);
  });
});

describe('controlPlaneBoardSync: renderShadowPlan (VHS-REQ-695.2)', () => {
  it('reports in-sync when there are no updates', () => {
    expect(renderShadowPlan([])).toContain('in sync');
  });

  it('lists the updates that WOULD apply and marks the run report-only', () => {
    const out = renderShadowPlan([
      { number: 1, field: 'Status', value: 'Done', reason: 'linked-pr-merged' },
      { number: 1, field: 'Evidence State', value: 'Proven', reason: 'linked-pr-merged' }
    ]);
    expect(out).toContain('2 board update(s) WOULD mirror');
    expect(out).toContain('#1 Status -> Done');
    expect(out).toContain('#1 Evidence State -> Proven');
    expect(out).toContain('Write path is disabled; this is report-only.');
  });
});

describe('controlPlaneBoardSync: collectBoardSyncPlan (VHS-REQ-695.2)', () => {
  it('mirrors only directly-verified closures into a plan (never writes)', () => {
    const { items, updates } = collectBoardSyncPlan({
      readProjectItems: () => PROJECT_ITEMS,
      // Only #1 is verified-closed; #3 stays Todo (not inferred).
      readVerifiedClosures: (numbers: number[]) => {
        expect(numbers).toEqual([1, 2, 3]);
        return { 1: true, 2: true };
      }
    });
    expect(items).toHaveLength(3);
    // #1 needs both Status+Evidence; #2 already Done/Proven; #3 unverified.
    expect(updates).toEqual([
      { itemId: 'A', number: 1, field: 'Status', value: 'Done', reason: 'linked-pr-merged' },
      { itemId: 'A', number: 1, field: 'Evidence State', value: 'Proven', reason: 'linked-pr-merged' }
    ]);
  });

  it('produces an empty plan when the board already matches truth', () => {
    const { updates } = collectBoardSyncPlan({
      readProjectItems: () => [{ itemId: 'B', number: 2, status: 'Done', evidence: 'Proven' }],
      readVerifiedClosures: () => ({ 2: true })
    });
    expect(updates).toEqual([]);
  });
});

describe('controlPlaneBoardSync: fail-closed on auth (VHS-REQ-695.3)', () => {
  it('propagates a board-read auth failure instead of degrading to in-sync', () => {
    expect(() =>
      collectBoardSyncPlan({
        readProjectItems: () => {
          throw new BoardSyncAuthError('gh exited 1: gh auth login required');
        }
      })
    ).toThrow(/auth login required/);
  });
});

describe('controlPlaneBoardSync: live gh boundaries (VHS-REQ-695.3)', () => {
  it('runGh returns stdout on success', () => {
    expect(runGh(['x'], { spawnSync: fakeSpawn({ stdout: 'ok' }) })).toBe('ok');
  });

  it('runGh throws BoardSyncAuthError on a spawn error', () => {
    expect(() => runGh(['x'], { spawnSync: () => ({ error: new Error('ENOENT gh') }) })).toThrow(BoardSyncAuthError);
  });

  it('runGh throws BoardSyncAuthError with stderr on a nonzero exit', () => {
    expect(() => runGh(['x'], { spawnSync: () => ({ status: 1, stderr: 'gh auth login required' }) })).toThrow(
      /gh auth login required/
    );
  });

  it('defaultReadProjectItems parses only issue/PR content items', () => {
    const items = defaultReadProjectItems({
      runGh: () =>
        JSON.stringify({
          items: [
            { id: 'A', status: 'Todo', 'evidence State': 'None', content: { number: 1 } },
            { id: 'B', content: {} },
            { id: 'C', content: { number: 2 } }
          ]
        })
    });
    expect(items).toEqual([
      { itemId: 'A', number: 1, status: 'Todo', evidence: 'None' },
      { itemId: 'C', number: 2, status: '', evidence: '' }
    ]);
  });

  it('defaultReadProjectItems throws BoardSyncAuthError on unparseable JSON', () => {
    expect(() => defaultReadProjectItems({ runGh: () => 'not json' })).toThrow(BoardSyncAuthError);
  });

  it('defaultReadVerifiedClosures marks only CLOSED+COMPLETED numbers', () => {
    const closures = defaultReadVerifiedClosures([1, 2, 3], {
      runGh: (args: string[]) => {
        const n = args[2];
        if (n === '1') return JSON.stringify({ state: 'CLOSED', stateReason: 'COMPLETED' });
        if (n === '2') return JSON.stringify({ state: 'CLOSED', stateReason: 'NOT_PLANNED' });
        return JSON.stringify({ state: 'OPEN', stateReason: null });
      }
    });
    expect(closures.get(1)).toBe(true);
    expect(closures.has(2)).toBe(false);
    expect(closures.has(3)).toBe(false);
  });

  it('defaultReadVerifiedClosures skips a number whose JSON is unparseable', () => {
    const closures = defaultReadVerifiedClosures([9], { runGh: () => 'broken' });
    expect(closures.size).toBe(0);
  });
});
