// Exercise + iteratively ENHANCE the `vihs-relay@v1` response format on REAL
// hardware: a local Ollama model must turn a REAL lvkit semantic diff into a
// valid relay envelope, and the driver climbs a prompt-scaffolding LADDER until
// the real (small) model produces one that passes fail-closed validation.
//
// Grounding is REAL lvkit output, and lvkit runs INSIDE a Docker container (git
// blob extraction + `lvkit diff` staged in-container against the mounted repo) —
// lvkit is NOT required on the host. The container-staged JSON is cached so the
// Ollama iteration loop can re-run fast without re-invoking the container.
//
// AI design (same split as the Ollama MCP bridge): the MODEL owns intent + prose;
// the DRIVER owns environment (container staging, the real grounding) and the
// CONTRACT (the envelope schema + validation). We do not accept the model's word
// that it produced valid output — we parse + validate every attempt.
//
// Prototype harness (.mjs, inventory-exempt; not shipped, not in npm test). Run
// from the repo root AFTER `npm run compile`, with Docker in LINUX-engine mode
// and Ollama serving a tool-capable model:
//   node prototype/relayLvkitOllamaExercise.mjs
//
// Env:
//   LVKIT_DOCKER_IMAGE   container image with `lvkit` (and git) on PATH  [REQUIRED for a live stage]
//   VIHS_MCP_REPO        git repo holding the VI (default C:\repos\labview-icon-editor | ~/repos/...)
//   VIHS_RELAY_VI        repo-relative .vi path (default resource/plugins/lv_icon.vi)
//   VIHS_RELAY_BASE      base git revision (default 537683398d8c)
//   VIHS_RELAY_SELECTED  selected git revision (default fc09736ae5e3)
//   VIHS_RELAY_LVKIT_JSON  use THIS pre-captured lvkit diff JSON file instead of staging (skips Docker)
//   VIHS_CACHE_DIR       vihs cache root (default <repo>/.vihs/cache, mirroring lvkit's <repo>/.lvkit/cache)
//   VIHS_RELAY_LVKIT_CACHE override the staged-diff JSON cache path
//   VIHS_RELAY_REFRESH   "1" to re-stage even if the cache exists
//   VIHS_OLLAMA_URL      Ollama base URL (default http://localhost:11434)
//   VIHS_OLLAMA_MODEL    tool-capable model (default llama3.1:8b)
//   VIHS_RELAY_OUT       write the typed exercise evidence JSON to this path
//
// The vihs cache lives under <repo>/.vihs/cache (a sibling of lvkit's .lvkit/cache):
//   .vihs/cache/relay-lvkit/<pair>.json  the cached staged diff
//
// Exit codes: 0 a variant produced a valid envelope; 1 no variant did; 2 preflight
// (no compiled parser / no lvkit grounding obtainable / Ollama unreachable).

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { extractEnvelope, validate, normalizeEnvelope, SCHEMA } from './relay.mjs';

const REPO = process.cwd();
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
const CORPUS = process.env.VIHS_MCP_REPO || (process.platform === 'win32' ? 'C:\\repos\\labview-icon-editor' : path.join(os.homedir(), 'repos', 'labview-icon-editor'));
// Default to the repo's known lvkit-changed pair (lv_icon.vi 537683->fc09736 = 5
// changes). lvkit does a UID-correlated LOGICAL block-diagram diff, so a pair the
// LabVIEW visual compare flags can still be logically equivalent (0 changes) — the
// default is chosen to give the reviewer real changes to ground on.
const VI = process.env.VIHS_RELAY_VI || 'resource/plugins/lv_icon.vi';
const BASE = process.env.VIHS_RELAY_BASE || '537683398d8c';
const SELECTED = process.env.VIHS_RELAY_SELECTED || 'fc09736ae5e3';
const IMAGE = process.env.LVKIT_DOCKER_IMAGE || '';
const OUT = process.env.VIHS_RELAY_OUT || '';

