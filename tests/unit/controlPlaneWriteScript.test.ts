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
  planCreateWork: (actions: unknown) => Array<Record<string, unknown>>;
  runCreateWork: (options: Record<string, unknown>, deps: Record<string, unknown>) => { executed: boolean; reason?: string; plannedCount: number; appliedCount: number };
  resolveBoardFieldEdit: (update: unknown) => string[];
  defaultApplyFieldUpdate: (deps?: Record<string, unknown>) => (update: unknown) => void;
  ControlPlaneWriteError: new (message: string) => Error;
  PROJECT_ID: string;
  runBoardSyncCli: (
    argv: string[],
    deps: Record<string, unknown>
  ) => { authorized: boolean; reason?: string; applied: boolean; dryRun: boolean; plannedCount: number; appliedCount: number; lines: string[] };
  REPOSITORY: string;
  resolveAnnotateCommand: (action: unknown) => string[];
  defaultApplyAnnotation: (deps?: Record<string, unknown>) => (action: unknown) => void;
  defaultVerifyApprover: (deps?: Record<string, unknown>) => (approver: unknown) => boolean;
  runAnnotateCli: (
    argv: string[],
    deps: Record<string, unknown>
  ) => { authorized: boolean; reason?: string; applied: boolean; dryRun: boolean; plannedCount: number; appliedCount: number; lines: string[] };
};
const {
  planAnnotate,
  runAnnotate,
  planMergeQueue,
  runMergeQueue,
  planCreateWork,
  runCreateWork,
  resolveBoardFieldEdit,
  defaultApplyFieldUpdate,
  ControlPlaneWriteError,
  PROJECT_ID,
  runBoardSyncCli,
  REPOSITORY,
  resolveAnnotateCommand,
  defaultApplyAnnotation,
  defaultVerifyApprover,
  runAnnotateCli
} = write;
const {
  resolveMergeQueueArmCommand,
  defaultApplyMergeQueueAction,
  runMergeQueueCli
} = require('../../scripts/controlPlaneWrite.js') as {
  resolveMergeQueueArmCommand: (action: unknown) => string[];
  defaultApplyMergeQueueAction: (deps?: Record<string, unknown>) => (action: unknown) => void;
  runMergeQueueCli: (
    argv: string[],
    deps: Record<string, unknown>
  ) => { authorized: boolean; reason?: string; applied: boolean; dryRun: boolean; plannedCount: number; appliedCount: number; lines: string[] };
};
const {
  resolveCreateWorkCommand,
  defaultApplyCreateWork,
  runCreateWorkCli
} = require('../../scripts/controlPlaneWrite.js') as {
  resolveCreateWorkCommand: (item: unknown) => string[];
  defaultApplyCreateWork: (deps?: Record<string, unknown>) => (item: unknown) => void;
  runCreateWorkCli: (
    argv: string[],
    deps: Record<string, unknown>
  ) => { authorized: boolean; reason?: string; applied: boolean; dryRun: boolean; plannedCount: number; appliedCount: number; lines: string[] };
};

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

  it('the real committed config has all four tiers enabled', () => {
    const c = loadWriteConfig(require('node:path').resolve(__dirname, '..', '..'), {});
    // Maintainer-approved 2026-07-20: boardSync + annotate + mergeQueue + createWork all enabled.
    expect(c.enabled).toBe(true);
    expect(c.tiers.boardSync).toBe(true);
    expect(c.tiers.annotate).toBe(true);
    expect(c.tiers.mergeQueue).toBe(true);
    expect(c.tiers.createWork).toBe(true);
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

describe('controlPlaneWrite: planCreateWork (VHS-REQ-696.6)', () => {
  it('normalizes valid work items, defaults body/labels, de-duplicates by title, and drops malformed entries', () => {
    const planned = planCreateWork([
      { title: 'First', body: 'b', labels: ['a', '  ', 3] },
      { title: 'Second' }, // body/labels default
      { title: 'First', body: 'dup' }, // duplicate title -> dropped
      { title: '   ' }, // empty title -> dropped
      { body: 'no title' }, // missing title -> dropped
      null
    ]);
    expect(planned).toEqual([
      { title: 'First', body: 'b', labels: ['a'] },
      { title: 'Second', body: '', labels: [] }
    ]);
    expect(planCreateWork([])).toEqual([]);
    expect(planCreateWork(undefined)).toEqual([]);
  });
});

describe('controlPlaneWrite: runCreateWork (VHS-REQ-696.6)', () => {
  const CW_CONFIG = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, createWork: true } };
  const cwAction = { title: 'New tracked work' };

  it('does NOTHING when the write path is disabled', () => {
    const calls: unknown[] = [];
    const out = runCreateWork(
      { actions: [cwAction], approver: 'svelderrainruiz', approverVerified: true },
      { config: DISABLED_CONFIG, applyCreateWork: (a: unknown) => calls.push(a), appendLog: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'write-path-disabled', appliedCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it('refuses when the createWork tier is disabled even if the path is enabled', () => {
    const out = runCreateWork(
      { actions: [cwAction], approver: 'svelderrainruiz', approverVerified: true },
      { config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, createWork: false } }, applyCreateWork: () => {} }
    );
    expect(out).toMatchObject({ executed: false, reason: 'tier-disabled:createWork' });
  });

  it('refuses without a server-verified allowlisted approver', () => {
    const unverified = runCreateWork(
      { actions: [cwAction], approver: 'svelderrainruiz', approverVerified: false },
      { config: CW_CONFIG, applyCreateWork: () => {} }
    );
    expect(unverified).toMatchObject({ executed: false, reason: 'approver-not-server-verified' });
    const stranger = runCreateWork(
      { actions: [cwAction], approver: 'someone-else', approverVerified: true },
      { config: CW_CONFIG, applyCreateWork: () => {} }
    );
    expect(stranger).toMatchObject({ executed: false, reason: 'approver-not-authorized' });
  });

  it('refuses to execute without an injected creator even when authorized', () => {
    const out = runCreateWork(
      { actions: [cwAction], approver: 'svelderrainruiz', approverVerified: true },
      { config: CW_CONFIG }
    );
    expect(out).toMatchObject({ executed: false, reason: 'no-executor' });
  });

  it('creates and append-logs each work item when the gate authorizes', () => {
    const applied: unknown[] = [];
    const logged: Array<Record<string, unknown>> = [];
    const out = runCreateWork(
      {
        actions: [cwAction, { title: 'Second item', labels: ['infra'] }],
        approver: 'svelderrainruiz',
        approverVerified: true
      },
      {
        config: CW_CONFIG,
        applyCreateWork: (a: unknown) => applied.push(a),
        appendLog: (e: Record<string, unknown>) => logged.push(e),
        now: () => new Date('2026-07-20T00:00:00.000Z')
      }
    );
    expect(out).toMatchObject({ executed: true, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ action: 'create-work', tier: 'createWork', title: 'New tracked work', approver: 'svelderrainruiz' });
  });
});

describe('controlPlaneWrite: resolveBoardFieldEdit (VHS-REQ-696.3)', () => {
  it('resolves the Tier-1 fields into a gh project item-edit argv', () => {
    expect(resolveBoardFieldEdit({ itemId: 'PVTI_x', field: 'Status', value: 'Done' })).toEqual([
      'project',
      'item-edit',
      '--id',
      'PVTI_x',
      '--project-id',
      PROJECT_ID,
      '--field-id',
      'PVTSSF_lADODQiayc4Bd5RqzhYXb_U',
      '--single-select-option-id',
      '98236657'
    ]);
    expect(resolveBoardFieldEdit({ itemId: 'PVTI_x', field: 'Evidence State', value: 'Proven' })).toContain('0c635d9f');
  });

  it('fails closed (throws) on a missing itemId or an unknown field/value', () => {
    expect(() => resolveBoardFieldEdit({ field: 'Status', value: 'Done' })).toThrow(ControlPlaneWriteError);
    expect(() => resolveBoardFieldEdit({ itemId: 'X', field: 'Program', value: 'Done' })).toThrow(/unknown board field/);
    expect(() => resolveBoardFieldEdit({ itemId: 'X', field: 'Status', value: 'Todo' })).toThrow(/unknown value/);
  });
});

describe('controlPlaneWrite: defaultApplyFieldUpdate (VHS-REQ-696.3)', () => {
  it('invokes gh project item-edit for a resolved update', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const applier = defaultApplyFieldUpdate({
      spawnSync: (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    applier({ itemId: 'PVTI_x', field: 'Status', value: 'Done' });
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('gh');
    expect(calls[0].args).toContain('item-edit');
  });

  it('fails closed (throws) when gh errors or exits nonzero', () => {
    const spawnErr = defaultApplyFieldUpdate({ spawnSync: () => ({ error: new Error('gh missing') }) });
    expect(() => spawnErr({ itemId: 'X', field: 'Status', value: 'Done' })).toThrow(/gh invocation failed/);
    const spawnNonZero = defaultApplyFieldUpdate({ spawnSync: () => ({ status: 1, stderr: 'no project scope' }) });
    expect(() => spawnNonZero({ itemId: 'X', field: 'Status', value: 'Done' })).toThrow(/gh exited 1: no project scope/);
  });
});

describe('controlPlaneWrite: runBoardSyncCli (VHS-REQ-696.7)', () => {
  const items = [{ itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready', linkedPrMerged: true }];
  const plan = () => ({ items, updates: planBoardSync(items) });

  it('reports refusal and applies nothing when the write path is disabled', () => {
    const applied: unknown[] = [];
    const out = runBoardSyncCli([], {
      config: DISABLED_CONFIG,
      collectBoardSyncPlan: plan,
      applyFieldUpdate: (u: unknown) => applied.push(u)
    });
    expect(out).toMatchObject({ authorized: false, reason: 'write-path-disabled', applied: false, appliedCount: 0 });
    expect(applied).toHaveLength(0);
    expect(out.lines.join('\n')).toContain('refused (write-path-disabled)');
  });

  it('is a dry run without --apply: reports drift but writes nothing when authorized', () => {
    const applied: unknown[] = [];
    const out = runBoardSyncCli([], {
      config: ENABLED_CONFIG,
      collectBoardSyncPlan: plan,
      applyFieldUpdate: (u: unknown) => applied.push(u)
    });
    expect(out).toMatchObject({ authorized: true, applied: false, dryRun: true, plannedCount: 2, appliedCount: 0 });
    expect(applied).toHaveLength(0);
    expect(out.lines.join('\n')).toContain('Dry run');
  });

  it('applies the live plan through the executor with --apply when authorized', () => {
    const applied: unknown[] = [];
    const logged: unknown[] = [];
    const out = runBoardSyncCli(['--apply'], {
      config: ENABLED_CONFIG,
      collectBoardSyncPlan: plan,
      applyFieldUpdate: (u: unknown) => applied.push(u),
      appendLog: (e: unknown) => logged.push(e),
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(out).toMatchObject({ authorized: true, applied: true, dryRun: false, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(out.lines.join('\n')).toContain('applied 2 of 2');
  });

  it('does not even read the live board plan when the gate refuses', () => {
    let collected = 0;
    const out = runBoardSyncCli(['--apply'], {
      config: DISABLED_CONFIG,
      collectBoardSyncPlan: () => {
        collected += 1;
        return plan();
      },
      applyFieldUpdate: () => {}
    });
    expect(collected).toBe(0);
    expect(out.applied).toBe(false);
  });
});

describe('controlPlaneWrite: resolveAnnotateCommand (VHS-REQ-696.8)', () => {
  it('resolves comment/label actions into gh argv for issue and pull request', () => {
    expect(resolveAnnotateCommand({ kind: 'comment', target: 'issue', number: 7, body: 'hello' })).toEqual([
      'issue',
      'comment',
      '7',
      '--repo',
      REPOSITORY,
      '--body',
      'hello'
    ]);
    expect(resolveAnnotateCommand({ kind: 'label', target: 'pr', number: 9, label: 'needs-review' })).toEqual([
      'pr',
      'edit',
      '9',
      '--repo',
      REPOSITORY,
      '--add-label',
      'needs-review'
    ]);
  });

  it('fails closed (throws) on bad target/kind/number or empty body/label', () => {
    expect(() => resolveAnnotateCommand({ kind: 'comment', target: 'wiki', number: 1, body: 'x' })).toThrow(/unknown annotate target/);
    expect(() => resolveAnnotateCommand({ kind: 'react', target: 'issue', number: 1, body: 'x' })).toThrow(/unknown annotate kind/);
    expect(() => resolveAnnotateCommand({ kind: 'comment', target: 'issue', number: 0, body: 'x' })).toThrow(/positive integer/);
    expect(() => resolveAnnotateCommand({ kind: 'comment', target: 'issue', number: 1, body: '   ' })).toThrow(/non-empty body/);
    expect(() => resolveAnnotateCommand({ kind: 'label', target: 'pr', number: 1, label: '' })).toThrow(/non-empty label/);
  });
});

describe('controlPlaneWrite: defaultApplyAnnotation (VHS-REQ-696.8)', () => {
  it('invokes gh with the resolved argv for a valid action', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const applier = defaultApplyAnnotation({
      spawnSync: (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    applier({ kind: 'comment', target: 'issue', number: 7, body: 'hi' });
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('gh');
    expect(calls[0].args).toContain('comment');
  });

  it('fails closed (throws) when gh errors or exits nonzero', () => {
    const errApplier = defaultApplyAnnotation({ spawnSync: () => ({ error: new Error('gh missing') }) });
    expect(() => errApplier({ kind: 'comment', target: 'issue', number: 1, body: 'x' })).toThrow(/gh invocation failed/);
    const nonZero = defaultApplyAnnotation({ spawnSync: () => ({ status: 1, stderr: 'no perms' }) });
    expect(() => nonZero({ kind: 'comment', target: 'issue', number: 1, body: 'x' })).toThrow(/gh exited 1: no perms/);
  });
});

describe('controlPlaneWrite: defaultVerifyApprover (VHS-REQ-696.8)', () => {
  it('verifies only write-permission collaborators', () => {
    for (const permission of ['admin', 'write', 'maintain']) {
      const verify = defaultVerifyApprover({ spawnSync: () => ({ status: 0, stdout: `${permission}\n` }) });
      expect(verify('svelderrainruiz')).toBe(true);
    }
    const readOnly = defaultVerifyApprover({ spawnSync: () => ({ status: 0, stdout: 'read\n' }) });
    expect(readOnly('someone')).toBe(false);
  });

  it('fails closed (verifies nobody) on empty approver or gh error', () => {
    const verify = defaultVerifyApprover({ spawnSync: () => ({ status: 0, stdout: 'admin' }) });
    expect(verify('')).toBe(false);
    expect(verify(undefined)).toBe(false);
    const ghError = defaultVerifyApprover({ spawnSync: () => ({ error: new Error('boom') }) });
    expect(ghError('svelderrainruiz')).toBe(false);
    const nonZero = defaultVerifyApprover({ spawnSync: () => ({ status: 1, stderr: 'not found' }) });
    expect(nonZero('svelderrainruiz')).toBe(false);
  });
});

describe('controlPlaneWrite: runAnnotateCli (VHS-REQ-696.8)', () => {
  const ANNOTATE_ENABLED = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } };
  const actions = [{ kind: 'comment', target: 'issue', number: 7, body: 'hi' }];
  const alwaysVerified = () => true;

  it('refuses (and never verifies an approver) when the write path is disabled', () => {
    let verifyCalls = 0;
    const out = runAnnotateCli(['--approver', 'svelderrainruiz'], {
      config: DISABLED_CONFIG,
      actions,
      verifyApprover: () => {
        verifyCalls += 1;
        return true;
      },
      applyAnnotation: () => {}
    });
    expect(out).toMatchObject({ authorized: false, reason: 'write-path-disabled', applied: false });
    expect(verifyCalls).toBe(0);
  });

  it('refuses when the annotate tier is off, without verifying', () => {
    let verifyCalls = 0;
    const out = runAnnotateCli(['--approver', 'svelderrainruiz'], {
      config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: false } },
      actions,
      verifyApprover: () => {
        verifyCalls += 1;
        return true;
      },
      applyAnnotation: () => {}
    });
    expect(out).toMatchObject({ authorized: false, reason: 'tier-disabled:annotate' });
    expect(verifyCalls).toBe(0);
  });

  it('refuses an unverified or non-allowlisted approver', () => {
    const unverified = runAnnotateCli(['--approver', 'svelderrainruiz'], {
      config: ANNOTATE_ENABLED,
      actions,
      verifyApprover: () => false,
      applyAnnotation: () => {}
    });
    expect(unverified).toMatchObject({ authorized: false, reason: 'approver-not-server-verified' });
    const stranger = runAnnotateCli(['--approver', 'someone-else'], {
      config: ANNOTATE_ENABLED,
      actions,
      verifyApprover: alwaysVerified,
      applyAnnotation: () => {}
    });
    expect(stranger).toMatchObject({ authorized: false, reason: 'approver-not-authorized' });
  });

  it('dry-runs by default: reports well-formed action count and writes nothing', () => {
    const applied: unknown[] = [];
    const out = runAnnotateCli(['--approver', 'svelderrainruiz'], {
      config: ANNOTATE_ENABLED,
      actions,
      verifyApprover: alwaysVerified,
      applyAnnotation: (a: unknown) => applied.push(a)
    });
    expect(out).toMatchObject({ authorized: true, applied: false, dryRun: true, plannedCount: 1, appliedCount: 0 });
    expect(applied).toHaveLength(0);
    expect(out.lines.join('\n')).toContain('Dry run');
  });

  it('applies and append-logs each action with --apply when fully authorized', () => {
    const applied: unknown[] = [];
    const logged: unknown[] = [];
    const out = runAnnotateCli(['--approver', 'svelderrainruiz', '--apply'], {
      config: ANNOTATE_ENABLED,
      actions: [...actions, { kind: 'label', target: 'pr', number: 9, label: 'ready' }],
      verifyApprover: alwaysVerified,
      applyAnnotation: (a: unknown) => applied.push(a),
      appendLog: (e: unknown) => logged.push(e),
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(out).toMatchObject({ authorized: true, applied: true, dryRun: false, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(out.lines.join('\n')).toContain('applied 2 of 2');
  });

  it('loads inline --actions JSON and fails closed on malformed input', () => {
    const out = runAnnotateCli(['--approver', 'svelderrainruiz', '--actions', JSON.stringify(actions)], {
      config: ANNOTATE_ENABLED,
      verifyApprover: alwaysVerified,
      applyAnnotation: () => {}
    });
    expect(out).toMatchObject({ authorized: true, dryRun: true, plannedCount: 1 });
    expect(() =>
      runAnnotateCli(['--approver', 'svelderrainruiz', '--actions', '{not json'], {
        config: ANNOTATE_ENABLED,
        verifyApprover: alwaysVerified
      })
    ).toThrow(ControlPlaneWriteError);
  });
});

describe('controlPlaneWrite: resolveMergeQueueArmCommand (VHS-REQ-696.9)', () => {
  it('resolves an arm action into gh pr merge --auto --rebase argv', () => {
    expect(resolveMergeQueueArmCommand({ op: 'arm', number: 42 })).toEqual([
      'pr',
      'merge',
      '42',
      '--repo',
      REPOSITORY,
      '--auto',
      '--rebase'
    ]);
  });

  it('fails closed (throws) on a bad number or a non-arm op', () => {
    expect(() => resolveMergeQueueArmCommand({ op: 'arm', number: 0 })).toThrow(/positive integer/);
    expect(() => resolveMergeQueueArmCommand({ op: 'dequeue', number: 1 })).toThrow(/only resolves 'arm'/);
    expect(() => resolveMergeQueueArmCommand(null)).toThrow(/must be an object/);
  });
});

describe('controlPlaneWrite: defaultApplyMergeQueueAction (VHS-REQ-696.9)', () => {
  it('arms auto-merge with a single gh pr merge call', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const applier = defaultApplyMergeQueueAction({
      spawnSync: (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    applier({ op: 'arm', number: 42 });
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(expect.arrayContaining(['pr', 'merge', '42', '--auto', '--rebase']));
  });

  it('dequeues via node-id resolution then the dequeuePullRequest mutation', () => {
    const calls: string[][] = [];
    const applier = defaultApplyMergeQueueAction({
      spawnSync: (_cmd: string, args: string[]) => {
        calls.push(args);
        // First call resolves the node id; second runs the mutation.
        if (args.some((a) => a.includes('pullRequest(number:'))) {
          return { status: 0, stdout: 'PR_nodeid_123\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    applier({ op: 'dequeue', number: 7 });
    expect(calls).toHaveLength(2);
    expect(calls[0].join(' ')).toContain('pullRequest(number:7)');
    expect(calls[1].join(' ')).toContain('dequeuePullRequest(input:{id:"PR_nodeid_123"})');
  });

  it('fails closed (throws) when gh errors, exits nonzero, or the node id is empty', () => {
    const ghError = defaultApplyMergeQueueAction({ spawnSync: () => ({ error: new Error('gh missing') }) });
    expect(() => ghError({ op: 'arm', number: 1 })).toThrow(/gh invocation failed/);
    const nonZero = defaultApplyMergeQueueAction({ spawnSync: () => ({ status: 1, stderr: 'no perms' }) });
    expect(() => nonZero({ op: 'arm', number: 1 })).toThrow(/gh exited 1: no perms/);
    const emptyId = defaultApplyMergeQueueAction({ spawnSync: () => ({ status: 0, stdout: '   \n' }) });
    expect(() => emptyId({ op: 'dequeue', number: 9 })).toThrow(/could not resolve PR node id/);
  });
});

describe('controlPlaneWrite: runMergeQueueCli (VHS-REQ-696.9)', () => {
  const MQ_ENABLED = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, mergeQueue: true } };
  const actions = [{ op: 'arm', number: 42 }];
  const alwaysVerified = () => true;

  it('refuses (and never verifies) when the write path is disabled', () => {
    let verifyCalls = 0;
    const out = runMergeQueueCli(['--approver', 'svelderrainruiz'], {
      config: DISABLED_CONFIG,
      actions,
      verifyApprover: () => {
        verifyCalls += 1;
        return true;
      },
      applyMergeQueueAction: () => {}
    });
    expect(out).toMatchObject({ authorized: false, reason: 'write-path-disabled', applied: false });
    expect(verifyCalls).toBe(0);
  });

  it('refuses when the mergeQueue tier is off, without verifying', () => {
    let verifyCalls = 0;
    const out = runMergeQueueCli(['--approver', 'svelderrainruiz'], {
      config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, mergeQueue: false } },
      actions,
      verifyApprover: () => {
        verifyCalls += 1;
        return true;
      },
      applyMergeQueueAction: () => {}
    });
    expect(out).toMatchObject({ authorized: false, reason: 'tier-disabled:mergeQueue' });
    expect(verifyCalls).toBe(0);
  });

  it('refuses an unverified or non-allowlisted approver', () => {
    const unverified = runMergeQueueCli(['--approver', 'svelderrainruiz'], {
      config: MQ_ENABLED,
      actions,
      verifyApprover: () => false,
      applyMergeQueueAction: () => {}
    });
    expect(unverified).toMatchObject({ authorized: false, reason: 'approver-not-server-verified' });
    const stranger = runMergeQueueCli(['--approver', 'someone-else'], {
      config: MQ_ENABLED,
      actions,
      verifyApprover: alwaysVerified,
      applyMergeQueueAction: () => {}
    });
    expect(stranger).toMatchObject({ authorized: false, reason: 'approver-not-authorized' });
  });

  it('dry-runs by default: reports well-formed action count and writes nothing', () => {
    const applied: unknown[] = [];
    const out = runMergeQueueCli(['--approver', 'svelderrainruiz'], {
      config: MQ_ENABLED,
      actions,
      verifyApprover: alwaysVerified,
      applyMergeQueueAction: (a: unknown) => applied.push(a)
    });
    expect(out).toMatchObject({ authorized: true, applied: false, dryRun: true, plannedCount: 1, appliedCount: 0 });
    expect(applied).toHaveLength(0);
    expect(out.lines.join('\n')).toContain('Dry run');
  });

  it('applies and append-logs each action with --apply when fully authorized', () => {
    const applied: unknown[] = [];
    const logged: unknown[] = [];
    const out = runMergeQueueCli(['--approver', 'svelderrainruiz', '--apply'], {
      config: MQ_ENABLED,
      actions: [...actions, { op: 'dequeue', number: 7 }],
      verifyApprover: alwaysVerified,
      applyMergeQueueAction: (a: unknown) => applied.push(a),
      appendLog: (e: unknown) => logged.push(e),
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(out).toMatchObject({ authorized: true, applied: true, dryRun: false, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(out.lines.join('\n')).toContain('applied 2 of 2');
  });
});

describe('controlPlaneWrite: resolveCreateWorkCommand (VHS-REQ-696.10)', () => {
  it('resolves a work item into gh issue create argv with repeated --label flags', () => {
    expect(resolveCreateWorkCommand({ title: 'New work', body: 'details', labels: ['infra', 'copilot-target'] })).toEqual([
      'issue',
      'create',
      '--repo',
      REPOSITORY,
      '--title',
      'New work',
      '--body',
      'details',
      '--label',
      'infra',
      '--label',
      'copilot-target'
    ]);
  });

  it('defaults body to empty and drops blank labels', () => {
    expect(resolveCreateWorkCommand({ title: 'Bare' })).toEqual(['issue', 'create', '--repo', REPOSITORY, '--title', 'Bare', '--body', '']);
    expect(resolveCreateWorkCommand({ title: 'Filtered', labels: ['ok', '  ', 3] })).toEqual([
      'issue',
      'create',
      '--repo',
      REPOSITORY,
      '--title',
      'Filtered',
      '--body',
      '',
      '--label',
      'ok'
    ]);
  });

  it('fails closed (throws) on a missing/empty title or non-object', () => {
    expect(() => resolveCreateWorkCommand({ body: 'no title' })).toThrow(/non-empty title/);
    expect(() => resolveCreateWorkCommand({ title: '   ' })).toThrow(/non-empty title/);
    expect(() => resolveCreateWorkCommand(null)).toThrow(/must be an object/);
  });
});

describe('controlPlaneWrite: defaultApplyCreateWork (VHS-REQ-696.10)', () => {
  it('invokes gh issue create for a valid item', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const applier = defaultApplyCreateWork({
      spawnSync: (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    applier({ title: 'New work', body: 'b', labels: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('gh');
    expect(calls[0].args).toEqual(expect.arrayContaining(['issue', 'create', '--title', 'New work']));
  });

  it('fails closed (throws) when gh errors or exits nonzero', () => {
    const ghError = defaultApplyCreateWork({ spawnSync: () => ({ error: new Error('gh missing') }) });
    expect(() => ghError({ title: 'x' })).toThrow(/gh invocation failed/);
    const nonZero = defaultApplyCreateWork({ spawnSync: () => ({ status: 1, stderr: 'no perms' }) });
    expect(() => nonZero({ title: 'x' })).toThrow(/gh exited 1: no perms/);
  });
});

describe('controlPlaneWrite: runCreateWorkCli (VHS-REQ-696.10)', () => {
  const CW_ENABLED = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, createWork: true } };
  const actions = [{ title: 'New tracked work' }];
  const alwaysVerified = () => true;

  it('refuses (and never verifies) when the write path is disabled', () => {
    let verifyCalls = 0;
    const out = runCreateWorkCli(['--approver', 'svelderrainruiz'], {
      config: DISABLED_CONFIG,
      actions,
      verifyApprover: () => {
        verifyCalls += 1;
        return true;
      },
      applyCreateWork: () => {}
    });
    expect(out).toMatchObject({ authorized: false, reason: 'write-path-disabled', applied: false });
    expect(verifyCalls).toBe(0);
  });

  it('refuses when the createWork tier is off, without verifying', () => {
    let verifyCalls = 0;
    const out = runCreateWorkCli(['--approver', 'svelderrainruiz'], {
      config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, createWork: false } },
      actions,
      verifyApprover: () => {
        verifyCalls += 1;
        return true;
      },
      applyCreateWork: () => {}
    });
    expect(out).toMatchObject({ authorized: false, reason: 'tier-disabled:createWork' });
    expect(verifyCalls).toBe(0);
  });

  it('refuses an unverified or non-allowlisted approver', () => {
    const unverified = runCreateWorkCli(['--approver', 'svelderrainruiz'], {
      config: CW_ENABLED,
      actions,
      verifyApprover: () => false,
      applyCreateWork: () => {}
    });
    expect(unverified).toMatchObject({ authorized: false, reason: 'approver-not-server-verified' });
    const stranger = runCreateWorkCli(['--approver', 'someone-else'], {
      config: CW_ENABLED,
      actions,
      verifyApprover: alwaysVerified,
      applyCreateWork: () => {}
    });
    expect(stranger).toMatchObject({ authorized: false, reason: 'approver-not-authorized' });
  });

  it('dry-runs by default: reports well-formed item count and writes nothing', () => {
    const applied: unknown[] = [];
    const out = runCreateWorkCli(['--approver', 'svelderrainruiz'], {
      config: CW_ENABLED,
      actions,
      verifyApprover: alwaysVerified,
      applyCreateWork: (a: unknown) => applied.push(a)
    });
    expect(out).toMatchObject({ authorized: true, applied: false, dryRun: true, plannedCount: 1, appliedCount: 0 });
    expect(applied).toHaveLength(0);
    expect(out.lines.join('\n')).toContain('Dry run');
  });

  it('creates and append-logs each item with --apply when fully authorized', () => {
    const applied: unknown[] = [];
    const logged: unknown[] = [];
    const out = runCreateWorkCli(['--approver', 'svelderrainruiz', '--apply'], {
      config: CW_ENABLED,
      actions: [...actions, { title: 'Second item', labels: ['infra'] }],
      verifyApprover: alwaysVerified,
      applyCreateWork: (a: unknown) => applied.push(a),
      appendLog: (e: unknown) => logged.push(e),
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(out).toMatchObject({ authorized: true, applied: true, dryRun: false, plannedCount: 2, appliedCount: 2 });
    expect(applied).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(out.lines.join('\n')).toContain('created 2 of 2');
  });
});

describe('controlPlaneWrite: default-collaborator and fallback branches (VHS-REQ-696)', () => {
  it('normalizes a falsy repoRoot and non-array approvers / non-object tiers', () => {
    // Exercises `repoRoot || process.cwd()`, the `Array.isArray(approvers)`
    // fallback, and the `tiers && typeof tiers === 'object'` fallback.
    const config = loadWriteConfig('', fakeRead(JSON.stringify({ enabled: true, approvers: 'nope', tiers: 5 })));
    expect(config).toMatchObject({ enabled: true, approvers: [], tiers: {} });
  });

  it('returns closures from the default gh executor factories called with no deps', () => {
    // Exercises the `deps = {}` default argument of each live-executor factory
    // without invoking the returned closure (so no real gh is spawned).
    expect(typeof defaultApplyFieldUpdate()).toBe('function');
    expect(typeof defaultApplyAnnotation()).toBe('function');
    expect(typeof defaultVerifyApprover()).toBe('function');
    expect(typeof defaultApplyMergeQueueAction()).toBe('function');
    expect(typeof defaultApplyCreateWork()).toBe('function');
  });

  it('plans nothing for a non-array input and skips items without a string itemId', () => {
    // Exercises the `Array.isArray(items) ? items : []` fallback and the
    // per-item `!item || typeof item.itemId !== 'string'` skip guard.
    expect(planBoardSync('not-an-array' as unknown)).toEqual([]);
    expect(
      planBoardSync([
        {},
        { itemId: 'A', number: 3, linkedPrMerged: true, status: 'Todo', evidence: 'None' }
      ])
    ).toEqual([
      { itemId: 'A', number: 3, field: 'Status', value: 'Done', reason: 'linked-pr-merged' },
      { itemId: 'A', number: 3, field: 'Evidence State', value: 'Proven', reason: 'linked-pr-merged' }
    ]);
  });

  it('loads config through the default loader in each run* function when none is injected', () => {
    // Exercises the `deps.config || loadWriteConfig(repoRoot, deps)` fallback in
    // each run* function; a disabled config keeps them fail-closed (no gh).
    const disabled = fakeRead(JSON.stringify({ enabled: false }));
    expect(runBoardSync({ items: [] }, disabled)).toMatchObject({ executed: false, reason: 'write-path-disabled' });
    expect(runAnnotate({ actions: [] }, disabled)).toMatchObject({ executed: false, reason: 'write-path-disabled' });
    expect(runMergeQueue({ actions: [] }, disabled)).toMatchObject({ executed: false, reason: 'write-path-disabled' });
    expect(runCreateWork({ actions: [] }, disabled)).toMatchObject({ executed: false, reason: 'write-path-disabled' });
  });

  it('loads config through the default loader in each *Cli runner when none is injected', () => {
    // Exercises the `deps.loadWriteConfig || loadWriteConfig` and
    // `deps.config || loadConfig(...)` fallbacks in each CLI runner; a disabled
    // config refuses at the enablement precheck before any live boundary.
    const disabled = fakeRead(JSON.stringify({ enabled: false }));
    expect(runBoardSyncCli([], disabled)).toMatchObject({ authorized: false, reason: 'write-path-disabled' });
    expect(runAnnotateCli([], disabled)).toMatchObject({ authorized: false, reason: 'write-path-disabled' });
    expect(runMergeQueueCli([], disabled)).toMatchObject({ authorized: false, reason: 'write-path-disabled' });
    expect(runCreateWorkCli([], disabled)).toMatchObject({ authorized: false, reason: 'write-path-disabled' });
  });
});

const cpw = require('../../scripts/controlPlaneWrite.js') as Record<string, any>;

describe('controlPlaneWrite: resolver + loader + default-boundary coverage (#2333)', () => {
  it('rejects non-object actions/items in every resolver', () => {
    expect(() => cpw.resolveAnnotateCommand(null)).toThrow(/annotate action must be an object/);
    expect(() => cpw.resolveAnnotateCommand(42)).toThrow(/annotate action must be an object/);
    expect(() => cpw.resolveMergeQueueArmCommand(null)).toThrow(/merge-queue action must be an object/);
    expect(() => cpw.resolveCreateWorkCommand(null)).toThrow(/create-work item must be an object/);
  });

  it('rejects a merge-queue arm command with a bad number or non-arm op', () => {
    expect(() => cpw.resolveMergeQueueArmCommand({ op: 'arm', number: 0 })).toThrow(/positive integer number/);
    expect(() => cpw.resolveMergeQueueArmCommand({ op: 'dequeue', number: 1 })).toThrow(/only resolves 'arm'/);
  });

  it('defaults body and filters labels in a create-work command; rejects empty titles', () => {
    expect(() => cpw.resolveCreateWorkCommand({ title: '   ' })).toThrow(/non-empty title/);
    const args = cpw.resolveCreateWorkCommand({ title: 'New work', body: 123, labels: ['keep', '   ', 7] }) as string[];
    // Non-string body -> empty string; non-string/blank labels filtered out.
    expect(args).toContain('--body');
    expect(args[args.indexOf('--body') + 1]).toBe('');
    expect(args.filter((a) => a === '--label')).toHaveLength(1);
    expect(args).toContain('keep');
  });

  it('loads annotate actions from inline JSON, a file, and rejects malformed input', () => {
    expect(cpw.loadAnnotateActions([])).toEqual([]);
    expect(cpw.loadAnnotateActions(['--actions', '[{"kind":"comment","target":"issue","number":1,"body":"hi"}]'])).toEqual([
      { kind: 'comment', target: 'issue', number: 1, body: 'hi' }
    ]);
    const fromFile = cpw.loadAnnotateActions(['--actions-file', '/tmp/actions.json'], {
      readFileSync: () => '[{"kind":"label","target":"pr","number":2,"label":"ready"}]'
    });
    expect(fromFile).toEqual([{ kind: 'label', target: 'pr', number: 2, label: 'ready' }]);
    expect(() => cpw.loadAnnotateActions(['--actions'])).toThrow(/--actions requires a JSON array value/);
    expect(() => cpw.loadAnnotateActions(['--actions-file'])).toThrow(/--actions-file requires a path value/);
    expect(() => cpw.loadAnnotateActions(['--actions', 'not-json'])).toThrow(/must be valid JSON/);
    expect(() => cpw.loadAnnotateActions(['--actions', '{"a":1}'])).toThrow(/must be a JSON array/);
  });

  it('uses the default append-log boundary (repoRoot) with a system clock', () => {
    const appended: string[] = [];
    const out = cpw.runBoardSync(
      { items: [{ itemId: 'PVT_x', number: 5, linkedPrMerged: true, status: 'Todo', evidence: 'None' }] },
      {
        config: { enabled: true, approvers: [], tiers: { boardSync: true } },
        repoRoot: '/repo',
        applyFieldUpdate: () => undefined,
        // No appendLog injected -> defaultAppendLog(repoRoot) is built and used;
        // appendFileSync is injected so no real file is written. No `now` -> the
        // system clock (new Date()) path is taken.
        appendFileSync: (_p: string, line: string) => appended.push(line)
      }
    );
    expect(out).toMatchObject({ executed: true, plannedCount: 2, appliedCount: 2 });
    expect(appended).toHaveLength(2);
    expect(JSON.parse(appended[0]).timestamp).toEqual(expect.any(String));
  });

  it('falls back to process.cwd() for the append-log path when no repoRoot is injected', () => {
    const appended: string[] = [];
    const out = cpw.runBoardSync(
      { items: [{ itemId: 'PVT_y', number: 6, linkedPrMerged: true, status: 'Todo', evidence: 'None' }] },
      {
        config: { enabled: true, approvers: [], tiers: { boardSync: true } },
        applyFieldUpdate: () => undefined,
        appendFileSync: (_p: string, line: string) => appended.push(line)
      }
    );
    expect(out).toMatchObject({ executed: true, appliedCount: 2 });
    expect(appended).toHaveLength(2);
  });

  it('reads the board-sync plan through an injected collector and applies with --apply', () => {
    const applied: unknown[] = [];
    const out = cpw.runBoardSyncCli(['--apply'], {
      config: { enabled: true, approvers: [], tiers: { boardSync: true } },
      repoRoot: '/repo',
      collectBoardSyncPlan: () => ({
        items: [{ itemId: 'PVT_z', number: 9, linkedPrMerged: true, status: 'Todo', evidence: 'None' }],
        updates: []
      }),
      applyFieldUpdate: (u: unknown) => applied.push(u),
      appendLog: () => undefined,
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(out).toMatchObject({ authorized: true, applied: true, dryRun: false, appliedCount: 2 });
    expect(applied).toHaveLength(2);
  });

  it('routes every subcommand through the exported CLI dispatch', () => {
    const disabled = { config: { enabled: false, approvers: [], tiers: {} }, repoRoot: '/repo' };
    // A disabled gate refuses each tier before any gh call, so the dispatch is
    // exercised end-to-end without a live GitHub boundary.
    expect(cpw.dispatchControlPlaneWriteCli(['annotate'], disabled)).toMatchObject({ authorized: false });
    expect(cpw.dispatchControlPlaneWriteCli(['merge-queue'], disabled)).toMatchObject({ authorized: false });
    expect(cpw.dispatchControlPlaneWriteCli(['create-work'], disabled)).toMatchObject({ authorized: false });
    // No subcommand -> the Tier 1 board-sync CLI.
    expect(cpw.dispatchControlPlaneWriteCli([], disabled)).toMatchObject({ authorized: false, reason: 'write-path-disabled' });
  });

  it('runs the authorized annotate tier with no proposed actions', () => {
    // Authorized boardSync-style annotate path with an empty action list exercises
    // the `options.actions || []` planner fallback without any executor call.
    const out = cpw.runAnnotate(
      { approver: 'svelderrainruiz', approverVerified: true },
      {
        config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } },
        applyAnnotation: () => undefined,
        appendLog: () => undefined
      }
    );
    expect(out).toMatchObject({ executed: true, plannedCount: 0, appliedCount: 0 });
  });

  it('applies each tier through its default append-log boundary with an injected clock', () => {
    const appended: string[] = [];
    const deps = {
      config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true, mergeQueue: true, createWork: true } },
      repoRoot: '/repo',
      appendFileSync: (_p: string, line: string) => appended.push(line),
      now: () => new Date('2026-07-20T00:00:00.000Z')
    };

    const board = cpw.runBoardSync(
      { items: [{ itemId: 'PVT_a', number: 1, linkedPrMerged: true, status: 'Todo', evidence: 'None' }] },
      { ...deps, applyFieldUpdate: () => undefined }
    );
    expect(board).toMatchObject({ executed: true, appliedCount: 2 });

    const mq = cpw.runMergeQueue(
      { actions: [{ op: 'arm', number: 5 }], approver: 'svelderrainruiz', approverVerified: true },
      { ...deps, applyMergeQueueAction: () => undefined }
    );
    expect(mq).toMatchObject({ executed: true, appliedCount: 1 });

    const cw = cpw.runCreateWork(
      { actions: [{ title: 'New' }], approver: 'svelderrainruiz', approverVerified: true },
      { ...deps, applyCreateWork: () => undefined }
    );
    expect(cw).toMatchObject({ executed: true, appliedCount: 1 });

    // Every applied action append-logged an entry stamped by the injected clock.
    expect(appended.length).toBeGreaterThanOrEqual(4);
    for (const line of appended) {
      expect(JSON.parse(line).timestamp).toBe('2026-07-20T00:00:00.000Z');
    }
  });

  it('applies board updates on the system clock when no clock is injected', () => {
    const appended: string[] = [];
    const board = cpw.runBoardSync(
      { items: [{ itemId: 'PVT_b', number: 2, linkedPrMerged: true, status: 'Todo', evidence: 'None' }] },
      {
        config: { enabled: true, approvers: [], tiers: { boardSync: true } },
        repoRoot: '/repo',
        applyFieldUpdate: () => undefined,
        appendFileSync: (_p: string, line: string) => appended.push(line)
      }
    );
    expect(board).toMatchObject({ executed: true, appliedCount: 2 });
    expect(typeof JSON.parse(appended[0]).timestamp).toBe('string');
  });

  it('stamps applied annotate/create-work actions with the injected clock', () => {
    const logged: Array<Record<string, unknown>> = [];
    const now = () => new Date('2026-07-20T00:00:00.000Z');
    const annotate = cpw.runAnnotate(
      { actions: [{ kind: 'comment', target: 'issue', number: 3, body: 'hi' }], approver: 'svelderrainruiz', approverVerified: true },
      {
        config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } },
        applyAnnotation: () => undefined,
        appendLog: (e: Record<string, unknown>) => logged.push(e),
        now
      }
    );
    expect(annotate).toMatchObject({ executed: true, appliedCount: 1 });

    const createWork = cpw.runCreateWork(
      { actions: [{ title: 'Task' }], approver: 'svelderrainruiz', approverVerified: true },
      {
        config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, createWork: true } },
        applyCreateWork: () => undefined,
        appendLog: (e: Record<string, unknown>) => logged.push(e),
        now
      }
    );
    expect(createWork).toMatchObject({ executed: true, appliedCount: 1 });
    expect(logged.map((e) => e.timestamp)).toEqual(['2026-07-20T00:00:00.000Z', '2026-07-20T00:00:00.000Z']);
  });

  it('reads the board-sync plan through an injected collector in dry-run mode', () => {
    const out = cpw.runBoardSyncCli([], {
      config: { enabled: true, approvers: [], tiers: { boardSync: true } },
      repoRoot: '/repo',
      collectBoardSyncPlan: () => ({ items: [], updates: [{ itemId: 'X', field: 'Status', value: 'Done', reason: 'r' }] })
    });
    expect(out).toMatchObject({ authorized: true, applied: false, dryRun: true });
    expect(out.lines.join('\n')).toContain('board update(s) mirror directly-verified truth');
  });
});

describe('controlPlaneWrite: reachable-branch + CLI-entry coverage (#2333 floor)', () => {
  const ANNOTATE_CONFIG = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } };
  const MQ_CONFIG = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, mergeQueue: true } };

  // A gh stand-in: approver permission reads resolve to `admin` (server-verified);
  // the Tier 3 node-id resolution returns a synthetic id; every other gh call
  // (annotate/merge-queue executor) succeeds. No real gh is ever spawned.
  function fakeGh(permission = 'admin') {
    return (_cmd: string, args: string[]) => {
      if (args[0] === 'api' && args.some((a) => String(a).includes('/permission'))) {
        return { status: 0, stdout: `${permission}\n`, stderr: '' };
      }
      if (args.includes('graphql') && args.some((a) => String(a).includes('pullRequest(number:'))) {
        return { status: 0, stdout: 'PR_nodeid_abc\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
  }

  it('defaultApplyMergeQueueAction fails closed on a dequeue action with a non-positive or non-integer number', () => {
    const applier = defaultApplyMergeQueueAction({ spawnSync: fakeGh() });
    // Trigger the dequeue number-guard body (throw) that the valid-number tests
    // never reach: the left operand (non-integer) and the right operand (<= 0).
    expect(() => applier({ op: 'dequeue', number: 1.5 })).toThrow(/positive integer number/);
    expect(() => applier({ op: 'dequeue', number: 0 })).toThrow(/positive integer number/);
    expect(() => applier({ op: 'dequeue', number: -3 })).toThrow(/positive integer number/);
  });

  it('runAnnotateCli builds the default verifier + applier from the injected gh boundary (no factory injected)', () => {
    const logged: unknown[] = [];
    const out = runAnnotateCli(
      [
        '--approver',
        'svelderrainruiz',
        '--apply',
        '--actions',
        JSON.stringify([{ kind: 'comment', target: 'issue', number: 1, body: 'hi' }])
      ],
      { config: ANNOTATE_CONFIG, spawnSync: fakeGh(), appendLog: (e: unknown) => logged.push(e) }
    );
    expect(out).toMatchObject({ authorized: true, applied: true, appliedCount: 1 });
    expect(logged).toHaveLength(1);
  });

  it('runAnnotateCli refuses when the default verifier resolves a non-privileged collaborator', () => {
    const out = runAnnotateCli(
      ['--approver', 'svelderrainruiz', '--actions', JSON.stringify([{ kind: 'comment', target: 'issue', number: 1, body: 'hi' }])],
      { config: ANNOTATE_CONFIG, spawnSync: fakeGh('read') }
    );
    expect(out).toMatchObject({ authorized: false, reason: 'approver-not-server-verified' });
  });

  it('runMergeQueueCli builds the default verifier + actor from the injected gh boundary (no factory injected)', () => {
    const logged: unknown[] = [];
    const out = runMergeQueueCli(
      [
        '--approver',
        'svelderrainruiz',
        '--apply',
        '--actions',
        JSON.stringify([{ op: 'arm', number: 5 }, { op: 'dequeue', number: 6 }])
      ],
      { config: MQ_CONFIG, spawnSync: fakeGh(), appendLog: (e: unknown) => logged.push(e) }
    );
    expect(out).toMatchObject({ authorized: true, applied: true, appliedCount: 2 });
    expect(logged).toHaveLength(2);
  });

  it('runBoardSyncCli reads the plan through the real board-sync module when no collector is injected', () => {
    const applied: unknown[] = [];
    const out = runBoardSyncCli(['--apply'], {
      config: { enabled: true, approvers: [], tiers: { boardSync: true } },
      // No collectBoardSyncPlan injected -> the real controlPlaneBoardSync module
      // runs with these injected readers (no live gh).
      readProjectItems: () => [{ itemId: 'PVT_real', number: 42, status: 'In Progress', evidence: 'Ready' }],
      readVerifiedClosures: () => new Map([[42, true]]),
      applyFieldUpdate: (u: unknown) => applied.push(u),
      appendLog: () => undefined,
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(out).toMatchObject({ authorized: true, applied: true });
    expect(applied.length).toBeGreaterThanOrEqual(2);
  });

  it('runControlPlaneWriteCli prints the dispatch outcome and returns 0 (injected + default IO)', () => {
    const stdout: string[] = [];
    const code = cpw.runControlPlaneWriteCli(
      [],
      { stdout: { write: (s: string) => stdout.push(s) } },
      { config: DISABLED_CONFIG }
    );
    expect(code).toBe(0);
    expect(stdout.join('')).toContain('refused (write-path-disabled)');
    // Default IO path (io.stdout falls back to process.stdout) — still returns 0.
    expect(cpw.runControlPlaneWriteCli([], undefined, { config: DISABLED_CONFIG })).toBe(0);
  });

  it('runControlPlaneWriteCli fails closed (returns 1, writes to stderr) when dispatch throws', () => {
    const stderr: string[] = [];
    const enabledAnnotate = {
      config: { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true, annotate: true } }
    };
    const code = cpw.runControlPlaneWriteCli(
      ['annotate', '--actions', '{not-json'],
      { stderr: { write: (s: string) => stderr.push(s) } },
      enabledAnnotate
    );
    expect(code).toBe(1);
    expect(stderr.join('')).toContain('[control-plane-write]');
    // Default IO error path (io.stderr falls back to process.stderr).
    expect(
      cpw.runControlPlaneWriteCli(['annotate', '--actions', '{bad'], undefined, enabledAnnotate)
    ).toBe(1);
  });
});
