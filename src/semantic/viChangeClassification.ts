import type { ViChangeSurface } from './viSemanticModel';

/**
 * Semantic Diff Intelligence (VHS-REQ-702): reviewer-grade change classification.
 *
 * This is a pure, deterministic projection of the parsed NI comparison report's
 * detail items onto a change-KIND taxonomy plus an aggregate RISK level. It is
 * intentionally heuristic: the only available signal is the textual detail-item
 * grammar NI emits (e.g. `SubVI "X.vi" - deleted at (x,y)`, `wiring changes`)
 * plus NI's own included/excluded functional-vs-cosmetic attribute flags. It is
 * NOT a binary/AST semantic analysis, so every result carries an explicit
 * `confidence` signal and unrecognized items are classified `unknown` rather
 * than being force-fit. Determinism (same input => same output) keeps it safe
 * for caching, tests, and the coverage gate.
 */

/**
 * What KIND of change a single detail item represents. `unknown` is the explicit
 * escape hatch for item text the keyword map does not recognize; it is never
 * force-fit into another kind and is counted separately so callers can gauge
 * coverage.
 */
export type ViChangeKind =
  | 'structural'
  | 'behavioral'
  | 'interface'
  | 'dependency'
  | 'cosmetic'
  | 'unknown';

/** Aggregate risk level for a VI, derived monotonically from the kinds present. */
export type ViChangeRiskLevel = 'low' | 'medium' | 'high';

/**
 * How much to trust the classification. `high` when every item was recognized
 * and NI's attribute flags corroborate the claim; `low` when any item is
 * `unknown` or the enabled comparison dimensions conflict with a claim.
 */
export type ViClassificationConfidence = 'high' | 'low';

/** A single classified detail item, parallel to the model's detail-section items. */
export interface ViClassifiedChange {
  surface: ViChangeSurface;
  kind: ViChangeKind;
  text: string;
}

/** A detail section reduced to the fields the classifier needs. */
export interface ViChangeClassificationSection {
  surface: ViChangeSurface;
  items: readonly string[];
}

/** The full classification result surfaced as additive model fields. */
export interface ViChangeClassification {
  classification: ViClassifiedChange[];
  changeKinds: ViChangeKind[];
  riskLevel: ViChangeRiskLevel;
  riskRationale: string;
  classificationConfidence: ViClassificationConfidence;
}

// Kinds that make a change consequential enough to force `high` risk: they can
// alter what the VI does or its public contract.
const HIGH_RISK_KINDS: readonly ViChangeKind[] = ['dependency', 'behavioral', 'interface'];

// Stable presentation order for the distinct-kinds list (highest concern first,
// `unknown` last) so output is deterministic regardless of item order.
const KIND_ORDER: readonly ViChangeKind[] = [
  'dependency',
  'behavioral',
  'interface',
  'structural',
  'cosmetic',
  'unknown'
];

/**
 * Classify one NI detail-item line into a change kind. Ordered first-match:
 * dependency, behavioral, and interface are checked BEFORE the generic
 * structural add/delete rule so that e.g. `SubVI "X.vi" - deleted` is a
 * dependency change (not merely a structural object delete) and `wiring
 * changes` is behavioral. Case-insensitive; empty/whitespace => `unknown`.
 */
export function classifyDetailItem(text: string): ViChangeKind {
  const value = (text ?? '').trim().toLowerCase();
  if (value.length === 0) {
    return 'unknown';
  }

  // 1. Dependency: subVI / typedef / class / linkage references.
  if (
    /\bsubvi\b/.test(value) ||
    /\btypedef\b|type def/.test(value) ||
    /\bpolymorphic vi\b/.test(value) ||
    /\bclass\b/.test(value) ||
    /vi missing/.test(value) ||
    /vi linkage/.test(value) ||
    /\brelinked\b|\blinked\b/.test(value)
  ) {
    return 'dependency';
  }

  // 2. Behavioral: wiring / dataflow / execution-structure changes.
  if (
    /wir(e|ed|ing)/.test(value) ||
    /rewire/.test(value) ||
    /dataflow|data flow/.test(value) ||
    /sequence structure/.test(value) ||
    /case structure/.test(value) ||
    /event structure/.test(value) ||
    /\bexecution\b|reentran|\bclump\b/.test(value)
  ) {
    return 'behavioral';
  }

  // 3. Interface: connector pane / terminal pattern, or control/indicator
  //    add/remove/retype that changes the VI's public signature.
  if (
    /connector pane|connector-pane|terminal pattern/.test(value) ||
    /(control|indicator)\b[\s\S]*(added|deleted|removed|retyped|data ?type)/.test(value) ||
    /data ?type changed/.test(value)
  ) {
    return 'interface';
  }

  // 4. Cosmetic: position/size/color/label/font/decoration only.
  if (
    /position|moved|resiz|\bsize\b/.test(value) ||
    /colou?r/.test(value) ||
    /\blabel\b|caption|font|decoration|free label|cosmetic/.test(value)
  ) {
    return 'cosmetic';
  }

  // 5. Structural: object add/delete/move on the diagram or panel (constants,
  //    nodes, functions, coordinate-anchored add/delete). Last concrete rule
  //    before `unknown`.
  if (
    /constant\b/.test(value) ||
    /\bnode\b|function\b/.test(value) ||
    /added at|deleted at/.test(value) ||
    /\badded\b|\bdeleted\b|\bremoved\b/.test(value)
  ) {
    return 'structural';
  }

  return 'unknown';
}

