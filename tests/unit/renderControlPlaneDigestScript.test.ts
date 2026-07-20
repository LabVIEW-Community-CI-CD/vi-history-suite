import { describe, expect, it } from 'vitest';

// VHS-REQ-698 (epic #2144): control-plane loop drift radar (slice 1, read-only).
// Deterministic unit tests of the pure digest renderer and the injectable
// collector — synthetic signals, no GitHub.

const {
  DIGEST_MARKER,
  buildControlPlaneDigest,
  collectControlPlaneSignals
} = require('../../scripts/renderControlPlaneDigest.js') as {
  DIGEST_MARKER: string;
  buildControlPlaneDigest: (
    signals: unknown,
    options?: { generatedAt?: string }
  ) => { marker: string; markdown: string; driftCount: number };
  collectControlPlaneSignals: (deps: Record<string, unknown>) => Record<string, unknown>;
};

const AT = '2026-07-20T00:00:00.000Z';

describe('renderControlPlaneDigest: buildControlPlaneDigest (VHS-REQ-698.1)', () => {
  it('renders the sticky marker and an in-sync board section when there is no drift', () => {
    const { marker, markdown, driftCount } = buildControlPlaneDigest({ boardDrift: [] }, { generatedAt: AT });
    expect(marker).toBe(DIGEST_MARKER);
    expect(markdown.startsWith(DIGEST_MARKER)).toBe(true);
    expect(markdown).toContain('Read-only; writes nothing.');
    expect(markdown).toContain('✅ Board is in sync');
    expect(driftCount).toBe(0);
  });

  it('lists each board drift update and counts them', () => {
    const { markdown, driftCount } = buildControlPlaneDigest(
      {
        boardDrift: [
          { number: 1, field: 'Status', value: 'Done', reason: 'linked-pr-merged' },
          { number: 1, field: 'Evidence State', value: 'Proven', reason: 'linked-pr-merged' }
        ]
      },
      { generatedAt: AT }
    );
    expect(driftCount).toBe(2);
    expect(markdown).toContain('2 board field(s) behind verified reality');
    expect(markdown).toContain('#1 → Status = Done (linked-pr-merged)');
    expect(markdown).toContain('#1 → Evidence State = Proven (linked-pr-merged)');
  });

  it('renders gate health, open work, and debt sections when present', () => {
    const { markdown } = buildControlPlaneDigest(
      {
        boardDrift: [],
        gateHealth: [
          { id: 'adr:check', ok: true },
          { id: 'traceability:audit', ok: false, detail: '1 missing inventory entry' }
        ],
        openWork: { openPrs: 3, blocked: 1, queueDepth: 2 },
        debt: { coverageDebtTitle: '12 uncovered units across 4 files', requirementAttention: 5 }
      },
      { generatedAt: AT }
    );
    expect(markdown).toContain('## Governance gate health');
    expect(markdown).toContain('✅ adr:check');
    expect(markdown).toContain('❌ traceability:audit: 1 missing inventory entry');
    expect(markdown).toContain('Open PRs: 3 (1 blocked)');
    expect(markdown).toContain('Merge-queue depth: 2');
    expect(markdown).toContain('12 uncovered units across 4 files');
    expect(markdown).toContain('Requirements needing attention: 5');
  });

  it('omits optional sections that are absent', () => {
    const { markdown } = buildControlPlaneDigest({ boardDrift: [] }, { generatedAt: AT });
    expect(markdown).not.toContain('## Governance gate health');
    expect(markdown).not.toContain('## Open work');
    expect(markdown).not.toContain('## Coverage & requirement debt');
  });

  it('tolerates a non-object signals argument', () => {
    const { driftCount, markdown } = buildControlPlaneDigest(null, { generatedAt: AT });
    expect(driftCount).toBe(0);
    expect(markdown).toContain('✅ Board is in sync');
  });
});

describe('renderControlPlaneDigest: collectControlPlaneSignals (VHS-REQ-698.1)', () => {
  it('collects board drift via the injected board-sync plan and never writes', () => {
    const signals = collectControlPlaneSignals({
      collectBoardSyncPlan: () => ({ items: [], updates: [{ number: 9, field: 'Status', value: 'Done', reason: 'linked-pr-merged' }] })
    });
    expect(signals.boardDrift).toEqual([{ number: 9, field: 'Status', value: 'Done', reason: 'linked-pr-merged' }]);
  });

  it('includes optional sections only when their collectors are provided', () => {
    const withAll = collectControlPlaneSignals({
      collectBoardSyncPlan: () => ({ items: [], updates: [] }),
      collectGateHealth: () => [{ id: 'adr:check', ok: true }],
      collectOpenWork: () => ({ openPrs: 1 }),
      collectDebt: () => ({ requirementAttention: 0 })
    });
    expect(withAll.gateHealth).toEqual([{ id: 'adr:check', ok: true }]);
    expect(withAll.openWork).toEqual({ openPrs: 1 });
    expect(withAll.debt).toEqual({ requirementAttention: 0 });

    const minimal = collectControlPlaneSignals({ collectBoardSyncPlan: () => ({ items: [], updates: [] }) });
    expect('gateHealth' in minimal).toBe(false);
    expect('openWork' in minimal).toBe(false);
    expect('debt' in minimal).toBe(false);
  });

  it('propagates a fail-closed board-read error from the plan collector', () => {
    expect(() =>
      collectControlPlaneSignals({
        collectBoardSyncPlan: () => {
          throw new Error('gh auth login required');
        }
      })
    ).toThrow(/auth login required/);
  });
});
