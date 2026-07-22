// Maintainer driver (VHS-REQ-712): proves the LabVIEW-FREE lvkit semantic diff
// end-to-end on a real VI revision pair. It extracts the two git blobs, runs the
// real `lvkit diff --format json`, feeds the output through the shipped compiled
// parser + adapter, and writes the produced ViSemanticComparisonModel as evidence
// — no LabVIEW, no docker, no Python beyond the lvkit CLI.
//
// Maintainer `.cjs` (inventory-exempt); not shipped, not in npm test. Run from
// the repo root AFTER `npm run compile`, with lvkit on PATH (`uv tool install lvkit`).
//
// Env:
//   LVKIT_REPO      git repo holding the VI (default the icon-editor clone)
//   LVKIT_VI_PATH   repo-relative .vi path (default resource/plugins/lv_icon.vi)
//   LVKIT_BASE      base git revision
//   LVKIT_SELECTED  selected git revision
//   LVKIT_BIN       lvkit executable (default `lvkit`)
//   LVKIT_OUT       evidence JSON path
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const OUT = path.join(process.cwd(), 'out', 'semantic', 'lvkit');
function need(rel) {
  const f = path.join(OUT, rel);
  if (!fs.existsSync(f)) {
    console.error(`[lvkit-semantic] missing ${path.relative(process.cwd(), f)}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return require(f);
}

const { parseLvkitDiffJson } = need('lvkitDiffModel.js');
const { buildViSemanticModelFromLvkitDiff } = need('lvkitSemanticAdapter.js');

function main() {
  const env = process.env;
  const repoRoot = env.LVKIT_REPO || path.join(process.env.HOME || '', 'repos', 'labview-icon-editor');
  const relativePath = env.LVKIT_VI_PATH || 'resource/plugins/lv_icon.vi';
  const baseHash = env.LVKIT_BASE || '537683398d8c';
  const selectedHash = env.LVKIT_SELECTED || 'fc09736ae5e3';
  const lvkitBin = env.LVKIT_BIN || 'lvkit';
  const outPath = env.LVKIT_OUT || path.join(process.cwd(), 'lin-validation', 'lvkit-semantic', 'lvkit-semantic-evidence.json');

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-lvkit-'));
  const evidence = {
    $schema: 'vi-history-suite/lvkit-semantic-diff-evidence@v1',
    generatedAt: new Date().toISOString(),
    provider: 'lvkit',
    lvkitVersion: null,
    corpus: { repoRoot, relativePath, baseHash, selectedHash },
    ok: false,
    changeCount: null,
    commonNodes: null,
    model: null,
    error: null
  };

  try {
    evidence.lvkitVersion = execFileSync(lvkitBin, ['--version'], { encoding: 'utf8' }).trim().split(/\r?\n/).pop();

    const aPath = path.join(stage, `base-${baseHash}.vi`);
    const bPath = path.join(stage, `selected-${selectedHash}.vi`);
    for (const [rev, dest] of [[baseHash, aPath], [selectedHash, bPath]]) {
      const bytes = execFileSync('git', ['-C', repoRoot, 'cat-file', '-p', `${rev}:${relativePath}`], {
        maxBuffer: 256 * 1024 * 1024
      });
      fs.writeFileSync(dest, bytes);
    }

    console.error('[lvkit-semantic] running real lvkit diff (LabVIEW-free)...');
    const stdout = execFileSync(
      lvkitBin,
      ['diff', aPath, bPath, '--format', 'json', '--search-path', repoRoot],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );

    const diff = parseLvkitDiffJson(stdout);
    const model = buildViSemanticModelFromLvkitDiff(diff, {
      title: path.basename(relativePath),
      firstViPath: aPath,
      secondViPath: bPath,
      revisions: { baseHash, selectedHash }
    });

    evidence.ok = true;
    evidence.changeCount = diff.changes.length;
    evidence.commonNodes = diff.commonNodes;
    evidence.model = model;
  } catch (error) {
    evidence.error = error && error.message ? error.message : String(error);
    console.error(`[lvkit-semantic] ERROR: ${evidence.error}`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  const m = evidence.model;
  console.log(
    JSON.stringify(
      {
        ok: evidence.ok,
        provider: evidence.provider,
        lvkitVersion: evidence.lvkitVersion,
        changeCount: evidence.changeCount,
        commonNodes: evidence.commonNodes,
        hasDifferences: m ? m.hasDifferences : null,
        changedSurfaces: m ? m.changedSurfaces : null,
        changeKinds: m ? m.changeKinds : null,
        riskLevel: m ? m.riskLevel : null,
        narrative: m ? m.narrative : null
      },
      null,
      2
    )
  );
  console.error(`[lvkit-semantic] evidence -> ${path.relative(process.cwd(), outPath)}`);
  process.exitCode = evidence.ok ? 0 : 1;
}

main();
