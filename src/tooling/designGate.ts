import * as os from 'node:os';
import * as path from 'node:path';

export interface DesignGateStepSpec {
  id: string;
  title: string;
  command: string;
  args: string[];
  timeoutMs?: number;
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
  completionState?: 'running' | 'complete';
  pendingStepId?: string;
  pendingStepTitle?: string;
  assuranceGateSummary?: string;
  coverageFocus?: CoverageFocusEntry[];
  coverageFocusUnavailableReason?: string;
  nextFocus?: string;
  nextTranche?: string;
  nextTrancheUnavailableReason?: string;
  steps: DesignGateStepResult[];
}

export interface CoverageFocusEntry {
  relativePath: string;
  linesPct: number;
  linesCovered: number;
  linesTotal: number;
}

export interface DevelopmentQueueEntry {
  id: string;
  title: string;
  status: 'active' | 'queued' | 'done';
  source: string;
  summary: string;
}

export function assertCompletedPassingDesignGateReport(
  report: Pick<DesignGateReport, 'status' | 'completionState' | 'pendingStepId' | 'pendingStepTitle'>
): void {
  if (report.completionState && report.completionState !== 'complete') {
    const pendingSummary = report.pendingStepId
      ? `; pending step: ${report.pendingStepId}${
          report.pendingStepTitle ? ` (${report.pendingStepTitle})` : ''
        }`
      : '';
    throw new Error(`design gate report is still running${pendingSummary}`);
  }

  if (report.status !== 'pass') {
    throw new Error('design gate failed');
  }
}

export function defaultAssuranceScriptPath(): string {
  return defaultAssuranceScriptPathCandidates()[0];
}

export function defaultAssuranceScriptPathCandidates(
  homeDirectory = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const candidates = [
    env.VI_HISTORY_SUITE_ASSURANCE_SCRIPT?.trim(),
    env.CODEX_HOME?.trim()
      ? path.join(
          env.CODEX_HOME.trim(),
          'skills',
          'repo-standards-review',
          'scripts',
          'run_assurance.py'
        )
      : undefined,
    path.join(
      homeDirectory,
      '.codex',
      'skills',
      'repo-standards-review',
      'scripts',
      'run_assurance.py'
    ),
    '/mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py'
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.length > 0));

  return [...new Set(candidates)];
}

export function designGateAssuranceMirrorRoot(repoRoot: string): string {
  return path.join(designGateReportDirectory(repoRoot), 'assurance-skill', 'repo-standards-review');
}

export function designGateAssuranceMirrorScriptPath(repoRoot: string): string {
  return path.join(designGateAssuranceMirrorRoot(repoRoot), 'scripts', 'run_assurance.py');
}

export function isMountedWindowsPath(targetPath: string): boolean {
  return path.resolve(targetPath).startsWith('/mnt/');
}

export function buildDesignGatePlan(
  repoRoot: string,
  assuranceScriptPath = defaultAssuranceScriptPath()
): DesignGateStepSpec[] {
  return [
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
      id: 'standards-assurance',
      title: 'Standards assurance',
      command: 'python3',
      args: [assuranceScriptPath, repoRoot, '--profile', 'quick-triage'],
      timeoutMs: 180000
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

export function designGateDevelopmentQueuePath(repoRoot: string): string {
  return path.join(repoRoot, 'docs', 'product', 'development-queue.json');
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
    `- Completion: ${report.completionState ?? 'complete'}`,
    `- Assurance gate summary: ${report.assuranceGateSummary ?? 'not-retained'}`
  ];

  if (report.pendingStepId) {
    lines.push(
      `- Pending step: ${report.pendingStepId}${
        report.pendingStepTitle ? ` (${report.pendingStepTitle})` : ''
      }`
    );
  }

  if (report.nextFocus) {
    lines.push(`- Next focus: ${report.nextFocus}`);
  }

  if (report.nextTranche) {
    lines.push(`- Next tranche: ${report.nextTranche}`);
  } else if (report.nextTrancheUnavailableReason) {
    lines.push(`- Next tranche unavailable: ${report.nextTrancheUnavailableReason}`);
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

export function selectNextDevelopmentTranche(
  entries: DevelopmentQueueEntry[]
): DevelopmentQueueEntry | undefined {
  return entries.find((entry) => entry.status === 'active') ?? entries.find((entry) => entry.status === 'queued');
}
