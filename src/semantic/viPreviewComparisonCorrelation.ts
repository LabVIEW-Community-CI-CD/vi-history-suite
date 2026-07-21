import type {
  ViChangeKind,
  ViChangeRiskLevel,
  ViChangeSurface,
  ViClassificationConfidence,
  ViSemanticComparisonModel
} from './viSemanticModel';
import {
  hasDiagramCoordinate,
  type ComparisonDetailChangeType,
  type DiagramPoint
} from '../dashboard/comparisonDetailItemGeometry';

/**
 * Preview ⇄ Comparison Correlation — iteration 1 (VHS-REQ-703, epic #2262).
 *
 * A pure, deterministic, surface-level correlation between the VI semantic
 * comparison model (VHS-REQ-702: which surfaces changed, each change's kind and
 * the aggregate risk) and the base/head preview renders for that VI. It answers,
 * for a reviewer or a cloud agent, "which changed surface does each preview
 * cover, and what changed there" — WITHOUT any runtime, ML, or pixel-precise
 * region mapping (that needs the still-blocked coordinate-frames preview export,
 * a later iteration). Correlations are only asserted where they can be
 * established deterministically; a changed surface with no preview is reported as
 * such, never fabricated.
 */

export const VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA =
  'vi-history-suite/vi-preview-comparison-correlation@v1';

/**
 * A lightweight, injectable reference to a preview render for one revision. It
 * is intentionally a descriptor, not the rendered bytes: iteration 1 does not
 * render or read previews (that is iteration 2), it only correlates against
 * whatever preview references the caller supplies. `available: false` means no
 * preview render is known for that revision.
 */
export interface ViPreviewReference {
  available: boolean;
  /** Repository-relative VI path the preview was rendered from, if known. */
  relativePath?: string;
  /** Revision identifier (commit/ref) the preview represents, if known. */
  revision?: string;
  /** Content-addressed preview cache key, if the render came from the cache. */
  cacheKey?: string;
  /** Count of inline preview images in the render, if known. */
  inlineImageCount?: number;
}

/** The base/head preview pair a correlation is computed against. */
export interface ViPreviewPair {
  base?: ViPreviewReference;
  head?: ViPreviewReference;
}

/**
 * A single per-object change with its VI diagram coordinate, surfaced from the
 * comparison report's detail-item geometry (VHS-REQ-703.10). Only items that
 * actually carry a coordinate are included. Coordinates are in VI DIAGRAM space
 * (the report's own space), never preview-image pixels — a consumer must treat
 * them as labeled diagram data, never a fabricated pixel overlay.
 */
export interface ViSurfaceCoordinateChange {
  /** The raw detail-item text (retained verbatim). */
  text: string;
  /** The change action the item describes. */
  changeType: ComparisonDetailChangeType;
  /** The changed object's kind (e.g. `SubVI`), when the item names one. */
  objectKind?: string;
  /** The changed object's quoted name, when the item names one. */
  objectName?: string;
  /** The diagram coordinate (the `at`/`to` point for a placement or move). */
  coordinate?: DiagramPoint;
  /** The source coordinate of a move (`from (x,y) to (x,y)`), when present. */
  fromCoordinate?: DiagramPoint;
}

/** Per-changed-surface correlation between the comparison and the previews. */
export interface ViSurfaceCorrelation {
  surface: ViChangeSurface;
  /** Distinct change kinds present on this surface (stable order from the model). */
  changeKinds: ViChangeKind[];
  /** Number of classified detail items on this surface. */
  changeCount: number;
  /** Representative detail-item texts on this surface (bounded, for context). */
  sampleChanges: string[];
  /** Whether a base preview render is available to view this surface. */
  basePreviewAvailable: boolean;
  /** Whether a head preview render is available to view this surface. */
  headPreviewAvailable: boolean;
  /**
   * Whether the change on this surface can be cross-referenced against BOTH
   * previews (base and head both available). Iteration 1 is surface-level, so
   * this is availability-based, not pixel-precise.
   */
  correlated: boolean;
  /**
   * Per-object changes on this surface that carry a VI diagram coordinate
   * (VHS-REQ-703.11), bounded for context. Additive and optional; absent/empty
   * when the comparison report supplied no coordinate-bearing detail items for
   * this surface. Diagram-space coordinates, NOT preview pixels.
   */
  coordinateChanges?: ViSurfaceCoordinateChange[];
}

