import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const harness = require('../../scripts/runWindowsRuntimeMatrix.js') as {
  EVIDENCE_SCHEMA: string;
  RACE_COVERAGE_NOTE: string;
  DEFAULT_EVIDENCE_OUT: string;
  SCENARIO_MANIFEST: ReadonlyArray<{
    id: string;
    family: 'bitness' | 'version' | 'match' | 'port';
    hostVersion: string;
    selectedVersion: string;
    hostBitness: 'x64' | 'x86';
    selectedBitness: 'x64' | 'x86';
    expectedBlockedReason: string;
    derivePortFromSelectedIni?: boolean;
  }>;
  CANONICAL_SCENARIOS: readonly string[];
  LEGACY_SCENARIO_ALIASES: Readonly<Record<string, string>>;
  LIGHT_TIER_SCENARIOS: readonly string[];
  KNOWN_SCENARIOS: readonly string[];
  SCENARIO_PARAMETERS: Readonly<
    Record<
      string,
      {
        hostBitness: 'x64' | 'x86';
        selectedBitness: 'x64' | 'x86';
        hostVersion?: string;
        selectedVersion?: string;
        expectedBlockedReason: string;
        derivePortFromSelectedIni?: boolean;
      }
    >
  >;
  parseArgs: (argv: string[]) => {
    scenario: string;
    labviewVersion: string;
    out: string;
    proofDir?: string;
    keepRunning: boolean;
    help: boolean;
  };
  selectScenarios: (scenarioArg: string) => string[];
  ensurePlatformGuard: (platform: string, env: Record<string, string | undefined>) => void;
  resolveProofDir: (options: { out: string; proofDir?: string }) => string;
  buildScenarioPlan: (options: {
    scenario: string;
    out: string;
    proofDir?: string;
  }) => Array<{
    id: string;
    parameters: { hostBitness: string; selectedBitness: string; derivePortFromSelectedIni?: boolean };
    proofPath: string;
    logPath: string;
  }>;
  buildPowershellArgs: (
    scenario: { id: string; parameters: { hostBitness: string; selectedBitness: string }; proofPath: string; logPath: string },
    options: { labviewVersion: string; keepRunning: boolean }
  ) => string[];
  normalizeWindowsPath: (value: unknown) => string | undefined;
  summarizeScenario: (
    scenario: { id: string; parameters: { hostBitness: string; selectedBitness: string; derivePortFromSelectedIni?: boolean }; proofPath: string; logPath: string },
    spawnResult: { status: number },
    scenarioLog: unknown
  ) => {
    id: string;
    pass: boolean;
    failureReason?: string;
    expected: Record<string, string | number>;
    observed: Record<string, unknown>;
    portOracle?: Record<string, unknown>;
    artifacts: { proofPath: string; scenarioLogPath: string };
    durationMs: number;
  };
  runRuntimeMatrix: (
    argv: string[],
    deps: Record<string, unknown>
  ) => {
    exitCode: number;
    evidence?: { schema: string; scenarios: unknown[]; summary: { passed: number; failed: number; raceCoverage: string } };
    evidencePath?: string;
  };
};

describe('runWindowsRuntimeMatrix.SCENARIO_MANIFEST', () => {
  it('defines exactly 30 canonical scenarios covering the four families (VHS-REQ-713.1)', () => {
    expect(harness.SCENARIO_MANIFEST).toHaveLength(30);
    expect(harness.CANONICAL_SCENARIOS).toHaveLength(30);
    const byFamily = harness.SCENARIO_MANIFEST.reduce<Record<string, number>>((acc, row) => {
      acc[row.family] = (acc[row.family] ?? 0) + 1;
      return acc;
    }, {});
    expect(byFamily).toEqual({ bitness: 6, version: 12, match: 6, port: 6 });
  });

  it('has unique canonical ids that match the CANONICAL_SCENARIOS order', () => {
    const ids = harness.SCENARIO_MANIFEST.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...harness.CANONICAL_SCENARIOS]);
  });

  it('bitness rows pair the same year at opposite bitness with the bitness-conflict reason (VHS-REQ-713.1)', () => {
    for (const row of harness.SCENARIO_MANIFEST.filter((entry) => entry.family === 'bitness')) {
      expect(row.hostVersion).toBe(row.selectedVersion);
      expect(row.hostBitness).not.toBe(row.selectedBitness);
      expect(row.expectedBlockedReason).toBe('windows-host-bitness-conflict');
      expect(row.derivePortFromSelectedIni).toBeUndefined();
    }
  });

  it('version rows pair the same bitness at different years with the version-conflict reason, including the 2020 convert path (VHS-REQ-713.1, VHS-REQ-713.4)', () => {
    for (const row of harness.SCENARIO_MANIFEST.filter((entry) => entry.family === 'version')) {
      expect(row.hostBitness).toBe(row.selectedBitness);
      expect(row.hostVersion).not.toBe(row.selectedVersion);
      expect(row.expectedBlockedReason).toBe('windows-host-version-conflict');
    }
    // At least one direction selects LabVIEW 2020 (the convert path).
    const selects2020 = harness.SCENARIO_MANIFEST.filter(
      (entry) => entry.family === 'version' && entry.selectedVersion === '2020'
    );
    expect(selects2020.length).toBeGreaterThan(0);
  });

  it('match rows admit an identical host/selected on the default port (VHS-REQ-713.1)', () => {
    const matchRows = harness.SCENARIO_MANIFEST.filter((entry) => entry.family === 'match');
    for (const row of matchRows) {
      expect(row.hostVersion).toBe(row.selectedVersion);
      expect(row.hostBitness).toBe(row.selectedBitness);
      expect(row.expectedBlockedReason).toBe('none');
      expect(row.derivePortFromSelectedIni).toBeUndefined();
    }
    expect(matchRows).toHaveLength(6);
  });

  it('port rows admit an identical host/selected and derive the port from the selected ini (VHS-REQ-713.1)', () => {
    for (const row of harness.SCENARIO_MANIFEST.filter((entry) => entry.family === 'port')) {
      expect(row.hostVersion).toBe(row.selectedVersion);
      expect(row.hostBitness).toBe(row.selectedBitness);
      expect(row.expectedBlockedReason).toBe('none');
      expect(row.derivePortFromSelectedIni).toBe(true);
    }
  });

  it('resolves every legacy alias to the correct canonical row parameters (VHS-REQ-713.3)', () => {
    expect(harness.LEGACY_SCENARIO_ALIASES).toEqual({
      'steady-A': 'bitness-2026-x64x86',
      'steady-B': 'bitness-2026-x86x64',
      'version-A': 'version-2025-2026-x64',
      'version-B': 'version-2026-2025-x64',
      'port-A': 'port-2026-x64'
    });
    for (const [alias, canonicalId] of Object.entries(harness.LEGACY_SCENARIO_ALIASES)) {
      // The alias shares the exact frozen parameter object of its canonical row.
      expect(harness.SCENARIO_PARAMETERS[alias]).toBe(harness.SCENARIO_PARAMETERS[canonicalId]);
      // And KNOWN_SCENARIOS (the --scenario accept-list) carries both.
      expect(harness.KNOWN_SCENARIOS).toContain(alias);
      expect(harness.KNOWN_SCENARIOS).toContain(canonicalId);
    }
  });

  it('preserves the legacy steady-A/steady-B bitness directions at 2026 (VHS-REQ-713.3)', () => {
    expect(harness.SCENARIO_PARAMETERS['steady-A']).toMatchObject({
      hostBitness: 'x64',
      selectedBitness: 'x86',
      hostVersion: '2026',
      selectedVersion: '2026',
      expectedBlockedReason: 'windows-host-bitness-conflict'
    });
    expect(harness.SCENARIO_PARAMETERS['steady-B']).toMatchObject({
      hostBitness: 'x86',
      selectedBitness: 'x64',
      expectedBlockedReason: 'windows-host-bitness-conflict'
    });
  });
});

