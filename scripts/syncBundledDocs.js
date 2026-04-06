#!/usr/bin/env node

const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const defaultRepoRoot = path.resolve(
  path.dirname(fsSync.realpathSync.native(__filename)),
  '..'
);

function resolveBundledDocsPaths(env = process.env) {
  const repoRoot = path.resolve(env.VIHS_REPO_ROOT ?? defaultRepoRoot);
  const wikiRepoRoot = path.resolve(
    env.VIHS_WIKI_REPO_ROOT ?? path.resolve(repoRoot, '..', 'vi-history-suite.wiki')
  );
  const ledgerPath = path.resolve(
    env.VIHS_LEDGER_PATH ?? path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.json')
  );
  const bundleRoot = path.resolve(
    env.VIHS_BUNDLE_ROOT ?? path.join(repoRoot, 'resources', 'bundled-docs')
  );

  return {
    repoRoot,
    wikiRepoRoot,
    ledgerPath,
    bundleRoot,
    bundlePagesRoot: path.join(bundleRoot, 'pages')
  };
}

function getBundledDocsUsage() {
  return [
    'Usage: node scripts/syncBundledDocs.js [--check] [--report <path>] [--help]',
    '',
    'Refresh or verify the curated bundled installed-user documentation pack.',
    '',
    'Options:',
    '  --check          Fail closed when resources/bundled-docs drift from the governed wiki-derived bundle.',
    '  --report <path>  Write a machine-readable report for refresh or check mode.',
    '  --help           Print this help text.'
  ].join('\n');
}

function parseBundledDocsArgs(argv) {
  const parsed = {
    check: false,
    helpRequested: false,
    reportPath: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--check') {
      parsed.check = true;
      continue;
    }

    if (argument === '--report') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --report');
      }
      parsed.reportPath = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

const bundledExtensionUserPageIds = [
  'overview',
  'install-and-release',
  'user-workflow',
  'comparison-reports-and-dashboard-review'
];

