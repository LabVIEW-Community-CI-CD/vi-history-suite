#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const VSCE_PACKAGE_SPEC = '@vscode/vsce@3.7.1';

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runPinnedVsce(args, deps = {}) {
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const cwd = deps.cwd ?? process.cwd();
  const result = spawnSyncImpl(
    getNpmCommand(),
    ['exec', '--yes', '--package', VSCE_PACKAGE_SPEC, '--', 'vsce', ...args],
    {
      cwd,
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main(argv = process.argv.slice(2)) {
  try {
    return runPinnedVsce(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  VSCE_PACKAGE_SPEC,
  runPinnedVsce
};
