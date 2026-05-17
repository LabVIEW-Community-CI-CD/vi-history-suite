import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const acceptanceScript = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'runWindowsPrivateReleaseAcceptance.js'
)) as {
  parseArgs: (argv: string[]) => {
    helpRequested: boolean;
    scope: string;
    repoRoot: string;
    evidenceRoot: string;
    hostSettingsFile: string;
    containerSettingsFile: string;
    harnessId: string;
    selectedHash: string;
    baseHash: string;
    runtimeTimeoutMs: number;
    bitness: string;
  };
  buildWindowsPrivateReleaseAcceptancePlan: (options: {
    scope?: string;
    repoRoot: string;
    evidenceRoot: string;
    hostSettingsFile: string;
    containerSettingsFile: string;
    harnessId: string;
    selectedHash: string;
    baseHash: string;
    runtimeTimeoutMs: number;
    bitness: string;
  }) => {
    manifestPath: string;
    scope: string;
    lanes: Array<{
      laneId: string;
      providerRequest: string;
      proofExecutionMode: string;
      outputRoot: string;
      settingsFilePath: string;
      steps: Array<{
        kind: string;
        transcriptFileName: string;
        command: string;
        args: string[];
      }>;
    }>;
  };
  buildManifest: (
    plan: {
      evidenceRoot: string;
      harnessId: string;
      selectedHash: string;
      baseHash: string;
      runtimeTimeoutMs: number;
      scope?: string;
    },
    laneResults: Array<{
      laneId: string;
      providerRequest: string;
      proofExecutionMode: string;
      report: {
        runtimeProvider: string;
        generatedReportExists: boolean;
      };
    }>
  ) => {
    schema: string;
    jobName: string;
    governedScript: string;
    scope: string;
    claimScope: string;
    dockerProofIncluded: boolean;
    evidenceRoot: string;
    lanes: Array<{
      laneId: string;
      providerRequest: string;
      proofExecutionMode: string;
      report: {
        runtimeProvider: string;
        generatedReportExists: boolean;
      };
    }>;
  };
  formatCommand: (command: string, args: string[]) => string;
  runLaneStep: (
    plan: {
      repoRoot: string;
      evidenceRoot: string;
      harnessReportRoot?: string;
    },
    lane: {
      laneId: string;
      outputRoot: string;
      transcripts?: {
        proofRunPreRecovery?: string;
      };
    },
    step: {
      kind: string;
      transcriptFileName: string;
      command: string;
      args: string[];
    },
    deps?: {
      runCommandImpl?: (
        command: string,
        args: string[],
        options: {
          cwd: string;
          transcriptPath: string;
        }
      ) => void;
      fspImpl?: typeof fsp;
      sleepImpl?: (milliseconds: number) => Promise<void>;
    }
  ) => Promise<{
    transcriptPath: string;
    recoveryTranscriptPath?: string;
    boundedRecovery?: {
      attempted: boolean;
      trigger: string;
      recoveryScript?: string;
      recoveryTranscript?: string;
      retryDelayMs: number;
      firstFailureTranscript: string;
    };
  }>;
  shouldRetryWindowsHostProofStep: (
    lane: {
      laneId: string;
    },
    step: {
      kind: string;
    },
    transcriptPath: string,
    deps?: {
      fspImpl?: typeof fsp;
    }
  ) => Promise<boolean>;
  runWindowsHostProofRuntimeRecovery: (
    plan: {
      repoRoot: string;
      evidenceRoot: string;
    },
    lane: {
      outputRoot: string;
      transcripts?: {
        proofRuntimeRecovery?: string;
      };
    },
    deps?: {
      runCommandImpl?: (
        command: string,
        args: string[],
        options: {
          cwd: string;
          transcriptPath: string;
        }
      ) => void;
      fspImpl?: typeof fsp;
    }
  ) => Promise<string>;
};

const repoRoot = path.resolve(__dirname, '..', '..');

