import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import {
  locateComparisonRuntime,
  type ComparisonRuntimeEngine,
  type ComparisonRuntimeLocatorDeps,
  type ComparisonRuntimeProvider,
  type RuntimePlatform,
  type ComparisonRuntimeSettings
} from '../reporting/comparisonRuntimeLocator';

const execFileAsync = promisify(execFileCallback);

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
  settingsTarget?: LocalRuntimeSettingsCliGovernanceContract['supportedSettingsTargets'][number];
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
  windowsTerminalEntrypointPath: string;
  posixTerminalEntrypointPath: string;
  currentPlatformLauncherPath: string;
  currentPlatformTerminalEntrypointPath: string;
  terminalCommandName: string;
  pathPrependValue: string;
  modulePath: string;
  nextCommand: string;
  exampleCommand: string;
}

export interface LocalRuntimeSettingsCliGovernanceContract {
  defaultSettingsFilePath: string;
  supportedSettingsTargets: readonly ['default-user-settings', 'explicit-settings-file'];
  untrustedWorkspacePosture: 'prepare-command-admitted-compare-blocked';
}

interface WritableStreamLike {
  write(text: string): unknown;
  isTTY?: boolean;
}

interface ReadableStreamLike {
  isTTY?: boolean;
}

interface EnvironmentVariableCollectionLike {
  prepend(name: string, value: string): void;
}

interface LocalRuntimeSettingsCliDeps {
  fs?: Pick<typeof fs, 'access' | 'chmod' | 'mkdir' | 'readFile' | 'writeFile'>;
  stdout?: WritableStreamLike;
  stderr?: WritableStreamLike;
  stdin?: ReadableStreamLike;
  cwd?: () => string;
  homedir?: () => string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  locateRuntime?: typeof locateComparisonRuntime;
  runtimeLocatorDeps?: ComparisonRuntimeLocatorDeps;
  promptLine?: (prompt: string) => Promise<string>;
  isInteractiveTerminal?: boolean;
  persistWindowsUserPathPrepend?: (pathEntry: string) => Promise<void>;
}

interface ResolvedLocalRuntimeSettingsCliTarget {
  settingsFilePath: string;
  settingsTarget: LocalRuntimeSettingsCliGovernanceContract['supportedSettingsTargets'][number];
}

const CLI_ROOT_DIRECTORY_NAME = 'local-runtime-settings-cli';
const JAVASCRIPT_LAUNCHER_NAME = 'run-local-runtime-settings-cli.js';
const WINDOWS_LAUNCHER_NAME = 'vihs-runtime-settings.cmd';
const POSIX_LAUNCHER_NAME = 'vihs-runtime-settings';
const WINDOWS_TERMINAL_ENTRYPOINT_NAME = 'vihs.cmd';
const POSIX_TERMINAL_ENTRYPOINT_NAME = 'vihs';
const TERMINAL_COMMAND_NAME = 'vihs';
const DEFAULT_INTERACTIVE_PLATFORM = 'windows';
const SUPPORTED_HOST_LABVIEW_VERSIONS = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'] as const;
const SUPPORTED_DOCKER_LABVIEW_VERSION = '2026';
const WINDOWS_PATH_SEPARATOR = ';';
const POSIX_PATH_SEPARATOR = ':';
const DISABLE_PERSISTENT_USER_PATH_ADMISSION_ENV =
  'VI_HISTORY_SUITE_DISABLE_PERSISTENT_USER_PATH_ADMISSION';
const WINDOWS_NODE_OVERRIDE_ENV = 'VI_HISTORY_SUITE_NODE_EXE';
const MISSING_NODE_RUNTIME_MESSAGE =
  'VI History runtime-settings CLI requires the standard VS Code runtime or a usable Node.js runtime. Install or repair VS Code, set VI_HISTORY_SUITE_NODE_EXE, or install Node.js, then rerun \"VI History: Prepare Local Runtime Settings CLI\" to refresh the launcher if this dependency changed.';
const STALE_LAUNCHER_MESSAGE =
  'VI History runtime-settings CLI launcher is stale or incomplete. Run \"VI History: Prepare Local Runtime Settings CLI\" again to refresh the generated launcher files.';

type InteractiveRuntimePlatformChoice = 'windows' | 'linux';

interface InteractiveRuntimeSettingsSelection {
  provider: LocalRuntimeSettingsCliProvider;
  platform: InteractiveRuntimePlatformChoice;
  labviewVersion: string;
  labviewBitness: LocalRuntimeSettingsCliBitness;
}

