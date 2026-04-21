import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { maybeRejectGovernedProofLegacyEntrypointAsMain } from './governedProofLegacyEntrypoint';
import {
  appendLabviewCliPortNumberArg,
  resolveWindowsLabviewTcpSettingsForLabviewPath
} from '../reporting/comparisonReportRuntimeExecution';
import {
  cleanupWindowsHostRuntimeSurface,
  inspectWindowsHostRuntimeSurface,
  launchWindowsHeadlessLabview,
  WindowsHostRuntimeSurfaceSnapshot
} from './windowsHostRuntimeSurface';
import { toWindowsPath } from '../tooling/devHostLoop';

const DEFAULT_WINDOWS_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const DEFAULT_WINDOWS_LABVIEW_2026_X86_PATH =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const DEFAULT_WINDOWS_LABVIEW_2026_X64_PATH =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_HOST_MATRIX_OBSERVATION_WINDOW_MS = 15000;
const REQUIRED_INSTALLED_OPERATIONS = [
  'CloseLabVIEW',
  'CreateComparisonReport',
  'ExecuteBuildSpec',
  'MassCompile',
  'RunUnitTests',
  'RunVI',
  'RunVIAnalyzer'
] as const;
const REPO_SUPPLIED_ADDITIONAL_OPERATIONS = ['PrintToSingleFileHtml'] as const;

export type WindowsHostOperationMatrixBitness = 'x86' | 'x64';
export type WindowsHostOperationMatrixSessionState = 'cold' | 'warm-headless';
export type WindowsHostOperationMatrixOperation =
  | (typeof REQUIRED_INSTALLED_OPERATIONS)[number]
  | (typeof REPO_SUPPLIED_ADDITIONAL_OPERATIONS)[number];

type MatrixSelectionOperation = WindowsHostOperationMatrixOperation | 'all';
type MatrixSelectionBitness = WindowsHostOperationMatrixBitness | 'all';
type MatrixSelectionSessionState = WindowsHostOperationMatrixSessionState | 'all';
type MatrixExecutionMode = 'help' | 'run' | 'gated';

export interface WindowsHostOperationMatrixCliArgs {
  helpRequested: boolean;
  operation: MatrixSelectionOperation;
  bitness: MatrixSelectionBitness;
  sessionState: MatrixSelectionSessionState;
  labviewCliPath: string;
  x86LabviewExePath: string;
  x64LabviewExePath: string;
  additionalOperationDirectory: string;
}

export interface WindowsHostOperationMatrixCase {
  operation: WindowsHostOperationMatrixOperation;
  bitness: WindowsHostOperationMatrixBitness;
  sessionState: WindowsHostOperationMatrixSessionState;
  labviewExePath: string;
  executionMode: MatrixExecutionMode;
  blockedReason?: string;
  args?: string[];
}

export interface WindowsHostOperationMatrixCaseResult {
  operation: WindowsHostOperationMatrixOperation;
  bitness: WindowsHostOperationMatrixBitness;
  sessionState: WindowsHostOperationMatrixSessionState;
  labviewExePath: string;
  labviewIniPath?: string;
  labviewTcpPort?: number;
  tcpSettingsNotes?: string[];
  executionMode: MatrixExecutionMode;
  status: 'succeeded' | 'failed' | 'blocked' | 'gated';
  blockedReason?: string;
  cleanupFailureMessage?: string;
  exitCode?: number;
  stdoutFilePath?: string;
  stderrFilePath?: string;
  commandArgs?: string[];
  preRunObservation: WindowsHostRuntimeSurfaceSnapshot;
  preRunCleanupApplied: boolean;
  postPreRunCleanupObservation?: WindowsHostRuntimeSurfaceSnapshot;
  sessionPreparationObservation?: WindowsHostRuntimeSurfaceSnapshot;
  postRunObservation?: WindowsHostRuntimeSurfaceSnapshot;
  postRunCleanupApplied: boolean;
  postRunCleanupObservation?: WindowsHostRuntimeSurfaceSnapshot;
}

export interface WindowsHostOperationMatrixReport {
  generatedAt: string;
  repoRoot: string;
  labviewCliPath: string;
  x86LabviewExePath: string;
  x64LabviewExePath: string;
  installedOperationsDirectory: string;
  installedOperationsDiscovered: string[];
  installedOperationsRequired: string[];
  missingInstalledOperations: string[];
  additionalOperationsRequired: string[];
  results: WindowsHostOperationMatrixCaseResult[];
}

