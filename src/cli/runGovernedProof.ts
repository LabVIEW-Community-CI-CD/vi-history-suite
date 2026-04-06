import {
  HarnessSmokeCliDeps,
  runHarnessSmokeCli
} from './runHarnessSmoke';
import {
  HarnessReportSmokeCliDeps,
  runHarnessReportSmokeCli
} from './runHarnessReportSmoke';
import {
  HarnessDashboardSmokeCliDeps,
  runHarnessDashboardSmokeCli
} from './runHarnessDashboardSmoke';
import {
  GitHubLinuxDashboardBenchmarkCliDeps,
  runGitHubLinuxDashboardBenchmarkCli
} from './runGitHubLinuxDashboardBenchmark';
import {
  GitHubWindowsDashboardBenchmarkCliDeps,
  runGitHubWindowsDashboardBenchmarkCli
} from './runGitHubWindowsDashboardBenchmark';
import {
  HarnessDecisionRecordCliDeps,
  runHarnessDecisionRecordCli
} from './runHarnessDecisionRecord';
import {
  runWindowsHostOperationMatrixCli,
  WindowsHostOperationMatrixCliDeps
} from './runWindowsHostOperationMatrix';

export type GovernedProofSubcommand =
  | 'smoke'
  | 'report-smoke'
  | 'dashboard-smoke'
  | 'benchmark-linux'
  | 'benchmark-windows'
  | 'decision-record'
  | 'host-operation-matrix';

export interface GovernedProofCommand {
  subcommand: GovernedProofSubcommand;
  args: string[];
}

export interface GovernedProofCliDeps {
  smokeDeps?: HarnessSmokeCliDeps;
  reportSmokeDeps?: HarnessReportSmokeCliDeps;
  dashboardSmokeDeps?: HarnessDashboardSmokeCliDeps;
  benchmarkLinuxDeps?: GitHubLinuxDashboardBenchmarkCliDeps;
  benchmarkWindowsDeps?: GitHubWindowsDashboardBenchmarkCliDeps;
  decisionRecordDeps?: HarnessDecisionRecordCliDeps;
  hostOperationMatrixDeps?: WindowsHostOperationMatrixCliDeps;
  stdout?: { write(text: string): void };
}

const SUBCOMMANDS: GovernedProofSubcommand[] = [
  'smoke',
  'report-smoke',
  'dashboard-smoke',
  'benchmark-linux',
  'benchmark-windows',
  'decision-record',
  'host-operation-matrix'
];

export function getGovernedProofUsage(): string {
  return [
    'Usage: runGovernedProof <subcommand> [subcommand options] [--help]',
    '',
    'Canonical proof subcommands:',
    '  smoke              Canonical harness smoke.',
    '  report-smoke       Canonical exact-pair comparison-report smoke.',
    '  dashboard-smoke    Canonical dashboard concentration smoke.',
    '  benchmark-linux    Governed Linux dashboard benchmark lane.',
    '  benchmark-windows  Governed Windows dashboard benchmark lane.',
    '  decision-record    Retained harness decision record.',
    '  host-operation-matrix Governed Windows LabVIEW 2026 host operation matrix.',
    '',
    'Canonical proof rules:',
    '  - one public proof entrypoint: runGovernedProof',
    '  - one canonical report engine: LabVIEWCLI CreateComparisonReport',
    '  - no public LVCompare engine or path override surface'
  ].join('\n');
}

export function parseGovernedProofCommand(argv: string[]): GovernedProofCommand | 'help' {
  const [candidateSubcommand, ...args] = argv;
  if (!candidateSubcommand || candidateSubcommand === '--help' || candidateSubcommand === '-h') {
    return 'help';
  }

  if (!SUBCOMMANDS.includes(candidateSubcommand as GovernedProofSubcommand)) {
    throw new Error(`Unknown governed proof subcommand: ${candidateSubcommand}\n\n${getGovernedProofUsage()}`);
  }

  return {
    subcommand: candidateSubcommand as GovernedProofSubcommand,
    args
  };
}

export async function runGovernedProofCli(
  argv: string[],
  deps: GovernedProofCliDeps = {}
): Promise<'pass' | 'help'> {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseGovernedProofCommand(argv);
  if (parsed === 'help') {
    stdout.write(`${getGovernedProofUsage()}\n`);
    return 'help';
  }

  switch (parsed.subcommand) {
    case 'smoke':
      return runHarnessSmokeCli(parsed.args, deps.smokeDeps);
    case 'report-smoke':
      return runHarnessReportSmokeCli(parsed.args, deps.reportSmokeDeps);
    case 'dashboard-smoke':
      return runHarnessDashboardSmokeCli(parsed.args, deps.dashboardSmokeDeps);
    case 'benchmark-linux':
      return runGitHubLinuxDashboardBenchmarkCli(parsed.args, deps.benchmarkLinuxDeps);
    case 'benchmark-windows':
      return runGitHubWindowsDashboardBenchmarkCli(parsed.args, deps.benchmarkWindowsDeps);
    case 'decision-record':
      return runHarnessDecisionRecordCli(parsed.args, deps.decisionRecordDeps);
    case 'host-operation-matrix':
      return runWindowsHostOperationMatrixCli(parsed.args, deps.hostOperationMatrixDeps);
  }
}

export async function runGovernedProofCliMain(
  argv: string[] = process.argv.slice(2),
  deps: GovernedProofCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runGovernedProofCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyGovernedProofCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunGovernedProofCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: GovernedProofCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void runGovernedProofCliMain(argv, deps, stderr).then((exitCode) => {
    applyGovernedProofCliExitCode(exitCode, processLike);
  });
  return true;
}

maybeRunGovernedProofCliAsMain();
