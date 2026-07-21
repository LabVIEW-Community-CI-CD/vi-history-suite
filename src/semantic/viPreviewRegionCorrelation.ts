/**
 * Preview ⇄ Comparison pixel-region correlation — iteration 8 (VHS-REQ-703,
 * epic #2262).
 *
 * This is the deterministic foundation for placing a changed object as a PIXEL
 * REGION on the flat base/head preview rasters, using ONLY the three artifacts
 * this repo already produces — there is no authoring of new VIs and no
 * coordinate-frames emitter:
 *
 *   1. the base preview HTML (this repo's `PrintToSingleFileHtml` render),
 *   2. the head preview HTML (same), and
 *   3. the LabVIEW comparison report (`CreateComparisonReport`), which embeds
 *      each changed object's diagram `(x,y)` (see the detail-item geometry,
 *      VHS-REQ-703.11) and a rendered `difference-image` PNG of that region.
 *
 * A `difference-image` PNG already IS the pixel content of a changed region; its
 * intrinsic width/height (read here from the PNG header, no decode library) is
 * the region's pixel SIZE. What the report does not give is the region's pixel
 * ORIGIN within the full preview raster — that is resolved by an INJECTED
 * locator (a deterministic image match, or a later ML association), so this
 * module stays pure and dependency-free. When no locator places a region, the
 * change is recorded honestly as diagram-space-only: never a fabricated overlay.
 */

import { createHash } from 'node:crypto';
import type {
  ComparisonDetailChangeType,
  DiagramPoint
} from '../dashboard/comparisonDetailItemGeometry';
import { hasDiagramCoordinate } from '../dashboard/comparisonDetailItemGeometry';
import type { ViSemanticComparisonModel } from './viSemanticModel';

// Re-exported from the schema registry (single source of truth) so this module's
// emitted `schema` value and the registered JSON Schema / validator cannot drift.
export { VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID as VI_PREVIEW_REGION_CORRELATION_SCHEMA } from './viSemanticSchemas';
import { VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID } from './viSemanticSchemas';

/** Intrinsic pixel dimensions of a raster image. */
export interface PixelDimensions {
  width: number;
  height: number;
}

/** Which preview render a located region belongs to. */
export type PreviewSide = 'base' | 'head';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DATA_URI_PREFIX = /^data:image\/png;base64,/i;

/**
 * Reads a PNG's intrinsic width/height from its IHDR chunk without decoding the
 * image. Accepts a `data:image/png;base64,<...>` URI (NI writes a space after
 * `base64,` — tolerated), a bare base64 string, or a raw byte array. Returns
 * `undefined` for anything that is not a well-formed PNG header, so a caller can
 * treat an unreadable image as "size unknown" rather than crashing.
 */
export function readPngDimensions(source: string | Uint8Array): PixelDimensions | undefined {
  let bytes: Uint8Array;
  if (typeof source === 'string') {
    const base64 = source.replace(DATA_URI_PREFIX, '').replace(/\s+/g, '');
    if (base64.length === 0) {
      return undefined;
    }
    try {
      // Only the first 24 bytes are needed (signature + IHDR length/type + w/h).
      bytes = Uint8Array.from(Buffer.from(base64.slice(0, 64), 'base64'));
    } catch {
      return undefined;
    }
  } else {
    bytes = source;
  }
  if (bytes.length < 24) {
    return undefined;
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      return undefined;
    }
  }
  // IHDR must be the first chunk: bytes 12..16 spell "IHDR".
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return undefined;
  }
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * One changed object's diff-region context from the comparison report: its
 * change type, its diagram coordinate (when the report named one), and the pixel
 * size of its rendered `difference-image` (when readable).
 */
