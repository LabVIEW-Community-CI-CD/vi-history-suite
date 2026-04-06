import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface BundledDocumentationPage {
  id: string;
  title: string;
  wikiPath: string;
  wikiFileName: string;
  htmlFileName: string;
  publishedDate: string;
  wikiCommit: string;
}

export interface BundledDocumentationManifest {
  generatedAt: string;
  sourceLedgerPath: string;
  sourceWikiRepoPath: string;
  bundleAudience?: string;
  defaultPageId: string;
  pages: BundledDocumentationPage[];
}

export interface LoadedBundledDocumentationPage {
  manifest: BundledDocumentationManifest;
  page: BundledDocumentationPage;
  manifestFilePath: string;
  pageFilePath: string;
  pageBodyHtml: string;
}

export function getBundledDocumentationRootPath(extensionUri: vscode.Uri): string {
  return path.join(extensionUri.fsPath, 'resources', 'bundled-docs');
}

export function getBundledDocumentationManifestPath(extensionUri: vscode.Uri): string {
  return path.join(getBundledDocumentationRootPath(extensionUri), 'manifest.json');
}

export async function readBundledDocumentationManifest(
  extensionUri: vscode.Uri
): Promise<{
  manifest: BundledDocumentationManifest;
  manifestFilePath: string;
}> {
  const manifestFilePath = getBundledDocumentationManifestPath(extensionUri);
  const manifest = JSON.parse(
    await fs.readFile(manifestFilePath, 'utf8')
  ) as BundledDocumentationManifest;
  return {
    manifest,
    manifestFilePath
  };
}

export async function loadBundledDocumentationPage(
  extensionUri: vscode.Uri,
  requestedPageId?: string
): Promise<LoadedBundledDocumentationPage | undefined> {
  const { manifest, manifestFilePath } = await readBundledDocumentationManifest(extensionUri);
  const resolvedPageId = requestedPageId ?? manifest.defaultPageId;
  const page = manifest.pages.find((entry) => entry.id === resolvedPageId);
  if (!page) {
    return undefined;
  }

  const pageFilePath = path.join(getBundledDocumentationRootPath(extensionUri), 'pages', page.htmlFileName);
  const pageBodyHtml = await fs.readFile(pageFilePath, 'utf8');

  return {
    manifest,
    page,
    manifestFilePath,
    pageFilePath,
    pageBodyHtml
  };
}

export function renderBundledDocumentationPanelHtml(options: {
  extensionVersion: string;
  manifest: BundledDocumentationManifest;
  page: BundledDocumentationPage;
  pageBodyHtml: string;
}): string {
  const navigation = options.manifest.pages
    .map((page) => {
      const selectedAttribute = page.id === options.page.id ? ' aria-current="page"' : '';
      const selectedClass = page.id === options.page.id ? ' selected' : '';
      return `<button class="nav-link${selectedClass}" data-page-id="${escapeHtml(page.id)}"${selectedAttribute}>${escapeHtml(page.title)}</button>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VI History Docs: ${escapeHtml(options.page.title)}</title>
    <style>
      body {
        margin: 0;
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      .shell {
        display: grid;
        grid-template-columns: minmax(220px, 280px) 1fr;
        min-height: 100vh;
      }
      .sidebar {
        border-right: 1px solid var(--vscode-panel-border);
        padding: 16px;
        background: var(--vscode-sideBar-background);
      }
      .sidebar h1 {
        margin: 0 0 8px;
        font-size: 1.1rem;
      }
      .version {
        color: var(--vscode-descriptionForeground);
        font-size: 0.9rem;
        margin-bottom: 16px;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .nav-link {
        width: 100%;
        border: 1px solid var(--vscode-panel-border);
        background: transparent;
        color: inherit;
        text-align: left;
        padding: 10px 12px;
        cursor: pointer;
      }
      .nav-link.selected {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-list-hoverBackground);
      }
      .content {
        padding: 24px;
        overflow-wrap: anywhere;
      }
      .metadata {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editorWidget-background);
      }
      .metadata-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(220px, 1fr));
        gap: 8px 16px;
      }
      .page-content h1,
      .page-content h2,
      .page-content h3 {
        margin-top: 1.4em;
      }
      .page-content h1:first-child {
        margin-top: 0;
      }
      .page-content code {
        font-family: var(--vscode-editor-font-family);
      }
      .page-content pre {
        overflow-x: auto;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-textCodeBlock-background);
      }
      .page-content table {
        border-collapse: collapse;
        width: 100%;
      }
      .page-content th,
      .page-content td {
        border: 1px solid var(--vscode-panel-border);
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }
      .page-content a {
        color: var(--vscode-textLink-foreground);
      }
      @media (max-width: 900px) {
        .shell {
          grid-template-columns: 1fr;
        }
        .sidebar {
          border-right: 0;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .metadata-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell" data-testid="documentation-shell">
      <aside class="sidebar" data-testid="documentation-sidebar">
        <h1 data-testid="documentation-title">VI History Documentation</h1>
        <div class="version" data-testid="documentation-version">Installed extension version: ${escapeHtml(options.extensionVersion)}</div>
        <div class="nav" data-testid="documentation-nav">
          ${navigation}
        </div>
      </aside>
      <main class="content" data-testid="documentation-content">
        <section class="metadata" data-testid="documentation-metadata">
          <div class="metadata-grid">
            <div><strong>Page:</strong> <span data-testid="documentation-page-title">${escapeHtml(options.page.title)}</span></div>
            <div><strong>Wiki path:</strong> <code data-testid="documentation-page-path">${escapeHtml(options.page.wikiPath)}</code></div>
            <div><strong>Published:</strong> <span data-testid="documentation-page-date">${escapeHtml(options.page.publishedDate)}</span></div>
            <div><strong>Wiki commit:</strong> <code data-testid="documentation-page-commit">${escapeHtml(options.page.wikiCommit)}</code></div>
          </div>
        </section>
        <article class="page-content" data-testid="documentation-page-body">
          ${options.pageBodyHtml}
        </article>
      </main>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const pageButton = target.closest('[data-page-id]');
        if (pageButton instanceof HTMLElement) {
          event.preventDefault();
          const pageId = pageButton.dataset.pageId;
          if (pageId) {
            vscode.postMessage({ command: 'openPage', pageId });
          }
          return;
        }

        const externalLink = target.closest('[data-external-href]');
        if (externalLink instanceof HTMLElement) {
          event.preventDefault();
          const href = externalLink.dataset.externalHref;
          if (href) {
            vscode.postMessage({ command: 'openExternal', href });
          }
        }
      });
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
