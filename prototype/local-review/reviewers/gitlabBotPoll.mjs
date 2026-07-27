#!/usr/bin/env node
// @ts-check
/**
 * gitlab-bot review PROVIDER for the local-review seam (prototype) -- the FORGE
 * sibling of reviewers/githubBotPoll.mjs.
 *
 * The provider-generic seam has two axes:
 *   - REVIEW PROVIDER (who reviews): copilotSubagent / ollama-local / github-bot.
 *   - FORGE (where the PR/MR + its bot review live): GitHub (gh) / GitLab (glab).
 * The single unifying contract across BOTH axes is the shared Finding + report@v1
 * shape (reviewDiff.mjs). This module is the GitLab FORGE adapter: it HARVESTS a
 * GitLab Merge Request's inline review notes (via the glab CLI) and maps them onto
 * the SAME report@v1 that githubBotPoll emits, so a future agent consumes findings
 * identically regardless of forge, and the harvest feeds the same LEARNED_RUBRIC loop.
 *
 * Same two layers as its GitHub sibling:
 *   1. PURE CORE (no I/O, deterministic, fail-closed via reviewDiff.validateFindings):
 *      severity mapping, MR-note -> finding mapping, discussions -> report@v1.
 *   2. IMPURE SHELL (injectable `deps` = { glab, sleep, log }): resolve the MR head
 *      sha, fetch discussions, optionally wait for a bot note, harvest.
 *
 * AUTH-FREE by construction: every glab call is behind the injected `deps.glab`, so
 * the pure core + shell are unit-testable with fakes with NO live GitLab. The live
 * run needs `glab auth login` (the maintainer re-authenticates; token is currently 401).
 *
 * GitLab vs GitHub mapping: MR<->PR, discussion notes<->review comments,
 * position.new_path/new_line<->path/line, diff_refs.head_sha<->headRefOid. GitLab has
 * no "Copilot Code Review workflow run"; the review-ready signal is a bot note
 * appearing on the MR, so waitForGitlabReview polls discussions for one.
 *
 * SEVERITY mapping is PROVISIONAL (GitLab review bots vary): a P1/P2/P3 badge maps to
 * blocker/warning/nit, else warning -- to be refined against real GitLab bot output.
 *
 * Prototype .mjs (inventory-exempt; not shipped, not in npm test). Cross-platform Node.
 *
 * @typedef {import('../reviewDiff.mjs').Finding} Finding
 * @typedef {{ author?: { username?: string }, body?: string, system?: boolean, type?: string,
 *             position?: { position_type?: string, new_path?: string, old_path?: string,
 *                          new_line?: (number|null), old_line?: (number|null) } }} GitlabNote
 * @typedef {{ glab: (args: string[]) => string, sleep: (ms: number) => Promise<void>, log: (m: string) => void }} Deps
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { validateFindings, buildReport } from '../reviewDiff.mjs';

// ---------------------------------------------------------------------------
// PURE CORE.
// ---------------------------------------------------------------------------

/**
 * Provisional severity from a GitLab note body: a P1/P2/P3 badge maps to
 * blocker/warning/nit; everything else is a warning (a real inline note to address).
 *
 * @param {string} body
 * @returns {'blocker'|'warning'|'nit'}
 */
export function mapGitlabSeverity(body) {
  const text = String(body || '');
  const m = /!\[P([123])\s+Badge\]/.exec(text) || /\bP([123])\b/.exec(text);
  if (m) return m[1] === '1' ? 'blocker' : m[1] === '2' ? 'warning' : 'nit';
  return 'warning';
}

/**
 * Normalize a GitLab note body into a finding message: strip markdown image/badge
 * syntax, collapse whitespace, tag the forge+author. Pure.
 *
 * @param {string} body
 * @param {string} author
 * @returns {string}
 */
export function cleanGitlabBody(body, author) {
  let t = String(body || '');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '); // markdown images / shield badges
  t = t.replace(/\s+/g, ' ').trim();
  const who = author ? `gitlab:${author}` : 'gitlab';
  return t ? `[${who}] ${t}` : '';
}

/**
 * True when a note is a harvestable inline review finding: not a GitLab system note,
 * a text DiffNote with a file position, and (when `bots` is non-empty) authored by a
 * configured bot username. An empty `bots` set harvests ALL non-system inline notes
 * (narrow it with --bots once the reviewer bot username is known).
 *
 * @param {GitlabNote} note
 * @param {string[]} bots
 * @returns {boolean}
 */
