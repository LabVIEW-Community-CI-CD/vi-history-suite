// Pre-commit LOCAL AGENT REVIEWER (prototype) — DISTINCT criteria from the
// pre-push reviewer (reviewDiff.mjs). The pre-push reviewer does the DEEP
// semantic/bot-class pass (fail-closed validation, comment/impl agreement,
// determinism, schema evolution, test contracts). THIS pre-commit reviewer does
// fast STAGED-DIFF COMMIT HYGIENE: secrets, debug leftovers, conflict markers,
// focused/skipped tests, accidental artifact adds, and encoding/mojibake — plus
// a model-judged pass (scope coherence / leftover markers) via a CLI-invokable
// local model (Ollama), which is how the pre-commit git hook shells out.
//
// Layers:
//   1. Deterministic detectors (pure, fast, always run in-hook) — this file.
//   2. Model layer (Ollama qwen2.5-coder) for judgment-only hygiene — best-effort;
//      when the model host is unreachable the deterministic layer still gates.
//
// Reuses the shared pure core from reviewDiff.mjs (validate/sort/decide/report)
// so both reviewers emit the same schema-tagged report shape.
//
// ITERATIVE STRICTNESS (shift-left): the base hygiene criteria stay disjoint from
// the pre-push semantic rubric, but this gate ALSO gets monotonically stricter
// from two downstream feeds — see LEARNED_HYGIENE_RUBRIC (Copilot PR bot) and the
// mirror of the pre-push reviewer's LEARNED_RUBRIC. A finding that escaped commit
// time and was caught later is promoted here (model-judged, warning-only) so the
// same class is flagged one gate earlier next time.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  validateFindings,
  sortFindings,
  decideBlocking,
  buildReport,
  formatHumanSummary,
  LEARNED_RUBRIC as PREPUSH_LEARNED_RUBRIC
} from './reviewDiff.mjs';

/** Pre-commit hygiene rubric — criteria DISJOINT from the pre-push semantic rubric. */
export const HYGIENE_RUBRIC = Object.freeze([
  { id: 'secret-in-diff', severity: 'blocker', deterministic: true, desc: 'A credential/token/private key appears in the staged diff.' },
  { id: 'merge-conflict-marker', severity: 'blocker', deterministic: true, desc: 'An unresolved git conflict marker (<<<<<<< / ======= / >>>>>>>) is staged.' },
  { id: 'focused-test', severity: 'blocker', deterministic: true, desc: 'A focused test (.only) is staged and would silently disable the rest of the suite.' },
  { id: 'debugger-statement', severity: 'blocker', deterministic: true, desc: 'A `debugger;` statement is staged in source.' },
  { id: 'accidental-artifact', severity: 'blocker', deterministic: true, desc: 'A generated/secret artifact path (out/, coverage/, node_modules/, .lvkit/, *.vsix, .env) is staged.' },
  { id: 'debug-logging', severity: 'warning', deterministic: true, desc: 'A console.log/console.debug is staged in non-test source.' },
  { id: 'skipped-test', severity: 'warning', deterministic: true, desc: 'A skipped test (.skip) is staged.' },
  { id: 'encoding-mojibake', severity: 'warning', deterministic: true, desc: 'Mojibake / replacement characters staged in a text file (encoding corruption).' },
  { id: 'scope-coherence', severity: 'warning', deterministic: false, desc: 'The staged change mixes unrelated concerns that should be separate commits.' },
  { id: 'leftover-marker', severity: 'warning', deterministic: false, desc: 'A TODO/FIXME/XXX/HACK left in the staged code without an issue reference.' }
]);

// ---------------------------------------------------------------------------
// ITERATIVE-STRICTNESS LEDGER (the deliverable) — two downstream feeds promoted
// to commit time. Both are MODEL-JUDGED (deterministic:false) and default to
// `warning` (never a hard blocker) so an early best-effort semantic check can
// never wedge a commit on a nuance; the deterministic hygiene blockers still gate.
// ---------------------------------------------------------------------------

