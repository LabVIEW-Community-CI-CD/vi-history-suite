#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_REPO_URL = 'https://github.com/ni/labview-icon-editor.git';
const DEFAULT_BRANCH = 'develop';
const DEFAULT_TARGET_ROOT = path.resolve(repoRoot, '..', 'labview-icon-editor');

function getUsage() {
  return [
    'Usage: node scripts/preparePublicTestFixture.js [--target-root <path>] [--repo-url <url>] [--branch <name>] [--refresh] [--help]',
    '',
    'Clone or refresh a governed public test fixture for devcontainer/Codespaces evaluation.',
    '',
    'Defaults:',
    `  repo-url: ${DEFAULT_REPO_URL}`,
    `  branch:   ${DEFAULT_BRANCH}`,
    `  target:   ${DEFAULT_TARGET_ROOT}`,
    '',
    'Behavior:',
    '  - without --refresh: clone the fixture if it is missing, otherwise reuse the existing clone',
    '  - with --refresh: fast-forward a clean existing clone to origin/<branch>'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    targetRoot: DEFAULT_TARGET_ROOT,
    repoUrl: DEFAULT_REPO_URL,
    branch: DEFAULT_BRANCH,
    refresh: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (argument === '--refresh') {
      parsed.refresh = true;
      continue;
    }
    if (argument === '--target-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --target-root');
      }
      parsed.targetRoot = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument === '--repo-url') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --repo-url');
      }
      parsed.repoUrl = value;
      index += 1;
      continue;
    }
    if (argument === '--branch') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --branch');
      }
      parsed.branch = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed${cwd ? ` in ${cwd}` : ''}: ${String(
        result.stderr || result.stdout || 'unknown error'
      ).trim()}`
    );
  }
  return String(result.stdout ?? '').trim();
}

function ensureCleanWorkingTree(targetRoot) {
  const status = runGit(['status', '--short'], targetRoot);
  if (status) {
    throw new Error(
      `Refusing to refresh fixture with local changes at ${targetRoot}. Commit, stash, or remove the clone first.`
    );
  }
}

function ensureGitClone(targetRoot) {
  if (!fs.existsSync(path.join(targetRoot, '.git'))) {
    throw new Error(`Existing target is not a Git clone: ${targetRoot}`);
  }
}

function isShallowRepository(targetRoot) {
  return runGit(['rev-parse', '--is-shallow-repository'], targetRoot) === 'true';
}

function getCurrentBranch(targetRoot) {
  return runGit(['branch', '--show-current'], targetRoot);
}

function getNextStepMessage(targetRoot) {
  return `[public-fixture] Next: in the extension host choose File -> Open Folder... and open ${targetRoot}.\n`;
}

function writeNextStep(targetRoot, stdout) {
  stdout.write(getNextStepMessage(targetRoot));
}

function cloneFixture(options, stdout) {
  fs.mkdirSync(path.dirname(options.targetRoot), { recursive: true });
  runGit(['clone', '--branch', options.branch, options.repoUrl, options.targetRoot]);
  const head = runGit(['rev-parse', 'HEAD'], options.targetRoot);
  stdout.write(`[public-fixture] Cloned ${options.repoUrl} to ${options.targetRoot} at ${head}.\n`);
  writeNextStep(options.targetRoot, stdout);
}

function reuseFixture(options, stdout) {
  ensureGitClone(options.targetRoot);
  const head = runGit(['rev-parse', 'HEAD'], options.targetRoot);
  stdout.write(`[public-fixture] Using existing fixture at ${options.targetRoot} (${head}).\n`);
  writeNextStep(options.targetRoot, stdout);
}

function refreshFixture(options, stdout) {
  ensureGitClone(options.targetRoot);
  ensureCleanWorkingTree(options.targetRoot);

  if (isShallowRepository(options.targetRoot)) {
    runGit(['fetch', '--unshallow', 'origin', options.branch], options.targetRoot);
  } else {
    runGit(['fetch', 'origin', options.branch], options.targetRoot);
  }

  const currentBranch = getCurrentBranch(options.targetRoot);
  if (currentBranch === options.branch) {
    runGit(['merge', '--ff-only', 'FETCH_HEAD'], options.targetRoot);
  } else {
    const localBranches = runGit(
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      options.targetRoot
    )
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);

    if (localBranches.includes(options.branch)) {
      runGit(['checkout', options.branch], options.targetRoot);
      runGit(['merge', '--ff-only', 'FETCH_HEAD'], options.targetRoot);
    } else {
      runGit(['checkout', '-b', options.branch, '--track', `origin/${options.branch}`], options.targetRoot);
    }
  }

  const head = runGit(['rev-parse', 'HEAD'], options.targetRoot);
  stdout.write(
    `[public-fixture] Normalized ${options.targetRoot} to ${head} from origin/${options.branch}.\n`
  );
  writeNextStep(options.targetRoot, stdout);
}

function needsNormalization(options) {
  ensureGitClone(options.targetRoot);
  return getCurrentBranch(options.targetRoot) !== options.branch || isShallowRepository(options.targetRoot);
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);

  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return;
  }

  if (!fs.existsSync(parsed.targetRoot)) {
    cloneFixture(parsed, stdout);
    return;
  }

  if (parsed.refresh || needsNormalization(parsed)) {
    refreshFixture(parsed, stdout);
    return;
  }

  reuseFixture(parsed, stdout);
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
  DEFAULT_BRANCH,
  DEFAULT_REPO_URL,
  DEFAULT_TARGET_ROOT,
  getUsage,
  getNextStepMessage,
  parseArgs,
  main
};
