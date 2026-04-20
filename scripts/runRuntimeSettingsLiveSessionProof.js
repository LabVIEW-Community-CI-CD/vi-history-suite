#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const packetGate = require(path.resolve(
  __dirname,
  'assertRuntimeSettingsLiveSessionProbePacket.js'
));
const history = require(path.resolve(
  __dirname,
  'printRuntimeSettingsLiveSessionProbeHistory.js'
));
const policy = require(path.resolve(
  __dirname,
  'assertRuntimeSettingsLiveSessionPolicyBoundary.js'
));

const DEFAULT_EVIDENCE_DIR = path.join(
  '.cache',
  'runtime-settings-live-session-proof',
  'latest'
);

function getUsage() {
  return [
    'Usage: node scripts/runRuntimeSettingsLiveSessionProof.js [--host <windows|linux|auto>] [--evidence-dir <path>] [--json] [--help]',
    '',
    'Run the governed extension-host live-session proof lane, then snapshot the latest probe packet, history receipt, and policy-boundary evidence.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    host: 'auto',
    evidenceDir: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--host') {
      index += 1;
      if (index >= argv.length) {
        throw new Error('Missing value for --host.');
      }
      parsed.host = argv[index];
      continue;
    }
    if (arg === '--evidence-dir') {
      index += 1;
      if (index >= argv.length) {
        throw new Error('Missing value for --evidence-dir.');
      }
      parsed.evidenceDir = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function resolveHost(requestedHost = 'auto', platform = process.platform) {
  const normalizedRequested = `${requestedHost}`.trim().toLowerCase();
  const defaultHost =
    platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : undefined;

  if (!defaultHost) {
    throw new Error(`Unsupported platform for runtime-settings live-session proof: ${platform}`);
  }

  if (normalizedRequested === '' || normalizedRequested === 'auto') {
    return defaultHost;
  }

  if (normalizedRequested !== 'windows' && normalizedRequested !== 'linux') {
    throw new Error(`Unsupported host value: ${requestedHost}`);
  }

  if (normalizedRequested !== defaultHost) {
    throw new Error(
      `Host ${normalizedRequested} is not supported from the current ${platform} proof surface. Use ${defaultHost} or auto on this machine.`
    );
  }

  return normalizedRequested;
}

function resolveEvidenceDir(evidenceDir, repoRoot) {
  return path.resolve(repoRoot, evidenceDir ?? DEFAULT_EVIDENCE_DIR);
}

function buildIntegrationProofCommand(
  host,
  repoRoot,
  proofOutputDir,
  env = process.env,
  nodeExecutable = process.execPath
) {
  const scriptName =
    host === 'windows' ? 'runWindowsIntegrationHost.js' : 'runLinuxIntegrationHost.js';

  return {
    command: nodeExecutable,
    args: [path.join(repoRoot, 'scripts', scriptName)],
    env: {
      ...env,
      VI_HISTORY_SUITE_RUNTIME_SETTINGS_LIVE_SESSION_PROOF_OUTPUT_DIR: proofOutputDir
    }
  };
}

function run(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return { outcome: 'help' };
  }

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..');
  const host = resolveHost(parsed.host, deps.platform ?? process.platform);
  const evidenceDir = resolveEvidenceDir(parsed.evidenceDir, repoRoot);
  const integrationProofOutputDir = path.join(evidenceDir, 'integration-proof-output');
  const fsApi = deps.fs ?? fs;
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const commandPlan = buildIntegrationProofCommand(
    host,
    repoRoot,
    integrationProofOutputDir,
    deps.env ?? process.env,
    deps.nodeExecutable ?? process.execPath
  );

  fsApi.mkdirSync(evidenceDir, { recursive: true });

  const integrationResult = spawnSyncImpl(commandPlan.command, commandPlan.args, {
    cwd: repoRoot,
    env: commandPlan.env,
    shell: false,
    encoding: 'utf8'
  });
  if (integrationResult.error) {
    throw integrationResult.error;
  }

  const integrationStdout = normalizeSpawnText(integrationResult.stdout);
  const integrationStderr = normalizeSpawnText(integrationResult.stderr);
  const integrationStdoutLogPath = path.join(evidenceDir, 'integration.stdout.log');
  const integrationStderrLogPath = path.join(evidenceDir, 'integration.stderr.log');
  fsApi.writeFileSync(integrationStdoutLogPath, integrationStdout, 'utf8');
  fsApi.writeFileSync(integrationStderrLogPath, integrationStderr, 'utf8');
  const retainedPacketRoot = path.join(integrationProofOutputDir, 'packet-root');
  const retainedLatestPacketPath = path.join(retainedPacketRoot, 'latest-summary.json');
  const probeCommandSummaryPath = path.join(
    integrationProofOutputDir,
    'probe-command-summary.json'
  );
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const receiptJsonPath = path.join(evidenceDir, 'runtime-settings-live-session-proof.json');
  const receiptMarkdownPath = path.join(evidenceDir, 'runtime-settings-live-session-proof.md');

  if (integrationStdout.length > 0) {
    stdout.write(integrationStdout);
    if (!integrationStdout.endsWith('\n')) {
      stdout.write('\n');
    }
  }
  if (integrationStderr.length > 0) {
    stderr.write(integrationStderr);
    if (!integrationStderr.endsWith('\n')) {
      stderr.write('\n');
    }
  }

  if (integrationResult.status !== 0) {
    const failureMessage = `Runtime-settings live-session proof integration lane failed with exit code ${String(
      integrationResult.status ?? 'unknown'
    )}. Review ${integrationStdoutLogPath} and ${integrationStderrLogPath}.`;
    writeReceiptFiles(fsApi, receiptJsonPath, receiptMarkdownPath, {
      schema: 'vi-history-suite/runtime-settings-live-session-proof@v1',
      status: 'failed',
      generatedAt,
      host,
      evidenceDir,
      integrationStep: {
        command: commandPlan.command,
        args: commandPlan.args,
        exitCode: integrationResult.status ?? 0,
        stdoutLogPath: integrationStdoutLogPath,
        stderrLogPath: integrationStderrLogPath
      },
      probePacket: {
        retainedPacketRoot,
        latestPacketPath: retainedLatestPacketPath,
        probeCommandSummaryPath
      },
      failureMessage
    });
    throw new Error(`${failureMessage} Receipt: ${receiptJsonPath}.`);
  }

  let receipt;
  try {
    if (!fsApi.existsSync(retainedLatestPacketPath)) {
      throw new Error(
        `Runtime-settings live-session proof integration lane did not retain a stable latest probe packet at ${retainedLatestPacketPath}.`
      );
    }

    const packetGateModule = deps.packetGate ?? packetGate;
    const packetResult = packetGateModule.run(['--packet', retainedLatestPacketPath], {
      stdout: createSilentWriter(),
      env: commandPlan.env
    });
    if (packetResult.outcome !== 'pass' || !packetResult.summary || !packetResult.packetPath) {
      throw new Error(
        'Runtime-settings live-session proof could not resolve the latest probe packet.'
      );
    }

    const packetRoot = retainedPacketRoot;
    const historyModule = deps.history ?? history;
    const runSummaries = historyModule.collectRunSummaries(packetRoot, deps.historyFs ?? fsApi);
    if (runSummaries.length === 0) {
      throw new Error(
        `Runtime-settings live-session proof found no retained probe history under ${packetRoot}.`
      );
    }
    const historySummary = historyModule.summarizeHistory(packetRoot, runSummaries);

    const policyModule = deps.policy ?? policy;
    const policyResult = policyModule.run(['--packet-root', packetRoot], {
      stdout: createSilentWriter()
    });
    if (policyResult.outcome !== 'pass' || !policyResult.summary) {
      throw new Error(
        'Runtime-settings live-session proof could not validate the retained policy-boundary evidence.'
      );
    }

    const packetSnapshotJsonPath = path.join(evidenceDir, 'probe-summary.json');
    const packetSnapshotMarkdownPath = path.join(evidenceDir, 'probe-summary.md');
    copyFileOrThrow(fsApi, packetResult.summary.packetJsonPath, packetSnapshotJsonPath);
    copyFileOrThrow(fsApi, packetResult.summary.packetMarkdownPath, packetSnapshotMarkdownPath);

    const historySummaryJsonPath = path.join(evidenceDir, 'history-summary.json');
    const historySummaryMarkdownPath = path.join(evidenceDir, 'history-summary.md');
    fsApi.writeFileSync(
      historySummaryJsonPath,
      `${JSON.stringify(historySummary, null, 2)}\n`,
      'utf8'
    );
    fsApi.writeFileSync(
      historySummaryMarkdownPath,
      historyModule.formatHistorySummary(historySummary),
      'utf8'
    );

    receipt = {
      schema: 'vi-history-suite/runtime-settings-live-session-proof@v1',
      status: 'pass',
      generatedAt,
      host,
      evidenceDir,
      integrationStep: {
        command: commandPlan.command,
        args: commandPlan.args,
        exitCode: integrationResult.status ?? 0,
        stdoutLogPath: integrationStdoutLogPath,
        stderrLogPath: integrationStderrLogPath
      },
      probePacket: {
        retainedPacketRoot,
        probeCommandSummaryPath,
        packetRoot,
        latestPacketPath: packetResult.packetPath,
        packetJsonPath: packetResult.summary.packetJsonPath,
        packetMarkdownPath: packetResult.summary.packetMarkdownPath,
        latestPacketJsonPath: packetResult.summary.latestPacketJsonPath,
        latestPacketMarkdownPath: packetResult.summary.latestPacketMarkdownPath,
        snapshotJsonPath: packetSnapshotJsonPath,
        snapshotMarkdownPath: packetSnapshotMarkdownPath
      },
      historyReceipt: {
        jsonPath: historySummaryJsonPath,
        markdownPath: historySummaryMarkdownPath,
        summary: historySummary
      },
      packetSummary: packetResult.summary,
      policyBoundary: {
        outcome: policyResult.outcome,
        summary: policyResult.summary
      }
    };
    writeReceiptFiles(fsApi, receiptJsonPath, receiptMarkdownPath, receipt);
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    const retainedPacketSummary = tryReadJson(fsApi, retainedLatestPacketPath);
    const derivedHistorySummary = deriveHistorySummaryFromPacketSummary(retainedPacketSummary);
    receipt = {
      schema: 'vi-history-suite/runtime-settings-live-session-proof@v1',
      status: 'failed',
      generatedAt,
      host,
      evidenceDir,
      integrationStep: {
        command: commandPlan.command,
        args: commandPlan.args,
        exitCode: integrationResult.status ?? 0,
        stdoutLogPath: integrationStdoutLogPath,
        stderrLogPath: integrationStderrLogPath
      },
      probePacket: {
        retainedPacketRoot,
        latestPacketPath: retainedLatestPacketPath,
        probeCommandSummaryPath,
        ...projectProbePacketFromSummary(retainedPacketSummary)
      },
      historyReceipt: derivedHistorySummary
        ? {
            summary: derivedHistorySummary
          }
        : undefined,
      packetSummary:
        retainedPacketSummary && typeof retainedPacketSummary === 'object'
          ? retainedPacketSummary
          : undefined,
      policyBoundary: derivePolicyBoundaryFromPacketSummary(retainedPacketSummary),
      failureMessage
    };
    writeReceiptFiles(fsApi, receiptJsonPath, receiptMarkdownPath, receipt);
    throw new Error(`${failureMessage} Receipt: ${receiptJsonPath}.`);
  }

  if (parsed.json) {
    stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    stdout.write('Runtime settings live-session proof: pass\n');
    stdout.write(`- host: ${host}\n`);
    stdout.write(`- evidenceDir: ${evidenceDir}\n`);
    stdout.write(`- packetRunId: ${packetResult.summary.packetRunId}\n`);
    stdout.write(`- liveUptakeObservation: ${packetResult.summary.liveUptakeObservation}\n`);
    stdout.write(`- historyStance: ${historySummary.stance}\n`);
    stdout.write(`- proofStatus: ${historySummary.proofStatus}\n`);
    stdout.write(`- receipt: ${receiptJsonPath}\n`);
  }

  return {
    outcome: 'pass',
    host,
    evidenceDir,
    receipt,
    receiptJsonPath,
    receiptMarkdownPath
  };
}

function createSilentWriter() {
  return {
    write(_text) {
      // Intentionally silent; the proof receipt carries the summary.
    }
  };
}

function normalizeSpawnText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return '';
}