describe('runWindowsRuntimeMatrix.parseArgs', () => {
  it('defaults to running all scenarios with LabVIEW 2026 and the closeout evidence path', () => {
    const options = harness.parseArgs([]);
    expect(options.scenario).toBe('all');
    expect(options.labviewVersion).toBe('2026');
    expect(options.out).toBe(harness.DEFAULT_EVIDENCE_OUT);
    expect(options.keepRunning).toBe(false);
    expect(options.help).toBe(false);
  });

  it('accepts each known scenario id', () => {
    for (const id of harness.KNOWN_SCENARIOS) {
      expect(harness.parseArgs(['--scenario', id]).scenario).toBe(id);
    }
  });

  it('rejects an unknown scenario value', () => {
    expect(() => harness.parseArgs(['--scenario', 'race-A'])).toThrow(
      /--scenario must be one of/
    );
  });

  it('rejects an unknown flag', () => {
    expect(() => harness.parseArgs(['--bogus'])).toThrow(/Unknown argument: --bogus/);
  });

  it('requires a value after a flag', () => {
    expect(() => harness.parseArgs(['--scenario'])).toThrow(/requires a value/);
  });

  it('no longer accepts --host-tcp-port (port-A self-derives from the selected ini)', () => {
    expect(() => harness.parseArgs(['--host-tcp-port', '3366'])).toThrow(
      /Unknown argument: --host-tcp-port/
    );
  });
});

describe('runWindowsRuntimeMatrix.selectScenarios', () => {
  it('returns every canonical scenario (not aliases) when asked for all (VHS-REQ-713.1)', () => {
    expect(harness.selectScenarios('all')).toEqual([...harness.CANONICAL_SCENARIOS]);
    // Aliases are never double-run under `all`.
    for (const alias of Object.keys(harness.LEGACY_SCENARIO_ALIASES)) {
      expect(harness.selectScenarios('all')).not.toContain(alias);
    }
  });

  it('returns the lighter CI tier when asked for light (VHS-REQ-713.2)', () => {
    expect(harness.selectScenarios('light')).toEqual([...harness.LIGHT_TIER_SCENARIOS]);
    // Every light-tier id is a real canonical scenario.
    for (const id of harness.LIGHT_TIER_SCENARIOS) {
      expect(harness.CANONICAL_SCENARIOS).toContain(id);
    }
  });

  it('light tier covers every bitness in BOTH a conflict and an admit direction (VHS-REQ-713.2)', () => {
    const rowsById = new Map(harness.SCENARIO_MANIFEST.map((row) => [row.id, row]));
    const light = harness.LIGHT_TIER_SCENARIOS.map((id) => rowsById.get(id)!);
    const conflictFamilies = new Set(['bitness', 'version']);
    const admitFamilies = new Set(['match', 'port']);
    for (const bitness of ['x86', 'x64']) {
      const conflict = light.some(
        (row) => conflictFamilies.has(row.family) && (row.hostBitness === bitness || row.selectedBitness === bitness)
      );
      const admit = light.some(
        (row) => admitFamilies.has(row.family) && row.hostBitness === bitness && row.selectedBitness === bitness
      );
      expect(conflict, `light tier lacks a ${bitness} conflict row`).toBe(true);
      expect(admit, `light tier lacks a ${bitness} admit (negative-control) row`).toBe(true);
    }
    // Every grid year appears in the light tier.
    for (const year of ['2020', '2025', '2026']) {
      expect(light.some((row) => row.hostVersion === year || row.selectedVersion === year)).toBe(true);
    }
  });

  it('returns a single-element list for a specific canonical scenario', () => {
    expect(harness.selectScenarios('bitness-2026-x86x64')).toEqual(['bitness-2026-x86x64']);
  });

  it('returns the legacy alias id unchanged so dispatch keeps working (VHS-REQ-713.3)', () => {
    expect(harness.selectScenarios('steady-B')).toEqual(['steady-B']);
  });
});

