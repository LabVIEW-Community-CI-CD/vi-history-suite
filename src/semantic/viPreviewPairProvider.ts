import type { ViPreviewPair, ViPreviewReference } from './viPreviewComparisonCorrelation';

/**
 * Cache-peek preview-pair provider (VHS-REQ-703.4, epic #2262 iteration 2.5).
 *
 * Makes the deterministic preview⇄comparison correlation LIVE in the PR-review
 * flow by resolving the base/head preview references from the content-addressed
 * preview cache — WITHOUT launching any runtime. Iterations 1 and 2 shipped the
 * correlation and the optional `resolvePreviewPair` seam; this provider is the
 * first production implementation of that seam.
 *
 * It is pure orchestration: the actual cache peek (a `cacheOnly` render that
 * launches nothing on a miss) is injected as `peekRevisionPreview`, so the
 * provider stays unit-testable without a filesystem, Git, LabVIEW, or Docker.
 * Availability is reported HONESTLY: a cache hit yields an `available` reference,
 * a miss (or a peek error) yields `available: false`. A changed surface is never
 * reported as correlated unless BOTH sides are genuinely cached.
 */

/** One side (base or head) of a preview-pair resolution. */
export interface PeekRevisionPreviewInput {
  repositoryRoot: string;
  /** Repository-relative VI path being previewed. */
  relativePath: string;
  /** The revision (commit/ref) this side represents. */
  revision: string;
  /** Which side of the comparison this peek is for. */
  side: 'base' | 'head';
}

/** The outcome of a single cache-only preview peek. */
export interface PeekRevisionPreviewResult {
  /** True only on a genuine cache hit (a rendered document was served). */
  available: boolean;
  /** Content-addressed cache key, when the peek could compute/hit one. */
  cacheKey?: string;
  /** Inline preview-image count of the cached render, when available. */
  inlineImageCount?: number;
}

export interface CachePeekPreviewPairDeps {
  /**
   * Peeks the preview cache for one revision's VI. MUST be cache-only (launch
   * nothing on a miss) and MUST return `available: false` — never throw — for a
   * miss; a thrown error is tolerated (treated as unavailable) but is reserved
   * for genuinely unexpected failures.
   */
  peekRevisionPreview: (input: PeekRevisionPreviewInput) => Promise<PeekRevisionPreviewResult>;
}

async function resolveSide(
  deps: CachePeekPreviewPairDeps,
  input: PeekRevisionPreviewInput
): Promise<ViPreviewReference> {
  try {
    const result = await deps.peekRevisionPreview(input);
    if (!result || result.available !== true) {
      return { available: false };
    }
    return {
      available: true,
      relativePath: input.relativePath,
      revision: input.revision,
      ...(typeof result.cacheKey === 'string' && result.cacheKey.length > 0
        ? { cacheKey: result.cacheKey }
        : {}),
      ...(typeof result.inlineImageCount === 'number'
        ? { inlineImageCount: result.inlineImageCount }
        : {})
    };
  } catch {
    // A single side's peek failure must never lose the other side (or abort the
    // review); report this side unavailable and continue.
    return { available: false };
  }
}

/**
 * Builds a `resolvePreviewPair` provider for the VI semantic PR-review flow that
 * resolves each side from the preview cache via the injected `peekRevisionPreview`
 * boundary. Base and head are resolved independently, so one side's miss or error
 * never suppresses the other side's genuine hit.
 */
export function createCachePeekPreviewPairProvider(
  deps: CachePeekPreviewPairDeps
): (input: {
  repositoryRoot: string;
  relativePath: string;
  baseHash: string;
  selectedHash: string;
}) => Promise<ViPreviewPair> {
  return async function resolvePreviewPair(input): Promise<ViPreviewPair> {
    const { repositoryRoot, relativePath, baseHash, selectedHash } = input;
    const [base, head] = await Promise.all([
      resolveSide(deps, { repositoryRoot, relativePath, revision: baseHash, side: 'base' }),
      resolveSide(deps, { repositoryRoot, relativePath, revision: selectedHash, side: 'head' })
    ]);
    return { base, head };
  };
}
