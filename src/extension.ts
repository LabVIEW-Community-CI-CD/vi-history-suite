import * as vscode from 'vscode';

import { createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { getBuiltInGitApi } from './git/gitApi';
import { ViEligibilityIndexer } from './indexing/viEligibilityIndexer';
import { ViHistoryService } from './services/viHistoryService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const gitApi = await getBuiltInGitApi();
  const eligibilityIndexer = new ViEligibilityIndexer(gitApi);
  const historyService = new ViHistoryService(gitApi);

  context.subscriptions.push(eligibilityIndexer);

  await vscode.commands.executeCommand(
    'setContext',
    'viHistorySuite.isWorkspaceTrusted',
    vscode.workspace.isTrusted
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'viHistorySuite.openViHistory',
      createOpenViHistoryCommand(historyService, eligibilityIndexer, gitApi)
    )
  );

  await eligibilityIndexer.start();
}

export function deactivate(): void {
  // Nothing to do yet.
}

