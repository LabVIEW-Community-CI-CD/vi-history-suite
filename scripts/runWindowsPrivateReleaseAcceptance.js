#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PRIVATE_RELEASE_EVIDENCE_ROOT = path.join(
  DEFAULT_REPO_ROOT,
  'windows-private-release-evidence'
);
const DEFAULT_HOST_ONLY_EVIDENCE_ROOT = path.join(
  DEFAULT_REPO_ROOT,
  'windows-installed-user-host-evidence'
);
const DEFAULT_SETTINGS_ROOT = path.join(
  DEFAULT_REPO_ROOT,
  '.cache',
  'windows-private-release-runner-lane',
  'settings'
);
const DEFAULT_HARNESS_ID = 'HARNESS-VHS-002';
const DEFAULT_SELECTED_HASH = '8741bb08026c104100720c0ef48621e4ab7762fd';
const DEFAULT_BASE_HASH = 'c188cdec606aac3b17d8b17274baa19eef3e4017';
const DEFAULT_RUNTIME_TIMEOUT_MS = 300000;
const DEFAULT_BITNESS = 'x64';
const WINDOWS_HOST_RUNTIME_CLEANUP_FAILURE_SIGNATURE =
  'Windows host runtime cleanup failed; remaining processes:';
const WINDOWS_HOST_RUNTIME_RECOVERY_SCRIPT =
  'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1';
const WINDOWS_HOST_PROOF_RETRY_DELAY_MS = 5000;
const DEFAULT_HOST_SETTINGS_FILE = path.join(DEFAULT_SETTINGS_ROOT, 'host-settings.json');
const DEFAULT_CONTAINER_SETTINGS_FILE = path.join(
  DEFAULT_SETTINGS_ROOT,
  'docker-settings.json'
);

function getUsage() {
  return [
    'Usage: node scripts/runWindowsPrivateReleaseAcceptance.js [--scope <full|host-only>] [--evidence-dir <path>] [--host-settings-file <path>] [--container-settings-file <path>] [--harness-id <id>] [--selected-hash <sha>] [--base-hash <sha>] [--runtime-timeout-ms <ms>] [--help]',
    '',
    'Runs the governed Windows x64 private-release acceptance lane for the',
    'canonical lv_icon.vi compare scenario. The default full scope runs both',
    'host-native and Windows-container providers. The host-only scope runs only',
    'the installed-user host-native provider and does not admit Docker proof.'
  ].join('\n');
}

function parseArgs(argv) {
  let evidenceRoot;
  let evidenceRootProvided = false;
  let hostSettingsFile = DEFAULT_HOST_SETTINGS_FILE;
  let containerSettingsFile = DEFAULT_CONTAINER_SETTINGS_FILE;
  let harnessId = DEFAULT_HARNESS_ID;
  let selectedHash = DEFAULT_SELECTED_HASH;
  let baseHash = DEFAULT_BASE_HASH;
  let runtimeTimeoutMs = DEFAULT_RUNTIME_TIMEOUT_MS;
  let scope = 'full';
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return candidate;
    };

    if (current === '--evidence-dir') {
      evidenceRoot = path.resolve(requireValue('--evidence-dir'));
      evidenceRootProvided = true;
      continue;
    }
    if (current === '--scope') {
      scope = requireValue('--scope');
      if (!['full', 'host-only'].includes(scope)) {
        throw new Error(`Unsupported value for --scope: ${scope}.\n\n${getUsage()}`);
      }
      continue;
    }
    if (current === '--host-settings-file') {
      hostSettingsFile = path.resolve(requireValue('--host-settings-file'));
      continue;
    }
    if (current === '--container-settings-file') {
      containerSettingsFile = path.resolve(requireValue('--container-settings-file'));
      continue;
    }
    if (current === '--harness-id') {
      harnessId = requireValue('--harness-id');
      continue;
    }
    if (current === '--selected-hash') {
      selectedHash = requireValue('--selected-hash');
      continue;
    }
    if (current === '--base-hash') {
      baseHash = requireValue('--base-hash');
      continue;
    }
    if (current === '--runtime-timeout-ms') {
      const candidate = Number.parseInt(requireValue('--runtime-timeout-ms'), 10);
      if (!Number.isFinite(candidate) || candidate < 1) {
        throw new Error(
          `Unsupported value for --runtime-timeout-ms: ${String(candidate)}.\n\n${getUsage()}`
        );
      }
      runtimeTimeoutMs = candidate;
      continue;
    }
    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }
    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  if (!evidenceRootProvided) {
    evidenceRoot =
      scope === 'host-only'
        ? DEFAULT_HOST_ONLY_EVIDENCE_ROOT
        : DEFAULT_PRIVATE_RELEASE_EVIDENCE_ROOT;
  }

  return {
    helpRequested,
    scope,
    repoRoot: DEFAULT_REPO_ROOT,
    evidenceRoot,
    hostSettingsFile,
    containerSettingsFile,
    harnessId,
    selectedHash,
    baseHash,
    runtimeTimeoutMs,
    bitness: DEFAULT_BITNESS
  };
}

