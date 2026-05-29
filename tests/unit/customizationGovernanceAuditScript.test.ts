import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  auditCustomizationGovernance,
  discoverCustomizationFiles,
  extractAgentsCustomizationReferences,
  extractNpmScriptReferences,
  globToRegex
} = require('../../scripts/auditCustomizationGovernance.js') as {
  auditCustomizationGovernance: (options?: { cwd?: string }) => {
    success: boolean;
    customizationFilesChecked: number;
    findings: {
      runtimeIssues: Array<{ issue: string }>;
      missingAgentsReferences: string[];
      staleAgentsReferences: string[];
      frontmatterIssues: Array<{ path: string; issue: string }>;
      applyToIssues: Array<{ path: string; pattern: string; issue: string }>;
      linkIssues: Array<{ source: string; line: number; target: string; issue: string }>;
      commandIssues: Array<{ source: string; script: string; issue: string }>;
    };
  };
  discoverCustomizationFiles: (cwd: string) => string[];
  extractAgentsCustomizationReferences: (text: string) => string[];
  extractNpmScriptReferences: (text: string) => string[];
  globToRegex: (globPattern: string) => RegExp;
};

const fixtureRoots: string[] = [];

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'customization-audit-'));
  fixtureRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return root;
}

function baseFixtureFiles(): Record<string, string> {
  return {
    'AGENTS.md': `# Agent Instructions

## Build & Test Commands
- npm run check
- npm test

### Agent Skills (Workspace)
- \`.github/skills/testing-automation/SKILL.md\`: testing workflow
- \`.github/skills/onboarding/SKILL.md\`: onboarding workflow

### Agent Prompts (Workspace)
- \`.github/prompts/pr-handoff-evidence.prompt.md\`: prompt

### Custom Agents (Workspace)
- \`.github/agents/workflow-governor.agent.md\`: custom agent

### File Instructions (Workspace)
- \`.github/instructions/unit-tests.instructions.md\`: file instructions

See [Install](INSTALL.md).
`,
    'INSTALL.md': '# Install\n',
    'package.json': JSON.stringify(
      {
        name: 'fixture',
        private: true,
        scripts: {
          check: 'echo check',
          test: 'echo test',
          'customization:audit': 'node scripts/auditCustomizationGovernance.js'
        }
      },
      null,
      2
    ),
    '.github/skills/testing-automation/SKILL.md': `---
name: testing-automation
description: "Use when validating changes."
argument-hint: "Optional scope"
---

# Testing Automation

Run npm run check.
`,
    '.github/skills/onboarding/SKILL.md': `---
name: onboarding
description: "Use when onboarding contributors."
argument-hint: "Optional context"
---

# Onboarding

## Quick Start
1. npm run check
2. npm test
3. See [Install](../../../INSTALL.md)
`,
    '.github/prompts/pr-handoff-evidence.prompt.md': `---
name: PR Handoff Evidence
description: "Generate PR evidence."
argument-hint: "Issue and requirement"
agent: "agent"
---

Prompt body.
`,
    '.github/instructions/unit-tests.instructions.md': `---
name: Unit Test Patterns
description: "Use when editing unit tests."
applyTo: "src/**/*.ts"
---

Instruction body.
`,
    '.github/agents/workflow-governor.agent.md': `---
name: Workflow Governor
description: "Use when enforcing workflow constraints."
argument-hint: "Task scope"
tools: [read, search, edit, execute, todo]
user-invocable: true
---

Agent body.
`,
    'src/example.ts': 'export const marker = true;\n'
  };
}

