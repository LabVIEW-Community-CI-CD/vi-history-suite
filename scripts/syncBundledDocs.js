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
const bundledExtensionUserPageIds = [
  'overview',
  'install-and-release',
  'user-workflow',
  'comparison-reports-and-dashboard-review',
  'review-scenarios-and-decision-records'
];
const bundledPageConfigs = {
  overview: {
    introReplacement:
      '`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI history in Git repositories.\n\nUse the installed guide inside the extension for install, workflow, dashboard, and decision-record tasks without needing the broader engineering control plane.',
    headings: ['Product Promise', 'Install Surfaces'],
    replacements: {
      'Install Surfaces': [
        'Current install and release surfaces are:',
        '',
        '- preview VSIX artifact from the `main` pipeline',
        '- local package output via `npm run package`',
        '- governed tagged release artifact retained under `release-evidence/`',
        '- packaged bundled user docs opened through `VI History: Open Documentation` or the history-panel `Open docs` action'
      ].join('\n')
    }
  },
  'install-and-release': {
    headings: ['Current Release Target', 'Install Surfaces', 'Release Procedure Summary'],
    replacements: {
      'Install Surfaces': [
        'Use one of these installed-user surfaces:',
        '',
        '- preview VSIX artifact from the latest successful `main` pipeline',
        '- local package output via `npm run package`',
        '- tagged release VSIX for exact-version installs',
        '- packaged bundled docs through `VI History: Open Documentation` or the history-panel `Open docs` action',
        '',
        'After installing or updating the VSIX, reload VS Code before running the review flow.'
      ].join('\n'),
      'Release Procedure Summary': [
        'Use the preview VSIX for iteration or the tagged release VSIX when you need the exact released build.',
        '',
        'Quick verification flow:',
        '',
        '1. install the selected VSIX',
        '2. reload VS Code',
        '3. open `VI History` on an eligible VI inside a trusted Git workspace',
        '4. use `Open docs` if you need the version-matched installed guide'
      ].join('\n')
    }
  },
  'user-workflow': {
    headings: [
      'Preconditions',
      'Execution Policy',
      'Primary Review Flow',
      'Comparison Report Flow',
      'Dashboard Flow',
      'Decision Record Flow',
      'Trust, Progress, And Cancellation',
      'Bundled Documentation'
    ],
    replacements: {
      'Execution Policy': [
        'Use `viHistorySuite.executionMode` to choose how comparisons run:',
        '',
        '- `auto`: on Windows, use the governed Windows container whenever Docker Desktop is installed; otherwise use a clean host-native LabVIEW 2026 Q1 surface',
        '- `host-only`: require host-native execution and fail closed if the host surface is not safe',
        '- `docker-only`: require Docker execution and fail closed if Docker cannot satisfy the request',
        '',
        'Current installed rules:',
        '',
        '- no mode silently falls back to a different provider',
        '- if Docker is required but unavailable, the extension stops and tells you what to fix',
        '- compare progress, provider choice, and Windows image acquisition state stay visible in the history panel while the action runs'
      ].join('\n'),
      'Comparison Report Flow': [
        'Comparison-report generation and opening are treated as review actions inside the extension, not ad hoc shell commands.',
        '',
        'When a pair comparison is generated or refreshed, the extension retains:',
        '',
        '- the comparison-report packet',
        '- report metadata',
        '- the generated NI comparison report when one exists',
        '- a compact runtime summary with provider and next action',
        '',
        'If you cancel before the comparison view opens, the action stays cancelled instead of opening a late result.'
      ].join('\n'),
      'Dashboard Flow': [
        'When a VI has at least three retained commits, the history panel exposes `Open dashboard`.',
        '',
        'The dashboard flow now:',
        '',
        '- reuses retained pair evidence when the current commit window is already covered',
        '- generates only the missing or stale pairs when more evidence is needed',
        '- concentrates the review window into one dashboard before you drill into individual pairs with `Open compare`'
      ].join('\n'),
      'Trust, Progress, And Cancellation': [
        'The workflow is trust-gated and progress-aware.',
        '',
        '- compare and dashboard actions fail closed in untrusted workspaces',
        '- long-running actions show bounded progress in the extension',
        '- cancellation preserves already retained evidence where possible instead of silently discarding it'
      ].join('\n'),
      'Bundled Documentation': [
        'The extension packages a version-matched installed-user guide so you can read workflow guidance without leaving VS Code.',
        '',
        'Open it from:',
        '',
        '- the Command Palette via `VI History: Open Documentation`',
        '- the history panel via `Open docs`'
      ].join('\n')
    }
  },
  'comparison-reports-and-dashboard-review': {
    headings: [
      'Comparison Report Contract',
      'Runtime Doctor',
      'Retained Pair Review',
      'Dashboard Review',
      'Progress, Cancellation, And Trust'
    ],
    replacements: {
      'Comparison Report Contract': [
        '`vi-history-suite` treats a VI comparison report as retained review evidence, not as transient shell output.',
        '',
        'The installed comparison-report flow covers:',
        '',
        '- revision-pair preflight for eligible VI revisions',
        '- runtime selection',
        '- retained packet and metadata persistence',
        '- rendering of retained comparison evidence inside the extension'
      ].join('\n'),
      'Runtime Doctor': [
        'The comparison-report subsystem also retains a compact runtime summary so you do not need raw logs first.',
        '',
        'That runtime summary includes:',
        '',
        '- selected provider',
        '- selected engine',
        '- platform',
        '- blocked or failure reason when present',
        '- one bounded next action'
      ].join('\n'),
      'Dashboard Review': [
        'The multi-report dashboard is the concentration surface for one VI across at least three commits.',
        '',
        'The dashboard currently:',
        '',
        '- concentrates retained comparison metadata across the commit window',
        '- reuses retained evidence before generating new pairs when the window is already covered',
        '- keeps the underlying pair evidence available when you want to drill down with `Open compare`'
      ].join('\n'),
      'Progress, Cancellation, And Trust': [
        'Report and dashboard work are long-running enough that the extension treats them as explicit progress surfaces.',
        '',
        'Current behavior includes:',
        '',
        '- bounded progress during report and dashboard refresh',
        '- trust-aware refusal in untrusted workspaces',
        '- retained partial evidence when cancellation happens after artifacts are built',
        '- cancellation honored before a comparison-report or dashboard panel opens'
      ].join('\n')
    }
  },
  'review-scenarios-and-decision-records': {
    headings: ['Purpose', 'Human Decision Boundary', 'Decision Record Contract', 'Extension Flow'],
    replacements: {
      Purpose: [
        '`vi-history-suite` treats the multi-report dashboard as decision support, not as an automated decision-maker.',
        '',
        'This layer exists so a human reviewer can:',
        '',
        '- apply a bounded review workflow to one VI across multiple commits',
        '- use retained dashboard evidence as the basis for judgment',
        '- persist a separate human decision record without mutating machine evidence'
      ].join('\n'),
      'Decision Record Contract': [
        'Decision records are intentionally separate from dashboard packets.',
        '',
        'A retained decision record keeps:',
        '',
        '- scenario and repository context',
        '- VI path and commit-window bounds',
        '- dashboard packet path',
        '- reviewer outcome and confidence',
        '- rationale and follow-up actions',
        '',
        'This separation keeps machine-retained evidence and human judgment from being collapsed into one artifact.'
      ].join('\n'),
      'Extension Flow': [
        'The extension exposes `Create decision record` when the retained review window is large enough.',
        '',
        'The current flow:',
        '',
        '- requires at least three commits in the retained window',
        '- uses the active review context from the current VI and history window',
        '- persists separate `decision-record.json` and `decision-record.md` artifacts',
        '- opens the retained Markdown decision record without mutating the dashboard packet'
      ].join('\n')
    }
  }
};

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
      return body;
    }

    if (/^[A-Za-z0-9][A-Za-z0-9\-./]*$/.test(normalizedHref)) {
      return body;
    }

    return `<a href="${escapeAttribute(normalizedHref)}"${rest}>${body}</a>`;
  });
}

