import * as path from 'node:path';
import * as vscode from 'vscode';

import { detectViSignatureFromUri } from '../domain/viMagic';
import { ViSignature } from '../domain/viMagicCore';
import { GitApi } from '../git/gitApi';
import {
  getFileHistoryEntries,
  getRepoRoot,
  GitHistoryEntry,
  normalizeRelativeGitPath
} from '../git/gitCli';

export interface ViHistoryCommit extends GitHistoryEntry {
  previousHash?: string;
}

export interface ViHistoryViewModel {
  repositoryName: string;
  repositoryRoot: string;
  relativePath: string;
  signature: ViSignature | 'unknown';
  eligible: boolean;
  commits: ViHistoryCommit[];
}

export class ViHistoryService {
  constructor(private readonly gitApi: GitApi | undefined) {}

  async load(uri: vscode.Uri): Promise<ViHistoryViewModel> {
    const repositoryRoot = await this.resolveRepositoryRoot(uri);
    const relativePath = normalizeRelativeGitPath(path.relative(repositoryRoot, uri.fsPath));
    const historyLimit = vscode.workspace
      .getConfiguration('viHistorySuite')
      .get<number>('maxHistoryEntries', 100);

    const signature =
      (await detectViSignatureFromUri(uri, {
        strictRsrcHeader: vscode.workspace
          .getConfiguration('viHistorySuite')
          .get<boolean>('strictRsrcHeader', false)
      })) ?? 'unknown';

    const commits = await getFileHistoryEntries(repositoryRoot, relativePath, historyLimit);

    return {
      repositoryName: path.basename(repositoryRoot),
      repositoryRoot,
      relativePath,
      signature,
      eligible: commits.length >= 2 && signature !== 'unknown',
      commits: commits.map((commit, index) => ({
        ...commit,
        previousHash: commits[index + 1]?.hash
      }))
    };
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