function buildWindowsPrivateReleaseAcceptancePlan(options) {
  const nodeExecutable = process.execPath;
  const compiledProofCli = path.join(options.repoRoot, 'out', 'cli', 'runGovernedProof.js');
  const compiledSettingsCli = path.join(
    options.repoRoot,
    'out',
    'tooling',
    'localRuntimeSettingsCli.js'
  );
  const harnessReportRoot = path.join(
    options.repoRoot,
    '.cache',
    'harness-reports',
    options.harnessId
  );

  const buildProofArgs = (executionMode) => [
    compiledProofCli,
    'report-smoke',
    '--harness-id',
    options.harnessId,
    '--selected-hash',
    options.selectedHash,
    '--base-hash',
    options.baseHash,
    '--platform',
    'win32',
    '--execution-mode',
    executionMode,
    '--bitness',
    options.bitness,
    '--runtime-timeout-ms',
    String(options.runtimeTimeoutMs)
  ];

  const lanes = [
    {
      laneId: 'windows-host-native',
      outputRoot: path.join(options.evidenceRoot, 'host'),
      settingsFilePath: options.hostSettingsFile,
      providerRequest: 'host',
      proofExecutionMode: 'host-only',
      transcripts: {
        settingsWrite: 'settings-write.txt',
        proofRun: 'proof-run.txt',
        proofRunPreRecovery: 'proof-run-pre-recovery.txt',
        proofRuntimeRecovery: 'proof-runtime-recovery.txt'
      },
      steps: [
        {
          kind: 'settings-write',
          transcriptFileName: 'settings-write.txt',
          command: nodeExecutable,
          args: [
            compiledSettingsCli,
            '--provider',
            'host',
            '--labview-version',
            '2026',
            '--labview-bitness',
            options.bitness,
            '--settings-file',
            options.hostSettingsFile
          ]
        },
        {
          kind: 'proof-run',
          transcriptFileName: 'proof-run.txt',
          command: nodeExecutable,
          args: buildProofArgs('host-only')
        }
      ]
    }
  ];

  if (options.scope !== 'host-only') {
    lanes.push({
      laneId: 'windows-container',
      outputRoot: path.join(options.evidenceRoot, 'container'),
      settingsFilePath: options.containerSettingsFile,
      providerRequest: 'docker',
      proofExecutionMode: 'docker-only',
      transcripts: {
        settingsWrite: 'settings-write.txt',
        settingsValidate: 'settings-validate.txt',
        proofRun: 'proof-run.txt'
      },
      steps: [
        {
          kind: 'settings-write',
          transcriptFileName: 'settings-write.txt',
          command: nodeExecutable,
          args: [
            compiledSettingsCli,
            '--provider',
            'docker',
            '--labview-version',
            '2026',
            '--labview-bitness',
            options.bitness,
            '--settings-file',
            options.containerSettingsFile
          ]
        },
        {
          kind: 'settings-validate',
          transcriptFileName: 'settings-validate.txt',
          command: nodeExecutable,
          args: [
            compiledSettingsCli,
            '--validate',
            '--settings-file',
            options.containerSettingsFile
          ]
        },
        {
          kind: 'proof-run',
          transcriptFileName: 'proof-run.txt',
          command: nodeExecutable,
          args: buildProofArgs('docker-only')
        }
      ]
    });
  }

  return {
    ...options,
    scope: options.scope ?? 'full',
    nodeExecutable,
    compiledProofCli,
    compiledSettingsCli,
    harnessReportRoot,
    manifestPath: path.join(options.evidenceRoot, 'manifest.json'),
    lanes
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    process.stdout.write(`${getUsage()}\n`);
    return;
  }
  assertWindowsHost();
  const plan = buildWindowsPrivateReleaseAcceptancePlan(options);
  await ensureCompiledSurfaces(plan);
  await fsp.mkdir(plan.evidenceRoot, { recursive: true });

  const laneResults = [];
  for (const lane of plan.lanes) {
    laneResults.push(await runLane(plan, lane));
  }

  const manifest = buildManifest(plan, laneResults);
  await fsp.writeFile(plan.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

function assertWindowsHost() {
  if (process.platform !== 'win32') {
    throw new Error(
      'Windows private-release acceptance is supported only on native Windows hosts.'
    );
  }
}

async function ensureCompiledSurfaces(plan) {
  await Promise.all([
    ensurePathExists(plan.compiledProofCli, 'Run `npm run compile` before the Windows acceptance lane.'),
    ensurePathExists(
      plan.compiledSettingsCli,
      'Run `npm run compile` before the Windows acceptance lane.'
    )
  ]);
}

async function ensurePathExists(candidatePath, guidance) {
  await ensurePathExistsWithFsp(fsp, candidatePath, guidance);
}

async function ensurePathExistsWithFsp(fspImpl, candidatePath, guidance) {
  try {
    await fspImpl.access(candidatePath, fs.constants.F_OK);
  } catch {
    throw new Error(`${candidatePath} is missing. ${guidance}`);
  }
}

async function runLane(plan, lane) {
  await fsp.rm(lane.outputRoot, { recursive: true, force: true });
  await fsp.mkdir(lane.outputRoot, { recursive: true });
  await fsp.mkdir(path.dirname(lane.settingsFilePath), { recursive: true });

  const transcriptPaths = {};
  let boundedRecovery;
  for (const step of lane.steps) {
    if (step.kind === 'proof-run') {
      await fsp.rm(plan.harnessReportRoot, { recursive: true, force: true });
    }

    const stepResult = await runLaneStep(plan, lane, step);
    transcriptPaths[step.kind] = stepResult.transcriptPath;
    if (stepResult.boundedRecovery) {
      boundedRecovery = stepResult.boundedRecovery;
    }
    if (stepResult.recoveryTranscriptPath) {
      transcriptPaths.proofRuntimeRecovery = stepResult.recoveryTranscriptPath;
    }
  }

  await copySettingsFile(lane.settingsFilePath, lane.outputRoot);
  const copiedHarnessReportRoot = path.join(lane.outputRoot, 'harness-report');
  await copyDirectory(plan.harnessReportRoot, copiedHarnessReportRoot);
  const reportJsonPath = path.join(copiedHarnessReportRoot, 'comparison-report-smoke.json');
  const report = JSON.parse(await fsp.readFile(reportJsonPath, 'utf8'));

  return {
    laneId: lane.laneId,
    providerRequest: lane.providerRequest,
    proofExecutionMode: lane.proofExecutionMode,
    settingsFilePath: path.relative(plan.evidenceRoot, path.join(lane.outputRoot, 'settings-file.json')),
    transcripts: transcriptPaths,
    proofAttemptCount: boundedRecovery ? 2 : 1,
    boundedRecovery,
    copiedHarnessReportRoot: path.relative(plan.evidenceRoot, copiedHarnessReportRoot),
    report: {
      generatedAt: report.generatedAt,
      reportStatus: report.reportStatus,
      runtimeExecutionState: report.runtimeExecutionState,
      runtimeProvider: report.runtimeProvider,
      runtimeEngine: report.runtimeEngine,
      runtimeExecutable: report.runtimeExecutable,
      runtimeLabviewIniPath: report.runtimeLabviewIniPath,
      runtimeLabviewTcpPort: report.runtimeLabviewTcpPort,
      generatedReportExists: report.generatedReportExists,
      comparisonReportJson: path.relative(plan.evidenceRoot, reportJsonPath),
      comparisonReportMarkdown: path.relative(
        plan.evidenceRoot,
        path.join(copiedHarnessReportRoot, 'comparison-report-smoke.md')
      ),
      comparisonReportHtml: path.relative(
        plan.evidenceRoot,
        path.join(copiedHarnessReportRoot, 'comparison-report-smoke.html')
      )
    }
  };
}

async function runLaneStep(plan, lane, step, deps = {}) {
  const runCommandImpl = deps.runCommandImpl ?? runCommand;
  const fspImpl = deps.fspImpl ?? fsp;
  const sleepImpl = deps.sleepImpl ?? defaultSleep;
  const transcriptPath = path.join(lane.outputRoot, step.transcriptFileName);

  try {
    runCommandImpl(step.command, step.args, {
      cwd: plan.repoRoot,
      transcriptPath
    });
    return {
      transcriptPath: toPortableRelativePath(plan.evidenceRoot, transcriptPath)
    };
  } catch (error) {
    if (!(await shouldRetryWindowsHostProofStep(lane, step, transcriptPath, { fspImpl }))) {
      throw error;
    }

    const preRecoveryTranscriptName =
      lane.transcripts?.proofRunPreRecovery ?? 'proof-run-pre-recovery.txt';
    const preRecoveryTranscriptPath = path.join(lane.outputRoot, preRecoveryTranscriptName);
    await fspImpl.rm(preRecoveryTranscriptPath, { force: true });
    await fspImpl.rename(transcriptPath, preRecoveryTranscriptPath);
    await fspImpl.rm(plan.harnessReportRoot, { recursive: true, force: true });
    const recoveryTranscriptPath = await runWindowsHostProofRuntimeRecovery(plan, lane, {
      fspImpl,
      runCommandImpl
    });
    await sleepImpl(WINDOWS_HOST_PROOF_RETRY_DELAY_MS);
    runCommandImpl(step.command, step.args, {
      cwd: plan.repoRoot,
      transcriptPath
    });

    return {
      transcriptPath: toPortableRelativePath(plan.evidenceRoot, transcriptPath),
      recoveryTranscriptPath,
      boundedRecovery: {
        attempted: true,
        trigger: 'windows-host-runtime-cleanup-failed',
        recoveryScript: WINDOWS_HOST_RUNTIME_RECOVERY_SCRIPT,
        recoveryTranscript: recoveryTranscriptPath,
        retryDelayMs: WINDOWS_HOST_PROOF_RETRY_DELAY_MS,
        firstFailureTranscript: toPortableRelativePath(plan.evidenceRoot, preRecoveryTranscriptPath)
      }
    };
  }
}

async function runWindowsHostProofRuntimeRecovery(plan, lane, deps = {}) {
  const fspImpl = deps.fspImpl ?? fsp;
  const runCommandImpl = deps.runCommandImpl ?? runCommand;
  const recoveryScriptPath = path.join(
    plan.repoRoot,
    ...WINDOWS_HOST_RUNTIME_RECOVERY_SCRIPT.split('/')
  );
  await ensurePathExistsWithFsp(
    fspImpl,
    recoveryScriptPath,
    'The governed Windows proof runtime recovery script is missing.'
  );

  const recoveryTranscriptName =
    lane.transcripts?.proofRuntimeRecovery ?? 'proof-runtime-recovery.txt';
  const recoveryTranscriptPath = path.join(lane.outputRoot, recoveryTranscriptName);
  runCommandImpl(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-File', recoveryScriptPath],
    {
      cwd: plan.repoRoot,
      transcriptPath: recoveryTranscriptPath
    }
  );

  return toPortableRelativePath(plan.evidenceRoot, recoveryTranscriptPath);
}

async function shouldRetryWindowsHostProofStep(
  lane,
  step,
  transcriptPath,
  deps = {}
) {
  if (lane.laneId !== 'windows-host-native' || step.kind !== 'proof-run') {
    return false;
  }

  const fspImpl = deps.fspImpl ?? fsp;
  let transcriptText = '';
  try {
    transcriptText = await fspImpl.readFile(transcriptPath, 'utf8');
  } catch {
    return false;
  }

  return transcriptText.replace(/\s+/gu, ' ').includes(WINDOWS_HOST_RUNTIME_CLEANUP_FAILURE_SIGNATURE);
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const transcriptLines = [`$ ${formatCommand(command, args)}`, ''];
  if (result.stdout) {
    transcriptLines.push(result.stdout.replace(/\r?\n$/, ''));
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    transcriptLines.push(result.stderr.replace(/\r?\n$/, ''));
    process.stderr.write(result.stderr);
  }
  fs.writeFileSync(
    options.transcriptPath,
    `${transcriptLines.filter((line) => line.length > 0).join('\n')}\n`,
    'utf8'
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${String(result.status)}: ${formatCommand(command, args)}`
    );
  }
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteCommandSegment).join(' ');
}

function quoteCommandSegment(segment) {
  if (/[\s"]/u.test(segment) || /^[A-Za-z]:\\/u.test(segment)) {
    return `"${String(segment).replace(/"/g, '\\"')}"`;
  }
  return String(segment);
}

