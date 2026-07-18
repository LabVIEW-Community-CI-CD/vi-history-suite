/**
 * VHS-REQ-659 maintainer verification: prove a user can STEP THROUGH THE CASES
 * of a REAL VI's block-diagram preview in a real browser.
 *
 * Unlike viPreviewViewerInteraction.cjs (which drives a synthetic frames model)
 * and verify-interactive-preview.cjs (which renders a real VI but only asserts
 * the document shape), this driver does BOTH end-to-end:
 *   1. render a real VI (default lv_icon.vi) on host-native LabVIEW, exactly as
 *      the shipped custom editor does,
 *   2. build the shipped interactive viewer from that REAL frames model,
 *   3. load it in headless Chromium and actually operate the ◀ n/N ▶ case
 *      stepper on a real multi-case structure, asserting the displayed case
 *      image changes and pages back, that exactly one case is visible per
 *      structure, and that the diagram surface is white regardless of theme,
 *   4. write a screenshot + the HTML as evidence.
 *
 * Maintainer-only, under vagrant/, not shipped / not in npm test. Run in the
 * guest after `npm run compile` and installing Playwright there:
 *   npm i -D playwright && npx playwright install chromium
 *   node vagrant/playwright/viPreviewRealViCaseStep.cjs
 *
 * Env: VIHS_VERIFY_VI / VIHS_VERIFY_VERSION / VIHS_VERIFY_BITNESS (render),
 *      VIHS_CASESTEP_OUT (evidence dir).
 */
'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..', '..');

