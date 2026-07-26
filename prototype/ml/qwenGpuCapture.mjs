#!/usr/bin/env node
// prototype/ml/qwenGpuCapture.mjs
//
// task qwen-gpu-capture (LINUX GPU lane) -- the GPU analog of WIN's CPU co-capture
// (prototype/mprr/coCaptureExperiment.mjs @9b1d3e4d). WIN's perfmonSampleSeries captures
// CPU (perfmon PDH-CSV) across PHASE/CYCLE transitions into a named run-root; this captures
// GPU telemetry (nvidia-smi CSV) DURING each qwen inference, phase-tagged PER INFERENCE CYCLE
// (per VI), into a run-root, then correlates GPU/VRAM/offload state to the invented-number
// OUTCOME so a future agent reads GPU-metadata-between-cycles the way WIN's per-phase CPU does.
//
// gpu-sample-series@v1 is the deliberate sibling of perfmon-sample-series@v1: schema id +
// schemaVersion, intervalMs, sampleCount, t[] (elapsed ms), named `series` parallel arrays,
// generic `channels` superset, and per-series `peaks`. Phases carry per-VI GPU slices + the
// governed faithfulness gate outcome (noInventedNumbers) so the invented-number hazard is
// correlated to residency, not asserted.
//
// TROUBLESHOOTING QUESTIONS this answers (WIN's directive):
//   Q1 RESIDENCY  : is qwen2.5:14b fully GPU-resident or spilling? (ollama ps offload split)
//   Q2 CORRELATION: does GPU util/VRAM/offload differ on the FAILING VI vs a PASSING VI?
//   Q3 DETERMINISM: is the invented number deterministic under stable residency? (--repeats)
//   Q4 FIXABILITY : does the invented number depend on offload fraction? (--offload-sweep)
//
// Pure core (parseGpuCsv / slicePhaseStats / buildVerdict) is network-free + exported for tests;
// only main() spawns nvidia-smi + calls ollama. Run from repo root AFTER `npm run compile`
// (imports out/semantic/viSemanticModel.js):
//   node prototype/ml/qwenGpuCapture.mjs --model qwen2.5:14b \
//     --fixtures ie-visibletextmarker,ie-mousedown,ie-lv-icon [--repeats 3] [--offload-sweep ie-visibletextmarker]
// Env: OLLAMA_URL (default http://localhost:11434), QGC_OUT (run-root override).

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { buildViSemanticComparisonModelFromHtml } from '../../out/semantic/viSemanticModel.js';
import {
  buildGroundedNarrativeFacts,
  groundTruthForModel,
  GROUNDED_NARRATIVE_PROMPT
} from './groundedNarrativeProvider.mjs';
import { SYSTEM } from './vichangeEvalCore.mjs';
import { scoreNarrative } from './narrativeQualityGate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURE_DIR = join(REPO_ROOT, 'prototype', 'win-lvkit', 'correlation-fixtures');

export const GPU_SAMPLE_SERIES_SCHEMA = 'vi-history-suite/gpu-sample-series@v1';
export const GPU_SAMPLE_SERIES_SCHEMA_VERSION = 1;
export const QWEN_GPU_CAPTURE_SCHEMA = 'vi-history-suite/qwen-gpu-capture@v1';

// nvidia-smi --query-gpu columns, in order. The named series mirror perfmon's plot-ready keys.
export const GPU_QUERY_COLUMNS = Object.freeze([
  { csv: 'timestamp', key: null },
  { csv: 'utilization.gpu', key: 'gpuUtilPct' },
  { csv: 'memory.used', key: 'memUsedMb' },
  { csv: 'memory.total', key: 'memTotalMb' },
  { csv: 'temperature.gpu', key: 'tempC' },
  { csv: 'power.draw', key: 'powerW' },
  { csv: 'clocks.sm', key: 'clockSmMhz' }
]);

const NUMERIC_KEYS = GPU_QUERY_COLUMNS.filter((c) => c.key).map((c) => c.key);

/** Parse an nvidia-smi local timestamp `YYYY/MM/DD HH:MM:SS.fff` to epoch ms (local, like Date.now). */
export function parseNvidiaTimestampMs(raw) {
  const t = new Date(String(raw).trim()).getTime();
  return Number.isFinite(t) ? t : null;
}