export function noteIsHarvestable(note, bots) {
  if (note === null || typeof note !== 'object') return false;
  if (note.system === true) return false;
  const pos = note.position;
  if (!pos || (pos.position_type && pos.position_type !== 'text')) return false;
  const file = (pos.new_path || pos.old_path || '').trim();
  if (file === '') return false;
  if (Array.isArray(bots) && bots.length > 0) {
    const author = (note.author && note.author.username) || '';
    if (!bots.some((b) => b.toLowerCase() === author.toLowerCase())) return false;
  }
  return true;
}

/**
 * Map one GitLab MR note to a RAW finding object (validated later by
 * reviewDiff.validateFindings). Returns null for a note that is not a harvestable
 * inline finding or has an empty body.
 *
 * @param {GitlabNote} note
 * @param {{ bots?: string[] }} [opts]
 * @returns {(null | { file: string, line: (number|null), severity: string, message: string, ruleId: string })}
 */
export function gitlabNoteToRawFinding(note, opts = {}) {
  const bots = Array.isArray(opts.bots) ? opts.bots : [];
  if (!noteIsHarvestable(note, bots)) return null;
  const pos = note.position || {};
  const file = (pos.new_path || pos.old_path || '').trim();
  const author = (note.author && note.author.username) || '';
  const message = cleanGitlabBody(note.body || '', author);
  if (message === '') return null;
  const rawLine = pos.new_line ?? pos.old_line ?? null;
  const line = typeof rawLine === 'number' && Number.isInteger(rawLine) && rawLine > 0 ? rawLine : null;
  const ruleId = `gitlab-${(author || 'bot').replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  return { file, line, severity: mapGitlabSeverity(note.body || ''), message, ruleId };
}

/**
 * Flatten GitLab discussions to their notes.
 * @param {{ notes?: GitlabNote[] }[]} discussions
 * @returns {GitlabNote[]}
 */
export function flattenDiscussions(discussions) {
  const list = Array.isArray(discussions) ? discussions : [];
  return list.flatMap((d) => (d && Array.isArray(d.notes) ? d.notes : []));
}

/**
 * Map GitLab discussions to a schema-tagged report@v1 (via the shared reviewDiff
 * pure core). Non-inline / system / empty / non-bot notes are dropped. Deterministic.
 *
 * @param {{ notes?: GitlabNote[] }[]} discussions
 * @param {{ threshold?: 'blocker'|'warning'|'nit', bots?: string[] }} [opts]
 * @returns {ReturnType<typeof buildReport>}
 */
export function gitlabDiscussionsToReport(discussions, opts = {}) {
  const raw = [];
  for (const note of flattenDiscussions(discussions)) {
    const rf = gitlabNoteToRawFinding(note, { bots: opts.bots });
    if (rf) raw.push(rf);
  }
  const findings = validateFindings(raw);
  return buildReport({ findings, threshold: opts.threshold });
}

// ---------------------------------------------------------------------------
// IMPURE SHELL (injectable deps).
// ---------------------------------------------------------------------------

/** Default deps: real glab CLI, real sleep, stderr log. @returns {Deps} */
export function makeDefaultDeps() {
  return {
    glab: (args) => execFileSync('glab', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => process.stderr.write(`[gitlab-bot-poll] ${m}\n`),
  };
}

/** A GitLab project ref is a numeric id (verbatim) or a path (URL-encoded for the API). */
export function encodeProject(project) {
  const p = String(project);
  return /^\d+$/.test(p) ? p : encodeURIComponent(p);
}

/**
 * Resolve the MR head sha via `glab api projects/:id/merge_requests/:iid`.
 * @param {Deps} deps
 * @param {{ project: string, mr: (string|number) }} args
 * @returns {string}
 */
export function fetchMrHeadSha(deps, { project, mr }) {
  const raw = JSON.parse(deps.glab(['api', `projects/${encodeProject(project)}/merge_requests/${mr}`]));
  return (raw && ((raw.diff_refs && raw.diff_refs.head_sha) || raw.sha)) || '';
}

/**
 * Fetch the MR discussions via `glab api .../discussions --paginate`.
 * @param {Deps} deps
 * @param {{ project: string, mr: (string|number) }} args
 * @returns {{ notes?: GitlabNote[] }[]}
 */
export function fetchMrDiscussions(deps, { project, mr }) {
  return JSON.parse(
    deps.glab(['api', `projects/${encodeProject(project)}/merge_requests/${mr}/discussions`, '--paginate'])
  );
}

/**
 * Wait for a harvestable bot note to appear on the MR (GitLab has no review-workflow
 * run; a bot note is the ready signal).
 *
 * @param {Deps} deps
 * @param {{ project: string, mr: (string|number), bots?: string[], maxPolls?: number, sleepMs?: number }} args
 * @returns {Promise<{ present: boolean, polls: number }>}
 */
export async function waitForGitlabReview(deps, { project, mr, bots = [], maxPolls = 40, sleepMs = 45000 }) {
  for (let i = 1; i <= maxPolls; i += 1) {
    let notes = [];
    try {
      notes = flattenDiscussions(fetchMrDiscussions(deps, { project, mr }));
    } catch {
      notes = [];
    }
    if (notes.some((n) => noteIsHarvestable(n, bots))) return { present: true, polls: i };
    deps.log(`poll ${i}/${maxPolls}: no harvestable bot note on MR !${mr} yet`);
    if (i < maxPolls) await deps.sleep(sleepMs);
  }
  return { present: false, polls: maxPolls };
}

/**
 * Harvest a GitLab MR's inline review into a report@v1.
 *
 * @param {{ project: string, mr: (string|number), threshold?: 'blocker'|'warning'|'nit',
 *           bots?: string[], waitForReview?: boolean, maxPolls?: number, sleepMs?: number }} opts
 * @param {Deps} [deps]
 * @returns {Promise<{ project: string, mr: (string|number), headSha: string,
 *                     waited: (null | Awaited<ReturnType<typeof waitForGitlabReview>>),
 *                     report: ReturnType<typeof buildReport> }>}
 */
export async function harvestGitlabFindings(opts, deps = makeDefaultDeps()) {
  if (opts.project === undefined || `${opts.project}`.trim() === '') {
    throw new Error('harvestGitlabFindings requires a project (opts.project).');
  }
  if (opts.mr === undefined || `${opts.mr}`.trim() === '') {
    throw new Error('harvestGitlabFindings requires an MR iid (opts.mr).');
  }
  const bots = Array.isArray(opts.bots) ? opts.bots : [];
  const headSha = fetchMrHeadSha(deps, { project: opts.project, mr: opts.mr });
  let waited = null;
  if (opts.waitForReview !== false) {
    waited = await waitForGitlabReview(deps, {
      project: opts.project,
      mr: opts.mr,
      bots,
      maxPolls: opts.maxPolls,
      sleepMs: opts.sleepMs,
    });
  }
  const discussions = fetchMrDiscussions(deps, { project: opts.project, mr: opts.mr });
  const report = gitlabDiscussionsToReport(discussions, { threshold: opts.threshold, bots });
  return { project: opts.project, mr: opts.mr, headSha, waited, report };
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      mr: { type: 'string' },
      threshold: { type: 'string', default: 'warning' },
      bots: { type: 'string', default: '' },
      max: { type: 'string', default: '40' },
      sleep: { type: 'string', default: '45' },
      'no-wait': { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  if (!values.project || !values.mr) {
    process.stderr.write('usage: node gitlabBotPoll.mjs --project <id|group/path> --mr <iid> [--bots a,b] [--threshold warning] [--max 40] [--sleep 45] [--no-wait] [--out file]\n');
    process.exit(2);
  }
  const bots = String(values.bots || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const deps = makeDefaultDeps();
  const result = await harvestGitlabFindings(
    {
      project: values.project,
      mr: values.mr,
      threshold: /** @type {any} */ (values.threshold),
      bots,
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
    `MR !${result.mr}: ${result.report.summary.total} finding(s) ` +
      `(${result.report.summary.blockers} blocker / ${result.report.summary.warnings} warning / ${result.report.summary.nits} nit)` +
      (result.waited ? `, bot note ${result.waited.present ? 'present' : 'ABSENT'}` : ', wait skipped')
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    process.stderr.write(`[gitlab-bot-poll] error: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}
