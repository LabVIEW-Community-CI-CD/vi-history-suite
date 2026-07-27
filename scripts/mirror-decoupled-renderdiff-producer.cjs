#!/usr/bin/env node
'use strict';

/**
 * Mirror-Mode decoupled RENDER-DIFF benchmark PRODUCER driver (VHS-REQ-707, VHS-REQ-706, #2315).
 *
 * Third sibling of the decoupled producers:
 *   - scripts/mirror-decoupled-producer.cjs          -> CreateComparisonReport (semantic; host-native
 *     Linux BLOCKED by the linux-headless-recursive-load GSW blocker, VHS-REQ-706, records a blocked row)
 *   - scripts/mirror-decoupled-preview-producer.cjs  -> single-VI preview benchmark (renderViPreview)
 *   - THIS                                            -> RENDER-DIFF of two revisions (renderDiff)
 *
 * WHY: on a host-native Linux runtime the built-in CreateComparisonReport operation pulls in the
 * Getting-Started-Window packed library and trips a recursive LEIF load (VHS-REQ-706), so semantic
 * comparison cannot run headless there. NI's single-VI HTML renderer (the vendored `PrintToSingleFileHtml`
 * custom LabVIEWCLI operation under resources/labview-cli-operations/, sourced from
 * ni/labview-for-containers) DOES render headless on the same runtime. This producer therefore compares
 * two revisions of a VI the headless-viable way: it renders the BASE and SELECTED revisions with
 * PrintToSingleFileHtml and structurally diffs the two rendered documents (overall digest + per-inline-
 * image SHA grouped by the render's section headings + a non-image text-shell delta), emitting a
 * decoupled per-actor row in the vi-history-suite/mirror-benchmark@v1 ledger.
 *
 * HONESTY (ADR-0028 + the mirror ledger contract): a render-diff is a RENDERED-OUTPUT delta, NOT the
 * semantic CreateComparisonReport parity. It is recorded under recipe `renderDiff` with its own parity
 * key (distinct from `renderViPreview` and `createComparisonReport`) so it never masquerades as true
 * comparison parity -- a render-diff row means the decoupled actor is present-and-capable of detecting a
 * change, while the semantic comparison row stays gated on VHS-REQ-706. Best-effort evidence: a failed /
 * non-image / recursive-load render records a blocked row, never a fabricated ok row.
 *
 * Runtime discipline: LabVIEWCLI ONLY (never the LabVIEW binary directly); on Linux LabVIEWCLI requires
 * an explicit -LabVIEWPath. No CreateComparisonReport is ever invoked by this producer.
 *
 * Maintainer/CI `.cjs` (inventory-exempt like the sibling producers); NOT in `npm test`. Requires
 * `npm run compile` (consumes out/reporting/mirror/*).
 *
 * Env:
 *   VIHS_R_REPO           fixture repo (default the SerialPortNuggets clone)
 *   VIHS_R_VI             VI under test, repo-relative (default ASCII/Terminals/ASCII Intermittent.vi)
 *   VIHS_R_BASE           base git rev (default HEAD~1)
 *   VIHS_R_SELECTED       selected git rev (default HEAD)
 *   VIHS_R_VERSION        LabVIEW year (default 2026)
 *   VIHS_R_BITNESS        x86 | x64 (default x64) -- fingerprint metadata
 *   VIHS_R_BUILD          LabVIEW build string for the fingerprint (default <version>-hostnative)
 *   VIHS_R_DISK_FREE_BYTES override for free-disk bytes (default fs.statfsSync on the fixture repo)
 *   VIHS_R_ACTOR          actor id (default linux-host-native-x64)
 *   VIHS_R_LEDGER         ledger path, repo-relative (default docs/requirements/mirror-benchmark-ledger.json)
 *   VIHS_R_LVPATH         LabVIEW path for -LabVIEWPath (default the native 2026-64 install)
 *   VIHS_R_CONNECT_TIMEOUT connect timeout seconds (unused placeholder for parity with siblings)
 *   VIHS_R_OUT            optional JSON evidence path
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
// Parent directory of the vendored NI PrintToSingleFileHtml/ operation folder, passed to
// LabVIEWCLI -AdditionalOperationDirectory (sourced from ni/labview-for-containers).
const OPERATION_DIRECTORY = path.join(repoRoot, 'resources', 'labview-cli-operations');
const VI_PREVIEW_OPERATION_NAME = 'PrintToSingleFileHtml';

function need(rel) {
  const f = path.join(repoRoot, rel);
  if (!fs.existsSync(f)) {
    console.error(`[render-diff] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

const env = process.env;
const fixtureRepo = env.VIHS_R_REPO || path.join(os.homedir(), 'repos', 'SerialPortNuggets');
const viPath = env.VIHS_R_VI || 'ASCII/Terminals/ASCII Intermittent.vi';
const baseRev = env.VIHS_R_BASE || 'HEAD~1';
const selectedRev = env.VIHS_R_SELECTED || 'HEAD';
const version = env.VIHS_R_VERSION || '2026';
const bitness = env.VIHS_R_BITNESS || 'x64';
const actor = env.VIHS_R_ACTOR || 'linux-host-native-x64';
// This producer IS the decoupled host-native render-diff actor -- role/provider/capturedFrom are fixed.
const role = 'decoupled';
const provider = 'host-native';
const ledgerRel = env.VIHS_R_LEDGER || 'docs/requirements/mirror-benchmark-ledger.json';
const cli = env.VIHS_R_CLI || '/usr/local/bin/LabVIEWCLI';
const lvPath = env.VIHS_R_LVPATH || `/usr/local/natinst/LabVIEW-${version}-64/labview`;
// Actor-neutral logical recipe -- a rendered-output delta, distinct from createComparisonReport.
const RECIPE = 'renderDiff';

const digest = need('out/reporting/mirror/mirrorParityDigest.js');
const capability = need('out/reporting/mirror/mirrorCapabilityFingerprint.js');

function sha16(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

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
        `Could not determine free disk via fs.statfsSync (${error && error.message ? error.message : error}); set VIHS_R_DISK_FREE_BYTES.`
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

// Blob sha of a committed revision of a VI (per-side fixture identity).
function blobSha(rev, rel = viPath) {
  return execFileSync('git', ['-C', fixtureRepo, 'rev-parse', `${rev}:${rel.replace(/\\/g, '/')}`], {
    encoding: 'utf8'
  }).trim();
}

function addWorktree(rev, tag) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), `mrd-wt-${tag}-`));
  execFileSync('git', ['-C', fixtureRepo, 'worktree', 'add', '-q', '--detach', wt, rev], { stdio: 'pipe' });
  return wt;
}
function removeWorktree(wt) {
  try {
    execFileSync('git', ['-C', fixtureRepo, 'worktree', 'remove', '--force', wt], { stdio: 'pipe' });
  } catch {
    /* best-effort */
  }
}

