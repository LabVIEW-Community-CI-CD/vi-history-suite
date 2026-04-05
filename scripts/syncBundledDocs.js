#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const defaultRepoRoot = path.resolve(
  path.dirname(require('node:fs').realpathSync.native(__filename)),
  '..'
);
const repoRoot = path.resolve(process.env.VIHS_REPO_ROOT ?? defaultRepoRoot);
const wikiRepoRoot = path.resolve(
  process.env.VIHS_WIKI_REPO_ROOT ?? path.resolve(repoRoot, '..', 'vi-history-suite.wiki')
);
const ledgerPath = path.resolve(
  process.env.VIHS_LEDGER_PATH ?? path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.json')
);
const bundleRoot = path.resolve(
  process.env.VIHS_BUNDLE_ROOT ?? path.join(repoRoot, 'resources', 'bundled-docs')
);
const bundlePagesRoot = path.join(bundleRoot, 'pages');

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function readPublicationLedger() {
  const raw = await fs.readFile(ledgerPath, 'utf8');
  return JSON.parse(raw);
}

function rewriteAnchors(html, pagesByWikiTarget) {
  return html.replace(/<a\s+href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (_match, href, rest, body) => {
    const normalizedHref = href.trim();
    const wikiTarget = normalizedHref.replace(/\.md$/i, '').replace(/^\.?\//, '');
    const matchingPage = pagesByWikiTarget.get(wikiTarget);

    if (matchingPage) {
      return `<a href="#" data-page-id="${escapeAttribute(matchingPage.id)}"${rest}>${body}</a>`;
    }

    if (/^https?:\/\//i.test(normalizedHref)) {
      return `<a href="#" data-external-href="${escapeAttribute(normalizedHref)}"${rest}>${body}</a>`;
    }

    return `<a href="${escapeAttribute(normalizedHref)}"${rest}>${body}</a>`;
  });
}

async function renderPublishedPage(marked, markdownPath, pagesByWikiTarget) {
  const markdown = await fs.readFile(markdownPath, 'utf8');
  const html = marked.parse(markdown, {
    async: false,
    gfm: true,
    headerIds: false,
    mangle: false
  });
  return rewriteAnchors(html, pagesByWikiTarget);
}

async function writeBundledDocs() {
  const { marked } = await import('marked');
  const ledger = await readPublicationLedger();
  const publishedPages = ledger.pages.filter((page) => page.status === 'published');
  const pagesByWikiTarget = new Map();

  for (const page of publishedPages) {
    pagesByWikiTarget.set(page.wikiPath, page);
    pagesByWikiTarget.set(page.wikiFileName, page);
  }

  await fs.rm(bundleRoot, { recursive: true, force: true });
  await fs.mkdir(bundlePagesRoot, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceLedgerPath: 'docs/product/wiki-publication-ledger.json',
    sourceWikiRepoPath: '../vi-history-suite.wiki',
    defaultPageId: 'overview',
    pages: []
  };

  for (const page of publishedPages) {
    const markdownPath = path.join(wikiRepoRoot, page.wikiFileName);
    const pageFileName = `${page.id}.html`;
    const renderedHtml = await renderPublishedPage(marked, markdownPath, pagesByWikiTarget);

    await fs.writeFile(path.join(bundlePagesRoot, pageFileName), renderedHtml, 'utf8');

    manifest.pages.push({
      id: page.id,
      title: page.title,
      wikiPath: page.wikiPath,
      wikiFileName: page.wikiFileName,
      htmlFileName: pageFileName,
      publishedDate: page.publishedDate,
      wikiCommit: page.wikiCommit
    });
  }

  await fs.writeFile(
    path.join(bundleRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

async function main() {
  await writeBundledDocs();
  process.stdout.write('Bundled documentation refreshed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
