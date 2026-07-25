// derive-from-scratch grounding consumer (issue #2373, Ideas #2372): proves the
// relay grounding can CONSUME a first-commit born-from-scratch `lvkit generate`
// (retrieved from the shipped lvkit-vi-scan@v1 store) as valid grounding, instead
// of a diff. This is the "relay grounding can consume a born-from-scratch
// generate" acceptance item.
//
// Flow (all real): re-derive the VI's content signature from its first-commit git
// blob -> read the born-from-scratch generate envelope from the SHIPPED store
// (createDefaultLvkitViScanStore.get, exactly as get_vi_generated_code does) ->
// build a compact born-from-scratch grounding from the generated Python -> prompt
// a local Ollama model with the evidence-r2 scaffold adapted for a NEW (parentless)
// VI -> validate the reply against the shipped vihs-relay@v1 schema (never trust
// the model). No diff is involved; the grounding IS the generate.
//
// Prototype harness (.mjs, inventory-exempt; not shipped, not in npm test). Run
// from the repo root AFTER `npm run compile`, with the born-from-scratch store
// already populated (prototype/deriveFromScratchGenerate.mjs) and Ollama serving:
//   node prototype/relayFirstCommitGrounding.mjs
//
// Env:
//   VIHS_FCG_REPO     corpus git repo (default ~/repos/SerialPortNuggets)
//   VIHS_FCG_COMMIT   the VI's first (born) commit (default 06939af)
//   VIHS_FCG_VI       repo-relative VI path (default a clean SPN generate)
//   VIHS_OLLAMA_URL / VIHS_OLLAMA_MODEL  (defaults http://localhost:11434 / llama3.1:8b)
//   VIHS_FCG_OUT      write the typed evidence JSON here
//
// Exit 0 when a valid envelope was produced; 1 when not; 2 on preflight (no
// compiled store / store miss / Ollama unreachable).

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { extractEnvelope, validate, normalizeEnvelope, SCHEMA } from './relay.mjs';

const REPO = process.cwd();
const CORPUS = process.env.VIHS_FCG_REPO || path.join(os.homedir(), 'repos', 'SerialPortNuggets');
const COMMIT = process.env.VIHS_FCG_COMMIT || '06939af';
const VI = process.env.VIHS_FCG_VI || 'ASCII/Message/Write ASCII Message.vi';
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
const OUT = process.env.VIHS_FCG_OUT || '';

const log = (m) => process.stderr.write('[first-commit-grounding] ' + m + '\n');

async function loadCompiled(rel) {
  const f = path.join(REPO, 'out', 'semantic', 'lvkit', rel);
  if (!fs.existsSync(f)) {
    log(`missing out/semantic/lvkit/${rel}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return import(path.sep === '\\' ? 'file://' + f.replace(/\\/g, '/') : f);
}

function firstCommitContentSignature() {
  const bytes = execFileSync('git', ['-C', CORPUS, 'cat-file', '-p', `${COMMIT}:${VI}`], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024
  });
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
}

// A compact born-from-scratch grounding built from the generate envelope: the
// VI's own generated Python (primary module) plus the module inventory. This is
// the parentless analogue of the diff fact sheet.
function compactBornGrounding(envelope) {
  return {
    vi: path.basename(VI),
    bornCommit: COMMIT.slice(0, 12),
    contentSignature: envelope.contentSignature,
    moduleCount: envelope.moduleCount,
    resolvedModuleCount: envelope.resolvedModuleCount,
    errorModuleCount: envelope.errorModuleCount,
    primaryModulePath: envelope.primaryModule ? envelope.primaryModule.relativePath : null,
    modulePaths: envelope.modules.map((m) => m.relativePath),
    primaryModulePython: envelope.primaryModule ? envelope.primaryModule.python : null
  };
}

const SYSTEM =
  'You are a LabVIEW VI reviewer. You are given the FULL lvkit `generate` output (Python mirroring the block diagram) of a VI at its FIRST commit -- it is born from scratch and has NO parent to diff. Base every statement strictly on the provided generated code -- never invent behavior.';

function bornR2Prompt(groundingText) {
  return `This VI is at its FIRST commit (born from scratch; there is no prior revision to diff). Review its full lvkit generate output and end with ONE fenced \`\`\`vihs-relay\`\`\` JSON block. Required fields: schema="${SCHEMA}", from="ollama", kind="RESULT", summary (one line describing what the NEW VI does). Populate evidence[] with one entry PER NOTABLE generated element (name = the element, e.g. subvi-call / control / constant / loop; result = the grounded detail from the generated code); do not leave evidence[] empty when the code has content. For any other optional field you have nothing for, omit it or use "" -- never null.\nborn-from-scratch generate (JSON):\n\`\`\`json\n${groundingText}\n\`\`\``;
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
  if (!res.ok) throw new Error('ollama /api/chat ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  return j.message?.content ?? '';
}

async function main() {
  const { createDefaultLvkitViScanStore } = await loadCompiled('lvkitViScanStore.js');
  const store = createDefaultLvkitViScanStore(CORPUS);

  const contentSignature = firstCommitContentSignature();
  const envelope = await store.get(VI, contentSignature);
  if (!envelope) {
    log(`store MISS for ${VI} @ ${contentSignature.slice(0, 20)} -- populate it first via prototype/deriveFromScratchGenerate.mjs`);
    process.exit(2);
  }
  log(`store HIT: ${path.basename(VI)} modules=${envelope.moduleCount} resolved=${envelope.resolvedModuleCount} err=${envelope.errorModuleCount}`);

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

  const grounding = compactBornGrounding(envelope);
  const groundingText = JSON.stringify(grounding, null, 2);
  const reply = await ollamaChat(bornR2Prompt(groundingText));
  const env = extractEnvelope(reply);
  const evidence = {
    schema: 'vi-history-suite/relay-first-commit-grounding@v1',
    generatedAt: new Date().toISOString(),
    model: MODEL,
    vi: VI,
    bornCommit: COMMIT,
    groundingSource: 'lvkit-vi-scan@v1 store (get_vi_generated_code path)',
    storeContentSignature: contentSignature,
    ok: false,
    errors: null,
    envelope: null
  };
  if (!env) {
    evidence.errors = ['no fenced vihs-relay block found'];
  } else {
    const errors = validate(env);
    if (errors.length) {
      evidence.errors = errors;
      evidence.envelope = env;
    } else {
      evidence.ok = true;
      evidence.envelope = normalizeEnvelope(env);
    }
  }

  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + '\n');
    log(`evidence -> ${OUT}`);
  }
  console.log(
    JSON.stringify(
      {
        ok: evidence.ok,
        vi: path.basename(VI),
        groundingSource: evidence.groundingSource,
        errors: evidence.errors,
        validEnvelope: evidence.ok ? evidence.envelope : null
      },
      null,
      2
    )
  );
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((e) => {
  log('FATAL ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
