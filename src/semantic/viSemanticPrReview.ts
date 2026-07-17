import { runGit } from '../git/gitCli';
import {
  compareViRevisions,
  type CompareViRevisionsResult,
  type CompareViRevisionsRuntimeRequest
} from './compareViRevisions';
import type { ViSemanticComparisonModel } from './viSemanticModel';
import { requireRepositoryRoot } from './repositoryTarget';

// The PR-review Markdown renderer and its sticky-comment marker live in the
// dependency-free renderer leaf so the MCP handler can render a review without
// importing this orchestration module (which pulls in git + the comparison
// engine). Re-exported here so the review's builder and renderer remain a
// single import for CLI and test callers.
export {
  renderViSemanticPrReviewMarkdown,
  renderViSemanticPrReviewPendingMarkdown,
  VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
  type ReviewImageRef
} from './viSemanticReviewMarkdown';

/**
 * VI semantic PR review: the headless engine behind an eventual CI review that
 * gives LabVIEW pull requests a real "what changed" diff instead of GitHub's
 * "Binary file not shown". It detects the VIs changed between two revisions,
 * runs a real comparison for each (via the injected {@link compareViRevisions}),
 * and aggregates a versioned, self-describing review model plus a review-ready
 * Markdown rendering. Pure orchestration with a dependency-injected boundary:
 * no process or git access except through the injected collaborators.
 */
export const VI_SEMANTIC_PR_REVIEW_SCHEMA = 'vi-history-suite/vi-semantic-pr-review@v1';

const VI_SOURCE_EXTENSIONS = ['.vi', '.vit', '.vim', '.ctl'];

/** Whether a repository-relative path is a LabVIEW source file the review covers. */
export function isViSourcePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return VI_SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export interface ViSemanticPrReviewInput {
  /** Absolute path to the Git repository. */
  repositoryRoot: string;
  /** Base (older) revision identifier, for example a PR merge base. */
  baseHash: string;
  /** Selected (newer) revision identifier, for example the PR head. */
  selectedHash: string;
  runtime?: CompareViRevisionsRuntimeRequest;
  /** Cap on VIs compared (path-sorted). Default 50, ceiling 200. */
  maxVis?: number;
}

export type ViSemanticPrReviewEntry =
  | {
      relativePath: string;
      status: 'completed';
      hasDifferences: boolean;
      model: ViSemanticComparisonModel;
      /**
       * Path to the self-contained comparison report HTML (with embedded
       * difference images) the comparison produced, when available. Included so
       * a caller can attach the full visual diff to the review artifact.
       */
      reportFilePath?: string;
    }
  | {
      relativePath: string;
      status: 'blocked-selection' | 'blocked-preflight' | 'blocked-runtime' | 'failed';
      reason: string;
    };

export interface ViSemanticPrReview {
  schema: typeof VI_SEMANTIC_PR_REVIEW_SCHEMA;
  repositoryRoot: string;
  baseHash: string;
  selectedHash: string;
  /** Changed VIs found (before the maxVis cap). */
  changedViCount: number;
  /** Number compared (after the cap). */
  reviewedCount: number;
  entries: ViSemanticPrReviewEntry[];
  totals: {
    withDifferences: number;
    withoutDifferences: number;
    blockedOrFailed: number;
  };
  narrative: string;
}

export interface ViSemanticPrReviewDeps {
  /** Lists repository-relative paths changed between the two revisions. */
  listChangedPaths?: (
    repositoryRoot: string,
    baseHash: string,
    selectedHash: string
  ) => Promise<string[]>;
  compareVi?: typeof compareViRevisions;
}

/** A per-VI comparison report to copy alongside a review artifact. */
export interface ReviewReportCopy {
  relativePath: string;
  reportFilePath: string;
  /** Safe file name for the copied report. */
  fileName: string;
}

/**
 * Builds a filesystem-safe, `.html`-suffixed file name for a copied per-VI
 * comparison report, derived from the VI's repository-relative path.
 */