describe('runWindowsRuntimeMatrix.ensurePlatformGuard', () => {
  it('passes on Windows', () => {
    expect(() => harness.ensurePlatformGuard('win32', {})).not.toThrow();
  });

  it('passes on non-Windows when VIHS_FAKE_WINDOWS=1 is set', () => {
    expect(() =>
      harness.ensurePlatformGuard('linux', { VIHS_FAKE_WINDOWS: '1' })
    ).not.toThrow();
  });

  it('throws on non-Windows without the test override (VHS-REQ-622.1)', () => {
    expect(() => harness.ensurePlatformGuard('darwin', {})).toThrow(
      /requires Windows/
    );
  });
});

describe('runWindowsRuntimeMatrix.buildScenarioPlan', () => {
  it('emits a per-scenario plan with proof and log paths under the proof directory (VHS-REQ-622.2)', () => {
    const plan = harness.buildScenarioPlan({
      scenario: 'all',
      out: 'assurance-closeout-evidence/manual-vhs-req-621.json'
    });
    expect(plan).toHaveLength(harness.CANONICAL_SCENARIOS.length);
    for (const entry of plan) {
      expect(entry.proofPath.endsWith(`${entry.id}.proof.json`)).toBe(true);
      expect(entry.logPath.endsWith(`${entry.id}.scenario.json`)).toBe(true);
      expect(entry.parameters).toEqual(harness.SCENARIO_PARAMETERS[entry.id]);
    }
  });

  it('honors an explicit --proof-dir', () => {
    const plan = harness.buildScenarioPlan({
      scenario: 'steady-A',
      out: 'evidence.json',
      proofDir: 'custom-proof-dir'
    });
    expect(plan[0].proofPath.startsWith('custom-proof-dir')).toBe(true);
  });

  it('marks port-A to derive its expected port from the selected install ini (VHS-REQ-623.6)', () => {
    const plan = harness.buildScenarioPlan({ scenario: 'port-A', out: 'evidence.json' });
    expect(plan[0].parameters.derivePortFromSelectedIni).toBe(true);
    expect(
      (plan[0].parameters as { expectedHostTcpPort?: number }).expectedHostTcpPort
    ).toBeUndefined();
  });

  it('does not mark non-port scenarios for ini-derived port assertion', () => {
    const plan = harness.buildScenarioPlan({ scenario: 'steady-A', out: 'evidence.json' });
    expect(plan[0].parameters.derivePortFromSelectedIni).toBeUndefined();
  });
});

describe('runWindowsRuntimeMatrix.buildPowershellArgs', () => {
  it('passes scenario, bitness, paths, and labview version to the helper (VHS-REQ-622.2)', () => {
    const scenario = {
      id: 'steady-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x86',
        expectedBlockedReason: 'windows-host-bitness-conflict'
      },
      proofPath: 'proofs/steady-A.proof.json',
      logPath: 'proofs/steady-A.scenario.json'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: false
    });

    expect(args).toContain('-File');
    const fileIndex = args.indexOf('-File');
    expect(args[fileIndex + 1].includes('Invoke-RuntimeMatrixSteadyState.ps1')).toBe(true);
    expect(args).toContain('-ScenarioId');
    expect(args[args.indexOf('-ScenarioId') + 1]).toBe('steady-A');
    expect(args[args.indexOf('-HostBitness') + 1]).toBe('x64');
    expect(args[args.indexOf('-SelectedBitness') + 1]).toBe('x86');
    expect(args[args.indexOf('-HostVersion') + 1]).toBe('2026');
    expect(args[args.indexOf('-LabviewVersion') + 1]).toBe('2026');
    expect(args[args.indexOf('-ExpectedBlockedReason') + 1]).toBe(
      'windows-host-bitness-conflict'
    );
    expect(args[args.indexOf('-ProofOutPath') + 1]).toBe('proofs/steady-A.proof.json');
    expect(args[args.indexOf('-ScenarioLogPath') + 1]).toBe('proofs/steady-A.scenario.json');
    expect(args).not.toContain('-KeepRunning');
  });

  it('passes the scenario-specific host/selected years and version-conflict reason (VHS-REQ-653.7)', () => {
    const scenario = {
      id: 'version-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x64',
        hostVersion: '2025',
        selectedVersion: '2026',
        expectedBlockedReason: 'windows-host-version-conflict'
      },
      proofPath: 'proofs/version-A.proof.json',
      logPath: 'proofs/version-A.scenario.json'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: false
    });

    // The launched (host) year and the selected year differ, the bitness is
    // shared, and the scenario carries its own years independent of the
    // --labview-version default.
    expect(args[args.indexOf('-HostBitness') + 1]).toBe('x64');
    expect(args[args.indexOf('-SelectedBitness') + 1]).toBe('x64');
    expect(args[args.indexOf('-HostVersion') + 1]).toBe('2025');
    expect(args[args.indexOf('-LabviewVersion') + 1]).toBe('2026');
    expect(args[args.indexOf('-ExpectedBlockedReason') + 1]).toBe(
      'windows-host-version-conflict'
    );
  });

  it('adds -KeepRunning when requested', () => {
    const scenario = {
      id: 'steady-B',
      parameters: {
        hostBitness: 'x86',
        selectedBitness: 'x64',
        expectedBlockedReason: 'windows-host-bitness-conflict'
      },
      proofPath: 'p.json',
      logPath: 'l.json'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: true
    });
    expect(args).toContain('-KeepRunning');
  });

  it('signals -DerivePortFromSelectedIni (no port number) for the port-admit scenario (VHS-REQ-623.6)', () => {
    const scenario = {
      id: 'port-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x64',
        expectedBlockedReason: 'none',
        derivePortFromSelectedIni: true
      },
      proofPath: 'proofs/port-A.proof.json',
      logPath: 'proofs/port-A.scenario.json'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: false
    });

    expect(args[args.indexOf('-HostBitness') + 1]).toBe('x64');
    expect(args[args.indexOf('-SelectedBitness') + 1]).toBe('x64');
    expect(args[args.indexOf('-ExpectedBlockedReason') + 1]).toBe('none');
    // The expected port is derived from the selected install's ini inside the
    // helper; the driver passes a switch and never a port number.
    expect(args).toContain('-DerivePortFromSelectedIni');
    expect(args).not.toContain('-ExpectedHostTcpPort');
  });

  it('omits port-admit flags for non-port scenarios', () => {
    const scenario = {
      id: 'steady-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x86',
        expectedBlockedReason: 'windows-host-bitness-conflict'
      },
      proofPath: 'p.json',
      logPath: 'l.json'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: false
    });
    expect(args).not.toContain('-DerivePortFromSelectedIni');
    expect(args).not.toContain('-ExpectedHostTcpPort');
  });

  it('never emits an empty-string argument', () => {
    const scenario = {
      id: 'steady-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x86',
        expectedBlockedReason: 'windows-host-bitness-conflict'
      },
      proofPath: 'p',
      logPath: 'l'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: false
    });
    expect(args.every((arg) => arg !== '')).toBe(true);
  });
});