export interface DiffRegionSource {
  /** Stable id for this region (e.g. the detail-item text or object name). */
  id: string;
  changeType: ComparisonDetailChangeType;
  /**
   * Diagram coordinate from the comparison report (diagram space, not pixels).
   * For a moved object this is the DESTINATION (head-side) point.
   */
  coordinate?: DiagramPoint;
  /**
   * The SOURCE (base-side) diagram coordinate of a moved object (`from (x,y) to
   * (x,y)`), when the report named one. Kept distinct from `coordinate` so a
   * base-side locator can anchor on the original position rather than the
   * destination.
   */
  fromCoordinate?: DiagramPoint;
  /** Pixel size of the rendered difference image, when known. */
  pixelSize?: PixelDimensions;
}

/**
 * The diagram coordinate to anchor a diff region on for a given preview side:
 * the base side prefers the move's source point (`fromCoordinate`) and the head
 * side prefers the destination (`coordinate`), each falling back to the other
 * when only one endpoint is known. A locator should anchor on this rather than
 * `coordinate` directly so a moved object is placed correctly on each side.
 */
export function diffRegionCoordinateForSide(
  source: DiffRegionSource,
  side: PreviewSide
): DiagramPoint | undefined {
  if (side === 'base') {
    return source.fromCoordinate ?? source.coordinate;
  }
  return source.coordinate ?? source.fromCoordinate;
}

/** A region located within a preview raster, in preview-image pixel space. */
export interface LocatedPreviewRegion {
  side: PreviewSide;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Locator confidence in [0, 1]; a value <= 0 is treated as "not located". */
  confidence: number;
}

/**
 * Resolves the pixel ORIGIN of a diff region within a preview raster. Injected
 * so the deterministic pixel match (or a later ML association) lives outside
 * this pure module. Return `undefined` when the region cannot be placed on the
 * given side — the correlation then records the change as diagram-space-only.
 */
export type PreviewRegionLocator = (
  region: DiffRegionSource,
  side: PreviewSide
) => LocatedPreviewRegion | undefined;

/** Per-object region correlation: the report context plus any located regions. */
export interface ViRegionCorrelationEntry {
  id: string;
  changeType: ComparisonDetailChangeType;
  coordinate?: DiagramPoint;
  /** The move source (base-side) diagram coordinate, when the change is a move. */
  fromCoordinate?: DiagramPoint;
  pixelSize?: PixelDimensions;
  /**
   * Located pixel regions (at most one per side). Empty when no side could be
   * placed — the change is then diagram-space-only, never a fabricated overlay.
   */
  regions: LocatedPreviewRegion[];
  /** True when at least one side was located with positive confidence. */
  located: boolean;
}

export interface ViPreviewRegionCorrelation {
  schema: typeof VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID;
  entries: ViRegionCorrelationEntry[];
  totals: {
    regionCount: number;
    locatedRegionCount: number;
    diagramOnlyRegionCount: number;
  };
}

const PREVIEW_SIDES: PreviewSide[] = ['base', 'head'];

/**
 * Builds the deterministic pixel-region correlation. Pure: the same sources and
 * locator always produce the same result. Without a locator (or when the locator
 * places nothing), every change is retained as a diagram-space-only entry, so a
 * caller never loses a change and never sees a fabricated pixel region. A
 * located region is only kept when the locator reports positive confidence and a
 * positive-area rectangle.
 */
export function buildViPreviewRegionCorrelation(
  sources: readonly DiffRegionSource[],
  locate?: PreviewRegionLocator
): ViPreviewRegionCorrelation {
  const entries: ViRegionCorrelationEntry[] = sources.map((source) => {
    const regions: LocatedPreviewRegion[] = [];
    if (locate) {
      for (const side of PREVIEW_SIDES) {
        const located = locate(source, side);
        if (isUsableRegion(located)) {
          regions.push({ ...located, side });
        }
      }
    }
    const entry: ViRegionCorrelationEntry = {
      id: source.id,
      changeType: source.changeType,
      regions,
      located: regions.length > 0
    };
    if (source.coordinate !== undefined) {
      entry.coordinate = source.coordinate;
    }
    if (source.fromCoordinate !== undefined) {
      entry.fromCoordinate = source.fromCoordinate;
    }
    if (source.pixelSize !== undefined) {
      entry.pixelSize = source.pixelSize;
    }
    return entry;
  });

  const locatedRegionCount = entries.filter((entry) => entry.located).length;
  return {
    schema: VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID,
    entries,
    totals: {
      regionCount: entries.length,
      locatedRegionCount,
      diagramOnlyRegionCount: entries.length - locatedRegionCount
    }
  };
}

