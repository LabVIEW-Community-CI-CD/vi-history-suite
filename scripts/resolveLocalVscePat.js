#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VSCE_PAT_FILE_ENV = 'VIHS_VSCE_PAT_FILE';
const PLACEHOLDER = 'REPLACE_WITH_VSCE_MARKETPLACE_PAT';
const VSCE_PAT_BASENAME = 'pat-azdo.txt';
const WINDOWS_VSCE_PAT_FILE_EXAMPLE =
  'C:\\Users\\sveld\\.codex\\.sandbox-secrets\\pat-azdo.txt';
const POSIX_VSCE_PAT_FILE_EXAMPLE =
  '/home/sveld/.codex/.sandbox-secrets/pat-azdo.txt';

function buildDefaultVscePatFilePath(homeDir = os.homedir()) {
  return path.resolve(homeDir, '.codex', '.sandbox-secrets', VSCE_PAT_BASENAME);
}

const DEFAULT_VSCE_PAT_FILE = buildDefaultVscePatFilePath();

function resolveVscePatFilePath(env = process.env) {
  const override = `${env[VSCE_PAT_FILE_ENV] ?? ''}`.trim();
  if (override) {
    return path.resolve(override);
  }

  return DEFAULT_VSCE_PAT_FILE;
}

function inspectVscePatFile(tokenFilePath = resolveVscePatFilePath(), fsApi = fs) {
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

function readVscePat(env = process.env, fsApi = fs) {
  const inspection = inspectVscePatFile(resolveVscePatFilePath(env), fsApi);
  if (!inspection.ok) {
    throw new Error(`Local vi-history-suite VSCE PAT resolution failed: ${inspection.reason}`);
  }

  return fsApi.readFileSync(inspection.path, 'utf8').trim();
}

function getResolveLocalVscePatUsage() {
  return [
    'Usage: node scripts/resolveLocalVscePat.js [--json] [--print-path] [--help]',
    '',
    'Resolve the local vi-history-suite VS Code Marketplace PAT file fail-closed without printing the secret.',
    `When ${VSCE_PAT_FILE_ENV} is unset, the default path is ${DEFAULT_VSCE_PAT_FILE}.`,
    `Governed examples: Windows ${WINDOWS_VSCE_PAT_FILE_EXAMPLE} | Linux/WSL ${POSIX_VSCE_PAT_FILE_EXAMPLE}.`
  ].join('\n');
}

function parseResolveLocalVscePatArgs(argv) {
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

function runResolveLocalVscePat(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseResolveLocalVscePatArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const env = deps.env ?? process.env;
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getResolveLocalVscePatUsage()}\n`);
    return { outcome: 'help' };
  }

  const inspection = inspectVscePatFile(resolveVscePatFilePath(env), fsApi);
  if (parsed.printPath) {
    stdout.write(`${inspection.path}\n`);
  } else if (parsed.json) {
    stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);
  } else {
    const state = inspection.ok ? 'ok' : 'failed';
    stdout.write(`vi-history-suite local VS Code Marketplace PAT locator: ${state}\n`);
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
    const result = runResolveLocalVscePat();
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
  DEFAULT_VSCE_PAT_FILE,
  PLACEHOLDER,
  POSIX_VSCE_PAT_FILE_EXAMPLE,
  VSCE_PAT_BASENAME,
  VSCE_PAT_FILE_ENV,
  WINDOWS_VSCE_PAT_FILE_EXAMPLE,
  buildDefaultVscePatFilePath,
  getResolveLocalVscePatUsage,
  inspectVscePatFile,
  parseResolveLocalVscePatArgs,
  readVscePat,
  resolveVscePatFilePath,
  runResolveLocalVscePat
};
