import { describe, expect, it } from 'vitest';

// VHS-REQ-683 (dev-only sweep, epic #2159): dev-host & build tooling — build-info
// contract integrity. Deterministic unit tests of the pure validator, the
// generator-driven contract check (with an injected generator), and the renderer.

const {
  UNKNOWN_COMMIT,
  validateBuildInfoRecord,
  checkBuildInfoContract,
  renderBuildInfoIntegrity
} = require('../../scripts/checkBuildInfoIntegrity.js') as {
  UNKNOWN_COMMIT: string;
  validateBuildInfoRecord: (
    record: unknown,
    options?: { expectedVersion?: string }
  ) => { ok: boolean; problems: Array<{ reason: string; detail: string }> };
  checkBuildInfoContract: (deps?: Record<string, unknown>) => {
    buildInfo: unknown;
    result: { ok: boolean; problems: Array<{ reason: string; detail: string }> };
  };
  renderBuildInfoIntegrity: (result: unknown) => string;
};

describe('checkBuildInfoIntegrity: validateBuildInfoRecord (VHS-REQ-683.1)', () => {
  it('passes a well-formed record with a hex commit', () => {
    const r = validateBuildInfoRecord(
      { extensionVersion: '1.36.1', extensionCommit: 'a1b2c3d4e5f6' },
      { expectedVersion: '1.36.1' }
    );
    expect(r).toEqual({ ok: true, problems: [] });
  });

  it('accepts the <unknown> commit sentinel', () => {
    expect(validateBuildInfoRecord({ extensionVersion: '1.0.0', extensionCommit: UNKNOWN_COMMIT }).ok).toBe(true);
  });

  it('fails closed on a non-object record', () => {
    expect(validateBuildInfoRecord(null).problems).toContainEqual({ reason: 'not-an-object', detail: 'object' });
    expect(validateBuildInfoRecord([]).ok).toBe(false);
  });

  it('flags a missing key and an invalid version', () => {
    const r = validateBuildInfoRecord({ extensionCommit: 'abcdef1' });
    expect(r.problems).toContainEqual({ reason: 'missing-key', detail: 'extensionVersion' });
    expect(r.problems).toContainEqual({ reason: 'version-invalid', detail: 'undefined' });
  });

  it('flags a version mismatch against the expected version', () => {
    const r = validateBuildInfoRecord(
      { extensionVersion: '1.0.0', extensionCommit: 'abcdef1' },
      { expectedVersion: '2.0.0' }
    );
    expect(r.problems).toContainEqual({ reason: 'version-mismatch', detail: '1.0.0 != 2.0.0' });
  });

  it('flags a malformed commit that is neither hex nor the sentinel', () => {
    const r = validateBuildInfoRecord({ extensionVersion: '1.0.0', extensionCommit: 'not-a-sha!' });
    expect(r.problems).toContainEqual({ reason: 'commit-malformed', detail: 'not-a-sha!' });
  });

  it('flags an empty commit string', () => {
    const r = validateBuildInfoRecord({ extensionVersion: '1.0.0', extensionCommit: '   ' });
    expect(r.problems).toContainEqual({ reason: 'commit-invalid', detail: '   ' });
  });
});

describe('checkBuildInfoIntegrity: checkBuildInfoContract (VHS-REQ-683.2)', () => {
  it('runs the generator read-only and validates its output against package.json', () => {
    const { buildInfo, result } = checkBuildInfoContract({
      readFileSync: () => JSON.stringify({ version: '3.1.4' }),
      generateBuildInfo: () => ({ buildInfo: { extensionVersion: '3.1.4', extensionCommit: 'deadbeef' } })
    });
    expect(buildInfo).toEqual({ extensionVersion: '3.1.4', extensionCommit: 'deadbeef' });
    expect(result.ok).toBe(true);
  });

  it('fails closed when the generator emits a version that disagrees with package.json', () => {
    const { result } = checkBuildInfoContract({
      readFileSync: () => JSON.stringify({ version: '3.1.4' }),
      generateBuildInfo: () => ({ buildInfo: { extensionVersion: '9.9.9', extensionCommit: 'deadbeef' } })
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual({ reason: 'version-mismatch', detail: '9.9.9 != 3.1.4' });
  });

  it('the real generator satisfies the contract in this repo', () => {
    const { result } = checkBuildInfoContract();
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('checkBuildInfoIntegrity: renderBuildInfoIntegrity (VHS-REQ-683.2)', () => {
  it('renders OK when clean', () => {
    expect(renderBuildInfoIntegrity({ ok: true, problems: [] })).toContain('OK:');
  });

  it('lists problems when failing', () => {
    const out = renderBuildInfoIntegrity({ ok: false, problems: [{ reason: 'missing-key', detail: 'extensionCommit' }] });
    expect(out).toContain('FAIL: 1');
    expect(out).toContain('missing-key (extensionCommit)');
  });
});
