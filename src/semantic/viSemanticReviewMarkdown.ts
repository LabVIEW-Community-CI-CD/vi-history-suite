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

/**
 * Renders the VHS-REQ-702 change-classification risk of a comparison model as a
 * compact table-cell label, honestly marking a low-confidence heuristic. Returns
 * `—` when the (optional, additive on @v1) classification fields are absent, so a
 * legacy or `--from-file` model renders exactly as before.
 */
export function riskCellLabel(model: ViSemanticComparisonModel): string {
  if (!model.riskLevel) {
    return '—';
  }
  const kinds = model.changeKinds && model.changeKinds.length > 0
    ? ` (${model.changeKinds.join(', ')})`
    : '';
  const lowConfidence = model.classificationConfidence === 'low' ? ' — low confidence' : '';
  return `${model.riskLevel}${kinds}${lowConfidence}`;
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
  // VHS-REQ-702: reviewer-grade change kind + risk. Guarded on the optional
  // fields so a legacy or `--from-file` @v1 model renders exactly as before.
  if (model.changeKinds && model.changeKinds.length > 0) {
    facts.push(`- **Change kinds:** ${model.changeKinds.join(', ')}`);
  }
  if (model.riskLevel) {
    const confidenceNote =
      model.classificationConfidence === 'low' ? ' _(low confidence)_' : '';
    const rationale = model.riskRationale ? ` — ${model.riskRationale}` : '';
    facts.push(`- **Risk:** ${model.riskLevel}${rationale}${confidenceNote}`);
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

/** A hosted image reference embedded in a review's per-VI detail block. */
export interface ReviewImageRef {
  caption: string;
  url: string;
}

function imageAlt(text: string): string {
  return text.replace(/[[\]]/g, '').replace(/\r?\n/g, ' ').trim();
}

/**
 * Renders a PR review as a review-ready, "sticky" Markdown comment: a hidden
 * upsert marker, a summary line, a per-VI result table, and detail blocks for
 * the VIs that changed (reusing the shared single-comparison renderer). The
 * leading {@link VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER} lets a poster update the
 * one review comment in place rather than adding a fresh comment each run.
 * When `options.imagesByVi` supplies hosted image URLs for a VI, they are
 * embedded as a collapsed visual-diff gallery in that VI's detail block.
 */
export function renderViSemanticPrReviewMarkdown(
  review: ViSemanticPrReview,
  options: { imagesByVi?: ReadonlyMap<string, readonly ReviewImageRef[]> } = {}
): string {
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

  lines.push('| VI | Result | Risk | Changed surfaces |', '| --- | --- | --- | --- |');
  for (const entry of review.entries) {
    if (entry.status === 'completed') {
      const result = entry.hasDifferences ? 'Changed' : 'No differences';
      const risk = entry.hasDifferences ? riskCellLabel(entry.model) : '—';
      const surfaces =
        entry.hasDifferences && entry.model.changedSurfaces.length > 0
          ? surfaceList(entry.model.changedSurfaces)
          : '—';
      lines.push(
        `| ${escapeCell(entry.relativePath)} | ${result} | ${escapeCell(risk)} | ${escapeCell(surfaces)} |`
      );
    } else {
      // Surface *why* a VI was not compared so a reviewer has an actionable
      // signal in the comment itself, rather than an opaque "failed". The
      // reason is carried on the model for every non-completed entry.
      const result = `${entry.status} (${entry.reason})`;
      lines.push(`| ${escapeCell(entry.relativePath)} | ${escapeCell(result)} | — | — |`);
    }
  }
  lines.push('');

  for (const entry of review.entries) {
    if (entry.status === 'completed' && entry.hasDifferences) {
      lines.push(`#### ${escapeCell(entry.relativePath)}`, '', renderViSemanticComparisonMarkdown(entry.model), '');
      // VHS-REQ-703 (epic #2262): cite the base/head preview correlation when
      // present. Guarded so a review without a preview provider renders as before.
      if (entry.correlation) {
        lines.push(`- **Preview correlation:** ${escapeCell(entry.correlation.narrative)}`, '');
      }
      const images = options.imagesByVi?.get(entry.relativePath) ?? [];
      if (images.length > 0) {
        lines.push(
          '<details>',
          `<summary>Visual diff (${images.length} image${images.length === 1 ? '' : 's'})</summary>`,
          ''
        );
        for (const image of images) {
          lines.push(`![${imageAlt(image.caption)}](${image.url})`, '');
        }
        lines.push('</details>', '');
      }
    } else if (entry.status !== 'completed') {
      lines.push(
        `#### ${escapeCell(entry.relativePath)}`,
        '',
        `Not compared (${escapeCell(entry.status)}): ${escapeCell(entry.reason)}`,
        ''
      );
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * Renders the "review in progress" sticky comment body posted before the
 * (multi-minute, container-backed) comparison runs, so a reviewer sees that a
 * review was triggered and is computing instead of silence. It carries the same
 * {@link VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER}, so the final review upserts over
 * it in place (one comment); if the run never completes, the pending state
 * remains visible as an actionable signal rather than nothing.
 */
export function renderViSemanticPrReviewPendingMarkdown(headSha?: string): string {
  const scope = headSha && headSha.trim().length > 0 ? ` for \`${escapeCell(headSha.trim())}\`` : '';
  return (
    `${VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER}\n` +
    '## VI semantic review\n' +
    '\n' +
    `🔄 VI semantic review in progress${scope}… This comment will be updated with the result.\n`
  );
}
