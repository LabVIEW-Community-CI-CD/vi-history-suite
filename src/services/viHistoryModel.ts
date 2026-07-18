import * as path from 'node:path';

import { detectViSignatureFromFsPath } from '../domain/viFile';
import { ViSignature } from '../domain/viMagicCore';
import {
  getFileCommitHashes,
  getFileHistoryCount,
  getFileHistoryEntries,
  getRepoRemoteUrl,
  getRepoRoot,
  GitHistoryEntry,
  isFileDirtyInWorkingTree,
  normalizeRelativeGitPath
} from '../git/gitCli';
import { classifyRepositorySupportPolicy, RepositorySupportPolicy } from '../support/repositorySupportPolicy';

export type ViHistoryRepositorySupport = RepositorySupportPolicy;

export interface ViHistoryCommit extends GitHistoryEntry {
  previousHash?: string;
  retainedComparisonEvidenceAvailable?: boolean;
}

export interface ViHistorySurfaceCapabilities {
  comparisonGenerationAvailable?: boolean;
  retainedComparisonOpenAvailable?: boolean;
  dashboardAvailable?: boolean;
  decisionRecordAvailable?: boolean;
  documentationAvailable?: boolean;
  benchmarkStatusAvailable?: boolean;
}

export type ViHistoryWindowMode = 'auto' | 'capped';

export type ViHistoryWindowDecision =
  | 'auto-full-history'
  | 'auto-truncated-to-ceiling'
  | 'auto-fallback-unknown-total'
  | 'capped-full-history'
  | 'capped-truncated-to-max'
  | 'capped-fallback-unknown-total';

export interface ViHistoryWindow {
  mode: ViHistoryWindowMode;
  configuredMaxEntries: number;
  effectiveEntryCeiling: number;
  loadedCommitCount: number;
  totalCommitCount?: number;
  truncated: boolean;
  decision: ViHistoryWindowDecision;
}

export interface ViHistoryViewModel {
  repositoryName: string;
  repositoryRoot: string;
  repositoryUrl?: string;
  relativePath: string;
  signature: ViSignature | 'unknown';
  eligible: boolean;
  commits: ViHistoryCommit[];
  historyWindow?: ViHistoryWindow;
  repositorySupport?: RepositorySupportPolicy;
  surfaceCapabilities?: ViHistorySurfaceCapabilities;
  /**
   * VHS-REQ-641: present when the tracked VI has uncommitted working-tree
   * changes, enabling a working-tree-vs-HEAD comparison even when fewer than two
   * commits exist.
   */
  workingTree?: ViHistoryWorkingTreeState;
}

/**
 * VHS-REQ-641: uncommitted working-tree state for the selected VI. `headHash` is
 * the commit the on-disk file would be compared against in the
 * working-tree-vs-HEAD MVP.
 */
export interface ViHistoryWorkingTreeState {
  hasUncommittedChanges: boolean;
  headHash?: string;
}

export interface ViHistoryModelOptions {
  repoRoot?: string;
  strictRsrcHeader?: boolean;
  historyLimit?: number;
  configuredMaxHistoryEntries?: number;
  historyWindowMode?: ViHistoryWindowMode;
}

export interface ViEligibilitySnapshot {
  repositoryRoot: string;
  relativePath: string;
  signature: ViSignature | 'unknown';
  commitHashes: string[];
  eligible: boolean;
  /** VHS-REQ-641: the tracked VI has uncommitted working-tree changes. */
  hasUncommittedChanges: boolean;
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
  // VHS-REQ-641: detect uncommitted working-tree changes for any tracked VI with
  // at least one commit so a working-tree-vs-HEAD comparison is offered even when
  // the file already has full history (the common "edit a committed VI" case).
  // The scoped `git status --porcelain` is cheap relative to the history queries
  // the panel already runs. Skipped only for unrecognized files or a file with no
  // commit to compare against.
  let hasUncommittedChanges = false;
  if (signature !== 'unknown' && commitHashes.length >= 1) {
    hasUncommittedChanges = await isFileDirtyInWorkingTree(repositoryRoot, relativePath);
  }

  return {
    repositoryRoot,
    relativePath,
    signature,
    commitHashes,
    hasUncommittedChanges,
    eligible:
      signature !== 'unknown' &&
      (commitHashes.length >= 2 || (commitHashes.length >= 1 && hasUncommittedChanges))
  };
}

export async function loadViHistoryViewModelFromFsPath(
  fsPath: string,
  options: ViHistoryModelOptions = {}
): Promise<ViHistoryViewModel> {
  const repositoryRoot = options.repoRoot ?? (await getRepoRoot(path.dirname(fsPath)));
  const repositoryUrl = await getRepoRemoteUrl(repositoryRoot);
  const relativePath = normalizeRelativeGitPath(path.relative(repositoryRoot, fsPath));
  const historyWindowMode = options.historyWindowMode ?? 'auto';
  const effectiveEntryCeiling = Math.max(2, options.historyLimit ?? 100);
  const configuredMaxEntries = Math.max(
    2,
    options.configuredMaxHistoryEntries ?? effectiveEntryCeiling
  );
  const eligibility = await evaluateViEligibilityForFsPath(fsPath, {
    repoRoot: repositoryRoot,
    strictRsrcHeader: options.strictRsrcHeader
  });
  let totalCommitCount: number | undefined;
  try {
    totalCommitCount = await getFileHistoryCount(repositoryRoot, relativePath);
  } catch {
    totalCommitCount = undefined;
  }

  const commits =
    totalCommitCount === 0
      ? []
      : await getFileHistoryEntries(
          repositoryRoot,
          relativePath,
          totalCommitCount === undefined
            ? effectiveEntryCeiling
            : Math.min(effectiveEntryCeiling, totalCommitCount)
        );
  const truncated =
    totalCommitCount === undefined ? false : commits.length < totalCommitCount;
  const historyWindow: ViHistoryWindow = {
    mode: historyWindowMode,
    configuredMaxEntries,
    effectiveEntryCeiling,
    loadedCommitCount: commits.length,
    totalCommitCount,
    truncated,
    decision:
      totalCommitCount === undefined
        ? historyWindowMode === 'auto'
          ? 'auto-fallback-unknown-total'
          : 'capped-fallback-unknown-total'
        : historyWindowMode === 'auto'
          ? truncated
            ? 'auto-truncated-to-ceiling'
            : 'auto-full-history'
          : truncated
            ? 'capped-truncated-to-max'
            : 'capped-full-history'
  };

  return {
    repositoryName: path.basename(repositoryRoot),
    repositoryRoot,
    repositoryUrl,
    relativePath,
    signature: eligibility.signature,
    eligible: eligibility.eligible,
    commits: commits.map((commit, index) => ({
      ...commit,
      previousHash: commits[index + 1]?.hash
    })),
    historyWindow,
    repositorySupport: classifyRepositorySupportPolicy(
      repositoryUrl,
      path.basename(repositoryRoot)
    ),
    // VHS-REQ-641: surface uncommitted working-tree state so the panel can offer
    // a working-tree-vs-HEAD comparison. headHash is the newest retained commit.
    ...(eligibility.hasUncommittedChanges
      ? {
          workingTree: {
            hasUncommittedChanges: true,
            headHash: commits[0]?.hash
          }
        }
      : {})
  };
}
