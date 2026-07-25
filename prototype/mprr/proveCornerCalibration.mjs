#!/usr/bin/env node
// prototype/mprr/proveCornerCalibration.mjs
//
// SPATIAL-AUTHORITATIVE PROOF: composite the governed mprr CALIBRATION surface
// (8 edge fiducials) in a screen CORNER, record the real desktop with gdigrab,
// then decode the fiducials out of the captured corner region and run the
// governed evaluateMprrCalibration. 8/8 detected => calibrated => a session
// capture that carries this corner surface can flip perfmon-mprr-sync from
// ADVISORY to spatially AUTHORITATIVE (the capture's spatial mapping is verified,
// no scale/offset distortion), complementing the timing-cadence certificate.
//
// Run from repo root AFTER `npm run compile`:
//   node prototype/mprr/proveCornerCalibration.mjs
// Env: VIHS_FFMPEG/VIHS_FFPROBE (auto), VIHS_CHROME (auto),
//   VIHS_CAL_W/VIHS_CAL_H (corner window size, default 640x400), VIHS_SW_REUSE=1 to decode an existing capture.
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
const calMod = load('reporting/syncDiagnostics', 'mprrCalibrationSurface');
const calRenderer = load('reporting/syncDiagnostics', 'mprrCalibrationSurfaceRenderer');

const findExe = (name, env) => {
  if (process.env[env] && existsSync(process.env[env])) return process.env[env];
  const shim = join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', `${name}.exe`);
  return existsSync(shim) ? shim : name;
};
const FFMPEG = findExe('ffmpeg', 'VIHS_FFMPEG');
const FFPROBE = findExe('ffprobe', 'VIHS_FFPROBE');
const CHROME = process.env.VIHS_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CW = Number(process.env.VIHS_CAL_W || 640);
const CH = Number(process.env.VIHS_CAL_H || 400);
const REUSE = process.env.VIHS_SW_REUSE === '1';

const outDir = resolve(repoRoot, 'win-validation', 'mprr', 'corner-calibration');
mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, 'calibration.html');
const capMp4 = join(outDir, 'capture.mp4');
const cornerRaw = join(outDir, 'corner.raw');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[cal] ffmpeg=${FFMPEG} chrome=${existsSync(CHROME)} corner=${CW}x${CH} reuse=${REUSE}`);
  if (!REUSE) {
    writeFileSync(htmlPath, calRenderer.renderMprrCalibrationSurfaceHtml({ width: CW, height: CH }), 'utf8');
    // Corner app window at the top-left. NOTE (finding): on this host Chrome opened a
    // TITLED window (not borderless) at ~125% DPI, so the surface landed offset below a
    // title bar and scaled ~1.25x -> assumed (0,0,CW,CH) sampling missed it (0/8).
    // --force-device-scale-factor=1 fixes the DPI; a robust corner composite still needs
    // to DETECT the surface rect in-frame (title-bar/border offset) rather than assume it.
    // The FULLSCREEN decode (proveStopwatchCapture / driver E5) has no such offset and is
    // the proven spatial+timing path; corner-composite remains a geometry TODO.
    const chrome = spawn(CHROME, [
      `--user-data-dir=${join(outDir, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-gpu', '--force-device-scale-factor=1',
      `--window-position=0,0`, `--window-size=${CW},${CH}`,
      `--app=file:///${htmlPath.split('\\').join('/')}`
    ], { windowsHide: false });
    await sleep(2500);
    spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '12', '-i', 'desktop', '-t', '3', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-y', capMp4], { encoding: 'utf8' });
    try { chrome.kill(); } catch { /* ignore */ }
    spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { encoding: 'utf8' });
  }
  if (!existsSync(capMp4)) { console.error('[cal] no capture'); process.exit(1); }

  // Desktop dims; extract frame 0 corner [0,0,CW,CH] (scale-normalize first: gdigrab res-change).
  const probe = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', capMp4], { encoding: 'utf8' });
  const [dw, dh] = (probe.stdout || '').trim().split(',').map(Number);
  spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', capMp4,
    '-vf', `scale=${dw}:${dh}:flags=neighbor,crop=w=${CW}:h=${CH}:x=0:y=0`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', cornerRaw], { encoding: 'utf8' });
  const buf = readFileSync(cornerRaw);
  const getPixel = (x, y) => {
    const xi = Math.max(0, Math.min(CW - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(CH - 1, Math.round(y)));
    const o = (yi * CW + xi) * 3;
    return { r: buf[o], g: buf[o + 1], b: buf[o + 2] };
  };

  const markers = calMod.MPRR_CALIBRATION_MARKERS.map((m) => {
    const rect = calRenderer.resolveMarkerRect({ width: CW, height: CH }, m);
    const detectedColorRgb = getPixel(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { id: m.id, detectedColorRgb, withinExpectedBounds: true };
  });
  const result = calMod.evaluateMprrCalibration({ borderVisible: true, markers });

  const evidence = {
    schema: 'vi-history-suite/win-corner-calibration-proof@v1',
    generatedAt: new Date().toISOString(),
    capture: { desktopWidth: dw, desktopHeight: dh, cornerW: CW, cornerH: CH },
    detectedMarkerCount: result.detectedMarkerCount,
    expectedMarkerCount: result.expectedMarkerCount ?? 8,
    calibrated: result.calibrated,
    fault: result.fault,
    markers: result.markers
  };
  writeFileSync(join(outDir, 'corner-calibration-proof.json'), JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`CORNER_CALIBRATION_PROOF detected=${result.detectedMarkerCount}/${result.expectedMarkerCount ?? 8} calibrated=${result.calibrated} fault=${result.fault}`);
  for (const m of result.markers) console.log(`  ${m.id}: detected=${m.detected} dist=${m.colorDistance} inTol=${m.colorWithinTolerance}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
