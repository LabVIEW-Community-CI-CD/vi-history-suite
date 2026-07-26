// Windows comparison-runtime validation driver (maintainer real-hardware run).
//
// Drives a real CreateComparisonReport on a Windows host through the four
// vscode-free reporting primitives, for either the host-native or the
// windows-container provider. Mirrors the Linux validation drivers but targets
// platform 'win32', sets requireVersionAndBitness, and passes a CLI connect
// timeout so the VHS-REQ-148 LabVIEWCLI.ini connect-window hardening engages on
// the host-native + labview-cli path. Maintainer evidence tool for issue #296
// (the Windows sibling of #259); not shipped in the extension and not a CI gate.
//
// Run from the repo root AFTER `npm run compile` (it loads ./out):
//   node scripts/windows-compare-driver.cjs
//
// Configure via env vars:
//   WIN_REPO_ROOT      Absolute path to a Git repo containing a tracked .vi
//                      (e.g. C:\repos\ni\labview-icon-editor)
//   WIN_VI_PATH        Repo-relative path of the VI to compare
//                      (e.g. resource/plugins/lv_icon.vi)
//   WIN_BASE           Base (older) revision (short or full SHA)
//   WIN_SELECTED       Selected (newer) revision (short or full SHA)
//   WIN_PROVIDER       'host' (host-native) or 'docker' (windows-container)
//   WIN_LV_VERSION     '2025' or '2026'        (default 2026)
//   WIN_LV_BITNESS     'x86' or 'x64'          (default x64; docker requires x64)
//   WIN_CONTAINER_IMAGE  optional override (default nationalinstruments/labview:2026q1-windows)
//   WIN_LABEL          evidence label (default W-run)
//   WIN_STORAGE_ROOT   storage root (default <cwd>\win-validation\<label>\storage)
//
// VHS-REQ-665: to drive host-native LabVIEW headlessly from a NON-interactive
// session (e.g. a Vagrant WinRM session with no desktop), set the opt-in toggle
// so the runtime prelaunches LabVIEW `--headless` before the CLI connects:
//   $env:LV_RTE_WIN_HOSTNATIVE_HEADLESS='1'
// Combine with WIN_PROVIDER='host' + WIN_LV_BITNESS='x86' to exercise 32-bit
// LabVIEW 2026 parity, the bitness the x64-only windows-container cannot cover.
//
// Example (PowerShell), host-native x64:
//   $env:WIN_REPO_ROOT='C:\repos\ni\labview-icon-editor'
//   $env:WIN_VI_PATH='resource/plugins/lv_icon.vi'
//   $env:WIN_BASE='5376833'; $env:WIN_SELECTED='fc09736'
//   $env:WIN_PROVIDER='host'; $env:WIN_LV_VERSION='2026'; $env:WIN_LV_BITNESS='x64'
//   $env:WIN_LABEL='WB-host-x64'
//   node scripts/windows-compare-driver.cjs

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

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value.trim();
}

async function main() {
  const repoRoot = requireEnv('WIN_REPO_ROOT');
  const relativePath = requireEnv('WIN_VI_PATH');
  const baseHash = requireEnv('WIN_BASE');
  const selectedHash = requireEnv('WIN_SELECTED');
  const provider = (process.env.WIN_PROVIDER || 'host').toLowerCase() === 'docker' ? 'docker' : 'host';
  const labviewVersion = process.env.WIN_LV_VERSION || '2026';
  const bitness = (process.env.WIN_LV_BITNESS || 'x64').toLowerCase() === 'x86' ? 'x86' : 'x64';
  const windowsContainerImage =
    process.env.WIN_CONTAINER_IMAGE || 'nationalinstruments/labview:2026q1-windows';
  const label = process.env.WIN_LABEL || 'W-run';
  const storageRoot =
    process.env.WIN_STORAGE_ROOT || path.join(process.cwd(), 'win-validation', label, 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  if (provider === 'docker' && bitness === 'x86') {
    process.stderr.write('[win] NOTE: the docker/windows-container provider requires x64; the locator will block x86.\n');
  }

  const runtimeSelection = await locateComparisonRuntime('win32', {
    requestedProvider: provider,
    requireVersionAndBitness: true,
    labviewVersion,
    bitness,
    windowsContainerImage
  });
  process.stderr.write(
    `[win] provider=${runtimeSelection.provider} engine=${runtimeSelection.engine ?? 'none'} ` +
      `blocked=${runtimeSelection.blockedReason ?? 'none'} ` +
      `hostBitnessObserved=${runtimeSelection.hostObservedLabviewBitness ?? 'n/a'} ` +
      `hostConflict=${runtimeSelection.hostRuntimeConflictDetected ?? false} ` +
      `image=${runtimeSelection.containerImage ?? 'n/a'}\n`
  );

  const preflight = await preflightComparisonReportRevisions({
    repoRoot,
    relativePath,
    leftRevisionId: baseHash,
    rightRevisionId: selectedHash
  });
  process.stderr.write(
    `[win] preflight ready=${preflight.ready} blocked=${preflight.blockedReason ?? 'none'}\n`
  );

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

  let result = packet;
  let record = packet.record;
  if (record.reportStatus === 'ready-for-runtime') {
    process.stderr.write('[win] executing comparison (launches LabVIEW / container)...\n');
    result = await executeComparisonReport(
      { record, repositoryRoot: repoRoot },
      {
        materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit,
        // VHS-REQ-148: engages LabVIEWCLI.ini connect-window hardening on the
        // win32 host-native + labview-cli path.
        cliConnectTimeoutSeconds: 60
      }
    );
    record = result.record;
  }

  const rt = record.runtimeExecution || {};
  const out = {
    label,
    requestedProvider: provider,
    provider: runtimeSelection.provider,
    engine: runtimeSelection.engine ?? null,
    bitness,
    labviewVersion,
    selectionBlockedReason: runtimeSelection.blockedReason ?? null,
    hostObservedLabviewBitness: runtimeSelection.hostObservedLabviewBitness ?? null,
    hostRuntimeConflictDetected: runtimeSelection.hostRuntimeConflictDetected ?? null,
    reportStatus: record.reportStatus,
    runtimeState: rt.state ?? null,
    reportExists: rt.reportExists === true,
    failureReason: rt.failureReason ?? null,
    blockedReason: rt.blockedReason ?? null,
    diagnosticReason: rt.diagnosticReason ?? null,
    cliConnectTimeoutHardening: rt.cliConnectTimeoutHardening ?? null,
    materializedTree: rt.materializedTree ?? null,
    runDir: record.artifactPlan ? record.artifactPlan.reportDirectory : null,
    reportFilePath: result.reportFilePath ?? null,
    metadataFilePath: result.metadataFilePath ?? null,
    leftStaged: record.stagedRevisionPlan ? record.stagedRevisionPlan.leftFilePath : null,
    rightStaged: record.stagedRevisionPlan ? record.stagedRevisionPlan.rightFilePath : null,
    relativeDirectory: record.stagedRevisionPlan ? record.stagedRevisionPlan.relativeDirectory : null
  };
  console.log('VIHS_RESULT_JSON ' + JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write('[win] ERROR ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
