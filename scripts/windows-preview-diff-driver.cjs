// Windows VI-preview diff-base validation driver (maintainer real-hardware run).
//
// Repeatable regression guard for VHS-REQ-659 / PR #1427: the Source Control
// diff BASE side must render the VI's COMMITTED content, not the working-tree
// file. The bug this guards against rendered `document.uri.fsPath` for both diff
// sides, so a `git`-scheme base URI re-rendered the working file and the two
// previews were identical.
//
// It renders two content-isolated single-file previews of one VI through the
// real preview pipeline (the same vscode-free primitives the extension uses):
//   - the WORKING-tree file (as it is on disk), and
//   - the BASE-REF blob (default HEAD) materialized from Git.
// Both are staged single-file (no project dependencies) so the comparison
// isolates VI CONTENT. It then asserts the contract:
//   contentDiffers  => the two renders differ   (base is the committed VI, not working)
//   !contentDiffers => the two renders are identical (deterministic render)
//
// Maintainer evidence tool (issue #1426 lineage); not shipped in the extension
// and not a CI gate (needs Docker + LabVIEW). Run from the repo root AFTER
// `npm run compile` (it loads ./out):
//   node scripts/windows-preview-diff-driver.cjs
//
// Configure via env vars:
//   WIN_REPO_ROOT       Absolute path to a Git repo containing a tracked .vi
//   WIN_VI_PATH         Repo-relative path of the VI to validate
//   WIN_BASE_REF        Base revision to materialize (default HEAD)
//   WIN_PROVIDER        'docker' (windows-container) or 'host' (default docker)
//   WIN_LV_VERSION      '2025' or '2026'          (default 2026)
//   WIN_LV_BITNESS      'x86' or 'x64'            (default x64; docker requires x64)
//   WIN_CONTAINER_IMAGE optional image override   (default nationalinstruments/labview:2026q1-windows)
//   WIN_CONNECT_TIMEOUT LabVIEWCLI connect seconds (default 180)
//   WIN_WORK_ROOT       scratch root for materialized VIs (default OS temp)
//
// Example (PowerShell), docker/windows-container:
//   $env:WIN_REPO_ROOT='C:\repos\ni\actor-framework'
//   $env:WIN_VI_PATH='Core/Testing/Test Harness/AF Trace Queue/Dequeue Trace.vi'
//   $env:WIN_PROVIDER='docker'; $env:WIN_CONTAINER_IMAGE='nationalinstruments/labview:2026q1patch2-windows'
//   node scripts/windows-preview-diff-driver.cjs

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const OUT = path.join(process.cwd(), 'out');
const { locateComparisonRuntime } = require(path.join(OUT, 'reporting', 'comparisonRuntimeLocator.js'));
const {
  mapComparisonRuntimeSelectionToViPreview
} = require(path.join(OUT, 'reporting', 'viPreview', 'viPreviewRuntimeAdapter.js'));
const { renderViPreviewForFile } = require(path.join(OUT, 'reporting', 'viPreview', 'viPreviewFileRender.js'));
const { buildNodeViPreviewRenderDeps } = require(path.join(OUT, 'tooling', 'viPreviewVerifyCli.js'));

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value.trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text ?? '').digest('hex');
}

/** Renders a single on-disk VI (single-file staged) and returns outcome + html. */
async function renderSingle(viFilePath, runtime, operationDirectory) {
  return renderViPreviewForFile(
    { runtime, viFilePath, operationDirectory },
    buildNodeViPreviewRenderDeps()
  );
}

