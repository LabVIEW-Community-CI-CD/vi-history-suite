#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_EVIDENCE_ROOT = path.join(
  DEFAULT_REPO_ROOT,
  '.cache',
  'windows-proof-runtime-recovery-rehearsal'
);
const DEFAULT_LABVIEW_VERSION = '2026';
const DEFAULT_LABVIEW_BITNESS = 'x64';
const DEFAULT_SEED_TIMEOUT_MS = 15000;
const DEFAULT_SEED_POLL_INTERVAL_MS = 500;
const WINDOWS_PROOF_RUNTIME_RECOVERY_SCRIPT =
  'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1';

function getUsage() {
  return [
    'Usage: node scripts/runWindowsProofRuntimeRecoveryRehearsal.js [--evidence-dir <path>] [--labview-version <major>] [--labview-bitness <x86|x64>] [--labview-exe-path <path>] [--help]',
    '',
    'Runs a governed Windows-only rehearsal of the proof-runtime recovery surface.',
    'The host must start clean. The rehearsal seeds one headless LabVIEW session,',
    'runs the repo-owned recovery script, retains a receipt plus transcript, and',
    'fails closed if the host does not return to a clean runtime surface.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    repoRoot: DEFAULT_REPO_ROOT,
    evidenceRoot: DEFAULT_EVIDENCE_ROOT,
    labviewVersion: DEFAULT_LABVIEW_VERSION,
    labviewBitness: DEFAULT_LABVIEW_BITNESS,
    labviewExePath: undefined
  };

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

    if (current === '--help' || current === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceRoot = path.resolve(requireValue('--evidence-dir'));
      continue;
    }
    if (current === '--labview-version') {
      parsed.labviewVersion = requireValue('--labview-version');
      continue;
    }
    if (current === '--labview-bitness') {
      const candidate = requireValue('--labview-bitness');
      if (!['x86', 'x64'].includes(candidate)) {
        throw new Error(`Unsupported --labview-bitness value: ${candidate}.\n\n${getUsage()}`);
      }
      parsed.labviewBitness = candidate;
      continue;
    }
    if (current === '--labview-exe-path') {
      parsed.labviewExePath = path.resolve(requireValue('--labview-exe-path'));
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return parsed;
}

function buildRehearsalPlan(options, deps = {}) {
  const generatedAt = (deps.nowIso ?? defaultNowIso)();
  const evidenceRunDirectory = path.join(options.evidenceRoot, buildTimestampSlug(generatedAt));
  return {
    ...options,
    generatedAt,
    evidenceRunDirectory,
    receiptPath: path.join(evidenceRunDirectory, 'recovery-rehearsal.json'),
    latestReceiptPath: path.join(options.evidenceRoot, 'latest.json'),
    recoveryTranscriptPath: path.join(evidenceRunDirectory, 'proof-runtime-recovery.txt')
  };
}

async function runRecoveryRehearsal(plan, deps = {}) {
  assertWindowsHost(deps.platform ?? process.platform);

  const fspImpl = deps.fspImpl ?? fsp;
  const inspectHostRuntimeSurface =
    deps.inspectHostRuntimeSurface ?? (await loadWindowsHostRuntimeInspect(plan.repoRoot));
  const launchHeadlessLabview =
    deps.launchHeadlessLabview ?? (await loadWindowsHeadlessLaunch(plan.repoRoot));
  const locateRuntime = deps.locateRuntime ?? (await loadRuntimeLocator(plan.repoRoot));
  const sleepImpl = deps.sleepImpl ?? defaultSleep;

  await fspImpl.mkdir(plan.evidenceRunDirectory, { recursive: true });

  let currentSurface;
  let recoveryAttempted = false;
  try {
    const preflightSurface = await inspectHostRuntimeSurface();
    currentSurface = preflightSurface;
    assertCleanHostRuntimeSurface(
      preflightSurface,
      'Windows proof runtime recovery rehearsal requires a clean host runtime surface before seeding contamination.'
    );

    const labviewExePath = await resolveLabviewExePath(plan, locateRuntime, deps, fspImpl);
    const seedProcessId = await launchHeadlessLabview(labviewExePath);
    const seededSurface = await waitForRuntimeContaminationSeed(
      inspectHostRuntimeSurface,
      {
        timeoutMs: deps.seedTimeoutMs ?? DEFAULT_SEED_TIMEOUT_MS,
        pollIntervalMs: deps.seedPollIntervalMs ?? DEFAULT_SEED_POLL_INTERVAL_MS,
        sleepImpl
      }
    );
    currentSurface = seededSurface;

    const recovery = await runRecoveryScript(plan, deps);
    recoveryAttempted = true;
    const postRecoverySurface = await inspectHostRuntimeSurface();
    currentSurface = postRecoverySurface;
    assertCleanHostRuntimeSurface(
      postRecoverySurface,
      'Windows proof runtime recovery rehearsal did not restore a clean host runtime surface.'
    );

    const receipt = {
      schema: 'vi-history-suite/windows-proof-runtime-recovery-rehearsal@v1',
      generatedAt: plan.generatedAt,
      governedScript: 'scripts/runWindowsProofRuntimeRecoveryRehearsal.js',
      governedRecoveryScript: WINDOWS_PROOF_RUNTIME_RECOVERY_SCRIPT,
      rehearsalRoot: toPortableRelativePath(plan.repoRoot, plan.evidenceRoot),
      evidenceRoot: toPortableRelativePath(plan.repoRoot, plan.evidenceRunDirectory),
      latestReceiptPath: toPortableRelativePath(plan.repoRoot, plan.latestReceiptPath),
      requestedLabviewVersion: plan.labviewVersion,
      requestedLabviewBitness: plan.labviewBitness,
      resolvedLabviewExePath: labviewExePath,
      contaminationSeed: {
        mode: 'headless-labview-launch',
        launchArguments: ['--headless'],
        launchedProcessId: seedProcessId
      },
      preflightSurface,
      seededSurface,
      recovery,
      postRecoverySurface,
      status: 'recovered'
    };

    await fspImpl.writeFile(plan.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await fspImpl.writeFile(plan.latestReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    return receipt;
  } catch (error) {
    if (currentSurface?.processes?.length && !recoveryAttempted) {
      try {
        await runRecoveryScript(plan, deps);
      } catch {
      }
    }
    throw error;
  }
}

async function resolveLabviewExePath(plan, locateRuntime, deps, fspImpl = fsp) {
  if (plan.labviewExePath) {
    await ensurePathExistsWithFsp(
      fspImpl,
      plan.labviewExePath,
      'The requested LabVIEW executable path is missing.'
    );
    return plan.labviewExePath;
  }

  const selection = await locateRuntime(
    'win32',
    {
      executionMode: 'host-only',
      requireVersionAndBitness: true,
      requestedProvider: 'host',
      labviewVersion: plan.labviewVersion,
      bitness: plan.labviewBitness
    },
    deps.runtimeLocatorDeps ?? {}
  );

  if (selection.provider !== 'host-native' || !selection.labviewExe?.path) {
    const notes = Array.isArray(selection.notes) && selection.notes.length > 0
      ? ` ${selection.notes.join(' ')}`
      : '';
    throw new Error(
      `Could not resolve a governed host-native LabVIEW executable for version ${plan.labviewVersion} ${plan.labviewBitness}.${notes}`.trim()
    );
  }

  await ensurePathExistsWithFsp(
    fspImpl,
    selection.labviewExe.path,
    'The resolved governed LabVIEW executable is missing.'
  );
  return selection.labviewExe.path;
}

async function waitForRuntimeContaminationSeed(
  inspectHostRuntimeSurface,
  options
) {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() <= deadline) {
    const snapshot = await inspectHostRuntimeSurface();
    if (snapshot.processes.length > 0) {
      return snapshot;
    }
    await options.sleepImpl(options.pollIntervalMs);
  }

  throw new Error(
    'Windows proof runtime recovery rehearsal did not observe the seeded LabVIEW contamination before timeout.'
  );
}

async function runRecoveryScript(plan, deps = {}) {
  const fspImpl = deps.fspImpl ?? fsp;
  const runProcessImpl = deps.runProcessImpl ?? runProcess;
  const recoveryScriptPath = path.join(
    plan.repoRoot,
    ...WINDOWS_PROOF_RUNTIME_RECOVERY_SCRIPT.split('/')
  );
  await ensurePathExistsWithFsp(
    fspImpl,
    recoveryScriptPath,
    'The governed Windows proof runtime recovery script is missing.'
  );

  const command = 'powershell.exe';
  const args = ['-NoLogo', '-NoProfile', '-File', recoveryScriptPath];
  const result = runProcessImpl(command, args, {
    cwd: plan.repoRoot
  });
  const transcriptLines = [`$ ${formatCommand(command, args)}`, ''];
  if (result.stdout) {
    transcriptLines.push(String(result.stdout).replace(/\r?\n$/, ''));
  }
  if (result.stderr) {
    transcriptLines.push(String(result.stderr).replace(/\r?\n$/, ''));
  }
  await fspImpl.writeFile(
    plan.recoveryTranscriptPath,
    `${transcriptLines.filter((line) => line.length > 0).join('\n')}\n`,
    'utf8'
  );

  ensureProcessSucceeded(result, formatCommand(command, args));
  const parsed = parseJsonOutput(result.stdout, 'Windows proof runtime recovery rehearsal');
  return {
    script: WINDOWS_PROOF_RUNTIME_RECOVERY_SCRIPT,
    transcriptPath: toPortableRelativePath(plan.repoRoot, plan.recoveryTranscriptPath),
    status: parsed.status,
    attemptCount: parsed.attemptCount,
    terminationStrategy: parsed.terminationStrategy,
    remainingProcesses: parsed.remainingProcesses
  };
}

function assertWindowsHost(platform) {
  if (platform !== 'win32') {
    throw new Error('Windows proof runtime recovery rehearsal requires a native Windows host.');
  }
}

function assertCleanHostRuntimeSurface(snapshot, messagePrefix) {
  if (!snapshot.processes.length) {
    return;
  }

  throw new Error(`${messagePrefix} Remaining processes: ${summarizeRuntimeProcesses(snapshot)}.`);
}

function summarizeRuntimeProcesses(snapshot) {
  return snapshot.processes
    .map((record) => `${record.processName} (${record.pid})`)
    .join(', ');
}

async function ensurePathExistsWithFsp(fspImpl, candidatePath, guidance) {
  try {
    await fspImpl.access(candidatePath, fs.constants.F_OK);
  } catch {
    throw new Error(`${candidatePath} is missing. ${guidance}`);
  }
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error
  };
}

function ensureProcessSucceeded(result, commandSummary) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${String(result.status)}: ${commandSummary}\n${(result.stderr || result.stdout || '').trim()}`
    );
  }
}

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(String(stdout).trim());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${label} JSON output: ${reason}`);
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