function isUsableRegion(
  region: LocatedPreviewRegion | undefined
): region is LocatedPreviewRegion {
  return (
    region !== undefined &&
    // Confidence must be a real value in (0, 1] — a locator that returns 0, a
    // non-finite value, or > 1 (which would render a nonsensical percentage) is
    // rejected rather than kept.
    Number.isFinite(region.confidence) &&
    region.confidence > 0 &&
    region.confidence <= 1 &&
    // Geometry must be a non-negative-origin rectangle of finite integers with
    // positive area, matching the published schema (left/top minimum 0,
    // width/height minimum 1; Infinity passes `> 0`, so guard integrality).
    Number.isInteger(region.left) &&
    Number.isInteger(region.top) &&
    Number.isInteger(region.width) &&
    Number.isInteger(region.height) &&
    region.left >= 0 &&
    region.top >= 0 &&
    region.width > 0 &&
    region.height > 0
  );
}

/**
 * Adapts a semantic comparison model into the diff-region sources this module
 * correlates, using ONLY the comparison report's own detail-item geometry
 * (VHS-REQ-703.10/.11) — the per-object change type, name, and diagram
 * coordinate. Pure and deterministic: one source per coordinate-bearing detail
 * item across every detail section, in the model's stable section/item order.
 * Items without a diagram coordinate are skipped (a region needs a coordinate to
 * anchor); the id prefers the object name, falling back to the raw item text so
 * every emitted source is identifiable. Pixel size is left for a later stage
 * that reads the per-object difference-image.
 */
export function buildDiffRegionSourcesFromModel(
  model: Pick<ViSemanticComparisonModel, 'detailSections'>
): DiffRegionSource[] {
  const sources: DiffRegionSource[] = [];
  const sections = Array.isArray(model.detailSections) ? model.detailSections : [];
  for (const section of sections) {
    for (const geometry of section.itemGeometry ?? []) {
      if (!hasDiagramCoordinate(geometry)) {
        continue;
      }
      // A region must have at least one endpoint. Preserve BOTH the destination
      // (`coordinate`) and the move source (`fromCoordinate`) so a base-side
      // locator can anchor on the original position, not the destination.
      if (geometry.coordinate === undefined && geometry.fromCoordinate === undefined) {
        continue;
      }
      const source: DiffRegionSource = {
        id: geometry.objectName ?? geometry.text,
        changeType: geometry.changeType
      };
      if (geometry.coordinate !== undefined) {
        source.coordinate = geometry.coordinate;
      }
      if (geometry.fromCoordinate !== undefined) {
        source.fromCoordinate = geometry.fromCoordinate;
      }
      sources.push(source);
    }
  }
  return sources;
}

/**
 * Resolves a change's rendered `difference-image` to its PNG source (a
 * `data:image/png;base64,...` URI, a bare base64 string, or raw bytes), keyed by
 * the change id. Injected so this module never reads the report's asset files
 * itself. Return `undefined` when the change has no difference image.
 */
export type DifferenceImageResolver = (source: DiffRegionSource) => string | Uint8Array | undefined;

/**
 * Enriches diff-region sources with the intrinsic pixel size of each change's
 * rendered `difference-image`, read from the PNG header via {@link readPngDimensions}
 * (no image decode). Pure: the resolver supplies the image bytes; a change with
 * no resolvable/readable image keeps its existing `pixelSize` (usually absent).
 * The pixel size is the region's SIZE — its pixel origin still comes from a
 * locator — so this never fabricates a placement, only records a real size.
 */
