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
  const useWindowsHost = fsSync.existsSync(windowsCodePath);

  const metadata = await prepareIntegrationWorkspace(
    useWindowsHost ? '/mnt/c/Users/sveld/AppData/Local/Temp' : undefined
  );

  const launchArgs = [metadata.workspacePath, '--disable-workspace-trust'];
  let vscodeExecutablePath: string;
  let extensionDevelopmentPath = repoRoot;
  let extensionTestsPath = extensionTestsEntry;
  let testEnv: Record<string, string> = {};

  if (useWindowsHost) {
    const stagedExtensionRoot = await stageExtensionForWindows(repoRoot);
    vscodeExecutablePath = windowsCodePath;
    extensionDevelopmentPath = toWindowsPath(stagedExtensionRoot);
    extensionTestsPath = toWindowsPath(
      path.join(stagedExtensionRoot, 'out-tests', 'tests', 'integration', 'suite', 'index.js')
    );
    process.chdir('/mnt/c/Windows');
    testEnv = buildWindowsExtensionHostEnv();
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

  await fs.rm(metadata.workspacePath, { recursive: true, force: true });
}

void main().catch((error) => {
  console.error('Failed to run integration tests');
  console.error(error);
  process.exitCode = 1;
});

function toWindowsPath(value: string): string {
  return execFileSync('wslpath', ['-w', value], { encoding: 'utf8' }).trim();
}

function buildWindowsExtensionHostEnv(): Record<string, string> {
  const environment = readWindowsEnvironment();
  const windowsPath = environment.Path ?? environment.PATH ?? '';
  const gitDirectory = resolveWindowsGitDirectory();
  if (!gitDirectory) {
    return environment;
  }

  const mergedPath = prependWindowsPathEntry(windowsPath, gitDirectory);
  return {
    ...environment,
    PATH: mergedPath,
    Path: mergedPath
  };
}

function readWindowsEnvironment(): Record<string, string> {
  const output = execFileSync('cmd.exe', ['/d', '/s', '/c', 'set'], {
    encoding: 'utf8',
    cwd: '/mnt/c/Windows'
  }).replace(/\r/g, '');

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
  const output = execFileSync('cmd.exe', ['/d', '/s', '/c', 'where git'], {
    encoding: 'utf8',
    cwd: '/mnt/c/Windows'
  });
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

async function stageExtensionForWindows(repoRoot: string): Promise<string> {
  const stageRoot = await fs.mkdtemp('/mnt/c/Users/sveld/AppData/Local/Temp/vihs-ext-host-');
  await copyRecursive(path.join(repoRoot, 'package.json'), path.join(stageRoot, 'package.json'));
  await copyRecursive(path.join(repoRoot, 'out'), path.join(stageRoot, 'out'));
  await copyRecursive(path.join(repoRoot, 'out-tests'), path.join(stageRoot, 'out-tests'));
  return stageRoot;
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
