import * as path from 'node:path';

export interface DesignGateStepSpec {
  id: string;
  title: string;
  command: string;
  args: string[];
}

export interface DesignGateStepResult {
  id: string;
  title: string;
  command: string;
  args: string[];
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface DesignGateReport {
  generatedAt: string;
  repoRoot: string;
  status: 'pass' | 'fail';
  assuranceGateSummary?: string;
  coverageFocus?: CoverageFocusEntry[];
  coverageFocusUnavailableReason?: string;
  nextFocus?: string;
  steps: DesignGateStepResult[];
}

export interface CoverageFocusEntry {
  relativePath: string;
  linesPct: number;
  linesCovered: number;
  linesTotal: number;
}

export function defaultAssuranceScriptPath(): string {
  return '/mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py';
}

export function buildDesignGatePlan(
  repoRoot: string,
  assuranceScriptPath = defaultAssuranceScriptPath()
): DesignGateStepSpec[] {
  return [
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
      args: [assuranceScriptPath, repoRoot, '--profile', 'quick-triage']
    }
  ];
}

export function extractAssuranceGateSummary(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('- Gate summary: '))
    ?.replace(/^- Gate summary:\s*/, '');
}

export function designGateReportDirectory(repoRoot: string): string {
  return path.join(repoRoot, '.cache', 'design-gate');
}

export function designGateReportJsonPath(repoRoot: string): string {
  return path.join(designGateReportDirectory(repoRoot), 'latest-report.json');
}

export function designGateReportMarkdownPath(repoRoot: string): string {
  return path.join(designGateReportDirectory(repoRoot), 'latest-report.md');
}

export function designGateCoverageSummaryPath(repoRoot: string): string {
  return path.join(repoRoot, 'coverage', 'coverage-summary.json');
}

export function extractWeakestCoverageFocus(
  repoRoot: string,
  coverageSummaryText: string,
  limit = 5
): CoverageFocusEntry[] {
  const parsed = JSON.parse(coverageSummaryText) as Record<string, unknown>;
  const repoSrcRoot = `${path.join(repoRoot, 'src')}${path.sep}`;

  return Object.entries(parsed)
    .filter(([key]) => key !== 'total' && key.startsWith(repoSrcRoot))
    .map(([key, value]) => {
      const typedValue = value as {
        lines?: { covered?: number; total?: number; pct?: number };
      };
      const relativePath = path.relative(repoRoot, key).split(path.sep).join('/');
      const linesCovered = Number(typedValue.lines?.covered ?? 0);
      const linesTotal = Number(typedValue.lines?.total ?? 0);
      const linesPct = Number(typedValue.lines?.pct ?? 0);

      return {
        relativePath,
        linesPct,
        linesCovered,
        linesTotal
      };
    })
    .sort((left, right) => {
      if (left.linesPct !== right.linesPct) {
        return left.linesPct - right.linesPct;
      }

      if (left.linesTotal !== right.linesTotal) {
        return right.linesTotal - left.linesTotal;
      }

      return left.relativePath.localeCompare(right.relativePath);
    })
    .slice(0, limit);
}

export function renderDesignGateMarkdown(report: DesignGateReport): string {
  const lines = [
    '# Design Gate Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Status: ${report.status}`,
    `- Assurance gate summary: ${report.assuranceGateSummary ?? 'not-retained'}`
  ];

  if (report.nextFocus) {
    lines.push(`- Next focus: ${report.nextFocus}`);
  }

  lines.push(
    '',
    '| Step | Status | Duration (ms) |',
    '| --- | --- | ---: |'
  );

  for (const step of report.steps) {
    lines.push(
      `| ${step.id} | ${step.exitCode === 0 ? 'pass' : 'fail'} | ${step.durationMs} |`
    );
  }

  lines.push('', '## Coverage Focus', '');

  if (report.coverageFocus && report.coverageFocus.length > 0) {
    lines.push('| Source file | Line coverage | Covered/Total |');
    lines.push('| --- | ---: | ---: |');

    for (const entry of report.coverageFocus) {
      lines.push(
        `| ${entry.relativePath} | ${entry.linesPct.toFixed(1)}% | ${entry.linesCovered}/${entry.linesTotal} |`
      );
    }
  } else {
    lines.push(
      `- Coverage focus unavailable: ${
        report.coverageFocusUnavailableReason ?? 'coverage-summary-missing'
      }`
    );
  }

  return `${lines.join('\n')}\n`;
}