describe('customization governance audit script', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes against the repository baseline', () => {
    const result = auditCustomizationGovernance({ cwd: repoRoot });

    expect(result.success).toBe(true);
    expect(result.findings.runtimeIssues.length).toBe(0);
    expect(result.findings.missingAgentsReferences.length).toBe(0);
    expect(result.findings.staleAgentsReferences.length).toBe(0);
    expect(result.findings.frontmatterIssues.length).toBe(0);
    expect(result.findings.applyToIssues.length).toBe(0);
    expect(result.findings.linkIssues.length).toBe(0);
    expect(result.findings.commandIssues.length).toBe(0);
    expect(result.customizationFilesChecked).toBeGreaterThan(0);
  });

  it('discovers customization files and AGENTS references', () => {
    const root = createFixture(baseFixtureFiles());
    const customizationFiles = discoverCustomizationFiles(root);
    const references = extractAgentsCustomizationReferences(
      fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')
    );

    expect(customizationFiles).toEqual([
      '.github/agents/workflow-governor.agent.md',
      '.github/instructions/unit-tests.instructions.md',
      '.github/prompts/pr-handoff-evidence.prompt.md',
      '.github/skills/onboarding/SKILL.md',
      '.github/skills/testing-automation/SKILL.md'
    ]);
    expect(references).toEqual(customizationFiles);
  });

  it('fails when AGENTS references and discovered files drift', () => {
    const files = baseFixtureFiles();
    files['AGENTS.md'] = `# Agent Instructions

- \`.github/skills/testing-automation/SKILL.md\`: testing workflow
- \`.github/skills/onboarding/SKILL.md\`: onboarding workflow
- \`.github/prompts/missing.prompt.md\`: stale prompt reference
- \`.github/agents/workflow-governor.agent.md\`: custom agent
`;

    const result = auditCustomizationGovernance({ cwd: createFixture(files) });

    expect(result.success).toBe(false);
    expect(result.findings.missingAgentsReferences).toContain(
      '.github/instructions/unit-tests.instructions.md'
    );
    expect(result.findings.missingAgentsReferences).toContain(
      '.github/prompts/pr-handoff-evidence.prompt.md'
    );
    expect(result.findings.staleAgentsReferences).toContain(
      '.github/prompts/missing.prompt.md'
    );
  });

  it('fails when customization markdown links are unresolved', () => {
    const files = baseFixtureFiles();
    files['.github/skills/onboarding/SKILL.md'] = `---
name: onboarding
description: "Use when onboarding contributors."
argument-hint: "Optional context"
---

See [Broken](../../../docs/missing.md)
`;

    const result = auditCustomizationGovernance({ cwd: createFixture(files) });

    expect(result.success).toBe(false);
    expect(result.findings.linkIssues).toEqual([
      expect.objectContaining({
        source: '.github/skills/onboarding/SKILL.md',
        target: '../../../docs/missing.md',
        issue: 'link target file does not exist'
      })
    ]);
  });

  it('fails when frontmatter schema requirements drift', () => {
    const files = baseFixtureFiles();
    files['.github/prompts/pr-handoff-evidence.prompt.md'] = `---
name: PR Handoff Evidence
description: "Generate PR evidence."
agent: "assistant"
---

Prompt body.
`;

    const result = auditCustomizationGovernance({ cwd: createFixture(files) });

    expect(result.success).toBe(false);
    expect(result.findings.frontmatterIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '.github/prompts/pr-handoff-evidence.prompt.md',
          issue: 'frontmatter key argument-hint must be present and non-empty'
        }),
        expect.objectContaining({
          path: '.github/prompts/pr-handoff-evidence.prompt.md',
          issue: "frontmatter key agent must equal 'agent'"
        })
      ])
    );
  });

  it('fails when applyTo is unsafe or does not match repository files', () => {
    const files = baseFixtureFiles();
    files['.github/instructions/unit-tests.instructions.md'] = `---
name: Unit Test Patterns
description: "Use when editing unit tests."
applyTo:
  - "**"
  - "fixtures/**/*.md"
---

Instruction body.
`;

    const result = auditCustomizationGovernance({ cwd: createFixture(files) });

    expect(result.success).toBe(false);
    expect(result.findings.applyToIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: '**',
          issue: 'applyTo pattern is an unsafe catch-all'
        }),
        expect.objectContaining({
          pattern: 'fixtures/**/*.md',
          issue: 'applyTo pattern does not match any tracked repository file'
        })
      ])
    );
  });

  it('fails when AGENTS or onboarding references missing npm scripts', () => {
    const files = baseFixtureFiles();
    files['AGENTS.md'] += '\n- npm run not-a-script\n';

    const result = auditCustomizationGovernance({ cwd: createFixture(files) });

    expect(result.success).toBe(false);
    expect(result.findings.commandIssues).toContainEqual(
      expect.objectContaining({
        source: 'AGENTS.md',
        script: 'not-a-script',
        issue: 'referenced npm script does not exist in package.json'
      })
    );
  });

  it('extracts npm script references and translates globs', () => {
    expect(extractNpmScriptReferences('npm run check\nnpm test\nnpm run docs:links')).toEqual([
      'check',
      'docs:links',
      'test'
    ]);

    expect(globToRegex('src/**/*.ts').test('src/domain/example.ts')).toBe(true);
    expect(globToRegex('src/**/*.ts').test('src/example.ts')).toBe(true);
    expect(globToRegex('src/**/*.ts').test('tests/unit/example.test.ts')).toBe(false);
  });
});
