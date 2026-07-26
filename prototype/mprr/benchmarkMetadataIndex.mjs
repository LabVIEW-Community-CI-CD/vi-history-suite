#!/usr/bin/env node
// Benchmark METADATA INDEX / LOCATOR (maintainer prototype tool; inventory-exempt).
//
// Why: a splash/launch-detection experiment and a perfmon-mprr benchmark are only
// useful together -- the agent needs to correlate WHEN LabVIEW opened (the splash
// frame / the LabVIEWCLI launch-timing markers) with the CPU spike the perfmon-mprr
// capture recorded. This tool LOCATES + INDEXES the previous-experiment metadata on
// THIS system into one schema-versioned JSON so the next cycle knows exactly where
// everything is and HOW to line it up on the shared epoch-ms / frame axis:
//   1. LabVIEW / LabVIEWCLI launch-timing logs -> parsed via the GOVERNED
//      parseLabVIEWLaunchTiming (labview-launch-timing@v1): process-start, init, and
//      execution-ready instants (the headless analog of the interactive splash).
//   2. The mprr benchmark: perfmon-mprr-sync@v1 (frame<->epoch axis + per-series
//      peaks incl the CPU spike) and perfmon-tdms-model@v1 (the "TDMS with the short
//      and long packets" -- the mprr rolling-block channels).
//   3. The interactive splash capture (labview-splash-capture@v1): launch epoch +
//      per-frame epochs.
//   4. A CORRELATION block (shared epoch-ms axis) + INJECTION GUIDANCE so a future
//      cycle can point LabVIEWCLI's log at a unique per-run artifacts folder.
//
// INJECTABLE RUN-ROOT: the LabVIEW log location is configurable via a LabVIEWCLI
// parameter (`-LogFilePath <path>`, echoed as "LabVIEWCLI started logging in file:").
// So a future cycle can create ONE unique artifacts folder and inject the log path
// into it, co-located with the splash frames and the perfmon-mprr output. Point this
// tool at that folder with `--run-root <dir>` and it indexes a self-contained,
// correlated experiment (falling back to the system default locations otherwise).
//
// Reuses the GOVERNED compiled parsers under out/ (run `npm run compile` first); it
// never re-implements launch-timing or epoch math. Fail-closed-graceful: a missing
// artifact is reported as { present: false, reason } rather than throwing.
//
// Usage (from repo root, after `npm run compile`):
//   node prototype/mprr/benchmarkMetadataIndex.mjs                     # index system defaults
//   node prototype/mprr/benchmarkMetadataIndex.mjs --run-root <dir>    # index an injected run folder
//   node prototype/mprr/benchmarkMetadataIndex.mjs --out <file.json> --markdown
// Overrides: --log-path <file|dir>  --mprr-dir <dir>  --splash <file>  --max-logs N  --strict

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SCHEMA = 'vi-history-suite/benchmark-metadata-index@v1';
const SCHEMA_VERSION = 1;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

