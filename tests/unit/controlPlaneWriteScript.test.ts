import { describe, expect, it } from 'vitest';

// VHS-REQ-696 (epic #2144): governed write path. Deterministic unit tests of the
// fail-closed gate, tier authorization, the Tier 1 board-sync planner, and the
// executor — with synthetic config/facts and injected boundaries (no GitHub).

const {
  WRITE_CONFIG_FILENAME,
  loadWriteConfig,
  authorizeWrite,
  planBoardSync,
  runBoardSync
} = require('../../scripts/controlPlaneWrite.js') as {
  WRITE_CONFIG_FILENAME: string;
  loadWriteConfig: (repoRoot: string, deps: Record<string, unknown>) => Record<string, unknown>;
  authorizeWrite: (config: Record<string, unknown>, tier: string, context?: Record<string, unknown>) => { authorized: boolean; reason?: string };
  planBoardSync: (items: unknown) => Array<Record<string, unknown>>;
  runBoardSync: (options: Record<string, unknown>, deps: Record<string, unknown>) => { executed: boolean; reason?: string; plannedCount: number; appliedCount: number };
};

const write = require('../../scripts/controlPlaneWrite.js') as {
  planAnnotate: (actions: unknown) => Array<Record<string, unknown>>;
  runAnnotate: (options: Record<string, unknown>, deps: Record<string, unknown>) => { executed: boolean; reason?: string; plannedCount: number; appliedCount: number };
  planMergeQueue: (actions: unknown) => Array<Record<string, unknown>>;
  runMergeQueue: (options: Record<string, unknown>, deps: Record<string, unknown>) => { executed: boolean; reason?: string; plannedCount: number; appliedCount: number };
};
const { planAnnotate, runAnnotate, planMergeQueue, runMergeQueue } = write;

const ENABLED_CONFIG = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } };
const DISABLED_CONFIG = { enabled: false, approvers: ['svelderrainruiz'], tiers: { boardSync: true } };

function fakeRead(json: string) {
  return { readFileSync: () => json };
}

describe('controlPlaneWrite: loadWriteConfig (VHS-REQ-696.1)', () => {
  it('reads the committed config', () => {
    const c = loadWriteConfig('/repo', fakeRead(JSON.stringify(ENABLED_CONFIG)));
    expect(c).toMatchObject({ enabled: true, approvers: ['svelderrainruiz'] });
  });

  it('fails closed (disabled) when the config is missing', () => {
    const c = loadWriteConfig('/repo', { readFileSync: () => { throw new Error('ENOENT'); } });
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe('config-missing');
  });

  it('fails closed (disabled) when the config is malformed', () => {
    const c = loadWriteConfig('/repo', fakeRead('{ not json'));
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe('config-malformed');
  });

  it('the real committed config has Tier-1 board-sync enabled and higher tiers disabled', () => {
    const c = loadWriteConfig(require('node:path').resolve(__dirname, '..', '..'), {});
    // Maintainer-approved 2026-07-20: Tier-1 board-sync is enabled; higher tiers stay off.
    expect(c.enabled).toBe(true);
    expect(c.tiers.boardSync).toBe(true);
    expect(c.tiers.annotate).toBe(false);
    expect(c.tiers.mergeQueue).toBe(false);
    expect(c.tiers.createWork).toBe(false);
  });

  it('exposes the config filename', () => {
    expect(WRITE_CONFIG_FILENAME).toBe('control-plane-write.json');
  });
});

describe('controlPlaneWrite: authorizeWrite (VHS-REQ-696.2)', () => {
  it('refuses every write when the path is disabled', () => {
    expect(authorizeWrite(DISABLED_CONFIG, 'boardSync')).toEqual({ authorized: false, reason: 'write-path-disabled' });
  });

  it('authorizes Tier 1 board-sync when enabled (no per-action approval needed)', () => {
    expect(authorizeWrite(ENABLED_CONFIG, 'boardSync')).toEqual({ authorized: true });
  });

  it('refuses a tier that is not enabled in the config', () => {
    expect(authorizeWrite({ enabled: true, approvers: [], tiers: { boardSync: false } }, 'boardSync')).toMatchObject({ authorized: false });
  });

  it('requires a server-verified allowlisted approver for non-board-sync tiers', () => {
    expect(authorizeWrite(ENABLED_CONFIG, 'annotate', { approver: 'someone', approverVerified: true }).authorized).toBe(false);
    expect(authorizeWrite(ENABLED_CONFIG, 'annotate', { approver: 'svelderrainruiz', approverVerified: false }).reason).toBe('approver-not-server-verified');
    expect(authorizeWrite(ENABLED_CONFIG, 'annotate', { approver: 'svelderrainruiz', approverVerified: true })).toEqual({ authorized: true });
  });
});

