#!/usr/bin/env node

'use strict';

/**
 * NI LabVIEW Linux container diagnostics CLI (VHS-REQ-710).
 *
 * Gathers real probe readings by shelling out to `docker` and applies the pure
 * diagnostics engine (out/reporting/containerDiagnostics/labviewContainerDiagnostics.js)
 * to emit a single agent-facing readiness verdict with per-check remediation.
 *
 * Usage:
 *   node scripts/diagnoseLabviewContainer.js [--image <ref>] [--smoke]
 *     [--json | --schema | --markdown]
 *
 * Exit codes: 0 ready-to-compare, 1 not-ready (a critical check failed),
 * 2 usage / engine-load error. The docker probing is dependency-injected
 * (deps.runDocker) so this file stays unit-testable without a container.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const DEFAULT_IMAGE = 'nationalinstruments/labview:2026q1-linux';
const SCHEMA_ID = 'vi-history-suite/labview-container-diagnostics@v1';
const KNOWN_VARIANTS = ['linux-container', 'linux-host-native', 'windows-host-native'];

function parseArgs(argv = []) {
  const options = { image: DEFAULT_IMAGE, variant: 'linux-container', smoke: false, json: false, schema: false, markdown: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--image') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error('--image requires a value');
      options.image = value;
      i += 1;
    } else if (arg === '--variant') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error('--variant requires a value');
      if (!KNOWN_VARIANTS.includes(value)) {
        throw new Error(`--variant must be one of: ${KNOWN_VARIANTS.join(', ')}`);
      }
      options.variant = value;
      i += 1;
    } else if (arg === '--smoke') options.smoke = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--schema') options.schema = true;
    else if (arg === '--markdown') options.markdown = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const exclusive = [options.json, options.schema, options.markdown].filter(Boolean).length;
  if (exclusive > 1) throw new Error('--json, --schema, and --markdown are mutually exclusive.');
  return options;
}

function usage() {
  return [
    'Usage: node scripts/diagnoseLabviewContainer.js [--image <ref>] [--variant <linux-container|linux-host-native|windows-host-native>] [--smoke] [--json|--schema|--markdown]',
    '',
    'Reports whether an NI LabVIEW runtime (the Linux container or a host-native LabVIEW install) is set up',
    'and ready to run a real VI comparison, with ordered fail-closed checks and per-check remediation.',
    '--smoke also launches LabVIEWCLI.'
  ].join('\n');
}

/** In-container probe script: emits one JSON line describing the LabVIEW tooling. */
const IN_CONTAINER_PROBE = [
  'labviewcli=$(command -v LabVIEWCLI 2>/dev/null || true)',
  'engine=$(ls -d /usr/local/natinst/LabVIEW-*-64 2>/dev/null | head -1 || true)',
  'year=$(printf "%s" "$engine" | grep -oE "[0-9]{4}" | head -1 || true)',
  'lvcompare=$([ -d /usr/local/natinst/lvcompare ] && echo true || echo false)',
  // Licensing state cannot be reliably determined from inside the container by a
  // shell probe (NI License Manager presence does not imply activation), so it is
  // honestly reported as "unknown"; the evaluator treats that as an advisory
  // warning and still runs comparisons.
  'lic="unknown"',
  'printf \'{"labviewCliPath":"%s","labviewEnginePath":"%s","labviewYear":"%s","lvcompare":%s,"licensing":"%s"}\\n\' "$labviewcli" "$engine" "$year" "$lvcompare" "$lic"'
].join('; ');

function defaultRunDocker(args, { timeoutMs = 120000 } = {}, exec = execFileSync) {
  try {
    const stdout = exec('docker', args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout: String(stdout), code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? (error.message ?? '')),
      code: typeof error.status === 'number' ? error.status : null
    };
  }
}

