// Supporting VHS-REQ-610 (dashboard aggregate review): orchestration-branch unit
// coverage for the review decision-record action. These tests drive every reachable
// ReviewDecisionRecordActionResult outcome through dependency-injected fakes so no real
// vscode, git, or filesystem access occurs.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

const registryControl = vi.hoisted(() => ({ forceMissingScenario: false }));

vi.mock('../../src/scenarios/reviewScenarioRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/scenarios/reviewScenarioRegistry')>();
  return {
    ...actual,
    getDefaultReviewScenarioForRepository: (
      repositoryUrl: string,
      targetRelativePath: string
    ) =>
      registryControl.forceMissingScenario
        ? undefined
        : actual.getDefaultReviewScenarioForRepository(repositoryUrl, targetRelativePath)
  };
});

import type {
  BuildMultiReportDashboardResult,
  MultiReportDashboardRecord
} from '../../src/dashboard/multiReportDashboard';
import {
  createReviewDecisionRecordAction,
  type ReviewDecisionRecordActionDeps
} from '../../src/scenarios/reviewDecisionRecordAction';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

const LAST_REVIEWER_STATE_KEY = 'viHistorySuite.lastDecisionReviewer';
const EXPECTED_TITLE = 'Review Decision Record: VIP_Pre-Install Custom Action.vi';
const REPOSITORY_URL = 'https://github.com/ni/labview-icon-editor.git';

// The shared harness does not model vscode.ExtensionMode; define it so the action's
// `context.extensionMode === vscode.ExtensionMode.Test` guard can be exercised without
// throwing when the interactive prompt path is reached.
const EXTENSION_MODE = { Production: 1, Development: 2, Test: 3 } as const;
(harness.vscode as unknown as { ExtensionMode: typeof EXTENSION_MODE }).ExtensionMode =
  EXTENSION_MODE;

function createModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/labview-icon-editor',
    repositoryUrl: REPOSITORY_URL,
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN',
    eligible: true,
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
  } as ViHistoryViewModel;
}

function createDashboardRecord(
  overrides: Partial<MultiReportDashboardRecord> = {}
): MultiReportDashboardRecord {
  return {
    generatedAt: '2026-05-04T12:00:00.000Z',
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/labview-icon-editor',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN',
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
      commitCount: 3,
      pairCount: 2,
      newestHash: 'c3',
      oldestHash: 'a1'
    },
    summary: {
      representedPairCount: 2,
      windowCompletenessState: 'incomplete-missing-archives',
      archivedPairCount: 1,
      missingPairCount: 1,
      missingPairIds: ['missing-pair'],
      generatedReportCount: 1,
      reportMetadataPairCount: 1,
      failedPairCount: 1,
      failedPairIds: ['failed-pair'],
      blockedPairCount: 1,
      blockedPairIds: ['blocked-pair'],
      overviewSectionCount: 1,
      overviewImageCount: 1,
      includedAttributeCount: 1,
      detailSectionCount: 1,
      detailItemCount: 1,
      pairWithOverviewImageCount: 1,
      pairWithDetailCount: 1,
      providerSummaries: [],
      overviewCaptionSummaries: [],
      includedAttributeSummaries: [],
      detailHeadingSummaries: [],
      evidenceStateSummaries: []
    },
    entries: [
      {
        pairId: 'generated-pair',
        selectedHash: 'c3',
        baseHash: 'b2',
        selectedAuthorDate: '2026-05-03T00:00:00.000Z',
        selectedAuthorName: 'Dev Three',
        selectedSubject: 'Selected revision',
        archiveStatus: 'archived',
        archivePlan: {} as never,
        pairEvidenceState: 'archived-generated-report',
        generatedReportExists: true,
        reportFilePath: '/workspace/storage/report-history/generated/diff-report-Sample.vi.html',
        dashboardImageAssets: [],
        artifactLinks: [],
        overviewImageCount: 1,
        detailItemCount: 1,
        evidenceCount: 2
      }
    ],
    ...overrides
  } as MultiReportDashboardRecord;
}

