import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { maybeRejectGovernedProofLegacyEntrypointAsMain } from './governedProofLegacyEntrypoint';
import {
  cleanupWindowsHostRuntimeSurface,
  inspectWindowsHostRuntimeSurface,
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
const WINDOWS_HOST_MATRIX_OBSERVATION_POLL_INTERVAL_MS = 250;
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
export type WindowsHostOperationMatrixOperation =
  | (typeof REQUIRED_INSTALLED_OPERATIONS)[number]
  | (typeof REPO_SUPPLIED_ADDITIONAL_OPERATIONS)[number];

type MatrixSelectionOperation = WindowsHostOperationMatrixOperation | 'all';
type MatrixSelectionBitness = WindowsHostOperationMatrixBitness | 'all';
type MatrixExecutionMode = 'help' | 'run' | 'gated';

export interface WindowsHostOperationMatrixCliArgs {
  helpRequested: boolean;
  operation: MatrixSelectionOperation;
  bitness: MatrixSelectionBitness;
  labviewCliPath: string;
  x86LabviewExePath: string;
  x64LabviewExePath: string;
  additionalOperationDirectory: string;
}

export interface WindowsHostOperationMatrixCase {
  operation: WindowsHostOperationMatrixOperation;
  bitness: WindowsHostOperationMatrixBitness;
  labviewExePath: string;
  executionMode: MatrixExecutionMode;
  blockedReason?: string;
  args?: string[];
}

export interface WindowsHostOperationMatrixCaseResult {
  operation: WindowsHostOperationMatrixOperation;
  bitness: WindowsHostOperationMatrixBitness;
  labviewExePath: string;
  executionMode: MatrixExecutionMode;
  status: 'succeeded' | 'failed' | 'blocked' | 'gated';
  blockedReason?: string;
  exitCode?: number;
  stdoutFilePath?: string;
  stderrFilePath?: string;
  commandArgs?: string[];
  preRunObservation: WindowsHostRuntimeSurfaceSnapshot;
  preRunCleanupApplied: boolean;
  postPreRunCleanupObservation?: WindowsHostRuntimeSurfaceSnapshot;
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

export interface WindowsHostOperationMatrixCliDeps {
  repoRoot?: string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  nowIso?: () => string;
  stdout?: { write(text: string): void };
  inspectRuntimeSurface?: () => Promise<WindowsHostRuntimeSurfaceSnapshot>;
  cleanupRuntimeSurface?: () => Promise<void>;
  listInstalledOperations?: (operationsDirectory: string) => Promise<string[]>;
  runLabviewCliCommand?: (
    cliPath: string,
    args: string[]
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

interface WindowsBackgroundCommandLaunch {
  wrapperPid: number;
  stdoutPath: string;
  stderrPath: string;
  exitCodePath: string;
}

export function getWindowsHostOperationMatrixUsage(): string {
  return [
    'Usage: runWindowsHostOperationMatrix [--operation <name|all>] [--bitness <x86|x64|all>] [--labview-cli-path <path>] [--x86-labview-exe-path <path>] [--x64-labview-exe-path <path>] [--additional-operation-directory <path>] [--help]',
    '',
    'Defaults:',
    '  --operation all',
    '  --bitness all',
    `  --labview-cli-path ${DEFAULT_WINDOWS_LABVIEW_CLI_PATH}`,
    `  --x86-labview-exe-path ${DEFAULT_WINDOWS_LABVIEW_2026_X86_PATH}`,
    `  --x64-labview-exe-path ${DEFAULT_WINDOWS_LABVIEW_2026_X64_PATH}`,
    '  --additional-operation-directory ../linuxContainerDemo/VICompareTooling',
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
  let labviewCliPath = DEFAULT_WINDOWS_LABVIEW_CLI_PATH;
  let x86LabviewExePath = DEFAULT_WINDOWS_LABVIEW_2026_X86_PATH;
  let x64LabviewExePath = DEFAULT_WINDOWS_LABVIEW_2026_X64_PATH;
  let additionalOperationDirectory = path.resolve(repoRoot, '..', 'linuxContainerDemo', 'VICompareTooling');

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
  const bitnesses = args.bitness === 'all' ? (['x86', 'x64'] as const) : [args.bitness];
  const additionalOperationDirectoryWindowsPath = toWindowsPath(args.additionalOperationDirectory);

  return bitnesses.flatMap((bitness) =>
    operations.map<WindowsHostOperationMatrixCase>((operation) => {
      const labviewExePath =
        bitness === 'x86' ? args.x86LabviewExePath.trim() : args.x64LabviewExePath.trim();

      if (!labviewExePath) {
        return {
          operation,
          bitness,
          labviewExePath,
          executionMode: 'gated',
          blockedReason: `missing-labview-${bitness}-path`
        };
      }

      if (operation === 'CreateComparisonReport') {
        return {
          operation,
          bitness,
          labviewExePath,
          executionMode: 'gated',
          blockedReason: 'createcomparisonreport-deferred-until-prerequisite-operations-complete'
        };
      }

      if (operation === 'CloseLabVIEW') {
        return {
          operation,
          bitness,
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
        labviewExePath,
        executionMode: 'help',
        args: ['-OperationName', operation, '-LabVIEWPath', labviewExePath, '-Help']
      };
    })
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
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const inspectRuntimeSurface = deps.inspectRuntimeSurface ?? (() => inspectWindowsHostRuntimeSurface());
  const cleanupRuntimeSurface = deps.cleanupRuntimeSurface ?? (() => cleanupWindowsHostRuntimeSurface());
  const listInstalledOperations =
    deps.listInstalledOperations ?? defaultListInstalledLabviewCliOperations;
  const runLabviewCliCommand = deps.runLabviewCliCommand ?? defaultRunLabviewCliCommand;

  const runId = nowIso().replace(/[:.]/g, '-');
  const reportRoot = path.join(repoRoot, '.cache', 'governed-proof', 'windows-host-operation-matrix', runId);
  await mkdir(reportRoot, { recursive: true });

  const installedOperationsDirectory = deriveWindowsLabviewCliOperationsDirectory(args.labviewCliPath);
  const installedOperationsDiscovered = await listInstalledOperations(installedOperationsDirectory);
  const missingInstalledOperations = REQUIRED_INSTALLED_OPERATIONS.filter(
    (operation) => !installedOperationsDiscovered.includes(operation)
  );

  const results: WindowsHostOperationMatrixCaseResult[] = [];
  for (const testCase of buildWindowsHostOperationMatrixCases(args)) {
    const caseId = `${testCase.operation}-${testCase.bitness}`;
    const stdoutFilePath = path.join(reportRoot, `${caseId}.stdout.txt`);
    const stderrFilePath = path.join(reportRoot, `${caseId}.stderr.txt`);
    const preRunObservation = await inspectRuntimeSurface();
    let preRunCleanupApplied = false;
    let postPreRunCleanupObservation: WindowsHostRuntimeSurfaceSnapshot | undefined;
    let postRunCleanupApplied = false;

    if (preRunObservation.processes.length > 0) {
      await cleanupRuntimeSurface();
      preRunCleanupApplied = true;
      postPreRunCleanupObservation = await inspectRuntimeSurface();
      if (postPreRunCleanupObservation.processes.length > 0) {
        results.push({
          operation: testCase.operation,
          bitness: testCase.bitness,
          labviewExePath: testCase.labviewExePath,
          executionMode: testCase.executionMode,
          status: 'blocked',
          blockedReason: 'pre-run-runtime-surface-contaminated',
          preRunObservation,
          preRunCleanupApplied,
          postPreRunCleanupObservation,
          postRunCleanupApplied
        });
        continue;
      }
    }

    if (testCase.executionMode === 'gated' || !testCase.args) {
      results.push({
        operation: testCase.operation,
        bitness: testCase.bitness,
        labviewExePath: testCase.labviewExePath,
        executionMode: testCase.executionMode,
        status: 'gated',
        blockedReason: testCase.blockedReason,
        preRunObservation,
        preRunCleanupApplied,
        postPreRunCleanupObservation,
        postRunCleanupApplied
      });
      continue;
    }

    const commandResult = await runLabviewCliCommand(args.labviewCliPath, testCase.args);
    await writeFile(stdoutFilePath, commandResult.stdout, 'utf8');
    await writeFile(stderrFilePath, commandResult.stderr, 'utf8');

    const postRunObservation = await inspectRuntimeSurface();
    let postRunCleanupObservation: WindowsHostRuntimeSurfaceSnapshot | undefined;
    let status: WindowsHostOperationMatrixCaseResult['status'] =
      commandResult.exitCode === 0 ? 'succeeded' : 'failed';
    let blockedReason: string | undefined = undefined;
    if (postRunObservation.processes.length > 0) {
      await cleanupRuntimeSurface();
      postRunCleanupApplied = true;
      postRunCleanupObservation = await inspectRuntimeSurface();
      status = 'failed';
      blockedReason = 'post-run-runtime-surface-contaminated';
    }

    results.push({
      operation: testCase.operation,
      bitness: testCase.bitness,
      labviewExePath: testCase.labviewExePath,
      executionMode: testCase.executionMode,
      status,
      blockedReason,
      exitCode: commandResult.exitCode,
      stdoutFilePath,
      stderrFilePath,
      commandArgs: testCase.args,
      preRunObservation,
      preRunCleanupApplied,
      postPreRunCleanupObservation,
      postRunObservation,
      postRunCleanupApplied,
      postRunCleanupObservation
    });
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

  const reportJsonPath = path.join(reportRoot, 'host-operation-matrix.json');
  const reportMarkdownPath = path.join(reportRoot, 'host-operation-matrix.md');
  const latestReportPath = path.join(repoRoot, '.cache', 'governed-proof', 'windows-host-operation-matrix', 'latest-run.json');
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
  const launch = await launchWindowsBackgroundLabviewCliCommand(cliPath, args);
  const completion = await observeWindowsBackgroundCommandCompletion(launch);
  const stdout = await readWindowsTextFile(launch.stdoutPath);
  const stderr = await readWindowsTextFile(launch.stderrPath);

  if (!completion.completed) {
    try {
      await defaultExecWindowsPowershell(
        [
          `$wrapperPid = ${launch.wrapperPid}`,
          'if ($null -ne (Get-Process -Id $wrapperPid -ErrorAction SilentlyContinue)) {',
          '  Stop-Process -Id $wrapperPid -Force -ErrorAction SilentlyContinue',
          '}',
          'exit 0'
        ].join('; ')
      );
    } catch {
      // Preserve the observed failure even if the wrapper is already gone.
    }
  }

  try {
    await defaultExecWindowsPowershell(
      [
        `Remove-Item -Force -ErrorAction SilentlyContinue '${escapePowershellSingleQuotedString(launch.exitCodePath)}'`,
        'exit 0'
      ].join('; ')
    );
  } catch {
    // Exit-code sidecar cleanup is best-effort; it must not hide the retained case result.
  }

  return {
    exitCode: completion.completed ? completion.exitCode : -1,
    stdout,
    stderr: completion.completed
      ? stderr
      : [
          stderr.trim(),
          `Windows host operation matrix observation window expired after ${WINDOWS_HOST_MATRIX_OBSERVATION_WINDOW_MS} ms.`
        ]
          .filter(Boolean)
          .join('\n')
  };
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

async function launchWindowsBackgroundLabviewCliCommand(
  cliPath: string,
  args: string[]
): Promise<WindowsBackgroundCommandLaunch> {
  const argumentLiteral = args.map((argument) => `'${escapePowershellSingleQuotedString(argument)}'`).join(', ');
  const command = [
    '$stdoutPath = [System.IO.Path]::GetTempFileName()',
    '$stderrPath = [System.IO.Path]::GetTempFileName()',
    '$exitCodePath = [System.IO.Path]::GetTempFileName()',
    'Remove-Item -Force -ErrorAction SilentlyContinue $exitCodePath',
    `$argList = @(${argumentLiteral})`,
    `$inner = "& '${escapePowershellSingleQuotedString(cliPath)}' @argList 1> '$stdoutPath' 2> '$stderrPath'; Set-Content -Path '$exitCodePath' -Value $LASTEXITCODE"`,
    `$proc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-Command',$inner) -PassThru -WindowStyle Hidden`,
    '[ordered]@{ wrapperPid = $proc.Id; stdoutPath = $stdoutPath; stderrPath = $stderrPath; exitCodePath = $exitCodePath } | ConvertTo-Json -Compress'
  ].join('; ');
  const stdout = await defaultExecWindowsPowershell(command);
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Windows host operation matrix command did not retain a launch payload.');
  }

  const payload = JSON.parse(trimmed) as Partial<WindowsBackgroundCommandLaunch>;
  if (
    typeof payload.wrapperPid !== 'number' ||
    !payload.stdoutPath ||
    !payload.stderrPath ||
    !payload.exitCodePath
  ) {
    throw new Error('Windows host operation matrix launch payload was incomplete.');
  }

  return {
    wrapperPid: payload.wrapperPid,
    stdoutPath: payload.stdoutPath,
    stderrPath: payload.stderrPath,
    exitCodePath: payload.exitCodePath
  };
}

async function observeWindowsBackgroundCommandCompletion(
  launch: WindowsBackgroundCommandLaunch
): Promise<{ completed: boolean; exitCode: number }> {
  const deadline = Date.now() + WINDOWS_HOST_MATRIX_OBSERVATION_WINDOW_MS;
  while (Date.now() < deadline) {
    const stdout = await defaultExecWindowsPowershell(
      [
        `$wrapperPid = ${launch.wrapperPid}`,
        `$exitCodePath = '${escapePowershellSingleQuotedString(launch.exitCodePath)}'`,
        '$running = $null -ne (Get-Process -Id $wrapperPid -ErrorAction SilentlyContinue)',
        '$exitCodeReady = Test-Path $exitCodePath',
        '[ordered]@{ running = $running; exitCodeReady = $exitCodeReady } | ConvertTo-Json -Compress'
      ].join('; ')
    );
    const status = JSON.parse(stdout.trim()) as { running?: boolean; exitCodeReady?: boolean };
    if (status.exitCodeReady) {
      const exitCodeText = await readWindowsTextFile(launch.exitCodePath);
      const trimmed = exitCodeText.trim();
      return {
        completed: true,
        exitCode: trimmed ? Number(trimmed) : 0
      };
    }

    if (!status.running) {
      break;
    }

    await sleep(WINDOWS_HOST_MATRIX_OBSERVATION_POLL_INTERVAL_MS);
  }

  return {
    completed: false,
    exitCode: -1
  };
}

async function readWindowsTextFile(filePath: string): Promise<string> {
  const stdout = await defaultExecWindowsPowershell(
    [
      `$path = '${escapePowershellSingleQuotedString(filePath)}'`,
      'if (-not (Test-Path $path)) { "" } else {',
      '  $bytes = [System.IO.File]::ReadAllBytes($path)',
      '  if ($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) {',
      '    [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)',
      '  } elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {',
      '    [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)',
      '  } else {',
      '    [System.Text.Encoding]::UTF8.GetString($bytes)',
      '  }',
      '}'
    ].join('; ')
  );
  return stdout;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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
    '| Operation | Bitness | Mode | Status | Detail |',
    '| --- | --- | --- | --- | --- |'
  ];

  for (const result of report.results) {
    const detail =
      result.blockedReason ||
      (result.exitCode !== undefined ? `exit ${result.exitCode}` : '') ||
      (result.postRunCleanupApplied ? 'post-run cleanup applied' : '') ||
      'ok';
    lines.push(
      `| ${result.operation} | ${result.bitness} | ${result.executionMode} | ${result.status} | ${detail} |`
    );
  }

  return lines.join('\n');
}

maybeRunWindowsHostOperationMatrixCliAsMain();