describe('controlPlaneWrite: planBoardSync (VHS-REQ-696.3)', () => {
  it('mirrors only directly-verified truth: merged linked PR -> Done/Proven', () => {
    const updates = planBoardSync([
      { itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready', linkedPrMerged: true },
      { itemId: 'B', number: 2, status: 'Done', evidence: 'Proven', linkedPrMerged: true },
      { itemId: 'C', number: 3, status: 'Todo', evidence: 'None', linkedPrMerged: false }
    ]);
    // A needs both fields; B already correct; C is not verified so untouched.
    expect(updates).toEqual([
      { itemId: 'A', number: 1, field: 'Status', value: 'Done', reason: 'linked-pr-merged' },
      { itemId: 'A', number: 1, field: 'Evidence State', value: 'Proven', reason: 'linked-pr-merged' }
    ]);
  });

  it('never infers state for unverified items', () => {
    expect(planBoardSync([{ itemId: 'X', number: 9, status: 'Todo', evidence: 'None', linkedPrMerged: false }])).toEqual([]);
    expect(planBoardSync([])).toEqual([]);
  });
});

describe('controlPlaneWrite: runBoardSync (VHS-REQ-696.3)', () => {
  it('does NOTHING when the write path is disabled', () => {
    const calls: unknown[] = [];
    const out = runBoardSync(
      { items: [{ itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready', linkedPrMerged: true }] },
      { config: DISABLED_CONFIG, applyFieldUpdate: (u: unknown) => calls.push(u), appendLog: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'write-path-disabled', appliedCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it('applies verified updates and logs them when enabled', () => {
    const applied: unknown[] = [];
    const logged: unknown[] = [];
    const out = runBoardSync(
      { items: [{ itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready', linkedPrMerged: true }] },
      {
        config: ENABLED_CONFIG,
        applyFieldUpdate: (u: unknown) => applied.push(u),
        appendLog: (e: unknown) => logged.push(e),
        now: () => new Date('2026-07-20T00:00:00.000Z')
      }
    );
    expect(out).toMatchObject({ executed: true, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect((logged[0] as Record<string, unknown>).action).toBe('board-sync');
  });

  it('refuses to execute without an injected executor even when enabled', () => {
    const out = runBoardSync(
      { items: [{ itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready', linkedPrMerged: true }] },
      { config: ENABLED_CONFIG }
    );
    expect(out).toMatchObject({ executed: false, reason: 'no-executor' });
  });
});

describe('controlPlaneWrite: planAnnotate (VHS-REQ-696.4)', () => {
  it('normalizes valid comment/label actions and drops malformed entries', () => {
    const planned = planAnnotate([
      { kind: 'comment', target: 'issue', number: 1, body: 'hello' },
      { kind: 'label', target: 'pr', number: 2, label: 'needs-review' },
      { kind: 'comment', target: 'issue', number: 3, body: '   ' }, // empty body -> dropped
      { kind: 'label', target: 'pr', number: 4 }, // missing label -> dropped
      { kind: 'comment', target: 'wiki', number: 5, body: 'x' }, // bad target -> dropped
      { kind: 'comment', target: 'issue', number: 0, body: 'x' }, // bad number -> dropped
      { kind: 'react', target: 'issue', number: 6, body: 'x' }, // unknown kind -> dropped
      null
    ]);
    expect(planned).toEqual([
      { kind: 'comment', target: 'issue', number: 1, body: 'hello' },
      { kind: 'label', target: 'pr', number: 2, label: 'needs-review' }
    ]);
    expect(planAnnotate([])).toEqual([]);
    expect(planAnnotate(undefined)).toEqual([]);
  });
});

describe('controlPlaneWrite: runAnnotate (VHS-REQ-696.4)', () => {
  const ANNOTATE_CONFIG = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } };
  const action = { kind: 'comment', target: 'issue', number: 1, body: 'hi' };

  it('does NOTHING when the write path is disabled', () => {
    const calls: unknown[] = [];
    const out = runAnnotate(
      { actions: [action], approver: 'svelderrainruiz', approverVerified: true },
      { config: DISABLED_CONFIG, applyAnnotation: (a: unknown) => calls.push(a), appendLog: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'write-path-disabled', appliedCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it('refuses when the annotate tier is disabled even if the path is enabled', () => {
    const out = runAnnotate(
      { actions: [action], approver: 'svelderrainruiz', approverVerified: true },
      { config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: false } }, applyAnnotation: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'tier-disabled:annotate' });
  });

  it('refuses without a server-verified allowlisted approver', () => {
    const unverified = runAnnotate(
      { actions: [action], approver: 'svelderrainruiz', approverVerified: false },
      { config: ANNOTATE_CONFIG, applyAnnotation: () => {} }
    );
    expect(unverified).toMatchObject({ executed: false, reason: 'approver-not-server-verified' });
    const stranger = runAnnotate(
      { actions: [action], approver: 'someone-else', approverVerified: true },
      { config: ANNOTATE_CONFIG, applyAnnotation: () => {} }
    );
    expect(stranger).toMatchObject({ executed: false, reason: 'approver-not-authorized' });
  });

  it('refuses to execute without an injected applier even when authorized', () => {
    const out = runAnnotate(
      { actions: [action], approver: 'svelderrainruiz', approverVerified: true },
      { config: ANNOTATE_CONFIG }
    );
    expect(out).toMatchObject({ executed: false, reason: 'no-executor' });
  });

  it('applies and append-logs each action when the gate authorizes', () => {
    const applied: unknown[] = [];
    const logged: Array<Record<string, unknown>> = [];
    const out = runAnnotate(
      {
        actions: [action, { kind: 'label', target: 'pr', number: 2, label: 'ready' }],
        approver: 'svelderrainruiz',
        approverVerified: true
      },
      {
        config: ANNOTATE_CONFIG,
        applyAnnotation: (a: unknown) => applied.push(a),
        appendLog: (e: Record<string, unknown>) => logged.push(e),
        now: () => new Date('2026-07-20T00:00:00.000Z')
      }
    );
    expect(out).toMatchObject({ executed: true, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ action: 'annotate', tier: 'annotate', kind: 'comment', number: 1, approver: 'svelderrainruiz' });
  });
});

describe('controlPlaneWrite: planMergeQueue (VHS-REQ-696.5)', () => {
  it('normalizes valid arm/dequeue actions, de-duplicates, and drops malformed entries', () => {
    const planned = planMergeQueue([
      { op: 'arm', number: 1 },
      { op: 'dequeue', number: 2 },
      { op: 'arm', number: 1 }, // duplicate -> dropped
      { op: 'squash', number: 3 }, // bad op -> dropped
      { op: 'arm', number: 0 }, // bad number -> dropped
      { op: 'dequeue' }, // missing number -> dropped
      null
    ]);
    expect(planned).toEqual([
      { op: 'arm', number: 1 },
      { op: 'dequeue', number: 2 }
    ]);
    expect(planMergeQueue([])).toEqual([]);
    expect(planMergeQueue(undefined)).toEqual([]);
  });
});

describe('controlPlaneWrite: runMergeQueue (VHS-REQ-696.5)', () => {
  const MQ_CONFIG = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, mergeQueue: true } };
  const mqAction = { op: 'arm', number: 1 };

  it('does NOTHING when the write path is disabled', () => {
    const calls: unknown[] = [];
    const out = runMergeQueue(
      { actions: [mqAction], approver: 'svelderrainruiz', approverVerified: true },
      { config: DISABLED_CONFIG, applyMergeQueueAction: (a: unknown) => calls.push(a), appendLog: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'write-path-disabled', appliedCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it('refuses when the mergeQueue tier is disabled even if the path is enabled', () => {
    const out = runMergeQueue(
      { actions: [mqAction], approver: 'svelderrainruiz', approverVerified: true },
      { config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, mergeQueue: false } }, applyMergeQueueAction: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'tier-disabled:mergeQueue' });
  });

  it('refuses without a server-verified allowlisted approver', () => {
    const unverified = runMergeQueue(
      { actions: [mqAction], approver: 'svelderrainruiz', approverVerified: false },
      { config: MQ_CONFIG, applyMergeQueueAction: () => {} }
    );
    expect(unverified).toMatchObject({ executed: false, reason: 'approver-not-server-verified' });
    const stranger = runMergeQueue(
      { actions: [mqAction], approver: 'someone-else', approverVerified: true },
      { config: MQ_CONFIG, applyMergeQueueAction: () => {} }
    );
    expect(stranger).toMatchObject({ executed: false, reason: 'approver-not-authorized' });
  });

  it('refuses to execute without an injected actor even when authorized', () => {
    const out = runMergeQueue(
      { actions: [mqAction], approver: 'svelderrainruiz', approverVerified: true },
      { config: MQ_CONFIG }
    );
    expect(out).toMatchObject({ executed: false, reason: 'no-executor' });
  });

  it('applies and append-logs each action when the gate authorizes', () => {
    const applied: unknown[] = [];
    const logged: Array<Record<string, unknown>> = [];
    const out = runMergeQueue(
      {
        actions: [mqAction, { op: 'dequeue', number: 2 }],
        approver: 'svelderrainruiz',
        approverVerified: true
      },
      {
        config: MQ_CONFIG,
        applyMergeQueueAction: (a: unknown) => applied.push(a),
        appendLog: (e: Record<string, unknown>) => logged.push(e),
        now: () => new Date('2026-07-20T00:00:00.000Z')
      }
    );
    expect(out).toMatchObject({ executed: true, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ action: 'merge-queue', tier: 'mergeQueue', op: 'arm', number: 1, approver: 'svelderrainruiz' });
  });
});