export interface ViPreviewComparisonCorrelation {
  schema: typeof VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA;
  vi: { title: string; relativePath?: string };
  hasDifferences: boolean;
  riskLevel?: ViChangeRiskLevel;
  classificationConfidence?: ViClassificationConfidence;
  previews: {
    base: ViPreviewReference;
    head: ViPreviewReference;
  };
  surfaces: ViSurfaceCorrelation[];
  totals: {
    changedSurfaceCount: number;
    correlatedSurfaceCount: number;
    uncorrelatedSurfaceCount: number;
  };
  narrative: string;
}

const MAX_SAMPLE_CHANGES = 5;

/** Upper bound on per-surface coordinate-bearing changes retained for context. */
const MAX_COORDINATE_CHANGES = 25;

/**
 * Collects the coordinate-bearing per-object changes for one surface from the
 * comparison model's additive detail-item geometry (VHS-REQ-703.10/.11). Only
 * items that actually carry a diagram coordinate are kept; the result is bounded
 * and undefined when there are none, so it stays additive/optional.
 */
function collectCoordinateChanges(
  detailSections: ViSemanticComparisonModel['detailSections'],
  surface: ViChangeSurface
): ViSurfaceCoordinateChange[] | undefined {
  const changes: ViSurfaceCoordinateChange[] = [];
  for (const section of detailSections) {
    if (section.surface !== surface) {
      continue;
    }
    for (const geometry of section.itemGeometry ?? []) {
      if (!hasDiagramCoordinate(geometry)) {
        continue;
      }
      const change: ViSurfaceCoordinateChange = {
        text: geometry.text,
        changeType: geometry.changeType
      };
      if (geometry.objectKind !== undefined) {
        change.objectKind = geometry.objectKind;
      }
      if (geometry.objectName !== undefined) {
        change.objectName = geometry.objectName;
      }
      if (geometry.coordinate !== undefined) {
        change.coordinate = geometry.coordinate;
      }
      if (geometry.fromCoordinate !== undefined) {
        change.fromCoordinate = geometry.fromCoordinate;
      }
      changes.push(change);
      if (changes.length >= MAX_COORDINATE_CHANGES) {
        return changes;
      }
    }
  }
  return changes.length > 0 ? changes : undefined;
}

function normalizePreview(ref: ViPreviewReference | undefined): ViPreviewReference {
  if (!ref || ref.available !== true) {
    return { available: false };
  }
  return {
    available: true,
    relativePath: ref.relativePath,
    revision: ref.revision,
    cacheKey: ref.cacheKey,
    inlineImageCount: ref.inlineImageCount
  };
}

/**
 * Build the deterministic surface-level correlation. Pure: same model + preview
 * references always produce the same correlation. Guards on the optional
 * VHS-REQ-702 classification fields, so a comparison model without classification
 * still yields a valid (surface-only) correlation.
 */
