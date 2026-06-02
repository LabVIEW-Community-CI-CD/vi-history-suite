#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const VSCE_PACKAGE_NAME = '@vscode/vsce';
const VSCE_PACKAGE_VERSION = '3.9.1';
const VSCE_PACKAGE_SPEC = `${VSCE_PACKAGE_NAME}@${VSCE_PACKAGE_VERSION}`;

function resolveLocalVsceCliPath(deps = {}) {
  const cwd = deps.cwd ?? process.cwd();
  const requireResolveImpl = deps.requireResolve ?? require.resolve;
  const readFileSyncImpl = deps.readFileSync ?? fs.readFileSync;
  const packageJsonPath = requireResolveImpl(`${VSCE_PACKAGE_NAME}/package.json`, {
    paths: [cwd]
  });
  const manifest = JSON.parse(readFileSyncImpl(packageJsonPath, 'utf8'));

  if (manifest.version !== VSCE_PACKAGE_VERSION) {
    throw new Error(
      `Expected ${VSCE_PACKAGE_SPEC}, but resolved ${VSCE_PACKAGE_NAME}@${manifest.version}.`
    );
  }

  const binPath = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.vsce;
  if (typeof binPath !== 'string' || binPath.trim().length === 0) {
    throw new Error(`Resolved ${VSCE_PACKAGE_SPEC} does not declare a vsce CLI bin.`);
  }

  return path.resolve(path.dirname(packageJsonPath), binPath);
}

function buildPinnedVsceInvocation(args, deps = {}) {
  const vsceCliPath = deps.vsceCliPath ?? resolveLocalVsceCliPath(deps);
  return {
    command: deps.execPath ?? process.execPath,
    args: [vsceCliPath, ...args]
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
  VSCE_PACKAGE_NAME,
  VSCE_PACKAGE_SPEC,
  VSCE_PACKAGE_VERSION,
  buildPinnedVsceInvocation,
  resolveLocalVsceCliPath,
  resolvePathApi,
  resolveVsceOutputPath,
  runPinnedVsce
};
