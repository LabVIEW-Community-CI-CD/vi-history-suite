import { describe, expect, it } from 'vitest';

// VHS-REQ-695 (epic #2144): board-sync SHADOW MODE. Deterministic unit tests of
// the pure item join, the shadow renderer, the orchestration over injected live
// boundaries, and fail-closed-on-auth — all with synthetic truth and no GitHub.

const {
  BoardSyncAuthError,
  buildBoardSyncItems,
  renderShadowPlan,
  collectBoardSyncPlan
} = require('../../scripts/controlPlaneBoardSync.js') as {
  BoardSyncAuthError: new (m: string) => Error;
  buildBoardSyncItems: (items: unknown, closures: unknown) => Array<Record<string, unknown>>;
  renderShadowPlan: (updates: unknown, options?: Record<string, unknown>) => string;
  collectBoardSyncPlan: (deps: Record<string, unknown>) => { items: unknown[]; updates: Array<Record<string, unknown>> };
};

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
