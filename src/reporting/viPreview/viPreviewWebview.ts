/**
 * VHS-REQ-659: preview webview document assembly.
 *
 * `PrintToSingleFileHtml` emits a complete LabVIEW documentation HTML document
 * (uppercase tags, inline `data:image/png;base64` images, no scripts, no
 * external resources). To display it safely in a VS Code webview we inject a
 * strict Content-Security-Policy that permits only inline styles and data-URI
 * images and forbids scripts and every remote origin. Loading and error states
 * render a themed, self-contained document with the same policy.
 *
 * The builder is pure so the document shape stays deterministically
 * unit-testable without a webview host.
 */

export type ViPreviewWebviewState =
  | { kind: 'loading'; title: string; detail?: string }
  | { kind: 'error'; title: string; message: string }
  | { kind: 'rendered'; labviewHtml: string };

/** Strict CSP for the rendered LabVIEW document: inline styles + data-URI images only. */
const RENDERED_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; script-src 'none';";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cspMetaTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${RENDERED_CSP}">`;
}

/**
 * Injects the CSP meta tag into the LabVIEW document's head. The match is
 * case-insensitive because LabVIEW emits uppercase tags; when no head element
 * is present the meta tag is prepended so the policy still applies.
 */
export function injectPreviewCsp(labviewHtml: string): string {
  const headOpen = /<head[^>]*>/i.exec(labviewHtml);
  if (headOpen) {
    const insertAt = headOpen.index + headOpen[0].length;
    return `${labviewHtml.slice(0, insertAt)}${cspMetaTag()}${labviewHtml.slice(insertAt)}`;
  }
  return `${cspMetaTag()}\n${labviewHtml}`;
}

function themedShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    ${cspMetaTag()}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 16px;
        line-height: 1.5;
      }
      h1 { font-size: 1.1em; font-weight: 600; margin: 0 0 12px; }
      .detail { color: var(--vscode-descriptionForeground); }
      .error {
        color: var(--vscode-errorForeground);
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        padding: 12px;
        border-radius: 4px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    ${bodyHtml}
  </body>
</html>`;
}

/** Builds the full webview document for a preview state. */
export function buildViPreviewWebviewHtml(state: ViPreviewWebviewState): string {
  if (state.kind === 'rendered') {
    return injectPreviewCsp(state.labviewHtml);
  }

  if (state.kind === 'loading') {
    const detail = state.detail ? `<p class="detail">${escapeHtml(state.detail)}</p>` : '';
    return themedShell(
      state.title,
      `<h1>${escapeHtml(state.title)}</h1>${detail}`
    );
  }

  return themedShell(
    state.title,
    `<h1>${escapeHtml(state.title)}</h1><div class="error">${escapeHtml(state.message)}</div>`
  );
}
