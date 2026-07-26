#!/usr/bin/env node
// LabVIEW SPLASH DETECTION (non-headless native path; maintainer prototype tool,
// inventory-exempt).
//
// Scope (per maintainer): on the NON-headless native LabVIEW path, DETECT the
// splash screen appearing and log it as a TIMESTAMPED event, so it can later be
// correlated with the perfmon-mprr benchmark as a CPU spike. (The headless docker
// path has no visible splash -- that lane uses the LabVIEWCLI launch-timing log
// instead; see benchmarkMetadataIndex.mjs.)
//
// HOW: while LabVIEW launches, gdigrab records the real desktop at a fixed fps.
// The splash appearing is a large VISUAL TRANSITION over the (mostly static)
// desktop, so ffmpeg's `scdet` filter (per-frame mean-absolute-frame-difference,
// lavfi.scd.mafd) makes the onset an unmistakable mafd spike. The tool finds that
// spike, maps its frame index to an epoch on the capture clock, and reports the
// launch->splash latency -- the instant to line up with the CPU spike.
//
// Two modes:
//   --capture   (default) launch LabVIEW + gdigrab a fresh window, then analyze.
//   --analyze <dir>        analyze an EXISTING capture (dir with splash-capture.json
//                          + frames/), no launch. Deterministic, no LabVIEW needed.
//
// Emits <dir>/splash-detect.json (schema vi-history-suite/labview-splash-detect@v1)
// and, in --capture mode, writes the capture under the run-root splash/ convention
// (--run-root <dir> -> <dir>/splash/) so benchmarkMetadataIndex --run-root can
// correlate the splash event with the perfmon-mprr CPU spike.
//
// Requires ffmpeg + ffprobe on PATH (Gyan.FFmpeg via WinGet Links on Windows).
// gdigrab capture is Windows-only; --analyze is cross-platform.
//
// Usage (from repo root):
//   node prototype/mprr/splashDetect.mjs --analyze "%TEMP%\lvsplash"
//   node prototype/mprr/splashDetect.mjs --capture --run-root <dir> [--seconds 30] [--fps 4]
// Env: VIHS_SPLASH_LV (LabVIEW.exe path), VIHS_SPLASH_FPS, VIHS_SPLASH_SECONDS.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SCHEMA = 'vi-history-suite/labview-splash-detect@v1';
const CAPTURE_SCHEMA = 'vi-history-suite/labview-splash-capture@v1';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const DEFAULT_LV = 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
    a[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = next;
  }
  return a;
}

function relToRepo(p) {
  const r = path.relative(REPO_ROOT, p);
  return r.startsWith('..') ? p : r.split(path.sep).join('/');
}

// ------------------------------------------------------------------ capture
function killLabview() {
  spawnSync('taskkill', ['/IM', 'LabVIEW.exe', '/F', '/T'], { stdio: 'ignore' });
}

