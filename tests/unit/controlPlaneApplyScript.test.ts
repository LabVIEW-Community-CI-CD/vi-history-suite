import { describe, expect, it } from 'vitest';

// VHS-REQ-698 slice 2 (epic #2144): Tier-1 board apply. Deterministic unit tests
// of the pure field-target resolver, the gh executor's Tier-1 refusal, and the
// apply orchestration honoring the enable flag — all with injected boundaries and
// no real GitHub.

const {
  FIELD_MAP,
  resolveFieldTarget,
  createGhFieldUpdater,
  runControlPlaneApply,
  main
} = require('../../scripts/controlPlaneApply.js') as {
  FIELD_MAP: Record<string, { fieldId: string; optionId: string }>;
  resolveFieldTarget: (update: unknown) => { fieldId: string; optionId: string } | null;
  createGhFieldUpdater: (deps?: Record<string, unknown>) => (update: Record<string, unknown>) => void;
  runControlPlaneApply: (deps?: Record<string, unknown>) => {
    executed: boolean;
    reason?: string;
    plannedCount: number;
    appliedCount: number;
  };
  main: (deps?: Record<string, unknown>) => Record<string, unknown>;
};

const ENABLED = { enabled: true, approvers: ['svelderrainruiz'], tiers: { boardSync: true } };
const DISABLED = { enabled: false, approvers: [], tiers: { boardSync: true } };

const VERIFIED_ITEMS = [
  { itemId: 'A', number: 1, status: 'In Progress', evidence: 'Ready' },
  { itemId: 'B', number: 2, status: 'Done', evidence: 'Proven' }
];

describe('controlPlaneApply: resolveFieldTarget (VHS-REQ-698.3)', () => {
  it('resolves the two Tier-1 targets', () => {
    expect(resolveFieldTarget({ field: 'Status', value: 'Done' })).toEqual(FIELD_MAP['Status::Done']);
    expect(resolveFieldTarget({ field: 'Evidence State', value: 'Proven' })).toEqual(FIELD_MAP['Evidence State::Proven']);
  });

  it('returns null for any field/value Tier-1 may not set', () => {
    expect(resolveFieldTarget({ field: 'Status', value: 'Todo' })).toBeNull();
    expect(resolveFieldTarget({ field: 'Program', value: 'Anything' })).toBeNull();
    expect(resolveFieldTarget(null)).toBeNull();
  });
});

describe('controlPlaneApply: createGhFieldUpdater (VHS-REQ-698.3)', () => {
  it('invokes gh project item-edit with the mapped field/option ids', () => {
    const calls: string[][] = [];
    const updater = createGhFieldUpdater({ spawnSync: (_c: string, args: string[]) => (calls.push(args), { status: 0, stdout: '' }) });
    updater({ itemId: 'A', field: 'Status', value: 'Done' });
    const args = calls[0];
    expect(args).toContain('item-edit');
    expect(args).toContain('A');
    expect(args).toContain(FIELD_MAP['Status::Done'].fieldId);
    expect(args).toContain(FIELD_MAP['Status::Done'].optionId);
  });

  it('refuses to apply an unsupported update (Tier-1 boundary)', () => {
    const updater = createGhFieldUpdater({ spawnSync: () => ({ status: 0, stdout: '' }) });
    expect(() => updater({ itemId: 'A', field: 'Status', value: 'Todo' })).toThrow(/refusing to apply/);
  });
});

