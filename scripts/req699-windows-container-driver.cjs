// VHS-REQ-699: HOSTED-CI Windows-container driver for the single-pass comparison-
// preview pipeline. Runs on a GitHub-HOSTED `windows-latest` runner (NOT self-
// hosted) to exercise 64-bit LabVIEW on Windows via the windows-container
// provider — the bitness/OS combo the 32-bit Vagrant VM cannot cover — and to
// give a GitHub Actions signal.
//
// Wires the always-on staged-VI preview validator so all six pipeline states
// (STAGING / PREVIEW_LEFT / PREVIEW_RIGHT / VALIDATION / COMPARISON / UNSTAGING)
// exercise, and writes a schema-tagged evidence JSON the workflow uploads as a
// build artifact. Best-effort: a real pull/run may fail on this hosted image (OS
// base mismatch, licensing); the driver captures the outcome as EVIDENCE and
// exits 0 by default so the workflow always publishes a signal (pass
// VIHS_FAIL_ON_RUNTIME_FAILURE=1 to make a runtime failure fail the job).
//
// Run from the repo root AFTER `npm run compile` (loads ./out). Env:
//   WIN_REPO_ROOT      fixture Git repo (default C:\repos\labview-icon-editor)
//   WIN_VI_PATH        repo-relative VI (default resource/plugins/lv_icon.vi)
//   WIN_BASE / WIN_SELECTED   fixture revisions (defaults = icon-editor pair)
//   WIN_CONTAINER_IMAGE       default nationalinstruments/labview:2026q1-windows
//   WIN_LV_VERSION            default 2026
//   VIHS_OUT                  evidence JSON path (default req699-windows-container-evidence.json)
//   VIHS_FAIL_ON_RUNTIME_FAILURE  '1' -> nonzero exit on runtime failure
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(process.cwd(), 'out', 'reporting');
const { locateComparisonRuntime } = require(path.join(OUT, 'comparisonRuntimeLocator.js'));
const { preflightComparisonReportRevisions } = require(path.join(OUT, 'comparisonReportPreflight.js'));
const { persistComparisonReportPacket } = require(path.join(OUT, 'comparisonReportPacket.js'));
const {
  executeComparisonReport,
  materializeSelectedRevisionTreeWithGit
} = require(path.join(OUT, 'comparisonReportRuntimeExecution.js'));
const {
  buildStagedViPreviewValidator
} = require(path.join(OUT, 'viPreview', 'stagedViPreviewValidatorFactory.js'));

const SCHEMA = 'vi-history-suite/req699-windows-container-evidence@v1';

async function main() {
  const repoRoot = process.env.WIN_REPO_ROOT || 'C:\\repos\\labview-icon-editor';
  const relativePath = process.env.WIN_VI_PATH || 'resource/plugins/lv_icon.vi';
  const baseHash = process.env.WIN_BASE || '537683398d8c5cb73533603b5c06b6eef62a6ac8';
  const selectedHash = process.env.WIN_SELECTED || 'fc09736ae5e38c2016de081a9c8686256c9f2f9c';
  const containerImage = process.env.WIN_CONTAINER_IMAGE || 'nationalinstruments/labview:2026q1-windows';
  const outPath = process.env.VIHS_OUT || path.join(process.cwd(), 'req699-windows-container-evidence.json');
  const storageRoot = path.join(process.cwd(), 'win-validation', 'req699-windows-container', 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  const evidence = {
    $schema: SCHEMA,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: 'windows-container',
    bitness: 'x64',
    containerImage,
    fixture: { repoRoot, relativePath, baseHash, selectedHash },
    runtimeState: null,
    reportExists: false,
    failureReason: null,
    blockedReason: null,
    pipelineCycles: null,
    error: null
  };

  try {
    const runtimeSelection = await locateComparisonRuntime('win32', {
      requestedProvider: 'docker',
      labviewVersion: process.env.WIN_LV_VERSION || '2026',
      bitness: 'x64',
      requireVersionAndBitness: true,
      windowsContainerImage: containerImage
    });
    evidence.provider = runtimeSelection.provider;
    evidence.blockedReason = runtimeSelection.blockedReason ?? null;
    process.stderr.write(
      `[req699-winctr] provider=${runtimeSelection.provider} engine=${runtimeSelection.engine} ` +
        `blocked=${runtimeSelection.blockedReason ?? 'none'} image=${runtimeSelection.windowsContainerImage ?? containerImage}\n`
    );

    const preflight = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId: baseHash,
      rightRevisionId: selectedHash
    });
    process.stderr.write(`[req699-winctr] preflight ready=${preflight.ready} blocked=${preflight.blockedReason ?? 'none'}\n`);

    const packet = await persistComparisonReportPacket({
      storageRoot,
      repositoryRoot: repoRoot,
      relativePath,
      reportType: 'diff',
      selectedHash,
      baseHash,
      preflight,
      runtimeSelection
    });

    const operationDirectory = path.join(process.cwd(), 'resources', 'labview-cli-operations');
    const renderStagedViPreview = buildStagedViPreviewValidator({ operationDirectory });

    let record = packet.record;
    if (record.reportStatus === 'ready-for-runtime') {
      process.stderr.write('[req699-winctr] executing single-pass pipeline (previews + windows-container compare)...\n');
      const result = await executeComparisonReport(
        { record, repositoryRoot: repoRoot },
        {
          materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit,
          cliConnectTimeoutSeconds: 60,
          renderStagedViPreview
        }
      );
      record = result.record;
    }

    const rt = record.runtimeExecution || {};
    evidence.runtimeState = rt.state ?? record.runtimeExecutionState ?? null;
    evidence.reportExists = rt.reportExists === true;
    evidence.failureReason = rt.failureReason ?? null;
    evidence.blockedReason = evidence.blockedReason ?? rt.blockedReason ?? null;
    evidence.pipelineCycles = rt.pipelineCycles ?? null;
    evidence.reportStatus = record.reportStatus;
  } catch (error) {
    evidence.error = error && error.stack ? error.stack : String(error);
    process.stderr.write('[req699-winctr] ERROR ' + evidence.error + '\n');
  }

  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  process.stderr.write(`[req699-winctr] wrote ${outPath}\n`);
  console.log('VIHS_WINCTR_RESULT_JSON ' + JSON.stringify(evidence));

  const runtimeOk = evidence.runtimeState === 'succeeded' && evidence.reportExists;
  if (!runtimeOk && process.env.VIHS_FAIL_ON_RUNTIME_FAILURE === '1') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write('[req699-winctr] FATAL ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
