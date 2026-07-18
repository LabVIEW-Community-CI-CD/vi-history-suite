/**
 * VHS-REQ-659 Phase 4 maintainer driver: prove the "Docker generates the cache,
 * Host displays it" preview model end-to-end on real hardware.
 *
 * The shipped design (viPreviewFileRender + the custom editor's host-native
 * cache-only peek) is: a LIVE preview render happens on Docker; displaying an
 * already-cached preview launches NO external process and works on any runtime.
 * This driver validates that contract against real Docker + LabVIEW:
 *
 *   1. GENERATE — render a real VI through the Docker linux-container runtime
 *      into a shared file-backed cache (a cold, real LabVIEW render).
 *   2. DISPLAY (host cache HIT) — call renderViPreviewForFile with `cacheOnly`
 *      and a runtime whose provider is NOT docker, using the SAME cache; it must
 *      return the cached document (cached:true) WITHOUT launching anything.
 *   3. MISS — a `cacheOnly` peek for a DIFFERENT, un-generated VI must return
 *      failed/`preview-cache-miss` (the signal the editor uses to guide the user
 *      to generate the preview on Docker).
 *
 * Runs on the Linux host (Docker + LabVIEW available). Maintainer-only `.cjs`
 * under vagrant/, not shipped / not in npm test. Requires `npm run compile`.
 *
 * Env:
 *   VIHS_P4_REPO        icon-editor repo (default /home/sergio/repos/labview-icon-editor)
 *   VIHS_P4_VI          generated VI, repo-relative (default resource/plugins/lv_icon.vi)
 *   VIHS_P4_MISS_VI     un-generated VI for the miss peek (default a second repo VI)
 *   VIHS_P4_IMAGE       container image (default nationalinstruments/labview:2026q1-linux)
 *   VIHS_P4_VERSION     LabVIEW year (default 2026)
 *   VIHS_P4_CACHE       cache dir (default a fresh temp dir)
 *   VIHS_P4_OUT         optional JSON evidence path
 */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const OPERATION_DIRECTORY = path.join(repoRoot, 'resources', 'labview-cli-operations');