interface PromptLineController {
  promptLine: (prompt: string) => Promise<string>;
  close: () => void;
}

export function getLocalRuntimeSettingsCliUsage(): string {
  return [
    'Usage: vihs --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]',
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
    const configHome = env.XDG_CONFIG_HOME ?? path.posix.join(homedir().replace(/\\/g, '/'), '.config');
    return path.posix.join(configHome.replace(/\\/g, '/'), 'Code', 'User', 'settings.json');
  }

  if (platform === 'darwin') {
    return path.posix.join(
      homedir().replace(/\\/g, '/'),
      'Library',
      'Application Support',
      'Code',
      'User',
      'settings.json'
    );
  }

  throw new Error(`Unsupported platform for VI History settings CLI: ${platform}`);
}

export function buildLocalRuntimeSettingsCliMaterialization(
  globalStoragePath: string,
  extensionPath: string,
  platform: NodeJS.Platform = process.platform
): MaterializedLocalRuntimeSettingsCli {
  const rootDirectoryPath = path.join(globalStoragePath, CLI_ROOT_DIRECTORY_NAME);
  const javascriptLauncherPath = path.join(rootDirectoryPath, JAVASCRIPT_LAUNCHER_NAME);
  const windowsLauncherPath = path.join(rootDirectoryPath, WINDOWS_LAUNCHER_NAME);
  const posixLauncherPath = path.join(rootDirectoryPath, POSIX_LAUNCHER_NAME);
  const windowsTerminalEntrypointPath = path.join(
    rootDirectoryPath,
    WINDOWS_TERMINAL_ENTRYPOINT_NAME
  );
  const posixTerminalEntrypointPath = path.join(rootDirectoryPath, POSIX_TERMINAL_ENTRYPOINT_NAME);
  const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');
  const currentPlatformLauncherPath = resolveCurrentPlatformLauncherPath(
    windowsLauncherPath,
    posixLauncherPath,
    platform
  );
  const currentPlatformTerminalEntrypointPath = resolveCurrentPlatformLauncherPath(
    windowsTerminalEntrypointPath,
    posixTerminalEntrypointPath,
    platform
  );
  const nextCommand = buildBareCommandLine([
    '--provider',
    'host',
    '--labview-version',
    '2026',
    '--labview-bitness',
    'x64'
  ]);

  return {
    rootDirectoryPath,
    javascriptLauncherPath,
    windowsLauncherPath,
    posixLauncherPath,
    windowsTerminalEntrypointPath,
    posixTerminalEntrypointPath,
    currentPlatformLauncherPath,
    currentPlatformTerminalEntrypointPath,
    terminalCommandName: TERMINAL_COMMAND_NAME,
    pathPrependValue: buildPathPrependValue(rootDirectoryPath, platform),
    modulePath,
    nextCommand,
    exampleCommand: nextCommand
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
  await fsApi.writeFile(
    plan.windowsTerminalEntrypointPath,
    renderWindowsLauncher(),
    'utf8'
  );
  await fsApi.writeFile(
    plan.posixTerminalEntrypointPath,
    renderPosixLauncher(),
    'utf8'
  );
  await fsApi.chmod(plan.javascriptLauncherPath, 0o755);
  await fsApi.chmod(plan.posixLauncherPath, 0o755);
  await fsApi.chmod(plan.posixTerminalEntrypointPath, 0o755);

  return plan;
}

export async function admitLocalRuntimeSettingsCliToTerminalPath(
  globalStoragePath: string,
  extensionPath: string,
  environmentVariableCollection: EnvironmentVariableCollectionLike,
  deps: LocalRuntimeSettingsCliDeps = {}
): Promise<MaterializedLocalRuntimeSettingsCli> {
  const plan = await ensureLocalRuntimeSettingsCli(globalStoragePath, extensionPath, deps);
  environmentVariableCollection.prepend('PATH', plan.pathPrependValue);
  await ensurePersistentUserPathAdmission(plan.rootDirectoryPath, deps);
  return plan;
}

export async function runLocalRuntimeSettingsCli(
  argv: readonly string[],
  deps: LocalRuntimeSettingsCliDeps = {}
): Promise<LocalRuntimeSettingsCliRunResult> {
  if (argv.length === 0) {
    writeLine(deps.stdout ?? process.stdout, renderTerminalEntrypointDiscoveryText());
    return { outcome: 'help' };
  }

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

  const resolvedTarget = resolveSettingsTarget(parsed, deps);
  const settingsFilePath = resolvedTarget.settingsFilePath;
  await writeVsCodeSettingsFile(
    settingsFilePath,
    parsed.provider,
    parsed.labviewVersion,
    parsed.labviewBitness,
    deps.fs ?? fs
  );

  writeLine(
    deps.stdout ?? process.stdout,
    `Updated ${resolvedTarget.settingsTarget} target ${settingsFilePath}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `settingsTarget=${resolvedTarget.settingsTarget}`
  );
  writeLine(deps.stdout ?? process.stdout, `settingsFilePath=${settingsFilePath}`);
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
    'Review Compare or runtime validation again after the CLI update. Reload or restart the window only if this already-running VS Code session still shows stale provider or runtime facts.'
  );

  return {
    outcome: 'updated-settings',
    settingsFilePath,
    settingsTarget: resolvedTarget.settingsTarget,
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
    if (argv.length === 0 && isInteractiveTerminalSurface(deps)) {
      await runInteractiveLocalRuntimeSettingsCli(deps);
      return 0;
    }
    await runLocalRuntimeSettingsCli(argv, deps);
    return 0;
  } catch (error) {
    writeLine(deps.stderr ?? process.stderr, formatError(error));
    return 1;
  }
}

export async function runInteractiveLocalRuntimeSettingsCli(
  deps: LocalRuntimeSettingsCliDeps = {}
): Promise<LocalRuntimeSettingsCliRunResult> {
  const stdout = deps.stdout ?? process.stdout;
  const resolvedTarget = resolveSettingsTarget({ helpRequested: false }, deps);
  const settingsFacts = await ensureInteractiveDefaultSettings(resolvedTarget.settingsFilePath, deps);
  const promptController = await resolvePromptLine(deps);
  const promptLine = promptController.promptLine;
  const selection = deriveInteractiveSelection(settingsFacts);

  try {
    writeLine(
      stdout,
      `Current VI History settings: provider=${selection.provider}, platform=${selection.platform}, labviewVersion=${selection.labviewVersion}, labviewBitness=${selection.labviewBitness}`
    );

    selection.provider = await promptEnum(
      'Provider',
      selection.provider,
      ['host', 'docker'],
      promptLine
    );

    while (true) {
      selection.platform = await promptEnum(
        'Platform',
        selection.platform,
        ['windows', 'linux'],
        promptLine
      );

      if (selection.provider === 'host' && selection.platform === 'linux') {
        writeLine(stdout, renderNotImplementedPathMessage('host/linux'));
        continue;
      }

      while (true) {
        selection.labviewVersion = await promptEnum(
          'LabVIEW year',
          selection.labviewVersion,
          [...SUPPORTED_HOST_LABVIEW_VERSIONS],
          promptLine
        );

        if (
          selection.provider === 'docker' &&
          selection.labviewVersion !== SUPPORTED_DOCKER_LABVIEW_VERSION
        ) {
          writeLine(
            stdout,
            `Docker ${selection.labviewVersion} is unsupported. Currently implemented: host/windows 2020-2026 and docker/windows 2026 x64.`
          );
          continue;
        }

        while (true) {
          selection.labviewBitness = await promptEnum(
            'Bitness',
            selection.labviewBitness,
            ['x86', 'x64'],
            promptLine
          );

          if (selection.provider === 'docker' && selection.labviewBitness !== 'x64') {
            writeLine(
              stdout,
              'Docker x86 is unsupported. Currently implemented: host/windows 2020-2026 and docker/windows 2026 x64.'
            );
            continue;
          }

          if (selection.provider === 'docker' && selection.platform === 'linux') {
            writeLine(stdout, renderNotImplementedPathMessage('docker/linux'));
            break;
          }

          if (selection.provider === 'host') {
            const hostAvailability = await checkHostSelectionAvailability(selection, deps);
            if (!hostAvailability.available) {
              writeLine(stdout, `LabVIEW ${selection.labviewVersion} not installed.`);
              break;
            }
          }

          await runLocalRuntimeSettingsCli(
            [
              '--provider',
              selection.provider,
              '--labview-version',
              selection.labviewVersion,
              '--labview-bitness',
              selection.labviewBitness
            ],
            deps
          );

          return validateLocalRuntimeSettingsCli(
            { helpRequested: false, validateRequested: true },
            deps
          );
        }

        if (selection.provider === 'docker' && selection.platform === 'linux') {
          break;
        }

        if (selection.provider === 'host') {
          const hostAvailability = await checkHostSelectionAvailability(selection, deps);
          if (!hostAvailability.available) {
            continue;
          }
        }
      }
    }
  } finally {
    promptController.close();
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

async function resolvePromptLine(
  deps: LocalRuntimeSettingsCliDeps
): Promise<PromptLineController> {
  if (deps.promptLine) {
    return {
      promptLine: deps.promptLine,
      close: () => {}
    };
  }

  const stdin = (deps.stdin ?? process.stdin) as NodeJS.ReadableStream;
  const stdout = (deps.stdout ?? process.stdout) as NodeJS.WritableStream;
  const readline = createInterface({
    input: stdin,
    output: stdout
  });

  return {
    promptLine: async (prompt: string) => readline.question(prompt),
    close: () => readline.close()
  };
}

function isInteractiveTerminalSurface(deps: LocalRuntimeSettingsCliDeps): boolean {
  if (deps.isInteractiveTerminal !== undefined) {
    return deps.isInteractiveTerminal;
  }

  return Boolean((deps.stdin ?? process.stdin).isTTY && (deps.stdout ?? process.stdout).isTTY);
}

async function promptEnum<T extends string>(
  label: string,
  defaultValue: T,
  allowedValues: readonly T[],
  promptLine: (prompt: string) => Promise<string>
): Promise<T> {
  while (true) {
    const response = (await promptLine(`${label} [${defaultValue}]: `)).trim().toLowerCase();
    if (!response) {
      return defaultValue;
    }

    if ((allowedValues as readonly string[]).includes(response)) {
      return response as T;
    }
  }
}

async function ensureInteractiveDefaultSettings(
  settingsFilePath: string,
  deps: LocalRuntimeSettingsCliDeps
): Promise<PersistedRuntimeSettingsFacts> {
  const fsApi = deps.fs ?? fs;
  let settingsFacts = await readPersistedRuntimeSettingsFacts(settingsFilePath, fsApi);

  if (
    settingsFacts.persistedProvider &&
    settingsFacts.persistedLabviewVersion &&
    settingsFacts.persistedLabviewBitness
  ) {
    return settingsFacts;
  }

  await writeVsCodeSettingsFile(settingsFilePath, 'host', '2026', 'x64', fsApi);
  writeLine(
    deps.stdout ?? process.stdout,
    `Created default VI History runtime settings at ${settingsFilePath} with host/windows/2026/x64.`
  );
  settingsFacts = await readPersistedRuntimeSettingsFacts(settingsFilePath, fsApi);
  return settingsFacts;
}

function deriveInteractiveSelection(
  settingsFacts: PersistedRuntimeSettingsFacts
): InteractiveRuntimeSettingsSelection {
  return {
    provider:
      settingsFacts.persistedProvider === 'docker'
        ? 'docker'
        : 'host',
    platform: DEFAULT_INTERACTIVE_PLATFORM,
    labviewVersion:
      settingsFacts.persistedLabviewVersion && SUPPORTED_HOST_LABVIEW_VERSIONS.includes(
        settingsFacts.persistedLabviewVersion as (typeof SUPPORTED_HOST_LABVIEW_VERSIONS)[number]
      )
        ? settingsFacts.persistedLabviewVersion
        : '2026',
    labviewBitness:
      settingsFacts.persistedLabviewBitness === 'x86' || settingsFacts.persistedLabviewBitness === 'x64'
        ? settingsFacts.persistedLabviewBitness
        : 'x64'
  };
}

async function checkHostSelectionAvailability(
  selection: InteractiveRuntimeSettingsSelection,
  deps: LocalRuntimeSettingsCliDeps
): Promise<{ available: boolean }> {
  const locateRuntime = deps.locateRuntime ?? locateComparisonRuntime;
  const runtimeSelection = await locateRuntime(resolveCliRuntimePlatform(deps.platform ?? process.platform), {
    requestedProvider: 'host',
    requireVersionAndBitness: true,
    labviewVersion: selection.labviewVersion,
    bitness: selection.labviewBitness
  } satisfies ComparisonRuntimeSettings, deps.runtimeLocatorDeps);

  return {
    available: runtimeSelection.blockedReason !== 'labview-exe-not-found'
  };
}

function renderNotImplementedPathMessage(pathLabel: 'host/linux' | 'docker/linux'): string {
  return `${pathLabel} is not currently implemented. Currently implemented: host/windows 2020-2026 and docker/windows 2026 x64.`;
}

function resolveSettingsTarget(
  parsed: LocalRuntimeSettingsCliArgs,
  deps: LocalRuntimeSettingsCliDeps
): ResolvedLocalRuntimeSettingsCliTarget {
  if (parsed.settingsFilePath) {
    const cwd = deps.cwd ?? process.cwd;
    const settingsFilePath = path.resolve(cwd(), parsed.settingsFilePath);
    assertSupportedSettingsTarget(settingsFilePath);
    return {
      settingsFilePath,
      settingsTarget: 'explicit-settings-file'
    };
  }

  return {
    settingsFilePath: resolveDefaultVsCodeSettingsPath(
      deps.platform ?? process.platform,
      deps.env ?? process.env,
      deps.homedir ?? os.homedir
    ),
    settingsTarget: 'default-user-settings'
  };
}

async function validateLocalRuntimeSettingsCli(
  parsed: LocalRuntimeSettingsCliArgs,
  deps: LocalRuntimeSettingsCliDeps
): Promise<LocalRuntimeSettingsCliRunResult> {
  const resolvedTarget = resolveSettingsTarget(parsed, deps);
  const settingsFilePath = resolvedTarget.settingsFilePath;
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

  writeLine(
    deps.stdout ?? process.stdout,
    `Validated ${resolvedTarget.settingsTarget} target ${settingsFilePath}`
  );
  writeLine(
    deps.stdout ?? process.stdout,
    `settingsTarget=${resolvedTarget.settingsTarget}`
  );
  writeLine(deps.stdout ?? process.stdout, `settingsFilePath=${settingsFilePath}`);
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
    settingsTarget: resolvedTarget.settingsTarget,
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
  const candidateText = stripUtf8ByteOrderMark(
    existingSettingsText?.trim() ? existingSettingsText : '{}'
  );
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

function stripUtf8ByteOrderMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
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

function assertSupportedSettingsTarget(settingsFilePath: string): void {
  const normalizedSegments = path
    .normalize(settingsFilePath)
    .split(/[\\/]+/)
    .map((segment) => segment.toLowerCase());
  const finalSegment = normalizedSegments.at(-1);
  const parentSegment = normalizedSegments.at(-2);

  if (parentSegment === '.vscode' && finalSegment === 'settings.json') {
    throw new Error(
      'Workspace settings are not supported for VI History runtime-settings CLI. Use the default user settings.json target or an explicit non-workspace settings-file path.'
    );
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

function resolveCurrentPlatformLauncherPath(
  windowsLauncherPath: string,
  posixLauncherPath: string,
  platform: NodeJS.Platform
): string {
  return platform === 'win32' ? windowsLauncherPath : posixLauncherPath;
}

function buildPathPrependValue(rootDirectoryPath: string, platform: NodeJS.Platform): string {
  return `${rootDirectoryPath}${platform === 'win32' ? WINDOWS_PATH_SEPARATOR : POSIX_PATH_SEPARATOR}`;
}

async function ensurePersistentUserPathAdmission(
  pathEntry: string,
  deps: LocalRuntimeSettingsCliDeps
): Promise<void> {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') {
    return;
  }

  const rawDisableSignal =
    deps.env?.[DISABLE_PERSISTENT_USER_PATH_ADMISSION_ENV] ??
    process.env[DISABLE_PERSISTENT_USER_PATH_ADMISSION_ENV];
  const disableSignal = rawDisableSignal?.trim().toLowerCase();
  if (disableSignal === '1' || disableSignal === 'true') {
    return;
  }

  if (deps.persistWindowsUserPathPrepend) {
    await deps.persistWindowsUserPathPrepend(pathEntry);
    return;
  }

  await persistWindowsUserPathPrepend(pathEntry);
}

async function persistWindowsUserPathPrepend(pathEntry: string): Promise<void> {
  const escapedPathEntry = pathEntry.replace(/'/g, "''");
  const script = [
    `$entry = '${escapedPathEntry}'`,
    "$normalizedTarget = $entry.Trim().TrimEnd('\\\\')",
    "$current = [Environment]::GetEnvironmentVariable('Path', 'User')",
    '$entries = @()',
    'if ($current) {',
    "  $entries = $current -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }",
    '}',
    "$alreadyPresent = $entries | Where-Object { $_.TrimEnd('\\\\') -ieq $normalizedTarget } | Select-Object -First 1",
    'if ($alreadyPresent) {',
    '  exit 0',
    '}',
    "$updated = @($entry) + $entries",
    "[Environment]::SetEnvironmentVariable('Path', ($updated -join ';'), 'User')",
    'Add-Type -Namespace ViHistorySuite -Name NativeMethods -MemberDefinition @"',
    '[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Auto)]',
    'public static extern System.IntPtr SendMessageTimeout(',
    '    System.IntPtr hWnd,',
    '    uint Msg,',
    '    System.IntPtr wParam,',
    '    string lParam,',
    '    uint fuFlags,',
    '    uint uTimeout,',
    '    out System.IntPtr lpdwResult);',
    '"@',
    '$result = [System.IntPtr]::Zero',
    "[ViHistorySuite.NativeMethods]::SendMessageTimeout([System.IntPtr]0xffff, 0x1A, [System.IntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$result) | Out-Null"
  ].join('\n');

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true
      }
    );
  } catch (error) {
    throw new Error(
      `Failed to admit bare vihs terminal entrypoint into the user PATH. ${formatError(error)}`
    );
  }
}

function buildLauncherCommandLine(
  launcherPath: string,
  platform: NodeJS.Platform,
  args: readonly string[]
): string {
  return [quoteLauncherPathForShell(launcherPath, platform), ...args].join(' ');
}

function buildBareCommandLine(args: readonly string[]): string {
  return [TERMINAL_COMMAND_NAME, ...args].join(' ');
}

function renderTerminalEntrypointDiscoveryText(): string {
  return [
    'VI History runtime-settings terminal entrypoint',
    '',
    'Copy one of these commands:',
    `  ${buildBareCommandLine(['--provider', 'host', '--labview-version', '2026', '--labview-bitness', 'x64'])}`,
    `  ${buildBareCommandLine(['--provider', 'docker', '--labview-version', '2026', '--labview-bitness', 'x64'])}`,
    `  ${buildBareCommandLine(['--validate'])}`,
    '',
    'Optional:',
    '  add --settings-file <path> to target one explicit non-workspace settings.json file'
  ].join('\n');
}

function quoteLauncherPathForShell(launcherPath: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `"${launcherPath.replace(/"/g, '""')}"`;
  }

  return `'${escapeSingleQuotedShellString(launcherPath)}'`;
}

