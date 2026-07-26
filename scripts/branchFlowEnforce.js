'use strict';

// Phase-2 mirror-mode: pre-push BRANCH-FLOW ENFORCEMENT (issue #2392, Discussion #2365).
//
// Enforce-ONLY: never mutates git state. Inspects the refs a push is about to send and
// fails closed with a clear remedy, mirroring the hosted CI Branch Governance rule
// LOCALLY so an agent catches the papercut before the disguised "Build, Test, Package
// FAILURE" that is really a Branch Governance block. The evaluator is PURE over parsed
// push refs + an injectable issue-existence probe, so it unit-tests without git.
//
// Wired FIRST in the pre-push hook (scripts/installGitHooks.js): cheapest + most common
// papercut, so it fails before the slower adr/agent/standards audits.

/** Branches that may never receive a DIRECT push (must go via PR + the merge queue). */
const PROTECTED_BRANCHES = ['develop', 'main'];

/** Branch-name patterns allowed to target the develop flow (mirrors Branch Governance). */
const ALLOWED_BRANCH_PATTERNS = [
  /^feature\/\d+-.+/, // feature/<issue#>-<slug>
  /^fix\/.+/, // fix/* -> feature/<issue#> per AGENTS.md flow (targets a feature branch, NOT develop)
  /^release\/v.+/,
  /^hotfix\/v.+/,
  /^dependabot\/.+/
];

/** Exact non-develop-flow branches that are legitimately pushed and exempt from Rule B. */
const EXEMPT_BRANCHES = ['prototype/ollama-mcp-linux-collab'];

/** Exempt PATTERNS: personal/experimental branches never PR'd to develop. */
const EXEMPT_PATTERNS = [/^wip\//, /^spike\//, /^prototype\//];

/** Strips a `refs/heads/` prefix to the bare branch name. */
function branchNameFromRef(ref) {
  if (!ref) return ref;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

/**
 * Parses git pre-push stdin: each line is
 *   <local ref> <local sha> <remote ref> <remote sha>
 * A deletion has local ref `(delete)` / an all-zero local sha.
 */
function parsePushRefs(stdinText) {
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
function featureIssueNumber(branch) {
  const m = /^feature\/(\d+)-/.exec(branch || '');
  return m ? Number(m[1]) : null;
}

/**
 * Evaluates a push against the branch-flow policy. Returns { ok, violations, notes }.
 * Each violation carries a stable `rule` id, the offending `branch`, and a `message`
 * that INCLUDES the remedy. `issueExists(n)` is an injected probe (default: assume
 * present) so the evaluator stays pure; the real hook wires it to `gh issue view`.
 * `ruleCVerifiable=false` (no gh on this plane) SKIPS Rule C with an audit note rather
 * than false-blocking, so Rules A+B still run in a plain container.
 */
function evaluateBranchFlow(options) {
  const opts = options || {};
  const refs = opts.refs || [];
  const protectedBranches = opts.protectedBranches || PROTECTED_BRANCHES;
  const allowedPatterns = opts.allowedPatterns || ALLOWED_BRANCH_PATTERNS;
  const exemptBranches = opts.exemptBranches || EXEMPT_BRANCHES;
  const exemptPatterns = opts.exemptPatterns || EXEMPT_PATTERNS;
  const issueExists = opts.issueExists || (() => true);
  const ruleCVerifiable = opts.ruleCVerifiable !== false;

  const violations = [];
  const notes = [];
  for (const ref of refs) {
    if (isDelete(ref)) continue; // deletions are not a flow concern
    // Only branch refs are a branch-flow concern. A tag/note push (refs/tags/*,
    // refs/notes/*) is NOT under refs/heads/ and must be skipped, else Rule B
    // false-blocks it with a nonsense rename remedy.
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

    // Rule C: a feature/<issue#> branch must reference an issue that exists. Scoped to
    // feature/ only (fix/* carries no issue#). Skipped-with-audit when unverifiable.
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
function formatViolations(result, context) {
  if (result.ok) return '';
  const ctx = context || {};
  const who = ctx.teamName ? ` [${ctx.teamName}/${ctx.plane || 'plane?'}]` : '';
  const lines = [`[branch-flow] push BLOCKED${who} — ${result.violations.length} violation(s):`];
  for (const v of result.violations) lines.push(`  - (${v.rule}) ${v.message}`);
  if (result.notes && result.notes.length) for (const n of result.notes) lines.push(`  · ${n}`);
  return lines.join('\n');
}

module.exports = {
  PROTECTED_BRANCHES,
  ALLOWED_BRANCH_PATTERNS,
  EXEMPT_BRANCHES,
  EXEMPT_PATTERNS,
  branchNameFromRef,
  parsePushRefs,
  featureIssueNumber,
  evaluateBranchFlow,
  formatViolations
};

// Pre-push hook entrypoint: reads the ref lines from stdin, evaluates, and exits
// non-zero (fail-closed) on a violation. Rule C is skipped when gh is unavailable.
if (require.main === module) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const refs = parsePushRefs(chunks.join(''));
    const ruleCVerifiable = hasGh();
    const result = evaluateBranchFlow({ refs, issueExists: ghIssueExists, ruleCVerifiable });
    let identity = {};
    try {
      // Best-effort agent identity for auditable telemetry; never fail the hook on it.
      // eslint-disable-next-line global-require
      const derive = require('./deriveAgentEnvironment.js');
      const d = derive.deriveAgentEnvironment({ write: false });
      identity = { teamName: d.teamName, plane: d.plane };
    } catch {
      /* identity is optional */
    }
    if (result.notes && result.notes.length) {
      for (const n of result.notes) process.stderr.write(`[branch-flow] ${n}\n`);
    }
    if (!result.ok) {
      process.stderr.write(`${formatViolations(result, identity)}\n`);
      process.stderr.write('[branch-flow] To override a one-off (explicit choice): git push --no-verify\n');
      process.exit(1);
    }
    process.exit(0);
  });
}

function hasGh() {
  try {
    // eslint-disable-next-line global-require
    require('node:child_process').execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ghIssueExists(n) {
  try {
    // eslint-disable-next-line global-require
    require('node:child_process').execFileSync('gh', ['issue', 'view', String(n), '--json', 'state'], {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}
