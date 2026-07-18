import { escapeHtml } from '../support/escapeHtml';
import type { ParsedNiComparisonReport } from './niComparisonReportParser';
import type { MultiReportDashboardEntry } from './multiReportDashboard';

export function renderPairMetadataLedgerRow(
  entry: MultiReportDashboardEntry,
  index: number,
  pairCount: number
): string {
  const parsed = entry.parsedReport;
  const chronologySummary = `<strong>Selected:</strong> ${escapeHtml(
    entry.selectedSubject
  )} <code>${escapeHtml(entry.selectedHash.slice(0, 8))}</code> · <strong>Base:</strong> ${escapeHtml(
    entry.baseSubject ?? 'none'
  )} <code>${escapeHtml(entry.baseHash.slice(0, 8))}</code>`;

  if (!parsed) {
    return `<section class="pair-ledger-row" data-testid="dashboard-pair-ledger-row">
      <h3>Pair ${index + 1} of ${pairCount}</h3>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-chronology">${chronologySummary}</div>
      <div class="note" data-testid="dashboard-pair-ledger-no-metadata">
        No retained VI Comparison Report metadata is currently available for this pair.
      </div>
    </section>`;
  }

  return `<section class="pair-ledger-row" data-testid="dashboard-pair-ledger-row">
    <h3>Pair ${index + 1} of ${pairCount}</h3>
    <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-chronology">${chronologySummary}</div>
    <div class="pair-ledger-grid">
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-report">
        <strong>Report:</strong> ${escapeHtml(parsed.reportTitle)} · generated ${escapeHtml(
          parsed.generationTime ?? 'none'
        )}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-compared-paths">
        <strong>Compared VI paths:</strong> First VI=${escapeHtml(
          parsed.firstViPath ?? 'none'
        )} · Second VI=${escapeHtml(parsed.secondViPath ?? 'none')}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-overview">
        <strong>Overview captions:</strong> ${escapeHtml(formatOverviewCaptionLedger(parsed))}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-attributes">
        <strong>Included attributes:</strong> ${escapeHtml(
          formatAttributeLedger(parsed, true)
        )}<br />
        <strong>Excluded attributes:</strong> ${escapeHtml(formatAttributeLedger(parsed, false))}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-detail-headings">
        <strong>Detail headings:</strong> ${escapeHtml(formatDetailHeadingLedger(parsed))}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-detail-items">
        <strong>Detail items:</strong> ${escapeHtml(formatDetailItemLedger(parsed))}
      </div>
    </div>
  </section>`;
}

export function formatOverviewCaptionLedger(parsed: ParsedNiComparisonReport): string {
  if (parsed.overviewSections.length === 0) {
    return 'none';
  }

  return parsed.overviewSections
    .map((section) => `${section.caption} (${section.images.length} image(s))`)
    .join('; ');
}

export function formatAttributeLedger(parsed: ParsedNiComparisonReport, included: boolean): string {
  const labels = parsed.includedAttributes
    .filter((attribute) => attribute.included === included)
    .map((attribute) => attribute.label);
  return labels.length > 0 ? labels.join('; ') : 'none';
}

export function formatDetailHeadingLedger(parsed: ParsedNiComparisonReport): string {
  if (parsed.detailSections.length === 0) {
    return 'none';
  }

  return parsed.detailSections
    .map((section) => `${section.heading} (${section.items.length} item(s))`)
    .join('; ');
}

export function formatDetailItemLedger(parsed: ParsedNiComparisonReport): string {
  const items = parsed.detailSections.flatMap((section) => section.items);
  return items.length > 0 ? items.join('; ') : 'none';
}
