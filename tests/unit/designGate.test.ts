import { describe, expect, it } from 'vitest';

import {
  assertCompletedPassingDesignGateReport,
  buildDesignGatePlan,
  defaultAssuranceScriptPathCandidates,
  designGateAssuranceMirrorScriptPath,
  designGateAssuranceMirrorRoot,
  designGateCoverageSummaryPath,
  designGateDevelopmentQueuePath,
  designGateReportJsonPath,
  designGateReportMarkdownPath,
  extractWeakestCoverageFocus,
  extractAssuranceGateSummary,
  isMountedWindowsPath,
  renderDesignGateMarkdown,
  selectNextDevelopmentTranche
} from '../../src/tooling/designGate';

describe('designGate tooling', () => {
  it('builds the governed local design gate plan in the expected order', () => {
    const plan = buildDesignGatePlan('/tmp/vi-history-suite', '/tmp/run_assurance.py');

    expect(plan).toEqual([
      {
        id: 'design-contract',
        title: 'Design contract',
        command: 'npm',
        args: ['run', 'test:design-contract']
      },
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
        args: ['run', 'proof:run', '--', 'smoke']
      },
      {
        id: 'documentation-continuous-integration',
        title: 'Documentation continuous integration',
        command: 'npm',
        args: ['run', 'docs:ci:core']
      },
      {
        id: 'standards-assurance',
        title: 'Standards assurance',
        command: 'python3',
        args: ['/tmp/run_assurance.py', '/tmp/vi-history-suite', '--profile', 'quick-triage'],
        timeoutMs: 180000
      }
    ]);
  });

  it('prefers explicit and Linux-local assurance script candidates before the Windows-mounted fallback', () => {
    expect(
      defaultAssuranceScriptPathCandidates('/home/tester', {
        VI_HISTORY_SUITE_ASSURANCE_SCRIPT: '/opt/assurance/run_assurance.py',
        CODEX_HOME: '/workspace/codex'
      })
    ).toEqual([
      '/opt/assurance/run_assurance.py',
      '/workspace/codex/skills/repo-standards-review/scripts/run_assurance.py',
      '/home/tester/.codex/skills/repo-standards-review/scripts/run_assurance.py',
      '/mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py'
    ]);
  });

  it('derives deterministic repo-local mirror paths for the assurance skill and detects mounted Windows paths', () => {
    expect(designGateAssuranceMirrorRoot('/tmp/vi-history-suite')).toBe(
      '/tmp/vi-history-suite/.cache/design-gate/assurance-skill/repo-standards-review'
    );
    expect(designGateAssuranceMirrorScriptPath('/tmp/vi-history-suite')).toBe(
      '/tmp/vi-history-suite/.cache/design-gate/assurance-skill/repo-standards-review/scripts/run_assurance.py'
    );
    expect(isMountedWindowsPath('/mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py')).toBe(true);
    expect(isMountedWindowsPath('/home/sveld/code/tools/repo-standards-review/scripts/run_assurance.py')).toBe(false);
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
    expect(designGateDevelopmentQueuePath('/tmp/vi-history-suite')).toBe(
      '/tmp/vi-history-suite/docs/product/development-queue.json'
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

  it('renders the next tranche when coverage is saturated instead of a fake file-level focus', () => {
    const markdown = renderDesignGateMarkdown({
      generatedAt: '2026-04-02T00:00:00.000Z',
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass',
      assuranceGateSummary: '5 PASS, 0 FAIL, 1 N/A',
      nextTranche: 'TRANCHE-001: Wire report preflight into report runtime planning and storage integration',
      coverageFocus: [
        {
          relativePath: 'src/indexing/viEligibilityIndexer.ts',
          linesPct: 100,
          linesCovered: 227,
          linesTotal: 227
        }
      ],
      steps: []
    });

    expect(markdown).not.toContain('Next focus:');
    expect(markdown).toContain(
      'Next tranche: TRANCHE-001: Wire report preflight into report runtime planning and storage integration'
    );
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

  it('breaks weakest-coverage ties deterministically by larger file scope and then relative path', () => {
    const repoRoot = '/tmp/vi-history-suite';
    const coverageFocus = extractWeakestCoverageFocus(
      repoRoot,
      JSON.stringify({
        '/tmp/vi-history-suite/src/zeta.ts': {
          lines: { pct: 50, covered: 10, total: 20 }
        },
        '/tmp/vi-history-suite/src/alpha.ts': {
          lines: { pct: 50, covered: 5, total: 20 }
        },
        '/tmp/vi-history-suite/src/beta.ts': {
          lines: { pct: 50, covered: 25, total: 50 }
        }
      }),
      3
    );

    expect(coverageFocus.map((entry) => entry.relativePath)).toEqual([
      'src/beta.ts',
      'src/alpha.ts',
      'src/zeta.ts'
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

  it('renders an explicit unavailable reason when the next tranche cannot be derived', () => {
    const markdown = renderDesignGateMarkdown({
      generatedAt: '2026-04-02T00:00:00.000Z',
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass',
      nextTrancheUnavailableReason:
        'no-active-or-queued-development-tranche:/tmp/vi-history-suite/docs/product/development-queue.json',
      coverageFocus: [
        {
          relativePath: 'src/indexing/viEligibilityIndexer.ts',
          linesPct: 100,
          linesCovered: 227,
          linesTotal: 227
        }
      ],
      steps: []
    });

    expect(markdown).toContain(
      '- Next tranche unavailable: no-active-or-queued-development-tranche:/tmp/vi-history-suite/docs/product/development-queue.json'
    );
  });

  it('selects the active development tranche before queued entries', () => {
    expect(
      selectNextDevelopmentTranche([
        {
          id: 'TRANCHE-002',
          title: 'Queued',
          status: 'queued',
          source: 'authoritative research',
          summary: 'queued summary'
        },
        {
          id: 'TRANCHE-001',
          title: 'Active',
          status: 'active',
          source: 'authoritative research',
          summary: 'active summary'
        }
      ])
    ).toEqual({
      id: 'TRANCHE-001',
      title: 'Active',
      status: 'active',
      source: 'authoritative research',
      summary: 'active summary'
    });
  });

  it('fails closed when a retained pass report is still running', () => {
    expect(() =>
      assertCompletedPassingDesignGateReport({
        status: 'pass',
        completionState: 'running',
        pendingStepId: 'standards-assurance',
        pendingStepTitle: 'Standards assurance'
      })
    ).toThrow('design gate report is still running; pending step: standards-assurance (Standards assurance)');
  });

  it('accepts completed retained pass reports', () => {
    expect(() =>
      assertCompletedPassingDesignGateReport({
        status: 'pass',
        completionState: 'complete'
      })
    ).not.toThrow();
  });
});