describe('runWindowsRuntimeMatrix.summarizeScenario', () => {
  const scenario = {
    id: 'steady-A',
    parameters: {
      hostBitness: 'x64',
      selectedBitness: 'x86',
      expectedBlockedReason: 'windows-host-bitness-conflict'
    },
    proofPath: 'p.proof.json',
    logPath: 'p.scenario.json'
  };

  it('passes when scenario log reports pass and matches expected observations (VHS-REQ-622.2)', () => {
    const summary = harness.summarizeScenario(
      scenario,
      { status: 0 },
      {
        pass: true,
        durationMs: 1234,
        observed: {
          runtimeBlockedReason: 'windows-host-bitness-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x86',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      }
    );
    expect(summary.pass).toBe(true);
    expect(summary.failureReason).toBeUndefined();
    expect(summary.durationMs).toBe(1234);
  });

  it('fails when the blocked reason does not match', () => {
    const summary = harness.summarizeScenario(
      scenario,
      { status: 0 },
      {
        pass: true,
        observed: {
          runtimeBlockedReason: 'windows-host-runtime-surface-contaminated',
          hostBitness: 'x64',
          selectedBitness: 'x86'
        }
      }
    );
    expect(summary.pass).toBe(false);
  });

  it('fails when the PowerShell helper exited non-zero and no scenario log was written', () => {
    const summary = harness.summarizeScenario(scenario, { status: 7 }, undefined);
    expect(summary.pass).toBe(false);
    expect(summary.failureReason).toBe('powershell-exit-7');
  });

  it('passes a version scenario when the proof reports windows-host-version-conflict (VHS-REQ-653.7)', () => {
    const versionScenario = {
      id: 'version-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x64',
        hostVersion: '2025',
        selectedVersion: '2026',
        expectedBlockedReason: 'windows-host-version-conflict'
      },
      proofPath: 'v.proof.json',
      logPath: 'v.scenario.json'
    };
    const summary = harness.summarizeScenario(
      versionScenario,
      { status: 0 },
      {
        pass: true,
        durationMs: 1500,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostVersion: '2025',
          selectedVersion: '2026',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
        }
      }
    );
    expect(summary.pass).toBe(true);
    expect(summary.expected.runtimeBlockedReason).toBe('windows-host-version-conflict');
    expect(summary.failureReason).toBeUndefined();
  });

  it('fails a version scenario when the proof still reports a bitness conflict (VHS-REQ-653.7)', () => {
    const versionScenario = {
      id: 'version-A',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x64',
        hostVersion: '2025',
        selectedVersion: '2026',
        expectedBlockedReason: 'windows-host-version-conflict'
      },
      proofPath: 'v.proof.json',
      logPath: 'v.scenario.json'
    };
    const summary = harness.summarizeScenario(
      versionScenario,
      { status: 0 },
      {
        pass: false,
        observed: {
          runtimeBlockedReason: 'windows-host-bitness-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64'
        }
      }
    );
    expect(summary.pass).toBe(false);
  });

  it('fails a version scenario when the observed host/selected years do not match the manifest row (VHS-REQ-713.4)', () => {
    const versionScenario = {
      id: 'version-2026-2020-x64',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x64',
        hostVersion: '2026',
        selectedVersion: '2020',
        expectedBlockedReason: 'windows-host-version-conflict'
      },
      proofPath: 'v.proof.json',
      logPath: 'v.scenario.json'
    };
    const summary = harness.summarizeScenario(
      versionScenario,
      { status: 0 },
      {
        pass: true,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          // The proof reports a different selected year than the manifest row.
          hostVersion: '2026',
          selectedVersion: '2025'
        }
      }
    );
    expect(summary.pass).toBe(false);
    expect(summary.failureReason).toContain('selectedVersion=2020');
    expect(summary.failureReason).toContain('selectedVersion=2025');
  });

  it('passes the 2020 convert-path direction when the observed years match the manifest row (VHS-REQ-713.4)', () => {
    const versionScenario = {
      id: 'version-2026-2020-x64',
      parameters: {
        hostBitness: 'x64',
        selectedBitness: 'x64',
        hostVersion: '2026',
        selectedVersion: '2020',
        expectedBlockedReason: 'windows-host-version-conflict'
      },
      proofPath: 'v.proof.json',
      logPath: 'v.scenario.json'
    };
    const summary = harness.summarizeScenario(
      versionScenario,
      { status: 0 },
      {
        pass: true,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostVersion: '2026',
          selectedVersion: '2020'
        }
      }
    );
    expect(summary.pass).toBe(true);
    expect(summary.expected.hostVersion).toBe('2026');
    expect(summary.expected.selectedVersion).toBe('2020');
  });

  const SELECTED_PORT_A_INI =
    'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini';
  const portScenario = {
    id: 'port-A',
    parameters: {
      hostBitness: 'x64',
      selectedBitness: 'x64',
      expectedBlockedReason: 'none',
      derivePortFromSelectedIni: true
    },
    proofPath: 'port-A.proof.json',
    logPath: 'port-A.scenario.json'
  };

  // The helper derives the expected port from the selected install's own ini and
  // surfaces it as portOracle; the summary recomputes pass from it.
  function portLog(overrides: {
    observedPort?: number | undefined;
    observedIniPath?: string | undefined;
    derivedExpectedTcpPort?: number;
    selectedLabviewIniPath?: string;
    isNonDefaultPort?: boolean;
    pass?: boolean;
    omitPortOracle?: boolean;
  }) {
    const derived = overrides.derivedExpectedTcpPort ?? 3366;
    const selectedIni = overrides.selectedLabviewIniPath ?? SELECTED_PORT_A_INI;
    const observedIni =
      'observedIniPath' in overrides ? overrides.observedIniPath : selectedIni;
    const observedPort =
      'observedPort' in overrides ? overrides.observedPort : derived;
    const log: Record<string, unknown> = {
      pass: overrides.pass ?? true,
      durationMs: 1600,
      observed: {
        runtimeBlockedReason: 'none',
        hostBitness: 'x64',
        selectedBitness: 'x64',
        hostLabviewTcpPort: observedPort,
        hostLabviewIniPath: observedIni,
        labviewExecutablePath:
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      }
    };
    if (!overrides.omitPortOracle) {
      log.portOracle = {
        selectedLabviewIniPath: selectedIni,
        derivedExpectedTcpPort: derived,
        isNonDefaultPort: overrides.isNonDefaultPort ?? derived !== 3363,
        observedLabviewIniPath: observedIni,
        observedTcpPort: observedPort
      };
    }
    return log;
  }

  it('passes when the host is admitted and the product observed the selected install ini port (VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(portScenario, { status: 0 }, portLog({}));
    expect(summary.pass).toBe(true);
    expect(summary.expected.hostTcpPort).toBe(3366);
    expect(summary.expected.hostLabviewIniPath).toBe(SELECTED_PORT_A_INI);
    expect(summary.observed.hostLabviewTcpPort).toBe(3366);
    expect(summary.failureReason).toBeUndefined();
  });

  it('self-configures to whatever non-default port the selected ini declares (VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(
      portScenario,
      { status: 0 },
      portLog({ derivedExpectedTcpPort: 3399, observedPort: 3399 })
    );
    expect(summary.pass).toBe(true);
    expect(summary.expected.hostTcpPort).toBe(3399);
  });

  it('fails when the observed port does not match the port derived from the selected ini (VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(
      portScenario,
      { status: 0 },
      portLog({ derivedExpectedTcpPort: 3366, observedPort: 3363 })
    );
    expect(summary.pass).toBe(false);
    expect(summary.failureReason).toContain('expected hostLabviewTcpPort=3366');
    expect(summary.failureReason).toContain('observed=3363');
  });

  it('fails when the product read a DIFFERENT ini than the selected install (latest-used regression guard, VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(
      portScenario,
      { status: 0 },
      portLog({
        observedIniPath:
          'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.ini'
      })
    );
    expect(summary.pass).toBe(false);
    expect(summary.failureReason).toContain('expected hostLabviewIniPath=');
    expect(summary.failureReason).toContain('LabVIEW 2026');
  });

  it('matches the selected ini path case- and separator-insensitively (VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(
      portScenario,
      { status: 0 },
      portLog({
        observedIniPath:
          'c:/program files/national instruments/labview 2026/labview.ini'
      })
    );
    expect(summary.pass).toBe(true);
  });

  it('fails when no VI Server port was observed (VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(
      portScenario,
      { status: 0 },
      portLog({ observedPort: undefined })
    );
    expect(summary.pass).toBe(false);
    expect(summary.failureReason).toContain('observed=<none>');
  });

  it('fails when the helper surfaced no port oracle at all (VHS-REQ-623.6)', () => {
    const summary = harness.summarizeScenario(
      portScenario,
      { status: 0 },
      portLog({ omitPortOracle: true })
    );
    expect(summary.pass).toBe(false);
  });
});