export function reviewReportFileName(relativePath: string): string {
  const safe = relativePath.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safe.length > 0 ? safe : 'report'}.html`;
}

/**
 * Plans the per-VI self-contained comparison reports to copy alongside a review.
 * Each report embeds the rendered block-diagram/front-panel difference images,
 * so copying them into the review artifact gives reviewers the full visual diff,
 * not just the narrative. Only completed entries that produced a report file are
 * included.
 */
export function planReviewReportCopies(review: ViSemanticPrReview): ReviewReportCopy[] {
  const copies: ReviewReportCopy[] = [];
  for (const entry of review.entries) {
    if (
      entry.status === 'completed' &&
      typeof entry.reportFilePath === 'string' &&
      entry.reportFilePath.length > 0
    ) {
      copies.push({
        relativePath: entry.relativePath,
        reportFilePath: entry.reportFilePath,
        fileName: reviewReportFileName(entry.relativePath)
      });
    }
  }
  return copies;
}

const DEFAULT_MAX_VIS = 50;
const MAX_VIS_CEILING = 200;

export function createDefaultListChangedPaths(
  runGitDep: typeof runGit = runGit
): (repositoryRoot: string, baseHash: string, selectedHash: string) => Promise<string[]> {
  return async (repositoryRoot, baseHash, selectedHash) => {
    const stdout = await runGitDep(
      ['diff', '--name-only', baseHash, selectedHash],
      repositoryRoot,
      'utf8'
    );
    return String(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };
}

const defaultListChangedPaths = createDefaultListChangedPaths();

function toEntry(relativePath: string, result: CompareViRevisionsResult): ViSemanticPrReviewEntry {
  if (result.status === 'completed') {
    return {
      relativePath,
      status: 'completed',
      hasDifferences: result.hasDifferences,
      model: result.model,
      reportFilePath: result.runtime.reportFilePath
    };
  }
  return { relativePath, status: result.status, reason: result.reason };
}

function renderPrReviewNarrative(review: Omit<ViSemanticPrReview, 'narrative'>): string {
  if (review.changedViCount === 0) {
    return 'No changed VIs were found between the two revisions.';
  }
  const scope =
    review.reviewedCount < review.changedViCount
      ? ` (reviewed ${review.reviewedCount})`
      : '';
  const notCompared =
    review.totals.blockedOrFailed > 0 ? `, ${review.totals.blockedOrFailed} not compared` : '';
  return (
    `${review.changedViCount} changed VI${review.changedViCount === 1 ? '' : 's'}${scope}. ` +
    `${review.totals.withDifferences} with differences, ${review.totals.withoutDifferences} unchanged${notCompared}.`
  );
}

/**
 * Builds the aggregated PR review by comparing every changed VI between the two
 * revisions. Collaborators default to the real git diff and the real
 * comparison orchestrator, mirroring `compareViRevisions`; both are injectable
 * so the aggregation is unit-testable without a git process or a LabVIEW runtime.
 */
export async function buildViSemanticPrReview(
  input: ViSemanticPrReviewInput,
  deps: ViSemanticPrReviewDeps = {}
): Promise<ViSemanticPrReview> {
  const repositoryRoot = requireRepositoryRoot(input.repositoryRoot);
  const baseHash = (input.baseHash ?? '').trim();
  const selectedHash = (input.selectedHash ?? '').trim();
  if (!baseHash || !selectedHash) {
    throw new Error('baseHash and selectedHash are required');
  }
  const requested = input.maxVis ?? DEFAULT_MAX_VIS;
  const maxVis = Math.max(
    1,
    Math.min(MAX_VIS_CEILING, Math.floor(Number.isFinite(requested) ? requested : DEFAULT_MAX_VIS))
  );

  const listChangedPaths = deps.listChangedPaths ?? defaultListChangedPaths;
  const compareVi = deps.compareVi ?? compareViRevisions;

  const changed = await listChangedPaths(repositoryRoot, baseHash, selectedHash);
  const viPaths = Array.from(new Set(changed.filter(isViSourcePath))).sort((a, b) =>
    a.localeCompare(b)
  );
  const changedViCount = viPaths.length;
  const selected = viPaths.slice(0, maxVis);

  const entries: ViSemanticPrReviewEntry[] = [];
  for (const relativePath of selected) {
    const result = await compareVi({
      repositoryRoot,
      relativePath,
      baseHash,
      selectedHash,
      runtime: input.runtime
    });
    entries.push(toEntry(relativePath, result));
  }

  const withDifferences = entries.filter(
    (entry) => entry.status === 'completed' && entry.hasDifferences
  ).length;
  const withoutDifferences = entries.filter(
    (entry) => entry.status === 'completed' && !entry.hasDifferences
  ).length;
  const blockedOrFailed = entries.filter((entry) => entry.status !== 'completed').length;

  const review: Omit<ViSemanticPrReview, 'narrative'> = {
    schema: VI_SEMANTIC_PR_REVIEW_SCHEMA,
    repositoryRoot,
    baseHash,
    selectedHash,
    changedViCount,
    reviewedCount: entries.length,
    entries,
    totals: { withDifferences, withoutDifferences, blockedOrFailed }
  };
  return { ...review, narrative: renderPrReviewNarrative(review) };
}
