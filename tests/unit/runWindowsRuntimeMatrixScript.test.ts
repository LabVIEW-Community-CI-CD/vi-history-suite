import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const harness = require('../../scripts/runWindowsRuntimeMatrix.js') as {
  EVIDENCE_SCHEMA: string;
  RACE_COVERAGE_NOTE: string;
  DEFAULT_EVIDENCE_OUT: string;
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
  it('returns every known scenario when asked for all', () => {
    expect(harness.selectScenarios('all')).toEqual([...harness.KNOWN_SCENARIOS]);
  });

  it('returns a single-element list for a specific scenario', () => {
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
    expect(plan).toHaveLength(harness.KNOWN_SCENARIOS.length);
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

  it('writes an evidence file with passing summary when all runtime scenarios match expectations (VHS-REQ-622.1, VHS-REQ-622.3, VHS-REQ-623.6, VHS-REQ-653.7)', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0, error: undefined });
    const scenarioLogPayloads = {
      [`assurance-closeout-evidence${require('node:path').sep}runtime-matrix-proofs${require('node:path').sep}steady-A.scenario.json`]: {
        pass: true,
        durationMs: 100,
        observed: {
          runtimeBlockedReason: 'windows-host-bitness-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x86',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${require('node:path').sep}runtime-matrix-proofs${require('node:path').sep}steady-B.scenario.json`]: {
        pass: true,
        durationMs: 110,
        observed: {
          runtimeBlockedReason: 'windows-host-bitness-conflict',
          hostBitness: 'x86',
          selectedBitness: 'x64',
          labviewExecutablePath: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${require('node:path').sep}runtime-matrix-proofs${require('node:path').sep}version-A.scenario.json`]: {
        pass: true,
        durationMs: 120,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostVersion: '2025',
          selectedVersion: '2026',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${require('node:path').sep}runtime-matrix-proofs${require('node:path').sep}version-B.scenario.json`]: {
        pass: true,
        durationMs: 130,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostVersion: '2026',
          selectedVersion: '2025',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${require('node:path').sep}runtime-matrix-proofs${require('node:path').sep}port-A.scenario.json`]: {
        pass: true,
        durationMs: 140,
        observed: {
          runtimeBlockedReason: 'none',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostLabviewTcpPort: 3366,
          hostLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        },
        portOracle: {
          selectedLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
          derivedExpectedTcpPort: 3366,
          isNonDefaultPort: true,
          observedLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
          observedTcpPort: 3366
        }
      }
    };
    const fake = buildFakeFs(scenarioLogPayloads);

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

    expect(spawnSync).toHaveBeenCalledTimes(harness.KNOWN_SCENARIOS.length);
    expect(result.exitCode).toBe(0);
    expect(result.evidence?.schema).toBe(harness.EVIDENCE_SCHEMA);
    expect(result.evidence?.summary).toEqual({
      passed: harness.KNOWN_SCENARIOS.length,
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
    const retainedPortScenario = retainedEvidence.scenarios.find((scenario) => scenario.id === 'port-A');

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
    const sep = require('node:path').sep;
    const scenarioLogPayloads = {
      [`assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}steady-A.scenario.json`]: {
        pass: true,
        durationMs: 100,
        observed: {
          runtimeBlockedReason: 'windows-host-bitness-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x86',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}steady-B.scenario.json`]: {
        pass: true,
        durationMs: 110,
        observed: {
          runtimeBlockedReason: 'windows-host-bitness-conflict',
          hostBitness: 'x86',
          selectedBitness: 'x64',
          labviewExecutablePath: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}version-A.scenario.json`]: {
        pass: true,
        durationMs: 120,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostVersion: '2025',
          selectedVersion: '2026',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}version-B.scenario.json`]: {
        pass: true,
        durationMs: 130,
        observed: {
          runtimeBlockedReason: 'windows-host-version-conflict',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostVersion: '2026',
          selectedVersion: '2025',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      },
      [`assurance-closeout-evidence${sep}runtime-matrix-proofs${sep}port-A.scenario.json`]: {
        pass: true,
        durationMs: 140,
        observed: {
          runtimeBlockedReason: 'none',
          hostBitness: 'x64',
          selectedBitness: 'x64',
          hostLabviewTcpPort: 3366,
          hostLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
          labviewExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        },
        portOracle: {
          selectedLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
          derivedExpectedTcpPort: 3366,
          isNonDefaultPort: true,
          observedLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
          observedTcpPort: 3366
        }
      }
    };
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
      passed: harness.KNOWN_SCENARIOS.length,
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
