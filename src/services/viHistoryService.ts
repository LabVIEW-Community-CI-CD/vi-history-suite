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
  const comparableUriFsPath = normalizeComparableFsPath(uriFsPath);
  return repositories
    .filter((repository) => {
      const comparableRepoRoot = normalizeComparableFsPath(repository.rootUri.fsPath);
      return (
        comparableUriFsPath === comparableRepoRoot ||
        comparableUriFsPath.startsWith(`${comparableRepoRoot}/`)
      );
    })
    .sort(
      (left, right) =>
        normalizeComparableFsPath(right.rootUri.fsPath).length -
        normalizeComparableFsPath(left.rootUri.fsPath).length
    )[0]
    ?.rootUri.fsPath;
}

function normalizeComparableFsPath(fsPath: string): string {
  const slashNormalized = fsPath.replaceAll('\\', '/').replace(/\/+$/u, '');
  const comparablePath = slashNormalized.length > 0 ? slashNormalized : '/';
  return process.platform === 'win32' ? comparablePath.toLowerCase() : comparablePath;
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
