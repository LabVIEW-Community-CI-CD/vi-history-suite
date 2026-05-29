#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_CI_STEPS = [
  'Branch Governance',
  'Checkout',
  'Setup Node',
  'Install',
  'Typecheck',
  'Customization Audit',
  'Traceability Audit',
  'Docs Link Check / lychee',
  'Test',
  'PR Coverage Gate / coverage',
  'Package',
  'DoD Gate / dod'
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

  if (!/- name: Customization Audit\s*\r?\n\s*run: npm run customization:audit/iu.test(workflow)) {
    return {
      name: 'CI required step order',
      passed: false,
      details: 'Customization Audit must run exactly npm run customization:audit in .github/workflows/ci.yml.'
    };
  }

  if (!/- name: DoD Gate \/ dod\s*\r?\n\s*run: npm run dod:gate/iu.test(workflow)) {
    return {
      name: 'CI required step order',
      passed: false,
      details: 'DoD Gate / dod must run exactly npm run dod:gate in .github/workflows/ci.yml.'
    };
  }

  return {
    name: 'CI required step order',
    passed: true,
    details: `${requiredOrder.details}; hosted customization and DoD steps present`
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
  const prTemplate = readRepoFile(cwd, '.github/pull_request_template.md');
  const requiredInTestPlan = [
    '## PR Evidence Contract',
    'linked issue',
    'target requirement',
    'validation commands',
    'traceability/RTM impact',
    'out-of-scope',
    'closeout readiness',
    '`npm run dod:gate`',
    'standards provenance'
  ];
  const requiredInTemplate = [
    '## Requirement-Targeted PR Evidence (lightweight)',
    'Linked issue (required)',
    'Target requirement (required)',
    'Validation commands (required)',
    'Traceability / RTM impact (required)',
    'Out-of-scope (required)',
    'Closeout readiness (required)'
  ];
  const missingInTestPlan = requiredInTestPlan.filter((needle) => !testPlan.includes(needle));
  const missingInTemplate = requiredInTemplate.filter((needle) => !prTemplate.includes(needle));
  return {
    name: 'PR evidence documentation',
    passed: missingInTestPlan.length === 0 && missingInTemplate.length === 0,
    details: missingInTestPlan.length === 0 && missingInTemplate.length === 0
      ? 'test plan and PR template documented'
      : `Missing in test-plan: ${missingInTestPlan.join(', ') || 'none'}; missing in PR template: ${missingInTemplate.join(', ') || 'none'}`
  };
}

function checkTraceabilityMapping(cwd) {
  const rtm = parseCsvRows(readRepoFile(cwd, 'docs/requirements/rtm.csv'));
  const inventory = parseCsvRows(readRepoFile(cwd, 'docs/requirements/traceability-inventory.csv'));
  const row = rtm.find((entry) => entry.ReqID === 'VHS-REQ-615');
  const ciWorkflowRow = inventory.find((entry) => entry.Path === '.github/workflows/ci.yml');
  const marketplaceWorkflowRow = inventory.find((entry) => entry.Path === '.github/workflows/marketplace-release.yml');
  const scriptRow = inventory.find((entry) => entry.Path === 'scripts/checkDefinitionOfDone.js');
  const customizationScriptRow = inventory.find(
    (entry) => entry.Path === 'scripts/auditCustomizationGovernance.js'
  );
  const closeoutRow = inventory.find((entry) => entry.Path === 'scripts/generateCloseoutEvidence.js');
  const marketplaceListingRow = inventory.find((entry) => entry.Path === 'scripts/verifyMarketplaceListing.js');
  const maintainerOpsRow = inventory.find((entry) => entry.Path === 'docs/maintainer-operations.md');
  const testRow = inventory.find((entry) => entry.Path === 'tests/unit/definitionOfDoneGate.test.ts');
  const customizationTestRow = inventory.find(
    (entry) => entry.Path === 'tests/unit/customizationGovernanceAuditScript.test.ts'
  );
  const prTemplateRow = inventory.find((entry) => entry.Path === '.github/pull_request_template.md');
  const requiredImplementation = [
    '.github/workflows/ci.yml',
    '.github/workflows/marketplace-release.yml',
    'package.json',
    'scripts/checkDefinitionOfDone.js',
    'scripts/auditCustomizationGovernance.js',
    'scripts/generateCloseoutEvidence.js',
    'scripts/verifyMarketplaceListing.js',
    '.github/pull_request_template.md',
    'docs/maintainer-operations.md',
    'docs/requirements/README.md',
    'docs/testing/test-plan.md',
    'docs/requirements/traceability-inventory.csv'
  ];
  const requiredVerification = [
    'tests/unit/definitionOfDoneGate.test.ts',
    'tests/unit/customizationGovernanceAuditScript.test.ts',
    'tests/unit/requirementsDocs.test.ts',
    'tests/unit/traceabilityAuditScript.test.ts'
  ];
  const missingImplementation = requiredImplementation.filter((item) => !row?.ImplementationRefs.includes(item));
  const missingVerification = requiredVerification.filter((item) => !row?.VerificationRefs.includes(item));
  const inventoryOk = scriptRow?.Classification === 'mapped' &&
    scriptRow?.RtmCoverage === 'Yes' &&
    scriptRow?.Notes.includes('VHS-REQ-615') &&
    customizationScriptRow?.Classification === 'mapped' &&
    customizationScriptRow?.RtmCoverage === 'Yes' &&
    customizationScriptRow?.Notes.includes('VHS-REQ-615') &&
    closeoutRow?.Classification === 'mapped' &&
    closeoutRow?.RtmCoverage === 'Yes' &&
    closeoutRow?.Notes.includes('VHS-REQ-615') &&
    ciWorkflowRow?.Classification === 'release-ci' &&
    ciWorkflowRow?.RtmCoverage === 'Yes' &&
    ciWorkflowRow?.Notes.includes('VHS-REQ-615') &&
    marketplaceWorkflowRow?.Classification === 'release-ci' &&
    marketplaceWorkflowRow?.RtmCoverage === 'Yes' &&
    marketplaceWorkflowRow?.Notes.includes('VHS-REQ-615') &&
    marketplaceListingRow?.Classification === 'mapped' &&
    marketplaceListingRow?.RtmCoverage === 'Yes' &&
    marketplaceListingRow?.Notes.includes('VHS-REQ-615') &&
    maintainerOpsRow?.Classification === 'asset-doc' &&
    maintainerOpsRow?.RtmCoverage === 'Yes' &&
    maintainerOpsRow?.Notes.includes('VHS-REQ-615') &&
    testRow?.Classification === 'mapped' &&
    testRow?.RtmCoverage === 'Yes' &&
    testRow?.Notes.includes('VHS-REQ-615') &&
    customizationTestRow?.Classification === 'mapped' &&
    customizationTestRow?.RtmCoverage === 'Yes' &&
    customizationTestRow?.Notes.includes('VHS-REQ-615') &&
    prTemplateRow?.Classification === 'mapped' &&
    prTemplateRow?.RtmCoverage === 'Yes' &&
    prTemplateRow?.Notes.includes('VHS-REQ-615');
  const passed = Boolean(row) && missingImplementation.length === 0 && missingVerification.length === 0 && inventoryOk;
  return {
    name: 'DoD checker traceability mapping',
    passed,
    details: passed
      ? 'VHS-REQ-615 maps CI workflow, release evidence, checker implementation, closeout evidence, PR template, and tests'
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
  checkPrEvidenceDocs,
  checkStaleDodDeferrals,
  parseCsvLine,
  parseCsvRows,
  renderResult,
  runDefinitionOfDoneGate
};
