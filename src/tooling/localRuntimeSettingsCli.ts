import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import {
  locateComparisonRuntime,
  type ComparisonRuntimeEngine,
  type ComparisonRuntimeLocatorDeps,
  type ComparisonRuntimeProvider,
  type RuntimePlatform,
  type ComparisonRuntimeSettings
} from '../reporting/comparisonRuntimeLocator';

export type LocalRuntimeSettingsCliBitness = 'x86' | 'x64';
export type LocalRuntimeSettingsCliProvider = 'host' | 'docker';

export interface LocalRuntimeSettingsCliArgs {
  helpRequested: boolean;
  validateRequested?: boolean;
  provider?: LocalRuntimeSettingsCliProvider;
  labviewVersion?: string;
  labviewBitness?: LocalRuntimeSettingsCliBitness;
  settingsFilePath?: string;
}

export interface LocalRuntimeSettingsCliRunResult {
  outcome: 'help' | 'updated-settings' | 'validated-settings';
  settingsFilePath?: string;
  provider?: LocalRuntimeSettingsCliProvider;
  labviewVersion?: string;
  labviewBitness?: LocalRuntimeSettingsCliBitness;
  persistedProvider?: string;
  persistedLabviewVersion?: string;
  persistedLabviewBitness?: string;
  runtimeValidationOutcome?: 'ready' | 'blocked';
  runtimeProvider?: ComparisonRuntimeProvider;
  runtimeEngine?: ComparisonRuntimeEngine;
  runtimeBlockedReason?: string;
}

export interface MaterializedLocalRuntimeSettingsCli {
  rootDirectoryPath: string;
  javascriptLauncherPath: string;
  windowsLauncherPath: string;
  posixLauncherPath: string;
  modulePath: string;
  exampleCommand: string;
}

export interface LocalRuntimeSettingsCliGovernanceContract {
  defaultSettingsFilePath: string;
  supportedSettingsTargets: readonly ['default-user-settings', 'explicit-settings-file'];
  untrustedWorkspacePosture: 'prepare-command-admitted-compare-blocked';
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
  locateRuntime?: typeof locateComparisonRuntime;
  runtimeLocatorDeps?: ComparisonRuntimeLocatorDeps;
}

const CLI_ROOT_DIRECTORY_NAME = 'local-runtime-settings-cli';
const JAVASCRIPT_LAUNCHER_NAME = 'run-local-runtime-settings-cli.js';
const WINDOWS_LAUNCHER_NAME = 'vihs-runtime-settings.cmd';
const POSIX_LAUNCHER_NAME = 'vihs-runtime-settings';
const MISSING_NODE_RUNTIME_MESSAGE =
  'VI History runtime-settings CLI requires a usable Node.js runtime on PATH. Install or restore Node.js, then rerun \"VI History: Prepare Local Runtime Settings CLI\" to refresh the launcher if this dependency changed.';
const STALE_LAUNCHER_MESSAGE =
  'VI History runtime-settings CLI launcher is stale or incomplete. Run \"VI History: Prepare Local Runtime Settings CLI\" again to refresh the generated launcher files.';

