import * as path from 'node:path';

import { GitHistoryEntry, getFileHistoryEntries } from '../git/gitCli';
import {
  CompareViRevisionsResult,
  CompareViRevisionsRuntimeRequest,
  compareViRevisions
} from './compareViRevisions';
import { ViChangeSurface } from './viSemanticModel';

/**
 * Stable, versioned identifier for the VI semantic history model. Consumers key
 * off this string so the representation can evolve without breaking agents.
 */
export const VI_SEMANTIC_HISTORY_SCHEMA = 'vi-history-suite/vi-semantic-history@v1';

export interface ViSemanticHistoryInput {
  /** Absolute path to the Git repository containing the VI. */
  repositoryRoot: string;
  /** Repository-relative path of the `.vi` whose history to walk. */
  relativePath: string;
  /**
   * How many of the VI's most recent revisions to walk. Each adjacent pair is a
   * comparison, so N revisions yields N-1 runs. Bounded to keep container cost
   * predictable. Defaults to 3 (two comparisons).
   */
  maxRevisions?: number;
  runtime?: CompareViRevisionsRuntimeRequest;
}

export interface ViSemanticHistoryStep {
  baseHash: string;
  selectedHash: string;
  /** Author metadata of the newer (selected) revision in the transition. */
  authorDate: string;
  authorName: string;
  subject: string;
  status: CompareViRevisionsResult['status'];
  hasDifferences: boolean;
  changedSurfaces: ViChangeSurface[];
  narrative: string;
  /** Present only when the step did not complete. */
  reason?: string;
}

export interface ViSemanticHistoryTotals {
  changingStepCount: number;
  frontPanelChangeCount: number;
  blockDiagramChangeCount: number;
  connectorPaneChangeCount: number;
  viAttributeChangeCount: number;
  blockedOrFailedStepCount: number;
}

export interface ViSemanticHistory {
  schema: typeof VI_SEMANTIC_HISTORY_SCHEMA;
  vi: { relativePath: string; title?: string };
  repositoryRoot: string;
  revisionCount: number;
  comparedStepCount: number;
  /** Transitions ordered newest-first (steps[0] is the most recent change). */
  steps: ViSemanticHistoryStep[];
  totals: ViSemanticHistoryTotals;
  narrative: string;
}

export interface ViSemanticHistoryDeps {
  getFileHistoryEntries?: typeof getFileHistoryEntries;
  compareViRevisions?: typeof compareViRevisions;
}

const DEFAULT_MAX_REVISIONS = 3;
const MAX_REVISIONS_CEILING = 20;

function validateTarget(input: ViSemanticHistoryInput): {
  repositoryRoot: string;
  relativePath: string;
} {
  const repositoryRoot = (input.repositoryRoot ?? '').trim();
  if (!repositoryRoot) {
    throw new Error('repositoryRoot is required');
  }
  const relativePath = (input.relativePath ?? '').trim();
  if (!relativePath) {
    throw new Error('relativePath is required');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('relativePath must be repository-relative, not absolute');
  }
  const repoResolved = path.resolve(repositoryRoot);
  const targetResolved = path.resolve(repoResolved, relativePath);
  if (targetResolved !== repoResolved && !targetResolved.startsWith(repoResolved + path.sep)) {
    throw new Error('relativePath escapes the repository root');
  }
  return { repositoryRoot: repoResolved, relativePath };
}

/**
 * Walks a VI's most recent revisions and invokes the comparison engine across
 * each adjacent pair, projecting the transitions onto a semantic evolution
 * timeline. One blocked or failed comparison is recorded as a step rather than
 * aborting the whole history. Heavy: each step is a full comparison run.
 */
export async function buildViSemanticHistory(
  input: ViSemanticHistoryInput,
  deps: ViSemanticHistoryDeps = {}
): Promise<ViSemanticHistory> {
  const target = validateTarget(input);
  const requested = input.maxRevisions ?? DEFAULT_MAX_REVISIONS;
  const maxRevisions = Math.max(
    2,
    Math.min(MAX_REVISIONS_CEILING, Math.floor(Number.isFinite(requested) ? requested : DEFAULT_MAX_REVISIONS))
  );

  const listHistory = deps.getFileHistoryEntries ?? getFileHistoryEntries;
  const compare = deps.compareViRevisions ?? compareViRevisions;

  // Newest-first; entries[i] is newer than entries[i + 1].
  const entries = await listHistory(target.repositoryRoot, target.relativePath, maxRevisions);

  const steps: ViSemanticHistoryStep[] = [];
  let title: string | undefined;
  for (let i = 0; i < entries.length - 1; i += 1) {
    const newer = entries[i];
    const older = entries[i + 1];
    const result = await compare({
      repositoryRoot: target.repositoryRoot,
      relativePath: target.relativePath,
      baseHash: older.hash,
      selectedHash: newer.hash,
      runtime: input.runtime
    });
    steps.push(toStep(newer, older, result));
    if (result.status === 'completed' && title === undefined) {
      title = result.model.vi.title;
    }
  }

  const totals = summarizeTotals(steps);
  const history: Omit<ViSemanticHistory, 'narrative'> = {
    schema: VI_SEMANTIC_HISTORY_SCHEMA,
    vi: { relativePath: target.relativePath, title },
    repositoryRoot: target.repositoryRoot,
    revisionCount: entries.length,
    comparedStepCount: steps.length,
    steps,
    totals
  };
  return { ...history, narrative: renderHistoryNarrative(history) };
}

