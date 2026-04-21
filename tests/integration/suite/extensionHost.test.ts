import * as assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
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

interface PreparedLocalRuntimeSettingsCliSummary {
  outcome: 'prepared-local-runtime-settings-cli' | 'missing-global-storage-uri';
  defaultSettingsFilePath?: string;
  javascriptLauncherPath?: string;
  windowsLauncherPath?: string;
  posixLauncherPath?: string;
  windowsTerminalEntrypointPath?: string;
  posixTerminalEntrypointPath?: string;
  currentPlatformLauncherPath?: string;
  currentPlatformTerminalEntrypointPath?: string;
  terminalCommandName?: string;
  pathPrependValue?: string;
  rootDirectoryPath?: string;
  nextCommand?: string;
  exampleCommand?: string;
  supportedSettingsTargets?: readonly string[];
  untrustedWorkspacePosture?: string;
}

interface PreparedLocalRuntimeSettingsCliExecutionOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

interface RuntimeSettingsLiveSessionProbeSummary {
  outcome: 'probed-runtime-settings-live-session';
  settingsFilePath?: string;
  persistedProvider?: string;
  persistedLabviewVersion?: string;
  persistedLabviewBitness?: string;
  baselinePersistedProvider?: string;
  baselinePersistedLabviewVersion?: string;
  baselinePersistedLabviewBitness?: string;
  liveProvider?: string;
  liveLabviewVersion?: string;
  liveLabviewBitness?: string;
  providerDrift: boolean;
  versionDrift: boolean;
  bitnessDrift: boolean;
  driftDetected: boolean;
  liveUptakeObservation: 'in-session-updated' | 'reload-required';
  mutationProviderTarget?: string;
  safeRestoreApplied: boolean;
  safeRestoreVerified: boolean;
  runtimeValidationOutcome?: 'ready' | 'blocked';
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimeBlockedReason?: string;
  packetRunId: string;
  packetJsonPath: string;
  packetMarkdownPath: string;
  latestPacketJsonPath: string;
  latestPacketMarkdownPath: string;
  historyTotalRuns: number;
  historyReloadRequiredCount: number;
  historyInSessionUpdatedCount: number;
  historyUnknownObservationCount: number;
  historyStance:
    | 'live-uptake-not-proven'
    | 'candidate-live-uptake-observed'
    | 'insufficient-evidence';
  historyProofStatus: 'not-fully-proven' | 're-evaluation-required';
}

const execFile = promisify(execFileCallback);
const WINDOWS_X64_LABVIEW_EXE_PATH =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_X86_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';

