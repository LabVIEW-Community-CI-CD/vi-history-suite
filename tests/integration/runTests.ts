import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

import {
  assertLinuxVsCodeRuntimeReady,
  inspectIntegrationHostStrategy
} from '../../src/tooling/integrationHostRuntime';
import { stageExtensionForWindowsHost } from '../../src/tooling/integrationHostStage';
import { prepareIntegrationWorkspace } from './prepareTestWorkspace';

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const extensionTestsEntry = path.resolve(__dirname, 'suite', 'index.js');
  const windowsCodePath = '/mnt/c/Program Files/Microsoft VS Code/Code.exe';
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
  let testEnv: Record<string, string> = buildDecisionRecordAutomationEnv();
  let stagedExtensionRoot: string | undefined;

  try {
    if (useWindowsHost) {
      await fs.rm(windowsProfile!.linuxProfileRoot, { recursive: true, force: true });
      stagedExtensionRoot = await stageExtensionForWindowsHost(
        repoRoot,
        path.join(integrationRuntimeRoot, 'extension-host')
      );
      vscodeExecutablePath = windowsCodePath;
      extensionDevelopmentPath = toWindowsPath(stagedExtensionRoot);
      extensionTestsPath = toWindowsPath(
        path.join(stagedExtensionRoot, 'out-tests', 'tests', 'integration', 'suite', 'index.js')
      );
      process.chdir('/mnt/c/Windows');
      testEnv = {
        ...buildWindowsExtensionHostEnv(launchArgs[0], {
          appDataWindowsPath: windowsProfile!.windowsAppDataRoot
        }),
        ...buildDecisionRecordAutomationEnv()
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

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
      extensionTestsEnv: testEnv
    });
  } finally {
    await fs.rm(metadata.workspacePath, { recursive: true, force: true });
    if (stagedExtensionRoot) {
      await fs.rm(stagedExtensionRoot, { recursive: true, force: true });
    }
  }
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
  const linuxProfileRoot = path.join(integrationRuntimeRoot, 'windows-profile');
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
      '/mnt/c/Windows/System32/tasklist.exe',
      ['/FI', 'IMAGENAME eq Code.exe', '/NH'],
      {
        encoding: 'utf8',
        cwd: '/mnt/c/Windows'
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
      cwd: '/mnt/c/Windows'
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
      cwd: '/mnt/c/Windows'
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

  const windowsTempRoot = '/mnt/c/Users/sveld/AppData/Local/Temp/vihs-integration-runtime';
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
