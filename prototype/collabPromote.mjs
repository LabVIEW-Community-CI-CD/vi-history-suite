// Phase-2 mirror-mode: `collab promote` orchestration (issue #2392, Discussion #2365).
//
// PROTOTYPE (prototype branch) — graduates to the collab tooling + scripts/ in PR2.
// EXPLICIT slice promotion prototype->develop: create feature/<issue#>-<slug> off
// develop, apply the slice (cherry-pick specific commits, or a reconciled file-set),
// run the PRE-PROMOTE VALIDATION GATE, and only THEN open the PR + arm auto-merge.
// It NEVER runs as an automatic git side effect (it's a deliberate verb) and NEVER
// bypasses the develop merge queue.
//
// THE POINT (both our post-merge bot chains — my #2385->#2388, LINUX's
// #2387->#2389->#2390->#2391): the validation gate (npm run check + mapped tests)
// runs BEFORE the PR is opened/armed, so a slice that would draw a bot finding is
// caught locally instead of after merge. All side effects are injected, so the
// orchestration (especially the gate-before-open ordering) unit-tests without git/gh.

/** Builds the `Prototype-Source:` provenance trailer from the source commit shas. */
export function buildPrototypeSourceTrailer(shas) {
  const list = (shas || []).map((s) => String(s).trim()).filter(Boolean);
  return list.length ? `Prototype-Source: ${list.join(',')}` : '';
}

/** Parses `Prototype-Source:` trailers out of a commit/PR message (greppable, git-native). */
export function parsePrototypeSourceTrailer(message) {
  const out = [];
  for (const line of String(message || '').split('\n')) {
    const m = /^Prototype-Source:\s*(.+)$/.exec(line.trim());
    if (m) for (const s of m[1].split(',')) if (s.trim()) out.push(s.trim());
  }
  return out;
}

/** Normalizes free text into a safe branch slug. */
export function normalizeSlug(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'change'
  );
}

/**
 * Validates a promote spec. Exactly ONE slice mode is required: `commits` (default,
 * cherry-pick specific prototype shas) XOR `reconcile` (apply a reconciled file-set,
 * the escape hatch for an entangled lineage). Throws on an invalid spec.
 */
export function validatePromoteSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') throw new Error('promote: spec required');
  if (!Number.isInteger(spec.issue) || spec.issue <= 0) errors.push('issue must be a positive integer');
  if (!spec.slug || !String(spec.slug).trim()) errors.push('slug required');
  const hasCommits = Array.isArray(spec.commits) && spec.commits.length > 0;
  const hasReconcile = Array.isArray(spec.reconcileFiles) && spec.reconcileFiles.length > 0;
  if (hasCommits && hasReconcile) errors.push('specify EITHER commits (cherry-pick) OR reconcileFiles, not both');
  if (!hasCommits && !hasReconcile) errors.push('specify commits (cherry-pick) or reconcileFiles (reconcile)');
  if (errors.length) throw new Error(`promote: invalid spec — ${errors.join('; ')}`);
  return { mode: hasCommits ? 'cherry-pick' : 'reconcile', base: spec.base || 'develop' };
}

/** Feature branch name for a spec. */
export function promoteBranchName(spec) {
  return `feature/${spec.issue}-${normalizeSlug(spec.slug)}`;
}

/** Assembles the PR body: summary + Closes #issue + the Prototype-Source provenance. */
export function buildPromoteBody(spec, trailer) {
  const parts = [];
  if (spec.summary) parts.push(spec.summary.trim());
  parts.push(`Closes #${spec.issue}`);
  if (trailer) parts.push(trailer);
  return parts.join('\n\n');
}

/**
 * Runs the promotion. Injected deps: git.{createBranch,applyCommits,applyReconcile,push},
 * runGate() -> { ok, summary }, openPr(opts) -> { number, url }, arm(number), log().
 *
 * CONTRACT (the whole reason this exists):
 *  - the validation gate runs AFTER the slice is applied but STRICTLY BEFORE push/openPr/arm;
 *  - a gate FAILURE aborts with stage:'validation-gate' and NEVER opens a PR or arms;
 *  - arm() uses the develop queue (auto --rebase); promote never merges directly.
 */
export async function runPromote(spec, deps) {
  const plan = validatePromoteSpec(spec);
  const log = deps.log || (() => {});
  const branch = promoteBranchName(spec);
  const trailer = buildPrototypeSourceTrailer(spec.commits || spec.provenance || []);

  log(`promote: creating ${branch} off ${plan.base}`);
  await deps.git.createBranch(branch, plan.base);

  if (plan.mode === 'cherry-pick') await deps.git.applyCommits(spec.commits);
  else await deps.git.applyReconcile(spec.reconcileFiles);

  // PRE-PROMOTE VALIDATION GATE — the fix for the post-merge bot chains.
  log('promote: running pre-promote validation gate (check + mapped tests)…');
  const gate = await deps.runGate();
  if (!gate || !gate.ok) {
    return {
      ok: false,
      stage: 'validation-gate',
      branch,
      message: 'pre-promote validation gate FAILED — PR was NOT opened and NOTHING was armed. Fix locally and re-run promote.',
      gate: gate || { ok: false }
    };
  }

  await deps.git.push(branch);
  const pr = await deps.openPr({
    base: plan.base,
    head: branch,
    title: spec.title || `promote: #${spec.issue} ${spec.slug}`,
    body: buildPromoteBody(spec, trailer)
  });
  await deps.arm(pr.number); // develop queue owns the strategy (auto --rebase)
  return { ok: true, stage: 'armed', branch, pr, trailer, mode: plan.mode };
}
