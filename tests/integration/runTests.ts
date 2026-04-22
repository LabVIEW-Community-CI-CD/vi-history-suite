import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import * as path from 'node:path';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

import {
  assertLinuxVsCodeRuntimeReady,
  inspectIntegrationHostStrategy,
  resolveStandardWindowsCodeCliPath
} from '../../src/tooling/integrationHostRuntime';
import { stageExtensionForWindowsHost } from '../../src/tooling/integrationHostStage';
import { prepareIntegrationWorkspace } from './prepareTestWorkspace';

const WINDOWS_CODE_PATH = resolveStandardWindowsCodeCliPath();
const WINDOWS_SYSTEM_ROOT = process.platform === 'win32' ? 'C:\\Windows' : '/mnt/c/Windows';
const DEFAULT_WINDOWS_INTEGRATION_TEMP_ROOT =
  process.platform === 'win32'
    ? path.join(
        process.env.LOCALAPPDATA?.trim() || 'C:\\Users\\sveld\\AppData\\Local',
        'Temp',
        'vihs-integration-runtime'
      )
    : '/mnt/c/Users/sveld/AppData/Local/Temp/vihs-integration-runtime';

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const extensionTestsEntry = path.resolve(__dirname, 'suite', 'index.js');
  const windowsCodePath = WINDOWS_CODE_PATH;
  const hostStrategy = inspectIntegrationHostStrategy(windowsCodePath, process.env.VI_HISTORY_SUITE_INTEGRATION_HOST, {
    windowsCodeAlreadyRunning: isWindowsCodeAlreadyRunning
  });
  const useWindowsHost = hostStrategy.mode === 'windows';
  const integrationRuntimeRoot = await selectIntegrationRuntimeRoot(repoRoot, useWindowsHost);
  const windowsProfile = useWindowsHost
    ? buildWindowsIntegrationProfile(integrationRuntimeRoot)
    : undefined;

  const metadata = await prepareIntegrationWorkspace(
    path.join(integrationRuntimeRoot, 'workspace')
  );

  const launchArgs = [metadata.workspacePath, '--disable-workspace-trust'];
  let vscodeExecutablePath: string;
  let extensionDevelopmentPath = repoRoot;
  let extensionTestsPath = extensionTestsEntry;
  let testEnv: Record<string, string> = {
    ...buildDecisionRecordAutomationEnv(),
    ...buildIntegrationControlEnv()
  };
  let stagedExtensionRoot: string | undefined;

  try {
    if (useWindowsHost) {
      stagedExtensionRoot = await stageExtensionForWindowsHost(
        repoRoot,
        path.join(integrationRuntimeRoot, 'extension-host')
      );
      vscodeExecutablePath = windowsCodePath;
      extensionDevelopmentPath = toWindowsPath(stagedExtensionRoot);
      extensionTestsPath = toWindowsPath(
        path.join(stagedExtensionRoot, 'out-tests', 'tests', 'integration', 'suite', 'index.js')
      );
      process.chdir(WINDOWS_SYSTEM_ROOT);
      testEnv = {
        ...buildWindowsExtensionHostEnv(launchArgs[0], {
          appDataWindowsPath: windowsProfile!.windowsAppDataRoot
        }),
        ...buildDecisionRecordAutomationEnv(),
        ...buildIntegrationControlEnv()
      };
      launchArgs[0] = toWindowsPath(metadata.workspacePath);
      launchArgs.push(`--user-data-dir=${windowsProfile!.windowsUserDataDirectory}`);
      await writeRuntimeConfig(
        path.join(stagedExtensionRoot, 'out-tests', 'tests', 'integration', 'test-runtime.json'),
        {
          workspacePath: toWindowsPath(metadata.workspacePath),
          eligibleRelativePath: metadata.eligibleRelativePath,
          ineligibleRelativePath: metadata.ineligibleRelativePath
        }
      );
    } else {
      vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
      assertLinuxVsCodeRuntimeReady(vscodeExecutablePath);
      await writeRuntimeConfig(
        path.join(repoRoot, 'out-tests', 'tests', 'integration', 'test-runtime.json'),
        {
          workspacePath: metadata.workspacePath,
          eligibleRelativePath: metadata.eligibleRelativePath,
          ineligibleRelativePath: metadata.ineligibleRelativePath
        }
      );
    }

    if (useWindowsHost && process.platform === 'win32') {
      await runNativeWindowsVsCodeTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs,
        extensionTestsEnv: testEnv
      });
    } else {
      await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs,
        extensionTestsEnv: testEnv
      });
    }
  } finally {
    await fs.rm(metadata.workspacePath, { recursive: true, force: true });
    if (stagedExtensionRoot) {
      await fs.rm(stagedExtensionRoot, { recursive: true, force: true });
    }
    if (windowsProfile) {
      await cleanupDirectoryBestEffort(windowsProfile.linuxProfileRoot);
    }
  }
}

