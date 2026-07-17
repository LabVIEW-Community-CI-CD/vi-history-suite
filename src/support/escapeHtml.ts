// Shared HTML text escaper (supporting VHS-REQ-610 dashboard aggregate review).
// Eight UI, dashboard, reporting, and docs modules each defined the byte-identical
// `escapeHtml` skeleton to escape the five HTML-significant characters (&, <, >,
// ", ') for safe interpolation into rendered markup. This centralizes that
// escaper so escaping stays consistent. The `viPreviewWebview` variant (regex-
// based, no apostrophe escaping) is intentionally left as its own local helper.

// Escape the five HTML-significant characters in `value` for safe text
// interpolation into rendered HTML markup.
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