// Order distinct kinds by KIND_ORDER for deterministic output.
function orderKinds(kinds: Iterable<ViChangeKind>): ViChangeKind[] {
  const present = new Set(kinds);
  return KIND_ORDER.filter((kind) => present.has(kind));
}

// Aggregate the distinct kinds present into a monotone risk level + rationale.
function deriveRisk(kinds: ReadonlySet<ViChangeKind>): {
  riskLevel: ViChangeRiskLevel;
  riskRationale: string;
} {
  const highDrivers = HIGH_RISK_KINDS.filter((kind) => kinds.has(kind));
  if (highDrivers.length > 0) {
    return {
      riskLevel: 'high',
      riskRationale: `high: ${highDrivers.join(' + ')} change(s)`
    };
  }
  if (kinds.has('structural')) {
    return { riskLevel: 'medium', riskRationale: 'medium: structural change(s)' };
  }
  // Only low-severity kinds remain (cosmetic and/or unknown). Name them
  // accurately: `unknown` must never be reported as "cosmetic only" because that
  // would imply a certainty the classifier explicitly avoids. Confidence is
  // already `low` when unknown items are present, so the two signals agree.
  const hasCosmetic = kinds.has('cosmetic');
  const hasUnknown = kinds.has('unknown');
  if (hasCosmetic && hasUnknown) {
    return { riskLevel: 'low', riskRationale: 'low: cosmetic and unclassified change(s)' };
  }
  if (hasUnknown) {
    return { riskLevel: 'low', riskRationale: 'low: unclassified change(s) only' };
  }
  if (hasCosmetic) {
    return { riskLevel: 'low', riskRationale: 'low: cosmetic change(s) only' };
  }
  return { riskLevel: 'low', riskRationale: 'low: no classified changes' };
}

// Determine confidence. `low` when any item is unrecognized, when there is no
// classified item at all, or when a behavioral/structural block-diagram claim is
// made but NI did not compare the block-diagram functional dimension (attribute
// conflict). `high` otherwise.
function deriveConfidence(
  classified: readonly ViClassifiedChange[],
  kinds: ReadonlySet<ViChangeKind>,
  includedAttributes: readonly string[]
): ViClassificationConfidence {
  if (classified.length === 0) {
    return 'low';
  }
  if (kinds.has('unknown')) {
    return 'low';
  }
  const claimsBlockDiagramFunctional = classified.some(
    (change) =>
      change.surface === 'block-diagram' &&
      (change.kind === 'behavioral' || change.kind === 'structural')
  );
  if (claimsBlockDiagramFunctional) {
    const functionalCompared = includedAttributes.some((label) =>
      /block diagram functional/i.test(label)
    );
    if (!functionalCompared) {
      return 'low';
    }
  }
  return 'high';
}

/**
 * Project the report's detail sections (surface + item text) plus NI's included
 * attribute labels onto the change-classification result. Pure and deterministic.
 */
export function deriveChangeClassification(
  sections: readonly ViChangeClassificationSection[],
  includedAttributes: readonly string[] = []
): ViChangeClassification {
  const classification: ViClassifiedChange[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      classification.push({
        surface: section.surface,
        kind: classifyDetailItem(item),
        text: item
      });
    }
  }

  const kindSet = new Set<ViChangeKind>(classification.map((change) => change.kind));
  const { riskLevel, riskRationale } = deriveRisk(kindSet);
  const classificationConfidence = deriveConfidence(classification, kindSet, includedAttributes);

  return {
    classification,
    changeKinds: orderKinds(kindSet),
    riskLevel,
    riskRationale,
    classificationConfidence
  };
}
