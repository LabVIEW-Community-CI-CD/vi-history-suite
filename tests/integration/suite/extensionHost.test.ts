import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ViHistorySuiteApi } from '../../../src/extension';

interface IntegrationWorkspaceMetadata {
  workspacePath: string;
  eligibleRelativePath: string;
  ineligibleRelativePath: string;
}

interface DashboardArtifactLink {
  kind: 'packet-html' | 'report-html' | 'metadata-json' | 'source-record-json';
  label: string;
  filePath: string;
}

interface DashboardRecord {
  entries: Array<{
    artifactLinks?: DashboardArtifactLink[];
  }>;
}

export async function runIntegrationSuite(): Promise<void> {
  const metadata = await loadMetadata();
  const api = await loadExtensionApi();

  await api.refreshEligibility();
  await testEligibleVersusIneligibleFlow(api, metadata);
  await testPanelOpenFlow(api, metadata);
}

async function loadMetadata(): Promise<IntegrationWorkspaceMetadata> {
  const runtimeConfigPath = path.resolve(__dirname, '..', 'test-runtime.json');
  return JSON.parse(await fs.readFile(runtimeConfigPath, 'utf8')) as IntegrationWorkspaceMetadata;
}

async function loadExtensionApi(): Promise<ViHistorySuiteApi> {
  const extension = vscode.extensions.getExtension<ViHistorySuiteApi>(
    'svelderrainruiz.vi-history-suite'
  );
  assert.ok(extension, 'extension must be installed in the test host');
  return extension.isActive ? extension.exports : await extension.activate();
}

async function testEligibleVersusIneligibleFlow(
  api: ViHistorySuiteApi,
  metadata: IntegrationWorkspaceMetadata
): Promise<void> {
  const eligibleUri = vscode.Uri.file(
    path.join(metadata.workspacePath, metadata.eligibleRelativePath)
  );
  const ineligibleUri = vscode.Uri.file(
    path.join(metadata.workspacePath, metadata.ineligibleRelativePath)
  );

  const history = await api.loadHistory(eligibleUri);
  assert.equal(history.signature, 'LVIN');
  assert.equal(history.eligible, true);
  assert.equal(history.commits.length, 3);

  await waitFor(
    async () => {
      await api.refreshEligibility();
      return api.isEligible(eligibleUri);
    },
    10000,
    () =>
      JSON.stringify(
        {
          eligibleUri: eligibleUri.fsPath,
          ineligibleUri: ineligibleUri.fsPath,
          history,
          eligibility: api.getEligibilityDebugSnapshot()
        },
        null,
        2
      )
  );

  assert.equal(api.isEligible(eligibleUri), true);
  assert.equal(api.isEligible(ineligibleUri), false);
}

