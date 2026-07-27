#!/usr/bin/env node
// @ts-check
/**
 * ollama-local review PROVIDER for the local-review seam (prototype).
 *
 * The THIRD leg of the provider-generic seam, and a different KIND than the two
 * forge harvesters (githubBotPoll / gitlabBotPoll): those read a REMOTE bot's
 * review post-hoc, whereas this is a PROMPT reviewer -- it IS the review engine
 * behind reviewDiff's injectable `deps.review` seam. Given the reviewDiff prompt
 * (RUBRIC + diff) it asks a LOCAL Ollama model to produce findings, extracts the
 * JSON array, and lets reviewDiff.validateFindings / buildReport turn them into
 * the same report@v1 every other provider emits.
 *
 * This unifies the repo's existing local-Ollama review paths (relayPrReviewRouter,
 * precommitReview's model layer) onto the one report@v1 contract, so a future
 * agent can run a PRE-PUSH local review with the same findings shape as the
 * GitHub/GitLab bot harvests.
 *
 * Two layers, like the rest of local-review:
 *   1. PURE CORE (no I/O, deterministic): extractJsonArray (tolerant model-output
 *      -> findings array; fail-closed if the model ignores the JSON-array contract).
 *   2. IMPURE SHELL (injectable): createOllamaReviewGenerate (the ONLY network part,
 *      /api/chat), makeOllamaReviewer(deps) -> a reviewDiff ReviewFn, + a CLI that
 *      wires collectChangeSet -> reviewChangeSet -> buildReport.
 *
 * Injected `generate` makes the whole reviewer unit-testable with a fake model.
 * Cross-platform Node (no bash). Prototype .mjs (inventory-exempt, not in npm test).
 *
 * Env:  VIHS_OLLAMA_URL / OLLAMA_URL (default http://localhost:11434)
 *       VIHS_OLLAMA_MODEL (default qwen2.5-coder -- a local code model)
 *
 * @typedef {import('../reviewDiff.mjs').Finding} Finding
 */

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  collectChangeSet,
  reviewChangeSet,
  buildReport,
  formatHumanSummary,
  defaultGit,
  ACTIVE_RUBRIC,
} from '../reviewDiff.mjs';

/** System prompt reinforcing the reviewDiff output contract for a chat model. */
export const REVIEW_SYSTEM =
  'You are a strict senior code reviewer. Output ONLY a JSON array of finding objects and nothing else -- no prose, no markdown fences. ' +
  'Each finding is {"file": string, "line": integer|null, "severity": "blocker"|"warning"|"nit", "message": string, "ruleId": string}. ' +
  'file must be one of the changed files; line is the new-file line or null. If the change set is clean, output exactly [].';

/**
 * JSON schema handed to Ollama as the `format` (structured outputs) so the model
 * is CONSTRAINED to emit a findings array rather than prose. Small local models
 * routinely ignore a plain "output only JSON" instruction; a schema removes that
 * failure mode at the decode layer. Mirrors the report@v1 Finding shape.
 */
export const REVIEW_FORMAT = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      file: { type: 'string' },
      line: { type: ['integer', 'null'] },
      severity: { type: 'string', enum: ['blocker', 'warning', 'nit'] },
      message: { type: 'string' },
      ruleId: { type: 'string' },
    },
    required: ['file', 'severity', 'message'],
  },
};

// ---------------------------------------------------------------------------
// PURE CORE.
// ---------------------------------------------------------------------------

/**
 * Extract a JSON array of findings from a model's chat output, tolerant of a
 * ```json fence or surrounding prose. Fail-closed: throws if no parseable JSON
 * array is present (a reviewer that ignored the array contract is an error, not a
 * silent clean pass). An explicit empty array is a valid "clean" result.
 *
 * @param {unknown} text
 * @returns {unknown[]}
 */
