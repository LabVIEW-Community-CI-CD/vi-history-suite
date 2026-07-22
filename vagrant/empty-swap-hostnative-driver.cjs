// #2295 feasibility spike (gated ML research track, governed by ADR-0027):
// Windows HOST-NATIVE guest driver that runs a single real CreateComparisonReport
// for one corpus case and reports its typed runtime outcome.
//
// WHY: the empty->rich comparison failed on the Docker Linux container with
// diagnosticReason `linux-headless-recursive-load`, a classification GATED to
// Linux + headless (see src/reporting/comparisonReportRuntimeExecution.ts and
// src/reporting/runtime/linuxHeadlessPredicates.ts). This driver reruns the same
// comparison on the host-native Windows LabVIEW runtime (requestedProvider:'host')
// to determine whether that blocker is a Linux-headless ENVIRONMENT artifact
// (would succeed here) or an INTRINSIC empty->rich asymmetry (would still fail,
// surfacing the platform-independent `labview-cli-call-by-reference` Error-66
// classifier in src/reporting/runtime/labviewCliDiagnostics.ts).
//
// Runs INSIDE the Vagrant Windows LabVIEW 2026 guest against the compiled out/
// over the synced C:\vihs-workspace, driving the shipped comparison primitives
// exactly as the extension does (no blob injection: it compares two REAL git
// revisions of one tracked path, so the shipped preflight + git materializer run
// unmodified). One case per invocation; the host wrapper
// (scripts/vagrantEmptySwapSpike.cjs) runs the full matrix.
//
// Because WinRM buffers stdout until exit, this driver writes an append-only
// NDJSON progress log and writes its result JSON guest-local (avoids a stale
// synced-folder read). Not shipped, not in npm test; mapped to VHS-REQ-706 / #2295.
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

async function main() {
  // The git-swap corpus repo the host wrapper prepared: one tracked path with two
  // real commits (e.g. base = empty.vi bytes, head = rich lv_icon.vi bytes).
  const repoRoot = process.env.WIN_ICON_REPO || 'C:\\repos\\labview-icon-editor';
  const relativePath = process.env.WIN_VI_PATH || 'resource/plugins/lv_icon.vi';
  const baseHash = process.env.WIN_BASE || '';
  const selectedHash = process.env.WIN_SELECTED || '';
  const caseLabel = process.env.CASE_LABEL || 'empty-swap-case';
  const outDir = process.env.VIHS_WIN_OUT || 'C:\\vihs-proof-tmp';
  const storageRoot = path.join(outDir, 'empty-swap-hostnative', caseLabel, 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  const progress = createProgressLog(path.join(outDir, `empty-swap-${caseLabel}-progress.ndjson`));
  progress.heartbeat(5000);

  if (!baseHash || !selectedHash) {
    throw new Error('WIN_BASE and WIN_SELECTED (real git revisions of the corpus path) are required.');
  }

  // Force host-native: requestedProvider:'host' -> host-only execution mode, so
  // this never enters the Linux-headless capture path. The headless-vs-interactive
  // axis is controlled by LV_RTE_WIN_HOSTNATIVE_HEADLESS in the environment (the
  // runtime reads it); the host wrapper sets it per case.
  const runtimeSelection = await locateComparisonRuntime('win32', {
    requestedProvider: 'host',
    labviewVersion: process.env.WIN_LV_VERSION || '2026',
    bitness: process.env.WIN_LV_BITNESS || 'x86',
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

  let result = packet;
  let record = packet.record;
  if (record.reportStatus === 'ready-for-runtime') {
    progress.emit('comparison-start');
    result = await executeComparisonReport(
      { record, repositoryRoot: repoRoot },
      {
        materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit,
        cliConnectTimeoutSeconds: 60
      }
    );
    record = result.record;
    progress.emit('comparison-end', {
      runtimeState: (record.runtimeExecution || {}).state ?? null,
      reportExists: (record.runtimeExecution || {}).reportExists === true
    });
  }

  progress.stop();

  const rt = record.runtimeExecution || {};
  const out = {
    label: caseLabel,
    headless: process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS === '1',
    provider: runtimeSelection.provider,
    engine: runtimeSelection.engine,
    bitness: process.env.WIN_LV_BITNESS || 'x86',
    reportStatus: record.reportStatus,
    runtimeState: rt.state ?? null,
    reportExists: rt.reportExists === true,
    failureReason: rt.failureReason ?? null,
    diagnosticReason: rt.diagnosticReason ?? null,
    reportFilePath: result.reportFilePath ?? null
  };
  const proofPath = path.join(outDir, `empty-swap-${caseLabel}-result.json`);
  fs.writeFileSync(proofPath, JSON.stringify(out, null, 2));
  progress.emit('result-written', { proofPath, runtimeState: out.runtimeState });
  console.log('VIHS_SPIKE_RESULT_JSON ' + JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write('[empty-swap-hostnative] ERROR ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
