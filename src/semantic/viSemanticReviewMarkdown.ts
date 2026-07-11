import type { ViChangeSurface, ViSemanticComparisonModel } from './viSemanticModel';
import type { ViSemanticHistory } from './viSemanticHistory';

/**
 * Pure renderers that turn the semantic comparison / history models into
 * review-ready Markdown blocks (for PR comments, CI job summaries, or SCM
 * surfaces). Type-only imports keep this a dependency-free leaf module.
 */

const SURFACE_LABELS: Record<ViChangeSurface, string> = {
  'front-panel': 'front panel',
  'block-diagram': 'block diagram',
  'connector-pane': 'connector pane',
  'vi-attributes': 'VI attributes',
  other: 'other VI content'
};

function surfaceList(surfaces: readonly ViChangeSurface[]): string {
  return surfaces.map((surface) => SURFACE_LABELS[surface]).join(', ');
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/**
 * Renders a single VI comparison as a concise, review-ready Markdown block:
 * a heading, the "what changed" narrative, and a compact facts list. Raw
 * detail lines are intentionally omitted to keep the artifact scannable.
 */
export function renderViSemanticComparisonMarkdown(model: ViSemanticComparisonModel): string {
  const lines: string[] = [`### VI comparison: ${model.vi.title}`, '', model.narrative];

  const facts: string[] = [];
  if (model.changedSurfaces.length > 0) {
    facts.push(`- **Changed surfaces:** ${surfaceList(model.changedSurfaces)}`);
  }
  if (model.attributes.included.length > 0) {
    facts.push(`- **Compared attributes:** ${model.attributes.included.join(', ')}`);
  }
  if (model.attributes.excluded.length > 0) {
    facts.push(`- **Excluded attributes:** ${model.attributes.excluded.join(', ')}`);
  }
  if (model.detailSections.length > 0) {
    const sectionCount = model.totals.detailSectionCount;
    facts.push(
      `- **Detailed changes:** ${model.totals.detailItemCount} across ${sectionCount} section${
        sectionCount === 1 ? '' : 's'
      }`
    );
  }
  if (model.revisions?.baseHash || model.revisions?.selectedHash) {
    facts.push(
      `- **Revisions:** \`${model.revisions?.baseHash ?? '?'}\` -> \`${
        model.revisions?.selectedHash ?? '?'
      }\``
    );
  }

  if (facts.length > 0) {
    lines.push('', ...facts);
  }
  return lines.join('\n');
}

/**
 * Renders a VI semantic history as a review-ready Markdown block: a heading,
 * the aggregate narrative, and a per-transition table.
 */
export function renderViSemanticHistoryMarkdown(history: ViSemanticHistory): string {
  const name = history.vi.title ?? history.vi.relativePath;
  const lines: string[] = [`### VI history: ${name}`, '', history.narrative];

  if (history.steps.length > 0) {
    lines.push('', '| Revision | Changed | Surfaces |', '| --- | --- | --- |');
    for (const step of history.steps) {
      const revision = `\`${step.selectedHash.slice(0, 8)}\` ${escapeCell(step.subject)}`;
      const changed =
        step.status !== 'completed' ? step.status : step.hasDifferences ? 'yes' : 'no';
      const surfaces =
        step.changedSurfaces.length > 0 ? surfaceList(step.changedSurfaces) : '-';
      lines.push(`| ${revision} | ${changed} | ${surfaces} |`);
    }
  }
  return lines.join('\n');
}
