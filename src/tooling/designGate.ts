import * as fs from 'node:fs';
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

export function resolveDesignGateCommand(
  command: string,
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate)
): string {
  if (platform === 'win32') {
    if (command === 'npm') {
      return 'cmd.exe';
    }

    if (command === 'python3') {
      return resolveWindowsPythonCommand(environment, pathExists);
    }
  }

  return command;
}

export function resolveDesignGateArgs(
  command: string,
  args: string[],
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate)
): string[] {
  if (platform === 'win32' && command === 'npm') {
    return ['/d', '/s', '/c', ['npm', ...args].join(' ')];
  }

  if (platform === 'win32' && command === 'python3') {
    const resolvedCommand = resolveWindowsPythonCommand(environment, pathExists);
    return resolvedCommand === 'py' ? ['-3', ...args] : args;
  }

  return args;
}

export function getWindowsPythonExecutableCandidates(
  environment: NodeJS.ProcessEnv = process.env
): string[] {
  const candidates = new Set<string>();
  const versionDirectories = ['Python313', 'Python312', 'Python311', 'Python310', 'Python39'];
  const localAppData = environment.LocalAppData?.trim();
  const programRoots = [
    environment.ProgramW6432,
    environment.ProgramFiles,
    environment['ProgramFiles(x86)']
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  if (localAppData) {
    for (const versionDirectory of versionDirectories) {
      candidates.add(
        path.win32.join(localAppData, 'Programs', 'Python', versionDirectory, 'python.exe')
      );
    }
  }

  for (const programRoot of programRoots) {
    for (const versionDirectory of versionDirectories) {
      candidates.add(path.win32.join(programRoot, versionDirectory, 'python.exe'));
    }
  }

  return [...candidates];
}

export function resolveWindowsPythonCommand(
  environment: NodeJS.ProcessEnv = process.env,
  pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate)
): string {
  const explicit = environment.VI_HISTORY_SUITE_ASSURANCE_PYTHON?.trim();
  if (explicit) {
    return explicit;
  }

  for (const candidate of getWindowsPythonExecutableCandidates(environment)) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }

  return 'py';
}

function quotePosixShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function toWslMountedPath(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, '/');
  const driveMatch = /^([A-Za-z]):(.*)$/.exec(normalized);
  if (!driveMatch) {
    return normalized;
  }

  return `/mnt/${driveMatch[1].toLowerCase()}${driveMatch[2]}`;
}

function resolveWindowsWslExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate)
): string | null {
  const systemRoot = environment.SystemRoot?.trim() || 'C:\\Windows';
  const candidate = path.win32.join(systemRoot, 'System32', 'wsl.exe');
  return pathExists(candidate) ? candidate : null;
}

function resolveWindowsAssuranceDistro(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.VIHS_LINUX_ASSURANCE_DISTRO?.trim() || 'Ubuntu-24.04';
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
  const normalizedTargetPath = targetPath.replace(/\\/g, '/');
  return normalizedTargetPath.startsWith('/mnt/');
}

export function buildDesignGatePlan(
  repoRoot: string,
  _assuranceScriptPath = defaultAssuranceScriptPath(),
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate)
): DesignGateStepSpec[] {
  const integrationScript =
    platform === 'win32' ? 'test:integration:windows' : 'test:integration';

  return [
    {
      id: 'branch-governance-baseline',
      title: 'Branch governance baseline',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', 'branch:governance:assert'],
        platform,
        environment,
        pathExists
      )
    },
    {
      id: 'design-contract',
      title: 'Design contract',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', 'test:design-contract'],
        platform,
        environment,
        pathExists
      )
    },
    {
      id: 'unit-and-coverage',
      title: 'Unit tests and coverage',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs('npm', ['run', 'test'], platform, environment, pathExists)
    },
    {
      id: 'extension-host-integration',
      title: 'VS Code extension-host integration',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', integrationScript],
        platform,
        environment,
        pathExists
      )
    },
    {
      id: 'canonical-harness-smoke',
      title: 'Canonical harness smoke',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', 'proof:run', '--', 'smoke'],
        platform,
        environment,
        pathExists
      )
    },
    {
      id: 'documentation-continuous-integration',
      title: 'Documentation continuous integration',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', 'docs:ci:core'],
        platform,
        environment,
        pathExists
      )
    },
    {
      id: 'public-exact-pretag-proof',
      title: 'Public exact pre-tag proof',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', 'public:exact:pretag:proof'],
        platform,
        environment,
        pathExists
      ),
      timeoutMs: 300000
    },
    {
      id: 'standards-assurance',
      title: 'Standards assurance',
      command: resolveDesignGateCommand('npm', platform, environment, pathExists),
      args: resolveDesignGateArgs(
        'npm',
        ['run', 'assurance:release-gate'],
        platform,
        environment,
        pathExists
      ),
      timeoutMs: 300000
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
  const normalizedRepoRoot = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedRepoSrcRoot = `${normalizedRepoRoot}/src/`;

  return Object.entries(parsed)
    .filter(([key]) => {
      if (key === 'total') {
        return false;
      }

      return key.replace(/\\/g, '/').startsWith(normalizedRepoSrcRoot);
    })
    .map(([key, value]) => {
      const typedValue = value as {
        lines?: { covered?: number; total?: number; pct?: number };
      };
      const normalizedKey = key.replace(/\\/g, '/');
      const relativePath = normalizedKey.slice(normalizedRepoRoot.length + 1);
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