function createCleanDashboardRecord(): MultiReportDashboardRecord {
  const base = createDashboardRecord();
  return {
    ...base,
    summary: {
      ...base.summary,
      windowCompletenessState: 'complete',
      archivedPairCount: 2,
      missingPairCount: 0,
      missingPairIds: [],
      failedPairCount: 0,
      failedPairIds: [],
      blockedPairCount: 0,
      blockedPairIds: []
    }
  };
}

function createDashboardResult(
  record: MultiReportDashboardRecord = createDashboardRecord()
): BuildMultiReportDashboardResult {
  return {
    record,
    htmlFilePath: record.artifactPlan.htmlFilePath,
    jsonFilePath: record.artifactPlan.jsonFilePath
  };
}

function createPersistedDecisionRecord() {
  return {
    artifactPlan: {
      scenarioId: 'SCENARIO-VHS-001',
      decisionId: 'decision',
      decisionDirectory:
        '/workspace/storage/decision-records/repo/file/window/SCENARIO-VHS-001/decision',
      jsonFilePath:
        '/workspace/storage/decision-records/repo/file/window/SCENARIO-VHS-001/decision/decision-record.json',
      markdownFilePath:
        '/workspace/storage/decision-records/repo/file/window/SCENARIO-VHS-001/decision/decision-record.md'
    },
    record: {} as never
  };
}

function completeAutomationInputs(): ReviewDecisionRecordActionDeps['automationInputs'] {
  return {
    reviewer: 'Automation Reviewer',
    reviewQuestion: 'Does the retained evidence support acceptance?',
    outcome: 'needs-more-review',
    confidence: 'medium',
    decisionRationale: 'Bounded automation rationale for orchestration coverage.'
  };
}

function createOrchestrationMocks(dashboard: BuildMultiReportDashboardResult) {
  return {
    buildDashboard: vi.fn().mockResolvedValue(dashboard),
    persistDecisionRecord: vi.fn().mockResolvedValue(createPersistedDecisionRecord()),
    readRepoRemoteUrl: vi.fn().mockResolvedValue(REPOSITORY_URL),
    executeCommand: vi.fn().mockResolvedValue(undefined)
  };
}

type PromptStop = 'reviewer' | 'reviewQuestion' | 'outcome' | 'confidence' | 'rationale';

function createInteractivePromptMocks(stopAt?: PromptStop) {
  const showInputBox = vi.fn();
  showInputBox.mockResolvedValueOnce(stopAt === 'reviewer' ? undefined : 'Interactive Reviewer');
  showInputBox.mockResolvedValueOnce(
    stopAt === 'reviewQuestion' ? undefined : 'Does the retained evidence support acceptance?'
  );
  showInputBox.mockResolvedValueOnce(
    stopAt === 'rationale' ? undefined : 'Detailed interactive decision rationale for coverage.'
  );

  const showQuickPick = vi.fn();
  showQuickPick.mockResolvedValueOnce(
    stopAt === 'outcome'
      ? undefined
      : { label: 'Approved', description: 'approved', value: 'approved' }
  );
  showQuickPick.mockResolvedValueOnce(
    stopAt === 'confidence'
      ? undefined
      : { label: 'Medium', description: 'medium', value: 'medium' }
  );

  return { showInputBox, showQuickPick };
}

function createStagedCancellationToken(cancelAtAccess: number) {
  let accessCount = 0;
  return {
    get isCancellationRequested(): boolean {
      accessCount += 1;
      return accessCount >= cancelAtAccess;
    },
    onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() }))
  };
}

describe('review decision record action guard outcomes (VHS-REQ-610 supporting evidence)', () => {
  beforeEach(() => {
    harness.reset();
    registryControl.forceMissingScenario = false;
  });

  it('returns cancelled before decision-record input when the token is already requested', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(
      action({
        model: createModel(),
        cancellationToken: {
          isCancellationRequested: true,
          onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() }))
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-input'
    });
    expect(mocks.buildDashboard).not.toHaveBeenCalled();
    expect(mocks.persistDecisionRecord).not.toHaveBeenCalled();
  });

  it('returns workspace-untrusted when the workspace is not trusted', async () => {
    harness.setWorkspaceTrusted(false);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      automationInputs: completeAutomationInputs()
    });

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });
  });

  it('returns missing-storage-uri when the extension storage URI is unavailable', async () => {
    const action = createReviewDecisionRecordAction(
      harness.createContext({ storageUri: undefined }) as never,
      { automationInputs: completeAutomationInputs() }
    );

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });
  });

  it('returns insufficient-commits when fewer than three commits are available', async () => {
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      automationInputs: completeAutomationInputs()
    });

    await expect(
      action({ model: createModel({ commits: createModel().commits.slice(0, 2) }) })
    ).resolves.toEqual({
      outcome: 'insufficient-commits'
    });
  });
});

