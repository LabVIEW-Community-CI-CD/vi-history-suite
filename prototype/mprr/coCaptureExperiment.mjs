#!/usr/bin/env node
// FULL CO-CAPTURE EXPERIMENT (maintainer prototype orchestrator; inventory-exempt).
//
// The "next phase" (per maintainer): capture LabVIEW AND the perfmon driver
// SIMULTANEOUSLY into ONE run-root, with a NAMED CALIBRATION SCREEN at the start
// (fiducial + stopwatch + experiment name) so the recorded frames self-identify +
// self-calibrate for post-processing traceability. Then correlate the LabVIEW
// SPLASH onset with the perfmon-mprr CPU SPIKE on the shared epoch/frame axis.
//
// Timeline of one experiment (single continuous gdigrab @fps + concurrent typeperf):
//   [0, intro)         Chrome kiosk shows namedCalibrationScreen (name + 8 fiducials
//                      + live stopwatch) -> frames carry the traceability signals.
//   [intro, total)     Chrome closed; REAL LabVIEW launched -> its splash appears on
//                      the captured screen and its cold-launch CPU spikes perfmon.
//
// Reuses the GOVERNED Mirror-Mode pipeline (remember-that-mprr-exists), NOT a
// parallel stack: parsePdhCsv -> buildFirstRunPerfmonArtifact -> buildPerfmonMprrSync
// (frame<->epoch axis + CPU peaks) + buildPerfmonTdmsModel (the short/long-packet
// TDMS channels). Then chains the two WIN correlation tools:
//   splashDetect.mjs --analyze   -> the LabVIEW splash onset (post-launch mafd spike)
//   benchmarkMetadataIndex.mjs --run-root -> the self-contained correlated index.
//
// Run-root layout (the injectable convention benchmarkMetadataIndex expects):
//   <run-root>/named-calibration.html, /splash/{frames,splash-capture.json,splash-detect.json},
//   <run-root>/mprr/{perf.csv,mprr-sync.json,tdms-model.json}, /labview-log/,
//   <run-root>/cocapture-experiment.json (the manifest).
//
// Windows-only (gdigrab + Chrome kiosk + LabVIEW). Requires ffmpeg + Chrome + a
// LabVIEW install, and compiled out/ (npm run compile). LabVIEW LAUNCHES for real.
//
// Run from repo root AFTER `npm run compile`:
//   node prototype/mprr/coCaptureExperiment.mjs --name lv-launch-x86 [--intro 6] [--launch 30] [--fps 12]
// Env: VIHS_SPLASH_LV (LabVIEW.exe), VIHS_CHROME, VIHS_FFMPEG, VIHS_CC_OUT.

import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { renderNamedCalibrationScreenHtml, proveNamedCalibrationScreen } from './namedCalibrationScreen.mjs';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_MIRROR = join(REPO_ROOT, 'out', 'reporting', 'mirror');

function loadGoverned(name) {
  const p = join(OUT_MIRROR, `${name}.js`);
  if (!existsSync(p)) {
    console.error(`compiled module missing: ${p}; run: npm run compile`);
    process.exit(2);
  }
  return require(p);
}
const { parsePdhCsv, buildFirstRunPerfmonArtifact } = loadGoverned('perfmonSampleSeries');
const { buildPerfmonMprrSync } = loadGoverned('perfmonMprrSync');
const { buildPerfmonTdmsModel } = loadGoverned('perfmonTdmsModel');

