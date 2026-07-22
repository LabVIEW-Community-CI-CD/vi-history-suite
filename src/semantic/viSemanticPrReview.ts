import { runGit } from '../git/gitCli';
import {
  compareViRevisions,
  type CompareViRevisionsResult,
  type CompareViRevisionsRuntimeRequest
} from './compareViRevisions';
import type { ViSemanticComparisonModel } from './viSemanticModel';
import {
  buildViPreviewComparisonCorrelation,
  type ViPreviewComparisonCorrelation,
  type ViPreviewPair
} from './viPreviewComparisonCorrelation';
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

/**
 * Schema id for the dedicated, first-class preview⇄comparison correlations
 * artifact (VHS-REQ-703, epic #2262). Re-exported from the schema registry (the
 * single source of truth) so artifact emission here and the registered JSON
 * Schema / validator can never drift.
 */
export { VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID as VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA } from './viSemanticSchemas';
import { VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID } from './viSemanticSchemas';
import { VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID } from './viSemanticSchemas';
import { VI_LATENT_CORPUS_SAMPLES_SCHEMA_ID } from './viSemanticSchemas';
import {
  buildViPreviewRegionCorrelationFromModel,
  type ViPreviewRegionCorrelation
} from './viPreviewRegionCorrelation';
import {
  buildViLatentCorpusSample,
  type ViLatentCorpusProvenance,
  type ViLatentCorpusSample
} from './viLatentCorpusSample';

/** One VI's correlation within the correlations artifact. */
export interface ViPreviewComparisonCorrelationEntry {
  relativePath: string;
  correlation: ViPreviewComparisonCorrelation;
}

/** The versioned bundle of per-VI preview⇄comparison correlations for a review. */
export interface ViPreviewComparisonCorrelationsArtifact {
  schema: typeof VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID;
  repositoryRoot: string;
  baseHash: string;
  selectedHash: string;
  /** Number of VIs in this bundle (each carries a correlation). */
  correlatedViCount: number;
  entries: ViPreviewComparisonCorrelationEntry[];
}

/**
 * Collects the per-VI preview⇄comparison correlations from a completed review
 * into a versioned, first-class artifact. Pure and deterministic. Returns
 * `undefined` when no reviewed VI carries a correlation (e.g. no preview
 * provider was wired), so a caller writes the artifact only when it has content.
 */
export function buildViPreviewComparisonCorrelationsArtifact(
  review: ViSemanticPrReview
): ViPreviewComparisonCorrelationsArtifact | undefined {
  const entries: ViPreviewComparisonCorrelationEntry[] = [];
  for (const entry of review.entries) {
    if (entry.status === 'completed' && entry.correlation) {
      entries.push({ relativePath: entry.relativePath, correlation: entry.correlation });
    }
  }
  if (entries.length === 0) {
    return undefined;
  }
  return {
    schema: VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID,
    repositoryRoot: review.repositoryRoot,
    baseHash: review.baseHash,
    selectedHash: review.selectedHash,
    correlatedViCount: entries.length,
    entries
  };
}

/** One VI's pixel-region correlation within the region-correlations artifact. */
export interface ViPreviewRegionCorrelationArtifactEntry {
  relativePath: string;
  regionCorrelation: ViPreviewRegionCorrelation;
}

/** The versioned bundle of per-VI pixel-region correlations for a review. */
export interface ViPreviewRegionCorrelationsArtifact {
  schema: typeof VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID;
  repositoryRoot: string;
  baseHash: string;
  selectedHash: string;
  /** Number of VIs in this bundle (each carries a region correlation with entries). */
  correlatedViCount: number;
  entries: ViPreviewRegionCorrelationArtifactEntry[];
}

/**
 * Collects the per-VI pixel-region correlations (VHS-REQ-703.14) from a completed
 * review into a versioned, first-class artifact, deriving each VI's region
 * correlation straight from its comparison model's detail-item geometry (diagram
 * space; no locator, no fabricated pixel origin). Pure and deterministic. Only
 * VIs whose model yields at least one coordinate-bearing region are included, and
 * the artifact is `undefined` when none do — so a caller writes it only when it
 * has content.
 */
