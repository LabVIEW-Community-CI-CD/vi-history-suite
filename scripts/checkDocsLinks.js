#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const SKIPPED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.vscode-test',
  'assurance-closeout-evidence',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'out-tests',
  'release-evidence',
  'tmp',
  'win-validation'
]);

const SKIPPED_DIRECTORY_PATHS = new Set([
  'vagrant/.vagrant',
  'vagrant/.vagrant-ci',
  'vagrant/evidence',
  'vagrant/shared'
]);

function shouldSkipDirectory(name, relativePath = name) {
  const normalizedRelativePath = toPosixPath(relativePath);
  return SKIPPED_DIRECTORIES.has(name) ||
    SKIPPED_DIRECTORY_PATHS.has(normalizedRelativePath) ||
    /^assurance-.*-evidence$/u.test(name);
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function lineAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function stripMarkdownCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (match) => '\n'.repeat(match.split(/\r?\n/).length - 1))
    .replace(/`[^`\n]*`/g, '');
}

function normalizeMarkdownTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.includes('>')) {
    return target.slice(1, target.indexOf('>')).trim();
  }

  const whitespaceIndex = target.search(/\s/);
  if (whitespaceIndex >= 0) {
    target = target.slice(0, whitespaceIndex);
  }
  return target.trim();
}

function extractMarkdownLinks(text) {
  const scanText = stripMarkdownCode(text);
  const links = [];
  const inlinePattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
  const referencePattern = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(\S+)/gm;
  const htmlAttributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;

  for (const pattern of [inlinePattern, referencePattern, htmlAttributePattern]) {
    for (const match of scanText.matchAll(pattern)) {
      const target = normalizeMarkdownTarget(match[1] || '');
      if (target.length > 0) {
        links.push({
          target,
          line: lineAt(scanText, match.index || 0)
        });
      }
    }
  }

  return links;
}

function extractHtmlLinks(text) {
  const links = [];
  const htmlAttributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  for (const match of text.matchAll(htmlAttributePattern)) {
    const target = (match[1] || '').trim();
    if (target.length > 0) {
      links.push({
        target,
        line: lineAt(text, match.index || 0)
      });
    }
  }
  return links;
}

function collectDocumentationFiles(cwd) {
  const files = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosixPath(path.relative(cwd, absolutePath));

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, relativePath)) {
          walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const isMarkdown = extension === '.md';
      const isBundledHtml =
        extension === '.html' && relativePath.startsWith('resources/bundled-docs/');

      if (isMarkdown || isBundledHtml) {
        files.push(relativePath);
      }
    }
  }

  walk(cwd);
  return files.sort();
}

function splitTarget(target) {
  const queryIndex = target.indexOf('?');
  const hashIndex = target.indexOf('#');
  const splitIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const pathPart = splitIndex === undefined ? target : target.slice(0, splitIndex);
  const fragment = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';
  return { pathPart, fragment };
}

function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

function decodePathPart(pathPart) {
  try {
    return decodeURIComponent(pathPart);
  } catch (_error) {
    return pathPart;
  }
}

function resolveTargetPath(cwd, sourceRelativePath, pathPart) {
  if (!pathPart || pathPart.length === 0) {
    return path.join(cwd, sourceRelativePath);
  }

  const decodedPathPart = decodePathPart(pathPart);
  if (decodedPathPart.startsWith('/')) {
    return path.resolve(cwd, `.${decodedPathPart}`);
  }

  return path.resolve(cwd, path.dirname(sourceRelativePath), decodedPathPart);
}

function slugHeading(heading) {
  return heading
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~<>]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function markdownAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  const headingPattern = /^#{1,6}[ \t]+(.+)$/gm;
  const explicitIdPattern = /\bid=["']([^"']+)["']/gi;

  for (const match of text.matchAll(headingPattern)) {
    const slug = slugHeading(match[1] || '');
    if (!slug) {
      continue;
    }

    const count = seen.get(slug) || 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }

  for (const match of text.matchAll(explicitIdPattern)) {
    anchors.add(match[1]);
  }

  return anchors;
}

function htmlAnchors(text) {
  const anchors = new Set();
  const anchorPattern = /\b(?:id|name)=["']([^"']+)["']/gi;
  for (const match of text.matchAll(anchorPattern)) {
    anchors.add(match[1]);
  }
  return anchors;
}

function anchorsForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const text = fs.readFileSync(filePath, 'utf8');
  if (extension === '.md') {
    return markdownAnchors(text);
  }
  if (extension === '.html' || extension === '.htm') {
    return htmlAnchors(text);
  }
  return new Set();
}

function checkDocumentationLinks(cwd = process.cwd()) {
  const repoRoot = path.resolve(cwd);
  const files = collectDocumentationFiles(repoRoot);
  const failures = [];
  let localLinksChecked = 0;
  let externalLinksSkipped = 0;

  for (const sourceRelativePath of files) {
    const sourcePath = path.join(repoRoot, sourceRelativePath);
    const text = fs.readFileSync(sourcePath, 'utf8');
    const links = sourceRelativePath.endsWith('.md') ? extractMarkdownLinks(text) : extractHtmlLinks(text);

    for (const link of links) {
      if (isExternalTarget(link.target)) {
        externalLinksSkipped += 1;
        continue;
      }

      const { pathPart, fragment } = splitTarget(link.target);
      const targetPath = resolveTargetPath(repoRoot, sourceRelativePath, pathPart);
      const relativeTarget = path.relative(repoRoot, targetPath);

      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        failures.push({
          source: sourceRelativePath,
          line: link.line,
          target: link.target,
          reason: 'target resolves outside the repository'
        });
        continue;
      }

      localLinksChecked += 1;
      if (!fs.existsSync(targetPath)) {
        failures.push({
          source: sourceRelativePath,
          line: link.line,
          target: link.target,
          reason: 'target file does not exist'
        });
        continue;
      }

      if (fragment.length > 0) {
        const decodedFragment = decodePathPart(fragment);
        const anchors = anchorsForFile(targetPath);
        const extension = path.extname(targetPath).toLowerCase();
        const canCheckAnchor = ['.md', '.html', '.htm'].includes(extension);
        if (canCheckAnchor && !anchors.has(decodedFragment)) {
          failures.push({
            source: sourceRelativePath,
            line: link.line,
            target: link.target,
            reason: `anchor '${decodedFragment}' was not found`
          });
        }
      }
    }
  }

  return {
    success: failures.length === 0,
    filesChecked: files.length,
    localLinksChecked,
    externalLinksSkipped,
    failures
  };
}

function renderSummary(result) {
  const lines = [
    `[docs-links] Documentation files checked: ${result.filesChecked}`,
    `[docs-links] Local links checked: ${result.localLinksChecked}`,
    `[docs-links] External links skipped: ${result.externalLinksSkipped}`
  ];

  if (result.success) {
    lines.push('[docs-links] Link check passed.');
  } else {
    lines.push(`[docs-links] Link check failed: ${result.failures.length} broken link(s).`);
    for (const failure of result.failures) {
      lines.push(
        `  - ${failure.source}:${failure.line} -> ${failure.target} (${failure.reason})`
      );
    }
  }

  return lines.join('\n');
}

function main(argv = process.argv.slice(2), deps = {}) {
  const cwd = deps.cwd || argv[0] || process.cwd();
  const result = checkDocumentationLinks(cwd);
  const output = `${renderSummary(result)}\n`;
  if (result.success) {
    (deps.stdout || process.stdout).write(output);
    return 0;
  }

  (deps.stderr || process.stderr).write(output);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  checkDocumentationLinks,
  collectDocumentationFiles,
  extractHtmlLinks,
  extractMarkdownLinks,
  main,
  markdownAnchors,
  renderSummary,
  slugHeading
};
