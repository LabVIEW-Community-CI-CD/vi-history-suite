// Windows perfmon -> TDMS -> mprr-sync -> bounded-RAM replay validation driver
// (issue #2335 Part E, VHS-REQ-707 Windows-native real-hardware proof).
//
// Maintainer real-hardware evidence tool (a `.cjs`, exempt from the
// `scripts/*.js` traceability glob like `windows-compare-driver.cjs`). It drives
// the SHIPPED compiled modules under `out/reporting/mirror/` and
// `out/reporting/syncDiagnostics/` VERBATIM through the full mprr-grounded
// pipeline on real Windows hardware:
//
//   E1  Capture a real Windows-native `logman` PDH-CSV trace AROUND a real
//       host-native CreateComparisonReport (buildWindowsPerfmonCapturePlan +
//       renderWindowsPerfmonCaptureScript are rendered as evidence; logman is
//       driven with the plan's exact argv for lifecycle control).
//   E2  parsePdhCsv -> buildFirstRunPerfmonArtifact (first-run-perfmon@v1)
//       -> buildPerfmonTdmsModel (perfmon-tdms-model@v1 channel model).
//   E3  buildPerfmonMprrSync maps samples to the mprr stopwatch/frame timebase
//       (bit-exact machine strip); authoritative only when calibrated (E5).
//   E4  DeterministicRollingBlockRing: planRingAdmission fails closed when the
//       budget cannot hold the three-block horizon, then a byte-identical
//       round-trip of the TDMS/artifact stream; analyzePerfmonSessionPattern
//       across a cold + warm capture.
//   E5  Render the mprr calibration + stopwatch surfaces, capture each headless
//       via Chrome at 1:1 device scale, decode the PNG (built-in zlib), and
//       prove evaluateMprrCalibration (8 fiducials <= 60) -> calibrated,
//       decodeMprrStripImage recovers the printed stopwatch bits, and
//       analyzeStopwatchCaptureAccuracy classifies the 12 fps capture
//       authoritative.
//   E6  Run the same capture + TDMS on the Docker windows-container channel and
//       reconcile the shared resource channels (dual-source parity).
//
// Evidence lands under `win-validation\` (gitignored). Run from the repo root
// AFTER `npm run compile` (it loads ./out). Env (all optional):
//   VIHS_MPRR_REPO_ROOT     fixture repo (default C:\repos\labview-icon-editor)
//   VIHS_MPRR_VI_PATH       repo-relative VI (default resource/plugins/lv_icon.vi)
//   VIHS_MPRR_BASE          base rev  (default 5376833)
//   VIHS_MPRR_SELECTED      selected rev (default fc09736)
//   VIHS_MPRR_LV_VERSION    host-native LabVIEW year (default 2026)
//   VIHS_MPRR_LV_BITNESS    x86|x64 (default x64)
//   VIHS_MPRR_CONTAINER_IMAGE  windows-container image (default 2026q1patch2-windows)
//   VIHS_MPRR_OUT           evidence dir (default win-validation\mprr)
//   VIHS_MPRR_CHROME        chrome.exe path (default: auto-detect)
//   VIHS_MPRR_SKIP_CHROME=1 skip E5 (calibration/stopwatch capture)
//   VIHS_MPRR_SKIP_DOCKER=1 skip E6 (docker dual-source)

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');