/** Gather raw probes for the engine. `deps.runDocker` is injectable for tests. */
function gatherProbes(options, deps = {}) {
  if (options.variant === 'windows-host-native') {
    return gatherWindowsHostNativeProbes(options, deps);
  }
  if (options.variant === 'linux-host-native') {
    return gatherHostNativeProbes(options, deps);
  }
  // deps.execFileSync lets tests drive the DEFAULT runners (below) without a real
  // subprocess; production passes no deps.execFileSync and uses the real builtin.
  const exec = deps.execFileSync ?? execFileSync;
  const runDocker = deps.runDocker ?? ((dockerArgs, options) => defaultRunDocker(dockerArgs, options, exec));
  const platform = deps.platform ?? process.platform;
  const which = deps.which ?? ((cmd) => {
    try {
      if (platform === 'win32') {
        // Windows hosts have no POSIX `sh`, so `sh -lc "command -v <cmd>"` throws
        // ENOENT and would false-negative an installed Docker CLI. `where` is the
        // Windows PATH resolver and exits 0 when the command resolves (including
        // the `.exe` Docker Desktop installs).
        exec('where', [cmd], { stdio: 'ignore' });
      } else {
        exec('sh', ['-lc', `command -v ${cmd}`], { stdio: 'ignore' });
      }
      return true;
    } catch {
      return false;
    }
  });

  const dockerCliAvailable = which('docker');
  let dockerServerVersion = null;
  if (dockerCliAvailable) {
    const v = runDocker(['version', '--format', '{{.Server.Version}}']);
    if (v.ok && v.stdout.trim()) dockerServerVersion = v.stdout.trim();
  }

  let imagePresent = false;
  let imageSizeBytes = null;
  if (dockerServerVersion) {
    const insp = runDocker(['image', 'inspect', options.image, '--format', '{{.Size}}']);
    if (insp.ok && insp.stdout.trim()) {
      imagePresent = true;
      const n = Number(insp.stdout.trim());
      imageSizeBytes = Number.isFinite(n) ? n : null;
    }
  }

  let labviewCliPath = null;
  let labviewEnginePath = null;
  let labviewYear = null;
  let lvcomparePresent = false;
  let licensing = 'unknown';
  if (imagePresent) {
    const probe = runDocker(['run', '--rm', '--entrypoint', '/bin/bash', options.image, '-lc', IN_CONTAINER_PROBE]);
    const line = (probe.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
    try {
      const parsed = JSON.parse(line);
      labviewCliPath = parsed.labviewCliPath || null;
      labviewEnginePath = parsed.labviewEnginePath || null;
      labviewYear = parsed.labviewYear || null;
      lvcomparePresent = parsed.lvcompare === true;
      if (['activated', 'evaluation', 'unlicensed', 'unknown'].includes(parsed.licensing)) licensing = parsed.licensing;
    } catch {
      // leave defaults; the engine records the in-container checks as fail.
    }
  }

  let cliLaunch = null;
  if (options.smoke && labviewCliPath) {
    const run = runDocker(['run', '--rm', '--entrypoint', '/bin/bash', options.image, '-lc', 'LabVIEWCLI -Version 2>&1 | head -5; exit ${PIPESTATUS[0]}'], { timeoutMs: 240000 });
    const versionLine = (run.stdout || '').split(/\r?\n/).find((l) => /\d+\.\d+/.test(l)) || null;
    cliLaunch = { ok: run.ok, version: versionLine ? versionLine.trim() : null, exitCode: run.code };
  }

  return {
    imageRef: options.image,
    variant: 'linux-container',
    dockerCliAvailable,
    dockerServerVersion,
    imagePresent,
    imageSizeBytes,
    labviewCliPath,
    labviewEnginePath,
    labviewYear,
    lvcomparePresent,
    licensing,
    cliLaunch,
    comparisonSmoke: null
  };
}

/** Probe the host-native LabVIEW install directly (no docker). */
function gatherHostNativeProbes(options, deps = {}) {
  // deps.execFileSync lets tests drive the DEFAULT host runner without a real
  // subprocess; production passes no deps.execFileSync and uses the real builtin.
  const exec = deps.execFileSync ?? execFileSync;
  const runHost =
    deps.runHost ??
    ((script) => {
      try {
        return { ok: true, stdout: String(exec('sh', ['-lc', script], { encoding: 'utf8' })), code: 0 };
      } catch (error) {
        return { ok: false, stdout: String(error.stdout ?? ''), code: typeof error.status === 'number' ? error.status : null };
      }
    });
  const cli = runHost('command -v LabVIEWCLI 2>/dev/null || true').stdout.trim();
  const engine = runHost('ls -d /usr/local/natinst/LabVIEW-*-64 2>/dev/null | head -1 || true').stdout.trim();
  const yearMatch = engine.match(/\d{4}/);
  const lvcompare = runHost('[ -d /usr/local/natinst/lvcompare ] && echo true || echo false').stdout.trim() === 'true';
  let cliLaunch = null;
  if (options.smoke && cli) {
    // Capture LabVIEWCLI's own exit code BEFORE the `| head` pipe: `${PIPESTATUS[0]}`
    // is Bash-only and breaks under a dash `/bin/sh`. This form is POSIX-portable.
    const run = runHost('out=$(LabVIEWCLI -Version 2>&1); rc=$?; printf "%s\\n" "$out" | head -5; exit $rc');
    const versionLine = (run.stdout || '').split(/\r?\n/).find((l) => /\d+\.\d+/.test(l)) || null;
    cliLaunch = { ok: run.ok, version: versionLine ? versionLine.trim() : null, exitCode: run.code };
  }
  return {
    imageRef: options.image,
    variant: 'linux-host-native',
    dockerCliAvailable: false,
    dockerServerVersion: null,
    imagePresent: false,
    imageSizeBytes: null,
    labviewCliPath: cli || null,
    labviewEnginePath: engine || null,
    labviewYear: yearMatch ? yearMatch[0] : null,
    lvcomparePresent: lvcompare,
    licensing: 'unknown',
    cliLaunch,
    comparisonSmoke: null
  };
}

/**
 * Probe a host-native Windows LabVIEW install directly (no docker). Mirrors the
 * Linux host probe but resolves Windows tooling: LabVIEWCLI.exe on PATH, the
 * newest `LabVIEW <year>` install directory under Program Files, and LVCompare.exe
 * under the NI shared directory. `deps.runHost` is injectable so the parsing is
 * unit-tested without a real Windows host or PowerShell.
 */
function gatherWindowsHostNativeProbes(options, deps = {}) {
  const exec = deps.execFileSync ?? execFileSync;
  const runHost =
    deps.runHost ??
    ((script) => {
      try {
        return {
          ok: true,
          stdout: String(exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })),
          code: 0
        };
      } catch (error) {
        return { ok: false, stdout: String(error.stdout ?? ''), code: typeof error.status === 'number' ? error.status : null };
      }
    });
  // Get-Command resolves LabVIEWCLI.exe on PATH and returns its source path.
  const cli = runHost('(Get-Command LabVIEWCLI.exe -ErrorAction SilentlyContinue).Source').stdout.trim();
  // Newest `LabVIEW <year>` install directory under Program Files.
  const engine = runHost(
    "(Get-ChildItem 'C:\\Program Files\\National Instruments' -Directory -Filter 'LabVIEW *' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).FullName"
  ).stdout.trim();
  const yearMatch = engine.match(/\d{4}/);
  // Check BOTH Program Files roots: LabVIEW's shared tooling can live under
  // Program Files (x86). LVCompare is advisory only, so this just keeps the
  // informational signal accurate; it never blocks readiness.
  const lvcompare =
    runHost(
      "if ((Test-Path 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe') -or (Test-Path 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe')) { 'True' } else { 'False' }"
    )
      .stdout.trim()
      .toLowerCase() === 'true';
  let cliLaunch = null;
  if (options.smoke && cli) {
    const run = runHost('$out = & LabVIEWCLI -Version 2>&1 | Out-String; Write-Output $out');
    const versionLine = (run.stdout || '').split(/\r?\n/).find((l) => /\d+\.\d+/.test(l)) || null;
    cliLaunch = { ok: run.ok, version: versionLine ? versionLine.trim() : null, exitCode: run.code };
  }
  return {
    imageRef: options.image,
    variant: 'windows-host-native',
    dockerCliAvailable: false,
    dockerServerVersion: null,
    imagePresent: false,
    imageSizeBytes: null,
    labviewCliPath: cli || null,
    labviewEnginePath: engine || null,
    labviewYear: yearMatch ? yearMatch[0] : null,
    lvcomparePresent: lvcompare,
    licensing: 'unknown',
    cliLaunch,
    comparisonSmoke: null
  };
}

