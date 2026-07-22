import {
  buildViPreviewRegionCorrelationBundle,
  type DiffRegionImageAssociation,
  type RegionCorrelationBundleInput,
  type ViPreviewRegionCorrelation,
  type ViPreviewRegionCorrelationBundle
} from './viPreviewRegionCorrelation';
import { VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID } from './viSemanticSchemas';

/**
 * The reproducibility key for a corpus sample. Every sample must name the exact
 * base/head revision pair and the runtime it came from, so it can be regenerated
 * from the shipped runtime path (ADR-0027 closed-corpus rail). The runtime facts
 * are recorded as-observed; none of them are inferred.
 */
export interface ViLatentCorpusProvenance {
  /** Repository-relative path of the compared VI. */
  viPath: string;
  /** Base (older) revision the sample was generated from. */
  baseRevision: string;
  /** Head (newer) revision the sample was generated from. */
  headRevision: string;
  /** Comparison runtime facts, as observed (never inferred). */
  runtime: {
    engine?: string;
    provider?: string;
    bitness?: string;
    version?: string;
  };
}

/**
 * Honest record of which of the three artifacts backed this sample. The
 * comparison report is always present (it is what produced the model); the two
 * previews are optional (VHS-REQ-703.3–.7 — an ordinary comparison, correlation
 * disabled, or a cache miss has only the report).
 */
export interface ViLatentCorpusArtifactAvailability {
  basePreviewAvailable: boolean;
  headPreviewAvailable: boolean;
  /** Always true: the comparison report is what produced the model. */
  comparisonReportAvailable: true;
}

/**
 * A single labeled corpus sample: the deterministic region-correlation body plus
 * the provenance that makes it reproducible. It is a faithful serialization of
 * deterministic output — it ships no model, adds no inferred label, and (per the
 * region-correlation contract) never fabricates a pixel origin.
 */
export interface ViLatentCorpusSample {
  schema: typeof VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID;
  provenance: ViLatentCorpusProvenance;
  artifacts: ViLatentCorpusArtifactAvailability;
  correlation: ViPreviewRegionCorrelation;
  imageAssociations: DiffRegionImageAssociation[];
  previewImageCounts: { base: number; head: number };
}

/**
 * Honest preview availability supplied by the review's preview-pair provider
 * (metadata only: whether a render is available and its inline-image count), so
 * a corpus record can state preview availability truthfully WITHOUT threading the
 * raw preview image bytes. When supplied it overrides the image-array-derived
 * availability; when absent, availability falls back to whatever preview images
 * (if any) were passed to the region-correlation bundle.
 */
export interface ViLatentCorpusPreviewAvailability {
  base?: { available: boolean; inlineImageCount?: number };
  head?: { available: boolean; inlineImageCount?: number };
}

export interface BuildViLatentCorpusSampleInput extends RegionCorrelationBundleInput {
  provenance: ViLatentCorpusProvenance;
  /**
   * Optional honest preview availability from the pair provider. When present it
   * is the source of truth for `artifacts.*PreviewAvailable` and
   * `previewImageCounts`; when absent, both are derived from the bundle's own
   * image counts (current behavior).
   */
  previewAvailability?: ViLatentCorpusPreviewAvailability;
}

/**
 * Assembles a reproducible labeled corpus sample from the three artifacts (base
 * preview HTML, head preview HTML, comparison report), reusing the shipped
 * region-correlation bundle for the labeled body. Pure and deterministic: the
 * same provenance, model, preview images, and injected boundaries always yield
 * the same sample. It records artifact availability honestly (preview presence
 * inferred solely from whether preview images were supplied) and never adds a
 * label the deterministic correlation did not recover. An empty/no-difference
 * model yields an empty-but-valid sample.
 */
export function buildViLatentCorpusSample(
  input: BuildViLatentCorpusSampleInput
): ViLatentCorpusSample {
  const bundle: ViPreviewRegionCorrelationBundle = buildViPreviewRegionCorrelationBundle({
    model: input.model,
    previewImages: input.previewImages,
    resolveDifferenceImage: input.resolveDifferenceImage,
    locate: input.locate
  });

  const availability = input.previewAvailability;
  // Provider metadata is the source of truth for a side when it is supplied (it
  // reflects a real render/cache peek, even when raw bytes were not threaded).
  // Each side falls back INDEPENDENTLY to what the bundle counted from any
  // supplied preview images, so partial metadata (only one side present) does
  // not force the other side to false. Never fabricated: an explicit false/0
  // provider entry stays false/0.
  const basePreviewAvailable =
    availability?.base !== undefined
      ? availability.base.available === true
      : bundle.previewImageCounts.base > 0;
  const headPreviewAvailable =
    availability?.head !== undefined
      ? availability.head.available === true
      : bundle.previewImageCounts.head > 0;
  const previewImageCounts = {
    base: resolvePreviewImageCount(availability?.base, basePreviewAvailable, bundle.previewImageCounts.base),
    head: resolvePreviewImageCount(availability?.head, headPreviewAvailable, bundle.previewImageCounts.head)
  };

  return {
    schema: VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID,
    provenance: normalizeProvenance(input.provenance),
    artifacts: {
      basePreviewAvailable,
      headPreviewAvailable,
      comparisonReportAvailable: true
    },
    correlation: bundle.correlation,
    imageAssociations: bundle.imageAssociations,
    previewImageCounts
  };
}

/**
 * Returns a preview side's inline-image count that stays internally consistent
 * with its resolved availability: `0` when the side is unavailable, the provider
 * count when it is a valid non-negative integer, otherwise the bundle-derived
 * count (so an `available: true` side without a provider count is not recorded as
 * `0`). Never fabricated — an available side with no evidence at all reports `0`.
 */
function resolvePreviewImageCount(
  entry: { available: boolean; inlineImageCount?: number } | undefined,
  available: boolean,
  bundleCount: number
): number {
  if (!available) {
    return 0;
  }
  if (entry !== undefined) {
    const count = entry.inlineImageCount;
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
      return count;
    }
    // Available side but the provider omitted/invalidated the count: fall back to
    // whatever the bundle counted from supplied preview images (often 0).
    return bundleCount;
  }
  return bundleCount;
}

/**
 * Returns provenance with only the runtime facts that were actually observed, so
 * the serialized sample never carries `undefined` runtime keys.
 */
function normalizeProvenance(provenance: ViLatentCorpusProvenance): ViLatentCorpusProvenance {
  const runtime: ViLatentCorpusProvenance['runtime'] = {};
  if (provenance.runtime.engine !== undefined) {
    runtime.engine = provenance.runtime.engine;
  }
  if (provenance.runtime.provider !== undefined) {
    runtime.provider = provenance.runtime.provider;
  }
  if (provenance.runtime.bitness !== undefined) {
    runtime.bitness = provenance.runtime.bitness;
  }
  if (provenance.runtime.version !== undefined) {
    runtime.version = provenance.runtime.version;
  }
  return {
    viPath: provenance.viPath,
    baseRevision: provenance.baseRevision,
    headRevision: provenance.headRevision,
    runtime
  };
}
