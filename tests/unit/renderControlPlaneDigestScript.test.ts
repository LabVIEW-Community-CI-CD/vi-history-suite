import { describe, expect, it } from 'vitest';

// VHS-REQ-698 (epic #2144): control-plane loop drift radar (slice 1, read-only).
// Deterministic unit tests of the pure digest renderer and the injectable
// collector — synthetic signals, no GitHub.

const {
  DIGEST_MARKER,
  buildControlPlaneDigest,
  collectControlPlaneSignals,
  deriveGateHealthFromReadModel,
  deriveOpenWorkFromReadModel,
  deriveDebtFromReadModel,
  deriveReleaseStateFromReadModel,
  deriveSupplyChainFromReadModel
} = require('../../scripts/renderControlPlaneDigest.js') as {
  DIGEST_MARKER: string;
  buildControlPlaneDigest: (
    signals: unknown,
    options?: { generatedAt?: string }
  ) => { marker: string; markdown: string; driftCount: number };
  collectControlPlaneSignals: (deps: Record<string, unknown>) => Record<string, unknown>;
  deriveGateHealthFromReadModel: (packet: unknown) => Array<{ id: string; ok: boolean; detail: string }> | undefined;
  deriveOpenWorkFromReadModel: (packet: unknown) => { openPrs: number; blocked: number } | undefined;
  deriveDebtFromReadModel: (packet: unknown) => { coverageDebtTitle?: string; requirementAttention?: number } | undefined;
  deriveReleaseStateFromReadModel: (packet: unknown) => { stage: string; status: string; authorityComplete: boolean } | undefined;
  deriveSupplyChainFromReadModel: (packet: unknown) => { status: string; artifactCount: number; attentionCount: number } | undefined;
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
    expect(markdown).not.toContain('## Release state');
    expect(markdown).not.toContain('## Supply chain');
  });

  it('renders release-state and supply-chain sections when present', () => {
    const { markdown } = buildControlPlaneDigest(
      {
        boardDrift: [],
        releaseState: { stage: 'published', status: 'ready', authorityComplete: true },
        supplyChain: { status: 'attention', artifactCount: 2, attentionCount: 1 }
      },
      { generatedAt: AT }
    );
    expect(markdown).toContain('## Release state');
    expect(markdown).toContain('Furthest stage: published (ready)');
    expect(markdown).toContain('Publish authority: complete');
    expect(markdown).toContain('## Supply chain');
    expect(markdown).toContain('⚠️ attention: 2 artifact(s), 1 needing attention');
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
  it('degrades the board section on a board-read failure but keeps the other sections', () => {
    const signals = collectControlPlaneSignals({
      collectBoardSyncPlan: () => {
        throw new Error('gh auth login required');
      },
      readModelPacket: { coverage: { available: true, mappedBelowThreshold: 0 } }
    });
    expect(signals.boardDrift).toEqual([]);
    expect(signals.boardUnavailable).toMatch(/auth login required/);
    // The read-model-derived sections still populate.
    expect(signals.debt).toBeDefined();
  });

  it('renders a clear board-unavailable line rather than a false in-sync claim', () => {
    const { markdown } = buildControlPlaneDigest(
      { boardDrift: [], boardUnavailable: 'gh auth login required' },
      { generatedAt: AT }
    );
    expect(markdown).toContain('Board read unavailable (gh auth login required)');
    expect(markdown).not.toContain('Board is in sync');
  });

  it('still fails closed on the board read when explicitly requested', () => {
    expect(() =>
      collectControlPlaneSignals({
        failClosedOnBoard: true,
        collectBoardSyncPlan: () => {
          throw new Error('gh auth login required');
        }
      })
    ).toThrow(/auth login required/);
  });
});

const READ_MODEL = {
  adrGovernance: { available: true, consistent: true },
  requirementHealth: { available: true, healthy: true, status: 'healthy', requirementsNeedingAttention: 0 },
  coverage: { available: true, mappedBelowThreshold: 0 },
  openWork: { available: true, openPullRequests: 3, byMergeStateStatus: { BLOCKED: 1, CLEAN: 2 } },
  releaseState: { available: true, stage: 'published', status: 'ready', authorityComplete: true },
  supplyChain: { available: true, status: 'clean', artifactCount: 4, attentionCount: 0 }
};

