import {
  ParsedNiComparisonReport,
  parseNiComparisonReportHtml
} from '../dashboard/niComparisonReportParser';

/**
 * Stable, versioned identifier for the VI semantic comparison model. Consumers
 * (the Source Control hover, PR/CI review surfaces, and the MCP agent
 * interface) key off this string so the representation can evolve without
 * silently breaking downstream tools.
 */
export const VI_SEMANTIC_COMPARISON_SCHEMA =
  'vi-history-suite/vi-semantic-comparison@v1';

/**
 * The LabVIEW surfaces a change can touch. `other` is the explicit escape hatch
 * for captions/detail sections the heuristic does not recognize, so nothing is
 * silently dropped.
 */
export type ViChangeSurface =
  | 'front-panel'
  | 'block-diagram'
  | 'connector-pane'
  | 'vi-attributes'
  | 'other';

export interface ViSemanticRevisionFacts {
  baseHash?: string;
  selectedHash?: string;
}

export interface ViSemanticRuntimeFacts {
  provider?: string;
  engine?: string;
  labviewVersion?: string;
  bitness?: string;
}

export interface ViSemanticOverviewSection {
  surface: ViChangeSurface;
  caption: string;
  imageCount: number;
}

export interface ViSemanticDetailSection {
  surface: ViChangeSurface;
  heading: string;
  items: string[];
  itemCount: number;
}

export interface ViSemanticComparisonModel {
  schema: typeof VI_SEMANTIC_COMPARISON_SCHEMA;
  vi: {
    title: string;
    firstViPath?: string;
    secondViPath?: string;
  };
  revisions?: ViSemanticRevisionFacts;
  runtime?: ViSemanticRuntimeFacts;
  hasDifferences: boolean;
  changedSurfaces: ViChangeSurface[];
  attributes: {
    included: string[];
    excluded: string[];
  };
  overviewSections: ViSemanticOverviewSection[];
  detailSections: ViSemanticDetailSection[];
  totals: {
    changedSurfaceCount: number;
    overviewImageCount: number;
    detailSectionCount: number;
    detailItemCount: number;
    includedAttributeCount: number;
    excludedAttributeCount: number;
  };
  narrative: string;
}

export interface BuildViSemanticComparisonModelInput {
  report: ParsedNiComparisonReport;
  revisions?: ViSemanticRevisionFacts;
  runtime?: ViSemanticRuntimeFacts;
}

const SURFACE_LABELS: Record<ViChangeSurface, string> = {
  'front-panel': 'front panel',
  'block-diagram': 'block diagram',
  'connector-pane': 'connector pane',
  'vi-attributes': 'VI attributes',
  other: 'other VI content'
};

/**
 * Maps a caption, heading, or detail line to the LabVIEW surface it concerns.
 * Keyword-based and deliberately conservative: unrecognized text is `other`
 * rather than being force-fit into a surface.
 */
export function deriveViChangeSurface(text: string): ViChangeSurface {
  const normalized = text.trim().toLowerCase();
  if (normalized.includes('block diagram')) {
    return 'block-diagram';
  }
  if (normalized.includes('front panel')) {
    return 'front-panel';
  }
  if (normalized.includes('connector pane') || normalized.includes('connector-pane')) {
    return 'connector-pane';
  }
  if (normalized.includes('attribute')) {
    return 'vi-attributes';
  }
  return 'other';
}

const SURFACE_ORDER: ViChangeSurface[] = [
  'front-panel',
  'block-diagram',
  'connector-pane',
  'vi-attributes',
  'other'
];

function orderSurfaces(surfaces: Iterable<ViChangeSurface>): ViChangeSurface[] {
  const present = new Set(surfaces);
  return SURFACE_ORDER.filter((surface) => present.has(surface));
}

/**
 * Projects the parsed NI comparison report onto the stable semantic model.
 * Pure: the same report and metadata always produce the same model, so it is
 * safe to cache, diff, or feed to an agent.
 */
