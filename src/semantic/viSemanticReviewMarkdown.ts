import type { ViChangeSurface, ViSemanticComparisonModel } from './viSemanticModel';
import type { ViSemanticHistory } from './viSemanticHistory';
import type { ViSemanticPrReview } from './viSemanticPrReview';

/**
 * Pure renderers that turn the semantic comparison / history / PR-review models
 * into review-ready Markdown blocks (for PR comments, CI job summaries, or SCM
 * surfaces). Type-only imports keep this a dependency-free leaf module.
 */

/**
 * Hidden HTML-comment marker prepended to a rendered PR review so any poster can
 * find and update the single "sticky" review comment instead of creating a new
 * one on every run. Invisible in rendered Markdown; present in the raw body.
 */
export const VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER =
  '<!-- vi-history-suite:vi-semantic-pr-review -->';

const SURFACE_LABELS: Record<ViChangeSurface, string> = {
  'front-panel': 'front panel',
  'block-diagram': 'block diagram',
  'connector-pane': 'connector pane',
  'vi-attributes': 'VI attributes',
  other: 'other VI content'
};

export function surfaceList(surfaces: readonly ViChangeSurface[]): string {
  return surfaces.map((surface) => SURFACE_LABELS[surface]).join(', ');
}

export function escapeCell(text: string): string {
  // Escape backslashes first, then table-breaking pipes, so a literal backslash
  // in the input cannot corrupt the pipe escaping (js/incomplete-sanitization).
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
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

/**
 * Renders a PR review as a review-ready, "sticky" Markdown comment: a hidden
 * upsert marker, a summary line, a per-VI result table, and detail blocks for
 * the VIs that changed (reusing the shared single-comparison renderer). The
 * leading {@link VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER} lets a poster update the
 * one review comment in place rather than adding a fresh comment each run.
 */
export function renderViSemanticPrReviewMarkdown(review: ViSemanticPrReview): string {
  const lines: string[] = [
    VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
    '## VI semantic review',
    '',
    review.narrative,
    ''
  ];

  if (review.entries.length === 0) {
    return `${lines.join('\n').trimEnd()}\n`;
  }

  lines.push('| VI | Result | Changed surfaces |', '| --- | --- | --- |');
  for (const entry of review.entries) {
    if (entry.status === 'completed') {
      const result = entry.hasDifferences ? 'Changed' : 'No differences';
      const surfaces =
        entry.hasDifferences && entry.model.changedSurfaces.length > 0
          ? surfaceList(entry.model.changedSurfaces)
          : '—';
      lines.push(`| ${escapeCell(entry.relativePath)} | ${result} | ${escapeCell(surfaces)} |`);
    } else {
      lines.push(`| ${escapeCell(entry.relativePath)} | ${entry.status} | — |`);
    }
  }
  lines.push('');

  for (const entry of review.entries) {
    if (entry.status === 'completed' && entry.hasDifferences) {
      lines.push(`#### ${escapeCell(entry.relativePath)}`, '', renderViSemanticComparisonMarkdown(entry.model), '');
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