export async function runIntegrationSuite(): Promise<void> {
  const metadata = await loadMetadata();
  const api = await loadExtensionApi();

  await api.refreshEligibility();
  await testEligibleVersusIneligibleFlow(api, metadata);
  await testAdmittedLocalRuntimeSettingsTerminalEntrypoint(api);
  await testPrepareLocalRuntimeSettingsCli();
  await testProbeRuntimeSettingsLiveSession();
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
  assert.match(
    panel.renderedHtml,
    /Direct local evidence for chronology, path provenance, retained hashes, and explicit selected\/base compare preflight facts\./
  );
  assert.match(
    panel.renderedHtml,
    /pairwise compare actions use retained LabVIEW comparison-report evidence and installed tooling instead of plain text diff\./
  );
  assert.match(panel.renderedHtml, /Needs external comparison tooling:/);
  assert.match(panel.renderedHtml, /Binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output\./);
  assert.match(panel.renderedHtml, /Adjacent:<\/strong> <code>[0-9a-f]{8}<\/code> <strong>vs prior:<\/strong> <code>[0-9a-f]{8}<\/code>/);
  assert.match(panel.renderedHtml, /Tooling\/deployment\/VIP_Pre-Install Custom Action\.vi/);
  assert.match(panel.renderedHtml, /Update eligible fixture/);
  assert.match(panel.renderedHtml, /Add initial integration fixtures/);
  assert.match(panel.renderedHtml, /Add third eligible fixture revision/);
  assert.match(panel.renderedHtml, /select exactly two retained revisions, then review the compare preflight section before choosing/);
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
  assert.ok(reportAction.reportStatus === 'blocked-runtime' || reportAction.reportStatus === 'ready-for-runtime');
  assert.ok(
    reportAction.runtimeExecutionState === 'not-available' ||
      reportAction.runtimeExecutionState === 'failed'
  );
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
  if (reportMetadata.reportStatus === 'blocked-runtime') {
    assert.equal(reportMetadata.runtimeExecutionState, 'not-available');
    assert.equal(reportMetadata.runtimeSelection?.provider, 'unavailable');
    assert.ok(reportMetadata.runtimeSelection?.blockedReason);
  } else {
    assert.equal(reportMetadata.reportStatus, 'ready-for-runtime');
    assert.equal(reportMetadata.runtimeExecutionState, 'failed');
    assert.notEqual(reportMetadata.runtimeSelection?.provider, 'unavailable');
    assert.ok(reportMetadata.runtimeExecution?.failureReason);
  }
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

async function testPrepareLocalRuntimeSettingsCli(): Promise<void> {
  const result = (await vscode.commands.executeCommand(
    'labviewViHistory.prepareLocalRuntimeSettingsCli'
  )) as PreparedLocalRuntimeSettingsCliSummary;

  assert.ok(result);
  assert.equal(result.outcome, 'prepared-local-runtime-settings-cli');
  assert.ok(result.rootDirectoryPath);
  assert.ok(result.javascriptLauncherPath);
  assert.ok(result.windowsLauncherPath);
  assert.ok(result.posixLauncherPath);
  assert.ok(result.windowsTerminalEntrypointPath);
  assert.ok(result.posixTerminalEntrypointPath);
  assert.ok(result.currentPlatformLauncherPath);
  assert.ok(result.currentPlatformTerminalEntrypointPath);
  assert.ok(result.defaultSettingsFilePath);
  assert.ok(result.nextCommand);
  assert.ok(result.exampleCommand);
  assert.equal(result.terminalCommandName, 'vihs');
  assert.ok(result.pathPrependValue);
  assert.deepEqual(result.supportedSettingsTargets, [
    'default-user-settings',
    'explicit-settings-file'
  ]);
  assert.equal(result.untrustedWorkspacePosture, 'prepare-command-admitted-compare-blocked');

  await fs.access(result.javascriptLauncherPath!);
  await fs.access(result.windowsLauncherPath!);
  await fs.access(result.posixLauncherPath!);
  await fs.access(result.windowsTerminalEntrypointPath!);
  await fs.access(result.posixTerminalEntrypointPath!);
  assert.equal(result.exampleCommand, result.nextCommand);
  assert.match(
    result.nextCommand!,
    /^vihs --provider host --labview-version 2026 --labview-bitness x64$/
  );
  if (process.platform === 'win32') {
    assert.equal(result.currentPlatformLauncherPath, result.windowsLauncherPath);
    assert.equal(
      result.currentPlatformTerminalEntrypointPath,
      result.windowsTerminalEntrypointPath
    );
  } else {
    assert.equal(result.currentPlatformLauncherPath, result.posixLauncherPath);
    assert.equal(
      result.currentPlatformTerminalEntrypointPath,
      result.posixTerminalEntrypointPath
    );
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-runtime-settings-cli-'));
  try {
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const arbitraryWorkingDirectory = path.join(tempRoot, 'arbitrary-repo-shell');
    await fs.mkdir(arbitraryWorkingDirectory, { recursive: true });
    await fs.writeFile(
      settingsFilePath,
      `${JSON.stringify({ 'editor.tabSize': 2 }, null, 2)}\n`,
      'utf8'
    );

    const hostRun = await runPreparedLocalRuntimeSettingsCli(result, [
      '--provider',
      'host',
      '--labview-version',
      '2026',
      '--labview-bitness',
      'x64',
      '--settings-file',
      settingsFilePath
    ], {
      cwd: arbitraryWorkingDirectory
    });
    if (process.platform === 'win32') {
      assert.equal(hostRun.launcherPath, result.windowsLauncherPath);
    } else {
      assert.equal(hostRun.launcherPath, result.posixLauncherPath);
    }
    assert.match(hostRun.stdout, /settingsTarget=explicit-settings-file/);
    assert.match(
      hostRun.stdout,
      new RegExp(`settingsFilePath=${settingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    );
    assert.match(hostRun.stdout, /viHistorySuite\.runtimeProvider=host/);
    assert.match(hostRun.stdout, /viHistorySuite\.labviewVersion=2026/);
    assert.match(hostRun.stdout, /viHistorySuite\.labviewBitness=x64/);
    assert.deepEqual(JSON.parse(await fs.readFile(settingsFilePath, 'utf8')), {
      'editor.tabSize': 2,
      'viHistorySuite.runtimeProvider': 'host',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });

    if (
      process.platform === 'win32' &&
      (await pathExists(WINDOWS_X64_LABVIEW_EXE_PATH)) &&
      (await pathExists(WINDOWS_X86_LABVIEW_CLI_PATH))
    ) {
      const hostValidationRun = await runPreparedLocalRuntimeSettingsCli(result, [
        '--validate',
        '--settings-file',
        settingsFilePath
      ]);
      assert.equal(hostValidationRun.launcherPath, result.windowsLauncherPath);
      assert.match(
        hostValidationRun.stdout,
        new RegExp(settingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
      assert.match(hostValidationRun.stdout, /settingsTarget=explicit-settings-file/);
      assert.match(hostValidationRun.stdout, /viHistorySuite\.runtimeProvider=host/);
      assert.match(hostValidationRun.stdout, /viHistorySuite\.labviewVersion=2026/);
      assert.match(hostValidationRun.stdout, /viHistorySuite\.labviewBitness=x64/);
      assert.match(hostValidationRun.stdout, /runtimeValidationOutcome=ready/);
      assert.match(hostValidationRun.stdout, /runtimeProvider=host-native/);
      assert.match(hostValidationRun.stdout, /runtimeEngine=labview-cli/);
      assert.match(hostValidationRun.stdout, /runtimeBlockedReason=<none>/);
    }

    const dockerRun = await runPreparedLocalRuntimeSettingsCli(result, [
      '--provider',
      'docker',
      '--labview-version',
      '2026',
      '--labview-bitness',
      'x64',
      '--settings-file',
      settingsFilePath
    ]);
    if (process.platform === 'win32') {
      assert.equal(dockerRun.launcherPath, result.windowsLauncherPath);
    } else {
      assert.equal(dockerRun.launcherPath, result.posixLauncherPath);
    }
    assert.match(dockerRun.stdout, /viHistorySuite\.runtimeProvider=docker/);
    assert.match(dockerRun.stdout, /settingsTarget=explicit-settings-file/);
    assert.deepEqual(JSON.parse(await fs.readFile(settingsFilePath, 'utf8')), {
      'editor.tabSize': 2,
      'viHistorySuite.runtimeProvider': 'docker',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });

    if (process.platform === 'win32') {
      const dockerValidationRun = await runPreparedLocalRuntimeSettingsCli(result, [
        '--validate',
        '--settings-file',
        settingsFilePath
      ]);
      assert.equal(dockerValidationRun.launcherPath, result.windowsLauncherPath);
      assert.match(
        dockerValidationRun.stdout,
        new RegExp(settingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
      assert.match(dockerValidationRun.stdout, /settingsTarget=explicit-settings-file/);
      assert.match(dockerValidationRun.stdout, /viHistorySuite\.runtimeProvider=docker/);
      assert.match(dockerValidationRun.stdout, /viHistorySuite\.labviewVersion=2026/);
      assert.match(dockerValidationRun.stdout, /viHistorySuite\.labviewBitness=x64/);
      assert.match(dockerValidationRun.stdout, /runtimeValidationOutcome=ready/);
      assert.match(dockerValidationRun.stdout, /runtimeProvider=windows-container/);
      assert.match(dockerValidationRun.stdout, /runtimeEngine=labview-cli/);
      assert.match(dockerValidationRun.stdout, /runtimeBlockedReason=<none>/);
    }

    const invalidSettingsFilePath = path.join(tempRoot, 'invalid-settings.json');
    await fs.writeFile(
      invalidSettingsFilePath,
      JSON.stringify(
        {
          'viHistorySuite.runtimeProvider': 'mystery',
          'viHistorySuite.labviewVersion': '2026',
          'viHistorySuite.labviewBitness': 'x64'
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const validationRun = await runPreparedLocalRuntimeSettingsCli(result, [
      '--validate',
      '--settings-file',
      invalidSettingsFilePath
    ]);
    if (process.platform === 'win32') {
      assert.equal(validationRun.launcherPath, result.windowsLauncherPath);
    } else {
      assert.equal(validationRun.launcherPath, result.posixLauncherPath);
    }
    assert.match(
      validationRun.stdout,
      new RegExp(invalidSettingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    assert.match(validationRun.stdout, /settingsTarget=explicit-settings-file/);
    assert.match(validationRun.stdout, /viHistorySuite\.runtimeProvider=mystery/);
    assert.match(validationRun.stdout, /viHistorySuite\.labviewVersion=2026/);
    assert.match(validationRun.stdout, /viHistorySuite\.labviewBitness=x64/);
    assert.match(validationRun.stdout, /runtimeValidationOutcome=blocked/);
    assert.match(validationRun.stdout, /runtimeProvider=unavailable/);
    assert.match(validationRun.stdout, /runtimeEngine=<none>/);
    assert.match(validationRun.stdout, /runtimeBlockedReason=installed-provider-invalid/);

    if (process.platform === 'win32') {
      const activeAppDataRoot = process.env.APPDATA;
      assert.ok(activeAppDataRoot, 'Windows integration host must expose APPDATA.');
      const defaultSettingsFilePath = path.join(activeAppDataRoot, 'Code', 'User', 'settings.json');
      assert.equal(result.defaultSettingsFilePath, defaultSettingsFilePath);
      const initialRuntimeSettings = readViHistorySuiteRuntimeSettings();
      const firstProvider = initialRuntimeSettings.runtimeProvider === 'host' ? 'docker' : 'host';
      const secondProvider = firstProvider === 'host' ? 'docker' : 'host';
      const defaultTargetRun = await runPreparedLocalRuntimeSettingsCli(
        result,
        ['--provider', firstProvider, '--labview-version', '2026', '--labview-bitness', 'x64']
      );
      assert.equal(defaultTargetRun.launcherPath, result.windowsLauncherPath);
      assert.match(
        defaultTargetRun.stdout,
        new RegExp(defaultSettingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
      assert.match(defaultTargetRun.stdout, /settingsTarget=default-user-settings/);
      assert.match(
        defaultTargetRun.stdout,
        new RegExp(`viHistorySuite\\.runtimeProvider=${firstProvider}`)
      );
      assertRuntimeSettingsFileContains(
        JSON.parse(await fs.readFile(defaultSettingsFilePath, 'utf8')) as Record<string, unknown>,
        {
          runtimeProvider: firstProvider,
          labviewVersion: '2026',
          labviewBitness: 'x64'
        }
      );

      const activeDockerRun = await runPreparedLocalRuntimeSettingsCli(result, [
        '--provider',
        secondProvider,
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64'
      ]);
      assert.equal(activeDockerRun.launcherPath, result.windowsLauncherPath);
      assert.match(
        activeDockerRun.stdout,
        new RegExp(defaultSettingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
      assert.match(activeDockerRun.stdout, /settingsTarget=default-user-settings/);
      assert.match(
        activeDockerRun.stdout,
        new RegExp(`viHistorySuite\\.runtimeProvider=${secondProvider}`)
      );
      assertRuntimeSettingsFileContains(
        JSON.parse(await fs.readFile(defaultSettingsFilePath, 'utf8')) as Record<string, unknown>,
        {
          runtimeProvider: secondProvider,
          labviewVersion: '2026',
          labviewBitness: 'x64'
        }
      );
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function testAdmittedLocalRuntimeSettingsTerminalEntrypoint(
  api: ViHistorySuiteApi
): Promise<void> {
  const admitted = api.getLocalRuntimeSettingsTerminalEntrypoint();
  assert.ok(admitted, 'extension activation should admit the bare vihs terminal entrypoint');
  assert.equal(admitted.terminalCommandName, 'vihs');
  assert.ok(admitted.pathPrependValue);
  assert.ok(admitted.currentPlatformTerminalEntrypointPath);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-terminal-entrypoint-'));
  try {
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const arbitraryWorkingDirectory = path.join(tempRoot, 'arbitrary-repo-shell');
    await fs.mkdir(arbitraryWorkingDirectory, { recursive: true });
    await fs.writeFile(
      settingsFilePath,
      `${JSON.stringify({ 'editor.tabSize': 2 }, null, 2)}\n`,
      'utf8'
    );

    const discoveryRun = await runAdmittedLocalRuntimeSettingsCli(admitted, [], {
      cwd: arbitraryWorkingDirectory
    });
    assert.match(discoveryRun.stdout, /vihs --provider host --labview-version 2026 --labview-bitness x64/);
    assert.match(discoveryRun.stdout, /vihs --validate/);

    const hostRun = await runAdmittedLocalRuntimeSettingsCli(
      admitted,
      [
        '--provider',
        'host',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64',
        '--settings-file',
        settingsFilePath
      ],
      {
        cwd: arbitraryWorkingDirectory
      }
    );
    assert.equal(hostRun.launcherPath, 'vihs');
    assert.match(hostRun.stdout, /settingsTarget=explicit-settings-file/);
    assert.match(hostRun.stdout, /viHistorySuite\.runtimeProvider=host/);
    assert.deepEqual(JSON.parse(await fs.readFile(settingsFilePath, 'utf8')), {
      'editor.tabSize': 2,
      'viHistorySuite.runtimeProvider': 'host',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function testProbeRuntimeSettingsLiveSession(): Promise<void> {
  const prepared = (await vscode.commands.executeCommand(
    'labviewViHistory.prepareLocalRuntimeSettingsCli'
  )) as PreparedLocalRuntimeSettingsCliSummary;
  assert.ok(prepared.defaultSettingsFilePath);

  const settingsFilePath = prepared.defaultSettingsFilePath!;
  const initialRuntimeSettings = readViHistorySuiteRuntimeSettings();
  const firstBaselineProvider =
    initialRuntimeSettings.runtimeProvider === 'docker' ? 'docker' : 'host';
  const secondBaselineProvider = firstBaselineProvider === 'docker' ? 'host' : 'docker';

  const firstSummary = await runAndAssertRuntimeSettingsLiveSessionProbe(
    prepared,
    settingsFilePath,
    firstBaselineProvider
  );
  const secondSummary = await runAndAssertRuntimeSettingsLiveSessionProbe(
    prepared,
    settingsFilePath,
    secondBaselineProvider
  );

  assert.equal(firstSummary.historyTotalRuns, 1);
  assert.equal(secondSummary.historyTotalRuns, 2);
  assert.equal(secondSummary.historyUnknownObservationCount, 0);
  assert.equal(
    secondSummary.historyReloadRequiredCount + secondSummary.historyInSessionUpdatedCount,
    2
  );
  assert.equal(
    secondSummary.historyStance,
    secondSummary.historyReloadRequiredCount > 0
      ? 'live-uptake-not-proven'
      : 'candidate-live-uptake-observed'
  );
  assert.equal(
    secondSummary.historyProofStatus,
    secondSummary.historyReloadRequiredCount > 0 ? 'not-fully-proven' : 're-evaluation-required'
  );
  await maybeWriteRuntimeSettingsLiveSessionProofOutput(secondSummary);
}

async function runAndAssertRuntimeSettingsLiveSessionProbe(
  prepared: PreparedLocalRuntimeSettingsCliSummary,
  settingsFilePath: string,
  baselineProvider: 'host' | 'docker'
): Promise<RuntimeSettingsLiveSessionProbeSummary> {
  const seededBaseline = await runPreparedLocalRuntimeSettingsCli(prepared, [
    '--provider',
    baselineProvider,
    '--labview-version',
    '2026',
    '--labview-bitness',
    'x64'
  ]);
  if (process.platform === 'win32') {
    assert.equal(seededBaseline.launcherPath, prepared.windowsLauncherPath);
  } else {
    assert.equal(seededBaseline.launcherPath, prepared.posixLauncherPath);
  }
  assert.match(
    seededBaseline.stdout,
    new RegExp(settingsFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    seededBaseline.stdout,
    new RegExp(`viHistorySuite\\.runtimeProvider=${baselineProvider}`)
  );
  assert.match(seededBaseline.stdout, /viHistorySuite\.labviewVersion=2026/);
  assert.match(seededBaseline.stdout, /viHistorySuite\.labviewBitness=x64/);

  let baselineSettingsText: string | undefined;
  try {
    baselineSettingsText = await fs.readFile(settingsFilePath, 'utf8');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw error;
    }
  }

  const summary = (await vscode.commands.executeCommand(
    'labviewViHistory.probeRuntimeSettingsLiveSession'
  )) as RuntimeSettingsLiveSessionProbeSummary;

  assert.ok(summary);
  assert.equal(summary.outcome, 'probed-runtime-settings-live-session');
  assert.equal(typeof summary.providerDrift, 'boolean');
  assert.equal(typeof summary.versionDrift, 'boolean');
  assert.equal(typeof summary.bitnessDrift, 'boolean');
  assert.equal(typeof summary.driftDetected, 'boolean');
  assert.ok(
    summary.liveUptakeObservation === 'in-session-updated' ||
      summary.liveUptakeObservation === 'reload-required'
  );
  assert.equal(summary.safeRestoreApplied, true);
  assert.equal(summary.safeRestoreVerified, true);
  assert.ok(summary.mutationProviderTarget === 'host' || summary.mutationProviderTarget === 'docker');
  assert.ok(summary.baselinePersistedProvider === 'host' || summary.baselinePersistedProvider === 'docker');
  assert.equal(summary.baselinePersistedProvider, baselineProvider);
  assert.equal(summary.persistedProvider, summary.mutationProviderTarget);
  assert.notEqual(summary.baselinePersistedProvider, summary.persistedProvider);
  assert.equal(
    summary.liveUptakeObservation,
    summary.driftDetected ? 'reload-required' : 'in-session-updated'
  );
  assert.ok(summary.packetRunId);
  assert.ok(summary.packetJsonPath);
  assert.ok(summary.packetMarkdownPath);
  assert.ok(summary.latestPacketJsonPath);
  assert.ok(summary.latestPacketMarkdownPath);
  assert.ok(summary.historyTotalRuns >= 1);
  assert.ok(summary.historyReloadRequiredCount >= 0);
  assert.ok(summary.historyInSessionUpdatedCount >= 0);
  assert.ok(summary.historyUnknownObservationCount >= 0);
  assert.ok(
    summary.historyStance === 'live-uptake-not-proven' ||
      summary.historyStance === 'candidate-live-uptake-observed' ||
      summary.historyStance === 'insufficient-evidence'
  );
  assert.ok(
    summary.historyTotalRuns >=
      summary.historyReloadRequiredCount +
        summary.historyInSessionUpdatedCount +
        summary.historyUnknownObservationCount
  );
  const expectedHistoryStance =
    summary.historyReloadRequiredCount > 0
      ? 'live-uptake-not-proven'
      : summary.historyInSessionUpdatedCount > 0 && summary.historyUnknownObservationCount === 0
        ? 'candidate-live-uptake-observed'
        : 'insufficient-evidence';
  assert.equal(summary.historyStance, expectedHistoryStance);
  await fs.access(summary.packetJsonPath);
  await fs.access(summary.packetMarkdownPath);
  await fs.access(summary.latestPacketJsonPath);
  await fs.access(summary.latestPacketMarkdownPath);

  let restoredSettingsText: string | undefined;
  try {
    restoredSettingsText = await fs.readFile(settingsFilePath, 'utf8');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw error;
    }
  }
  assert.equal(restoredSettingsText, baselineSettingsText);
  return summary;
}

async function runPreparedLocalRuntimeSettingsCli(
  result: PreparedLocalRuntimeSettingsCliSummary,
  args: string[],
  options: PreparedLocalRuntimeSettingsCliExecutionOptions = {}
): Promise<{ stdout: string; stderr: string; launcherPath: string }> {
  if (process.platform === 'win32') {
    const execution = await execFile(
      'cmd.exe',
      ['/d', '/s', '/c', result.windowsLauncherPath!, ...args],
      {
        encoding: 'utf8',
        env: options.env,
        cwd: options.cwd
      }
    );
    return {
      ...execution,
      launcherPath: result.windowsLauncherPath!
    };
  }

  const execution = await execFile(result.posixLauncherPath!, args, {
    encoding: 'utf8',
    env: options.env,
    cwd: options.cwd
  });
  return {
    ...execution,
    launcherPath: result.posixLauncherPath!
  };
}

async function runAdmittedLocalRuntimeSettingsCli(
  result: {
    pathPrependValue?: string;
  },
  args: string[],
  options: PreparedLocalRuntimeSettingsCliExecutionOptions = {}
): Promise<{ stdout: string; stderr: string; launcherPath: string }> {
  const env = {
    ...process.env,
    ...options.env,
    PATH: `${result.pathPrependValue ?? ''}${options.env?.PATH ?? process.env.PATH ?? ''}`
  };

  if (process.platform === 'win32') {
    const execution = await execFile('cmd.exe', ['/d', '/s', '/c', 'vihs', ...args], {
      encoding: 'utf8',
      env,
      cwd: options.cwd
    });
    return {
      ...execution,
      launcherPath: 'vihs'
    };
  }

  const commandLine = ['vihs', ...args.map(quotePosixShellArg)].join(' ');
  const execution = await execFile('sh', ['-lc', commandLine], {
    encoding: 'utf8',
    env,
    cwd: options.cwd
  });
  return {
    ...execution,
    launcherPath: 'vihs'
  };
}

async function maybeWriteRuntimeSettingsLiveSessionProofOutput(
  summary: RuntimeSettingsLiveSessionProbeSummary
): Promise<void> {
  const outputDirectory = (
    process.env.VI_HISTORY_SUITE_RUNTIME_SETTINGS_LIVE_SESSION_PROOF_OUTPUT_DIR ?? ''
  ).trim();
  if (!outputDirectory) {
    return;
  }

  const packetRoot = path.dirname(summary.latestPacketJsonPath);
  const retainedPacketRoot = path.join(outputDirectory, 'packet-root');
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.cp(packetRoot, retainedPacketRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputDirectory, 'probe-command-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
}

function readViHistorySuiteRuntimeSettings(): {
  runtimeProvider: string | undefined;
  labviewVersion: string | undefined;
  labviewBitness: string | undefined;
} {
  const configuration = vscode.workspace.getConfiguration('viHistorySuite');
  return {
    runtimeProvider: configuration.get<string>('runtimeProvider'),
    labviewVersion: configuration.get<string>('labviewVersion'),
    labviewBitness: configuration.get<string>('labviewBitness')
  };
}

function assertRuntimeSettingsFileContains(
  settings: Record<string, unknown>,
  expected: {
    runtimeProvider: string;
    labviewVersion: string;
    labviewBitness: string;
  }
): void {
  assert.equal(settings['viHistorySuite.runtimeProvider'], expected.runtimeProvider);
  assert.equal(settings['viHistorySuite.labviewVersion'], expected.labviewVersion);
  assert.equal(settings['viHistorySuite.labviewBitness'], expected.labviewBitness);
}

function quotePosixShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
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