async function main() {
  const repoRoot = requireEnv('WIN_REPO_ROOT');
  const relativePath = requireEnv('WIN_VI_PATH');
  const baseRef = optionalEnv('WIN_BASE_REF', 'HEAD');
  const provider = optionalEnv('WIN_PROVIDER', 'docker').toLowerCase() === 'host' ? 'host' : 'docker';
  const labviewVersion = optionalEnv('WIN_LV_VERSION', '2026');
  const bitness = optionalEnv('WIN_LV_BITNESS', 'x64').toLowerCase() === 'x86' ? 'x86' : 'x64';
  const windowsContainerImage = optionalEnv('WIN_CONTAINER_IMAGE', 'nationalinstruments/labview:2026q1-windows');
  const connectTimeoutSeconds = Number.parseInt(optionalEnv('WIN_CONNECT_TIMEOUT', '180'), 10);
  const workRoot = optionalEnv('WIN_WORK_ROOT', path.join(os.tmpdir(), 'vihs-preview-diff'));
  const operationDirectory = path.join(process.cwd(), 'resources', 'labview-cli-operations');

  const emit = (obj) => console.log('VIHS_PREVIEW_DIFF_JSON ' + JSON.stringify(obj));

  const selection = await locateComparisonRuntime('win32', {
    requestedProvider: provider,
    requireVersionAndBitness: true,
    labviewVersion,
    bitness,
    windowsContainerImage
  });
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, {
    processPlatform: 'win32',
    connectTimeoutSeconds
  });
  process.stderr.write(
    `[preview-diff] provider=${selection.provider} engine=${selection.engine ?? 'none'} ` +
      `outcome=${resolution.outcome} reason=${resolution.reason ?? 'none'}\n`
  );
  if (resolution.outcome !== 'ready') {
    emit({ status: 'blocked', provider: selection.provider ?? 'unknown', reason: resolution.reason ?? 'runtime-unavailable' });
    process.exitCode = 1;
    return;
  }
  const runtime = { ...resolution.runtime, headless: true };

  // Materialize the working file and the base-ref blob into isolated single-file dirs.
  const baseName = path.basename(relativePath);
  const workingViOnDisk = path.join(repoRoot, relativePath.split('/').join(path.sep));
  const scratch = fs.mkdtempSync(path.join(workRoot === path.join(os.tmpdir(), 'vihs-preview-diff') ? os.tmpdir() : workRoot, 'vihs-preview-diff-'));
  const workingDir = path.join(scratch, 'working');
  const baseDir = path.join(scratch, 'base');
  fs.mkdirSync(workingDir, { recursive: true });
  fs.mkdirSync(baseDir, { recursive: true });
  const workingCopy = path.join(workingDir, baseName);
  const baseCopy = path.join(baseDir, baseName);

  const workingBytes = fs.readFileSync(workingViOnDisk);
  fs.writeFileSync(workingCopy, workingBytes);

  const blobSha = execFileSync('git', ['-C', repoRoot, 'rev-parse', `${baseRef}:${relativePath}`], {
    encoding: 'utf8'
  }).trim();
  const baseBytes = execFileSync('git', ['-C', repoRoot, 'cat-file', 'blob', blobSha], {
    maxBuffer: 64 * 1024 * 1024
  });
  fs.writeFileSync(baseCopy, baseBytes);

  const contentDiffers = !workingBytes.equals(baseBytes);
  process.stderr.write(
    `[preview-diff] contentDiffers=${contentDiffers} (working ${workingBytes.length}B, base ${baseBytes.length}B) baseRef=${baseRef} blob=${blobSha}\n`
  );

  try {
    process.stderr.write('[preview-diff] rendering working version (launches LabVIEW / container)...\n');
    const workingResult = await renderSingle(workingCopy, runtime, operationDirectory);
    process.stderr.write('[preview-diff] rendering base-ref version...\n');
    const baseResult = await renderSingle(baseCopy, runtime, operationDirectory);

    const bothRendered = workingResult.outcome === 'rendered' && baseResult.outcome === 'rendered';
    const workingHash = sha256(workingResult.html);
    const baseHash = sha256(baseResult.html);
    const rendersDiffer = bothRendered && workingHash !== baseHash;
    // Contract: base render reflects committed content -> renders differ IFF content differs.
    const contractHolds = bothRendered && rendersDiffer === contentDiffers;

    emit({
      status: 'completed',
      provider: selection.provider,
      viPath: relativePath,
      baseRef,
      baseBlob: blobSha,
      contentDiffers,
      workingOutcome: workingResult.outcome,
      baseOutcome: baseResult.outcome,
      workingHtmlBytes: (workingResult.html ?? '').length,
      baseHtmlBytes: (baseResult.html ?? '').length,
      workingHtmlSha256: workingHash,
      baseHtmlSha256: baseHash,
      rendersDiffer,
      contractHolds,
      workingFailureReason: workingResult.failureReason ?? null,
      baseFailureReason: baseResult.failureReason ?? null
    });
    process.stderr.write(
      `[preview-diff] ${contractHolds ? 'PASS' : 'FAIL'}: contentDiffers=${contentDiffers} rendersDiffer=${rendersDiffer}\n`
    );
    process.exitCode = contractHolds ? 0 : 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write('[preview-diff] ERROR ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