export function buildViPreviewComparisonCorrelation(
  model: ViSemanticComparisonModel,
  previews: ViPreviewPair = {}
): ViPreviewComparisonCorrelation {
  const base = normalizePreview(previews.base);
  const head = normalizePreview(previews.head);

  // Group the classified changes by surface (in the model's stable surface order).
  const classification = Array.isArray(model.classification) ? model.classification : [];
  const detailSections = Array.isArray(model.detailSections) ? model.detailSections : [];
  const surfaces: ViSurfaceCorrelation[] = model.changedSurfaces.map((surface) => {
    const onSurface = classification.filter((change) => change.surface === surface);
    const changeKinds: ViChangeKind[] = [];
    for (const change of onSurface) {
      if (!changeKinds.includes(change.kind)) {
        changeKinds.push(change.kind);
      }
    }
    const coordinateChanges = collectCoordinateChanges(detailSections, surface);
    // Fall back to the raw detail sections when no per-surface classification
    // entries exist, so a changed surface never reports 0 changes / empty
    // samples merely because the optional VHS-REQ-702 classification is absent.
    if (onSurface.length === 0) {
      const detailItems = detailSections
        .filter((section) => section.surface === surface)
        .flatMap((section) => section.items);
      return {
        surface,
        changeKinds,
        changeCount: detailItems.length,
        sampleChanges: detailItems.slice(0, MAX_SAMPLE_CHANGES),
        basePreviewAvailable: base.available,
        headPreviewAvailable: head.available,
        correlated: base.available && head.available,
        ...(coordinateChanges ? { coordinateChanges } : {})
      };
    }
    return {
      surface,
      changeKinds,
      changeCount: onSurface.length,
      sampleChanges: onSurface.slice(0, MAX_SAMPLE_CHANGES).map((change) => change.text),
      basePreviewAvailable: base.available,
      headPreviewAvailable: head.available,
      correlated: base.available && head.available,
      ...(coordinateChanges ? { coordinateChanges } : {})
    };
  });

  const correlatedSurfaceCount = surfaces.filter((entry) => entry.correlated).length;

  const correlation: Omit<ViPreviewComparisonCorrelation, 'narrative'> = {
    schema: VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA,
    vi: { title: model.vi.title, relativePath: model.vi.secondViPath ?? model.vi.firstViPath },
    hasDifferences: model.hasDifferences,
    riskLevel: model.riskLevel,
    classificationConfidence: model.classificationConfidence,
    previews: { base, head },
    surfaces,
    totals: {
      changedSurfaceCount: surfaces.length,
      correlatedSurfaceCount,
      uncorrelatedSurfaceCount: surfaces.length - correlatedSurfaceCount
    }
  };

  return { ...correlation, narrative: renderCorrelationNarrative(correlation) };
}

const SURFACE_LABELS: Record<ViChangeSurface, string> = {
  'front-panel': 'front panel',
  'block-diagram': 'block diagram',
  'connector-pane': 'connector pane',
  'vi-attributes': 'VI attributes',
  other: 'other VI content'
};

/**
 * Cross-referenced narrative citing BOTH the comparison classification and the
 * preview availability, honestly noting when a changed surface has no preview to
 * correlate against. Never asserts a correlation that was not established.
 */
export function renderCorrelationNarrative(
  correlation: Omit<ViPreviewComparisonCorrelation, 'narrative'>
): string {
  if (!correlation.hasDifferences) {
    return 'No LabVIEW differences were detected, so there is nothing to correlate with the previews.';
  }

  const sentences: string[] = [];
  const risk = correlation.riskLevel ? `${correlation.riskLevel}-risk` : 'unclassified';
  const conf = correlation.classificationConfidence === 'low' ? ' (low confidence)' : '';
  sentences.push(`${risk} change${conf}.`);

  for (const surface of correlation.surfaces) {
    const label = SURFACE_LABELS[surface.surface];
    const kinds = surface.changeKinds.length > 0 ? ` (${surface.changeKinds.join(', ')})` : '';
    const changeWord = surface.changeKinds.length > 0 ? 'classified change' : 'change';
    const previewNote = surface.correlated
      ? 'cross-reference the base and head previews for this surface'
      : surface.headPreviewAvailable || surface.basePreviewAvailable
        ? 'only one preview side is available; correlation is partial'
        : 'no preview is available to correlate this surface';
    sentences.push(
      `The ${label} has ${surface.changeCount} ${changeWord}${surface.changeCount === 1 ? '' : 's'}${kinds} — ${previewNote}.`
    );
  }

  if (correlation.totals.uncorrelatedSurfaceCount > 0) {
    sentences.push(
      `${correlation.totals.uncorrelatedSurfaceCount} of ${correlation.totals.changedSurfaceCount} changed surface(s) could not be correlated to a base+head preview pair.`
    );
  }

  return sentences.join(' ');
}

