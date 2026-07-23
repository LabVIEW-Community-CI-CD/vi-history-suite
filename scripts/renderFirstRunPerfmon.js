#!/usr/bin/env node

'use strict';

/**
 * First-run performance-monitor renderer CLI (VHS-REQ-707.12).
 *
 * Turns a captured first-run perfmon trace into the shared artifact and its
 * pull-request comment, for EITHER mirror source (a self-hosted Vagrant runner
 * or a Docker container). CI / a runner invokes this after a first-time run to
 * print the performance trace on the pull request; the same JSON feeds the
 * eventual TDMS embedding.
 *
 * Usage:
 *   node scripts/renderFirstRunPerfmon.js --pdh-csv <path> --source <docker-container|self-hosted-runner>
 *     [--fingerprint <path>] [--window <path>] [--actor <label>] [--json | --markdown]
 *
 * `--window <path>` reads a JSON `{ startMs, endMs, cycles? }` capture window
 * (wall time = endMs - startMs). `--fingerprint <path>` reads a JSON fingerprint
 * whose `actor` names the actor when `--actor` is absent. Default output is the
 * Markdown pull-request comment; `--json` emits the raw artifact.
 *
 * Exit codes: 0 success, 2 usage / load / read error. The engine, filesystem,
 * and clock are dependency-injected so this stays unit-testable without a real
 * capture or the compiled build.
 */

const path = require('node:path');
const fs = require('node:fs');

const VALID_SOURCES = new Set(['docker-container', 'self-hosted-runner']);

function parseArgs(argv = []) {
  const options = {
    pdhCsv: undefined,
    source: undefined,
    fingerprint: undefined,
    window: undefined,
    actor: undefined,
    json: false,
    markdown: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return next;
    };
    if (arg === '--pdh-csv') options.pdhCsv = value();
    else if (arg === '--source') options.source = value();
    else if (arg === '--fingerprint') options.fingerprint = value();
    else if (arg === '--window') options.window = value();
    else if (arg === '--actor') options.actor = value();
    else if (arg === '--json') options.json = true;
    else if (arg === '--markdown') options.markdown = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.json && options.markdown) {
    throw new Error('--json and --markdown are mutually exclusive.');
  }
  if (!options.help) {
    if (!options.pdhCsv) throw new Error('--pdh-csv <path> is required.');
    if (!VALID_SOURCES.has(options.source)) {
      throw new Error('--source must be docker-container or self-hosted-runner.');
    }
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/renderFirstRunPerfmon.js --pdh-csv <path> --source <docker-container|self-hosted-runner>',
    '  [--fingerprint <path>] [--window <path>] [--actor <label>] [--json | --markdown]',
    '',
    'Renders a captured first-run perfmon PDH-CSV as the first-run-perfmon@v1 artifact',
    '(--json) or a pull-request comment with a Mermaid trace (default / --markdown).'
  ].join('\n');
}

/**
 * Assemble the artifact from the captured inputs. Pure aside from the injected
 * boundaries; returns the artifact so the caller renders it.
 */
function buildArtifactFromInputs(options, deps) {
  const readFile = deps.readFile;
  const mod = deps.module;
  const perf = mod.parsePdhCsv(readFile(options.pdhCsv));

  let actor = options.actor;
  let capturedAtIso;
  let wallMs = null;
  let cycles = [];

  if (options.fingerprint) {
    const fingerprint = JSON.parse(readFile(options.fingerprint));
    if (!actor && typeof fingerprint.actor === 'string') {
      actor = fingerprint.actor;
    }
  }
  if (options.window) {
    const window = JSON.parse(readFile(options.window));
    if (typeof window.startMs === 'number' && typeof window.endMs === 'number') {
      wallMs = window.endMs - window.startMs;
      capturedAtIso = new Date(window.startMs).toISOString();
    }
    if (Array.isArray(window.cycles)) {
      cycles = window.cycles;
    }
  }
  if (!capturedAtIso) {
    capturedAtIso = new Date(deps.now()).toISOString();
  }

  return mod.buildFirstRunPerfmonArtifact({
    source: options.source,
    actor: actor || options.source,
    capturedAtIso,
    perf,
    wallMs,
    cycles
  });
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (options.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  let mod = deps.module;
  if (!mod) {
    try {
      const cwd = deps.cwd || process.cwd();
      mod = require(path.resolve(cwd, 'out/reporting/mirror/perfmonSampleSeries.js'));
    } catch (error) {
      stderr.write(
        `Failed to load the compiled perfmon module; run \`npm run compile\` first: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      return 2;
    }
  }

  const readFile = deps.readFile ?? ((filePath) => fs.readFileSync(filePath, 'utf8'));
  const now = deps.now ?? (() => Date.now());
  try {
    const artifact = buildArtifactFromInputs(options, { readFile, module: mod, now });
    if (options.json) {
      stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    } else {
      stdout.write(`${mod.renderFirstRunPerfmonPrComment(artifact)}\n`);
    }
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, parseArgs, usage, buildArtifactFromInputs, VALID_SOURCES };
