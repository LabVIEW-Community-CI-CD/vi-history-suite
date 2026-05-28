#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildPinnedVsceInvocation } = require('./runPinnedVsce.js');

function parseArgs(argv) {
  const [extensionId, expectedVersion, ...rest] = argv;
  const options = {
    extensionId,
    expectedVersion,
    out: undefined,
    attempts: 1,
    delayMs: 0
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = () => {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--out') options.out = next();
    else if (arg === '--attempts') options.attempts = Number(next());
    else if (arg === '--delay-ms') options.delayMs = Number(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (!extensionId || !expectedVersion) {
    throw new Error('extension id and expected version are required');
  }
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error('--attempts must be a positive integer');
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative number');
  }

  return options;
}

function usage() {
  return 'Usage: node scripts/verifyMarketplaceListing.js <extension-id> <version> --out <path> --attempts 6 --delay-ms 30000';
}

function sleepSync(ms) {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeJson(filePath, payload) {
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function parseMarketplaceShow(stdout) {
  const payload = JSON.parse(stdout);
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  return { payload, versions };
}

function listingContainsVersion(payload, expectedVersion) {
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  return versions.some((version) => version && version.version === expectedVersion);
}

function runVsceShow(extensionId, deps = {}) {
  const invocation = buildPinnedVsceInvocation(['show', extensionId, '--json'], {
    platform: deps.platform
  });
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const result = spawnSyncImpl(invocation.command, invocation.args, {
    cwd: deps.cwd || process.cwd(),
    encoding: 'utf8',
    shell: false
  });
  return {
    command: [invocation.command, ...invocation.args].join(' '),
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : ''
  };
}

function verifyMarketplaceListing(options, deps = {}) {
  const sleep = deps.sleepSync || sleepSync;
  const attempts = [];

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const show = runVsceShow(options.extensionId, deps);
    const attemptRecord = {
      attempt,
      command: show.command,
      status: show.status,
      outcome: 'unknown',
      message: ''
    };

    if (show.status !== 0) {
      attemptRecord.outcome = 'show-failed';
      attemptRecord.message = show.stderr || show.error || `vsce show exited with ${show.status}`;
      attempts.push(attemptRecord);
    } else {
      try {
        const { payload } = parseMarketplaceShow(show.stdout);
        if (listingContainsVersion(payload, options.expectedVersion)) {
          attemptRecord.outcome = 'version-found';
          attemptRecord.message = `Marketplace listing contains version ${options.expectedVersion}.`;
          attempts.push(attemptRecord);
          writeJson(options.out, payload);
          return {
            success: true,
            attempts,
            payload,
            message: attemptRecord.message
          };
        }

        attemptRecord.outcome = 'version-absent';
        attemptRecord.message = `Marketplace listing does not yet contain version ${options.expectedVersion}.`;
        attempts.push(attemptRecord);
      } catch (error) {
        attemptRecord.outcome = 'malformed-json';
        attemptRecord.message = `Marketplace listing JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`;
        attempts.push(attemptRecord);
      }
    }

    if (attempt < options.attempts) {
      sleep(options.delayMs);
    }
  }

  return {
    success: false,
    attempts,
    message: `Marketplace listing verification did not find version ${options.expectedVersion} after ${options.attempts} attempts; this may be Marketplace propagation lag or absent publication.`
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }

    const result = verifyMarketplaceListing(options, deps);
    process.stdout.write(`${result.message}\n`);
    return result.success ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  listingContainsVersion,
  main,
  parseArgs,
  parseMarketplaceShow,
  runVsceShow,
  sleepSync,
  verifyMarketplaceListing
};