const findExe = (name, env) => {
  if (process.env[env] && existsSync(process.env[env])) return process.env[env];
  const shim = join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', `${name}.exe`);
  return existsSync(shim) ? shim : name;
};
const FFMPEG = findExe('ffmpeg', 'VIHS_FFMPEG');
const CHROME = process.env.VIHS_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (p) => {
  const r = p.split(REPO_ROOT + '\\').join('').split(REPO_ROOT + '/').join('');
  return r.split('\\').join('/');
};
const killLabview = () => spawnSync('taskkill', ['/IM', 'LabVIEW.exe', '/F', '/T'], { stdio: 'ignore' });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = typeof args.name === 'string' ? args.name : 'cocapture';
  const runId = typeof args.runId === 'string' ? args.runId : new Date().toISOString().replace(/[:.]/g, '-');
  const fps = Number(args.fps) || 12;
  const workload = (typeof args.workload === 'string' ? args.workload : 'launch').toLowerCase();
  const introSec = Number(args.intro) || 6;
  const launchSec = Number(args.launch) || (workload === 'compare' ? 60 : 30);
  const totalSec = introSec + launchSec;
  const lvPath = typeof args.lv === 'string' ? args.lv : process.env.VIHS_SPLASH_LV || DEFAULT_LV;

  const runRoot = resolve(REPO_ROOT, process.env.VIHS_CC_OUT || join('win-validation', 'mprr', 'cocapture', `${name}-${runId}`));
  const framesDir = join(runRoot, 'splash', 'frames');
  const mprrDir = join(runRoot, 'mprr');
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(mprrDir, { recursive: true });
  mkdirSync(join(runRoot, 'labview-log'), { recursive: true });
  console.log(`[cc] run-root=${rel(runRoot)} name=${name} intro=${introSec}s launch=${launchSec}s fps=${fps}`);

  // 0) PRE-FLIGHT: prove the named calibration screen (8/8 fiducials survive the
  // name+stopwatch overlay) as this experiment's spatial-render certificate.
  let spatialCert = null;
  try {
    spatialCert = proveNamedCalibrationScreen({ experimentName: name, runId });
    console.log(`[cc] named-calibration cert: ${spatialCert.detectedMarkerCount}/${spatialCert.expectedMarkerCount} calibrated=${spatialCert.calibrated}`);
  } catch (e) {
    console.log(`[cc] named-calibration cert failed: ${e.message}`);
  }

  // Write the named calibration screen the intro segment will DISPLAY.
  const calHtml = join(runRoot, 'named-calibration.html');
  writeFileSync(calHtml, renderNamedCalibrationScreenHtml({ width: 1600, height: 1000, experimentName: name, runId, subtitle: `co-capture intro ${introSec}s -> LabVIEW launch` }), 'utf8');

  killLabview();

  // 1) perfmon (whole window, 1 Hz) via typeperf.
  const perfCsv = join(mprrDir, 'perf.csv');
  try { rmSync(perfCsv, { force: true }); } catch { /* ignore */ }
  const perfStartEpoch = Date.now();
  const tp = spawn('typeperf', [
    '\\Processor(_Total)\\% Processor Time',
    '\\Memory\\Available MBytes',
    '\\PhysicalDisk(_Total)\\% Disk Time',
    '-si', '1', '-sc', String(Math.max(4, totalSec)), '-o', perfCsv, '-f', 'CSV', '-y'
  ], { windowsHide: true });
  const tpDone = new Promise((r) => tp.on('close', r));

  // 2) Chrome KIOSK shows the named calibration screen (the intro traceability frames).
  const chrome = spawn(CHROME, [
    '--new-window', '--kiosk', '--force-device-scale-factor=1', '--noerrdialogs',
    '--disable-infobars', '--overscroll-history-navigation=0',
    `--user-data-dir=${join(runRoot, 'chrome-profile')}`, `--app=file:///${calHtml.split('\\').join('/')}`
  ], { windowsHide: false });

  // 3) single continuous gdigrab -> PNG frames for the WHOLE window (intro + launch).
  const frameZeroEpoch = Date.now();
  const gd = spawn(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', String(fps), '-i', 'desktop',
    '-t', String(totalSec), join(framesDir, 'f-%04d.png')
  ], { windowsHide: true });
  const gdDone = new Promise((r) => gd.on('close', r));

  // 4) intro segment, then dismiss the calibration screen and LAUNCH LabVIEW.
  await sleep(introSec * 1000);
  try { chrome.kill(); } catch { /* ignore */ }
  // Surgically close the kiosk by its UNIQUE --user-data-dir: Chrome forks and the
  // launcher process exits, so a PID/tree kill is unreliable and can leave the
  // window open. Matching the profile dir in the command line closes exactly this
  // kiosk and never the user's other Chrome windows.
  if (chrome.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/F', '/T'], { stdio: 'ignore' });
  const kioskProfile = join(runRoot, 'chrome-profile');
  spawnSync('powershell', ['-NoProfile', '-Command',
    "$p=$env:VIHS_KIOSK_PROFILE; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
  ], { env: { ...process.env, VIHS_KIOSK_PROFILE: kioskProfile }, stdio: 'ignore', timeout: 8000 });
  const launchEpoch = Date.now();
  let workloadProc = null;
  if (workload === 'compare') {
    console.log(`[cc] driving REAL host-native LabVIEW compare (lv_icon.vi) at t=${((launchEpoch - frameZeroEpoch) / 1000).toFixed(1)}s ...`);
    workloadProc = spawn(process.execPath, [join('scripts', 'windows-compare-driver.cjs')], {
      cwd: REPO_ROOT, windowsHide: false,
      env: {
        ...process.env,
        WIN_REPO_ROOT: process.env.VIHS_CC_REPO || 'C:\\repos\\ni\\labview-icon-editor',
        WIN_VI_PATH: process.env.VIHS_CC_VI || 'resource/plugins/lv_icon.vi',
        WIN_BASE: process.env.VIHS_CC_BASE || '5376833',
        WIN_SELECTED: process.env.VIHS_CC_SELECTED || 'fc09736',
        WIN_PROVIDER: 'host', WIN_LV_VERSION: '2026', WIN_LV_BITNESS: process.env.VIHS_CC_BITNESS || 'x64',
        WIN_LABEL: name, WIN_STORAGE_ROOT: join(runRoot, 'compare-storage')
      }
    });
  } else {
    console.log(`[cc] launching LabVIEW at t=${((launchEpoch - frameZeroEpoch) / 1000).toFixed(1)}s -> ${lvPath}`);
    spawnSync('cmd', ['/c', 'start', '""', '/B', lvPath], { stdio: 'ignore' });
  }

  await Promise.all([tpDone, gdDone]);
  try { if (workloadProc && !workloadProc.killed) workloadProc.kill(); } catch { /* ignore */ }
  killLabview();

  // 4b) Harvest the LabVIEW launch-timing app log (LabVIEW[CLI]_..._cur.txt) written
  // during THIS session into the run-root so benchmarkMetadataIndex indexes the
  // DETERMINISTIC launch instant (robust even when a warm launch shows no big splash).
  {
    const logDirs = [os.tmpdir(), process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp') : null].filter(Boolean);
    const APP_LOG = /^LabVIEW(?:CLI)?_.*_cur\.txt$/i;
    const seen = new Set();
    let harvested = 0;
    for (const d of logDirs) {
      let entries = [];
      try { entries = readdirSync(d); } catch { entries = []; }
      for (const f of entries) {
        if (!APP_LOG.test(f)) continue;
        const full = join(d, f);
        let st; try { st = statSync(full); } catch { continue; }
        if (st.mtimeMs < launchEpoch - 5000) continue;
        const key = f.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        try { copyFileSync(full, join(runRoot, 'labview-log', f)); harvested += 1; } catch { /* ignore */ }
      }
    }
    console.log(`[cc] harvested ${harvested} LabVIEW launch-timing log(s) into labview-log/`);
  }

  // 5) splash-capture.json from the captured frames (shared epoch axis).
  const files = readdirSync(framesDir).filter((f) => /^f-\d+\.png$/.test(f)).sort();
  const intervalMs = 1000 / fps;
  const frames = files.map((f, i) => ({
    index: i,
    epochMs: Math.round(frameZeroEpoch + i * intervalMs),
    offsetMs: Math.round(i * intervalMs),
    path: join(framesDir, f),
    bytes: statSync(join(framesDir, f)).size
  }));
  const capture = {
    schema: 'vi-history-suite/labview-splash-capture@v1',
    provider: 'host-native-cocapture',
    experimentName: name, runId,
    launchEpochMs: launchEpoch,
    captureStartEpochMs: frameZeroEpoch,
    introSeconds: introSec, launchSeconds: launchSec,
    fps, frameCount: frames.length, frames
  };
  writeFileSync(join(runRoot, 'splash', 'splash-capture.json'), JSON.stringify(capture, null, 2), 'utf8');
  console.log(`[cc] captured ${frames.length} frames`);

  // 6) GOVERNED perfmon-mprr sync + TDMS model into mprr/.
  const csvText = existsSync(perfCsv) ? readFileSync(perfCsv, 'utf8') : '';
  const series = parsePdhCsv(csvText);
  const artifact = buildFirstRunPerfmonArtifact({
    source: 'self-hosted-runner', actor: `cocapture-${name}`, perf: series,
    capturedAtIso: new Date(perfStartEpoch).toISOString(), wallMs: totalSec * 1000
  });
  const sync = buildPerfmonMprrSync({
    artifact,
    frame: { epochMsAtFrameZero: frameZeroEpoch, frameRateHz: fps, frameCount: frames.length },
    calibration: { calibrated: false, fault: 'gdigrab-session-advisory (named-calibration frames carry the in-frame fiducials for post-hoc decode)' }
  });
  writeFileSync(join(mprrDir, 'mprr-sync.json'), JSON.stringify(sync, null, 2), 'utf8');
  const tdms = buildPerfmonTdmsModel(artifact, { epochMsAtFrameZero: frameZeroEpoch, frameRateHz: fps, frameCount: frames.length });
  writeFileSync(join(mprrDir, 'tdms-model.json'), JSON.stringify(tdms, null, 2), 'utf8');
  const cpuPeak = sync.peaks.find((p) => /cpu/i.test(p.series)) || sync.peaks[0] || null;
  console.log(`[cc] perfmon-mprr-sync: ${sync.samples.length} samples, ${sync.peaks.length} peaks, top CPU ${cpuPeak ? cpuPeak.series + '=' + cpuPeak.value + ' @frame ' + cpuPeak.frameIndex : '(none)'}`);

  // 7) chain the WIN correlation tools.
  const node = process.execPath;
  const sd = spawnSync(node, [join('prototype', 'mprr', 'splashDetect.mjs'), '--analyze', join(runRoot, 'splash')], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, PATH: `${join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links')};${process.env.PATH}` } });
  console.log(`[cc] splashDetect: ${(sd.stdout || sd.stderr || '').trim().split('\n').pop()}`);
  const bmi = spawnSync(node, [join('prototype', 'mprr', 'benchmarkMetadataIndex.mjs'), '--run-root', runRoot], { cwd: REPO_ROOT, encoding: 'utf8', env: process.env });
  console.log(`[cc] benchmarkMetadataIndex: ${(bmi.stdout || bmi.stderr || '').trim().split('\n').pop()}`);

  // 8) manifest.
  let splashDetect = null;
  const sdPath = join(runRoot, 'splash', 'splash-detect.json');
  if (existsSync(sdPath)) { try { splashDetect = JSON.parse(readFileSync(sdPath, 'utf8')); } catch { /* ignore */ } }

  // PHASE / CYCLE CPU metadata: per-phase CPU (calibration-intro -> launch ->
  // splash) + the CPU delta AT each transition, so a future agent can analyze CPU
  // behavior BETWEEN the experiment's cycle transitions.
  const channels = (tdms.groups || []).flatMap((g) => g.channels || []);
  const cpuChan = channels.find((c) => /cpu.*total|total.*cpu|cputotal/i.test(c.name)) || channels.find((c) => /cpu/i.test(c.name)) || null;
  const cpuData = cpuChan ? cpuChan.data : [];
  const cpuAt = (epochMs) => {
    let best = null; let bestD = Infinity;
    for (const s of sync.samples) { const d = Math.abs(s.epochMs - epochMs); if (d < bestD) { bestD = d; best = s; } }
    const v = best ? cpuData[best.sampleIndex] : null;
    return Number.isFinite(v) ? Number(v.toFixed(2)) : null;
  };
  const phaseCpu = (startEpoch, endEpoch) => {
    const vals = [];
    for (const s of sync.samples) { if (s.epochMs >= startEpoch && s.epochMs < endEpoch) { const v = cpuData[s.sampleIndex]; if (Number.isFinite(v)) vals.push(v); } }
    if (!vals.length) return { samples: 0, meanCpuPct: null, maxCpuPct: null, minCpuPct: null };
    return { samples: vals.length, meanCpuPct: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)), maxCpuPct: Number(Math.max(...vals).toFixed(2)), minCpuPct: Number(Math.min(...vals).toFixed(2)) };
  };
  const endEpochMs = frames.length ? frames[frames.length - 1].epochMs : frameZeroEpoch + totalSec * 1000;
  const frameOf = (e) => Math.round(((e - frameZeroEpoch) / 1000) * fps);
  const onsetEpoch = splashDetect && splashDetect.primaryOnset && Number.isFinite(splashDetect.primaryOnset.epochMs) ? splashDetect.primaryOnset.epochMs : null;
  const phaseDefs = [{ name: 'calibration-intro', startEpochMs: frameZeroEpoch, endEpochMs: launchEpoch, note: 'named calibration screen (fiducial+stopwatch+name) shown' }];
  if (onsetEpoch && onsetEpoch > launchEpoch) {
    phaseDefs.push({ name: 'labview-launching', startEpochMs: launchEpoch, endEpochMs: onsetEpoch, note: 'LabVIEW launched, pre-splash' });
    phaseDefs.push({ name: 'splash-visible', startEpochMs: onsetEpoch, endEpochMs, note: 'splash/window on screen + settle' });
  } else {
    phaseDefs.push({ name: 'labview-launch', startEpochMs: launchEpoch, endEpochMs, note: 'LabVIEW launched' });
  }
  const phases = phaseDefs.map((p) => ({ ...p, startFrame: frameOf(p.startEpochMs), endFrame: frameOf(p.endEpochMs), cpu: phaseCpu(p.startEpochMs, p.endEpochMs) }));
  const cpuTransitions = [];
  for (let i = 1; i < phases.length; i += 1) {
    const at = phases[i].startEpochMs;
    cpuTransitions.push({ from: phases[i - 1].name, to: phases[i].name, atEpochMs: at, atFrame: frameOf(at), cpuBeforePct: cpuAt(at - 1000), cpuAfterPct: cpuAt(at + 1000), fromMeanCpuPct: phases[i - 1].cpu.meanCpuPct, toMeanCpuPct: phases[i].cpu.meanCpuPct });
  }

  const launchToCpuPeakMs =
    splashDetect && splashDetect.primaryOnset && cpuPeak && Number.isInteger(cpuPeak.sampleIndex) && sync.samples[cpuPeak.sampleIndex]
      ? sync.samples[cpuPeak.sampleIndex].epochMs - launchEpoch
      : null;
  const manifest = {
    schema: 'vi-history-suite/cocapture-experiment@v1',
    generatedAtIso: new Date().toISOString(),
    experimentName: name, runId, runRoot: rel(runRoot),
    workload,
    fps, introSeconds: introSec, launchSeconds: launchSec, totalSeconds: totalSec,
    frameZeroEpochMs: frameZeroEpoch, launchEpochMs: launchEpoch,
    launchFrameIndex: Math.round(((launchEpoch - frameZeroEpoch) / 1000) * fps),
    namedCalibrationCertificate: spatialCert ? { detectedMarkerCount: spatialCert.detectedMarkerCount, expectedMarkerCount: spatialCert.expectedMarkerCount, calibrated: spatialCert.calibrated } : null,
    perfmon: { samples: sync.samples.length, authoritative: sync.authoritative, cpuPeak: cpuPeak ? { series: cpuPeak.series, value: cpuPeak.value, frameIndex: cpuPeak.frameIndex } : null },
    splashOnset: splashDetect ? splashDetect.primaryOnset : null,
    launchToSplashMs: splashDetect ? splashDetect.launchToSplashMs : null,
    launchToCpuPeakMs,
    cpuChannel: cpuChan ? cpuChan.name : null,
    phases,
    cpuTransitions,
    correlationNote:
      'splashOnset.epochMs and the perfmon CPU-peak sample epoch share one axis (epochMsAtFrameZero + fps); benchmark-metadata-index.json holds the full alignment.',
    artifacts: {
      namedCalibrationHtml: rel(calHtml),
      splashCapture: rel(join(runRoot, 'splash', 'splash-capture.json')),
      splashDetect: rel(sdPath),
      mprrSync: rel(join(mprrDir, 'mprr-sync.json')),
      tdmsModel: rel(join(mprrDir, 'tdms-model.json')),
      benchmarkIndex: rel(join(runRoot, 'benchmark-metadata-index.json'))
    }
  };
  writeFileSync(join(runRoot, 'cocapture-experiment.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('CO_CAPTURE_DONE');
  console.log(`  splash onset: ${manifest.splashOnset ? 'frame ' + manifest.splashOnset.frameIndex + ' @+' + manifest.splashOnset.offsetMs + 'ms (mafd ' + manifest.splashOnset.mafd + ')' : '(none)'}`);
  console.log(`  launch->splash: ${manifest.launchToSplashMs}ms | launch->CPU-peak: ${manifest.launchToCpuPeakMs}ms`);
  for (const ph of phases) console.log(`  phase ${ph.name}: frames ${ph.startFrame}-${ph.endFrame}, CPU mean ${ph.cpu.meanCpuPct}% max ${ph.cpu.maxCpuPct}% (${ph.cpu.samples} samples)`);
  for (const t of cpuTransitions) console.log(`  transition ${t.from}->${t.to} @frame ${t.atFrame}: CPU ${t.cpuBeforePct}% -> ${t.cpuAfterPct}% (phase mean ${t.fromMeanCpuPct}% -> ${t.toMeanCpuPct}%)`);
  console.log(`  manifest -> ${rel(join(runRoot, 'cocapture-experiment.json'))}`);
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
