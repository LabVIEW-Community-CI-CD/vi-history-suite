// Dataset metadata / provenance manifest generator (#ollama-ml, WIN<->LINUX collab).
// Purpose (user request): attach a metadata artifact PER DATASET so future ML sessions can
// discover and LEVERAGE previously generated datasets for transversal, iterative enrichment
// and training -- instead of regenerating from cold each session.
//
// Emits, into prototype/ml/dataset/:
//   1. Per-dataset sidecar  <datasetFile>.meta.json  (schema vi-history-suite/ml-dataset-meta@v1)
//      -- content hash, record count, record schema, full provenance, sample+task coverage,
//         eval lineage, and lineage links to the same dataset in the PREVIOUS manifest.
//   2. Index                datasets-manifest.json    (schema vi-history-suite/ml-datasets-index@v1)
//      -- every dataset + every eval artifact in one place, a UNION sample inventory (the
//         transversal view: which VIs exist and what is known about each), open task residuals
//         (byTask < 1.0 from the compare report = the next enrichment targets), and a lineage
//         block linking to the previous manifest (previousCommit, newSamplesSincePrevious,
//         carriedOverSamples) so the enrichment chain is traceable across sessions.
//
// Deterministic + idempotent: re-running with no dataset change only refreshes timestamps and
// the lineage delta. Reads the prior datasets-manifest.json (if present) BEFORE overwriting it.
//
// Run from repo root: node prototype/ml/datasetManifest.mjs
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const INDEX_PATH = path.join(OUT_DIR, 'datasets-manifest.json');
const round1 = (n) => Math.round(n * 10) / 10;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function shortId(hex) { return hex.slice(0, 12); }
function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function readJsonIfExists(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// --- Benchmark: reconstruct the agent's Invoke-Cycle timeline from the cycle meta files so the
// manifest holds GLOBAL timing + per-cycle descriptions, and -- the point -- the DEAD TIME
// between cycles (thisStart - prevEnd). Dead time is wall-clock the session spent OUTSIDE any
// instrumented cycle (uninstrumented tool calls / edits / manual steps); large gaps are flagged
// as encapsulationCandidates = work that should be wrapped in a cycle so it becomes measurable,
// and the aggregate points at the real optimization areas. Each cycle meta = {id, at (end,
// ISO+offset), elapsedSec, exitCode, hadException}; start = at - elapsedSec.
function computeBenchmark() {
  const schema = 'vi-history-suite/agent-cycle-benchmark@v1';
  const dir = process.env.VIHS_CYCLE_DIR || path.join(os.tmpdir(), 'vihs-cycles');
  const threshold = process.env.VIHS_DEADTIME_THRESHOLD ? Number(process.env.VIHS_DEADTIME_THRESHOLD) : 20;
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json')); }
  catch { return { schema, available: false, reason: 'cycle meta dir not found' }; }
  const cycles = [];
  for (const f of files) {
    const j = readJsonIfExists(path.join(dir, f));
    if (!j || !j.id || !j.at || typeof j.elapsedSec !== 'number') continue;
    const endMs = new Date(j.at).getTime();
    if (Number.isNaN(endMs)) continue;
    cycles.push({ id: j.id, endMs, startMs: endMs - j.elapsedSec * 1000, elapsedSec: j.elapsedSec, exitCode: j.exitCode ?? null, hadException: !!j.hadException });
  }
  if (!cycles.length) return { schema, available: false, reason: 'no valid cycle metas' };
  cycles.sort((a, b) => a.startMs - b.startMs);
  const describe = (id) => id.replace(/^c\d+[-_]?/i, '').replace(/[-_]/g, ' ').trim() || id;
  const firstStart = cycles[0].startMs;
  const lastEnd = Math.max(...cycles.map((c) => c.endMs));
  const wallClockSec = round1((lastEnd - firstStart) / 1000);
  const activeSec = round1(cycles.reduce((a, c) => a + c.elapsedSec, 0));
  const deadSec = round1(wallClockSec - activeSec);
  const cycleRows = cycles.map((c, i) => ({
    id: c.id, description: describe(c.id),
    startedAt: new Date(c.startMs).toISOString(), endedAt: new Date(c.endMs).toISOString(),
    elapsedSec: c.elapsedSec, exitCode: c.exitCode, hadException: c.hadException,
    deadBeforeSec: i === 0 ? null : round1((c.startMs - cycles[i - 1].endMs) / 1000)
  }));
  const gaps = cycleRows.slice(1).map((r, idx) => ({ afterCycle: cycleRows[idx].id, beforeCycle: r.id, deadSec: r.deadBeforeSec }));
  const largestGaps = [...gaps].sort((a, b) => b.deadSec - a.deadSec).slice(0, 5);
  const encapsulationCandidates = gaps.filter((g) => g.deadSec >= threshold).sort((a, b) => b.deadSec - a.deadSec);
  const encapsulatableDeadSec = round1(encapsulationCandidates.reduce((a, g) => a + g.deadSec, 0));
  const sourceLabel = process.env.VIHS_CYCLE_DIR ? '(VIHS_CYCLE_DIR)' : 'os.tmpdir()/vihs-cycles';
  return {
    schema, available: true, source: sourceLabel, note: 'benchmark excludes the manifest-writing cycle (its meta is written after this runs)',
    cycleCount: cycles.length,
    window: { firstStart: new Date(firstStart).toISOString(), lastEnd: new Date(lastEnd).toISOString(), wallClockSec },
    activeSec, deadSec,
    deadFraction: wallClockSec > 0 ? round1((deadSec / wallClockSec) * 100) / 100 : null,
    deadTimeThresholdSec: threshold,
    encapsulatableDeadSec,
    largestGaps,
    encapsulationCandidates,
    optimization: {
      note: 'encapsulationCandidates are between-cycle gaps >= deadTimeThresholdSec: wrap that work in an Invoke-Cycle so it is measured. deadFraction is the share of wall-clock spent outside any cycle.',
      worstGapSec: largestGaps.length ? largestGaps[0].deadSec : 0
    },
    cycles: cycleRows
  };
}

const SOURCE_COMMIT = gitHead();
const GENERATED_AT = new Date().toISOString();
const NODE_VERSION = process.version;
const PROVENANCE = {
  generator: 'prototype/ml/datasetManifest.mjs',
  datasetGenerator: 'prototype/ml/buildViChangeMlDataset.mjs',
  groundTruthSource: 'prototype/correlationReport.mjs over prototype/win-lvkit/correlation-fixtures',
  sourceCommit: SOURCE_COMMIT,
  nodeVersion: NODE_VERSION,
  generatedAt: GENERATED_AT
};

// --- Read the frozen eval dataset: the source of sample + task + ground-truth coverage. ---
const evalFile = path.join(OUT_DIR, 'vichange-eval-v1.jsonl');
const evalItems = fs.existsSync(evalFile) ? readJsonl(evalFile) : [];
const sampleFacts = {}; // vi basename -> ground-truth facts
const taskTypes = new Set();
const adversarialTaskTypes = new Set();
for (const it of evalItems) {
  const vi = it.vi.split('/').pop();
  taskTypes.add(it.task);
  if (it.adversarial) adversarialTaskTypes.add(it.task);
  if (!sampleFacts[vi] && it.groundTruth) {
    sampleFacts[vi] = {
      lvkitChangeCount: it.groundTruth.lvkitChangeCount,
      labview: it.groundTruth.labview,
      kinds: it.groundTruth.kinds,
      labviewSource: it.groundTruth.labviewSource
    };
  }
}
const sampleVis = Object.keys(sampleFacts).sort();

// --- Discover eval artifacts (single-model + multi-config compare reports). ---
const evalArtifacts = [];
let openResiduals = [];
for (const name of fs.readdirSync(OUT_DIR)) {
  if (!name.endsWith('.json') || name === 'datasets-manifest.json') continue;
  const j = readJsonIfExists(path.join(OUT_DIR, name));
  if (!j || typeof j.schema !== 'string' || !j.schema.startsWith('vi-history-suite/ollama-vichange-eval')) continue;
  if (j.schema.includes('compare')) {
    const configs = (j.configs || []).map((c) => ({ id: c.id, model: c.model, present: c.present, overall: c.overall ?? null, standardMean: c.standardMean ?? null, adversarialMean: c.adversarialMean ?? null, guardPass: c.regressionGuard ? c.regressionGuard.pass : null }));
    evalArtifacts.push({ file: `prototype/ml/dataset/${name}`, schema: j.schema, kind: 'multi-config-compare', evalItems: j.evalItems ?? null, configs });
    // Open residuals = any task scoring < 1.0 for any evaluated config = next enrichment targets.
    if (j.comparison) {
      for (const [task, byCfg] of Object.entries(j.comparison)) {
        for (const [cfg, score] of Object.entries(byCfg)) {
          if (typeof score === 'number' && score < 1) openResiduals.push({ task, config: cfg, score });
        }
      }
    }
  } else {
    evalArtifacts.push({ file: `prototype/ml/dataset/${name}`, schema: j.schema, kind: 'single-model', model: j.model ?? null, overall: j.baselineMeanFaithfulness ?? null, standardMean: j.standardMean ?? null, adversarialMean: j.adversarialMean ?? null });
  }
}

// --- Read the PREVIOUS index (before overwrite) to build lineage. ---
const prevIndex = readJsonIfExists(INDEX_PATH);
const prevSampleVis = prevIndex ? Object.keys(prevIndex.sampleInventory || {}) : [];
const prevByDatasetSha = {};
if (prevIndex) for (const d of prevIndex.datasets || []) prevByDatasetSha[d.file] = d.sha256;

// --- Build per-dataset sidecars for the JSONL training/eval datasets. ---
const DATASET_FILES = [
  { file: 'vichange-finetune-v1.jsonl', kind: 'finetune', recordSchema: 'openai-chat-messages' },
  { file: 'vichange-eval-v1.jsonl', kind: 'eval', recordSchema: 'vichange-eval-item' }
];
const datasetEntries = [];
for (const d of DATASET_FILES) {
  const abs = path.join(OUT_DIR, d.file);
  if (!fs.existsSync(abs)) continue;
  const buf = fs.readFileSync(abs);
  const hash = sha256(buf);
  const records = readJsonl(abs);
  const rel = `prototype/ml/dataset/${d.file}`;
  const prevSha = prevByDatasetSha[rel] || null;
  const datasetId = `${d.file.replace(/\.jsonl$/, '')}@${shortId(hash)}`;

  const meta = {
    schema: 'vi-history-suite/ml-dataset-meta@v1',
    datasetId,
    file: rel,
    kind: d.kind,
    recordSchema: d.recordSchema,
    bytes: buf.length,
    sha256: hash,
    recordCount: records.length,
    provenance: PROVENANCE,
    coverage: {
      sampleCount: sampleVis.length,
      sampleVis,
      taskTypes: [...taskTypes],
      adversarialTaskTypes: [...adversarialTaskTypes],
      groundTruthFacts: sampleFacts
    },
    evalLineage: evalArtifacts,
    lineage: {
      previousSha256: prevSha,
      changedSincePrevious: prevSha ? prevSha !== hash : null,
      derivedFrom: prevIndex ? (prevIndex.sourceCommit || null) : null
    }
  };
  fs.writeFileSync(`${abs}.meta.json`, JSON.stringify(meta, null, 2), 'utf8');

  datasetEntries.push({ datasetId, file: rel, kind: d.kind, recordSchema: d.recordSchema, sha256: hash, bytes: buf.length, recordCount: records.length, metaFile: `${rel}.meta.json` });
}

// --- Write the transversal index. ---
const newSamplesSincePrevious = sampleVis.filter((v) => !prevSampleVis.includes(v));
const carriedOverSamples = sampleVis.filter((v) => prevSampleVis.includes(v));
const index = {
  schema: 'vi-history-suite/ml-datasets-index@v1',
  generatedAt: GENERATED_AT,
  sourceCommit: SOURCE_COMMIT,
  generator: 'prototype/ml/datasetManifest.mjs',
  task: 'grounded-vi-change-faithful-summarization',
  datasets: datasetEntries,
  evalArtifacts,
  taskTypes: [...taskTypes],
  adversarialTaskTypes: [...adversarialTaskTypes],
  // Transversal sample inventory: the union view future sessions read to decide what to enrich.
  sampleInventory: sampleFacts,
  // Machine-readable next-enrichment hints.
  openResiduals,
  enrichmentGuidance: {
    note: 'Add NEW verified samples (commit a LabVIEW report HTML -> correlationReport.mjs -> buildViChangeMlDataset.mjs -> re-run this manifest). openResiduals lists task/config scores < 1.0 = the specific gaps to target.',
    residualTasks: [...new Set(openResiduals.map((r) => r.task))]
  },
  lineage: {
    previousCommit: prevIndex ? (prevIndex.sourceCommit || null) : null,
    previousGeneratedAt: prevIndex ? (prevIndex.generatedAt || null) : null,
    previousSampleCount: prevSampleVis.length,
    newSamplesSincePrevious,
    carriedOverSamples
  },
  // Agent Invoke-Cycle benchmark: global timing + per-cycle descriptions + between-cycle dead
  // time (encapsulation candidates + optimization areas). Session-scoped, reflects THIS host.
  benchmark: computeBenchmark()
};
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');

console.log('DATASET_MANIFEST_DONE datasets=' + datasetEntries.length + ' samples=' + sampleVis.length + ' tasks=' + taskTypes.size + ' evalArtifacts=' + evalArtifacts.length);
console.log('sampleVis=' + JSON.stringify(sampleVis));
console.log('openResiduals=' + JSON.stringify(openResiduals));
console.log('lineage: prevSamples=' + prevSampleVis.length + ' new=' + JSON.stringify(newSamplesSincePrevious) + ' carriedOver=' + carriedOverSamples.length);
if (index.benchmark && index.benchmark.available) {
  const b = index.benchmark;
  console.log('benchmark: cycles=' + b.cycleCount + ' wallClock=' + b.window.wallClockSec + 's active=' + b.activeSec + 's dead=' + b.deadSec + 's deadFraction=' + b.deadFraction + ' encapsulatableDead=' + b.encapsulatableDeadSec + 's (>=' + b.deadTimeThresholdSec + 's gaps=' + b.encapsulationCandidates.length + ')');
  console.log('largestGaps=' + JSON.stringify(b.largestGaps));
} else {
  console.log('benchmark: unavailable (' + (index.benchmark ? index.benchmark.reason : 'null') + ')');
}
for (const d of datasetEntries) console.log(`  ${d.datasetId} [${d.kind}] records=${d.recordCount} sha=${d.sha256.slice(0, 12)}`);
