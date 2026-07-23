import { describe, expect, it } from 'vitest';

// VHS-REQ-681 (dev-only sweep, epic #2159): governance gate-tooling integrity.
// Deterministic unit tests of the pure evaluator + renderer, plus a real-repo
// assertion that the shipped manifest is present and wired.

const {
  GOVERNANCE_GATES,
  evaluateGovernanceGates,
  renderGovernanceGates,
  loadPackageScripts,
  main
} = require('../../scripts/checkGovernanceGates.js') as {
  GOVERNANCE_GATES: Array<{ id: string; script: string; alias: string }>;
  evaluateGovernanceGates: (
    manifest: unknown,
    deps?: { packageScripts?: Record<string, string>; existsSync?: (p: string) => boolean }
  ) => { ok: boolean; problems: Array<{ gateId: string; reason: string; detail: string }> };
  renderGovernanceGates: (result: unknown) => string;
  loadPackageScripts: (repoRoot: string, deps?: Record<string, unknown>) => Record<string, string>;
  main: (deps?: {
    repoRoot?: string;
    existsSync?: (p: string) => boolean;
    readFileSync?: (p: string, enc: string) => string;
    write?: (text: string) => void;
  }) => number;
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

  it('flags a gate whose id and script are strings but alias is not', () => {
    // Exercises the final operand of the malformed-gate guard: the earlier
    // id/script checks are false, so evaluation reaches the alias typeof check.
    const r = evaluateGovernanceGates(
      [{ id: 'y', script: 'scripts/y.js', alias: 123 as unknown as string }],
      { packageScripts: {}, existsSync: allExist }
    );
    expect(r.ok).toBe(false);
    expect(r.problems).toContainEqual({
      gateId: 'y',
      reason: 'malformed-gate',
      detail: 'gate must declare id, script, alias'
    });
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

describe('checkGovernanceGates: default injected collaborators (VHS-REQ-681.1)', () => {
  it('uses a fail-closed default existsSync and empty package scripts when deps are omitted', () => {
    // No deps: existsSync defaults to () => false and packageScripts defaults to {},
    // so every declared gate reports both a missing script and a missing alias.
    const r = evaluateGovernanceGates(OK_MANIFEST);
    expect(r.ok).toBe(false);
    expect(r.problems).toContainEqual({ gateId: 'a', reason: 'script-missing', detail: 'scripts/a.js' });
    expect(r.problems).toContainEqual({ gateId: 'a', reason: 'alias-missing', detail: 'a:check' });
    expect(r.problems).toContainEqual({ gateId: 'b', reason: 'script-missing', detail: 'scripts/b.js' });
  });
});

describe('checkGovernanceGates: loadPackageScripts (VHS-REQ-681.3)', () => {
  it('returns the parsed scripts map from an injected reader', () => {
    const scripts = loadPackageScripts('/repo', {
      readFileSync: () => JSON.stringify({ scripts: { 'a:check': 'node scripts/a.js' } })
    });
    expect(scripts).toEqual({ 'a:check': 'node scripts/a.js' });
  });

  it('returns an empty map when package.json declares no scripts object', () => {
    const scripts = loadPackageScripts('/repo', { readFileSync: () => JSON.stringify({ name: 'x' }) });
    expect(scripts).toEqual({});
  });

  it('fails closed to an empty map when package.json cannot be read or parsed', () => {
    const scripts = loadPackageScripts('/repo', {
      readFileSync: () => {
        throw new Error('ENOENT: no such file');
      }
    });
    expect(scripts).toEqual({});
  });

  it('falls back to process.cwd() when the repoRoot argument is empty', () => {
    let seenPath = '';
    const scripts = loadPackageScripts('', {
      readFileSync: (candidate: string) => {
        seenPath = candidate;
        return JSON.stringify({ scripts: {} });
      }
    });
    expect(scripts).toEqual({});
    expect(seenPath.replace(/\\/g, '/')).toContain('/package.json');
  });
});

describe('checkGovernanceGates: main CLI entrypoint (VHS-REQ-681.3)', () => {
  const path = require('node:path') as typeof import('node:path');

  it('returns 0 and prints OK when every declared gate is present and wired', () => {
    const captured: string[] = [];
    const seenExistsArgs: string[] = [];
    const packageScripts = Object.fromEntries(
      GOVERNANCE_GATES.map((g) => [g.alias, `node ${g.script}`])
    );
    const exitCode = main({
      repoRoot: path.join('repo', 'root'),
      readFileSync: () => JSON.stringify({ scripts: packageScripts }),
      existsSync: (candidate: string) => {
        seenExistsArgs.push(candidate.replace(/\\/g, '/'));
        return true;
      },
      write: (text: string) => {
        captured.push(text);
      }
    });
    expect(exitCode).toBe(0);
    expect(captured.join('')).toContain('OK:');
    // The injected existsSync arrow joins repoRoot with each declared script.
    expect(seenExistsArgs).toContain(['repo', 'root', GOVERNANCE_GATES[0].script].join('/'));
  });

  it('returns 1 and prints FAIL when a declared gate script is missing', () => {
    const captured: string[] = [];
    const packageScripts = Object.fromEntries(
      GOVERNANCE_GATES.map((g) => [g.alias, `node ${g.script}`])
    );
    const exitCode = main({
      repoRoot: 'repo',
      readFileSync: () => JSON.stringify({ scripts: packageScripts }),
      existsSync: () => false,
      write: (text: string) => {
        captured.push(text);
      }
    });
    expect(exitCode).toBe(1);
    expect(captured.join('')).toContain('FAIL:');
  });

  it('writes to process.stdout by default when no write collaborator is injected', () => {
    // Exercises the default `(text) => process.stdout.write(text)` write arrow.
    const packageScripts = Object.fromEntries(
      GOVERNANCE_GATES.map((g) => [g.alias, `node ${g.script}`])
    );
    const exitCode = main({
      repoRoot: 'repo',
      readFileSync: () => JSON.stringify({ scripts: packageScripts }),
      existsSync: () => true
    });
    expect(exitCode).toBe(0);
  });
});

