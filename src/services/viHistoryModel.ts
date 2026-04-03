import * as path from 'node:path';

import { detectViSignatureFromFsPath } from '../domain/viFile';
import { ViSignature } from '../domain/viMagicCore';
import {
  getFileCommitHashes,
  getFileHistoryEntries,
  getRepoRoot,
  GitHistoryEntry,
  normalizeRelativeGitPath
} from '../git/gitCli';

export interface ViHistoryCommit extends GitHistoryEntry {
  previousHash?: string;
  retainedComparisonEvidenceAvailable?: boolean;
}

export interface ViHistoryViewModel {
  repositoryName: string;
  repositoryRoot: string;
  relativePath: string;
  signature: ViSignature | 'unknown';
  eligible: boolean;
  commits: ViHistoryCommit[];
}

export interface ViHistoryModelOptions {
  repoRoot?: string;
  strictRsrcHeader?: boolean;
  historyLimit?: number;
}

export interface ViEligibilitySnapshot {
  repositoryRoot: string;
  relativePath: string;
  signature: ViSignature | 'unknown';
  commitHashes: string[];
  eligible: boolean;
}

export async function evaluateViEligibilityForFsPath(
  fsPath: string,
  options: ViHistoryModelOptions = {}
): Promise<ViEligibilitySnapshot> {
  const repositoryRoot = options.repoRoot ?? (await getRepoRoot(path.dirname(fsPath)));
  const relativePath = normalizeRelativeGitPath(path.relative(repositoryRoot, fsPath));
  const signature =
    (await detectViSignatureFromFsPath(fsPath, {
      strictRsrcHeader: options.strictRsrcHeader ?? false
    })) ?? 'unknown';
  const commitHashes = await getFileCommitHashes(repositoryRoot, relativePath, 2);

  return {
    repositoryRoot,
    relativePath,
    signature,
    commitHashes,
    eligible: signature !== 'unknown' && commitHashes.length >= 2
  };
}

export async function loadViHistoryViewModelFromFsPath(
  fsPath: string,
  options: ViHistoryModelOptions = {}
): Promise<ViHistoryViewModel> {
  const repositoryRoot = options.repoRoot ?? (await getRepoRoot(path.dirname(fsPath)));
  const relativePath = normalizeRelativeGitPath(path.relative(repositoryRoot, fsPath));
  const historyLimit = options.historyLimit ?? 100;
  const eligibility = await evaluateViEligibilityForFsPath(fsPath, {
    repoRoot: repositoryRoot,
    strictRsrcHeader: options.strictRsrcHeader
  });
  const commits = await getFileHistoryEntries(repositoryRoot, relativePath, historyLimit);

  return {
    repositoryName: path.basename(repositoryRoot),
    repositoryRoot,
    relativePath,
    signature: eligibility.signature,
    eligible: eligibility.eligible,
    commits: commits.map((commit, index) => ({
      ...commit,
      previousHash: commits[index + 1]?.hash
    }))
  };
}
