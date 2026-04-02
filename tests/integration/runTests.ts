import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

import { prepareIntegrationWorkspace } from './prepareTestWorkspace';

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const extensionTestsEntry = path.resolve(__dirname, 'suite', 'index.js');
  const windowsCodePath = '/mnt/c/Program Files/Microsoft VS Code/Code.exe';
  const hostStrategy = inspectIntegrationHostStrategy(windowsCodePath);
  if (hostStrategy.mode === 'skip') {
    console.log(`Skipping integration tests: ${hostStrategy.reason}`);
    return;
  }
  const useWindowsHost = hostStrategy.mode === 'windows';
  const integrationRuntimeRoot = await selectIntegrationRuntimeRoot(repoRoot, useWindowsHost);

  const metadata = await prepareIntegrationWorkspace(
    path.join(integrationRuntimeRoot, 'workspace')
  );

  const launchArgs = [metadata.workspacePath, '--disable-workspace-trust'];
  let vscodeExecutablePath: string;
  let extensionDevelopmentPath = repoRoot;
  let extensionTestsPath = extensionTestsEntry;
  let testEnv: Record<string, string> = {};
  let stagedExtensionRoot: string | undefined;

  try {
    if (useWindowsHost) {
      stagedExtensionRoot = await stageExtensionForWindows(
        repoRoot,
        path.join(integrationRuntimeRoot, 'extension-host')
      );
      vscodeExecutablePath = windowsCodePath;
      extensionDevelopmentPath = toWindowsPath(stagedExtensionRoot);
      extensionTestsPath = toWindowsPath(
        path.join(stagedExtensionRoot, 'out-tests', 'tests', 'integration', 'suite', 'index.js')
      );
      process.chdir('/mnt/c/Windows');
      testEnv = buildWindowsExtensionHostEnv(launchArgs[0]);
      launchArgs[0] = toWindowsPath(metadata.workspacePath);
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

function inspectIntegrationHostStrategy(
  windowsCodePath: string
): { mode: 'windows' | 'linux' | 'skip'; reason?: string } {
  if (!fsSync.existsSync(windowsCodePath)) {
    return { mode: 'linux' };
  }

  if (isWindowsCodeAlreadyRunning()) {
    return {
      mode: 'skip',
      reason: 'windows-vscode-instance-already-running'
    };
  }

  return { mode: 'windows' };
}

void main().catch((error) => {
  console.error('Failed to run integration tests');
  console.error(error);
  process.exitCode = 1;
});

function toWindowsPath(value: string): string {
  if (value.startsWith('/mnt/') && value.length > 6) {
    const driveLetter = value[5].toUpperCase();
    const remainder = value.slice(6).replaceAll('/', '\\');
    return `${driveLetter}:\\${remainder}`;
  }

  if (value.startsWith('/')) {
    const distro = (process.env.WSL_DISTRO_NAME ?? 'Ubuntu').trim() || 'Ubuntu';
    return `\\\\wsl.localhost\\${distro}${value.replaceAll('/', '\\')}`;
  }

  return value;
}

function buildWindowsExtensionHostEnv(
  workspaceWindowsPath: string
): Record<string, string> {
  const environment = readWindowsEnvironment();
  const windowsPath = environment.Path ?? environment.PATH ?? '';
  const gitDirectory = resolveWindowsGitDirectory();
  const safeDirectoryEntries = buildWindowsSafeDirectoryEntries(workspaceWindowsPath);
  const withSafeDirectory = appendGitConfigEntries(
    environment,
    safeDirectoryEntries.map((value) => ({ key: 'safe.directory', value }))
  );
  if (!gitDirectory) {
    return withSafeDirectory;
  }

  const mergedPath = prependWindowsPathEntry(windowsPath, gitDirectory);
  return {
    ...withSafeDirectory,
    PATH: mergedPath,
    Path: mergedPath
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

async function stageExtensionForWindows(repoRoot: string, baseDirectory: string): Promise<string> {
  await fs.mkdir(baseDirectory, { recursive: true });
  const stageRoot = await fs.mkdtemp(path.join(baseDirectory, 'vihs-ext-host-'));
  await copyRecursive(path.join(repoRoot, 'package.json'), path.join(stageRoot, 'package.json'));
  await copyRecursive(path.join(repoRoot, 'out'), path.join(stageRoot, 'out'));
  await copyRecursive(path.join(repoRoot, 'out-tests'), path.join(stageRoot, 'out-tests'));
  return stageRoot;
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

async function copyRecursive(source: string, destination: string): Promise<void> {
  const stats = await fs.stat(source);
  if (stats.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      await copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
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
