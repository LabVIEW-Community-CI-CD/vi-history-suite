import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

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
  getWindowsPythonExecutableCandidates,
  isMountedWindowsPath,
  resolveDesignGateArgs,
  resolveDesignGateCommand,
  resolveWindowsPythonCommand,
  renderDesignGateMarkdown,
  selectNextDevelopmentTranche
} from '../../src/tooling/designGate';

describe('designGate tooling', () => {
  it('builds the governed local design gate plan in the expected order', () => {
    const plan = buildDesignGatePlan('/tmp/vi-history-suite', '/tmp/run_assurance.py', 'linux');

    expect(plan).toEqual([
      {
        id: 'branch-governance-baseline',
        title: 'Branch governance baseline',
        command: 'npm',
        args: ['run', 'branch:governance:assert']
      },
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
        id: 'public-exact-pretag-proof',
        title: 'Public exact pre-tag proof',
        command: 'npm',
        args: ['run', 'public:exact:pretag:proof'],
        timeoutMs: 300000
      },
      {
        id: 'standards-assurance',
        title: 'Standards assurance',
        command: 'npm',
        args: ['run', 'assurance:release-gate'],
        timeoutMs: 300000
      }
    ]);
  });

  it('uses native Windows entrypoints for npm and Python in the governed design gate plan', () => {
    const windowsEnvironment = {
      LocalAppData: 'C:\\Users\\tester\\AppData\\Local'
    } as NodeJS.ProcessEnv;
    const expectedPython =
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
    const plan = buildDesignGatePlan(
      'C:/repo/vi-history-suite',
      'C:/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py',
      'win32',
      windowsEnvironment,
      (candidate) => candidate === expectedPython
    );

    expect(plan).toEqual([
      {
        id: 'branch-governance-baseline',
        title: 'Branch governance baseline',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run branch:governance:assert']
      },
      {
        id: 'design-contract',
        title: 'Design contract',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run test:design-contract']
      },
      {
        id: 'unit-and-coverage',
        title: 'Unit tests and coverage',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run test']
      },
      {
        id: 'extension-host-integration',
        title: 'VS Code extension-host integration',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run test:integration:windows']
      },
      {
        id: 'canonical-harness-smoke',
        title: 'Canonical harness smoke',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run proof:run -- smoke']
      },
      {
        id: 'documentation-continuous-integration',
        title: 'Documentation continuous integration',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run docs:ci:core']
      },
      {
        id: 'public-exact-pretag-proof',
        title: 'Public exact pre-tag proof',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run public:exact:pretag:proof'],
        timeoutMs: 300000
      },
      {
        id: 'standards-assurance',
        title: 'Standards assurance',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run assurance:release-gate'],
        timeoutMs: 300000
      }
    ]);
  });

  it('resolves native command entrypoints deterministically for Linux and Windows', () => {
    const windowsEnvironment = {
      LocalAppData: 'C:\\Users\\tester\\AppData\\Local'
    } as NodeJS.ProcessEnv;
    const expectedPython =
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

    expect(resolveDesignGateCommand('npm', 'linux')).toBe('npm');
    expect(resolveDesignGateCommand('python3', 'linux')).toBe('python3');
    expect(resolveDesignGateCommand('npm', 'win32')).toBe('cmd.exe');
    expect(
      resolveDesignGateCommand(
        'python3',
        'win32',
        windowsEnvironment,
        (candidate) => candidate === expectedPython
      )
    ).toBe(expectedPython);
    expect(resolveDesignGateArgs('npm', ['run', 'test'], 'win32')).toEqual([
      '/d',
      '/s',
      '/c',
      'npm run test'
    ]);
    expect(
      resolveDesignGateArgs(
        'python3',
        ['tool.py'],
        'win32',
        windowsEnvironment,
        () => false
      )
    ).toEqual(['-3', 'tool.py']);
  });

  it('prefers an explicit or deterministic Windows Python toolchain before the launcher fallback', () => {
    const windowsEnvironment = {
      LocalAppData: 'C:\\Users\\tester\\AppData\\Local'
    } as NodeJS.ProcessEnv;
    const expectedCandidates = [
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python39\\python.exe'
    ];

    expect(getWindowsPythonExecutableCandidates(windowsEnvironment).slice(0, 5)).toEqual(
      expectedCandidates
    );
    expect(
      resolveWindowsPythonCommand(
        {
          VI_HISTORY_SUITE_ASSURANCE_PYTHON: 'D:\\tools\\python\\python.exe'
        } as NodeJS.ProcessEnv
      )
    ).toBe('D:\\tools\\python\\python.exe');
    expect(
      resolveWindowsPythonCommand(
        windowsEnvironment,
        (candidate) =>
          candidate === 'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
      )
    ).toBe('C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe');
    expect(resolveWindowsPythonCommand(windowsEnvironment, () => false)).toBe('py');
  });

  it('prefers explicit and Linux-local assurance script candidates before the Windows-mounted fallback', () => {
    expect(
      defaultAssuranceScriptPathCandidates('/home/tester', {
        VI_HISTORY_SUITE_ASSURANCE_SCRIPT: '/opt/assurance/run_assurance.py',
        CODEX_HOME: '/workspace/codex'
      })
    ).toEqual([
      '/opt/assurance/run_assurance.py',
      path.join('/workspace/codex', 'skills', 'repo-standards-review', 'scripts', 'run_assurance.py'),
      path.join('/home/tester', '.codex', 'skills', 'repo-standards-review', 'scripts', 'run_assurance.py'),
      '/mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py'
    ]);
  });

  it('derives deterministic repo-local mirror paths for the assurance skill and detects mounted Windows paths', () => {
    expect(designGateAssuranceMirrorRoot('/tmp/vi-history-suite')).toBe(
      path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'assurance-skill', 'repo-standards-review')
    );
    expect(designGateAssuranceMirrorScriptPath('/tmp/vi-history-suite')).toBe(
      path.join(
        '/tmp/vi-history-suite',
        '.cache',
        'design-gate',
        'assurance-skill',
        'repo-standards-review',
        'scripts',
        'run_assurance.py'
      )
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
      path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.json')
    );
    expect(designGateReportMarkdownPath('/tmp/vi-history-suite')).toBe(
      path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md')
    );
    expect(designGateCoverageSummaryPath('/tmp/vi-history-suite')).toBe(
      path.join('/tmp/vi-history-suite', 'coverage', 'coverage-summary.json')
    );
    expect(designGateDevelopmentQueuePath('/tmp/vi-history-suite')).toBe(
      path.join('/tmp/vi-history-suite', 'docs', 'product', 'development-queue.json')
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
