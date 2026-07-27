#!/usr/bin/env node
// @ts-check
/**
 * github-bot review PROVIDER for the local-review seam (prototype).
 *
 * The sibling reviewers (copilotSubagent / ollama-local) are PROMPT reviewers:
 * given the rubric+diff prompt they RETURN findings from a model. This provider is
 * a HARVESTER: it reads the REAL GitHub bot review (Copilot + Codex) left on a PR
 * after a push and maps every inline comment onto the SAME shared Finding /
 * report@v1 shape (reviewDiff.mjs). That gives a future agent one provider-generic
 * findings contract across all three backends, and the harvested findings are the
 * feed for the LEARNED_RUBRIC loop (DESIGN.md step 2): a bot finding the local
 * reviewer missed becomes a learned rule so it never leaks to the bot twice.
 *
 * Two layers, like the rest of local-review:
 *   1. PURE CORE (no I/O, deterministic, fail-closed via reviewDiff.validateFindings):
 *      severity mapping, comment->finding mapping, comments->report@v1.
 *   2. IMPURE SHELL (injectable `deps` = { gh, sleep, log }): wait for the Copilot
 *      review workflow run to complete, fetch the PR review comments, harvest.
 *
 * Prototype .mjs (inventory-exempt; not shipped, not in npm test). Cross-platform
 * Node (the WIN plane runs it too) — no bash. Requires the `gh` CLI authenticated.
 *
 * @typedef {import('../reviewDiff.mjs').Finding} Finding
 * @typedef {{ login: string, path: (string|null), line: (number|null), body: string }} BotComment
 * @typedef {{ gh: (args: string[]) => string, sleep: (ms: number) => Promise<void>, log: (m: string) => void }} Deps
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { validateFindings, buildReport } from '../reviewDiff.mjs';

const COPILOT_LOGIN = 'Copilot';
const CODEX_LOGIN_PREFIX = 'chatgpt-codex';
const COPILOT_REVIEW_WORKFLOW = 'Running Copilot Code Review';

// ---------------------------------------------------------------------------
// PURE CORE.
// ---------------------------------------------------------------------------

/**
 * Classify the bot + comment body into a rubric severity.
 * Codex tags a P1/P2/P3 badge; map P1->blocker, P2->warning, P3->nit.
 * Copilot leaves no severity signal -> warning (a real inline comment to address).
 *
 * @param {string} source  'copilot' | 'codex' | 'bot'
 * @param {string} body
 * @returns {'blocker'|'warning'|'nit'}
 */
export function mapBotSeverity(source, body) {
  if (source === 'codex') {
    const text = String(body || '');
    const m = /!\[P([123])\s+Badge\]/.exec(text) || /\bP([123])\b/.exec(text);
    if (m) return m[1] === '1' ? 'blocker' : m[1] === '2' ? 'warning' : 'nit';
  }
  return 'warning';
}

/**
 * The provider source slug for a comment author login.
 * @param {string} login
 * @returns {'copilot'|'codex'|'bot'}
 */
export function sourceOf(login) {
  if (login === COPILOT_LOGIN) return 'copilot';
  if (String(login || '').startsWith(CODEX_LOGIN_PREFIX)) return 'codex';
  return 'bot';
}

/**
 * Normalize a bot comment body into a finding message: strip Codex badge markdown
 * and its "Useful?" footer, collapse whitespace, and tag the source. Pure.
 *
 * @param {string} body
 * @param {string} source
 * @returns {string}
 */
export function cleanBody(body, source) {
  let t = String(body || '');
  t = t.replace(/!\[P[123]\s+Badge\]\([^)]*\)/g, ' ');
  t = t.replace(/<\/?sub>/g, ' ');
  t = t.replace(/\n+Useful\?[\s\S]*$/i, ' '); // Codex reaction footer
  t = t.replace(/\s+/g, ' ').trim();
  return t ? `[${source}] ${t}` : '';
}

/**
 * Map one bot review comment to a RAW finding object (validated later by
 * reviewDiff.validateFindings). Returns null for a comment that is not a
 * file-anchored finding (no path) or has an empty body.
 *
 * @param {BotComment} comment
 * @returns {(null | { file: string, line: (number|null), severity: string, message: string, ruleId: string })}
 */
export function botCommentToRawFinding(comment) {
  if (comment === null || typeof comment !== 'object') return null;
  const file = typeof comment.path === 'string' ? comment.path.trim() : '';
  if (file === '') return null; // general (non-inline) review comment -> not a file finding
  const source = sourceOf(comment.login);
  const message = cleanBody(comment.body, source);
  if (message === '') return null;
  const line =
    typeof comment.line === 'number' && Number.isInteger(comment.line) && comment.line > 0
      ? comment.line
      : null;
  return { file, line, severity: mapBotSeverity(source, comment.body), message, ruleId: `github-${source}` };
}

/**
 * Map an array of bot comments to a schema-tagged report@v1 (via the shared
 * reviewDiff pure core). Non-inline / empty comments are dropped. Deterministic.
 *
 * @param {BotComment[]} comments
 * @param {{ threshold?: 'blocker'|'warning'|'nit' }} [opts]
 * @returns {ReturnType<typeof buildReport>}
 */
export function botCommentsToReport(comments, opts = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const raw = [];
  for (const c of list) {
    const rf = botCommentToRawFinding(c);
    if (rf) raw.push(rf);
  }
  const findings = validateFindings(raw);
  return buildReport({ findings, threshold: opts.threshold });
}