function toStep(
  newer: GitHistoryEntry,
  older: GitHistoryEntry,
  result: CompareViRevisionsResult
): ViSemanticHistoryStep {
  const base = {
    baseHash: older.hash,
    selectedHash: newer.hash,
    authorDate: newer.authorDate,
    authorName: newer.authorName,
    subject: newer.subject
  };
  if (result.status === 'completed') {
    return {
      ...base,
      baseHash: result.model.revisions?.baseHash ?? older.hash,
      status: 'completed',
      hasDifferences: result.hasDifferences,
      changedSurfaces: result.model.changedSurfaces,
      narrative: result.model.narrative
    };
  }
  return {
    ...base,
    status: result.status,
    hasDifferences: false,
    changedSurfaces: [],
    narrative: `Comparison ${result.status}: ${result.reason}`,
    reason: result.reason
  };
}

function summarizeTotals(steps: ViSemanticHistoryStep[]): ViSemanticHistoryTotals {
  const totals: ViSemanticHistoryTotals = {
    changingStepCount: 0,
    frontPanelChangeCount: 0,
    blockDiagramChangeCount: 0,
    connectorPaneChangeCount: 0,
    viAttributeChangeCount: 0,
    blockedOrFailedStepCount: 0
  };
  for (const step of steps) {
    if (step.status !== 'completed') {
      totals.blockedOrFailedStepCount += 1;
      continue;
    }
    if (step.hasDifferences) {
      totals.changingStepCount += 1;
    }
    for (const surface of step.changedSurfaces) {
      if (surface === 'front-panel') {
        totals.frontPanelChangeCount += 1;
      } else if (surface === 'block-diagram') {
        totals.blockDiagramChangeCount += 1;
      } else if (surface === 'connector-pane') {
        totals.connectorPaneChangeCount += 1;
      } else if (surface === 'vi-attributes') {
        totals.viAttributeChangeCount += 1;
      }
    }
  }
  return totals;
}

function renderHistoryNarrative(history: Omit<ViSemanticHistory, 'narrative'>): string {
  const name = history.vi.title ?? history.vi.relativePath;
  if (history.comparedStepCount === 0) {
    return history.revisionCount <= 1
      ? `${name} has no comparable revision history.`
      : `No comparisons were produced for ${name}.`;
  }

  const totals = history.totals;
  const parts: string[] = [];
  parts.push(
    `Across ${history.comparedStepCount} compared revision${
      history.comparedStepCount === 1 ? '' : 's'
    } of ${name}, ${totals.changingStepCount} changed the VI.`
  );

  const surfaceCounts: string[] = [];
  if (totals.frontPanelChangeCount > 0) {
    surfaceCounts.push(`front panel (${totals.frontPanelChangeCount})`);
  }
  if (totals.blockDiagramChangeCount > 0) {
    surfaceCounts.push(`block diagram (${totals.blockDiagramChangeCount})`);
  }
  if (totals.connectorPaneChangeCount > 0) {
    surfaceCounts.push(`connector pane (${totals.connectorPaneChangeCount})`);
  }
  if (totals.viAttributeChangeCount > 0) {
    surfaceCounts.push(`VI attributes (${totals.viAttributeChangeCount})`);
  }
  if (surfaceCounts.length > 0) {
    parts.push(`Surfaces changed: ${surfaceCounts.join(', ')}.`);
  }

  const latest = history.steps.find(
    (step) => step.status === 'completed' && step.hasDifferences
  );
  if (latest) {
    parts.push(`Most recent change (${latest.authorName}, "${latest.subject}"): ${latest.narrative}`);
  }

  if (totals.blockedOrFailedStepCount > 0) {
    parts.push(
      `${totals.blockedOrFailedStepCount} comparison${
        totals.blockedOrFailedStepCount === 1 ? '' : 's'
      } could not be completed.`
    );
  }

  return parts.join(' ');
}
