#!/usr/bin/env node

/**
 * Requirements cross-reference integrity guard.
 *
 * The column-integrity guard (scripts/checkRequirementsCsvColumns.js) proves each
 * requirements CSV row is well-formed. This guard proves the requirements
 * artifacts cross-reference each other consistently - the structural invariants
 * that no other gate enforces and that therefore rot silently:
 *
 *   1. anchorResolution  - every Active id-index CurrentAnchor resolves to a real
 *                          heading in srs.md (a renamed heading leaves a dangling
 *                          anchor that the `^srs\.md#` prefix check never catches).
 *   2. parentExistence   - every RTM ParentID is an Active system requirement in
 *                          syrs.md (the RTM test only checks the ID format).
 *   3. inventoryPathExists - every traceability-inventory Path exists on disk (the
 *                          traceability audit validates disk->inventory, never the
 *                          reverse, so a row for a deleted file is never flagged).
 *   4. replacementResolution - every id-index ReplacementID resolves to a defined
 *                          id-index ID (no dangling supersede/retire pointer).
 *   5. referenceAgreement - the Implementation and Verification References in
 *                          each SRS requirement block match the RTM evidence map
 *                          (the human-readable spec states exactly the evidence
 *                          the machine traceability tracks).
 *   6. systemRequirementReferences - every Active system requirement declares
 *                          Verification References and each resolves on disk.
 *   7. requirementVerificationEvidence - every Active RTM requirement declares at
 *                          least one Verification Reference (symmetric with 6, so
 *                          a software requirement can never lose its verification
 *                          evidence to an empty cell).
 *
 * The guard reuses the canonical implementations so it validates against exactly
 * the logic the real consumers use: parseCsv (traceability audit) and
 * markdownAnchors/slugHeading (documentation link checker). It uses only Node
 * built-ins plus those sibling scripts, so the CI job needs no dependency install.
 *
 * Pure helpers stay separate from a thin CLI entrypoint so the behavior is
 * unit-testable with injected fixtures.
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseCsv, splitReferences } = require('./auditTraceabilitySteward.js');
const { markdownAnchors } = require('./checkDocsLinks.js');

const SRS_PATH = 'docs/requirements/srs.md';
const SYRS_PATH = 'docs/requirements/syrs.md';
const RTM_PATH = 'docs/requirements/rtm.csv';
const ID_INDEX_PATH = 'docs/requirements/id-index.csv';
const INVENTORY_PATH = 'docs/requirements/traceability-inventory.csv';

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

// The Active system requirements are the headings in syrs.md. A software
// requirement must be parented to one of these (never to a superseded system
// requirement or an ID that was never defined).
function extractSystemRequirementIds(syrsText) {
  const ids = new Set();
  const pattern = /^#{1,6}[ \t]+(VHS-SYS-REQ-\d+):/gm;
  for (const match of syrsText.matchAll(pattern)) {
    ids.add(match[1]);
  }
  return ids;
}

// A System requirement (Kind=System) anchors into syrs.md; a Software
// requirement anchors into srs.md. Resolve each Active anchor against the
// document its Kind requires so a renamed heading in either specification is
// caught, and a row pointing at the wrong document is caught too.
function checkAnchorResolution(idIndexRows, srsText, syrsText) {
  const anchorsByDocument = {
    'srs.md': markdownAnchors(srsText),
    'syrs.md': markdownAnchors(syrsText)
  };
  const violations = [];

  for (const row of idIndexRows) {
    if ((row.Status || '').trim() !== 'Active') {
      continue;
    }

    const anchor = (row.CurrentAnchor || '').trim();
    if (anchor.length === 0) {
      violations.push({ subject: row.ID, detail: 'Active row has an empty CurrentAnchor' });
      continue;
    }

    const expectedDocument = (row.Kind || '').trim() === 'System' ? 'syrs.md' : 'srs.md';
    const hashIndex = anchor.indexOf('#');
    const target = hashIndex >= 0 ? anchor.slice(0, hashIndex) : anchor;
    const fragment = hashIndex >= 0 ? anchor.slice(hashIndex + 1) : '';

    if (target !== expectedDocument) {
      violations.push({
        subject: row.ID,
        detail: `CurrentAnchor target '${target}' should be ${expectedDocument}`
      });
      continue;
    }

    if (!anchorsByDocument[expectedDocument].has(fragment)) {
      violations.push({
        subject: row.ID,
        detail: `CurrentAnchor '#${fragment}' has no matching heading in ${expectedDocument}`
      });
    }
  }

  return violations;
}

function checkParentExistence(rtmRows, systemRequirementIds) {
  const violations = [];
  for (const row of rtmRows) {
    const parent = (row.ParentID || '').trim();
    if (!systemRequirementIds.has(parent)) {
      violations.push({
        subject: row.ReqID,
        detail: `ParentID '${parent}' is not an Active system requirement in syrs.md`
      });
    }
  }
  return violations;
}

function checkInventoryPaths(inventoryRows, cwd, fileExists) {
  const violations = [];
  for (const row of inventoryRows) {
    const relativePath = (row.Path || '').trim();
    if (relativePath.length === 0) {
      continue;
    }
    const absolutePath = path.join(cwd, ...relativePath.split('/'));
    if (!fileExists(absolutePath)) {
      violations.push({ subject: relativePath, detail: 'inventory Path does not exist on disk' });
    }
  }
  return violations;
}

function checkReplacementResolution(idIndexRows) {
  const definedIds = new Set(idIndexRows.map((row) => (row.ID || '').trim()).filter((id) => id.length > 0));
  const violations = [];
  for (const row of idIndexRows) {
    const replacement = (row.ReplacementID || '').trim();
    if (replacement.length > 0 && !definedIds.has(replacement)) {
      violations.push({
        subject: row.ID,
        detail: `ReplacementID '${replacement}' is not a defined id-index ID`
      });
    }
  }
  return violations;
}

// Each SRS requirement block lists its Implementation and Verification
// References; the RTM row is the authoritative evidence map. They must agree so
// the human-readable specification states exactly the evidence the machine
// traceability tracks (extending the existing SRS<->RTM ID parity to evidence).
function extractSectionReferences(blockBody, label) {
  const references = [];
  let inSection = false;
  for (const line of blockBody.split('\n')) {
    if (/^- [A-Za-z]/.test(line)) {
      inSection = line.trim() === `- ${label}:`;
      continue;
    }
    if (inSection) {
      const match = /^\s+- `([^`]+)`/.exec(line);
      if (match) {
        references.push(match[1].trim());
      }
    }
  }
  return references;
}

function extractSrsReferenceSections(srsText) {
  const sections = new Map();
  const headingPattern = /^### (VHS-REQ-\d+):/gm;
  const headings = [...srsText.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const id = headings[index][1];
    const start = headings[index].index;
    const end = index + 1 < headings.length ? headings[index + 1].index : srsText.length;
    const body = srsText.slice(start, end);
    sections.set(id, {
      implementation: extractSectionReferences(body, 'Implementation References'),
      verification: extractSectionReferences(body, 'Verification References')
    });
  }
  return sections;
}

function checkReferenceAgreement(rtmRows, srsReferenceSections) {
  const violations = [];

  const compareSection = (reqId, label, rtmReferences, srsReferences) => {
    const rtmSet = new Set(rtmReferences);
    const srsSet = new Set(srsReferences);
    for (const reference of rtmSet) {
      if (!srsSet.has(reference)) {
        violations.push({
          subject: reqId,
          detail: `${label} '${reference}' is tracked in the RTM but missing from the SRS block`
        });
      }
    }
    for (const reference of srsSet) {
      if (!rtmSet.has(reference)) {
        violations.push({
          subject: reqId,
          detail: `${label} '${reference}' is in the SRS block but not tracked in the RTM`
        });
      }
    }
  };

  for (const row of rtmRows) {
    const section = srsReferenceSections.get(row.ReqID);
    if (!section) {
      // SRS<->RTM ID parity is enforced by requirementsDocs.test.ts; skip rows
      // with no SRS block rather than double-reporting a missing block here.
      continue;
    }
    compareSection(
      row.ReqID,
      'Implementation Reference',
      splitReferences(row.ImplementationRefs || ''),
      section.implementation
    );
    compareSection(
      row.ReqID,
      'Verification Reference',
      splitReferences(row.VerificationRefs || ''),
      section.verification
    );
  }

  return violations;
}

// System requirements (syrs.md) carry their own Verification References. The
// software-requirement RTM references are resolved by requirementsDocs.test.ts,
// but nothing validated the system-requirement references - this closes that
// asymmetry so a renamed or deleted file referenced by an Active system
// requirement fails closed like a software-requirement reference does.
function extractSyrsVerificationReferences(syrsText) {
  const references = new Map();
  const headingPattern = /^### (VHS-SYS-REQ-\d+):/gm;
  const headings = [...syrsText.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const id = headings[index][1];
    const start = headings[index].index;
    const end = index + 1 < headings.length ? headings[index + 1].index : syrsText.length;
    const body = syrsText.slice(start, end);
    if (!/^- Status: Active$/m.test(body)) {
      continue;
    }
    references.set(id, extractSectionReferences(body, 'Verification References'));
  }
  return references;
}

function checkSystemRequirementReferences(syrsVerificationReferences, cwd, fileExists) {
  const violations = [];
  for (const [id, references] of syrsVerificationReferences) {
    if (references.length === 0) {
      violations.push({
        subject: id,
        detail: 'Active system requirement has no Verification References'
      });
      continue;
    }
    for (const reference of references) {
      if (reference.startsWith('manual:') || reference.startsWith('external:')) {
        continue;
      }
      const cleanReference = reference.split('#')[0].trim();
      if (cleanReference.length === 0) {
        continue;
      }
      const absolutePath = path.join(cwd, ...cleanReference.split('/'));
      if (!fileExists(absolutePath)) {
        violations.push({
          subject: id,
          detail: `Verification Reference '${reference}' does not exist on disk`
        });
      }
    }
  }
  return violations;
}

// Symmetric with checkSystemRequirementReferences: an Active system requirement
// must declare Verification References, so an Active software requirement (RTM
// row) must too. An empty VerificationRefs cell otherwise passes both the
// agreement check (empty equals empty) and the resolution test (nothing to
// iterate), silently leaving the requirement unverified.
function checkRequirementVerificationEvidence(rtmRows) {
  const violations = [];
  for (const row of rtmRows) {
    if ((row.Status || '').trim() !== 'Active') {
      continue;
    }
    if (splitReferences(row.VerificationRefs || '').length === 0) {
      violations.push({
        subject: row.ReqID,
        detail: 'Active requirement declares no Verification References'
      });
    }
  }
  return violations;
}

function checkRequirementsIntegrity(cwd = process.cwd(), deps = {}) {
  const readFile =
    deps.readFile ||
    ((relativePath) => fs.readFileSync(path.join(cwd, ...relativePath.split('/')), 'utf8'));
  const fileExists = deps.fileExists || ((absolutePath) => fs.existsSync(absolutePath));

  const srsText = normalizeNewlines(readFile(SRS_PATH));
  const syrsText = normalizeNewlines(readFile(SYRS_PATH));
  const rtmRows = parseCsv(normalizeNewlines(readFile(RTM_PATH)));
  const idIndexRows = parseCsv(normalizeNewlines(readFile(ID_INDEX_PATH)));
  const inventoryRows = parseCsv(normalizeNewlines(readFile(INVENTORY_PATH)));

  const systemRequirementIds = extractSystemRequirementIds(syrsText);
  const srsReferenceSections = extractSrsReferenceSections(srsText);
  const syrsVerificationReferences = extractSyrsVerificationReferences(syrsText);

  const checks = [
    {
      key: 'anchorResolution',
      title: 'Active id-index anchors resolve to their specification heading',
      violations: checkAnchorResolution(idIndexRows, srsText, syrsText)
    },
    {
      key: 'parentExistence',
      title: 'RTM ParentID is an Active system requirement',
      violations: checkParentExistence(rtmRows, systemRequirementIds)
    },
    {
      key: 'inventoryPathExists',
      title: 'traceability-inventory Path exists on disk',
      violations: checkInventoryPaths(inventoryRows, cwd, fileExists)
    },
    {
      key: 'replacementResolution',
      title: 'id-index ReplacementID resolves to a defined ID',
      violations: checkReplacementResolution(idIndexRows)
    },
    {
      key: 'referenceAgreement',
      title: 'SRS block references match the RTM evidence map',
      violations: checkReferenceAgreement(rtmRows, srsReferenceSections)
    },
    {
      key: 'systemRequirementReferences',
      title: 'Active system requirement Verification References resolve on disk',
      violations: checkSystemRequirementReferences(syrsVerificationReferences, cwd, fileExists)
    },
    {
      key: 'requirementVerificationEvidence',
      title: 'Active requirement declares a Verification Reference',
      violations: checkRequirementVerificationEvidence(rtmRows)
    }
  ];

  const violationCount = checks.reduce((sum, check) => sum + check.violations.length, 0);
  return { success: violationCount === 0, violationCount, checks };
}

function renderSummary(result) {
  const lines = [];
  for (const check of result.checks) {
    const status = check.violations.length === 0 ? 'pass' : `FAIL (${check.violations.length})`;
    lines.push(`[requirements-integrity] ${check.title}: ${status}`);
    for (const violation of check.violations) {
      lines.push(`  - ${violation.subject}: ${violation.detail}`);
    }
  }

  if (result.success) {
    lines.push('[requirements-integrity] Cross-reference integrity check passed.');
  } else {
    lines.push(
      `[requirements-integrity] Cross-reference integrity check failed: ${result.violationCount} violation(s).`
    );
  }

  return lines.join('\n');
}

function renderStepSummary(result) {
  const lines = [];
  lines.push('## Requirements Cross-Reference Integrity');
  lines.push('');
  lines.push(
    '**Runtime contract enforced on every pull request:** the requirements artifacts must ' +
      'cross-reference each other consistently. Every Active id-index anchor must resolve to a ' +
      'real specification heading, every RTM ParentID must be an Active system requirement, every ' +
      'traceability-inventory Path must exist on disk, every id-index ReplacementID must resolve ' +
      'to a defined ID, the Implementation and Verification References in every SRS block must ' +
      'match the RTM evidence map, every Active system requirement must declare Verification ' +
      'References that resolve on disk, and every Active requirement must declare a Verification ' +
      'Reference.'
  );
  lines.push('');
  lines.push(`**Result:** ${result.success ? 'PASS' : 'FAIL'} — ${result.violationCount} violation(s).`);
  lines.push('');
  lines.push('| Invariant | Status |');
  lines.push('| --------- | ------ |');
  for (const check of result.checks) {
    const status = check.violations.length === 0 ? 'pass' : `FAIL (${check.violations.length})`;
    lines.push(`| ${check.title} | ${status} |`);
  }
  lines.push('');

  if (!result.success) {
    lines.push('### Violations');
    lines.push('');
    lines.push('| Invariant | Subject | Detail |');
    lines.push('| --------- | ------- | ------ |');
    for (const check of result.checks) {
      for (const violation of check.violations) {
        lines.push(`| ${check.key} | \`${violation.subject}\` | ${violation.detail} |`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main(argv = process.argv.slice(2), deps = {}) {
  const cwd = deps.cwd || argv[0] || process.cwd();
  const result = checkRequirementsIntegrity(cwd, deps);
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
  SRS_PATH,
  SYRS_PATH,
  RTM_PATH,
  ID_INDEX_PATH,
  INVENTORY_PATH,
  extractSystemRequirementIds,
  checkAnchorResolution,
  checkParentExistence,
  checkInventoryPaths,
  checkReplacementResolution,
  extractSectionReferences,
  extractSrsReferenceSections,
  checkReferenceAgreement,
  extractSyrsVerificationReferences,
  checkSystemRequirementReferences,
  checkRequirementVerificationEvidence,
  checkRequirementsIntegrity,
  renderSummary,
  renderStepSummary,
  main
};
