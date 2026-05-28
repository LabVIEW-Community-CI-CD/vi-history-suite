#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_CI_STEPS = [
  'Branch Governance',
  'Checkout',
  'Setup Node',
  'Install',
  'Typecheck',
  'Traceability Audit',
  'Docs Link Check / lychee',
  'Test',
  'PR Coverage Gate / coverage',
  'Package'
];

const REQUIRED_CLOSEOUT_GATES = [
  'traceability:audit',
  'docs:links',
  'dod:gate',
  'check',
  'test',
  'package'
];

const REQUIRED_ISSUE_TEMPLATE_FIELDS = [
  'requirement_id',
  'problem_statement',
  'files_to_inspect',
  'acceptance_criteria',
  'required_tests',
  'validation_commands',
  'out_of_scope',
  'requirement_updates'
];

const REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS = [
  'requirement_id',
  'files_to_inspect',
  'acceptance_criteria',
  'validation_commands',
  'out_of_scope',
  'requirement_updates'
];

const REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS = [
  'copilot_prompt'
];

const FORBIDDEN_DOD_DEFERRED_PATTERNS = [
  /Definition-of-Done gate findings remain deferred/iu,
  /Deferred recommendations:\s*Definition-of-Done/iu,
  /Defer explicit Definition-of-Done/iu,
  /next-wave advisory/iu,
  /next standards maturity issue/iu
];

function readRepoFile(cwd, relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), 'utf8');
}

function loadPackageJson(cwd) {
  return JSON.parse(readRepoFile(cwd, 'package.json'));
}

function lineIndexOf(text, needle) {
  const lines = text.split(/\r?\n/u);
  return lines.findIndex((line) => line.includes(needle));
}

function assertOrdered(text, labels, needleForLabel) {
  const positions = labels.map((label) => ({
    label,
    index: lineIndexOf(text, needleForLabel(label))
  }));
  const missing = positions.filter((item) => item.index < 0);
  if (missing.length > 0) {
    return {
      passed: false,
      details: `Missing: ${missing.map((item) => item.label).join(', ')}`
    };
  }

  const outOfOrder = positions.find((item, index) => index > 0 && item.index <= positions[index - 1].index);
  if (outOfOrder) {
    return {
      passed: false,
      details: `${outOfOrder.label} appears before the required predecessor.`
    };
  }

  return {
    passed: true,
    details: positions.map((item) => item.label).join(' -> ')
  };
}

