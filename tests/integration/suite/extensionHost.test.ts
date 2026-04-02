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
