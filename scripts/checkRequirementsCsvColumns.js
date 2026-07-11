#!/usr/bin/env node

/**
 * Requirements CSV column-integrity guard.
 *
 * The requirements CSVs (rtm.csv, id-index.csv, traceability-inventory.csv) are
 * machine-readable work contracts. Each is parsed by mapping fields to the
 * header columns *by index* (see scripts/auditTraceabilitySteward.js and
 * tests/unit/requirementsDocs.test.ts). If a data row has a different column
 * count than its header - almost always because a field contains an unescaped
 * comma and was not wrapped in double quotes - the extra columns are silently
 * dropped and later fields shift, corrupting the record (for example, a
 * truncated Notes value) without failing any existing gate.
 *
 * This guard enforces the contract that every data row has exactly the same
 * number of columns as its header, and prints the enforced contract plus the
 * validated requirement IDs to the GitHub step summary so the requirements are
 * front-facing on every pull request.
 *
 * The module keeps pure helpers separate from a thin CLI entrypoint so the
 * behavior is unit-testable with injected fixtures and dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');

// The requirements CSVs whose column integrity is enforced on every PR. The
// expected column count for each file is derived from its own header row rather
// than hard-coded, so the contract stays correct if a header legitimately
// changes. isRequirementIndex marks the file whose first column is the
// authoritative requirement ID list surfaced at runtime.
const REQUIREMENTS_CSVS = [
  {
    relativePath: 'docs/requirements/rtm.csv',
    identityLabel: 'ReqID',
    isRequirementIndex: true
  },
  {
    relativePath: 'docs/requirements/id-index.csv',
    identityLabel: 'ID',
    isRequirementIndex: false
  },
  {
    relativePath: 'docs/requirements/traceability-inventory.csv',
    identityLabel: 'Path',
    isRequirementIndex: false
  }
];

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

/**
 * Quote-aware CSV tokenizer that returns each row's raw cell array together
 * with the 1-based physical line where the row starts. Mirrors the tokenizer
 * used by the production parsers (doubled-quote escaping, CRLF handling) but
 * preserves the true column count instead of mapping onto fixed headers.
 */
function parseCsvRows(text) {
  const rows = [];
  let cells = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let rowStarted = false;

  const markRowStart = () => {
    if (!rowStarted) {
      rowStartLine = line;
      rowStarted = true;
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      markRowStart();
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      markRowStart();
      cells.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      cells.push(cell);
      cell = '';
      if (cells.some((value) => value.length > 0)) {
        rows.push({ lineNumber: rowStarted ? rowStartLine : line, cells });
      }
      cells = [];
      rowStarted = false;
      line += 1;
      continue;
    }

    markRowStart();
    cell += character;
  }

  if (cell.length > 0 || cells.length > 0) {
    cells.push(cell);
    rows.push({ lineNumber: rowStarted ? rowStartLine : line, cells });
  }

  return rows;
}

/**
 * Validate a single CSV document. Returns the header, the expected column
 * count, the identity of every data row, and any rows whose column count does
 * not match the header.
 */
function checkCsv(text) {
  const rows = parseCsvRows(text);
  const header = rows.length > 0 ? rows[0].cells : [];
  const expectedColumns = header.length;
  const dataRows = rows.slice(1);
  const violations = [];

  for (const row of dataRows) {
    if (row.cells.length !== expectedColumns) {
      violations.push({
        lineNumber: row.lineNumber,
        id: row.cells[0] || '',
        columns: row.cells.length,
        expectedColumns
      });
    }
  }

  return {
    header,
    expectedColumns,
    dataRowCount: dataRows.length,
    ids: dataRows.map((row) => row.cells[0] || ''),
    violations
  };
}

/**
 * Validate every requirements CSV under cwd. deps.readFile and deps.targets are
 * injectable for tests.
 */
function checkRequirementsCsvColumns(cwd = process.cwd(), deps = {}) {
  const readFile = deps.readFile || ((filePath) => fs.readFileSync(filePath, 'utf8'));
  const targets = deps.targets || REQUIREMENTS_CSVS;
  const files = [];

  for (const target of targets) {
    const absolutePath = path.join(cwd, ...target.relativePath.split('/'));
    const text = readFile(absolutePath).replace(/\r\n/g, '\n');
    const result = checkCsv(text);
    files.push({
      relativePath: target.relativePath,
      identityLabel: target.identityLabel,
      isRequirementIndex: Boolean(target.isRequirementIndex),
      header: result.header,
      expectedColumns: result.expectedColumns,
      dataRowCount: result.dataRowCount,
      ids: result.ids,
      violations: result.violations
    });
  }

  const violationCount = files.reduce((sum, file) => sum + file.violations.length, 0);
  return {
    success: violationCount === 0,
    violationCount,
    files
  };
}

