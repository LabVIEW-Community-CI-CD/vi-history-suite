#!/usr/bin/env node

/**
 * Traceability Steward Audit Script
 *
 * Reports unmapped implementation candidates, unmapped test candidates,
 * and missing RTM references. Designed as a non-punitive baseline for
 * incremental traceability improvement.
 *
 * Classifications:
 * - mapped: File is referenced in rtm.csv ImplementationRefs or VerificationRefs.
 * - supporting: Infrastructure file not directly traceable but necessary.
 * - dev-only: Development tooling, not shipped or traced.
 * - release-ci: CI/CD workflows and release infrastructure.
 * - asset-doc: Documentation and assets.
 * - gap: Implementation or test file pending RTM classification.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');

const VALID_CLASSIFICATIONS = [
  'mapped',
  'supporting',
  'dev-only',
  'release-ci',
  'asset-doc',
  'gap'
];

const IMPLEMENTATION_GLOBS = [
  'src/**/*.ts',
  'scripts/*.js'
];

const TEST_GLOBS = [
  'tests/unit/*.ts',
  'tests/integration/**/*.ts'
];

const TRACEABILITY_SURFACE_GLOBS = [
  ...IMPLEMENTATION_GLOBS,
  ...TEST_GLOBS,
  'docs/architecture/*.md',
  'docs/architecture/**/*.md',
  'docs/requirements/*.md',
  'docs/requirements/*.csv',
  '.github/workflows/*.yml',
  '.github/ISSUE_TEMPLATE/*.yml',
  'resources/bundled-docs/**',
  'package.json',
  'package-lock.json',
  'README.md',
  'INSTALL.md',
  'FIRST-RUN.md',
  'SUPPORT.md',
  'SECURITY.md',
  'vagrant/Vagrantfile',
  'vagrant/provision/**/*.ps1',
  '.devcontainer/**',
  '.vscode/*.json'
];

const GENERATED_TRACEABILITY_SURFACE_FILES = new Set([
  '.devcontainer/devcontainer-lock.json'
]);

const ALLOWED_HIDDEN_DIRECTORIES = new Set([
  '.github',
  '.devcontainer',
  '.vscode'
]);

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];
      if (inQuotes && nextCharacter === '"') {
        // Escaped quote (doubled quote) - add one quote and advance index to skip
        // the second quote character; the loop's own increment then moves past it.
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        // CRLF line ending - advance index to skip the \n character;
        // the loop's own increment then moves past it.
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = '';

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  const [header, ...body] = rows;
  return body.map((row) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });
}

function splitReferences(value) {
  return value
    .split(';')
    .map((reference) => reference.trim())
    .filter((reference) => reference.length > 0);
}

function isNonPathReference(reference) {
  return reference.startsWith('manual:') || reference.startsWith('external:');
}