// ── vihs cache convention (mirrors lvkit's `<repo>/.lvkit/cache`) ─────────────
// vihs stores its own cache under `<repo>/.vihs/cache`, a sibling of lvkit's
// `.lvkit/cache`. `relay-lvkit/<corpus>-<base>-<sel>.json` caches the staged diff
// so the Ollama iteration loop re-runs without re-invoking the container.
const VIHS_CACHE_ROOT = process.env.VIHS_CACHE_DIR || path.join(REPO, '.vihs', 'cache');
const CORPUS_KEY = crypto.createHash('sha256').update(path.resolve(CORPUS)).digest('hex').slice(0, 12);
const CACHE = process.env.VIHS_RELAY_LVKIT_CACHE || path.join(VIHS_CACHE_ROOT, 'relay-lvkit', `${CORPUS_KEY}-${BASE.slice(0, 8)}-${SELECTED.slice(0, 8)}.json`);

const log = (m) => process.stderr.write('[relay-exercise] ' + m + '\n');

function loadCompiled(rel) {
  const f = path.join(REPO, 'out', 'semantic', 'lvkit', rel);
  if (!fs.existsSync(f)) {
    log(`missing out/semantic/lvkit/${rel}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return import(path.sep === '\\' ? 'file://' + f.replace(/\\/g, '/') : f);
}

// ── 1. REAL lvkit grounding, staged INSIDE the container ──────────────────────
function stageLvkitInContainer() {
  // In-container staging: mount the corpus read-only, extract both revisions'
  // bytes and run lvkit inside the image (lvkit + git live in the container).
  //
  // REPRODUCIBLE scope (VHS reassessment): the corpus only carries a PARTIAL
  // mirror of `vi.lib` / `resource/plugins` — the authoritative dependency trees
  // live in the LabVIEW installs (`Program Files` / `Program Files (x86)`), which
  // a LabVIEW-free Linux container has no access to. So we deliberately do NOT
  // pass `--search-path /repo` (which makes lvkit crawl that partial mirror: same
  // result, ~75x slower). Instead we use lvkit's own machine-independent/CI mode
  // — `--load-mode minimal --no-auto-vilib` — a self-contained, faithful diff of
  // the VI's own block diagram. lvkit writes any cache under the writable /work.
  const script = [
    'git config --global --add safe.directory /repo',
    'mkdir -p /work && cd /work',
    `git -C /repo cat-file -p ${BASE}:${VI} > /work/base.vi`,
    `git -C /repo cat-file -p ${SELECTED}:${VI} > /work/sel.vi`,
    'lvkit diff /work/base.vi /work/sel.vi --format json --load-mode minimal --no-auto-vilib'
  ].join('; ');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${CORPUS}:/repo:ro`,
    IMAGE, 'sh', '-c', script
  ];

  log(`staging lvkit diff in container ${IMAGE} (in-container git+lvkit; reproducible minimal, no search-path)...`);
  return execFileSync('docker', dockerArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function obtainLvkitJson() {
  if (process.env.VIHS_RELAY_LVKIT_JSON) {
    const p = process.env.VIHS_RELAY_LVKIT_JSON;
    log(`using pre-captured lvkit JSON: ${p}`);
    return { raw: fs.readFileSync(p, 'utf8'), source: 'file:' + p };
  }
  if (fs.existsSync(CACHE) && process.env.VIHS_RELAY_REFRESH !== '1') {
    log(`using cached lvkit JSON: ${CACHE} (VIHS_RELAY_REFRESH=1 to re-stage)`);
    return { raw: fs.readFileSync(CACHE, 'utf8'), source: 'cache:' + CACHE };
  }
  if (!IMAGE) {
    log('no lvkit grounding: set LVKIT_DOCKER_IMAGE (lvkit-in-container) or VIHS_RELAY_LVKIT_JSON (pre-captured).');
    process.exit(2);
  }
  const raw = stageLvkitInContainer();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, raw);
  log(`cached staged lvkit JSON -> ${CACHE}`);
  return { raw, source: 'container:' + IMAGE };
}

// Compact the built semantic model to a lean, grounded fact sheet for the model.
function compactGrounding(model, diff) {
  return {
    vi: path.basename(VI),
    baseHash: BASE.slice(0, 12),
    selectedHash: SELECTED.slice(0, 12),
    hasDifferences: model.hasDifferences,
    changedSurfaces: model.changedSurfaces,
    changeKinds: model.changeKinds,
    riskLevel: model.riskLevel,
    totals: model.totals,
    changeCount: diff.changes.length,
    commonNodes: diff.commonNodes,
    narrative: model.narrative
  };
}

// ── 2. The prompt-scaffolding LADDER (the iterative enhancement) ──────────────
// Each rung adds the smallest extra scaffolding a small model tends to need to
// emit a schema-valid envelope. We climb only as far as required and report the
// first rung that passes — that is the evidence for how strict the format guide
// must be for a given model.
const SYSTEM = 'You are a LabVIEW VI change reviewer. You are given a REAL lvkit semantic diff of one VI (block-diagram scope). Base every statement strictly on the provided facts — never invent changes.';

const SKELETON = {
  schema: SCHEMA,
  from: 'ollama',
  kind: 'RESULT',
  ts: '<ISO-8601>',
  topic: '<short subject>',
  task: '',
  summary: '<one line, no newlines>',
  details: '<plain-language verdict grounded in the facts>',
  evidence: [{ name: 'lvkit diff', result: '<what changed>' }],
  checks: { grounded: true },
  next: '',
  refs: []
};
const EXAMPLE = {
  ...SKELETON,
  ts: '2026-01-01T00:00:00Z',
  topic: 'lv_icon.vi diff',
  summary: 'Block-diagram changed; medium risk',
  details: 'Two nodes rewired on the block diagram; no front-panel/connector change.',
  evidence: [{ name: 'lvkit diff', result: '2 changes across block-diagram surface' }],
  checks: { grounded: true, riskLevel: 'medium' }
};

function rungs(groundingText) {
  const facts = '\nlvkit facts (JSON):\n```json\n' + groundingText + '\n```';
  return [
    {
      id: 'r1-minimal',
      note: 'bare instruction + schema name',
      user: `Review this VI change and end your reply with a fenced \`vihs-relay\` block (schema ${SCHEMA}) summarizing it.${facts}`
    },
    {
      id: 'r2-fieldlist',
      note: 'explicit required fields + enums + evidence decomposition',
      user: `Review this VI change. End with ONE fenced \`\`\`vihs-relay\`\`\` JSON block. Required fields: schema="${SCHEMA}", from="ollama", kind="RESULT", summary (one line). Optional: ts, topic, details, evidence[], checks{}, next, refs[]. Populate evidence[] with one entry PER DISTINCT CHANGE in the facts (name = the change kind such as node-added / node-removed / wire-change, result = the grounded count or detail from the facts); do not leave evidence[] empty when the facts list changes. For any other optional field you have nothing for, omit it or use "" — never null.${facts}`
    },
    {
      id: 'r3-skeleton',
      note: 'fill-in skeleton, block only',
      user: `Review this VI change. Output ONLY the fenced \`\`\`vihs-relay\`\`\` block below with every value replaced by your finding (valid JSON, from="ollama", no prose before/after):\n\`\`\`vihs-relay\n${JSON.stringify(SKELETON, null, 2)}\n\`\`\`${facts}`
    },
    {
      id: 'r4-example',
      note: 'worked example + skeleton',
      user: `Here is a VALID example envelope for a different VI:\n\`\`\`vihs-relay\n${JSON.stringify(EXAMPLE, null, 2)}\n\`\`\`\nNow produce the SAME shape for THIS VI. Output ONLY the fenced \`\`\`vihs-relay\`\`\` block, valid JSON, from="ollama", grounded in the facts, nothing else.${facts}`
    }
  ];
}

async function ollamaChat(userText) {
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userText }],
      stream: false,
      options: { temperature: 0, num_ctx: 8192 }
    })
  });
  if (!res.ok) throw new Error('ollama /api/chat ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const j = await res.json();
  return j.message?.content ?? '';
}

