#!/usr/bin/env node

'use strict';

/**
 * Containerized perfmon <-> LabVIEW-launch correlation end-to-end validator
 * (VHS-REQ-718) using a Windows LabVIEW container for SETUP ISOLATION and
 * IDEMPOTENCY.
 *
 * The host-native sibling (`validatePerfmonLabviewCorrelation.cjs`) requires a
 * real host LabVIEW install and kills host LabVIEW processes; this variant runs
 * LabVIEW inside a throwaway `nationalinstruments/labview:*-windows` container
 * so no host install, no host-process interference, and a fresh, reproducible
 * cold launch every run. It reuses the SHIPPED Windows-container preview render
 * plan (`buildWindowsContainerViPreviewCommandPlan`), whose container `TEMP`
 * root (`C:\vi-history-suite\container-temp`) lives UNDER the bind-mounted
 * workspace, so the container's `LabVIEW_*_cur.txt` launch log surfaces on the
 * host in real time. Host `logman` captures the SYSTEM counters (CPU / available
 * memory / disk) around the launch; because Windows containers share the host
 * wall-clock, the launch-log markers (local) reconcile with the perfmon capture
 * timestamp (UTC) to a correct epoch-ms delta, and the shipped first-run perfmon
 * pipeline then correlates markers to replay-frame indexes and stamps the TDMS
 * model.
 *
 * Under Hyper-V isolation the container's `\Process(LabVIEW)` instance is NOT
 * visible to host logman, which is why this validator uses the minimal SYSTEM
 * profile (the same profile the documented cold-launch scenario uses).
 *
 * Idempotent: it removes any container spawned from the image and recreates a
 * fresh throwaway workspace before and after the run.
 *
 * Maintainer `.cjs` (inventory-exempt, coverage-exempt, NOT in `npm test`):
 * Windows-only, requires Docker in Windows-container mode with the image pulled,
 * and is not a hosted CI gate. Run from the repo root AFTER `npm run compile`:
 *   node scripts/validatePerfmonLabviewContainerE2E.cjs
 *
 * Env (all optional):
 *   VIHS_CONTAINER_IMAGE      Windows LabVIEW image
 *                             (default nationalinstruments/labview:2026q1patch2-windows)
 *   VIHS_LV_OPDIR             operation directory bind-mounted read-write at the
 *                             ops root (default resources/labview-cli-operations)
 *   VIHS_LV_VI                source VI staged into the workspace
 *                             (default the dependency-light sample VI)
 *   VIHS_PERFMON_COLLECTOR    logman collector name (default vihs-labview-container-e2e)
 *   VIHS_PERFMON_INTERVAL_SEC logman sample interval seconds (default 1)
 *   VIHS_MIN_CAPTURE_MS       minimum perfmon window (default 18000)
 *   VIHS_MARKER_TIMEOUT_MS    container cold-launch marker wait budget (default 900000)
 *   VIHS_FRAME_RATE_HZ        replay frame rate (default 12)
 *   VIHS_OUT                  write the evidence JSON to this path
 *   VIHS_KEEP_CONTAINER       "1" to NOT remove the container at start/end
 *
 * Exit codes: 0 success, 2 wrong platform / missing `out/` / Docker not in
 * Windows-container mode / image missing, 3 correlation not "correlated", 4
 * real-capture sanity failure, 1 driver error.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');

if (process.platform !== 'win32') {
  console.error('[perfmon-container-e2e] Windows-only (needs host logman + a Windows LabVIEW container).');
  process.exit(2);
}

const OUT = path.join(process.cwd(), 'out', 'reporting');
function need(rel) {
  const f = path.join(OUT, rel);
  if (!fs.existsSync(f)) {
    console.error(`[perfmon-container-e2e] missing ${path.relative(process.cwd(), f)}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return require(f);
}

const { runFirstRunPerfmonPipeline } = need('mirror/firstRunPerfmonPipeline.js');
const { buildWindowsPerfmonCapturePlan } = need('mirror/perfmonCapturePlan.js');
const { parseLabVIEWLaunchTiming } = need('mirror/labviewLaunchTiming.js');
const {
  buildWindowsContainerViPreviewCommandPlan,
  resolveWindowsPowerShellHostExecutable
} = need('viPreview/viPreviewCommandPlan.js');
const { WINDOWS_CONTAINER_LABVIEW_EXE } = need('runtime/containerRuntimePaths.js');

const REPO = process.cwd();
const IMAGE = process.env.VIHS_CONTAINER_IMAGE || 'nationalinstruments/labview:2026q1patch2-windows';
const OPDIR = process.env.VIHS_LV_OPDIR || path.join(REPO, 'resources', 'labview-cli-operations');
const SRC_VI = process.env.VIHS_LV_VI || path.join(OPDIR, 'PrintToSingleFileHtml', 'Make path absolute.vi');
const WORKROOT = path.join(os.tmpdir(), 'vihs-labview-container-e2e');
const WORKSPACE = path.join(WORKROOT, 'workspace');
const CONTAINER_TEMP = path.join(WORKSPACE, 'container-temp');
const VI_FILENAME = 'sample.vi';
const OUT_HTML = 'preview.html';
const COLLECTOR = process.env.VIHS_PERFMON_COLLECTOR || 'vihs-labview-container-e2e';
const SAMPLE_INTERVAL_SEC = Number(process.env.VIHS_PERFMON_INTERVAL_SEC || 1);
const MIN_CAPTURE_MS = Number(process.env.VIHS_MIN_CAPTURE_MS || 18000);
const MARKER_POLL_TIMEOUT_MS = Number(process.env.VIHS_MARKER_TIMEOUT_MS || 900000);
const FRAME_RATE_HZ = Number(process.env.VIHS_FRAME_RATE_HZ || 12);
const KEEP_CONTAINER = process.env.VIHS_KEEP_CONTAINER === '1';
const PERF_BASE = path.join(os.tmpdir(), 'vihs-labview-container-e2e-perf');
const PERF_O = PERF_BASE + '.csv';
const POLL_INTERVAL_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function logman(args, { loud = false } = {}) {
  try {
    execFileSync('logman', args, { encoding: 'utf8', timeout: 30000 });
    return true;
  } catch (err) {
    if (loud) console.error('[logman] FAILED: logman ' + args.join(' ') + '  ->  ' + (err.stderr || err.stdout || err.message || '').toString().trim());
    return false;
  }
}

function dockerRmByAncestor() {
  if (KEEP_CONTAINER) return 0;
  try {
    const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'ancestor=' + IMAGE], { encoding: 'utf8' })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      try {
        execFileSync('docker', ['rm', '-f', id], { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
    return ids.length;
  } catch {
    return 0;
  }
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function newestContainerLog() {
  if (!fs.existsSync(CONTAINER_TEMP)) return null;
  const hits = fs
    .readdirSync(CONTAINER_TEMP)
    .filter((f) => /^LabVIEW_.*_cur\.txt$/i.test(f))
    .map((f) => ({ p: path.join(CONTAINER_TEMP, f), name: f, m: fs.statSync(path.join(CONTAINER_TEMP, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return hits.length ? hits[0] : null;
}

function preflightDocker() {
  let serverOs;
  try {
    serverOs = execFileSync('docker', ['version', '--format', '{{.Server.Os}}'], { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (err) {
    console.error('[perfmon-container-e2e] Docker not available: ' + (err.message || err));
    process.exit(2);
  }
  if (serverOs !== 'windows') {
    console.error(`[perfmon-container-e2e] Docker engine is "${serverOs}", not "windows". Switch Docker Desktop to Windows containers.`);
    process.exit(2);
  }
  try {
    execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 30000 });
  } catch {
    console.error(`[perfmon-container-e2e] image ${IMAGE} is not present. Pull it first: docker pull ${IMAGE}`);
    process.exit(2);
  }
}

async function main() {
  if (!fs.existsSync(SRC_VI)) {
    console.error(`[perfmon-container-e2e] source VI not found at ${SRC_VI} (set VIHS_LV_VI).`);
    process.exit(2);
  }
  preflightDocker();

  // ---- 1. idempotent clean slate ----
  const removed = dockerRmByAncestor();
  rmrf(WORKROOT);
  fs.mkdirSync(CONTAINER_TEMP, { recursive: true });
  fs.copyFileSync(SRC_VI, path.join(WORKSPACE, VI_FILENAME));
  logman(['stop', COLLECTOR]);
  logman(['delete', COLLECTOR]);
  for (const f of fs.readdirSync(os.tmpdir()).filter((x) => x.startsWith(path.basename(PERF_BASE)))) {
    try {
      fs.unlinkSync(path.join(os.tmpdir(), f));
    } catch {
      /* ignore */
    }
  }
  console.error(`[setup] image=${IMAGE}; removed ${removed} stale container(s); workspace=${WORKSPACE}`);

  // ---- 2. start host perfmon (system counters) ----
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
  console.error('[perfmon] started ' + new Date(captureStartMs).toISOString());

  // ---- 3. spawn the SHIPPED Windows-container preview render (host PS -> docker run) ----
  const renderPlan = buildWindowsContainerViPreviewCommandPlan({
    hostWorkspaceDirectory: WORKSPACE,
    hostOperationDirectory: OPDIR,
    containerImage: IMAGE,
    viFilename: VI_FILENAME,
    outputFilename: OUT_HTML,
    containerLabviewPath: WINDOWS_CONTAINER_LABVIEW_EXE,
    hostPowerShellExecutable: resolveWindowsPowerShellHostExecutable('win32')
  });
  console.error('[render] spawn ' + renderPlan.executable + ' (docker run ' + IMAGE + ' ...)');
  const child = spawn(renderPlan.executable, renderPlan.args, { windowsHide: true });
  let renderOut = '';
  child.stdout.on('data', (d) => (renderOut += d.toString()));
  child.stderr.on('data', (d) => (renderOut += d.toString()));
  let renderExit = null;
  child.on('exit', (code) => (renderExit = code));

  // ---- 4. poll the container's mounted TEMP for the launch-log markers ----
  let logHit = null;
  let timing = null;
  let sawLog = false;
  let nextProgressMs = Date.now() + 20000;
  const deadline = Date.now() + MARKER_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const hit = newestContainerLog();
    if (hit && !sawLog) {
      sawLog = true;
      console.error('[render] container LabVIEW log appeared after ' + ((Date.now() - captureStartMs) / 1000).toFixed(1) + 's: ' + hit.name);
    }
    if (hit) {
      let text = '';
      try {
        text = fs.readFileSync(hit.p, 'utf8');
      } catch {
        /* mid-write */
      }
      try {
        const t = parseLabVIEWLaunchTiming(text);
        if (t && t.processStartIso && t.executionReadyIso) {
          logHit = hit;
          timing = t;
          break;
        }
      } catch {
        /* partial log — keep polling */
      }
    }
    if (Date.now() >= nextProgressMs) {
      console.error(
        '[render] waiting ' +
          ((Date.now() - captureStartMs) / 1000).toFixed(0) +
          's (container ' +
          (sawLog ? 'log present, awaiting execution-ready' : 'booting, no log yet') +
          ', renderExit=' +
          renderExit +
          ')'
      );
      if (renderExit !== null && !sawLog) {
        console.error('[render] NOTE render process exited (code ' + renderExit + ') tail: ' + renderOut.split(/\r?\n/).slice(-8).join(' | '));
      }
      nextProgressMs = Date.now() + 20000;
    }
  }

  if (!logHit || !timing) {
    logman(plan.stop.args);
    logman(plan.delete.args);
    dockerRmByAncestor();
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    console.error('[render tail]\n' + renderOut.split(/\r?\n/).slice(-15).join('\n'));
    throw new Error('Launch markers never appeared within ' + MARKER_POLL_TIMEOUT_MS + 'ms.');
  }
  console.error('[render] markers present after ' + ((logHit.m - captureStartMs) / 1000).toFixed(1) + 's (' + logHit.name + ')');

  // ---- 5. hold the perfmon window, stop, tear down the container ----
  const elapsed = Date.now() - captureStartMs;
  if (elapsed < MIN_CAPTURE_MS) {
    console.error('[perfmon] extending capture by ' + (MIN_CAPTURE_MS - elapsed) + 'ms for a fuller window...');
    await sleep(MIN_CAPTURE_MS - elapsed);
  }
  logman(plan.stop.args, { loud: true });
  const captureEndMs = Date.now();
  dockerRmByAncestor();
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  console.error(
    '[perfmon] stopped ' +
      new Date(captureEndMs).toISOString() +
      ' (window ' +
      ((captureEndMs - captureStartMs) / 1000).toFixed(1) +
      's, renderExit=' +
      renderExit +
      ', html=' +
      fs.existsSync(path.join(WORKSPACE, OUT_HTML)) +
      ')'
  );

  // ---- 6. read the REAL captured CSV + the container launch log ----
  const csvHit = (() => {
    const hits = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith(path.basename(PERF_BASE)) && f.toLowerCase().endsWith('.csv'))
      .map((f) => ({ p: path.join(os.tmpdir(), f), m: fs.statSync(path.join(os.tmpdir(), f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return hits[0];
  })();
  const csvText = csvHit ? fs.readFileSync(csvHit.p, 'utf8') : '';
  logman(plan.delete.args);
  console.error('[perfmon] csv ' + (csvHit ? path.basename(csvHit.p) : '(none)') + '  (' + csvText.length + ' bytes)');
  if (csvText.trim().length === 0) {
    throw new Error('logman produced an empty CSV — no perfmon samples captured.');
  }
  const logText = fs.readFileSync(logHit.p, 'utf8');

  // ---- 7. deterministic replay-frame stream anchored to the capture start ----
  const windowSec = (captureEndMs - captureStartMs) / 1000;
  const frameStream = {
    frameRateHz: FRAME_RATE_HZ,
    frameCount: Math.ceil(windowSec * FRAME_RATE_HZ) + FRAME_RATE_HZ,
    epochMsAtFrameZero: captureStartMs
  };

  // ---- 8. run the SHIPPED pipeline with the docker-container mirror source ----
  const result = runFirstRunPerfmonPipeline(
    {
      request: { collectorName: COLLECTOR, outputCsvPath: PERF_O, sampleIntervalSec: SAMPLE_INTERVAL_SEC },
      source: 'docker-container',
      actor: 'windows-container-e2e',
      labviewLaunch: { logText, frameStream }
    },
    { capture: () => ({ csvText, startMs: captureStartMs, endMs: captureEndMs }) }
  );

  // ---- 9. report + assert + optional evidence JSON ----
  const fp = Object.fromEntries(result.tdmsModel.fileProperties.map((p) => [p.name, p.value]));
  const lc = result.launchCorrelation;
  console.log('\n===== VHS-REQ-718 CONTAINER END-TO-END RESULT =====');
  console.log('image                 :', IMAGE);
  console.log('perfmon capturedAtIso :', result.artifact.capturedAtIso);
  console.log('perfmon wallMs        :', result.artifact.wallMs);
  console.log('perfmon samples       :', result.artifact.perf ? result.artifact.perf.t.length : '(n/a)');
  console.log('perfmon channels      :', result.artifact.perf ? Object.keys(result.artifact.perf.series).join(', ') : '(n/a)');
  console.log('tdms sample_count     :', fp.sample_count);
  console.log('launchCorrelation     :', lc && lc.status);

  const evidence = {
    schema: 'vi-history-suite/perfmon-labview-container-e2e-evidence@v1',
    image: IMAGE,
    capturedAtIso: result.artifact.capturedAtIso,
    perfmonWallMs: result.artifact.wallMs,
    perfmonSamples: result.artifact.perf ? result.artifact.perf.t.length : null,
    perfmonChannels: result.artifact.perf ? Object.keys(result.artifact.perf.series) : [],
    tdmsSampleCount: fp.sample_count,
    launchCorrelationStatus: lc && lc.status,
    launchCorrelation:
      lc && lc.status === 'correlated'
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
  console.log('\nRESULT: PASS — container perfmon capture correlated to a container LabVIEW launch end-to-end.');
  console.log('===== END =====');
}

main().catch((err) => {
  console.error('\n[perfmon-container-e2e] DRIVER ERROR: ' + (err && err.stack ? err.stack : err));
  try {
    dockerRmByAncestor();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
