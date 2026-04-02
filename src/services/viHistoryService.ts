import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi } from '../git/gitApi';
import { getRepoRoot } from '../git/gitCli';
import {
  loadViHistoryViewModelFromFsPath,
  ViHistoryViewModel
} from './viHistoryModel';

export class ViHistoryService {
  constructor(private readonly gitApi: GitApi | undefined) {}

  async load(uri: vscode.Uri): Promise<ViHistoryViewModel> {
    return loadViHistoryViewModelFromFsPath(uri.fsPath, {
      repoRoot: await this.resolveRepositoryRoot(uri),
      strictRsrcHeader: vscode.workspace
        .getConfiguration('viHistorySuite')
        .get<boolean>('strictRsrcHeader', false),
      historyLimit: vscode.workspace
        .getConfiguration('viHistorySuite')
        .get<number>('maxHistoryEntries', 100)
    });
  }

  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri | undefined {
    return this.gitApi?.toGitUri(uri, ref);
  }

  private async resolveRepositoryRoot(uri: vscode.Uri): Promise<string> {
    if (this.gitApi) {
      const matchingRepository = this.gitApi.repositories.find((repository) =>
        uri.fsPath.startsWith(repository.rootUri.fsPath)
      );
      if (matchingRepository) {
        return matchingRepository.rootUri.fsPath;
      }
    }

    return getRepoRoot(path.dirname(uri.fsPath));
  }
}
