import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_VALIDATION_FIXTURE,
  runPublicFixtureValidation
} from '../../src/tooling/publicFixtureValidation';

describe('public fixture validation', () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('pins the canonical ni/labview-icon-editor lv_icon.vi fixture coordinates', () => {
    expect(PUBLIC_VALIDATION_FIXTURE).toMatchObject({
      schema: 'vi-history-suite/public-fixture-validation-proof@v1',
      harnessId: 'HARNESS-VHS-002',
      repositoryUrl: 'https://github.com/ni/labview-icon-editor',
      repositoryCloneUrl: 'https://github.com/ni/labview-icon-editor.git',
      viPath: 'resource/plugins/lv_icon.vi',
      oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
      oldCommitDate: '2025-06-29',
      newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd',
      newCommitDate: '2026-02-24',
      dockerImage: 'nationalinstruments/labview:2026q1-linux',
      linuxDockerImage: 'nationalinstruments/labview:2026q1-linux',
      windowsDockerImage: 'nationalinstruments/labview:2026q1-windows',
      windowsDockerRequiredOSType: 'windows',
      firstDockerPullApproximateSize: '1.4 GB',
      retainedPublicIssueRange: '#48-#59',
      windowsDockerDesktopProofIssue:
        'https://github.com/svelderrainruiz/vi-history-suite/issues/65',
      windowsDockerDesktopIssueTemplate: 'windows-docker-desktop-validation.yml'
    });
  });

  it('runs the exact fixture pair through HARNESS-VHS-002 and writes public proof files', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-public-fixture-'));
    tempDirectories.push(tempRoot);
    const proofRoot = path.join(tempRoot, 'proof');
    const runHarnessReportSmoke = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-002',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        cloneDirectory: path.join(proofRoot, 'fixture-clones', 'ni-labview-icon-editor'),
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        head: '8741bb08026c104100720c0ef48621e4ab7762fd',
        generatedAt: '2026-04-26T00:00:00.000Z',
        selectedHash: PUBLIC_VALIDATION_FIXTURE.newCommit,
        baseHash: PUBLIC_VALIDATION_FIXTURE.oldCommit,
        comparePairAvailable: true,
        eligible: true,
        signature: 'LVIN',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'linux-container',
        runtimeEngine: 'labview-cli',
        runtimeNotes: [],
        generatedReportExists: true,
        packetFilePath: path.join(proofRoot, 'packet.json'),
        reportFilePath: path.join(proofRoot, 'diff-report-lv_icon.vi.html'),
        metadataFilePath: path.join(proofRoot, 'report-metadata.json')
      },
      reportJsonPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.json'),
      reportMarkdownPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.md'),
      reportHtmlPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.html')
    });

    const result = await runPublicFixtureValidation(
      {
        cwd: tempRoot,
        proofOutDirectoryPath: proofRoot,
        runtimePlatform: 'linux',
        runtimeSettings: {
          requestedProvider: 'docker',
          requireVersionAndBitness: true,
          labviewVersion: '2026',
          bitness: 'x64'
        },
        runtimeExecutionTimeoutMs: 180000
      },
      {
        runHarnessReportSmoke: runHarnessReportSmoke as never,
        now: () => '2026-04-26T00:00:00.000Z'
      }
    );

    expect(runHarnessReportSmoke).toHaveBeenCalledWith('HARNESS-VHS-002', {
      cloneRoot: path.join(proofRoot, 'fixture-clones'),
      reportRoot: path.join(proofRoot, 'reports'),
      historyLimit: 1000,
      selectedHash: PUBLIC_VALIDATION_FIXTURE.newCommit,
      baseHash: PUBLIC_VALIDATION_FIXTURE.oldCommit,
      allowNonAdjacentBaseHash: true,
      runtimePlatform: 'linux',
      runtimeSettings: {
        requestedProvider: 'docker',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      runtimeExecutionTimeoutMs: 180000
    });
    expect(result).toMatchObject({
      outcome: 'validated-fixture',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      runtimeProvider: 'linux-container',
      runtimeEngine: 'labview-cli',
      generatedReportExists: true,
      validationClassification: 'validation-success',
      suggestedIssueTemplate: 'validation-success.yml'
    });

    const proof = JSON.parse(await fs.readFile(result.proofReportPath, 'utf8'));
    const issueBody = await fs.readFile(result.proofIssueBodyPath, 'utf8');
    expect(proof).toMatchObject({
      schema: 'vi-history-suite/public-fixture-validation-proof@v1',
      classification: 'validation-success',
      fixture: {
        repository: 'https://github.com/ni/labview-icon-editor',
        viPath: 'resource/plugins/lv_icon.vi',
        oldCommit: PUBLIC_VALIDATION_FIXTURE.oldCommit,
        newCommit: PUBLIC_VALIDATION_FIXTURE.newCommit,
        dockerImage: 'nationalinstruments/labview:2026q1-linux',
        linuxDockerImage: 'nationalinstruments/labview:2026q1-linux',
        windowsDockerImage: 'nationalinstruments/labview:2026q1-windows',
        windowsDockerRequiredOSType: 'windows',
        firstDockerPullApproximateSize: '1.4 GB'
      },
      proofBoundary: {
        linuxDocker2026x64: 'admitted',
        linuxHostLabview2026x64:
          'admitted-when-run-on-a-linux-host-with-labview-installed',
        windowsHostLabview2026x64:
          'admitted-when-run-on-a-windows-host-with-labview-2026-x64-installed',
        windowsDockerDesktopWindowsContainers:
          'community-deferred-requires-docker-desktop-windows-containers-proof',
        windowsDockerDesktopRequiredDockerOSType: 'windows',
        windowsDockerDesktopIssueTemplate: 'windows-docker-desktop-validation.yml'
      }
    });
    expect(issueBody).toContain('Suggested template: validation-success.yml');
    expect(issueBody).toContain('resource/plugins/lv_icon.vi');
    expect(issueBody).toContain(PUBLIC_VALIDATION_FIXTURE.oldCommit);
    expect(issueBody).toContain(PUBLIC_VALIDATION_FIXTURE.newCommit);
    expect(issueBody).toContain('nationalinstruments/labview:2026q1-windows');
    expect(issueBody).toContain('https://github.com/svelderrainruiz/vi-history-suite/issues/65');
  });

  it('routes real Windows Docker Desktop fixture proof to the dedicated public intake template', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-public-fixture-'));
    tempDirectories.push(tempRoot);
    const proofRoot = path.join(tempRoot, 'proof');
    const runHarnessReportSmoke = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-002',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        cloneDirectory: path.join(proofRoot, 'fixture-clones', 'ni-labview-icon-editor'),
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        head: PUBLIC_VALIDATION_FIXTURE.newCommit,
        generatedAt: '2026-04-27T00:00:00.000Z',
        selectedHash: PUBLIC_VALIDATION_FIXTURE.newCommit,
        baseHash: PUBLIC_VALIDATION_FIXTURE.oldCommit,
        comparePairAvailable: true,
        eligible: true,
        signature: 'LVIN',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'windows-container',
        runtimeEngine: 'labview-cli',
        runtimeNotes: [],
        generatedReportExists: true,
        packetFilePath: path.join(proofRoot, 'packet.json'),
        reportFilePath: path.join(proofRoot, 'diff-report-lv_icon.vi.html'),
        metadataFilePath: path.join(proofRoot, 'report-metadata.json')
      },
      reportJsonPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.json'),
      reportMarkdownPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.md'),
      reportHtmlPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.html')
    });

    const result = await runPublicFixtureValidation(
      {
        cwd: tempRoot,
        proofOutDirectoryPath: proofRoot,
        runtimePlatform: 'win32',
        runtimeSettings: {
          requestedProvider: 'docker',
          requireVersionAndBitness: true,
          labviewVersion: '2026',
          bitness: 'x64'
        },
        runtimeExecutionTimeoutMs: 300000
      },
      {
        runHarnessReportSmoke: runHarnessReportSmoke as never,
        now: () => '2026-04-27T00:00:00.000Z'
      }
    );

    expect(result).toMatchObject({
      validationClassification: 'validation-success',
      suggestedIssueTemplate: 'windows-docker-desktop-validation.yml',
      runtimeProvider: 'windows-container',
      runtimeEngine: 'labview-cli'
    });

    const proof = JSON.parse(await fs.readFile(result.proofReportPath, 'utf8'));
    const issueBody = await fs.readFile(result.proofIssueBodyPath, 'utf8');
    expect(proof).toMatchObject({
      suggestedIssueTemplate: 'windows-docker-desktop-validation.yml',
      selectedVariant: {
        platform: 'win32',
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        runtimeExecutionTimeoutMs: 300000
      },
      result: {
        runtimeProvider: 'windows-container',
        runtimeEngine: 'labview-cli',
        generatedReportExists: true
      },
      retainedPublicEvidence: {
        windowsDockerDesktopProofIssue:
          'https://github.com/svelderrainruiz/vi-history-suite/issues/65'
      }
    });
    expect(issueBody).toContain('Suggested template: windows-docker-desktop-validation.yml');
    expect(issueBody).toContain('Docker OSType required: windows');
  });
});