export function withDiffRegionPixelSizes(
  sources: readonly DiffRegionSource[],
  resolveDifferenceImage: DifferenceImageResolver
): DiffRegionSource[] {
  return sources.map((source) => {
    if (source.pixelSize !== undefined) {
      return source;
    }
    const image = resolveDifferenceImage(source);
    if (image === undefined) {
      return source;
    }
    const pixelSize = readPngDimensions(image);
    return pixelSize ? { ...source, pixelSize } : source;
  });
}


/**
 * One-call entry point: build the pixel-region correlation directly from a
 * semantic comparison model, deriving the diff-region sources from the report's
 * detail-item geometry and correlating them through the optional injected
 * locator. Pure and deterministic; without a locator every change is retained as
 * diagram-space-only. This is the API a consumer should prefer over wiring
 * {@link buildDiffRegionSourcesFromModel} and {@link buildViPreviewRegionCorrelation}
 * by hand.
 */
export function buildViPreviewRegionCorrelationFromModel(
  model: Pick<ViSemanticComparisonModel, 'detailSections'>,
  locate?: PreviewRegionLocator
): ViPreviewRegionCorrelation {
  return buildViPreviewRegionCorrelation(buildDiffRegionSourcesFromModel(model), locate);
}


function escapeRegionCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function formatPoint(point: DiagramPoint | undefined): string {
  return point ? `(${point.x},${point.y})` : '—';
}

function formatRegionCell(region: LocatedPreviewRegion | undefined): string {
  if (!region) {
    return '—';
  }
  const confidence = Math.round(region.confidence * 100);
  return `${region.left},${region.top} ${region.width}×${region.height} (${confidence}%)`;
}

/**
 * Renders a deterministic Markdown table for a pixel-region correlation: one row
 * per changed object showing its change type, its DIAGRAM coordinate (labeled as
 * diagram space, never pixels), and the located base/head pixel regions when a
 * locator placed them. A `—` marks an unlocated side honestly — the change is
 * still listed (diagram-space-only), never given a fabricated pixel region.
 * Returns an empty string when there are no entries so a caller can append it
 * unconditionally. `maxRows` (when > 0) caps the rendered rows and appends a
 * remainder note, so an unbounded review comment can never exceed GitHub's body
 * limit; the full data still lives in the machine-readable artifact.
 */
export function renderRegionCorrelationTable(
  correlation: ViPreviewRegionCorrelation,
  maxRows?: number
): string {
  if (correlation.entries.length === 0) {
    return '';
  }
  const lines: string[] = [
    '| Object | Change | Diagram (x,y) | Base region (px) | Head region (px) |',
    '| --- | --- | --- | --- | --- |'
  ];
  const limit = maxRows !== undefined && maxRows > 0 ? maxRows : correlation.entries.length;
  const shown = correlation.entries.slice(0, limit);
  for (const entry of shown) {
    const base = entry.regions.find((r) => r.side === 'base');
    const head = entry.regions.find((r) => r.side === 'head');
    lines.push(
      `| ${escapeRegionCell(entry.id)} | ${entry.changeType} | ${formatPoint(entry.coordinate)} | ` +
        `${formatRegionCell(base)} | ${formatRegionCell(head)} |`
    );
  }
  const remainder = correlation.entries.length - shown.length;
  if (remainder > 0) {
    lines.push(`| _+${remainder} more_ | | | | |`);
  }
  const { locatedRegionCount, regionCount } = correlation.totals;
  lines.push(
    '',
    `_${locatedRegionCount} of ${regionCount} change(s) located as a pixel region on both/either preview; ` +
      `the rest are diagram-space references only (no fabricated overlay)._`
  );
  return lines.join('\n');
}

/**
 * Normalizes a PNG source to its DECODED bytes so content keys are truly
 * byte-exact: two valid base64 encodings of the same bytes (e.g. differing
 * padding/whitespace) decode to the same buffer and hash identically. A raw byte
 * array is returned as-is; a data-URI/base64 string is decoded.
 */
