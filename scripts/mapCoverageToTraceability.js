#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COVERAGE_SUMMARY = path.join('coverage', 'coverage-summary.json');
const DEFAULT_INVENTORY = path.join('docs', 'requirements', 'traceability-inventory.csv');
const DEFAULT_RTM = path.join('docs', 'requirements', 'rtm.csv');
const DEFAULT_RISK_THRESHOLD = 50;

function parseArgs(argv) {
  const options = {
    coverageSummary: DEFAULT_COVERAGE_SUMMARY,
    inventory: DEFAULT_INVENTORY,
    rtm: DEFAULT_RTM,
    riskThreshold: DEFAULT_RISK_THRESHOLD,
    json: false,
    enforce: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--coverage-summary') options.coverageSummary = next();
    else if (arg === '--inventory') options.inventory = next();
    else if (arg === '--rtm') options.rtm = next();
    else if (arg === '--repo-root') options.repoRoot = next();
    else if (arg === '--risk-threshold') {
      options.riskThreshold = Number(next());
    } else if (arg === '--json') options.json = true;
    else if (arg === '--enforce') options.enforce = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.riskThreshold) || options.riskThreshold < 0) {
    throw new Error('--risk-threshold must be a non-negative number');
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/mapCoverageToTraceability.js [options]',
    '',
    'Options:',
    '  --coverage-summary <path>   Default: coverage/coverage-summary.json',
    '  --inventory <path>          Default: docs/requirements/traceability-inventory.csv',
    '  --rtm <path>                Default: docs/requirements/rtm.csv',
    '  --repo-root <path>          Default: current working directory',
    '  --risk-threshold <number>   Default: 50',
    '  --enforce                   Fail closed on mapped-below-threshold or zero-coverage supporting risk',
    '  --json'
  ].join('\n');
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  const [headers = [], ...body] = rows;
  return body.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function normalizeRepoPath(repoRoot, filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  return path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
}