describe('renderControlPlaneDigest: read-model section mappers (VHS-REQ-698.1)', () => {
  it('derives gate health from ADR/requirement/coverage domains', () => {
    expect(deriveGateHealthFromReadModel(READ_MODEL)).toEqual([
      { id: 'adr:governance', ok: true, detail: '' },
      { id: 'requirements:health', ok: true, detail: '' },
      { id: 'coverage:risk', ok: true, detail: '' }
    ]);
  });

  it('marks a gate failing with detail when a domain is unhealthy', () => {
    const gates = deriveGateHealthFromReadModel({
      adrGovernance: { available: true, consistent: false, violationCount: 2 },
      coverage: { available: true, mappedBelowThreshold: 3 }
    });
    expect(gates).toContainEqual({ id: 'adr:governance', ok: false, detail: '2 violation(s)' });
    expect(gates).toContainEqual({ id: 'coverage:risk', ok: false, detail: '3 mapped file(s) below threshold' });
  });

  it('omits gate health entirely when no domain is available', () => {
    expect(deriveGateHealthFromReadModel({ adrGovernance: { available: false } })).toBeUndefined();
    expect(deriveGateHealthFromReadModel(null)).toBeUndefined();
  });

  it('derives open work with the blocked count, undefined when the domain is unavailable', () => {
    expect(deriveOpenWorkFromReadModel(READ_MODEL)).toEqual({ openPrs: 3, blocked: 1 });
    expect(deriveOpenWorkFromReadModel({ openWork: { available: false } })).toBeUndefined();
  });

  it('derives debt from coverage + requirement attention, undefined when neither present', () => {
    expect(deriveDebtFromReadModel(READ_MODEL)).toEqual({
      coverageDebtTitle: 'No mapped files below the coverage risk threshold',
      requirementAttention: 0
    });
    expect(deriveDebtFromReadModel({ coverage: { available: true, mappedBelowThreshold: 5 } })).toEqual({
      coverageDebtTitle: '5 mapped file(s) below the coverage risk threshold'
    });
    expect(deriveDebtFromReadModel({})).toBeUndefined();
  });

  it('derives release state, undefined when the domain is unavailable', () => {
    expect(deriveReleaseStateFromReadModel(READ_MODEL)).toEqual({
      stage: 'published',
      status: 'ready',
      authorityComplete: true
    });
    expect(deriveReleaseStateFromReadModel({ releaseState: { available: false } })).toBeUndefined();
    expect(deriveReleaseStateFromReadModel({})).toBeUndefined();
  });

  it('derives supply chain, undefined when the domain is unavailable', () => {
    expect(deriveSupplyChainFromReadModel(READ_MODEL)).toEqual({
      status: 'clean',
      artifactCount: 4,
      attentionCount: 0
    });
    expect(deriveSupplyChainFromReadModel({ supplyChain: { available: false } })).toBeUndefined();
  });
});

describe('renderControlPlaneDigest: read-model-driven collector (VHS-REQ-698.1)', () => {
  it('populates all rich sections from an injected read-model packet', () => {
    const signals = collectControlPlaneSignals({
      collectBoardSyncPlan: () => ({ items: [], updates: [] }),
      readModelPacket: READ_MODEL
    });
    expect(Array.isArray(signals.gateHealth)).toBe(true);
    expect(signals.openWork).toEqual({ openPrs: 3, blocked: 1 });
    expect(signals.debt).toMatchObject({ requirementAttention: 0 });
    expect(signals.releaseState).toEqual({ stage: 'published', status: 'ready', authorityComplete: true });
    expect(signals.supplyChain).toEqual({ status: 'clean', artifactCount: 4, attentionCount: 0 });
  });

  it('builds the packet via an injected builder and degrades on a builder error', () => {
    const ok = collectControlPlaneSignals({
      collectBoardSyncPlan: () => ({ items: [], updates: [] }),
      buildReadModel: () => READ_MODEL
    });
    expect(ok.openWork).toEqual({ openPrs: 3, blocked: 1 });

    const degraded = collectControlPlaneSignals({
      collectBoardSyncPlan: () => ({ items: [], updates: [] }),
      buildReadModel: () => {
        throw new Error('read-model unavailable');
      }
    });
    // Board drift still stands; rich sections are simply omitted.
    expect(degraded.boardDrift).toEqual([]);
    expect('openWork' in degraded).toBe(false);
    expect('gateHealth' in degraded).toBe(false);
  });

  it('an explicit collector overrides the read-model-derived section', () => {
    const signals = collectControlPlaneSignals({
      collectBoardSyncPlan: () => ({ items: [], updates: [] }),
      readModelPacket: READ_MODEL,
      collectOpenWork: () => ({ openPrs: 99 })
    });
    expect(signals.openWork).toEqual({ openPrs: 99 });
  });
});

