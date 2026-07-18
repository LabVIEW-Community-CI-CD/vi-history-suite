import { escapeHtml } from '../support/escapeHtml';

/**
 * Pure packet HTML value renderers extracted verbatim from comparisonReportPacket.
 * `renderRevisionBodyValue` renders a commit body (muted placeholders for
 * not-retained/empty, HTML-escaped with newline-to-`<br />` conversion);
 * `renderRevisionMetadataValue` renders a single metadata string (muted placeholder
 * when absent); `renderOptionalYesNo` renders a tri-state boolean as `yes`/`no`/`none`.
 * Isolated from packet HTML orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function renderRevisionBodyValue(value: string | undefined): string {
  if (value === undefined) {
    return '<span class="muted">not retained</span>';
  }

  if (value.trim().length === 0) {
    return '<span class="muted">No commit body</span>';
  }

  return escapeHtml(value).replace(/\r\n?|\n/g, '<br />');
}

export function renderRevisionMetadataValue(value: string | undefined): string {
  return value && value.length > 0
    ? escapeHtml(value)
    : '<span class="muted">not retained</span>';
}

export function renderOptionalYesNo(value: boolean | undefined): string {
  if (value === undefined) {
    return 'none';
  }

  return value ? 'yes' : 'no';
}
