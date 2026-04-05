import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadBenchmarkStatusSnapshot } from '../../src/benchmark/benchmarkStatus';

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-benchmark-status-'));
  tempRoots.push(root);
  return root;
}

describe('benchmark status surfaces', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it('loads the retained Windows baseline plus the running host Linux benchmark state', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    const workspaceStorageRoot = path.join(root, 'workspace-storage');
    const logPath = path.join(
      authorityRepoRoot,
      '.cache',
      'host-linux-dashboard-benchmark',
      'run-20260404-170000.log'
    );
    const metadataPath = path.join(
      authorityRepoRoot,
      '.cache',
      'harness-reports',
      'HARNESS-VHS-002',
      'workspace-storage',
      'reports',
      'repo',
      'file',
      'pair-0001',
      'report-metadata.json'
    );

    await fs.mkdir(path.join(authorityRepoRoot, 'docs', 'product'), { recursive: true });
    await fs.writeFile(
      path.join(authorityRepoRoot, 'docs', 'product', 'program-repo-jump-map.json'),
      JSON.stringify({
        programId: 'comparevi',
        version: 1,
        repos: [
          {
            id: 'vi-history-suite-source-experiments',
            displayName: 'VI History Suite Source Experiments',
            role: 'experiment-mirror',
            expectedRemote:
              'https://github.com/svelderrainruiz/vi-history-suite-source-experiments.git',
            localPath: {
              kind: 'sibling',
              relativePath: '../vi-history-suite-source-experiments'
            },
            primaryEntrypoints: ['README.md']
          }
        ]
      })
    );

    await fs.mkdir(path.join(workspaceStorageRoot, 'dashboards'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceStorageRoot, 'dashboards', 'latest-dashboard-run.json'),
      JSON.stringify({
        recordedAt: '2026-04-04T16:32:26.159Z',
        source: 'vscode-dashboard-action',
        workspaceStorageRoot,
        artifactPaths: {
          dashboardsDirectory: path.join(workspaceStorageRoot, 'dashboards'),
          dashboardDirectory: path.join(workspaceStorageRoot, 'dashboards', 'current'),
          dashboardJsonFilePath: path.join(workspaceStorageRoot, 'dashboards', 'current', 'dashboard.json'),
          dashboardHtmlFilePath: path.join(workspaceStorageRoot, 'dashboards', 'current', 'dashboard.html')
        },
        dashboard: {
          generatedAt: '2026-04-04T16:32:26.159Z',
          repositoryName: 'labview-icon-editor',
          repositoryRoot: 'C:\\dev\\labview-icon-editor',
          relativePath: 'resource/plugins/lv_icon.vi',
          signature: 'LVIN',
          commitWindow: {
            pairCount: 138
          },
          summary: {
            representedPairCount: 138,
            windowCompletenessState: 'complete',
            archivedPairCount: 138,
            missingPairCount: 0,
            missingPairIds: [],
            generatedReportCount: 138,
            reportMetadataPairCount: 138,
            failedPairCount: 0,
            failedPairIds: [],
            blockedPairCount: 0,
            blockedPairIds: [],
            overviewImageCount: 138,
            detailItemCount: 138,
            providerSummaries: [
              {
                label: 'windows-container / labview-cli / auto / win32',
                pairCount: 138
              }
            ]
          }
        },
        preparationSummary: {
          pairsNeedingEvidenceCount: 138,
          preparedPairCount: 138,
          preparedGeneratedReportCount: 138,
          preparedBlockedPairCount: 0,
          preparedFailedPairCount: 0,
          preparedNoGeneratedReportCount: 0,
          preparedMissingRetainedArchiveCount: 0,
          mode: 'backfilled-before-build'
        },
        etaAccuracyRecord: {
          meanAbsolutePercentageError: 8.026
        },
        experiment: {
          timings: {
            totalDurationMs: 4613884,
            evidencePreparationDurationMs: 4613144
          }
        }
      })
    );

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(
      path.join(authorityRepoRoot, '.cache', 'host-linux-dashboard-benchmark', 'latest-launch.json'),
      JSON.stringify({
        startedAt: '2026-04-04T17:00:00.000Z',
        pid: 12345,
        logPath,
        image:
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark@sha256:abc123',
        sourceCommit: 'abcdef1234567890'
      })
    );
    await fs.writeFile(logPath, 'npm ci\nPreparing dashboard pair 1/138\n');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, '{}\n');

    const snapshot = await loadBenchmarkStatusSnapshot(authorityRepoRoot, workspaceStorageRoot, {
      now: () => new Date('2026-04-04T17:02:00.000Z'),
      resolveContainerState: async () => 'running'
    });

    expect(snapshot.windowsBaseline.state).toBe('available');
    expect(snapshot.windowsBaseline.comparePairCount).toBe(138);
    expect(snapshot.hostLinux.state).toBe('running');
    expect(snapshot.hostLinux.benchmarkWorkspaceRoot).toBe(authorityRepoRoot);
    expect(snapshot.hostLinux.materializedMetadataCount).toBe(1);
    expect(snapshot.hostLinux.latestLogLine).toContain('Preparing dashboard pair 1/138');

    expect(snapshot.hostLinux.statusSummary).toContain(
      'launch receipt exists and no completed summary has replaced it yet'
    );
  });

  it('fails closed to missing when only a stale launch receipt remains and no live container exists', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    const logPath = path.join(
      authorityRepoRoot,
      '.cache',
      'host-linux-dashboard-benchmark',
      'run-20260404-170000.log'
    );

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(
      path.join(authorityRepoRoot, '.cache', 'host-linux-dashboard-benchmark', 'latest-launch.json'),
      JSON.stringify({
        startedAt: '2026-04-04T17:00:00.000Z',
        pid: 12345,
        logPath,
        repoPath: 'C:\\staged\\workspace',
        sourceAuthorityRepoPath: 'C:\\source\\workspace',
        image:
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark@sha256:abc123',
        sourceCommit: 'abcdef1234567890'
      })
    );
    await fs.writeFile(logPath, 'tsc -p .\n');

    const snapshot = await loadBenchmarkStatusSnapshot(authorityRepoRoot, undefined, {
      now: () => new Date('2026-04-04T17:20:00.000Z'),
      resolveContainerState: async () => 'missing'
    });

    expect(snapshot.hostLinux.state).toBe('missing');
    expect(snapshot.hostLinux.statusSummary).toContain(
      'stale host Linux launch receipt exists, but no live host Linux benchmark container is present'
    );
  });

  it('loads a fresh failed host Linux summary instead of pretending the run is still active', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    const latestSummaryPath = path.join(
      authorityRepoRoot,
      '.cache',
      'github-experiments',
      'linux-dashboard-benchmark',
      'HARNESS-VHS-002',
      'latest-summary.json'
    );
    const latestProgressPath = path.join(
      authorityRepoRoot,
      '.cache',
      'github-experiments',
      'linux-dashboard-benchmark',
      'HARNESS-VHS-002',
      'latest-progress.json'
    );
    const logPath = path.join(
      authorityRepoRoot,
      '.cache',
      'host-linux-dashboard-benchmark',
      'run-20260405-021139.log'
    );

    await fs.mkdir(path.dirname(latestSummaryPath), { recursive: true });
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(
      path.join(authorityRepoRoot, '.cache', 'host-linux-dashboard-benchmark', 'latest-launch.json'),
      JSON.stringify({
        startedAt: '2026-04-05T02:09:26.314Z',
        pid: 23456,
        logPath,
        image:
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark:main',
        sourceCommit: '1285294'
      })
    );
    await fs.writeFile(
      latestSummaryPath,
      JSON.stringify({
        schema: 'vi-history-suite/github-linux-dashboard-benchmark@v1',
        benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK',
        harnessId: 'HARNESS-VHS-002',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        runtimePlatform: 'linux',
        runtimeImage: 'nationalinstruments/labview:2026q1-linux',
        benchmarkImage: {
          reference:
            'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark:main',
          digest: ''
        },
        headlessDisplayProvider: 'xvfb-run',
        startedAt: '2026-04-05T02:09:26.314Z',
        completedAt: '2026-04-05T02:11:39.478Z',
        wallClockSeconds: 133.164,
        dashboardCommitWindow: 139,
        comparePairCount: 138,
        generatedReportCount: 0,
        blockedPairCount: 0,
        failedPairCount: 1,
        noGeneratedReportPairCount: 0,
        totalPairPreparationSeconds: 125.484,
        meanPairPreparationSeconds: 125.484,
        maxPairPreparationSeconds: 125.484,
        dashboardWindowCompletenessState: 'incomplete-missing-archives',
        completionState: 'failed',
        processedPairCount: 1,
        terminalPairIndex: 1,
        terminalPairFailureReason: 'command-timed-out',
        terminalPairDiagnosticReason: 'linux-headless-recursive-load',
        terminalOutcome: 'runtime-timed-out',
        comparabilityState: 'characterization-only',
        providerCounts: {
          'host-native': 1
        },
        etaAccuracy: {
          measuredPairCount: 0,
          preparedPairCount: 1,
          etaEligiblePairCount: 0
        },
        retainedArtifacts: {
          smokeJsonPath: '/workspace/.cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.json',
          smokeMarkdownPath: '/workspace/.cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.md',
          smokeHtmlPath: '/workspace/.cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.html',
          latestSummaryPath: '/workspace/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json',
          runSummaryPath: '/workspace/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/2026-04-05-021139478.json',
          pairFailureReceiptPath: '/workspace/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/pair-failure-pair-0001.json'
        }
      })
    );
    await fs.writeFile(
      latestProgressPath,
      JSON.stringify({
        schema: 'vi-history-suite/github-linux-dashboard-benchmark-progress@v1',
        benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK',
        harnessId: 'HARNESS-VHS-002',
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        recordedAt: '2026-04-05T02:11:39.493Z',
        phase: 'failed',
        message: 'Linux benchmark failed at pair 1/138: command-timed-out.'
      })
    );
    await fs.writeFile(logPath, 'VIHS_PROGRESS: Linux benchmark failed at pair 1/138: command-timed-out.\n');

    const snapshot = await loadBenchmarkStatusSnapshot(authorityRepoRoot, undefined, {
      now: () => new Date('2026-04-05T02:12:00.000Z'),
      resolveContainerState: async () => 'missing'
    });

    expect(snapshot.hostLinux.state).toBe('failed');
    expect(snapshot.hostLinux.latestSummary?.completionState).toBe('failed');
    expect(snapshot.hostLinux.statusSummary).toContain('pair 1/138');
    expect(snapshot.hostLinux.statusSummary).toContain('command-timed-out');
    expect(snapshot.hostLinux.statusSummary).toContain('linux-headless-recursive-load');
  });
});
