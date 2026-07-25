#!/usr/bin/env node
// prototype/mprr/captureSessionNav.mjs
//
// BIG PICTURE (the literal realization of the user vision): record the ACTUAL
// Windows screen at 12fps while a real workload runs, capture host perfmon in
// parallel, align the two through the GOVERNED mprr sync, and assemble a single
// navigable MP4 -- real screen pixels + resource-peak CHAPTERS (seekable) +
// burned-in drawtext overlays -- so a human or LLM scrubs to "when CPU peaked"
// and SEES the real screen at that instant.
//
// It reuses the governed Mirror-Mode pipeline (remember-that-mprr-exists), NOT a
// parallel stack:
//   typeperf PDH-CSV -> parsePdhCsv -> buildFirstRunPerfmonArtifact (first-run-perfmon@v1)
//   -> buildPerfmonMprrSync (perfmon-mprr-sync@v1, 12fps, epoch-aligned to the
//      gdigrab frame-zero epoch; ADVISORY because a screen capture carries no
//      mprr calibration fiducial -- honestly flagged)
//   -> buildMprrTimelineNav + buildMprrDrawtextOverlay (mprr-timeline-nav@v1,
//      LINUX's shipped sidecar)
//   -> ffmpeg: gdigrab real desktop + drawtext overlay + attached chapters.
//
// The only NET-NEW piece here is the real SCREEN capture (ffmpeg gdigrab) + the
// concurrent orchestration + the Windows-safe ffmpeg drawtext assembly recipe.
//
// Run from the repo root AFTER `npm run compile`:
//   node prototype/mprr/captureSessionNav.mjs
// Env: VIHS_CAP_SECONDS (default 20), VIHS_FFMPEG / VIHS_FFPROBE (auto-detected),
//   VIHS_CAP_OUT (default win-validation/mprr/session).
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outMirror = join(repoRoot, 'out', 'reporting', 'mirror');

function loadGoverned(name) {
  const p = join(outMirror, `${name}.js`);
  if (!existsSync(p)) {
    console.error(`compiled module missing: ${p}; run: npm run compile`);
    process.exit(2);
  }
  return require(p);
}
const { parsePdhCsv, buildFirstRunPerfmonArtifact } = loadGoverned('perfmonSampleSeries');
const { buildPerfmonMprrSync } = loadGoverned('perfmonMprrSync');
const { buildMprrTimelineNav, buildMprrDrawtextOverlay } = loadGoverned('mprrTimelineNavSidecar');

function findExe(name, envVar) {
  if (process.env[envVar] && existsSync(process.env[envVar])) return process.env[envVar];
  const shim = join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', `${name}.exe`);
  if (existsSync(shim)) return shim;
  return name; // rely on PATH
}
const FFMPEG = findExe('ffmpeg', 'VIHS_FFMPEG');
const FFPROBE = findExe('ffprobe', 'VIHS_FFPROBE');

const SECONDS = Number(process.env.VIHS_CAP_SECONDS || 20);
const FPS = 12;
const outDir = resolve(repoRoot, process.env.VIHS_CAP_OUT || join('win-validation', 'mprr', 'session'));
mkdirSync(outDir, { recursive: true });
const rel = (p) => p.split(repoRoot + '\\').join('').split(repoRoot + '/').join('').split('\\').join('/');

const screenMp4 = join(outDir, 'screen.mp4');
const baseMp4 = join(outDir, 'base.mp4');
const navMp4 = join(outDir, 'session-nav.mp4');
const ffmetaPath = join(outDir, 'session.ffmeta.txt');
const vttPath = join(outDir, 'session.vtt');
const fontDst = join(outDir, 'consola.ttf');
const fontSrc = 'C:\\Windows\\Fonts\\consola.ttf';
if (existsSync(fontSrc)) copyFileSync(fontSrc, fontDst);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cpuBurst(ms) {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) { x += Math.sqrt(Math.random() * 1e6); }
  return x;
}

