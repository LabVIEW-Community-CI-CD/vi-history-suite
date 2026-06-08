import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const harness = require('../../scripts/runWindowsRuntimeMatrix.js') as {
  EVIDENCE_SCHEMA: string;
  RACE_COVERAGE_NOTE: string;
  DEFAULT_EVIDENCE_OUT: string;
  KNOWN_SCENARIOS: readonly string[];
  SCENARIO_PARAMETERS: Readonly<
    Record<string, { hostBitness: 'x64' | 'x86'; selectedBitness: 'x64' | 'x86' }>
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
    parameters: { hostBitness: string; selectedBitness: string };
    proofPath: string;
    logPath: string;
  }>;
  buildPowershellArgs: (
    scenario: { id: string; parameters: { hostBitness: string; selectedBitness: string }; proofPath: string; logPath: string },
    options: { labviewVersion: string; keepRunning: boolean }
  ) => string[];
  summarizeScenario: (
    scenario: { id: string; parameters: { hostBitness: string; selectedBitness: string }; proofPath: string; logPath: string },
    spawnResult: { status: number },
    scenarioLog: unknown
  ) => {
    id: string;
    pass: boolean;
    failureReason?: string;
    expected: Record<string, string>;
    observed: Record<string, unknown>;
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

  it('throws on non-Windows without the test override', () => {
    expect(() => harness.ensurePlatformGuard('darwin', {})).toThrow(
      /requires Windows/
    );
  });
});

describe('runWindowsRuntimeMatrix.buildScenarioPlan', () => {
  it('emits a per-scenario plan with proof and log paths under the proof directory', () => {
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
});

describe('runWindowsRuntimeMatrix.buildPowershellArgs', () => {
  it('passes scenario, bitness, paths, and labview version to the helper', () => {
    const scenario = {
      id: 'steady-A',
      parameters: { hostBitness: 'x64', selectedBitness: 'x86' },
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
    expect(args[args.indexOf('-LabviewVersion') + 1]).toBe('2026');
    expect(args[args.indexOf('-ProofOutPath') + 1]).toBe('proofs/steady-A.proof.json');
    expect(args[args.indexOf('-ScenarioLogPath') + 1]).toBe('proofs/steady-A.scenario.json');
    expect(args).not.toContain('-KeepRunning');
  });

  it('adds -KeepRunning when requested', () => {
    const scenario = {
      id: 'steady-B',
      parameters: { hostBitness: 'x86', selectedBitness: 'x64' },
      proofPath: 'p.json',
      logPath: 'l.json'
    };
    const args = harness.buildPowershellArgs(scenario, {
      labviewVersion: '2026',
      keepRunning: true
    });
    expect(args).toContain('-KeepRunning');
  });

  it('never emits an empty-string argument', () => {
    const scenario = {
      id: 'steady-A',
      parameters: { hostBitness: 'x64', selectedBitness: 'x86' },
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
    parameters: { hostBitness: 'x64', selectedBitness: 'x86' },
    proofPath: 'p.proof.json',
    logPath: 'p.scenario.json'
  };

  it('passes when scenario log reports pass and matches expected observations', () => {
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

  it('writes an evidence file with passing summary when both scenarios match expectations', () => {
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
    // Evidence file write recorded.
    expect(Array.from(fake.writes.keys()).some((key) => key.endsWith('manual-vhs-req-621.json'))).toBe(true);
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

  it('exits non-zero when any scenario fails', () => {
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

  it('refuses to run on non-Windows without VIHS_FAKE_WINDOWS', () => {
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
