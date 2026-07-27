#!/usr/bin/env node
'use strict';

/**
 * Mirror-Mode decoupled DECOUPLED-CHANNEL *PREVIEW* benchmark PRODUCER driver (VHS-REQ-707, #2315, #2478).
 *
 * Sibling of scripts/mirror-decoupled-producer.cjs (the decoupled COMPARISON producer). Where the
 * comparison producer runs CreateComparisonReport host-native -- currently BLOCKED on the Linux
 * `linux-headless-recursive-load` diagnostic (VHS-REQ-706 / ADR-0004), so it can only record a
 * present-but-BLOCKED row -- this producer runs the shipped single-VI PREVIEW render host-native,
 * which DOES work on the Linux box, so the decoupled `linux-host-native-x64` actor becomes a
 * present-and-CAPABLE per-actor #2315 signal now (a real, green `ok` row), with the comparison rows
 * still lighting up once VHS-REQ-706 lifts.
 *
 * It captures the SAME from-within capability fingerprint (host IS the actor, capturedFrom `host`),
 * renders the VI COLD (cache miss) then WARM (cache hit) through the shipped compiled preview
 * primitive (renderViPreviewForFile, the exact path viPreviewVerifyCli + vi-preview-cache-benchmark
 * use), asserts the warm hit is content-identical (same SHA-256 + same inline preview-image count),
 * and records an idempotent `vi-history-suite/mirror-benchmark@v1` row via scripts/recordMirrorBenchmark.js
 * with recipe `renderViPreview` (so preview rows carry a DISTINCT parityKey from the comparison rows
 * of the same actor/fixture -- they do not collide) and mode `cold` (the recorded wallMs is the cold
 * render; the warm-hit time is in the evidence JSON).
 *
 * Best-effort EVIDENCE producer, not a gate (ADR-0028): a runtime-not-ready / failed / non-image /
 * warm-mismatch render is recorded as a `blocked` row (the reconciler treats a non-ok run as
 * not-fresh evidence), NOT a fabricated `ok` row.
 *
 * Maintainer/CI `.cjs` (inventory-exempt like scripts/mirror-right-producer.cjs + the comparison
 * producer); NOT in `npm test`. Requires `npm run compile`.
 *
 * Env:
 *   VIHS_R_REPO           fixture repo (default the icon-editor clone)
 *   VIHS_R_VI             VI under test, repo-relative (default resource/plugins/lv_icon.vi)
 *   VIHS_R_VERSION        LabVIEW year (default 2026)
 *   VIHS_R_BITNESS        x86 | x64 (default x64) -- fingerprint metadata
 *   VIHS_R_BUILD          LabVIEW build string for the fingerprint (default <version>-hostnative)
 *   VIHS_R_DISK_FREE_BYTES override for free-disk bytes (default fs.statfsSync on the fixture repo)
 *   VIHS_R_ACTOR          actor id (default linux-host-native-x64)
 *   VIHS_R_LEDGER         ledger path, repo-relative (default docs/requirements/mirror-benchmark-ledger.json)
 *   VIHS_R_CACHE          preview cache dir (default a fresh os.tmpdir mkdtemp)
 *   VIHS_R_CONNECT_TIMEOUT connect timeout seconds for the preview render (default 120)
 *   VIHS_R_OUT            optional JSON evidence path
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
// The shipped LabVIEW CLI operations directory the preview render loads its
// PrintToSingleFileHtml operation from (mirrors the verify CLI + cache benchmark).
const OPERATION_DIRECTORY = path.join(repoRoot, 'resources', 'labview-cli-operations');

function need(rel) {
  const f = path.join(repoRoot, rel);
  if (!fs.existsSync(f)) {
    console.error(`[decoupled-preview] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

const env = process.env;
const fixtureRepo = env.VIHS_R_REPO || path.join(os.homedir(), 'repos', 'labview-icon-editor');
const viPath = env.VIHS_R_VI || 'resource/plugins/lv_icon.vi';
const version = env.VIHS_R_VERSION || '2026';
const bitness = env.VIHS_R_BITNESS || 'x64';
const actor = env.VIHS_R_ACTOR || 'linux-host-native-x64';
// This producer IS the decoupled host-native actor -- role/provider/capturedFrom are fixed.
const role = 'decoupled';
const provider = 'host-native';
const ledgerRel = env.VIHS_R_LEDGER || 'docs/requirements/mirror-benchmark-ledger.json';
const connectTimeoutSeconds = Number(env.VIHS_R_CONNECT_TIMEOUT || '120');
// Actor-neutral logical recipe for the single-VI preview render (distinct from createComparisonReport
// so preview + comparison rows of the same actor/fixture get DISTINCT parity keys).
const RECIPE = 'renderViPreview';

const digest = need('out/reporting/mirror/mirrorParityDigest.js');
const capability = need('out/reporting/mirror/mirrorCapabilityFingerprint.js');
const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { mapComparisonRuntimeSelectionToViPreview } = need('out/reporting/viPreview/viPreviewRuntimeAdapter.js');
const { renderViPreviewForFile } = need('out/reporting/viPreview/viPreviewFileRender.js');
const { createFileViPreviewCache } = need('out/reporting/viPreview/viPreviewCache.js');
const { countInlinePreviewImages } = need('out/reporting/viPreview/viPreviewVerification.js');
const { buildNodeViPreviewRenderDeps } = need('out/tooling/viPreviewVerifyCli.js');

// --- capability fingerprint (from-within: host IS the actor) ------------------
function loadFingerprint() {
  let diskFreeBytes;
  if (env.VIHS_R_DISK_FREE_BYTES !== undefined) {
    diskFreeBytes = Number(env.VIHS_R_DISK_FREE_BYTES);
    if (!Number.isFinite(diskFreeBytes) || diskFreeBytes <= 0) {
      throw new Error(`VIHS_R_DISK_FREE_BYTES must be a positive number; received "${env.VIHS_R_DISK_FREE_BYTES}".`);
    }
  } else {
    try {
      const st = fs.statfsSync(fixtureRepo);
      diskFreeBytes = st.bavail * st.bsize;
    } catch (error) {
      throw new Error(
        `Could not determine free disk via fs.statfsSync (${error && error.message ? error.message : error}); ` +
          `set VIHS_R_DISK_FREE_BYTES.`
      );
    }
  }
  const inputs = capability.captureLocalCapabilityInputs({
    actor,
    role,
    capturedFrom: 'host',
    labviewBuild: env.VIHS_R_BUILD || `${version}-hostnative`,
    labviewBitness: bitness,
    diskFreeBytes
  });
  return capability.buildCapabilityFingerprint(inputs);
}

// A real file-backed preview cache using node fs, mirroring the injectable boundary
// FileViPreviewCache expects (same wiring as scripts/vi-preview-cache-benchmark.cjs).
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
  // Canonical "valid preview" check: NI's PrintToSingleFileHtml embeds the rendered VI panes as
  // inline base64 PNGs; a real render always embeds >=1. Zero means nothing actually rendered.
  const inlineImages = countInlinePreviewImages(html);
  return { result, elapsedMs, bytes, sha256, inlineImages };
}

async function main() {
  const fingerprint = loadFingerprint();
  const actorRef = digest.deriveActorFingerprintId(fingerprint);
  const viAbsPath = path.isAbsolute(viPath) ? viPath : path.join(fixtureRepo, viPath);
  if (!fs.existsSync(viAbsPath)) {
    throw new Error(`VI not found: ${viAbsPath} (set VIHS_R_REPO / VIHS_R_VI).`);
  }
  // The preview renders the ON-DISK VI, so the fixture identity is the sha256 of the file bytes.
  const fixtureSha = crypto.createHash('sha256').update(fs.readFileSync(viAbsPath)).digest('hex');
  const parityKey = digest.deriveParityKey({ version, fixtureSha, viPath, recipe: RECIPE });

  console.log(
    `[decoupled-preview] actor=${actor} actorRef=${actorRef.slice(0, 12)}… parityKey=${parityKey.slice(0, 12)}… provider=${provider} recipe=${RECIPE}`
  );

  const cacheDirectory = env.VIHS_R_CACHE || fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-decoupled-preview-'));

  let outcome = 'ok';
  let reportSha256;
  let previewImageCount = 0;
  let coldMs = 0;
  let warmMs = null;
  let warmCached = false;
  let blockedReason;

  try {
    const selection = await locateComparisonRuntime('linux', {
      requestedProvider: 'host',
      requireVersionAndBitness: true,
      labviewVersion: version,
      bitness
    });
    const resolution = mapComparisonRuntimeSelectionToViPreview(selection, {
      processPlatform: 'linux',
      connectTimeoutSeconds
    });
    if (resolution.outcome !== 'ready') {
      outcome = 'blocked';
      blockedReason = `runtime-not-ready:${selection.blockedReason || resolution.reason || 'unknown'}`;
    } else {
      const runtime = { ...resolution.runtime, headless: true };
      const cache = buildCache(cacheDirectory, 2);
      const deps = { ...buildNodeViPreviewRenderDeps(), cache };

      const cold = await renderOnce(viAbsPath, runtime, deps);
      coldMs = cold.elapsedMs;
      if (cold.result.outcome !== 'rendered' || !cold.sha256 || cold.inlineImages < 1) {
        outcome = 'blocked';
        blockedReason = `cold-render:${cold.result.outcome}/${cold.result.failureReason || 'no-inline-images'}`;
      } else if (cold.result.cached) {
        // The cold pass must be a MISS (a fresh cache dir); a cached=true here means a stale cache.
        outcome = 'blocked';
        blockedReason = 'cold-render-unexpectedly-cached';
        reportSha256 = cold.sha256;
        previewImageCount = cold.inlineImages;
      } else {
        reportSha256 = cold.sha256;
        previewImageCount = cold.inlineImages;
        // Warm pass: must be a content-identical cache HIT.
        const warm = await renderOnce(viAbsPath, runtime, deps);
        warmMs = warm.elapsedMs;
        warmCached = warm.result.cached === true;
        if (!warmCached || warm.sha256 !== cold.sha256 || warm.inlineImages !== cold.inlineImages) {
          outcome = 'blocked';
          blockedReason = `warm-hit-mismatch:cached=${warmCached} shaMatch=${warm.sha256 === cold.sha256} imgMatch=${warm.inlineImages === cold.inlineImages}`;
        }
      }
    }
  } catch (error) {
    outcome = 'blocked';
    blockedReason = `render-threw:${error && error.message ? error.message : error}`;
  }

  if (outcome !== 'ok' && !reportSha256) {
    reportSha256 = digest.deriveReportSha256(`blocked:${blockedReason || 'unknown'}`);
  }
  if (outcome !== 'ok') {
    console.error(`[decoupled-preview] recording BLOCKED row: ${blockedReason}`);
  }

  const fpRel = path.join('.mirror-fp', `mirror-fp-dp-${actorRef.slice(0, 8)}.json`);
  const fpFile = path.join(repoRoot, fpRel);
  fs.mkdirSync(path.dirname(fpFile), { recursive: true });
  fs.writeFileSync(fpFile, JSON.stringify(fingerprint, null, 2));

  const sourceRevision = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const wallMs = Math.max(0, Math.round(coldMs));
  const args = [
    'scripts/recordMirrorBenchmark.js',
    '--parity-key', parityKey,
    '--actor-ref', actorRef,
    '--source-revision', sourceRevision,
    '--vi-path', viPath,
    '--fixture-sha', fixtureSha,
    '--recipe', RECIPE,
    '--mode', 'cold',
    '--outcome', outcome,
    '--report-sha256', reportSha256,
    '--preview-image-count', String(previewImageCount),
    '--wall-ms', String(wallMs),
    '--fingerprint-file', fpRel,
    '--ledger', ledgerRel
  ];
  execFileSync('node', args, { cwd: repoRoot, stdio: 'inherit' });
  fs.rmSync(fpFile, { force: true });

  const evidence = {
    actor,
    actorRef,
    parityKey,
    fixtureSha,
    sourceRevision,
    provider,
    recipe: RECIPE,
    reportSha256,
    previewImageCount,
    coldMs: Math.round(coldMs),
    warmMs: warmMs === null ? null : Math.round(warmMs),
    warmCached,
    mode: 'cold',
    outcome,
    blockedReason: blockedReason || null,
    ledger: ledgerRel
  };
  if (env.VIHS_R_OUT) {
    fs.writeFileSync(env.VIHS_R_OUT, JSON.stringify(evidence, null, 2));
  }
  console.log(`[decoupled-preview] recorded: ${JSON.stringify(evidence, null, 2)}`);
}

main().catch((error) => {
  console.error(`[decoupled-preview] failed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