describe('controlPlaneApply: runControlPlaneApply (VHS-REQ-698.3)', () => {
  it('does nothing when the write path is disabled', () => {
    const applied: unknown[] = [];
    const result = runControlPlaneApply({
      config: DISABLED,
      readProjectItems: () => VERIFIED_ITEMS,
      readVerifiedClosures: () => ({ 1: true }),
      applyFieldUpdate: (u: unknown) => applied.push(u),
      appendLog: () => {}
    });
    expect(result).toMatchObject({ executed: false, reason: 'write-path-disabled', appliedCount: 0 });
    expect(applied).toHaveLength(0);
  });

  it('applies verified Done/Proven updates when enabled and logs them', () => {
    const applied: Array<Record<string, unknown>> = [];
    const logged: unknown[] = [];
    const result = runControlPlaneApply({
      config: ENABLED,
      readProjectItems: () => VERIFIED_ITEMS,
      // #1 is verified closed -> needs Status Done + Evidence Proven; #2 already ok.
      readVerifiedClosures: () => ({ 1: true, 2: true }),
      applyFieldUpdate: (u: Record<string, unknown>) => applied.push(u),
      appendLog: (e: unknown) => logged.push(e),
      now: () => new Date('2026-07-20T00:00:00.000Z')
    });
    expect(result).toMatchObject({ executed: true, plannedCount: 2, appliedCount: 2 });
    expect(applied.map((u) => `${u.field}=${u.value}`)).toEqual(['Status=Done', 'Evidence State=Proven']);
    expect(logged).toHaveLength(2);
  });

  it('does not infer state for unverified items', () => {
    const applied: unknown[] = [];
    const result = runControlPlaneApply({
      config: ENABLED,
      readProjectItems: () => VERIFIED_ITEMS,
      readVerifiedClosures: () => ({}),
      applyFieldUpdate: (u: unknown) => applied.push(u),
      appendLog: () => {}
    });
    expect(result).toMatchObject({ executed: true, plannedCount: 0, appliedCount: 0 });
    expect(applied).toHaveLength(0);
  });
});

describe('controlPlaneApply: createGhFieldUpdater gh boundary errors (VHS-REQ-698.3)', () => {
  // A supported Status=Done update passes the Tier-1 gate and reaches runGh, so an
  // injected spawnSync exercises each gh error branch without a real gh.
  const DONE = { itemId: 'A', field: 'Status', value: 'Done' };

  it('wraps a gh spawn error as a BoardSyncAuthError', () => {
    const updater = createGhFieldUpdater({ spawnSync: () => ({ error: new Error('spawn gh ENOENT') }) });
    expect(() => updater(DONE)).toThrow(/gh invocation failed: spawn gh ENOENT/);
  });

  it('wraps a nonzero gh exit (with stderr) as a BoardSyncAuthError', () => {
    const updater = createGhFieldUpdater({ spawnSync: () => ({ status: 1, stderr: 'HTTP 401: Bad credentials' }) });
    expect(() => updater(DONE)).toThrow(/gh exited 1: HTTP 401: Bad credentials/);
  });

  it('falls back to "unknown error" when a nonzero gh exit has no stderr', () => {
    const updater = createGhFieldUpdater({ spawnSync: () => ({ status: 2, stderr: '' }) });
    expect(() => updater(DONE)).toThrow(/gh exited 2: unknown error/);
  });
});

describe('controlPlaneApply: main CLI reporter (VHS-REQ-698.3)', () => {
  // Drive the extracted require.main reporter with an injected runner + streams +
  // exit so each reporting/exit branch is covered without a real gh.
  function harness(runnerDeps: Record<string, unknown>) {
    const out: string[] = [];
    const err: string[] = [];
    const exits: number[] = [];
    const result = main({
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: (text: string) => err.push(text) },
      exit: (code: number) => exits.push(code),
      ...runnerDeps
    });
    return { out: out.join(''), err: err.join(''), exits, result };
  }

  it('prints a no-writes line and exits 0 when nothing executed', () => {
    const { out, err, exits } = harness({
      runControlPlaneApply: () => ({ executed: false, reason: 'write-path-disabled', plannedCount: 0, appliedCount: 0 })
    });
    expect(out).toContain('[control-plane-apply] no writes (write-path-disabled). plannedCount=0');
    expect(err).toBe('');
    expect(exits).toEqual([0]);
  });

  it('prints an applied summary and exits 0 when writes executed', () => {
    const { out, exits } = harness({
      runControlPlaneApply: () => ({ executed: true, reason: undefined, plannedCount: 3, appliedCount: 2 })
    });
    expect(out).toContain('[control-plane-apply] applied 2 of 3 verified board update(s).');
    expect(exits).toEqual([0]);
  });

  it('prints the error on stderr and exits 1 when the runner throws', () => {
    const { err, exits, result } = harness({
      runControlPlaneApply: () => {
        throw new Error('gh exited 1: HTTP 403');
      }
    });
    expect(err).toContain('[control-plane-apply] gh exited 1: HTTP 403');
    expect(exits).toEqual([1]);
    expect((result as { error?: Error }).error).toBeInstanceOf(Error);
  });
});