function renderJavascriptLauncher(modulePath: string): string {
  return [
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
    'setlocal',
    'set SCRIPT_DIR=%~dp0',
    'set "VIHS_NODE_COMMAND="',
    'set "VIHS_USE_ELECTRON_RUN_AS_NODE="',
    `if defined ${WINDOWS_NODE_OVERRIDE_ENV} (`,
    `  if exist "%${WINDOWS_NODE_OVERRIDE_ENV}%" (`,
    `    set "VIHS_NODE_COMMAND=%${WINDOWS_NODE_OVERRIDE_ENV}%"`,
    '  )',
    ')',
    'if not defined VIHS_NODE_COMMAND (',
    '  if defined LOCALAPPDATA (',
    '    if exist "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe" (',
    '      set "VIHS_NODE_COMMAND=%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe"',
    '      set "VIHS_USE_ELECTRON_RUN_AS_NODE=1"',
    '    )',
    '  )',
    ')',
    'if not defined VIHS_NODE_COMMAND (',
    '  if defined ProgramFiles (',
    '    if exist "%ProgramFiles%\\Microsoft VS Code\\Code.exe" (',
    '      set "VIHS_NODE_COMMAND=%ProgramFiles%\\Microsoft VS Code\\Code.exe"',
    '      set "VIHS_USE_ELECTRON_RUN_AS_NODE=1"',
    '    )',
    '  )',
    ')',
    'if not defined VIHS_NODE_COMMAND (',
    '  for %%I in (node.exe) do (',
    '    if not "%%~$PATH:I"=="" (',
    '      set "VIHS_NODE_COMMAND=%%~$PATH:I"',
    '    )',
    '  )',
    ')',
    'if not defined VIHS_NODE_COMMAND (',
    `  >&2 echo ${escapeWindowsBatchEcho(MISSING_NODE_RUNTIME_MESSAGE)}`,
    '  exit /b 1',
    ')',
    'if "%VIHS_USE_ELECTRON_RUN_AS_NODE%"=="1" (',
    '  set "ELECTRON_RUN_AS_NODE=1"',
    ')',
    '"%VIHS_NODE_COMMAND%" "%SCRIPT_DIR%run-local-runtime-settings-cli.js" %*',
    'exit /b %ERRORLEVEL%',
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
