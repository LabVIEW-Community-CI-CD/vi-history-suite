#!/usr/bin/env node

const path = require('node:path');

const history = require(path.resolve(
  __dirname,
  'printRuntimeSettingsLiveSessionProbeHistory.js'
));

function getUsage() {
  return [
    'Usage: node scripts/assertRuntimeSettingsLiveSessionPolicyBoundary.js [--packet-root <path>] [--json] [--help]',
    '',
    'Fail closed when retained live-session probe history no longer supports the current conditional stale-result guidance boundary.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    packetRoot: undefined
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--packet-root') {
      i += 1;
      if (i >= argv.length) {
        throw new Error('Missing value for --packet-root.');
      }
      parsed.packetRoot = argv[i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
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

  const packetRoot = parsed.packetRoot
    ? path.resolve(parsed.packetRoot)
    : history.resolveDefaultPacketRoot(
        deps.platform ?? process.platform,
        deps.env ?? process.env,
        deps.homedir
      );
  const runSummaries = history.collectRunSummaries(packetRoot, deps.fs);
  if (runSummaries.length === 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained probe runs, but none were found at: ${packetRoot}`
    );
  }

  const summary = history.summarizeHistory(packetRoot, runSummaries);
  if (summary.proofStatus !== 're-evaluation-required') {
    throw new Error(
      `Runtime-settings live-session policy boundary no longer retains the admitted conditional-guidance proof status (proofStatus=${summary.proofStatus}). Re-evaluate VHS-REQ-542 and aligned docs before merge.`
    );
  }
  if (summary.stance !== 'candidate-live-uptake-observed') {
    throw new Error(
      `Runtime-settings live-session policy boundary no longer supports conditional stale-result guidance (stance=${summary.stance}). Re-evaluate VHS-REQ-542 and aligned docs before merge.`
    );
  }
  if (summary.latestObservation !== 'in-session-updated') {
    throw new Error(
      `Runtime-settings live-session policy boundary requires latest retained probe observation to remain in-session-updated (latestObservation=${summary.latestObservation ?? '<none>'}).`
    );
  }
  if (summary.reloadRequiredCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained reload-required observations to remain absent (reloadRequiredCount=${summary.reloadRequiredCount}).`
    );
  }
  if (summary.inSessionUpdatedCount < 1) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained in-session-updated observations to be present (inSessionUpdatedCount=${summary.inSessionUpdatedCount}).`
    );
  }
  if (summary.safeRestoreVerifiedCount !== summary.totalRuns) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires safe-restore verification on every retained run (safeRestoreVerifiedCount=${summary.safeRestoreVerifiedCount}, totalRuns=${summary.totalRuns}).`
    );
  }
  if (summary.unknownObservationCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained unknown observations to remain absent (unknownObservationCount=${summary.unknownObservationCount}).`
    );
  }
  if (summary.mutationTargetHostCount < 1 || summary.mutationTargetDockerCount < 1) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained bidirectional provider-selection coverage (mutationTargetHostCount=${summary.mutationTargetHostCount}, mutationTargetDockerCount=${summary.mutationTargetDockerCount}).`
    );
  }
  if (summary.mutationTargetPersistedMismatchCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires mutation target alignment with persisted provider on retained runs (mutationTargetPersistedMismatchCount=${summary.mutationTargetPersistedMismatchCount}).`
    );
  }
  if (summary.mutationTargetPersistedUnknownCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires explicit mutation target alignment receipts on retained runs (mutationTargetPersistedUnknownCount=${summary.mutationTargetPersistedUnknownCount}).`
    );
  }
  if (summary.mutationTargetBaselineUnchangedCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires baseline-to-persisted provider switch on retained runs (mutationTargetBaselineUnchangedCount=${summary.mutationTargetBaselineUnchangedCount}).`
    );
  }
  if (summary.mutationTargetBaselineUnknownCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires explicit baseline-switch receipts on retained runs (mutationTargetBaselineUnknownCount=${summary.mutationTargetBaselineUnknownCount}).`
    );
  }
  if (summary.latestProviderDrift !== false) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires latest retained provider drift to remain explicit and false (latestProviderDrift=${summary.latestProviderDrift ?? '<none>'}).`
    );
  }
  if (summary.providerDriftTrueCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained provider-drift true outcomes to remain absent (providerDriftTrueCount=${summary.providerDriftTrueCount}).`
    );
  }
  if (summary.providerDriftUnknownCount > 0) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires explicit provider-drift receipts on every retained run (providerDriftUnknownCount=${summary.providerDriftUnknownCount}).`
    );
  }

  if (parsed.json) {
    stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    stdout.write('Runtime settings live-session policy boundary: pass\n');
    stdout.write(`- proofStatus: ${summary.proofStatus}\n`);
    stdout.write(`- stance: ${summary.stance}\n`);
    stdout.write(`- providerSelectionCoverage: ${summary.providerSelectionCoverage}\n`);
    stdout.write(`- reloadRequiredCount: ${summary.reloadRequiredCount}\n`);
    stdout.write(`- inSessionUpdatedCount: ${summary.inSessionUpdatedCount}\n`);
    stdout.write(`- safeRestoreVerifiedCount: ${summary.safeRestoreVerifiedCount}\n`);
    stdout.write(`- mutationTargetHostCount: ${summary.mutationTargetHostCount}\n`);
    stdout.write(`- mutationTargetDockerCount: ${summary.mutationTargetDockerCount}\n`);
    stdout.write(
      `- mutationTargetPersistedMismatchCount: ${summary.mutationTargetPersistedMismatchCount}\n`
    );
    stdout.write(
      `- mutationTargetPersistedUnknownCount: ${summary.mutationTargetPersistedUnknownCount}\n`
    );
    stdout.write(
      `- mutationTargetBaselineUnchangedCount: ${summary.mutationTargetBaselineUnchangedCount}\n`
    );
    stdout.write(
      `- mutationTargetBaselineUnknownCount: ${summary.mutationTargetBaselineUnknownCount}\n`
    );
    stdout.write(`- latestObservation: ${summary.latestObservation ?? '<none>'}\n`);
    stdout.write(`- latestProviderDrift: ${summary.latestProviderDrift ?? '<none>'}\n`);
    stdout.write(`- providerDriftTrueCount: ${summary.providerDriftTrueCount}\n`);
    stdout.write(`- providerDriftFalseCount: ${summary.providerDriftFalseCount}\n`);
    stdout.write(`- providerDriftUnknownCount: ${summary.providerDriftUnknownCount}\n`);
  }

  return {
    outcome: 'pass',
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
  getUsage,
  parseArgs,
  run
};