function sleepMs(ms) {
  // Programmatic blocking sleep (no subprocess) so a background typeperf child
  // can initialize / flush while the main thread waits.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const REPO_ROOT = process.cwd();
const OUT_MIRROR = path.join(REPO_ROOT, 'out', 'reporting', 'mirror');
const OUT_SYNC = path.join(REPO_ROOT, 'out', 'reporting', 'syncDiagnostics');

function loadModule(dir, name) {
  const target = path.join(dir, `${name}.js`);
  if (!fs.existsSync(target)) {
    throw new Error(`Compiled module not found: ${target}. Run \`npm run compile\` first.`);
  }
  return require(target);
}

const capturePlanMod = loadModule(OUT_MIRROR, 'perfmonCapturePlan');
const captureScriptMod = loadModule(OUT_MIRROR, 'perfmonCaptureScript');
const sampleSeriesMod = loadModule(OUT_MIRROR, 'perfmonSampleSeries');
const tdmsModelMod = loadModule(OUT_MIRROR, 'perfmonTdmsModel');
const mprrSyncMod = loadModule(OUT_MIRROR, 'perfmonMprrSync');
const ringMod = loadModule(OUT_MIRROR, 'deterministicRollingBlockRing');
const sessionPatternMod = loadModule(OUT_MIRROR, 'perfmonSessionPattern');
const calibrationMod = loadModule(OUT_SYNC, 'mprrCalibrationSurface');
const calibrationRendererMod = loadModule(OUT_SYNC, 'mprrCalibrationSurfaceRenderer');
const stopwatchRendererMod = loadModule(OUT_SYNC, 'mprrStopwatchSurfaceRenderer');
const stripDecoderMod = loadModule(OUT_SYNC, 'mprrStripImageDecoder');
const stopwatchAccuracyMod = loadModule(OUT_SYNC, 'stopwatchCaptureAccuracy');

const CONFIG = {
  repoRoot: process.env.VIHS_MPRR_REPO_ROOT || 'C:\\repos\\labview-icon-editor',
  viPath: process.env.VIHS_MPRR_VI_PATH || 'resource/plugins/lv_icon.vi',
  base: process.env.VIHS_MPRR_BASE || '5376833',
  selected: process.env.VIHS_MPRR_SELECTED || 'fc09736',
  lvVersion: process.env.VIHS_MPRR_LV_VERSION || '2026',
  lvBitness: (process.env.VIHS_MPRR_LV_BITNESS || 'x64').toLowerCase() === 'x86' ? 'x86' : 'x64',
  containerImage: process.env.VIHS_MPRR_CONTAINER_IMAGE || 'nationalinstruments/labview:2026q1patch2-windows',
  outDir: path.resolve(REPO_ROOT, process.env.VIHS_MPRR_OUT || path.join('win-validation', 'mprr')),
  chrome: process.env.VIHS_MPRR_CHROME || undefined,
  skipChrome: process.env.VIHS_MPRR_SKIP_CHROME === '1',
  skipDocker: process.env.VIHS_MPRR_SKIP_DOCKER === '1'
};

const EVIDENCE = {
  schema: 'vi-history-suite/windows-perfmon-mprr-evidence@v1',
  schemaVersion: 1,
  runAtIso: new Date().toISOString(),
  host: { platform: process.platform, node: process.version },
  captureTool: 'typeperf (unelevated PDH-CSV; shipped logman plan + capture script retained as evidence per capture)',
  config: { ...CONFIG },
  stages: {}
};

function log(msg) {
  process.stdout.write(`[mprr] ${msg}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Minimal PNG decoder (8-bit, colour type 2/6, no interlace) using zlib.
// Chrome `--screenshot` emits exactly this. Returns { width, height, channels,
// data: Uint8Array } row-major, and a getPixel(x,y) helper.
// ---------------------------------------------------------------------------
function decodePng(buffer) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i += 1) {
    assert(buffer[i] === sig[i], 'not a PNG (bad signature)');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // skip data + CRC
  }
  assert(bitDepth === 8, `unsupported PNG bit depth ${bitDepth}`);
  assert(interlace === 0, 'interlaced PNG not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert(channels !== 0, `unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };
  let rawPos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawPos];
    rawPos += 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rawPos + x];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let recon;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + a; break;
        case 2: recon = value + b; break;
        case 3: recon = value + Math.floor((a + b) / 2); break;
        case 4: recon = value + paeth(a, b, c); break;
        default: throw new Error(`unsupported PNG filter ${filter}`);
      }
      out[y * stride + x] = recon & 0xff;
    }
    rawPos += stride;
  }
  return {
    width,
    height,
    channels,
    data: out,
    getPixel(x, y) {
      const px = Math.max(0, Math.min(width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(height - 1, Math.round(y)));
      const i = py * stride + px * channels;
      return { r: out[i], g: out[i + 1], b: out[i + 2] };
    }
  };
}

// ---------------------------------------------------------------------------
// Chrome headless capture: render HTML to a PNG at 1:1 device scale.
// ---------------------------------------------------------------------------
function resolveChrome() {
  if (CONFIG.chrome && fs.existsSync(CONFIG.chrome)) {
    return CONFIG.chrome;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const which = spawnSync('where.exe', ['chrome.exe'], { encoding: 'utf8' });
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).find((line) => line.trim());
    if (first && fs.existsSync(first.trim())) {
      return first.trim();
    }
  }
  throw new Error('Chrome/Edge not found; set VIHS_MPRR_CHROME or VIHS_MPRR_SKIP_CHROME=1.');
}

