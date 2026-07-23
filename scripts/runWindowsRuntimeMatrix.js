#!/usr/bin/env node

/**
 * VHS-REQ-622 / VHS-REQ-653 / VHS-REQ-623 — Automated End-to-End Windows Runtime
 * Conflict Verification Harness.
 *
 * Drives the real `vihs --validate --proof-out` CLI against a real running
 * LabVIEW process in three scenario families:
 *   - steady-* (VHS-REQ-622): same year, different bitness
 *       - steady-A: HostBitness=x64, SelectedBitness=x86
 *       - steady-B: HostBitness=x86, SelectedBitness=x64
 *   - version-* (VHS-REQ-653): same bitness, different year
 *       - version-A: Host=2025, Selected=2026 (x64)
 *       - version-B: Host=2026, Selected=2025 (x64)
 *   - port-* (VHS-REQ-623): same year/bitness, non-default VI Server port
 *       - port-A: Host=Selected (x64) on a non-default server.tcp.port (3380)
 *
 * For each scenario, the PowerShell helper at
 * `scripts/windows-runtime-matrix/Invoke-RuntimeMatrixSteadyState.ps1`
 * closes any running LabVIEW, launches the requested host runtime, invokes
 * `vihs --validate --proof-out <path>`, parses the proof JSON, and asserts:
 *   - `runtimeBlockedReason === <scenario expectedBlockedReason>` (the
 *     bitness/version conflict reason, or `none` for the port-admit direction)
 *   - For port-*: the observed `runtime.hostLabviewTcpPort` equals the expected
 *     non-default VI Server port.
 *   - For conflict scenarios: the observed `LabVIEW.exe` ExecutablePath matches
 *     the intended install root.
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
// VHS-REQ-713: the runtime-conflict matrix is defined by a scenario MANIFEST
// rather than a fixed five-scenario enum. Each row models a Host (the LabVIEW
// process actually running) vs a Selected (what the product is configured to
// use). Four families cover every cell of the 2020/2025/2026 x86/x64 grid in at
// least one conflict and one admit direction:
//   - bitness (VHS-REQ-622): same year, opposite bitness -> bitness conflict.
//   - version (VHS-REQ-653): same bitness, different year -> version conflict.
//   - match: Host == Selected on the DEFAULT port -> no conflict (the negative
//     control the fixed matrix lacked per-cell); portMode 'default' asserts the
//     observed VI Server port is the documented Windows default.
//   - port (VHS-REQ-623): Host == Selected on a NON-DEFAULT VI Server port ->
//     no conflict, port derived from the selected install's own LabVIEW.ini;
//     portMode 'non-default' asserts the derived port is not the default, so
//     the family provably exercises the non-default path it claims to cover.
// The legacy ids (steady-A/B, version-A/B, port-A) remain accepted as aliases
// that resolve to their canonical manifest row so the existing prompt/dispatch
// keep working.
const MATRIX_YEARS = Object.freeze(['2020', '2025', '2026']);
const MATRIX_BITNESSES = Object.freeze(['x86', 'x64']);
const BITNESS_CONFLICT_REASON = 'windows-host-bitness-conflict';
const VERSION_CONFLICT_REASON = 'windows-host-version-conflict';
const NO_CONFLICT_REASON = 'none';
// #2338: LabVIEW years below this cannot be a comparison-report TARGET, so the
// product blocks a SELECTED version below it as unsupported-for-comparison
// BEFORE it ever reaches the host/selected version-conflict check. Confirmed on
// real hardware: selecting 2020 (host 2026) returns the unsupported reason, not
// windows-host-version-conflict.
const MIN_COMPARISON_YEAR = 2025;
const UNSUPPORTED_SELECTED_VERSION_REASON = 'labview-version-unsupported-for-comparison-report';
// VHS-REQ-623: the documented Windows VI Server default when server.tcp.port is
// absent from LabVIEW.ini (mirrors DEFAULT_WINDOWS_LABVIEW_TCP_PORT in the
// product and $DefaultWindowsLabviewTcpPort in the PowerShell helper).
const DEFAULT_WINDOWS_LABVIEW_TCP_PORT = 3363;

function buildScenarioManifest() {
  const rows = [];

  // bitness family: same year, opposite bitness (6 rows).
  for (const year of MATRIX_YEARS) {
    for (const hostBitness of MATRIX_BITNESSES) {
      const selectedBitness = hostBitness === 'x64' ? 'x86' : 'x64';
      rows.push({
        id: `bitness-${year}-${hostBitness}${selectedBitness}`,
        family: 'bitness',
        hostVersion: year,
        selectedVersion: year,
        hostBitness,
        selectedBitness,
        expectedBlockedReason: BITNESS_CONFLICT_REASON
      });
    }
  }

  // version family: same bitness, different year, both directions (12 rows).
  // #2338: a row whose SELECTED year is below MIN_COMPARISON_YEAR is blocked as
  // unsupported-for-comparison (the selected version cannot be a comparison
  // target) rather than as a host/selected version conflict; the remaining rows
  // (selected year comparison-supported) still assert the version conflict.
  const versionPairs = [
    ['2020', '2025'],
    ['2020', '2026'],
    ['2025', '2026']
  ];
  for (const [lower, upper] of versionPairs) {
    for (const [hostVersion, selectedVersion] of [
      [lower, upper],
      [upper, lower]
    ]) {
      for (const bitness of MATRIX_BITNESSES) {
        const selectedUnsupported = Number(selectedVersion) < MIN_COMPARISON_YEAR;
        rows.push({
          id: `version-${hostVersion}-${selectedVersion}-${bitness}`,
          family: 'version',
          hostVersion,
          selectedVersion,
          hostBitness: bitness,
          selectedBitness: bitness,
          expectedBlockedReason: selectedUnsupported
            ? UNSUPPORTED_SELECTED_VERSION_REASON
            : VERSION_CONFLICT_REASON
        });
      }
    }
  }

  // match family: Host == Selected on the default port (6 rows).
  for (const year of MATRIX_YEARS) {
    for (const bitness of MATRIX_BITNESSES) {
      rows.push({
        id: `match-${year}-${bitness}`,
        family: 'match',
        hostVersion: year,
        selectedVersion: year,
        hostBitness: bitness,
        selectedBitness: bitness,
        expectedBlockedReason: NO_CONFLICT_REASON,
        portMode: 'default'
      });
    }
  }

  // port family: Host == Selected on a non-default VI Server port derived from
  // the selected install's own LabVIEW.ini (6 rows).
  for (const year of MATRIX_YEARS) {
    for (const bitness of MATRIX_BITNESSES) {
      rows.push({
        id: `port-${year}-${bitness}`,
        family: 'port',
        hostVersion: year,
        selectedVersion: year,
        hostBitness: bitness,
        selectedBitness: bitness,
        expectedBlockedReason: NO_CONFLICT_REASON,
        derivePortFromSelectedIni: true,
        portMode: 'non-default'
      });
    }
  }

  return rows;
}

const SCENARIO_MANIFEST = Object.freeze(
  buildScenarioManifest().map((row) => Object.freeze(row))
);

// Canonical scenario ids, in manifest order (30 rows). `--scenario all` runs
// exactly these; aliases are never double-run.
const CANONICAL_SCENARIOS = Object.freeze(SCENARIO_MANIFEST.map((row) => row.id));

// Legacy ids preserved as aliases resolving to their canonical manifest row.
const LEGACY_SCENARIO_ALIASES = Object.freeze({
  'steady-A': 'bitness-2026-x64x86',
  'steady-B': 'bitness-2026-x86x64',
  'version-A': 'version-2025-2026-x64',
  'version-B': 'version-2026-2025-x64',
  'port-A': 'port-2026-x64'
});

// A lighter CI tier still covering every version-and-bitness cell in at least
// one conflict and one admit direction: 6 bitness (both bitnesses conflict) + the
// 4 version extremes (2020<->2026, 2025<->2026) at x64 + 6 match (both bitnesses
// admit, so x86 cells have a negative control too) + 1 port ~= 17 rows
// (VHS-REQ-713 lighter tier).
const LIGHT_TIER_SCENARIOS = Object.freeze([
  'bitness-2020-x64x86',
  'bitness-2020-x86x64',
  'bitness-2025-x64x86',
  'bitness-2025-x86x64',
  'bitness-2026-x64x86',
  'bitness-2026-x86x64',
  'version-2020-2026-x64',
  'version-2026-2020-x64',
  'version-2025-2026-x64',
  'version-2026-2025-x64',
  'match-2020-x64',
  'match-2020-x86',
  'match-2025-x64',
  'match-2025-x86',
  'match-2026-x64',
  'match-2026-x86',
  'port-2026-x64'
]);

// SCENARIO_PARAMETERS maps every accepted scenario id (canonical + alias) to its
// parameter object. Aliases share the frozen parameter object of their canonical
// row so `SCENARIO_PARAMETERS[alias]` keeps working for existing callers.
const SCENARIO_PARAMETERS = Object.freeze(
  (() => {
    const map = {};
    for (const row of SCENARIO_MANIFEST) {
      const { id, family, ...rest } = row;
      map[id] = Object.freeze({ family, ...rest });
    }
    for (const [alias, canonicalId] of Object.entries(LEGACY_SCENARIO_ALIASES)) {
      map[alias] = map[canonicalId];
    }
    return map;
  })()
);

// The full set of ids accepted by `--scenario` (canonical + legacy aliases).
const KNOWN_SCENARIOS = Object.freeze([
  ...CANONICAL_SCENARIOS,
  ...Object.keys(LEGACY_SCENARIO_ALIASES)
]);

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

  if (
    options.scenario !== 'all' &&
    options.scenario !== 'light' &&
    !KNOWN_SCENARIOS.includes(options.scenario)
  ) {
    throw new Error(
      `--scenario must be one of: all, light, ${KNOWN_SCENARIOS.join(', ')}`
    );
  }

  return options;
}

function getUsage() {
  return [
    'Usage: node scripts/runWindowsRuntimeMatrix.js [options]',
    '',
    'Drives the VHS-REQ-713 Windows runtime-conflict matrix (30-row scenario',
    'manifest) against real running LabVIEW installs + the real vihs --validate',
    'CLI. Four families cover the 2020/2025/2026 x86/x64 grid:',
    '  bitness (same year, opposite bitness -> bitness conflict),',
    '  version (same bitness, different year -> version conflict),',
    '  match   (Host == Selected, enforced default VI Server port -> no conflict),',
    '  port    (Host == Selected, enforced non-default ini-derived port -> no conflict).',
    '',
    'Options:',
    '  --scenario <id>         all | light | <canonical-id> | <legacy-alias>',
    '                          (default: all runs the 30 canonical rows; light',
    '                          runs the curated CI tier; legacy aliases steady-A/',
    '                          steady-B/version-A/version-B/port-A resolve to',
    '                          their canonical manifest row)',
    '  --labview-version <yr>  Default LabVIEW major version for scenarios that',
    '                          do not carry their own year. Every current 30-row',
    '                          manifest row (and every legacy alias) carries',
    '                          explicit host+selected years, so this flag is',
    '                          currently a no-op; it is retained for forward',
    '                          compatibility with year-less scenarios (default:',
    '                          2026)',
    `  --out <path>            Evidence output (default: ${DEFAULT_EVIDENCE_OUT})`,
    '  --proof-dir <path>      Directory for per-scenario proof JSON files',
    '                          (default: alongside --out)',
    '  --keep-running          Do not close LabVIEW between scenarios',
    '  --help                  Show this help text'
  ].join('\n');
}

function selectScenarios(scenarioArg) {
  if (scenarioArg === 'all') {
    return CANONICAL_SCENARIOS.slice();
  }
  if (scenarioArg === 'light') {
    return LIGHT_TIER_SCENARIOS.slice();
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
  return scenarios.map((id) => ({
    id,
    parameters: SCENARIO_PARAMETERS[id],
    proofPath: path.join(proofDir, `${id}.proof.json`),
    logPath: path.join(proofDir, `${id}.scenario.json`)
  }));
}

function buildPowershellArgs(scenario, options) {
  const selectedVersion = scenario.parameters.selectedVersion ?? options.labviewVersion;
  const hostVersion = scenario.parameters.hostVersion ?? options.labviewVersion;
  const args = [
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
    '-HostVersion',
    hostVersion,
    '-LabviewVersion',
    selectedVersion,
    '-ExpectedBlockedReason',
    scenario.parameters.expectedBlockedReason,
    '-ProofOutPath',
    scenario.proofPath,
    '-ScenarioLogPath',
    scenario.logPath
  ];
  // VHS-REQ-623: the port-admit scenario derives its expected VI Server port
  // from the selected install's own LabVIEW.ini inside the helper, so the
  // driver only signals intent -- it never passes a port number.
  if (scenario.parameters.derivePortFromSelectedIni) {
    args.push('-DerivePortFromSelectedIni');
  }
  // VHS-REQ-623 (#2337): admit families enforce their port mode -- 'default'
  // asserts the observed VI Server port is the documented Windows default,
  // 'non-default' asserts the ini-derived port is not the default -- so each
  // admit family provably exercises the port mode it claims.
  if (scenario.parameters.portMode) {
    args.push('-PortMode', scenario.parameters.portMode);
  }
  if (options.keepRunning) {
    args.push('-KeepRunning');
  }
  return args;
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

function normalizeWindowsPath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function summarizeScenario(scenario, spawnResult, scenarioLog) {
  const expected = {
    runtimeBlockedReason: scenario.parameters.expectedBlockedReason,
    hostBitness: scenario.parameters.hostBitness,
    selectedBitness: scenario.parameters.selectedBitness
  };
  const observed = scenarioLog?.observed ?? {
    runtimeBlockedReason: undefined,
    hostBitness: undefined,
    selectedBitness: undefined,
    labviewExecutablePath: undefined,
    hostLabviewTcpPort: undefined,
    hostLabviewIniPath: undefined
  };

  // VHS-REQ-623: the port-admit scenario derives its expected VI Server port
  // from the SELECTED install's own LabVIEW.ini (surfaced by the helper as
  // scenarioLog.portOracle), never a hardcoded/operator-supplied constant. The
  // scenario passes only when the product (a) read that exact selected ini and
  // (b) observed its configured port in the proof. Non-port scenarios skip this.
  const portOracle = scenario.parameters.derivePortFromSelectedIni
    ? scenarioLog?.portOracle ?? null
    : undefined;
  let portMatches = true;
  let iniPathMatches = true;
  if (scenario.parameters.derivePortFromSelectedIni) {
    expected.hostTcpPort = portOracle?.derivedExpectedTcpPort;
    expected.hostLabviewIniPath = portOracle?.selectedLabviewIniPath;
    portMatches =
      portOracle != null &&
      Number.isInteger(portOracle.derivedExpectedTcpPort) &&
      observed.hostLabviewTcpPort === portOracle.derivedExpectedTcpPort;
    const expectedIni = normalizeWindowsPath(portOracle?.selectedLabviewIniPath);
    iniPathMatches =
      portOracle != null &&
      expectedIni !== undefined &&
      expectedIni === normalizeWindowsPath(observed.hostLabviewIniPath);
  }

  // VHS-REQ-623 (#2337): each admit family enforces its declared port mode.
  // 'non-default' requires the ini-derived port (surfaced by the helper's
  // portOracle) to differ from the documented Windows default, so a selected
  // install left on the default port fails instead of silently passing.
  // 'default' requires the observed proof port to be that documented default.
  let portModeMatches = true;
  if (scenario.parameters.portMode === 'non-default') {
    portModeMatches = portOracle != null && portOracle.isNonDefaultPort === true;
  } else if (scenario.parameters.portMode === 'default') {
    portModeMatches = observed.hostLabviewTcpPort === DEFAULT_WINDOWS_LABVIEW_TCP_PORT;
  }

  // VHS-REQ-713: version-family scenarios (Host year != Selected year at the
  // same bitness) additionally assert the observed host/selected years match the
  // manifest row, so a version conflict is proven to arise from the intended
  // year mismatch rather than an incidental one. Bitness/match/port rows keep
  // Host year == Selected year, so this guard is inert for them.
  const assertVersions = Boolean(
    scenario.parameters.hostVersion &&
      scenario.parameters.selectedVersion &&
      scenario.parameters.hostVersion !== scenario.parameters.selectedVersion
  );
  let versionMatches = true;
  if (assertVersions) {
    expected.hostVersion = scenario.parameters.hostVersion;
    expected.selectedVersion = scenario.parameters.selectedVersion;
    versionMatches =
      observed.hostVersion === scenario.parameters.hostVersion &&
      observed.selectedVersion === scenario.parameters.selectedVersion;
  }

  const pass = Boolean(
    scenarioLog?.pass === true &&
      observed.runtimeBlockedReason === expected.runtimeBlockedReason &&
      observed.hostBitness === expected.hostBitness &&
      observed.selectedBitness === expected.selectedBitness &&
      versionMatches &&
      portMatches &&
      iniPathMatches &&
      portModeMatches
  );
  let failureReason = scenarioLog?.failureReason
    ?? (spawnResult.status === 0 ? undefined : `powershell-exit-${spawnResult.status}`);
  if (!pass && failureReason === undefined) {
    if (!versionMatches) {
      failureReason =
        `expected hostVersion=${expected.hostVersion ?? '<none>'}/` +
        `selectedVersion=${expected.selectedVersion ?? '<none>'}, ` +
        `observed hostVersion=${observed.hostVersion ?? '<none>'}/` +
        `selectedVersion=${observed.selectedVersion ?? '<none>'}`;
    } else if (!portMatches) {
      failureReason =
        `expected hostLabviewTcpPort=${expected.hostTcpPort ?? '<derive-failed>'}, ` +
        `observed=${observed.hostLabviewTcpPort ?? '<none>'}`;
    } else if (!iniPathMatches) {
      failureReason =
        `expected hostLabviewIniPath=${expected.hostLabviewIniPath ?? '<derive-failed>'}, ` +
        `observed=${observed.hostLabviewIniPath ?? '<none>'}`;
    } else if (!portModeMatches) {
      failureReason =
        scenario.parameters.portMode === 'non-default'
          ? `expected a non-default VI Server port (ini-derived != ${DEFAULT_WINDOWS_LABVIEW_TCP_PORT}), ` +
            `observed derived port=${portOracle?.derivedExpectedTcpPort ?? '<derive-failed>'}`
          : `expected the default VI Server port (${DEFAULT_WINDOWS_LABVIEW_TCP_PORT}), ` +
            `observed hostLabviewTcpPort=${observed.hostLabviewTcpPort ?? '<none>'}`;
    }
  }

  const summary = {
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
  if (portOracle !== undefined) {
    summary.portOracle = portOracle;
  }
  if (scenario.parameters.portMode) {
    summary.portMode = scenario.parameters.portMode;
  }
  return summary;
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
  SCENARIO_MANIFEST,
  CANONICAL_SCENARIOS,
  LEGACY_SCENARIO_ALIASES,
  LIGHT_TIER_SCENARIOS,
  KNOWN_SCENARIOS,
  SCENARIO_PARAMETERS,
  parseArgs,
  getUsage,
  selectScenarios,
  ensurePlatformGuard,
  resolveProofDir,
  buildScenarioPlan,
  buildPowershellArgs,
  normalizeWindowsPath,
  summarizeScenario,
  buildEvidence,
  runRuntimeMatrix,
  main
};