export function buildViPreviewRegionCorrelationsArtifact(
  review: ViSemanticPrReview
): ViPreviewRegionCorrelationsArtifact | undefined {
  const entries: ViPreviewRegionCorrelationArtifactEntry[] = [];
  for (const entry of review.entries) {
    if (entry.status !== 'completed') {
      continue;
    }
    const regionCorrelation = buildViPreviewRegionCorrelationFromModel(entry.model);
    if (regionCorrelation.entries.length > 0) {
      entries.push({ relativePath: entry.relativePath, regionCorrelation });
    }
  }
  if (entries.length === 0) {
    return undefined;
  }
  return {
    schema: VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID,
    repositoryRoot: review.repositoryRoot,
    baseHash: review.baseHash,
    selectedHash: review.selectedHash,
    correlatedViCount: entries.length,
    entries
  };
}

/** One VI's corpus sample within the corpus-samples artifact. */
export interface ViLatentCorpusSampleArtifactEntry {
  relativePath: string;
  sample: ViLatentCorpusSample;
}

/** The versioned bundle of per-VI corpus samples for a review (VHS-REQ-703.17). */
export interface ViLatentCorpusSamplesArtifact {
  schema: typeof VI_LATENT_CORPUS_SAMPLES_SCHEMA_ID;
  repositoryRoot: string;
  baseHash: string;
  selectedHash: string;
  /** Number of VIs with a corpus sample in this bundle. */
  sampleViCount: number;
  entries: ViLatentCorpusSampleArtifactEntry[];
}

/** Runtime facts recorded into each sample's provenance (as observed). */
export type ViLatentCorpusRuntimeFacts = ViLatentCorpusProvenance['runtime'];

/**
 * Collects a reproducible corpus sample for every completed VI in a review into a
 * versioned, first-class artifact (VHS-REQ-703.17, epic #2262) — the production
 * surface for the Iter-10 `buildViLatentCorpusSample` builder. Each sample carries
 * the deterministic region-correlation body plus provenance (VI path, the review's
 * base/head revision pair, and the observed runtime facts) and honest preview
 * availability taken from the wired preview-pair provider (`entry.correlation`);
 * no preview bytes are threaded and no geometry is fabricated. Pure and
 * deterministic. Every COMPLETED VI yields a sample — including a no-difference VI
 * (a valuable true-negative label) — so the bundle is `undefined` only when the
 * review has no completed VI, and a caller writes it only when it has content.
 */
export function buildViLatentCorpusSamplesArtifact(
  review: Pick<ViSemanticPrReview, 'repositoryRoot' | 'baseHash' | 'selectedHash' | 'entries'>,
  runtime: ViLatentCorpusRuntimeFacts = {}
): ViLatentCorpusSamplesArtifact | undefined {
  const entries: ViLatentCorpusSampleArtifactEntry[] = [];
  for (const entry of review.entries) {
    if (entry.status !== 'completed') {
      continue;
    }
    const sample = buildViLatentCorpusSample({
      provenance: {
        viPath: entry.relativePath,
        baseRevision: review.baseHash,
        headRevision: review.selectedHash,
        runtime
      },
      model: entry.model,
      previewAvailability: entry.correlation
        ? {
            base: {
              available: entry.correlation.previews.base.available,
              inlineImageCount: entry.correlation.previews.base.inlineImageCount
            },
            head: {
              available: entry.correlation.previews.head.available,
              inlineImageCount: entry.correlation.previews.head.inlineImageCount
            }
          }
        : undefined
    });
    entries.push({ relativePath: entry.relativePath, sample });
  }
  if (entries.length === 0) {
    return undefined;
  }
  return {
    schema: VI_LATENT_CORPUS_SAMPLES_SCHEMA_ID,
    repositoryRoot: review.repositoryRoot,
    baseHash: review.baseHash,
    selectedHash: review.selectedHash,
    sampleViCount: entries.length,
    entries
  };
}

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
      /**
       * Preview ⇄ comparison correlation for this VI (VHS-REQ-703, epic #2262):
       * links each changed surface to the base/head preview references a wired
       * provider supplied. Optional/additive — present only when a
       * `resolvePreviewPair` provider is injected, so the default path, a legacy
       * artifact, or a `--from-file` review omits it and renders as before.
       */
      correlation?: ViPreviewComparisonCorrelation;
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
  /**
   * Resolves the base/head preview references for a changed VI (VHS-REQ-703,
   * epic #2262). Optional and injected so the correlation stays runtime-free:
   * when omitted, no correlation is attached and the review renders exactly as
   * before; when supplied, a provider reports real preview availability (cached
   * previews or a future Docker-generated render). Only invoked for a completed
   * comparison.
   */
  resolvePreviewPair?: (input: {
    repositoryRoot: string;
    relativePath: string;
    baseHash: string;
    selectedHash: string;
  }) => Promise<ViPreviewPair> | ViPreviewPair;
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

