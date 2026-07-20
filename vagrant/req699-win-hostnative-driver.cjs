// VHS-REQ-699: Windows host-native guest driver for the single-pass comparison-
// preview pipeline (explicit typed states), INSTRUMENTED for granular follow.
//
// Runs INSIDE the Vagrant Windows LabVIEW 2026 guest against the compiled out/
// over the synced C:\vihs-workspace, wiring the always-on staged-VI preview
// validator and printing the retained per-state pipelineCycles evidence.
//
// Because WinRM buffers stdout until exit, this driver writes an append-only
// NDJSON progress log (default C:\vihs-proof-tmp\req699-win-progress.ndjson) with
// a heartbeat, so a separate WinRM session can tail it and follow each state
// (STAGING / PREVIEW_LEFT / PREVIEW_RIGHT / VALIDATION / COMPARISON / UNSTAGING)
// live. The final result JSON is written guest-local (avoids the stale synced-
// folder read after a host-side rm). Not shipped, not in npm test.
const path = require('node:path');
const fs = require('node:fs');
const { createProgressLog } = require(path.join(__dirname, 'lib', 'guestProgress.cjs'));

const REPO = process.env.VIHS_WIN_REPO_ROOT || 'C:\\vihs-workspace';
const OUT = path.join(REPO, 'out', 'reporting');
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

async function main() {
  const repoRoot = process.env.WIN_ICON_REPO || 'C:\\repos\\labview-icon-editor';
  const relativePath = process.env.WIN_VI_PATH || 'resource/plugins/lv_icon.vi';
  const baseHash = process.env.WIN_BASE || '537683398d8c5cb73533603b5c06b6eef62a6ac8';
  const selectedHash = process.env.WIN_SELECTED || 'fc09736ae5e38c2016de081a9c8686256c9f2f9c';
  const outDir = process.env.VIHS_WIN_OUT || 'C:\\vihs-proof-tmp';
  const storageRoot = path.join(outDir, 'req699-win-hostnative', 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  const progress = createProgressLog(path.join(outDir, 'req699-win-progress.ndjson'));
  progress.heartbeat(5000);

  const runtimeSelection = await locateComparisonRuntime('win32', {
    requestedProvider: 'host',
    labviewVersion: process.env.WIN_LV_VERSION || '2026',
    bitness: process.env.WIN_LV_BITNESS || 'x64',
    requireVersionAndBitness: true
  });
  progress.emit('runtime-resolved', {
    provider: runtimeSelection.provider,
    engine: runtimeSelection.engine,
    blocked: runtimeSelection.blockedReason ?? null
  });

  const preflight = await preflightComparisonReportRevisions({
    repoRoot,
    relativePath,
    leftRevisionId: baseHash,
    rightRevisionId: selectedHash
  });
  progress.emit('preflight', { ready: preflight.ready, blocked: preflight.blockedReason ?? null });

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
  progress.emit('packet-persisted', { reportStatus: packet.record.reportStatus });

  const operationDirectory = path.join(REPO, 'resources', 'labview-cli-operations');
  // Wrap the real validator so each preview cycle emits start/end progress with
  // its side and outcome. STAGING/VALIDATION/UNSTAGING are near-instant; the
  // COMPARISON cycle boundary is marked by the gap after preview-right-end.
  const realValidator = buildStagedViPreviewValidator({ operationDirectory });
  const renderStagedViPreview = async (input) => {
    progress.emit('preview-start', { side: input.side, viFilePath: input.viFilePath });
    const started = Date.now();
    try {
      const result = await realValidator(input);
      progress.emit('preview-end', {
        side: input.side,
        rendered: result.rendered === true,
        failureReason: result.failureReason ?? null,
        durationMs: Date.now() - started
      });
      return result;
    } catch (error) {
      progress.emit('preview-error', {
        side: input.side,
        message: error && error.message ? error.message : String(error),
        durationMs: Date.now() - started
      });
      throw error;
    }
  };

  let result = packet;
  let record = packet.record;
  if (record.reportStatus === 'ready-for-runtime') {
    progress.emit('pipeline-start');
    result = await executeComparisonReport(
      { record, repositoryRoot: repoRoot },
      {
        materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit,
        cliConnectTimeoutSeconds: 60,
        renderStagedViPreview
      }
    );
    record = result.record;
    progress.emit('pipeline-end', {
      runtimeState: (record.runtimeExecution || {}).state ?? null,
      reportExists: (record.runtimeExecution || {}).reportExists === true
    });
  }

  progress.stop();

  const rt = record.runtimeExecution || {};
  const out = {
    label: 'req699-win-hostnative',
    provider: runtimeSelection.provider,
    engine: runtimeSelection.engine,
    reportStatus: record.reportStatus,
    runtimeExecutionState: record.runtimeExecutionState,
    runtimeState: rt.state,
    reportExists: rt.reportExists === true,
    failureReason: rt.failureReason ?? null,
    diagnosticReason: rt.diagnosticReason ?? null,
    pipelineCycles: rt.pipelineCycles ?? null
  };
  const proofPath = path.join(outDir, 'req699-win-result.json');
  fs.writeFileSync(proofPath, JSON.stringify(out, null, 2));
  progress.emit('result-written', { proofPath, runtimeState: out.runtimeState });
  console.log('VIHS_WIN_RESULT_JSON ' + JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write('[req699-win] ERROR ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