function need(rel) {
  const f = path.join(repoRoot, rel);
  if (!fs.existsSync(f)) {
    console.error(`[p4] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { mapComparisonRuntimeSelectionToViPreview } = need('out/reporting/viPreview/viPreviewRuntimeAdapter.js');
const { renderViPreviewForFile } = need('out/reporting/viPreview/viPreviewFileRender.js');
const { createFileViPreviewCache } = need('out/reporting/viPreview/viPreviewCache.js');
const { countInlinePreviewImages } = need('out/reporting/viPreview/viPreviewVerification.js');
const { buildNodeViPreviewRenderDeps } = need('out/tooling/viPreviewVerifyCli.js');

function log(m) {
  process.stdout.write(`[p4] ${m}\n`);
}
function fail(m) {
  process.stderr.write(`[p4] FAIL: ${m}\n`);
  process.exit(1);
}

function buildCache(cacheDirectory) {
  return createFileViPreviewCache(
    { cacheDirectory, maxEntries: 64, joinPath: (dir, name) => path.join(dir, name) },
    {
      ensureDirectory: async (d) => {
        await fsp.mkdir(d, { recursive: true });
      },
      readFile: (p) => fsp.readFile(p, 'utf8'),
      writeFile: (p, d) => fsp.writeFile(p, d, 'utf8'),
      listFiles: (d) => fsp.readdir(d),
      fileModifiedMs: async (p) => (await fsp.stat(p)).mtimeMs,
      removeFile: (p) => fsp.rm(p, { force: true })
    }
  );
}

async function firstOtherVi(repo, exclude) {
  const stack = [repo];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.vi') && full !== exclude) {
        return full;
      }
    }
  }
  return undefined;
}

async function main() {
  const repo = process.env.VIHS_P4_REPO || '/home/sergio/repos/labview-icon-editor';
  const viRel = process.env.VIHS_P4_VI || 'resource/plugins/lv_icon.vi';
  const image = process.env.VIHS_P4_IMAGE || 'nationalinstruments/labview:2026q1-linux';
  const version = process.env.VIHS_P4_VERSION || '2026';
  const cacheDir = process.env.VIHS_P4_CACHE || fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-p4-cache-'));
  const viPath = path.join(repo, ...viRel.split('/'));
  if (!fs.existsSync(viPath)) {
    fail(`VI not found: ${viPath} (set VIHS_P4_VI / VIHS_P4_REPO).`);
  }
  const missVi = process.env.VIHS_P4_MISS_VI
    ? path.resolve(process.env.VIHS_P4_MISS_VI)
    : await firstOtherVi(repo, viPath);
  if (!missVi) {
    fail('Could not find a second VI for the cache-miss peek (set VIHS_P4_MISS_VI).');
  }

  log(`repo=${repo}`);
  log(`generate VI=${viPath}`);
  log(`miss VI=${missVi}`);
  log(`cache=${cacheDir}`);

  const checks = [];
  const check = (name, ok, detail) => {
    log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) checks.push(name);
  };

  // ---- 1. GENERATE on Docker ----
  const dockerSelection = await locateComparisonRuntime('linux', {
    requestedProvider: 'docker',
    labviewVersion: version,
    bitness: 'x64',
    linuxContainerImage: image
  });
  const dockerResolution = mapComparisonRuntimeSelectionToViPreview(dockerSelection, { processPlatform: 'linux' });
  if (dockerResolution.outcome !== 'ready') {
    fail(`Docker runtime not ready: ${dockerSelection.blockedReason ?? dockerResolution.reason}`);
  }
  const dockerRuntime = { ...dockerResolution.runtime, headless: true };
  check('docker runtime resolved', dockerRuntime.provider !== 'host-native', `provider=${dockerRuntime.provider}`);

  const cache = buildCache(cacheDir);
  const deps = { ...buildNodeViPreviewRenderDeps(), cache };

  log('generating preview on Docker (real LabVIEW container render; can take 30-90s cold) ...');
  const t0 = Date.now();
  const generated = await renderViPreviewForFile(
    { viFilePath: viPath, runtime: dockerRuntime, operationDirectory: OPERATION_DIRECTORY },
    deps
  );
  if (generated.outcome !== 'rendered' || !generated.html) {
    fail(`Docker generate failed: outcome=${generated.outcome} reason=${generated.failureReason ?? ''}`);
  }
  const genImages = countInlinePreviewImages(generated.html);
  const genSha = crypto.createHash('sha256').update(generated.html, 'utf8').digest('hex');
  log(`generated in ${Date.now() - t0}ms, ${generated.html.length} B, ${genImages} inline images`);
  check('docker generate produced a real render (>=1 inline image)', genImages >= 1, `${genImages} images`);
  check('docker generate was not itself a cache hit', generated.cached !== true);

  // ---- 2. DISPLAY: host cache-only peek must HIT without launching ----
  // Use a non-docker runtime object so a cache MISS could not silently launch a
  // container; cacheOnly additionally guarantees no external process.
  const hostRuntime = { ...dockerRuntime, provider: 'host-native', headless: true };
  const t1 = Date.now();
  const displayed = await renderViPreviewForFile(
    { viFilePath: viPath, runtime: hostRuntime, operationDirectory: OPERATION_DIRECTORY, cacheOnly: true },
    deps
  );
  const dispMs = Date.now() - t1;
  check('host cacheOnly peek is a HIT', displayed.outcome === 'rendered' && displayed.cached === true, `outcome=${displayed.outcome} cached=${displayed.cached}`);
  const dispSha = displayed.html ? crypto.createHash('sha256').update(displayed.html, 'utf8').digest('hex') : null;
  check('displayed bytes are identical to the Docker-generated document', dispSha === genSha, `sha ${String(dispSha).slice(0, 12)} vs ${genSha.slice(0, 12)}`);
  check('display is a fast disk read (no LabVIEW launch)', dispMs < 5000, `${dispMs}ms`);

  // ---- 3. MISS: cacheOnly peek for an un-generated VI ----
  const miss = await renderViPreviewForFile(
    { viFilePath: missVi, runtime: hostRuntime, operationDirectory: OPERATION_DIRECTORY, cacheOnly: true },
    deps
  );
  check('un-generated VI cacheOnly peek MISSES', miss.outcome === 'failed' && miss.failureReason === 'preview-cache-miss', `outcome=${miss.outcome} reason=${miss.failureReason ?? ''}`);

  const evidence = {
    schema: 'vi-history-suite/vi-preview-docker-host-cache@v1',
    repo,
    generatedVi: viPath,
    missVi,
    image,
    version,
    cacheDir,
    generate: { outcome: generated.outcome, bytes: generated.html.length, inlineImages: genImages, sha256: genSha, ms: Date.now() - t0 },
    display: { outcome: displayed.outcome, cached: displayed.cached === true, sha256: dispSha, ms: dispMs },
    miss: { outcome: miss.outcome, failureReason: miss.failureReason ?? null },
    passed: checks.length === 0
  };
  if (process.env.VIHS_P4_OUT) {
    fs.writeFileSync(process.env.VIHS_P4_OUT, JSON.stringify(evidence, null, 2));
    log(`evidence written to ${process.env.VIHS_P4_OUT}`);
  }

  if (checks.length) {
    fail(`${checks.length} assertion(s) failed: ${checks.join(', ')}`);
  }
  log('Docker-generates / Host-displays cache model verified end-to-end on real Docker + LabVIEW.');
}

main().catch((err) => {
  console.error('[p4] error:', err);
  process.exit(1);
});
