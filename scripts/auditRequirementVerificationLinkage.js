#!/usr/bin/env node

/**
 * Requirement verification-linkage report (advisory; VHS-REQ-601).
 *
 * The RTM maps every Active requirement to its verification-reference test
 * files, and requirementsDocs.test.ts proves those files exist — that is the
 * authoritative requirement-to-test linkage. This report adds a softer,
 * discoverability-oriented signal: for each Active requirement, does at least one
 * of its verification-reference test files cite the requirement ID in-file, so a
 * reader or agent grepping `VHS-REQ-NNN` finds the tests that verify it?
 *
 * It is ADVISORY by default (exit 0). Passing --enforce makes it fail closed
 * (exit 1) when any Active requirement is unlinked; CI runs it in --enforce mode
 * now that the backlog is drained. Manual/external-only requirements never fail.
 * Each Active requirement is classified as:
 *   - linked           - at least one citeable verification test file cites the ID;
 *   - unlinked         - it has citeable verification test files but none cite the ID;
 *   - manual/external  - it has no citeable test file (verification is manual: or
 *                        external: only) — informational, not a finding.
 *
 * Pure helpers stay separate from a thin CLI so the classification is
 * unit-testable with injected fixtures. It uses only Node built-ins plus the
 * sibling traceability-audit module (parseCsv/splitReferences), so the command
 * needs no dependency install.
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseCsv, splitReferences } = require('./auditTraceabilitySteward.js');

const RTM_PATH = 'docs/requirements/rtm.csv';

function isNonPathReference(reference) {
  return reference.startsWith('manual:') || reference.startsWith('external:');
}

// A verification reference is a citeable test file when it is a repo-relative
// path under tests/ (not a manual:/external: marker). Any `#anchor` fragment and
// wrapping backticks are stripped first.
function isCiteableTestReference(reference) {
  if (isNonPathReference(reference)) {
    return false;
  }
  return cleanReference(reference).startsWith('tests/');
}

function cleanReference(reference) {
  return reference.replace(/`/g, '').split('#')[0].trim();
}

function classifyRequirementLinkage(rtmRows, readFile) {
  const linked = [];
  const unlinked = [];
  const manualOnly = [];

  for (const row of rtmRows) {
    const reqId = (row.ReqID || '').trim();
    if (reqId.length === 0) {
      continue;
    }

    const testReferences = splitReferences(row.VerificationRefs || '')
      .filter((reference) => isCiteableTestReference(reference))
      .map((reference) => cleanReference(reference));

    if (testReferences.length === 0) {
      manualOnly.push(reqId);
      continue;
    }

    const cited = testReferences.some((relativePath) => {
      const content = readFile(relativePath);
      return typeof content === 'string' && content.includes(reqId);
    });

    if (cited) {
      linked.push(reqId);
    } else {
      unlinked.push({ reqId, testReferences });
    }
  }

  return { linked, unlinked, manualOnly };
}

function auditRequirementVerificationLinkage(cwd = process.cwd(), deps = {}) {
  const readFile =
    deps.readFile ||
    ((relativePath) => {
      try {
        return fs.readFileSync(path.join(cwd, ...relativePath.split('/')), 'utf8');
      } catch {
        return undefined;
      }
    });

  const rtmText = readFile(RTM_PATH);
  if (typeof rtmText !== 'string') {
    throw new Error(`RTM not found at ${RTM_PATH}`);
  }

  const rtmRows = parseCsv(rtmText.replace(/\r\n/g, '\n'));
  const activeRows = rtmRows.filter((row) => (row.ReqID || '').trim().length > 0);
  const linkage = classifyRequirementLinkage(activeRows, readFile);

  return { total: activeRows.length, ...linkage };
}

function renderSummary(result, options = {}) {
  const lines = [];
  lines.push(`[requirements-linkage] Active requirements: ${result.total}`);
  lines.push(`[requirements-linkage] Linked (a verification test cites the ID): ${result.linked.length}`);
  lines.push(
    `[requirements-linkage] Unlinked (verification tests do not cite the ID): ${result.unlinked.length}`
  );
  for (const entry of result.unlinked) {
    lines.push(`  - ${entry.reqId}: ${entry.testReferences.join(', ')}`);
  }
  if (result.manualOnly.length > 0) {
    lines.push(
      `[requirements-linkage] Manual/external verification only (no citeable test file): ${result.manualOnly.length}`
    );
    lines.push(`  - ${result.manualOnly.join(', ')}`);
  }
  if (options.enforce) {
    lines.push(
      result.unlinked.length > 0
        ? '[requirements-linkage] Enforcing (--enforce): failing because at least one Active requirement is unlinked.'
        : '[requirements-linkage] Enforcing (--enforce): all Active requirements are linked.'
    );
  } else {
    lines.push('[requirements-linkage] Advisory report; verification-linkage does not fail CI.');
  }
  return lines.join('\n');
}

function renderStepSummary(result, options = {}) {
  const lines = [];
  lines.push('## Requirement Verification Linkage');
  lines.push('');
  lines.push(
    options.enforce
      ? '**Enforced check.** Each Active requirement must have at least one of its RTM ' +
          'verification-reference test files cite the requirement ID in-file so the verifying ' +
          'tests are discoverable by grepping the ID. The RTM remains the authoritative ' +
          'requirement-to-test linkage; this step fails when any Active requirement is unlinked.'
      : '**Advisory report.** For each Active requirement, at least one of its RTM ' +
          'verification-reference test files should cite the requirement ID in-file so the verifying ' +
          'tests are discoverable by grepping the ID. The RTM remains the authoritative ' +
          'requirement-to-test linkage; this signal is discoverability polish and does not fail CI.'
  );
  lines.push('');
  lines.push(`- Active requirements: ${result.total}`);
  lines.push(`- Linked: ${result.linked.length}`);
  lines.push(`- Unlinked: ${result.unlinked.length}`);
  lines.push(`- Manual/external verification only: ${result.manualOnly.length}`);
  lines.push('');

  if (result.unlinked.length > 0) {
    lines.push('### Unlinked requirements');
    lines.push('');
    lines.push('| Requirement | Verification test files |');
    lines.push('| --- | --- |');
    for (const entry of result.unlinked) {
      lines.push(`| \`${entry.reqId}\` | ${entry.testReferences.map((ref) => `\`${ref}\``).join(' ')} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main(argv = process.argv.slice(2), deps = {}) {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const enforce = deps.enforce ?? argv.includes('--enforce');
  const cwd = deps.cwd || positionals[0] || process.cwd();
  const result = auditRequirementVerificationLinkage(cwd, deps);

  const stepSummaryPath = deps.stepSummaryPath || process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    const appendStepSummary =
      deps.appendStepSummary || ((filePath, content) => fs.appendFileSync(filePath, content));
    appendStepSummary(stepSummaryPath, `${renderStepSummary(result, { enforce })}\n`);
  }

  (deps.stdout || process.stdout).write(`${renderSummary(result, { enforce })}\n`);

  // Advisory by default (exit 0). With --enforce the guard fails closed (exit 1)
  // when any Active requirement is unlinked; CI runs it in --enforce mode now
  // that the backlog is drained. The RTM remains the authoritative
  // requirement-to-test linkage; the advisory report is discoverability
  // intelligence for closing citation gaps incrementally.
  if (enforce && result.unlinked.length > 0) {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  RTM_PATH,
  isCiteableTestReference,
  cleanReference,
  classifyRequirementLinkage,
  auditRequirementVerificationLinkage,
  renderSummary,
  renderStepSummary,
  main
};