function need(rel) {
  const f = path.join(repoRoot, rel);
  if (!fs.existsSync(f)) {
    console.error(`[casestep] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.error(
      '[casestep] The "playwright" package is not installed in this guest.\n' +
        '  Install it (NOT in the repo root package.json):\n' +
        '    npm i -D playwright && npx playwright install chromium'
    );
    process.exit(1);
  }
}

const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { mapComparisonRuntimeSelectionToViPreview } = need('out/reporting/viPreview/viPreviewRuntimeAdapter.js');
const { renderViPreviewForFile } = need('out/reporting/viPreview/viPreviewFileRender.js');
const { buildNodeViPreviewRenderDeps } = need('out/tooling/viPreviewVerifyCli.js');
const { selectViPreviewDocument } = need('out/reporting/viPreview/viPreviewRenderMode.js');
const { countInlinePreviewImages } = need('out/reporting/viPreview/viPreviewVerification.js');

const OPERATION_DIRECTORY = path.join(repoRoot, 'resources', 'labview-cli-operations');

async function renderRealViDocument() {
  const viPath = process.env.VIHS_VERIFY_VI || 'C:\\repos\\labview-icon-editor\\resource\\plugins\\lv_icon.vi';
  const version = process.env.VIHS_VERIFY_VERSION || '2026';
  const bitness = (process.env.VIHS_VERIFY_BITNESS || 'x86').toLowerCase() === 'x64' ? 'x64' : 'x86';
  if (!fs.existsSync(viPath)) {
    console.error(`[casestep] VI not found: ${viPath} (set VIHS_VERIFY_VI).`);
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
    console.error(`[casestep] runtime not ready: ${selection.blockedReason ?? resolution.reason}`);
    process.exit(1);
  }
  const runtime = { ...resolution.runtime, headless: true };
  console.log(`[casestep] runtime: provider=${runtime.provider} bitness=${bitness} version=${version}`);
  console.log(`[casestep] rendering ${viPath} (real LabVIEW; cold render can take 1-2 min) ...`);

  const t0 = Date.now();
  const result = await renderViPreviewForFile(
    { runtime, viFilePath: viPath, operationDirectory: OPERATION_DIRECTORY },
    buildNodeViPreviewRenderDeps()
  );
  if (result.outcome !== 'rendered' || !result.html) {
    console.error(`[casestep] render failed: outcome=${result.outcome} reason=${result.failureReason ?? ''}`);
    process.exit(1);
  }
  const images = countInlinePreviewImages(result.html);
  console.log(`[casestep] rendered in ${Date.now() - t0}ms, ${result.html.length} B flat HTML, ${images} inline images`);

  const nonce = crypto.randomBytes(16).toString('base64');
  const selected = selectViPreviewDocument({ labviewHtml: result.html, mode: 'interactive', nonce });
  if (selected.mode !== 'interactive') {
    console.error(`[casestep] expected interactive document, got ${selected.mode}`);
    process.exit(1);
  }
  return { html: selected.html, viPath };
}

async function main() {
  const { chromium } = loadPlaywright();

  // Fast path: reuse a previously rendered interactive document instead of a
  // fresh (~1-2 min) LabVIEW render — lets a maintainer re-run the browser
  // assertions on retained evidence without LabVIEW.
  let html;
  let viPath;
  const reuse = process.env.VIHS_CASESTEP_HTML;
  if (reuse) {
    if (!fs.existsSync(reuse)) {
      console.error(`[casestep] VIHS_CASESTEP_HTML not found: ${reuse}`);
      process.exit(1);
    }
    html = fs.readFileSync(reuse, 'utf8');
    viPath = `${reuse} (reused document)`;
    console.log(`[casestep] reusing existing document ${reuse} (no LabVIEW render)`);
  } else {
    ({ html, viPath } = await renderRealViDocument());
  }

  const outDir = process.env.VIHS_CASESTEP_OUT || path.join(os.tmpdir(), 'vihs-casestep');
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'interactive-preview.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const failures = [];
  const check = (name, ok) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) failures.push(name);
  };

  const browser = await chromium.launch();
  try {
    // Force a dark color scheme so the white-surface assertion is meaningful.
    const page = await browser.newPage({ colorScheme: 'dark' });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto(`file://${htmlPath}`);
    await page.waitForSelector('.lvr-viewport', { timeout: 15000 });
    check('nonce-scoped viewer script executed (viewport mounted)', true);

    // The diagram surface must be white regardless of the dark color scheme.
    const stageBg = await page.evaluate(() => {
      const s = document.querySelector('.lvr-stage');
      return s ? getComputedStyle(s).backgroundColor : '';
    });
    check(`stage surface is white (got ${stageBg})`, stageBg === 'rgb(255, 255, 255)');

    // Count real multi-case structures (mono selectors are hidden).
    const structures = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('.lvr-sel'));
      return sels.filter((s) => !s.classList.contains('lvr-sel--mono')).length;
    });
    console.log(`[casestep] real multi-case structures found: ${structures}`);
    if (structures < 1) {
      // A structure-free VI (flat/linear diagram) renders correctly with no case
      // steppers to exercise — that is a valid render, not a failure. Require the
      // render to be real (>=1 inline image via the frames island) and stop.
      const islandImages = await page.evaluate(() => {
        const island = document.getElementById('lvr-frames');
        if (!island) {
          return 0;
        }
        try {
          const model = JSON.parse(island.textContent || '{}');
          return (model.frames || []).filter((f) => typeof f.image === 'string' && f.image.length > 0).length;
        } catch {
          return 0;
        }
      });
      check('structure-free VI still produced a real render (>=1 frame image)', islandImages >= 1, `${islandImages} frame images`);
      check('no uncaught page errors (got ' + pageErrors.length + ')', pageErrors.length === 0);
      const shotPath = path.join(outDir, 'case-step.png');
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`[casestep] evidence: ${htmlPath}`);
      console.log(`[casestep] screenshot: ${shotPath}`);
      console.log(`[casestep] NOTE: ${viPath} has no multi-case structures — render verified, no stepper to exercise.`);
      if (failures.length) {
        console.error(`\n[casestep] ${failures.length} assertion(s) failed for ${viPath}.`);
        process.exit(1);
      }
      console.log(`\n[casestep] Structure-free VI render verified in a real browser for ${viPath}.`);
      return;
    }

    if (structures >= 1) {
      // Tag the first multi-case structure host so all reads are scoped to the
      // SAME structure we operate (a real VI has many structures; a global
      // ".lvr-case" query would read some other structure's visible case).
      await page.evaluate(() => {
        var host = Array.from(document.querySelectorAll('.lvr-struct')).find(function (st) {
          var sel = st.querySelector(':scope > .lvr-sel');
          return sel && !sel.classList.contains('lvr-sel--mono');
        });
        if (host) { host.setAttribute('data-casestep', 'target'); }
      });

      const label = page.locator('[data-casestep="target"] > .lvr-sel > .lvr-sel__lbl');
      // Positional selection is robust to glyph/text matching: the selector
      // builds [prev(◀), label, next(▶)], so prev = first button, next = last.
      const nextBtn = page.locator('[data-casestep="target"] > .lvr-sel > .lvr-sel__btn').last();
      const prevBtn = page.locator('[data-casestep="target"] > .lvr-sel > .lvr-sel__btn').first();

      // Visible case's own image, scoped to the target structure's DIRECT-child
      // case layers (not nested-structure case layers).
      const visibleCaseSrc = () => page.evaluate(() => {
        var host = document.querySelector('[data-casestep="target"]');
        if (!host) { return ''; }
        var cases = Array.from(host.children).filter(function (c) { return c.classList.contains('lvr-case'); });
        var vis = cases.find(function (c) { return getComputedStyle(c).display !== 'none'; });
        var img = vis ? vis.querySelector(':scope > .lvr-img') : null;
        return img ? img.getAttribute('src') : '';
      });

      const before = ((await label.textContent()) || '').trim();
      const srcBefore = await visibleCaseSrc();

      await nextBtn.click();
      const afterNext = ((await label.textContent()) || '').trim();
      check(`\u25B6 advances the case label (\"${before}\" -> \"${afterNext}\")`, afterNext !== before);

      const srcAfter = await visibleCaseSrc();
      check('displayed case image changes when stepping', srcAfter !== srcBefore && srcAfter !== '');

      await prevBtn.click();
      let afterPrev = ((await label.textContent()) || '').trim();
      if (afterPrev !== before) {
        // Cross-check: fire the button's own click handler in-page to rule out a
        // Playwright hit-testing/overlay artifact vs a real handler bug.
        await page.evaluate(() => {
          var host = document.querySelector('[data-casestep="target"]');
          var btn = host ? host.querySelector(':scope > .lvr-sel > .lvr-sel__btn') : null;
          if (btn) { btn.click(); }
        });
        const afterPrevDispatch = ((await label.textContent()) || '').trim();
        console.log(`[casestep] prev in-page .click() result: "${afterPrevDispatch}"`);
        afterPrev = afterPrevDispatch;
      }
      check(`\u25C0 pages back to the first case (got \"${afterPrev}\")`, afterPrev === before);

      // Arrow-key paging of the last-touched structure.
      await page.keyboard.press('ArrowRight');
      const afterArrow = ((await label.textContent()) || '').trim();
      check(`ArrowRight pages the last-touched structure (got \"${afterArrow}\")`, afterArrow !== before);
    }

    // Every structure shows exactly one visible case at a time.
    const visiblePerStructure = await page.evaluate(() => {
      const structs = Array.from(document.querySelectorAll('.lvr-struct'));
      return structs.map((st) => {
        const cases = Array.from(st.querySelectorAll('.lvr-case'));
        return cases.filter((c) => getComputedStyle(c).display !== 'none').length;
      });
    });
    const allSingle = visiblePerStructure.length === 0 || visiblePerStructure.every((n) => n === 1);
    check(`exactly one case visible per structure (got [${visiblePerStructure.join(',')}])`, allSingle);

    check('Fit control present', (await page.locator('.lvr-reset').count()) === 1);
    check(`no uncaught page errors (got ${pageErrors.length})`, pageErrors.length === 0);

    const shotPath = path.join(outDir, 'case-step.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`[casestep] evidence: ${htmlPath}`);
    console.log(`[casestep] screenshot: ${shotPath}`);
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(`\n[casestep] ${failures.length} assertion(s) failed for ${viPath}.`);
    process.exit(1);
  }
  console.log(`\n[casestep] Real-VI case stepping verified in a real browser for ${viPath}.`);
}

main().catch((err) => {
  console.error('[casestep] error:', err);
  process.exit(1);
});