function stripAuthorityPrelude(markdown) {
  return markdown.replace(
    /\nThis (?:page is derived|wiki is seeded)[\s\S]*?The current authority surfaces for this page are:\n(?:\n)?(?:- .*\n)+\n?/m,
    '\n'
  );
}

function parseMarkdownDocument(markdown) {
  const lines = markdown.split('\n');
  let title = '';
  const introLines = [];
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line;
      continue;
    }

    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        heading: headingMatch[1].trim(),
        lines: []
      };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else if (title) {
      introLines.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    title,
    intro: introLines.join('\n').trim(),
    sections: sections.map((section) => ({
      heading: section.heading,
      body: section.lines.join('\n').trim()
    }))
  };
}

function selectBundledSections(markdown, pageId) {
  const config = bundledPageConfigs[pageId];
  if (!config) {
    return markdown;
  }

  const parsed = parseMarkdownDocument(markdown);
  const parts = [];

  if (parsed.title) {
    parts.push(parsed.title);
  }

  const intro = config.introReplacement ?? '';
  if (intro) {
    parts.push('', intro.trim());
  }

  for (const heading of config.headings) {
    const sourceSection = parsed.sections.find((section) => section.heading === heading);
    const body = (config.replacements?.[heading] ?? sourceSection?.body ?? '').trim();
    if (!body) {
      continue;
    }

    parts.push('', `## ${heading}`, '', body);
  }

  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function stripExcludedListOnlyLinks(markdown, pagesByWikiTarget) {
  const lines = markdown.split('\n');
  const filteredLines = lines.filter((line) => {
    const match = line.match(/^-\s+\[[^\]]+\]\(([^)]+)\)\s*$/);
    if (!match) {
      return true;
    }

    const href = match[1]?.trim() ?? '';
    if (/^https?:\/\//i.test(href)) {
      return false;
    }

    const wikiTarget = href.replace(/\.md$/i, '').replace(/^\.?\//, '');
    return pagesByWikiTarget.has(wikiTarget);
  });

  return filteredLines.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function renderPublishedPage(marked, pageId, markdownPath, pagesByWikiTarget) {
  const markdown = await fs.readFile(markdownPath, 'utf8');
  const sanitizedMarkdown = stripExcludedListOnlyLinks(
    selectBundledSections(stripAuthorityPrelude(markdown), pageId),
    pagesByWikiTarget
  );
  const html = marked.parse(sanitizedMarkdown, {
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
  const publishedPages = bundledExtensionUserPageIds
    .map((pageId) =>
      ledger.pages.find((page) => page.id === pageId && page.status === 'published')
    )
    .filter(Boolean);
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
    bundleAudience: 'extension-users',
    defaultPageId: 'overview',
    pages: []
  };

  for (const page of publishedPages) {
    const markdownPath = path.join(wikiRepoRoot, page.wikiFileName);
    const pageFileName = `${page.id}.html`;
    const renderedHtml = await renderPublishedPage(
      marked,
      page.id,
      markdownPath,
      pagesByWikiTarget
    );

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