// ---------------------------------------------------------------------------
// IMPURE SHELL (injectable deps).
// ---------------------------------------------------------------------------

/** Default deps: real gh CLI, real sleep, stderr log. @returns {Deps} */
export function makeDefaultDeps() {
  return {
    gh: (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => process.stderr.write(`[github-bot-poll] ${m}\n`),
  };
}

/**
 * Wait for the Copilot review workflow run on `headSha` to complete. Robust to a
 * run that has not been created yet (treated as still-pending).
 *
 * @param {Deps} deps
 * @param {{ branch: string, headSha: string, maxPolls?: number, sleepMs?: number }} args
 * @returns {Promise<{ completed: boolean, conclusion: (string|null), polls: number }>}
 */
export async function waitForCopilotReview(deps, { branch, headSha, maxPolls = 40, sleepMs = 45000 }) {
  for (let i = 1; i <= maxPolls; i += 1) {
    let runs = [];
    try {
      runs = JSON.parse(
        deps.gh(['run', 'list', '--branch', branch, '--json', 'name,status,conclusion,headSha', '--limit', '30'])
      );
    } catch {
      runs = [];
    }
    const run = runs.find((r) => r.name === COPILOT_REVIEW_WORKFLOW && r.headSha === headSha);
    if (run && run.status === 'completed') {
      return { completed: true, conclusion: run.conclusion ?? null, polls: i };
    }
    deps.log(`poll ${i}/${maxPolls}: copilot review ${run ? run.status : 'not-started-yet'} (sha ${headSha.slice(0, 8)})`);
    if (i < maxPolls) await deps.sleep(sleepMs);
  }
  return { completed: false, conclusion: null, polls: maxPolls };
}

/**
 * Fetch the Copilot + Codex inline review comments anchored to `headSha`.
 *
 * @param {Deps} deps
 * @param {{ repo: string, pr: (string|number), headSha: string }} args
 * @returns {BotComment[]}
 */
export function fetchBotComments(deps, { repo, pr, headSha }) {
  const raw = JSON.parse(deps.gh(['api', `repos/${repo}/pulls/${pr}/comments`, '--paginate']));
  return raw
    .filter((c) => c && c.commit_id === headSha)
    .map((c) => ({ login: c.user && c.user.login, path: c.path ?? null, line: c.line ?? null, body: c.body || '' }))
    .filter((c) => c.login === COPILOT_LOGIN || String(c.login || '').startsWith(CODEX_LOGIN_PREFIX));
}

/**
 * Harvest the real GitHub bot review for a PR into a report@v1.
 *
 * @param {{ pr: (string|number), repo?: string, threshold?: 'blocker'|'warning'|'nit',
 *           waitForReview?: boolean, maxPolls?: number, sleepMs?: number }} opts
 * @param {Deps} [deps]
 * @returns {Promise<{ pr: (string|number), repo: string, headSha: string,
 *                     waited: (null | Awaited<ReturnType<typeof waitForCopilotReview>>),
 *                     report: ReturnType<typeof buildReport> }>}
 */
export async function harvestBotFindings(opts, deps = makeDefaultDeps()) {
  const pr = opts.pr;
  if (pr === undefined || pr === null || `${pr}`.trim() === '') {
    throw new Error('harvestBotFindings requires a PR number (opts.pr).');
  }
  const repo =
    opts.repo || deps.gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
  const headSha = deps.gh(['pr', 'view', `${pr}`, '--repo', repo, '--json', 'headRefOid', '--jq', '.headRefOid']).trim();
  const branch = deps.gh(['pr', 'view', `${pr}`, '--repo', repo, '--json', 'headRefName', '--jq', '.headRefName']).trim();
  let waited = null;
  if (opts.waitForReview !== false) {
    waited = await waitForCopilotReview(deps, {
      branch,
      headSha,
      maxPolls: opts.maxPolls,
      sleepMs: opts.sleepMs,
    });
  }
  const comments = fetchBotComments(deps, { repo, pr, headSha });
  const report = botCommentsToReport(comments, { threshold: opts.threshold });
  return { pr, repo, headSha, waited, report };
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      repo: { type: 'string' },
      threshold: { type: 'string', default: 'warning' },
      max: { type: 'string', default: '40' },
      sleep: { type: 'string', default: '45' },
      'no-wait': { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  if (!values.pr) {
    process.stderr.write('usage: node githubBotPoll.mjs --pr <number> [--repo o/r] [--threshold warning] [--max 40] [--sleep 45] [--no-wait] [--out file]\n');
    process.exit(2);
  }
  const deps = makeDefaultDeps();
  const result = await harvestBotFindings(
    {
      pr: values.pr,
      repo: values.repo,
      threshold: /** @type {any} */ (values.threshold),
      waitForReview: !values['no-wait'],
      maxPolls: Number(values.max),
      sleepMs: Number(values.sleep) * 1000,
    },
    deps
  );
  const json = JSON.stringify(result, null, 2);
  if (values.out) {
    writeFileSync(values.out, json);
    deps.log(`wrote report to ${values.out}`);
  }
  process.stdout.write(json + '\n');
  deps.log(
    `PR #${result.pr}: ${result.report.summary.total} finding(s) ` +
      `(${result.report.summary.blockers} blocker / ${result.report.summary.warnings} warning / ${result.report.summary.nits} nit)` +
      (result.waited ? `, review ${result.waited.completed ? 'completed' : 'INCOMPLETE'}` : ', wait skipped')
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    process.stderr.write(`[github-bot-poll] error: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}
