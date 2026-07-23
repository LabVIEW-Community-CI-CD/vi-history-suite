import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  REQUIRED_CI_STEPS,
  REQUIRED_CLOSEOUT_GATES,
  REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS,
  REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS,
  assertOrdered,
  checkIssueTemplate,
  checkLocalAgentTemplates,
  checkPrEvidenceDocs,
  checkStaleDodDeferrals,
  parseCsvLine,
  parseCsvRows,
  renderResult,
  runDefinitionOfDoneGate
} = require('../../scripts/checkDefinitionOfDone.js') as {
  REQUIRED_CI_STEPS: string[];
  REQUIRED_CLOSEOUT_GATES: string[];
  REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS: string[];
  REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS: string[];
  assertOrdered: (
    text: string,
    labels: string[],
    needleForLabel: (label: string) => string
  ) => { passed: boolean; details: string };
  checkIssueTemplate: (cwd: string) => { name: string; passed: boolean; details: string };
  checkLocalAgentTemplates: (cwd: string) => { name: string; passed: boolean; details: string };
  checkPrEvidenceDocs: (cwd: string) => { name: string; passed: boolean; details: string };
  checkStaleDodDeferrals: (cwd: string) => { passed: boolean; details: string };
  parseCsvLine: (line: string) => string[];
  parseCsvRows: (text: string) => Array<Record<string, string>>;
  renderResult: (result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }> }) => string;
  runDefinitionOfDoneGate: (options?: { cwd?: string }) => {
    success: boolean;
    checks: Array<{ name: string; passed: boolean; details: string }>;
  };
};

const fixtureRoots: string[] = [];

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-gate-'));
  fixtureRoots.push(root);
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body, 'utf8');
  }
  return root;
}

const DOD_FIXTURE_FILES = [
  'package.json',
  '.github/workflows/ci.yml',
  'scripts/generateCloseoutEvidence.js',
  '.github/ISSUE_TEMPLATE/requirement_target.yml',
  'docs/testing/test-plan.md',
  '.github/pull_request_template.md',
  'docs/agent-workflows/templates/local-change-proposal.md',
  'docs/agent-workflows/templates/local-pr-evidence.md',
  'docs/requirements/rtm.csv',
  'docs/requirements/traceability-inventory.csv',
  'docs/requirements/README.md',
  'docs/requirements/srs.md'
];

function createDodRepoFixture(mutate?: (files: Record<string, string>) => void): string {
  const files: Record<string, string> = {};
  for (const relativePath of DOD_FIXTURE_FILES) {
    files[relativePath] = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  }
  if (mutate) {
    mutate(files);
  }
  return createFixture(files);
}

function buildRequirementTemplate(options: { includeOptionalCopilotPrompt: boolean }): string {
  const copilotPromptField = options.includeOptionalCopilotPrompt
    ? `
  - type: textarea
    id: copilot_prompt
    attributes:
      label: Optional Copilot Prompt
      description: Optional bounded Copilot prompt.
`
    : '\n';
  return `name: Requirement Target
body:
  - type: input
    id: requirement_id
    validations:
      required: true
  - type: textarea
    id: problem_statement
    validations:
      required: true
  - type: textarea
    id: files_to_inspect
    validations:
      required: true
  - type: textarea
    id: acceptance_criteria
    validations:
      required: true
  - type: textarea
    id: required_tests
    validations:
      required: true
  - type: textarea
    id: validation_commands
    validations:
      required: true
  - type: textarea
    id: out_of_scope
    validations:
      required: true
  - type: textarea
    id: requirement_updates
    validations:
      required: true${copilotPromptField}`;
}