const bundledPageConfigs = {
  overview: {
    introReplacement:
      '`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI history in Git repositories.\n\nUse the installed guide inside the extension for install, checkbox-selected compare workflow, retained comparison review, and execution-policy tasks without needing the broader engineering control plane.',
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
      'Repository Support',
      'Primary Review Flow',
      'Comparison Report Flow',
      'Trust, Progress, And Cancellation',
      'Bundled Documentation'
    ],
    replacements: {
      'Execution Policy': [
        'Start with this Windows rule:',
        '',
        '- if Docker Desktop is installed on Windows, `auto` uses the governed Windows container',
        '- if Docker Desktop is not installed, `auto` may use a clean host-native LabVIEW 2026 Q1 surface',
        '- if Docker is installed but unusable, `auto` stops and tells you to fix Docker instead of probing the host',
        '',
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
      'Repository Support': [
        'VI History is available on any trusted Git repository that contains eligible LabVIEW VIs.',
        '',
        'Current scope:',
        '',
        '- the checkbox-selected compare workflow is repo-agnostic',
        '- canonical benchmark and maintainer-only host-review evidence are still governed separately',
        '- you do not need to be on `ni/labview-icon-editor` or `ni/actor-framework` to use the core two-commit compare flow'
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
        'Checkbox-selected pair behavior is explicit:',
        '',
        '- select any first retained revision with the checkbox column',
        '- select the second retained revision to generate a comparison report automatically for that exact pair',
        '- the newer selected revision becomes `selected` and the older selected revision becomes `base`',
        '- the oldest retained revision is still selectable as the older/base side of a checkbox-selected pair',
        '',
        'If you cancel before the comparison view opens, the action stays cancelled instead of opening a late result.'
      ].join('\n'),
      'Primary Review Flow': [
        '1. Right-click an eligible VI and choose `VI History`.',
        '2. Review the history panel facts:',
        '   - repository name',
        '   - relative path',
        '   - VI signature',
        '   - retained commit chronology',
        '3. Use the checkbox column to choose the exact two retained revisions you want to compare.',
        '',
        'The current action model is:',
        '',
        '- `Checkboxes`: the primary and only extension-user compare control; selecting the second retained revision triggers the comparison automatically',
        '- `Open at commit`: open the selected retained revision',
        '- `Copy hash`: copy the retained commit hash',
        '- `Open docs`: open the bundled user documentation that ships with the installed extension version',
        '- `Diff prev`: for content-detected VIs, retained comparison evidence still opens through governed comparison routing instead of plain text diff',
        '',
        'Practical selection rule:',
        '',
        '- any retained window with at least two commits is enough to use VI History',
        '- the adjacent-pair text in a row is chronology context only; the two checked revisions define the exact compare pair',
        '- there is no separate dashboard or decision-record step in the extension-user compare flow'
      ].join('\n'),
      'Trust, Progress, And Cancellation': [
        'The checkbox-selected compare workflow is trust-gated and progress-aware.',
        '',
        '- compare actions fail closed in untrusted workspaces',
        '- long-running actions show bounded progress in the extension',
        '- cancellation preserves already retained evidence where possible instead of silently discarding it',
        '- the extension does not wait for a separate third-step dashboard or decision-record action after the second checkbox selection'
      ].join('\n'),
      'Bundled Documentation': [
        'The extension packages a version-matched installed-user guide so you can read workflow guidance without leaving VS Code.',
        '',
        'The packaged guide is intentionally concise: it keeps the extension-user workflow, execution-policy, and compare rules that a developer needs while omitting private GitLab plus standards/control-plane material.',
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
      'Retained Pair Review': [
        'At the history-panel level, pair review is checkbox-driven.',
        '',
        '- the primary compare path is selecting two retained revisions with the checkbox column',
        '- the second checkbox selection generates the comparison automatically for that exact selected/base pair',
        '- the oldest retained revision can still serve as the older/base side of a checkbox-selected pair',
        '- there is no separate compare button on commit rows for extension users',
        '- `Diff prev` uses retained comparison evidence for governed VI review instead of falling back to VS Code text diff on binary VI content'
      ].join('\n'),
      'Progress, Cancellation, And Trust': [
        'Comparison work is long-running enough that the extension treats it as an explicit progress surface.',
        '',
        'Current behavior includes:',
        '',
        '- bounded progress during comparison-report generation',
        '- trust-aware refusal in untrusted workspaces',
        '- retained partial evidence when cancellation happens after artifacts are built',
        '- cancellation honored before a comparison-report panel opens'
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

async function readPublicationLedger(ledgerPath) {
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

async function buildBundledDocsOutput(paths, deps = {}) {
  const markedModule = deps.markedModule ?? (await import('marked'));
  const { marked } = markedModule;
  const ledger = await readPublicationLedger(paths.ledgerPath);
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

  const manifest = {
    generatedAt: (deps.now ?? (() => new Date().toISOString()))(),
    sourceLedgerPath: 'docs/product/wiki-publication-ledger.json',
    sourceWikiRepoPath: '../vi-history-suite.wiki',
    bundleAudience: 'extension-users',
    defaultPageId: 'overview',
    pages: []
  };

  const files = new Map();

  for (const page of publishedPages) {
    const markdownPath = path.join(paths.wikiRepoRoot, page.wikiFileName);
    const pageFileName = `${page.id}.html`;
    const renderedHtml = await renderPublishedPage(
      marked,
      page.id,
      markdownPath,
      pagesByWikiTarget
    );

    files.set(path.posix.join('pages', pageFileName), renderedHtml);

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

  files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    files
  };
}

function normalizeBundleFileForComparison(relativePath, content) {
  if (relativePath === 'manifest.json') {
    const parsed = JSON.parse(content);
    parsed.generatedAt = '__IGNORED__';
    return JSON.stringify(parsed, null, 2);
  }

  return content;
}

function compareBundledDocsFiles(expectedFiles, actualFiles) {
  const changedFiles = [];
  const relativePaths = [...new Set([...expectedFiles.keys(), ...actualFiles.keys()])].sort();

  for (const relativePath of relativePaths) {
    const expected = expectedFiles.get(relativePath);
    const actual = actualFiles.get(relativePath);

    if (expected === undefined) {
      changedFiles.push({
        path: relativePath,
        reason: 'unexpected-file'
      });
      continue;
    }

    if (actual === undefined) {
      changedFiles.push({
        path: relativePath,
        reason: 'missing-file'
      });
      continue;
    }

    if (
      normalizeBundleFileForComparison(relativePath, expected) !==
      normalizeBundleFileForComparison(relativePath, actual)
    ) {
      changedFiles.push({
        path: relativePath,
        reason: 'content-mismatch'
      });
    }
  }

  return changedFiles;
}

async function readBundledDocsFromDisk(bundleRoot) {
  const files = new Map();

  async function walk(currentRoot) {
    let entries;
    try {
      entries = await fs.readdir(currentRoot, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentRoot, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      const relativePath = path
        .relative(bundleRoot, absolutePath)
        .split(path.sep)
        .join(path.posix.sep);
      files.set(relativePath, await fs.readFile(absolutePath, 'utf8'));
    }
  }

  await walk(bundleRoot);
  return files;
}

async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function writeBundledDocs(paths, deps = {}) {
  const output = await buildBundledDocsOutput(paths, deps);
  const actualFiles = await readBundledDocsFromDisk(paths.bundleRoot);
  const changedFiles = compareBundledDocsFiles(output.files, actualFiles);

  if (changedFiles.length === 0) {
    return {
      schema: 'vi-history-suite/bundled-docs-sync@v1',
      recordedAt: output.manifest.generatedAt,
      status: 'unchanged',
      bundleRoot: paths.bundleRoot,
      wikiRepoRoot: paths.wikiRepoRoot,
      ledgerPath: paths.ledgerPath,
      pageCount: output.manifest.pages.length,
      bundleAudience: output.manifest.bundleAudience
    };
  }

  await fs.rm(paths.bundleRoot, { recursive: true, force: true });
  await fs.mkdir(paths.bundlePagesRoot, { recursive: true });

  for (const [relativePath, content] of output.files.entries()) {
    const targetPath = path.join(paths.bundleRoot, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
  }

  return {
    schema: 'vi-history-suite/bundled-docs-sync@v1',
    recordedAt: output.manifest.generatedAt,
    status: 'written',
    bundleRoot: paths.bundleRoot,
    wikiRepoRoot: paths.wikiRepoRoot,
    ledgerPath: paths.ledgerPath,
    pageCount: output.manifest.pages.length,
    bundleAudience: output.manifest.bundleAudience
  };
}

async function checkBundledDocs(paths, deps = {}) {
  const output = await buildBundledDocsOutput(paths, deps);
  const actualFiles = await readBundledDocsFromDisk(paths.bundleRoot);
  const changedFiles = compareBundledDocsFiles(output.files, actualFiles);
  const report = {
    schema: 'vi-history-suite/bundled-docs-check@v1',
    checkedAt: (deps.now ?? (() => new Date().toISOString()))(),
    status: changedFiles.length === 0 ? 'match' : 'drift',
    bundleRoot: paths.bundleRoot,
    wikiRepoRoot: paths.wikiRepoRoot,
    ledgerPath: paths.ledgerPath,
    pageCount: output.manifest.pages.length,
    bundleAudience: output.manifest.bundleAudience,
    changedFiles
  };

  if (deps.reportPath) {
    await writeReport(deps.reportPath, report);
  }

  if (changedFiles.length > 0) {
    const changedList = changedFiles.map((entry) => `${entry.path} (${entry.reason})`).join(', ');
    throw new Error(
      `Bundled documentation drift detected. Run \`npm run docs:bundle\` and commit the refreshed bundle. Changed files: ${changedList}`
    );
  }

  return report;
}

async function runBundledDocsSync(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseBundledDocsArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (parsed.helpRequested) {
    stdout.write(`${getBundledDocsUsage()}\n`);
    return 'help';
  }

  const paths = deps.paths ?? resolveBundledDocsPaths(deps.env ?? process.env);

  if (parsed.check) {
    await checkBundledDocs(paths, {
      now: deps.now,
      markedModule: deps.markedModule,
      reportPath: parsed.reportPath
    });
    stdout.write('Bundled documentation is in sync.\n');
    return 'match';
  }

  const report = await writeBundledDocs(paths, {
    now: deps.now,
    markedModule: deps.markedModule
  });

  if (parsed.reportPath) {
    await writeReport(parsed.reportPath, report);
  }

  stdout.write(
    report.status === 'unchanged'
      ? 'Bundled documentation already in sync.\n'
      : 'Bundled documentation refreshed.\n'
  );
  return report.status;
}

async function main(argv = process.argv.slice(2), deps = {}, stderr = process.stderr) {
  try {
    await runBundledDocsSync(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  buildBundledDocsOutput,
  checkBundledDocs,
  compareBundledDocsFiles,
  getBundledDocsUsage,
  main,
  normalizeBundleFileForComparison,
  parseBundledDocsArgs,
  resolveBundledDocsPaths,
  runBundledDocsSync,
  writeBundledDocs
};
