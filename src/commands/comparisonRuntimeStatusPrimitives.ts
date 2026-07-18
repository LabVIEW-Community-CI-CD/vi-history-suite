import { isWorktreeRevision, WORKTREE_REVISION_SENTINEL } from '../git/gitCli';
import type { ComparisonReportActionResult } from '../reporting/comparisonReportAction';
import type { ViHistoryViewModel } from '../services/viHistoryModel';

export function deriveComparisonRuntimePanelStatus(
  result: ComparisonReportActionResult
): 'idle' | 'blocked' | 'failed' | 'succeeded' | 'cancelled' {
  if (result.outcome === 'cancelled') {
    return 'cancelled';
  }

  if (isComparisonRuntimeBlocked(result)) {
    return 'blocked';
  }

  if (result.runtimeExecutionState === 'failed') {
    return 'failed';
  }

  if (result.runtimeExecutionState === 'succeeded') {
    return 'succeeded';
  }

  return 'idle';
}

export function isComparisonRuntimeBlocked(result: ComparisonReportActionResult): boolean {
  return (
    result.reportStatus === 'blocked-preflight' ||
    result.reportStatus === 'blocked-runtime' ||
    result.runtimeExecutionState === 'not-available'
  );
}

export function deriveComparisonRuntimeProgressStatus(
  message: string
): 'running' | 'acquiring' | undefined {
  if (
    message.startsWith('Acquiring container image ') ||
    message.startsWith('Pulling container image:') ||
    message.startsWith('Container image ready:')
  ) {
    return 'acquiring';
  }

  if (
    message === 'Selecting comparison-report runtime.' ||
    message === 'Persisting comparison-report packet.' ||
    message === 'Executing LabVIEW comparison-report runtime.' ||
    message === 'Archiving comparison-report evidence.'
  ) {
    return 'running';
  }

  return undefined;
}

export function deriveComparisonCommandLabel(actionCommand: string): string {
  if (actionCommand === 'diffPrevious') {
    return 'Open compare';
  }
  if (actionCommand === 'generateComparisonReportFromSelection') {
    return 'Selected compare';
  }
  return 'Generate compare';
}

export function resolveExplicitComparisonPair(
  model: ViHistoryViewModel,
  selectedHashes: string[]
): { selectedHash: string; baseHash: string } | undefined {
  const uniqueHashes = [...new Set(selectedHashes)];
  if (uniqueHashes.length !== 2) {
    return undefined;
  }

  // VHS-REQ-641: the working-tree sentinel is not a committed revision, so it is
  // not present in model.commits. When exactly one selected entry is the
  // working-tree row, pair the uncommitted on-disk version (selected/newer side)
  // against the other checked commit (base/older side).
  const worktreeHashes = uniqueHashes.filter((candidateHash) => isWorktreeRevision(candidateHash));
  if (worktreeHashes.length === 1) {
    const baseHash = uniqueHashes.find((candidateHash) => !isWorktreeRevision(candidateHash));
    if (!baseHash || model.commits.findIndex((commit) => commit.hash === baseHash) < 0) {
      return undefined;
    }
    return {
      selectedHash: WORKTREE_REVISION_SENTINEL,
      baseHash
    };
  }

  const rankedCommits = uniqueHashes
    .map((candidateHash) => ({
      hash: candidateHash,
      index: model.commits.findIndex((commit) => commit.hash === candidateHash)
    }))
    .filter((candidate) => candidate.index >= 0)
    .sort((left, right) => left.index - right.index);

  if (rankedCommits.length !== 2) {
    return undefined;
  }

  return {
    selectedHash: rankedCommits[0].hash,
    baseHash: rankedCommits[1].hash
  };
}

export function stripTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/u, '');
}