function splitRefs(value) {
  return value
    .split(';')
    .map((reference) => reference.trim().replace(/`/g, '').split('#')[0])
    .filter((reference) => reference && !reference.startsWith('manual:') && !reference.startsWith('external:'));
}

function extractRequirementIds(text) {
  return [...new Set((text.match(/VHS-REQ-\d{3}/g) || []).sort())];
}

function buildRequirementMap(rtmRows) {
  const byPath = new Map();
  for (const row of rtmRows) {
    for (const reference of [...splitRefs(row.ImplementationRefs || ''), ...splitRefs(row.VerificationRefs || '')]) {
      const cleanReference = reference.replace(/\\/g, '/');
      const ids = byPath.get(cleanReference) || [];
      if (!ids.includes(row.ReqID)) {
        ids.push(row.ReqID);
      }
      byPath.set(cleanReference, ids);
    }
  }
  return byPath;
}

function metricSnapshot(metric) {
  return {
    total: metric.total,
    covered: metric.covered,
    pct: metric.pct,
    missing: metric.total - metric.covered
  };
}

function summarizeFile(repoRoot, coverageFilePath, coverageEntry, inventoryByPath, requirementByPath) {
  const repoPath = normalizeRepoPath(repoRoot, coverageFilePath);
  const inventory = inventoryByPath.get(repoPath);
  const noteRequirementIds = extractRequirementIds(inventory?.Notes || '');
  const requirementIds = [
    ...new Set([...(requirementByPath.get(repoPath) || []), ...noteRequirementIds].sort())
  ];

  return {
    path: repoPath,
    classification: inventory?.Classification || 'missing-inventory',
    rtmCoverage: inventory?.RtmCoverage || 'Unknown',
    requirementIds,
    notes: inventory?.Notes || '',
    lines: metricSnapshot(coverageEntry.lines),
    statements: metricSnapshot(coverageEntry.statements),
    branches: metricSnapshot(coverageEntry.branches),
    functions: metricSnapshot(coverageEntry.functions)
  };
}

function summarizeByRequirement(files) {
  const byRequirement = new Map();
  for (const file of files) {
    for (const reqId of file.requirementIds) {
      const current = byRequirement.get(reqId) || {
        reqId,
        fileCount: 0,
        missingLines: 0,
        missingBranches: 0,
        missingFunctions: 0,
        files: []
      };
      current.fileCount += 1;
      current.missingLines += file.lines.missing;
      current.missingBranches += file.branches.missing;
      current.missingFunctions += file.functions.missing;
      current.files.push(file.path);
      byRequirement.set(reqId, current);
    }
  }

  return [...byRequirement.values()].sort(
    (left, right) =>
      right.missingLines + right.missingBranches + right.missingFunctions -
      (left.missingLines + left.missingBranches + left.missingFunctions)
  );
}

function summarizeByClassification(files) {
  const byClassification = new Map();
  for (const file of files) {
    const current = byClassification.get(file.classification) || {
      classification: file.classification,
      fileCount: 0,
      missingLines: 0,
      missingBranches: 0,
      missingFunctions: 0
    };
    current.fileCount += 1;
    current.missingLines += file.lines.missing;
    current.missingBranches += file.branches.missing;
    current.missingFunctions += file.functions.missing;
    byClassification.set(file.classification, current);
  }

  return [...byClassification.values()].sort((left, right) =>
    left.classification.localeCompare(right.classification)
  );
}

function isBelowThreshold(file, threshold) {
  return (
    file.lines.pct < threshold ||
    file.statements.pct < threshold ||
    file.branches.pct < threshold ||
    file.functions.pct < threshold
  );
}

function generateCoverageMap(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const coverageSummaryPath = path.resolve(repoRoot, options.coverageSummary || DEFAULT_COVERAGE_SUMMARY);
  const inventoryPath = path.resolve(repoRoot, options.inventory || DEFAULT_INVENTORY);
  const rtmPath = path.resolve(repoRoot, options.rtm || DEFAULT_RTM);
  const riskThreshold = options.riskThreshold ?? DEFAULT_RISK_THRESHOLD;

  if (!fs.existsSync(coverageSummaryPath)) {
    throw new Error(`Coverage summary not found at ${path.relative(repoRoot, coverageSummaryPath)}. Run npm test first.`);
  }

  const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
  const inventoryRows = parseCsv(fs.readFileSync(inventoryPath, 'utf8'));
  const rtmRows = parseCsv(fs.readFileSync(rtmPath, 'utf8'));
  const inventoryByPath = new Map(inventoryRows.map((row) => [row.Path.replace(/\\/g, '/'), row]));
  const requirementByPath = buildRequirementMap(rtmRows);
  const files = Object.entries(coverageSummary)
    .filter(([filePath]) => filePath !== 'total')
    .map(([filePath, entry]) =>
      summarizeFile(repoRoot, filePath, entry, inventoryByPath, requirementByPath)
    )
    .sort((left, right) => left.path.localeCompare(right.path));

  const mappedBelowThreshold = files
    .filter((file) => file.classification === 'mapped' && isBelowThreshold(file, riskThreshold))
    .sort((left, right) =>
      right.lines.missing + right.branches.missing + right.functions.missing -
      (left.lines.missing + left.branches.missing + left.functions.missing)
    );
  const zeroCoverageSupportingRequirements = files
    .filter(
      (file) =>
        file.classification === 'supporting' &&
        file.requirementIds.length > 0 &&
        file.lines.covered === 0
    )
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    total: coverageSummary.total,
    riskThreshold,
    files,
    mappedBelowThreshold,
    zeroCoverageSupportingRequirements,
    byRequirement: summarizeByRequirement(files),
    byClassification: summarizeByClassification(files)
  };
}

function formatPct(metric) {
  return `${metric.pct.toFixed(2)}%`;
}

function renderFileRow(file) {
  return [
    file.path,
    file.requirementIds.join(' ') || '-',
    file.classification,
    formatPct(file.lines),
    formatPct(file.branches),
    formatPct(file.functions),
    file.lines.missing,
    file.branches.missing,
    file.functions.missing
  ].join(' | ');
}

function renderCoverageMapMarkdown(map) {
  const lines = [
    '# Coverage Traceability Map',
    '',
    `- Total line coverage: ${formatPct(map.total.lines)}`,
    `- Total branch coverage: ${formatPct(map.total.branches)}`,
    `- Total function coverage: ${formatPct(map.total.functions)}`,
    `- Total statement coverage: ${formatPct(map.total.statements)}`,
    `- Risk threshold: ${map.riskThreshold}%`,
    '',
    '## Mapped Files Below Risk Threshold',
    '',
    '| Path | Requirements | Classification | Lines | Branches | Functions | Missing Lines | Missing Branches | Missing Functions |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |'
  ];

  if (map.mappedBelowThreshold.length === 0) {
    lines.push('| - | - | - | - | - | - | 0 | 0 | 0 |');
  } else {
    lines.push(...map.mappedBelowThreshold.map((file) => `| ${renderFileRow(file)} |`));
  }

  lines.push(
    '',
    '## Zero-Coverage Supporting Files Tied To Requirements',
    '',
    '| Path | Requirements | Classification | Lines | Branches | Functions | Missing Lines | Missing Branches | Missing Functions |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |'
  );

  if (map.zeroCoverageSupportingRequirements.length === 0) {
    lines.push('| - | - | - | - | - | - | 0 | 0 | 0 |');
  } else {
    lines.push(...map.zeroCoverageSupportingRequirements.map((file) => `| ${renderFileRow(file)} |`));
  }

  lines.push(
    '',
    '## Top Requirement Coverage Debt',
    '',
    '| Requirement | Files | Missing Lines | Missing Branches | Missing Functions |',
    '| --- | ---: | ---: | ---: | ---: |'
  );
  for (const requirement of map.byRequirement.slice(0, 15)) {
    lines.push(
      `| ${requirement.reqId} | ${requirement.fileCount} | ${requirement.missingLines} | ${requirement.missingBranches} | ${requirement.missingFunctions} |`
    );
  }

  lines.push(
    '',
    '## Debt By Traceability Classification',
    '',
    '| Classification | Files | Missing Lines | Missing Branches | Missing Functions |',
    '| --- | ---: | ---: | ---: | ---: |'
  );
  for (const classification of map.byClassification) {
    lines.push(
      `| ${classification.classification} | ${classification.fileCount} | ${classification.missingLines} | ${classification.missingBranches} | ${classification.missingFunctions} |`
    );
  }

  return lines.join('\n');
}

function summarizeEnforcement(map) {
  const mappedBelow = map.mappedBelowThreshold.length;
  const zeroCoverageSupporting = map.zeroCoverageSupportingRequirements.length;
  return { mappedBelow, zeroCoverageSupporting, violations: mappedBelow + zeroCoverageSupporting };
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    const map = generateCoverageMap(options);
    process.stdout.write(options.json ? `${JSON.stringify(map, null, 2)}\n` : `${renderCoverageMapMarkdown(map)}\n`);
    if (options.enforce) {
      const enforcement = summarizeEnforcement(map);
      if (enforcement.violations > 0) {
        process.stderr.write(
          `\n[coverage:map] Enforcing: ${enforcement.mappedBelow} requirement-mapped file(s) below the ${map.riskThreshold}% risk threshold and ${enforcement.zeroCoverageSupporting} zero-coverage supporting file(s) tied to requirements. Add tests or reclassify.\n`
        );
        return 1;
      }
      process.stdout.write(
        `[coverage:map] Enforcing: no requirement-mapped file below the ${map.riskThreshold}% risk threshold and no zero-coverage supporting file tied to a requirement.\n`
      );
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_COVERAGE_SUMMARY,
  DEFAULT_INVENTORY,
  DEFAULT_RISK_THRESHOLD,
  DEFAULT_RTM,
  buildRequirementMap,
  generateCoverageMap,
  main,
  parseArgs,
  parseCsv,
  renderCoverageMapMarkdown,
  summarizeEnforcement
};
