import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

type AuditFindings = {
  runtimeIssues: Array<{ issue: string }>;
  missingAgentsReferences: string[];
  staleAgentsReferences: string[];
  frontmatterIssues: Array<{ path: string; issue: string }>;
  applyToIssues: Array<{ path: string; pattern: string; issue: string }>;
  linkIssues: Array<{ source: string; line: number; target: string; issue: string }>;
  commandIssues: Array<{ source: string; script: string; issue: string }>;
};

type AuditResult = {
  success: boolean;
  customizationFilesChecked: number;
  findings: AuditFindings;
};

const {
  auditCustomizationGovernance,
  discoverCustomizationFiles,
  extractAgentsCustomizationReferences,
  extractMarkdownLinks,
  extractNpmScriptReferences,
  globToRegex,
  isCustomizationPath,
  main,
  parseMainArgs,
  parseFrontmatter,
  renderSummary,
  renderSchema,
  toMachineReadableReport,
  CUSTOMIZATION_AUDIT_SCHEMA_ID,
  validateFrontmatterSchemas,
  validateInstructionApplyTo,
  validateLocalMarkdownLinks
} = require('../../scripts/auditCustomizationGovernance.js') as {
  auditCustomizationGovernance: (options?: { cwd?: string }) => AuditResult;
  discoverCustomizationFiles: (cwd: string) => string[];
  extractAgentsCustomizationReferences: (text: string) => string[];
  extractMarkdownLinks: (text: string) => Array<{ target: string; line: number }>;
  extractNpmScriptReferences: (text: string) => string[];
  globToRegex: (globPattern: string) => RegExp;
  isCustomizationPath: (relativePath: string) => boolean;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      now?: Date;
      stdout?: { write: (text: string) => void };
      stderr?: { write: (text: string) => void };
    }
  ) => number;
  parseMainArgs: (argv: string[]) => { cwd: string; emitJson: boolean; emitSchema: boolean; includeProvenance: boolean };
  parseFrontmatter: (text: string) => Record<string, string | string[]>;
  renderSummary: (result: AuditResult) => string;
  renderSchema: (options?: { provenance?: unknown }) => string;
  CUSTOMIZATION_AUDIT_SCHEMA_ID: string;
  toMachineReadableReport: (
    result: AuditResult,
    now?: Date
  ) => {
    $schema: string;
    schemaVersion: number;
    generatedAt: string;
    success: boolean;
    customizationFilesChecked: number;
    totals: { issues: number; failingCategories: number };
    categories: Array<{
      key: string;
      label: string;
      count: number;
      remediation: string;
      items: unknown[];
    }>;
  };
  validateFrontmatterSchemas: (
    cwd: string,
    customizationFiles: string[]
  ) => AuditFindings['frontmatterIssues'];
  validateInstructionApplyTo: (
    cwd: string,
    instructionPaths: string[],
    repoFiles: string[]
  ) => AuditFindings['applyToIssues'];
  validateLocalMarkdownLinks: (
    cwd: string,
    markdownFiles: string[]
  ) => AuditFindings['linkIssues'];
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

function emptyFindings(): AuditFindings {
  return {
    runtimeIssues: [],
    missingAgentsReferences: [],
    staleAgentsReferences: [],
    frontmatterIssues: [],
    applyToIssues: [],
    linkIssues: [],
    commandIssues: []
  };
}

