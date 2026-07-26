// WIN correlation & benchmark harness (#2377). Orchestrates the SINGLE-SOURCE
// pipeline (user insight): one VI Comparison report per (VI, base, selected)
// yields the staged left/right VIs on disk + the base/head commits; those staged
// paths feed BOTH the VI Preview render and lvkit -- no separate checkout.
//
// Per sample, one uninterrupted pass, all stage timings recorded:
//   1. compare  -> real CreateComparisonReport (docker windows-container) via
//      scripts/windows-compare-driver.cjs, WIN_STORAGE_ROOT UNDER the winlvkit
//      bind mount so staged files are container-visible at C:\out\...  [t_compare]
//   2. lvkit    -> docker exec lvkit diff(left,right) + generate(right) in the
//      long-lived lvkit container on the mount paths        [t_lvkitDiff/t_lvkitGen]
//   3. preview  -> node out/tooling/viPreviewVerifyCli.js --provider docker on the
//      host staged left/right (docker provider self-mounts) [t_previewBase/Sel]
//   4. correlate + score; emit correlation-fixtures/benchmark-dataset.json
//
// LabVIEW-report difference parsing here is a PROTOTYPE (regex class counts);
// the robust shippable parser is LINUX's #2377 leg. Maintainer .cjs (inventory-exempt).
//
// Run from repo root after `npm run compile`, with the lvkit container up:
//   node prototype/win-lvkit/correlation-benchmark.cjs
// Env: CORR_IMAGE (default 2026q1patch2-windows), CORR_CONTAINER (lvkit container
//   name), CORR_REPO (icon-editor), CORR_LIMIT (max samples).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const IMAGE = process.env.CORR_IMAGE || 'nationalinstruments/labview:2026q1patch2-windows';
const CONTAINER = process.env.CORR_CONTAINER || 'lvkit-win-devtools-v2.2.1';
const CORPUS = process.env.CORR_REPO || 'C:\\repos\\labview-icon-editor';
const MOUNT_HOST = path.join(process.env.TEMP, 'winlvkit');
const CONTAINER_MOUNT = 'C:\\out';
const VILIB = 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\vi.lib';

const ALL_SAMPLES = [
  { vi: 'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/MouseDown.vi', base: '537683', selected: 'fc09736', slug: 'mousedown' },
  { vi: 'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/PictureControl_MouseUp.vi', base: '537683', selected: 'fc09736', slug: 'picturecontrol-mouseup' },
  { vi: 'resource/plugins/NIIconEditor/Miscellaneous/Graphics/LoadTemplates.vi', base: '537683', selected: 'fc09736', slug: 'loadtemplates' },
  { vi: 'resource/plugins/NIIconEditor/Miscellaneous/Tools/VisibleTextMarker.vi', base: '537683', selected: 'fc09736', slug: 'visibletextmarker' },
  { vi: 'resource/plugins/lv_icon.vi', base: '537683', selected: 'fc09736', slug: 'lv-icon' },
  { vi: 'Test/Templates/VI Template.vi', base: '537683', selected: 'fc09736', slug: 'vi-template' },
  { vi: 'resource/plugins/NIIconEditor/Class/FakedArray/Misc/Process Template Graphics.vi', base: '537683', selected: 'fc09736', slug: 'process-template-graphics' },
  { vi: 'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/MenuSelection(User).vi', base: '537683', selected: 'fc09736', slug: 'menuselection-user' }
];
// CORR_ONLY_SLUGS (comma list) runs a subset; CORR_MERGE keeps prior samples (grow, not replace);
// CORR_LIMIT caps count. fixtureSlug (HTML fixture name) = basename lowercased, per correlationReport.mjs.
const ONLY = process.env.CORR_ONLY_SLUGS ? new Set(process.env.CORR_ONLY_SLUGS.split(',').map((x) => x.trim())) : null;
// FIX: source candidates from the proper per-VI modification enumerator (enumerateViChangePairs.cjs)
// -- real parent..commit modification pairs -- instead of one hardcoded snapshot pair (which under
// diff-filter=M reported VIs added-after-base as A not M and massively undercounted). CORR_PAIRS_JSON
// points at the enumerator output (each entry has repo/vi/base/selected/slug). Falls back to the
// hardcoded ALL_SAMPLES when unset. Entries may carry a per-sample `repo` (multi-repo dataset).
const PAIRS = process.env.CORR_PAIRS_JSON
  ? JSON.parse(require('node:fs').readFileSync(process.env.CORR_PAIRS_JSON, 'utf8'))
  : ALL_SAMPLES;