function toEntry(
  relativePath: string,
  result: CompareViRevisionsResult,
  correlation?: ViPreviewComparisonCorrelation
): ViSemanticPrReviewEntry {
  if (result.status === 'completed') {
    const reportFilePath =
      typeof result.runtime.reportFilePath === 'string' && result.runtime.reportFilePath.length > 0
        ? result.runtime.reportFilePath
        : undefined;
    return {
      relativePath,
      status: 'completed',
      hasDifferences: result.hasDifferences,
      model: result.model,
      ...(reportFilePath ? { reportFilePath } : {}),
      ...(correlation ? { correlation } : {})
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
  const riskRollup = renderRiskRollup(review.entries);
  return (
    `${review.changedViCount} changed VI${review.changedViCount === 1 ? '' : 's'}${scope}. ` +
    `${review.totals.withDifferences} with differences, ${review.totals.withoutDifferences} unchanged${notCompared}.` +
    riskRollup
  );
}

/**
 * VHS-REQ-702 risk roll-up appended to the shared PR-review narrative. Counts the
 * completed, differing entries by their (optional, additive on @v1) risk level.
 * Returns an empty string when no entry carries a classification, so a legacy or
 * `--from-file` review reads exactly as before. High-risk VIs are named first so
 * the most consequential changes lead.
 */
function renderRiskRollup(entries: ViSemanticPrReview['entries']): string {
  const counts: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 0, low: 0 };
  let classified = 0;
  for (const entry of entries) {
    if (entry.status === 'completed' && entry.hasDifferences && entry.model.riskLevel) {
      counts[entry.model.riskLevel] += 1;
      classified += 1;
    }
  }
  if (classified === 0) {
    return '';
  }
  const parts: string[] = [];
  if (counts.high > 0) {
    parts.push(`${counts.high} high-risk`);
  }
  if (counts.medium > 0) {
    parts.push(`${counts.medium} medium-risk`);
  }
  if (counts.low > 0) {
    parts.push(`${counts.low} low-risk`);
  }
  return ` Risk: ${parts.join(', ')}.`;
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
  const resolvePreviewPair = deps.resolvePreviewPair;

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
    let correlation: ViPreviewComparisonCorrelation | undefined;
    if (result.status === 'completed' && resolvePreviewPair) {
      // Correlation is an optional enhancement: a failure resolving the preview
      // pair must never abort the core review (the comparison already succeeded).
      // On error, proceed without correlation for this VI.
      try {
        const previews = await resolvePreviewPair({
          repositoryRoot,
          relativePath,
          baseHash,
          selectedHash
        });
        correlation = buildViPreviewComparisonCorrelation(result.model, previews);
      } catch {
        correlation = undefined;
      }
    }
    entries.push(toEntry(relativePath, result, correlation));
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