// Render one on-disk VI to a self-contained HTML preview via the vendored NI PrintToSingleFileHtml
// operation. LabVIEWCLI ONLY (never the LabVIEW binary directly); Linux requires -LabVIEWPath.
function render(viAbs, outHtml) {
  const started = Date.now();
  let ok = true;
  let stderr = '';
  try {
    execFileSync(
      cli,
      [
        '-LogToConsole', 'TRUE',
        '-OperationName', VI_PREVIEW_OPERATION_NAME,
        '-AdditionalOperationDirectory', OPERATION_DIRECTORY,
        '-VI', viAbs,
        '-OutputPath', outHtml,
        '-LabVIEWPath', lvPath,
        '-c', '-o'
      ],
      { encoding: 'utf8', stdio: 'pipe' }
    );
  } catch (error) {
    ok = false;
    stderr = `${error.stdout || ''}${error.stderr || ''}`;
  }
  const ms = Date.now() - started;
  const html = fs.existsSync(outHtml) ? fs.readFileSync(outHtml, 'utf8') : '';
  // A REAL recursive-load only manifests as a FAILED render whose stderr carries the LEIF phrase.
  // Never scan the HTML: rendered base64 image data contains incidental substrings (e.g. "gsw").
  const recursiveLoad = !ok && /Recursive load during LEIF|linux-headless-recursive/i.test(stderr);
  return { ok, ms, html, bytes: Buffer.byteLength(html), stderr, recursiveLoad };
}

// Inline base64 PNGs grouped by the render's section headings (Connector Pane / Front Panel /
// Block Diagram / Icon / SubVIs / ...). NI's HTML wraps each blob across lines with a space after
// `base64,`, so allow whitespace and read to the closing quote; keep both the content SHA (for the
// diff) and the whitespace-stripped data URI (for embedding in the HTML summary).
function regionData(html) {
  const regions = [];
  let current = { region: '(header)', images: [] };
  const tokenRe = /<H[23][^>]*>([^<]*)<\/H[23]>|(data:image\/png;base64,[A-Za-z0-9+/=\s]+?)"/gi;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1] !== undefined) {
      if (current.images.length > 0) regions.push(current);
      current = { region: m[1].trim() || '(unnamed)', images: [] };
    } else if (m[2] !== undefined) {
      const dataUri = m[2].replace(/\s+/g, '');
      const b64 = dataUri.slice('data:image/png;base64,'.length);
      current.images.push({ sha: sha16(b64), dataUri });
    }
  }
  if (current.images.length > 0) regions.push(current);
  return regions;
}