/** Plain-text summary for stdout/stderr and CI logs. */
function renderSummary(result) {
  const lines = [];
  for (const file of result.files) {
    const status = file.violations.length === 0 ? 'pass' : `FAIL (${file.violations.length})`;
    lines.push(
      `[requirements-csv] ${file.relativePath}: ${file.expectedColumns} columns, ` +
        `${file.dataRowCount} data rows -> ${status}`
    );
    for (const violation of file.violations) {
      lines.push(
        `  - line ${violation.lineNumber} (${file.identityLabel}=${violation.id || 'unknown'}): ` +
          `found ${violation.columns} columns, expected ${violation.expectedColumns} ` +
          '(likely an unescaped comma in an unquoted field)'
      );
    }
  }

  if (result.success) {
    lines.push('[requirements-csv] Column-integrity check passed.');
  } else {
    lines.push(
      `[requirements-csv] Column-integrity check failed: ${result.violationCount} malformed row(s). ` +
        'Wrap any field containing a comma in double quotes (RFC-4180).'
    );
  }

  return lines.join('\n');
}

/**
 * Front-facing Markdown for the GitHub step summary: prints the enforced
 * runtime contract and the requirement IDs validated on this run so anyone
 * reviewing the pull request can see the requirements without opening the CSVs.
 */
function renderStepSummary(result) {
  const lines = [];
  lines.push('## Requirements CSV Integrity');
  lines.push('');
  lines.push(
    '**Runtime contract enforced on every pull request:** every data row in each ' +
      'requirements CSV must have exactly the same number of columns as its header. ' +
      'Any field that contains a comma must be wrapped in double quotes (RFC-4180). ' +
      'An unescaped comma silently drops trailing columns and shifts later fields ' +
      '(for example, a truncated `Notes` value), which no other gate detects.'
  );
  lines.push('');
  lines.push(`**Result:** ${result.success ? 'PASS' : 'FAIL'} — ${result.violationCount} malformed row(s).`);
  lines.push('');
  lines.push('| File | Identity column | Required columns | Data rows | Status |');
  lines.push('| ---- | --------------- | ---------------- | --------- | ------ |');
  for (const file of result.files) {
    const status = file.violations.length === 0 ? 'pass' : `FAIL (${file.violations.length})`;
    lines.push(
      `| \`${toPosixPath(file.relativePath)}\` | ${file.identityLabel} | ` +
        `${file.expectedColumns} | ${file.dataRowCount} | ${status} |`
    );
  }
  lines.push('');

  const requirementIndex = result.files.find((file) => file.isRequirementIndex);
  if (requirementIndex) {
    lines.push(
      `### Requirements validated at runtime (${requirementIndex.ids.length} from ` +
        `\`${toPosixPath(requirementIndex.relativePath)}\`)`
    );
    lines.push('');
    lines.push(requirementIndex.ids.join(', '));
    lines.push('');
  }

  if (!result.success) {
    lines.push('### Malformed rows');
    lines.push('');
    lines.push('| File | Line | Identity | Columns found | Columns expected |');
    lines.push('| ---- | ---- | -------- | ------------- | ---------------- |');
    for (const file of result.files) {
      for (const violation of file.violations) {
        lines.push(
          `| \`${toPosixPath(file.relativePath)}\` | ${violation.lineNumber} | ` +
            `\`${violation.id || 'unknown'}\` | ${violation.columns} | ${violation.expectedColumns} |`
        );
      }
    }
    lines.push('');
    lines.push('Fix: wrap the affected field(s) in double quotes so each row parses to its header column count.');
    lines.push('');
  }

  return lines.join('\n');
}

function main(argv = process.argv.slice(2), deps = {}) {
  const cwd = deps.cwd || argv[0] || process.cwd();
  const result = checkRequirementsCsvColumns(cwd, deps);
  const output = `${renderSummary(result)}\n`;

  const stepSummaryPath = deps.stepSummaryPath || process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    const appendStepSummary =
      deps.appendStepSummary || ((filePath, content) => fs.appendFileSync(filePath, content));
    appendStepSummary(stepSummaryPath, `${renderStepSummary(result)}\n`);
  }

  (result.success ? deps.stdout || process.stdout : deps.stderr || process.stderr).write(output);
  return result.success ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REQUIREMENTS_CSVS,
  parseCsvRows,
  checkCsv,
  checkRequirementsCsvColumns,
  renderSummary,
  renderStepSummary,
  main
};