function toDecodedBytes(source: string | Uint8Array): Buffer {
  if (typeof source !== 'string') {
    return Buffer.from(source);
  }
  const base64 = source.replace(/^data:image\/png;base64,/i, '').replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

/** Content key = sha256 of the decoded PNG bytes (truly byte-exact). */
function contentKeyFor(source: string | Uint8Array): string {
  return createHash('sha256').update(toDecodedBytes(source)).digest('hex');
}

/** A content-addressed preview image: its index on a side, size, and content key. */
export interface PreviewImageEntry {
  side: PreviewSide;
  index: number;
  contentKey: string;
  pixelSize?: PixelDimensions;
}

/**
 * Builds a content-addressed inventory of a preview render's inline images. Each
 * image (a `data:image/png;base64,...` URI or raw bytes, in document order) is
 * keyed by a sha256 of its PNG payload and tagged with its decoded pixel size.
 * Pure and deterministic — this is the preview-side raw material a locator or the
 * ML phase (#2295) matches the comparison report's difference-images against; it
 * mirrors how the report exposes per-object difference-images.
 */
export function buildPreviewImageInventory(
  images: readonly (string | Uint8Array)[],
  side: PreviewSide
): PreviewImageEntry[] {
  return images.map((image, index) => {
    const entry: PreviewImageEntry = {
      side,
      index,
      contentKey: contentKeyFor(image)
    };
    const pixelSize = readPngDimensions(image);
    if (pixelSize) {
      entry.pixelSize = pixelSize;
    }
    return entry;
  });
}

/** An exact content association between a change and a preview image. */
export interface DiffRegionImageAssociation {
  id: string;
  side: PreviewSide;
  previewImageIndex: number;
  contentKey: string;
  pixelSize?: PixelDimensions;
}

/**
 * Associates each change's rendered `difference-image` with a preview image by
 * EXACT content (byte-identical PNG payload). A byte-exact match means the
 * comparison report rendered the very image the preview shows for that element,
 * so the association identifies WHICH preview element changed with full
 * confidence — WITHOUT inventing a pixel origin (the flat `PrintToSingleFileHtml`
 * export has no positions; that is left to the ML phase). Pure: the resolver
 * supplies each change's difference-image; a change with no image or no exact
 * match yields no association. When both sides match, the head side is preferred.
 */
export function associateDiffRegionsToPreviewImages(
  sources: readonly DiffRegionSource[],
  inventories: readonly PreviewImageEntry[],
  resolveDifferenceImage: DifferenceImageResolver
): DiffRegionImageAssociation[] {
  const byContent = new Map<string, PreviewImageEntry[]>();
  for (const entry of inventories) {
    const list = byContent.get(entry.contentKey) ?? [];
    list.push(entry);
    byContent.set(entry.contentKey, list);
  }
  const associations: DiffRegionImageAssociation[] = [];
  for (const source of sources) {
    const image = resolveDifferenceImage(source);
    if (image === undefined) {
      continue;
    }
    const key = contentKeyFor(image);
    const matches = byContent.get(key);
    if (!matches || matches.length === 0) {
      continue;
    }
    const preferred = matches.find((m) => m.side === 'head') ?? matches[0];
    const association: DiffRegionImageAssociation = {
      id: source.id,
      side: preferred.side,
      previewImageIndex: preferred.index,
      contentKey: preferred.contentKey
    };
    if (preferred.pixelSize !== undefined) {
      association.pixelSize = preferred.pixelSize;
    }
    associations.push(association);
  }
  return associations;
}

/**
 * Options for assembling the combined region-correlation bundle. Every input is
 * derived from the three existing artifacts and every boundary is injected, so
 * the assembly stays pure and dependency-free:
 *   - `model`: the semantic comparison model (from the comparison report),
 *   - `previewImages`: the base/head preview inline images (from the preview HTML),
 *   - `resolveDifferenceImage`: each change's rendered difference-image bytes,
 *   - `locate`: the optional pixel-origin locator (still injected; absent => no
 *     located pixel regions, only diagram-space + content associations).
 */
export interface RegionCorrelationBundleInput {
  model: Pick<ViSemanticComparisonModel, 'detailSections'>;
  previewImages?: { base?: readonly (string | Uint8Array)[]; head?: readonly (string | Uint8Array)[] };
  resolveDifferenceImage?: DifferenceImageResolver;
  locate?: PreviewRegionLocator;
}

/**
 * The combined, honest region-correlation bundle: the diagram-space region
 * correlation, the exact content associations between changes and preview
 * images, and the preview-image inventory counts — everything a cloud agent or
 * the ML phase needs to reason about "which changed object maps to which preview
 * image", assembled from the three existing artifacts with no fabricated pixel
 * geometry.
 */
export interface ViPreviewRegionCorrelationBundle {
  correlation: ViPreviewRegionCorrelation;
  imageAssociations: DiffRegionImageAssociation[];
  previewImageCounts: { base: number; head: number };
}

/**
 * Assembles the combined region-correlation bundle from the three artifacts.
 * Pure and deterministic. Diff-region sources come from the model's detail-item
 * geometry and are enriched with each change's difference-image pixel size (when
 * a resolver is supplied); the region correlation applies the optional locator;
 * and, when both a difference-image resolver and preview images are supplied, the
 * changes are content-associated (byte-exact) to preview images. Nothing is
 * fabricated: without a locator there are no located pixel regions, and without
 * an exact content match there are no associations.
 */
export function buildViPreviewRegionCorrelationBundle(
  input: RegionCorrelationBundleInput
): ViPreviewRegionCorrelationBundle {
  const baseImages = input.previewImages?.base ?? [];
  const headImages = input.previewImages?.head ?? [];

  let sources = buildDiffRegionSourcesFromModel(input.model);
  if (input.resolveDifferenceImage) {
    sources = withDiffRegionPixelSizes(sources, input.resolveDifferenceImage);
  }

  const correlation = buildViPreviewRegionCorrelation(sources, input.locate);

  let imageAssociations: DiffRegionImageAssociation[] = [];
  if (input.resolveDifferenceImage && (baseImages.length > 0 || headImages.length > 0)) {
    const inventory = [
      ...buildPreviewImageInventory(baseImages, 'base'),
      ...buildPreviewImageInventory(headImages, 'head')
    ];
    imageAssociations = associateDiffRegionsToPreviewImages(
      sources,
      inventory,
      input.resolveDifferenceImage
    );
  }

  return {
    correlation,
    imageAssociations,
    previewImageCounts: { base: baseImages.length, head: headImages.length }
  };
}

/**
 * Renders the combined region-correlation bundle as a deterministic Markdown
 * section for a review artifact: the per-object region table (diagram
 * coordinates + any located pixel regions) followed, when present, by the exact
 * content associations between changes and preview images (which preview image
 * each change's difference-image byte-matches, and on which side). Honest: it
 * only shows associations that were established by byte-exact match and never
 * fabricates a pixel origin. Returns an empty string when the bundle has no
 * changes so a caller can append it unconditionally.
 */
export function renderRegionCorrelationBundle(bundle: ViPreviewRegionCorrelationBundle): string {
  const table = renderRegionCorrelationTable(bundle.correlation);
  if (table === '') {
    return '';
  }
  const sections: string[] = [table];
  if (bundle.imageAssociations.length > 0) {
    const lines: string[] = [
      '',
      '**Preview image matches** (byte-exact difference-image ↔ preview image):',
      '',
      '| Object | Preview side | Image # | Size (px) |',
      '| --- | --- | --- | --- |'
    ];
    for (const assoc of bundle.imageAssociations) {
      const size = assoc.pixelSize ? `${assoc.pixelSize.width}×${assoc.pixelSize.height}` : '—';
      lines.push(
        `| ${escapeRegionCell(assoc.id)} | ${assoc.side} | ${assoc.previewImageIndex} | ${size} |`
      );
    }
    sections.push(lines.join('\n'));
  }
  return sections.join('\n');
}
