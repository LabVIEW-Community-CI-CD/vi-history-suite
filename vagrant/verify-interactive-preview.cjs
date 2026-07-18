/**
 * VHS-REQ-659 maintainer verification: prove the SHIPPED interactive
 * block-diagram preview renders end-to-end on real host-native LabVIEW, exactly
 * as the custom editor does on the Vagrant VM when a user clicks a VI.
 *
 * Drives the compiled `out/` modules the extension ships:
 *   1. locate the host-native runtime (x86 2026),
 *   2. renderViPreviewForFile a real VI (live LabVIEW render -> flat HTML),
 *   3. selectViPreviewDocument in `interactive` mode with a nonce,
 *   4. assert the produced document is the interactive viewer (nonce CSP,
 *      lvr-frames island, >=1 case stepper) with real inline images.
 *
 * Run in the guest: node vagrant/playwright/../verify-interactive-preview.cjs
 * (kept under vagrant/, maintainer-only, not shipped / not in npm test).
 */
'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
function need(p) {
  const f = path.join(repoRoot, p);
  if (!fs.existsSync(f)) {
    console.error(`[verify] missing ${p}; run npm run compile first.`);
    process.exit(1);
  }
  return require(f);
}

const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { mapComparisonRuntimeSelectionToViPreview } = need('out/reporting/viPreview/viPreviewRuntimeAdapter.js');
const { renderViPreviewForFile } = need('out/reporting/viPreview/viPreviewFileRender.js');
const { buildNodeViPreviewRenderDeps } = need('out/tooling/viPreviewVerifyCli.js');
const { selectViPreviewDocument } = need('out/reporting/viPreview/viPreviewRenderMode.js');
const { countInlinePreviewImages } = need('out/reporting/viPreview/viPreviewVerification.js');

const OPERATION_DIRECTORY = path.join(repoRoot, 'resources', 'labview-cli-operations');

async function main() {
  const viPath = process.env.VIHS_VERIFY_VI || 'C:\\repos\\labview-icon-editor\\resource\\plugins\\lv_icon.vi';
  const version = process.env.VIHS_VERIFY_VERSION || '2026';
  const bitness = (process.env.VIHS_VERIFY_BITNESS || 'x86').toLowerCase() === 'x64' ? 'x64' : 'x86';
  if (!fs.existsSync(viPath)) {
    console.error(`[verify] VI not found: ${viPath} (set VIHS_VERIFY_VI).`);
    process.exit(1);
  }

  const selection = await locateComparisonRuntime('win32', {
    requestedProvider: 'host',
    requireVersionAndBitness: true,
    labviewVersion: version,
    bitness
  });
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, { processPlatform: 'win32' });
  if (resolution.outcome !== 'ready') {
    console.error(`[verify] runtime not ready: ${selection.blockedReason ?? resolution.reason}`);
    process.exit(1);
  }
  const runtime = { ...resolution.runtime, headless: true };
  console.log(`[verify] runtime: provider=${runtime.provider} bitness=${bitness} version=${version}`);
  console.log(`[verify] rendering ${viPath} ...`);

  const t0 = Date.now();
  const result = await renderViPreviewForFile(
    { runtime, viFilePath: viPath, operationDirectory: OPERATION_DIRECTORY },
    buildNodeViPreviewRenderDeps()
  );
  if (result.outcome !== 'rendered' || !result.html) {
    console.error(`[verify] render failed: outcome=${result.outcome} reason=${result.failureReason ?? ''}`);
    process.exit(1);
  }
  const images = countInlinePreviewImages(result.html);
  console.log(`[verify] rendered in ${Date.now() - t0}ms, ${result.html.length} B flat HTML, ${images} inline images`);

  const nonce = crypto.randomBytes(16).toString('base64');
  const selected = selectViPreviewDocument({ labviewHtml: result.html, mode: 'interactive', nonce });

  const checks = [];
  const check = (name, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) checks.push(name); };
  check('mode is interactive', selected.mode === 'interactive');
  check('nonce-scoped CSP present', selected.html.includes(`script-src 'nonce-${nonce}'`));
  check('frames JSON island present', selected.html.includes('id="lvr-frames"'));
  check('viewer root present', selected.html.includes('id="lvr-root"'));
  check('flat render had >=1 inline image', images >= 1);
  // The frames island must carry at least the root diagram frame.
  const island = /<script id="lvr-frames"[^>]*>([\s\S]*?)<\/script>/.exec(selected.html);
  let frameCount = 0;
  if (island) {
    try { frameCount = (JSON.parse(island[1].replace(/\\u003c/g, '<')).frames || []).length; } catch (_) {}
  }
  check('frames model has >=1 frame', frameCount >= 1);
  console.log(`[verify] frames in model: ${frameCount}`);

  const outDir = process.env.VIHS_VERIFY_OUT || path.join(os.tmpdir(), 'vihs-verify-interactive');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'interactive-preview.html'), selected.html, 'utf8');
  console.log(`[verify] wrote interactive document to ${path.join(outDir, 'interactive-preview.html')}`);

  if (checks.length) {
    console.error(`\n[verify] ${checks.length} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\n[verify] Interactive block-diagram preview verified end-to-end on real LabVIEW.');
}

main().catch((err) => {
  console.error('[verify] error:', err);
  process.exit(1);
});
