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
  assert.equal(history.commits.length, 2);

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
  await vscode.commands.executeCommand('viHistorySuite.openViHistory', eligibleUri);

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
  assert.match(panel.renderedHtml, /data-testid="history-compare-base"/);
  assert.match(panel.renderedHtml, /data-testid="history-compare-pair"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-open"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-diff"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-copy"/);
  assert.match(panel.renderedHtml, /data-testid="history-action-copy-review-packet"/);
  assert.match(panel.renderedHtml, /Eligible/);
  assert.match(panel.renderedHtml, /LVIN/);
  assert.match(panel.renderedHtml, /Newest commit first/);
  assert.match(panel.renderedHtml, /Binary review limits:/);
  assert.match(panel.renderedHtml, /Reviewer guidance:/);
  assert.match(panel.renderedHtml, /Confidence and scope:/);
  assert.match(panel.renderedHtml, /Local Git history, tracked-file status, and content-detected VI signature checks\./);
  assert.match(panel.renderedHtml, /Direct local evidence for chronology, path provenance, retained hashes, and command routing\./);
  assert.match(panel.renderedHtml, /Needs external comparison tooling:/);
  assert.match(panel.renderedHtml, /Binary semantic differences, visual or cosmetic change detection, and NI comparison-report output\./);
  assert.match(panel.renderedHtml, /Selected:<\/strong> <code>[0-9a-f]{8}<\/code> <strong>vs base:<\/strong> <code>[0-9a-f]{8}<\/code>/);
  assert.match(panel.renderedHtml, /fixtures\/eligible-content-detected\.bin/);
  assert.match(panel.renderedHtml, /Update eligible fixture/);
  assert.match(panel.renderedHtml, /Add initial integration fixtures/);

  const history = await api.loadHistory(eligibleUri);
  const selectedCommit = history.commits[0];
  assert.ok(selectedCommit);
  assert.ok(selectedCommit.previousHash);

  await api.dispatchLastPanelMessage({
    command: 'copyReviewPacket'
  });
  const copiedReviewPacket = await vscode.env.clipboard.readText();
  assert.match(copiedReviewPacket, /VI History Review Packet/);
  assert.match(copiedReviewPacket, /Repository: vihs-integration-/);
  assert.match(copiedReviewPacket, /Path: fixtures\/eligible-content-detected\.bin/);
  assert.match(copiedReviewPacket, /Confidence and scope:/);
  assert.match(copiedReviewPacket, /Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and NI comparison-report output\./);
  assert.match(copiedReviewPacket, /- [0-9a-f]{8} vs [0-9a-f]{8} :: Update eligible fixture/);
  const copiedReviewAction = api.getLastPanelActionSummary();
  assert.ok(copiedReviewAction);
  assert.equal(copiedReviewAction.command, 'copyReviewPacket');
  assert.equal(copiedReviewAction.outcome, 'copied-review-packet');
  assert.equal(copiedReviewAction.copiedTextLength, copiedReviewPacket.length);

  await api.dispatchLastPanelMessage({
    command: 'copyHash',
    hash: selectedCommit.hash
  });
  assert.equal(await vscode.env.clipboard.readText(), selectedCommit.hash);
  assert.deepEqual(api.getLastPanelActionSummary(), {
    command: 'copyHash',
    hash: selectedCommit.hash,
    outcome: 'copied-hash',
    copiedHash: selectedCommit.hash
  });

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
  assert.equal(diffAction.outcome, 'diffed-previous');
  assert.match(diffAction.leftUri ?? '', /^git:/);
  assert.match(diffAction.rightUri ?? '', /^git:/);
  assert.match(
    diffAction.title ?? '',
    /^eligible-content-detected\.bin \([0-9a-f]{8}\.\.[0-9a-f]{8}\)$/
  );
  assert.equal(api.getPanelActionCount(), 4);
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
