#!/usr/bin/env node

'use strict';

/**
 * Perfmon <-> LabVIEW-launch correlation end-to-end validator (VHS-REQ-718).
 *
 * Captures a REAL Windows `logman` performance trace around a REAL host-native
 * LabVIEWCLI launch and feeds the captured PDH-CSV, the LabVIEW launch log, and a
 * deterministic 12-FPS replay-frame stream through the SHIPPED first-run perfmon
 * pipeline (`out/reporting/mirror/firstRunPerfmonPipeline.js`) to prove, on real
 * hardware, that:
 *   - perfmon capture timestamps (UTC) reconcile with LabVIEW launch-log markers
 *     (local wall-clock) to a correct epoch-ms delta, and
 *   - each launch marker (process start, execution-ready) lands in the expected
 *     replay frame index, and
 *   - the TDMS model is stamped with the launch + frame metadata.
 *
 * ACTOR-HARNESS design (why we do NOT wait for the full render): the
 * PrintToSingleFileHtml operation on a COLD LabVIEW 2026 launch can take minutes
 * (or never finish generating HTML), but the launch-log markers we correlate are
 * written during LabVIEW init. So we: start logman -> spawn the render async ->
 * poll the fresh headless engine log until BOTH markers are present -> keep
 * sampling for a realistic window -> stop logman + kill the render -> correlate.
 *
 * Maintainer `.cjs` (inventory-exempt, coverage-exempt, NOT in `npm test`):
 * Windows-only, spawns a real LabVIEW, and is not a hosted CI gate. Run from the
 * repo root AFTER `npm run compile`:
 *   node scripts/validatePerfmonLabviewCorrelation.cjs
 *
 * Env (all optional):
 *   VIHS_LVCLI               LabVIEWCLI.exe (default the standard NI install path)
 *   VIHS_LV_OPDIR            -AdditionalOperationDirectory (default resources/labview-cli-operations)
 *   VIHS_LV_VI               VI to render (default the dependency-light sample VI)
 *   VIHS_PERFMON_COLLECTOR   logman collector name (default vihs-labview-e2e)
 *   VIHS_PERFMON_INTERVAL_SEC logman sample interval seconds (default 1)
 *   VIHS_MIN_CAPTURE_MS      minimum perfmon window (default 18000)
 *   VIHS_MARKER_TIMEOUT_MS   cold-launch marker wait budget (default 300000)
 *   VIHS_FRAME_RATE_HZ       replay frame rate (default 12)
 *   VIHS_OUT                 write the evidence JSON to this path
 *   VIHS_KEEP_LABVIEW        "1" to NOT kill LabVIEW at start/end
 *
 * Exit codes: 0 success, 2 wrong platform / missing `out/`, 3 correlation not
 * "correlated", 4 real-capture sanity failure, 1 driver error.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');

if (process.platform !== 'win32') {
  console.error('[perfmon-labview-e2e] Windows-only (needs logman + host-native LabVIEWCLI).');
  process.exit(2);
}

const OUT = path.join(process.cwd(), 'out', 'reporting');
function need(rel) {
  const f = path.join(OUT, rel);
  if (!fs.existsSync(f)) {
    console.error(`[perfmon-labview-e2e] missing ${path.relative(process.cwd(), f)}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return require(f);
}

const { runFirstRunPerfmonPipeline } = need('mirror/firstRunPerfmonPipeline.js');
const { buildWindowsPerfmonCapturePlan } = need('mirror/perfmonCapturePlan.js');
const { buildLabviewCliPrintToSingleFileHtmlPlan } = need('viPreview/viPreviewCommandPlan.js');
const { parseLabVIEWLaunchTiming } = need('mirror/labviewLaunchTiming.js');

const REPO = process.cwd();
const LVCLI =
  process.env.VIHS_LVCLI ||
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const OPDIR = process.env.VIHS_LV_OPDIR || path.join(REPO, 'resources', 'labview-cli-operations');
const VI = process.env.VIHS_LV_VI || path.join(OPDIR, 'PrintToSingleFileHtml', 'Make path absolute.vi');
const OUT_HTML = path.join(os.tmpdir(), 'vihs-labview-e2e-preview.html');
const PERF_BASE = path.join(os.tmpdir(), 'vihs-labview-e2e-perf');
const PERF_O = PERF_BASE + '.csv';
const COLLECTOR = process.env.VIHS_PERFMON_COLLECTOR || 'vihs-labview-e2e';
const SAMPLE_INTERVAL_SEC = Number(process.env.VIHS_PERFMON_INTERVAL_SEC || 1);
const MIN_CAPTURE_MS = Number(process.env.VIHS_MIN_CAPTURE_MS || 18000);
const MARKER_POLL_TIMEOUT_MS = Number(process.env.VIHS_MARKER_TIMEOUT_MS || 300000);
const FRAME_RATE_HZ = Number(process.env.VIHS_FRAME_RATE_HZ || 12);
const KEEP_LABVIEW = process.env.VIHS_KEEP_LABVIEW === '1';
const POLL_INTERVAL_MS = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function logman(args, { loud = false } = {}) {
  try {
    execFileSync('logman', args, { encoding: 'utf8', timeout: 30000 });
    return true;
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || '').toString().trim();
    if (loud) console.error('[logman] FAILED: logman ' + args.join(' ') + '  ->  ' + msg);
    return false;
  }
}

function newestFile(predicate) {
  const dir = os.tmpdir();
  const hits = fs
    .readdirSync(dir)
    .filter(predicate)
    .map((f) => ({ p: path.join(dir, f), name: f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return hits.length ? hits[0] : null;
}

const IS_HEADLESS_LV_LOG = (f) => /^LabVIEW_\d+_.*headless.*_cur\.txt$/i.test(f);

function killLabview() {
  if (KEEP_LABVIEW) return;
  for (const im of ['LabVIEW.exe', 'LabVIEWCLI.exe']) {
    try {
      execFileSync('taskkill', ['/F', '/IM', im, '/T'], { stdio: 'ignore' });
    } catch {
      /* not running */
    }
  }
}

