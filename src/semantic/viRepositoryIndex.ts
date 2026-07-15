import * as path from 'node:path';

import {
  getFileHistoryCount,
  getFileHistoryEntries,
  listTrackedFiles
} from '../git/gitCli';

/**
 * Stable, versioned identifier for the repository VI index model. Consumers key
 * off this string so the representation can evolve without breaking agents.
 */
export const VI_REPOSITORY_INDEX_SCHEMA = 'vi-history-suite/vi-repository-index@v1';

export interface ViRepositoryIndexInput {
  /** Absolute path to the Git repository to survey. */
  repositoryRoot: string;
  /** Cap on how many VIs to detail (activity-ranked). Default 100, ceiling 500. */
  maxVis?: number;
}

export interface ViRepositoryIndexCommit {
  hash: string;
  authorDate: string;
  authorName: string;
  subject: string;
}

export interface ViRepositoryIndexEntry {
  relativePath: string;
  revisionCount: number;
  latestCommit?: ViRepositoryIndexCommit;
}

export interface ViRepositoryIndex {
  schema: typeof VI_REPOSITORY_INDEX_SCHEMA;
  repositoryRoot: string;
  /** Total tracked VIs found (before the maxVis cap). */
  viCount: number;
  /** Number detailed in `vis` (after the cap). */
  indexedCount: number;
  /** Activity-ranked: most-revised first, then path. */
  vis: ViRepositoryIndexEntry[];
  narrative: string;
}

export interface ViRepositoryIndexDeps {
  listTrackedFiles?: typeof listTrackedFiles;
  getFileHistoryCount?: typeof getFileHistoryCount;
  getFileHistoryEntries?: typeof getFileHistoryEntries;
}

const DEFAULT_MAX_VIS = 100;
const MAX_VIS_CEILING = 500;

/**
 * Surveys a repository's tracked VIs and reports each one's revision activity and
 * latest change, giving an agent a repo-level view to navigate before drilling
 * into `compare_vi_revisions` or `summarize_vi_history`. Pure git; no LabVIEW
 * runtime is involved.
 */
export async function buildViRepositoryIndex(
  input: ViRepositoryIndexInput,
  deps: ViRepositoryIndexDeps = {}
): Promise<ViRepositoryIndex> {
  const repositoryRoot = (input.repositoryRoot ?? '').trim();
  if (!repositoryRoot) {
    throw new Error('repositoryRoot is required');
  }
  const resolvedRoot = path.resolve(repositoryRoot);
  const requested = input.maxVis ?? DEFAULT_MAX_VIS;
  const maxVis = Math.max(
    1,
    Math.min(MAX_VIS_CEILING, Math.floor(Number.isFinite(requested) ? requested : DEFAULT_MAX_VIS))
  );

  const listFiles = deps.listTrackedFiles ?? listTrackedFiles;
  const countHistory = deps.getFileHistoryCount ?? getFileHistoryCount;
  const listHistory = deps.getFileHistoryEntries ?? getFileHistoryEntries;

  const tracked = await listFiles(resolvedRoot);
  const viPaths = tracked.filter((relativePath) => relativePath.toLowerCase().endsWith('.vi'));
  const viCount = viPaths.length;
  const selected = viPaths.slice(0, maxVis);

  const vis: ViRepositoryIndexEntry[] = [];
  for (const relativePath of selected) {
    const revisionCount = await countHistory(resolvedRoot, relativePath);
    const latest = await listHistory(resolvedRoot, relativePath, 1);
    const entry: ViRepositoryIndexEntry = { relativePath, revisionCount };
    if (latest[0]) {
      entry.latestCommit = {
        hash: latest[0].hash,
        authorDate: latest[0].authorDate,
        authorName: latest[0].authorName,
        subject: latest[0].subject
      };
    }
    vis.push(entry);
  }

  vis.sort(
    (a, b) => b.revisionCount - a.revisionCount || a.relativePath.localeCompare(b.relativePath)
  );

  const index: Omit<ViRepositoryIndex, 'narrative'> = {
    schema: VI_REPOSITORY_INDEX_SCHEMA,
    repositoryRoot: resolvedRoot,
    viCount,
    indexedCount: vis.length,
    vis
  };
  return { ...index, narrative: renderIndexNarrative(index) };
}

function renderIndexNarrative(index: Omit<ViRepositoryIndex, 'narrative'>): string {
  if (index.viCount === 0) {
    return `No tracked VIs were found in ${index.repositoryRoot}.`;
  }

  const parts: string[] = [
    `Repository tracks ${index.viCount} VI${index.viCount === 1 ? '' : 's'}${
      index.indexedCount < index.viCount ? ` (showing ${index.indexedCount})` : ''
    }.`
  ];

  const mostRevised = index.vis[0];
  if (mostRevised && mostRevised.revisionCount > 0) {
    parts.push(
      `Most revised: ${mostRevised.relativePath} (${mostRevised.revisionCount} revision${
        mostRevised.revisionCount === 1 ? '' : 's'
      }).`
    );
  }

  const mostRecent = index.vis
    .filter((entry) => entry.latestCommit !== undefined)
    .sort(
      (a, b) =>
        authorDateEpoch(b.latestCommit?.authorDate) - authorDateEpoch(a.latestCommit?.authorDate)
    )[0];
  if (mostRecent?.latestCommit) {
    parts.push(
      `Most recently changed: ${mostRecent.relativePath} ("${mostRecent.latestCommit.subject}", ${mostRecent.latestCommit.authorName}).`
    );
  }

  return parts.join(' ');
}

/**
 * Parses a git `%aI` (strict ISO 8601 with timezone offset) author date to an
 * epoch millisecond value for chronological ordering. A lexicographic string
 * compare misorders two commits made on the same calendar day in different
 * timezone offsets (e.g. `...T09:00:00-08:00` is later than `...T12:00:00+02:00`
 * in real time but sorts earlier as a string). Unparseable dates sort oldest.
 */
function authorDateEpoch(authorDate: string | undefined): number {
  if (!authorDate) {
    return Number.NEGATIVE_INFINITY;
  }
  const epoch = Date.parse(authorDate);
  return Number.isNaN(epoch) ? Number.NEGATIVE_INFINITY : epoch;
}