const num = (s) => {
  const v = Number(String(s).trim());
  return Number.isFinite(v) ? v : null;
};

const median = (xs) => {
  const a = xs.filter((n) => Number.isFinite(n)).slice().sort((p, q) => p - q);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const stats = (xs) => {
  const a = xs.filter((n) => Number.isFinite(n));
  if (!a.length) return { mean: null, peak: null, min: null, n: 0 };
  return {
    mean: Number((a.reduce((s, v) => s + v, 0) / a.length).toFixed(2)),
    peak: Math.max(...a),
    min: Math.min(...a),
    n: a.length
  };
};

/**
 * Parse the nvidia-smi `--format=csv,noheader,nounits -l` stream into a gpu-sample-series@v1.
 * Pure: text in, series out. `epochMs` (wall-clock) is retained alongside `t` (elapsed) so phase
 * windows recorded with Date.now() align to samples on a shared epoch axis.
 */
export function parseGpuCsv(csvText) {
  const rows = String(csvText)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((c) => c.trim()));
  const epochMs = [];
  const series = {};
  for (const k of NUMERIC_KEYS) series[k] = [];
  for (const cols of rows) {
    if (cols.length < GPU_QUERY_COLUMNS.length) continue;
    const ts = parseNvidiaTimestampMs(cols[0]);
    if (ts === null) continue;
    epochMs.push(ts);
    for (let i = 1; i < GPU_QUERY_COLUMNS.length; i += 1) {
      series[GPU_QUERY_COLUMNS[i].key].push(num(cols[i]));
    }
  }
  const t0 = epochMs.length ? epochMs[0] : 0;
  const t = epochMs.map((e) => e - t0);
  const deltas = [];
  for (let i = 1; i < epochMs.length; i += 1) deltas.push(epochMs[i] - epochMs[i - 1]);
  const peaks = {};
  for (const k of NUMERIC_KEYS) peaks[k] = stats(series[k]).peak;
  const channels = NUMERIC_KEYS.map((k) => ({ name: k, samples: series[k], peak: peaks[k] }));
  return {
    schema: GPU_SAMPLE_SERIES_SCHEMA,
    schemaVersion: GPU_SAMPLE_SERIES_SCHEMA_VERSION,
    intervalMs: Math.round(median(deltas)),
    sampleCount: epochMs.length,
    t,
    epochMs,
    series,
    channels,
    peaks
  };
}

/** Slice the series to samples whose epochMs falls in [startMs, endMs]; per-key mean/peak/min. */
export function slicePhaseStats(seriesObj, startMs, endMs) {
  const idx = [];
  for (let i = 0; i < seriesObj.epochMs.length; i += 1) {
    if (seriesObj.epochMs[i] >= startMs && seriesObj.epochMs[i] <= endMs) idx.push(i);
  }
  // Fall back to the nearest single sample when the inference was shorter than one sampling tick.
  if (!idx.length && seriesObj.epochMs.length) {
    let best = 0;
    let bestD = Infinity;
    const mid = (startMs + endMs) / 2;
    for (let i = 0; i < seriesObj.epochMs.length; i += 1) {
      const d = Math.abs(seriesObj.epochMs[i] - mid);
      if (d < bestD) { bestD = d; best = i; }
    }
    idx.push(best);
  }
  const out = { sampleCount: idx.length };
  for (const k of NUMERIC_KEYS) out[k] = stats(idx.map((i) => seriesObj.series[k][i]));
  return out;
}

/**
 * Verdict on the invented-number hazard from the correlated phases (+ optional offload sweep):
 * if inventing and passing phases share the same residency band, and the invented number persists
 * across offload fractions, the hazard is backend-independent model-content (drop-as-generator
 * stands). If the swept VI invents at some offload points and is clean at others within one run,
 * a single run cannot separate offload-dependence from run-context nondeterminism, so it is
 * flagged offload-or-run-context-variant (drop-as-generator still stands; needs multi-run evidence).
 */
