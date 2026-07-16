import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import type { BuildMultiReportDashboardResult, MultiReportDashboardRecord } from '../../src/dashboard/multiReportDashboard';
import {
  buildDecisionRecordMissingOrBlockedFacts,
  buildReviewDecisionRecordArtifactPlan,
  collectDecisionRecordPairwiseReportPaths,
  persistReviewDecisionRecord,
  renderReviewDecisionRecordMarkdown
} from '../../src/scenarios/decisionRecord';
import { createReviewDecisionRecordAction } from '../../src/scenarios/reviewDecisionRecordAction';
import { getDefaultReviewScenarioForRepository } from '../../src/scenarios/reviewScenarioRegistry';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

function createModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/labview-icon-editor',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
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
  };
}

function createDashboardRecord(overrides: Partial<MultiReportDashboardRecord> = {}): MultiReportDashboardRecord {
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
      },
      {
        pairId: 'duplicate-generated-pair',
        selectedHash: 'b2',
        baseHash: 'a1',
        selectedAuthorDate: '2026-05-02T00:00:00.000Z',
        selectedAuthorName: 'Dev Two',
        selectedSubject: 'Middle revision',
        archiveStatus: 'archived',
        archivePlan: {} as never,
        pairEvidenceState: 'archived-failed',
        generatedReportExists: false,
        reportFilePath: '/workspace/storage/report-history/generated/diff-report-Sample.vi.html',
        dashboardImageAssets: [],
        artifactLinks: [],
        overviewImageCount: 0,
        detailItemCount: 0,
        evidenceCount: 0
      }
    ],
    ...overrides
  };
}

function createDashboardResult(record = createDashboardRecord()): BuildMultiReportDashboardResult {
  return {
    record,
    htmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
    jsonFilePath: '/workspace/storage/dashboards/review/dashboard.json'
  };
}

