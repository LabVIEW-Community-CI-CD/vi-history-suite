#!/usr/bin/env node
// NAMED mprr CALIBRATION SCREEN (maintainer prototype tool; inventory-exempt).
//
// The traceability intro screen for the full co-capture experiment (per maintainer):
// at the BEGINNING of each experiment segment, display ONE screen that carries all
// three post-processing signals so a recorded frame is self-identifying AND
// self-calibrating:
//   - FIDUCIAL: the GOVERNED mprr calibration surface (8 edge markers + black
//     border, renderMprrCalibrationSurfaceHtml) -> SPATIAL calibration
//     (evaluateMprrCalibration decodes the frame's pixel->screen mapping).
//   - STOPWATCH: a live, human/OCR-readable wall-clock (HH:MM:SS.mmm) + a monotonic
//     t+ms counter in the center -> TIMING signal you can read off the frame.
//   - NAME: a large EXPERIMENT-NAME banner + a run id -> TRACEABILITY (which
//     experiment this segment is, readable directly from the captured image).
// The overlay sits in the empty CENTER of the calibration surface (the fiducials
// are at the edges), so the spatial calibration is preserved -- proven headlessly
// below (8/8 markers still decode WITH the name+clock overlay).
//
// Modes:
//   --html <file>   write the named calibration screen HTML (for a Chrome kiosk to
//                   display during the co-capture intro segment).
//   --prove         (default) render it headless (--screenshot, exact device px),
//                   decode the 8 fiducials with the GOVERNED evaluateMprrCalibration,
//                   and confirm calibration survives the overlay. Emits a proof JSON.
//
// Reuses compiled out/ (run `npm run compile`). Chrome + ffmpeg required for --prove.
//
// Usage (repo root):
//   node prototype/mprr/namedCalibrationScreen.mjs --name "co-capture-lv-launch-x86" --prove
//   node prototype/mprr/namedCalibrationScreen.mjs --name "..." --run-id r1 --html <file>

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

function load(rel, name) {
  const p = join(REPO_ROOT, 'out', rel, `${name}.js`);
  if (!existsSync(p)) {
    console.error(`missing ${p}; run: npm run compile`);
    process.exit(2);
  }
  return require(p);
}

const findExe = (name, env) => {
  if (process.env[env] && existsSync(process.env[env])) return process.env[env];
  const shim = join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', `${name}.exe`);
  return existsSync(shim) ? shim : name;
};

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

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Compose the named calibration screen: the governed mprr calibration surface (8
 * edge fiducials + border) with a centered name + live-stopwatch overlay injected
 * into the surface's empty center zone (does NOT cover the edge fiducials).
 */
export function renderNamedCalibrationScreenHtml({ width, height, experimentName, runId, subtitle } = {}) {
  const calRenderer = load('reporting/syncDiagnostics', 'mprrCalibrationSurfaceRenderer');
  const base = calRenderer.renderMprrCalibrationSurfaceHtml({ width, height });

  const name = escapeHtml(experimentName || 'unnamed-experiment');
  const rid = escapeHtml(runId || '');
  const sub = escapeHtml(subtitle || `mprr calibration ${width}x${height}`);
  const nameFont = Math.max(18, Math.round(width / 24));
  const clkFont = Math.max(16, Math.round(width / 30));
  const subFont = Math.max(11, Math.round(width / 70));

  // Centered overlay in the safe center band (fiducials are at the edges).
  const overlay = [
    `    <div class="named-overlay" style="position:absolute;left:20%;top:37%;width:60%;height:26%;z-index:2;`,
    `display:flex;flex-direction:column;align-items:center;justify-content:center;`,
    `background:rgba(255,255,255,0.94);border:4px solid #000000;box-sizing:border-box;`,
    `font-family:Consolas,'Courier New',monospace;text-align:center;padding:8px;">`,
    `      <div style="font-size:${nameFont}px;font-weight:800;color:#000000;letter-spacing:1px;word-break:break-word;">${name}</div>`,
    rid ? `      <div style="font-size:${subFont}px;color:#333333;margin-top:6px;">run: ${rid}</div>` : '',
    `      <div style="font-size:${subFont}px;color:#333333;margin-top:2px;">${sub}</div>`,
    `      <div id="lvr-clk" style="font-size:${clkFont}px;font-weight:700;color:#008000;margin-top:12px;font-variant-numeric:tabular-nums;">00:00:00.000</div>`,
    `      <div id="lvr-mono" style="font-size:${subFont}px;color:#555555;margin-top:2px;">t+0 ms</div>`,
    `    </div>`,
    `    <script>`,
    `      (function(){var s=Date.now();function p(n,w){return String(n).padStart(w,'0');}`,
    `      function tick(){var d=new Date();var c=document.getElementById('lvr-clk');var m=document.getElementById('lvr-mono');`,
    `      if(c)c.textContent=p(d.getHours(),2)+':'+p(d.getMinutes(),2)+':'+p(d.getSeconds(),2)+'.'+p(d.getMilliseconds(),3);`,
    `      if(m)m.textContent='t+'+(Date.now()-s)+' ms';requestAnimationFrame(tick);}tick();})();`,
    `    </script>`
  ]
    .filter(Boolean)
    .join('\n');

  // Inject the overlay inside the .surface container (before it closes).
  const marker = '\n  </div>\n</body>';
  const idx = base.lastIndexOf(marker);
  if (idx === -1) return base; // governed HTML shape changed; fail-open to plain surface
  return `${base.slice(0, idx)}\n${overlay}${base.slice(idx)}`;
}