function renderText(result) {
  const target = result.variant.endsWith('-host-native') ? 'host-native LabVIEW' : result.imageRef;
  const lines = [`NI LabVIEW diagnostics [${result.variant}] — ${target}`, ''];
  const mark = { pass: '✔', warn: '!', fail: '✘', skip: '·' };
  for (const c of result.checks) {
    lines.push(`  ${mark[c.status] || '?'} [${c.status}] ${c.title} — ${c.detail}`);
    if (c.remediation) lines.push(`        → ${c.remediation}`);
  }
  lines.push('');
  lines.push(`overall=${result.overall}  readyToCompare=${result.readyToCompare}  failures=${result.failures.length}`);
  if (result.nextAction) lines.push(`next: ${result.nextAction}`);
  return lines.join('\n');
}

function renderMarkdown(result) {
  const target = result.variant.endsWith('-host-native') ? 'host-native LabVIEW' : result.imageRef;
  const lines = [
    `## NI LabVIEW diagnostics [${result.variant}] — \`${target}\``,
    '',
    `**readyToCompare:** ${result.readyToCompare ? '✅ yes' : '❌ no'} · **overall:** \`${result.overall}\``,
    '',
    '| Check | Status | Detail | Remediation |',
    '| --- | --- | --- | --- |'
  ];
  for (const c of result.checks) {
    lines.push(`| ${c.title} | \`${c.status}\` | ${c.detail} | ${c.remediation ?? ''} |`);
  }
  if (result.nextAction) lines.push('', `**Next action:** ${result.nextAction}`);
  return lines.join('\n');
}

function buildSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SCHEMA_ID,
    title: 'NI LabVIEW container diagnostics',
    type: 'object',
    required: ['schema', 'schemaVersion', 'imageRef', 'checks', 'overall', 'readyToCompare', 'failures', 'nextAction'],
    properties: {
      schema: { const: SCHEMA_ID },
      schemaVersion: { const: 1 },
      imageRef: { type: 'string' },
      overall: { type: 'string', enum: ['pass', 'warn', 'fail', 'skip'] },
      readyToCompare: { type: 'boolean' },
      failures: { type: 'array', items: { type: 'string' } },
      nextAction: { type: ['string', 'null'] },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['checkId', 'title', 'status', 'detail', 'remediation'],
          properties: {
            checkId: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'string', enum: ['pass', 'warn', 'fail', 'skip'] },
            detail: { type: 'string' },
            remediation: { type: ['string', 'null'] }
          }
        }
      }
    }
  };
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
  if (options.schema) {
    stdout.write(`${JSON.stringify(buildSchema(), null, 2)}\n`);
    return 0;
  }

  let evaluate = deps.evaluate;
  if (!evaluate) {
    try {
      const cwd = deps.cwd || process.cwd();
      evaluate = require(path.resolve(cwd, 'out/reporting/containerDiagnostics/labviewContainerDiagnostics.js')).evaluateLabviewContainerDiagnostics;
    } catch (error) {
      stderr.write(
        `Failed to load the compiled diagnostics engine; run \`npm run compile\` first: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 2;
    }
  }

  let result;
  try {
    const probes = gatherProbes(options, deps);
    result = evaluate(probes);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (options.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (options.markdown) stdout.write(`${renderMarkdown(result)}\n`);
  else stdout.write(`${renderText(result)}\n`);

  return result.readyToCompare ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, parseArgs, gatherProbes, buildSchema, renderText, renderMarkdown, DEFAULT_IMAGE, SCHEMA_ID, IN_CONTAINER_PROBE };
