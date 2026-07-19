import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const { auditAgentDelegation, extractAgentDropdownOptions } = require('../../scripts/checkAgentDelegation.js') as {
  auditAgentDelegation: (repoRoot: string) => { ok: boolean; violations: string[] };
  extractAgentDropdownOptions: (text: string) => string[];
};

const tempRoots: string[] = [];

function makeRepo(agentSlugs: string[], templates: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-agent-'));
  tempRoots.push(root);
  const agentsDir = path.join(root, '.github', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const slug of agentSlugs) {
    fs.writeFileSync(path.join(agentsDir, `${slug}.agent.md`), `---\nname: ${slug}\n---\n`);
  }
  const templateDir = path.join(root, '.github', 'ISSUE_TEMPLATE');
  fs.mkdirSync(templateDir, { recursive: true });
  for (const [name, body] of Object.entries(templates)) {
    fs.writeFileSync(path.join(templateDir, name), body);
  }
  return root;
}

function dropdownTemplate(options: string[]): string {
  return [
    'name: T',
    'body:',
    '  - type: dropdown',
    '    id: delegated_agent',
    '    attributes:',
    '      label: Delegated Agent',
    '      options:',
    ...options.map((o) => `        - ${o}`),
    ''
  ].join('\n');
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('extractAgentDropdownOptions', () => {
  it('returns the leading slug of each option in an agent dropdown', () => {
    const text = dropdownTemplate(['workflow-governor (general)', 'docs-scribe (docs-only)']);
    expect(extractAgentDropdownOptions(text)).toEqual(['workflow-governor', 'docs-scribe']);
  });

  it('ignores non-agent dropdowns', () => {
    const text = [
      'body:',
      '  - type: dropdown',
      '    id: severity',
      '    attributes:',
      '      options:',
      '        - high',
      '        - low',
      ''
    ].join('\n');
    expect(extractAgentDropdownOptions(text)).toEqual([]);
  });
});

describe('auditAgentDelegation', () => {
  it('passes when every dropdown option maps to a real agent file or the sentinel', () => {
    const root = makeRepo(
      ['workflow-governor', 'docs-scribe'],
      {
        'requirement_target.yml': dropdownTemplate(['workflow-governor (x)', 'docs-scribe (y)']),
        'bug_report.yml': dropdownTemplate(['unsure / maintainer to route', 'docs-scribe (y)'])
      }
    );
    expect(auditAgentDelegation(root)).toEqual({ ok: true, violations: [] });
  });

  it('fails when a dropdown offers an agent with no agent file', () => {
    const root = makeRepo(
      ['workflow-governor'],
      { 'requirement_target.yml': dropdownTemplate(['workflow-governor (x)', 'ghost-agent (y)']) }
    );
    const result = auditAgentDelegation(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('ghost-agent'))).toBe(true);
  });

  it('passes the real repository issue templates', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    expect(auditAgentDelegation(repoRoot)).toEqual({ ok: true, violations: [] });
  });
});
