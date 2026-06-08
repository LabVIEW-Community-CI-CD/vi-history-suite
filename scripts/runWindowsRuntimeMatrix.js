#!/usr/bin/env node

/**
 * VHS-REQ-622 — Automated End-to-End Windows Runtime Conflict Verification Harness.
 *
 * Drives the real `vihs --validate --proof-out` CLI against a real running
 * LabVIEW 2026 process in the two steady-state bitness directions:
 *   - steady-A: HostBitness=x64, SelectedBitness=x86
 *   - steady-B: HostBitness=x86, SelectedBitness=x64
 *
 * For each scenario, the PowerShell helper at
 * `scripts/windows-runtime-matrix/Invoke-RuntimeMatrixSteadyState.ps1`
 * closes any running LabVIEW, launches the requested bitness, invokes
 * `vihs --validate --proof-out <path>`, parses the proof JSON, and asserts:
 *   - `runtimeBlockedReason === 'windows-host-bitness-conflict'`
 *   - The observed `LabVIEW.exe` ExecutablePath matches the intended
 *     bitness install root.
 *
 * The driver aggregates per-scenario outcomes into a single evidence file
 * that satisfies schema `vi-history-suite/runtime-matrix-evidence@v1`.
 * Exit code is 0 only when `summary.failed === 0` and the file was
 * written.
 *
 * Race-condition reclassification scenarios are out-of-scope per
 * VHS-REQ-622 — they remain covered by the existing unit-test contract
 * at `tests/unit/comparisonReportRuntimeExecution.test.ts`.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const EVIDENCE_SCHEMA = 'vi-history-suite/runtime-matrix-evidence@v1';
const RACE_COVERAGE_NOTE = 'covered-by-unit-tests';
const DEFAULT_EVIDENCE_OUT = path.join(
  'assurance-closeout-evidence',
  'manual-vhs-req-621.json'
);
const KNOWN_SCENARIOS = Object.freeze(['steady-A', 'steady-B']);
const SCENARIO_PARAMETERS = Object.freeze({
  'steady-A': { hostBitness: 'x64', selectedBitness: 'x86' },
  'steady-B': { hostBitness: 'x86', selectedBitness: 'x64' }
});

function parseArgs(argv) {
  const options = {
    scenario: 'all',
    labviewVersion: '2026',
    out: DEFAULT_EVIDENCE_OUT,
    proofDir: undefined,
    keepRunning: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--scenario') options.scenario = next();
    else if (arg === '--labview-version') options.labviewVersion = next();
    else if (arg === '--out') options.out = next();
    else if (arg === '--proof-dir') options.proofDir = next();
    else if (arg === '--keep-running') options.keepRunning = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (options.scenario !== 'all' && !KNOWN_SCENARIOS.includes(options.scenario)) {
    throw new Error(
      `--scenario must be one of: ${KNOWN_SCENARIOS.join(', ')}, all`
    );
  }

  return options;
}

function getUsage() {
  return [
    'Usage: node scripts/runWindowsRuntimeMatrix.js [options]',
    '',
    'Drives the VHS-REQ-622 steady-state Windows bitness-conflict scenarios',
    'against a real running LabVIEW 2026 + real vihs --validate CLI.',
    '',
    'Options:',
    '  --scenario <id>         steady-A | steady-B | all (default: all)',
    '  --labview-version <yr>  LabVIEW major version (default: 2026)',
    `  --out <path>            Evidence output (default: ${DEFAULT_EVIDENCE_OUT})`,
    '  --proof-dir <path>      Directory for per-scenario proof JSON files',
    '                          (default: alongside --out)',
    '  --keep-running          Do not close LabVIEW between scenarios',
    '  --help                  Show this help text'
  ].join('\n');
}

function selectScenarios(scenarioArg) {
  if (scenarioArg === 'all') {
    return KNOWN_SCENARIOS.slice();
  }
  return [scenarioArg];
}

function ensurePlatformGuard(platform, env) {
  if (platform === 'win32') {
    return;
  }
  if (env.VIHS_FAKE_WINDOWS === '1') {
    return;
  }
  throw new Error(
    'runWindowsRuntimeMatrix requires Windows. ' +
      'Set VIHS_FAKE_WINDOWS=1 for unit tests.'
  );
}

function resolveProofDir(options) {
  if (options.proofDir) {
    return options.proofDir;
  }
  return path.join(path.dirname(options.out), 'runtime-matrix-proofs');
}

function buildScenarioPlan(options) {
  const scenarios = selectScenarios(options.scenario);
  const proofDir = resolveProofDir(options);
  return scenarios.map((id) => {
    const parameters = SCENARIO_PARAMETERS[id];
    return {
      id,
      parameters,
      proofPath: path.join(proofDir, `${id}.proof.json`),
      logPath: path.join(proofDir, `${id}.scenario.json`)
    };
  });
}

function buildPowershellArgs(scenario, options) {
  return [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(
      'scripts',
      'windows-runtime-matrix',
      'Invoke-RuntimeMatrixSteadyState.ps1'
    ),
    '-ScenarioId',
    scenario.id,
    '-HostBitness',
    scenario.parameters.hostBitness,
    '-SelectedBitness',
    scenario.parameters.selectedBitness,
    '-LabviewVersion',
    options.labviewVersion,
    '-ProofOutPath',
    scenario.proofPath,
    '-ScenarioLogPath',
    scenario.logPath,
    options.keepRunning ? '-KeepRunning' : ''
  ].filter((value) => value !== '');
}

function readScenarioLog(scenario, deps) {
  const fsImpl = deps.fs ?? fs;
  if (!fsImpl.existsSync(scenario.logPath)) {
    return undefined;
  }
  try {
    const raw = fsImpl.readFileSync(scenario.logPath, 'utf8');
    // Windows PowerShell 5.1 `Set-Content -Encoding UTF8` (the host that runs
    // the helper) prepends a UTF-8 BOM; strip a leading BOM so JSON.parse does
    // not choke on it.
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    return {
      readError: error instanceof Error ? error.message : String(error)
    };
  }
}

function summarizeScenario(scenario, spawnResult, scenarioLog) {
  const expected = {
    runtimeBlockedReason: 'windows-host-bitness-conflict',
    hostBitness: scenario.parameters.hostBitness,
    selectedBitness: scenario.parameters.selectedBitness
  };
  const observed = scenarioLog?.observed ?? {
    runtimeBlockedReason: undefined,
    hostBitness: undefined,
    selectedBitness: undefined,
    labviewExecutablePath: undefined
  };
  const pass = Boolean(
    scenarioLog?.pass === true &&
      observed.runtimeBlockedReason === expected.runtimeBlockedReason &&
      observed.hostBitness === expected.hostBitness &&
      observed.selectedBitness === expected.selectedBitness
  );
  const failureReason = scenarioLog?.failureReason
    ?? (spawnResult.status === 0 ? undefined : `powershell-exit-${spawnResult.status}`);

  return {
    id: scenario.id,
    expected,
    observed,
    pass,
    failureReason: pass ? undefined : failureReason,
    durationMs: scenarioLog?.durationMs ?? 0,
    artifacts: {
      proofPath: scenario.proofPath,
      scenarioLogPath: scenario.logPath
    }
  };
}

function buildEvidence(scenarioResults, options, deps) {
  const passed = scenarioResults.filter((result) => result.pass).length;
  const failed = scenarioResults.length - passed;
  return {
    schema: EVIDENCE_SCHEMA,
    runId: deps.now().toISOString(),
    host: {
      platform: deps.platform ?? process.platform,
      hostname: deps.hostname ? deps.hostname() : os.hostname()
    },
    labviewVersion: options.labviewVersion,
    scenarios: scenarioResults,
    summary: {
      passed,
      failed,
      raceCoverage: RACE_COVERAGE_NOTE
    }
  };
}

function writeEvidence(evidence, options, deps) {
  const fsImpl = deps.fs ?? fs;
  const outPath = path.resolve(deps.cwd ? deps.cwd() : process.cwd(), options.out);
  fsImpl.mkdirSync(path.dirname(outPath), { recursive: true });
  fsImpl.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return outPath;
}

function runRuntimeMatrix(argv, deps = {}) {
  const options = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (options.help) {
    stdout.write(`${getUsage()}\n`);
    return { exitCode: 0, evidence: undefined, evidencePath: undefined };
  }

  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  ensurePlatformGuard(platform, env);

  const plan = buildScenarioPlan(options);
  const spawnImpl = deps.spawnSync ?? spawnSync;
  const fsImpl = deps.fs ?? fs;

  const proofDir = resolveProofDir(options);
  fsImpl.mkdirSync(proofDir, { recursive: true });

  const scenarioResults = [];
  for (const scenario of plan) {
    stdout.write(`[runtime-matrix] running ${scenario.id}\n`);
    const args = buildPowershellArgs(scenario, options);
    const spawnResult = spawnImpl('powershell.exe', args, {
      cwd: deps.cwd ? deps.cwd() : process.cwd(),
      env,
      stdio: 'inherit',
      shell: false
    });
    const scenarioLog = readScenarioLog(scenario, deps);
    const summary = summarizeScenario(scenario, spawnResult, scenarioLog);
    scenarioResults.push(summary);
    if (!summary.pass) {
      stderr.write(
        `[runtime-matrix] scenario ${scenario.id} FAILED: ${summary.failureReason ?? 'unknown'}\n`
      );
    }
  }

  const evidence = buildEvidence(scenarioResults, options, {
    ...deps,
    now: deps.now ?? (() => new Date()),
    platform
  });
  const evidencePath = writeEvidence(evidence, options, deps);
  stdout.write(`[runtime-matrix] evidence written: ${evidencePath}\n`);

  const exitCode = evidence.summary.failed === 0 ? 0 : 1;
  return { exitCode, evidence, evidencePath };
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = runRuntimeMatrix(argv, deps);
    process.exitCode = result.exitCode;
  } catch (error) {
    const stderr = deps.stderr ?? process.stderr;
    stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  EVIDENCE_SCHEMA,
  RACE_COVERAGE_NOTE,
  DEFAULT_EVIDENCE_OUT,
  KNOWN_SCENARIOS,
  SCENARIO_PARAMETERS,
  parseArgs,
  getUsage,
  selectScenarios,
  ensurePlatformGuard,
  resolveProofDir,
  buildScenarioPlan,
  buildPowershellArgs,
  summarizeScenario,
  buildEvidence,
  runRuntimeMatrix,
  main
};
