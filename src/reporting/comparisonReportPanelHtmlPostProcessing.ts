/**
 * Ensures a webview directory URI ends with a trailing slash so relative
 * resources resolve against the directory rather than its parent.
 */
export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

/**
 * Adds `loading="lazy"` to report image tags so the webview fetches images only
 * as they scroll into view. NI comparison reports can reference hundreds of
 * per-object difference images; requesting them all at once exhausts the webview
 * resource loader (Chromium net::ERR_INSUFFICIENT_RESOURCES), leaving later
 * images broken and showing their path text instead of the picture.
 */
export function enableLazyImageLoading(html: string): string {
  return html.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy"');
}
