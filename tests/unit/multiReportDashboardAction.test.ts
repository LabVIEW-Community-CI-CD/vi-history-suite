import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { createMultiReportDashboardAction } from '../../src/dashboard/multiReportDashboardAction';
import { renderDashboardArtifactHtml } from '../../src/dashboard/multiReportDashboardAction';
import type { BuildMultiReportDashboardResult } from '../../src/dashboard/multiReportDashboard';
import type { ComparisonReportActionResult } from '../../src/reporting/comparisonReportAction';
import type { SeedRetainedDashboardEvidenceResult } from '../../src/dashboard/retainedDashboardEvidence';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

const actionTempRoots: string[] = [];

const EMPTY_SEED_RESULT: SeedRetainedDashboardEvidenceResult = {
  importedPairCount: 0,
  importedGeneratedPairCount: 0,
  importedFailedPairCount: 0,
  importedBlockedPairCount: 0,
  candidateCount: 0
};

const HISTORY_SETTINGS = {
  strictRsrcHeader: true,
  historyWindowMode: 'auto' as const,
  maxHistoryEntries: 100,
  historyLimit: 1000
};

const RUNTIME_SETTINGS = {
  requestedProvider: 'host' as const,
  requireVersionAndBitness: true,
  bitness: 'x64' as const,
  labviewVersion: '2026'
};

function comparisonResult(
  overrides: Partial<ComparisonReportActionResult> = {}
): ComparisonReportActionResult {
  return {
    outcome: 'opened-comparison-report',
    generatedReportExists: true,
    retainedArchiveAvailable: true,
    ...overrides
  } as ComparisonReportActionResult;
}

function createModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/labview-icon-editor',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN',
    eligible: true,
    repositorySupport: {
      tier: 'known-upstream',
      familyId: 'labview-icon-editor',
      familyDisplayName: 'NI LabVIEW Icon Editor',
      supportLabel: 'Known upstream: NI LabVIEW Icon Editor',
      supportGuidance: 'Known evidence family.',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true
    },
    commits: [
      {
        hash: 'c3',
        previousHash: 'b2',
        authorDate: '2026-05-03T00:00:00.000Z',
        authorName: 'Dev Three',
        subject: 'Selected revision'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-05-02T00:00:00.000Z',
        authorName: 'Dev Two',
        subject: 'Middle revision'
      },
      {
        hash: 'a1',
        authorDate: '2026-05-01T00:00:00.000Z',
        authorName: 'Dev One',
        subject: 'Base revision'
      }
    ],
    ...overrides
  };
}

function createDashboardResult(model = createModel()): BuildMultiReportDashboardResult {
  return {
    jsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
    htmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
    record: {
      generatedAt: '2026-05-04T12:00:00.000Z',
      repositoryName: model.repositoryName,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      signature: model.signature,
      artifactPlan: {
        repoId: 'repo',
        fileId: 'file',
        windowId: 'window',
        dashboardDirectory: '/workspace/storage/dashboards/review',
        jsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
        htmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
        assetsDirectory: '/workspace/storage/dashboards/review/assets'
      },
      commitWindow: {
        commitCount: model.commits.length,
        pairCount: Math.max(0, model.commits.length - 1),
        newestHash: model.commits[0]?.hash,
        oldestHash: model.commits.at(-1)?.hash
      },
      summary: {
        representedPairCount: 2,
        windowCompletenessState: 'complete',
        archivedPairCount: 2,
        missingPairCount: 0,
        missingPairIds: [],
        generatedReportCount: 1,
        reportMetadataPairCount: 1,
        failedPairCount: 0,
        failedPairIds: [],
        blockedPairCount: 1,
        blockedPairIds: ['blocked-pair'],
        overviewSectionCount: 0,
        overviewImageCount: 0,
        includedAttributeCount: 0,
        detailSectionCount: 0,
        detailItemCount: 0,
        pairWithOverviewImageCount: 0,
        pairWithDetailCount: 0,
        providerSummaries: [],
        overviewCaptionSummaries: [],
        includedAttributeSummaries: [],
        detailHeadingSummaries: [],
        evidenceStateSummaries: []
      },
      entries: []
    }
  };
}

