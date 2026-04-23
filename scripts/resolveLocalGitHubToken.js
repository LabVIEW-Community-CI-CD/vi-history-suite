#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const GITHUB_TOKEN_FILE_ENV = 'VIHS_GITHUB_TOKEN_FILE';
const PLACEHOLDER = 'REPLACE_WITH_VI_HISTORY_SUITE_GITHUB_TOKEN';
const GITHUB_TOKEN_BASENAME = 'github-token.txt';
const WINDOWS_GITHUB_TOKEN_FILE_EXAMPLE =
  'C:\\Users\\sveld\\.codex\\.sandbox-secrets\\github-token.txt';
const POSIX_GITHUB_TOKEN_FILE_EXAMPLE =
  '/home/sveld/.codex/.sandbox-secrets/github-token.txt';

function buildDefaultGitHubTokenFilePath(homeDir = os.homedir()) {
  return path.resolve(homeDir, '.codex', '.sandbox-secrets', GITHUB_TOKEN_BASENAME);
}

const DEFAULT_GITHUB_TOKEN_FILE = buildDefaultGitHubTokenFilePath();

function resolveGitHubTokenFilePath(env = process.env) {
  const override = `${env[GITHUB_TOKEN_FILE_ENV] ?? ''}`.trim();
  if (override) {
    return path.resolve(override);
  }

  return DEFAULT_GITHUB_TOKEN_FILE;
}

function inspectGitHubTokenFile(tokenFilePath = resolveGitHubTokenFilePath(), fsApi = fs) {
  const result = {
    path: tokenFilePath,
    exists: false,
    tokenPresent: false,
    placeholder: false,
    ok: false
  };

  if (!fsApi.existsSync(tokenFilePath)) {
    result.reason = 'missing token file';
    return result;
  }

  result.exists = true;
  const token = fsApi.readFileSync(tokenFilePath, 'utf8').trim();
  result.tokenPresent = token.length > 0;
  result.placeholder = token === PLACEHOLDER;

  if (!token) {
    result.reason = 'empty token file';
    return result;
  }

  if (token === PLACEHOLDER) {
    result.reason = 'placeholder token file';
    return result;
  }

  result.ok = true;
  return result;
}

function readGitHubToken(env = process.env, fsApi = fs) {
  const inspection = inspectGitHubTokenFile(resolveGitHubTokenFilePath(env), fsApi);
  if (!inspection.ok) {
    throw new Error(`Local vi-history-suite GitHub token resolution failed: ${inspection.reason}`);
  }

  return fsApi.readFileSync(inspection.path, 'utf8').trim();
}

function getResolveLocalGitHubTokenUsage() {
  return [
    'Usage: node scripts/resolveLocalGitHubToken.js [--json] [--print-path] [--help]',
    '',
    'Resolve the local vi-history-suite GitHub token file fail-closed.',
    `When ${GITHUB_TOKEN_FILE_ENV} is unset, the default path is ${DEFAULT_GITHUB_TOKEN_FILE}.`,
    `Governed examples: Windows ${WINDOWS_GITHUB_TOKEN_FILE_EXAMPLE} | Linux/WSL ${POSIX_GITHUB_TOKEN_FILE_EXAMPLE}.`
  ].join('\n');
}

function parseResolveLocalGitHubTokenArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    printPath: false
  };

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--json') {
      parsed.json = true;
      continue;
    }

    if (argument === '--print-path') {
      parsed.printPath = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function runResolveLocalGitHubToken(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseResolveLocalGitHubTokenArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const env = deps.env ?? process.env;
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getResolveLocalGitHubTokenUsage()}\n`);
    return { outcome: 'help' };
  }

  const inspection = inspectGitHubTokenFile(resolveGitHubTokenFilePath(env), fsApi);
  if (parsed.printPath) {
    stdout.write(`${inspection.path}\n`);
  } else if (parsed.json) {
    stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);
  } else {
    const state = inspection.ok ? 'ok' : 'failed';
    stdout.write(`vi-history-suite local GitHub token locator: ${state}\n`);
    stdout.write(`- path: ${inspection.path}\n`);
    if (!inspection.ok) {
      stdout.write(`- reason: ${inspection.reason}\n`);
    }
  }

  return {
    outcome: inspection.ok ? 'resolved' : 'failed',
    inspection
  };
}

function main() {
  try {
    const result = runResolveLocalGitHubToken();
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_GITHUB_TOKEN_FILE,
  GITHUB_TOKEN_BASENAME,
  GITHUB_TOKEN_FILE_ENV,
  PLACEHOLDER,
  POSIX_GITHUB_TOKEN_FILE_EXAMPLE,
  WINDOWS_GITHUB_TOKEN_FILE_EXAMPLE,
  buildDefaultGitHubTokenFilePath,
  getResolveLocalGitHubTokenUsage,
  inspectGitHubTokenFile,
  parseResolveLocalGitHubTokenArgs,
  readGitHubToken,
  resolveGitHubTokenFilePath,
  runResolveLocalGitHubToken
};
