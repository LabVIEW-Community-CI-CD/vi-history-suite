import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export type LocalRuntimeSettingsCliBitness = 'x86' | 'x64';
export type LocalRuntimeSettingsCliProvider = 'host' | 'docker';

export interface LocalRuntimeSettingsCliArgs {
  helpRequested: boolean;
  provider?: LocalRuntimeSettingsCliProvider;
  labviewVersion?: string;
  labviewBitness?: LocalRuntimeSettingsCliBitness;
  settingsFilePath?: string;
}

export interface LocalRuntimeSettingsCliRunResult {
  outcome: 'help' | 'updated-settings';
  settingsFilePath?: string;
  provider?: LocalRuntimeSettingsCliProvider;
  labviewVersion?: string;
  labviewBitness?: LocalRuntimeSettingsCliBitness;
}

export interface MaterializedLocalRuntimeSettingsCli {
  rootDirectoryPath: string;
  javascriptLauncherPath: string;
  windowsLauncherPath: string;
  posixLauncherPath: string;
  modulePath: string;
  exampleCommand: string;
}

interface WritableStreamLike {
  write(text: string): unknown;
}

interface LocalRuntimeSettingsCliDeps {
  fs?: Pick<typeof fs, 'access' | 'chmod' | 'mkdir' | 'readFile' | 'writeFile'>;
  stdout?: WritableStreamLike;
  stderr?: WritableStreamLike;
  cwd?: () => string;
  homedir?: () => string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

const CLI_ROOT_DIRECTORY_NAME = 'local-runtime-settings-cli';
const JAVASCRIPT_LAUNCHER_NAME = 'run-local-runtime-settings-cli.js';
const WINDOWS_LAUNCHER_NAME = 'vihs-runtime-settings.cmd';
const POSIX_LAUNCHER_NAME = 'vihs-runtime-settings';

export function getLocalRuntimeSettingsCliUsage(): string {
  return [
    'Usage: vihs-runtime-settings --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]',
    '',
    'Options:',
    '  --provider         Required compare provider: host or docker',
    '  --labview-version  Required LabVIEW major version. Example: 2026',
    '  --labview-bitness Required LabVIEW bitness: x86 or x64',
    '  --settings-file   Optional explicit VS Code settings.json path',
    '  --help            Show this help text'
  ].join('\n');
}

export function parseLocalRuntimeSettingsCliArgs(argv: readonly string[]): LocalRuntimeSettingsCliArgs {
  const parsed: LocalRuntimeSettingsCliArgs = {
    helpRequested: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--help':
        parsed.helpRequested = true;
        break;
      case '--provider':
        parsed.provider = normalizeProvider(readRequiredArgValue(argv, argument, ++index));
        break;
      case '--labview-version':
        parsed.labviewVersion = readRequiredArgValue(argv, argument, ++index);
        break;
      case '--labview-bitness':
        parsed.labviewBitness = normalizeLabviewBitness(
          readRequiredArgValue(argv, argument, ++index)
        );
        break;
      case '--settings-file':
        parsed.settingsFilePath = readRequiredArgValue(argv, argument, ++index);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return parsed;
}

export function resolveDefaultVsCodeSettingsPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.win32.join(homedir(), 'AppData', 'Roaming');
    return path.win32.join(appData, 'Code', 'User', 'settings.json');
  }

  if (platform === 'linux') {
    const configHome = env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
    return path.join(configHome, 'Code', 'User', 'settings.json');
  }

  if (platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  }

  throw new Error(`Unsupported platform for VI History settings CLI: ${platform}`);
}

export function buildLocalRuntimeSettingsCliMaterialization(
  globalStoragePath: string,
  extensionPath: string
): MaterializedLocalRuntimeSettingsCli {
  const rootDirectoryPath = path.join(globalStoragePath, CLI_ROOT_DIRECTORY_NAME);
  const javascriptLauncherPath = path.join(rootDirectoryPath, JAVASCRIPT_LAUNCHER_NAME);
  const windowsLauncherPath = path.join(rootDirectoryPath, WINDOWS_LAUNCHER_NAME);
  const posixLauncherPath = path.join(rootDirectoryPath, POSIX_LAUNCHER_NAME);
  const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');

  return {
    rootDirectoryPath,
    javascriptLauncherPath,
    windowsLauncherPath,
    posixLauncherPath,
    modulePath,
    exampleCommand: `${POSIX_LAUNCHER_NAME} --provider host --labview-version 2026 --labview-bitness x64`
  };
}

export async function ensureLocalRuntimeSettingsCli(
  globalStoragePath: string,
  extensionPath: string,
  deps: LocalRuntimeSettingsCliDeps = {}
): Promise<MaterializedLocalRuntimeSettingsCli> {
  const fsApi = deps.fs ?? fs;
  const plan = buildLocalRuntimeSettingsCliMaterialization(globalStoragePath, extensionPath);

  await fsApi.access(plan.modulePath);
  await fsApi.mkdir(plan.rootDirectoryPath, { recursive: true });
  await fsApi.writeFile(
    plan.javascriptLauncherPath,
    renderJavascriptLauncher(plan.modulePath),
    'utf8'
  );
  await fsApi.writeFile(plan.windowsLauncherPath, renderWindowsLauncher(), 'utf8');
  await fsApi.writeFile(plan.posixLauncherPath, renderPosixLauncher(), 'utf8');
  await fsApi.chmod(plan.javascriptLauncherPath, 0o755);
  await fsApi.chmod(plan.posixLauncherPath, 0o755);

  return plan;
}

