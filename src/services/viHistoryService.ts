import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi } from '../git/gitApi';
import { getRepoRoot } from '../git/gitCli';
import {
  loadViHistoryViewModelFromFsPath,
  ViHistoryViewModel
} from './viHistoryModel';

export interface ViHistoryServiceSettings {
  strictRsrcHeader: boolean;
  historyLimit: number;
}

export function getViHistoryServiceSettings(): ViHistoryServiceSettings {
  const configuration = vscode.workspace.getConfiguration('viHistorySuite');
  return {
    strictRsrcHeader: configuration.get<boolean>('strictRsrcHeader', false),
    historyLimit: configuration.get<number>('maxHistoryEntries', 100)
  };
}

export function selectMostSpecificGitRepositoryRoot(
  uriFsPath: string,
  repositories: GitApi['repositories']
): string | undefined {
  return repositories
    .filter((repository) => uriFsPath.startsWith(repository.rootUri.fsPath))
    .sort((left, right) => right.rootUri.fsPath.length - left.rootUri.fsPath.length)[0]
    ?.rootUri.fsPath;
}

export class ViHistoryService {
  constructor(private readonly gitApi: GitApi | undefined) {}

  async load(uri: vscode.Uri): Promise<ViHistoryViewModel> {
    const settings = getViHistoryServiceSettings();

    return loadViHistoryViewModelFromFsPath(uri.fsPath, {
      repoRoot: await this.resolveRepositoryRoot(uri),
      strictRsrcHeader: settings.strictRsrcHeader,
      historyLimit: settings.historyLimit
    });
  }

  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri | undefined {
    return this.gitApi?.toGitUri(uri, ref);
  }

  private async resolveRepositoryRoot(uri: vscode.Uri): Promise<string> {
    if (this.gitApi) {
      const repositoryRoot = selectMostSpecificGitRepositoryRoot(
        uri.fsPath,
        this.gitApi.repositories
      );
      if (repositoryRoot) {
        return repositoryRoot;
      }
    }

    return getRepoRoot(path.dirname(uri.fsPath));
  }
}