function toPortableLeafName(candidatePath) {
  return path.posix.basename(String(candidatePath).replace(/\\/g, '/'));
}

function toPortableRelativePath(rootPath, candidatePath) {
  return path.relative(rootPath, candidatePath).replace(/\\/g, '/');
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function copySettingsFile(sourcePath, laneRoot) {
  await fsp.copyFile(sourcePath, path.join(laneRoot, 'settings-file.json'));
}

async function copyDirectory(sourceRoot, destinationRoot) {
  await ensurePathExists(sourceRoot, 'The governed harness report root was not produced.');
  await fsp.mkdir(destinationRoot, { recursive: true });
  const entries = await fsp.readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }
    await fsp.copyFile(sourcePath, destinationPath);
  }
}

function buildManifest(plan, laneResults) {
  const scope = plan.scope ?? 'full';
  const isHostOnly = scope === 'host-only';

  return {
    schema: isHostOnly
      ? 'vi-history-suite/windows-installed-user-host-acceptance@v1'
      : 'vi-history-suite/windows-private-release-acceptance@v1',
    generatedAt: new Date().toISOString(),
    jobName: isHostOnly
      ? 'windows_installed_user_host_acceptance'
      : 'windows_private_release_acceptance',
    governedScript: 'scripts/runWindowsPrivateReleaseAcceptance.js',
    scope,
    claimScope: isHostOnly
      ? 'installed-user-host-labview-2026-x64'
      : 'windows-private-release-host-and-container-x64',
    dockerProofIncluded: !isHostOnly,
    harnessId: plan.harnessId,
    selectedHash: plan.selectedHash,
    baseHash: plan.baseHash,
    runtimeTimeoutMs: plan.runtimeTimeoutMs,
    evidenceRoot: toPortableLeafName(plan.evidenceRoot),
    lanes: laneResults
  };
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  buildWindowsPrivateReleaseAcceptancePlan,
  buildManifest,
  formatCommand,
  toPortableLeafName,
  runLaneStep,
  shouldRetryWindowsHostProofStep,
  runWindowsHostProofRuntimeRecovery
};