export function buildVerdict(phases, offloadSweep) {
  const inventing = phases.filter((p) => !p.gatedSafe);
  const passing = phases.filter((p) => p.gatedSafe);
  const offloadOf = (ps) => ps.map((p) => p.offloadPctGpu).filter((v) => Number.isFinite(v));
  const invBand = offloadOf(inventing);
  const passBand = offloadOf(passing);
  const bandsOverlap =
    invBand.length && passBand.length
      ? Math.max(...invBand) >= Math.min(...passBand) && Math.max(...passBand) >= Math.min(...invBand)
      : null;
  const sweepInventedSet = new Set((offloadSweep?.samples || []).map((s) => (s.invented.length ? 'invents' : 'clean')));
  const sweepInvariant = offloadSweep ? sweepInventedSet.size === 1 && sweepInventedSet.has('invents') : null;
  // For the swept VI, combine its auto-residency PHASE outcomes with the forced-offload SWEEP
  // samples into one offload -> invents? map: this is what separates offload-invariance from
  // an offload-dependent-looking mix (which a single run cannot distinguish from run-context
  // nondeterminism -- see qwen-lv-icon-context-variance.json).
  const sweptPoints = offloadSweep
    ? [
        ...phases.filter((p) => p.vi === offloadSweep.vi).map((p) => !p.gatedSafe),
        ...(offloadSweep.samples || []).map((s) => Boolean(s.invented && s.invented.length))
      ]
    : [];
  const sweptOutcomeSet = new Set(sweptPoints);
  const sweepInvents = (offloadSweep?.samples || []).some((s) => s.invented && s.invented.length);
  const anyInvent = inventing.length > 0 || sweepInvents;
  let inventedNumberHazard = 'inconclusive';
  const rationale = [];
  if (!anyInvent) {
    inventedNumberHazard = 'not-reproduced';
    rationale.push('neither the phases nor the offload sweep tripped the noInventedNumbers gate in this run');
  } else if (sweptOutcomeSet.size > 1) {
    // The swept VI invents at some offload points and is clean at others WITHIN this single run.
    inventedNumberHazard = 'offload-or-run-context-variant';
    rationale.push('the swept VI invents at some offload points and is clean at others within a single run; a single run cannot separate true offload-dependence from run-context nondeterminism -- gather multi-run evidence (see qwen-lv-icon-context-variance.json, where this VI flips even at a fixed 70% offload)');
  } else if (sweepInvariant === true) {
    inventedNumberHazard = 'backend-independent-model-content';
    rationale.push('invented number persists across the full feasible offload range (0% GPU CPU-only through max-feasible GPU)');
    if (bandsOverlap === true) {
      rationale.push('inventing and passing VIs sampled at the same GPU residency band -> residency does not separate the outcome');
    }
  } else if (bandsOverlap === true) {
    inventedNumberHazard = 'backend-independent-model-content';
    rationale.push('inventing and passing VIs sampled at the same GPU residency band -> residency does not separate the outcome');
  }
  const recommendation =
    inventedNumberHazard === 'backend-independent-model-content'
      ? 'drop qwen2.5:14b as GENERATOR stands (invented-number is model-content, not offload-fixable); keep as JUDGE'
      : inventedNumberHazard === 'offload-or-run-context-variant'
        ? 'drop qwen2.5:14b as GENERATOR stands (unreliable: invented content flips by run context at fixed offload); keep as JUDGE'
        : inventedNumberHazard === 'not-reproduced'
          ? 'invented-number hazard did not surface in this run -- re-run or widen fixtures'
          : 'inconclusive -- gather more offload-sweep points';
  return { inventedNumberHazard, bandsOverlap, offloadSweepInvariant: sweepInvariant, sweptViOutcomeMixed: sweptOutcomeSet.size > 1, invBand, passBand, rationale, recommendation };
}

// ---------------------------------------------------------------------------
// Orchestration (network + spawn). Everything above is pure + unit-testable.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
    a[key] = next;
  }
  return a;
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

function fixtureModelFacts(slug) {
  const file = join(FIXTURE_DIR, `${slug}.labview-diff-report.html`);
  if (!existsSync(file)) throw new Error(`fixture not found: ${file}`);
  const html = readFileSync(file, 'utf8');
  const cosmetic = parseLabviewDiffReportCounts(html).cosmetic;
  const model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: `${slug}.labview-diff-report.html` });
  const facts = buildGroundedNarrativeFacts(model, cosmetic);
  const groundTruth = groundTruthForModel(model, cosmetic);
  return { model, facts, groundTruth, cosmetic };
}