async function testPanelOpenFlow(
  api: ViHistorySuiteApi,
  metadata: IntegrationWorkspaceMetadata
): Promise<void> {
  const eligibleUri = vscode.Uri.file(
    path.join(metadata.workspacePath, metadata.eligibleRelativePath)
  );

  api.clearHistoryPanelTracking();
  await vscode.commands.executeCommand('labviewViHistory.open', eligibleUri);

  await waitFor(async () => {
    const panel = api.getLastOpenedPanel();
    return panel?.targetFsPath === eligibleUri.fsPath && panel.commitCount >= 2;
  }, 10000);

  const panel = api.getLastOpenedPanel();
  assert.ok(panel);
  assert.equal(panel.targetFsPath, eligibleUri.fsPath);
  assert.equal(panel.eligible, true);
  assert.match(panel.title, /^VI History:/);
  assert.equal(api.getOpenHistoryPanelCount(), 1);
  assert.match(panel.renderedHtml, /data-testid="history-status"/);
  assert.match(panel.renderedHtml, /data-testid="history-review-packet"/);
  assert.match(panel.renderedHtml, /data-testid="history-chronology-order"/);
  assert.match(panel.renderedHtml, /data-testid="history-newest-commit"/);
  assert.match(panel.renderedHtml, /data-testid="history-oldest-commit"/);
  assert.match(panel.renderedHtml, /data-testid="history-meta-repository"/);
  assert.match(panel.renderedHtml, /data-testid="history-meta-path"/);
  assert.match(panel.renderedHtml, /data-testid="history-binary-limitations"/);
  assert.match(panel.renderedHtml, /data-testid="history-review-guidance"/);
  assert.match(panel.renderedHtml, /data-testid="history-guidance-step"/);
  assert.match(panel.renderedHtml, /data-testid="history-confidence-scope"/);
  assert.match(panel.renderedHtml, /data-testid="history-confidence-basis"/);
  assert.match(panel.renderedHtml, /data-testid="history-confidence-rating"/);
  assert.match(panel.renderedHtml, /data-testid="history-scope-included"/);
  assert.match(panel.renderedHtml, /data-testid="history-scope-excluded"/);
  assert.match(panel.renderedHtml, /data-testid="history-table"/);
  assert.match(panel.renderedHtml, /data-testid="history-row"/);
  assert.match(panel.renderedHtml, /data-testid="history-commit-select"/);
  assert.match(panel.renderedHtml, /data-testid="history-compare-base"/);
  assert.match(panel.renderedHtml, /data-testid="history-compare-pair"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-open"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-copy"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-copy-review-packet"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-documentation"/);
  assert.match(panel.renderedHtml, /Eligible/);
  assert.match(panel.renderedHtml, /LVIN/);
  assert.match(panel.renderedHtml, /Newest commit first/);
  assert.match(panel.renderedHtml, /Binary review limits:/);
  assert.match(panel.renderedHtml, /Reviewer guidance:/);
  assert.match(panel.renderedHtml, /Confidence and scope:/);
  assert.match(panel.renderedHtml, /Local Git history, tracked-file status, and content-detected VI signature checks\./);
  assert.match(panel.renderedHtml, /Direct local evidence for chronology, path provenance, retained hashes, and retained compare pairing\./);
  assert.match(panel.renderedHtml, /checkbox-selected compare pairing/);
  assert.match(panel.renderedHtml, /Needs external comparison tooling:/);
  assert.match(panel.renderedHtml, /Binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output\./);
  assert.match(panel.renderedHtml, /Adjacent:<\/strong> <code>[0-9a-f]{8}<\/code> <strong>vs prior:<\/strong> <code>[0-9a-f]{8}<\/code>/);
  assert.match(panel.renderedHtml, /Tooling\/deployment\/VIP_Pre-Install Custom Action\.vi/);
  assert.match(panel.renderedHtml, /Update eligible fixture/);
  assert.match(panel.renderedHtml, /Add initial integration fixtures/);
  assert.match(panel.renderedHtml, /Add third eligible fixture revision/);
  assert.match(panel.renderedHtml, /Select any two retained revisions/);
  assert.match(panel.renderedHtml, /Open docs/);
  assert.doesNotMatch(panel.renderedHtml, /Open dashboard/);
  assert.doesNotMatch(panel.renderedHtml, /Create decision record/);

  const history = await api.loadHistory(eligibleUri);
  const selectedCommit = history.commits[0];
  assert.ok(selectedCommit);
  assert.ok(selectedCommit.previousHash);

  await api.dispatchLastPanelMessage({
    command: 'copyReviewPacket'
  });
  const copiedReviewAction = api.getLastPanelActionSummary();
  assert.ok(copiedReviewAction);
  assert.equal(copiedReviewAction.command, 'copyReviewPacket');
  assert.equal(copiedReviewAction.outcome, 'copied-review-packet');
  assert.ok((copiedReviewAction.copiedTextLength ?? 0) > 0);
  const copiedReviewPacket = await readClipboardBestEffort();
  if (copiedReviewPacket) {
    assert.match(copiedReviewPacket, /VI History Review Packet/);
    assert.match(copiedReviewPacket, /Repository: vihs-integration-/);
    assert.match(
      copiedReviewPacket,
      /Path: Tooling\/deployment\/VIP_Pre-Install Custom Action\.vi/
    );
    assert.match(copiedReviewPacket, /Confidence and scope:/);
    assert.match(
      copiedReviewPacket,
      /Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output\./
    );
    assert.match(copiedReviewPacket, /- [0-9a-f]{8} vs [0-9a-f]{8} :: Update eligible fixture/);
    assert.match(
      copiedReviewPacket,
      /- [0-9a-f]{8} vs [0-9a-f]{8} :: Add third eligible fixture revision/
    );
    assert.equal(copiedReviewAction.copiedTextLength, copiedReviewPacket.length);
  }

  await api.dispatchLastPanelMessage({
    command: 'copyHash',
    hash: selectedCommit.hash
  });
  const copiedHashAction = api.getLastPanelActionSummary();
  assert.deepEqual(copiedHashAction, {
    command: 'copyHash',
    hash: selectedCommit.hash,
    outcome: 'copied-hash',
    copiedHash: selectedCommit.hash
  });
  const copiedHash = await readClipboardBestEffort();
  if (copiedHash) {
    assert.equal(copiedHash, selectedCommit.hash);
  }

  await api.dispatchLastPanelMessage({
    command: 'openCommit',
    hash: selectedCommit.hash
  });
  const openedAction = api.getLastPanelActionSummary();
  assert.ok(openedAction);
  assert.equal(openedAction.command, 'openCommit');
  assert.equal(openedAction.hash, selectedCommit.hash);
  assert.equal(openedAction.outcome, 'opened-commit');
  assert.match(openedAction.openedUri ?? '', /^git:/);

  await api.dispatchLastPanelMessage({
    command: 'diffPrevious',
    hash: selectedCommit.hash
  });
  const diffAction = api.getLastPanelActionSummary();
  assert.ok(diffAction);
  assert.equal(diffAction.command, 'diffPrevious');
  assert.equal(diffAction.hash, selectedCommit.hash);
  assert.equal(diffAction.outcome, 'missing-retained-comparison-report');
  assert.equal(api.getPanelActionCount(), 4);

  await api.dispatchLastPanelMessage({
    command: 'openDocumentation',
    pageId: 'user-workflow'
  });
  await waitFor(async () => api.getLastOpenedDocumentationPanel()?.pageId === 'user-workflow', 10000);
  const documentationPanel = api.getLastOpenedDocumentationPanel();
  assert.ok(documentationPanel);
  assert.equal(documentationPanel.pageId, 'user-workflow');
  assert.equal(documentationPanel.pageTitle, 'User Workflow');
  assert.match(documentationPanel.title, /^VI History Docs:/);
  assert.equal(api.getOpenDocumentationPanelCount(), 1);
  assert.match(documentationPanel.renderedHtml, /data-testid="documentation-shell"/);
  assert.match(documentationPanel.renderedHtml, /Installed extension version:/);
  const documentationAction = api.getLastPanelActionSummary();
  assert.ok(documentationAction);
  assert.equal(documentationAction.command, 'openDocumentation');
  assert.equal(documentationAction.outcome, 'opened-documentation');

  await api.dispatchLastPanelMessage({
    command: 'generateComparisonReport',
    hash: selectedCommit.hash
  });
  const reportAction = api.getLastPanelActionSummary();
  assert.ok(reportAction);
  assert.equal(reportAction.command, 'generateComparisonReport');
  assert.equal(reportAction.hash, selectedCommit.hash);
  assert.equal(reportAction.outcome, 'opened-comparison-report');
  assert.match(reportAction.title ?? '', /^VI Comparison Report:/);
  assert.match(reportAction.packetFilePath ?? '', /report-packet\.html$/);
  assert.match(
    reportAction.reportFilePath ?? '',
    /diff-report-VIP_Pre-Install Custom Action\.vi\.html$/
  );
  assert.match(reportAction.metadataFilePath ?? '', /report-metadata\.json$/);
  assert.ok(reportAction.reportWebviewUri);
  assert.ok(
    reportAction.reportStatus === 'blocked-runtime'
  );
  assert.equal(reportAction.runtimeExecutionState, 'not-available');
  assert.equal(reportAction.generatedReportExists, false);
  assert.ok(await fs.readFile(reportAction.packetFilePath ?? '', 'utf8'));
  const reportMetadata = JSON.parse(await fs.readFile(reportAction.metadataFilePath ?? '', 'utf8')) as {
    reportStatus?: string;
    runtimeExecutionState?: string;
    runtimeExecution?: { reportExists?: boolean; failureReason?: string };
    runtimeSelection?: { provider?: string; blockedReason?: string; engine?: string };
  };
  assert.equal(reportMetadata.reportStatus, reportAction.reportStatus);
  assert.equal(reportMetadata.runtimeExecutionState, reportAction.runtimeExecutionState);
  assert.ok(reportMetadata.runtimeSelection);
  assert.ok(reportMetadata.runtimeSelection?.provider);
  assert.equal(reportMetadata.reportStatus, 'blocked-runtime');
  assert.equal(reportMetadata.runtimeExecutionState, 'not-available');
  assert.equal(reportMetadata.runtimeSelection?.provider, 'unavailable');
  assert.ok(reportMetadata.runtimeSelection?.blockedReason);
  assert.equal(reportMetadata.runtimeExecution?.reportExists, false);
  assert.equal(api.getPanelActionCount(), 6);

  await api.dispatchLastPanelMessage({
    command: 'diffPrevious',
    hash: selectedCommit.hash
  });
  const retainedDiffAction = api.getLastPanelActionSummary();
  assert.ok(retainedDiffAction);
  assert.equal(retainedDiffAction.command, 'diffPrevious');
  assert.equal(retainedDiffAction.hash, selectedCommit.hash);
  assert.equal(retainedDiffAction.outcome, 'opened-comparison-report');
  assert.match(retainedDiffAction.title ?? '', /^VI Comparison Report:/);
  assert.match(retainedDiffAction.packetFilePath ?? '', /report-packet\.html$/);
  assert.match(retainedDiffAction.metadataFilePath ?? '', /report-metadata\.json$/);
  assert.ok(retainedDiffAction.reportWebviewUri);
  assert.equal(api.getPanelActionCount(), 7);

  await api.dispatchLastPanelMessage({
    command: 'createDecisionRecord'
  });
  const decisionRecordAction = api.getLastPanelActionSummary();
  assert.ok(decisionRecordAction);
  assert.equal(decisionRecordAction.command, 'createDecisionRecord');
  assert.equal(decisionRecordAction.outcome, 'created-decision-record');
  assert.equal(decisionRecordAction.scenarioId, 'SCENARIO-VHS-001');
  assert.match(decisionRecordAction.decisionRecordJsonPath ?? '', /decision-record\.json$/);
  assert.match(decisionRecordAction.decisionRecordMarkdownPath ?? '', /decision-record\.md$/);
  const decisionRecordMarkdown = await fs.readFile(
    decisionRecordAction.decisionRecordMarkdownPath ?? '',
    'utf8'
  );
  assert.match(decisionRecordMarkdown, /# Review Decision Record/);
  assert.match(decisionRecordMarkdown, /Scenario ID: SCENARIO-VHS-001/);
  assert.match(
    decisionRecordMarkdown,
    /Repository URL: https:\/\/github\.com\/ni\/labview-icon-editor\.git/
  );
  assert.match(
    decisionRecordMarkdown,
    /VI path: Tooling\/deployment\/VIP_Pre-Install Custom Action\.vi/
  );
  assert.equal(api.getPanelActionCount(), 8);

  await api.dispatchLastPanelMessage({
    command: 'openDashboard'
  });
  const dashboardAction = api.getLastPanelActionSummary();
  assert.ok(dashboardAction);
  assert.equal(dashboardAction.command, 'openDashboard');
  assert.equal(dashboardAction.outcome, 'opened-review-dashboard');
  assert.equal(dashboardAction.dashboardPairCount, 2);
  assert.equal(dashboardAction.dashboardArchivedPairCount, 2);
  assert.equal(dashboardAction.dashboardMissingPairCount, 0);
  assert.ok(dashboardAction.dashboardFilePath);
  assert.ok(dashboardAction.dashboardJsonFilePath);
  const dashboardHtml = await fs.readFile(dashboardAction.dashboardFilePath ?? '', 'utf8');
  assert.match(dashboardHtml, /data-testid="dashboard-chronology-order"/);
  assert.match(dashboardHtml, /data-testid="dashboard-metadata-summary"/);
  assert.match(dashboardHtml, /data-testid="dashboard-metadata-fields"/);
  assert.match(dashboardHtml, /data-testid="dashboard-pair-ledger-summary"/);
  assert.match(dashboardHtml, /data-testid="dashboard-pair-ledger"/);
  assert.match(
    dashboardHtml,
    /No retained VI Comparison Report metadata is currently available for this pair\./
  );
  const openedDashboard = api.getLastOpenedDashboardPanel();
  assert.ok(openedDashboard);
  assert.equal(openedDashboard.dashboardPairCount, 2);
  assert.equal(openedDashboard.dashboardArchivedPairCount, 2);
  assert.equal(openedDashboard.dashboardMissingPairCount, 0);
  assert.match(openedDashboard.renderedHtml, /data-testid="dashboard-review-lens"/);
  assert.match(openedDashboard.renderedHtml, /data-testid="dashboard-pair-ledger"/);
  assert.match(openedDashboard.renderedHtml, /data-testid="dashboard-entry-provenance"/);
  assert.equal(api.getOpenDashboardPanelCount(), 1);

  const dashboardRecord = JSON.parse(
    await fs.readFile(dashboardAction.dashboardJsonFilePath ?? '', 'utf8')
  ) as DashboardRecord;
  const archivedEntry = dashboardRecord.entries.find(
    (entry) => Array.isArray(entry.artifactLinks) && entry.artifactLinks.length > 0
  );
  assert.ok(archivedEntry);
  const packetArtifact = archivedEntry.artifactLinks?.find((artifact) => artifact.kind === 'packet-html');
  const metadataArtifact = archivedEntry.artifactLinks?.find(
    (artifact) => artifact.kind === 'metadata-json'
  );
  assert.ok(packetArtifact);
  assert.ok(metadataArtifact);

  await api.dispatchLastDashboardPanelMessage({
    command: 'openDashboardArtifact',
    kind: packetArtifact.kind,
    label: packetArtifact.label,
    filePath: packetArtifact.filePath
  });
  const packetArtifactAction = api.getLastDashboardArtifactActionSummary();
  assert.ok(packetArtifactAction);
  assert.equal(packetArtifactAction.command, 'openDashboardArtifact');
  assert.equal(packetArtifactAction.outcome, 'opened-artifact-panel');
  assert.equal(packetArtifactAction.kind, 'packet-html');
  assert.equal(packetArtifactAction.filePath, packetArtifact.filePath);
  assert.ok(packetArtifactAction.openedUri);

  await api.dispatchLastDashboardPanelMessage({
    command: 'openDashboardArtifact',
    kind: metadataArtifact.kind,
    label: metadataArtifact.label,
    filePath: metadataArtifact.filePath
  });
  const metadataArtifactAction = api.getLastDashboardArtifactActionSummary();
  assert.ok(metadataArtifactAction);
  assert.equal(metadataArtifactAction.command, 'openDashboardArtifact');
  assert.equal(metadataArtifactAction.outcome, 'opened-artifact-editor');
  assert.equal(metadataArtifactAction.kind, 'metadata-json');
  assert.equal(metadataArtifactAction.filePath, metadataArtifact.filePath);
  assert.equal(api.getDashboardArtifactActionCount(), 2);

  await api.dispatchLastPanelMessage({
    command: 'openDashboard'
  });
  const refreshedDashboardAction = api.getLastPanelActionSummary();
  assert.ok(refreshedDashboardAction);
  assert.equal(refreshedDashboardAction.command, 'openDashboard');
  assert.equal(refreshedDashboardAction.outcome, 'opened-review-dashboard');
  assert.equal(api.getOpenDashboardPanelCount(), 2);
  assert.equal(api.getPanelActionCount(), 10);
}

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs: number,
  details?: () => string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const suffix = details ? `\n${details()}` : '';
  throw new Error(`Timed out after ${timeoutMs}ms${suffix}`);
}

async function readClipboardBestEffort(): Promise<string> {
  try {
    return await vscode.env.clipboard.readText();
  } catch {
    return '';
  }
}
