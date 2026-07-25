// Standard COPY-PASTE relay envelope for the human-in-the-loop flow.
//
// The Windows chat, the Extension Development Host Copilot chat, and the Linux
// agent all coordinate through a HUMAN who copies text between windows. To make
// that round-trip deterministic (not free-form prose that each side re-guesses),
// every relayed answer ends with ONE fenced block in a single schema-versioned
// format — `vihs-relay@v1` — that is BOTH machine-parseable and human-skimmable.
//
// One envelope, every hop: paste the block back into any chat and it parses the
// same way. This is the copy-paste sibling of the Discussions bus schema
// (`vihs-collab-msg@v1` in collab.mjs); relay is for chat↔chat via a human,
// collab-msg is for machine↔machine via GitHub Discussions.
//
// Usage (run from the repo root; no dependencies):
//   node prototype/relay.mjs suffix   [--from EDH-copilot]   # append to any prompt you hand out
//   node prototype/relay.mjs template [--from EDH-copilot --kind RESULT --topic "..."]
//   node prototype/relay.mjs parse    --file reply.txt        # validate a pasted reply (use - for stdin)
//   node prototype/relay.mjs schema                           # print the field contract
//
// Schema `vihs-relay@v1` fields (* = required):
//   schema*   "vihs-relay@v1"
//   from*     EDH-copilot | LINUX | WIN | ollama | human
//   kind*     RESULT | QUESTION | BLOCKED | NOTE | PROPOSE | ALIGN | DONE
//   summary*  one-line human summary (no newlines)
//   ts        ISO-8601 timestamp
//   topic     short subject line
//   task      work-item / board / issue id if any
//   details   free markdown: findings, verdict, reasoning
//   evidence  [ { name, input?, result } ]  — e.g. one entry per MCP tool call
//   checks    { key: true | false | null | "value" }
//   next      suggested next action ("" if none)
//   refs      [ "#2369", "<commit-sha>", "<url>" ]

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'vihs-relay@v1';
export const FROM = new Set(['EDH-copilot', 'LINUX', 'WIN', 'ollama', 'human']);
export const KIND = new Set(['RESULT', 'QUESTION', 'BLOCKED', 'NOTE', 'PROPOSE', 'ALIGN', 'DONE']);
export const REQUIRED = ['schema', 'from', 'kind', 'summary'];

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
      a[key] = val;
    }
  }
  return a;
}

// Extract the LAST fenced `vihs-relay` / `json` block whose payload carries the
// `vihs-relay@v1` schema. Taking the last match tolerates a responder that shows
// a draft earlier and the final envelope at the end of its message.
export function extractEnvelope(text) {
  const re = /```(?:vihs-relay|json)\s*(\{[\s\S]*?\})\s*```/g;
  let match;
  let found = null;
  while ((match = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && parsed.schema === SCHEMA) found = parsed;
    } catch {
      /* skip unparseable fence */
    }
  }
  return found;
}

export function validate(env) {
  const errors = [];
  if (!env || typeof env !== 'object') return ['payload is not a JSON object'];
  for (const key of REQUIRED) {
    if (env[key] === undefined || env[key] === null || env[key] === '') errors.push(`missing required field "${key}"`);
  }
  if (env.schema !== undefined && env.schema !== SCHEMA) errors.push(`schema must be "${SCHEMA}" (got "${env.schema}")`);
  if (env.from !== undefined && !FROM.has(env.from)) errors.push(`from must be one of ${[...FROM].join('|')} (got "${env.from}")`);
  if (env.kind !== undefined && !KIND.has(env.kind)) errors.push(`kind must be one of ${[...KIND].join('|')} (got "${env.kind}")`);
  if (typeof env.summary === 'string' && env.summary.includes('\n')) errors.push('summary must be a single line');
  if (env.evidence !== undefined && !Array.isArray(env.evidence)) errors.push('evidence must be an array');
  if (env.refs !== undefined && !Array.isArray(env.refs)) errors.push('refs must be an array');
  return errors;
}

