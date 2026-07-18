/**
 * VHS-REQ-659 maintainer driver: Docker preview-cache cross-VI benchmark.
 *
 * Renders N real VIs on the Docker linux-container runtime (LabVIEW 2026) into a
 * single shared file-backed cache (cold), then re-renders each through the same
 * cache and asserts the warm result is a HIT that is byte-identical and has the
 * same inline-image count as the cold render. Proves the cache distinguishes
 * VIs and returns unchanged content at scale on real Docker + LabVIEW.
 *
 * Maintainer-only `.cjs` under vagrant/, not shipped / not in npm test. Requires
 * `npm run compile`. Runs on the Linux host (Docker available).
 *
 * Env:
 *   VIHS_DB_REPO    icon-editor repo (default /home/sergio/repos/labview-icon-editor)
 *   VIHS_DB_LIMIT   number of VIs to render (default 6)
 *   VIHS_DB_IMAGE   container image (default nationalinstruments/labview:2026q1-linux)
 *   VIHS_DB_VERSION LabVIEW year (default 2026)
 *   VIHS_DB_CACHE   cache dir (default a fresh temp dir)
 *   VIHS_DB_OUT     optional JSON evidence path
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
    console.error(`[db] missing ${rel}; run \`npm run compile\` first.`);
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
  process.stdout.write(`[db] ${m}\n`);
}
function fail(m) {
  process.stderr.write(`[db] FAIL: ${m}\n`);
  process.exit(1);
}

function buildCache(cacheDirectory, maxEntries) {
  return createFileViPreviewCache(
    { cacheDirectory, maxEntries, joinPath: (dir, name) => path.join(dir, name) },
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

async function enumerateVis(root, limit) {
  const found = [];
  const stack = [root];
  while (stack.length && found.length < limit * 4) {
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
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.vi')) {
        found.push(full);
      }
    }
  }
  found.sort();
  return found.slice(0, limit);
}

function sha(html) {
  return crypto.createHash('sha256').update(html, 'utf8').digest('hex');
}

async function main() {
  const repo = process.env.VIHS_DB_REPO || '/home/sergio/repos/labview-icon-editor';
  const limit = Number.parseInt(process.env.VIHS_DB_LIMIT ?? '6', 10);
  const image = process.env.VIHS_DB_IMAGE || 'nationalinstruments/labview:2026q1-linux';
  const version = process.env.VIHS_DB_VERSION || '2026';
  const cacheDir = process.env.VIHS_DB_CACHE || fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-db-cache-'));

  if (!fs.existsSync(repo)) {
    fail(`repo not found: ${repo} (set VIHS_DB_REPO).`);
  }

  const selection = await locateComparisonRuntime('linux', {
    requestedProvider: 'docker',
    labviewVersion: version,
    bitness: 'x64',
    linuxContainerImage: image
  });
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, { processPlatform: 'linux' });
  if (resolution.outcome !== 'ready') {
    fail(`Docker runtime not ready: ${selection.blockedReason ?? resolution.reason}`);
  }
  const runtime = { ...resolution.runtime, headless: true };
  log(`runtime provider=${runtime.provider} image=${image} version=${version}`);

  const vis = await enumerateVis(repo, limit);
  if (vis.length === 0) {
    fail(`no *.vi under ${repo}`);
  }
  log(`benchmarking ${vis.length} VI(s), cache=${cacheDir}`);

  const cache = buildCache(cacheDir, vis.length + 1);
  const deps = { ...buildNodeViPreviewRenderDeps(), cache };

  const results = [];
  const failures = [];

  // Cold pass: render each VI once into the shared cache.
  for (const vi of vis) {
    const t0 = Date.now();
    const cold = await renderViPreviewForFile(
      { viFilePath: vi, runtime, operationDirectory: OPERATION_DIRECTORY },
      deps
    );
    const coldMs = Date.now() - t0;
    if (cold.outcome !== 'rendered' || !cold.html) {
      log(`  COLD FAIL ${path.basename(vi)} outcome=${cold.outcome} reason=${cold.failureReason ?? ''}`);
      failures.push(`${path.basename(vi)}: cold ${cold.failureReason ?? cold.outcome}`);
      continue;
    }
    const coldSha = sha(cold.html);
    const coldImgs = countInlinePreviewImages(cold.html);

    // Warm pass: same VI must HIT and match byte-for-byte and image-count.
    const t1 = Date.now();
    const warm = await renderViPreviewForFile(
      { viFilePath: vi, runtime, operationDirectory: OPERATION_DIRECTORY },
      deps
    );
    const warmMs = Date.now() - t1;
    const warmSha = warm.html ? sha(warm.html) : null;
    const warmImgs = warm.html ? countInlinePreviewImages(warm.html) : 0;
    const hit = warm.outcome === 'rendered' && warm.cached === true;
    const identical = warmSha === coldSha && warmImgs === coldImgs;
    log(
      `  ${hit && identical ? 'OK  ' : 'BAD '}${path.basename(vi)} cold=${coldMs}ms/${coldImgs}img warm=${warmMs}ms hit=${hit} identical=${identical}`
    );
    if (!hit) {
      failures.push(`${path.basename(vi)}: warm not a hit`);
    } else if (!identical) {
      failures.push(`${path.basename(vi)}: warm not byte/image-identical`);
    }
    results.push({ vi, coldMs, coldImgs, warmMs, hit, identical, coldSha });
  }

  // Cross-VI distinctness: every successful cold render must be a distinct doc.
  const shas = results.map((r) => r.coldSha);
  const distinct = new Set(shas).size === shas.length;
  log(`distinct documents: ${new Set(shas).size}/${shas.length} (${distinct ? 'all distinct' : 'COLLISION'})`);
  if (!distinct) {
    failures.push('cache-key collision: two VIs produced identical documents');
  }

  const evidence = {
    schema: 'vi-history-suite/vi-preview-docker-cache-benchmark@v1',
    repo,
    image,
    version,
    count: results.length,
    distinctDocuments: new Set(shas).size,
    results: results.map((r) => ({ vi: path.relative(repo, r.vi), coldMs: r.coldMs, coldImgs: r.coldImgs, warmMs: r.warmMs, hit: r.hit, identical: r.identical })),
    passed: failures.length === 0
  };
  if (process.env.VIHS_DB_OUT) {
    fs.writeFileSync(process.env.VIHS_DB_OUT, JSON.stringify(evidence, null, 2));
    log(`evidence written to ${process.env.VIHS_DB_OUT}`);
  }

  if (failures.length) {
    fail(`${failures.length} issue(s): ${failures.join('; ')}`);
  }
  const avgCold = Math.round(results.reduce((s, r) => s + r.coldMs, 0) / results.length);
  const avgWarm = Math.round(results.reduce((s, r) => s + r.warmMs, 0) / results.length);
  log(`Docker preview cache benchmark PASSED: ${results.length} VIs, all warm hits byte-identical, all distinct. avg cold=${avgCold}ms warm=${avgWarm}ms.`);
}

main().catch((err) => {
  console.error('[db] error:', err);
  process.exit(1);
});