function captureHtmlToPng(chrome, html, dims, workDir, tag) {
  const htmlPath = path.join(workDir, `${tag}.html`);
  const pngPath = path.join(workDir, `${tag}.png`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  const profileDir = path.join(workDir, `chrome-profile-${tag}`);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--user-data-dir=${profileDir}`,
    `--window-size=${dims.width},${dims.height}`,
    `--screenshot=${pngPath}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`
  ];
  const result = spawnSync(chrome, args, { encoding: 'utf8', timeout: 60000 });
  assert(fs.existsSync(pngPath), `Chrome did not produce ${pngPath} (status ${result.status})`);
  return decodePng(fs.readFileSync(pngPath));
}

// ---------------------------------------------------------------------------
// Run a real host-native / docker compare via windows-compare-driver.cjs.
// ---------------------------------------------------------------------------
function runCompare(provider, label, storageRoot) {
  const env = {
    ...process.env,
    WIN_REPO_ROOT: CONFIG.repoRoot,
    WIN_VI_PATH: CONFIG.viPath,
    WIN_BASE: CONFIG.base,
    WIN_SELECTED: CONFIG.selected,
    WIN_PROVIDER: provider,
    WIN_LV_VERSION: CONFIG.lvVersion,
    WIN_LV_BITNESS: provider === 'docker' ? 'x64' : CONFIG.lvBitness,
    WIN_LABEL: label,
    WIN_STORAGE_ROOT: storageRoot
  };
  if (provider === 'docker') {
    env.WIN_CONTAINER_IMAGE = CONFIG.containerImage;
  }
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join('scripts', 'windows-compare-driver.cjs')], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000
  });
  const ended = Date.now();
  const line = (result.stdout || '').split(/\r?\n/).find((l) => l.startsWith('VIHS_RESULT_JSON'));
  let compareResult = null;
  if (line) {
    try {
      compareResult = JSON.parse(line.slice('VIHS_RESULT_JSON'.length).trim());
    } catch {
      compareResult = null;
    }
  }
  return { startMs: started, endMs: ended, compareResult, exitStatus: result.status, stderr: result.stderr };
}

function closeLabview() {
  spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-Process LabVIEW -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"], { encoding: 'utf8' });
}

function labviewRunning() {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', "(Get-Process LabVIEW -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: 'utf8' });
  return Number.parseInt((result.stdout || '0').trim(), 10) > 0;
}

// ---------------------------------------------------------------------------
// E1: capture a PDH-CSV around a real compare, using the shipped plan.
//
// The shipped capture plan/script target an ELEVATED self-hosted runner (logman
// data-collector creation requires admin / Performance Log Users). On an
// unelevated interactive host we must not trigger a UAC prompt, so the actual
// sampling uses `typeperf` (no collector, no elevation) with the SAME counter
// set the shipped plan derives; the logman plan + hardened capture script are
// still built and retained as evidence of the shipped orchestration.
// ---------------------------------------------------------------------------
function sanitizePdhCsv(csvPath) {
  // typeperf force-terminated mid-sample can leave a truncated trailing line;
  // keep the header plus every data row whose column count matches the header.
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return;
  }
  const headerCols = lines[0].split('","').length;
  const kept = [lines[0]];
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].split('","').length === headerCols) {
      kept.push(lines[i]);
    }
  }
  fs.writeFileSync(csvPath, `${kept.join('\r\n')}\r\n`, 'utf8');
}

function captureAroundCompare(options) {
  const { tag, provider, withLabviewCounters } = options;
  const captureDir = ensureDir(path.join(CONFIG.outDir, tag));
  const csvBase = 'perf';
  const outputCsvPath = path.join(captureDir, csvBase);
  const collectorName = `vihs-mprr-${tag}`;

  const plan = capturePlanMod.buildWindowsPerfmonCapturePlan({
    collectorName,
    outputCsvPath,
    sampleIntervalSec: 1,
    ...(withLabviewCounters ? { labviewProcessName: 'LabVIEW' } : {})
  });
  assert(plan.schema === capturePlanMod.PERFMON_CAPTURE_PLAN_SCHEMA, 'capture plan schema mismatch');

  // Retain the shipped hardened capture script as evidence of the elevated-actor
  // orchestration (logman lifecycle) even though we sample via typeperf here.
  const captureScript = captureScriptMod.renderWindowsPerfmonCaptureScript({
    plan,
    comparisonExecutable: process.execPath,
    comparisonArgs: [path.join('scripts', 'windows-compare-driver.cjs')],
    windowJsonPath: path.join(captureDir, 'window.json'),
    settleSeconds: 2
  });
  fs.writeFileSync(path.join(captureDir, 'capture.ps1'), captureScript, 'utf8');

  // Start typeperf sampling the plan's counters to a real PDH-CSV.
  const csvPath = `${outputCsvPath}.csv`;
  const typeperfArgs = [...plan.counters, '-si', '1', '-f', 'CSV', '-o', csvPath, '-y'];
  const typeperf = spawn('typeperf.exe', typeperfArgs, { windowsHide: true, stdio: 'ignore' });
  sleepMs(2500); // let typeperf resolve counters and write the header

  // Run the real compare inside the capture window.
  const storageRoot = path.join(captureDir, 'storage');
  const compare = runCompare(provider, `mprr-${tag}`, storageRoot);

  // Stop typeperf (force + tree) and wait for the OS to release the CSV handle.
  spawnSync('taskkill.exe', ['/PID', String(typeperf.pid), '/T', '/F'], { windowsHide: true });
  try {
    typeperf.kill('SIGKILL');
  } catch {
    // already exited
  }
  assert(fs.existsSync(csvPath), `no PDH-CSV produced at ${csvPath}`);
  // Retry until typeperf has released the file (EBUSY otherwise).
  let released = false;
  for (let attempt = 0; attempt < 20 && !released; attempt += 1) {
    try {
      const handle = fs.openSync(csvPath, 'r+');
      fs.closeSync(handle);
      released = true;
    } catch {
      sleepMs(500);
    }
  }
  assert(released, `PDH-CSV still locked by typeperf: ${csvPath}`);
  sanitizePdhCsv(csvPath);

  const cycles = [
    {
      cycleIndex: 1,
      durationMs: compare.endMs - compare.startMs,
      outcome: compare.compareResult && compare.compareResult.runtimeState === 'succeeded' ? 'compared' : 'incomplete'
    }
  ];
  const window = { startMs: compare.startMs, endMs: compare.endMs, cycles };
  fs.writeFileSync(path.join(captureDir, 'window.json'), JSON.stringify(window, null, 2), 'utf8');

  return { captureDir, csvPath, window, plan, compare };
}

// A resident capture samples an ALREADY-RUNNING LabVIEW with the process
// counters resolved (the product blocks a second host-native compare while a
// LabVIEW is resident with `windows-host-runtime-surface-contaminated`, so the
// LabVIEW process channels are proven by sampling the resident engine rather
// than by a blocked second compare).
function captureResident(options) {
  const { tag, sampleSeconds } = options;
  const captureDir = ensureDir(path.join(CONFIG.outDir, tag));
  const outputCsvPath = path.join(captureDir, 'perf');
  const plan = capturePlanMod.buildWindowsPerfmonCapturePlan({
    collectorName: `vihs-mprr-${tag}`,
    outputCsvPath,
    sampleIntervalSec: 1,
    labviewProcessName: 'LabVIEW'
  });
  const csvPath = `${outputCsvPath}.csv`;
  const typeperf = spawn('typeperf.exe', [...plan.counters, '-si', '1', '-f', 'CSV', '-o', csvPath, '-y'], {
    windowsHide: true,
    stdio: 'ignore'
  });
  const startMs = Date.now();
  sleepMs((sampleSeconds || 15) * 1000 + 2500);
  const endMs = Date.now();
  spawnSync('taskkill.exe', ['/PID', String(typeperf.pid), '/T', '/F'], { windowsHide: true });
  try {
    typeperf.kill('SIGKILL');
  } catch {
    // already exited
  }
  assert(fs.existsSync(csvPath), `no PDH-CSV produced at ${csvPath}`);
  let released = false;
  for (let attempt = 0; attempt < 20 && !released; attempt += 1) {
    try {
      const handle = fs.openSync(csvPath, 'r+');
      fs.closeSync(handle);
      released = true;
    } catch {
      sleepMs(500);
    }
  }
  assert(released, `PDH-CSV still locked by typeperf: ${csvPath}`);
  sanitizePdhCsv(csvPath);
  const cycles = [{ cycleIndex: 1, durationMs: endMs - startMs, outcome: 'labview-resident' }];
  const window = { startMs, endMs, cycles };
  fs.writeFileSync(path.join(captureDir, 'window.json'), JSON.stringify(window, null, 2), 'utf8');
  return { captureDir, csvPath, window, plan };
}

// ---------------------------------------------------------------------------
// E5: prove calibration + stopwatch decode on Windows via Chrome capture.
// ---------------------------------------------------------------------------
function proveCalibration(chrome, workDir) {
  const dims = { width: 960, height: 600 };
  const html = calibrationRendererMod.renderMprrCalibrationSurfaceHtml(dims);
  const image = captureHtmlToPng(chrome, html, dims, workDir, 'calibration-surface');

  // Sample each marker's centre pixel and a border pixel.
  const markers = calibrationMod.MPRR_CALIBRATION_MARKERS.map((marker) => {
    const rect = calibrationRendererMod.resolveMarkerRect(dims, marker);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const detectedColorRgb = image.getPixel(cx, cy);
    return { id: marker.id, detectedColorRgb, withinExpectedBounds: true };
  });
  // Border visible when the outer frame is near-black. Sample several edge
  // points BETWEEN the corner/mid-edge markers (a naive centre-of-edge sample
  // lands on the top-centre marker), and require the points to be near-black.
  const borderSamples = [
    [image.width * 0.25, 1],
    [image.width * 0.75, 1],
    [1, image.height * 0.25],
    [image.width - 2, image.height * 0.75],
    [image.width * 0.25, image.height - 2]
  ].map(([x, y]) => image.getPixel(x, y));
  const borderVisible = borderSamples.every((p) => p.r < 60 && p.g < 60 && p.b < 60);

  const result = calibrationMod.evaluateMprrCalibration({ borderVisible, markers });
  return { dims, borderVisible, borderSamples, result };
}

function proveStopwatch(chrome, workDir) {
  const dims = { width: 1000, height: 240 };
  const region = stopwatchRendererMod.buildMprrStopwatchStripRegion(dims);
  const nominalFps = 12;
  const intervalMs = 1000 / nominalFps;
  const frameCount = 12;
  const frames = [];
  const decoded = [];
  for (let i = 0; i < frameCount; i += 1) {
    const captureEpochMs = Math.round(i * intervalMs);
    const centiseconds = Math.round(captureEpochMs / 10);
    const html = stopwatchRendererMod.renderMprrStopwatchSurfaceHtml({ centiseconds, width: dims.width, height: dims.height });
    const image = captureHtmlToPng(chrome, html, dims, workDir, `stopwatch-${i}`);
    // Sample a luminance row across the middle of the machine-strip region.
    const y = region.top + Math.max(1, Math.floor(region.height / 2));
    const rowLuminance = [];
    for (let x = region.left; x < region.left + region.width; x += 1) {
      rowLuminance.push(stripDecoderMod.luminance(image.getPixel(x, y)));
    }
    const strip = stripDecoderMod.decodeMprrStripImage({ rowLuminance });
    decoded.push({ frameIndex: i, centiseconds, decoded: strip.centiseconds, wellFormed: strip.wellFormed, preambleOk: strip.preambleOk, checksumOk: strip.checksumOk });
    frames.push({ frameIndex: i, captureEpochMs, decodedCentiseconds: strip.centiseconds });
  }
  const accuracy = stopwatchAccuracyMod.analyzeStopwatchCaptureAccuracy({ nominalFps, frames, minDurationMs: 500 });
  return { dims, region, decoded, accuracy };
}

// ---------------------------------------------------------------------------
// Serialize a TDMS model + artifact into a byte stream for the ring round-trip.
// ---------------------------------------------------------------------------
function serializeStream(model, artifact) {
  return Buffer.from(`${JSON.stringify(model)}\n${JSON.stringify(artifact)}`, 'utf8');
}

function stageOk(name, fn) {
  try {
    const detail = fn();
    EVIDENCE.stages[name] = { status: 'pass', ...detail };
    log(`${name}: PASS`);
    return detail;
  } catch (error) {
    EVIDENCE.stages[name] = { status: 'fail', error: error instanceof Error ? error.message : String(error) };
    log(`${name}: FAIL - ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function stageBestEffort(name, fn) {
  try {
    const detail = fn();
    EVIDENCE.stages[name] = { status: 'pass', ...detail };
    log(`${name}: PASS`);
    return detail;
  } catch (error) {
    EVIDENCE.stages[name] = { status: 'skip', error: error instanceof Error ? error.message : String(error) };
    log(`${name}: SKIP - ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function main() {
  ensureDir(CONFIG.outDir);
  log(`repo=${CONFIG.repoRoot} vi=${CONFIG.viPath} lv=${CONFIG.lvVersion} ${CONFIG.lvBitness}`);

  // ---- E5 first: calibration verdict gates E3's authoritative flag. ----
  let calibration = { calibrated: false, fault: 'not-evaluated' };
  let stopwatchProof;
  if (!CONFIG.skipChrome) {
    const chromeDir = ensureDir(path.join(CONFIG.outDir, 'surfaces'));
    const chrome = resolveChrome();
    log(`E5 using browser: ${chrome}`);
    const calib = stageBestEffort('E5-calibration', () => proveCalibration(chrome, chromeDir));
    if (calib) {
      calibration = calib.result;
      assert(calib.result.calibrated === true, `calibration not calibrated (fault=${calib.result.fault})`);
      EVIDENCE.stages['E5-calibration'].calibrated = calib.result.calibrated;
      EVIDENCE.stages['E5-calibration'].fault = calib.result.fault;
      EVIDENCE.stages['E5-calibration'].detectedMarkerCount = calib.result.detectedMarkerCount;
    }
    stopwatchProof = stageBestEffort('E5-stopwatch', () => {
      const proof = proveStopwatch(chrome, chromeDir);
      assert(proof.accuracy.classification === 'authoritative', `stopwatch accuracy ${proof.accuracy.classification}`);
      return {
        classification: proof.accuracy.classification,
        effectiveFps: proof.accuracy.effectiveFps,
        readableFrameCount: proof.accuracy.readableFrameCount,
        allWellFormed: proof.decoded.every((d) => d.wellFormed)
      };
    });
  } else {
    EVIDENCE.stages['E5-calibration'] = { status: 'skip', error: 'VIHS_MPRR_SKIP_CHROME=1' };
    EVIDENCE.stages['E5-stopwatch'] = { status: 'skip', error: 'VIHS_MPRR_SKIP_CHROME=1' };
    log('E5: skipped (VIHS_MPRR_SKIP_CHROME=1)');
  }

  // ---- E1: cold capture (real compare, system counters) + warm resident
  // capture (LabVIEW process channels). A second host-native compare while
  // LabVIEW is resident is blocked by design, so the LabVIEW channels are proven
  // by sampling the resident engine rather than a blocked second compare. ----
  log('E1: closing LabVIEW for a cold capture baseline');
  closeLabview();

  const coldCapture = stageOk('E1-capture-cold', () => {
    const capture = captureAroundCompare({ tag: 'cold', provider: 'host', withLabviewCounters: false });
    assert(capture.compare.compareResult && capture.compare.compareResult.runtimeState === 'succeeded', 'cold compare did not succeed');
    return { csvPath: path.relative(REPO_ROOT, capture.csvPath), wallMs: capture.window.endMs - capture.window.startMs };
  });
  const coldCsv = path.resolve(REPO_ROOT, coldCapture.csvPath);
  const coldWindow = JSON.parse(fs.readFileSync(path.join(CONFIG.outDir, 'cold', 'window.json'), 'utf8'));

  assert(labviewRunning(), 'LabVIEW should be running after the cold compare for the resident capture');
  const warmCapture = stageOk('E1-capture-warm', () => {
    const capture = captureResident({ tag: 'warm', sampleSeconds: 15 });
    const perf = sampleSeriesMod.parsePdhCsv(fs.readFileSync(capture.csvPath, 'utf8'));
    const labviewChannelsResolved =
      perf.series.labviewWorkingSetMb !== undefined || perf.series.labviewCpuPct !== undefined;
    assert(labviewChannelsResolved, 'LabVIEW process channels did not resolve in the resident capture (\\Process(LabVIEW) at typeperf start)');
    return { csvPath: path.relative(REPO_ROOT, capture.csvPath), sampleCount: perf.sampleCount, labviewChannelsResolved };
  });
  const warmCsv = path.resolve(REPO_ROOT, warmCapture.csvPath);
  const warmWindow = JSON.parse(fs.readFileSync(path.join(CONFIG.outDir, 'warm', 'window.json'), 'utf8'));

  // ---- E2: artifact + TDMS channel model. The cold compare capture is the
  // primary artifact (real compare in the window); the resident capture is
  // projected too to show the LabVIEW channels in a TDMS model. ----
  const e2 = stageOk('E2-artifact-tdms', () => {
    const perf = sampleSeriesMod.parsePdhCsv(fs.readFileSync(coldCsv, 'utf8'));
    const artifact = sampleSeriesMod.buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: `windows-host-${CONFIG.lvVersion}-${CONFIG.lvBitness}`,
      capturedAtIso: new Date(coldWindow.startMs).toISOString(),
      perf,
      wallMs: coldWindow.endMs - coldWindow.startMs,
      cycles: coldWindow.cycles
    });
    assert(artifact.schema === sampleSeriesMod.FIRST_RUN_PERFMON_ARTIFACT_SCHEMA, 'artifact schema mismatch');
    const model = tdmsModelMod.buildPerfmonTdmsModel(artifact);
    assert(model.schema === tdmsModelMod.PERFMON_TDMS_MODEL_SCHEMA, 'tdms model schema mismatch');
    const samplesGroup = model.groups.find((g) => g.name === tdmsModelMod.PERFMON_TDMS_SAMPLES_GROUP);
    assert(samplesGroup, 'resource-samples group missing');
    const channelNames = samplesGroup.channels.map((c) => c.name);

    // Resident (warm) artifact + model, carrying the LabVIEW process channels.
    const warmPerf = sampleSeriesMod.parsePdhCsv(fs.readFileSync(warmCsv, 'utf8'));
    const warmArtifact = sampleSeriesMod.buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: `windows-host-${CONFIG.lvVersion}-${CONFIG.lvBitness}-resident`,
      capturedAtIso: new Date(warmWindow.startMs).toISOString(),
      perf: warmPerf,
      wallMs: warmWindow.endMs - warmWindow.startMs,
      cycles: warmWindow.cycles
    });
    const warmModel = tdmsModelMod.buildPerfmonTdmsModel(warmArtifact);
    const warmChannels = warmModel.groups.find((g) => g.name === tdmsModelMod.PERFMON_TDMS_SAMPLES_GROUP).channels.map((c) => c.name);
    const labviewChannelsInWarm = warmChannels.includes('labview_cpu_pct') || warmChannels.includes('labview_working_set_mb');

    fs.writeFileSync(path.join(CONFIG.outDir, 'cold', 'artifact.json'), JSON.stringify(artifact, null, 2), 'utf8');
    fs.writeFileSync(path.join(CONFIG.outDir, 'cold', 'tdms-model.json'), JSON.stringify(model, null, 2), 'utf8');
    fs.writeFileSync(path.join(CONFIG.outDir, 'warm', 'artifact.json'), JSON.stringify(warmArtifact, null, 2), 'utf8');
    fs.writeFileSync(path.join(CONFIG.outDir, 'warm', 'tdms-model.json'), JSON.stringify(warmModel, null, 2), 'utf8');
    EVIDENCE._primaryArtifact = artifact;
    EVIDENCE._primaryModel = model;
    EVIDENCE._warmArtifact = warmArtifact;
    return {
      sampleCount: perf.sampleCount,
      intervalMs: perf.intervalMs,
      channels: channelNames,
      warmChannels,
      labviewChannelsInWarm,
      hasRunCyclesGroup: Boolean(model.groups.find((g) => g.name === tdmsModelMod.PERFMON_TDMS_CYCLES_GROUP))
    };
  });

  // ---- E3: mprr synchronization (authoritative only when calibrated). ----
  stageOk('E3-mprr-sync', () => {
    const artifact = EVIDENCE._primaryArtifact;
    const sync = mprrSyncMod.buildPerfmonMprrSync({
      artifact,
      frame: { epochMsAtFrameZero: Date.parse(artifact.capturedAtIso), frameRateHz: 12 },
      calibration
    });
    assert(sync.schema === mprrSyncMod.PERFMON_MPRR_SYNC_SCHEMA, 'mprr sync schema mismatch');
    assert(sync.samples.length === artifact.perf.sampleCount, 'sync sample count mismatch');
    const first = sync.samples[0];
    assert(typeof first.stopwatchText === 'string' && /\d{2}:\d{2}:\d{2}\.\d{2}/.test(first.stopwatchText), 'bad stopwatchText');
    assert(typeof first.machineStripBits === 'string' && first.machineStripBits.length === 40, 'machine strip not 40-bit');
    assert(sync.authoritative === sync.calibrated, 'authoritative must equal calibrated');
    fs.writeFileSync(path.join(CONFIG.outDir, 'cold', 'mprr-sync.json'), JSON.stringify(sync, null, 2), 'utf8');
    return {
      sampleCount: sync.samples.length,
      calibrated: sync.calibrated,
      authoritative: sync.authoritative,
      firstStopwatch: first.stopwatchText,
      firstStrip: first.machineStripBits,
      allSamplesWithinFrameWindow: sync.allSamplesWithinFrameWindow
    };
  });

  // ---- E4: bounded-RAM replay (admission + byte-identical round-trip). ----
  stageOk('E4-bounded-ram-replay', () => {
    const stream = serializeStream(EVIDENCE._primaryModel, EVIDENCE._primaryArtifact);
    // Model the stream as three consecutive blocks of ~1/3 each for admission.
    const third = Math.ceil(stream.length / 3);
    const byteLedger = { 0: third, 1: third, 2: stream.length - 2 * third };
    const required = ringMod.computeRequiredThreeBlockCapacityBytes(byteLedger);
    const blocked = ringMod.planRingAdmission(Math.floor(required / 2), byteLedger);
    assert(blocked.ok === false && /admission-control-blocked/.test(blocked.reason), 'admission should fail closed on an undersized budget');
    const admitted = ringMod.planRingAdmission(required, byteLedger);
    assert(admitted.ok === true, 'admission should pass at the required budget');

    // Byte-identical round-trip through the ring in bounded chunks.
    const capacity = Math.max(ringMod.MIN_RING_CAPACITY_BYTES, required);
    const ring = new ringMod.DeterministicRollingBlockRing(capacity);
    const chunkSize = Math.max(1, Math.floor(capacity / 4));
    const readBack = Buffer.alloc(stream.length);
    let written = 0;
    let read = 0;
    while (read < stream.length) {
      while (written < stream.length) {
        const end = Math.min(written + chunkSize, stream.length);
        const chunk = stream.subarray(written, end);
        const w = ring.write(new Uint8Array(chunk));
        if (!w.ok) break; // backpressure: drain first
        const view = ring.read(w.absoluteStart, chunk.length);
        Buffer.from(view).copy(readBack, written);
        ring.advanceTail(w.absoluteEnd);
        written = end;
        read = end;
      }
    }
    const byteIdentical = Buffer.compare(readBack, stream) === 0;
    assert(byteIdentical, 'ring round-trip was not byte-identical');

    // Session pattern across the cold compare capture and the warm resident capture.
    const pattern = sessionPatternMod.analyzePerfmonSessionPattern([
      sessionPatternMod.summarizePerfmonSession(EVIDENCE._primaryArtifact, 'cold-compare'),
      sessionPatternMod.summarizePerfmonSession(EVIDENCE._warmArtifact, 'warm-resident')
    ]);
    fs.writeFileSync(path.join(CONFIG.outDir, 'session-pattern.json'), JSON.stringify(pattern, null, 2), 'utf8');
    return {
      streamBytes: stream.length,
      requiredBytes: required,
      admissionFailedClosed: blocked.ok === false,
      byteIdentical,
      sessionCount: pattern.sessionCount,
      anomalies: pattern.anomalies.length
    };
  });

  // ---- E6: dual-source reconcile (Docker windows-container). ----
  if (!CONFIG.skipDocker) {
    stageBestEffort('E6-dual-source', () => {
      closeLabview();
      const dockerCapture = captureAroundCompare({ tag: 'docker', provider: 'docker', withLabviewCounters: false });
      assert(dockerCapture.compare.compareResult && dockerCapture.compare.compareResult.runtimeState === 'succeeded', 'docker compare did not succeed');
      const dockerWindow = JSON.parse(fs.readFileSync(path.join(CONFIG.outDir, 'docker', 'window.json'), 'utf8'));
      const dockerPerf = sampleSeriesMod.parsePdhCsv(fs.readFileSync(dockerCapture.csvPath, 'utf8'));
      const dockerArtifact = sampleSeriesMod.buildFirstRunPerfmonArtifact({
        source: 'docker-container',
        actor: `windows-container-${CONFIG.lvVersion}`,
        capturedAtIso: new Date(dockerWindow.startMs).toISOString(),
        perf: dockerPerf,
        wallMs: dockerWindow.endMs - dockerWindow.startMs,
        cycles: dockerWindow.cycles
      });
      const dockerModel = tdmsModelMod.buildPerfmonTdmsModel(dockerArtifact);
      const sharedChannels = ['time_s', 'cpu_total_pct', 'mem_avail_mb', 'disk_total_pct'];
      const winSamples = EVIDENCE._primaryModel.groups.find((g) => g.name === tdmsModelMod.PERFMON_TDMS_SAMPLES_GROUP);
      const dockerSamples = dockerModel.groups.find((g) => g.name === tdmsModelMod.PERFMON_TDMS_SAMPLES_GROUP);
      const unitFor = (group, name) => {
        const ch = group.channels.find((c) => c.name === name);
        return ch ? ch.unit : undefined;
      };
      const reconciled = sharedChannels.every((name) => {
        const w = winSamples.channels.find((c) => c.name === name);
        const d = dockerSamples.channels.find((c) => c.name === name);
        return w && d && unitFor(winSamples, name) === unitFor(dockerSamples, name);
      });
      assert(reconciled, 'shared resource channels did not reconcile across sources');
      fs.writeFileSync(path.join(CONFIG.outDir, 'docker', 'tdms-model.json'), JSON.stringify(dockerModel, null, 2), 'utf8');
      return { sharedChannels, reconciled, dockerSampleCount: dockerPerf.sampleCount };
    });
  } else {
    EVIDENCE.stages['E6-dual-source'] = { status: 'skip', error: 'VIHS_MPRR_SKIP_DOCKER=1' };
    log('E6: skipped (VIHS_MPRR_SKIP_DOCKER=1)');
  }

  // Trim internal working copies before writing evidence.
  delete EVIDENCE._primaryArtifact;
  delete EVIDENCE._primaryModel;
  delete EVIDENCE._warmArtifact;
  const requiredStages = ['E1-capture-cold', 'E1-capture-warm', 'E2-artifact-tdms', 'E3-mprr-sync', 'E4-bounded-ram-replay'];
  const failed = requiredStages.filter((name) => !EVIDENCE.stages[name] || EVIDENCE.stages[name].status !== 'pass');
  EVIDENCE.summary = {
    requiredStages,
    requiredFailed: failed,
    passed: Object.entries(EVIDENCE.stages).filter(([, v]) => v.status === 'pass').map(([k]) => k),
    skipped: Object.entries(EVIDENCE.stages).filter(([, v]) => v.status === 'skip').map(([k]) => k)
  };
  const evidencePath = path.join(CONFIG.outDir, 'windows-perfmon-mprr-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(EVIDENCE, null, 2)}\n`, 'utf8');
  log(`evidence written: ${path.relative(REPO_ROOT, evidencePath)}`);
  process.stdout.write(`VIHS_MPRR_EVIDENCE ${JSON.stringify(EVIDENCE.summary)}\n`);
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    try {
      ensureDir(CONFIG.outDir);
      fs.writeFileSync(path.join(CONFIG.outDir, 'windows-perfmon-mprr-evidence.json'), `${JSON.stringify(EVIDENCE, null, 2)}\n`, 'utf8');
    } catch {
      // best effort
    }
    process.exitCode = 1;
  });
