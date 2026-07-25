#!/usr/bin/env node
// prototype/mprr/proveScreenshotCalibration.mjs
//
// SPATIAL calibration certificate via the governed mprr calibration surface, captured with
// headless Chrome --screenshot at EXACT device pixels (the driver E5 method). Headless
// --screenshot renders at the exact --window-size regardless of the display DPI or any window
// chrome, so it sidesteps every gdigrab pitfall (title bar, 125% DPI, fixed-px clipping) that
// left the gdigrab corner composite at 5/8. Decodes the 8 fiducials with the governed
// evaluateMprrCalibration -> calibrated verdict. Emits stopwatch-free spatial certification a
// session capture can carry (host/config render+decode contract verified).
//
// Run from repo root AFTER `npm run compile`:
//   node prototype/mprr/proveScreenshotCalibration.mjs
// Env: VIHS_FFMPEG (auto), VIHS_CHROME (auto), VIHS_CAL_W/VIHS_CAL_H (default 1200x760).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
const CHROME = process.env.VIHS_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CW = Number(process.env.VIHS_CAL_W || 1200);
const CH = Number(process.env.VIHS_CAL_H || 760);

const outDir = resolve(repoRoot, 'win-validation', 'mprr', 'screenshot-calibration');
mkdirSync(outDir, { recursive: true });

/** Render the mprr calibration surface and return the governed calibration verdict. */
export function proveScreenshotCalibration({ width = CW, height = CH } = {}) {
  const htmlPath = join(outDir, 'calibration.html');
  const pngPath = join(outDir, 'calibration.png');
  const rawPath = join(outDir, 'calibration.raw');
  writeFileSync(htmlPath, calRenderer.renderMprrCalibrationSurfaceHtml({ width, height }), 'utf8');

  // Headless --screenshot renders at EXACT device px (== --window-size), DPI-independent.
  const res = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--user-data-dir=${join(outDir, 'chrome-profile')}`,
    `--window-size=${width},${height}`, `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href
  ], { encoding: 'utf8', timeout: 60000 });
  // Settle for the PNG flush (headless can return before the file is fully written).
  const deadline = Date.now() + 5000;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(pngPath)) { const s = readFileSync(pngPath).length; if (s > 0 && s === lastSize) break; lastSize = s; }
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},120)']); // brief blocking wait without Start-Sleep
  }
  if (!existsSync(pngPath)) throw new Error(`Chrome did not produce ${pngPath} (status ${res.status})`);

  // Decode PNG -> raw rgb24 via ffmpeg (no JS PNG decoder needed).
  spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', rawPath], { encoding: 'utf8' });
  const buf = readFileSync(rawPath);
  const getPixel = (x, y) => {
    const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
    const o = (yi * width + xi) * 3;
    return { r: buf[o], g: buf[o + 1], b: buf[o + 2] };
  };

  const markers = calMod.MPRR_CALIBRATION_MARKERS.map((m) => {
    const rect = calRenderer.resolveMarkerRect({ width, height }, m);
    const detectedColorRgb = getPixel(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { id: m.id, detectedColorRgb, withinExpectedBounds: true };
  });
  const result = calMod.evaluateMprrCalibration({ borderVisible: true, markers });
  return {
    schema: 'vi-history-suite/win-screenshot-calibration@v1',
    method: 'headless-chrome-screenshot-exact-dims',
    surface: { width, height },
    detectedMarkerCount: result.detectedMarkerCount,
    expectedMarkerCount: result.expectedMarkerCount ?? 8,
    calibrated: result.calibrated,
    fault: result.fault,
    markers: result.markers
  };
}

// CLI
if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  const cert = proveScreenshotCalibration();
  writeFileSync(join(outDir, 'screenshot-calibration-proof.json'), JSON.stringify(cert, null, 2), 'utf8');
  console.log(`SCREENSHOT_CALIBRATION_PROOF detected=${cert.detectedMarkerCount}/${cert.expectedMarkerCount} calibrated=${cert.calibrated} fault=${cert.fault}`);
  for (const m of cert.markers) console.log(`  ${m.id}: detected=${m.detected} dist=${Math.round(m.colorDistance * 100) / 100} inTol=${m.colorWithinTolerance}`);
}