function captureLaunch(splashDir, ffmpeg, lvPath, fps, seconds) {
  const framesDir = path.join(splashDir, 'frames');
  fs.rmSync(splashDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  killLabview();
  const launchEpochMs = Date.now();
  const lv = spawnSync('cmd', ['/c', 'start', '""', '/B', lvPath], { stdio: 'ignore' });
  if (lv.error) {
    return { ok: false, reason: `launch-failed: ${lv.error.message}` };
  }
  const captureStartEpochMs = Date.now();
  const cap = spawnSync(
    ffmpeg,
    ['-y', '-v', 'error', '-f', 'gdigrab', '-framerate', String(fps), '-i', 'desktop', '-t', String(seconds), path.join(framesDir, 'f-%04d.png')],
    { encoding: 'utf8' }
  );
  killLabview();
  if (cap.status !== 0) {
    return { ok: false, reason: `gdigrab-failed: ${(cap.stderr || '').trim()}` };
  }

  const files = fs
    .readdirSync(framesDir)
    .filter((f) => /^f-\d+\.png$/.test(f))
    .sort();
  const intervalMs = 1000 / fps;
  const frames = files.map((name, i) => ({
    index: i,
    epochMs: Math.round(captureStartEpochMs + i * intervalMs),
    offsetMs: Math.round(i * intervalMs),
    path: path.join(framesDir, name),
    bytes: fs.statSync(path.join(framesDir, name)).size
  }));
  const capture = {
    schema: CAPTURE_SCHEMA,
    provider: 'host-native-interactive',
    launchEpochMs,
    captureStartEpochMs,
    fps,
    frameCount: frames.length,
    frames
  };
  fs.writeFileSync(path.join(splashDir, 'splash-capture.json'), JSON.stringify(capture, null, 2), 'utf8');
  return { ok: true, capture, framesDir };
}

// ------------------------------------------------------------------ analyze
/** Per-frame mean-absolute-frame-difference via ffmpeg `scdet`. Returns an array
 * indexed by frame number: mafd[i] = transition magnitude vs the previous frame. */
function computeFrameDiffs(ffmpeg, framePattern) {
  const r = spawnSync(
    ffmpeg,
    ['-y', '-v', 'info', '-i', framePattern, '-vf', 'scdet=t=0,metadata=mode=print', '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    { encoding: 'utf8' }
  );
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const mafd = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const fm = line.match(/frame:(\d+)\s/);
    if (fm) {
      cur = Number(fm[1]);
      continue;
    }
    const mm = line.match(/lavfi\.scd\.mafd=([\d.]+)/);
    if (mm && cur !== null) {
      mafd[cur] = Number(mm[1]);
    }
  }
  return mafd;
}

function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function analyze(splashDir, ffmpeg, args) {
  const capPath = path.join(splashDir, 'splash-capture.json');
  if (!fs.existsSync(capPath)) {
    return { ok: false, reason: `no splash-capture.json in ${relToRepo(splashDir)}` };
  }
  const capture = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  const frames = Array.isArray(capture.frames) ? capture.frames : [];
  const framesDir = path.join(splashDir, 'frames');
  const framePattern = path.join(framesDir, 'f-%04d.png');
  if (!fs.existsSync(framesDir)) {
    return { ok: false, reason: `no frames/ in ${relToRepo(splashDir)}` };
  }

  const mafd = computeFrameDiffs(ffmpeg, framePattern);
  if (mafd.filter((v) => Number.isFinite(v)).length === 0) {
    return { ok: false, reason: 'ffmpeg scdet produced no per-frame mafd (check ffmpeg on PATH / frame pattern)' };
  }

  // Baseline = median of the quiet frames; a transition is mafd well above it.
  const finite = mafd.map((v, i) => ({ i, v })).filter((x) => Number.isFinite(x.v) && x.i > 0);
  const baseline = median(finite.map((x) => x.v));
  const factor = Number(args.factor) || 3;
  const floor = Number(args.threshold) || 2;
  const thresholdVal = Math.max(floor, baseline * factor);

  const epochForFrame = (i) => (frames[i] ? frames[i].epochMs : null);
  const offsetForFrame = (i) => (frames[i] ? frames[i].offsetMs : null);

  const events = finite
    .filter((x) => x.v >= thresholdVal)
    .map((x) => ({
      kind: 'visual-transition',
      frameIndex: x.i,
      offsetMs: offsetForFrame(x.i),
      epochMs: epochForFrame(x.i),
      mafd: Number(x.v.toFixed(3))
    }))
    .sort((a, b) => a.frameIndex - b.frameIndex);

  const peak = finite.reduce((best, x) => (x.v > best.v ? x : best), { i: -1, v: -1 });
  const primaryOnset =
    peak.i >= 0
      ? {
          kind: 'splash-onset',
          frameIndex: peak.i,
          offsetMs: offsetForFrame(peak.i),
          epochMs: epochForFrame(peak.i),
          mafd: Number(peak.v.toFixed(3))
        }
      : null;

  const launchToSplashMs =
    primaryOnset && Number.isFinite(capture.launchEpochMs) && Number.isFinite(primaryOnset.epochMs)
      ? primaryOnset.epochMs - capture.launchEpochMs
      : null;

  const detect = {
    schema: SCHEMA,
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    capturePath: relToRepo(capPath),
    provider: capture.provider ?? null,
    launchEpochMs: capture.launchEpochMs ?? null,
    captureStartEpochMs: capture.captureStartEpochMs ?? null,
    fps: capture.fps ?? null,
    frameCount: frames.length,
    method: 'ffmpeg-scdet-mafd',
    baselineMafd: Number(baseline.toFixed(3)),
    thresholdMafd: Number(thresholdVal.toFixed(3)),
    primaryOnset,
    launchToSplashMs,
    events,
    correlationHint:
      'primaryOnset.epochMs is on the shared epoch-ms axis; feed this splash dir as <run-root>/splash to benchmarkMetadataIndex --run-root to line the onset up with the perfmon-mprr CPU-spike frame.'
  };
  fs.writeFileSync(path.join(splashDir, 'splash-detect.json'), JSON.stringify(detect, null, 2), 'utf8');
  return { ok: true, detect };
}

// ------------------------------------------------------------------ main
function main() {
  const args = parseArgs(process.argv.slice(2));
  const ffmpeg = typeof args.ffmpeg === 'string' ? args.ffmpeg : 'ffmpeg';

  let splashDir;
  if (typeof args.analyze === 'string') {
    splashDir = path.resolve(args.analyze);
  } else if (typeof args.runRoot === 'string') {
    splashDir = path.resolve(args.runRoot, 'splash');
  } else {
    splashDir = path.join(os.tmpdir(), 'lvsplash');
  }

  const doCapture = args.capture === true || (typeof args.analyze !== 'string' && args.capture !== false);

  if (doCapture) {
    if (process.platform !== 'win32') {
      console.error('capture mode is Windows-only (gdigrab); use --analyze on other platforms');
      process.exitCode = 1;
      return;
    }
    const lvPath = typeof args.lv === 'string' ? args.lv : process.env.VIHS_SPLASH_LV || DEFAULT_LV;
    const fps = Number(args.fps) || Number(process.env.VIHS_SPLASH_FPS) || 4;
    const seconds = Number(args.seconds) || Number(process.env.VIHS_SPLASH_SECONDS) || 30;
    console.error(`capturing: launch ${lvPath} + gdigrab ${seconds}s @${fps}fps -> ${relToRepo(splashDir)}`);
    const cap = captureLaunch(splashDir, ffmpeg, lvPath, fps, seconds);
    if (!cap.ok) {
      console.error(`capture failed: ${cap.reason}`);
      process.exitCode = 1;
      return;
    }
    console.error(`captured ${cap.capture.frameCount} frames`);
  }

  const res = analyze(splashDir, ffmpeg, args);
  if (!res.ok) {
    console.error(`analyze failed: ${res.reason}`);
    process.exitCode = 1;
    return;
  }
  const d = res.detect;
  console.log(
    `splash-detect@v1 -> ${relToRepo(path.join(splashDir, 'splash-detect.json'))} | onset frame ${d.primaryOnset?.frameIndex} @+${d.primaryOnset?.offsetMs}ms (mafd ${d.primaryOnset?.mafd}, baseline ${d.baselineMafd}), launch->splash ${d.launchToSplashMs}ms, ${d.events.length} transition(s)`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
