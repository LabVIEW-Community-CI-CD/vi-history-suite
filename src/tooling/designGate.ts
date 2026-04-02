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
  steps: DesignGateStepResult[];
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

export function renderDesignGateMarkdown(report: DesignGateReport): string {
  const lines = [
    '# Design Gate Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Status: ${report.status}`,
    `- Assurance gate summary: ${report.assuranceGateSummary ?? 'not-retained'}`,
    '',
    '| Step | Status | Duration (ms) |',
    '| --- | --- | ---: |'
  ];

  for (const step of report.steps) {
    lines.push(
      `| ${step.id} | ${step.exitCode === 0 ? 'pass' : 'fail'} | ${step.durationMs} |`
    );
  }

  return `${lines.join('\n')}\n`;
}
