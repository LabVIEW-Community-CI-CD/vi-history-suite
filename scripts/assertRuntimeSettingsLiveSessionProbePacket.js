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
    const configHome = env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
    return path.join(
      configHome,
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_RELATIVE_PATH
    );
  }

  if (platform === 'darwin') {
    return path.join(
      homedir(),
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

  const outcome = requireString('outcome');
  if (outcome && outcome !== 'probed-runtime-settings-live-session') {
    failures.push(`outcome must be probed-runtime-settings-live-session, received ${outcome}`);
  }

  requireString('packetRunId');
  requireString('packetJsonPath');
  requireString('packetMarkdownPath');
  requireString('latestPacketJsonPath');
  requireString('latestPacketMarkdownPath');
  const mutationProviderTarget = requireString('mutationProviderTarget');
  const liveUptakeObservation = requireString('liveUptakeObservation');
  const safeRestoreApplied = requireBoolean('safeRestoreApplied');
  const safeRestoreVerified = requireBoolean('safeRestoreVerified');
  const providerDrift = requireBoolean('providerDrift');
  const versionDrift = requireBoolean('versionDrift');
  const bitnessDrift = requireBoolean('bitnessDrift');
  const driftDetected = requireBoolean('driftDetected');

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

  if (
    liveUptakeObservation &&
    liveUptakeObservation !== 'in-session-updated' &&
    liveUptakeObservation !== 'reload-required'
  ) {
    failures.push(
      `liveUptakeObservation must be in-session-updated or reload-required, received ${liveUptakeObservation}`
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
