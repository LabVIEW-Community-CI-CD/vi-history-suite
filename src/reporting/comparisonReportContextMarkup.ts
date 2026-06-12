import type { ComparisonReportRevisionMetadata } from './comparisonReportPacket';

/**
 * Shared revision-context rendering for comparison reports.
 *
 * The in-panel comparison-report webview (VHS-REQ-644) and the external-viewing
 * export (VHS-REQ-626) both surface the selected/base revision facts (hash,
 * date, author, subject, and the full commit body). Keeping the markup and the
 * body escaping/multi-line/fallback behavior in one place ensures the exported
 * graphics report carries the identical revision context shown inside VS Code
 * without diverging from the panel cards.
 */

/**
 * CSS rules for the shared revision-context block. Scoped to the
 * `.vihs-compare-context*` classes so it can be injected into an exported
 * LabVIEW-generated report without restyling the report's own `<body>`.
 */
export const COMPARISON_REPORT_CONTEXT_STYLE = `.vihs-compare-context { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: white; color: #111; border-bottom: 1px solid #d0d0d0; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }`;

export function renderComparisonReportPanelContextMarkup(options: {
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
}): string {
  return `<div class="vihs-compare-context" data-testid="comparison-report-panel-context">
      <strong>Comparison context</strong>
      <div><strong>Relative path:</strong> ${renderPanelRevisionMetadataValue(options.relativePath)}</div>
      <div class="vihs-compare-context-grid">
        ${renderComparisonReportPanelRevisionCard(
          'Selected revision',
          options.selectedHash,
          options.selectedRevision,
          'comparison-report-panel-context-selected'
        )}
        ${renderComparisonReportPanelRevisionCard(
          'Base revision',
          options.baseHash,
          options.baseRevision,
          'comparison-report-panel-context-base'
        )}
      </div>
    </div>`;
}

function renderComparisonReportPanelRevisionCard(
  label: string,
  hash: string | undefined,
  revision: ComparisonReportRevisionMetadata | undefined,
  testId: string
): string {
  return `<div class="vihs-compare-context-card" data-testid="${testId}">
      <strong>${escapeHtml(label)}</strong>
      <div><code>${escapeHtml(revision?.hash ?? hash ?? 'not retained')}</code></div>
      <div><strong>Date:</strong> ${renderPanelRevisionMetadataValue(revision?.authorDate)}</div>
      <div><strong>Author:</strong> ${renderPanelRevisionMetadataValue(revision?.authorName)}</div>
      <div><strong>Subject:</strong> ${renderPanelRevisionMetadataValue(revision?.subject)}</div>
      <div><strong>Body:</strong> ${renderPanelRevisionBodyValue(revision?.body)}</div>
    </div>`;
}

function renderPanelRevisionBodyValue(value: string | undefined): string {
  if (value === undefined) {
    return '<span class="vihs-compare-context-muted">not retained</span>';
  }

  if (value.trim().length === 0) {
    return '<span class="vihs-compare-context-muted">No commit body</span>';
  }

  return escapeHtml(value).replace(/\r\n?|\n/g, '<br />');
}

function renderPanelRevisionMetadataValue(value: string | undefined): string {
  return value && value.length > 0
    ? escapeHtml(value)
    : '<span class="vihs-compare-context-muted">not retained</span>';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