describe('runWindowsRuntimeMatrix.runRuntimeMatrix', () => {
  function buildFakeFs(scenarioLogPayloads: Record<string, unknown>): {
    fs: {
      existsSync: (target: string) => boolean;
      readFileSync: (target: string, encoding: string) => string;
      writeFileSync: (target: string, contents: string, encoding: string) => void;
      mkdirSync: (target: string, options?: unknown) => void;
    };
    writes: Map<string, string>;
  } {
    const writes = new Map<string, string>();
    const directories = new Set<string>();
    return {
      writes,
      fs: {
        existsSync: (target: string) => target in scenarioLogPayloads,
        readFileSync: (target: string) => {
          if (!(target in scenarioLogPayloads)) {
            throw new Error(`unexpected read: ${target}`);
          }
          return JSON.stringify(scenarioLogPayloads[target]);
        },
        writeFileSync: (target: string, contents: string) => {
          writes.set(target, contents);
        },
        mkdirSync: (target: string) => {
          directories.add(target);
        }
      }
    };
  }

  // VHS-REQ-713: build a passing scenario log for every canonical manifest row
  // so the "all scenarios pass" assertions stay in sync with the 30-row grid
  // instead of a hand-maintained five-entry literal.
  function labviewRoot(bitness: string): string {
    return bitness === 'x64'
      ? 'C:\\Program Files\\National Instruments'
      : 'C:\\Program Files (x86)\\National Instruments';
  }
  function passingLogFor(row: (typeof harness.SCENARIO_MANIFEST)[number]): Record<string, unknown> {
    const observed: Record<string, unknown> = {
      runtimeBlockedReason: row.expectedBlockedReason,
      hostBitness: row.hostBitness,
      selectedBitness: row.selectedBitness,
      labviewExecutablePath: `${labviewRoot(row.hostBitness)}\\LabVIEW ${row.hostVersion}\\LabVIEW.exe`
    };
    if (row.family === 'version') {
      observed.hostVersion = row.hostVersion;
      observed.selectedVersion = row.selectedVersion;
    }
    const log: Record<string, unknown> = { pass: true, durationMs: 100, observed };
    if (row.family === 'port') {
      const ini = `${labviewRoot(row.selectedBitness)}\\LabVIEW ${row.selectedVersion}\\LabVIEW.ini`;
      observed.hostLabviewTcpPort = 3366;
      observed.hostLabviewIniPath = ini;
      log.portOracle = {
        selectedLabviewIniPath: ini,
        derivedExpectedTcpPort: 3366,
        isNonDefaultPort: true,
        observedLabviewIniPath: ini,
        observedTcpPort: 3366
      };
    }
    return log;
  }
  function allPassingPayloads(): Record<string, unknown> {
    const sep = require('node:path').sep as string;
    const payloads: Record<string, unknown> = {};
    for (const row of harness.SCENARIO_MANIFEST) {
      payloads[`assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}${row.id}.scenario.json`] =
        passingLogFor(row);
    }
    return payloads;
  }

  it('writes an evidence file with passing summary when all runtime scenarios match expectations (VHS-REQ-622.1, VHS-REQ-622.3, VHS-REQ-623.6, VHS-REQ-653.7, VHS-REQ-713.1)', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const fake = buildFakeFs(allPassingPayloads());

    const result = harness.runRuntimeMatrix([], {
      spawnSync,
      fs: fake.fs,
      now: () => new Date('2026-05-31T00:00:00Z'),
      hostname: () => 'fake-runner',
      platform: 'win32',
      env: { VIHS_FAKE_WINDOWS: '1' },
      cwd: () => '.',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });

    expect(spawnSync).toHaveBeenCalledTimes(harness.CANONICAL_SCENARIOS.length);
    expect(result.exitCode).toBe(0);
    expect(result.evidence?.schema).toBe(harness.EVIDENCE_SCHEMA);
    expect(result.evidence?.summary).toEqual({
      passed: harness.CANONICAL_SCENARIOS.length,
      failed: 0,
      raceCoverage: harness.RACE_COVERAGE_NOTE
    });
    const evidenceWrites = Array.from(fake.writes.entries()).filter(([target]) =>
      target.endsWith('manual-vhs-req-621.json')
    );
    expect(evidenceWrites).toHaveLength(1);
    const retainedEvidence = JSON.parse(evidenceWrites[0]?.[1] ?? '{}') as {
      schema: string;
      runId: string;
      host: { platform: string; hostname: string };
      labviewVersion: string;
      scenarios: Array<{
        id: string;
        expected: Record<string, string | number>;
        observed: Record<string, unknown>;
        pass: boolean;
        durationMs: number;
        artifacts: { proofPath: string; scenarioLogPath: string };
        portOracle?: {
          selectedLabviewIniPath: string;
          derivedExpectedTcpPort: number;
          isNonDefaultPort: boolean;
          observedLabviewIniPath: string;
          observedTcpPort: number;
        };
      }>;
      summary: { passed: number; failed: number; raceCoverage: string };
    };
    const retainedPortScenario = retainedEvidence.scenarios.find((scenario) => scenario.id === 'port-2026-x64');

    expect(Object.keys(retainedEvidence)).toEqual([
      'schema',
      'runId',
      'host',
      'labviewVersion',
      'scenarios',
      'summary'
    ]);
    expect(Object.keys(retainedEvidence.host)).toEqual(['platform', 'hostname']);
    expect(Object.keys(retainedEvidence.scenarios[0])).toEqual([
      'id',
      'expected',
      'observed',
      'pass',
      'durationMs',
      'artifacts'
    ]);
    expect(Object.keys(retainedEvidence.scenarios[0].artifacts)).toEqual(['proofPath', 'scenarioLogPath']);
    expect(Object.keys(retainedPortScenario ?? {})).toEqual([
      'id',
      'expected',
      'observed',
      'pass',
      'durationMs',
      'artifacts',
      'portOracle'
    ]);
    expect(Object.keys(retainedPortScenario?.portOracle ?? {})).toEqual([
      'selectedLabviewIniPath',
      'derivedExpectedTcpPort',
      'isNonDefaultPort',
      'observedLabviewIniPath',
      'observedTcpPort'
    ]);
    expect(Object.keys(retainedEvidence.summary)).toEqual(['passed', 'failed', 'raceCoverage']);
    expect(retainedEvidence.schema).toBe(harness.EVIDENCE_SCHEMA);
    expect(retainedEvidence.runId).toBe('2026-05-31T00:00:00.000Z');
    expect(retainedEvidence.summary.failed).toBe(0);
  });

  it('tolerates a UTF-8 BOM in the scenario log (Windows PowerShell Set-Content)', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const scenarioLogPayloads = allPassingPayloads();
    // Emulate Windows PowerShell 5.1 `Set-Content -Encoding UTF8`, which prepends a BOM.
    const writes = new Map<string, string>();
    const fakeFs = {
      existsSync: (target: string) => target in scenarioLogPayloads,
      readFileSync: (target: string) => {
        if (!(target in scenarioLogPayloads)) {
          throw new Error(`unexpected read: ${target}`);
        }
        return `\uFEFF${JSON.stringify(scenarioLogPayloads[target])}`;
      },
      writeFileSync: (target: string, contents: string) => {
        writes.set(target, contents);
      },
      mkdirSync: () => undefined
    };

    const result = harness.runRuntimeMatrix([], {
      spawnSync,
      fs: fakeFs,
      now: () => new Date('2026-05-31T00:00:00Z'),
      hostname: () => 'fake-runner',
      platform: 'win32',
      env: { VIHS_FAKE_WINDOWS: '1' },
      cwd: () => '.',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });

    expect(result.exitCode).toBe(0);
    expect(result.evidence?.summary).toEqual({
      passed: harness.CANONICAL_SCENARIOS.length,
      failed: 0,
      raceCoverage: harness.RACE_COVERAGE_NOTE
    });
  });

  it('exits non-zero when any scenario fails (VHS-REQ-622.3)', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const scenarioLogPayloads = {
      [`assurance-closeout-evidence${require('node:path').sep}runtime-matrix-proofs${require('node:path').sep}steady-A.scenario.json`]: {
        pass: false,
        failureReason: 'no-proof-file',
        observed: {}
      }
    };
    const fake = buildFakeFs(scenarioLogPayloads);

    const result = harness.runRuntimeMatrix(['--scenario', 'steady-A'], {
      spawnSync,
      fs: fake.fs,
      now: () => new Date('2026-05-31T00:00:00Z'),
      hostname: () => 'fake-runner',
      platform: 'win32',
      env: { VIHS_FAKE_WINDOWS: '1' },
      cwd: () => '.',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });

    expect(result.exitCode).toBe(1);
    expect(result.evidence?.summary.failed).toBe(1);
  });

  it('refuses to run on non-Windows without VIHS_FAKE_WINDOWS (VHS-REQ-622.1)', () => {
    expect(() =>
      harness.runRuntimeMatrix([], {
        spawnSync: vi.fn(),
        fs: { existsSync: () => false, readFileSync: () => '', writeFileSync: () => undefined, mkdirSync: () => undefined },
        now: () => new Date(),
        platform: 'linux',
        env: {},
        cwd: () => '.',
        stdout: { write: () => undefined },
        stderr: { write: () => undefined }
      })
    ).toThrow(/requires Windows/);
  });
});