describe('review decision record action automation happy path (VHS-REQ-610 supporting evidence)', () => {
  beforeEach(() => {
    harness.reset();
    registryControl.forceMissingScenario = false;
  });

  it('creates a decision record from complete automation inputs and opens the markdown artifact', async () => {
    const model = createModel();
    const dashboard = createDashboardResult();
    const persisted = createPersistedDecisionRecord();
    const buildDashboard = vi.fn().mockResolvedValue(dashboard);
    const persistDecisionRecord = vi.fn().mockResolvedValue(persisted);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const readRepoRemoteUrl = vi.fn().mockResolvedValue(REPOSITORY_URL);
    const reportProgress = vi.fn();

    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      buildDashboard,
      persistDecisionRecord,
      readRepoRemoteUrl,
      executeCommand,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(action({ model, reportProgress })).resolves.toEqual({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      decisionRecordJsonPath: persisted.artifactPlan.jsonFilePath,
      decisionRecordMarkdownPath: persisted.artifactPlan.markdownFilePath,
      title: EXPECTED_TITLE
    });
    expect(buildDashboard).toHaveBeenCalledWith('/workspace/storage', model, { reportProgress });
    expect(reportProgress).toHaveBeenCalled();
    expect(persistDecisionRecord).toHaveBeenCalledWith(
      '/workspace/storage',
      expect.objectContaining({
        scenario: expect.objectContaining({ id: 'SCENARIO-VHS-001' }),
        reviewer: 'Automation Reviewer',
        outcome: 'needs-more-review',
        additionalReportGenerationRequired: true,
        additionalManualLabVIEWInspectionRequired: true
      }),
      expect.any(Object)
    );
    expect(executeCommand).toHaveBeenCalledWith(
      'vscode.open',
      expect.objectContaining({ fsPath: persisted.artifactPlan.markdownFilePath }),
      { preview: false }
    );
  });

  it('synthesizes bounded inputs when running in extension test mode', async () => {
    const dashboard = createDashboardResult();
    const mocks = createOrchestrationMocks(dashboard);
    const action = createReviewDecisionRecordAction(
      harness.createContext({ extensionMode: EXTENSION_MODE.Test }) as never,
      {
        ...mocks,
        uriFile: harness.vscode.Uri.file,
        automationInputs: {}
      }
    );

    await expect(action({ model: createModel() })).resolves.toMatchObject({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001'
    });
    expect(mocks.persistDecisionRecord).toHaveBeenCalledWith(
      '/workspace/storage',
      expect.objectContaining({
        reviewer: 'Integration Reviewer',
        outcome: 'needs-more-review',
        confidence: 'medium'
      }),
      expect.any(Object)
    );
  });
});

