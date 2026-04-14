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
    'Fail closed when retained live-session probe history no longer supports the current reload-or-restart policy boundary.'
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
  if (summary.proofStatus !== 'not-fully-proven') {
    throw new Error(
      `Runtime-settings live-session policy boundary no longer classifies the CLI live-session seam as not fully proven (proofStatus=${summary.proofStatus}). Re-evaluate VHS-REQ-542 and aligned docs before merge.`
    );
  }
  if (summary.stance !== 'live-uptake-not-proven') {
    throw new Error(
      `Runtime-settings live-session policy boundary no longer supports unconditional reload guidance (stance=${summary.stance}). Re-evaluate VHS-REQ-542 and aligned docs before merge.`
    );
  }
  if (summary.mutationTargetHostCount < 1 || summary.mutationTargetDockerCount < 1) {
    throw new Error(
      `Runtime-settings live-session policy boundary requires retained bidirectional provider-selection coverage (mutationTargetHostCount=${summary.mutationTargetHostCount}, mutationTargetDockerCount=${summary.mutationTargetDockerCount}).`
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
    stdout.write(`- mutationTargetHostCount: ${summary.mutationTargetHostCount}\n`);
    stdout.write(`- mutationTargetDockerCount: ${summary.mutationTargetDockerCount}\n`);
    stdout.write(`- latestObservation: ${summary.latestObservation ?? '<none>'}\n`);
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