function regionShas(region) {
  return region.images.map((i) => i.sha);
}

function allImageShas(regions) {
  return regions.flatMap((r) => r.images.map((i) => i.sha));
}

// Non-image "text shell": HTML with base64 blobs stripped, whitespace-normalized.
function textShell(html) {
  return html.replace(/data:image\/png;base64,[A-Za-z0-9+/=\s]+?"/g, 'IMG"').replace(/\s+/g, ' ').trim();
}

// Per-region change labels + overall image/text deltas.
function structuralDiff(baseRegions, headRegions, base, head) {
  const names = [...new Set([...baseRegions.map((r) => r.region), ...headRegions.map((r) => r.region)])];
  const regionLabels = names.map((name) => {
    const b = baseRegions.find((r) => r.region === name);
    const h = headRegions.find((r) => r.region === name);
    const bImgs = b ? regionShas(b) : [];
    const hImgs = h ? regionShas(h) : [];
    let status;
    if (!b) status = 'added';
    else if (!h) status = 'removed';
    else status = JSON.stringify(bImgs) === JSON.stringify(hImgs) ? 'unchanged' : 'changed';
    return { region: name, status, baseImages: bImgs.length, headImages: hImgs.length };
  });
  const bi = allImageShas(baseRegions);
  const hi = allImageShas(headRegions);
  const n = Math.max(bi.length, hi.length);
  let changedPositions = 0;
  for (let i = 0; i < n; i += 1) if (bi[i] !== hi[i]) changedPositions += 1;
  return {
    overallChanged: base.htmlSha !== head.htmlSha,
    baseImageCount: bi.length,
    headImageCount: hi.length,
    changedImagePositions: changedPositions,
    changedRegions: regionLabels.filter((r) => r.status !== 'unchanged').map((r) => r.region),
    textShellChanged: sha16(textShell(base.html)) !== sha16(textShell(head.html)),
    regions: regionLabels
  };
}

// Build a self-contained, region-labeled HTML diff summary: per region, the base vs selected
// rendered images side-by-side with a change-status badge. A rendered-output view, not semantic parity.
function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const SUMMARY_STYLE =
  ':root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--fg:#e6edf3;--muted:#8b949e}' +
  '@media(prefers-color-scheme:light){:root{--bg:#fff;--surface:#f6f8fa;--border:#d0d7de;--fg:#1f2328;--muted:#57606a}}' +
  "body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--fg)}" +
  'h1{font-size:1.25em;margin:0 0 4px}.sub{color:var(--muted);font-size:.85em;margin-bottom:16px}' +
  '.region{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px}' +
  '.region.unchanged{opacity:.65}.region h2{font-size:1em;margin:0 0 10px;display:flex;gap:10px;align-items:center}' +
  '.counts{color:var(--muted);font-size:.8em;font-weight:400;margin-left:auto}' +
  '.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}' +
  '.col h3{font-size:.72em;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);margin:0 0 6px}' +
  '.col img{max-width:100%;border:1px solid var(--border);border-radius:4px;margin:2px 0;display:block}' +
  '.none{color:var(--muted);font-style:italic;font-size:.85em}' +
  '.badge{font-size:.66em;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:20px;color:#fff}' +
  '.badge.unchanged{background:#1a7f37}.badge.changed{background:#9a6700}.badge.added{background:#0969da}.badge.removed{background:#cf222e}' +
  '.badge.modified{background:#9a6700}.badge.deleted{background:#cf222e}.badge.skipped{background:#6e7681}' +
  '.note{color:var(--muted);font-size:.78em;margin-top:16px;border-top:1px solid var(--border);padding-top:10px}';

function buildHtmlDiffSummary(baseRegions, headRegions, diff, meta) {
  const findImages = (regions, name) => {
    const r = regions.find((x) => x.region === name);
    return r ? r.images : [];
  };
  const imgCell = (images) =>
    images.length
      ? images.map((i) => '<img src="' + i.dataUri + '" loading="lazy">').join('')
      : '<span class="none">(none)</span>';
  const sections = diff.regions
    .map((r) => {
      const b = imgCell(findImages(baseRegions, r.region));
      const h = imgCell(findImages(headRegions, r.region));
      return (
        '<section class="region ' + r.status + '"><h2>' + esc(r.region) +
        ' <span class="badge ' + r.status + '">' + r.status + '</span>' +
        '<span class="counts">base ' + r.baseImages + ' / selected ' + r.headImages + '</span></h2>' +
        '<div class="cols"><div class="col"><h3>Base (' + esc(meta.baseRev) + ')</h3>' + b + '</div>' +
        '<div class="col"><h3>Selected (' + esc(meta.selectedRev) + ')</h3>' + h + '</div></div></section>'
      );
    })
    .join('\n');
  const changedCount = diff.changedRegions.length;
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Render-Diff: ' + esc(meta.viPath) + '</title><style>' + SUMMARY_STYLE + '</style></head><body>' +
    '<h1>Render-Diff &mdash; ' + esc(meta.viPath) + '</h1>' +
    '<div class="sub">' + esc(meta.baseRev) + ' &rarr; ' + esc(meta.selectedRev) +
    ' &nbsp;|&nbsp; actor ' + esc(meta.actor) + ' &nbsp;|&nbsp; recipe ' + esc(meta.recipe) +
    ' &nbsp;|&nbsp; ' + changedCount + ' of ' + diff.regions.length + ' region(s) changed</div>' +
    sections +
    '<div class="note">Rendered-output delta assembled from NI PrintToSingleFileHtml renders of each ' +
    'revision (LabVIEWCLI, headless). This is a RENDERED-OUTPUT comparison, not a semantic ' +
    'CreateComparisonReport parity.</div></body></html>'
  );
}

