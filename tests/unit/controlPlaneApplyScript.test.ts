import { describe, expect, it } from 'vitest';

// VHS-REQ-698 slice 2 (epic #2144): Tier-1 board apply. Deterministic unit tests
// of the pure field-target resolver, the gh executor's Tier-1 refusal, and the
// apply orchestration honoring the enable flag — all with injected boundaries and
// no real GitHub.

const {
  FIELD_MAP,
  resolveFieldTarget,
  createGhFieldUpdater,
  runControlPlaneApply
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
