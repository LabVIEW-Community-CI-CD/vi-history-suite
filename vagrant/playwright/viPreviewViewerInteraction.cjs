/**
 * VHS-REQ-659: Playwright interaction harness for the interactive block-diagram
 * preview viewer.
 *
 * This is a MAINTAINER harness, not a hosted-CI gate. It lives under vagrant/
 * and runs inside the Vagrant guest (or any host with a browser), where a real
 * Chromium can exercise the viewer's DOM interactions that jsdom-based unit
 * tests cannot: paging a Case structure's cases with the ◀/▶ selector, arrow-key
 * paging of the last-touched structure, and the nonce-scoped inline script
 * actually executing under the viewer's Content-Security-Policy.
 *
 * It drives the SAME pure document builder the extension ships
 * (`buildViPreviewFramesViewerHtml` from the compiled `out/`), so a green run is
 * evidence the shipped viewer behaves correctly in a real browser. No LabVIEW,
 * Docker, or VS Code host is required — the frames model is synthetic.
 *
 * Requirements:
 *   - `npm run compile` first (this loads the compiled builder from `out/`).
 *   - Playwright installed in the guest: `npm i -D playwright && npx playwright
 *     install chromium` (kept OUT of the repo's root package.json so hosted CI
 *     never downloads a browser; see vagrant/playwright/README.md).
 *
 * Usage (from the repo root, in the guest):
 *   node vagrant/playwright/viPreviewViewerInteraction.cjs
 *
 * Exit code 0 = all interaction assertions passed; nonzero = a failure (printed).
 */

'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadViewerBuilder() {
  const modPath = path.join(repoRoot, 'out/reporting/viPreview/viPreviewFramesViewer.js');
  if (!fs.existsSync(modPath)) {
    console.error(`[playwright] Compiled viewer not found at ${modPath}. Run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(modPath).buildViPreviewFramesViewerHtml;
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.error(
      '[playwright] The "playwright" package is not installed in this environment.\n' +
        '  Install it in the guest (NOT the repo root package.json):\n' +
        '    npm i -D playwright && npx playwright install chromium\n' +
        '  See vagrant/playwright/README.md.'
    );
    process.exit(1);
  }
}

// A complete, loadable 1x1 PNG data URI. The viewer lays structures out from the
// model's rectangles (not pixel size), so image dimensions do not matter here —
// but the PNG must be a COMPLETE image (IDAT+IEND), because a real browser fires
// `onerror` for a truncated header-only PNG and the structure would never mount.
function pngDataUri(base64) {
  return `data:image/png;base64,${base64}`;
}
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_ROOT = pngDataUri(PNG_1x1);
const PNG_CASE = pngDataUri(PNG_1x1);

// A root diagram with one two-case structure (both cases share the same rect, so
// the model normalizer/viewer treats them as the cases of ONE structure).
const MODEL = {
  frames: [
    { image: PNG_ROOT, rect: { left: 0, top: 0, width: 200, height: 150 }, children: [1, 2] },
    { image: PNG_CASE, rect: { left: 20, top: 20, width: 60, height: 40 }, children: [], label: 'True' },
    { image: PNG_CASE, rect: { left: 20, top: 20, width: 60, height: 40 }, children: [], label: 'False' }
  ],
  rootIndex: 0
};

const NONCE = 'harnessNONCE0123';

async function main() {
  const buildViPreviewFramesViewerHtml = loadViewerBuilder();
  const { chromium } = loadPlaywright();

  const html = buildViPreviewFramesViewerHtml(MODEL, NONCE);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-pw-viewer-'));
  const htmlPath = path.join(tmpDir, 'viewer.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const failures = [];
  function check(name, condition) {
    if (condition) {
      console.log(`  PASS  ${name}`);
    } else {
      console.error(`  FAIL  ${name}`);
      failures.push(name);
    }
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    await page.goto(`file://${htmlPath}`);

    // The nonce'd inline script must have executed and built the viewport.
    await page.waitForSelector('.lvr-viewport', { timeout: 5000 });
    check('nonce-scoped script executed (viewport mounted)', true);

    // One structure => one selector showing "1/2  True" initially.
    const sel = page.locator('.lvr-sel__lbl').first();
    const initial = (await sel.textContent()) || '';
    check(`selector starts on case 1/2 True (got "${initial.trim()}")`, /1\/2/.test(initial) && /True/.test(initial));

    // Click ▶ (next) — the label must advance to case 2/2 False.
    await page.locator('.lvr-sel__btn', { hasText: '\u25B6' }).first().click();
    const afterNext = (await sel.textContent()) || '';
    check(`▶ advances to case 2/2 False (got "${afterNext.trim()}")`, /2\/2/.test(afterNext) && /False/.test(afterNext));

    // ArrowLeft pages the last-touched structure back to case 1/2.
    await page.keyboard.press('ArrowLeft');
    const afterArrow = (await sel.textContent()) || '';
    check(`ArrowLeft pages back to case 1/2 (got "${afterArrow.trim()}")`, /1\/2/.test(afterArrow));

    // Exactly one case layer is visible at a time.
    const visibleCases = await page.evaluate(() => {
      const layers = Array.from(document.querySelectorAll('.lvr-case'));
      return layers.filter((l) => getComputedStyle(l).display !== 'none').length;
    });
    check(`exactly one case layer visible (got ${visibleCases})`, visibleCases === 1);

    // The Fit control is present.
    check('Fit control present', (await page.locator('.lvr-reset').count()) === 1);

    check(`no uncaught page errors (got ${consoleErrors.length})`, consoleErrors.length === 0);
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\n[playwright] ${failures.length} interaction assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\n[playwright] All viewer interaction assertions passed.');
}

main().catch((err) => {
  console.error('[playwright] Harness error:', err);
  process.exit(1);
});