describe('review decision record action interactive prompts (VHS-REQ-610 supporting evidence)', () => {
  beforeEach(() => {
    harness.reset();
    registryControl.forceMissingScenario = false;
  });

  it('collects interactive prompt inputs and records an approved decision', async () => {
    const dashboard = createDashboardResult(createCleanDashboardRecord());
    const mocks = createOrchestrationMocks(dashboard);
    const prompts = createInteractivePromptMocks();
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      showInputBox: prompts.showInputBox as never,
      showQuickPick: prompts.showQuickPick as never,
      reviewerNameProvider: () => 'Fallback Reviewer',
      automationInputs: {}
    });

    await expect(action({ model: createModel() })).resolves.toMatchObject({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001'
    });
    expect(prompts.showInputBox.mock.calls[0][0].value).toBe('Fallback Reviewer');
    expect(prompts.showQuickPick).toHaveBeenCalledTimes(2);
    expect(mocks.persistDecisionRecord).toHaveBeenCalledWith(
      '/workspace/storage',
      expect.objectContaining({
        reviewer: 'Interactive Reviewer',
        outcome: 'approved',
        additionalReportGenerationRequired: false,
        additionalManualLabVIEWInspectionRequired: false
      }),
      expect.any(Object)
    );
  });

  it('uses the persisted reviewer name and cancels when the reviewer prompt is dismissed', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const prompts = createInteractivePromptMocks('reviewer');
    const action = createReviewDecisionRecordAction(
      harness.createContext({
        globalState: harness.createMemento({ [LAST_REVIEWER_STATE_KEY]: 'Persisted Reviewer' })
      }) as never,
      {
        ...mocks,
        uriFile: harness.vscode.Uri.file,
        showInputBox: prompts.showInputBox as never,
        showQuickPick: prompts.showQuickPick as never,
        reviewerNameProvider: () => 'Fallback Reviewer',
        automationInputs: {}
      }
    );

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
    expect(prompts.showInputBox.mock.calls[0][0].value).toBe('Persisted Reviewer');
    expect(mocks.buildDashboard).not.toHaveBeenCalled();
  });

  it('cancels during input when the review question prompt is dismissed', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const prompts = createInteractivePromptMocks('reviewQuestion');
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      showInputBox: prompts.showInputBox as never,
      showQuickPick: prompts.showQuickPick as never,
      automationInputs: {}
    });

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
    expect(mocks.buildDashboard).not.toHaveBeenCalled();
  });

  it('cancels during input when the outcome quick pick is dismissed', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const prompts = createInteractivePromptMocks('outcome');
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      showInputBox: prompts.showInputBox as never,
      showQuickPick: prompts.showQuickPick as never,
      reviewerNameProvider: () => 'Fallback Reviewer',
      automationInputs: {}
    });

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
    expect(prompts.showQuickPick).toHaveBeenCalledTimes(1);
  });

  it('cancels during input when the confidence quick pick is dismissed', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const prompts = createInteractivePromptMocks('confidence');
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      showInputBox: prompts.showInputBox as never,
      showQuickPick: prompts.showQuickPick as never,
      reviewerNameProvider: () => 'Fallback Reviewer',
      automationInputs: {}
    });

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
    expect(prompts.showQuickPick).toHaveBeenCalledTimes(2);
  });

  it('cancels during input when the decision rationale prompt is dismissed', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const prompts = createInteractivePromptMocks('rationale');
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      showInputBox: prompts.showInputBox as never,
      showQuickPick: prompts.showQuickPick as never,
      reviewerNameProvider: () => 'Fallback Reviewer',
      automationInputs: {}
    });

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
    expect(prompts.showInputBox).toHaveBeenCalledTimes(3);
  });

  it('enforces required-field validateInput rules on every text prompt (VHS-REQ-610 supporting evidence)', async () => {
    const dashboard = createDashboardResult(createCleanDashboardRecord());
    const mocks = createOrchestrationMocks(dashboard);
    const prompts = createInteractivePromptMocks();
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      showInputBox: prompts.showInputBox as never,
      showQuickPick: prompts.showQuickPick as never,
      reviewerNameProvider: () => 'Fallback Reviewer',
      automationInputs: {}
    });

    await action({ model: createModel() });

    // The reviewer, review-question, and rationale prompts each pass a
    // validateInput guard: blank/whitespace is rejected with a message, a real
    // value is accepted (undefined). Exercise both branches directly.
    const expectedMessages = [
      'Reviewer name is required.',
      'A review question is required.',
      'A decision rationale is required.'
    ];
    expect(prompts.showInputBox).toHaveBeenCalledTimes(3);
    prompts.showInputBox.mock.calls.forEach((call, index) => {
      const validateInput = call[0].validateInput as (value: string) => string | undefined;
      expect(validateInput('   ')).toBe(expectedMessages[index]);
      expect(validateInput('a real value')).toBeUndefined();
    });
  });
});