export function buildViSemanticComparisonModel(
  input: BuildViSemanticComparisonModelInput
): ViSemanticComparisonModel {
  const { report } = input;

  const overviewSections: ViSemanticOverviewSection[] = report.overviewSections.map(
    (section) => ({
      surface: deriveViChangeSurface(section.caption),
      caption: section.caption,
      imageCount: section.images.length
    })
  );

  const detailSections: ViSemanticDetailSection[] = report.detailSections.map((section) => ({
    surface: deriveViChangeSurface(section.heading),
    heading: section.heading,
    items: section.items,
    itemCount: section.items.length
  }));

  const included = report.includedAttributes
    .filter((attribute) => attribute.included)
    .map((attribute) => attribute.label);
  const excluded = report.includedAttributes
    .filter((attribute) => !attribute.included)
    .map((attribute) => attribute.label);

  // NI always renders both a "Front Panel Overview" and a "Block Diagram
  // Overview" caption whenever any difference exists: those captions are a
  // fixed side-by-side snapshot view, not a per-surface change signal. The
  // authoritative record of which surfaces actually changed is NI's itemized
  // detail-section headings. Fall back to the overview captions only when the
  // report has no detail sections, so a detail-less difference still surfaces
  // something rather than nothing.
  const changedSurfaceSet = new Set<ViChangeSurface>();
  for (const section of detailSections) {
    changedSurfaceSet.add(section.surface);
  }
  if (changedSurfaceSet.size === 0) {
    for (const section of overviewSections) {
      changedSurfaceSet.add(section.surface);
    }
  }
  const changedSurfaces = orderSurfaces(changedSurfaceSet);

  const overviewImageCount = overviewSections.reduce(
    (total, section) => total + section.imageCount,
    0
  );
  const detailItemCount = detailSections.reduce(
    (total, section) => total + section.itemCount,
    0
  );

  const hasDifferences = overviewSections.length > 0 || detailSections.length > 0;

  const model: Omit<ViSemanticComparisonModel, 'narrative'> = {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    vi: {
      title: report.reportTitle,
      firstViPath: report.firstViPath,
      secondViPath: report.secondViPath
    },
    revisions: input.revisions,
    runtime: input.runtime,
    hasDifferences,
    changedSurfaces,
    attributes: { included, excluded },
    overviewSections,
    detailSections,
    totals: {
      changedSurfaceCount: changedSurfaces.length,
      overviewImageCount,
      detailSectionCount: detailSections.length,
      detailItemCount,
      includedAttributeCount: included.length,
      excludedAttributeCount: excluded.length
    }
  };

  return { ...model, narrative: renderViSemanticNarrative(model) };
}

/**
 * Convenience wrapper: parse a raw NI comparison report HTML string and project
 * it onto the semantic model in one step. `reportFilePath` only anchors the
 * parser's relative asset resolution; no filesystem access occurs.
 */
export function buildViSemanticComparisonModelFromHtml(
  html: string,
  options: {
    reportFilePath?: string;
    revisions?: ViSemanticRevisionFacts;
    runtime?: ViSemanticRuntimeFacts;
  } = {}
): ViSemanticComparisonModel {
  const report = parseNiComparisonReportHtml(
    html,
    options.reportFilePath ?? 'comparison-report.html'
  );
  return buildViSemanticComparisonModel({
    report,
    revisions: options.revisions,
    runtime: options.runtime
  });
}

function joinHumanList(values: readonly string[]): string {
  if (values.length === 0) {
    return '';
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

/**
 * Produces a concise, human- and agent-readable "what changed" narrative. This
 * is the reviewable unit surfaced in the Source Control hover, PR/CI comment,
 * and MCP tool output.
 */
export function renderViSemanticNarrative(
  model: Omit<ViSemanticComparisonModel, 'narrative'>
): string {
  if (!model.hasDifferences) {
    return 'No LabVIEW differences were detected between the two revisions.';
  }

  const sentences: string[] = [];

  const surfaceLabels = model.changedSurfaces
    .filter((surface) => surface !== 'vi-attributes')
    .map((surface) => SURFACE_LABELS[surface]);
  if (surfaceLabels.length > 0) {
    const verb = surfaceLabels.length === 1 ? 'differs' : 'differ';
    sentences.push(`The ${joinHumanList(surfaceLabels)} ${verb}.`);
  }

  if (model.detailSections.length > 0) {
    const detailCount = model.totals.detailItemCount;
    const sectionCount = model.totals.detailSectionCount;
    sentences.push(
      `${detailCount} detailed change${detailCount === 1 ? '' : 's'} across ${sectionCount} section${
        sectionCount === 1 ? '' : 's'
      } (${joinHumanList(model.detailSections.map((section) => section.heading))}).`
    );
  }

  if (model.attributes.included.length > 0) {
    sentences.push(
      `Compared attributes: ${joinHumanList(model.attributes.included)}.`
    );
  }
  if (model.attributes.excluded.length > 0) {
    sentences.push(
      `Excluded from comparison: ${joinHumanList(model.attributes.excluded)}.`
    );
  }

  return sentences.join(' ');
}
