// Self-test for collabPromote.mjs (issue #2392 Phase 2 prototype). Pure helpers +
// runPromote over fully-injected side effects, so the gate-before-open CONTRACT is
// verified without git/gh. Graduates to a governed tests/unit case in PR2.
// Run: node prototype/collabPromote.selftest.mjs

import assert from 'node:assert/strict';
import {
  buildPrototypeSourceTrailer,
  parsePrototypeSourceTrailer,
  normalizeSlug,
  validatePromoteSpec,
  promoteBranchName,
  buildPromoteBody,
  runPromote
} from './collabPromote.mjs';

let passed = 0;
function test(name, fn) {
  const r = fn();
  if (r && typeof r.then === 'function') return r.then(() => { passed += 1; process.stdout.write(`  ok  ${name}\n`); });
  passed += 1;
  process.stdout.write(`  ok  ${name}\n`);
  return undefined;
}

function makeDeps(gateOk) {
  const calls = [];
  return {
    calls,
    log: () => {},
    git: {
      createBranch: async (b, base) => calls.push(`createBranch:${b}:${base}`),
      applyCommits: async (c) => calls.push(`applyCommits:${c.join('+')}`),
      applyReconcile: async (f) => calls.push(`applyReconcile:${f.join('+')}`),
      push: async (b) => calls.push(`push:${b}`)
    },
    runGate: async () => {
      calls.push('runGate');
      return { ok: gateOk, summary: gateOk ? 'green' : 'FAILED' };
    },
    openPr: async (opts) => {
      calls.push('openPr');
      return { number: 4242, url: 'https://example/pr/4242', _opts: opts };
    },
    arm: async (n) => calls.push(`arm:${n}`)
  };
}

async function main() {
  await test('trailer build + parse round-trips', () => {
    const t = buildPrototypeSourceTrailer(['abc123', ' def456 ', '']);
    assert.equal(t, 'Prototype-Source: abc123,def456');
    assert.deepEqual(parsePrototypeSourceTrailer(`x\n${t}\ny`), ['abc123', 'def456']);
    assert.equal(buildPrototypeSourceTrailer([]), '');
  });

  await test('normalizeSlug + promoteBranchName', () => {
    assert.equal(normalizeSlug('Agent Env Derivation!'), 'agent-env-derivation');
    assert.equal(promoteBranchName({ issue: 2392, slug: 'Hook Infra' }), 'feature/2392-hook-infra');
  });

  await test('validatePromoteSpec: requires issue, slug, and EXACTLY one slice mode', () => {
    assert.throws(() => validatePromoteSpec({ slug: 'x', commits: ['a'] }), /issue/);
    assert.throws(() => validatePromoteSpec({ issue: 1, commits: ['a'] }), /slug/);
    assert.throws(() => validatePromoteSpec({ issue: 1, slug: 'x' }), /commits.*or.*reconcile/i);
    assert.throws(
      () => validatePromoteSpec({ issue: 1, slug: 'x', commits: ['a'], reconcileFiles: ['f'] }),
      /not both/
    );
    assert.deepEqual(validatePromoteSpec({ issue: 1, slug: 'x', commits: ['a'] }), { mode: 'cherry-pick', base: 'develop' });
    assert.deepEqual(validatePromoteSpec({ issue: 1, slug: 'x', reconcileFiles: ['f'] }), { mode: 'reconcile', base: 'develop' });
  });

  await test('buildPromoteBody carries Closes #issue + the provenance trailer', () => {
    const body = buildPromoteBody({ issue: 2392, summary: 'Graduate module' }, 'Prototype-Source: abc');
    assert.match(body, /Graduate module/);
    assert.match(body, /Closes #2392/);
    assert.match(body, /Prototype-Source: abc/);
  });

  await test('runPromote HAPPY path: gate runs BEFORE push/openPr/arm, in order', async () => {
    const deps = makeDeps(true);
    const res = await runPromote({ issue: 2392, slug: 'x', commits: ['sha1', 'sha2'], summary: 's' }, deps);
    assert.equal(res.ok, true);
    assert.equal(res.stage, 'armed');
    assert.equal(res.branch, 'feature/2392-x');
    assert.equal(res.pr.number, 4242);
    // Ordering contract: gate strictly precedes push -> openPr -> arm.
    assert.deepEqual(deps.calls, [
      'createBranch:feature/2392-x:develop',
      'applyCommits:sha1+sha2',
      'runGate',
      'push:feature/2392-x',
      'openPr',
      'arm:4242'
    ]);
    // PR body carries the provenance trailer.
    assert.match(res.pr._opts.body, /Prototype-Source: sha1,sha2/);
  });

  await test('runPromote GATE FAILURE: aborts, never opens a PR, never arms', async () => {
    const deps = makeDeps(false);
    const res = await runPromote({ issue: 2392, slug: 'x', commits: ['sha1'] }, deps);
    assert.equal(res.ok, false);
    assert.equal(res.stage, 'validation-gate');
    assert.ok(deps.calls.includes('runGate'));
    assert.ok(!deps.calls.includes('push:feature/2392-x'), 'must NOT push on gate failure');
    assert.ok(!deps.calls.includes('openPr'), 'must NOT open a PR on gate failure');
    assert.ok(!deps.calls.some((c) => c.startsWith('arm')), 'must NOT arm on gate failure');
  });

  await test('runPromote reconcile mode applies a file-set instead of cherry-pick', async () => {
    const deps = makeDeps(true);
    await runPromote({ issue: 7, slug: 'y', reconcileFiles: ['a.ts', 'b.ts'] }, deps);
    assert.ok(deps.calls.includes('applyReconcile:a.ts+b.ts'));
    assert.ok(!deps.calls.some((c) => c.startsWith('applyCommits')));
  });

  process.stdout.write(`\nAll ${passed} collabPromote self-tests passed.\n`);
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
