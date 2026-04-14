#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_GITLAB_API_TOKEN_FILE =
  '/home/sveld/.config/codex/secrets/vi-history-suite.gitlab-api-token.txt';
const GITLAB_API_TOKEN_FILE_ENV = 'VIHS_GITLAB_API_TOKEN_FILE';
const PLACEHOLDER = 'REPLACE_WITH_VI_HISTORY_SUITE_GITLAB_API_TOKEN';

function resolveGitLabApiTokenFilePath(env = process.env) {
  const override = `${env[GITLAB_API_TOKEN_FILE_ENV] ?? ''}`.trim();
  if (override) {
    return path.resolve(override);
  }

  return DEFAULT_GITLAB_API_TOKEN_FILE;
}

function inspectGitLabApiTokenFile(
  tokenFilePath = resolveGitLabApiTokenFilePath(),
  fsApi = fs
) {
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

function readGitLabApiToken(env = process.env, fsApi = fs) {
  const inspection = inspectGitLabApiTokenFile(resolveGitLabApiTokenFilePath(env), fsApi);
  if (!inspection.ok) {
    throw new Error(`Local vi-history-suite GitLab API token resolution failed: ${inspection.reason}`);
  }

  return fsApi.readFileSync(inspection.path, 'utf8').trim();
}

function getResolveLocalGitLabApiTokenUsage() {
  return [
    'Usage: node scripts/resolveLocalGitLabApiToken.js [--json] [--print-path] [--help]',
    '',
    'Resolve the local vi-history-suite GitLab API token file fail-closed.',
    `When ${GITLAB_API_TOKEN_FILE_ENV} is unset, the default path is ${DEFAULT_GITLAB_API_TOKEN_FILE}.`
  ].join('\n');
}

function parseResolveLocalGitLabApiTokenArgs(argv) {
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

function runResolveLocalGitLabApiToken(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseResolveLocalGitLabApiTokenArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const env = deps.env ?? process.env;
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getResolveLocalGitLabApiTokenUsage()}\n`);
    return { outcome: 'help' };
  }

  const inspection = inspectGitLabApiTokenFile(resolveGitLabApiTokenFilePath(env), fsApi);
  if (parsed.printPath) {
    stdout.write(`${inspection.path}\n`);
  } else if (parsed.json) {
    stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);
  } else {
    const state = inspection.ok ? 'ok' : 'failed';
    stdout.write(`vi-history-suite local token locator: ${state}\n`);
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
    const result = runResolveLocalGitLabApiToken();
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
  DEFAULT_GITLAB_API_TOKEN_FILE,
  GITLAB_API_TOKEN_FILE_ENV,
  PLACEHOLDER,
  getResolveLocalGitLabApiTokenUsage,
  parseResolveLocalGitLabApiTokenArgs,
  resolveGitLabApiTokenFilePath,
  inspectGitLabApiTokenFile,
  readGitLabApiToken,
  runResolveLocalGitLabApiToken
};
