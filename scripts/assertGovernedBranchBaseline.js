#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');

function getUsage() {
  return [
    'Usage: node scripts/assertGovernedBranchBaseline.js [--repo-root <path>] [--main-ref <ref>] [--develop-ref <ref>] [--help]',
    '',
    'Fail closed when the governed integration branch does not already contain the current exact main line.',
    '',
    'Defaults:',
    `  repo-root:    ${repoRoot}`,
    '  main-ref:     origin/main',
    '  develop-ref:  origin/develop'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    repoRoot,
    mainRef: 'origin/main',
    developRef: 'origin/develop'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--repo-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --repo-root');
      }
      parsed.repoRoot = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--main-ref') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --main-ref');
      }
      parsed.mainRef = value;
      index += 1;
      continue;
    }

    if (argument === '--develop-ref') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --develop-ref');
      }
      parsed.developRef = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function runGit(args, cwd, spawnImpl = spawnSync) {
  const result = spawnImpl('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim()
  };
}

function ensureGitSuccess(result, args, cwd) {
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed${cwd ? ` in ${cwd}` : ''}: ${result.stderr || result.stdout || 'unknown error'}`
    );
  }
}

function assertGovernedBranchBaseline(options, deps = {}) {
  const spawnImpl = deps.spawnImpl ?? spawnSync;
  const mainCheck = runGit(['rev-parse', '--verify', options.mainRef], options.repoRoot, spawnImpl);
  ensureGitSuccess(mainCheck, ['rev-parse', '--verify', options.mainRef], options.repoRoot);

  const developCheck = runGit(
    ['rev-parse', '--verify', options.developRef],
    options.repoRoot,
    spawnImpl
  );
  ensureGitSuccess(developCheck, ['rev-parse', '--verify', options.developRef], options.repoRoot);

  const ancestorCheck = runGit(
    ['merge-base', '--is-ancestor', options.mainRef, options.developRef],
    options.repoRoot,
    spawnImpl
  );
  if (ancestorCheck.status !== 0) {
    if (ancestorCheck.status === 1) {
      throw new Error(
        `Governed branch baseline failed: ${options.developRef} does not yet contain ${options.mainRef}. Back-merge the exact main line into develop before opening the next candidate line.`
      );
    }

    ensureGitSuccess(
      ancestorCheck,
      ['merge-base', '--is-ancestor', options.mainRef, options.developRef],
      options.repoRoot
    );
  }

  return {
    repoRoot: options.repoRoot,
    mainRef: options.mainRef,
    mainSha: mainCheck.stdout,
    developRef: options.developRef,
    developSha: developCheck.stdout
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);

  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return;
  }

  const summary = assertGovernedBranchBaseline(parsed, deps);
  stdout.write(
    `[branch-governance] Verified ${summary.developRef} contains ${summary.mainRef} (${summary.mainSha} -> ${summary.developSha}).\n`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertGovernedBranchBaseline,
  getUsage,
  parseArgs,
  main
};
