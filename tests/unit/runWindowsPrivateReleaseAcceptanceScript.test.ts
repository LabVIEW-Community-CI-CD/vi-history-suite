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
};

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
});
