import { describe, expect, it, vi } from 'vitest';

import {
  applyGovernedProofCliExitCode,
  getGovernedProofUsage,
  maybeRunGovernedProofCliAsMain,
  parseGovernedProofCommand,
  runGovernedProofCli,
  runGovernedProofCliMain
} from '../../src/cli/runGovernedProof';

describe('runGovernedProofCli', () => {
  it('parses canonical governed-proof subcommands and help', () => {
    expect(parseGovernedProofCommand([])).toBe('help');
    expect(parseGovernedProofCommand(['--help'])).toBe('help');
    expect(parseGovernedProofCommand(['smoke', '--harness-id', 'HARNESS-VHS-001'])).toEqual({
      subcommand: 'smoke',
      args: ['--harness-id', 'HARNESS-VHS-001']
    });
    expect(
      parseGovernedProofCommand(['host-operation-matrix', '--operation', 'CloseLabVIEW'])
    ).toEqual({
      subcommand: 'host-operation-matrix',
      args: ['--operation', 'CloseLabVIEW']
    });
    expect(() => parseGovernedProofCommand(['lvcompare'])).toThrow(
      /Unknown governed proof subcommand/
    );
    expect(getGovernedProofUsage()).toContain('one public proof entrypoint: runGovernedProof');
    expect(getGovernedProofUsage()).toContain(
      'one canonical report engine: LabVIEWCLI CreateComparisonReport'
    );
    expect(getGovernedProofUsage()).toContain(
      'no public LVCompare engine or path override surface'
    );
    expect(getGovernedProofUsage()).toContain('host-operation-matrix');
  });

  it('prints help without dispatching subcommands', async () => {
    const stdout = { write: vi.fn() };

    await expect(runGovernedProofCli([], { stdout })).resolves.toBe('help');
    expect(stdout.write).toHaveBeenCalledWith(`${getGovernedProofUsage()}\n`);
  });

  it('dispatches to the selected governed subcommand only', async () => {
    const smokeDeps = {
      stdout: { write: vi.fn() }
    };
    const reportSmokeDeps = {
      stdout: { write: vi.fn() }
    };
    const hostOperationMatrixDeps = {
      stdout: { write: vi.fn() }
    };

    await expect(
      runGovernedProofCli(['host-operation-matrix', '--help'], {
        smokeDeps,
        reportSmokeDeps,
        hostOperationMatrixDeps
      })
    ).resolves.toBe('help');

    expect(hostOperationMatrixDeps.stdout.write).toHaveBeenCalled();
    expect(smokeDeps.stdout.write).not.toHaveBeenCalled();
    expect(reportSmokeDeps.stdout.write).not.toHaveBeenCalled();
  });

  it('routes main execution errors through stderr and process.exitCode', async () => {
    const stderr = { write: vi.fn() };
    const exitProcess = { exitCode: 0 };

    const exitCode = await runGovernedProofCliMain(['unknown-command'], {}, stderr);
    expect(exitCode).toBe(1);
    expect(stderr.write).toHaveBeenCalledWith(expect.stringMatching(/Unknown governed proof subcommand/));

    expect(applyGovernedProofCliExitCode(1, exitProcess)).toBe(1);
    expect(exitProcess.exitCode).toBe(1);
  });

  it('runs as main only when the current module is the entrypoint', () => {
    const processLike = { exitCode: 0 };
    const currentModule = {} as NodeModule;

    expect(
      maybeRunGovernedProofCliAsMain([], undefined, currentModule, {}, processLike)
    ).toBe(false);
    expect(processLike.exitCode).toBe(0);
  });
});