function copyFileOrThrow(fsApi, sourcePath, destinationPath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new Error('Runtime-settings live-session proof expected a non-empty source file path.');
  }
  fsApi.copyFileSync(sourcePath, destinationPath);
}

function tryReadJson(fsApi, filePath) {
  try {
    return JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeReceiptFiles(fsApi, receiptJsonPath, receiptMarkdownPath, receipt) {
  fsApi.writeFileSync(receiptJsonPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fsApi.writeFileSync(receiptMarkdownPath, renderReceiptMarkdown(receipt), 'utf8');
}

function projectProbePacketFromSummary(packetSummary) {
  if (!packetSummary || typeof packetSummary !== 'object') {
    return {};
  }

  return {
    packetJsonPath: packetSummary.packetJsonPath,
    packetMarkdownPath: packetSummary.packetMarkdownPath,
    latestPacketJsonPath: packetSummary.latestPacketJsonPath,
    latestPacketMarkdownPath: packetSummary.latestPacketMarkdownPath
  };
}

function deriveHistorySummaryFromPacketSummary(packetSummary) {
  if (!packetSummary || typeof packetSummary !== 'object') {
    return undefined;
  }

  const historyFields = [
    'historyTotalRuns',
    'historyReloadRequiredCount',
    'historyInSessionUpdatedCount',
    'historyUnknownObservationCount',
    'historyStance',
    'historyProofStatus'
  ];
  if (!historyFields.some((field) => packetSummary[field] !== undefined)) {
    return undefined;
  }

  return {
    totalRuns: packetSummary.historyTotalRuns,
    reloadRequiredCount: packetSummary.historyReloadRequiredCount,
    inSessionUpdatedCount: packetSummary.historyInSessionUpdatedCount,
    unknownObservationCount: packetSummary.historyUnknownObservationCount,
    latestObservation: packetSummary.liveUptakeObservation,
    latestProviderDrift: packetSummary.providerDrift,
    stance: packetSummary.historyStance,
    proofStatus: packetSummary.historyProofStatus
  };
}

function derivePolicyBoundaryFromPacketSummary(packetSummary) {
  if (!packetSummary || typeof packetSummary !== 'object') {
    return undefined;
  }

  if (packetSummary.providerDrift === undefined) {
    return undefined;
  }

  return {
    outcome: 'packet-validation-failed-before-policy-boundary',
    summary: {
      latestProviderDrift: packetSummary.providerDrift
    }
  };
}

function renderReceiptMarkdown(receipt) {
  return [
    '# Runtime Settings Live-Session Proof Receipt',
    '',
    `- Status: \`${formatReceiptValue(receipt.status)}\``,
    `- Generated at: \`${receipt.generatedAt}\``,
    `- Host: \`${receipt.host}\``,
    `- Evidence dir: \`${receipt.evidenceDir}\``,
    `- Packet run id: \`${formatReceiptValue(receipt.packetSummary?.packetRunId)}\``,
    `- Live uptake observation: \`${formatReceiptValue(receipt.packetSummary?.liveUptakeObservation)}\``,
    `- History stance: \`${formatReceiptValue(receipt.historyReceipt?.summary?.stance ?? receipt.packetSummary?.historyStance)}\``,
    `- Proof status: \`${formatReceiptValue(receipt.historyReceipt?.summary?.proofStatus ?? receipt.packetSummary?.historyProofStatus)}\``,
    '',
    '## Integration Step',
    '',
    `- Command: \`${receipt.integrationStep.command}\``,
    `- Args: \`${receipt.integrationStep.args.join(' ')}\``,
    `- Exit code: \`${receipt.integrationStep.exitCode}\``,
    `- Stdout log: \`${receipt.integrationStep.stdoutLogPath}\``,
    `- Stderr log: \`${receipt.integrationStep.stderrLogPath}\``,
    '',
    '## Probe Packet Evidence',
    '',
    `- Retained packet root: \`${formatReceiptValue(receipt.probePacket?.retainedPacketRoot)}\``,
    `- Latest packet: \`${formatReceiptValue(receipt.probePacket?.latestPacketPath)}\``,
    `- Probe command summary: \`${formatReceiptValue(receipt.probePacket?.probeCommandSummaryPath)}\``,
    `- Per-run packet JSON: \`${formatReceiptValue(receipt.probePacket?.packetJsonPath ?? receipt.packetSummary?.packetJsonPath)}\``,
    `- Per-run packet Markdown: \`${formatReceiptValue(receipt.probePacket?.packetMarkdownPath ?? receipt.packetSummary?.packetMarkdownPath)}\``,
    `- Snapshot JSON: \`${formatReceiptValue(receipt.probePacket?.snapshotJsonPath)}\``,
    `- Snapshot Markdown: \`${formatReceiptValue(receipt.probePacket?.snapshotMarkdownPath)}\``,
    '',
    '## History Receipt',
    '',
    `- JSON: \`${formatReceiptValue(receipt.historyReceipt?.jsonPath)}\``,
    `- Markdown: \`${formatReceiptValue(receipt.historyReceipt?.markdownPath)}\``,
    `- Total runs: \`${formatReceiptValue(receipt.historyReceipt?.summary?.totalRuns ?? receipt.packetSummary?.historyTotalRuns)}\``,
    `- Reload-required runs: \`${formatReceiptValue(receipt.historyReceipt?.summary?.reloadRequiredCount ?? receipt.packetSummary?.historyReloadRequiredCount)}\``,
    `- In-session-updated runs: \`${formatReceiptValue(receipt.historyReceipt?.summary?.inSessionUpdatedCount ?? receipt.packetSummary?.historyInSessionUpdatedCount)}\``,
    `- Unknown-observation runs: \`${formatReceiptValue(receipt.historyReceipt?.summary?.unknownObservationCount ?? receipt.packetSummary?.historyUnknownObservationCount)}\``,
    '',
    '## Policy Boundary',
    '',
    `- Outcome: \`${formatReceiptValue(receipt.policyBoundary?.outcome)}\``,
    `- Provider selection coverage: \`${formatReceiptValue(receipt.policyBoundary?.summary?.providerSelectionCoverage)}\``,
    `- Latest provider drift: \`${formatReceiptValue(receipt.policyBoundary?.summary?.latestProviderDrift ?? receipt.packetSummary?.providerDrift)}\``,
    '',
    '## Failure',
    '',
    `- Message: \`${formatReceiptValue(receipt.failureMessage)}\``,
    ''
  ].join('\n');
}

function formatReceiptValue(value) {
  if (value === undefined || value === null || value === '') {
    return '<none>';
  }
  return String(value);
}

function main() {
  try {
    const result = run();
    return result.outcome === 'help' ? 0 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_EVIDENCE_DIR,
  getUsage,
  parseArgs,
  resolveHost,
  resolveEvidenceDir,
  buildIntegrationProofCommand,
  projectProbePacketFromSummary,
  deriveHistorySummaryFromPacketSummary,
  derivePolicyBoundaryFromPacketSummary,
  renderReceiptMarkdown,
  run
};
