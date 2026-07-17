#!/usr/bin/env node

/**
 * Requirement acceptance-criteria inventory report (advisory; VHS-REQ-601).
 *
 * The verification-linkage report (auditRequirementVerificationLinkage.js)
 * proves each Active requirement is cited by at least one test at the
 * REQUIREMENT level. This report deepens that to the CRITERION level: it
 * enumerates every Active requirement's acceptance-criteria bullets in srs.md
 * and assigns each a stable positional id of the form `VHS-REQ-NNN.M` (M is the
 * 1-based bullet position under `- Acceptance Criteria:`). It then reports, per
 * requirement, how many criteria are already cited at the criterion level by one
 * of the requirement's RTM verification-reference tests (a test file that
 * contains the exact `VHS-REQ-NNN.M` string).
 *
 * This is Phase 3a of the criterion-traceability rollout and is ADVISORY by
 * default (exit 0): it does NOT modify srs.md and does NOT fail CI. Passing
 * `--enforce` makes it fail closed (exit 1) when any Active criterion is not yet
 * cited at the criterion level, so the guard can gate the baseline once every
 * criterion is backfilled. The positional `.M` convention is derived, not
 * annotated, so the criteria text is untouched; run this command (or `--json`)
 * to resolve a criterion id to its text before citing it in a test.
 *
 * Pure helpers stay separate from a thin CLI so the parsing and classification
 * are unit-testable with injected fixtures. It uses only Node built-ins plus the
 * sibling traceability-audit module (parseCsv/splitReferences), so the command
 * needs no dependency install.
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseCsv, splitReferences } = require('./auditTraceabilitySteward.js');
const {
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope.js');

const SRS_PATH = 'docs/requirements/srs.md';
const RTM_PATH = 'docs/requirements/rtm.csv';
const CRITERIA_INVENTORY_SCHEMA_ID = 'vi-history-suite/requirement-criteria-inventory@v1';
const CRITERIA_INVENTORY_SCHEMA_VERSION = 1;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanReference(reference) {
  return reference.replace(/`/g, '').split('#')[0].trim();
}

// A verification reference is a citeable test file when it is a repo-relative
// path under tests/ (not a manual:/external: marker). Any `#anchor` fragment and
// wrapping backticks are stripped first. Mirrors the verification-linkage tool.
function isCiteableTestReference(reference) {
  if (reference.startsWith('manual:') || reference.startsWith('external:')) {
    return false;
  }
  return cleanReference(reference).startsWith('tests/');
}

// Slice srs.md into per-requirement blocks the same way
// checkRequirementsIntegrity.extractSrsReferenceSections does, then read each
// block's Status and enumerate its acceptance-criteria bullets in order.
function extractRequirementCriteria(srsText) {
  const byRequirement = new Map();
  const headingPattern = /^### (VHS-REQ-\d+):/gm;
  const headings = [...srsText.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const reqId = headings[index][1];
    const start = headings[index].index;
    const end = index + 1 < headings.length ? headings[index + 1].index : srsText.length;
    const body = srsText.slice(start, end);
    const statusMatch = /^- Status:[ \t]*(.+)$/m.exec(body);
    byRequirement.set(reqId, {
      status: statusMatch ? statusMatch[1].trim() : '',
      criteria: extractAcceptanceCriteria(body)
    });
  }
  return byRequirement;
}

// Enumerate the bullet list under `- Acceptance Criteria:`. A criterion begins
// at a two-space `- ` bullet; more-indented lines are wrapped continuations of
// the current criterion; the next top-level `- Field:` ends the section.
function extractAcceptanceCriteria(blockBody) {
  const criteria = [];
  let inSection = false;
  let current = null;

  const flush = () => {
    if (current !== null) {
      criteria.push(current.replace(/\s+/g, ' ').trim());
      current = null;
    }
  };

  for (const line of blockBody.split('\n')) {
    if (/^- [A-Za-z]/.test(line)) {
      flush();
      inSection = line.trim() === '- Acceptance Criteria:';
      continue;
    }
    if (!inSection) {
      continue;
    }
    const bulletMatch = /^ {2}- (.+)$/.exec(line);
    if (bulletMatch) {
      flush();
      current = bulletMatch[1].trim();
    } else if (current !== null && /^\s+\S/.test(line)) {
      current += ` ${line.trim()}`;
    }
  }
  flush();
  return criteria;
}

function criterionIsCited(criterionId, testFileContents) {
  const pattern = new RegExp(`${escapeRegExp(criterionId)}(?![0-9])`);
  return testFileContents.some((content) => pattern.test(content));
}

function auditRequirementCriteriaInventory(cwd = process.cwd(), deps = {}) {
  const readFile =
    deps.readFile ||
    ((relativePath) => {
      try {
        return fs.readFileSync(path.join(cwd, ...relativePath.split('/')), 'utf8');
      } catch {
        return undefined;
      }
    });

  const srsText = readFile(SRS_PATH);
  if (typeof srsText !== 'string') {
    throw new Error(`SRS not found at ${SRS_PATH}`);
  }
  const rtmText = readFile(RTM_PATH);
  if (typeof rtmText !== 'string') {
    throw new Error(`RTM not found at ${RTM_PATH}`);
  }

  const criteriaByRequirement = extractRequirementCriteria(srsText.replace(/\r\n/g, '\n'));
  const rtmRows = parseCsv(rtmText.replace(/\r\n/g, '\n'));
  const verificationRefsByRequirement = new Map();
  for (const row of rtmRows) {
    const reqId = (row.ReqID || '').trim();
    if (reqId.length === 0) {
      continue;
    }
    const testReferences = splitReferences(row.VerificationRefs || '')
      .filter((reference) => isCiteableTestReference(reference))
      .map((reference) => cleanReference(reference));
    verificationRefsByRequirement.set(reqId, testReferences);
  }

  const requirements = [];
  let totalCriteria = 0;
  let citedCriteria = 0;

  for (const [reqId, info] of criteriaByRequirement) {
    if (info.status !== 'Active') {
      continue;
    }
    const testReferences = verificationRefsByRequirement.get(reqId) || [];
    const testFileContents = testReferences
      .map((relativePath) => readFile(relativePath))
      .filter((content) => typeof content === 'string');

    const criteria = info.criteria.map((text, criterionIndex) => {
      const ordinal = criterionIndex + 1;
      const criterionId = `${reqId}.${ordinal}`;
      return { criterionId, ordinal, text, cited: criterionIsCited(criterionId, testFileContents) };
    });

    totalCriteria += criteria.length;
    citedCriteria += criteria.filter((criterion) => criterion.cited).length;
    requirements.push({ reqId, criteriaCount: criteria.length, criteria });
  }

  requirements.sort((left, right) => left.reqId.localeCompare(right.reqId));

  return {
    ...schemaEnvelopeFields(CRITERIA_INVENTORY_SCHEMA_ID, CRITERIA_INVENTORY_SCHEMA_VERSION),
    totalRequirements: requirements.length,
    totalCriteria,
    citedCriteria,
    uncitedCriteria: totalCriteria - citedCriteria,
    requirements
  };
}

// Published JSON Schema for the criterion-inventory packet, so consumers can
// validate `--json` output and `--schema` can publish the contract without
// running the audit. Shares the self-describing envelope via scripts/lib/schemaEnvelope.js.
const CRITERIA_INVENTORY_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DIALECT,
  $id: CRITERIA_INVENTORY_SCHEMA_ID,
  title: 'vi-history-suite requirement criteria inventory',
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema',
    'schemaVersion',
    'totalRequirements',
    'totalCriteria',
    'citedCriteria',
    'uncitedCriteria',
    'requirements'
  ],
  properties: {
    ...schemaEnvelopePropertyNodes(CRITERIA_INVENTORY_SCHEMA_ID, CRITERIA_INVENTORY_SCHEMA_VERSION),
    totalRequirements: { type: 'integer' },
    totalCriteria: { type: 'integer' },
    citedCriteria: { type: 'integer' },
    uncitedCriteria: { type: 'integer' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['reqId', 'criteriaCount', 'criteria'],
        properties: {
          reqId: { type: 'string' },
          criteriaCount: { type: 'integer' },
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              required: ['criterionId', 'ordinal', 'text', 'cited'],
              properties: {
                criterionId: { type: 'string' },
                ordinal: { type: 'integer' },
                text: { type: 'string' },
                cited: { type: 'boolean' }
              }
            }
          }
        }
      }
    },
    provenance: {
      type: 'object',
      required: ['generatedAt', 'cwd', 'outputMode', 'argv'],
      properties: {
        generatedAt: { type: 'string' },
        cwd: { type: 'string' },
        outputMode: { enum: ['text', 'json', 'schema'] },
        argv: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(CRITERIA_INVENTORY_JSON_SCHEMA, options);
}

function renderSummary(result, options = {}) {
  const lines = [];
  lines.push(`[requirements-criteria] Active requirements with acceptance criteria: ${result.totalRequirements}`);
  lines.push(`[requirements-criteria] Total acceptance criteria: ${result.totalCriteria}`);
  lines.push(
    `[requirements-criteria] Criteria cited at criterion level (VHS-REQ-N.M): ${result.citedCriteria}`
  );
  lines.push(
    `[requirements-criteria] Criteria not yet cited at criterion level: ${result.uncitedCriteria}`
  );
  if (options.enforce) {
    lines.push(
      result.uncitedCriteria > 0
        ? '[requirements-criteria] Enforcing (--enforce): failing because at least one Active criterion is not cited at the criterion level. Positional .M ids are derived from srs.md bullet order.'
        : '[requirements-criteria] Enforcing (--enforce): all Active criteria are cited at the criterion level. Positional .M ids are derived from srs.md bullet order.'
    );
  } else {
    lines.push(
      '[requirements-criteria] Advisory report; criterion linkage does not fail CI. Positional .M ids are derived from srs.md bullet order.'
    );
  }
  return lines.join('\n');
}

function renderStepSummary(result, options = {}) {
  const lines = [];
  lines.push('## Requirement Acceptance-Criteria Inventory');
  lines.push('');
  lines.push(
    options.enforce
      ? '**Enforced check.** Each Active requirement acceptance-criteria bullet in ' +
          '`srs.md` is assigned a positional id `VHS-REQ-NNN.M` (M is the 1-based bullet ' +
          'position) and must be cited at the criterion level by one of the requirement\'s RTM ' +
          'verification-reference tests (a test file containing the exact `VHS-REQ-NNN.M` string). ' +
          'The RTM remains the authoritative requirement-to-test linkage; this step fails when any ' +
          'Active criterion is not yet cited at the criterion level.'
      : '**Advisory report.** Each Active requirement acceptance-criteria bullet in ' +
          '`srs.md` is assigned a positional id `VHS-REQ-NNN.M` (M is the 1-based bullet ' +
          'position). A criterion is counted as cited when one of the requirement\'s RTM ' +
          'verification-reference tests contains the exact `VHS-REQ-NNN.M` string. The RTM ' +
          'remains the authoritative requirement-to-test linkage; this criterion-level ' +
          'signal is the backfill target for later phases and does not fail CI.'
  );
  lines.push('');
  lines.push(`- Active requirements with acceptance criteria: ${result.totalRequirements}`);
  lines.push(`- Total acceptance criteria: ${result.totalCriteria}`);
  lines.push(`- Cited at criterion level: ${result.citedCriteria}`);
  lines.push(`- Not yet cited at criterion level: ${result.uncitedCriteria}`);
  lines.push('');
  lines.push('| Requirement | Criteria | Cited | Uncited |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const requirement of result.requirements) {
    const cited = requirement.criteria.filter((criterion) => criterion.cited).length;
    lines.push(
      `| \`${requirement.reqId}\` | ${requirement.criteriaCount} | ${cited} | ${requirement.criteriaCount - cited} |`
    );
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2), deps = {}) {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const asJson = deps.json ?? argv.includes('--json');
  const asSchema = deps.schema ?? argv.includes('--schema');
  const enforce = deps.enforce ?? argv.includes('--enforce');
  const includeProvenance = deps.includeProvenance ?? argv.includes('--include-provenance');
  const cwd = deps.cwd || positionals[0] || process.cwd();
  const stdout = deps.stdout || process.stdout;

  const provenance = includeProvenance
    ? {
        generatedAt:
          typeof deps.now === 'function' ? new Date(deps.now()).toISOString() : new Date().toISOString(),
        cwd,
        outputMode: asSchema ? 'schema' : asJson ? 'json' : 'text',
        argv: [...argv]
      }
    : undefined;

  // --schema publishes the JSON Schema without running the audit.
  if (asSchema) {
    stdout.write(`${renderSchema({ provenance })}\n`);
    return 0;
  }

  const result = auditRequirementCriteriaInventory(cwd, deps);

  const stepSummaryPath = deps.stepSummaryPath || process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    const appendStepSummary =
      deps.appendStepSummary || ((filePath, content) => fs.appendFileSync(filePath, content));
    appendStepSummary(stepSummaryPath, `${renderStepSummary(result, { enforce })}\n`);
  }

  const jsonResult = provenance ? { ...result, provenance } : result;
  stdout.write(asJson ? `${JSON.stringify(jsonResult, null, 2)}\n` : `${renderSummary(result, { enforce })}\n`);

  // Advisory by default (exit 0): criterion inventory does not fail the build.
  // With --enforce the guard fails closed (exit 1) when any Active criterion is
  // not yet cited at the criterion level. The RTM remains the authoritative
  // requirement-to-test linkage; the advisory report is the criterion-level
  // backfill target for closing citation gaps incrementally.
  if (enforce && result.uncitedCriteria > 0) {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SRS_PATH,
  RTM_PATH,
  CRITERIA_INVENTORY_SCHEMA_ID,
  CRITERIA_INVENTORY_SCHEMA_VERSION,
  CRITERIA_INVENTORY_JSON_SCHEMA,
  isCiteableTestReference,
  cleanReference,
  extractAcceptanceCriteria,
  extractRequirementCriteria,
  criterionIsCited,
  auditRequirementCriteriaInventory,
  renderSummary,
  renderSchema,
  renderStepSummary,
  main
};