// FEED 1 — Copilot PR bot. Hygiene/commit-time-checkable classes the GitHub
// Copilot reviewer raised on a real PR that this gate did not catch. Each cites
// `source` (PR + symbol) so every strictness increment is auditable.
/** @type {readonly {id:string,severity:string,deterministic:boolean,desc:string,source:string,promotedFrom:string}[]} */
export const LEARNED_HYGIENE_RUBRIC = Object.freeze([
  {
    id: 'escape-backslash-before-other-escapes',
    severity: 'warning',
    deterministic: false,
    desc: 'A string sanitizer that escapes a character by prefixing a backslash must escape the backslash ITSELF FIRST (\\\\ -> \\\\\\\\), before any other backslash-based escape, or the escaping is incomplete (CodeQL js/incomplete-sanitization).',
    source: 'Copilot/CodeQL PR #750 — Markdown table-cell sanitizer escaped | but not the backslash first',
    promotedFrom: 'copilot-pr'
  }
]);

// FEED 2 — the pre-push deep reviewer. Mirror its accumulated LEARNED_RUBRIC into
// commit-time judgment rules so anything the pre-push gate learned is shifted one
// gate earlier automatically (no duplication — add the rule once in reviewDiff.mjs).
/** @param {{id:string,title:string,guidance:string,source?:string}} rule */
function promoteFromPrePush(rule) {
  return Object.freeze({
    id: rule.id,
    severity: 'warning',
    deterministic: false,
    desc: `${rule.title}: ${rule.guidance}`,
    source: rule.source ?? 'pre-push reviewer',
    promotedFrom: 'pre-push'
  });
}

/** The learned rules promoted from the pre-push reviewer's LEARNED_RUBRIC. */
export const PROMOTED_FROM_PREPUSH = Object.freeze(
  (Array.isArray(PREPUSH_LEARNED_RUBRIC) ? PREPUSH_LEARNED_RUBRIC : []).map(promoteFromPrePush)
);

/**
 * The active hygiene rubric the model layer enforces: the disjoint base PLUS both
 * downstream feeds, deduped by id (base wins, then pre-push, then Copilot-PR) so a
 * class promoted from two feeds is only asked for once.
 * @type {readonly {id:string,severity:string,deterministic:boolean,desc:string,source?:string,promotedFrom?:string}[]}
 */
export const ACTIVE_HYGIENE_RUBRIC = Object.freeze(
  (() => {
    const byId = new Map();
    for (const rule of [...HYGIENE_RUBRIC, ...PROMOTED_FROM_PREPUSH, ...LEARNED_HYGIENE_RUBRIC]) {
      if (!byId.has(rule.id)) byId.set(rule.id, rule);
    }
    return [...byId.values()];
  })()
);

const SECRET_PATTERNS = [
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, msg: 'private key' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, msg: 'GitHub PAT (ghp_)' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/, msg: 'GitHub fine-grained PAT' },
  { re: /\bglpat-[A-Za-z0-9_-]{20}\b/, msg: 'GitLab PAT (glpat-)' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, msg: 'AWS access key id' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, msg: 'Slack token' },
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, msg: 'JWT' },
  { re: /(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"]{6,}['"]/i, msg: 'hard-coded credential assignment' }
];

const ARTIFACT_PATH = /(?:^|\/)(?:out|coverage|node_modules|dist)\/|\.lvkit\/|\.vsix$|(?:^|\/)\.env(?:\.[^/]+)?$|(?:^|\/)npm-debug\.log$/;

// Paths the reviewer must NOT scan: its own home (which by construction contains
// the pattern DEFINITIONS + test fixtures the detectors match on — the classic
// linter-self-reference problem). A deployed reviewer lives outside the scanned
// tree; callers may extend this via options.excludePaths.
const SELF_EXCLUDE_PATHS = ['prototype/local-review/'];

function isExcludedPath(file, extra = []) {
  const path = typeof file === 'string' ? file : '';
  return [...SELF_EXCLUDE_PATHS, ...extra].some((frag) => path.includes(frag));
}

// Inline suppression: a line carrying `hygiene-allow` (optionally
// `hygiene-allow:<ruleId>`) is exempt (mirrors eslint-disable-line intent).
function lineAllows(text, ruleId) {
  const m = /hygiene-allow(?::([a-z-]+))?/i.exec(text);
  if (!m) return false;
  return m[1] === undefined || m[1] === ruleId;
}