async function main() {
  const { parseLvkitDiffJson } = await loadCompiled('lvkitDiffModel.js');
  const { buildViSemanticModelFromLvkitDiff } = await loadCompiled('lvkitSemanticAdapter.js');

  // Ollama preflight
  try {
    const tags = await (await fetch(OLLAMA + '/api/tags')).json();
    if (!(tags.models || []).some((m) => m.name === MODEL || m.name === MODEL + ':latest')) {
      log(`model ${MODEL} not in Ollama; pull it: ollama pull ${MODEL}`);
      process.exit(2);
    }
  } catch (e) {
    log(`Ollama not reachable at ${OLLAMA} (${e.message}); start it: ollama serve`);
    process.exit(2);
  }

  const { raw, source } = obtainLvkitJson();
  const diff = parseLvkitDiffJson(raw);
  const model = buildViSemanticModelFromLvkitDiff(diff, {
    title: path.basename(VI),
    firstViPath: `base:${VI}`,
    secondViPath: `selected:${VI}`,
    revisions: { baseHash: BASE, selectedHash: SELECTED }
  });
  const grounding = compactGrounding(model, diff);
  const groundingText = JSON.stringify(grounding, null, 2);
  log(`grounding: ${grounding.changeCount} changes, surfaces=${JSON.stringify(grounding.changedSurfaces)}, risk=${grounding.riskLevel}`);

  const evidence = {
    schema: 'vi-history-suite/relay-lvkit-ollama-exercise@v1',
    generatedAt: new Date().toISOString(),
    model: MODEL,
    groundingSource: source,
    grounding,
    attempts: [],
    firstValidRung: null,
    validEnvelope: null,
    ok: false
  };

  for (const rung of rungs(groundingText)) {
    log(`rung ${rung.id} (${rung.note})...`);
    const attempt = { rung: rung.id, note: rung.note, ok: false, errors: null, envelope: null, normalized: null, rawLen: 0 };
    try {
      const reply = await ollamaChat(rung.user);
      attempt.rawLen = reply.length;
      const env = extractEnvelope(reply);
      if (!env) {
        attempt.errors = ['no fenced vihs-relay block found'];
      } else {
        const errors = validate(env);
        attempt.envelope = env;
        if (errors.length) {
          attempt.errors = errors;
        } else {
          attempt.ok = true;
          attempt.normalized = normalizeEnvelope(env);
        }
      }
    } catch (e) {
      attempt.errors = [e.message];
    }
    evidence.attempts.push(attempt);
    log(`  -> ${attempt.ok ? 'VALID' : 'invalid: ' + (attempt.errors || []).join('; ')}`);
    if (attempt.ok) {
      evidence.firstValidRung = rung.id;
      evidence.validEnvelope = attempt.normalized;
      evidence.ok = true;
      break;
    }
  }

  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + '\n');
    log(`evidence -> ${OUT}`);
  }
  console.log(JSON.stringify({
    ok: evidence.ok,
    model: MODEL,
    groundingSource: source,
    grounding: { changeCount: grounding.changeCount, changedSurfaces: grounding.changedSurfaces, riskLevel: grounding.riskLevel },
    firstValidRung: evidence.firstValidRung,
    rungResults: evidence.attempts.map((a) => ({ rung: a.rung, ok: a.ok, errors: a.errors })),
    validEnvelope: evidence.validEnvelope
  }, null, 2));
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((e) => {
  log('FATAL ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
