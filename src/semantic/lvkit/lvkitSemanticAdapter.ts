// Pure adapter: `lvkit diff` change map -> the repo's ViSemanticComparisonModel
// (VHS-REQ-712). This is the heart of the LabVIEW-free semantic backend: it
// projects lvkit's UID-correlated block-diagram change map onto the SAME
// `vi-history-suite/vi-semantic-comparison@v1` model the LabVIEW-backed
// `compareViRevisions` produces, so every MCP semantic tool, cache, and
// validator consumes one shape regardless of backend.
//
// Faithfulness strategy: each lvkit change is formatted into NI's own
// `diff-detail` grammar (`SubVI "X.vi" - added at (x,y)`, `Wire "err" - deleted`),
// which lets the SHARED geometry parser and change classifier run unchanged.
// SubVI changes classify as dependency, wire changes as behavioral, other nodes
// as structural — identical to a LabVIEW-parsed report.
//
// Honest scope: lvkit reads the block diagram (structure + dataflow), not the
// front panel or VI attributes, so the model marks block-diagram INCLUDED and
// the cosmetic/attribute surfaces EXCLUDED. A consumer therefore knows an
// lvkit-backed comparison is block-diagram-scoped, never a fabricated full diff.
//
// Pure and dependency-free (a parsed lvkit document in, a model out) so it is
// deterministically unit tested without lvkit, LabVIEW, Python, or a runtime.

import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViChangeSurface,
  type ViSemanticComparisonModel,
  type ViSemanticDetailSection,
  type ViSemanticRevisionFacts
} from '../viSemanticModel';
import { deriveChangeClassification } from '../viChangeClassification';
import { parseComparisonDetailItemsGeometry } from '../../dashboard/comparisonDetailItemGeometry';
import type { LvkitBounds, LvkitDiffChange, LvkitDiffDocument } from './lvkitDiffModel';

/** Provenance context for a model the lvkit backend produced. */
export interface LvkitSemanticComparisonContext {
  /** VI title (usually the file's base name). */
  title: string;
  firstViPath?: string;
  secondViPath?: string;
  revisions?: ViSemanticRevisionFacts;
  /** LabVIEW year lvkit resolved the VI against, when known (evidence only). */
  labviewVersion?: string;
}

const BLOCK_DIAGRAM: ViChangeSurface = 'block-diagram';
// lvkit reads the block diagram only; the cosmetic/attribute surfaces are out of
// scope for a structural diff and are reported EXCLUDED so the model is honest.
const LVKIT_INCLUDED_ATTRIBUTES: readonly string[] = ['block diagram'];
const LVKIT_EXCLUDED_ATTRIBUTES: readonly string[] = [
  'front panel',
  'connector pane',
  'VI attributes'
];

function mapChangeVerb(change: string): string {
  switch (change) {
    case 'added':
      return 'added';
    case 'removed':
      return 'deleted';
    case 'modified':
      return 'changed';
    case 'moved':
      return 'moved';
    default:
      return change;
  }
}

function objectKindFor(change: LvkitDiffChange): string {
  if (change.kind === 'wire') {
    return 'Wire';
  }
  if (change.kind === 'node') {
    const label = change.label ?? '';
    return /\.vi$/i.test(label) ? 'SubVI' : 'Node';
  }
  // Preserve an unrecognized kind verbatim, title-cased, so nothing is dropped.
  return change.kind.charAt(0).toUpperCase() + change.kind.slice(1);
}

function pointFrom(bounds: LvkitBounds | undefined): { x: number; y: number } | undefined {
  if (!bounds) {
    return undefined;
  }
  return { x: Math.round(bounds[0]), y: Math.round(bounds[1]) };
}

/**
 * VHS-REQ-712.2: format one lvkit change into an NI `diff-detail` grammar line so
 * the shared geometry parser and classifier read it unchanged. A moved node with
 * both boxes renders `from (x,y) to (x,y)`; otherwise the placed coordinate is
 * appended as `at (x,y)`. lvkit `detail` (e.g. a wire's source subVI) is appended
 * verbatim after an em dash.
 */
export function formatLvkitChangeAsDetailItem(change: LvkitDiffChange): string {
  const kind = objectKindFor(change);
  const name = change.label ?? change.uid;
  const verb = mapChangeVerb(change.change);
  let line = `${kind} "${name}" - ${verb}`;

  const after = pointFrom(change.bounds);
  const before = pointFrom(change.boundsBefore);
  if (change.change === 'moved' && before && after) {
    line += ` from (${before.x},${before.y}) to (${after.x},${after.y})`;
  } else {
    const at = after ?? before;
    if (at) {
      line += ` at (${at.x},${at.y})`;
    }
  }
  if (change.detail) {
    line += ` \u2014 ${change.detail}`;
  }
  return line;
}

interface LvkitChangeTally {
  nodesAdded: number;
  nodesRemoved: number;
  nodesModified: number;
  wireChanges: number;
}

