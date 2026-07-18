import type { ComparisonReportPacketRecord } from './comparisonReportPacket';
import { escapeHtml } from '../support/escapeHtml';

/**
 * Renders a compact evidence summary for failed or blocked executions that humans and agents
 * can read without digging through raw artifacts first. Returns empty string for succeeded
 * or not-run states since those do not require a quick-glance summary.
 */
export function renderCompactEvidenceSummary(record: ComparisonReportPacketRecord): string {
  const runtimeExecution = record.runtimeExecution;
  const state = record.runtimeExecutionState;

  // Only render for failed or blocked (not-available) states
  if (state !== 'failed' && state !== 'not-available') {
    return '';
  }

  const summaryLines: string[] = [];

  // Outcome line
  if (state === 'not-available') {
    summaryLines.push(`<li><strong>Outcome:</strong> ${escapeHtml('blocked')}</li>`);
  } else {
    summaryLines.push(`<li><strong>Outcome:</strong> ${escapeHtml('failed')}</li>`);
  }

  // Blocked reason
  if (runtimeExecution.blockedReason) {
    summaryLines.push(
      `<li><strong>Blocked reason:</strong> ${escapeHtml(runtimeExecution.blockedReason)}</li>`
    );
  }

  // Failure reason
  if (runtimeExecution.failureReason) {
    summaryLines.push(
      `<li><strong>Failure reason:</strong> ${escapeHtml(runtimeExecution.failureReason)}</li>`
    );
  }

  // Diagnostic reason if present
  if (runtimeExecution.diagnosticReason) {
    summaryLines.push(
      `<li><strong>Diagnostic reason:</strong> ${escapeHtml(runtimeExecution.diagnosticReason)}</li>`
    );
  }

  // Exit code if attempted
  if (runtimeExecution.exitCode !== undefined) {
    summaryLines.push(
      `<li><strong>Exit code:</strong> ${escapeHtml(String(runtimeExecution.exitCode))}</li>`
    );
  }

  // Duration if available
  if (runtimeExecution.durationMs !== undefined) {
    summaryLines.push(
      `<li><strong>Duration:</strong> ${escapeHtml(String(runtimeExecution.durationMs))}ms</li>`
    );
  }

  // Report existence
  summaryLines.push(
    `<li><strong>Report produced:</strong> ${escapeHtml(runtimeExecution.reportExists ? 'yes' : 'no')}</li>`
  );

  // Artifact paths
  if (runtimeExecution.stdoutFilePath) {
    summaryLines.push(
      `<li><strong>Stdout artifact:</strong> ${escapeHtml(runtimeExecution.stdoutFilePath)}</li>`
    );
  }

  if (runtimeExecution.stderrFilePath) {
    summaryLines.push(
      `<li><strong>Stderr artifact:</strong> ${escapeHtml(runtimeExecution.stderrFilePath)}</li>`
    );
  }

  // Doctor summary lines if present (first 3 for compact view)
  if (runtimeExecution.doctorSummaryLines && runtimeExecution.doctorSummaryLines.length > 0) {
    const displayedLines = runtimeExecution.doctorSummaryLines.slice(0, 3);
    const hasMore = runtimeExecution.doctorSummaryLines.length > 3;
    summaryLines.push(
      `<li><strong>Doctor summary:</strong><ul>${displayedLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}${hasMore ? '<li><em>(see full doctor summary below)</em></li>' : ''}</ul></li>`
    );
  }

  return `<div class="status" data-testid="comparison-report-compact-evidence-summary">
      <strong>Compact evidence summary</strong>
      <ul>${summaryLines.join('\n      ')}</ul>
    </div>`;
}