/** Escapes a value for a single Markdown table cell (backslashes, pipes, newlines). */
function escapeTableCell(value: string): string {
  // Escape the escape character FIRST so a literal backslash cannot combine with
  // the pipe escape we add next (otherwise `\` + `|` would produce `\\|` where
  // the backslash escapes our escape — incomplete escaping). Then escape pipes
  // (the cell delimiter) and flatten newlines that would break the row.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

/**
 * Renders a deterministic side-by-side surface table for a correlation
 * (VHS-REQ-703.8, epic #2262 iteration 3): one row per changed surface showing
 * the change kinds, the change count, whether the base and head previews are
 * available to view that surface, and (VHS-REQ-703.11) a compact list of the
 * per-object changes carrying a VI diagram coordinate. It is honest and
 * availability-based — a `—` marks an unavailable preview side or a surface with
 * no coordinate-bearing change, never a fabricated one — and stays surface-level:
 * the coordinates are labeled DIAGRAM-space references, NOT preview-pixel
 * overlays (that needs the coordinate-frames export). Returns an empty string
 * when there are no differences or no changed surfaces, so a caller can append it
 * unconditionally.
 */
export function renderCorrelationSurfaceTable(
  correlation: Pick<
    ViPreviewComparisonCorrelation,
    'hasDifferences' | 'surfaces' | 'totals'
  >
): string {
  if (!correlation.hasDifferences || correlation.surfaces.length === 0) {
    return '';
  }

  const availability = (present: boolean): string => (present ? '✓ available' : '— unavailable');
  const lines: string[] = [
    '| Surface | Change kinds | Changes | Base preview | Head preview | Diagram coordinates |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const surface of correlation.surfaces) {
    const label = SURFACE_LABELS[surface.surface];
    const kinds = surface.changeKinds.length > 0 ? surface.changeKinds.join(', ') : '—';
    lines.push(
      `| ${escapeTableCell(label)} | ${escapeTableCell(kinds)} | ${surface.changeCount} | ` +
        `${availability(surface.basePreviewAvailable)} | ${availability(surface.headPreviewAvailable)} | ` +
        `${escapeTableCell(renderCoordinateCell(surface.coordinateChanges))} |`
    );
  }

  const { correlatedSurfaceCount, changedSurfaceCount } = correlation.totals;
  lines.push(
    '',
    `_${correlatedSurfaceCount} of ${changedSurfaceCount} changed surface(s) have both base and head previews available for side-by-side review._`
  );

  return lines.join('\n');
}

/** Formats a single diagram point as `(x,y)`. */
function formatPoint(point: DiagramPoint): string {
  return `(${point.x},${point.y})`;
}

/**
 * Renders the compact "Diagram coordinates" table cell for a surface: a bounded,
 * labeled list of the object changes that carry a diagram coordinate. These are
 * VI DIAGRAM coordinates, never preview pixels, so the cell is explicitly a
 * diagram-space reference and never implies a pixel overlay. Returns `—` when
 * the surface has no coordinate-bearing changes.
 */
function renderCoordinateCell(changes: ViSurfaceCoordinateChange[] | undefined): string {
  if (!changes || changes.length === 0) {
    return '—';
  }
  const MAX_CELL_ENTRIES = 3;
  const shown = changes.slice(0, MAX_CELL_ENTRIES).map((change) => {
    const name = change.objectName ?? change.objectKind ?? change.changeType;
    // Show both endpoints of a move (`from -> to`) when both are known, so the
    // cell does not silently drop the source coordinate; otherwise show the
    // single available point.
    let point = '';
    if (change.fromCoordinate !== undefined && change.coordinate !== undefined) {
      point = `${formatPoint(change.fromCoordinate)}→${formatPoint(change.coordinate)}`;
    } else if (change.coordinate !== undefined) {
      point = formatPoint(change.coordinate);
    } else if (change.fromCoordinate !== undefined) {
      point = formatPoint(change.fromCoordinate);
    }
    return point ? `${name} ${point}` : name;
  });
  const remainder = changes.length - shown.length;
  const suffix = remainder > 0 ? `, +${remainder} more` : '';
  return `${shown.join('; ')}${suffix}`;
}
