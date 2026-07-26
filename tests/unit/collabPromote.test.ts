import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cp = require('../../scripts/collabPromote.js');

// VHS-REQ-719 (VHS #2392 Phase 2): `collab promote` orchestration. The gate-before-open ordering +
// gate-failure-abort + branch-collision precheck are verified over injected side effects.
// Covers VHS-REQ-719.4 (slice apply + pre-promote validation gate strictly before open/arm, aborting
// on gate failure or branch collision, reconcile requiring provenance) and VHS-REQ-719.5
// (Prototype-Source provenance trailer + the merge left to the develop queue).
function makeDeps(gateOk: boolean, branchExists = false) {
  const calls: string[] = [];
  return {
    calls,
    log: () => {},
    git: {
      branchExists: async (b: string) => {
        calls.push(`branchExists:${b}`);
        return branchExists;
      },
      createBranch: async (b: string, base: string) => calls.push(`createBranch:${b}:${base}`),
      applyCommits: async (c: string[]) => calls.push(`applyCommits:${c.join('+')}`),
      applyReconcile: async (f: string[]) => calls.push(`applyReconcile:${f.join('+')}`),
      push: async (b: string) => calls.push(`push:${b}`)
    },
    runGate: async (opts: { mode: string }) => {
      calls.push(`runGate:${opts && opts.mode}`);
      return { ok: gateOk, summary: gateOk ? 'green' : 'FAILED' };
    },
    openPr: async (opts: unknown) => {
      calls.push('openPr');
      return { number: 4242, url: 'https://example/pr/4242', _opts: opts };
    },
    arm: async (n: number) => calls.push(`arm:${n}`)
  };
}

describe('collabPromote (issue #2392)', () => {
  it('trailer build + parse round-trips; normalizeSlug + promoteBranchName', () => {
    const t = cp.buildPrototypeSourceTrailer(['abc123', ' def456 ', '']);
    expect(t).toBe('Prototype-Source: abc123,def456');
    expect(cp.parsePrototypeSourceTrailer(`x\n${t}\ny`)).toEqual(['abc123', 'def456']);
    expect(cp.promoteBranchName({ issue: 2392, slug: 'Hook Infra' })).toBe('feature/2392-hook-infra');
  });

  it('validatePromoteSpec: requires issue, slug, and EXACTLY one slice mode', () => {
    expect(() => cp.validatePromoteSpec({ slug: 'x', commits: ['a'] })).toThrow(/issue/);
    expect(() => cp.validatePromoteSpec({ issue: 1, commits: ['a'] })).toThrow(/slug/);
    expect(() => cp.validatePromoteSpec({ issue: 1, slug: 'x' })).toThrow(/commits.*or.*reconcile/i);
    expect(() => cp.validatePromoteSpec({ issue: 1, slug: 'x', commits: ['a'], reconcileFiles: ['f'] })).toThrow(/not both/);
    expect(cp.validatePromoteSpec({ issue: 1, slug: 'x', commits: ['a'] })).toEqual({ mode: 'cherry-pick', base: 'develop' });
  });

  it('validatePromoteSpec: reconcile REQUIRES provenance (trailer never empty)', () => {
    expect(() => cp.validatePromoteSpec({ issue: 1, slug: 'x', reconcileFiles: ['f'] })).toThrow(
      /reconcile mode requires provenance/
    );
    expect(cp.validatePromoteSpec({ issue: 1, slug: 'x', reconcileFiles: ['f'], provenance: ['s'] })).toEqual({
      mode: 'reconcile',
      base: 'develop'
    });
  });

  it('runPromote HAPPY path: collision precheck + gate BEFORE push/openPr/arm, in order', async () => {
    const deps = makeDeps(true);
    const res = await cp.runPromote({ issue: 2392, slug: 'x', commits: ['sha1', 'sha2'], summary: 's' }, deps);
    expect(res.ok).toBe(true);
    expect(res.stage).toBe('armed');
    expect(res.pr.number).toBe(4242);
    expect(deps.calls).toEqual([
      'branchExists:feature/2392-x',
      'createBranch:feature/2392-x:develop',
      'applyCommits:sha1+sha2',
      'runGate:cherry-pick',
      'push:feature/2392-x',
      'openPr',
      'arm:4242'
    ]);
    expect(res.pr._opts.body).toMatch(/Prototype-Source: sha1,sha2/);
    expect(res.pr._opts.body).toMatch(/Closes #2392/);
  });

  it('runPromote BRANCH-COLLISION precheck aborts before any git mutation', async () => {
    const deps = makeDeps(true, true);
    const res = await cp.runPromote({ issue: 2392, slug: 'x', commits: ['sha1'] }, deps);
    expect(res.ok).toBe(false);
    expect(res.stage).toBe('branch-collision');
    expect(deps.calls).toEqual(['branchExists:feature/2392-x']);
  });

  it('runPromote GATE FAILURE aborts, never opens a PR, never arms', async () => {
    const deps = makeDeps(false);
    const res = await cp.runPromote({ issue: 2392, slug: 'x', commits: ['sha1'] }, deps);
    expect(res.ok).toBe(false);
    expect(res.stage).toBe('validation-gate');
    expect(deps.calls).toContain('runGate:cherry-pick');
    expect(deps.calls).not.toContain('openPr');
    expect(deps.calls.some((c) => c.startsWith('arm'))).toBe(false);
  });

  it('runPromote reconcile mode applies a file-set (with provenance) + full-suite gate', async () => {
    const deps = makeDeps(true);
    await cp.runPromote({ issue: 7, slug: 'y', reconcileFiles: ['a.ts', 'b.ts'], provenance: ['sha9'] }, deps);
    expect(deps.calls).toContain('applyReconcile:a.ts+b.ts');
    expect(deps.calls.some((c) => c.startsWith('applyCommits'))).toBe(false);
    expect(deps.calls).toContain('runGate:reconcile');
  });
});
