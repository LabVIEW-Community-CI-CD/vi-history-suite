import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const script = require(path.resolve(__dirname, '..', '..', 'scripts', 'assertGovernedRunnerLanes.js')) as {
  parseArgs: (argv: string[], platform?: string) => {
    helpRequested: boolean;
    surface: string;
    linuxDistro: string;
    repoRoot: string;
  };
  windowsPathToWslPath: (candidatePath: string) => string;
  buildWindowsAssertionInvocation: (repoRoot: string) => { command: string; args: string[] };
  buildLinuxAssertionInvocation: (
    repoRoot: string,
    linuxDistro: string,
    platform?: string
  ) => { command: string; args: string[] };
  runAssertions: (
    options: { surface: string; linuxDistro: string; repoRoot: string },
    dependencies?: {
      platform?: string;
      executeCommand?: (
        command: string,
        args: string[],
        options?: { cwd?: string }
      ) => { status: number; stdout: string; stderr: string; error?: Error };
    }
  ) => Record<string, unknown>;
};

describe('assert governed runner lanes script', () => {
  it('defaults to all on Windows and linux on non-Windows hosts', () => {
    expect(script.parseArgs([], 'win32')).toEqual(
      expect.objectContaining({
        helpRequested: false,
        surface: 'all',
        linuxDistro: 'Ubuntu'
      })
    );
    expect(script.parseArgs([], 'linux')).toEqual(
      expect.objectContaining({
        helpRequested: false,
        surface: 'linux',
        linuxDistro: 'Ubuntu'
      })
    );
  });

  it('converts Windows repo paths into WSL paths for the Linux assertion surface', () => {
    expect(
      script.windowsPathToWslPath(
        'D:\\workspace\\codex-research-drop\\working\\vi-history-suite-intake\\scripts\\gitlab-runner\\linux\\assert-linux-assurance-runner.sh'
      )
    ).toBe(
      '/mnt/d/workspace/codex-research-drop/working/vi-history-suite-intake/scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh'
    );
  });

  it('builds the admitted Windows-host assertion invocations', () => {
    expect(script.buildWindowsAssertionInvocation('D:\\repo')).toEqual({
      command: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-File',
        path.join(
          'D:\\repo',
          'scripts',
          'gitlab-runner',
          'windows',
          'assert-governed-runner-lanes.ps1'
        )
      ]
    });
    expect(script.buildLinuxAssertionInvocation('D:\\repo', 'Ubuntu', 'win32')).toEqual({
      command: 'wsl.exe',
      args: [
        '-d',
        'Ubuntu',
        'bash',
        '-lc',
        "bash '/mnt/d/repo/scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh'"
      ]
    });
  });

  it('aggregates both runner-lane assertions on the admitted Windows host', () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const summary = script.runAssertions(
      {
        surface: 'all',
        linuxDistro: 'Ubuntu',
        repoRoot: 'D:\\repo'
      },
      {
        platform: 'win32',
        executeCommand: (command, args, options) => {
          calls.push({ command, args, cwd: options?.cwd });
          if (command === 'powershell.exe') {
            return {
              status: 0,
              stdout: '{"lane":"windows","runnerProcessIds":[1234]}',
              stderr: ''
            };
          }
          return {
            status: 0,
            stdout: '{"lane":"linux","enabledState":"enabled"}',
            stderr: ''
          };
        }
      }
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        command: 'powershell.exe',
        cwd: path.resolve('D:\\repo')
      })
    );
    expect(calls[1]).toEqual(
      expect.objectContaining({
        command: 'wsl.exe',
        cwd: path.resolve('D:\\repo')
      })
    );
    expect(summary).toEqual(
      expect.objectContaining({
        platform: 'win32',
        surface: 'all',
        linuxDistro: 'Ubuntu',
        windows: {
          lane: 'windows',
          runnerProcessIds: [1234]
        },
        linux: {
          lane: 'linux',
          enabledState: 'enabled'
        }
      })
    );
  });

  it('fails closed when the Windows surface is requested from a non-Windows host', () => {
    expect(() =>
      script.runAssertions(
        {
          surface: 'windows',
          linuxDistro: 'Ubuntu',
          repoRoot: '/tmp/repo'
        },
        {
          platform: 'linux'
        }
      )
    ).toThrow('Windows runner assertion requires a Windows host.');
  });
});