async function ollamaChat(model, facts, numGpu) {
  const options = { temperature: 0, seed: 0 };
  if (Number.isFinite(numGpu)) options.num_gpu = numGpu;
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: '5m',
      options,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${GROUNDED_NARRATIVE_PROMPT}\n\n${facts}` }
      ]
    })
  });
  const j = await resp.json();
  if (j.error) throw new Error(String(j.error));
  return (j.message && j.message.content) || '';
}

async function ollamaResidency(model) {
  try {
    const j = await (await fetch(`${OLLAMA_URL}/api/ps`)).json();
    const m = (j.models || []).find((x) => x.name && x.name.includes(model.split(':')[0]));
    if (!m || !m.size) return { offloadPctGpu: null, vramGb: null, sizeGb: null };
    return {
      offloadPctGpu: Math.round((100 * m.size_vram) / m.size),
      vramGb: Number((m.size_vram / 1e9).toFixed(2)),
      sizeGb: Number((m.size / 1e9).toFixed(2))
    };
  } catch {
    return { offloadPctGpu: null, vramGb: null, sizeGb: null };
  }
}

async function unload(model) {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0 })
    });
  } catch { /* ignore */ }
}

function inventedNumbers(narrative, allowed) {
  const set = new Set(allowed.map(Number));
  return (String(narrative).match(/\d+/g) || []).map(Number).filter((n) => n > 1 && !set.has(n));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = typeof args.model === 'string' ? args.model : 'qwen2.5:14b';
  const fixtures = (typeof args.fixtures === 'string' ? args.fixtures : 'ie-visibletextmarker,ie-mousedown,ie-lv-icon')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const repeats = Number.isFinite(Number(args.repeats)) ? Math.max(1, Number(args.repeats)) : 1;
  const sweepSlug = typeof args.offloadSweep === 'string' ? args.offloadSweep : null;
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runRoot = resolve(REPO_ROOT, process.env.QGC_OUT || join('prototype', 'gpu-capture', `${model.replace(/[:.]/g, '-')}-${runId}`));
  mkdirSync(runRoot, { recursive: true });
  const csvPath = join(runRoot, 'gpu-samples.csv');

  // Prime the model so the run's phases share one steady residency, then record it (Q1).
  process.stdout.write(`[qgc] priming ${model} ...\n`);
  await ollamaChat(model, 'ready check', undefined).catch(() => {});
  const residency = await ollamaResidency(model);
  process.stdout.write(`[qgc] residency: ${residency.sizeGb}GB size, ${residency.offloadPctGpu}% GPU (${residency.vramGb}GB VRAM)\n`);

  // Start the background GPU sampler (nvidia-smi -l 1 -> CSV), the gpu-sample-series source.
  const query = GPU_QUERY_COLUMNS.map((c) => c.csv).join(',');
  const chunks = [];
  const sampler = spawn('nvidia-smi', [`--query-gpu=${query}`, '--format=csv,noheader,nounits', '-l', '1']);
  sampler.stdout.on('data', (d) => chunks.push(d));
  await new Promise((r) => setTimeout(r, 1200)); // let the first sample land before phase 1

  const phases = [];
  for (const slug of fixtures) {
    const { model: m, facts, groundTruth } = fixtureModelFacts(slug);
    for (let rep = 1; rep <= repeats; rep += 1) {
      const startMs = Date.now();
      const narrative = await ollamaChat(model, facts, undefined);
      const endMs = Date.now();
      const res = await ollamaResidency(model);
      const gate = scoreNarrative(narrative, groundTruth);
      const invented = inventedNumbers(narrative, groundTruth.allowedNumbers);
      phases.push({
        vi: slug,
        repeat: rep,
        startMs,
        endMs,
        durationMs: endMs - startMs,
        detailItemCount: m.totals.detailItemCount,
        allowedNumbers: groundTruth.allowedNumbers,
        invented,
        gatedSafe: !gate.failedParts.includes('noInventedNumbers'),
        failedParts: gate.failedParts,
        narrativeLen: narrative.length,
        offloadPctGpu: res.offloadPctGpu,
        vramGb: res.vramGb
      });
      process.stdout.write(`[qgc] ${slug} rep${rep}: invented=${JSON.stringify(invented)} safe=${!gate.failedParts.includes('noInventedNumbers')} ${res.offloadPctGpu}%GPU ${endMs - startMs}ms\n`);
    }
  }

  // Optional Q4 offload sweep on one VI: re-run at forced num_gpu fractions (0 = CPU-only).
  let offloadSweep = null;
  if (sweepSlug) {
    const { facts, groundTruth } = fixtureModelFacts(sweepSlug);
    const samples = [];
    for (const ng of [0, 20]) {
      await unload(model);
      const t0 = Date.now();
      const narrative = await ollamaChat(model, facts, ng).catch(() => '');
      const secs = Math.round((Date.now() - t0) / 1000);
      const res = await ollamaResidency(model);
      const invented = inventedNumbers(narrative, groundTruth.allowedNumbers);
      const gate = scoreNarrative(narrative, groundTruth);
      samples.push({
        numGpu: ng,
        offloadPctGpu: res.offloadPctGpu,
        invented,
        gatedSafe: !gate.failedParts.includes('noInventedNumbers'),
        statesStructuralCountOk: !gate.failedParts.includes('statesStructuralCount'),
        failedParts: gate.failedParts,
        narrativeLen: narrative.length,
        secs
      });
      process.stdout.write(`[qgc] sweep ${sweepSlug} num_gpu=${ng}: invented=${JSON.stringify(invented)} statesCountOk=${!gate.failedParts.includes('statesStructuralCount')} ${res.offloadPctGpu}%GPU ${secs}s\n`);
    }
    // Re-prime so the sampler tail ends on the steady auto residency.
    await ollamaChat(model, 'ready check', undefined).catch(() => {});
    // Whether the statesStructuralCount gate part FLIPS across offload fractions (WIN's
    // lv_icon offload-divergence question); combine the sweep points with the auto-residency
    // phases of the same VI so the full 0->max feasible range is covered.
    const autoStates = phases.filter((p) => p.vi === sweepSlug).map((p) => !p.failedParts.includes('statesStructuralCount'));
    const statesSet = new Set([...samples.map((s) => s.statesStructuralCountOk), ...autoStates]);
    offloadSweep = { vi: sweepSlug, samples, statesStructuralCountFlipsAcrossOffload: statesSet.size > 1 };
  }

  await new Promise((r) => setTimeout(r, 1200)); // capture the tail
  sampler.kill('SIGINT');
  await new Promise((r) => setTimeout(r, 300));
  const csvText = Buffer.concat(chunks).toString('utf8');
  writeFileSync(csvPath, csvText, 'utf8');
  const gpuSeries = parseGpuCsv(csvText);
  writeFileSync(join(runRoot, 'gpu-sample-series.json'), JSON.stringify(gpuSeries, null, 2));

  // Correlate each phase to its GPU slice.
  for (const p of phases) p.gpu = slicePhaseStats(gpuSeries, p.startMs, p.endMs);
  const verdict = buildVerdict(phases, offloadSweep);

  const manifest = {
    schema: QWEN_GPU_CAPTURE_SCHEMA,
    generatedAt: new Date().toISOString(),
    model,
    ollamaUrl: OLLAMA_URL,
    runRoot: runRoot.split(REPO_ROOT + '/').join(''),
    device: 'nvidia (see gpu-sample-series.peaks)',
    vramTotalMb: gpuSeries.peaks.memTotalMb,
    residency,
    residencyNote:
      residency.offloadPctGpu !== null && residency.offloadPctGpu < 100
        ? `${model} ${residency.sizeGb}GB exceeds ${(gpuSeries.peaks.memTotalMb / 1024).toFixed(1)}GB VRAM -> PARTIAL offload (${residency.offloadPctGpu}% GPU); full GPU residency is not achievable for this model on this GPU`
        : 'model fully GPU-resident',
    fixtures,
    repeats,
    gpuSampleSeriesRef: 'gpu-sample-series.json',
    gpuSamplesCsvRef: 'gpu-samples.csv',
    sampleCount: gpuSeries.sampleCount,
    samplingIntervalMs: gpuSeries.intervalMs,
    phases,
    offloadSweep,
    verdict
  };
  const manifestPath = join(runRoot, 'qwen-gpu-capture.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  process.stdout.write(`[qgc] VERDICT ${verdict.inventedNumberHazard}: ${verdict.recommendation}\n`);
  process.stdout.write(`[qgc] wrote ${manifestPath.split(REPO_ROOT + '/').join('')}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