function parseCsvRows(text) {
  const [headerLine, ...lines] = text.trimEnd().split(/\r?\n/u);
  const headers = parseCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function checkPackageScript(cwd) {
  const packageJson = loadPackageJson(cwd);
  const actual = packageJson.scripts?.['dod:gate'];
  return {
    name: 'package dod:gate script',
    passed: actual === 'node scripts/checkDefinitionOfDone.js',
    details: actual || 'missing'
  };
}

function checkCiStepOrder(cwd) {
  const workflow = readRepoFile(cwd, '.github/workflows/ci.yml');
  const requiredOrder = assertOrdered(workflow, REQUIRED_CI_STEPS, (step) => `- name: ${step}`);
  if (!requiredOrder.passed) {
    return { name: 'CI required step order', ...requiredOrder };
  }

  const dodStep = lineIndexOf(workflow, '- name: DoD Gate / dod');
  if (dodStep >= 0 && !workflow.includes('run: npm run dod:gate')) {
    return {
      name: 'CI required step order',
      passed: false,
      details: 'DoD Gate / dod is present but does not run npm run dod:gate.'
    };
  }

  return {
    name: 'CI required step order',
    passed: true,
    details: dodStep >= 0
      ? `${requiredOrder.details}; hosted DoD step present`
      : `${requiredOrder.details}; hosted DoD step pending follow-on CI issue`
  };
}

function checkCloseoutGateList(cwd) {
  const closeoutScript = readRepoFile(cwd, 'scripts/generateCloseoutEvidence.js');
  return {
    name: 'closeout local gate order',
    ...assertOrdered(closeoutScript, REQUIRED_CLOSEOUT_GATES, (gate) => `['${gate}'`)
  };
}

function checkStandardsProvenance(cwd) {
  const closeoutScript = readRepoFile(cwd, 'scripts/generateCloseoutEvidence.js');
  const required = [
    'STANDARDS_TOOLCHAIN_EXPECTED_COMMIT',
    'STANDARDS_TOOLCHAIN_GITLAB_URL',
    'STANDARDS_TOOLCHAIN_GITHUB_URL',
    'STANDARDS_TOOLCHAIN_REGISTRY_IMAGE',
    'standards-toolchain-provenance.json'
  ];
  const missing = required.filter((needle) => !closeoutScript.includes(needle));
  return {
    name: 'standards provenance configuration',
    passed: missing.length === 0,
    details: missing.length === 0 ? 'configured' : `Missing: ${missing.join(', ')}`
  };
}

function checkIssueTemplate(cwd) {
  const template = readRepoFile(cwd, '.github/ISSUE_TEMPLATE/requirement_target.yml');
  const missing = REQUIRED_ISSUE_TEMPLATE_FIELDS.filter((field) => !template.includes(`id: ${field}`));
  const missingDecisionComplete = REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS.filter(
    (field) => !template.includes(`id: ${field}`)
  );
  const missingOptional = REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS.filter(
    (field) => !template.includes(`id: ${field}`)
  );
  const requiredCount = (template.match(/required:\s*true/gu) || []).length;
  const passed = missing.length === 0 &&
    missingDecisionComplete.length === 0 &&
    missingOptional.length === 0 &&
    requiredCount >= REQUIRED_ISSUE_TEMPLATE_FIELDS.length;
  return {
    name: 'requirement-target issue template',
    passed,
    details: passed
      ? `${REQUIRED_ISSUE_TEMPLATE_FIELDS.length} required fields plus optional Copilot prompt slot present`
      : `Missing required fields: ${missing.join(', ') || 'none'}; missing decision-complete fields: ${missingDecisionComplete.join(', ') || 'none'}; missing optional field slots: ${missingOptional.join(', ') || 'none'}`
  };
}

function checkPrEvidenceDocs(cwd) {
  const testPlan = readRepoFile(cwd, 'docs/testing/test-plan.md');
  const required = [
    '## PR Evidence Contract',
    'Refs #',
    'target issue',
    'local gates',
    '`npm run dod:gate`',
    'standards provenance',
    'environment blockers'
  ];
  const missing = required.filter((needle) => !testPlan.includes(needle));
  return {
    name: 'PR evidence documentation',
    passed: missing.length === 0,
    details: missing.length === 0 ? 'documented' : `Missing: ${missing.join(', ')}`
  };
}

function checkTraceabilityMapping(cwd) {
  const rtm = parseCsvRows(readRepoFile(cwd, 'docs/requirements/rtm.csv'));
  const inventory = parseCsvRows(readRepoFile(cwd, 'docs/requirements/traceability-inventory.csv'));
  const row = rtm.find((entry) => entry.ReqID === 'VHS-REQ-615');
  const scriptRow = inventory.find((entry) => entry.Path === 'scripts/checkDefinitionOfDone.js');
  const testRow = inventory.find((entry) => entry.Path === 'tests/unit/definitionOfDoneGate.test.ts');
  const requiredImplementation = [
    'package.json',
    'scripts/checkDefinitionOfDone.js',
    'docs/requirements/README.md',
    'docs/testing/test-plan.md',
    'docs/requirements/traceability-inventory.csv'
  ];
  const requiredVerification = [
    'tests/unit/definitionOfDoneGate.test.ts',
    'tests/unit/requirementsDocs.test.ts',
    'tests/unit/traceabilityAuditScript.test.ts'
  ];
  const missingImplementation = requiredImplementation.filter((item) => !row?.ImplementationRefs.includes(item));
  const missingVerification = requiredVerification.filter((item) => !row?.VerificationRefs.includes(item));
  const inventoryOk = scriptRow?.Classification === 'mapped' &&
    scriptRow?.RtmCoverage === 'Yes' &&
    scriptRow?.Notes.includes('VHS-REQ-615') &&
    testRow?.Classification === 'mapped' &&
    testRow?.RtmCoverage === 'Yes' &&
    testRow?.Notes.includes('VHS-REQ-615');
  const passed = Boolean(row) && missingImplementation.length === 0 && missingVerification.length === 0 && inventoryOk;
  return {
    name: 'DoD checker traceability mapping',
    passed,
    details: passed
      ? 'VHS-REQ-615 maps checker implementation and tests'
      : `Missing implementation refs: ${missingImplementation.join(', ') || 'none'}; missing verification refs: ${missingVerification.join(', ') || 'none'}; inventory ok=${inventoryOk}`
  };
}

function checkStaleDodDeferrals(cwd) {
  const files = [
    'docs/requirements/README.md',
    'docs/testing/test-plan.md',
    'docs/requirements/srs.md',
    'scripts/generateCloseoutEvidence.js'
  ];
  const hits = [];
  for (const relativePath of files) {
    const text = readRepoFile(cwd, relativePath);
    for (const pattern of FORBIDDEN_DOD_DEFERRED_PATTERNS) {
      if (pattern.test(text)) {
        hits.push(`${relativePath}: ${pattern.source}`);
      }
    }
  }
  return {
    name: 'stale deferred DoD language',
    passed: hits.length === 0,
    details: hits.length === 0 ? 'none found' : hits.join('; ')
  };
}

function runDefinitionOfDoneGate(options = {}) {
  const cwd = options.cwd || process.cwd();
  const checks = [
    checkPackageScript(cwd),
    checkCiStepOrder(cwd),
    checkCloseoutGateList(cwd),
    checkStandardsProvenance(cwd),
    checkIssueTemplate(cwd),
    checkPrEvidenceDocs(cwd),
    checkTraceabilityMapping(cwd),
    checkStaleDodDeferrals(cwd)
  ];
  return {
    success: checks.every((check) => check.passed),
    checks
  };
}

function renderResult(result) {
  const lines = ['[dod-gate] Definition-of-Done gate results:'];
  for (const check of result.checks) {
    lines.push(`[dod-gate] ${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`);
  }
  lines.push(result.success ? '[dod-gate] Gate passed.' : '[dod-gate] Gate failed.');
  return lines.join('\n');
}

function main() {
  const result = runDefinitionOfDoneGate();
  process.stdout.write(`${renderResult(result)}\n`);
  return result.success ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  FORBIDDEN_DOD_DEFERRED_PATTERNS,
  REQUIRED_CI_STEPS,
  REQUIRED_CLOSEOUT_GATES,
  REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS,
  REQUIRED_ISSUE_TEMPLATE_FIELDS,
  REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS,
  assertOrdered,
  checkIssueTemplate,
  checkStaleDodDeferrals,
  parseCsvLine,
  parseCsvRows,
  renderResult,
  runDefinitionOfDoneGate
};