async function main() {
  if (!fs.existsSync(LVCLI)) {
    console.error(`[perfmon-labview-e2e] LabVIEWCLI not found at ${LVCLI} (set VIHS_LVCLI).`);
    process.exit(2);
  }
  if (!fs.existsSync(VI)) {
    console.error(`[perfmon-labview-e2e] VI not found at ${VI} (set VIHS_LV_VI).`);
    process.exit(2);
  }

  // ---- 1. clean slate ----
  killLabview();
  logman(['stop', COLLECTOR]);
  logman(['delete', COLLECTOR]);
  for (const f of fs.readdirSync(os.tmpdir()).filter((x) => x.startsWith(path.basename(PERF_BASE)))) {
    try {
      fs.unlinkSync(path.join(os.tmpdir(), f));
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(OUT_HTML);
  } catch {
    /* ignore */
  }
  // Delete the stale headless engine log so we can positively detect the fresh one.
  const stale = newestFile(IS_HEADLESS_LV_LOG);
  if (stale) {
    try {
      fs.unlinkSync(stale.p);
    } catch {
      /* the running process may hold it; the fresh-mtime guard still protects us */
    }
  }

  // ---- 2. build the SHIPPED logman plan + start capturing for real ----
  const plan = buildWindowsPerfmonCapturePlan({
    collectorName: COLLECTOR,
    outputCsvPath: PERF_O,
    sampleIntervalSec: SAMPLE_INTERVAL_SEC
  });
  console.error('[perfmon] counters: ' + plan.counters.join('  |  '));
  if (!logman(plan.create.args, { loud: true })) {
    throw new Error('logman create failed — cannot capture perfmon.');
  }
  if (!logman(plan.start.args, { loud: true })) {
    logman(plan.delete.args);
    throw new Error('logman start failed — cannot capture perfmon.');
  }
  const captureStartMs = Date.now();
  console.error('[perfmon] logman started at ' + new Date(captureStartMs).toISOString());

  // ---- 3. spawn the SHIPPED host-native render plan ASYNC (we need its launch) ----
  const renderPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
    viPath: VI,
    outputHtmlPath: OUT_HTML,
    additionalOperationDirectory: OPDIR,
    headless: true
  });
  console.error('[render] spawn: LabVIEWCLI ' + renderPlan.args.join(' '));
  const child = spawn(LVCLI, renderPlan.args, { windowsHide: true });
  let renderStdout = '';
  child.stdout.on('data', (d) => (renderStdout += d.toString()));
  child.stderr.on('data', (d) => (renderStdout += d.toString()));
  let renderExit = null;
  child.on('exit', (code) => (renderExit = code));

  // ---- 4. poll the fresh headless engine log until BOTH markers are present ----
  let logHit = null;
  let timing = null;
  let sawEngineLog = false;
  let nextProgressMs = Date.now() + 15000;
  const deadline = Date.now() + MARKER_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const hit = newestFile(IS_HEADLESS_LV_LOG);
    if (!hit || hit.m < captureStartMs - 2000) {
      if (Date.now() >= nextProgressMs) {
        console.error(
          '[render] waiting for cold LabVIEW launch... ' +
            ((Date.now() - captureStartMs) / 1000).toFixed(0) +
            's (no fresh engine log yet)'
        );
        nextProgressMs = Date.now() + 15000;
      }
      continue;
    }
    if (!sawEngineLog) {
      sawEngineLog = true;
      console.error(
        '[render] fresh engine log appeared after ' + ((hit.m - captureStartMs) / 1000).toFixed(1) + 's: ' + hit.name
      );
    }
    let text;
    try {
      text = fs.readFileSync(hit.p, 'utf8');
    } catch {
      continue;
    }
    try {
      const t = parseLabVIEWLaunchTiming(text);
      if (t && t.processStartIso && t.executionReadyIso) {
        logHit = hit;
        timing = t;
        break;
      }
    } catch {
      /* partial/incomplete log — keep polling */
    }
    if (Date.now() >= nextProgressMs) {
      console.error(
        '[render] engine log present, waiting for execution-ready marker... ' +
          ((Date.now() - captureStartMs) / 1000).toFixed(0) +
          's'
      );
      nextProgressMs = Date.now() + 15000;
    }
  }

  if (!logHit || !timing) {
    logman(plan.stop.args);
    logman(plan.delete.args);
    killLabview();
    console.error('[render stdout] ' + renderStdout.split(/\r?\n/).slice(-6).join(' | '));
    throw new Error('Launch markers never appeared within ' + MARKER_POLL_TIMEOUT_MS + 'ms.');
  }
  console.error(
    '[render] launch markers present after ' +
      ((logHit.m - captureStartMs) / 1000).toFixed(1) +
      's  (log: ' +
      logHit.name +
      ')'
  );

  // ---- 5. keep sampling for a realistic perfmon window, then stop ----
  const elapsed = Date.now() - captureStartMs;
  if (elapsed < MIN_CAPTURE_MS) {
    console.error('[perfmon] extending capture by ' + (MIN_CAPTURE_MS - elapsed) + 'ms for a fuller window...');
    await sleep(MIN_CAPTURE_MS - elapsed);
  }
  logman(plan.stop.args, { loud: true });
  const captureEndMs = Date.now();
  killLabview();
  try {
    child.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  console.error(
    '[perfmon] stopped at ' +
      new Date(captureEndMs).toISOString() +
      '  (window ' +
      ((captureEndMs - captureStartMs) / 1000).toFixed(1) +
      's, render exit=' +
      renderExit +
      ', html=' +
      fs.existsSync(OUT_HTML) +
      ')'
  );

  // ---- 6. read the REAL captured CSV + the REAL launch log ----
  const csvHit = newestFile((f) => f.startsWith(path.basename(PERF_BASE)) && f.toLowerCase().endsWith('.csv'));
  const csvText = csvHit ? fs.readFileSync(csvHit.p, 'utf8') : '';
  logman(plan.delete.args);
  console.error('[perfmon] csv: ' + (csvHit ? csvHit.name : '(none)') + '  (' + csvText.length + ' bytes)');
  if (csvText.trim().length === 0) {
    throw new Error('logman produced an empty CSV — no perfmon samples captured.');
  }
  const logText = fs.readFileSync(logHit.p, 'utf8');

  // ---- 7. the deterministic replay-frame stream, anchored to the capture start ----
  const windowSec = (captureEndMs - captureStartMs) / 1000;
  const frameStream = {
    frameRateHz: FRAME_RATE_HZ,
    frameCount: Math.ceil(windowSec * FRAME_RATE_HZ) + FRAME_RATE_HZ,
    epochMsAtFrameZero: captureStartMs
  };

  // ---- 8. run the SHIPPED pipeline ONCE with the real captured data ----
  const result = runFirstRunPerfmonPipeline(
    {
      request: { collectorName: COLLECTOR, outputCsvPath: PERF_O, sampleIntervalSec: SAMPLE_INTERVAL_SEC },
      source: 'self-hosted-runner',
      actor: 'host-native-e2e',
      labviewLaunch: { logText, frameStream }
    },
    { capture: () => ({ csvText, startMs: captureStartMs, endMs: captureEndMs }) }
  );

  // ---- 9. report + assert + optional evidence JSON ----
  const fp = Object.fromEntries(result.tdmsModel.fileProperties.map((p) => [p.name, p.value]));
  const lc = result.launchCorrelation;
  console.log('\n===== VHS-REQ-718 REAL END-TO-END RESULT =====');
  console.log('perfmon capturedAtIso :', result.artifact.capturedAtIso);
  console.log('perfmon wallMs        :', result.artifact.wallMs);
  console.log('perfmon samples       :', result.artifact.perf ? result.artifact.perf.t.length : '(n/a)');
  console.log('perfmon channels      :', result.artifact.perf ? Object.keys(result.artifact.perf.series).join(', ') : '(n/a)');
  console.log('tdms groups           :', result.tdmsModel.groups.map((g) => g.name).join(', '));
  console.log('tdms sample_count     :', fp.sample_count);
  console.log('launchCorrelation     :', lc && lc.status);

  const evidence = {
    schema: 'vi-history-suite/perfmon-labview-e2e-evidence@v1',
    capturedAtIso: result.artifact.capturedAtIso,
    perfmonWallMs: result.artifact.wallMs,
    perfmonSamples: result.artifact.perf ? result.artifact.perf.t.length : null,
    perfmonChannels: result.artifact.perf ? Object.keys(result.artifact.perf.series) : [],
    tdmsSampleCount: fp.sample_count,
    launchCorrelationStatus: lc && lc.status,
    launchCorrelation: lc && lc.status === 'correlated'
      ? {
          processStartIso: lc.launchTiming.processStartIso,
          executionReadyIso: lc.launchTiming.executionReadyIso,
          initToReadyMs: lc.launchTiming.initToReadyMs,
          perfmonMinusProcessStartMs: lc.correlation.perfmonMinusProcessStartMs,
          perfmonMinusExecutionReadyMs: lc.correlation.perfmonMinusExecutionReadyMs,
          perfmonStartedBeforeProcessStart: lc.correlation.perfmonStartedBeforeProcessStart,
          processStartFrameIndex: lc.frameCorrelation.processStartFrameIndex,
          executionReadyFrameIndex: lc.frameCorrelation.executionReadyFrameIndex,
          launchSpanFrames: lc.frameCorrelation.launchSpanFrames,
          launchDeadTimeMs: lc.frameCorrelation.launchDeadTimeMs,
          frameRateHz: lc.frameCorrelation.frameRateHz
        }
      : null,
    tdmsLaunchProps: {
      labview_process_start_iso: fp.labview_process_start_iso,
      labview_execution_ready_iso: fp.labview_execution_ready_iso,
      frame_rate_hz: fp.frame_rate_hz,
      frame_count: fp.frame_count,
      epoch_ms_at_frame_zero: fp.epoch_ms_at_frame_zero
    }
  };

  if (!lc || lc.status !== 'correlated') {
    console.error('FAILED: launch correlation not "correlated": ' + (lc && lc.reason));
    if (process.env.VIHS_OUT) fs.writeFileSync(process.env.VIHS_OUT, JSON.stringify(evidence, null, 2));
    process.exitCode = 3;
    return;
  }
  console.log('  processStartIso     :', lc.launchTiming.processStartIso);
  console.log('  executionReadyIso   :', lc.launchTiming.executionReadyIso);
  console.log('  initToReadyMs       :', lc.launchTiming.initToReadyMs);
  console.log('  perfmonMinusProcMs  :', lc.correlation.perfmonMinusProcessStartMs);
  console.log('  perfmonMinusReadyMs :', lc.correlation.perfmonMinusExecutionReadyMs);
  console.log('  perfmonBeforeProc   :', lc.correlation.perfmonStartedBeforeProcessStart);
  console.log('  processStartFrame   :', lc.frameCorrelation.processStartFrameIndex);
  console.log('  executionReadyFrame :', lc.frameCorrelation.executionReadyFrameIndex);
  console.log('  launchSpanFrames    :', lc.frameCorrelation.launchSpanFrames);
  console.log('  launchDeadTimeMs    :', lc.frameCorrelation.launchDeadTimeMs);
  console.log('  tdms labview props  :', JSON.stringify(evidence.tdmsLaunchProps));

  const problems = [];
  if (!(result.artifact.perf && result.artifact.perf.t.length >= 3)) problems.push('too few perfmon samples');
  if (!lc.correlation.perfmonStartedBeforeProcessStart) problems.push('perfmon did not start before LabVIEW');
  if (!(lc.frameCorrelation.processStartFrameIndex >= 0)) problems.push('bad processStartFrameIndex');
  if (!(lc.frameCorrelation.executionReadyFrameIndex >= lc.frameCorrelation.processStartFrameIndex))
    problems.push('exec-ready frame not after process-start frame');
  if (fp.labview_execution_ready_iso == null) problems.push('TDMS missing execution-ready stamp');

  if (process.env.VIHS_OUT) {
    fs.writeFileSync(process.env.VIHS_OUT, JSON.stringify(evidence, null, 2));
    console.log('\nevidence written to ' + process.env.VIHS_OUT);
  }

  if (problems.length) {
    console.error('FAILED sanity: ' + problems.join('; '));
    process.exitCode = 4;
    return;
  }
  console.log('\nRESULT: PASS — real perfmon capture correlated to a real LabVIEW launch end-to-end.');
  console.log('===== END =====');
}

main().catch((err) => {
  console.error('\n[perfmon-labview-e2e] DRIVER ERROR: ' + (err && err.stack ? err.stack : err));
  try {
    killLabview();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
