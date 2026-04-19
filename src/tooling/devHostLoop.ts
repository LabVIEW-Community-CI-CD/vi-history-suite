import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

import { runGit } from '../git/gitCli';

export interface ViHistoryDevHostCliArgs {
  workspacePath?: string;
  codePath?: string;
  stageExtension: boolean;
  prepareWorkspaceOnly: boolean;
  helpRequested: boolean;
}

export interface ViHistoryDevHostWorkspaceMetadata {
  workspacePath: string;
  eligibleRelativePath: string;
  ineligibleRelativePath: string;
  metadataPath: string;
}

export interface ViHistoryDevHostLaunchPlan {
  codeExecutablePath: string;
  runtimeRoot: string;
  workspacePath: string;
  windowsWorkspacePath: string;
  extensionDevelopmentPath: string;
  windowsExtensionDevelopmentPath: string;
  userDataDir: string;
  windowsUserDataDir: string;
  extensionsDir: string;
  windowsExtensionsDir: string;
  preparedFixtureWorkspace: boolean;
  extensionMode: 'direct' | 'staged';
  launchArgs: string[];
}

export interface PrepareViHistoryDevHostWorkspaceDeps {
  mkdir?: typeof fs.mkdir;
  rm?: typeof fs.rm;
  writeFile?: typeof fs.writeFile;
  gitRunner?: typeof runGit;
}

export interface StageViHistoryDevHostExtensionDeps {
  mkdir?: typeof fs.mkdir;
  rm?: typeof fs.rm;
  copyFile?: typeof fs.copyFile;
  readdir?: typeof fs.readdir;
  stat?: typeof fs.stat;
}

export interface LaunchViHistoryDevHostDeps {
  spawnImpl?: typeof spawn;
}

const DEFAULT_WINDOWS_CODE_PATH_CANDIDATES = [
  'C:\\Program Files\\Microsoft VS Code\\Code.exe',
  'C:\\Users\\sveld\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'
];
const DEFAULT_WINDOWS_RUNTIME_ROOT = 'C:\\Users\\sveld\\AppData\\Local\\Temp\\vihs-dev-host';

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

function normalizeDevHostLaunchPath(value: string): string {
  const trimmed = value.trim();
  if (usesExplicitWindowsPathStyle(trimmed)) {
    return path.win32.normalize(trimmed);
  }

  if (trimmed.startsWith('/mnt/') && trimmed.length > 7) {
    const driveLetter = trimmed[5].toUpperCase();
    const remainder = trimmed.slice(7).replaceAll('/', '\\');
    return path.win32.normalize(`${driveLetter}:\\${remainder}`);
  }

  if (usesExplicitPosixPathStyle(trimmed)) {
    return path.posix.normalize(trimmed);
  }

  return path.normalize(trimmed);
}

export function getViHistoryDevHostUsage(): string {
  return [
    'Usage: runDevHost [--workspace-path <path>] [--code-path <path>] [--stage-extension] [--prepare-workspace-only] [--help]',
    '',
    'Options:',
    '  --workspace-path <path>     Open the development host on an existing repo path instead of the prepared fixture workspace.',
    '  --code-path <path>          Override the Windows VS Code executable path.',
    '  --stage-extension           Copy package.json and out/ into a Windows-local stage directory before launch.',
    '  --prepare-workspace-only    Prepare the reusable dev-host fixture workspace and print its path without launching VS Code.',
    '  --help                      Print this help and exit without launching the dev host.'
  ].join('\n');
}

export function parseViHistoryDevHostArgs(argv: string[]): ViHistoryDevHostCliArgs {
  let workspacePath: string | undefined;
  let codePath: string | undefined;
  let stageExtension = false;
  let prepareWorkspaceOnly = false;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getViHistoryDevHostUsage()}`);
      }

      index += 1;
      return candidate;
    };

    if (current === '--workspace-path') {
      workspacePath = requireValue('--workspace-path');
      continue;
    }

    if (current === '--code-path') {
      codePath = requireValue('--code-path');
      continue;
    }

    if (current === '--stage-extension') {
      stageExtension = true;
      continue;
    }

    if (current === '--prepare-workspace-only') {
      prepareWorkspaceOnly = true;
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getViHistoryDevHostUsage()}`);
  }

  return {
    workspacePath,
    codePath,
    stageExtension,
    prepareWorkspaceOnly,
    helpRequested
  };
}

export function toWindowsPath(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) {
    return path.win32.normalize(trimmed);
  }

  if (trimmed.startsWith('/mnt/') && trimmed.length > 7) {
    const driveLetter = trimmed[5].toUpperCase();
    const remainder = trimmed.slice(7).replaceAll('/', '\\');
    return path.win32.normalize(`${driveLetter}:\\${remainder}`);
  }

  if (trimmed.startsWith('/')) {
    throw new Error(
      `Unsupported non-Windows path for Windows dev-host execution: ${value}.`
    );
  }

  return path.win32.normalize(trimmed.replaceAll('/', '\\'));
}

