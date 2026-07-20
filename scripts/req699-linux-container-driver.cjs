// VHS-REQ-699: HOSTED-CI + LOCAL Linux-container driver for the single-pass
// comparison-preview pipeline. Gives PARITY between the GitHub-HOSTED Linux
// runner and the LOCAL Linux Docker container: the SAME driver, the SAME NI
// LabVIEW Linux image, and the SAME linux-container provider produce the SAME
// six pipeline states (STAGING / PREVIEW_LEFT / PREVIEW_RIGHT / VALIDATION /
// COMPARISON / UNSTAGING), so a hosted signal and a local run are directly
// comparable.
//
// Wires the always-on staged-VI preview validator and writes a schema-tagged
// evidence JSON the workflow (or a local run) can inspect/upload. Best-effort:
// pulling/running the multi-GB NI image may fail (size, licensing) on a hosted
// runner; the driver captures the outcome as EVIDENCE and exits 0 by default so
// the workflow always publishes a signal (pass VIHS_FAIL_ON_RUNTIME_FAILURE=1 to
// make a runtime failure fail the job).
//
// Run from the repo root AFTER `npm run compile` (loads ./out). Env:
//   LIN_REPO_ROOT      fixture Git repo (default /home/runner/labview-icon-editor)
//   LIN_VI_PATH        repo-relative VI (default resource/plugins/lv_icon.vi)
//   LIN_BASE / LIN_SELECTED   fixture revisions (defaults = icon-editor pair)
//   LIN_CONTAINER_IMAGE       default nationalinstruments/labview:2026q1-linux
//   LIN_LV_VERSION            default 2026
//   VIHS_OUT                  evidence JSON path (default req699-linux-container-evidence.json)
//   VIHS_FAIL_ON_RUNTIME_FAILURE  '1' -> nonzero exit on runtime failure
//   TMPDIR                    set under $HOME for snap-docker bind-mount visibility
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

const SCHEMA = 'vi-history-suite/req699-linux-container-evidence@v1';

async function main() {
  const repoRoot = process.env.LIN_REPO_ROOT || path.join(process.env.HOME || '/home/runner', 'labview-icon-editor');
  const relativePath = process.env.LIN_VI_PATH || 'resource/plugins/lv_icon.vi';
  const baseHash = process.env.LIN_BASE || '537683398d8c5cb73533603b5c06b6eef62a6ac8';
  const selectedHash = process.env.LIN_SELECTED || 'fc09736ae5e38c2016de081a9c8686256c9f2f9c';
  const containerImage = process.env.LIN_CONTAINER_IMAGE || 'nationalinstruments/labview:2026q1-linux';
  const outPath = process.env.VIHS_OUT || path.join(process.cwd(), 'req699-linux-container-evidence.json');
  const storageRoot = path.join(process.cwd(), 'lin-validation', 'req699-linux-container', 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  const evidence = {
    $schema: SCHEMA,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: 'linux-container',
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
    const runtimeSelection = await locateComparisonRuntime('linux', {
      requestedProvider: 'docker',
      labviewVersion: process.env.LIN_LV_VERSION || '2026',
      bitness: 'x64',
      linuxContainerImage: containerImage
    });
    evidence.provider = runtimeSelection.provider;
    evidence.blockedReason = runtimeSelection.blockedReason ?? null;
    process.stderr.write(
      `[req699-linctr] provider=${runtimeSelection.provider} engine=${runtimeSelection.engine} ` +
        `blocked=${runtimeSelection.blockedReason ?? 'none'} image=${runtimeSelection.containerImage ?? containerImage}\n`
    );

    const preflight = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId: baseHash,
      rightRevisionId: selectedHash
    });
    process.stderr.write(`[req699-linctr] preflight ready=${preflight.ready} blocked=${preflight.blockedReason ?? 'none'}\n`);

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
      process.stderr.write('[req699-linctr] executing single-pass pipeline (previews + linux-container compare)...\n');
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
    process.stderr.write('[req699-linctr] ERROR ' + evidence.error + '\n');
  }

  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  process.stderr.write(`[req699-linctr] wrote ${outPath}\n`);
  console.log('VIHS_LINCTR_RESULT_JSON ' + JSON.stringify(evidence));

  const runtimeOk = evidence.runtimeState === 'succeeded' && evidence.reportExists;
  if (!runtimeOk && process.env.VIHS_FAIL_ON_RUNTIME_FAILURE === '1') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write('[req699-linctr] FATAL ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
