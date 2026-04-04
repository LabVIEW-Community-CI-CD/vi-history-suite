#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { VSCE_PACKAGE_SPEC } = require('./runPinnedVsce');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const manifestPath = path.join(repoRoot, 'package.json');
const FORBIDDEN_PACKAGED_PATH_SEGMENTS = [
  '/node_modules/',
  '/.cache/',
  '/.vscode-test/'
];
const FORBIDDEN_PACKAGED_PATH_SUFFIXES = [
  '/node_modules',
  '/.cache',
  '/.vscode-test'
];
const FORBIDDEN_PACKAGE_NAMES = ['glob', 'test-exclude'];

function normalizePackagedPath(value) {
  return String(value).trim().replaceAll('\\', '/');
}

function parseVsceListOutput(stdout) {
  return String(stdout)
    .split(/\r?\n/u)
    .map((line) => normalizePackagedPath(line))
    .filter(Boolean)
    .filter((line) => !line.startsWith('WARNING'));
}

function findRuntimeSurfaceViolations({ manifest, packagedPaths }) {
  const violations = [];
  const runtimeDependencies = Object.keys(manifest.dependencies ?? {});
  if (runtimeDependencies.length > 0) {
    violations.push(
      `Runtime dependencies are not allowed in package.json: ${runtimeDependencies.join(', ')}`
    );
  }

  const forbiddenPaths = packagedPaths.filter((packagedPath) => {
    const normalized = `/${packagedPath.replace(/^\/+/u, '')}`;
    return (
      FORBIDDEN_PACKAGED_PATH_SEGMENTS.some((segment) => normalized.includes(segment)) ||
      FORBIDDEN_PACKAGED_PATH_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
    );
  });

  if (forbiddenPaths.length > 0) {
    violations.push(
      `Packaged VSIX surface includes forbidden runtime paths: ${forbiddenPaths.join(', ')}`
    );
  }

  const leakedPackages = packagedPaths.filter((packagedPath) =>
    FORBIDDEN_PACKAGE_NAMES.some((name) => packagedPath.includes(`/${name}/`))
  );

  if (leakedPackages.length > 0) {
    violations.push(
      `Packaged VSIX surface includes forbidden package payloads: ${leakedPackages.join(', ')}`
    );
  }

  return violations;
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function auditPackagedRuntimeSurface(deps = {}) {
  const cwd = deps.cwd ?? repoRoot;
  const spawnSyncImpl = deps.spawnSync ?? require('node:child_process').spawnSync;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const manifest = deps.manifest ?? JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  stdout.write(
    `[package-audit] Listing packaged VSIX surface via pinned ${VSCE_PACKAGE_SPEC}.\n`
  );
  const result = spawnSyncImpl(
    getNpmCommand(),
    ['exec', '--yes', '--package', VSCE_PACKAGE_SPEC, '--', 'vsce', 'ls', '--dependencies', '--no-yarn'],
    {
      cwd,
      encoding: 'utf8',
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(
      result.stderr?.trim()
        ? `vsce ls failed: ${result.stderr.trim()}`
        : `vsce ls failed with exit code ${result.status}`
    );
  }

  const packagedPaths = parseVsceListOutput(result.stdout ?? '');
  const violations = findRuntimeSurfaceViolations({
    manifest,
    packagedPaths
  });

  if (violations.length > 0) {
    stderr.write(`${violations.join('\n')}\n`);
    throw new Error('Packaged runtime surface audit failed.');
  }

  stdout.write('[package-audit] Packaged runtime surface passed.\n');
  return {
    packagedPaths
  };
}

function main() {
  try {
    auditPackagedRuntimeSurface();
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  FORBIDDEN_PACKAGE_NAMES,
  FORBIDDEN_PACKAGED_PATH_SEGMENTS,
  FORBIDDEN_PACKAGED_PATH_SUFFIXES,
  VSCE_PACKAGE_SPEC,
  auditPackagedRuntimeSurface,
  findRuntimeSurfaceViolations,
  parseVsceListOutput
};
