import { describe, expect, it } from 'vitest';

import {
  buildDesignGatePlan,
  designGateCoverageSummaryPath,
  designGateReportJsonPath,
  designGateReportMarkdownPath,
  extractWeakestCoverageFocus,
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
    expect(designGateCoverageSummaryPath('/tmp/vi-history-suite')).toBe(
      '/tmp/vi-history-suite/coverage/coverage-summary.json'
    );

    const markdown = renderDesignGateMarkdown({
      generatedAt: '2026-04-02T00:00:00.000Z',
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass',
      assuranceGateSummary: '5 PASS, 0 FAIL, 1 N/A',
      nextFocus: 'src/indexing/viEligibilityIndexer.ts (20.6% lines)',
      coverageFocus: [
        {
          relativePath: 'src/indexing/viEligibilityIndexer.ts',
          linesPct: 20.6,
          linesCovered: 41,
          linesTotal: 199
        }
      ],
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
    expect(markdown).toContain('- Next focus: src/indexing/viEligibilityIndexer.ts (20.6% lines)');
    expect(markdown).toContain('| unit-and-coverage | pass | 1234 |');
    expect(markdown).toContain('| src/indexing/viEligibilityIndexer.ts | 20.6% | 41/199 |');
  });

  it('extracts the weakest covered source files from retained coverage summary data', () => {
    const repoRoot = '/tmp/vi-history-suite';
    const coverageFocus = extractWeakestCoverageFocus(
      repoRoot,
      JSON.stringify({
        total: {
          lines: { pct: 50 }
        },
        '/tmp/vi-history-suite/src/ui/historyPanel.ts': {
          lines: { pct: 97.4, covered: 75, total: 77 }
        },
        '/tmp/vi-history-suite/src/indexing/viEligibilityIndexer.ts': {
          lines: { pct: 20.6, covered: 41, total: 199 }
        },
        '/tmp/vi-history-suite/src/harness/harnessSmoke.ts': {
          lines: { pct: 47.89, covered: 57, total: 119 }
        },
        '/tmp/vi-history-suite/out/generated.js': {
          lines: { pct: 0, covered: 0, total: 10 }
        }
      }),
      2
    );

    expect(coverageFocus).toEqual([
      {
        relativePath: 'src/indexing/viEligibilityIndexer.ts',
        linesPct: 20.6,
        linesCovered: 41,
        linesTotal: 199
      },
      {
        relativePath: 'src/harness/harnessSmoke.ts',
        linesPct: 47.89,
        linesCovered: 57,
        linesTotal: 119
      }
    ]);
  });

  it('renders an explicit unavailable reason when coverage focus facts are missing', () => {
    const markdown = renderDesignGateMarkdown({
      generatedAt: '2026-04-02T00:00:00.000Z',
      repoRoot: '/tmp/vi-history-suite',
      status: 'fail',
      coverageFocusUnavailableReason: 'coverage-summary-unavailable:/tmp/vi-history-suite/coverage/coverage-summary.json',
      steps: []
    });

    expect(markdown).toContain(
      '- Coverage focus unavailable: coverage-summary-unavailable:/tmp/vi-history-suite/coverage/coverage-summary.json'
    );
  });
});