export function extractJsonArray(text) {
  const s = String(text ?? '');
  /** @type {string[]} */
  const candidates = [];
  const fence = /```(?:json|jsonc)?\s*(\[[\s\S]*?\])\s*```/i.exec(s);
  if (fence) candidates.push(fence[1]);
  const first = s.indexOf('[');
  const last = s.lastIndexOf(']');
  if (first !== -1 && last > first) candidates.push(s.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('ollama reviewer output did not contain a parseable JSON array of findings');
}

// ---------------------------------------------------------------------------
// IMPURE SHELL (injectable).
// ---------------------------------------------------------------------------

/**
 * The ONLY network-touching part: a `generate(prompt) => Promise<string>` backed
 * by Ollama /api/chat (deterministic, temperature 0). Mirrors the pattern in
 * prototype/ml/groundedNarrativeProvider.createOllamaGenerate.
 *
 * @param {{ ollamaUrl?: string, model?: string, system?: string, format?: unknown }} [opts]
 * @returns {(prompt: string) => Promise<string>}
 */
export function createOllamaReviewGenerate({
  ollamaUrl = process.env.VIHS_OLLAMA_URL || process.env.OLLAMA_URL || 'http://localhost:11434',
  model = process.env.VIHS_OLLAMA_MODEL || 'qwen2.5-coder',
  system = REVIEW_SYSTEM,
  format = REVIEW_FORMAT,
} = {}) {
  return async function generate(prompt) {
    /** @type {Record<string, unknown>} */
    const body = {
      model,
      stream: false,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    };
    if (format !== null && format !== undefined) body.format = format;
    const resp = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await resp.json();
    if (j && j.error) throw new Error(String(j.error));
    return (j && j.message && j.message.content) || '';
  };
}

/**
 * Build a reviewDiff `deps.review` ReviewFn backed by a local Ollama model.
 * `deps.generate` is injectable (a fake in tests); the default is the real
 * /api/chat generator.
 *
 * @param {{ generate?: (prompt: string) => Promise<string>, ollamaUrl?: string, model?: string }} [deps]
 * @returns {(prompt: string) => Promise<unknown[]>}
 */
export function makeOllamaReviewer(deps = {}) {
  const generate = deps.generate || createOllamaReviewGenerate(deps);
  return async function ollamaReview(prompt) {
    const out = await generate(prompt);
    return extractJsonArray(out);
  };
}

// ---------------------------------------------------------------------------
// CLI: run the local pre-push review through Ollama and emit report@v1.
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'develop' },
      staged: { type: 'boolean', default: false },
      threshold: { type: 'string', default: 'warning' },
      model: { type: 'string' },
      url: { type: 'string' },
      out: { type: 'string' },
      human: { type: 'boolean', default: false },
    },
  });
  const log = (m) => process.stderr.write(`[ollama-review] ${m}\n`);
  const changeSet = await collectChangeSet({ base: values.base, staged: values.staged }, { git: defaultGit });
  log(`reviewing ${changeSet.files.length} changed file(s) vs ${values.base}${values.staged ? ' (staged)' : ''} with model ${values.model || process.env.VIHS_OLLAMA_MODEL || 'qwen2.5-coder'}`);
  const review = makeOllamaReviewer({ model: values.model, ollamaUrl: values.url });
  const findings = await reviewChangeSet(changeSet, { review, git: defaultGit }, ACTIVE_RUBRIC);
  const report = buildReport({ findings, threshold: /** @type {any} */ (values.threshold) });
  if (values.out) {
    writeFileSync(values.out, JSON.stringify(report, null, 2));
    log(`wrote report to ${values.out}`);
  }
  if (values.human) {
    process.stdout.write(formatHumanSummary(report) + '\n');
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
  log(
    `${report.summary.total} finding(s) (${report.summary.blockers} blocker / ${report.summary.warnings} warning / ${report.summary.nits} nit), blocking=${report.blocking}`
  );
  process.exit(report.blocking ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    process.stderr.write(`[ollama-review] error: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}