// Magic-byte guard: a real LabVIEW VI/CTL has LVIN (VI) or LVCC (CTL/class) at byte offset 8.
function isLabviewFile(absPath) {
  try {
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(4);
    const read = fs.readSync(fd, buf, 0, 4, 8);
    fs.closeSync(fd);
    if (read < 4) return false;
    const magic = buf.toString('latin1');
    return magic === 'LVIN' || magic === 'LVCC';
  } catch {
    return false;
  }
}

function emptyRender() {
  return { ok: true, ms: 0, html: '', bytes: 0, stderr: '', recursiveLoad: false, htmlSha: null };
}

// Enumerate changed .vi/.ctl between two revisions (renames split into add+delete via --no-renames).
function enumerateChangedVis(base, selected) {
  const out = execFileSync('git', ['-C', fixtureRepo, 'diff', '--name-status', '--no-renames', base, selected], {
    encoding: 'utf8'
  });
  const entries = [];
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^([AMD])\s+(.+)$/);
    if (!m) continue;
    if (!/\.(vi|ctl)$/i.test(m[2])) continue;
    entries.push({ file: m[2], changeType: m[1] === 'A' ? 'added' : m[1] === 'D' ? 'deleted' : 'modified' });
  }
  return entries;
}

// Render + diff ONE changed VI. Modified renders both sides; added renders only the selected side
// (all regions "added"); deleted renders only the base side (all regions "removed"). Records the
// per-VI mirror-benchmark renderDiff row and writes a per-VI region-labeled HTML summary.
function processOneVi(viRel, changeType, baseWt, selWt, ctx) {
  const { fingerprint, actorRef, sourceRevision, outDir } = ctx;
  const safe = viRel.replace(/[^a-zA-Z0-9._-]/g, '_');
  const presentPath = changeType === 'deleted' ? path.join(baseWt, viRel) : path.join(selWt, viRel);
  if (!isLabviewFile(presentPath)) {
    console.log(`[render-diff]     skipped (not a LabVIEW VI): ${viRel}`);
    return { viRel, changeType, outcome: 'skipped', reason: 'not-a-labview-vi', changedRegions: [], regionCount: 0 };
  }

  const baseRes =
    changeType === 'added' ? emptyRender() : render(path.join(baseWt, viRel), path.join(outDir, `${safe}.base.html`));
  baseRes.htmlSha = baseRes.bytes ? sha16(baseRes.html) : null;
  const headRes =
    changeType === 'deleted' ? emptyRender() : render(path.join(selWt, viRel), path.join(outDir, `${safe}.selected.html`));
  headRes.htmlSha = headRes.bytes ? sha16(headRes.html) : null;

  const needBase = changeType !== 'added';
  const needHead = changeType !== 'deleted';
  const rendersOk =
    (!needBase || (baseRes.ok && baseRes.bytes > 0)) && (!needHead || (headRes.ok && headRes.bytes > 0));

  const baseRegions = baseRes.bytes ? regionData(baseRes.html) : [];
  const headRegions = headRes.bytes ? regionData(headRes.html) : [];
  let outcome = rendersOk ? 'ok' : 'blocked';
  let diff = null;
  let previewImageCount = 0;
  let reportSha256;
  let summaryRel;
  if (rendersOk) {
    diff = structuralDiff(baseRegions, headRegions, baseRes, headRes);
    previewImageCount = Math.max(diff.baseImageCount, diff.headImageCount);
    const summaryAbs = path.join(outDir, `${safe}.summary.html`);
    fs.writeFileSync(
      summaryAbs,
      buildHtmlDiffSummary(baseRegions, headRegions, diff, { viPath: viRel, baseRev, selectedRev, actor, recipe: RECIPE })
    );
    summaryRel = path.basename(summaryAbs);
    reportSha256 = digest.deriveReportSha256(
      `renderDiff|${changeType}|${baseRes.htmlSha}|${headRes.htmlSha}|${diff.changedRegions.join(',')}|${diff.changedImagePositions}`
    );
    const presentImages = changeType === 'deleted' ? diff.baseImageCount : diff.headImageCount;
    if (presentImages === 0) outcome = 'blocked';
  } else {
    const reason = baseRes.recursiveLoad || headRes.recursiveLoad ? 'linux-headless-recursive-load' : 'render-failed';
    reportSha256 = digest.deriveReportSha256(`blocked:${reason}`);
    console.error(`[render-diff]     BLOCKED (${reason}): ${viRel}`);
  }

  const baseBlob = changeType === 'added' ? '(absent)' : blobSha(baseRev, viRel);
  const selBlob = changeType === 'deleted' ? '(absent)' : blobSha(selectedRev, viRel);
  const pairFixtureSha = crypto.createHash('sha256').update(`${baseBlob}->${selBlob}`).digest('hex');
  const parityKey = digest.deriveParityKey({ version, fixtureSha: pairFixtureSha, viPath: viRel, recipe: RECIPE });
  const wallMs = Math.max(0, baseRes.ms) + Math.max(0, headRes.ms);

  const fpRel = path.join('.mirror-fp', `mirror-fp-rd-${actorRef.slice(0, 8)}-${safe.slice(0, 12)}.json`);
  const fpFile = path.join(repoRoot, fpRel);
  fs.mkdirSync(path.dirname(fpFile), { recursive: true });
  fs.writeFileSync(fpFile, JSON.stringify(fingerprint, null, 2));
  execFileSync(
    'node',
    [
      'scripts/recordMirrorBenchmark.js',
      '--parity-key', parityKey,
      '--actor-ref', actorRef,
      '--source-revision', sourceRevision,
      '--vi-path', viRel,
      '--fixture-sha', pairFixtureSha,
      '--recipe', RECIPE,
      '--mode', 'cold',
      '--outcome', outcome,
      '--report-sha256', reportSha256,
      '--preview-image-count', String(previewImageCount),
      '--wall-ms', String(wallMs),
      '--fingerprint-file', fpRel,
      '--ledger', ledgerRel
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  fs.rmSync(fpFile, { force: true });

  return {
    viRel,
    changeType,
    outcome,
    parityKey,
    previewImageCount,
    wallMs,
    reportSha256,
    changedRegions: diff ? diff.changedRegions : [],
    regionCount: diff ? diff.regions.length : 0,
    summaryRel,
    diff
  };
}

// Changeset index: one row per changed VI with its change-type, region-change count, and a report link.
function buildChangesetIndex(results, meta) {
  const rows = results
    .map((r) => {
      const link = r.summaryRel ? '<a href="' + esc(r.summaryRel) + '">view</a>' : '&mdash;';
      const regions = r.diff
        ? r.changedRegions.length + ' of ' + r.regionCount + ' regions changed'
        : r.reason || r.outcome;
      return (
        '<tr><td><span class="badge ' + r.changeType + '">' + r.changeType + '</span></td>' +
        '<td class="file">' + esc(r.viRel) + '</td><td>' + esc(regions) + '</td>' +
        '<td>' + esc(r.outcome) + '</td><td>' + link + '</td></tr>'
      );
    })
    .join('\n');
  const ok = results.filter((r) => r.outcome === 'ok').length;
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Render-Diff changeset: ' + esc(meta.baseRev) + ' &rarr; ' + esc(meta.selectedRev) + '</title><style>' +
    SUMMARY_STYLE +
    'table{border-collapse:collapse;width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}' +
    'th{text-align:left;padding:9px 12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:.72em;text-transform:uppercase}' +
    'td{padding:9px 12px;border-bottom:1px solid var(--border);font-size:.9em}.file{font-family:ui-monospace,Menlo,monospace;font-size:.84em;word-break:break-all}' +
    'a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body>' +
    '<h1>Render-Diff changeset</h1>' +
    '<div class="sub">' + esc(meta.baseRev) + ' &rarr; ' + esc(meta.selectedRev) +
    ' &nbsp;|&nbsp; actor ' + esc(meta.actor) + ' &nbsp;|&nbsp; recipe ' + esc(meta.recipe) +
    ' &nbsp;|&nbsp; ' + results.length + ' VI(s), ' + ok + ' ok</div>' +
    '<table><thead><tr><th>Change</th><th>VI</th><th>Regions</th><th>Outcome</th><th>Report</th></tr></thead><tbody>' +
    rows +
    '</tbody></table>' +
    '<div class="note">Rendered-output deltas via NI PrintToSingleFileHtml (LabVIEWCLI, headless). ' +
    'RENDERED-OUTPUT comparison, not semantic CreateComparisonReport parity.</div></body></html>'
  );
}

async function main() {
  const fingerprint = loadFingerprint();
  const actorRef = digest.deriveActorFingerprintId(fingerprint);
  const sourceRevision = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const outDir = env.VIHS_R_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-renderdiff-'));
  const changeset = env.VIHS_R_CHANGESET === '1';

  console.log(
    `[render-diff] actor=${actor} actorRef=${actorRef.slice(0, 12)}… provider=${provider} recipe=${RECIPE} mode=${changeset ? 'changeset' : 'single-vi'}`
  );
  console.log(`[render-diff] repo=${fixtureRepo} base=${baseRev} selected=${selectedRev}`);
  console.log(`[render-diff] LabVIEWCLI=${cli} -LabVIEWPath=${lvPath} op=PrintToSingleFileHtml (vendored NI; no CreateComparisonReport; never labview directly)`);

  const targets = changeset ? enumerateChangedVis(baseRev, selectedRev) : [{ file: viPath, changeType: 'modified' }];
  if (targets.length === 0) {
    console.log('[render-diff] no changed .vi/.ctl to diff.');
    return;
  }
  console.log(`[render-diff] targets: ${targets.length}`);

  const baseWt = addWorktree(baseRev, 'base');
  const selWt = addWorktree(selectedRev, 'sel');
  const results = [];
  try {
    for (const t of targets) {
      console.log(`[render-diff] -- ${t.changeType} ${t.file}`);
      results.push(processOneVi(t.file, t.changeType, baseWt, selWt, { fingerprint, actorRef, sourceRevision, outDir }));
    }
  } finally {
    removeWorktree(baseWt);
    removeWorktree(selWt);
  }

  let indexPath = null;
  if (changeset) {
    indexPath = path.join(outDir, 'render-diff-index.html');
    fs.writeFileSync(indexPath, buildChangesetIndex(results, { baseRev, selectedRev, actor, recipe: RECIPE }));
    console.log(`[render-diff] changeset index: ${indexPath}`);
  }

  const evidence = {
    schema: changeset ? 'vi-history-suite/mirror-render-diff-changeset@v1' : 'vi-history-suite/mirror-render-diff@v1',
    actor,
    actorRef,
    provider,
    recipe: RECIPE,
    baseRev,
    selectedRev,
    mode: changeset ? 'changeset' : 'single-vi',
    targetCount: targets.length,
    results: results.map((r) => ({
      viRel: r.viRel,
      changeType: r.changeType,
      outcome: r.outcome,
      parityKey: r.parityKey ? r.parityKey.slice(0, 16) : null,
      changedRegions: r.changedRegions,
      regionCount: r.regionCount,
      previewImageCount: r.previewImageCount,
      summary: r.summaryRel || null
    })),
    outDir,
    index: indexPath,
    ledger: ledgerRel
  };
  if (env.VIHS_R_OUT) {
    fs.writeFileSync(env.VIHS_R_OUT, JSON.stringify(evidence, null, 2));
  }
  console.log(`[render-diff] recorded: ${JSON.stringify(evidence, null, 2)}`);
}

main().catch((error) => {
  console.error(`[render-diff] failed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
