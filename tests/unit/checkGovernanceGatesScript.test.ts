import { describe, expect, it } from 'vitest';

// VHS-REQ-681 (dev-only sweep, epic #2159): governance gate-tooling integrity.
// Deterministic unit tests of the pure evaluator + renderer, plus a real-repo
// assertion that the shipped manifest is present and wired.

const {
  GOVERNANCE_GATES,
  evaluateGovernanceGates,
  renderGovernanceGates,
  loadPackageScripts
} = require('../../scripts/checkGovernanceGates.js') as {
  GOVERNANCE_GATES: Array<{ id: string; script: string; alias: string }>;
  evaluateGovernanceGates: (
    manifest: unknown,
    deps?: { packageScripts?: Record<string, string>; existsSync?: (p: string) => boolean }
  ) => { ok: boolean; problems: Array<{ gateId: string; reason: string; detail: string }> };
  renderGovernanceGates: (result: unknown) => string;
  loadPackageScripts: (repoRoot: string, deps?: Record<string, unknown>) => Record<string, string>;
};

const path = require('node:path') as typeof import('node:path');

const OK_MANIFEST = [
  { id: 'a', script: 'scripts/a.js', alias: 'a:check' },
  { id: 'b', script: 'scripts/b.js', alias: 'b:check' }
];
const OK_SCRIPTS = { 'a:check': 'node scripts/a.js', 'b:check': 'node scripts/b.js --strict' };
const allExist = () => true;

describe('checkGovernanceGates: evaluateGovernanceGates (VHS-REQ-681.1)', () => {
  it('passes when every gate script exists and its alias invokes it', () => {
    const r = evaluateGovernanceGates(OK_MANIFEST, { packageScripts: OK_SCRIPTS, existsSync: allExist });
    expect(r).toEqual({ ok: true, problems: [] });
  });

  it('fails closed when a gate script is missing on disk', () => {
    const r = evaluateGovernanceGates(OK_MANIFEST, {
      packageScripts: OK_SCRIPTS,
      existsSync: (p: string) => p !== 'scripts/b.js'
    });
    expect(r.ok).toBe(false);
    expect(r.problems).toContainEqual({ gateId: 'b', reason: 'script-missing', detail: 'scripts/b.js' });
  });

  it('fails closed when the npm alias is absent', () => {
    const r = evaluateGovernanceGates(OK_MANIFEST, {
      packageScripts: { 'a:check': 'node scripts/a.js' },
      existsSync: allExist
    });
    expect(r.problems).toContainEqual({ gateId: 'b', reason: 'alias-missing', detail: 'b:check' });
  });

  it('fails closed when the alias no longer invokes the declared script', () => {
    const r = evaluateGovernanceGates(OK_MANIFEST, {
      packageScripts: { 'a:check': 'node scripts/a.js', 'b:check': 'node scripts/other.js' },
      existsSync: allExist
    });
    expect(r.problems).toContainEqual({
      gateId: 'b',
      reason: 'alias-mismatch',
      detail: 'b:check does not invoke scripts/b.js'
    });
  });

  it('flags malformed gates and duplicate ids', () => {
    const r = evaluateGovernanceGates(
      [{ id: 'x', script: 'scripts/x.js', alias: 'x:check' }, { id: 'x', script: 'scripts/x.js', alias: 'x:check' }, { id: 'bad' }],
      { packageScripts: { 'x:check': 'node scripts/x.js' }, existsSync: allExist }
    );
    expect(r.problems).toContainEqual({ gateId: 'x', reason: 'duplicate-gate-id', detail: 'x' });
    expect(r.problems.some((p) => p.reason === 'malformed-gate')).toBe(true);
  });

  it('treats an empty/non-array manifest as vacuously ok', () => {
    expect(evaluateGovernanceGates(null).ok).toBe(true);
    expect(evaluateGovernanceGates([]).ok).toBe(true);
  });
});

describe('checkGovernanceGates: renderGovernanceGates (VHS-REQ-681.2)', () => {
  it('renders an OK line when there are no problems', () => {
    expect(renderGovernanceGates({ ok: true, problems: [] })).toContain('OK:');
  });

  it('lists each problem when failing', () => {
    const out = renderGovernanceGates({ ok: false, problems: [{ gateId: 'b', reason: 'script-missing', detail: 'scripts/b.js' }] });
    expect(out).toContain('FAIL: 1');
    expect(out).toContain('b: script-missing (scripts/b.js)');
  });
});

describe('checkGovernanceGates: real repo manifest (VHS-REQ-681.3)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const fs = require('node:fs') as typeof import('node:fs');

  it('the shipped GOVERNANCE_GATES manifest passes against the real repo', () => {
    const packageScripts = loadPackageScripts(repoRoot);
    const result = evaluateGovernanceGates(GOVERNANCE_GATES, {
      packageScripts,
      existsSync: (rel: string) => fs.existsSync(path.join(repoRoot, rel))
    });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('declares at least the core governance gates', () => {
    const ids = GOVERNANCE_GATES.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['adr-index', 'agent-delegation', 'branch-protection', 'dev-dependencies']));
  });
});
