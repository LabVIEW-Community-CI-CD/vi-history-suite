import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const script = require(path.resolve(__dirname, '..', '..', 'scripts', 'doctorGovernedRunnerLanes.js')) as {
  parseArgs: (argv: string[], platform?: string, env?: NodeJS.ProcessEnv) => {
    helpRequested: boolean;
    surface: string;
    linuxDistro: string;
    repoRoot: string;
    evidenceDir: string;
    failOnDrift: boolean;
  };
  buildWindowsDoctorInvocation: (repoRoot: string) => { command: string; args: string[] };
  buildLinuxDoctorInvocation: (
    repoRoot: string,
    linuxDistro: string,
    platform?: string
  ) => { command: string; args: string[] };
  runDoctor: (
    options: {
      surface: string;
      linuxDistro: string;
      repoRoot: string;
      evidenceDir?: string;
      failOnDrift?: boolean;
    },
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

describe('doctor governed runner lanes script', () => {
  it('defaults to all on Windows and linux on non-Windows hosts', () => {
    expect(script.parseArgs([], 'win32')).toEqual(
      expect.objectContaining({
        helpRequested: false,
        surface: 'all',
        linuxDistro: 'Ubuntu-24.04',
        failOnDrift: false
      })
    );
    expect(script.parseArgs([], 'linux')).toEqual(
      expect.objectContaining({
        helpRequested: false,
        surface: 'linux',
        linuxDistro: 'Ubuntu-24.04',
        failOnDrift: false
      })
    );
  });

  it('admits an override for the Linux distro name', () => {
    expect(
      script.parseArgs([], 'win32', {
        VIHS_LINUX_ASSURANCE_DISTRO: 'Custom-Ubuntu'
      })
    ).toEqual(
      expect.objectContaining({
        linuxDistro: 'Custom-Ubuntu'
      })
    );
  });

  it('builds the admitted Windows-host doctor invocations', () => {
    expect(script.buildWindowsDoctorInvocation('D:\\repo')).toEqual({
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
          'doctor-governed-runner-lanes.ps1'
        )
      ]
    });
    expect(script.buildLinuxDoctorInvocation('D:\\repo', 'Ubuntu-24.04', 'win32')).toEqual({
      command: 'wsl.exe',
      args: [
        '-d',
        'Ubuntu-24.04',
        'bash',
        '-lc',
        "bash '/mnt/d/repo/scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh'"
      ]
    });
  });

  it('aggregates both runner-lane doctor surfaces on the admitted Windows host', () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const summary = script.runDoctor(
      {
        surface: 'all',
        linuxDistro: 'Ubuntu-24.04',
        repoRoot: 'D:\\repo'
      },
      {
        platform: 'win32',
        executeCommand: (command, args, options) => {
          calls.push({ command, args, cwd: options?.cwd });
          if (command === 'powershell.exe') {
            return {
              status: 0,
              stdout: '{"healthy":true,"issues":[],"runnerProcessCount":1}',
              stderr: ''
            };
          }
          return {
            status: 0,
            stdout: '{"healthy":true,"issues":[],"globalConcurrent":2}',
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
        linuxDistro: 'Ubuntu-24.04',
        healthy: true,
        issues: [],
        windows: {
          healthy: true,
          issues: [],
          runnerProcessCount: 1
        },
        linux: {
          healthy: true,
          issues: [],
          globalConcurrent: 2
        }
      })
    );
  });

  it('fails closed when fail-on-drift is requested and either lane is unhealthy', () => {
    expect(() =>
      script.runDoctor(
        {
          surface: 'linux',
          linuxDistro: 'Ubuntu-24.04',
          repoRoot: '/tmp/repo',
          failOnDrift: true
        },
        {
          platform: 'linux',
          executeCommand: () => ({
            status: 0,
            stdout: '{"healthy":false,"issues":["Expected concurrent = 2"],"globalConcurrent":1}',
            stderr: ''
          })
        }
      )
    ).toThrow('Governed runner doctor detected drift.');
  });

  it('fails closed when the Windows surface is requested from a non-Windows host', () => {
    expect(() =>
      script.runDoctor(
        {
          surface: 'windows',
          linuxDistro: 'Ubuntu-24.04',
          repoRoot: '/tmp/repo'
        },
        {
          platform: 'linux'
        }
      )
    ).toThrow('Windows runner doctor requires a Windows host.');
  });
});