export function getLocalRuntimeSettingsCliUsage(): string {
  return [
    'Usage: vihs-runtime-settings --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]',
    '',
    'Options:',
    '  --provider         Required compare provider: host or docker',
    '  --labview-version  Required LabVIEW major version. Example: 2026',
    '  --labview-bitness Required LabVIEW bitness: x86 or x64',
    '  --settings-file   Optional explicit VS Code settings.json path',
    '  --validate        Report persisted provider/version/bitness facts plus bounded runtime validation for the governed settings target',
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
      case '--validate':
        parsed.validateRequested = true;
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

export function resolveLocalRuntimeSettingsCliGovernanceContract(
  deps: LocalRuntimeSettingsCliDeps = {}
): LocalRuntimeSettingsCliGovernanceContract {
  return {
    defaultSettingsFilePath: resolveDefaultVsCodeSettingsPath(
      deps.platform ?? process.platform,
      deps.env ?? process.env,
      deps.homedir ?? os.homedir
    ),
    supportedSettingsTargets: ['default-user-settings', 'explicit-settings-file'],
    untrustedWorkspacePosture: 'prepare-command-admitted-compare-blocked'
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

  if (parsed.validateRequested) {
    return validateLocalRuntimeSettingsCli(parsed, deps);
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
  writeLine(
    deps.stdout ?? process.stdout,
    'If VS Code is already running, reload or restart the window before trusting Compare or other runtime-provider surfaces to reflect the updated provider and runtime facts.'
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

async function validateLocalRuntimeSettingsCli(
  parsed: LocalRuntimeSettingsCliArgs,
  deps: LocalRuntimeSettingsCliDeps
): Promise<LocalRuntimeSettingsCliRunResult> {
  const settingsFilePath = resolveSettingsFilePath(parsed, deps);
  const settingsFacts = await readPersistedRuntimeSettingsFacts(settingsFilePath, deps.fs ?? fs);
  const locateRuntime = deps.locateRuntime ?? locateComparisonRuntime;
  const runtimeSelection = await locateRuntime(
    resolveCliRuntimePlatform(deps.platform ?? process.platform),
    settingsFacts.runtimeSettings,
    deps.runtimeLocatorDeps
  );
  const runtimeValidationOutcome =
    runtimeSelection.provider !== 'unavailable' && !runtimeSelection.blockedReason
      ? 'ready'
      : 'blocked';

  writeLine(deps.stdout ?? process.stdout, `Validated ${settingsFilePath}`);
  writeLine(
    deps.stdout ?? process.stdout,
    `viHistorySuite.runtimeProvider=${formatPersistedFact(settingsFacts.persistedProvider)}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `viHistorySuite.labviewVersion=${formatPersistedFact(settingsFacts.persistedLabviewVersion)}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `viHistorySuite.labviewBitness=${formatPersistedFact(settingsFacts.persistedLabviewBitness)}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `runtimeValidationOutcome=${runtimeValidationOutcome}`
  );
  writeLine(deps.stdout ?? process.stdout, `runtimeProvider=${runtimeSelection.provider}`);
  writeLine(
    deps.stdout ?? process.stdout,
    `runtimeEngine=${runtimeSelection.engine ?? '<none>'}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `runtimeBlockedReason=${runtimeSelection.blockedReason ?? '<none>'}`
  );

  return {
    outcome: 'validated-settings',
    settingsFilePath,
    persistedProvider: settingsFacts.persistedProvider,
    persistedLabviewVersion: settingsFacts.persistedLabviewVersion,
    persistedLabviewBitness: settingsFacts.persistedLabviewBitness,
    runtimeValidationOutcome,
    runtimeProvider: runtimeSelection.provider,
    runtimeEngine: runtimeSelection.engine,
    runtimeBlockedReason: runtimeSelection.blockedReason
  };
}

async function writeVsCodeSettingsFile(
  settingsFilePath: string,
  provider: LocalRuntimeSettingsCliProvider,
  labviewVersion: string,
  labviewBitness: LocalRuntimeSettingsCliBitness,
  fsApi: Pick<typeof fs, 'mkdir' | 'readFile' | 'writeFile'>
): Promise<void> {
  await fsApi.mkdir(path.dirname(settingsFilePath), { recursive: true });

  const existingSettingsText = await readExistingSettingsFileText(settingsFilePath, fsApi);
  const endOfLine = detectSettingsEndOfLine(existingSettingsText);
  let updatedSettingsText = normalizeSettingsJsoncText(existingSettingsText, settingsFilePath);

  updatedSettingsText = applySettingsJsoncEdit(
    updatedSettingsText,
    ['viHistorySuite.runtimeProvider'],
    provider,
    endOfLine
  );
  updatedSettingsText = applySettingsJsoncEdit(
    updatedSettingsText,
    ['viHistorySuite.labviewVersion'],
    labviewVersion,
    endOfLine
  );
  updatedSettingsText = applySettingsJsoncEdit(
    updatedSettingsText,
    ['viHistorySuite.labviewBitness'],
    labviewBitness,
    endOfLine
  );

  await fsApi.writeFile(
    settingsFilePath,
    ensureTerminalNewline(updatedSettingsText, endOfLine),
    'utf8'
  );
}

interface PersistedRuntimeSettingsFacts {
  persistedProvider?: string;
  persistedLabviewVersion?: string;
  persistedLabviewBitness?: string;
  runtimeSettings: ComparisonRuntimeSettings;
}

async function readPersistedRuntimeSettingsFacts(
  settingsFilePath: string,
  fsApi: Pick<typeof fs, 'readFile'>
): Promise<PersistedRuntimeSettingsFacts> {
  const existingSettingsText = await readExistingSettingsFileText(settingsFilePath, fsApi);
  const normalizedSettingsText = normalizeSettingsJsoncText(existingSettingsText, settingsFilePath);
  const parsed = parse(normalizedSettingsText, [], {
    allowTrailingComma: true,
    disallowComments: false
  }) as Record<string, unknown>;
  const persistedProvider = readTrimmedSettingsProperty(
    parsed,
    'viHistorySuite.runtimeProvider'
  );
  const persistedLabviewVersion = readTrimmedSettingsProperty(
    parsed,
    'viHistorySuite.labviewVersion'
  );
  const persistedLabviewBitness = readTrimmedSettingsProperty(
    parsed,
    'viHistorySuite.labviewBitness'
  );

  return {
    persistedProvider,
    persistedLabviewVersion,
    persistedLabviewBitness,
    runtimeSettings: {
      requestedProvider:
        persistedProvider === 'host' || persistedProvider === 'docker'
          ? persistedProvider
          : undefined,
      invalidRequestedProvider:
        persistedProvider && persistedProvider !== 'host' && persistedProvider !== 'docker'
          ? persistedProvider
          : undefined,
      requireVersionAndBitness: true,
      labviewVersion: persistedLabviewVersion,
      bitness:
        persistedLabviewBitness === 'x86' || persistedLabviewBitness === 'x64'
          ? persistedLabviewBitness
          : undefined
    }
  };
}

async function readExistingSettingsFileText(
  settingsFilePath: string,
  fsApi: Pick<typeof fs, 'readFile'>
): Promise<string | undefined> {
  try {
    return await fsApi.readFile(settingsFilePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

function normalizeSettingsJsoncText(
  existingSettingsText: string | undefined,
  settingsFilePath: string
): string {
  const candidateText = existingSettingsText?.trim() ? existingSettingsText : '{}';
  const parseErrors: ParseError[] = [];
  const parsed = parse(candidateText, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false
  }) as unknown;

  if (parseErrors.length > 0) {
    throw new Error(`Failed to parse VS Code settings JSONC at ${settingsFilePath}.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('VS Code settings.json must contain a JSON object.');
  }

  return candidateText;
}

function applySettingsJsoncEdit(
  settingsText: string,
  pathSegments: readonly string[],
  value: string,
  endOfLine: '\n' | '\r\n'
): string {
  const edits = modify(settingsText, [...pathSegments], value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: endOfLine
    }
  });
  return applyEdits(settingsText, edits);
}

function detectSettingsEndOfLine(existingSettingsText: string | undefined): '\n' | '\r\n' {
  if (existingSettingsText?.includes('\r\n')) {
    return '\r\n';
  }
  return '\n';
}

function ensureTerminalNewline(settingsText: string, endOfLine: '\n' | '\r\n'): string {
  if (settingsText.endsWith(endOfLine)) {
    return settingsText;
  }
  return `${settingsText}${endOfLine}`;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function readTrimmedSettingsProperty(
  settingsObject: Record<string, unknown>,
  propertyName: string
): string | undefined {
  const value = settingsObject[propertyName];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function formatPersistedFact(value: string | undefined): string {
  return value ?? '<missing>';
}

function resolveCliRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }

  throw new Error(
    `Unsupported runtime platform for VI History settings CLI validation: ${platform}`
  );
}

function renderJavascriptLauncher(modulePath: string): string {
  return [
    '#!/usr/bin/env node',
    'const path = require(\'node:path\');',
    `const modulePath = ${JSON.stringify(modulePath)};`,
    'let cli;',
    'try {',
    '  cli = require(modulePath);',
    '} catch (error) {',
    `  console.error(${JSON.stringify(STALE_LAUNCHER_MESSAGE)});`,
    '  if (error instanceof Error && error.message) {',
    "    console.error(`Module: ${path.resolve(modulePath)}`);",
    '    console.error(error.message);',
    '  }',
    '  process.exitCode = 1;',
    '  return;',
    '}',
    'if (!cli || typeof cli.runLocalRuntimeSettingsCliMain !== \'function\') {',
    `  console.error(${JSON.stringify(STALE_LAUNCHER_MESSAGE)});`,
    "  console.error(`Module: ${path.resolve(modulePath)}`);",
    '  process.exitCode = 1;',
    '  return;',
    '}',
    'void cli.runLocalRuntimeSettingsCliMain(process.argv.slice(2)).then((code) => {',
    '  process.exitCode = code;',
    '});',
    ''
  ].join('\n');
}

function renderWindowsLauncher(): string {
  return [
    '@echo off',
    'set SCRIPT_DIR=%~dp0',
    'where node >nul 2>nul',
    'if errorlevel 1 (',
    `  >&2 echo ${escapeWindowsBatchEcho(MISSING_NODE_RUNTIME_MESSAGE)}`,
    '  exit /b 1',
    ')',
    'node "%SCRIPT_DIR%run-local-runtime-settings-cli.js" %*',
    ''
  ].join('\r\n');
}

function renderPosixLauncher(): string {
  return [
    '#!/usr/bin/env sh',
    'SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"',
    'if ! command -v node >/dev/null 2>&1; then',
    `  printf '%s\\n' '${escapeSingleQuotedShellString(MISSING_NODE_RUNTIME_MESSAGE)}' >&2`,
    '  exit 1',
    'fi',
    'exec node "$SCRIPT_DIR/run-local-runtime-settings-cli.js" "$@"',
    ''
  ].join('\n');
}

function escapeWindowsBatchEcho(value: string): string {
  return value.replace(/"/g, '""');
}

function escapeSingleQuotedShellString(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
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