describe('runWindowsRuntimeMatrix.parseArgs help + flag-value guards', () => {
  it('returns immediately for --help / -h without validating the scenario', () => {
    expect(harness.parseArgs(['--help']).help).toBe(true);
    expect(harness.parseArgs(['-h']).help).toBe(true);
    // --help short-circuits before scenario validation, so a bogus scenario is tolerated.
    expect(harness.parseArgs(['--scenario', 'race-A', '--help']).help).toBe(true);
  });

  it('rejects a flag whose value looks like another flag', () => {
    expect(() => harness.parseArgs(['--scenario', '--out'])).toThrow(/requires a value/);
  });
});

describe('runWindowsRuntimeMatrix.runRuntimeMatrix edge branches', () => {
  const sep = require('node:path').sep as string;
  const steadyLogPath = `assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}steady-A.scenario.json`;
  const passingSteadyLog = {
    pass: true,
    durationMs: 5,
    observed: {
      runtimeBlockedReason: 'windows-host-bitness-conflict',
      hostBitness: 'x64',
      selectedBitness: 'x86'
    }
  };

  it('prints usage and exits 0 for --help without touching the runtime', () => {
    const spawnSync = vi.fn();
    const out: string[] = [];
    const result = harness.runRuntimeMatrix(['--help'], {
      spawnSync,
      fs: { existsSync: () => false, readFileSync: () => '', writeFileSync: () => undefined, mkdirSync: () => undefined },
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => undefined }
    });
    expect(result.exitCode).toBe(0);
    expect(result.evidence).toBeUndefined();
    expect(result.evidencePath).toBeUndefined();
    expect(spawnSync).not.toHaveBeenCalled();
    expect(out.join('')).toMatch(/Usage: node scripts\/runWindowsRuntimeMatrix\.js/);
  });

  it('falls back to the default env and clock when neither is injected', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const fakeFs = {
      existsSync: (t: string) => t === steadyLogPath,
      readFileSync: (t: string) => {
        if (t !== steadyLogPath) throw new Error(`unexpected read ${t}`);
        return JSON.stringify(passingSteadyLog);
      },
      writeFileSync: () => undefined,
      mkdirSync: () => undefined
    };
    const result = harness.runRuntimeMatrix(['--scenario', 'steady-A'], {
      spawnSync,
      fs: fakeFs,
      // platform 'win32' passes the guard without needing an injected env.
      platform: 'win32',
      hostname: () => 'fake-runner',
      cwd: () => '.',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(result.exitCode).toBe(0);
    // The default clock (() => new Date()) produced a valid ISO runId.
    expect(typeof result.evidence?.runId).toBe('string');
  });

  it('treats a missing scenario log as no observations (readScenarioLog undefined path)', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const fakeFs = {
      existsSync: () => false, // the scenario log never exists
      readFileSync: () => {
        throw new Error('should not read a missing log');
      },
      writeFileSync: () => undefined,
      mkdirSync: () => undefined
    };
    const result = harness.runRuntimeMatrix(['--scenario', 'steady-A'], {
      spawnSync,
      fs: fakeFs,
      now: () => new Date('2026-05-31T00:00:00Z'),
      hostname: () => 'fake-runner',
      platform: 'win32',
      env: { VIHS_FAKE_WINDOWS: '1' },
      cwd: () => '.',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(result.exitCode).toBe(1);
    expect(result.evidence?.summary.failed).toBe(1);
  });

  it('records a read error when a scenario log is not valid JSON (readScenarioLog catch path)', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const fakeFs = {
      existsSync: (t: string) => t === steadyLogPath,
      readFileSync: (t: string) => (t === steadyLogPath ? 'not-json{' : ''),
      writeFileSync: () => undefined,
      mkdirSync: () => undefined
    };
    const result = harness.runRuntimeMatrix(['--scenario', 'steady-A'], {
      spawnSync,
      fs: fakeFs,
      now: () => new Date('2026-05-31T00:00:00Z'),
      hostname: () => 'fake-runner',
      platform: 'win32',
      env: { VIHS_FAKE_WINDOWS: '1' },
      cwd: () => '.',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(result.exitCode).toBe(1);
    expect(result.evidence?.summary.failed).toBe(1);
  });
});

describe('runWindowsRuntimeMatrix.main', () => {
  const mainFn = (harness as unknown as {
    main: (argv: string[], deps: Record<string, unknown>) => void;
  }).main;
  const sep = require('node:path').sep as string;
  const steadyLogPath = `assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}steady-A.scenario.json`;

  it('sets process.exitCode from a successful runRuntimeMatrix run', () => {
    const previous = process.exitCode;
    try {
      const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
      const fakeFs = {
        existsSync: (t: string) => t === steadyLogPath,
        readFileSync: () =>
          JSON.stringify({
            pass: true,
            durationMs: 5,
            observed: {
              runtimeBlockedReason: 'windows-host-bitness-conflict',
              hostBitness: 'x64',
              selectedBitness: 'x86'
            }
          }),
        writeFileSync: () => undefined,
        mkdirSync: () => undefined
      };
      mainFn(['--scenario', 'steady-A'], {
        spawnSync,
        fs: fakeFs,
        now: () => new Date('2026-05-31T00:00:00Z'),
        hostname: () => 'fake-runner',
        platform: 'win32',
        env: { VIHS_FAKE_WINDOWS: '1' },
        cwd: () => '.',
        stdout: { write: () => undefined },
        stderr: { write: () => undefined }
      });
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = previous;
    }
  });

  it('writes to stderr and sets exitCode 1 when runRuntimeMatrix throws', () => {
    const previous = process.exitCode;
    const errs: string[] = [];
    try {
      mainFn([], {
        spawnSync: vi.fn(),
        fs: { existsSync: () => false, readFileSync: () => '', writeFileSync: () => undefined, mkdirSync: () => undefined },
        platform: 'linux',
        env: {},
        cwd: () => '.',
        stdout: { write: () => undefined },
        stderr: { write: (s: string) => errs.push(s) }
      });
      expect(process.exitCode).toBe(1);
      expect(errs.join('')).toMatch(/requires Windows/);
    } finally {
      process.exitCode = previous;
    }
  });
});

describe('runWindowsRuntimeMatrix residual branch coverage (#2333)', () => {
  const sep = require('node:path').sep as string;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('node:os') as { hostname: () => string };

  const buildEvidence = (harness as unknown as {
    buildEvidence: (
      results: Array<{ pass: boolean }>,
      options: Record<string, unknown>,
      deps: Record<string, unknown>
    ) => { host: { platform: string; hostname: string }; summary: { passed: number; failed: number; raceCoverage: string } };
  }).buildEvidence;

  const mainFn = (harness as unknown as {
    main: (argv: string[], deps: Record<string, unknown>) => void;
  }).main;

  it('parses the labview-version, out, proof-dir, and keep-running flags', () => {
    const options = harness.parseArgs([
      '--scenario',
      'steady-A',
      '--labview-version',
      '2025',
      '--out',
      'custom-out.json',
      '--proof-dir',
      'custom-proofs',
      '--keep-running'
    ]);
    expect(options).toMatchObject({
      scenario: 'steady-A',
      labviewVersion: '2025',
      out: 'custom-out.json',
      proofDir: 'custom-proofs',
      keepRunning: true
    });
  });

  it('buildEvidence falls back to process.platform and os.hostname when those deps are omitted', () => {
    const evidence = buildEvidence(
      [{ pass: true }, { pass: false }],
      { labviewVersion: '2026' },
      { now: () => new Date('2026-05-31T00:00:00Z') }
    );
    // No deps.platform -> process.platform; no deps.hostname -> os.hostname().
    expect(evidence.host.platform).toBe(process.platform);
    expect(evidence.host.hostname).toBe(os.hostname());
    expect(evidence.summary).toEqual({ passed: 1, failed: 1, raceCoverage: harness.RACE_COVERAGE_NOTE });
  });

  it('runRuntimeMatrix falls back to process cwd/platform/streams when those deps are omitted', () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const steadyLogPath = `assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}steady-A.scenario.json`;
      const fakeFs = {
        existsSync: (target: string) => target === steadyLogPath,
        readFileSync: () =>
          JSON.stringify({
            pass: true,
            durationMs: 5,
            observed: {
              runtimeBlockedReason: 'windows-host-bitness-conflict',
              hostBitness: 'x64',
              selectedBitness: 'x86'
            }
          }),
        writeFileSync: () => undefined,
        mkdirSync: () => undefined
      };
      const result = harness.runRuntimeMatrix(['--scenario', 'steady-A'], {
        spawnSync: vi.fn().mockReturnValue({ status: 0, error: undefined }),
        fs: fakeFs,
        now: () => new Date('2026-05-31T00:00:00Z'),
        hostname: () => 'fake-runner',
        // platform, cwd, stdout, and stderr are omitted so the process.* fallback
        // arms resolve; VIHS_FAKE_WINDOWS keeps the platform guard happy on Linux.
        env: { VIHS_FAKE_WINDOWS: '1' }
      });
      expect(result.exitCode).toBe(0);
      expect(outSpy).toHaveBeenCalled();
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('main resolves process.stderr when a thrown run supplies no stderr stream', () => {
    const previous = process.exitCode;
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      // platform=linux without the fake-windows override throws the guard, and with
      // no deps.stderr the catch resolves the process.stderr fallback.
      mainFn([], {
        spawnSync: vi.fn(),
        fs: { existsSync: () => false, readFileSync: () => '', writeFileSync: () => undefined, mkdirSync: () => undefined },
        platform: 'linux',
        env: {},
        cwd: () => '.'
      });
      expect(process.exitCode).toBe(1);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('requires Windows'));
    } finally {
      errSpy.mockRestore();
      process.exitCode = previous;
    }
  });
});