describe('runWindowsPrivateReleaseAcceptance script', () => {
  it('builds the canonical host and container acceptance plan for lv_icon.vi', () => {
    const parsed = acceptanceScript.parseArgs([]);
    const plan = acceptanceScript.buildWindowsPrivateReleaseAcceptancePlan(parsed);

    expect(parsed.helpRequested).toBe(false);
    expect(parsed.harnessId).toBe('HARNESS-VHS-002');
    expect(parsed.selectedHash).toBe('8741bb08026c104100720c0ef48621e4ab7762fd');
    expect(parsed.baseHash).toBe('c188cdec606aac3b17d8b17274baa19eef3e4017');
    expect(parsed.runtimeTimeoutMs).toBe(300000);
    expect(parsed.bitness).toBe('x64');
    expect(parsed.scope).toBe('full');

    expect(plan.manifestPath).toContain('windows-private-release-evidence');
    expect(plan.lanes).toHaveLength(2);

    expect(plan.lanes[0]).toEqual(
      expect.objectContaining({
        laneId: 'windows-host-native',
        providerRequest: 'host',
        proofExecutionMode: 'host-only'
      })
    );
    expect(plan.lanes[1]).toEqual(
      expect.objectContaining({
        laneId: 'windows-container',
        providerRequest: 'docker',
        proofExecutionMode: 'docker-only'
      })
    );

    expect(plan.lanes[0].steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'settings-write',
          transcriptFileName: 'settings-write.txt'
        }),
        expect.objectContaining({
          kind: 'proof-run',
          transcriptFileName: 'proof-run.txt'
        })
      ])
    );
    expect(plan.lanes[1].steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'settings-write',
          transcriptFileName: 'settings-write.txt'
        }),
        expect.objectContaining({
          kind: 'settings-validate',
          transcriptFileName: 'settings-validate.txt'
        }),
        expect.objectContaining({
          kind: 'proof-run',
          transcriptFileName: 'proof-run.txt'
        })
      ])
    );

    const hostProofStep = plan.lanes[0].steps.find((step) => step.kind === 'proof-run');
    const containerProofStep = plan.lanes[1].steps.find((step) => step.kind === 'proof-run');

    expect(hostProofStep?.args).toEqual(
      expect.arrayContaining([
        'report-smoke',
        '--selected-hash',
        '8741bb08026c104100720c0ef48621e4ab7762fd',
        '--base-hash',
        'c188cdec606aac3b17d8b17274baa19eef3e4017',
        '--execution-mode',
        'host-only'
      ])
    );
    expect(containerProofStep?.args).toEqual(
      expect.arrayContaining([
        'report-smoke',
        '--execution-mode',
        'docker-only',
        '--bitness',
        'x64'
      ])
    );
  });

  it('builds a host-only installed-user acceptance plan without the Docker lane', () => {
    const parsed = acceptanceScript.parseArgs(['--scope', 'host-only']);
    const plan = acceptanceScript.buildWindowsPrivateReleaseAcceptancePlan(parsed);

    expect(parsed.scope).toBe('host-only');
    expect(parsed.evidenceRoot).toContain('windows-installed-user-host-evidence');
    expect(plan.scope).toBe('host-only');
    expect(plan.manifestPath).toContain('windows-installed-user-host-evidence');
    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]).toEqual(
      expect.objectContaining({
        laneId: 'windows-host-native',
        providerRequest: 'host',
        proofExecutionMode: 'host-only'
      })
    );
    expect(plan.lanes[0].steps.map((step) => step.kind)).toEqual([
      'settings-write',
      'proof-run'
    ]);
    expect(plan.lanes[0].steps.some((step) => step.args.includes('docker-only'))).toBe(false);
  });

  it('emits a machine-readable manifest for the GitLab Windows runner lane', () => {
    const manifest = acceptanceScript.buildManifest(
      {
        evidenceRoot: 'D:\\repo\\windows-private-release-evidence',
        harnessId: 'HARNESS-VHS-002',
        selectedHash: '8741bb08026c104100720c0ef48621e4ab7762fd',
        baseHash: 'c188cdec606aac3b17d8b17274baa19eef3e4017',
        runtimeTimeoutMs: 300000
      },
      [
        {
          laneId: 'windows-host-native',
          providerRequest: 'host',
          proofExecutionMode: 'host-only',
          report: {
            runtimeProvider: 'host-native',
            generatedReportExists: true
          }
        },
        {
          laneId: 'windows-container',
          providerRequest: 'docker',
          proofExecutionMode: 'docker-only',
          report: {
            runtimeProvider: 'windows-container',
            generatedReportExists: true
          }
        }
      ]
    );

    expect(manifest.schema).toBe('vi-history-suite/windows-private-release-acceptance@v1');
    expect(manifest.jobName).toBe('windows_private_release_acceptance');
    expect(manifest.governedScript).toBe('scripts/runWindowsPrivateReleaseAcceptance.js');
    expect(manifest.scope).toBe('full');
    expect(manifest.claimScope).toBe('windows-private-release-host-and-container-x64');
    expect(manifest.dockerProofIncluded).toBe(true);
    expect(manifest.evidenceRoot).toBe('windows-private-release-evidence');
    expect(manifest.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: 'windows-host-native',
          providerRequest: 'host',
          proofExecutionMode: 'host-only',
          report: expect.objectContaining({
            runtimeProvider: 'host-native',
            generatedReportExists: true
          })
        }),
        expect.objectContaining({
          laneId: 'windows-container',
          providerRequest: 'docker',
          proofExecutionMode: 'docker-only',
          report: expect.objectContaining({
            runtimeProvider: 'windows-container',
            generatedReportExists: true
          })
        })
      ])
    );
  });

  it('emits a machine-readable host-only installed-user acceptance manifest', () => {
    const manifest = acceptanceScript.buildManifest(
      {
        scope: 'host-only',
        evidenceRoot: 'D:\\repo\\windows-installed-user-host-evidence',
        harnessId: 'HARNESS-VHS-002',
        selectedHash: '8741bb08026c104100720c0ef48621e4ab7762fd',
        baseHash: 'c188cdec606aac3b17d8b17274baa19eef3e4017',
        runtimeTimeoutMs: 300000
      },
      [
        {
          laneId: 'windows-host-native',
          providerRequest: 'host',
          proofExecutionMode: 'host-only',
          report: {
            runtimeProvider: 'host-native',
            generatedReportExists: true
          }
        }
      ]
    );

    expect(manifest.schema).toBe('vi-history-suite/windows-installed-user-host-acceptance@v1');
    expect(manifest.jobName).toBe('windows_installed_user_host_acceptance');
    expect(manifest.scope).toBe('host-only');
    expect(manifest.claimScope).toBe('installed-user-host-labview-2026-x64');
    expect(manifest.dockerProofIncluded).toBe(false);
    expect(manifest.evidenceRoot).toBe('windows-installed-user-host-evidence');
    expect(manifest.lanes).toEqual([
      expect.objectContaining({
        laneId: 'windows-host-native',
        providerRequest: 'host',
        proofExecutionMode: 'host-only',
        report: expect.objectContaining({
          runtimeProvider: 'host-native',
          generatedReportExists: true
        })
      })
    ]);
  });

  it('quotes command segments deterministically for transcript headers', () => {
    expect(
      acceptanceScript.formatCommand('node.exe', [
        'out/cli/runGovernedProof.js',
        '--settings-file',
        'C:\\Users\\sveld\\AppData\\Roaming\\Code\\User\\settings.json'
      ])
    ).toBe(
      'node.exe out/cli/runGovernedProof.js --settings-file "C:\\Users\\sveld\\AppData\\Roaming\\Code\\User\\settings.json"'
    );
  });

  it('retries the Windows host proof step once when the first transcript shows cleanup contamination failure', async () => {
    const tempRoot = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'vihs-windows-proof-bounded-retry-')
    );
    const evidenceRoot = path.join(tempRoot, 'windows-private-release-evidence');
    const outputRoot = path.join(evidenceRoot, 'host');
    await fsp.mkdir(outputRoot, { recursive: true });
    const recoveryScriptPath = path.join(
      tempRoot,
      'scripts',
      'gitlab-runner',
      'windows',
      'recover-windows-proof-runtime-surface.ps1'
    );
    await fsp.mkdir(path.dirname(recoveryScriptPath), { recursive: true });
    await fsp.writeFile(recoveryScriptPath, "Write-Output '{\"status\":\"clean\"}'\n", 'utf8');

    let callCount = 0;
    const commands: Array<{ command: string; args: string[]; transcriptPath: string }> = [];
    const runCommandImpl = (
      _command: string,
      _args: string[],
      options: { cwd: string; transcriptPath: string }
    ) => {
      commands.push({
        command: _command,
        args: _args,
        transcriptPath: options.transcriptPath
      });
      callCount += 1;
      if (callCount === 1) {
        fs.writeFileSync(
          options.transcriptPath,
          '$ node out/cli/runGovernedProof.js\n\nWindows host runtime cleanup failed; remaining processes: LabVIEW\n',
          'utf8'
        );
        throw new Error('Command failed with exit code 1: node out/cli/runGovernedProof.js');
      }

      if (callCount === 2) {
        fs.writeFileSync(
          options.transcriptPath,
          '{\n  "status": "clean",\n  "attemptCount": 1\n}\n',
          'utf8'
        );
        return;
      }

      fs.writeFileSync(
        options.transcriptPath,
        '$ node out/cli/runGovernedProof.js\n\nhost proof succeeded\n',
        'utf8'
      );
    };
    let sleptForMilliseconds = 0;

    const result = await acceptanceScript.runLaneStep(
      {
        repoRoot: tempRoot,
        evidenceRoot,
        harnessReportRoot: path.join(tempRoot, '.cache', 'harness-reports', 'HARNESS-VHS-002')
      },
      {
        laneId: 'windows-host-native',
        outputRoot,
        transcripts: {
          proofRunPreRecovery: 'proof-run-pre-recovery.txt'
        }
      },
      {
        kind: 'proof-run',
        transcriptFileName: 'proof-run.txt',
        command: 'node',
        args: ['out/cli/runGovernedProof.js']
      },
      {
        fspImpl: fsp,
        runCommandImpl,
        sleepImpl: async (milliseconds: number) => {
          sleptForMilliseconds = milliseconds;
        }
      }
    );

    expect(callCount).toBe(3);
    expect(commands[1]).toEqual(
      expect.objectContaining({
        command: 'powershell.exe',
        args: expect.arrayContaining([
          '-NoLogo',
          '-NoProfile',
          '-File',
          expect.stringContaining(
            path.join(
              'scripts',
              'gitlab-runner',
              'windows',
              'recover-windows-proof-runtime-surface.ps1'
            )
          )
        ]),
        transcriptPath: path.join(outputRoot, 'proof-runtime-recovery.txt')
      })
    );
    expect(sleptForMilliseconds).toBe(5000);
    expect(result.transcriptPath.replaceAll('\\', '/')).toBe('host/proof-run.txt');
    expect(result.recoveryTranscriptPath?.replaceAll('\\', '/')).toBe(
      'host/proof-runtime-recovery.txt'
    );
    expect(result.boundedRecovery).toEqual(
      expect.objectContaining({
        attempted: true,
        trigger: 'windows-host-runtime-cleanup-failed',
        recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
        recoveryTranscript: 'host/proof-runtime-recovery.txt',
        retryDelayMs: 5000
      })
    );
    expect(result.boundedRecovery?.firstFailureTranscript.replaceAll('\\', '/')).toBe(
      'host/proof-run-pre-recovery.txt'
    );
    await expect(
      fsp.readFile(path.join(outputRoot, 'proof-run-pre-recovery.txt'), 'utf8')
    ).resolves.toContain('Windows host runtime cleanup failed; remaining processes: LabVIEW');
    await expect(
      fsp.readFile(path.join(outputRoot, 'proof-runtime-recovery.txt'), 'utf8')
    ).resolves.toContain('"status": "clean"');
    await expect(fsp.readFile(path.join(outputRoot, 'proof-run.txt'), 'utf8')).resolves.toContain(
      'host proof succeeded'
    );
  });

  it('runs the governed Windows proof runtime recovery script and retains its transcript path', async () => {
    const tempRoot = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'vihs-windows-proof-runtime-recovery-')
    );
    const evidenceRoot = path.join(tempRoot, 'windows-private-release-evidence');
    const outputRoot = path.join(evidenceRoot, 'host');
    await fsp.mkdir(outputRoot, { recursive: true });
    const recoveryScriptPath = path.join(
      tempRoot,
      'scripts',
      'gitlab-runner',
      'windows',
      'recover-windows-proof-runtime-surface.ps1'
    );
    await fsp.mkdir(path.dirname(recoveryScriptPath), { recursive: true });
    await fsp.writeFile(recoveryScriptPath, "Write-Output '{\"status\":\"clean\"}'\n", 'utf8');

    const calls: Array<{ command: string; args: string[]; transcriptPath: string }> = [];
    const transcriptPath = await acceptanceScript.runWindowsHostProofRuntimeRecovery(
      {
        repoRoot,
        evidenceRoot
      },
      {
        outputRoot,
        transcripts: {
          proofRuntimeRecovery: 'proof-runtime-recovery.txt'
        }
      },
      {
        fspImpl: fsp,
        runCommandImpl: (command, args, options) => {
          calls.push({ command, args, transcriptPath: options.transcriptPath });
          fs.writeFileSync(options.transcriptPath, '{"status":"clean"}\n', 'utf8');
        }
      }
    );

    expect(transcriptPath.replaceAll('\\', '/')).toBe('host/proof-runtime-recovery.txt');
    expect(calls).toEqual([
      expect.objectContaining({
        command: 'powershell.exe',
        args: expect.arrayContaining([
          '-NoLogo',
          '-NoProfile',
          '-File',
          path.join(
            repoRoot,
            'scripts',
            'gitlab-runner',
            'windows',
            'recover-windows-proof-runtime-surface.ps1'
          )
        ]),
        transcriptPath: path.join(outputRoot, 'proof-runtime-recovery.txt')
      })
    ]);
  });

  it('limits the bounded retry trigger to the Windows host proof step cleanup failure signature', async () => {
    const tempRoot = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'vihs-windows-proof-retry-signature-')
    );
    const transcriptPath = path.join(tempRoot, 'proof-run.txt');
    await fsp.writeFile(
      transcriptPath,
      '$ node out/cli/runGovernedProof.js\n\nWindows host runtime cleanup failed; remaining \nprocesses: LabVIEW\n',
      'utf8'
    );

    await expect(
      acceptanceScript.shouldRetryWindowsHostProofStep(
        { laneId: 'windows-host-native' },
        { kind: 'proof-run' },
        transcriptPath,
        { fspImpl: fsp }
      )
    ).resolves.toBe(true);
    await expect(
      acceptanceScript.shouldRetryWindowsHostProofStep(
        { laneId: 'windows-container' },
        { kind: 'proof-run' },
        transcriptPath,
        { fspImpl: fsp }
      )
    ).resolves.toBe(false);
    await expect(
      acceptanceScript.shouldRetryWindowsHostProofStep(
        { laneId: 'windows-host-native' },
        { kind: 'settings-write' },
        transcriptPath,
        { fspImpl: fsp }
      )
    ).resolves.toBe(false);
  });
});