async function runNativeWindowsVsCodeTests(options: {
  vscodeExecutablePath: string;
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
  launchArgs: string[];
  extensionTestsEnv: Record<string, string>;
}): Promise<void> {
  const args = [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    `--extensionTestsPath=${options.extensionTestsPath}`,
    `--extensionDevelopmentPath=${options.extensionDevelopmentPath}`,
    ...options.launchArgs
  ];
  const environment = {
    ...process.env,
    ...options.extensionTestsEnv
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodePowerShellCommand(buildWindowsCodeInvocationScript(options.vscodeExecutablePath, args))
      ],
      {
      cwd: WINDOWS_SYSTEM_ROOT,
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Windows integration host failed with code ${String(code ?? 'unknown')}.`));
    });
  });
}

function buildWindowsCodeInvocationScript(command: string, args: string[]): string {
  const escapedCommand = command.replace(/'/g, "''");
  const escapedArgs = args.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  return [
    "$ErrorActionPreference = 'Stop'",
    `$code = '${escapedCommand}'`,
    `$arguments = @(${escapedArgs})`,
    '& $code @arguments',
    'exit $LASTEXITCODE'
  ].join('\n');
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function buildDecisionRecordAutomationEnv(): Record<string, string> {
  return {
    VI_HISTORY_SUITE_DECISION_REVIEWER: 'Integration Reviewer',
    VI_HISTORY_SUITE_DECISION_QUESTION:
      'Does the retained dashboard evidence support a bounded extension-host decision?',
    VI_HISTORY_SUITE_DECISION_OUTCOME: 'needs-more-review',
    VI_HISTORY_SUITE_DECISION_CONFIDENCE: 'medium',
    VI_HISTORY_SUITE_DECISION_RATIONALE:
      'Integration automation uses a stable bounded rationale to avoid UI prompts during the extension-host lane.'
  };
}

function buildIntegrationControlEnv(): Record<string, string> {
  const controlEnv: Record<string, string> = {
    VI_HISTORY_SUITE_DISABLE_PERSISTENT_USER_PATH_ADMISSION: '1'
  };
  const proofOutputDirectory = (
    process.env.VI_HISTORY_SUITE_RUNTIME_SETTINGS_LIVE_SESSION_PROOF_OUTPUT_DIR ?? ''
  ).trim();
  if (proofOutputDirectory) {
    controlEnv.VI_HISTORY_SUITE_RUNTIME_SETTINGS_LIVE_SESSION_PROOF_OUTPUT_DIR =
      proofOutputDirectory;
  }

  return controlEnv;
}

void main().catch((error) => {
  console.error('Failed to run integration tests');
  console.error(error);
  process.exitCode = 1;
});

function toWindowsPath(value: string): string {
  if (value.startsWith('/mnt/') && value.length > 7) {
    const driveLetter = value[5].toUpperCase();
    const remainder = value.slice(7).replaceAll('/', '\\');
    return `${driveLetter}:\\${remainder}`;
  }

  if (value.startsWith('/')) {
    const distro = (process.env.WSL_DISTRO_NAME ?? 'Ubuntu').trim() || 'Ubuntu';
    return `\\\\wsl.localhost\\${distro}${value.replaceAll('/', '\\')}`;
  }

  return value;
}

function buildWindowsExtensionHostEnv(
  workspaceWindowsPath: string,
  options: { appDataWindowsPath?: string } = {}
): Record<string, string> {
  const environment = readWindowsEnvironment();
  const windowsPath = environment.Path ?? environment.PATH ?? '';
  const gitDirectory = resolveWindowsGitDirectory();
  const safeDirectoryEntries = buildWindowsSafeDirectoryEntries(workspaceWindowsPath);
  const withSafeDirectory = appendGitConfigEntries(
    environment,
    safeDirectoryEntries.map((value) => ({ key: 'safe.directory', value }))
  );
  const withProfileOverrides =
    options.appDataWindowsPath && options.appDataWindowsPath.trim().length > 0
      ? {
          ...withSafeDirectory,
          APPDATA: options.appDataWindowsPath
        }
      : withSafeDirectory;
  if (!gitDirectory) {
    return withProfileOverrides;
  }

  const mergedPath = prependWindowsPathEntry(windowsPath, gitDirectory);
  return {
    ...withProfileOverrides,
    PATH: mergedPath,
    Path: mergedPath
  };
}

function buildWindowsIntegrationProfile(integrationRuntimeRoot: string): {
  linuxProfileRoot: string;
  windowsAppDataRoot: string;
  windowsUserDataDirectory: string;
} {
  const runProfileId = `${Date.now().toString(16)}-${process.pid}`;
  const linuxProfileRoot = path.join(integrationRuntimeRoot, `windows-profile-${runProfileId}`);
  const linuxAppDataRoot = path.join(linuxProfileRoot, 'AppData', 'Roaming');
  const windowsAppDataRoot = toWindowsPath(linuxAppDataRoot);
  return {
    linuxProfileRoot,
    windowsAppDataRoot,
    windowsUserDataDirectory: path.win32.join(windowsAppDataRoot, 'Code')
  };
}

function isWindowsCodeAlreadyRunning(): boolean {
  try {
    const output = execFileSync(
      process.platform === 'win32'
        ? 'C:\\Windows\\System32\\tasklist.exe'
        : '/mnt/c/Windows/System32/tasklist.exe',
      ['/FI', 'IMAGENAME eq Code.exe', '/NH'],
      {
        encoding: 'utf8',
        cwd: WINDOWS_SYSTEM_ROOT
      }
    ).replace(/\r/g, '');
    return output
      .split('\n')
      .map((line) => line.trim())
      .some((line) => /^Code\.exe\s+/i.test(line));
  } catch {
    return false;
  }
}

function readWindowsEnvironment(): Record<string, string> {
  let output = '';
  try {
    output = execFileSync('cmd.exe', ['/d', '/s', '/c', 'set'], {
      encoding: 'utf8',
      cwd: WINDOWS_SYSTEM_ROOT
    }).replace(/\r/g, '');
  } catch {
    return {};
  }

  const environment: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (key.length > 0) {
      environment[key] = value;
    }
  }

  return environment;
}

function resolveWindowsGitDirectory(): string | undefined {
  let output = '';
  try {
    output = execFileSync('cmd.exe', ['/d', '/s', '/c', 'where git'], {
      encoding: 'utf8',
      cwd: WINDOWS_SYSTEM_ROOT
    });
  } catch {
    return undefined;
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith('\\git.exe'))
    ?.replace(/\\git\.exe$/i, '');
}

function prependWindowsPathEntry(windowsPath: string, entry: string): string {
  const existingEntries = windowsPath
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const normalizedEntry = entry.toLowerCase();

  if (existingEntries.some((value) => value.toLowerCase() === normalizedEntry)) {
    return existingEntries.join(';');
  }

  return [entry, ...existingEntries].join(';');
}

function buildWindowsSafeDirectoryEntries(workspaceWindowsPath: string): string[] {
  const values = new Set<string>();
  const trimmed = workspaceWindowsPath.trim();
  if (!trimmed) {
    return [];
  }

  values.add(trimmed);

  if (trimmed.startsWith('\\\\')) {
    values.add(trimmed.replaceAll('\\', '/'));
  }

  return [...values];
}

function appendGitConfigEntries(
  environment: Record<string, string>,
  entries: { key: string; value: string }[]
): Record<string, string> {
  if (entries.length === 0) {
    return environment;
  }

  const existingCount = Number.parseInt(environment.GIT_CONFIG_COUNT ?? '0', 10);
  const mergedEnvironment = { ...environment };
  let nextIndex = Number.isFinite(existingCount) ? existingCount : 0;

  for (const entry of entries) {
    mergedEnvironment[`GIT_CONFIG_KEY_${nextIndex}`] = entry.key;
    mergedEnvironment[`GIT_CONFIG_VALUE_${nextIndex}`] = entry.value;
    nextIndex += 1;
  }

  mergedEnvironment.GIT_CONFIG_COUNT = String(nextIndex);
  return mergedEnvironment;
}

async function selectIntegrationRuntimeRoot(
  repoRoot: string,
  useWindowsHost: boolean
): Promise<string> {
  const repoCacheRoot = path.join(repoRoot, '.cache', 'integration-runtime');
  if (!useWindowsHost) {
    await fs.mkdir(repoCacheRoot, { recursive: true });
    return repoCacheRoot;
  }

  const windowsTempRoot = DEFAULT_WINDOWS_INTEGRATION_TEMP_ROOT;
  if (await canWriteDirectory(windowsTempRoot)) {
    return windowsTempRoot;
  }

  await fs.mkdir(repoCacheRoot, { recursive: true });
  return repoCacheRoot;
}

async function canWriteDirectory(directoryPath: string): Promise<boolean> {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    const probePath = path.join(
      directoryPath,
      `.vihs-write-probe-${process.pid}-${Date.now().toString(16)}`
    );
    await fs.writeFile(probePath, 'ok');
    await fs.rm(probePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function cleanupDirectoryBestEffort(directoryPath: string): Promise<void> {
  const retryDelaysMs = [150, 300, 600, 1200];
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      await fs.rm(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetriableWindowsCleanupError(error) || attempt === retryDelaysMs.length) {
        process.stderr.write(
          `[integration-cleanup] warning: unable to remove ${directoryPath}: ${
            error instanceof Error ? error.message : String(error)
          }\n`
        );
        return;
      }
      await sleep(retryDelaysMs[attempt]);
    }
  }
}

function isRetriableWindowsCleanupError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function writeRuntimeConfig(
  destination: string,
  config: {
    workspacePath: string;
    eligibleRelativePath: string;
    ineligibleRelativePath: string;
  }
): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(config, null, 2));
}
