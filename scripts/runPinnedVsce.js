#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const VSCE_PACKAGE_SPEC = '@vscode/vsce@3.7.1';

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t"&^<>|()]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/(["^])/gu, '^$1')}"`;
}

function buildPinnedVsceInvocation(args, deps = {}) {
  const platform = deps.platform ?? process.platform;
  const baseArgs = ['exec', '--yes', '--package', VSCE_PACKAGE_SPEC, '--', 'vsce', ...args];
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm.cmd', ...baseArgs].map(quoteCmdArg).join(' ')]
    };
  }

  return {
    command: 'npm',
    args: baseArgs
  };
}

function runPinnedVsce(args, deps = {}) {
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const cwd = deps.cwd ?? process.cwd();
  const invocation = buildPinnedVsceInvocation(args, deps);
  const result = spawnSyncImpl(
    invocation.command,
    invocation.args,
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
  buildPinnedVsceInvocation,
  runPinnedVsce
};
