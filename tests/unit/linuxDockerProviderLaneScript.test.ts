import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const linuxDockerProviderLane = require(path.join(
  repoRoot,
  'scripts',
  'runLinuxDockerProviderLane.js'
)) as {
  createLinuxDockerProviderLaneSteps: (options: {
    linuxImage: string;
    settingsFilePath: string;
  }) => Array<{ id: string; command: string; args: string[]; allowFailure?: boolean }>;
  getLinuxDockerProviderLaneUsage: () => string;
  parseLinuxDockerProviderLaneArgs: (argv: string[]) => {
    helpRequested: boolean;
    linuxImage: string;
    evidenceDir?: string;
  };
  runLinuxDockerProviderLane: (
    argv: string[],
    deps: {
      cwd?: string;
      now?: () => Date;
      spawnSync?: (command: string, args: string[]) => { status: number; stdout?: string; stderr?: string };
      stdout?: { write(text: string): void };
      stderr?: { write(text: string): void };
    }
  ) => Promise<string>;
};

describe('linux docker provider lane script', () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('retains deterministic command shape and argument parsing', () => {
    expect(
      linuxDockerProviderLane.parseLinuxDockerProviderLaneArgs([
        '--linux-image',
        'example/labview-linux',
        '--evidence-dir',
        'artifacts/lane'
      ])
    ).toEqual({
      helpRequested: false,
      linuxImage: 'example/labview-linux',
      evidenceDir: path.resolve('artifacts/lane')
    });
    expect(linuxDockerProviderLane.getLinuxDockerProviderLaneUsage()).toContain('--linux-image');

    expect(
      linuxDockerProviderLane.createLinuxDockerProviderLaneSteps({
        linuxImage: 'nationalinstruments/labview:2026q1-linux',
        settingsFilePath: '/tmp/settings.json'
      }).map((step) => ({
        id: step.id,
        command: step.command,
        args: step.args,
        allowFailure: step.allowFailure
      }))
    ).toEqual([
      {
        id: 'docker-info',
        command: 'docker',
        args: [
          'info',
          '--format',
          'ostype={{.OSType}} server={{.ServerVersion}} driver={{.Driver}} cgroup={{.CgroupDriver}}'
        ],
        allowFailure: undefined
      },
      {
        id: 'docker-context-show',
        command: 'docker',
        args: ['context', 'show'],
        allowFailure: true
      },
      {
        id: 'docker-context-ls',
        command: 'docker',
        args: ['context', 'ls', '--format', '{{json .}}'],
        allowFailure: true
      },
      {
        id: 'linux-image-inspect',
        command: 'docker',
        args: ['image', 'inspect', 'nationalinstruments/labview:2026q1-linux'],
        allowFailure: true
      },
      {
        id: 'vihs-settings-update',
        command: process.execPath,
        args: expect.arrayContaining([
          '--provider',
          'docker',
          '--labview-version',
          '2026',
          '--labview-bitness',
          'x64',
          '--settings-file',
          '/tmp/settings.json'
        ]),
        allowFailure: undefined
      },
      {
        id: 'vihs-settings-validate',
        command: process.execPath,
        args: expect.arrayContaining(['--validate', '--settings-file', '/tmp/settings.json']),
        allowFailure: undefined
      }
    ]);
  });

  it('writes a Linux Docker provider receipt with Windows proof deferred', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-docker-provider-lane-'));
    tempDirectories.push(tempRoot);
    const evidenceDir = path.join(tempRoot, 'evidence');
    const calls: Array<{ command: string; args: string[] }> = [];
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await linuxDockerProviderLane.runLinuxDockerProviderLane(
      ['--evidence-dir', evidenceDir],
      {
        cwd: repoRoot,
        now: () => new Date('2026-04-25T18:00:00.000Z'),
        stdout: { write: (text: string) => stdout.push(text) },
        stderr: { write: (text: string) => stderr.push(text) },
        spawnSync: (command: string, args: string[]) => {
          calls.push({ command, args });

          if (command === 'docker' && args[0] === 'info') {
            return {
              status: 0,
              stdout: 'ostype=linux server=29.4.1 driver=overlayfs cgroup=systemd\n',
              stderr: ''
            };
          }

          if (command === 'docker' && args[0] === 'context' && args[1] === 'show') {
            return { status: 0, stdout: 'desktop-linux\n', stderr: '' };
          }

          if (command === 'docker' && args[0] === 'context' && args[1] === 'ls') {
            return { status: 0, stdout: '{"Name":"desktop-linux","Current":true}\n', stderr: '' };
          }

          if (command === 'docker' && args[0] === 'image') {
            return { status: 1, stdout: '', stderr: 'No such image\n' };
          }

          if (command === process.execPath && args.includes('--validate')) {
            return {
              status: 0,
              stdout: [
                'Validated explicit-settings-file target /tmp/settings.json',
                'settingsTarget=explicit-settings-file',
                'settingsFilePath=/tmp/settings.json',
                'viHistorySuite.runtimeProvider=docker',
                'viHistorySuite.labviewVersion=2026',
                'viHistorySuite.labviewBitness=x64',
                'runtimeValidationOutcome=ready',
                'runtimeProvider=linux-container',
                'runtimeEngine=labview-cli',
                'runtimeBlockedReason=<none>',
                ''
              ].join('\n'),
              stderr: ''
            };
          }

          if (command === process.execPath) {
            return {
              status: 0,
              stdout: [
                'Updated explicit-settings-file target /tmp/settings.json',
                'settingsTarget=explicit-settings-file',
                'settingsFilePath=/tmp/settings.json',
                'viHistorySuite.runtimeProvider=docker',
                'viHistorySuite.labviewVersion=2026',
                'viHistorySuite.labviewBitness=x64',
                ''
              ].join('\n'),
              stderr: ''
            };
          }

          return { status: 1, stdout: '', stderr: 'unexpected command\n' };
        }
      }
    );

    expect(result).toBe('pass');
    expect(calls.map((call) => call.args[0])).toEqual([
      'info',
      'context',
      'context',
      'image',
      path.join(repoRoot, 'out', 'tooling', 'localRuntimeSettingsCli.js'),
      path.join(repoRoot, 'out', 'tooling', 'localRuntimeSettingsCli.js')
    ]);
    expect(stdout.join('')).toContain('Linux Docker provider lane passed');
    expect(stderr.join('')).toContain('No such image');

    const report = JSON.parse(
      await fs.readFile(path.join(evidenceDir, 'linux-docker-provider-lane.json'), 'utf8')
    );
    expect(report).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/linux-docker-provider-lane@v1',
        recordedAt: '2026-04-25T18:00:00.000Z',
        status: 'passed',
        claimScope: 'linux-docker-validated-preview',
        publicGitHubMutation: 'not-performed',
        marketplaceMutation: 'not-performed'
      })
    );
    expect(report.providerLane).toEqual(
      expect.objectContaining({
        hostContract: 'linux-docker-desktop-or-docker-engine',
        selectedProviderSetting: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        runtimeProvider: 'linux-container',
        runtimeEngine: 'labview-cli',
        runtimeValidationOutcome: 'ready',
        runtimeBlockedReason: '<none>',
        linuxImageAcquisitionState: 'acquisition-required-before-first-compare-run'
      })
    );
    expect(report.docker).toEqual(
      expect.objectContaining({
        ostype: 'linux',
        serverVersion: '29.4.1',
        context: 'desktop-linux'
      })
    );
    expect(report.windowsLabviewProof).toEqual(
      expect.objectContaining({
        included: false,
        state: 'community-deferred',
        requiredForThisLane: false,
        requiredBeforeWindowsInstalledUserClaim: true
      })
    );
  });
});