function isTestFile(file) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)tests?\//.test(file);
}

function isSourceFile(file) {
  return /\.[cm]?[jt]sx?$/.test(file);
}

/**
 * Iterate the ADDED lines of a unified diff, yielding { file, line, text } where
 * `line` is the new-file line number. Skips the `+++` header lines.
 */
export function* iterateAddedLines(diff) {
  if (typeof diff !== 'string') {
    throw new Error('iterateAddedLines requires a string diff.');
  }
  let file = null;
  let newLine = 0;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) {
      const m = /^\+\+\+ (?:b\/)?(.*)$/.exec(raw);
      file = m ? m[1].trim() : null;
      continue;
    }
    if (raw.startsWith('--- ')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+')) {
      yield { file, line: newLine, text: raw.slice(1) };
      newLine += 1;
    } else if (!raw.startsWith('-')) {
      newLine += 1;
    }
  }
}

/**
 * Pure deterministic hygiene scan over a staged change set. Returns raw findings
 * (not yet validated). Fast — no model, no I/O.
 */
export function detectHygieneFindings(changeSet, options = {}) {
  if (typeof changeSet !== 'object' || changeSet === null) {
    throw new Error('detectHygieneFindings requires a change set object.');
  }
  const files = Array.isArray(changeSet.files) ? changeSet.files : [];
  const diff = typeof changeSet.diff === 'string' ? changeSet.diff : '';
  const extra = Array.isArray(options.excludePaths) ? options.excludePaths : [];
  const findings = [];

  // Path-level: accidental artifact/secret-file adds.
  for (const file of files) {
    const path = typeof file === 'string' ? file : file?.path;
    if (typeof path === 'string' && !isExcludedPath(path, extra) && ARTIFACT_PATH.test(path)) {
      findings.push({ file: path, line: null, severity: 'blocker', ruleId: 'accidental-artifact', message: `Staged a generated/secret artifact path: ${path}. Do not commit it (add to .gitignore).` });
    }
  }

  // Line-level: scan added lines.
  for (const { file, line, text } of iterateAddedLines(diff)) {
    if (isExcludedPath(file, extra)) continue;
    const add = (severity, ruleId, message) => {
      if (!lineAllows(text, ruleId)) findings.push({ file, line, severity, ruleId, message });
    };
    for (const { re, msg } of SECRET_PATTERNS) {
      if (re.test(text)) {
        add('blocker', 'secret-in-diff', `Possible ${msg} in staged diff — never commit credentials.`);
        break;
      }
    }
    if (/^(?:<{7}|={7}|>{7})(?:\s|$)/.test(text)) {
      add('blocker', 'merge-conflict-marker', 'Unresolved merge-conflict marker staged.');
    }
    if (isTestFile(file ?? '')) {
      if (/\b(?:it|describe|test|context)\.only\b|\.only\s*\(/.test(text)) {
        add('blocker', 'focused-test', 'Focused test (.only) staged — it disables the rest of the suite.');
      }
      if (/\b(?:it|describe|test|context)\.skip\b|\.skip\s*\(|\bxit\b|\bxdescribe\b/.test(text)) {
        add('warning', 'skipped-test', 'Skipped test (.skip) staged — confirm this is intentional.');
      }
    } else if (isSourceFile(file ?? '')) {
      if (/\bconsole\.(?:log|debug)\s*\(/.test(text)) {
        add('warning', 'debug-logging', 'console.log/console.debug staged in source — remove or use the logger.');
      }
      if (/\bdebugger\s*;?/.test(text)) {
        add('blocker', 'debugger-statement', '`debugger;` staged in source.');
      }
    }
    if (/\uFFFD/.test(text) || /Ã[©¨¤¢€]|â€|Â[^\x00-\x7F]?/.test(text)) {
      add('warning', 'encoding-mojibake', 'Mojibake / replacement character staged — likely an encoding (UTF-8) corruption.');
    }
  }
  return findings;
}

/** Build the model-layer prompt for the JUDGMENT-only hygiene criteria. */
export function buildHygieneModelPrompt(changeSet) {
  const files = (changeSet.files ?? []).map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
  const judgment = ACTIVE_HYGIENE_RUBRIC.filter((r) => !r.deterministic);
  return [
    'You are a fast pre-commit reviewer. Judge commit hygiene plus the promoted checks below, NOT a full deep review.',
    'Return ONLY JSON: {"findings":[{"file":string,"line":integer|null,"severity":"blocker"|"warning"|"nit","message":string,"ruleId":string}]}.',
    'Only report the following judgment criteria (deterministic checks are handled elsewhere):',
    ...judgment.map((r) =>
      `- [${r.id}] ${r.desc}` +
      (typeof r.promotedFrom === 'string' ? ` (promoted from ${r.promotedFrom}${r.source ? `: ${r.source}` : ''})` : '')
    ),
    'If none apply, return {"findings":[]}. Do not invent issues. Keep messages short.',
    '',
    '## STAGED FILES',
    files.join('\n') || '(none)',
    '',
    '## STAGED DIFF',
    (changeSet.diff ?? '').slice(0, 24000)
  ].join('\n');
}

/** Default CLI-invokable model call: Ollama /api/generate (format:json). */
export async function callOllama(prompt, options = {}) {
  const model = options.model ?? 'qwen2.5-coder:1.5b';
  const host = options.host ?? 'http://localhost:11434';
  const timeoutMs = options.timeoutMs ?? 60000;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = await res.json();
    return typeof data.response === 'string' ? data.response : '';
  } finally {
    clearTimeout(timer);
  }
}

/** Map the model's JSON text to raw findings, tolerating {findings:[...]} or a bare array. */
export function parseModelFindings(responseText) {
  if (typeof responseText !== 'string' || responseText.trim().length === 0) return [];
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const start = responseText.indexOf('[');
    const end = responseText.lastIndexOf(']');
    if (start === -1 || end <= start) return [];
    parsed = JSON.parse(responseText.slice(start, end + 1));
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.findings)) return parsed.findings;
  return [];
}