describe('review decision record action evidence-validation outcomes (VHS-REQ-610 supporting evidence)', () => {
  beforeEach(() => {
    harness.reset();
    registryControl.forceMissingScenario = false;
  });

  it('returns missing-repository-url when the repository remote cannot be resolved', async () => {
    const dashboard = createDashboardResult();
    const mocks = createOrchestrationMocks(dashboard);
    mocks.readRepoRemoteUrl.mockResolvedValue(undefined);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'missing-repository-url',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath
    });
    expect(mocks.persistDecisionRecord).not.toHaveBeenCalled();
  });

  it('returns missing-review-scenario when no scenario is available for the repository', async () => {
    const dashboard = createDashboardResult();
    const mocks = createOrchestrationMocks(dashboard);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });
    registryControl.forceMissingScenario = true;

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'missing-review-scenario',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath
    });
    expect(mocks.persistDecisionRecord).not.toHaveBeenCalled();
  });

  it('returns scenario-contract-mismatch when the dashboard violates the scenario contract', async () => {
    const dashboard = createDashboardResult(
      createDashboardRecord({
        commitWindow: {
          commitCount: 3,
          pairCount: 1,
          newestHash: 'c3',
          oldestHash: 'b2'
        }
      })
    );
    const mocks = createOrchestrationMocks(dashboard);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(action({ model: createModel() })).resolves.toMatchObject({
      outcome: 'scenario-contract-mismatch',
      scenarioId: 'SCENARIO-VHS-001',
      mismatchSummary: expect.stringContaining('requires at least 2 comparison pairs'),
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath
    });
    expect(mocks.persistDecisionRecord).not.toHaveBeenCalled();
  });
});

describe('review decision record action cancellation stages (VHS-REQ-610 supporting evidence)', () => {
  beforeEach(() => {
    harness.reset();
    registryControl.forceMissingScenario = false;
  });

  it('cancels before dashboard build after the reviewer inputs are captured', async () => {
    const mocks = createOrchestrationMocks(createDashboardResult());
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(
      action({
        model: createModel(),
        cancellationToken: createStagedCancellationToken(2) as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-dashboard-build'
    });
    expect(mocks.buildDashboard).not.toHaveBeenCalled();
  });

  it('cancels after dashboard build before resolving the repository URL', async () => {
    const dashboard = createDashboardResult();
    const mocks = createOrchestrationMocks(dashboard);
    const reportProgress = vi.fn();
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(
      action({
        model: createModel(),
        reportProgress,
        cancellationToken: createStagedCancellationToken(3) as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-dashboard-build',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      title: EXPECTED_TITLE
    });
    expect(mocks.buildDashboard).toHaveBeenCalledTimes(1);
    expect(mocks.readRepoRemoteUrl).not.toHaveBeenCalled();
  });

  it('cancels before persisting the decision record after scenario validation', async () => {
    const dashboard = createDashboardResult();
    const mocks = createOrchestrationMocks(dashboard);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      ...mocks,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(
      action({
        model: createModel(),
        cancellationToken: createStagedCancellationToken(4) as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-persist',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      title: EXPECTED_TITLE
    });
    expect(mocks.persistDecisionRecord).not.toHaveBeenCalled();
  });

  it('cancels before opening the persisted decision record markdown', async () => {
    const dashboard = createDashboardResult();
    const persisted = createPersistedDecisionRecord();
    const buildDashboard = vi.fn().mockResolvedValue(dashboard);
    const persistDecisionRecord = vi.fn().mockResolvedValue(persisted);
    const readRepoRemoteUrl = vi.fn().mockResolvedValue(REPOSITORY_URL);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      buildDashboard,
      persistDecisionRecord,
      readRepoRemoteUrl,
      executeCommand,
      uriFile: harness.vscode.Uri.file,
      automationInputs: completeAutomationInputs()
    });

    await expect(
      action({
        model: createModel(),
        cancellationToken: createStagedCancellationToken(5) as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-open',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      decisionRecordJsonPath: persisted.artifactPlan.jsonFilePath,
      decisionRecordMarkdownPath: persisted.artifactPlan.markdownFilePath,
      title: EXPECTED_TITLE
    });
    expect(persistDecisionRecord).toHaveBeenCalledTimes(1);
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
