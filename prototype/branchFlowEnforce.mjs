// Phase-2 mirror-mode: pre-push BRANCH-FLOW ENFORCEMENT (issue #2392, Discussion #2365).
//
// PROTOTYPE (prototype branch) — graduates to scripts/ + installGitHooks.js wiring in
// PR2 off updated develop, alongside the collab `promote` verb and the branch-flow
// VHS-REQ. Enforce-ONLY: this never mutates git state; it inspects the refs a push is
// about to send and fails closed with a clear remedy, mirroring the hosted CI Branch
// Governance rule LOCALLY so an agent catches the papercut before the disguised
// "Build, Test, Package FAILURE" that is really a Branch Governance block.
//
// The evaluator is PURE over its inputs (parsed push refs + an injectable
// issue-existence probe), so it unit-tests without a real remote or git.

/** Branches that may never receive a DIRECT push (must go via PR + the merge queue). */
export const PROTECTED_BRANCHES = ['develop', 'main'];

/** Branch-name patterns allowed to target the develop flow (mirrors Branch Governance). */
export const ALLOWED_BRANCH_PATTERNS = [
  /^feature\/\d+-.+/, // feature/<issue#>-<slug>
  /^fix\/.+/, // fix/* -> feature/<issue#> per AGENTS.md flow (targets a feature branch, NOT develop)
  /^release\/v.+/,
  /^hotfix\/v.+/,
  /^dependabot\/.+/
];

/** Exact non-develop-flow branches that are legitimately pushed and exempt from Rule B. */
export const EXEMPT_BRANCHES = ['prototype/ollama-mcp-linux-collab'];

/** Exempt PATTERNS: personal/experimental branches never PR'd to develop. */
export const EXEMPT_PATTERNS = [/^wip\//, /^spike\//, /^prototype\//];

/** Strips a `refs/heads/` prefix to the bare branch name. */
export function branchNameFromRef(ref) {
  if (!ref) return ref;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

/**
 * Parses git pre-push stdin: each line is
 *   <local ref> <local sha> <remote ref> <remote sha>
 * A deletion has local ref `(delete)` / an all-zero local sha.
 */
export function parsePushRefs(stdinText) {
  return String(stdinText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

/** True when the local sha is all-zero (a branch DELETE push). */
function isDelete(ref) {
  return !ref.localSha || /^0{40,}$/.test(ref.localSha) || ref.localRef === '(delete)';
}

/** Extracts the issue number from a feature/<issue#>-slug branch, else null. */
export function featureIssueNumber(branch) {
  const m = /^feature\/(\d+)-/.exec(branch || '');
  return m ? Number(m[1]) : null;
}

/**
 * Evaluates a push against the branch-flow policy. Returns { ok, violations } where
 * each violation carries a stable `rule` id, the offending `branch`, and a `message`
 * that INCLUDES the remedy. `issueExists(n)` is an injected probe (default: assume
 * present) so the evaluator stays pure; the real hook wires it to `gh issue view`.
 */
export function evaluateBranchFlow({
  refs,
  protectedBranches = PROTECTED_BRANCHES,
  allowedPatterns = ALLOWED_BRANCH_PATTERNS,
  exemptBranches = EXEMPT_BRANCHES,
  exemptPatterns = EXEMPT_PATTERNS,
  issueExists = () => true,
  ruleCVerifiable = true
} = {}) {
  const violations = [];
  const notes = [];
  for (const ref of refs || []) {
    if (isDelete(ref)) continue; // deletions are not a flow concern
    // Only branch refs are a branch-flow concern. A tag/note push (refs/tags/*,
    // refs/notes/*) is NOT under refs/heads/ and must be skipped, else Rule B
    // false-blocks it with a nonsense rename remedy. (LINUX empirical finding.)
    if (!ref.remoteRef || !ref.remoteRef.startsWith('refs/heads/')) continue;
    const remoteBranch = branchNameFromRef(ref.remoteRef);
    if (!remoteBranch) continue;

    // Rule A: no DIRECT push to a protected branch — it must land via a PR + queue.
    if (protectedBranches.includes(remoteBranch)) {
      violations.push({
        rule: 'no-direct-protected-push',
        branch: remoteBranch,
        message: `Direct push to protected branch "${remoteBranch}" is blocked. Open a PR from a feature/<issue#>-* branch and let the merge queue land it.`
      });
      continue;
    }

    // Exempt collaboration/personal branches (exact or pattern) skip Rule B/C.
    if (exemptBranches.includes(remoteBranch) || exemptPatterns.some((p) => p.test(remoteBranch))) continue;

    // Rule B: a develop-flow branch must match an allowed pattern (Branch Governance parity).
    if (!allowedPatterns.some((p) => p.test(remoteBranch))) {
      violations.push({
        rule: 'branch-name',
        branch: remoteBranch,
        message:
          `Branch "${remoteBranch}" does not match the required flow ` +
          `(feature/<issue#>-*, fix/*, release/v*, hotfix/v*, dependabot/*). ` +
          `Create a tracking issue, then: git branch -m ${remoteBranch} feature/<issue#>-<slug>.`
      });
      continue;
    }

    // Rule C: a feature/<issue#> branch must reference an issue that exists. Scoped
    // to feature/ only (fix/* carries no issue#). Skipped-with-audit when the issue
    // cannot be verified (no gh on this plane) so Rules A+B still run in a container.
    const issue = featureIssueNumber(remoteBranch);
    if (issue !== null) {
      if (!ruleCVerifiable) {
        notes.push(`Rule C skipped: gh unavailable, cannot verify issue #${issue} for "${remoteBranch}".`);
      } else if (!issueExists(issue)) {
        violations.push({
          rule: 'missing-issue',
          branch: remoteBranch,
          message: `Branch "${remoteBranch}" references issue #${issue}, which was not found. Create the issue or fix the branch name.`
        });
      }
    }
  }
  return { ok: violations.length === 0, violations, notes };
}

/** Renders a fail-closed remedy block for the hook to print on a violation. */
export function formatViolations(result, context = {}) {
  if (result.ok) return '';
  const who = context.teamName ? ` [${context.teamName}/${context.plane || 'plane?'}]` : '';
  const lines = [`[branch-flow] push BLOCKED${who} — ${result.violations.length} violation(s):`];
  for (const v of result.violations) lines.push(`  - (${v.rule}) ${v.message}`);
  return lines.join('\n');
}
