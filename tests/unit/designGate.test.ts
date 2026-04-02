import { describe, expect, it } from 'vitest';

import {
  buildDesignGatePlan,
  designGateReportJsonPath,
  designGateReportMarkdownPath,
  extractAssuranceGateSummary,
  renderDesignGateMarkdown
} from '../../src/tooling/designGate';

describe('designGate tooling', () => {
  it('builds the governed local design gate plan in the expected order', () => {
    const plan = buildDesignGatePlan('/tmp/vi-history-suite', '/tmp/run_assurance.py');

    expect(plan).toEqual([
      {
        id: 'unit-and-coverage',
        title: 'Unit tests and coverage',
        command: 'npm',
        args: ['run', 'test']
      },
      {
        id: 'extension-host-integration',
        title: 'VS Code extension-host integration',
        command: 'npm',
        args: ['run', 'test:integration']
      },
      {
        id: 'canonical-harness-smoke',
        title: 'Canonical harness smoke',
        command: 'npm',
        args: ['run', 'harness:smoke']
      },
      {
        id: 'standards-assurance',
        title: 'Standards assurance',
        command: 'python3',
        args: ['/tmp/run_assurance.py', '/tmp/vi-history-suite', '--profile', 'quick-triage']
      }
    ]);
  });

  it('extracts the retained assurance gate summary from standards output', () => {
    expect(
      extractAssuranceGateSummary([
        'Executive Brief',
        '- Audience: engineering-leaders',
        '- Gate summary: 5 PASS, 0 FAIL, 1 N/A'
      ].join('\n'))
    ).toBe('5 PASS, 0 FAIL, 1 N/A');
  });

  it('renders retained report paths and markdown summary deterministically', () => {
    expect(designGateReportJsonPath('/tmp/vi-history-suite')).toBe(
      '/tmp/vi-history-suite/.cache/design-gate/latest-report.json'
    );
    expect(designGateReportMarkdownPath('/tmp/vi-history-suite')).toBe(
      '/tmp/vi-history-suite/.cache/design-gate/latest-report.md'
    );

    const markdown = renderDesignGateMarkdown({
      generatedAt: '2026-04-02T00:00:00.000Z',
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass',
      assuranceGateSummary: '5 PASS, 0 FAIL, 1 N/A',
      steps: [
        {
          id: 'unit-and-coverage',
          title: 'Unit tests and coverage',
          command: 'npm',
          args: ['run', 'test'],
          exitCode: 0,
          durationMs: 1234,
          stdout: 'ok',
          stderr: ''
        }
      ]
    });

    expect(markdown).toContain('# Design Gate Report');
    expect(markdown).toContain('- Assurance gate summary: 5 PASS, 0 FAIL, 1 N/A');
    expect(markdown).toContain('| unit-and-coverage | pass | 1234 |');
  });
});