function buildTimestampSlug(isoText) {
  return String(isoText).replace(/[:.]/g, '-');
}

function toPortableRelativePath(rootPath, candidatePath) {
  return path.relative(rootPath, candidatePath).replace(/\\/g, '/');
}

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function loadRuntimeLocator(repoRoot) {
  const modulePath = path.join(repoRoot, 'out', 'reporting', 'comparisonRuntimeLocator.js');
  await ensurePathExistsWithFsp(
    fsp,
    modulePath,
    'Run `npm run compile` before the recovery rehearsal.'
  );
  return require(modulePath).locateComparisonRuntime;
}

async function loadWindowsHostRuntimeInspect(repoRoot) {
  const modulePath = path.join(repoRoot, 'out', 'cli', 'windowsHostRuntimeSurface.js');
  await ensurePathExistsWithFsp(
    fsp,
    modulePath,
    'Run `npm run compile` before the recovery rehearsal.'
  );
  return require(modulePath).inspectWindowsHostRuntimeSurface;
}

async function loadWindowsHeadlessLaunch(repoRoot) {
  const modulePath = path.join(repoRoot, 'out', 'cli', 'windowsHostRuntimeSurface.js');
  await ensurePathExistsWithFsp(
    fsp,
    modulePath,
    'Run `npm run compile` before the recovery rehearsal.'
  );
  return require(modulePath).launchWindowsHeadlessLabview;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    process.stdout.write(`${getUsage()}\n`);
    return;
  }

  const plan = buildRehearsalPlan(options);
  const receipt = await runRecoveryRehearsal(plan);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

module.exports = {
  buildRehearsalPlan,
  formatCommand,
  getUsage,
  parseArgs,
  resolveLabviewExePath,
  runRecoveryRehearsal,
  runRecoveryScript,
  waitForRuntimeContaminationSeed
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