export async function canWriteDirectory(directoryPath: string): Promise<boolean> {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    const probePath = joinPreservingExplicitPathStyle(
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

export async function resolveViHistoryDevHostRuntimeRoot(
  repoRoot: string,
  canWriteDirectoryImpl: (directoryPath: string) => Promise<boolean> = canWriteDirectory
): Promise<string> {
  if (await canWriteDirectoryImpl(DEFAULT_WINDOWS_RUNTIME_ROOT)) {
    return DEFAULT_WINDOWS_RUNTIME_ROOT;
  }

  const repoCacheRoot = joinPreservingExplicitPathStyle(repoRoot, '.cache', 'dev-host');
  await fs.mkdir(repoCacheRoot, { recursive: true });
  return repoCacheRoot;
}

export function resolveViHistoryCodeExecutablePath(codePath?: string): string {
  if (codePath) {
    if (!fsSync.existsSync(codePath)) {
      throw new Error(`VS Code executable not found at ${codePath}.`);
    }
    return codePath;
  }

  const discovered = DEFAULT_WINDOWS_CODE_PATH_CANDIDATES.find((candidate) =>
    fsSync.existsSync(candidate)
  );
  if (!discovered) {
    throw new Error(
      `Unable to locate Code.exe. Provide --code-path <path>.\n\n${getViHistoryDevHostUsage()}`
    );
  }

  return discovered;
}

export async function prepareViHistoryDevHostWorkspace(
  workspacePath: string,
  deps: PrepareViHistoryDevHostWorkspaceDeps = {}
): Promise<ViHistoryDevHostWorkspaceMetadata> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const rm = deps.rm ?? fs.rm;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const gitRunner = deps.gitRunner ?? runGit;

  await rm(workspacePath, { recursive: true, force: true });
  await mkdir(workspacePath, { recursive: true });

  const eligibleRelativePath = 'fixtures/eligible-dev-loop.vi';
  const ineligibleRelativePath = 'fixtures/ineligible-dev-loop.bin';

  await gitRunner(['init'], workspacePath);
  await gitRunner(['config', 'user.name', 'VI History Suite Dev Host'], workspacePath);
  await gitRunner(['config', 'user.email', 'vihs-dev-host@example.invalid'], workspacePath);

  await writeViFixture(writeFile, path.join(workspacePath, eligibleRelativePath), 'eligible-1');
  await writeViFixture(writeFile, path.join(workspacePath, ineligibleRelativePath), 'ineligible-1');
  await commitAll(gitRunner, workspacePath, 'Add initial dev-host fixtures');

  await writeViFixture(writeFile, path.join(workspacePath, eligibleRelativePath), 'eligible-2');
  await commitAll(gitRunner, workspacePath, 'Update dev-host eligible fixture');

  await writeViFixture(writeFile, path.join(workspacePath, eligibleRelativePath), 'eligible-3');
  await commitAll(gitRunner, workspacePath, 'Add third dev-host eligible fixture revision');

  await mkdir(path.join(workspacePath, '.vscode'), { recursive: true });
  await writeFile(
    path.join(workspacePath, '.vscode', 'settings.json'),
    JSON.stringify(
      {
        'viHistorySuite.labviewCliPath': path.join(
          workspacePath,
          '.vihs-missing-tools',
          'LabVIEWCLI.exe'
        ),
        'viHistorySuite.bitness': 'x86'
      },
      null,
      2
    ),
    'utf8'
  );

  const metadata = {
    workspacePath,
    eligibleRelativePath,
    ineligibleRelativePath,
    metadataPath: path.join(workspacePath, '.vihs-dev-host-meta.json')
  };
  await writeFile(metadata.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  return metadata;
}

export async function stageViHistoryDevHostExtension(
  repoRoot: string,
  stageRoot: string,
  deps: StageViHistoryDevHostExtensionDeps = {}
): Promise<string> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const rm = deps.rm ?? fs.rm;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const readdir = deps.readdir ?? fs.readdir;
  const stat = deps.stat ?? fs.stat;

  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await copyRecursive(path.join(repoRoot, 'package.json'), path.join(stageRoot, 'package.json'), {
    mkdir,
    copyFile,
    readdir,
    stat
  });
  await copyRecursive(path.join(repoRoot, 'out'), path.join(stageRoot, 'out'), {
    mkdir,
    copyFile,
    readdir,
    stat
  });
  return stageRoot;
}

export function buildViHistoryDevHostLaunchPlan(options: {
  codeExecutablePath: string;
  runtimeRoot: string;
  repoRoot: string;
  workspacePath: string;
  extensionDevelopmentPath: string;
  preparedFixtureWorkspace: boolean;
  extensionMode: 'direct' | 'staged';
}): ViHistoryDevHostLaunchPlan {
  const userDataDir = joinPreservingExplicitPathStyle(options.runtimeRoot, 'user-data');
  const extensionsDir = joinPreservingExplicitPathStyle(options.runtimeRoot, 'extensions');
  const windowsWorkspacePath = normalizeDevHostLaunchPath(options.workspacePath);
  const windowsExtensionDevelopmentPath = normalizeDevHostLaunchPath(
    options.extensionDevelopmentPath
  );
  const windowsUserDataDir = normalizeDevHostLaunchPath(userDataDir);
  const windowsExtensionsDir = normalizeDevHostLaunchPath(extensionsDir);
  const launchArgs = [
    '--new-window',
    '--disable-workspace-trust',
    `--user-data-dir=${windowsUserDataDir}`,
    `--extensions-dir=${windowsExtensionsDir}`,
    `--extensionDevelopmentPath=${windowsExtensionDevelopmentPath}`,
    windowsWorkspacePath
  ];

  return {
    codeExecutablePath: options.codeExecutablePath,
    runtimeRoot: options.runtimeRoot,
    workspacePath: options.workspacePath,
    windowsWorkspacePath,
    extensionDevelopmentPath: options.extensionDevelopmentPath,
    windowsExtensionDevelopmentPath,
    userDataDir,
    windowsUserDataDir,
    extensionsDir,
    windowsExtensionsDir,
    preparedFixtureWorkspace: options.preparedFixtureWorkspace,
    extensionMode: options.extensionMode,
    launchArgs
  };
}

export async function launchViHistoryDevHost(
  plan: ViHistoryDevHostLaunchPlan,
  deps: LaunchViHistoryDevHostDeps = {}
): Promise<void> {
  await fs.mkdir(plan.userDataDir, { recursive: true });
  await fs.mkdir(plan.extensionsDir, { recursive: true });

  const child = (deps.spawnImpl ?? spawn)(plan.codeExecutablePath, plan.launchArgs, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

export function formatViHistoryDevHostSummary(
  plan: ViHistoryDevHostLaunchPlan,
  workspaceMetadata?: ViHistoryDevHostWorkspaceMetadata
): string[] {
  const lines = [
    'Launched VI History Suite dev host',
    `Code: ${plan.codeExecutablePath}`,
    `Workspace: ${plan.workspacePath}`,
    `Extension mode: ${plan.extensionMode}`,
    `Extension path: ${plan.extensionDevelopmentPath}`,
    `User data dir: ${plan.userDataDir}`,
    `Extensions dir: ${plan.extensionsDir}`
  ];

  if (workspaceMetadata) {
    lines.push(
      `Eligible fixture: ${joinPreservingExplicitPathStyle(
        workspaceMetadata.workspacePath,
        workspaceMetadata.eligibleRelativePath
      )}`
    );
    lines.push(
      `Ineligible fixture: ${joinPreservingExplicitPathStyle(
        workspaceMetadata.workspacePath,
        workspaceMetadata.ineligibleRelativePath
      )}`
    );
  }

  lines.push('Next step: keep `npm run dev:watch` running, then use `Developer: Reload Window` inside the dev host after code changes.');
  return lines;
}

function normalizeBinaryFixture(payload: string): Buffer {
  return Buffer.concat([
    Buffer.from('RSRC\r\n\x00\x03', 'binary'),
    Buffer.from('LVIN', 'ascii'),
    Buffer.from(payload, 'utf8')
  ]);
}

async function writeViFixture(
  writeFile: typeof fs.writeFile,
  targetPath: string,
  payload: string
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, normalizeBinaryFixture(payload));
}

async function commitAll(
  gitRunner: typeof runGit,
  repoRoot: string,
  message: string
): Promise<void> {
  await gitRunner(['add', '.'], repoRoot);
  await gitRunner(['commit', '-m', message], repoRoot);
}

async function copyRecursive(
  source: string,
  destination: string,
  deps: {
    mkdir: typeof fs.mkdir;
    copyFile: typeof fs.copyFile;
    readdir: typeof fs.readdir;
    stat: typeof fs.stat;
  }
): Promise<void> {
  const stats = await deps.stat(source);
  if (stats.isDirectory()) {
    await deps.mkdir(destination, { recursive: true });
    for (const entry of await deps.readdir(source)) {
      await copyRecursive(path.join(source, entry), path.join(destination, entry), deps);
    }
    return;
  }

  await deps.mkdir(path.dirname(destination), { recursive: true });
  await deps.copyFile(source, destination);
}