function extractRtmPaths(rtmRows) {
  const paths = new Set();
  for (const row of rtmRows) {
    for (const reference of [
      ...splitReferences(row.ImplementationRefs || ''),
      ...splitReferences(row.VerificationRefs || '')
    ]) {
      if (!isNonPathReference(reference)) {
        const cleanReference = reference.replace(/`/g, '').split('#')[0].trim();
        if (cleanReference.length > 0) {
          paths.add(cleanReference);
        }
      }
    }
  }
  return paths;
}

function globToRegex(globPattern) {
  let regex = globPattern
    .replace(/\\/g, '\\\\')
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*');
  return new RegExp(`^${regex}$`);
}

function findMatchingFiles(patterns, cwd) {
  const files = [];
  const regexPatterns = patterns.map(globToRegex);

  function walkDir(dir, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const shouldTraverseHiddenDirectory = ALLOWED_HIDDEN_DIRECTORIES.has(entry.name);
        if ((shouldTraverseHiddenDirectory || !entry.name.startsWith('.')) && entry.name !== 'node_modules' && entry.name !== 'out' && entry.name !== 'out-tests') {
          walkDir(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        if (regexPatterns.some((regex) => regex.test(relPath))) {
          files.push(relPath);
        }
      }
    }
  }

  walkDir(cwd);
  return files;
}

function loadInventory(inventoryPath) {
  if (!fs.existsSync(inventoryPath)) {
    return { rows: [], byPath: new Map() };
  }

  const text = fs.readFileSync(inventoryPath, 'utf8').replace(/\r\n/g, '\n');
  const rows = parseCsv(text);
  const byPath = new Map(rows.map((row) => [row.Path, row]));
  return { rows, byPath };
}

function loadRtm(rtmPath) {
  const text = fs.readFileSync(rtmPath, 'utf8').replace(/\r\n/g, '\n');
  return parseCsv(text);
}

function auditTraceability(deps = {}) {
  const cwd = deps.cwd ?? repoRoot;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  const inventoryPath = path.join(cwd, 'docs', 'requirements', 'traceability-inventory.csv');
  const rtmPath = path.join(cwd, 'docs', 'requirements', 'rtm.csv');

  const findings = {
    missingInventoryFile: false,
    missingRtmFile: false,
    invalidClassifications: [],
    unmappedImplementationCandidates: [],
    unmappedTestCandidates: [],
    missingInventoryEntries: [],
    missingRtmReferences: [],
    rtmCoverageMismatches: [],
    gapEntriesPresentInRtm: [],
    gapCount: 0,
    totalInventoryEntries: 0
  };

  if (!fs.existsSync(inventoryPath)) {
    findings.missingInventoryFile = true;
    stderr.write('[traceability-audit] Missing inventory file: docs/requirements/traceability-inventory.csv\n');
    return { success: false, findings };
  }

  if (!fs.existsSync(rtmPath)) {
    findings.missingRtmFile = true;
    stderr.write('[traceability-audit] Missing RTM file: docs/requirements/rtm.csv\n');
    return { success: false, findings };
  }

  const inventory = loadInventory(inventoryPath);
  const rtmRows = loadRtm(rtmPath);
  const rtmPaths = extractRtmPaths(rtmRows);

  findings.totalInventoryEntries = inventory.rows.length;

  // Validate classifications and RTM coverage consistency.
  for (const row of inventory.rows) {
    const isInRtm = rtmPaths.has(row.Path);
    const normalizedCoverage = (row.RtmCoverage || '').trim().toLowerCase();
    const expectsRtmMembership = normalizedCoverage === 'yes';
    const expectsNoRtmMembership = normalizedCoverage === 'no';

    if (!VALID_CLASSIFICATIONS.includes(row.Classification)) {
      findings.invalidClassifications.push({
        path: row.Path,
        classification: row.Classification
      });
    }

    if (
      (expectsRtmMembership && !isInRtm) ||
      (expectsNoRtmMembership && isInRtm)
    ) {
      findings.rtmCoverageMismatches.push({
        path: row.Path,
        rtmCoverage: row.RtmCoverage,
        inRtm: isInRtm
      });
    }

    if (row.Classification === 'mapped' && !isInRtm) {
      findings.missingRtmReferences.push(row.Path);
    }

    if (row.Classification === 'gap') {
      findings.gapCount += 1;
      if (isInRtm) {
        findings.gapEntriesPresentInRtm.push(row.Path);
      }
    }
  }

  // Find committed traceability surface files that must be inventoried.
  const candidateFiles = findMatchingFiles(TRACEABILITY_SURFACE_GLOBS, cwd)
    .filter((file) => !GENERATED_TRACEABILITY_SURFACE_FILES.has(file));
  for (const file of candidateFiles) {
    if (!inventory.byPath.has(file)) {
      findings.missingInventoryEntries.push(file);
    }
  }

  // Find implementation files
  const implementationFiles = findMatchingFiles(IMPLEMENTATION_GLOBS, cwd);
  for (const file of implementationFiles) {
    const inventoryEntry = inventory.byPath.get(file);
    if (!inventoryEntry) {
      if (!rtmPaths.has(file)) {
        findings.unmappedImplementationCandidates.push(file);
      }
    }
  }

  // Find test files
  const testFiles = findMatchingFiles(TEST_GLOBS, cwd);
  for (const file of testFiles) {
    const inventoryEntry = inventory.byPath.get(file);
    if (!inventoryEntry) {
      if (!rtmPaths.has(file)) {
        findings.unmappedTestCandidates.push(file);
      }
    }
  }

  // Report findings
  stdout.write('[traceability-audit] Traceability steward audit complete.\n');
  stdout.write(`[traceability-audit] Total inventory entries: ${findings.totalInventoryEntries}\n`);
  stdout.write(`[traceability-audit] Gap entries pending classification: ${findings.gapCount}\n`);

  if (findings.invalidClassifications.length > 0) {
    stderr.write(`[traceability-audit] Invalid classifications: ${findings.invalidClassifications.length}\n`);
    for (const { path: filePath, classification } of findings.invalidClassifications) {
      stderr.write(`  - ${filePath}: invalid classification '${classification}'\n`);
    }
  }

  if (findings.missingInventoryEntries.length > 0) {
    stderr.write(`[traceability-audit] Missing inventory entries: ${findings.missingInventoryEntries.length}\n`);
    for (const filePath of findings.missingInventoryEntries) {
      stderr.write(`  - ${filePath}\n`);
    }
  }

  if (findings.unmappedImplementationCandidates.length > 0) {
    stdout.write(`[traceability-audit] Unmapped implementation candidates: ${findings.unmappedImplementationCandidates.length}\n`);
    for (const filePath of findings.unmappedImplementationCandidates) {
      stdout.write(`  - ${filePath}\n`);
    }
  }

  if (findings.unmappedTestCandidates.length > 0) {
    stdout.write(`[traceability-audit] Unmapped test candidates: ${findings.unmappedTestCandidates.length}\n`);
    for (const filePath of findings.unmappedTestCandidates) {
      stdout.write(`  - ${filePath}\n`);
    }
  }

  if (findings.missingRtmReferences.length > 0) {
    stderr.write(`[traceability-audit] Files marked mapped but missing from RTM: ${findings.missingRtmReferences.length}\n`);
    for (const filePath of findings.missingRtmReferences) {
      stderr.write(`  - ${filePath}\n`);
    }
  }

  if (findings.rtmCoverageMismatches.length > 0) {
    stderr.write(`[traceability-audit] Inventory RtmCoverage mismatches: ${findings.rtmCoverageMismatches.length}\n`);
    for (const mismatch of findings.rtmCoverageMismatches) {
      stderr.write(`  - ${mismatch.path}: RtmCoverage='${mismatch.rtmCoverage}' but ${mismatch.inRtm ? 'is' : 'is not'} in RTM\n`);
    }
  }

  if (findings.gapEntriesPresentInRtm.length > 0) {
    stderr.write(`[traceability-audit] Gap entries already represented in RTM: ${findings.gapEntriesPresentInRtm.length}\n`);
    for (const filePath of findings.gapEntriesPresentInRtm) {
      stderr.write(`  - ${filePath}\n`);
    }
  }

  // Non-punitive baseline: report but do not fail for gap entries
  const hasBlockingIssues =
    findings.invalidClassifications.length > 0 ||
    findings.missingInventoryEntries.length > 0 ||
    findings.missingRtmReferences.length > 0 ||
    findings.rtmCoverageMismatches.length > 0 ||
    findings.gapEntriesPresentInRtm.length > 0;

  if (hasBlockingIssues) {
    stderr.write('[traceability-audit] Audit found blocking issues.\n');
  } else {
    stdout.write('[traceability-audit] Audit passed. Gap entries are informational only.\n');
  }

  return {
    success: !hasBlockingIssues,
    findings
  };
}

function main() {
  try {
    const result = auditTraceability();
    return result.success ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  VALID_CLASSIFICATIONS,
  IMPLEMENTATION_GLOBS,
  TEST_GLOBS,
  TRACEABILITY_SURFACE_GLOBS,
  GENERATED_TRACEABILITY_SURFACE_FILES,
  auditTraceability,
  extractRtmPaths,
  findMatchingFiles,
  globToRegex,
  loadInventory,
  loadRtm,
  parseCsv,
  splitReferences
};