function captureWrite(stream: NodeJS.WriteStream): { read: () => string; restore: () => void } {
  const originalWrite = stream.write;
  let output = '';
  stream.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof stream.write;

  return {
    read: () => output,
    restore: () => {
      stream.write = originalWrite;
    }
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

  it('reports missing or invalid foundational files as runtime failures', () => {
    const missingAgentsFiles = baseFixtureFiles();
    delete missingAgentsFiles['AGENTS.md'];

    const missingAgentsResult = auditCustomizationGovernance({
      cwd: createFixture(missingAgentsFiles)
    });

    expect(missingAgentsResult.success).toBe(false);
    expect(missingAgentsResult.findings.runtimeIssues).toContainEqual({
      issue: 'AGENTS.md is missing or empty'
    });
    expect(missingAgentsResult.findings.linkIssues).toContainEqual(
      expect.objectContaining({
        source: 'AGENTS.md',
        target: 'AGENTS.md',
        issue: 'source file does not exist'
      })
    );
    expect(missingAgentsResult.findings.commandIssues).toContainEqual(
      expect.objectContaining({
        source: 'AGENTS.md',
        script: '-',
        issue: 'source file does not exist'
      })
    );

    const missingPackageFiles = baseFixtureFiles();
    delete missingPackageFiles['package.json'];
    const missingPackageResult = auditCustomizationGovernance({
      cwd: createFixture(missingPackageFiles)
    });

    expect(missingPackageResult.success).toBe(false);
    expect(missingPackageResult.findings.runtimeIssues).toContainEqual({
      issue: 'package.json is missing'
    });

    const invalidPackageFiles = baseFixtureFiles();
    invalidPackageFiles['package.json'] = '{"scripts":';
    const invalidPackageResult = auditCustomizationGovernance({
      cwd: createFixture(invalidPackageFiles)
    });

    expect(invalidPackageResult.success).toBe(false);
    expect(invalidPackageResult.findings.runtimeIssues[0]?.issue).toMatch(
      /^package\.json is not valid JSON:/
    );
  });

  it('uses process cwd when no audit cwd option is provided', () => {
    const originalCwd = process.cwd();
    const fixtureRoot = createFixture(baseFixtureFiles());

    try {
      process.chdir(fixtureRoot);
      const result = auditCustomizationGovernance();

      expect(result.success).toBe(true);
      expect(result.customizationFilesChecked).toBe(5);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('discovers customization files and AGENTS references', () => {
    const files = baseFixtureFiles();
    for (const generatedRoot of [
      '.git',
      '.vscode-test',
      'assurance-closeout-evidence',
      'coverage',
      'node_modules',
      'out',
      'out-tests'
    ]) {
      files[`${generatedRoot}/.github/skills/generated/SKILL.md`] = `---
name: generated
description: "Use when generated output is inspected."
argument-hint: "none"
---

# Generated
`;
    }
    files['.github/skills/testing-automation/README.md'] = '# Not a customization file\n';

    const root = createFixture(files);
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
    expect(isCustomizationPath('.github/agents/workflow-governor.agent.md')).toBe(true);
    expect(isCustomizationPath('.github/instructions/unit-tests.instructions.md')).toBe(true);
    expect(isCustomizationPath('.github/prompts/pr-handoff-evidence.prompt.md')).toBe(true);
    expect(isCustomizationPath('.github/skills/onboarding/SKILL.md')).toBe(true);
    expect(isCustomizationPath('.github/skills/testing-automation/README.md')).toBe(false);
  });

  it('deduplicates AGENTS customization references and ignores non-customization paths', () => {
    const references = extractAgentsCustomizationReferences(
      [
        '- `.github/skills/testing-automation/SKILL.md`: testing workflow',
        '- `.github/skills/testing-automation/SKILL.md`: duplicate testing workflow',
        '- `.github/prompts/pr-handoff-evidence.prompt.md`: prompt',
        '- `.github/prompts/pr-handoff-evidence.prompt.md`: duplicate prompt',
        '- `.github/skills/testing-automation/README.md`: ignored markdown',
        '- `.github/instructions/not-an-instruction.md`: ignored markdown',
        '```',
        '.github/agents/fenced.agent.md',
        '```'
      ].join('\n')
    );

    expect(references).toEqual([
      '.github/prompts/pr-handoff-evidence.prompt.md',
      '.github/skills/testing-automation/SKILL.md'
    ]);
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

  it('flags frontmatter variants by customization artifact type', () => {
    const files = {
      '.github/skills/missing/SKILL.md': `---
name:
description:
---

# Missing Skill Metadata
`,
      '.github/skills/unclear/SKILL.md': `---
name: unclear
description: "Validate changes."
argument-hint: "Optional scope"
---

# Unclear Skill Trigger
`,
      '.github/prompts/no-frontmatter.prompt.md': '# Prompt without frontmatter\n',
      '.github/instructions/weak.instructions.md': `---
name: Weak Instructions
description: "Use this trigger."
---

Instruction body.
`,
      '.github/prompts/array.prompt.md': [
        '---',
        'name: [Array, Prompt]',
        'description: [Generate, evidence]',
        'argument-hint: [Issue, requirement]',
        'agent: [agent]',
        '---',
        '',
        'Prompt body.',
        ''
      ].join('\n'),
      '.github/agents/strict.agent.md': `---
name: Strict Agent
description: "Use when strict governance is needed."
argument-hint:
tools: [read, deploy]
user-invocable: maybe
---

Agent body.
    `,
      '.github/agents/no-tools.agent.md': [
        '---',
        'name: No Tools Agent',
        'description: "Use when testing empty tool declarations."',
        'argument-hint: "Task scope"',
        'tools:',
        'user-invocable: false',
        '---',
        '',
        'Agent body.',
        ''
      ].join('\n')
    };
    const customizationFiles = Object.keys(files);
    const issues = validateFrontmatterSchemas(createFixture(files), customizationFiles);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '.github/skills/missing/SKILL.md',
          issue: 'frontmatter key name must be present and non-empty'
        }),
        expect.objectContaining({
          path: '.github/skills/missing/SKILL.md',
          issue: "frontmatter name must match folder 'missing'"
        }),
        expect.objectContaining({
          path: '.github/skills/missing/SKILL.md',
          issue: 'frontmatter key description must be present and non-empty'
        }),
        expect.objectContaining({
          path: '.github/skills/missing/SKILL.md',
          issue: 'frontmatter key argument-hint must be present and non-empty'
        }),
        expect.objectContaining({
          path: '.github/skills/unclear/SKILL.md',
          issue: 'description should include a usage trigger starting with Use'
        }),
        expect.objectContaining({
          path: '.github/prompts/no-frontmatter.prompt.md',
          issue: 'missing YAML frontmatter block'
        }),
        expect.objectContaining({
          path: '.github/instructions/weak.instructions.md',
          issue: 'frontmatter key applyTo must be present and non-empty'
        }),
        expect.objectContaining({
          path: '.github/instructions/weak.instructions.md',
          issue: 'description should include Use when for trigger clarity'
        }),
        expect.objectContaining({
          path: '.github/agents/strict.agent.md',
          issue: 'frontmatter key argument-hint must be present and non-empty'
        }),
        expect.objectContaining({
          path: '.github/agents/strict.agent.md',
          issue: 'frontmatter tools include unsupported values: deploy'
        }),
        expect.objectContaining({
          path: '.github/agents/strict.agent.md',
          issue: "frontmatter tools must include 'search'"
        }),
        expect.objectContaining({
          path: '.github/agents/strict.agent.md',
          issue: "frontmatter key user-invocable must be explicitly 'true' or 'false'"
        }),
        expect.objectContaining({
          path: '.github/agents/no-tools.agent.md',
          issue: 'frontmatter key tools must declare at least one allowed tool'
        }),
        expect.objectContaining({
          path: '.github/agents/no-tools.agent.md',
          issue: "frontmatter tools must include 'read'"
        }),
        expect.objectContaining({
          path: '.github/agents/no-tools.agent.md',
          issue: "frontmatter tools must include 'search'"
        })
      ])
    );
  });

  it('parses scalar, inline array, and block array frontmatter values', () => {
    const parsed = parseFrontmatter(`---
name: "demo"
tools: [read, search]
applyTo:
  - "./src/**/*.ts"
  - 'tests/**/*.test.ts'
ignored-list:
  this is not a list item
empty:
---

Body
`);

    expect(parsed).toEqual({
      name: 'demo',
      tools: ['read', 'search'],
      applyTo: ['./src/**/*.ts', 'tests/**/*.test.ts'],
      'ignored-list': '',
      empty: ''
    });

    expect(
      parseFrontmatter(`---
name: demo
empty-array: []
malformed line without a key
---

Body
`)
    ).toEqual({
      name: 'demo',
      'empty-array': []
    });
  });

  it('allows non-customization helper paths with valid shared frontmatter', () => {
    const helperPath = '.github/other.md';
    const root = createFixture({
      [helperPath]: `---
name: Other Helper
description: "Use when validating shared metadata."
---

Helper body.
`
    });

    expect(validateFrontmatterSchemas(root, [helperPath])).toEqual([]);
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

  it('validates applyTo arrays, relative prefixes, wildcard matching, and catch-all variants', () => {
    const instructionPath = '.github/instructions/mixed.instructions.md';
    const root = createFixture({
      [instructionPath]: `---
name: Mixed Instructions
description: "Use when testing applyTo patterns."
applyTo:
  - "./src/**/*.ts"
  - "docs/test?.md"
  - "*"
  - "./**/*"
  - "missing/**/*.md"
---

Instruction body.
`,
      'src/example.ts': 'export const marker = true;\n',
      'src/domain/example.ts': 'export const marker = true;\n',
      'docs/test1.md': '# Test\n'
    });

    const issues = validateInstructionApplyTo(root, [instructionPath], [
      instructionPath,
      'src/example.ts',
      'src/domain/example.ts',
      'docs/test1.md'
    ]);

    expect(issues).toHaveLength(3);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: '*',
          issue: 'applyTo pattern is an unsafe catch-all'
        }),
        expect.objectContaining({
          pattern: './**/*',
          issue: 'applyTo pattern is an unsafe catch-all'
        }),
        expect.objectContaining({
          pattern: 'missing/**/*.md',
          issue: 'applyTo pattern does not match any tracked repository file'
        })
      ])
    );
  });

  it('resolves markdown links while skipping external, fragment-only, and code targets', () => {
    const sourcePath = 'docs/source.md';
    const root = createFixture({
      [sourcePath]: [
        '[External](https://example.com/guide.md)',
        '[Protocol](//example.com/asset.png)',
        '[Fragment](#local-section)',
        '[Query](target.md?plain=1#intro)',
        '[Angle](<target.md#angle>)',
        '[Title](target.md "Target title")',
        '[Root](/INSTALL.md)',
        '[Reference][install-ref]',
        '[Encoded](encoded%20target.md)',
        '[Outside](../../outside.md)',
        '[Malformed](missing%ZZ.md)',
        '`[Inline code](missing-inline.md)`',
        '```md',
        '[Fenced](missing-fenced.md)',
        '```',
        '[install-ref]: /INSTALL.md#readme',
        '<a href="target.md#html">ok</a>',
        '<img src="missing-image.png">'
      ].join('\n'),
      'INSTALL.md': '# Install\n',
      'docs/target.md': '# Target\n',
      'docs/encoded target.md': '# Encoded\n'
    });

    const extractedTargets = extractMarkdownLinks(
      fs.readFileSync(path.join(root, sourcePath), 'utf8')
    ).map((link) => link.target);
    expect(extractedTargets).toContain('https://example.com/guide.md');
    expect(extractedTargets).toContain('target.md?plain=1#intro');
    expect(extractedTargets).toContain('target.md#angle');
    expect(extractedTargets).toContain('/INSTALL.md#readme');
    expect(extractedTargets).not.toContain('missing-inline.md');
    expect(extractedTargets).not.toContain('missing-fenced.md');

    const issues = validateLocalMarkdownLinks(root, [sourcePath]);
    expect(issues).toHaveLength(3);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: '../../outside.md',
          issue: 'link resolves outside the repository root'
        }),
        expect.objectContaining({
          target: 'missing%ZZ.md',
          issue: 'link target file does not exist'
        }),
        expect.objectContaining({
          target: 'missing-image.png',
          issue: 'link target file does not exist'
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

  it('reports missing npm scripts from onboarding without duplicating repeated references', () => {
    const files = baseFixtureFiles();
    files['.github/skills/onboarding/SKILL.md'] += [
      '',
      'npm run docs:links',
      'npm run docs:links',
      'npm test'
    ].join('\n');

    const result = auditCustomizationGovernance({ cwd: createFixture(files) });

    expect(result.success).toBe(false);
    expect(result.findings.commandIssues).toEqual([
      expect.objectContaining({
        source: '.github/skills/onboarding/SKILL.md',
        script: 'docs:links',
        issue: 'referenced npm script does not exist in package.json'
      })
    ]);
  });

  it('reports missing onboarding sources and package files without scripts', () => {
    const missingOnboardingFiles = baseFixtureFiles();
    delete missingOnboardingFiles['.github/skills/onboarding/SKILL.md'];

    const missingOnboardingResult = auditCustomizationGovernance({
      cwd: createFixture(missingOnboardingFiles)
    });

    expect(missingOnboardingResult.success).toBe(false);
    expect(missingOnboardingResult.findings.commandIssues).toContainEqual(
      expect.objectContaining({
        source: '.github/skills/onboarding/SKILL.md',
        script: '-',
        issue: 'source file does not exist'
      })
    );

    const noScriptsFiles = baseFixtureFiles();
    noScriptsFiles['package.json'] = JSON.stringify({ name: 'fixture', private: true }, null, 2);

    const noScriptsResult = auditCustomizationGovernance({ cwd: createFixture(noScriptsFiles) });

    expect(noScriptsResult.success).toBe(false);
    expect(noScriptsResult.findings.commandIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'AGENTS.md',
          script: 'check',
          issue: 'referenced npm script does not exist in package.json'
        }),
        expect.objectContaining({
          source: '.github/skills/onboarding/SKILL.md',
          script: 'test',
          issue: 'referenced npm script does not exist in package.json'
        })
      ])
    );
  });

  it('extracts npm script references and translates globs', () => {
    expect(
      extractNpmScriptReferences(
        'npm run check\nnpm run check\nnpm test\nnpm test\nnpm run docs:links'
      )
    ).toEqual([
      'check',
      'docs:links',
      'test'
    ]);

    expect(globToRegex('src/**/*.ts').test('src/domain/example.ts')).toBe(true);
    expect(globToRegex('src/**/*.ts').test('src/example.ts')).toBe(true);
    expect(globToRegex('src/**/*.ts').test('tests/unit/example.test.ts')).toBe(false);
    expect(globToRegex('docs/file+(?).md').test('docs/file+(a).md')).toBe(true);
    expect(globToRegex('docs/file+(?).md').test('docs/file++a.md')).toBe(false);
  });

  it('builds a zero-issue machine-readable report for a clean result', () => {
    const report = toMachineReadableReport(
      {
        success: true,
        customizationFilesChecked: 5,
        findings: emptyFindings()
      },
      new Date('2026-07-13T00:00:00.000Z')
    );

    expect(report.generatedAt).toBe('2026-07-13T00:00:00.000Z');
    expect(report.success).toBe(true);
    expect(report.totals).toEqual({ issues: 0, failingCategories: 0 });
    expect(report.categories).toHaveLength(7);
    expect(report.categories.every((category) => category.count === 0)).toBe(true);

    const defensiveReport = toMachineReadableReport(
      {
        success: false,
        customizationFilesChecked: 0,
        findings: {
          ...emptyFindings(),
          commandIssues: 'not-an-array'
        } as unknown as AuditFindings
      },
      new Date('2026-07-13T00:00:00.000Z')
    );
    const commandCategory = defensiveReport.categories.find(
      (category) => category.key === 'commandIssues'
    );
    expect(commandCategory?.items).toEqual([]);
    expect(commandCategory?.count).toBe(0);

    const missingKeysReport = toMachineReadableReport(
      {
        success: false,
        customizationFilesChecked: 0,
        findings: {
          runtimeIssues: [{ issue: 'runtime' }]
        } as unknown as AuditFindings
      },
      new Date('2026-07-13T00:00:00.000Z')
    );
    expect(missingKeysReport.totals).toEqual({ issues: 1, failingCategories: 1 });
    expect(
      missingKeysReport.categories.find((category) => category.key === 'missingAgentsReferences')
        ?.items
    ).toEqual([]);
  });

  it('renders every text summary failure category', () => {
    const summary = renderSummary({
      success: false,
      customizationFilesChecked: 2,
      findings: {
        runtimeIssues: [{ issue: 'AGENTS.md is missing or empty' }],
        missingAgentsReferences: ['.github/skills/missing/SKILL.md'],
        staleAgentsReferences: ['.github/prompts/stale.prompt.md'],
        frontmatterIssues: [
          {
            path: '.github/skills/missing/SKILL.md',
            issue: 'frontmatter key name must be present and non-empty'
          }
        ],
        applyToIssues: [
          {
            path: '.github/instructions/unsafe.instructions.md',
            pattern: '**',
            issue: 'applyTo pattern is an unsafe catch-all'
          }
        ],
        linkIssues: [
          {
            source: 'AGENTS.md',
            line: 2,
            target: 'missing.md',
            issue: 'link target file does not exist'
          }
        ],
        commandIssues: [
          {
            source: 'AGENTS.md',
            script: 'missing',
            issue: 'referenced npm script does not exist in package.json'
          }
        ]
      }
    });

    expect(summary).toContain('[customization-audit] Runtime failures:');
    expect(summary).toContain('[customization-audit] Customization files missing from AGENTS.md:');
    expect(summary).toContain('[customization-audit] AGENTS.md references to missing customization files:');
    expect(summary).toContain('[customization-audit] Frontmatter schema issues:');
    expect(summary).toContain('[customization-audit] applyTo issues:');
    expect(summary).toContain('[customization-audit] Link resolution issues:');
    expect(summary).toContain('[customization-audit] Command reference issues:');
    expect(summary).toContain('[customization-audit] Audit failed.');
  });

  it('emits machine-readable JSON with categorized remediation guidance', () => {
    const files = baseFixtureFiles();
    files['AGENTS.md'] += '\n- npm run not-a-script\n';
    const fixtureRoot = createFixture(files);

    let output = '';
    const exitCode = main(['--json', fixtureRoot], {
      stdout: {
        write: (text: string) => {
          output += text;
        }
      }
    });

    expect(exitCode).toBe(1);
    const report = JSON.parse(output) as ReturnType<typeof toMachineReadableReport>;
    expect(report.schemaVersion).toBe(1);
    expect(report.success).toBe(false);
    expect(report.totals.issues).toBeGreaterThan(0);

    const commandCategory = report.categories.find((category) => category.key === 'commandIssues');
    expect(commandCategory?.count).toBe(1);
    expect(commandCategory?.remediation).toContain('package.json');
  });

  it('keeps the machine-readable JSON category contract stable for every finding type', () => {
    const findings: AuditFindings = {
      runtimeIssues: [{ issue: 'package.json is missing' }],
      missingAgentsReferences: ['.github/skills/new-skill/SKILL.md'],
      staleAgentsReferences: ['.github/prompts/removed.prompt.md'],
      frontmatterIssues: [
        {
          path: '.github/prompts/pr-handoff.prompt.md',
          issue: 'description is required'
        }
      ],
      applyToIssues: [
        {
          path: '.github/instructions/unit-tests.instructions.md',
          pattern: '**/*',
          issue: 'applyTo pattern is an unsafe catch-all'
        }
      ],
      linkIssues: [
        {
          source: 'AGENTS.md',
          line: 42,
          target: 'docs/missing.md',
          issue: 'link target file does not exist'
        }
      ],
      commandIssues: [
        {
          source: 'AGENTS.md',
          script: 'not-a-script',
          issue: 'referenced npm script does not exist in package.json'
        }
      ]
    };

    const report = toMachineReadableReport(
      {
        success: false,
        customizationFilesChecked: 17,
        findings
      },
      new Date('2026-07-14T12:00:00.000Z')
    );

    expect(report).toEqual({
      $schema: CUSTOMIZATION_AUDIT_SCHEMA_ID,
      schemaVersion: 1,
      generatedAt: '2026-07-14T12:00:00.000Z',
      success: false,
      customizationFilesChecked: 17,
      totals: { issues: 7, failingCategories: 7 },
      categories: [
        {
          key: 'runtimeIssues',
          label: 'runtime',
          count: 1,
          remediation: 'Resolve missing foundational files or invalid JSON before triaging other findings.',
          items: findings.runtimeIssues
        },
        {
          key: 'missingAgentsReferences',
          label: 'agents-sync-missing',
          count: 1,
          remediation: 'Add discovered customization files to AGENTS workspace sections.',
          items: findings.missingAgentsReferences
        },
        {
          key: 'staleAgentsReferences',
          label: 'agents-sync-stale',
          count: 1,
          remediation: 'Remove stale AGENTS references or restore deleted customization files.',
          items: findings.staleAgentsReferences
        },
        {
          key: 'frontmatterIssues',
          label: 'frontmatter-schema',
          count: 1,
          remediation: 'Fix required frontmatter keys and safe defaults for each customization artifact type.',
          items: findings.frontmatterIssues
        },
        {
          key: 'applyToIssues',
          label: 'instruction-applyto',
          count: 1,
          remediation: 'Adjust instruction applyTo globs to avoid catch-all patterns and match committed files.',
          items: findings.applyToIssues
        },
        {
          key: 'linkIssues',
          label: 'markdown-links',
          count: 1,
          remediation: 'Fix local markdown targets so links resolve to existing in-repo files.',
          items: findings.linkIssues
        },
        {
          key: 'commandIssues',
          label: 'command-references',
          count: 1,
          remediation: 'Align npm run command references in AGENTS/onboarding with package.json scripts.',
          items: findings.commandIssues
        }
      ]
    });
  });

  it('emits deterministic JSON for a successful audit', () => {
    const fixtureRoot = createFixture(baseFixtureFiles());
    let output = '';

    const exitCode = main(['--json', fixtureRoot], {
      now: new Date('2026-07-13T12:34:56.000Z'),
      stdout: {
        write: (text: string) => {
          output += text;
        }
      }
    });

    expect(exitCode).toBe(0);
    const report = JSON.parse(output) as ReturnType<typeof toMachineReadableReport>;
    expect(report.generatedAt).toBe('2026-07-13T12:34:56.000Z');
    expect(report.success).toBe(true);
    expect(report.totals).toEqual({ issues: 0, failingCategories: 0 });

    let defaultNowOutput = '';
    expect(
      main(['--json', fixtureRoot], {
        stdout: {
          write: (text: string) => {
            defaultNowOutput += text;
          }
        }
      })
    ).toBe(0);
    const defaultNowReport = JSON.parse(defaultNowOutput) as ReturnType<typeof toMachineReadableReport>;
    expect(Date.parse(defaultNowReport.generatedAt)).not.toBeNaN();
  });

  it('writes text summaries to stdout on success and stderr on failure', () => {
    const successRoot = createFixture(baseFixtureFiles());
    let successStdout = '';
    let successStderr = '';

    const successExitCode = main([], {
      cwd: successRoot,
      stdout: {
        write: (text: string) => {
          successStdout += text;
        }
      },
      stderr: {
        write: (text: string) => {
          successStderr += text;
        }
      }
    });

    expect(successExitCode).toBe(0);
    expect(successStdout).toContain('[customization-audit] Audit passed.');
    expect(successStderr).toBe('');

    const failureFiles = baseFixtureFiles();
    failureFiles['AGENTS.md'] += '\n- npm run missing\n';
    const failureRoot = createFixture(failureFiles);
    let failureStdout = '';
    let failureStderr = '';

    const failureExitCode = main([failureRoot], {
      stdout: {
        write: (text: string) => {
          failureStdout += text;
        }
      },
      stderr: {
        write: (text: string) => {
          failureStderr += text;
        }
      }
    });

    expect(failureExitCode).toBe(1);
    expect(failureStdout).toBe('');
    expect(failureStderr).toContain('[customization-audit] Command reference issues:');
    expect(failureStderr).toContain('[customization-audit] Audit failed.');
  });

  it('falls back to process streams when injected writers are omitted', () => {
    const stdoutCapture = captureWrite(process.stdout);
    try {
      expect(main([createFixture(baseFixtureFiles())])).toBe(0);
      expect(stdoutCapture.read()).toContain('[customization-audit] Audit passed.');
    } finally {
      stdoutCapture.restore();
    }

    const stderrCapture = captureWrite(process.stderr);
    try {
      expect(main(['--unsupported-option'])).toBe(1);
      expect(stderrCapture.read()).toContain("Unknown option '--unsupported-option'");
    } finally {
      stderrCapture.restore();
    }
  });

  it('parses CLI args for json mode and rejects unknown options', () => {
    expect(parseMainArgs([])).toEqual({
      cwd: process.cwd(),
      emitJson: false,
      emitSchema: false,
      includeProvenance: false
    });

    expect(parseMainArgs(['--json', '/tmp/custom-cwd'])).toEqual({
      cwd: '/tmp/custom-cwd',
      emitJson: true,
      emitSchema: false,
      includeProvenance: false
    });

    expect(() => parseMainArgs(['--unsupported-option'])).toThrow(
      "Unknown option '--unsupported-option'"
    );

    expect(() => parseMainArgs(['/tmp/one', '/tmp/two'])).toThrow(
      'Only one cwd argument is supported.'
    );

    let stderr = '';
    expect(
      main(['--unsupported-option'], {
        stderr: {
          write: (text: string) => {
            stderr += text;
          }
        }
      })
    ).toBe(1);
    expect(stderr).toContain("Unknown option '--unsupported-option'");
  });

  it('emits a self-describing report aligned with the published schema, with a --schema mode (VHS-REQ-615)', () => {
    const report = toMachineReadableReport(
      { success: true, customizationFilesChecked: 3, findings: {} },
      new Date('2026-07-14T00:00:00.000Z')
    ) as unknown as Record<string, unknown>;
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };

    // Self-describing envelope aligned with the schema's required contract.
    expect(schema.required.filter((key) => !(key in report))).toEqual([]);
    expect(report.$schema).toBe(schema.properties.$schema.const);
    expect(report.$schema).toBe(CUSTOMIZATION_AUDIT_SCHEMA_ID);
    expect(report.schemaVersion).toBe(schema.properties.schemaVersion.const);

    // --schema publishes the JSON Schema and attaches provenance under the shared key.
    expect(schema.$id).toBe(CUSTOMIZATION_AUDIT_SCHEMA_ID);
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });

    // main --schema publishes the schema without running the audit.
    let out = '';
    const code = main(['--schema'], { stdout: { write: (t: string) => { out += t; } }, stderr: { write: () => undefined } });
    expect(code).toBe(0);
    expect((JSON.parse(out) as Record<string, unknown>).$id).toBe(CUSTOMIZATION_AUDIT_SCHEMA_ID);
  });

  it('rejects combining --json and --schema, and honors --include-provenance in text output (VHS-REQ-615)', () => {
    let stderr = '';
    const conflictCode = main(['--json', '--schema'], {
      stdout: { write: () => undefined },
      stderr: { write: (t: string) => { stderr += t; } }
    });
    expect(conflictCode).toBe(1);
    expect(stderr).toContain('Use only one output mode');

    let out = '';
    main(['--include-provenance'], {
      now: new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (t: string) => { out += t; } },
      stderr: { write: (t: string) => { out += t; } }
    });
    expect(out).toContain('[customization-audit] provenance generatedAt: 2026-07-15T00:00:00.000Z');
    expect(out).toContain('provenance outputMode: text');
  });
});