describe('Definition-of-Done gate', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes for the committed repo contract (VHS-REQ-615.9)', () => {
    const result = runDefinitionOfDoneGate({ cwd: repoRoot });

    expect(result.success).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'package dod:gate script',
      'CI required step order',
      'closeout local gate order',
      'standards provenance configuration',
      'requirement-target issue template',
      'PR evidence documentation',
      'local agent-workflow templates',
      'DoD checker traceability mapping',
      'stale deferred DoD language'
    ]);
    expect(renderResult(result)).toContain('[dod-gate] Gate passed.');
  });

  it('keeps the required hosted and closeout gate order explicit (VHS-REQ-613.8, VHS-REQ-615.7)', () => {
    expect(REQUIRED_CI_STEPS).toEqual([
      'Branch Governance',
      'Checkout',
      'Setup Node',
      'Install',
      'Typecheck',
      'Customization Audit',
      'Customization Audit Report / custom-audit',
      'Traceability Audit',
      'Docs Link Check / lychee',
      'Documentation Gate / docs-gate',
      'Test',
      'PR Coverage Gate / coverage',
      'Package',
      'DoD Gate / dod',
      'Governance Gate Reports / governance-gates'
    ]);
    expect(REQUIRED_CLOSEOUT_GATES).toEqual([
      'traceability:audit',
      'docs:links',
      'dod:gate',
      'check',
      'test',
      'coverage:map',
      'package'
    ]);
    expect(
      assertOrdered(
        "['traceability:audit']\n['docs:links']\n['dod:gate']\n['check']\n['test']\n['coverage:map']\n['package']",
        REQUIRED_CLOSEOUT_GATES,
        (gate) => `['${gate}'`
      ).passed
    ).toBe(true);
  });

  it('pins the hosted scanner-visible DoD gate to the required CI workflow (VHS-REQ-615.10)', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

    expect(workflow).toContain('name: DoD Gate / dod');
    expect(workflow).toContain('npm run dod:gate');
    expect(workflow).toContain('npm run package');
    expect(workflow).toContain('dod-gate-report.txt');
    expect(
      assertOrdered(
        workflow,
        ['Package', 'DoD Gate / dod', 'Governance Gate Reports / governance-gates'],
        (step) => `name: ${step}`
      ).passed
    ).toBe(true);
    expect(runDefinitionOfDoneGate({ cwd: repoRoot }).success).toBe(true);
  });

  it('fails ordered checks when a required predecessor moves later', () => {
    const result = assertOrdered(
      "['docs:links']\n['traceability:audit']",
      ['traceability:audit', 'docs:links'],
      (gate) => `['${gate}'`
    );

    expect(result.passed).toBe(false);
    expect(result.details).toContain('docs:links');
  });

  it('detects stale deferred DoD wording in active evidence docs', () => {
    const root = createFixture({
      'docs/requirements/README.md': 'ok\n',
      'docs/testing/test-plan.md': 'Definition-of-Done gate findings remain deferred next-wave\n',
      'docs/requirements/srs.md': 'ok\n',
      'scripts/generateCloseoutEvidence.js': 'ok\n'
    });

    const result = checkStaleDodDeferrals(root);

    expect(result.passed).toBe(false);
    expect(result.details).toContain('docs/testing/test-plan.md');
  });

  it('parses quoted CSV cells for traceability checks', () => {
    expect(parseCsvLine('A,"B, C","D ""quoted"""')).toEqual(['A', 'B, C', 'D "quoted"']);
  });

  it('requires decision-complete issue template fields and optional copilot prompt slot (VHS-REQ-615.1)', () => {
    expect(REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS).toEqual([
      'requirement_id',
      'files_to_inspect',
      'acceptance_criteria',
      'validation_commands',
      'out_of_scope',
      'requirement_updates'
    ]);
    expect(REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS).toEqual(['copilot_prompt']);

    const missingOptionalRoot = createFixture({
      '.github/ISSUE_TEMPLATE/requirement_target.yml': buildRequirementTemplate({
        includeOptionalCopilotPrompt: false
      })
    });
    const missingOptionalResult = checkIssueTemplate(missingOptionalRoot);
    expect(missingOptionalResult.passed).toBe(false);
    expect(missingOptionalResult.details).toContain('missing optional field slots: copilot_prompt');

    const completeRoot = createFixture({
      '.github/ISSUE_TEMPLATE/requirement_target.yml': buildRequirementTemplate({
        includeOptionalCopilotPrompt: true
      })
    });
    const completeResult = checkIssueTemplate(completeRoot);
    expect(completeResult.passed).toBe(true);
  });

  it('requires lightweight requirement-targeted PR evidence in docs and PR template (VHS-REQ-615.3, VHS-REQ-615.4)', () => {
    const missingTemplateFieldRoot = createFixture({
      'docs/testing/test-plan.md': `## PR Evidence Contract
linked issue
target requirement
validation commands
traceability/RTM impact
out-of-scope
closeout readiness
required hosted CI checks
local gates
targeted tests
standards provenance
environment blockers
\`npm run traceability:audit\`
\`npm run docs:links\`
\`npm run check\`
\`npm test\`
\`npm run coverage:map\`
\`npm run package\`
`,
      '.github/pull_request_template.md': `## Requirement-Targeted PR Evidence (lightweight)
- **Linked issue (required):**
- **Target requirement (required):**
- **Validation commands (required):**
- **Out-of-scope (required):**
- **Closeout readiness (required):**
`
    });
    const missingTemplateFieldResult = checkPrEvidenceDocs(missingTemplateFieldRoot);
    expect(missingTemplateFieldResult.passed).toBe(false);
    expect(missingTemplateFieldResult.details).toContain('missing in PR template');
    expect(missingTemplateFieldResult.details).toContain('Traceability / RTM impact (required)');

    const completeRoot = createFixture({
      'docs/testing/test-plan.md': `## PR Evidence Contract
linked issue
target requirement
validation commands
traceability/RTM impact
out-of-scope
closeout readiness
required hosted CI checks
local gates
targeted tests
standards provenance
environment blockers
\`npm run traceability:audit\`
\`npm run docs:links\`
\`npm run check\`
\`npm test\`
\`npm run coverage:map\`
\`npm run package\`
`,
      '.github/pull_request_template.md': `## Requirement-Targeted PR Evidence (lightweight)
- **Linked issue (required):**
- **Target requirement (required):**
- **Validation commands (required):**
- **Traceability / RTM impact (required):**
- **Out-of-scope (required):**
- **Closeout readiness (required):**
`
    });
    const completeResult = checkPrEvidenceDocs(completeRoot);
    expect(completeResult.passed).toBe(true);
  });

  it('requires the local agent-workflow templates to mirror the enforced contracts (VHS-REQ-615.3, VHS-REQ-615.4)', () => {
    const proposalHeadings = [
      '## Target Requirement ID',
      '## Files To Inspect',
      '## Acceptance Criteria',
      '## Validation Commands',
      '## Out-Of-Scope Boundaries',
      '## Requirement And RTM Updates'
    ].join('\n');
    const evidenceAnchors = [
      '## Requirement-Targeted PR Evidence (lightweight)',
      '- **Linked issue (required):**',
      '- **Target requirement (required):**',
      '- **Validation commands (required):**',
      '- **Traceability / RTM impact (required):**',
      '- **Out-of-scope (required):**',
      '- **Closeout readiness (required):**'
    ].join('\n');

    const completeRoot = createFixture({
      'docs/agent-workflows/templates/local-change-proposal.md': proposalHeadings,
      'docs/agent-workflows/templates/local-pr-evidence.md': evidenceAnchors
    });
    expect(checkLocalAgentTemplates(completeRoot).passed).toBe(true);

    const driftedRoot = createFixture({
      'docs/agent-workflows/templates/local-change-proposal.md': '## Target Requirement ID\n',
      'docs/agent-workflows/templates/local-pr-evidence.md':
        '## Requirement-Targeted PR Evidence (lightweight)\n- **Linked issue (required):**\n'
    });
    const driftedResult = checkLocalAgentTemplates(driftedRoot);
    expect(driftedResult.passed).toBe(false);
    expect(driftedResult.details).toContain('## Files To Inspect');
    expect(driftedResult.details).toContain('Closeout readiness (required)');
  });

  it('reports missing labels through assertOrdered when a needle is absent', () => {
    const result = assertOrdered('alpha\nbeta', ['Gamma'], (label) => label);

    expect(result.passed).toBe(false);
    expect(result.details).toBe('Missing: Gamma');
  });

  it('parseCsvRows pads short rows with empty trailing cells', () => {
    const rows = parseCsvRows('H1,H2,H3\nfirst,second');

    expect(rows).toEqual([{ H1: 'first', H2: 'second', H3: '' }]);
  });

  it('renderResult marks failing checks and a failed gate', () => {
    const rendered = renderResult({
      success: false,
      checks: [
        { name: 'ok check', passed: true, details: 'fine' },
        { name: 'broken check', passed: false, details: 'broke' }
      ]
    });

    expect(rendered).toContain('[dod-gate] PASS ok check: fine');
    expect(rendered).toContain('[dod-gate] FAIL broken check: broke');
    expect(rendered).toContain('[dod-gate] Gate failed.');
  });

  it('resolves the working directory from process.cwd() when no cwd option is supplied', () => {
    expect(runDefinitionOfDoneGate().success).toBe(runDefinitionOfDoneGate({ cwd: repoRoot }).success);
  });

  it('surfaces every failing check against a mutated repo fixture (VHS-REQ-615.9)', () => {
    const root = createDodRepoFixture((files) => {
      const pkg = JSON.parse(files['package.json']) as { scripts: Record<string, string> };
      delete pkg.scripts['dod:gate'];
      files['package.json'] = JSON.stringify(pkg, null, 2);

      expect(files['.github/workflows/ci.yml']).toContain('npm run customization:audit');
      files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml']
        .split('npm run customization:audit')
        .join('npm run customization-audit-removed');

      expect(files['scripts/generateCloseoutEvidence.js']).toContain('STANDARDS_TOOLCHAIN_REGISTRY_IMAGE');
      files['scripts/generateCloseoutEvidence.js'] = files['scripts/generateCloseoutEvidence.js']
        .split('STANDARDS_TOOLCHAIN_REGISTRY_IMAGE')
        .join('STANDARDS_TOOLCHAIN_REMOVED_TOKEN');

      const inventoryLine = 'scripts/checkDefinitionOfDone.js,mapped,Yes,';
      expect(files['docs/requirements/traceability-inventory.csv']).toContain(inventoryLine);
      files['docs/requirements/traceability-inventory.csv'] = files[
        'docs/requirements/traceability-inventory.csv'
      ].replace(inventoryLine, 'scripts/checkDefinitionOfDone.js,other,Yes,');
    });

    const result = runDefinitionOfDoneGate({ cwd: root });
    const byName = new Map(result.checks.map((check) => [check.name, check]));

    expect(result.success).toBe(false);
    expect(byName.get('package dod:gate script')?.passed).toBe(false);
    expect(byName.get('package dod:gate script')?.details).toBe('missing');
    expect(byName.get('CI required step order')?.passed).toBe(false);
    expect(byName.get('standards provenance configuration')?.passed).toBe(false);
    expect(byName.get('standards provenance configuration')?.details).toContain('Missing:');
    expect(byName.get('DoD checker traceability mapping')?.passed).toBe(false);
    expect(byName.get('DoD checker traceability mapping')?.details).toContain('inventory ok=false');
    expect(renderResult(result)).toContain('[dod-gate] Gate failed.');
  });
});
