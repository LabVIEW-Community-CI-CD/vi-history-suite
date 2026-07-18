#!/usr/bin/env node

/*
 * VI preview render-cache benchmark (maintainer driver, VHS-REQ-659).
 *
 * Exercises the single-VI preview render cache (src/reporting/viPreview) against
 * REAL LabVIEW on the host it runs on. Intended to run IN the Windows/LabVIEW
 * Vagrant guest against the icon-editor repo, but works on any host with a
 * resolvable runtime. It drives the compiled `out/` modules with a real
 * file-backed cache and times cold (miss) vs warm (hit) renders.
 *
 * Two benchmarks:
 *   A. single-VI cold-vs-warm — render one VI twice with the same cache and
 *      assert the second render is a cache HIT; reports the cold/warm times and
 *      the speedup. This proves the cache returns an unchanged VI without
 *      re-invoking LabVIEW.
 *   B. warm-all (sequential) — render every VI under the repo once, sequentially,
 *      through the same cache to WARM it; reports per-VI cold time, total time,
 *      and the resulting cache entry count. A bounded second pass re-renders the
 *      first few to confirm they now hit.
 *
 * Maintainer-run `.cjs` (human-in-the-loop): intentionally outside the
 * `scripts/*.js` traceability inventory glob, never shipped in the VSIX or run in
 * hosted CI. Requires `npm run compile` first (drives `out/`).
 *
 * Env / flags:
 *   VIHS_BENCH_REPO     repo root to scan for *.vi (default: C:\repos\labview-icon-editor)
 *   VIHS_BENCH_SINGLE   VI path (absolute or repo-relative) for benchmark A
 *                       (default: the first *.vi found under the repo)
 *   VIHS_BENCH_LIMIT    max VIs for benchmark B; 0 = ALL (default: 10)
 *   VIHS_BENCH_BITNESS  x86 | x64 (default: x86 — the Vagrant host-native lane)
 *   VIHS_BENCH_VERSION  LabVIEW year (default: 2026)
 *   VIHS_BENCH_CACHE    cache directory (default: a fresh temp dir)
 *   VIHS_BENCH_OUT      optional path to write the JSON evidence packet
 *
 * Usage:
 *   node scripts/vi-preview-cache-benchmark.cjs
 *   VIHS_BENCH_LIMIT=0 node scripts/vi-preview-cache-benchmark.cjs   # warm ALL VIs
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
// The shipped LabVIEW CLI operations directory the preview render loads its
// print-to-single-file-HTML operation from (mirrors defaultOperationDirectory in
// the verify CLI). Must be non-empty or the command plan rejects it.
const OPERATION_DIRECTORY = path.join(repoRoot, 'resources', 'labview-cli-operations');

const { locateComparisonRuntime } = require(path.join(repoRoot, 'out/reporting/comparisonRuntimeLocator.js'));
const {
  mapComparisonRuntimeSelectionToViPreview
} = require(path.join(repoRoot, 'out/reporting/viPreview/viPreviewRuntimeAdapter.js'));
const { renderViPreviewForFile } = require(path.join(repoRoot, 'out/reporting/viPreview/viPreviewFileRender.js'));
const { createFileViPreviewCache } = require(path.join(repoRoot, 'out/reporting/viPreview/viPreviewCache.js'));
const { countInlinePreviewImages } = require(path.join(repoRoot, 'out/reporting/viPreview/viPreviewVerification.js'));
const { buildNodeViPreviewRenderDeps } = require(path.join(repoRoot, 'out/tooling/viPreviewVerifyCli.js'));

function log(message) {
  process.stdout.write(`[vi-preview-cache-benchmark] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[vi-preview-cache-benchmark] ERROR: ${message}\n`);
  process.exit(1);
}

function isViFile(name) {
  return name.toLowerCase().endsWith('.vi');
}

// A real file-backed cache using node fs, mirroring the injectable boundary
// FileViPreviewCache expects. maxEntries must cover the full target set: the
// warm-all pass writes one entry per VI and the verify pass re-reads every one,
// so a cache smaller than the target would evict the earliest-warmed VIs and
// mis-report them as NOT-HIT even though the cache behaved correctly.
function buildCache(cacheDirectory, maxEntries) {
  return createFileViPreviewCache(
    { cacheDirectory, maxEntries, joinPath: (dir, name) => path.join(dir, name) },
    {
      ensureDirectory: async (directory) => {
        await fsp.mkdir(directory, { recursive: true });
      },
      readFile: (filePath) => fsp.readFile(filePath, 'utf8'),
      writeFile: (filePath, data) => fsp.writeFile(filePath, data, 'utf8'),
      listFiles: (directory) => fsp.readdir(directory),
      fileModifiedMs: async (filePath) => (await fsp.stat(filePath)).mtimeMs,
      removeFile: (filePath) => fsp.rm(filePath, { force: true })
    }
  );
}

async function enumerateVis(root) {
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && isViFile(entry.name)) {
        found.push(full);
      }
    }
  }
  await walk(root);
  found.sort();
  return found;
}

async function countCacheEntries(cacheDirectory) {
  try {
    const names = await fsp.readdir(cacheDirectory);
    return names.filter((name) => name.endsWith('.html')).length;
  } catch {
    return 0;
  }
}

async function renderOnce(viFilePath, runtime, deps) {
  const startedNs = process.hrtime.bigint();
  const result = await renderViPreviewForFile(
    { viFilePath, runtime, operationDirectory: OPERATION_DIRECTORY },
    deps
  );
  const elapsedMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
  const html = typeof result.html === 'string' ? result.html : '';
  const bytes = Buffer.byteLength(html, 'utf8');
  const sha256 = bytes > 0 ? crypto.createHash('sha256').update(html, 'utf8').digest('hex') : null;
  // Canonical "valid preview" check (viPreviewVerification): NI's
  // PrintToSingleFileHtml embeds the rendered VI panes as inline base64 PNGs; a
  // real render always embeds >=1. Zero means nothing was actually rendered
  // (blank/error shell), even if the byte count is non-zero.
  const inlineImages = countInlinePreviewImages(html);
  return { result, elapsedMs, bytes, sha256, inlineImages };
}

async function main() {
  const benchRepo = process.env.VIHS_BENCH_REPO || 'C:\\repos\\labview-icon-editor';
  const limit = Number.parseInt(process.env.VIHS_BENCH_LIMIT ?? '10', 10);
  const bitness = (process.env.VIHS_BENCH_BITNESS || 'x86').toLowerCase() === 'x64' ? 'x64' : 'x86';
  const labviewVersion = process.env.VIHS_BENCH_VERSION || '2026';
  const cacheDirectory =
    process.env.VIHS_BENCH_CACHE || fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-preview-cache-bench-'));

  if (!fs.existsSync(benchRepo)) {
    fail(`Benchmark repo not found: ${benchRepo} (set VIHS_BENCH_REPO).`);
  }

  log(`Repo: ${benchRepo}`);
  log(`Cache directory: ${cacheDirectory}`);

  // Resolve a real runtime (host-native by default, the Vagrant x86 lane).
  const selection = await locateComparisonRuntime('win32', {
    requestedProvider: 'host',
    requireVersionAndBitness: true,
    labviewVersion,
    bitness
  });
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, { processPlatform: 'win32' });
  if (resolution.outcome !== 'ready') {
    fail(
      `Runtime not ready: provider=${selection.provider} blocked=${selection.blockedReason ?? resolution.reason}. ` +
        'Run inside the Vagrant guest with LabVIEW installed.'
    );
  }
  const runtime = { ...resolution.runtime, headless: true };
  log(`Runtime ready: provider=${runtime.provider} bitness=${bitness} version=${labviewVersion} headless=true`);

  const vis = await enumerateVis(benchRepo);
  if (vis.length === 0) {
    fail(`No *.vi files found under ${benchRepo}.`);
  }
  log(`Discovered ${vis.length} VI(s).`);

  // Size the cache to hold every VI we may warm (all discovered VIs, plus the
  // single-VI benchmark entry) so the verify pass never sees a spurious eviction.
  const cache = buildCache(cacheDirectory, vis.length + 1);
  const deps = { ...buildNodeViPreviewRenderDeps(), cache };

  const evidence = { schema: 'vi-history-suite/vi-preview-cache-benchmark@v1', repo: benchRepo, bitness, labviewVersion };

  // ---- Benchmark A: single-VI cold vs warm ----
  const singleEnv = process.env.VIHS_BENCH_SINGLE;
  const singleVi = singleEnv ? (path.isAbsolute(singleEnv) ? singleEnv : path.join(benchRepo, singleEnv)) : vis[0];
  log('');
  log(`Benchmark A (single-VI cold vs warm): ${singleVi}`);
  const cold = await renderOnce(singleVi, runtime, deps);
  if (cold.result.outcome !== 'rendered') {
    fail(`Cold render failed: outcome=${cold.result.outcome} reason=${cold.result.failureReason ?? 'n/a'}`);
  }
  if (cold.result.cached) {
    fail('Cold render unexpectedly reported cached=true (cache was not empty for this VI).');
  }
  if (cold.bytes === 0 || !cold.sha256) {
    fail('Cold render produced EMPTY HTML; nothing meaningful was cached.');
  }
  if (cold.inlineImages < 1) {
    fail(`Cold render produced HTML with NO inline preview images (${cold.bytes} B); the VI did not actually render.`);
  }
  const warm = await renderOnce(singleVi, runtime, deps);
  if (warm.result.outcome !== 'rendered' || warm.result.cached !== true) {
    fail(`Warm render did not hit the cache: outcome=${warm.result.outcome} cached=${warm.result.cached}`);
  }
  // CONTENT VERIFICATION: a cache hit must return the exact bytes the cold render
  // produced, AND that content must be a real preview (>=1 inline image). A fast
  // "hit" that returns empty/truncated/mismatched/image-less HTML is a bug.
  if (warm.bytes === 0 || !warm.sha256) {
    fail('Warm cache HIT returned EMPTY HTML — the cache stored nothing usable.');
  }
  if (warm.inlineImages < 1) {
    fail(`Warm cache HIT returned HTML with NO inline preview images (${warm.bytes} B).`);
  }
  if (warm.sha256 !== cold.sha256) {
    fail(
      `Warm cache HIT content MISMATCH: cold sha256=${cold.sha256} (${cold.bytes} B) ` +
        `!= warm sha256=${warm.sha256} (${warm.bytes} B).`
    );
  }
  const speedup = cold.elapsedMs / Math.max(warm.elapsedMs, 0.001);
  log(
    `  cold (miss): ${cold.elapsedMs.toFixed(1)} ms  (${cold.bytes} B, ${cold.inlineImages} inline img, ` +
      `sha256 ${cold.sha256.slice(0, 12)}…)`
  );
  log(
    `  warm (hit):  ${warm.elapsedMs.toFixed(1)} ms  (${warm.bytes} B, ${warm.inlineImages} inline img, ` +
      `sha256 ${warm.sha256.slice(0, 12)}…)`
  );
  log(`  content:     VERIFIED byte-identical + ${warm.inlineImages} real inline preview image(s)`);
  log(`  speedup:     ${speedup.toFixed(1)}x`);
  evidence.singleVi = {
    viPath: singleVi,
    coldMs: Math.round(cold.elapsedMs),
    warmMs: Math.round(warm.elapsedMs),
    warmWasCacheHit: warm.result.cached === true,
    coldBytes: cold.bytes,
    warmBytes: warm.bytes,
    coldSha256: cold.sha256,
    warmSha256: warm.sha256,
    inlineImages: warm.inlineImages,
    contentByteIdentical: warm.sha256 === cold.sha256 && warm.bytes === cold.bytes,
    speedup: Number(speedup.toFixed(1))
  };

  // ---- Benchmark B: warm-all (sequential) ----
  const target = limit > 0 ? vis.slice(0, limit) : vis;
  log('');
  log(
    `Benchmark B (warm-all, sequential): rendering ${target.length} of ${vis.length} VI(s)` +
      `${limit > 0 ? ` (VIHS_BENCH_LIMIT=${limit}; set 0 for ALL)` : ' (ALL)'}...`
  );
  const perVi = [];
  const coldByVi = new Map();
  let rendered = 0;
  let hits = 0;
  let failures = 0;
  let emptyRenders = 0;
  let imagelessRenders = 0;
  const sweepStartNs = process.hrtime.bigint();
  for (let index = 0; index < target.length; index += 1) {
    const viFilePath = target[index];
    const { result, elapsedMs, bytes, sha256, inlineImages } = await renderOnce(viFilePath, runtime, deps);
    const status = result.outcome === 'rendered' ? (result.cached ? 'hit' : 'miss') : result.outcome;
    if (result.outcome === 'rendered') {
      rendered += 1;
      if (result.cached) hits += 1;
      if (bytes === 0) emptyRenders += 1;
      if (inlineImages < 1) imagelessRenders += 1;
      // Record the cold (miss) content so the verify pass can confirm the cached
      // bytes match. A hit here (rare on a fresh cache) is recorded too.
      if (!coldByVi.has(viFilePath)) {
        coldByVi.set(viFilePath, { sha256, bytes, inlineImages });
      }
    } else {
      failures += 1;
    }
    perVi.push({ viPath: viFilePath, ms: Math.round(elapsedMs), status, bytes, sha256, inlineImages });
    log(
      `  [${index + 1}/${target.length}] ${status.padEnd(6)} ${elapsedMs.toFixed(0).padStart(7)} ms  ` +
        `${bytes.toString().padStart(8)} B  ${String(inlineImages).padStart(3)} img  ` +
        `${path.relative(benchRepo, viFilePath)}`
    );
  }
  const sweepMs = Number(process.hrtime.bigint() - sweepStartNs) / 1e6;
  const cacheEntries = await countCacheEntries(cacheDirectory);
  log('');
  log(
    `Warm-all complete: ${rendered} rendered (${hits} already-cached), ${failures} failed, ` +
      `${emptyRenders} empty, ${imagelessRenders} image-less, ${sweepMs.toFixed(0)} ms total, cache entries=${cacheEntries}.`
  );
  if (emptyRenders > 0) {
    fail(`${emptyRenders} render(s) produced EMPTY HTML; the warm cache would store nothing usable.`);
  }
  if (imagelessRenders > 0) {
    fail(
      `${imagelessRenders} render(s) produced HTML with NO inline preview images; those VIs did not actually render.`
    );
  }

  // ---- Verify pass: re-render every warmed VI and assert the cache HIT returns
  // the exact bytes recorded on the cold pass. This proves the warm cache serves
  // correct content, not just a fast (possibly empty/wrong) response. ----
  log('');
  log(`Verify pass: re-rendering ${target.length} warmed VI(s) and checking cache-hit content...`);
  let verifiedHits = 0;
  let contentMismatches = 0;
  let notHit = 0;
  const verifyStartNs = process.hrtime.bigint();
  for (let index = 0; index < target.length; index += 1) {
    const viFilePath = target[index];
    const { result, bytes, sha256, inlineImages } = await renderOnce(viFilePath, runtime, deps);
    const cold = coldByVi.get(viFilePath);
    if (result.outcome !== 'rendered' || result.cached !== true) {
      notHit += 1;
      log(`  [${index + 1}/${target.length}] NOT-HIT ${path.relative(benchRepo, viFilePath)}`);
      continue;
    }
    if (!cold || sha256 !== cold.sha256 || bytes !== cold.bytes || inlineImages !== cold.inlineImages) {
      contentMismatches += 1;
      log(
        `  [${index + 1}/${target.length}] MISMATCH ${path.relative(benchRepo, viFilePath)} ` +
          `(cold ${cold ? `${cold.bytes} B/${cold.inlineImages} img` : 'n/a'} != warm ${bytes} B/${inlineImages} img)`
      );
      continue;
    }
    verifiedHits += 1;
  }
  const verifyMs = Number(process.hrtime.bigint() - verifyStartNs) / 1e6;
  log('');
  log(
    `Verify pass complete: ${verifiedHits} verified content-identical hits, ` +
      `${contentMismatches} content mismatch, ${notHit} not-a-hit, ${verifyMs.toFixed(0)} ms total.`
  );
  if (contentMismatches > 0 || notHit > 0) {
    fail(`Cache verification FAILED: ${contentMismatches} mismatched, ${notHit} not served from cache.`);
  }
  evidence.warmAll = {
    totalVisInRepo: vis.length,
    renderedCount: target.length,
    rendered,
    alreadyCached: hits,
    failures,
    emptyRenders,
    imagelessRenders,
    totalMs: Math.round(sweepMs),
    cacheEntries,
    verify: {
      verifiedHits,
      contentMismatches,
      notHit,
      totalMs: Math.round(verifyMs),
      allContentVerified: contentMismatches === 0 && notHit === 0
    },
    perVi
  };

  if (process.env.VIHS_BENCH_OUT) {
    const outPath = path.isAbsolute(process.env.VIHS_BENCH_OUT)
      ? process.env.VIHS_BENCH_OUT
      : path.join(repoRoot, process.env.VIHS_BENCH_OUT);
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    await fsp.writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    log(`Wrote evidence packet to ${outPath}`);
  }

  log('Done.');
}

main().catch((error) => {
  fail(error instanceof Error ? error.stack || error.message : String(error));
});