let SAMPLES = ONLY ? PAIRS.filter((s) => ONLY.has(s.slug)) : PAIRS;
if (process.env.CORR_LIMIT) SAMPLES = SAMPLES.slice(0, Number(process.env.CORR_LIMIT));
function fixtureSlug(viPath) { return path.basename(viPath).replace(/\.vi$/i, '').toLowerCase(); }

function sec(ms) { return Math.round(ms / 100) / 10; }
function containerPath(hostAbs) {
  const rel = path.relative(fs.realpathSync(MOUNT_HOST), fs.realpathSync(hostAbs));
  return CONTAINER_MOUNT + '\\' + rel.replace(/\//g, '\\');
}
function dockerLvkit(argsInner) {
  // Run a PowerShell one-liner in the container; capture stdout only (warnings go to stderr).
  const r = spawnSync('docker', ['exec', CONTAINER, 'powershell', '-NoProfile', '-Command', argsInner], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}
function runCompare(sample, storageRoot) {
  const env = {
    ...process.env,
    WIN_REPO_ROOT: (sample.repo || CORPUS), WIN_VI_PATH: sample.vi, WIN_BASE: sample.base, WIN_SELECTED: sample.selected,
    WIN_PROVIDER: 'docker', WIN_LV_VERSION: '2026', WIN_LV_BITNESS: 'x64', WIN_CONTAINER_IMAGE: IMAGE,
    WIN_LABEL: 'corr-' + sample.slug, WIN_STORAGE_ROOT: storageRoot
  };
  const t0 = Date.now();
  const r = spawnSync('node', ['scripts/windows-compare-driver.cjs'], { cwd: REPO_ROOT, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const t = Date.now() - t0;
  const m = /VIHS_RESULT_JSON (\{.*\})/.exec(r.stdout || '');
  if (!m) throw new Error('compare produced no VIHS_RESULT_JSON; stderr head: ' + String(r.stderr).slice(0, 300));
  return { result: JSON.parse(m[1]), tMs: t };
}
function preview(hostViPath, proofDir) {
  fs.rmSync(proofDir, { recursive: true, force: true }); fs.mkdirSync(proofDir, { recursive: true });
  const t0 = Date.now();
  spawnSync('node', ['out/tooling/viPreviewVerifyCli.js', '--provider', 'docker', '--container-image', IMAGE, '--sample-vi', hostViPath, '--proof-out', proofDir], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const t = Date.now() - t0;
  const pf = path.join(proofDir, 'vihs-preview-verification-proof.json');
  const proof = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : null;
  return { inlineImageCount: proof ? proof.inlineImageCount : null, outcome: proof ? proof.outcome : 'no-proof', tMs: t };
}
function parseLabviewReport(htmlPath) {
  const txt = fs.readFileSync(htmlPath, 'utf8');
  const count = (re) => (txt.match(re) || []).length;
  const differenceBlocks = count(/class="difference"/g);
  const cosmetic = count(/difference-cosmetic-heading/g);
  return { differenceBlocks, cosmetic, nonCosmetic: differenceBlocks - cosmetic, htmlBytes: txt.length, note: 'PROTOTYPE regex parse; robust parser is LINUX #2377 leg' };
}

const samples = [];
for (const s of SAMPLES) {
  try {
  const storageRoot = path.join(MOUNT_HOST, 'corrbench', s.slug, 'storage');
  fs.rmSync(path.join(MOUNT_HOST, 'corrbench', s.slug), { recursive: true, force: true });
  fs.mkdirSync(storageRoot, { recursive: true });

  const cmp = runCompare(s, storageRoot);
  const R = cmp.result;
  const leftC = containerPath(R.leftStaged);
  const rightC = containerPath(R.rightStaged);
  const stagingC = containerPath(R.materializedTree.root);

  // lvkit diff (container)
  const t0 = Date.now();
  const diffOut = dockerLvkit(`& lvkit diff '${leftC}' '${rightC}' --format json --load-mode minimal --no-auto-vilib 2>$null | Out-String`);
  const tDiff = Date.now() - t0;
  let lvkitChangeCount = null, kinds = [];
  try { const j = JSON.parse(diffOut.stdout); lvkitChangeCount = j.changes.length; kinds = j.changes.map((c) => c.change); } catch (e) { /* leave null */ }

  // lvkit generate (container, selected side)
  const t1 = Date.now();
  const genOut = dockerLvkit(`Remove-Item C:\\gbench -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force C:\\gbench | Out-Null; & lvkit generate '${rightC}' --load-mode minimal --vilib '${VILIB}' --search-path '${stagingC}' --placeholder-on-unresolved -o C:\\gbench 2>$null | Out-Null; (Get-ChildItem C:\\gbench -Recurse -Filter *.py | Where-Object { $_.Name -ne '__init__.py' }).Count`);
  const tGen = Date.now() - t1;
  const genModuleCount = parseInt(String(genOut.stdout).trim(), 10);

  // previews (host staged paths; docker provider self-mounts)
  const pBase = preview(R.leftStaged, path.join(MOUNT_HOST, 'corrbench', s.slug, 'preview-base'));
  const pSel = preview(R.rightStaged, path.join(MOUNT_HOST, 'corrbench', s.slug, 'preview-selected'));

  const lv = parseLabviewReport(R.reportFilePath);
  // Copy the report HTML into the committed fixtures so correlationReport.mjs robust-parses it
  // (single-source: this run produces both the dataset entry AND its ground-truth fixture).
  const fixtureDest = path.join(REPO_ROOT, 'prototype', 'win-lvkit', 'correlation-fixtures', fixtureSlug(s.vi) + '.labview-diff-report.html');
  fs.copyFileSync(R.reportFilePath, fixtureDest);

  const countAgreement = lvkitChangeCount != null ? Number(lvkitChangeCount === lv.nonCosmetic) : 0;
  const previewDelta = pBase.inlineImageCount != null && pSel.inlineImageCount != null ? (pSel.inlineImageCount - pBase.inlineImageCount) : null;

  samples.push({
    vi: s.vi, repo: s.repoTag || null, subject: s.subject || null, revisionPair: { base: s.base, selected: s.selected },
    lvkit: { changeCount: lvkitChangeCount, kinds, generateModuleCount: genModuleCount },
    labview: lv,
    preview: { base: pBase.inlineImageCount, selected: pSel.inlineImageCount, deltaInlineImages: previewDelta },
    correlation: {
      countAgreement_lvkit_vs_nonCosmetic: countAgreement,
      lvkitChangeCount, labviewNonCosmetic: lv.nonCosmetic, labviewCosmeticOnly: lv.cosmetic,
      structuralCardinality_previewDelta_vs_lvkitCount: previewDelta,
      note: 'granularity mapping; lvkit structural ~ LabVIEW non-cosmetic; cosmetic = lvkit-omitted axis'
    },
    timingsSec: { compareCold: sec(cmp.tMs), lvkitDiff: sec(tDiff), lvkitGen: sec(tGen), previewBaseCold: sec(pBase.tMs), previewSelectedCold: sec(pSel.tMs) }
  });
  } catch (e) {
    console.log('SKIP ' + s.slug + ': ' + String((e && e.message) || e).slice(0, 200));
  }
}

const outPath = path.join(REPO_ROOT, 'prototype', 'win-lvkit', 'correlation-fixtures', 'benchmark-dataset.json');
// Merge newly-run samples into the existing dataset (by vi) when CORR_MERGE is set, so a partial
// scaling run (CORR_ONLY_SLUGS) grows the dataset instead of dropping the prior samples.
let merged = samples;
if (process.env.CORR_MERGE && fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const byVi = new Map((prev.samples || []).map((x) => [x.vi, x]));
  for (const s of samples) byVi.set(s.vi, s);
  merged = [...byVi.values()];
}
const totals = merged.reduce((a, x) => {
  const t = x.timingsSec; a.compareCold += t.compareCold; a.lvkitDiff += t.lvkitDiff; a.lvkitGen += t.lvkitGen; a.previewBaseCold += t.previewBaseCold; a.previewSelectedCold += t.previewSelectedCold; return a;
}, { compareCold: 0, lvkitDiff: 0, lvkitGen: 0, previewBaseCold: 0, previewSelectedCold: 0 });
const dataset = {
  schema: 'vi-history-suite/preview-compare-lvkit-benchmark@v1',
  generatedAt: new Date().toISOString(),
  image: IMAGE, sampleCount: merged.length,
  pipeline: 'compareReport -> staged left/right + commits -> preview(both) + lvkit(diff,generate) -> correlation record',
  samples: merged,
  aggregate: { totalTimingsSec: totals, countAgreementRate: merged.length ? merged.filter((s) => s.correlation.countAgreement_lvkit_vs_nonCosmetic === 1).length / merged.length : 0 }
};
fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2), 'utf8');
console.log('BENCHMARK_DONE ran=' + samples.length + ' total=' + merged.length + ' out=' + outPath);
console.log(JSON.stringify(dataset.aggregate));
for (const s of samples) console.log(s.vi.split('/').pop() + ': lvkit=' + s.lvkit.changeCount + ' labviewNonCosmetic=' + s.labview.nonCosmetic + ' cosmetic=' + s.labview.cosmetic + ' previewDelta=' + s.preview.deltaInlineImages + ' t=' + JSON.stringify(s.timingsSec));