async function main() {
  console.log(`[cap] ffmpeg=${FFMPEG}`);
  console.log(`[cap] capturing ${SECONDS}s @ ${FPS}fps -> ${rel(outDir)}`);

  // 1) perfmon via typeperf -> clean PDH-CSV file (-si is integer seconds; -y auto-confirms overwrite).
  const perfCsvPath = join(outDir, 'perf.csv');
  try { rmSync(perfCsvPath, { force: true }); } catch { /* ignore */ }
  const samples = Math.max(4, SECONDS); // 1 Hz (typeperf minimum interval is 1s)
  const perfStartEpoch = Date.now();
  const tp = spawn('typeperf', [
    '\\Processor(_Total)\\% Processor Time',
    '\\Memory\\Available MBytes',
    '\\PhysicalDisk(_Total)\\% Disk Time',
    '-si', '1', '-sc', String(samples), '-o', perfCsvPath, '-f', 'CSV', '-y'
  ], { windowsHide: true });
  const tpDone = new Promise((r) => tp.on('close', r));

  // 2) real SCREEN capture via ffmpeg gdigrab (self-terminates at -t SECONDS).
  const frameZeroEpoch = Date.now();
  const gd = spawn(FFMPEG, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'gdigrab', '-framerate', String(FPS), '-i', 'desktop',
    '-t', String(SECONDS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-y', screenMp4
  ], { windowsHide: true });
  const gdDone = new Promise((r) => gd.on('close', r));

  // 3) drive a real, LABELLED workload inside the capture window so there is a
  // genuine resource event to navigate to: idle -> CPU burst -> idle.
  await sleep(Math.round(SECONDS * 1000 * 0.35));
  const burstAtEpoch = Date.now();
  console.log(`[cap] CPU burst at t=${((burstAtEpoch - frameZeroEpoch) / 1000).toFixed(1)}s (frame ${Math.round((burstAtEpoch - frameZeroEpoch) / 1000 * FPS)})`);
  cpuBurst(Math.round(SECONDS * 1000 * 0.2));

  await Promise.all([tpDone, gdDone]);
  const perfCsv = existsSync(perfCsvPath) ? readFileSync(perfCsvPath, 'utf8') : '';
  console.log(`[cap] capture complete; perf.csv=${perfCsv.length}b screen.mp4=${existsSync(screenMp4) ? statSync(screenMp4).size : 0}b`);

  // 4) GOVERNED: PDH-CSV -> series -> artifact -> perfmon-mprr-sync (epoch-aligned to frame zero).
  const series = parsePdhCsv(perfCsv);
  const artifact = buildFirstRunPerfmonArtifact({
    source: 'self-hosted-runner',
    actor: 'win-session-capture',
    perf: series,
    capturedAtIso: new Date(perfStartEpoch).toISOString(),
    wallMs: SECONDS * 1000
  });
  // Real captured screen frame count bounds the frame window.
  const probe = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nk=1:nw=1', screenMp4], { encoding: 'utf8' });
  const frameCount = Number((probe.stdout || '').trim()) || SECONDS * FPS;
  const sync = buildPerfmonMprrSync({
    artifact,
    frame: { epochMsAtFrameZero: frameZeroEpoch, frameRateHz: FPS, frameCount },
    calibration: { calibrated: false, fault: 'no-mprr-fiducial-in-screen-capture' }
  });
  console.log(`[cap] perfmon-mprr-sync: samples=${sync.samples.length} peaks=${sync.peaks.length} authoritative=${sync.authoritative} (advisory=${!sync.authoritative})`);

  // 5) GOVERNED nav sidecar (LINUX) -> chapters + overlay.
  const nav = buildMprrTimelineNav(sync, { title: 'win session capture (real screen @12fps + perfmon)' });
  const overlay = buildMprrDrawtextOverlay(sync, { outputPath: 'session.mp4' });
  writeFileSync(ffmetaPath, nav.ffmetadata, 'utf8');
  writeFileSync(vttPath, nav.webvtt, 'utf8');
  console.log(`[cap] nav: cues=${nav.cueCount} unplaceable=${nav.unplaceablePeakCount} overlaySegments=${overlay.segmentCount}`);

  // 6) Assemble: burn the overlay onto the REAL screen video (Windows-safe recipe:
  // colon-free local fontfile injected into each drawtext; pipes -> slashes), then
  // attach the chapters. Inline -vf as a single argv element.
  const fontRel = rel(fontDst);
  let vf = overlay.filtergraph
    .split('drawtext=').join(`drawtext=fontfile=${fontRel}:`)
    .split(' | ').join(' / ');
  const p1 = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'warning', '-i', screenMp4, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', baseMp4], { encoding: 'utf8' });
  if (!existsSync(baseMp4) || statSync(baseMp4).size === 0) {
    console.error('[cap] overlay pass failed:\n' + (p1.stderr || '').split('\n').slice(-8).join('\n'));
    process.exit(1);
  }
  const p2 = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'warning', '-i', baseMp4, '-i', ffmetaPath, '-map_metadata', '1', '-c', 'copy', '-y', navMp4], { encoding: 'utf8' });
  if (!existsSync(navMp4) || statSync(navMp4).size === 0) {
    console.error('[cap] chapter pass failed:\n' + (p2.stderr || '').split('\n').slice(-8).join('\n'));
    process.exit(1);
  }

  // 7) Verify + evidence.
  const verify = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-show_chapters', '-of', 'default', navMp4], { encoding: 'utf8' });
  const evidence = {
    schema: 'vi-history-suite/win-session-nav-capture@v1',
    generatedAt: new Date().toISOString(),
    captureSeconds: SECONDS, fps: FPS,
    frameZeroEpochMs: frameZeroEpoch,
    burstAtFrame: Math.round((burstAtEpoch - frameZeroEpoch) / 1000 * FPS),
    screenFrameCount: frameCount,
    perfmonSamples: sync.samples.length,
    peaks: sync.peaks.map((p) => ({ series: p.series, value: p.value, frameIndex: p.frameIndex, stopwatchCentiseconds: p.stopwatchCentiseconds })),
    authoritative: sync.authoritative,
    advisory: !sync.authoritative,
    navCueCount: nav.cueCount,
    overlaySegments: overlay.segmentCount,
    outputs: { screen: rel(screenMp4), nav: rel(navMp4), vtt: rel(vttPath), ffmeta: rel(ffmetaPath) }
  };
  writeFileSync(join(outDir, 'session-nav-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

  console.log('SESSION_NAV_DONE -> ' + rel(navMp4));
  console.log(verify.stdout || '');
}

main().catch((e) => { console.error(e); process.exit(1); });