export async function runLocalRuntimeSettingsCli(
  argv: readonly string[],
  deps: LocalRuntimeSettingsCliDeps = {}
): Promise<LocalRuntimeSettingsCliRunResult> {
  const parsed = parseLocalRuntimeSettingsCliArgs(argv);

  if (parsed.helpRequested) {
    writeLine(deps.stdout ?? process.stdout, getLocalRuntimeSettingsCliUsage());
    return { outcome: 'help' };
  }

  if (!parsed.labviewVersion) {
    throw new Error('Missing required --labview-version.');
  }

  if (!parsed.provider) {
    throw new Error('Missing required --provider.');
  }

  if (!parsed.labviewBitness) {
    throw new Error('Missing required --labview-bitness.');
  }

  const settingsFilePath = resolveSettingsFilePath(parsed, deps);
  await writeVsCodeSettingsFile(
    settingsFilePath,
    parsed.provider,
    parsed.labviewVersion,
    parsed.labviewBitness,
    deps.fs ?? fs
  );

  writeLine(deps.stdout ?? process.stdout, `Updated ${settingsFilePath}`);
  writeLine(deps.stdout ?? process.stdout, `viHistorySuite.runtimeProvider=${parsed.provider}`);
  writeLine(
    deps.stdout ?? process.stdout,
    `viHistorySuite.labviewVersion=${parsed.labviewVersion}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `viHistorySuite.labviewBitness=${parsed.labviewBitness}`
  );

  return {
    outcome: 'updated-settings',
    settingsFilePath,
    provider: parsed.provider,
    labviewVersion: parsed.labviewVersion,
    labviewBitness: parsed.labviewBitness
  };
}

export async function runLocalRuntimeSettingsCliMain(
  argv: readonly string[],
  deps: LocalRuntimeSettingsCliDeps = {}
): Promise<number> {
  try {
    await runLocalRuntimeSettingsCli(argv, deps);
    return 0;
  } catch (error) {
    writeLine(deps.stderr ?? process.stderr, formatError(error));
    return 1;
  }
}

function readRequiredArgValue(argv: readonly string[], flag: string, index: number): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return trimmedValue;
}

function normalizeLabviewBitness(value: string): LocalRuntimeSettingsCliBitness {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'x86' || normalized === 'x64') {
    return normalized;
  }

  throw new Error(`Unsupported LabVIEW bitness: ${value}`);
}

function normalizeProvider(value: string): LocalRuntimeSettingsCliProvider {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'host' || normalized === 'docker') {
    return normalized;
  }

  throw new Error(`Unsupported compare provider: ${value}`);
}

function resolveSettingsFilePath(
  parsed: LocalRuntimeSettingsCliArgs,
  deps: LocalRuntimeSettingsCliDeps
): string {
  if (parsed.settingsFilePath) {
    const cwd = deps.cwd ?? process.cwd;
    return path.resolve(cwd(), parsed.settingsFilePath);
  }

  return resolveDefaultVsCodeSettingsPath(
    deps.platform ?? process.platform,
    deps.env ?? process.env,
    deps.homedir ?? os.homedir
  );
}

async function writeVsCodeSettingsFile(
  settingsFilePath: string,
  provider: LocalRuntimeSettingsCliProvider,
  labviewVersion: string,
  labviewBitness: LocalRuntimeSettingsCliBitness,
  fsApi: Pick<typeof fs, 'mkdir' | 'readFile' | 'writeFile'>
): Promise<void> {
  await fsApi.mkdir(path.dirname(settingsFilePath), { recursive: true });

  const existingSettings = await readExistingSettingsFile(settingsFilePath, fsApi);
  existingSettings['viHistorySuite.runtimeProvider'] = provider;
  existingSettings['viHistorySuite.labviewVersion'] = labviewVersion;
  existingSettings['viHistorySuite.labviewBitness'] = labviewBitness;

  await fsApi.writeFile(settingsFilePath, `${JSON.stringify(existingSettings, null, 2)}\n`, 'utf8');
}

async function readExistingSettingsFile(
  settingsFilePath: string,
  fsApi: Pick<typeof fs, 'readFile'>
): Promise<Record<string, unknown>> {
  try {
    const raw = await fsApi.readFile(settingsFilePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }

    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('VS Code settings.json must contain a JSON object.');
    }

    return { ...(parsed as Record<string, unknown>) };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse VS Code settings JSON at ${settingsFilePath}.`);
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function renderJavascriptLauncher(modulePath: string): string {
  return [
    '#!/usr/bin/env node',
    `const cli = require(${JSON.stringify(modulePath)});`,
    "void cli.runLocalRuntimeSettingsCliMain(process.argv.slice(2)).then((code) => {",
    '  process.exitCode = code;',
    '});',
    ''
  ].join('\n');
}

function renderWindowsLauncher(): string {
  return ['@echo off', 'set SCRIPT_DIR=%~dp0', 'node "%SCRIPT_DIR%run-local-runtime-settings-cli.js" %*', ''].join(
    '\r\n'
  );
}

function renderPosixLauncher(): string {
  return [
    '#!/usr/bin/env sh',
    'SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"',
    'node "$SCRIPT_DIR/run-local-runtime-settings-cli.js" "$@"',
    ''
  ].join('\n');
}

function writeLine(stream: WritableStreamLike, text: string): void {
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

if (require.main === module) {
  void runLocalRuntimeSettingsCliMain(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