interface WindowsHostOperationMatrixTrancheGateState {
  gateX86OnPriorX64: boolean;
  x64TrancheFailed: boolean;
}

export interface WindowsHostOperationMatrixCliDeps {
  repoRoot?: string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  readFile?: typeof fs.readFile;
  pathExists?: (filePath: string) => Promise<boolean>;
  nowIso?: () => string;
  stdout?: { write(text: string): void };
  inspectRuntimeSurface?: () => Promise<WindowsHostRuntimeSurfaceSnapshot>;
  cleanupRuntimeSurface?: () => Promise<void>;
  launchHeadlessLabview?: (labviewExePath: string) => Promise<number>;
  listInstalledOperations?: (operationsDirectory: string) => Promise<string[]>;
  runLabviewCliCommand?: (
    cliPath: string,
    args: string[]
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export function getWindowsHostOperationMatrixUsage(): string {
  return [
    'Usage: runWindowsHostOperationMatrix [--operation <name|all>] [--bitness <x86|x64|all>] [--session-state <cold|warm-headless|all>] [--labview-cli-path <path>] [--x86-labview-exe-path <path>] [--x64-labview-exe-path <path>] [--additional-operation-directory <path>] [--help]',
    '',
    'Defaults:',
    '  --operation all',
    '  --bitness all',
    '  --session-state cold',
    `  --labview-cli-path ${DEFAULT_WINDOWS_LABVIEW_CLI_PATH}`,
    `  --x86-labview-exe-path ${DEFAULT_WINDOWS_LABVIEW_2026_X86_PATH}`,
    `  --x64-labview-exe-path ${DEFAULT_WINDOWS_LABVIEW_2026_X64_PATH}`,
    '  --additional-operation-directory ../labview-ci-cd/actions/VICompareTooling',
    '',
    'Governed matrix rules:',
    '  - LabVIEW 2026 host surfaces only',
    '  - one public proof entrypoint: runGovernedProof host-operation-matrix',
    '  - inspect pre-run and post-run contamination for LabVIEW, LabVIEWCLI, and LVCompare',
    '  - fail closed when an operation leaves the host surface hot',
    '  - defer CreateComparisonReport until prerequisite operations are complete'
  ].join('\n');
}

export function parseWindowsHostOperationMatrixArgs(
  argv: string[],
  repoRoot: string = path.resolve(__dirname, '..', '..')
): WindowsHostOperationMatrixCliArgs {
  let helpRequested = false;
  let operation: MatrixSelectionOperation = 'all';
  let bitness: MatrixSelectionBitness = 'all';
  let sessionState: MatrixSelectionSessionState = 'cold';
  let labviewCliPath = DEFAULT_WINDOWS_LABVIEW_CLI_PATH;
  let x86LabviewExePath = DEFAULT_WINDOWS_LABVIEW_2026_X86_PATH;
  let x64LabviewExePath = DEFAULT_WINDOWS_LABVIEW_2026_X64_PATH;
  let additionalOperationDirectory = resolvePreservingExplicitPathStyle(
    repoRoot,
    '..',
    'labview-ci-cd',
    'actions',
    'VICompareTooling'
  );

  const supportedOperations = new Set<MatrixSelectionOperation>([
    'all',
    ...REQUIRED_INSTALLED_OPERATIONS,
    ...REPO_SUPPLIED_ADDITIONAL_OPERATIONS
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getWindowsHostOperationMatrixUsage()}`);
      }

      index += 1;
      return candidate;
    };

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    if (current === '--operation') {
      const candidate = requireValue('--operation') as MatrixSelectionOperation;
      if (!supportedOperations.has(candidate)) {
        throw new Error(
          `Unsupported value for --operation: ${candidate}\n\n${getWindowsHostOperationMatrixUsage()}`
        );
      }

      operation = candidate;
      continue;
    }

    if (current === '--bitness') {
      const candidate = requireValue('--bitness') as MatrixSelectionBitness;
      if (candidate !== 'all' && candidate !== 'x86' && candidate !== 'x64') {
        throw new Error(
          `Unsupported value for --bitness: ${candidate}\n\n${getWindowsHostOperationMatrixUsage()}`
        );
      }

      bitness = candidate;
      continue;
    }

    if (current === '--session-state') {
      const candidate = requireValue('--session-state') as MatrixSelectionSessionState;
      if (candidate !== 'all' && candidate !== 'cold' && candidate !== 'warm-headless') {
        throw new Error(
          `Unsupported value for --session-state: ${candidate}\n\n${getWindowsHostOperationMatrixUsage()}`
        );
      }

      sessionState = candidate;
      continue;
    }

    if (current === '--labview-cli-path') {
      labviewCliPath = requireValue('--labview-cli-path');
      continue;
    }

    if (current === '--x86-labview-exe-path') {
      x86LabviewExePath = requireValue('--x86-labview-exe-path');
      continue;
    }

    if (current === '--x64-labview-exe-path') {
      x64LabviewExePath = requireValue('--x64-labview-exe-path');
      continue;
    }

    if (current === '--additional-operation-directory') {
      additionalOperationDirectory = requireValue('--additional-operation-directory');
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getWindowsHostOperationMatrixUsage()}`);
  }

  return {
    helpRequested,
    operation,
    bitness,
    sessionState,
    labviewCliPath,
    x86LabviewExePath,
    x64LabviewExePath,
    additionalOperationDirectory
  };
}

export function buildWindowsHostOperationMatrixCases(
  args: WindowsHostOperationMatrixCliArgs
): WindowsHostOperationMatrixCase[] {
  const operations =
    args.operation === 'all'
      ? [...REQUIRED_INSTALLED_OPERATIONS, ...REPO_SUPPLIED_ADDITIONAL_OPERATIONS]
      : [args.operation];
  const bitnesses = args.bitness === 'all' ? (['x64', 'x86'] as const) : [args.bitness];
  const sessionStates =
    args.sessionState === 'all' ? (['cold', 'warm-headless'] as const) : [args.sessionState];
  const additionalOperationDirectoryWindowsPath = toWindowsPath(args.additionalOperationDirectory);

  return sessionStates.flatMap((sessionState) =>
    bitnesses.flatMap((bitness) =>
      operations.map<WindowsHostOperationMatrixCase>((operation) => {
        const labviewExePath =
          bitness === 'x86' ? args.x86LabviewExePath.trim() : args.x64LabviewExePath.trim();

        if (!labviewExePath) {
          return {
            operation,
            bitness,
            sessionState,
            labviewExePath,
            executionMode: 'gated',
            blockedReason: `missing-labview-${bitness}-path`
          };
        }

        if (operation === 'CreateComparisonReport') {
          return {
            operation,
            bitness,
            sessionState,
            labviewExePath,
            executionMode: 'gated',
            blockedReason: 'createcomparisonreport-deferred-until-prerequisite-operations-complete'
          };
        }

        if (operation === 'CloseLabVIEW') {
          return {
            operation,
            bitness,
            sessionState,
            labviewExePath,
            executionMode: 'run',
            args: [
              '-LogToConsole',
              'TRUE',
              '-OperationName',
              operation,
              '-LabVIEWPath',
              labviewExePath,
              '-Headless'
            ]
          };
        }

        if (operation === 'PrintToSingleFileHtml') {
          return {
            operation,
            bitness,
            sessionState,
            labviewExePath,
            executionMode: 'help',
            args: [
              '-OperationName',
              operation,
              '-AdditionalOperationDirectory',
              additionalOperationDirectoryWindowsPath,
              '-LabVIEWPath',
              labviewExePath,
              '-Help'
            ]
          };
        }

        return {
          operation,
          bitness,
          sessionState,
          labviewExePath,
          executionMode: 'help',
          args: ['-OperationName', operation, '-LabVIEWPath', labviewExePath, '-Help']
        };
      })
    )
  );
}

export async function runWindowsHostOperationMatrixCli(
  argv: string[],
  deps: WindowsHostOperationMatrixCliDeps = {}
): Promise<'pass' | 'help'> {
  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const args = parseWindowsHostOperationMatrixArgs(argv, repoRoot);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getWindowsHostOperationMatrixUsage()}\n`);
    return 'help';
  }

  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const readFile = deps.readFile ?? fs.readFile;
  const pathExists =
    deps.pathExists ??
    (async (filePath: string) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const inspectRuntimeSurface = deps.inspectRuntimeSurface ?? (() => inspectWindowsHostRuntimeSurface());
  const cleanupRuntimeSurface = deps.cleanupRuntimeSurface ?? (() => cleanupWindowsHostRuntimeSurface());
  const launchHeadlessLabview =
    deps.launchHeadlessLabview ?? ((labviewExePath: string) => launchWindowsHeadlessLabview(labviewExePath));
  const listInstalledOperations =
    deps.listInstalledOperations ?? defaultListInstalledLabviewCliOperations;
  const runLabviewCliCommand = deps.runLabviewCliCommand ?? defaultRunLabviewCliCommand;

  const runId = nowIso().replace(/[:.]/g, '-');
  const reportRoot = joinPreservingExplicitPathStyle(
    repoRoot,
    '.cache',
    'governed-proof',
    'windows-host-operation-matrix',
    runId
  );
  await mkdir(reportRoot, { recursive: true });

  const installedOperationsDirectory = deriveWindowsLabviewCliOperationsDirectory(args.labviewCliPath);
  const additionalOperationDirectoryExists = await pathExists(args.additionalOperationDirectory);
  const installedOperationsDiscovered = await listInstalledOperations(installedOperationsDirectory);
  const missingInstalledOperations = REQUIRED_INSTALLED_OPERATIONS.filter(
    (operation) => !installedOperationsDiscovered.includes(operation)
  );

  const results: WindowsHostOperationMatrixCaseResult[] = [];
  const trancheGateState: WindowsHostOperationMatrixTrancheGateState = {
    gateX86OnPriorX64: args.bitness === 'all',
    x64TrancheFailed: false
  };
  for (const testCase of buildWindowsHostOperationMatrixCases(args)) {
    const caseId = `${testCase.operation}-${testCase.bitness}-${testCase.sessionState}`;
    const stdoutFilePath = joinPreservingExplicitPathStyle(reportRoot, `${caseId}.stdout.txt`);
    const stderrFilePath = joinPreservingExplicitPathStyle(reportRoot, `${caseId}.stderr.txt`);
    const preRunObservation = await inspectRuntimeSurface();
    let preRunCleanupApplied = false;
    let postPreRunCleanupObservation: WindowsHostRuntimeSurfaceSnapshot | undefined;
    let sessionPreparationObservation: WindowsHostRuntimeSurfaceSnapshot | undefined;
    let postRunCleanupApplied = false;
    const tcpSettings = await resolveWindowsLabviewTcpSettingsForLabviewPath(testCase.labviewExePath, {
      readFile,
      processPlatform: process.platform
    });
    const commandArgs = testCase.args
      ? appendLabviewCliPortNumberArg(testCase.args, tcpSettings.labviewTcpPort)
      : undefined;

    if (shouldGateX86CaseBehindX64Tranche(testCase, trancheGateState)) {
      results.push({
        operation: testCase.operation,
        bitness: testCase.bitness,
        sessionState: testCase.sessionState,
        labviewExePath: testCase.labviewExePath,
        labviewIniPath: tcpSettings.labviewIniPath,
        labviewTcpPort: tcpSettings.labviewTcpPort,
        tcpSettingsNotes: [
          ...tcpSettings.notes,
          'The x86 tranche stays gated until the earlier x64 tranche completes cleanly in the same governed matrix run.'
        ],
        executionMode: testCase.executionMode,
        status: 'gated',
        blockedReason: 'x64-tranche-did-not-complete-cleanly',
        preRunObservation,
        preRunCleanupApplied,
        postPreRunCleanupObservation,
        sessionPreparationObservation,
        postRunCleanupApplied
      });
      continue;
    }

    if (preRunObservation.processes.length > 0) {
      const cleanupAttempt = await attemptWindowsHostRuntimeSurfaceCleanup(
        cleanupRuntimeSurface,
        inspectRuntimeSurface
      );
      preRunCleanupApplied = cleanupAttempt.cleanupApplied;
      postPreRunCleanupObservation = cleanupAttempt.observation;
      if (
        cleanupAttempt.errorMessage ||
        (postPreRunCleanupObservation?.processes.length ?? 0) > 0
      ) {
        results.push({
          operation: testCase.operation,
          bitness: testCase.bitness,
          sessionState: testCase.sessionState,
          labviewExePath: testCase.labviewExePath,
          labviewIniPath: tcpSettings.labviewIniPath,
          labviewTcpPort: tcpSettings.labviewTcpPort,
          tcpSettingsNotes: tcpSettings.notes,
          executionMode: testCase.executionMode,
          status: 'blocked',
          blockedReason: cleanupAttempt.errorMessage
            ? 'pre-run-runtime-surface-cleanup-failed'
            : 'pre-run-runtime-surface-contaminated',
          cleanupFailureMessage: cleanupAttempt.errorMessage,
          preRunObservation,
          preRunCleanupApplied,
          postPreRunCleanupObservation,
          postRunCleanupApplied
        });
        updateTrancheGateState(testCase, 'blocked', trancheGateState);
        continue;
      }
    }

    if (testCase.executionMode === 'gated' || !testCase.args) {
      results.push({
        operation: testCase.operation,
        bitness: testCase.bitness,
        sessionState: testCase.sessionState,
        labviewExePath: testCase.labviewExePath,
        labviewIniPath: tcpSettings.labviewIniPath,
        labviewTcpPort: tcpSettings.labviewTcpPort,
        tcpSettingsNotes: tcpSettings.notes,
        executionMode: testCase.executionMode,
        status: 'gated',
        blockedReason: testCase.blockedReason,
        preRunObservation,
        preRunCleanupApplied,
        postPreRunCleanupObservation,
        sessionPreparationObservation,
        postRunCleanupApplied
      });
      updateTrancheGateState(testCase, 'gated', trancheGateState);
      continue;
    }

    if (testCase.operation === 'PrintToSingleFileHtml' && !additionalOperationDirectoryExists) {
      results.push({
        operation: testCase.operation,
        bitness: testCase.bitness,
        sessionState: testCase.sessionState,
        labviewExePath: testCase.labviewExePath,
        labviewIniPath: tcpSettings.labviewIniPath,
        labviewTcpPort: tcpSettings.labviewTcpPort,
        tcpSettingsNotes: [
          ...tcpSettings.notes,
          `Additional operation directory was not present at ${args.additionalOperationDirectory}.`
        ],
        executionMode: testCase.executionMode,
        status: 'blocked',
        blockedReason: 'missing-additional-operation-directory',
        preRunObservation,
        preRunCleanupApplied,
        postPreRunCleanupObservation,
        sessionPreparationObservation,
        postRunCleanupApplied
      });
      updateTrancheGateState(testCase, 'blocked', trancheGateState);
      continue;
    }

    if (testCase.sessionState === 'warm-headless') {
      await launchHeadlessLabview(testCase.labviewExePath);
      sessionPreparationObservation = await inspectRuntimeSurface();
      if (!isExpectedWarmHeadlessPreparationSurface(sessionPreparationObservation, testCase.labviewExePath)) {
        const cleanupAttempt = await attemptWindowsHostRuntimeSurfaceCleanup(
          cleanupRuntimeSurface,
          inspectRuntimeSurface
        );
        postRunCleanupApplied = cleanupAttempt.cleanupApplied;
        const postRunCleanupObservation = cleanupAttempt.observation;
        results.push({
          operation: testCase.operation,
          bitness: testCase.bitness,
          sessionState: testCase.sessionState,
          labviewExePath: testCase.labviewExePath,
          labviewIniPath: tcpSettings.labviewIniPath,
          labviewTcpPort: tcpSettings.labviewTcpPort,
          tcpSettingsNotes: tcpSettings.notes,
          executionMode: testCase.executionMode,
          status: 'blocked',
          blockedReason: 'warm-headless-prelaunch-did-not-retain-governed-labview-surface',
          cleanupFailureMessage: cleanupAttempt.errorMessage,
          preRunObservation,
          preRunCleanupApplied,
          postPreRunCleanupObservation,
          sessionPreparationObservation,
          postRunCleanupApplied,
          postRunCleanupObservation
        });
        updateTrancheGateState(testCase, 'blocked', trancheGateState);
        continue;
      }
    }

    const commandResult = await runLabviewCliCommand(args.labviewCliPath, commandArgs ?? testCase.args);
    await writeFile(stdoutFilePath, commandResult.stdout, 'utf8');
    await writeFile(stderrFilePath, commandResult.stderr, 'utf8');

    const postRunObservation = await inspectRuntimeSurface();
    let postRunCleanupObservation: WindowsHostRuntimeSurfaceSnapshot | undefined;
    let status: WindowsHostOperationMatrixCaseResult['status'] =
      commandResult.exitCode === 0 ? 'succeeded' : 'failed';
    let blockedReason: string | undefined = undefined;
    let cleanupFailureMessage: string | undefined = undefined;
    if (testCase.sessionState === 'warm-headless' && isExpectedWarmHeadlessPreparationSurface(postRunObservation, testCase.labviewExePath)) {
      const cleanupAttempt = await attemptWindowsHostRuntimeSurfaceCleanup(
        cleanupRuntimeSurface,
        inspectRuntimeSurface
      );
      postRunCleanupApplied = cleanupAttempt.cleanupApplied;
      postRunCleanupObservation = cleanupAttempt.observation;
      cleanupFailureMessage = cleanupAttempt.errorMessage;
      if (
        cleanupAttempt.errorMessage ||
        (postRunCleanupObservation?.processes.length ?? 0) > 0
      ) {
        status = 'failed';
        blockedReason = cleanupAttempt.errorMessage
          ? 'post-run-runtime-surface-cleanup-failed'
          : 'post-run-runtime-surface-contaminated';
      }
    } else if (postRunObservation.processes.length > 0) {
      const cleanupAttempt = await attemptWindowsHostRuntimeSurfaceCleanup(
        cleanupRuntimeSurface,
        inspectRuntimeSurface
      );
      postRunCleanupApplied = cleanupAttempt.cleanupApplied;
      postRunCleanupObservation = cleanupAttempt.observation;
      cleanupFailureMessage = cleanupAttempt.errorMessage;
      status = 'failed';
      blockedReason = cleanupAttempt.errorMessage
        ? 'post-run-runtime-surface-cleanup-failed'
        : 'post-run-runtime-surface-contaminated';
    }

    results.push({
      operation: testCase.operation,
      bitness: testCase.bitness,
      sessionState: testCase.sessionState,
      labviewExePath: testCase.labviewExePath,
      labviewIniPath: tcpSettings.labviewIniPath,
      labviewTcpPort: tcpSettings.labviewTcpPort,
      tcpSettingsNotes: tcpSettings.notes,
      executionMode: testCase.executionMode,
      status,
      blockedReason,
      cleanupFailureMessage,
      exitCode: commandResult.exitCode,
      stdoutFilePath,
      stderrFilePath,
      commandArgs,
      preRunObservation,
      preRunCleanupApplied,
      postPreRunCleanupObservation,
      sessionPreparationObservation,
      postRunObservation,
      postRunCleanupApplied,
      postRunCleanupObservation
    });
    updateTrancheGateState(testCase, status, trancheGateState);
  }

  const report: WindowsHostOperationMatrixReport = {
    generatedAt: nowIso(),
    repoRoot,
    labviewCliPath: args.labviewCliPath,
    x86LabviewExePath: args.x86LabviewExePath,
    x64LabviewExePath: args.x64LabviewExePath,
    installedOperationsDirectory,
    installedOperationsDiscovered,
    installedOperationsRequired: [...REQUIRED_INSTALLED_OPERATIONS],
    missingInstalledOperations,
    additionalOperationsRequired: [...REPO_SUPPLIED_ADDITIONAL_OPERATIONS],
    results
  };

  const reportJsonPath = joinPreservingExplicitPathStyle(reportRoot, 'host-operation-matrix.json');
  const reportMarkdownPath = joinPreservingExplicitPathStyle(
    reportRoot,
    'host-operation-matrix.md'
  );
  const latestReportPath = joinPreservingExplicitPathStyle(
    repoRoot,
    '.cache',
    'governed-proof',
    'windows-host-operation-matrix',
    'latest-run.json'
  );
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(reportMarkdownPath, `${renderWindowsHostOperationMatrixMarkdown(report)}\n`, 'utf8');
  await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  stdout.write(`Windows host operation matrix completed.\n`);
  stdout.write(`JSON: ${reportJsonPath}\n`);
  stdout.write(`Markdown: ${reportMarkdownPath}\n`);
  stdout.write(`Cases: ${report.results.length}\n`);
  stdout.write(`Failures or blocks: ${report.results.filter((result) => result.status !== 'succeeded').length}\n`);
  return 'pass';
}

export async function runWindowsHostOperationMatrixCliMain(
  argv: string[] = process.argv.slice(2),
  deps: WindowsHostOperationMatrixCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runWindowsHostOperationMatrixCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function maybeRunWindowsHostOperationMatrixCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  void argv;
  return maybeRejectGovernedProofLegacyEntrypointAsMain(
    'host-operation-matrix',
    mainModule,
    currentModule,
    processLike,
    stderr
  );
}

function deriveWindowsLabviewCliOperationsDirectory(labviewCliPath: string): string {
  const normalized = labviewCliPath.replaceAll('/', '\\').trim();
  return normalized.replace(/\\LabVIEWCLI\.exe$/i, '\\Operations');
}

function usesExplicitPosixPathStyle(rootPath: string): boolean {
  return rootPath.startsWith('/');
}

function usesExplicitWindowsPathStyle(rootPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(rootPath) || rootPath.startsWith('\\\\');
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (usesExplicitPosixPathStyle(rootPath)) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  if (usesExplicitWindowsPathStyle(rootPath)) {
    return path.win32.join(rootPath, ...segments.map((segment) => segment.replace(/\//g, '\\')));
  }

  return path.join(rootPath, ...segments);
}

function resolvePreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (usesExplicitPosixPathStyle(rootPath)) {
    return path.posix.resolve(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  if (usesExplicitWindowsPathStyle(rootPath)) {
    return path.win32.resolve(rootPath, ...segments.map((segment) => segment.replace(/\//g, '\\')));
  }

  return path.resolve(rootPath, ...segments);
}

async function defaultListInstalledLabviewCliOperations(operationsDirectory: string): Promise<string[]> {
  const stdout = await defaultExecWindowsPowershell(
    [
      `$dir = '${escapePowershellSingleQuotedString(operationsDirectory)}'`,
      '$items = @(Get-ChildItem -Path $dir -Directory -ErrorAction Stop | Select-Object -ExpandProperty Name)',
      'if ($items.Count -eq 0) { "[]" } else { $items | Sort-Object | ConvertTo-Json -Compress }'
    ].join('; ')
  );
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === '[]') {
    return [];
  }

  const parsed = JSON.parse(trimmed) as string[] | string;
  return (Array.isArray(parsed) ? parsed : [parsed]).map((value) => value.trim()).filter(Boolean);
}

async function defaultRunLabviewCliCommand(
  cliPath: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runWindowsForegroundLabviewCliCommand(cliPath, args);
}

async function defaultExecWindowsPowershell(command: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', command], (error, stdout = '', stderr = '') => {
      if (error) {
        reject(new Error(stderr.trim() || stdout.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

function escapePowershellSingleQuotedString(value: string): string {
  return value.replaceAll("'", "''");
}

export async function runWindowsForegroundLabviewCliCommand(
  cliPath: string,
  args: string[],
  deps: {
    spawnImpl?: typeof spawn;
    terminateProcessTree?: (pid: number) => Promise<void>;
    observationWindowMs?: number;
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const spawnImpl = deps.spawnImpl ?? spawn;
  const terminateProcessTree = deps.terminateProcessTree ?? terminateWindowsProcessTree;
  const observationWindowMs =
    deps.observationWindowMs ?? WINDOWS_HOST_MATRIX_OBSERVATION_WINDOW_MS;
  const argumentLiteral = args.map((argument) => `'${escapePowershellSingleQuotedString(argument)}'`).join(', ');
  const command = [
    `$argList = @(${argumentLiteral})`,
    `& '${escapePowershellSingleQuotedString(cliPath)}' @argList`
  ].join('; ');

  return new Promise((resolve, reject) => {
    const child = spawnImpl('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finalize = (result: { exitCode: number; stdout: string; stderr: string }) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      finalize({
        exitCode: typeof code === 'number' ? code : -1,
        stdout,
        stderr
      });
    });

    const timer = setTimeout(() => {
      void (async () => {
        if (typeof child.pid === 'number' && child.pid > 0) {
          try {
            await terminateProcessTree(child.pid);
          } catch {
            // Preserve the observed timeout even if process termination races with normal exit.
          }
        }

        finalize({
          exitCode: -1,
          stdout,
          stderr: [
            stderr.trim(),
            `Windows host operation matrix observation window expired after ${observationWindowMs} ms.`
          ]
            .filter(Boolean)
            .join('\n')
        });
      })();
    }, observationWindowMs);
  });
}

async function terminateWindowsProcessTree(pid: number): Promise<void> {
  await defaultExecWindowsPowershell(
    [
      `$targetPid = ${pid}`,
      'if ($null -ne (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) {',
      '  cmd.exe /c "taskkill /PID $targetPid /T /F >NUL 2>NUL" | Out-Null',
      '}',
      'exit 0'
    ].join('; ')
  );
}

function renderWindowsHostOperationMatrixMarkdown(report: WindowsHostOperationMatrixReport): string {
  const lines = [
    '# Windows Host Operation Matrix',
    '',
    `Generated: ${report.generatedAt}`,
    `LabVIEWCLI: ${report.labviewCliPath}`,
    `LabVIEW 2026 x86: ${report.x86LabviewExePath}`,
    `LabVIEW 2026 x64: ${report.x64LabviewExePath}`,
    `Installed operations directory: ${report.installedOperationsDirectory}`,
    `Installed operations discovered: ${report.installedOperationsDiscovered.join(', ') || 'none'}`,
    `Missing required installed operations: ${report.missingInstalledOperations.join(', ') || 'none'}`,
    `Additional operations required: ${report.additionalOperationsRequired.join(', ') || 'none'}`,
    '',
    '| Operation | Bitness | Session State | Mode | Status | Detail |',
    '| --- | --- | --- | --- | --- | --- |'
  ];

  for (const result of report.results) {
    const detail =
      [result.blockedReason, result.cleanupFailureMessage].filter(Boolean).join(': ') ||
      (result.exitCode !== undefined ? `exit ${result.exitCode}` : '') ||
      (result.postRunCleanupApplied ? 'post-run cleanup applied' : '') ||
      'ok';
    lines.push(
      `| ${result.operation} | ${result.bitness} | ${result.sessionState} | ${result.executionMode} | ${result.status} | ${detail} |`
    );
  }

  return lines.join('\n');
}

maybeRunWindowsHostOperationMatrixCliAsMain();

async function attemptWindowsHostRuntimeSurfaceCleanup(
  cleanupRuntimeSurface: () => Promise<void>,
  inspectRuntimeSurface: () => Promise<WindowsHostRuntimeSurfaceSnapshot>
): Promise<{
  cleanupApplied: true;
  observation: WindowsHostRuntimeSurfaceSnapshot;
  errorMessage?: string;
}> {
  let errorMessage: string | undefined;
  try {
    await cleanupRuntimeSurface();
  } catch (error) {
    errorMessage = formatMatrixError(error);
  }

  return {
    cleanupApplied: true,
    observation: await inspectRuntimeSurface(),
    errorMessage
  };
}

function isExpectedWarmHeadlessPreparationSurface(
  observation: WindowsHostRuntimeSurfaceSnapshot,
  labviewExePath: string
): boolean {
  return (
    observation.processes.length > 0 &&
    observation.processes.every(
      (process) => process.processName === 'LabVIEW' && normalizeWindowsPath(process.path) === normalizeWindowsPath(labviewExePath)
    )
  );
}

function normalizeWindowsPath(value: string | undefined): string | undefined {
  return value?.replaceAll('/', '\\').trim().toLowerCase();
}

function formatMatrixError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function shouldGateX86CaseBehindX64Tranche(
  testCase: WindowsHostOperationMatrixCase,
  gateState: WindowsHostOperationMatrixTrancheGateState
): boolean {
  return gateState.gateX86OnPriorX64 && testCase.bitness === 'x86' && gateState.x64TrancheFailed;
}

function updateTrancheGateState(
  testCase: WindowsHostOperationMatrixCase,
  status: WindowsHostOperationMatrixCaseResult['status'],
  gateState: WindowsHostOperationMatrixTrancheGateState
): void {
  if (!gateState.gateX86OnPriorX64 || testCase.bitness !== 'x64') {
    return;
  }

  if (status !== 'succeeded') {
    gateState.x64TrancheFailed = true;
  }
}
