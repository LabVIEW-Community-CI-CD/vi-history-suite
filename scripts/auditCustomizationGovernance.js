#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const AGENTS_GUIDE_PATH = 'AGENTS.md';
const ONBOARDING_SKILL_PATH = '.github/skills/onboarding/SKILL.md';

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.vscode-test',
  'assurance-closeout-evidence',
  'coverage',
  'node_modules',
  'out',
  'out-tests'
]);

const ALLOWED_AGENT_TOOLS = new Set(['read', 'search', 'edit', 'execute', 'todo']);

const FINDING_CATEGORIES = [
  {
    key: 'runtimeIssues',
    label: 'runtime',
    remediation: 'Resolve missing foundational files or invalid JSON before triaging other findings.'
  },
  {
    key: 'missingAgentsReferences',
    label: 'agents-sync-missing',
    remediation: 'Add discovered customization files to AGENTS workspace sections.'
  },
  {
    key: 'staleAgentsReferences',
    label: 'agents-sync-stale',
    remediation: 'Remove stale AGENTS references or restore deleted customization files.'
  },
  {
    key: 'frontmatterIssues',
    label: 'frontmatter-schema',
    remediation: 'Fix required frontmatter keys and safe defaults for each customization artifact type.'
  },
  {
    key: 'applyToIssues',
    label: 'instruction-applyto',
    remediation: 'Adjust instruction applyTo globs to avoid catch-all patterns and match committed files.'
  },
  {
    key: 'linkIssues',
    label: 'markdown-links',
    remediation: 'Fix local markdown targets so links resolve to existing in-repo files.'
  },
  {
    key: 'commandIssues',
    label: 'command-references',
    remediation: 'Align npm run command references in AGENTS/onboarding with package.json scripts.'
  }
];

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function stripWrappingQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
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

function globToRegex(globPattern) {
  const pattern = toPosixPath(globPattern.trim().replace(/^\.\//, ''));
  let regexBody = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];
    const thirdCharacter = pattern[index + 2];

    if (character === '*' && nextCharacter === '*') {
      if (thirdCharacter === '/') {
        regexBody += '(?:.*/)?';
        index += 2;
        continue;
      }

      regexBody += '.*';
      index += 1;
      continue;
    }

    if (character === '*') {
      regexBody += '[^/]*';
      continue;
    }

    if (character === '?') {
      regexBody += '[^/]';
      continue;
    }

    if (/[[\]{}()+.^$|\\]/.test(character)) {
      regexBody += `\\${character}`;
      continue;
    }

    regexBody += character;
  }

  regexBody += '$';
  return new RegExp(regexBody);
}

function listRepositoryFiles(cwd) {
  const files = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(path.join(directory, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      files.push(toPosixPath(path.relative(cwd, absolutePath)));
    }
  }

  walk(cwd);
  return files.sort();
}

function isCustomizationPath(relativePath) {
  return (
    /^\.github\/skills\/[^/]+\/SKILL\.md$/.test(relativePath) ||
    /^\.github\/prompts\/[^/]+\.prompt\.md$/.test(relativePath) ||
    /^\.github\/instructions\/[^/]+\.instructions\.md$/.test(relativePath) ||
    /^\.github\/agents\/[^/]+\.agent\.md$/.test(relativePath)
  );
}

function discoverCustomizationFiles(cwd, repoFiles = listRepositoryFiles(cwd)) {
  return repoFiles.filter((relativePath) => isCustomizationPath(relativePath)).sort();
}

function extractFrontmatterBlock(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return match?.[1] ?? '';
}

function parseFrontmatter(text) {
  const block = extractFrontmatterBlock(text);
  if (!block) {
    return {};
  }

  const lines = block.split('\n');
  const frontmatter = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    const rawValue = keyMatch[2].trim();

    if (rawValue.length === 0) {
      const values = [];
      let lookahead = index + 1;

      while (lookahead < lines.length) {
        const itemMatch = lines[lookahead].match(/^\s*-\s*(.+)$/);
        if (itemMatch) {
          values.push(stripWrappingQuotes(itemMatch[1].trim()));
          lookahead += 1;
          continue;
        }

        if (/^[A-Za-z0-9_-]+:\s*/.test(lines[lookahead])) {
          break;
        }

        if (lines[lookahead].trim().length === 0) {
          lookahead += 1;
          continue;
        }

        break;
      }

      if (values.length > 0) {
        frontmatter[key] = values;
        index = lookahead - 1;
      } else {
        frontmatter[key] = '';
      }

      continue;
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((value) => stripWrappingQuotes(value.trim()))
        .filter((value) => value.length > 0);
      continue;
    }

    frontmatter[key] = stripWrappingQuotes(rawValue);
  }

  return frontmatter;
}