function tallyChanges(changes: readonly LvkitDiffChange[]): LvkitChangeTally {
  const tally: LvkitChangeTally = {
    nodesAdded: 0,
    nodesRemoved: 0,
    nodesModified: 0,
    wireChanges: 0
  };
  for (const change of changes) {
    if (change.kind === 'wire') {
      tally.wireChanges += 1;
    } else if (change.change === 'added') {
      tally.nodesAdded += 1;
    } else if (change.change === 'removed') {
      tally.nodesRemoved += 1;
    } else {
      tally.nodesModified += 1;
    }
  }
  return tally;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildNarrative(
  diff: LvkitDiffDocument,
  tally: LvkitChangeTally,
  riskLevel?: string
): string {
  if (diff.changes.length === 0) {
    return (
      'No block-diagram differences detected by the LabVIEW-free (lvkit) semantic diff ' +
      `across ${plural(diff.commonNodes, 'common node')}. Front-panel cosmetics and VI ` +
      'attributes are out of scope for this backend.'
    );
  }
  const parts: string[] = [];
  if (tally.nodesAdded > 0) {
    parts.push(`${plural(tally.nodesAdded, 'node')} added`);
  }
  if (tally.nodesRemoved > 0) {
    parts.push(`${plural(tally.nodesRemoved, 'node')} removed`);
  }
  if (tally.nodesModified > 0) {
    parts.push(`${plural(tally.nodesModified, 'node')} modified`);
  }
  if (tally.wireChanges > 0) {
    parts.push(plural(tally.wireChanges, 'wire change'));
  }
  const breakdown = parts.length > 0 ? `: ${parts.join(', ')}` : '';
  const risk = riskLevel ? ` Risk assessed ${riskLevel}.` : '';
  return (
    `lvkit found ${plural(diff.changes.length, 'block-diagram change')} across ` +
    `${plural(diff.commonNodes, 'common node')}${breakdown}. This LabVIEW-free semantic ` +
    `diff covers the block diagram only.${risk}`
  );
}

/**
 * VHS-REQ-712.3: project a parsed lvkit diff document onto the shared
 * `vi-semantic-comparison@v1` model. All changes are block-diagram surface; the
 * shared classifier and geometry parser run over the NI-grammar detail items so
 * the model is identical in shape to a LabVIEW-backed one, with the runtime
 * provider recorded as `lvkit` and the front-panel/attribute surfaces marked
 * excluded (out of scope for a structural diff).
 */
export function buildViSemanticModelFromLvkitDiff(
  diff: LvkitDiffDocument,
  context: LvkitSemanticComparisonContext
): ViSemanticComparisonModel {
  const items = diff.changes.map((change) => formatLvkitChangeAsDetailItem(change));
  const hasDifferences = items.length > 0;
  const tally = tallyChanges(diff.changes);

  const detailSections: ViSemanticDetailSection[] = hasDifferences
    ? [
        {
          surface: BLOCK_DIAGRAM,
          heading: 'Block Diagram',
          items,
          itemCount: items.length,
          itemGeometry: parseComparisonDetailItemsGeometry(items)
        }
      ]
    : [];

  const classification = deriveChangeClassification(
    detailSections.map((section) => ({ surface: section.surface, items: section.items })),
    LVKIT_INCLUDED_ATTRIBUTES
  );

  const changedSurfaces: ViChangeSurface[] = hasDifferences ? [BLOCK_DIAGRAM] : [];
  const included = [...LVKIT_INCLUDED_ATTRIBUTES];
  const excluded = [...LVKIT_EXCLUDED_ATTRIBUTES];

  const model: ViSemanticComparisonModel = {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    vi: {
      title: context.title,
      ...(context.firstViPath ? { firstViPath: context.firstViPath } : {}),
      ...(context.secondViPath ? { secondViPath: context.secondViPath } : {})
    },
    ...(context.revisions ? { revisions: context.revisions } : {}),
    runtime: {
      provider: 'lvkit',
      engine: 'lvkit-diff',
      ...(context.labviewVersion ? { labviewVersion: context.labviewVersion } : {})
    },
    hasDifferences,
    changedSurfaces,
    attributes: { included, excluded },
    overviewSections: [],
    detailSections,
    totals: {
      changedSurfaceCount: changedSurfaces.length,
      overviewImageCount: 0,
      detailSectionCount: detailSections.length,
      detailItemCount: items.length,
      includedAttributeCount: included.length,
      excludedAttributeCount: excluded.length
    },
    classification: classification.classification,
    changeKinds: classification.changeKinds,
    riskLevel: classification.riskLevel,
    riskRationale: classification.riskRationale,
    classificationConfidence: classification.classificationConfidence,
    narrative: buildNarrative(diff, tally, hasDifferences ? classification.riskLevel : undefined)
  };
  return model;
}
