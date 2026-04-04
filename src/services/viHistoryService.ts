import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi } from '../git/gitApi';
import { getRepoRoot } from '../git/gitCli';
import {
  loadViHistoryViewModelFromFsPath,
  ViHistoryViewModel,
  ViHistoryWindowMode
} from './viHistoryModel';

export const DEFAULT_MAX_HISTORY_ENTRIES = 100;
export const AUTO_HISTORY_ENTRY_CEILING = 1000;

export interface ViHistoryServiceSettings {
  strictRsrcHeader: boolean;
  historyWindowMode: ViHistoryWindowMode;
  maxHistoryEntries: number;
  historyLimit: number;
}

export function getViHistoryServiceSettings(): ViHistoryServiceSettings {
  const configuration = vscode.workspace.getConfiguration('viHistorySuite');
  const historyWindowMode = configuration.get<ViHistoryWindowMode>('historyWindowMode', 'auto');
  const maxHistoryEntries = Math.max(
    2,
    configuration.get<number>('maxHistoryEntries', DEFAULT_MAX_HISTORY_ENTRIES)
  );
  return {
    strictRsrcHeader: configuration.get<boolean>('strictRsrcHeader', false),
    historyWindowMode,
    maxHistoryEntries,
    historyLimit:
      historyWindowMode === 'capped' ? maxHistoryEntries : AUTO_HISTORY_ENTRY_CEILING
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
      historyLimit: settings.historyLimit,
      configuredMaxHistoryEntries: settings.maxHistoryEntries,
      historyWindowMode: settings.historyWindowMode
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
