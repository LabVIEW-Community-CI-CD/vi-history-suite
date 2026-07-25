#!/usr/bin/env node
// prototype/mprr/renderNavArtifacts.mjs
//
// Thin file-I/O driver around the PURE compiled mprr navigation sidecar
// (out/reporting/mirror/mprrTimelineNavSidecar.js). It reads a governed
// perfmon-mprr-sync@v1 record and writes the video-navigation artifacts so an
// authoritative mprr capture (e.g. WIN's real-hardware E3-mprr-sync output)
// becomes a navigable/searchable replay video:
//   <label>.vtt              WebVTT chapter track
//   <label>.ffmeta.txt       ffmetadata chapters (ffmpeg -i in.mp4 -i this -map_metadata 1)
//   <label>.filtergraph.txt  drawtext overlay filtergraph
//   <label>.ffmpeg.sh        ready ffmpeg assembly command
//   <label>.nav.json         the full nav + overlay models
//
// Usage:
//   node prototype/mprr/renderNavArtifacts.mjs <perfmon-mprr-sync.json> [outDir]
//   node prototype/mprr/renderNavArtifacts.mjs            (no arg -> synthetic authoritative demo)
//
// The sidecar itself is pure + fail-closed; this driver only does path/IO glue.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const sidecarPath = join(repoRoot, 'out', 'reporting', 'mirror', 'mprrTimelineNavSidecar.js');
if (!existsSync(sidecarPath)) {
  console.error(`compiled sidecar not found at ${sidecarPath}; run: npm run compile`);
  process.exit(2);
}
const { buildMprrTimelineNav, buildMprrDrawtextOverlay } = require(sidecarPath);

const PERFMON_MPRR_SYNC_SCHEMA = 'vi-history-suite/perfmon-mprr-sync@v1';

function syntheticDemoSync() {
  const frameRateHz = 12;
  return {
    schema: PERFMON_MPRR_SYNC_SCHEMA,
    schemaVersion: 1,
    source: 'synthetic-demo',
    actor: 'renderNavArtifacts',
    timingAuthorityId: 'demo-synthetic-monotonic-100ns',
    tickResolutionNs: 100,
    frameRateHz,
    frameIntervalMs: 1000 / frameRateHz,
    epochMsAtFrameZero: 0,
    captureEpochMs: 0,
    calibrated: true,
    authoritative: true,
    allSamplesWithinFrameWindow: true,
    samples: [],
    peaks: [
      { series: 'cpu', value: 95, sampleIndex: 3, frameIndex: 240, stopwatchCentiseconds: 2000 },
      { series: 'mem', value: 812, sampleIndex: 0, frameIndex: 12, stopwatchCentiseconds: 100 },
      { series: 'cpu', value: 88, sampleIndex: 7, frameIndex: 600, stopwatchCentiseconds: 5000 }
    ]
  };
}

function loadSync(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw && typeof raw === 'object' && raw.schema && raw.schema !== PERFMON_MPRR_SYNC_SCHEMA) {
    console.warn(`WARN: ${path} schema is ${raw.schema}, expected ${PERFMON_MPRR_SYNC_SCHEMA}`);
  }
  return raw;
}

const [, , inputArg, outArg] = process.argv;
const sync = inputArg ? loadSync(resolve(inputArg)) : syntheticDemoSync();
const label = inputArg ? basename(inputArg).replace(/\.json$/i, '') : 'synthetic-demo';
// Default under out/ (build-output, git-ignored) so the demo never clutters the tree;
// pass an explicit outDir when rendering an artifact you intend to commit.
const outDir = resolve(outArg ?? join(repoRoot, 'out', 'mprr-nav', label));
mkdirSync(outDir, { recursive: true });

// Working-assembler options (env, all optional). MPRR_BASE_VIDEO burns onto a real screen
// recording instead of a frame sequence; MPRR_RUNNING_CLOCK adds the live mprr clock;
// MPRR_FONT_FILE sets a COLON-FREE fontfile (Windows has no fontconfig). When a base video
// is given, the assembler auto-attaches the chapters file this renderer writes.
const baseVideo = process.env.MPRR_BASE_VIDEO || undefined;
const fontFile = process.env.MPRR_FONT_FILE || undefined;
const runningClock = /^(1|true|yes|on)$/i.test(process.env.MPRR_RUNNING_CLOCK || '');
const chaptersFileName = `${label}.ffmeta.txt`;

const nav = buildMprrTimelineNav(sync, { title: label });
const overlay = buildMprrDrawtextOverlay(sync, {
  outputPath: `${label}.mp4`,
  baseVideo,
  chaptersPath: baseVideo ? chaptersFileName : undefined,
  runningClock,
  fontFile
});

const files = {
  [`${label}.vtt`]: nav.webvtt,
  [`${label}.ffmeta.txt`]: nav.ffmetadata,
  [`${label}.filtergraph.txt`]: `${overlay.filtergraph}\n`,
  [`${label}.ffmpeg.sh`]: `#!/usr/bin/env bash\n# assemble the navigable overlay video (assembles from: ${overlay.assemblesFrom})\nset -euo pipefail\ncd "$(dirname "$0")"  # resolve the relative chapters/frame paths\n${overlay.ffmpegCommand}\n`,
  [`${label}.nav.json`]: `${JSON.stringify({ nav, overlay }, null, 2)}\n`
};
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content);
}

console.log(`mprr nav artifacts (${nav.schema}) -> ${outDir}`);
console.log(`  authoritative=${nav.authoritative} advisory=${nav.advisory} frameRateHz=${nav.frameRateHz}`);
console.log(`  cues=${nav.cueCount} unplaceablePeaks=${nav.unplaceablePeakCount} drawtextSegments=${overlay.segmentCount}`);
console.log(`  assemblesFrom=${overlay.assemblesFrom} runningClock=${overlay.runningClock}${baseVideo ? ` baseVideo=${baseVideo}` : ''}`);
console.log(`  files: ${Object.keys(files).join(', ')}`);
