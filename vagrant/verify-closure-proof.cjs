#!/usr/bin/env node
// vagrant/verify-closure-proof.cjs
//
// One-command VI dependency-closure proof (the D2/D4 methodology, automated so
// the next cycle is turnkey): render a VI two ways and report the inline-image
// closure delta --
//   LONE      : an isolated copy with NO enclosing *.lvproj -> partial staging
//               (unresolved subVIs render as cyan '?' placeholders).
//   FULL-TREE : the VI in its repo, enclosing *.lvproj present -> full dependency
//               closure (the '?' placeholders resolve to real dependency renders).
// The +delta inline images from LONE to FULL-TREE is the closure effect.
//
// Provider-parameterized: --provider host runs host-native (the vagrant Windows
// LabVIEW guest); --provider docker runs the Linux container oracle. Reuses the
// shipped out/tooling/viPreviewVerifyCli.js (resolveStagingBaseDirectory walks up
// for the nearest *.lvproj, identical across providers). Maintainer .cjs,
// inventory-exempt, NOT in npm test. Run AFTER `npm run compile`.
//
// Env:
//   VIHS_CP_REPO             fixture repo root (default guest C:\repos\labview-icon-editor
//                            / POSIX ~/repos/labview-icon-editor)
//   VIHS_CP_VI               VI path relative to the repo (default resource/plugins/lv_icon.vi)
//   VIHS_CP_SELECTED         git pin to check out first so the working tree matches
//                            the proof pin ('none' to skip; default fc09736...)
//   VIHS_CP_PROVIDER         host | docker (default host)
//   VIHS_CP_LV_VERSION       host LabVIEW year (default 2026)
//   VIHS_CP_CONTAINER_IMAGE  docker image (docker provider only)
//   VIHS_CP_OUT              evidence dir (default <repo>/vagrant/evidence/closure-proof)

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'out', 'tooling', 'viPreviewVerifyCli.js');

const env = process.env;
const fixtureRepo =
  env.VIHS_CP_REPO ||
  (process.platform === 'win32'
    ? 'C:\\repos\\labview-icon-editor'
    : path.join(os.homedir(), 'repos', 'labview-icon-editor'));
const viRel = env.VIHS_CP_VI || path.join('resource', 'plugins', 'lv_icon.vi');
const selected = env.VIHS_CP_SELECTED || 'fc09736ae5e38c2016de081a9c8686256c9f2f9c';
const provider = env.VIHS_CP_PROVIDER || 'host';
const lvVersion = env.VIHS_CP_LV_VERSION || '2026';
const containerImage = env.VIHS_CP_CONTAINER_IMAGE || '';
const outDir = path.resolve(env.VIHS_CP_OUT || path.join(REPO_ROOT, 'vagrant', 'evidence', 'closure-proof'));

const log = (m) => process.stdout.write(`[closure-proof] ${m}\n`);

/** Portable synchronous sleep (no external console dependency). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Host-native LabVIEW is single-instance: a lingering LabVIEW/LabVIEWCLI from a
 * prior render makes the next render's runtime locator report `unavailable`. Clear
 * it and settle so each host render cold-launches cleanly (mirrors what separate
 * invocations achieve). No-op off win32 / non-host providers (containers are
 * ephemeral).
 */
function settleHostRuntime() {
  if (provider !== 'host' || process.platform !== 'win32') {
    return;
  }
  for (const image of ['LabVIEWCLI.exe', 'LabVIEW.exe']) {
    try {
      execFileSync('taskkill', ['/IM', image, '/F', '/T'], { stdio: 'ignore' });
    } catch {
      /* not running */
    }
  }
  sleepSync(3000);
}

if (!fs.existsSync(CLI)) {
  console.error(`compiled CLI missing: ${CLI}; run: npm run compile`);
  process.exit(2);
}

/** Render one sample VI via the shipped CLI and parse its emitted proof record. */
function render(label, sampleViPath, proofOut) {
  settleHostRuntime();
  const args = [
    CLI,
    '--provider', provider,
    '--labview-version', lvVersion,
    '--sample-vi', sampleViPath,
    '--proof-out', proofOut
  ];
  if (provider === 'docker' && containerImage) {
    args.push('--container-image', containerImage);
  }
  let stdout = '';
  try {
    stdout = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // The CLI exits 1 on a FAIL proof; its record is still on stdout.
    stdout = `${e.stdout || ''}${e.stderr || ''}`;
  }
  let record = null;
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('{') && t.includes('preview-verification-proof')) {
      try {
        record = JSON.parse(t);
        break;
      } catch {
        /* keep scanning */
      }
    }
  }
  if (!record) {
    log(`${label}: could not parse a proof record; raw tail: ${stdout.slice(-300)}`);
    return { label, parsed: false };
  }
  log(
    `${label}: ${record.passing ? 'PASS' : 'FAIL'} images=${record.inlineImageCount} ` +
      `bytes=${record.htmlBytes} provider=${record.provider}`
  );
  return {
    label,
    parsed: true,
    passing: Boolean(record.passing),
    inlineImageCount: record.inlineImageCount ?? null,
    htmlBytes: record.htmlBytes ?? null,
    provider: record.provider ?? null,
    outcome: record.outcome ?? null,
    failureReason: record.failureReason ?? null
  };
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // 1) Pin the fixture working tree so the rendered content matches the proof pin.
  let head = null;
  if (selected && selected !== 'none') {
    try {
      execFileSync('git', ['-C', fixtureRepo, 'checkout', '-f', selected], { stdio: 'ignore' });
      head = execFileSync('git', ['-C', fixtureRepo, 'rev-parse', '--short', 'HEAD'], {
        encoding: 'utf8'
      }).trim();
      log(`checked out ${fixtureRepo} @ ${head}`);
    } catch (e) {
      console.error(`git checkout ${selected} in ${fixtureRepo} failed: ${e.message}`);
      process.exit(1);
    }
  }

  const fullTreeVi = path.join(fixtureRepo, viRel);
  if (!fs.existsSync(fullTreeVi)) {
    console.error(`VI not found: ${fullTreeVi}`);
    process.exit(1);
  }

  // 2) FULL-TREE: render in place (enclosing *.lvproj -> full dependency closure).
  const fullTree = render('full-tree', fullTreeVi, path.join(outDir, 'fulltree-proof'));

  // 3) LONE: isolated copy in an OS temp dir with NO enclosing *.lvproj anywhere
  //    up the tree -> partial staging (guaranteed isolation, matching D2/D4).
  const loneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-closure-lone-'));
  const loneVi = path.join(loneDir, path.basename(viRel));
  fs.copyFileSync(fullTreeVi, loneVi);
  const lone = render('lone', loneVi, path.join(outDir, 'lone-proof'));

  const closureDelta =
    fullTree.parsed && lone.parsed ? fullTree.inlineImageCount - lone.inlineImageCount : null;
  const bothPass = Boolean(fullTree.passing && lone.passing);

  const evidence = {
    schema: 'vi-history-suite/vi-preview-closure-proof@v1',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider,
    lvVersion,
    fixtureRepo,
    vi: viRel,
    selected: head || selected,
    lone,
    fullTree,
    closureDelta,
    bothPass
  };
  const evidencePath = path.join(outDir, 'closure-proof.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  log(
    `closureDelta=${closureDelta} (full-tree ${fullTree.inlineImageCount} - lone ${lone.inlineImageCount}); ` +
      `bothPass=${bothPass}`
  );
  log(`wrote ${path.relative(REPO_ROOT, evidencePath)}`);
  process.exit(bothPass ? 0 : 1);
}

main();
