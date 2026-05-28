import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  REQUIRED_CLOSEOUT_GATES,
  REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS,
  REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS,
  assertOrdered,
  checkIssueTemplate,
  checkPrEvidenceDocs,
  checkStaleDodDeferrals,
  parseCsvLine,
  renderResult,
  runDefinitionOfDoneGate
} = require('../../scripts/checkDefinitionOfDone.js') as {
  REQUIRED_CLOSEOUT_GATES: string[];
  REQUIRED_DECISION_COMPLETE_ISSUE_TEMPLATE_FIELDS: string[];
  REQUIRED_OPTIONAL_ISSUE_TEMPLATE_FIELDS: string[];
  assertOrdered: (
    text: string,
    labels: string[],
    needleForLabel: (label: string) => string
  ) => { passed: boolean; details: string };
  checkIssueTemplate: (cwd: string) => { name: string; passed: boolean; details: string };
  checkPrEvidenceDocs: (cwd: string) => { name: string; passed: boolean; details: string };
  checkStaleDodDeferrals: (cwd: string) => { passed: boolean; details: string };
  parseCsvLine: (line: string) => string[];
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

  it('passes for the committed repo contract', () => {
    const result = runDefinitionOfDoneGate({ cwd: repoRoot });

    expect(result.success).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'package dod:gate script',
      'CI required step order',
      'closeout local gate order',
      'standards provenance configuration',
      'requirement-target issue template',
      'PR evidence documentation',
      'DoD checker traceability mapping',
      'stale deferred DoD language'
    ]);
    expect(renderResult(result)).toContain('[dod-gate] Gate passed.');
  });

  it('keeps the required closeout gate order explicit', () => {
    expect(REQUIRED_CLOSEOUT_GATES).toEqual([
      'traceability:audit',
      'docs:links',
      'dod:gate',
      'check',
      'test',
      'package'
    ]);
    expect(
      assertOrdered(
        "['traceability:audit']\n['docs:links']\n['dod:gate']\n['check']\n['test']\n['package']",
        REQUIRED_CLOSEOUT_GATES,
        (gate) => `['${gate}'`
      ).passed
    ).toBe(true);
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

  it('requires decision-complete issue template fields and optional copilot prompt slot', () => {
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

  it('requires lightweight requirement-targeted PR evidence in docs and PR template', () => {
    const missingTemplateFieldRoot = createFixture({
      'docs/testing/test-plan.md': `## PR Evidence Contract
linked issue
target requirement
validation commands
traceability/RTM impact
out-of-scope
closeout readiness
\`npm run dod:gate\`
standards provenance
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
\`npm run dod:gate\`
standards provenance
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
});