// Small models (e.g. llama3.1:8b via Ollama) emit `null`/`""`/`[]`/`{}` for
// optional fields they didn't fill. Those pass validation but are noise to a
// consumer, so normalize a VALID envelope to its meaningful content: keep the
// required fields verbatim and drop optional fields that are null/empty. Never
// fabricates values — only strips absent ones.
export function normalizeEnvelope(env) {
  if (!env || typeof env !== 'object') return env;
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (REQUIRED.includes(k)) {
      out[k] = v;
      continue;
    }
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function templateEnvelope(a) {
  return {
    schema: SCHEMA,
    from: FROM.has(a.from) ? a.from : 'EDH-copilot',
    kind: KIND.has(a.kind) ? a.kind : 'RESULT',
    ts: new Date().toISOString(),
    topic: a.topic && a.topic !== true ? a.topic : '<short subject>',
    task: a.task && a.task !== true ? a.task : '',
    summary: '<one-line summary>',
    details: '<findings / verdict>',
    evidence: [{ name: '<tool-or-step>', result: '<result>' }],
    checks: {},
    next: '',
    refs: []
  };
}

function fenced(obj) {
  return '```vihs-relay\n' + JSON.stringify(obj, null, 2) + '\n```';
}

export function suffixText(from) {
  const who = FROM.has(from) ? from : 'EDH-copilot';
  return [
    '---',
    'End your reply with ONLY the fenced block below (language tag `vihs-relay`), and nothing after it,',
    'so it can be copy-pasted back verbatim into the coordinating chat and parsed deterministically.',
    'Fill EVERY field from your actual work — do not invent values. Put your narrative in `details`,',
    'one entry per tool/step OR per distinct finding in `evidence` (do not leave `evidence` empty when you',
    'have findings), pass/fail signals in `checks`, and any blocker or open',
    'question in `summary`+`details` with `kind` set to BLOCKED or QUESTION.',
    'ALWAYS emit the block even when there is nothing to report: set a summary that says so and leave `evidence` [].',
    'For any optional field you have nothing for, use an empty string "" or omit it — NEVER output null.',
    '',
    fenced({
      schema: SCHEMA,
      from: who,
      kind: 'RESULT | QUESTION | BLOCKED | NOTE | PROPOSE | ALIGN | DONE',
      ts: '<ISO-8601>',
      topic: '<short subject>',
      task: '<work-item id or empty>',
      summary: '<one line, no newlines>',
      details: '<markdown: findings, verdict, reasoning>',
      evidence: [{ name: '<tool or step>', input: '<optional>', result: '<result>' }],
      checks: { '<check>': 'true|false|null|value' },
      next: '<suggested next action or empty>',
      refs: ['<#issue, sha, or url>']
    })
  ].join('\n');
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest);

  if (cmd === 'suffix') {
    console.log(suffixText(a.from));
    return;
  }
  if (cmd === 'template') {
    console.log(fenced(templateEnvelope(a)));
    return;
  }
  if (cmd === 'schema') {
    console.log(JSON.stringify({
      schema: SCHEMA,
      required: REQUIRED,
      from: [...FROM],
      kind: [...KIND],
      optional: ['ts', 'topic', 'task', 'details', 'evidence', 'checks', 'next', 'refs']
    }, null, 2));
    return;
  }
  if (cmd === 'parse') {
    const src = a.file === '-' || a.stdin ? fs.readFileSync(0, 'utf8') : (a.file ? fs.readFileSync(String(a.file), 'utf8') : '');
    if (!src) {
      console.error('parse: provide --file <path> (or --file - for stdin)');
      process.exitCode = 2;
      return;
    }
    const env = extractEnvelope(src);
    if (!env) {
      console.error(`parse: no fenced \`${SCHEMA}\` block found in input`);
      process.exitCode = 2;
      return;
    }
    const errors = validate(env);
    if (errors.length) {
      console.error(`parse: INVALID ${SCHEMA} envelope:\n` + errors.map((e) => '  - ' + e).join('\n'));
      process.exitCode = 2;
      return;
    }
    const clean = normalizeEnvelope(env);
    console.log(`[${clean.from}] ${clean.kind}${clean.topic ? ' · ' + clean.topic : ''}${clean.task ? ' · task ' + clean.task : ''}`);
    console.log('summary: ' + clean.summary);
    if (Array.isArray(clean.evidence) && clean.evidence.length) {
      console.log('evidence:');
      for (const e of clean.evidence) console.log('  - ' + (e.name || '?') + ': ' + (typeof e.result === 'string' ? e.result : JSON.stringify(e.result)));
    }
    if (clean.checks && Object.keys(clean.checks).length) {
      console.log('checks: ' + Object.entries(clean.checks).map(([k, v]) => k + '=' + (v === true ? 'ok' : v === false ? 'FAIL' : v === null ? '-' : v)).join(', '));
    }
    if (clean.next) console.log('next: ' + clean.next);
    if (Array.isArray(clean.refs) && clean.refs.length) console.log('refs: ' + clean.refs.join(', '));
    console.log('\nOK: valid ' + SCHEMA);
    return;
  }

  console.log('usage: node prototype/relay.mjs <suffix|template|parse|schema> [--from ..] [--kind ..] [--topic ..] [--file ..]');
  process.exitCode = cmd ? 2 : 0;
}

// Run the CLI only when invoked directly, so this module can also be imported
// (e.g. by the Ollama exercise driver) to reuse extractEnvelope/validate.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