/**
 * Review a STAGED change set for commit. Merges deterministic hygiene findings
 * with an optional model-judged pass (deps.model(prompt) => Promise<string>).
 * The model layer is best-effort: if it throws (host down), deterministic
 * findings still gate. Returns a schema-tagged report.
 */
export async function reviewStagedForCommit(changeSet, deps = {}) {
  const deterministic = detectHygieneFindings(changeSet);
  let modelRaw = [];
  let modelError = null;
  if (typeof deps.model === 'function') {
    try {
      const text = await deps.model(buildHygieneModelPrompt(changeSet));
      modelRaw = parseModelFindings(text);
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
    }
  }
  // Deterministic findings are trusted as-is; model findings are validated
  // fail-closed (a malformed model finding is dropped, never fabricated).
  let modelValidated = [];
  try {
    modelValidated = validateFindings(modelRaw);
  } catch {
    modelValidated = [];
  }
  const findings = sortFindings([...deterministic, ...modelValidated]);
  const threshold = deps.threshold ?? 'warning';
  const report = buildReport({ findings, threshold });
  return { ...report, modelError };
}

async function main(argv) {
  const args = new Set(argv);
  const threshold = argv.includes('--threshold') ? argv[argv.indexOf('--threshold') + 1] : 'warning';
  const runGit = (gitArgs) => {
    const r = spawnSync('git', gitArgs, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };
  const nameStatus = runGit(['diff', '--cached', '--name-only']);
  const files = nameStatus.split(/\r?\n/).filter(Boolean).map((path) => ({ path }));
  const diff = runGit(['diff', '--cached', '--unified=3']);
  const useModel = !args.has('--no-model');
  const deps = { threshold };
  if (useModel) deps.model = (prompt) => callOllama(prompt, {});
  const report = await reviewStagedForCommit({ files, diff }, deps);
  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatHumanSummary(report)}\n`);
    if (report.modelError) process.stderr.write(`precommit-review: model layer skipped (${report.modelError}); deterministic checks still applied.\n`);
  }
  return report.blocking ? 1 : 0;
}

// CLI entry: fire when this module is the process entry point. Uses
// pathToFileURL so it matches on Windows (where `file://${argv[1]}` with a
// `C:\...` path never equals import.meta.url and previously no-op'd the hook).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`precommit-review error: ${error.message}\n`);
    process.exit(2);
  });
}