function createMultiPairModel(pairCount: number): ViHistoryViewModel {
  const commits: ViHistoryViewModel['commits'] = [];
  for (let index = pairCount; index >= 0; index -= 1) {
    commits.push({
      hash: `h${index}`,
      previousHash: index > 0 ? `h${index - 1}` : undefined,
      authorDate: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      authorName: `Dev ${index}`,
      subject: `Revision ${index}`
    });
  }
  return createModel({ commits });
}

function incrementingClock(startIso = '2026-05-04T12:00:00.000Z'): () => number {
  let clock = Date.parse(startIso);
  return () => {
    clock += 50;
    return clock;
  };
}

describe('multi-report dashboard action routing (VHS-REQ-610)', () => {
  beforeEach(() => {
    harness.reset();
  });

  afterEach(async () => {
    for (const tempRoot of actionTempRoots.splice(0)) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns explicit guard outcomes before dashboard preparation (VHS-REQ-610.7)', async () => {
    const context = harness.createContext();
    const action = createMultiReportDashboardAction(context as never);
    harness.setWorkspaceTrusted(false);

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    harness.setWorkspaceTrusted(true);
    const missingStorageAction = createMultiReportDashboardAction(
      harness.createContext({ storageUri: undefined }) as never
    );
    await expect(missingStorageAction({ model: createModel() })).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });

    await expect(action({ model: createModel({ commits: createModel().commits.slice(0, 2) }) })).resolves.toEqual({
      outcome: 'insufficient-commits'
    });
  });

  it('backfills missing pair evidence, opens the dashboard, and routes retained artifact messages (VHS-REQ-610.1, VHS-REQ-610.2, VHS-REQ-610.4, VHS-REQ-610.5)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const buildDashboard = vi.fn().mockResolvedValue(createDashboardResult(model));
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue(undefined);
    const seedRetainedDashboardEvidence = vi.fn().mockResolvedValue({
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 0
    });
    const ensureComparisonReportEvidence = vi
      .fn<[(typeof model)['commits'][number]], Promise<ComparisonReportActionResult>>()
      .mockResolvedValueOnce({
        outcome: 'opened-comparison-report',
        generatedReportExists: true,
        retainedArchiveAvailable: true
      } as ComparisonReportActionResult)
      .mockResolvedValueOnce({
        outcome: 'opened-comparison-report',
        generatedReportExists: false,
        reportStatus: 'blocked-preflight',
        blockedReason: 'preflight blocked',
        retainedArchiveAvailable: true
      } as ComparisonReportActionResult);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockResolvedValue(
      '<html><head></head><body>generated report' +
        '<img class="difference-image" src="diff-report-Sample.vi_files/0_0_1.png" alt="diff-report-Sample.vi_files/0_0_1.png">' +
        '</body></html>'
    );
    const reportProgress = vi.fn();
    let clock = Date.parse('2026-05-04T12:00:00.000Z');
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard,
      readArchivedComparisonReportSourceRecord,
      seedRetainedDashboardEvidence,
      ensureComparisonReportEvidence: ensureComparisonReportEvidence as never,
      pathExists: async (targetPath) => targetPath === '/workspace/storage/dashboards/review',
      writeFile,
      readFile,
      now: () => {
        clock += 50;
        return clock;
      },
      getHistoryServiceSettings: () => ({
        strictRsrcHeader: true,
        historyWindowMode: 'auto',
        maxHistoryEntries: 100,
        historyLimit: 1000
      }),
      getRuntimeSettings: () => ({
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        bitness: 'x64',
        labviewVersion: '2026'
      })
    });

    const result = await action({ model, reportProgress });

    expect(result).toEqual({
      outcome: 'opened-review-dashboard',
      dashboardFilePath: '/workspace/storage/dashboards/review/dashboard.html',
      dashboardJsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0,
      title: 'VI Review Dashboard: VIP_Pre-Install Custom Action.vi'
    });
    expect(seedRetainedDashboardEvidence).toHaveBeenCalledWith('/workspace/storage', model);
    expect(readArchivedComparisonReportSourceRecord).toHaveBeenCalledTimes(2);
    expect(ensureComparisonReportEvidence).toHaveBeenCalledTimes(2);
    for (const call of ensureComparisonReportEvidence.mock.calls) {
      expect(call[0]).toMatchObject({
        model,
        headlessRequested: true
      });
    }
    expect(buildDashboard).toHaveBeenCalledWith(
      '/workspace/storage',
      model,
      expect.objectContaining({
        pairConcentrationIncrementTotal: 30,
        assetIncrementTotal: 10
      })
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/storage/dashboards/latest-dashboard-run.json',
      expect.stringContaining('"source": "vscode-dashboard-action"'),
      'utf8'
    );
    expect(harness.panels[0].webview.html).toContain('data-testid="dashboard-preparation-summary"');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Preparing 2 dashboard pair')
      })
    );

    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/diff-report-Sample.vi.html',
      kind: 'report-html',
      label: 'Generated report'
    });
    expect(harness.panels[1].viewType).toBe('viHistorySuite.reviewDashboardArtifact');
    expect(harness.panels[1].webview.html).toContain('generated report');
    // Report images load lazily so large reports do not exhaust the webview
    // resource loader and fall back to alt text.
    expect(harness.panels[1].webview.html).toContain(
      '<img loading="lazy" class="difference-image" src="diff-report-Sample.vi_files/0_0_1.png"'
    );

    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/diff-report-Sample.vi.html',
      kind: 'metadata-json',
      label: 'Bad metadata link'
    });
    expect(harness.vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'VI Review Dashboard ignored an artifact path that did not match the retained artifact contract.'
    );

    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/tmp/outside/report-metadata.json',
      kind: 'metadata-json',
      label: 'Outside storage'
    });
    expect(harness.vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'VI Review Dashboard ignored an artifact path outside workspace-scoped extension storage.'
    );
  });

  it('returns before-dashboard-build cancellation when already cancelled (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const action = createMultiReportDashboardAction(context as never);
    const token = harness.createCancellationToken(true);

    await expect(
      action({ model: createModel(), cancellationToken: token as never })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-dashboard-build'
    });
  });

  it('summarizes seeded retained evidence and concentrates without a local refresh (VHS-REQ-610.6)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const ensure = vi.fn();
    const reportProgress = vi.fn();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue({
        importedPairCount: 3,
        importedGeneratedPairCount: 1,
        importedFailedPairCount: 1,
        importedBlockedPairCount: 1,
        candidateCount: 2
      } satisfies SeedRetainedDashboardEvidenceResult),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue({
        archivePlan: { reportFilePath: '/workspace/storage/report.html' },
        packetRecord: { runtimeExecution: { reportExists: true } }
      }) as never,
      ensureComparisonReportEvidence: ensure as never,
      pathExists: async () => true,
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model, reportProgress });

    expect(result.outcome).toBe('opened-review-dashboard');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Seeded 3 dashboard pair(s) from retained evidence (1 generated, 1 failed, 1 blocked).'
      })
    );
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Concentrating retained dashboard evidence only; no local pair refresh is needed.'
      })
    );
    expect(ensure).not.toHaveBeenCalled();
  });

  it('notes remaining missing pairs after seeding retained evidence (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const reportProgress = vi.fn();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue({
        importedPairCount: 2,
        importedGeneratedPairCount: 2,
        importedFailedPairCount: 0,
        importedBlockedPairCount: 0,
        candidateCount: 1
      } satisfies SeedRetainedDashboardEvidenceResult),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      ensureComparisonReportEvidence: vi.fn() as never,
      pathExists: async () => true,
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model, reportProgress });

    expect(result.outcome).toBe('opened-review-dashboard');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Seeded 2 dashboard pair(s) from retained evidence (2 generated).'
      })
    );
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Concentrating retained dashboard evidence only; 2 pair(s) remain missing in the retained set and will stay explicit in the dashboard.'
      })
    );
  });

  it('concentrates metadata only when all retained pairs already have evidence (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const reportProgress = vi.fn();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue({
        archivePlan: { reportFilePath: '/workspace/storage/report.html' },
        packetRecord: { runtimeExecution: { reportExists: true } }
      }) as never,
      ensureComparisonReportEvidence: vi.fn() as never,
      pathExists: async () => true,
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model, reportProgress });

    expect(result.outcome).toBe('opened-review-dashboard');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'All adjacent retained pairs already have retained comparison evidence. Concentrating retained dashboard metadata only.'
      })
    );
  });

  it('reports backfill-unavailable and skips the write block when the dashboard directory is absent (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const reportProgress = vi.fn();
    const writeFile = vi.fn();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi
        .fn()
        .mockResolvedValueOnce({
          archivePlan: { reportFilePath: '/workspace/storage/missing-generated.html' },
          packetRecord: { runtimeExecution: { reportExists: false } }
        })
        .mockResolvedValueOnce({
          archivePlan: { reportFilePath: '/workspace/storage/missing-file.html' },
          packetRecord: { runtimeExecution: { reportExists: true } }
        }) as never,
      // No ensureComparisonReportEvidence -> backfill unavailable.
      pathExists: async () => false,
      writeFile,
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model, reportProgress });

    expect(result.outcome).toBe('opened-review-dashboard');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'This build cannot refresh 2 dashboard pair(s) from Open dashboard. Concentrating the currently retained archive set only.'
      })
    );
    // Dashboard directory does not exist -> the manifest/html write block is skipped.
    expect(writeFile).not.toHaveBeenCalledWith(
      '/workspace/storage/dashboards/review/dashboard.html',
      expect.anything(),
      'utf8'
    );
  });

  it('labels every pair-evidence reason while backfilling (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createMultiPairModel(4);
    const reportProgress = vi.fn();
    const readArchived = vi.fn(async (request: { selectedHash: string }) => {
      switch (request.selectedHash) {
        case 'h4':
          return undefined;
        case 'h3':
          return {
            archivePlan: { reportFilePath: '/workspace/storage/h3.html' },
            packetRecord: { runtimeExecution: { reportExists: false } }
          };
        case 'h2':
          return {
            archivePlan: { reportFilePath: '/workspace/storage/missing-h2.html' },
            packetRecord: { runtimeExecution: { reportExists: true } }
          };
        default:
          throw new Error('archive read failed');
      }
    });
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: readArchived as never,
      ensureComparisonReportEvidence: vi.fn(async (request: {
        reportProgress?: (update: { message: string; increment?: number }) => Promise<void>;
      }) => {
        // Drive the scaled pair-progress relay with an increment and a plain step.
        await request.reportProgress?.({ message: 'Staging revisions.', increment: 40 });
        await request.reportProgress?.({ message: 'Finalizing pair.' });
        return comparisonResult();
      }) as never,
      pathExists: async (targetPath: string) =>
        targetPath === '/workspace/storage/dashboards/review',
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model, reportProgress });

    expect(result.outcome).toBe('opened-review-dashboard');
    const messages = reportProgress.mock.calls
      .map((call) => (call[0] as { message: string }).message)
      .join('\n');
    expect(messages).toContain('missing archive');
    expect(messages).toContain('missing generated report');
    expect(messages).toContain('missing retained report file');
  });

  it('classifies every prepared-pair outcome while backfilling (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createMultiPairModel(7);
    const reportProgress = vi.fn();
    const ensure = vi
      .fn()
      .mockResolvedValueOnce(comparisonResult())
      .mockResolvedValueOnce(comparisonResult())
      .mockResolvedValueOnce(
        comparisonResult({
          generatedReportExists: false,
          reportStatus: 'blocked-preflight',
          blockedReason: 'preflight blocked'
        })
      )
      .mockResolvedValueOnce(
        comparisonResult({
          generatedReportExists: false,
          runtimeExecutionState: 'failed',
          runtimeFailureReason: 'runtime died'
        })
      )
      .mockResolvedValueOnce(
        comparisonResult({
          generatedReportExists: false,
          retainedArchiveAvailable: false,
          archiveFailureReason: 'retained-archive-write-failed'
        })
      )
      .mockResolvedValueOnce(
        comparisonResult({
          generatedReportExists: false,
          retainedArchiveAvailable: false,
          archiveFailureReason: 'retained-archive-unavailable'
        })
      )
      .mockResolvedValueOnce(
        comparisonResult({ generatedReportExists: false, reportStatus: 'ready-for-runtime' })
      );
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      ensureComparisonReportEvidence: ensure as never,
      pathExists: async (targetPath: string) =>
        targetPath === '/workspace/storage/dashboards/review',
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model, reportProgress });

    expect(result.outcome).toBe('opened-review-dashboard');
    expect(ensure).toHaveBeenCalledTimes(7);
    const messages = reportProgress.mock.calls
      .map((call) => (call[0] as { message: string }).message)
      .join('\n');
    expect(messages).toContain('retained generated comparison metadata is ready');
    expect(messages).toContain('retained pair evidence is blocked (preflight blocked)');
    expect(messages).toContain('retained pair evidence reflects a failed runtime (runtime died)');
    expect(messages).toContain('retained archive evidence is unavailable (archive write failed)');
    expect(messages).toContain(
      'retained archive evidence is unavailable (archive contract unavailable)'
    );
    expect(messages).toContain(
      'retained pair evidence was refreshed without a generated comparison report'
    );
  });

  it('propagates a cancelled pair-generation result with its sub-stage (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      ensureComparisonReportEvidence: vi
        .fn()
        .mockResolvedValue({ outcome: 'cancelled', cancellationStage: 'stage-x' }) as never,
      pathExists: async (targetPath: string) =>
        targetPath === '/workspace/storage/dashboards/review',
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    await expect(action({ model })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-dashboard-pair-generation:stage-x'
    });
  });

  it('propagates a workspace-untrusted pair-generation result (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      ensureComparisonReportEvidence: vi
        .fn()
        .mockResolvedValue({ outcome: 'workspace-untrusted' }) as never,
      pathExists: async (targetPath: string) =>
        targetPath === '/workspace/storage/dashboards/review',
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    await expect(action({ model })).resolves.toEqual({ outcome: 'workspace-untrusted' });
  });

  it('cancels at the top of the pair-generation loop (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    let reads = 0;
    const token = {
      get isCancellationRequested() {
        return reads++ > 0;
      },
      onCancellationRequested: vi.fn()
    };
    const ensure = vi.fn().mockResolvedValue(comparisonResult());
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      ensureComparisonReportEvidence: ensure as never,
      pathExists: async (targetPath: string) =>
        targetPath === '/workspace/storage/dashboards/review',
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    await expect(action({ model, cancellationToken: token as never })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-dashboard-pair-generation'
    });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('cancels after the dashboard build completes (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    let cancelled = false;
    const token = {
      get isCancellationRequested() {
        return cancelled;
      },
      onCancellationRequested: vi.fn()
    };
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockImplementation(async () => {
        cancelled = true;
        return createDashboardResult(model);
      }),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      // No ensureComparisonReportEvidence -> no pair loop token reads before the build.
      pathExists: async () => true,
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    await expect(action({ model, cancellationToken: token as never })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-dashboard-build',
      dashboardFilePath: '/workspace/storage/dashboards/review/dashboard.html',
      dashboardJsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0
    });
  });

  it('cancels immediately before opening the dashboard (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    let cancelled = false;
    const token = {
      get isCancellationRequested() {
        return cancelled;
      },
      onCancellationRequested: vi.fn()
    };
    const reportProgress = vi.fn((update: { message: string }) => {
      if (update.message.startsWith('Opening VI Review Dashboard')) {
        cancelled = true;
      }
    });
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      // Dashboard directory absent -> write block skipped, then Opening flips the token.
      pathExists: async () => false,
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    await expect(
      action({ model, reportProgress, cancellationToken: token as never })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-dashboard-open',
      dashboardFilePath: '/workspace/storage/dashboards/review/dashboard.html',
      dashboardJsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0
    });
  });

  it('falls back to safe settings and default filesystem probes (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-action-'));
    actionTempRoots.push(tempRoot);
    const realReportPath = path.join(tempRoot, 'report.html');
    await fs.writeFile(realReportPath, '<html>report</html>', 'utf8');
    const context = harness.createContext();
    const model = createModel();
    harness.vscode.workspace.getConfiguration
      .mockImplementationOnce(() => {
        throw new Error('history settings unavailable');
      })
      .mockImplementationOnce(() => {
        throw new Error('runtime settings unavailable');
      });
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi
        .fn()
        .mockResolvedValueOnce({
          archivePlan: { reportFilePath: realReportPath },
          packetRecord: { runtimeExecution: { reportExists: true } }
        })
        .mockResolvedValueOnce(undefined) as never,
      // No pathExists, getHistoryServiceSettings, or getRuntimeSettings -> defaults are used.
      writeFile: vi.fn()
    });

    const result = await action({ model });

    expect(result.outcome).toBe('opened-review-dashboard');
    expect(harness.vscode.workspace.getConfiguration).toHaveBeenCalled();
  });

  it('probes total commit count via getFileHistoryCount on success and failure (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const buildStandardDeps = (getFileHistoryCount: () => Promise<number>) => ({
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue({
        archivePlan: { reportFilePath: '/workspace/storage/report.html' },
        packetRecord: { runtimeExecution: { reportExists: true } }
      }) as never,
      ensureComparisonReportEvidence: vi.fn() as never,
      pathExists: async () => true,
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS,
      getFileHistoryCount
    });

    const successProbe = vi.fn().mockResolvedValue(42);
    const successAction = createMultiReportDashboardAction(
      context as never,
      buildStandardDeps(successProbe as never) as never
    );
    await expect(successAction({ model })).resolves.toMatchObject({
      outcome: 'opened-review-dashboard'
    });
    expect(successProbe).toHaveBeenCalledWith(model.repositoryRoot, model.relativePath);

    const failingProbe = vi.fn().mockRejectedValue(new Error('history count failed'));
    const failingAction = createMultiReportDashboardAction(
      context as never,
      buildStandardDeps(failingProbe as never) as never
    );
    await expect(failingAction({ model })).resolves.toMatchObject({
      outcome: 'opened-review-dashboard'
    });
    expect(failingProbe).toHaveBeenCalled();
  });

  it('routes dashboard artifact messages through the panel tracker (VHS-REQ-610.2)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const panelTracker = {
      recordDashboard: vi.fn(),
      recordDashboardArtifactAction: vi.fn()
    };
    const action = createMultiReportDashboardAction(
      context as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
        seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
        readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
        ensureComparisonReportEvidence: vi.fn().mockResolvedValue(comparisonResult()) as never,
        pathExists: async (targetPath: string) =>
          targetPath === '/workspace/storage/dashboards/review',
        writeFile: vi.fn(),
        readFile: vi.fn().mockResolvedValue('<html><head></head><body>packet</body></html>'),
        now: incrementingClock(),
        getHistoryServiceSettings: () => HISTORY_SETTINGS,
        getRuntimeSettings: () => RUNTIME_SETTINGS
      },
      panelTracker as never
    );

    await action({ model });
    const dashboardPanel = harness.panels[0];

    await dashboardPanel.dispatchMessage('not-an-object');
    await dashboardPanel.dispatchMessage({ command: 'somethingElse' });
    await dashboardPanel.dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '',
      kind: 'metadata-json',
      label: 'Empty path'
    });
    await dashboardPanel.dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/report-metadata.json',
      kind: 'unknown-kind',
      label: 'Bad kind'
    });
    expect(panelTracker.recordDashboardArtifactAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'ignored-malformed' })
    );

    await dashboardPanel.dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/report-metadata.json',
      kind: 'metadata-json',
      label: 'Report metadata'
    });
    expect(harness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.open',
      expect.anything(),
      { preview: false }
    );
    expect(panelTracker.recordDashboardArtifactAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'opened-artifact-editor', kind: 'metadata-json' })
    );

    await dashboardPanel.dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/source-record.json',
      kind: 'source-record-json',
      label: 'Source record'
    });
    expect(panelTracker.recordDashboardArtifactAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'opened-artifact-editor', kind: 'source-record-json' })
    );

    await dashboardPanel.dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/report-packet.html',
      kind: 'packet-html',
      label: 'Report packet'
    });
    expect(panelTracker.recordDashboardArtifactAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'opened-artifact-panel', kind: 'packet-html' })
    );
    expect(harness.panels.at(-1)?.webview.html).toContain('packet');
  });

  it('opens a dashboard artifact whose in-storage path has a component starting with two dots (VHS-REQ-610.2)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const panelTracker = {
      recordDashboard: vi.fn(),
      recordDashboardArtifactAction: vi.fn()
    };
    const action = createMultiReportDashboardAction(
      context as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
        seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
        readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
        ensureComparisonReportEvidence: vi.fn().mockResolvedValue(comparisonResult()) as never,
        pathExists: async () => true,
        writeFile: vi.fn(),
        readFile: vi.fn().mockResolvedValue('<html></html>'),
        now: incrementingClock(),
        getHistoryServiceSettings: () => HISTORY_SETTINGS,
        getRuntimeSettings: () => RUNTIME_SETTINGS
      },
      panelTracker as never
    );

    await action({ model });
    const dashboardPanel = harness.panels[0];

    // The artifact lives under a directory named "..evidence" — a legitimate
    // descendant whose relative path begins with ".." but is NOT a traversal.
    await dashboardPanel.dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/..evidence/dashboards/review/report-metadata.json',
      kind: 'metadata-json',
      label: 'Report metadata under dotted directory'
    });

    expect(panelTracker.recordDashboardArtifactAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'opened-artifact-editor', kind: 'metadata-json' })
    );
    expect(panelTracker.recordDashboardArtifactAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'ignored-outside-storage' })
    );
  });

  it('renders an iframe fallback when a dashboard artifact cannot be inlined (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      ensureComparisonReportEvidence: vi.fn().mockResolvedValue(comparisonResult()) as never,
      pathExists: async (targetPath: string) =>
        targetPath === '/workspace/storage/dashboards/review',
      writeFile: vi.fn(),
      readFile: vi.fn().mockRejectedValue(new Error('artifact read failed')),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    await action({ model });
    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/diff-report-Sample.vi.html',
      kind: 'report-html',
      label: 'Generated report'
    });

    expect(harness.panels.at(-1)?.webview.html).toContain('<iframe');
  });

  it('uses the default retained-evidence seeder when none is injected (VHS-REQ-610)', async () => {
    const context = harness.createContext();
    const model = createModel();
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
      // No seedRetainedDashboardEvidence -> the real seeder runs with the injected
      // filesystem probes, which report nothing when nothing exists.
      readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
      pathExists: async () => false,
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn(),
      now: incrementingClock(),
      getHistoryServiceSettings: () => HISTORY_SETTINGS,
      getRuntimeSettings: () => RUNTIME_SETTINGS
    });

    const result = await action({ model });

    expect(result.outcome).toBe('opened-review-dashboard');
  });

  it('emits keepalive progress while a dashboard pair is still generating (VHS-REQ-610.4)', async () => {
    vi.useFakeTimers();
    try {
      const context = harness.createContext();
      const model = createModel();
      const reportProgress = vi.fn();
      let resolvePair: (value: ComparisonReportActionResult) => void = () => undefined;
      const pendingPair = new Promise<ComparisonReportActionResult>((resolve) => {
        resolvePair = resolve;
      });
      const ensure = vi
        .fn()
        .mockReturnValueOnce(pendingPair)
        .mockResolvedValue(comparisonResult());
      const action = createMultiReportDashboardAction(context as never, {
        buildDashboard: vi.fn().mockResolvedValue(createDashboardResult(model)),
        seedRetainedDashboardEvidence: vi.fn().mockResolvedValue(EMPTY_SEED_RESULT),
        readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined),
        ensureComparisonReportEvidence: ensure as never,
        pathExists: async (targetPath: string) =>
          targetPath === '/workspace/storage/dashboards/review',
        writeFile: vi.fn(),
        readFile: vi.fn().mockResolvedValue('<html></html>'),
        getHistoryServiceSettings: () => HISTORY_SETTINGS,
        getRuntimeSettings: () => RUNTIME_SETTINGS
      });

      const pending = action({ model, reportProgress });
      // Advance past the keepalive interval while the pair is still resolving.
      await vi.advanceTimersByTimeAsync(15000);
      resolvePair(comparisonResult());
      await vi.runOnlyPendingTimersAsync();
      const result = await pending;

      expect(result.outcome).toBe('opened-review-dashboard');
      expect(reportProgress).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Still working') })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('renderDashboardArtifactHtml body injection with $-sequences (VHS-REQ-610)', () => {
  it('inserts an artifact title containing $-sequences literally into the header', async () => {
    // The title flows from the artifact label (arbitrary user text). escapeHtml
    // does not escape `$`, so a string .replace() would misinterpret `$&`/`$1`/`$$`
    // in the replacement and corrupt the dashboard artifact header.
    const html = await renderDashboardArtifactHtml({
      title: 'Report $1 and $& and $$x',
      artifactFilePath: '/workspace/storage/dashboards/review/diff-report-Sample.vi.html',
      artifactDirectoryWebviewUri: 'https://vscode-resource/authority/dashboards/review/',
      cspSource: 'vscode-resource://authority',
      readFile: (async () => '<html><head></head><body><p>report</p></body></html>') as never
    });

    expect(html).toContain('Report $1 and $&amp; and $$x');
    expect(html).toContain('<p>report</p>');
  });
});