/** Render headless and confirm the 8 governed fiducials still calibrate through the overlay. */
export function proveNamedCalibrationScreen({ width = 1200, height = 760, experimentName = 'proof-experiment', runId = '' } = {}) {
  const calMod = load('reporting/syncDiagnostics', 'mprrCalibrationSurface');
  const calRenderer = load('reporting/syncDiagnostics', 'mprrCalibrationSurfaceRenderer');
  const FFMPEG = findExe('ffmpeg', 'VIHS_FFMPEG');
  const CHROME = process.env.VIHS_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const outDir = resolve(REPO_ROOT, 'win-validation', 'mprr', 'named-calibration');
  mkdirSync(outDir, { recursive: true });

  const htmlPath = join(outDir, 'named-calibration.html');
  const pngPath = join(outDir, 'named-calibration.png');
  const rawPath = join(outDir, 'named-calibration.raw');
  writeFileSync(htmlPath, renderNamedCalibrationScreenHtml({ width, height, experimentName, runId }), 'utf8');

  const res = spawnSync(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--default-background-color=00000000',
      `--user-data-dir=${join(outDir, 'chrome-profile')}`,
      `--window-size=${width},${height}`, `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href
    ],
    { encoding: 'utf8', timeout: 60000 }
  );
  const deadline = Date.now() + 5000;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(pngPath)) {
      const s = readFileSync(pngPath).length;
      if (s > 0 && s === lastSize) break;
      lastSize = s;
    }
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},120)']);
  }
  if (!existsSync(pngPath)) throw new Error(`Chrome did not produce ${pngPath} (status ${res.status})`);

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
    return { id: m.id, detectedColorRgb: getPixel(rect.left + rect.width / 2, rect.top + rect.height / 2), withinExpectedBounds: true };
  });
  const result = calMod.evaluateMprrCalibration({ borderVisible: true, markers });
  return {
    schema: 'vi-history-suite/named-calibration-screen-proof@v1',
    experimentName,
    runId,
    surface: { width, height },
    detectedMarkerCount: result.detectedMarkerCount,
    expectedMarkerCount: result.expectedMarkerCount ?? 8,
    calibrated: result.calibrated,
    fault: result.fault,
    overlayPreservesCalibration: result.calibrated === true,
    htmlPath: htmlPath,
    pngPath: pngPath
  };
}

// CLI
if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  const width = Number(args.width) || 1200;
  const height = Number(args.height) || 760;
  const experimentName = typeof args.name === 'string' ? args.name : 'unnamed-experiment';
  const runId = typeof args.runId === 'string' ? args.runId : '';

  if (typeof args.html === 'string') {
    const html = renderNamedCalibrationScreenHtml({ width, height, experimentName, runId });
    const out = resolve(args.html);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
    console.log(`named-calibration HTML -> ${out} (${width}x${height}, name="${experimentName}")`);
  } else {
    const cert = proveNamedCalibrationScreen({ width, height, experimentName, runId });
    const outDir = resolve(REPO_ROOT, 'win-validation', 'mprr', 'named-calibration');
    writeFileSync(join(outDir, 'named-calibration-proof.json'), JSON.stringify(cert, null, 2), 'utf8');
    console.log(
      `NAMED_CALIBRATION_PROOF name="${cert.experimentName}" markers=${cert.detectedMarkerCount}/${cert.expectedMarkerCount} calibrated=${cert.calibrated} overlayPreservesCalibration=${cert.overlayPreservesCalibration} fault=${cert.fault}`
    );
  }
}
