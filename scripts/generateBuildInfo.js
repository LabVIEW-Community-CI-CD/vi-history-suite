#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const UNKNOWN_COMMIT = '<unknown>';

function getGitCommit() {
  try {
    const stdout = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return stdout.trim();
  } catch {
    return UNKNOWN_COMMIT;
  }
}

function getPackageVersion(repoRoot) {
  const manifestPath = path.join(repoRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
}

function formatShortCommit(commit) {
  if (commit === UNKNOWN_COMMIT) {
    return 'unknown';
  }
  return commit.slice(0, 7);
}

function generateBuildInfo(deps = {}) {
  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..');
  const outDir = deps.outDir ?? path.join(repoRoot, 'out');
  const getCommit = deps.getGitCommit ?? getGitCommit;
  const getVersion = deps.getPackageVersion ?? getPackageVersion;
  const writeFile = deps.writeFile ?? fs.writeFileSync;
  const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;

  const extensionVersion = getVersion(repoRoot);
  const extensionCommit = getCommit();

  const buildInfo = {
    extensionVersion,
    extensionCommit
  };

  mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'buildInfo.json');
  writeFile(outputPath, JSON.stringify(buildInfo, null, 2) + '\n', 'utf8');

  return {
    outputPath,
    buildInfo
  };
}

function main(deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  try {
    const result = generateBuildInfo(deps);
    const shortCommit = formatShortCommit(result.buildInfo.extensionCommit);
    stdout.write(
      `[build-info] Generated ${result.outputPath}: ${result.buildInfo.extensionVersion}+${shortCommit}\n`
    );
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
  UNKNOWN_COMMIT,
  formatShortCommit,
  generateBuildInfo,
  getGitCommit,
  getPackageVersion,
  main
};
