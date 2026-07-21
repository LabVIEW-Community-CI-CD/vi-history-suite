/**
 * VHS-REQ-703.9 maintainer verification (epic #2262): render a real VI on this
 * host's LabVIEW and grade the produced HTML against the coordinate-frames
 * emitter spec (docs/preview/coordinate-frames-emitter-spec.md).
 *
 * This is the acceptance gate for the still-to-be-authored coordinate-frames
 * export. It drives the SHIPPED compiled `out/` modules exactly as the extension
 * does:
 *   1. locate the comparison/preview runtime (host-native or docker),
 *   2. renderViPreviewForFile a real VI (live LabVIEW render -> HTML),
 *   3. assessCoordinateFramesIsland(html) — the pure acceptance predicate.
 *
 * Today (no emitter authored): reports REJECTED / island-absent. Once the
 * PrintToSingleFileHtml operation emits the `lvr-coordinate-frames` island,
 * this reports ACCEPTED with the frame/geometry/image counts, which is the proof
 * that unblocks the pixel-precise region-overlay iteration (ITER 5).
 *
 * Maintainer-only (kept under vagrant/, not shipped, not in npm test). Run after
 * `npm run compile`:
 *   node vagrant/verify-coordinate-frames-emitter.cjs \
 *     --sample-vi /path/to/Some.vi --provider host --labview-version 2026
 * Env fallbacks: VIHS_CF_VI, VIHS_CF_PROVIDER (host|docker), VIHS_CF_VERSION,
 * VIHS_CF_CONTAINER_IMAGE, VIHS_CF_OUT (write the rendered HTML for inspection).
 */
'use strict';
const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.resolve(__dirname, '..');
function need(p) {
  const f = path.join(repoRoot, p);
  if (!fs.existsSync(f)) {
    console.error(`[cf-verify] missing ${p}; run npm run compile first.`);
    process.exit(1);
  }
  return require(f);
}

const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { mapComparisonRuntimeSelectionToViPreview } = need('out/reporting/viPreview/viPreviewRuntimeAdapter.js');
const { renderViPreviewForFile } = need('out/reporting/viPreview/viPreviewFileRender.js');
const { buildNodeViPreviewRenderDeps, defaultOperationDirectory } = need('out/tooling/viPreviewVerifyCli.js');
const {
  assessCoordinateFramesIsland,
  describeCoordinateFramesAssessment
} = need('out/reporting/viPreview/coordinateFramesAcceptance.js');

function arg(name, fallbackEnv) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallbackEnv ? process.env[fallbackEnv] : undefined;
}

async function main() {
  const viPath = arg('sample-vi', 'VIHS_CF_VI');
  const provider = (arg('provider', 'VIHS_CF_PROVIDER') || 'host').toLowerCase();
  const version = arg('labview-version', 'VIHS_CF_VERSION') || '2026';
  const containerImage = arg('container-image', 'VIHS_CF_CONTAINER_IMAGE');
  const outPath = arg('out', 'VIHS_CF_OUT');

  if (!viPath || !fs.existsSync(viPath)) {
    console.error(`[cf-verify] VI not found: ${viPath || '(none)'} (pass --sample-vi or set VIHS_CF_VI).`);
    process.exit(2);
  }

  const runtimePlatform = process.platform === 'win32' ? 'win32' : 'linux';
  const settings = { requestedProvider: provider === 'docker' ? 'docker' : 'host' };
  if (version) settings.labviewVersion = version;
  if (containerImage) {
    settings.linuxContainerImage = containerImage;
    settings.windowsContainerImage = containerImage;
  }
  const selection = await locateComparisonRuntime(runtimePlatform, settings);
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, { processPlatform: process.platform });
  if (resolution.outcome !== 'ready') {
    console.error(`[cf-verify] runtime not ready: ${resolution.reason || 'unknown'} (provider=${selection.provider}).`);
    process.exit(3);
  }

  const result = await renderViPreviewForFile(
    { runtime: resolution.runtime, viFilePath: viPath, operationDirectory: defaultOperationDirectory() },
    buildNodeViPreviewRenderDeps({})
  );
  if (result.outcome !== 'rendered' || !result.html) {
    console.error(`[cf-verify] render failed: outcome=${result.outcome} reason=${result.failureReason || 'n/a'}.`);
    process.exit(4);
  }

  if (outPath) {
    fs.writeFileSync(outPath, result.html, 'utf8');
    console.log(`[cf-verify] wrote rendered HTML (${result.html.length} bytes) to ${outPath}`);
  }

  const assessment = assessCoordinateFramesIsland(result.html);
  console.log(JSON.stringify({ schema: 'vi-history-suite/coordinate-frames-acceptance@v1', viPath, provider: selection.provider, ...assessment }));
  console.log(`[cf-verify] ${describeCoordinateFramesAssessment(assessment)}`);
  process.exit(assessment.accepted ? 0 : 1);
}

main().catch((error) => {
  console.error(`[cf-verify] error: ${error && error.message ? error.message : error}`);
  process.exit(5);
});
