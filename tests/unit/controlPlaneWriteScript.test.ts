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