// ------------------------------------------------------------------ args
function parseArgs(argv) {
  const a = { maxLogs: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
    if (key === 'max-logs') a.maxLogs = Number(next) || 20;
    else a[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = next;
  }
  return a;
}

// ------------------------------------------------------------------ fs helpers
function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** Canonical path (collapses 8.3 short-name vs long-name forms of the same dir). */
function canonical(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function readJsonSafe(p) {
  const text = readTextSafe(p);
  if (text === null) return { ok: false, reason: 'read-failed' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, reason: `json-parse-failed: ${err.message}` };
  }
}

function relToRepo(p) {
  const r = path.relative(REPO_ROOT, p);
  return r.startsWith('..') ? p : r.split(path.sep).join('/');
}

/** Recursively collect files matching `predicate` up to `maxDepth`, bounded. */
function findFiles(root, predicate, maxDepth = 4, limit = 2000) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && out.length < limit) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth) stack.push({ dir: full, depth: depth + 1 });
      } else if (e.isFile() && predicate(e.name, full)) {
        out.push(full);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ governed
async function loadGoverned() {
  const timingPath = path.join(REPO_ROOT, 'out', 'reporting', 'mirror', 'labviewLaunchTiming.js');
  const corrPath = path.join(REPO_ROOT, 'out', 'reporting', 'mirror', 'perfmonLabviewCorrelation.js');
  if (!statSafe(timingPath) || !statSafe(corrPath)) {
    return { available: false, reason: 'compiled out/ missing -- run `npm run compile` first' };
  }
  try {
    const timing = await import(pathToFileURL(timingPath).href);
    const corr = await import(pathToFileURL(corrPath).href);
    return {
      available: true,
      parseLabVIEWLaunchTiming: timing.parseLabVIEWLaunchTiming,
      localIsoToEpochMs: corr.localIsoToEpochMs
    };
  } catch (err) {
    return { available: false, reason: `governed import failed: ${err.message}` };
  }
}

// ------------------------------------------------------------------ launch logs
const APP_LOG_RE = /^LabVIEW(?:CLI)?_.*_cur\.txt$/i;

function resolveLogSources(args) {
  if (typeof args.logPath === 'string') return [args.logPath];
  if (typeof args.runRoot === 'string') return [path.join(args.runRoot, 'labview-log')];
  const temp = os.tmpdir();
  const localTemp = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp') : null;
  return [temp, localTemp].filter(Boolean);
}

function discoverLaunchLogs(sources, injected) {
  const files = new Map(); // canonical full -> { full, stat }
  const seenSources = new Set();
  for (const rawSrc of sources) {
    const src = canonical(rawSrc);
    if (seenSources.has(src)) continue;
    seenSources.add(src);
    const st = statSafe(src);
    if (!st) continue;
    if (st.isFile()) {
      files.set(src, { full: src, stat: st });
      continue;
    }
    // A directory: injected roots accept any *.log/*.txt; default roots only the
    // launch-timing app log (LabVIEW[CLI]_..._cur.txt).
    const pred = injected
      ? (name) => /\.(log|txt)$/i.test(name)
      : (name) => APP_LOG_RE.test(name);
    for (const f of findFiles(src, pred, injected ? 3 : 1, 500)) {
      const fst = statSafe(f);
      if (fst) files.set(canonical(f), { full: f, stat: fst });
    }
  }
  return [...files.values()]
    .map(({ full, stat }) => ({ full, mtimeMs: stat.mtimeMs }))
    .sort((x, y) => y.mtimeMs - x.mtimeMs);
}

function summarizeLaunchLog(full, gov) {
  const text = readTextSafe(full);
  if (text === null) return { path: relToRepo(full), present: false, reason: 'read-failed' };
  let timing;
  try {
    timing = gov.parseLabVIEWLaunchTiming(text);
  } catch (err) {
    return { path: relToRepo(full), present: true, parsed: false, reason: `not-a-launch-log: ${err.message}` };
  }
  const toEpoch = (iso) => {
    if (!iso) return null;
    try {
      const v = gov.localIsoToEpochMs(iso);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };
  const processStartEpochMs = toEpoch(timing.processStartIso);
  const executionReadyEpochMs = toEpoch(timing.executionReadyIso);
  return {
    path: relToRepo(full),
    present: true,
    parsed: true,
    appName: timing.appName,
    version: timing.version,
    runMode: timing.runMode,
    processStartIso: timing.processStartIso,
    initAtIso: timing.initAtIso,
    executionReadyIso: timing.executionReadyIso,
    initToReadyMs: timing.initToReadyMs,
    processStartEpochMs,
    executionReadyEpochMs
  };
}

// ------------------------------------------------------------------ mprr
function resolveMprrDir(args) {
  if (typeof args.mprrDir === 'string') return args.mprrDir;
  if (typeof args.runRoot === 'string') return path.join(args.runRoot, 'mprr');
  return path.join(REPO_ROOT, 'win-validation', 'mprr');
}

function summarizeMprrSync(full) {
  const parsed = readJsonSafe(full);
  if (!parsed.ok) return { path: relToRepo(full), present: false, reason: parsed.reason };
  const s = parsed.value;
  const samples = Array.isArray(s.samples) ? s.samples : [];
  const first = samples[0] ?? null;
  const last = samples[samples.length - 1] ?? null;
  const peaks = Array.isArray(s.peaks)
    ? s.peaks.map((p) => ({
        series: p.series,
        value: p.value,
        frameIndex: p.frameIndex ?? null,
        epochMs:
          Number.isInteger(p.sampleIndex) && samples[p.sampleIndex]
            ? samples[p.sampleIndex].epochMs
            : null,
        isCpu: /cpu/i.test(String(p.series))
      }))
    : [];
  return {
    path: relToRepo(full),
    present: true,
    schema: s.schema ?? null,
    frameRateHz: s.frameRateHz ?? null,
    frameIntervalMs: s.frameIntervalMs ?? null,
    epochMsAtFrameZero: s.epochMsAtFrameZero ?? null,
    captureEpochMs: s.captureEpochMs ?? null,
    calibrated: s.calibrated ?? null,
    authoritative: s.authoritative ?? null,
    allSamplesWithinFrameWindow: s.allSamplesWithinFrameWindow ?? null,
    sampleCount: samples.length,
    window: first && last ? { firstEpochMs: first.epochMs, lastEpochMs: last.epochMs, firstFrame: first.frameIndex, lastFrame: last.frameIndex } : null,
    peaks
  };
}

function summarizeTdmsModel(full) {
  const parsed = readJsonSafe(full);
  if (!parsed.ok) return { path: relToRepo(full), present: false, reason: parsed.reason };
  const m = parsed.value;
  const fileProps = Array.isArray(m.fileProperties) ? m.fileProperties : [];
  const prop = (name) => fileProps.find((p) => p.name === name)?.value ?? null;
  const groups = Array.isArray(m.groups) ? m.groups : [];
  const channels = [];
  for (const g of groups) {
    for (const c of g.channels ?? []) {
      const peak = (c.properties ?? []).find((p) => p.name === 'peak')?.value ?? null;
      channels.push({ group: g.name, name: c.name, unit: c.unit, samples: (c.data ?? []).length, peak });
    }
  }
  return {
    path: relToRepo(full),
    present: true,
    schema: m.schema ?? null,
    sourceSchema: prop('source_schema'),
    sampleCount: prop('sample_count'),
    intervalMs: prop('interval_ms'),
    wallMs: prop('wall_ms'),
    groups: groups.map((g) => g.name),
    channels
  };
}

function discoverMprr(mprrDir) {
  const st = statSafe(mprrDir);
  if (!st) return { dir: relToRepo(mprrDir), present: false, reason: 'directory-absent' };
  const syncFiles = findFiles(mprrDir, (n) => n === 'mprr-sync.json', 4, 200);
  const tdmsFiles = findFiles(mprrDir, (n) => n === 'tdms-model.json', 4, 200);
  return {
    dir: relToRepo(mprrDir),
    present: true,
    syncs: syncFiles.map(summarizeMprrSync),
    tdmsModels: tdmsFiles.map(summarizeTdmsModel)
  };
}

// ------------------------------------------------------------------ splash
function resolveSplash(args) {
  if (typeof args.splash === 'string') return args.splash;
  if (typeof args.runRoot === 'string') return path.join(args.runRoot, 'splash', 'splash-capture.json');
  return path.join(os.tmpdir(), 'lvsplash', 'splash-capture.json');
}

function summarizeSplash(full) {
  const st = statSafe(full);
  if (!st) return { path: relToRepo(full), present: false, reason: 'absent' };
  const parsed = readJsonSafe(full);
  if (!parsed.ok) return { path: relToRepo(full), present: false, reason: parsed.reason };
  const s = parsed.value;
  const frames = Array.isArray(s.frames) ? s.frames : [];
  const first = frames[0] ?? null;
  const last = frames[frames.length - 1] ?? null;
  return {
    path: relToRepo(full),
    present: true,
    schema: s.schema ?? null,
    provider: s.provider ?? null,
    launchEpochMs: s.launchEpochMs ?? null,
    captureStartEpochMs: s.captureStartEpochMs ?? null,
    fps: s.fps ?? null,
    frameCount: frames.length,
    window: first && last ? { firstEpochMs: first.epochMs, lastEpochMs: last.epochMs } : null
  };
}

// ------------------------------------------------------------------ correlation
function frameForEpoch(epochMs, epochMsAtFrameZero, frameRateHz) {
  if (!Number.isFinite(epochMs) || !Number.isFinite(epochMsAtFrameZero) || !Number.isFinite(frameRateHz)) return null;
  return Math.round(((epochMs - epochMsAtFrameZero) / 1000) * frameRateHz);
}

function buildCorrelation(launchLogs, splash, mprr) {
  const events = [];
  for (const l of launchLogs) {
    if (!l.parsed) continue;
    const epochMs = l.executionReadyEpochMs ?? l.processStartEpochMs;
    if (!Number.isFinite(epochMs)) continue;
    events.push({
      kind: 'labview-log',
      label: `${l.appName ?? 'LabVIEW'} ${l.runMode ?? ''} ${l.version ?? ''}`.trim(),
      instant: l.executionReadyEpochMs ? 'execution-ready' : 'process-start',
      epochMs,
      source: l.path
    });
  }
  if (splash?.present && Number.isFinite(splash.launchEpochMs)) {
    events.push({ kind: 'splash', label: splash.provider ?? 'splash', instant: 'launch', epochMs: splash.launchEpochMs, source: splash.path });
  }

  const syncs = mprr?.present ? mprr.syncs.filter((s) => s.present) : [];
  const alignment = [];
  for (const ev of events) {
    const perSync = [];
    for (const sy of syncs) {
      const frameIndex = frameForEpoch(ev.epochMs, sy.epochMsAtFrameZero, sy.frameRateHz);
      const withinWindow =
        sy.window && ev.epochMs >= sy.window.firstEpochMs && ev.epochMs <= sy.window.lastEpochMs;
      const cpuPeaks = sy.peaks.filter((p) => p.isCpu && Number.isFinite(p.epochMs));
      const nearest = cpuPeaks
        .map((p) => ({ series: p.series, value: p.value, peakFrame: p.frameIndex, deltaMs: p.epochMs - ev.epochMs }))
        .sort((x, y) => Math.abs(x.deltaMs) - Math.abs(y.deltaMs))[0] ?? null;
      perSync.push({ syncPath: sy.path, eventFrameIndex: frameIndex, withinWindow: Boolean(withinWindow), nearestCpuPeak: nearest });
    }
    alignment.push({ event: ev, perSync });
  }

  return {
    axis: {
      rule: 'frameIndex = round((epochMs - epochMsAtFrameZero) / 1000 * frameRateHz)',
      note: 'LabVIEW launch/splash events and the perfmon-mprr samples share ONE epoch-ms axis; map either to a frame to line up a launch instant with the CPU-spike frame.',
      governedEntryPoints: [
        'out/reporting/mirror/labviewLaunchTiming.js:parseLabVIEWLaunchTiming (launch instants from the log)',
        'out/reporting/mirror/perfmonLabviewCorrelation.js:localIsoToEpochMs / correlatePerfmonWithLabviewLog (local-ISO -> epoch, reconcile capture vs launch)',
        'out/reporting/mirror/perfmonMprrSync.js:buildPerfmonMprrSync (frame<->epoch axis + per-series peaks incl the CPU spike)',
        'out/reporting/mirror/firstRunPerfmonLaunchCorrelation.js:correlateFirstRunPerfmonLaunch (composes log + capture + frames into TDMS metadata)'
      ]
    },
    launchEvents: events,
    alignment,
    coCaptured:
      events.length > 0 &&
      syncs.length > 0 &&
      alignment.some((a) => a.perSync.some((p) => p.withinWindow)),
    note:
      events.length === 0 || syncs.length === 0
        ? 'No overlapping launch event and mprr sync were found; run a future cycle that co-captures both into one --run-root for a real spike<->launch alignment.'
        : 'When withinWindow is false the indexed artifacts came from different runs; the alignment machinery is ready for a co-captured run-root.'
  };
}

// ------------------------------------------------------------------ guidance
function injectionGuidance(runRoot) {
  const root = runRoot ? relToRepo(path.resolve(runRoot)) : '<run-root>';
  return {
    runRootConvention: {
      'labview-log/': 'LabVIEWCLI/-LogFilePath log(s) for the run (and/or the LabVIEW *_cur.txt app log)',
      'splash/splash-capture.json': 'interactive splash capture (labview-splash-capture@v1) + frames/',
      'mprr/': 'perfmon-mprr driver output (VIHS_MPRR_OUT) -- mprr-sync.json + tdms-model.json + artifact.json'
    },
    labviewCliLogParameter: {
      parameter: '-LogFilePath',
      example: `LabVIEWCLI -LogFilePath "${root}/labview-log/labviewcli.log" -LogToConsole TRUE -OperationName <op> ...`,
      banner: 'LabVIEWCLI started logging in file: <path>  (parseLabviewCliDiagnosticLogPath recovers it from stdout)',
      note: 'The launch-timing markers (#Date/#AppName/init/execution-ready) parsed by labview-launch-timing@v1 live in the LabVIEW app log (LabVIEW[CLI]_<bits>_<ver>_<mode>_<user>_cur.txt, default %TEMP%). -LogFilePath sets the LabVIEWCLI operation/diagnostic log. Inject the run-root path so the log is co-located with the splash + mprr artifacts; co-locate the app log too when both markers are needed.'
    },
    nextCycle: [
      `mkdir ${root}/{labview-log,splash,mprr}`,
      `pass -LogFilePath "${root}/labview-log/<name>.log" to LabVIEWCLI`,
      `capture splash frames into ${root}/splash/ and write splash-capture.json`,
      `run the perfmon-mprr driver with VIHS_MPRR_OUT=${root}/mprr`,
      `re-run: node prototype/mprr/benchmarkMetadataIndex.mjs --run-root "${root}" for a self-contained correlated index`
    ]
  };
}

// ------------------------------------------------------------------ markdown
function toMarkdown(index) {
  const lines = [];
  lines.push(`# Benchmark metadata index (${index.generatedAtIso})`);
  lines.push('');
  lines.push(`- run-root: ${index.runRoot ?? '(system defaults)'}`);
  lines.push(`- launch logs: ${index.launchLogs.indexed}/${index.launchLogs.discovered} parsed`);
  lines.push(`- mprr syncs: ${index.mprr.present ? index.mprr.syncs.length : 0} · tdms models: ${index.mprr.present ? index.mprr.tdmsModels.length : 0}`);
  lines.push(`- splash: ${index.splash.present ? 'present' : 'absent'}`);
  lines.push(`- co-captured alignment: ${index.correlation.coCaptured ? 'YES' : 'no (machinery ready)'}`);
  lines.push('');
  if (index.mprr.present) {
    for (const s of index.mprr.syncs.filter((x) => x.present)) {
      const cpu = s.peaks.filter((p) => p.isCpu).map((p) => `${p.series}=${p.value} @frame ${p.frameIndex}`).join(', ');
      lines.push(`- sync ${s.path}: ${s.sampleCount} samples @${s.frameRateHz}fps, CPU peaks: ${cpu || '(none)'}`);
    }
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gov = await loadGoverned();

  const injected = typeof args.runRoot === 'string' || typeof args.logPath === 'string';
  const logSources = resolveLogSources(args);
  let launchLogsSection;
  if (!gov.available) {
    launchLogsSection = { governed: false, reason: gov.reason, discovered: 0, indexed: 0, sources: logSources.map(relToRepo), logs: [] };
  } else {
    const discovered = discoverLaunchLogs(logSources, injected).slice(0, args.maxLogs);
    const logs = discovered.map((d) => summarizeLaunchLog(d.full, gov));
    launchLogsSection = {
      governed: true,
      sources: logSources.map(relToRepo),
      discovered: discovered.length,
      indexed: logs.filter((l) => l.parsed).length,
      logs
    };
  }

  const mprr = discoverMprr(resolveMprrDir(args));
  const splash = summarizeSplash(resolveSplash(args));
  const correlation = buildCorrelation(launchLogsSection.logs, splash, mprr);

  const index = {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    host: { platform: process.platform, tmp: relToRepo(os.tmpdir()) },
    runRoot: typeof args.runRoot === 'string' ? relToRepo(path.resolve(args.runRoot)) : null,
    injected,
    launchLogs: launchLogsSection,
    mprr,
    splash,
    correlation,
    injectionGuidance: injectionGuidance(typeof args.runRoot === 'string' ? args.runRoot : null)
  };

  const json = JSON.stringify(index, null, 2);
  let outPath = null;
  if (typeof args.out === 'string') outPath = path.resolve(args.out);
  else if (typeof args.runRoot === 'string') outPath = path.resolve(args.runRoot, 'benchmark-metadata-index.json');
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, 'utf8');
  }

  if (args.markdown) {
    console.log(toMarkdown(index));
  } else if (outPath) {
    console.log(
      `benchmark-metadata-index@v1 -> ${relToRepo(outPath)} | logs ${launchLogsSection.indexed ?? 0}/${launchLogsSection.discovered ?? 0}, syncs ${mprr.present ? mprr.syncs.length : 0}, splash ${splash.present ? 'yes' : 'no'}, coCaptured ${correlation.coCaptured}`
    );
  } else {
    console.log(json);
  }

  if (args.strict) {
    const missing = [];
    if (!launchLogsSection.indexed) missing.push('launch-logs');
    if (!mprr.present || mprr.syncs.filter((s) => s.present).length === 0) missing.push('mprr-sync');
    if (!splash.present) missing.push('splash');
    if (missing.length) {
      console.error(`strict: missing ${missing.join(', ')}`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exitCode = 1;
  });
}
