#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
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

function resolveVsceOutputPath(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--out' || argument === '-o') {
      const nextArgument = args[index + 1];
      if (nextArgument && nextArgument.trim()) {
        return nextArgument.trim();
      }
      return undefined;
    }

    if (argument.startsWith('--out=')) {
      return argument.slice('--out='.length).trim() || undefined;
    }
  }

  return undefined;
}

function resolvePathApi(platform = process.platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function runPinnedVsce(args, deps = {}) {
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const cwd = deps.cwd ?? process.cwd();
  const platform = deps.platform ?? process.platform;
  const mkdirSyncImpl = deps.mkdirSync ?? fs.mkdirSync;
  const outPath = resolveVsceOutputPath(args);
  if (outPath) {
    const pathApi = resolvePathApi(platform);
    mkdirSyncImpl(pathApi.dirname(pathApi.resolve(cwd, outPath)), { recursive: true });
  }
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
  resolvePathApi,
  resolveVsceOutputPath,
  runPinnedVsce
};
