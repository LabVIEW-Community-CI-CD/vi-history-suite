#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_ID = 'svelderrainruiz.vi-history-suite';
const PACKET_RELATIVE_PATH = path.join(
  'governed-proof',
  'runtime-provider-live-session-probe',
  'latest-summary.json'
);
const PACKET_ENV = 'VIHS_RUNTIME_SETTINGS_LIVE_SESSION_PACKET';

function getUsage() {
  return [
    'Usage: node scripts/assertRuntimeSettingsLiveSessionProbePacket.js [--packet <path>] [--help]',
    '',
    'Fail closed when the retained runtime-settings live-session probe packet is missing or malformed.',
    `When --packet is omitted, ${PACKET_ENV} is used first; otherwise the default VS Code global-storage path is used.`
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    packetPath: undefined
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (arg === '--packet') {
      i += 1;
      if (i >= argv.length) {
        throw new Error('Missing value for --packet.');
      }
      parsed.packetPath = argv[i];
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function resolveDefaultPacketPath(
  platform = process.platform,
  env = process.env,
  homedir = os.homedir
) {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.win32.join(homedir(), 'AppData', 'Roaming');
    return path.win32.join(
      appData,
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_RELATIVE_PATH
    );
  }

  if (platform === 'linux') {
    const configHome = env.XDG_CONFIG_HOME ?? path.posix.join(homedir().replace(/\\/g, '/'), '.config');
    return path.posix.join(
      configHome.replace(/\\/g, '/'),
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_RELATIVE_PATH
    );
  }

  if (platform === 'darwin') {
    return path.posix.join(
      homedir().replace(/\\/g, '/'),
      'Library',
      'Application Support',
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_RELATIVE_PATH
    );
  }

  throw new Error(`Unsupported platform for probe packet default path resolution: ${platform}`);
}

function resolvePacketPath(parsed, env = process.env) {
  const explicit = `${parsed.packetPath ?? ''}`.trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  const fromEnv = `${env[PACKET_ENV] ?? ''}`.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  return resolveDefaultPacketPath(process.platform, env);
}

function validateProbePacket(summary) {
  const failures = [];
  const requireString = (key) => {
    const value = summary[key];
    if (typeof value !== 'string' || value.trim() === '') {
      failures.push(`${key} must be a non-empty string`);
      return undefined;
    }
    return value;
  };
  const requireBoolean = (key) => {
    const value = summary[key];
    if (typeof value !== 'boolean') {
      failures.push(`${key} must be boolean`);
      return undefined;
    }
    return value;
  };
  const requireNumber = (key) => {
    const value = summary[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      failures.push(`${key} must be a non-negative finite number`);
      return undefined;
    }
    return value;
  };

  const outcome = requireString('outcome');
  if (outcome && outcome !== 'probed-runtime-settings-live-session') {
    failures.push(`outcome must be probed-runtime-settings-live-session, received ${outcome}`);
  }

  requireString('packetRunId');
  requireString('packetJsonPath');
  requireString('packetMarkdownPath');
  requireString('latestPacketJsonPath');
  requireString('latestPacketMarkdownPath');
  const persistedProvider = requireString('persistedProvider');
  const baselinePersistedProvider = requireString('baselinePersistedProvider');
  const mutationProviderTarget = requireString('mutationProviderTarget');
  const mutationTargetPersistedMatch = requireBoolean('mutationTargetPersistedMatch');
  const mutationTargetBaselineChanged = requireBoolean('mutationTargetBaselineChanged');
  const liveUptakeObservation = requireString('liveUptakeObservation');
  const safeRestoreApplied = requireBoolean('safeRestoreApplied');
  const safeRestoreVerified = requireBoolean('safeRestoreVerified');
  const providerDrift = requireBoolean('providerDrift');
  const versionDrift = requireBoolean('versionDrift');
  const bitnessDrift = requireBoolean('bitnessDrift');
  const driftDetected = requireBoolean('driftDetected');
  const historyTotalRuns = requireNumber('historyTotalRuns');
  const historyReloadRequiredCount = requireNumber('historyReloadRequiredCount');
  const historyInSessionUpdatedCount = requireNumber('historyInSessionUpdatedCount');
  const historyUnknownObservationCount = requireNumber('historyUnknownObservationCount');
  const historyStance = requireString('historyStance');
  const historyProofStatus = requireString('historyProofStatus');

  if (
    typeof safeRestoreApplied === 'boolean' &&
    typeof safeRestoreVerified === 'boolean' &&
    safeRestoreApplied &&
    !safeRestoreVerified
  ) {
    failures.push('safeRestoreVerified must be true when safeRestoreApplied is true');
  }

  if (mutationProviderTarget && mutationProviderTarget !== 'host' && mutationProviderTarget !== 'docker') {
    failures.push(
      `mutationProviderTarget must be host or docker when present, received ${mutationProviderTarget}`
    );
  }
  const normalizedPersistedProvider = persistedProvider?.trim().toLowerCase();
  const normalizedBaselineProvider = baselinePersistedProvider?.trim().toLowerCase();
  if (normalizedPersistedProvider !== 'host' && normalizedPersistedProvider !== 'docker') {
    failures.push(
      `persistedProvider must be host or docker for latest retained probe packet evidence, received ${persistedProvider}`
    );
  }
  if (normalizedBaselineProvider !== 'host' && normalizedBaselineProvider !== 'docker') {
    failures.push(
      `baselinePersistedProvider must be host or docker for latest retained probe packet evidence, received ${baselinePersistedProvider}`
    );
  }
  if (
    (mutationProviderTarget === 'host' || mutationProviderTarget === 'docker') &&
    (normalizedPersistedProvider === 'host' || normalizedPersistedProvider === 'docker') &&
    typeof mutationTargetPersistedMatch === 'boolean'
  ) {
    const expectedMutationMatch = mutationProviderTarget === normalizedPersistedProvider;
    if (mutationTargetPersistedMatch !== expectedMutationMatch) {
      failures.push(
        `mutationTargetPersistedMatch must align with mutationProviderTarget versus persistedProvider (${expectedMutationMatch})`
      );
    }
    if (!mutationTargetPersistedMatch) {
      failures.push(
        'mutationTargetPersistedMatch must be true for latest retained probe packet evidence'
      );
    }
  }
  if (
    (normalizedBaselineProvider === 'host' || normalizedBaselineProvider === 'docker') &&
    (normalizedPersistedProvider === 'host' || normalizedPersistedProvider === 'docker') &&
    typeof mutationTargetBaselineChanged === 'boolean'
  ) {
    const expectedBaselineChanged = normalizedBaselineProvider !== normalizedPersistedProvider;
    if (mutationTargetBaselineChanged !== expectedBaselineChanged) {
      failures.push(
        `mutationTargetBaselineChanged must align with baselinePersistedProvider versus persistedProvider (${expectedBaselineChanged})`
      );
    }
    if (!mutationTargetBaselineChanged) {
      failures.push(
        'mutationTargetBaselineChanged must be true for latest retained probe packet evidence'
      );
    }
  }

  if (
    liveUptakeObservation &&
    liveUptakeObservation !== 'in-session-updated' &&
    liveUptakeObservation !== 'reload-required'
  ) {
    failures.push(
      `liveUptakeObservation must be in-session-updated or reload-required, received ${liveUptakeObservation}`
    );
  }
  if (liveUptakeObservation && liveUptakeObservation !== 'in-session-updated') {
    failures.push(
      'liveUptakeObservation must remain in-session-updated for latest retained probe packet evidence'
    );
  }
  if (safeRestoreVerified === false) {
    failures.push(
      'safeRestoreVerified must remain true for latest retained probe packet evidence'
    );
  }
  if (providerDrift === true) {
    failures.push(
      'providerDrift must remain false for latest retained probe packet evidence'
    );
  }

  if (
    historyStance &&
    historyStance !== 'live-uptake-not-proven' &&
    historyStance !== 'candidate-live-uptake-observed' &&
    historyStance !== 'insufficient-evidence'
  ) {
    failures.push(
      `historyStance must be live-uptake-not-proven, candidate-live-uptake-observed, or insufficient-evidence, received ${historyStance}`
    );
  }
  if (
    historyProofStatus &&
    historyProofStatus !== 'not-fully-proven' &&
    historyProofStatus !== 're-evaluation-required'
  ) {
    failures.push(
      `historyProofStatus must be not-fully-proven or re-evaluation-required, received ${historyProofStatus}`
    );
  }

  if (
    typeof providerDrift === 'boolean' &&
    typeof versionDrift === 'boolean' &&
    typeof bitnessDrift === 'boolean' &&
    typeof driftDetected === 'boolean'
  ) {
    const expectedDrift = providerDrift || versionDrift || bitnessDrift;
    if (driftDetected !== expectedDrift) {
      failures.push(
        `driftDetected must equal providerDrift || versionDrift || bitnessDrift (${expectedDrift})`
      );
    }

    if (
      liveUptakeObservation === 'reload-required' &&
      expectedDrift !== true
    ) {
      failures.push('liveUptakeObservation reload-required requires driftDetected=true');
    }

    if (
      liveUptakeObservation === 'in-session-updated' &&
      expectedDrift !== false
    ) {
      failures.push('liveUptakeObservation in-session-updated requires driftDetected=false');
    }
  }

  if (
    typeof historyTotalRuns === 'number' &&
    typeof historyReloadRequiredCount === 'number' &&
    typeof historyInSessionUpdatedCount === 'number' &&
    typeof historyUnknownObservationCount === 'number'
  ) {
    const expectedMinimum =
      historyReloadRequiredCount +
      historyInSessionUpdatedCount +
      historyUnknownObservationCount;
    if (historyTotalRuns < expectedMinimum) {
      failures.push(
        `historyTotalRuns must be >= historyReloadRequiredCount + historyInSessionUpdatedCount + historyUnknownObservationCount (${expectedMinimum})`
      );
    }
    if (historyTotalRuns !== expectedMinimum) {
      failures.push(
        `historyTotalRuns must equal historyReloadRequiredCount + historyInSessionUpdatedCount + historyUnknownObservationCount (${expectedMinimum})`
      );
    }
  }

  if (
    historyStance &&
    typeof historyReloadRequiredCount === 'number' &&
    typeof historyInSessionUpdatedCount === 'number' &&
    typeof historyUnknownObservationCount === 'number'
  ) {
    const expectedStance =
      historyReloadRequiredCount > 0
        ? 'live-uptake-not-proven'
        : historyInSessionUpdatedCount > 0 && historyUnknownObservationCount === 0
          ? 'candidate-live-uptake-observed'
          : 'insufficient-evidence';
    if (historyStance !== expectedStance) {
      failures.push(`historyStance must match retained history counts (${expectedStance})`);
    }
    const expectedProofStatus =
      expectedStance === 'candidate-live-uptake-observed'
        ? 're-evaluation-required'
        : 'not-fully-proven';
    if (historyProofStatus && historyProofStatus !== expectedProofStatus) {
      failures.push(`historyProofStatus must match historyStance (${expectedProofStatus})`);
    }
  }
  if (historyProofStatus === 'not-fully-proven') {
    failures.push(
      'historyProofStatus must remain re-evaluation-required for latest retained probe packet evidence'
    );
  }
  if (historyStance && historyStance !== 'candidate-live-uptake-observed') {
    failures.push(
      'historyStance must remain candidate-live-uptake-observed for latest retained probe packet evidence'
    );
  }
  if (typeof historyReloadRequiredCount === 'number' && historyReloadRequiredCount > 0) {
    failures.push(
      'historyReloadRequiredCount must remain 0 for latest retained probe packet evidence'
    );
  }
  if (typeof historyInSessionUpdatedCount === 'number' && historyInSessionUpdatedCount < 1) {
    failures.push(
      'historyInSessionUpdatedCount must remain at least 1 for latest retained probe packet evidence'
    );
  }
  if (typeof historyUnknownObservationCount === 'number' && historyUnknownObservationCount > 0) {
    failures.push(
      'historyUnknownObservationCount must remain 0 for latest retained probe packet evidence'
    );
  }

  return failures;
}

function assertProbePacket(packetPath, fsApi = fs) {
  if (!fsApi.existsSync(packetPath)) {
    throw new Error(`Runtime-settings live-session probe packet is missing: ${packetPath}`);
  }

  const raw = fsApi.readFileSync(packetPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Runtime-settings live-session probe packet is not valid JSON: ${packetPath}. ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const failures = validateProbePacket(parsed);
  if (failures.length > 0) {
    throw new Error(
      `Runtime-settings live-session probe packet failed validation: ${packetPath}\n- ${failures.join('\n- ')}`
    );
  }

  return parsed;
}

function run(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return { outcome: 'help' };
  }

  const packetPath = resolvePacketPath(parsed, deps.env ?? process.env);
  const summary = assertProbePacket(packetPath, deps.fs ?? fs);
  stdout.write('Runtime settings live-session probe packet: pass\n');
  stdout.write(`- packet: ${packetPath}\n`);
  stdout.write(`- runId: ${summary.packetRunId}\n`);
  stdout.write(`- driftDetected: ${summary.driftDetected ? 'yes' : 'no'}\n`);
  stdout.write(`- liveUptakeObservation: ${summary.liveUptakeObservation}\n`);
  stdout.write(`- historyStance: ${summary.historyStance}\n`);
  return {
    outcome: 'pass',
    packetPath,
    summary
  };
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
  EXTENSION_ID,
  PACKET_RELATIVE_PATH,
  PACKET_ENV,
  getUsage,
  parseArgs,
  resolveDefaultPacketPath,
  resolvePacketPath,
  validateProbePacket,
  assertProbePacket,
  run
};