describe('review decision records (VHS-REQ-610 supporting evidence)', () => {
  it('persists JSON and Markdown decision records with pairwise and missing evidence facts', async () => {
    const dashboardRecord = createDashboardRecord();
    const scenario = getDefaultReviewScenarioForRepository(
      'https://github.com/ni/labview-icon-editor.git',
      dashboardRecord.relativePath
    );
    if (!scenario) {
      throw new Error('Expected default review scenario.');
    }
    const writes = new Map<string, string>();

    const result = await persistReviewDecisionRecord(
      '/workspace/storage',
      {
        scenario,
        harnessId: scenario.harnessId,
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: dashboardRecord.relativePath,
        dashboardRecord,
        dashboardHtmlPath: '/workspace/storage/dashboards/review/dashboard.html',
        dashboardJsonPath: '/workspace/storage/dashboards/review/dashboard.json',
        reviewer: 'Integration Reviewer',
        reviewQuestion: 'Does this dashboard evidence support acceptance?',
        outcome: 'needs-more-review',
        confidence: 'medium',
        decisionRationale: 'Blocked and missing pair evidence requires another pass.',
        pairwiseReportPaths: collectDecisionRecordPairwiseReportPaths(dashboardRecord),
        missingOrBlockedFacts: buildDecisionRecordMissingOrBlockedFacts(dashboardRecord),
        additionalReportGenerationRequired: true,
        additionalManualLabVIEWInspectionRequired: true,
        issuesOrBacklogItemsCreated: ['#139']
      },
      {
        now: () => '2026-05-04T12:30:00.000Z',
        mkdir: vi.fn(async () => undefined) as never,
        writeFile: vi.fn(async (filePath: string, content: string) => {
          writes.set(filePath, content);
        }) as never
      }
    );

    expect(result.record.scenarioId).toBe('SCENARIO-VHS-001');
    expect(result.record.evidenceUsed.underlyingPairwiseReportPaths).toEqual([
      '/workspace/storage/report-history/generated/diff-report-Sample.vi.html'
    ]);
    expect(result.record.evidenceUsed.missingOrBlockedFacts).toEqual([
      'Missing archived pair evidence: missing-pair',
      'Blocked pair evidence: blocked-pair',
      'Failed pair evidence: failed-pair'
    ]);
    expect(writes.get(result.artifactPlan.jsonFilePath)).toContain('"scenarioId": "SCENARIO-VHS-001"');
    expect(writes.get(result.artifactPlan.markdownFilePath)).toContain(
      'Blocked and missing pair evidence requires another pass.'
    );

    const markdown = renderReviewDecisionRecordMarkdown(result.record);
    expect(markdown).toContain('### Missing Or Blocked Facts Considered');
    expect(markdown).toContain('- #139');
  });

  it('creates a decision record action result after validating dashboard scenario evidence', async () => {
    harness.reset();
    const model = createModel();
    const dashboard = createDashboardResult();
    const buildDashboard = vi.fn().mockResolvedValue(dashboard);
    const persisted = {
      artifactPlan: {
        scenarioId: 'SCENARIO-VHS-001',
        decisionId: 'decision',
        decisionDirectory: '/workspace/storage/decision-records/repo/file/window/SCENARIO-VHS-001/decision',
        jsonFilePath:
          '/workspace/storage/decision-records/repo/file/window/SCENARIO-VHS-001/decision/decision-record.json',
        markdownFilePath:
          '/workspace/storage/decision-records/repo/file/window/SCENARIO-VHS-001/decision/decision-record.md'
      },
      record: {} as never
    };
    const persistDecisionRecord = vi.fn().mockResolvedValue(persisted);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      buildDashboard,
      persistDecisionRecord,
      readRepoRemoteUrl: vi.fn().mockResolvedValue('https://github.com/ni/labview-icon-editor.git'),
      executeCommand,
      uriFile: harness.vscode.Uri.file,
      automationInputs: {
        reviewer: 'Integration Reviewer',
        reviewQuestion: 'Does this dashboard evidence support acceptance?',
        outcome: 'needs-more-review',
        confidence: 'medium',
        decisionRationale: 'Evidence is bounded and needs another pass.'
      }
    });

    await expect(action({ model })).resolves.toEqual({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      decisionRecordJsonPath: persisted.artifactPlan.jsonFilePath,
      decisionRecordMarkdownPath: persisted.artifactPlan.markdownFilePath,
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });
    expect(buildDashboard).toHaveBeenCalledWith('/workspace/storage', model, {
      reportProgress: undefined
    });
    expect(persistDecisionRecord).toHaveBeenCalledWith(
      '/workspace/storage',
      expect.objectContaining({
        scenario: expect.objectContaining({ id: 'SCENARIO-VHS-001' }),
        reviewer: 'Integration Reviewer',
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

  it('reports scenario contract mismatches instead of writing a decision record', async () => {
    harness.reset();
    const model = createModel();
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
    const persistDecisionRecord = vi.fn();
    const action = createReviewDecisionRecordAction(harness.createContext() as never, {
      buildDashboard: vi.fn().mockResolvedValue(dashboard),
      persistDecisionRecord,
      readRepoRemoteUrl: vi.fn().mockResolvedValue('https://github.com/ni/labview-icon-editor.git'),
      automationInputs: {
        reviewer: 'Integration Reviewer',
        reviewQuestion: 'Does this dashboard evidence support acceptance?',
        outcome: 'approved',
        confidence: 'high',
        decisionRationale: 'Looks complete.'
      }
    });

    await expect(action({ model })).resolves.toMatchObject({
      outcome: 'scenario-contract-mismatch',
      scenarioId: 'SCENARIO-VHS-001',
      mismatchSummary: expect.stringContaining('requires at least 2 comparison pairs')
    });
    expect(persistDecisionRecord).not.toHaveBeenCalled();
  });
});

describe('buildReviewDecisionRecordArtifactPlan', () => {
  it('nests the decision directory under the dashboard artifact plan ids and derives file paths', () => {
    const dashboardRecord = createDashboardRecord();
    const plan = buildReviewDecisionRecordArtifactPlan(
      '/workspace/storage',
      dashboardRecord,
      'SCENARIO-VHS-001',
      'Reviewer One',
      '2026-05-04T12:00:00.000Z'
    );

    expect(plan.scenarioId).toBe('SCENARIO-VHS-001');
    expect(plan.decisionId).toMatch(/^[0-9a-f]{12}$/);
    const expectedDir = [
      '/workspace/storage',
      'decision-records',
      'repo',
      'file',
      'window',
      'SCENARIO-VHS-001',
      plan.decisionId
    ].join('/');
    expect(plan.decisionDirectory.replace(/\\/g, '/')).toBe(expectedDir);
    expect(plan.jsonFilePath.replace(/\\/g, '/')).toBe(`${expectedDir}/decision-record.json`);
    expect(plan.markdownFilePath.replace(/\\/g, '/')).toBe(`${expectedDir}/decision-record.md`);
  });

  it('is deterministic for identical inputs and differs when the reviewer changes', () => {
    const dashboardRecord = createDashboardRecord();
    const a = buildReviewDecisionRecordArtifactPlan(
      '/root',
      dashboardRecord,
      'SCENARIO-VHS-001',
      'Reviewer One',
      '2026-05-04T12:00:00.000Z'
    );
    const b = buildReviewDecisionRecordArtifactPlan(
      '/root',
      dashboardRecord,
      'SCENARIO-VHS-001',
      'Reviewer One',
      '2026-05-04T12:00:00.000Z'
    );
    const c = buildReviewDecisionRecordArtifactPlan(
      '/root',
      dashboardRecord,
      'SCENARIO-VHS-001',
      'Reviewer Two',
      '2026-05-04T12:00:00.000Z'
    );
    expect(a.decisionId).toBe(b.decisionId);
    expect(a.decisionId).not.toBe(c.decisionId);
  });

  it('folds empty commit-window hashes into the decision id without throwing', () => {
    const dashboardRecord = createDashboardRecord({
      commitWindow: {
        commitCount: 3,
        pairCount: 2,
        newestHash: undefined,
        oldestHash: undefined
      }
    });
    const plan = buildReviewDecisionRecordArtifactPlan(
      '/root',
      dashboardRecord,
      'SCENARIO-VHS-001',
      'Reviewer One',
      '2026-05-04T12:00:00.000Z'
    );
    expect(plan.decisionId).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('renderReviewDecisionRecordMarkdown and persist default branches', () => {
  function baseRecord(): Parameters<typeof renderReviewDecisionRecordMarkdown>[0] {
    return {
      scenarioId: 'SCENARIO-VHS-001',
      scenarioTitle: 'Aggregate Review',
      harnessId: undefined,
      repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
      repositoryName: 'labview-icon-editor',
      viPath: 'resource/plugins/lv_icon.vi',
      commitWindowStart: undefined,
      commitWindowEnd: undefined,
      comparisonPairsIncluded: 0,
      dashboardPacketPath: '/s/dashboard.json',
      dashboardHtmlPath: '/s/dashboard.html',
      generatedAt: '2026-05-04T12:00:00.000Z',
      reviewer: 'Reviewer One',
      reviewQuestion: 'Ready?',
      evidenceUsed: {
        dashboardHtmlPath: '/s/dashboard.html',
        dashboardPacketPath: '/s/dashboard.json',
        underlyingPairwiseReportPaths: [],
        missingOrBlockedFacts: []
      },
      reviewerOutcome: {
        outcome: 'approved',
        confidence: 'high',
        decisionRationale: 'Looks complete.'
      },
      followUp: {
        additionalReportGenerationRequired: false,
        additionalManualLabVIEWInspectionRequired: false,
        issuesOrBacklogItemsCreated: []
      }
    };
  }

  it('renders "- none" for empty pairwise reports, missing facts, and issues, and "none" harness', () => {
    const markdown = renderReviewDecisionRecordMarkdown(baseRecord());
    // Each of the three list sections falls back to the "- none" branch.
    expect((markdown.match(/- none/g) ?? []).length).toBe(3);
    expect(markdown).toContain('Harness ID: none');
    expect(markdown).toContain('Commit-window start: unknown');
    expect(markdown).toContain('Commit-window end: unknown');
  });

  it('renders the "no" follow-up branch when no additional work is required', () => {
    const markdown = renderReviewDecisionRecordMarkdown(baseRecord());
    expect(markdown).toContain('Additional report generation required: no');
    expect(markdown).toContain('Additional manual LabVIEW inspection required: no');
  });

  it('renders the populated list and "yes" follow-up branches', () => {
    const record = baseRecord();
    record.harnessId = 'HARNESS-1';
    record.commitWindowStart = 'a1';
    record.commitWindowEnd = 'c3';
    record.evidenceUsed.underlyingPairwiseReportPaths = ['/r/one.html', '/r/two.html'];
    record.evidenceUsed.missingOrBlockedFacts = ['Missing archived pair evidence: p1'];
    record.followUp.additionalReportGenerationRequired = true;
    record.followUp.additionalManualLabVIEWInspectionRequired = true;
    record.followUp.issuesOrBacklogItemsCreated = ['#42'];
    const markdown = renderReviewDecisionRecordMarkdown(record);
    expect(markdown).toContain('- /r/one.html');
    expect(markdown).toContain('- /r/two.html');
    expect(markdown).toContain('- Missing archived pair evidence: p1');
    expect(markdown).toContain('- #42');
    expect(markdown).toContain('Harness ID: HARNESS-1');
    expect(markdown).toContain('Additional report generation required: yes');
    expect(markdown).not.toContain('- none');
  });

  it('persistReviewDecisionRecord applies the follow-up defaults when optional fields are omitted', async () => {
    const dashboardRecord = createDashboardRecord();
    const writes = new Map<string, string>();
    const result = await persistReviewDecisionRecord(
      '/workspace/storage',
      {
        scenario: { id: 'SCENARIO-VHS-001', title: 'Aggregate Review', harnessId: undefined } as never,
        harnessId: undefined,
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: dashboardRecord.relativePath,
        dashboardRecord,
        dashboardHtmlPath: '/s/dashboard.html',
        dashboardJsonPath: '/s/dashboard.json',
        reviewer: 'Reviewer One',
        reviewQuestion: 'Ready?',
        outcome: 'approved',
        confidence: 'high',
        decisionRationale: 'Complete.',
        pairwiseReportPaths: [],
        missingOrBlockedFacts: []
        // additionalReportGenerationRequired / additionalManualLabVIEWInspectionRequired /
        // issuesOrBacklogItemsCreated intentionally omitted -> default branches
      },
      {
        now: () => '2026-05-04T12:30:00.000Z',
        mkdir: vi.fn(async () => undefined) as never,
        writeFile: vi.fn(async (filePath: string, content: string) => {
          writes.set(filePath, content);
        }) as never
      }
    );
    expect(result.record.followUp.additionalReportGenerationRequired).toBe(false);
    expect(result.record.followUp.additionalManualLabVIEWInspectionRequired).toBe(false);
    expect(result.record.followUp.issuesOrBacklogItemsCreated).toEqual([]);
  });
});