function getFrontmatterScalar(frontmatter, key) {
  const value = frontmatter[key];
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return typeof value === 'string' ? value.trim() : '';
}

function getFrontmatterArray(frontmatter, key) {
  const value = frontmatter[key];
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function extractAgentsCustomizationReferences(text) {
  const references = new Set();
  const pathPattern = /`(\.github\/[^`]+)`/g;

  for (const match of text.matchAll(pathPattern)) {
    const candidate = match[1].trim();
    if (isCustomizationPath(candidate)) {
      references.add(candidate);
    }
  }

  return [...references].sort();
}

function validateAgentsSynchronization(discoveredFiles, referencedFiles) {
  const discovered = new Set(discoveredFiles);
  const referenced = new Set(referencedFiles);

  const missingInAgents = discoveredFiles
    .filter((relativePath) => !referenced.has(relativePath))
    .sort();
  const staleInAgents = referencedFiles
    .filter((relativePath) => !discovered.has(relativePath))
    .sort();

  return {
    missingInAgents,
    staleInAgents
  };
}

function validateFrontmatterSchemas(cwd, customizationFiles) {
  const issues = [];

  for (const relativePath of customizationFiles) {
    const absolutePath = path.join(cwd, relativePath);
    const text = readText(absolutePath);
    const frontmatter = parseFrontmatter(text);

    if (Object.keys(frontmatter).length === 0) {
      issues.push({
        path: relativePath,
        issue: 'missing YAML frontmatter block'
      });
      continue;
    }

    const description = getFrontmatterScalar(frontmatter, 'description');
    const name = getFrontmatterScalar(frontmatter, 'name');

    if (!name) {
      issues.push({
        path: relativePath,
        issue: 'frontmatter key name must be present and non-empty'
      });
    }

    if (!description) {
      issues.push({
        path: relativePath,
        issue: 'frontmatter key description must be present and non-empty'
      });
    }

    const skillMatch = relativePath.match(/^\.github\/skills\/([^/]+)\/SKILL\.md$/);
    if (skillMatch) {
      const folderName = skillMatch[1];
      const argumentHint = getFrontmatterScalar(frontmatter, 'argument-hint');
      if (name !== folderName) {
        issues.push({
          path: relativePath,
          issue: `frontmatter name must match folder '${folderName}'`
        });
      }
      if (!argumentHint) {
        issues.push({
          path: relativePath,
          issue: 'frontmatter key argument-hint must be present and non-empty'
        });
      }
      if (description && !description.includes('Use')) {
        issues.push({
          path: relativePath,
          issue: 'description should include a usage trigger starting with Use'
        });
      }
      continue;
    }

    if (/^\.github\/prompts\/[^/]+\.prompt\.md$/.test(relativePath)) {
      const argumentHint = getFrontmatterScalar(frontmatter, 'argument-hint');
      const agent = getFrontmatterScalar(frontmatter, 'agent');

      if (!argumentHint) {
        issues.push({
          path: relativePath,
          issue: 'frontmatter key argument-hint must be present and non-empty'
        });
      }

      if (agent !== 'agent') {
        issues.push({
          path: relativePath,
          issue: "frontmatter key agent must equal 'agent'"
        });
      }
      continue;
    }

    if (/^\.github\/instructions\/[^/]+\.instructions\.md$/.test(relativePath)) {
      const applyToPatterns = getFrontmatterArray(frontmatter, 'applyTo');
      if (applyToPatterns.length === 0) {
        issues.push({
          path: relativePath,
          issue: 'frontmatter key applyTo must be present and non-empty'
        });
      }

      if (description && !description.includes('Use when')) {
        issues.push({
          path: relativePath,
          issue: 'description should include Use when for trigger clarity'
        });
      }
      continue;
    }

    if (/^\.github\/agents\/[^/]+\.agent\.md$/.test(relativePath)) {
      const argumentHint = getFrontmatterScalar(frontmatter, 'argument-hint');
      const tools = getFrontmatterArray(frontmatter, 'tools');
      const userInvocable = getFrontmatterScalar(frontmatter, 'user-invocable');

      if (!argumentHint) {
        issues.push({
          path: relativePath,
          issue: 'frontmatter key argument-hint must be present and non-empty'
        });
      }

      if (tools.length === 0) {
        issues.push({
          path: relativePath,
          issue: 'frontmatter key tools must declare at least one allowed tool'
        });
      }

      const unknownTools = tools.filter((toolName) => !ALLOWED_AGENT_TOOLS.has(toolName));
      if (unknownTools.length > 0) {
        issues.push({
          path: relativePath,
          issue: `frontmatter tools include unsupported values: ${unknownTools.join(', ')}`
        });
      }

      for (const requiredTool of ['read', 'search']) {
        if (!tools.includes(requiredTool)) {
          issues.push({
            path: relativePath,
            issue: `frontmatter tools must include '${requiredTool}'`
          });
        }
      }

      if (!['true', 'false'].includes(userInvocable)) {
        issues.push({
          path: relativePath,
          issue: "frontmatter key user-invocable must be explicitly 'true' or 'false'"
        });
      }
    }
  }

  return issues.sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return left.issue.localeCompare(right.issue);
  });
}

function isUnsafeApplyToPattern(pattern) {
  const normalized = pattern.trim().replace(/^\.\//, '');
  return (
    normalized === '*' ||
    normalized === '**' ||
    normalized === '**/*' ||
    normalized === './**' ||
    normalized === './**/*'
  );
}

function validateInstructionApplyTo(cwd, instructionPaths, repoFiles) {
  const issues = [];

  for (const relativePath of instructionPaths) {
    const absolutePath = path.join(cwd, relativePath);
    const text = readText(absolutePath);
    const frontmatter = parseFrontmatter(text);
    const patterns = getFrontmatterArray(frontmatter, 'applyTo');

    for (const pattern of patterns) {
      const normalizedPattern = pattern.trim().replace(/^\.\//, '');

      if (isUnsafeApplyToPattern(normalizedPattern)) {
        issues.push({
          path: relativePath,
          pattern,
          issue: 'applyTo pattern is an unsafe catch-all'
        });
        continue;
      }

      const matcher = globToRegex(normalizedPattern);
      const hasMatch = repoFiles.some((candidatePath) => matcher.test(candidatePath));
      if (!hasMatch) {
        issues.push({
          path: relativePath,
          pattern,
          issue: 'applyTo pattern does not match any tracked repository file'
        });
      }
    }
  }

  return issues.sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    const patternCompare = left.pattern.localeCompare(right.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    return left.issue.localeCompare(right.issue);
  });
}

function validateLocalMarkdownLinks(cwd, markdownFiles) {
  const issues = [];

  for (const sourceRelativePath of markdownFiles) {
    const sourcePath = path.join(cwd, sourceRelativePath);
    if (!fs.existsSync(sourcePath)) {
      issues.push({
        source: sourceRelativePath,
        line: 1,
        target: sourceRelativePath,
        issue: 'source file does not exist'
      });
      continue;
    }

    const sourceText = readText(sourcePath);
    const links = extractMarkdownLinks(sourceText);

    for (const link of links) {
      if (isExternalTarget(link.target)) {
        continue;
      }

      const { pathPart } = splitTarget(link.target);
      if (!pathPart || pathPart.length === 0) {
        continue;
      }

      const targetPath = resolveTargetPath(cwd, sourceRelativePath, pathPart);
      const relativeTarget = toPosixPath(path.relative(cwd, targetPath));
      if (relativeTarget === '..' || relativeTarget.startsWith('../')) {
        issues.push({
          source: sourceRelativePath,
          line: link.line,
          target: link.target,
          issue: 'link resolves outside the repository root'
        });
        continue;
      }

      if (!fs.existsSync(targetPath)) {
        issues.push({
          source: sourceRelativePath,
          line: link.line,
          target: link.target,
          issue: 'link target file does not exist'
        });
      }
    }
  }

  return issues.sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }

    if (left.line !== right.line) {
      return left.line - right.line;
    }

    const targetCompare = left.target.localeCompare(right.target);
    if (targetCompare !== 0) {
      return targetCompare;
    }

    return left.issue.localeCompare(right.issue);
  });
}

function extractNpmScriptReferences(text) {
  const scripts = new Set();

  const runPattern = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
  for (const match of text.matchAll(runPattern)) {
    scripts.add(match[1]);
  }

  if (/\bnpm\s+test\b/.test(text)) {
    scripts.add('test');
  }

  return [...scripts].sort();
}

function validateCommandReferences(cwd, packageScripts) {
  const issues = [];

  for (const sourceRelativePath of [AGENTS_GUIDE_PATH, ONBOARDING_SKILL_PATH]) {
    const sourcePath = path.join(cwd, sourceRelativePath);
    if (!fs.existsSync(sourcePath)) {
      issues.push({
        source: sourceRelativePath,
        script: '-',
        issue: 'source file does not exist'
      });
      continue;
    }

    const references = extractNpmScriptReferences(readText(sourcePath));
    for (const scriptName of references) {
      if (!packageScripts[scriptName]) {
        issues.push({
          source: sourceRelativePath,
          script: scriptName,
          issue: 'referenced npm script does not exist in package.json'
        });
      }
    }
  }

  return issues.sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }

    const scriptCompare = left.script.localeCompare(right.script);
    if (scriptCompare !== 0) {
      return scriptCompare;
    }

    return left.issue.localeCompare(right.issue);
  });
}

function auditCustomizationGovernance(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const runtimeIssues = [];

  const repoFiles = listRepositoryFiles(cwd);
  const customizationFiles = discoverCustomizationFiles(cwd, repoFiles);

  const agentsPath = path.join(cwd, AGENTS_GUIDE_PATH);
  const agentsText = fs.existsSync(agentsPath) ? readText(agentsPath) : '';
  if (!agentsText) {
    runtimeIssues.push({
      issue: `${AGENTS_GUIDE_PATH} is missing or empty`
    });
  }

  const agentsReferences = extractAgentsCustomizationReferences(agentsText);
  const synchronization = validateAgentsSynchronization(customizationFiles, agentsReferences);

  const frontmatterIssues = validateFrontmatterSchemas(cwd, customizationFiles);
  const instructionPaths = customizationFiles.filter((relativePath) =>
    relativePath.startsWith('.github/instructions/')
  );
  const applyToIssues = validateInstructionApplyTo(cwd, instructionPaths, repoFiles);

  const linkIssues = validateLocalMarkdownLinks(cwd, [AGENTS_GUIDE_PATH, ...customizationFiles]);

  const packageJsonPath = path.join(cwd, 'package.json');
  let packageScripts = {};
  if (!fs.existsSync(packageJsonPath)) {
    runtimeIssues.push({ issue: 'package.json is missing' });
  } else {
    try {
      packageScripts = JSON.parse(readText(packageJsonPath)).scripts || {};
    } catch (error) {
      runtimeIssues.push({ issue: `package.json is not valid JSON: ${error.message}` });
    }
  }

  const commandIssues = validateCommandReferences(cwd, packageScripts);

  const findings = {
    runtimeIssues,
    missingAgentsReferences: synchronization.missingInAgents,
    staleAgentsReferences: synchronization.staleInAgents,
    frontmatterIssues,
    applyToIssues,
    linkIssues,
    commandIssues
  };

  const success =
    findings.runtimeIssues.length === 0 &&
    findings.missingAgentsReferences.length === 0 &&
    findings.staleAgentsReferences.length === 0 &&
    findings.frontmatterIssues.length === 0 &&
    findings.applyToIssues.length === 0 &&
    findings.linkIssues.length === 0 &&
    findings.commandIssues.length === 0;

  return {
    success,
    customizationFilesChecked: customizationFiles.length,
    findings
  };
}

function toMachineReadableReport(result, now = new Date()) {
  const categories = FINDING_CATEGORIES.map((category) => {
    const rawItems = result.findings[category.key] || [];
    const items = Array.isArray(rawItems) ? rawItems : [];

    return {
      key: category.key,
      label: category.label,
      count: items.length,
      remediation: category.remediation,
      items
    };
  });

  const totalIssues = categories.reduce((sum, category) => sum + category.count, 0);
  const failingCategories = categories.filter((category) => category.count > 0).length;

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    success: result.success,
    customizationFilesChecked: result.customizationFilesChecked,
    totals: {
      issues: totalIssues,
      failingCategories
    },
    categories
  };
}

function renderSummary(result) {
  const { findings } = result;
  const lines = [
    `[customization-audit] Customization files checked: ${result.customizationFilesChecked}`,
    `[customization-audit] Missing AGENTS references: ${findings.missingAgentsReferences.length}`,
    `[customization-audit] Stale AGENTS references: ${findings.staleAgentsReferences.length}`,
    `[customization-audit] Frontmatter issues: ${findings.frontmatterIssues.length}`,
    `[customization-audit] applyTo issues: ${findings.applyToIssues.length}`,
    `[customization-audit] Link issues: ${findings.linkIssues.length}`,
    `[customization-audit] Command issues: ${findings.commandIssues.length}`
  ];

  if (findings.runtimeIssues.length > 0) {
    lines.push(`[customization-audit] Runtime issues: ${findings.runtimeIssues.length}`);
  }

  if (result.success) {
    lines.push('[customization-audit] Audit passed.');
    return lines.join('\n');
  }

  if (findings.runtimeIssues.length > 0) {
    lines.push('[customization-audit] Runtime failures:');
    for (const item of findings.runtimeIssues) {
      lines.push(`  - ${item.issue}`);
    }
  }

  if (findings.missingAgentsReferences.length > 0) {
    lines.push('[customization-audit] Customization files missing from AGENTS.md:');
    for (const relativePath of findings.missingAgentsReferences) {
      lines.push(`  - ${relativePath}`);
    }
  }

  if (findings.staleAgentsReferences.length > 0) {
    lines.push('[customization-audit] AGENTS.md references to missing customization files:');
    for (const relativePath of findings.staleAgentsReferences) {
      lines.push(`  - ${relativePath}`);
    }
  }

  if (findings.frontmatterIssues.length > 0) {
    lines.push('[customization-audit] Frontmatter schema issues:');
    for (const issue of findings.frontmatterIssues) {
      lines.push(`  - ${issue.path}: ${issue.issue}`);
    }
  }

  if (findings.applyToIssues.length > 0) {
    lines.push('[customization-audit] applyTo issues:');
    for (const issue of findings.applyToIssues) {
      lines.push(`  - ${issue.path}: ${issue.pattern} (${issue.issue})`);
    }
  }

  if (findings.linkIssues.length > 0) {
    lines.push('[customization-audit] Link resolution issues:');
    for (const issue of findings.linkIssues) {
      lines.push(`  - ${issue.source}:${issue.line} -> ${issue.target} (${issue.issue})`);
    }
  }

  if (findings.commandIssues.length > 0) {
    lines.push('[customization-audit] Command reference issues:');
    for (const issue of findings.commandIssues) {
      lines.push(`  - ${issue.source}: ${issue.script} (${issue.issue})`);
    }
  }

  lines.push('[customization-audit] Audit failed.');
  return lines.join('\n');
}

function parseMainArgs(argv) {
  let cwd;
  let emitJson = false;

  for (const arg of argv) {
    if (arg === '--json') {
      emitJson = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option '${arg}'. Supported options: --json [cwd].`);
    }

    if (cwd) {
      throw new Error('Only one cwd argument is supported.');
    }

    cwd = arg;
  }

  return {
    cwd: cwd || process.cwd(),
    emitJson
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  let parsedArgs;
  try {
    parsedArgs = parseMainArgs(argv);
  } catch (error) {
    (deps.stderr || process.stderr).write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const cwd = deps.cwd || parsedArgs.cwd;
  const result = auditCustomizationGovernance({ cwd });

  if (parsedArgs.emitJson) {
    const report = toMachineReadableReport(result, deps.now || new Date());
    (deps.stdout || process.stdout).write(`${JSON.stringify(report, null, 2)}\n`);
    return result.success ? 0 : 1;
  }

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
  AGENTS_GUIDE_PATH,
  ALLOWED_AGENT_TOOLS,
  ONBOARDING_SKILL_PATH,
  auditCustomizationGovernance,
  discoverCustomizationFiles,
  extractAgentsCustomizationReferences,
  extractMarkdownLinks,
  extractNpmScriptReferences,
  globToRegex,
  isCustomizationPath,
  main,
  parseMainArgs,
  parseFrontmatter,
  renderSummary,
  toMachineReadableReport,
  validateAgentsSynchronization,
  validateCommandReferences,
  validateFrontmatterSchemas,
  validateInstructionApplyTo,
  validateLocalMarkdownLinks,
  FINDING_CATEGORIES
};
