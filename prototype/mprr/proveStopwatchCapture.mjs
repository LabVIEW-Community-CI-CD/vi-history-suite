#!/usr/bin/env node
// prototype/mprr/proveStopwatchCapture.mjs
//
// AUTHORITATIVE-CAPTURE PROOF: show the governed mprr LIVE timing-stopwatch
// (src/dev/timingStopwatchSurface.ts) full-screen, record the REAL desktop with
// ffmpeg gdigrab at 12fps, then DECODE the 40-bit machine strip out of the
// captured frames with the GOVERNED decoder and classify the capture with
// analyzeStopwatchCaptureAccuracy. If the decoded centiseconds advance ~in step
// with the frame index, the gdigrab capture CADENCE is authoritative -- which is
// exactly what upgrades captureSessionNav from "advisory epoch-alignment" to a
// cadence-verified timeline (no dropped/variable frames).
//
// Run from repo root AFTER `npm run compile`:
//   node prototype/mprr/proveStopwatchCapture.mjs
// Env: VIHS_FFMPEG/VIHS_FFPROBE (auto), VIHS_CHROME (auto), VIHS_SW_SECONDS (default 5).
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const load = (rel, name) => {
  const p = join(repoRoot, 'out', rel, `${name}.js`);
  if (!existsSync(p)) { console.error(`missing ${p}; run npm run compile`); process.exit(2); }
  return require(p);
};
const stopwatch = load('dev', 'timingStopwatchSurface');
const swRenderer = load('reporting/syncDiagnostics', 'mprrStopwatchSurfaceRenderer');
const decoder = load('reporting/syncDiagnostics', 'mprrStripImageDecoder');
const accuracyMod = load('reporting/syncDiagnostics', 'stopwatchCaptureAccuracy');

const findExe = (name, env, fallbacks) => {
  if (process.env[env] && existsSync(process.env[env])) return process.env[env];
  const shim = join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', `${name}.exe`);
  if (existsSync(shim)) return shim;
  for (const f of fallbacks || []) if (existsSync(f)) return f;
  return name;
};
const FFMPEG = findExe('ffmpeg', 'VIHS_FFMPEG');
const FFPROBE = findExe('ffprobe', 'VIHS_FFPROBE');
const CHROME = process.env.VIHS_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SECONDS = Number(process.env.VIHS_SW_SECONDS || 5);
const FPS = 12;

const outDir = resolve(repoRoot, 'win-validation', 'mprr', 'stopwatch-capture');
mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, 'live-stopwatch.html');
const capMp4 = join(outDir, 'capture.mp4');
const rowsRaw = join(outDir, 'rows.raw');
const REUSE = process.env.VIHS_SW_REUSE === '1' && existsSync(capMp4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractAllStripRows(width, height, midY) {
  // One pass: normalize size (gdigrab can emit a transient resolution change that
  // reinitializes/zeros the crop) then crop a 1px strip row from EVERY frame.
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', capMp4,
    '-vf', `scale=${width}:${height}:flags=neighbor,crop=w=${width}:h=1:x=0:y=${midY}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', rowsRaw], { encoding: 'utf8' });
  if (!existsSync(rowsRaw)) { console.error('[sw] strip extraction failed: ' + (r.stderr || '')); return null; }
  return readFileSync(rowsRaw);
}
function decodeRow(buf, frameIndex, width) {
  const stride = width * 3;
  const off = frameIndex * stride;
  if (off + stride > buf.length) return null;
  const rowLuminance = [];
  for (let x = 0; x < width; x += 1) {
    rowLuminance.push(decoder.luminance({ r: buf[off + x * 3], g: buf[off + x * 3 + 1], b: buf[off + x * 3 + 2] }));
  }
  return decoder.decodeMprrStripImage({ rowLuminance });
}

async function main() {
  console.log(`[sw] ffmpeg=${FFMPEG}`);
  console.log(`[sw] chrome present=${existsSync(CHROME)} reuse=${REUSE}`);
  let chrome = null;
  if (!REUSE) {
    writeFileSync(htmlPath, stopwatch.renderLiveTimingStopwatchHtml(), 'utf8');
    // 1) Launch Chrome full-screen (kiosk app) showing the live stopwatch.
    const profile = join(outDir, 'chrome-profile');
    chrome = spawn(CHROME, [
      `--user-data-dir=${profile}`, '--kiosk', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-gpu', `--app=file:///${htmlPath.split('\\').join('/')}`
    ], { windowsHide: false, detached: false });
    await sleep(2500); // let it paint + start advancing

    // 2) Record the real desktop at 12fps.
    spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', String(FPS),
      '-i', 'desktop', '-t', String(SECONDS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-y', capMp4], { encoding: 'utf8' });

    // 3) Close Chrome.
    try { chrome.kill(); } catch { /* ignore */ }
    spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { encoding: 'utf8' });
  }

  if (!existsSync(capMp4)) { console.error('[sw] gdigrab produced no capture'); process.exit(1); }

  // 4) Capture dims + strip region.
  const probe = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', capMp4], { encoding: 'utf8' });
  const [width, height, nbFrames] = (probe.stdout || '').trim().split(',').map(Number);
  const region = swRenderer.buildMprrStopwatchStripRegion({ width, height });
  const midY = region.top + Math.max(1, Math.floor(region.height / 2));
  console.log(`[sw] capture ${width}x${height} frames=${nbFrames}; strip region top=${region.top} h=${region.height} midY=${midY}`);

  // 5) Decode the strip from frames sampled across the capture.
  const rows = extractAllStripRows(width, height, midY);
  if (!rows) process.exit(1);
  const frames = [];
  const decodedRows = [];
  for (let fi = 0; fi < nbFrames; fi += 1) {
    const strip = decodeRow(rows, fi, width);
    if (!strip) continue;
    frames.push({ frameIndex: fi, captureEpochMs: Math.round((fi / FPS) * 1000), decodedCentiseconds: strip.centiseconds });
    decodedRows.push({ frameIndex: fi, atSec: Math.round((fi / FPS) * 100) / 100, centiseconds: strip.centiseconds, wellFormed: strip.wellFormed, preambleOk: strip.preambleOk, checksumOk: strip.checksumOk });
  }
  const accuracy = accuracyMod.analyzeStopwatchCaptureAccuracy({ nominalFps: FPS, frames, minDurationMs: 500 });

  const evidence = {
    schema: 'vi-history-suite/win-stopwatch-capture-proof@v1',
    generatedAt: new Date().toISOString(),
    capture: { width, height, fps: FPS, seconds: SECONDS },
    stripRegion: region,
    decoded: decodedRows,
    accuracy
  };
  writeFileSync(join(outDir, 'stopwatch-capture-proof.json'), JSON.stringify(evidence, null, 2), 'utf8');
  console.log('STOPWATCH_CAPTURE_PROOF decodedFrames=' + decodedRows.length + ' wellFormed=' + decodedRows.filter((d) => d.wellFormed).length + ' classification=' + accuracy.classification);
  const show = decodedRows.filter((_, i) => i % 12 === 0 || i === decodedRows.length - 1);
  for (const d of show) console.log(`  f${d.frameIndex} (${d.atSec}s) cs=${d.centiseconds} wellFormed=${d.wellFormed} preamble=${d.preambleOk} checksum=${d.checksumOk}`);
  console.log('accuracy=' + JSON.stringify(accuracy));
}

main().catch((e) => { console.error(e); process.exit(1); });
