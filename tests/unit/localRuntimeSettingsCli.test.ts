import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import {
  admitLocalRuntimeSettingsCliToTerminalPath,
  buildLocalRuntimeSettingsCliMaterialization,
  ensureLocalRuntimeSettingsCli,
  getLocalRuntimeSettingsCliUsage,
  parseLocalRuntimeSettingsCliArgs,
  resolveDefaultVsCodeSettingsPath,
  resolveLocalRuntimeSettingsCliContract,
  runInteractiveLocalRuntimeSettingsCli,
  runLocalRuntimeSettingsCli,
  runLocalRuntimeSettingsCliMain,
  writeVsCodeSettingsFile,
  readPersistedRuntimeSettingsFacts,
  normalizeLabviewBitness,
  normalizeProvider,
  isSupportedInstalledLabviewVersion,
  buildReportableEnvironment,
  isSecretLikeEnvironmentKey,
  formatPersistedFact,
  resolveCliRuntimePlatform,
  resolveCurrentPlatformLauncherPath,
  buildPathPrependValue,
  quoteLauncherPathForShell,
  escapeWindowsBatchEcho,
  escapeSingleQuotedShellString
} from '../../src/tooling/localRuntimeSettingsCli';
import type { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';

/**
 * Global stub for `node:readline/promises`. The CLI only calls `createInterface`
 * from `resolvePromptLine` when NO `promptLine` dependency is injected, which no
 * other test in this file exercises, so this stub stays dormant except in the
 * dedicated default-controller test below. `answers` is drained per question.
 */
const readlineMockState = vi.hoisted(() => ({
  answers: [] as string[],
  created: 0,
  closed: 0
}));

vi.mock('node:readline/promises', () => ({
  createInterface: () => {
    readlineMockState.created += 1;
    return {
      question: async () => readlineMockState.answers.shift() ?? '',
      close: () => {
        readlineMockState.closed += 1;
      }
    };
  }
}));

class MemoryFs {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  readonly chmodCalls: string[] = [];
  readonly writeCalls: Array<{ filePath: string; text: string }> = [];

  access = vi.fn(async (filePath: string) => {
    const key = this.normalize(filePath);
    if (!this.files.has(key) && !this.directories.has(key)) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
    }
  });

  chmod = vi.fn(async (filePath: string) => {
    this.chmodCalls.push(this.normalize(filePath));
  });

  mkdir = vi.fn(async (directoryPath: string) => {
    this.directories.add(this.normalize(directoryPath));
  });

  readFile = vi.fn(async (filePath: string, _encoding?: BufferEncoding) => {
    const key = this.normalize(filePath);
    const value = this.files.get(key);
    if (value === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
    }
    return value;
  });

  writeFile = vi.fn(async (filePath: string, value: string | Uint8Array) => {
    const text = typeof value === 'string' ? value : new TextDecoder().decode(value);
    const key = this.normalize(filePath);
    this.files.set(key, text);
    this.writeCalls.push({ filePath: key, text });
  });

  seed(filePath: string, value: string): void {
    this.files.set(this.normalize(filePath), value);
  }

  text(filePath: string): string {
    const value = this.files.get(this.normalize(filePath));
    if (value === undefined) {
      throw new Error(`Missing memory file ${filePath}`);
    }
    return value;
  }

  private normalize(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }
}

function createWritable() {
  let output = '';
  return {
    stream: {
      write(text: string): void {
        output += text;
      }
    },
    text: () => output
  };
}

function readyRuntimeSelection(): ComparisonRuntimeSelection {
  return {
    platform: 'win32',
    executionMode: 'host-only',
    requestedProvider: 'host',
    requestedLabviewVersion: '2026',
    bitness: 'x86',
    provider: 'host-native',
    engine: 'labview-cli',
    labviewExe: {
      kind: 'labview-exe',
      path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    },
    labviewCli: {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    },
    notes: ['Host-native runtime selected.'],
    registryQueryPlans: [],
    candidates: []
  };
}

function dockerReadyRuntimeSelection(): ComparisonRuntimeSelection {
  return {
    platform: 'win32',
    executionMode: 'docker-only',
    requestedProvider: 'docker',
    requestedLabviewVersion: '2026',
    bitness: 'x64',
    provider: 'windows-container',
    engine: 'labview-cli',
    notes: ['Windows container runtime selected.'],
    registryQueryPlans: [],
    candidates: []
  };
}

function blockedRuntimeSelection(blockedReason: string): ComparisonRuntimeSelection {
  return {
    platform: 'linux',
    executionMode: 'docker-only',
    requestedProvider: 'docker',
    requestedLabviewVersion: '2026',
    bitness: 'x64',
    provider: 'unavailable',
    blockedReason,
    dockerCliAvailable: false,
    dockerDaemonReachable: false,
    notes: ['Docker provider unavailable.'],
    registryQueryPlans: [],
    candidates: []
  };
}

function execNodeScript(
  scriptPath: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [scriptPath, ...args],
      { env, windowsHide: true },
      (error, stdout, stderr) => {
        const maybeExitError = error as (Error & { code?: number }) | null;
        resolve({
          exitCode: typeof maybeExitError?.code === 'number' ? maybeExitError.code : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? '')
        });
      }
    );
  });
}

describe('local runtime settings CLI (VHS-REQ-612)', () => {
  it('parses normalized arguments and reports stable argument errors', async () => {
    expect(
      parseLocalRuntimeSettingsCliArgs([
        '--provider',
        'HOST',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'X86',
        '--settings-file',
        'runtime-settings.json',
        '--proof-out',
        'proof',
        '--validate'
      ])
    ).toEqual({
      helpRequested: false,
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x86',
      settingsFilePath: 'runtime-settings.json',
      proofOutDirectoryPath: 'proof',
      validateRequested: true
    });
    expect(getLocalRuntimeSettingsCliUsage()).toContain(
      'Usage: vihs --provider <host|docker>'
    );

    const stderr = createWritable();
    await expect(
      runLocalRuntimeSettingsCliMain(['--provider', 'serial-port'], { stderr: stderr.stream })
    ).resolves.toBe(1);
    expect(stderr.text()).toContain('Unsupported compare provider: serial-port');

    const missingValue = createWritable();
    await expect(
      runLocalRuntimeSettingsCliMain(['--labview-bitness'], { stderr: missingValue.stream })
    ).resolves.toBe(1);
    expect(missingValue.text()).toContain('Missing value for --labview-bitness.');
  });

  it('resolves default and explicit settings targets without admitting workspace settings', async () => {
    expect(
      resolveDefaultVsCodeSettingsPath('win32', { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' }, () => 'C:\\Users\\Test')
    ).toBe('C:\\Users\\Test\\AppData\\Roaming\\Code\\User\\settings.json');
    expect(
      resolveDefaultVsCodeSettingsPath('linux', { XDG_CONFIG_HOME: '/home/test/.config' }, () => '/home/test')
    ).toBe('/home/test/.config/Code/User/settings.json');
    expect(resolveLocalRuntimeSettingsCliContract({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: '/home/test/.config' },
      homedir: () => '/home/test'
    })).toEqual({
      defaultSettingsFilePath: '/home/test/.config/Code/User/settings.json',
      supportedSettingsTargets: ['default-user-settings', 'explicit-settings-file'],
      untrustedWorkspacePosture: 'prepare-command-admitted-compare-blocked'
    });

    await expect(
      runLocalRuntimeSettingsCli(
        [
          '--provider',
          'host',
          '--labview-version',
          '2026',
          '--labview-bitness',
          'x86',
          '--settings-file',
          '.vscode/settings.json'
        ],
        {
          cwd: () => '/workspace/repo',
          fs: new MemoryFs() as never
        }
      )
    ).rejects.toThrow('Workspace settings are not supported');
  });

  it('materializes launchers with stale-module self-heal logic, honors platform injection, and refreshes idempotently (VHS-REQ-612.6)', async () => {
    const memoryFs = new MemoryFs();
    const plan = buildLocalRuntimeSettingsCliMaterialization(
      '/global-storage',
      '/extension-root',
      'linux'
    );
    memoryFs.seed(plan.modulePath, 'module.exports = {};');
    memoryFs.seed(plan.javascriptLauncherPath, 'stale');
    const environment = { prepend: vi.fn() };

    const materialized = await admitLocalRuntimeSettingsCliToTerminalPath(
      '/global-storage',
      '/extension-root',
      environment,
      {
        fs: memoryFs as never,
        platform: 'linux',
        env: {}
      }
    );
    const refreshed = await ensureLocalRuntimeSettingsCli(
      '/global-storage',
      '/extension-root',
      {
        fs: memoryFs as never,
        platform: 'linux'
      }
    );

    expect(materialized.currentPlatformLauncherPath).toBe(materialized.posixLauncherPath);
    expect(materialized.currentPlatformTerminalEntrypointPath).toBe(
      materialized.posixTerminalEntrypointPath
    );
    expect(materialized.pathPrependValue).toBe(`${materialized.rootDirectoryPath}:`);
    expect(environment.prepend).toHaveBeenCalledWith('PATH', materialized.pathPrependValue);
    const javascriptLauncher = memoryFs.text(materialized.javascriptLauncherPath);
    expect(javascriptLauncher).toContain('runLocalRuntimeSettingsCliMain');
    expect(javascriptLauncher).toContain(JSON.stringify(plan.modulePath));
    expect(javascriptLauncher).toContain('svelderrainruiz.vi-history-suite-');
    expect(javascriptLauncher).toContain('out/tooling/localRuntimeSettingsCli.js');
    expect(javascriptLauncher).toContain('findInstalledExtensionModulePath');
    expect(javascriptLauncher).toContain("path.join(home, '.vscode', 'extensions')");
    expect(javascriptLauncher).toContain("path.join(home, '.vscode-server', 'extensions')");
    expect(javascriptLauncher).toContain('compareExtensionFolderNames');
    expect(javascriptLauncher).toContain('if (fallback && fallback !== stampedModulePath)');
    expect(memoryFs.text(materialized.posixLauncherPath)).toContain('#!/usr/bin/env sh');
    expect(memoryFs.text(materialized.windowsLauncherPath)).toContain(
      'VI History runtime-settings CLI requires'
    );
    expect(memoryFs.chmodCalls).toEqual(
      expect.arrayContaining([
        path.normalize(materialized.javascriptLauncherPath).replace(/\\/g, '/'),
        path.normalize(materialized.posixLauncherPath).replace(/\\/g, '/'),
        path.normalize(materialized.posixTerminalEntrypointPath).replace(/\\/g, '/')
      ])
    );
    expect(refreshed).toEqual(materialized);
    expect(memoryFs.text(materialized.javascriptLauncherPath)).not.toBe('stale');
  });

  it('executes the generated launcher through an installed-extension fallback when the stamped module is missing (VHS-REQ-612.6)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-launcher-self-heal-'));
    try {
      const homeDirectory = path.join(tempRoot, 'home');
      const extensionRoot = path.join(tempRoot, 'stamped-extension');
      const globalStorageRoot = path.join(tempRoot, 'global-storage');
      const stampedModulePath = path.join(
        extensionRoot,
        'out',
        'tooling',
        'localRuntimeSettingsCli.js'
      );
      await fs.mkdir(path.dirname(stampedModulePath), { recursive: true });
      await fs.writeFile(stampedModulePath, 'module.exports = {};', 'utf8');

      const materialized = await ensureLocalRuntimeSettingsCli(globalStorageRoot, extensionRoot, {
        platform: 'linux'
      });
      await fs.rm(extensionRoot, { recursive: true, force: true });

      const fallbackModulePath = path.join(
        homeDirectory,
        '.vscode',
        'extensions',
        'svelderrainruiz.vi-history-suite-99.0.0',
        'out',
        'tooling',
        'localRuntimeSettingsCli.js'
      );
      await fs.mkdir(path.dirname(fallbackModulePath), { recursive: true });
      await fs.writeFile(
        fallbackModulePath,
        [
          'module.exports = {',
          '  runLocalRuntimeSettingsCliMain: async (args) => {',
          "    console.log(`fallback-loaded:${args.join('|')}`);",
          '    return 0;',
          '  }',
          '};'
        ].join('\n'),
        'utf8'
      );

      const result = await execNodeScript(
        materialized.javascriptLauncherPath,
        ['--validate'],
        {
          ...process.env,
          HOME: homeDirectory,
          USERPROFILE: homeDirectory
        }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('fallback-loaded:--validate');
      expect(result.stderr).toBe('');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('updates settings JSONC and keeps repeated refreshes stable', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    memoryFs.seed(
      settingsFilePath,
      '{\n  // existing user preference\n  "editor.tabSize": 2,\n}\n'
    );

    const args = [
      '--provider',
      'host',
      '--labview-version',
      '2026',
      '--labview-bitness',
      'x86',
      '--settings-file',
      'runtime-settings.json'
    ];
    const first = await runLocalRuntimeSettingsCli(args, {
      cwd: () => '/workspace',
      fs: memoryFs as never,
      stdout: stdout.stream
    });
    const firstSettingsText = memoryFs.text(settingsFilePath);
    const second = await runLocalRuntimeSettingsCli(args, {
      cwd: () => '/workspace',
      fs: memoryFs as never,
      stdout: stdout.stream
    });

    expect(first).toMatchObject({
      outcome: 'updated-settings',
      settingsFilePath,
      settingsTarget: 'explicit-settings-file',
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x86'
    });
    expect(second).toEqual(first);
    expect(memoryFs.text(settingsFilePath)).toBe(firstSettingsText);
    expect(firstSettingsText).toContain('"editor.tabSize": 2');
    expect(firstSettingsText).toContain('"viHistorySuite.runtimeProvider": "host"');
    expect(firstSettingsText).toContain('"viHistorySuite.labviewVersion": "2026"');
    expect(firstSettingsText).toContain('"viHistorySuite.labviewBitness": "x86"');
    expect(stdout.text()).toContain('Updated explicit-settings-file target');
    expect(stdout.text()).toContain('Review Compare or runtime validation again');
  });

  it('validates persisted runtime facts and writes actionable proof packets', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    const proofDirectory = path.resolve('/workspace', 'proof');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'docker',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue(
      blockedRuntimeSelection('docker-provider-unavailable')
    );

    const result = await runLocalRuntimeSettingsCli(
      [
        '--validate',
        '--settings-file',
        'runtime-settings.json',
        '--proof-out',
        'proof'
      ],
      {
        cwd: () => '/workspace',
        env: {
          PATH: '/usr/bin',
          GITHUB_TOKEN: 'secret',
          USERPROFILE: '/home/test'
        },
        fs: memoryFs as never,
        stdout: stdout.stream,
        platform: 'linux',
        locateRuntime,
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );

    expect(locateRuntime).toHaveBeenCalledWith(
      'linux',
      expect.objectContaining({
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64',
        allowExistingWindowsHostRuntime: false
      }),
      undefined
    );
    expect(result).toMatchObject({
      outcome: 'validated-settings',
      settingsFilePath,
      settingsTarget: 'explicit-settings-file',
      persistedProvider: 'docker',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64',
      runtimeValidationOutcome: 'blocked',
      runtimeProvider: 'unavailable',
      runtimeBlockedReason: 'docker-provider-unavailable',
      runtimeErrorCode: 'VIHS_E_DOCKER_UNAVAILABLE',
      runtimeProofStatus: 'blocked-with-actionable-error',
      runtimeImplementationStatus: 'blocked-or-missing-prerequisite',
      proofReportPath: path.join(proofDirectory, 'vihs-validation-proof.json'),
      proofIssueBodyPath: path.join(proofDirectory, 'vihs-validation-issue.md'),
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890',
      extensionBuildRef: '1.4.2+abcdef1'
    });
    expect(stdout.text()).toContain('runtimeErrorCode=VIHS_E_DOCKER_UNAVAILABLE');
    const proof = JSON.parse(memoryFs.text(path.join(proofDirectory, 'vihs-validation-proof.json'))) as {
      host: { env: Record<string, string> };
      publicIntake: { suggestedTemplate: string };
    };
    expect(proof.host.env.PATH).toBe('/usr/bin');
    expect(proof.host.env.GITHUB_TOKEN).toBe('<redacted-secret-like-env-var>');
    expect(proof.publicIntake.suggestedTemplate).toBe('validation-failure.yml');
    expect(memoryFs.text(path.join(proofDirectory, 'vihs-validation-issue.md'))).toContain(
      'Error code: VIHS_E_DOCKER_UNAVAILABLE'
    );
  });

  it('serializes the observed non-default host VI Server port into the validation proof (VHS-REQ-623.6)', async () => {
    // A maintainer host runs LabVIEW installs on non-default VI Server ports.
    // The locator observes the selected install's server.tcp.port; the proof
    // must carry it (and the LabVIEW.ini it was read from) so real-hardware
    // validation evidence proves a non-default port was admitted without a
    // false conflict block, rather than dropping it from the runtime block.
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    const proofDirectory = path.resolve('/workspace', 'proof');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'host',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue({
      ...readyRuntimeSelection(),
      hostLabviewTcpPort: 3380,
      hostLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    });

    const result = await runLocalRuntimeSettingsCli(
      ['--validate', '--settings-file', 'runtime-settings.json', '--proof-out', 'proof'],
      {
        cwd: () => '/workspace',
        env: { PATH: '/usr/bin' },
        fs: memoryFs as never,
        stdout: stdout.stream,
        platform: 'win32',
        locateRuntime,
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );

    expect(result).toMatchObject({ runtimeValidationOutcome: 'ready' });
    const proof = JSON.parse(memoryFs.text(path.join(proofDirectory, 'vihs-validation-proof.json'))) as {
      runtime: { hostLabviewTcpPort: number | null; hostLabviewIniPath: string | null; blockedReason: string | null };
    };
    expect(proof.runtime.hostLabviewTcpPort).toBe(3380);
    expect(proof.runtime.hostLabviewIniPath).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    );
    expect(proof.runtime.blockedReason).toBeNull();
  });

  it('records a null host VI Server port in the proof when the runtime is not host-native (VHS-REQ-623)', async () => {
    // The port fields are optional on non-Windows / container runtimes; the
    // proof records them as explicit null rather than omitting them, so the
    // schema stays stable for public-intake consumers.
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    const proofDirectory = path.resolve('/workspace', 'proof');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'docker',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue(
      blockedRuntimeSelection('docker-provider-unavailable')
    );

    await runLocalRuntimeSettingsCli(
      ['--validate', '--settings-file', 'runtime-settings.json', '--proof-out', 'proof'],
      {
        cwd: () => '/workspace',
        env: { PATH: '/usr/bin' },
        fs: memoryFs as never,
        stdout: stdout.stream,
        platform: 'linux',
        locateRuntime,
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );

    const proof = JSON.parse(memoryFs.text(path.join(proofDirectory, 'vihs-validation-proof.json'))) as {
      runtime: { hostLabviewTcpPort: number | null; hostLabviewIniPath: string | null };
    };
    expect(proof.runtime.hostLabviewTcpPort).toBeNull();
    expect(proof.runtime.hostLabviewIniPath).toBeNull();
  });

  it('reports malformed settings through the CLI main error path', async () => {
    const memoryFs = new MemoryFs();
    const stderr = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    memoryFs.seed(settingsFilePath, '{not-json');

    await expect(
      runLocalRuntimeSettingsCliMain(
        ['--validate', '--settings-file', 'runtime-settings.json'],
        {
          cwd: () => '/workspace',
          fs: memoryFs as never,
          stderr: stderr.stream,
          locateRuntime: vi.fn().mockResolvedValue(readyRuntimeSelection())
        }
      )
    ).resolves.toBe(1);
    expect(stderr.text()).toContain(
      `Failed to parse VS Code settings JSONC at ${settingsFilePath}.`
    );
  });

  it('runs interactive terminal preparation from defaults and validates the resulting settings', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue(readyRuntimeSelection());
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime,
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });

    expect(result).toMatchObject({
      outcome: 'validated-settings',
      settingsTarget: 'default-user-settings',
      persistedProvider: 'host',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x86',
      runtimeValidationOutcome: 'ready',
      runtimeErrorCode: 'VIHS_OK'
    });
    expect(stdout.text()).toContain('Created default VI History runtime settings');
    expect(stdout.text()).toContain('Current VI History settings');
    expect(promptLine).toHaveBeenCalledTimes(4);
  });

  it('drives the interactive docker provider branch and persists docker defaults', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue(dockerReadyRuntimeSelection());
    // provider=docker, then platform / year / bitness accept the docker defaults.
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('docker')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime,
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });

    expect(result).toMatchObject({
      outcome: 'validated-settings',
      persistedProvider: 'docker',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64',
      runtimeValidationOutcome: 'ready'
    });
    expect(promptLine).toHaveBeenCalledTimes(4);
  });

  it('drives the interactive linux host branch and defaults host bitness to x64', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue(readyRuntimeSelection());
    // provider default (host), platform=linux, year default, bitness default (x64 on linux).
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('linux')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'linux',
      env: { HOME: '/home/test' },
      homedir: () => '/home/test',
      locateRuntime,
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });

    expect(result).toMatchObject({
      outcome: 'validated-settings',
      persistedProvider: 'host',
      persistedLabviewBitness: 'x64'
    });
    expect(promptLine).toHaveBeenCalledTimes(4);
  });

  it('re-prompts on an invalid enum answer and resolves a newer/manual LabVIEW year', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed('/build/buildInfo.json', JSON.stringify({
      extensionVersion: '1.4.2',
      extensionCommit: 'abcdef1234567890'
    }));
    const locateRuntime = vi.fn().mockResolvedValue(readyRuntimeSelection());
    // provider: invalid then valid (reprompt loop); platform default (windows);
    // year: 'newer' then manual '2027'; bitness default (x86 on windows host).
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('nonsense')
      .mockResolvedValueOnce('host')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('newer')
      .mockResolvedValueOnce('2027')
      .mockResolvedValueOnce('');

    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime,
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });

    expect(result).toMatchObject({
      outcome: 'validated-settings',
      persistedProvider: 'host',
      persistedLabviewVersion: '2027',
      persistedLabviewBitness: 'x86'
    });
    expect(promptLine).toHaveBeenCalledTimes(6);
  });

  it('prints terminal entrypoint discovery when no non-interactive args are supplied', async () => {
    const stdout = createWritable();

    await expect(
      runLocalRuntimeSettingsCliMain([], {
        stdout: stdout.stream,
        isInteractiveTerminal: false
      })
    ).resolves.toBe(0);
    expect(stdout.text()).toContain('VI History runtime-settings terminal entrypoint');
    expect(stdout.text()).toContain('vihs --provider host --labview-version 2026 --labview-bitness x86');
    expect(stdout.text()).toContain('vihs --validate');
  });
});

describe('local runtime settings CLI validation taxonomy and argument guards (VHS-REQ-612)', () => {
  async function runValidateWithSelection(selection: ComparisonRuntimeSelection): Promise<string> {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'docker',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    await runLocalRuntimeSettingsCli(['--validate', '--settings-file', 'runtime-settings.json'], {
      cwd: () => '/workspace',
      env: { PATH: '/usr/bin' },
      fs: memoryFs as never,
      stdout: stdout.stream,
      platform: 'linux',
      locateRuntime: vi.fn().mockResolvedValue(selection),
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });
    return stdout.text();
  }

  it.each([
    ['installed-provider-invalid', 'VIHS_E_PROVIDER_INVALID'],
    ['labview-runtime-selection-required', 'VIHS_E_RUNTIME_SELECTION_REQUIRED'],
    ['labview-version-required', 'VIHS_E_LABVIEW_VERSION_REQUIRED'],
    ['labview-version-unsupported-for-comparison-report', 'VIHS_E_LABVIEW_VERSION_UNSUPPORTED'],
    ['labview-bitness-required', 'VIHS_E_LABVIEW_BITNESS_REQUIRED'],
    ['labview-2026q1-unsupported-on-macos', 'VIHS_E_PLATFORM_UNSUPPORTED'],
    ['docker-provider-not-supported-on-platform', 'VIHS_E_PLATFORM_UNSUPPORTED'],
    ['configured-labview-exe-path-missing', 'VIHS_E_CONFIGURED_PATH_MISSING'],
    [
      'docker-provider-labview-version-not-implemented',
      'VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED'
    ],
    ['docker-provider-requires-windows-x64', 'VIHS_E_DOCKER_PROVIDER_UNSUPPORTED_BITNESS'],
    ['docker-only-requires-windows-x64-provider', 'VIHS_E_DOCKER_PROVIDER_UNSUPPORTED_BITNESS'],
    ['docker-provider-unavailable', 'VIHS_E_DOCKER_UNAVAILABLE'],
    ['docker-only-provider-unavailable', 'VIHS_E_DOCKER_UNAVAILABLE'],
    ['auto-docker-installed-provider-unavailable', 'VIHS_E_DOCKER_UNAVAILABLE'],
    ['labview-exe-not-found', 'VIHS_E_LABVIEW_NOT_FOUND'],
    ['labview-exe-ambiguous', 'VIHS_E_LABVIEW_AMBIGUOUS'],
    ['labview-cli-not-found-for-bitness', 'VIHS_E_LABVIEW_CLI_BITNESS_NOT_FOUND'],
    ['canonical-labview-cli-not-found', 'VIHS_E_COMPARISON_TOOL_NOT_FOUND'],
    ['comparison-tool-not-found', 'VIHS_E_COMPARISON_TOOL_NOT_FOUND'],
    ['windows-host-runtime-surface-contaminated', 'VIHS_E_RUNTIME_SURFACE_CONTAMINATED'],
    ['an-unmapped-future-reason', 'VIHS_E_RUNTIME_VALIDATION_BLOCKED']
  ])(
    'maps blocked reason %s to stable runtime error code %s',
    async (blockedReason, expectedCode) => {
      const text = await runValidateWithSelection(blockedRuntimeSelection(blockedReason));
      expect(text).toContain(`runtimeBlockedReason=${blockedReason}`);
      expect(text).toContain(`runtimeErrorCode=${expectedCode}`);
      expect(text).toContain('runtimeValidationOutcome=blocked');
      expect(text).toContain('runtimeProofStatus=blocked-with-actionable-error');
    }
  );

  it('reports VIHS_OK and implemented status for a ready runtime selection', async () => {
    const text = await runValidateWithSelection(readyRuntimeSelection());
    expect(text).toContain('runtimeValidationOutcome=ready');
    expect(text).toContain('runtimeErrorCode=VIHS_OK');
    expect(text).toContain('runtimeProofStatus=ready');
    expect(text).toContain('runtimeImplementationStatus=implemented');
  });

  it.each([
    'docker-provider-labview-version-not-implemented',
    'docker-provider-requires-windows-x64',
    'docker-only-requires-windows-x64-provider',
    'docker-provider-not-supported-on-platform',
    'labview-2026q1-unsupported-on-macos'
  ])('classifies %s as a not-implemented runtime path', async (blockedReason) => {
    const text = await runValidateWithSelection(blockedRuntimeSelection(blockedReason));
    expect(text).toContain('runtimeImplementationStatus=not-implemented');
  });

  it('classifies a prerequisite gap as blocked-or-missing-prerequisite', async () => {
    const text = await runValidateWithSelection(blockedRuntimeSelection('labview-exe-not-found'));
    expect(text).toContain('runtimeImplementationStatus=blocked-or-missing-prerequisite');
  });

  it('rejects an unknown argument with a stable message', () => {
    expect(() => parseLocalRuntimeSettingsCliArgs(['--bogus'])).toThrow('Unknown argument: --bogus');
  });

  it.each([
    [['--labview-version', '2026', '--labview-bitness', 'x86'], 'Missing required --provider.'],
    [['--provider', 'host', '--labview-bitness', 'x86'], 'Missing required --labview-version.'],
    [['--provider', 'host', '--labview-version', '2026'], 'Missing required --labview-bitness.']
  ])('rejects incomplete non-validate invocation %j', async (argv, expectedMessage) => {
    await expect(runLocalRuntimeSettingsCli(argv, {})).rejects.toThrow(expectedMessage);
  });

  it('resolves default VS Code settings paths across supported platforms', () => {
    expect(resolveDefaultVsCodeSettingsPath('win32', {}, () => 'C:\\Users\\Test')).toBe(
      'C:\\Users\\Test\\AppData\\Roaming\\Code\\User\\settings.json'
    );
    expect(
      resolveDefaultVsCodeSettingsPath(
        'win32',
        { APPDATA: '/mnt/c/Users/Test/AppData/Roaming' },
        () => 'C:\\Users\\Test'
      )
    ).toBe('/mnt/c/Users/Test/AppData/Roaming/Code/User/settings.json');
    expect(resolveDefaultVsCodeSettingsPath('linux', {}, () => '/home/test')).toBe(
      '/home/test/.config/Code/User/settings.json'
    );
    expect(resolveDefaultVsCodeSettingsPath('darwin', {}, () => '/Users/test')).toBe(
      '/Users/test/Library/Application Support/Code/User/settings.json'
    );
  });

  it('throws for an unsupported settings platform', () => {
    expect(() =>
      resolveDefaultVsCodeSettingsPath('freebsd' as NodeJS.Platform, {}, () => '/home/test')
    ).toThrow('Unsupported platform for VI History settings CLI: freebsd');
  });
});

describe('writeVsCodeSettingsFile / readPersistedRuntimeSettingsFacts (VHS-REQ-623)', () => {
  const settingsPath = '/home/test/.config/Code/User/settings.json';

  it('creates the parent directory and writes the three viHistorySuite keys', async () => {
    const memory = new MemoryFs();

    await writeVsCodeSettingsFile(settingsPath, 'host', '2026', 'x64', memory);

    expect(memory.mkdir).toHaveBeenCalledWith(path.dirname(settingsPath), { recursive: true });
    const written = memory.text(settingsPath);
    expect(written).toContain('"viHistorySuite.runtimeProvider": "host"');
    expect(written).toContain('"viHistorySuite.labviewVersion": "2026"');
    expect(written).toContain('"viHistorySuite.labviewBitness": "x64"');
  });

  it('preserves unrelated pre-existing settings keys when upserting', async () => {
    const memory = new MemoryFs();
    memory.seed(
      settingsPath,
      '{\n  "editor.fontSize": 14,\n  "viHistorySuite.runtimeProvider": "docker"\n}\n'
    );

    await writeVsCodeSettingsFile(settingsPath, 'host', '2025', 'x86', memory);

    const written = memory.text(settingsPath);
    // Unrelated keys survive the edit.
    expect(written).toContain('"editor.fontSize": 14');
    // The provider is updated in place, not duplicated.
    expect(written).toContain('"viHistorySuite.runtimeProvider": "host"');
    expect(written).not.toContain('"docker"');
  });

  it('round-trips written settings back through readPersistedRuntimeSettingsFacts', async () => {
    const memory = new MemoryFs();

    await writeVsCodeSettingsFile(settingsPath, 'docker', '2026', 'x64', memory);
    const facts = await readPersistedRuntimeSettingsFacts(settingsPath, memory);

    expect(facts.persistedProvider).toBe('docker');
    expect(facts.persistedLabviewVersion).toBe('2026');
    expect(facts.persistedLabviewBitness).toBe('x64');
    expect(facts.runtimeSettings.requestedProvider).toBe('docker');
    // The docker provider clears the existing-Windows-host allowance.
    expect(facts.runtimeSettings.allowExistingWindowsHostRuntime).toBe(false);
    expect(facts.runtimeSettings.bitness).toBe('x64');
  });

  it('returns undefined persisted values with defaulted runtime settings for a missing file', async () => {
    const memory = new MemoryFs();

    const facts = await readPersistedRuntimeSettingsFacts(settingsPath, memory);

    expect(facts.persistedProvider).toBeUndefined();
    expect(facts.persistedLabviewVersion).toBeUndefined();
    expect(facts.persistedLabviewBitness).toBeUndefined();
    expect(facts.runtimeSettings.requestedProvider).toBeUndefined();
    expect(facts.runtimeSettings.invalidRequestedProvider).toBeUndefined();
    // A missing/non-docker provider keeps the existing-Windows-host allowance on.
    expect(facts.runtimeSettings.allowExistingWindowsHostRuntime).toBe(true);
    expect(facts.runtimeSettings.bitness).toBeUndefined();
  });

  it('captures an invalid provider without resolving a requested provider', async () => {
    const memory = new MemoryFs();
    memory.seed(settingsPath, '{ "viHistorySuite.runtimeProvider": "bogus" }');

    const facts = await readPersistedRuntimeSettingsFacts(settingsPath, memory);

    expect(facts.runtimeSettings.requestedProvider).toBeUndefined();
    expect(facts.runtimeSettings.invalidRequestedProvider).toBe('bogus');
  });

  it('drops an unsupported bitness while keeping a supported one', async () => {
    const memory = new MemoryFs();
    memory.seed(settingsPath, '{ "viHistorySuite.labviewBitness": "arm64" }');
    const invalid = await readPersistedRuntimeSettingsFacts(settingsPath, memory);
    expect(invalid.runtimeSettings.bitness).toBeUndefined();

    memory.seed(settingsPath, '{ "viHistorySuite.labviewBitness": "x86" }');
    const valid = await readPersistedRuntimeSettingsFacts(settingsPath, memory);
    expect(valid.runtimeSettings.bitness).toBe('x86');
  });
});

describe('localRuntimeSettingsCli pure helpers (VHS-REQ-623 coverage)', () => {
  describe('normalizeLabviewBitness', () => {
    it('accepts x86/x64 case- and whitespace-insensitively', () => {
      expect(normalizeLabviewBitness(' X64 ')).toBe('x64');
      expect(normalizeLabviewBitness('x86')).toBe('x86');
    });
    it('throws for an unsupported bitness', () => {
      expect(() => normalizeLabviewBitness('arm64')).toThrow(/Unsupported LabVIEW bitness/);
    });
  });

  describe('normalizeProvider', () => {
    it('accepts host/docker case- and whitespace-insensitively', () => {
      expect(normalizeProvider(' Host ')).toBe('host');
      expect(normalizeProvider('DOCKER')).toBe('docker');
    });
    it('throws for an unsupported provider', () => {
      expect(() => normalizeProvider('podman')).toThrow(/Unsupported compare provider/);
    });
  });

  describe('isSupportedInstalledLabviewVersion', () => {
    it('is true only for a parseable year >= 2025', () => {
      expect(isSupportedInstalledLabviewVersion('2025')).toBe(true);
      expect(isSupportedInstalledLabviewVersion('2026')).toBe(true);
      expect(isSupportedInstalledLabviewVersion('2024')).toBe(false);
      expect(isSupportedInstalledLabviewVersion('nope')).toBe(false);
      expect(isSupportedInstalledLabviewVersion(undefined)).toBe(false);
    });
  });

  describe('isSecretLikeEnvironmentKey', () => {
    it('never redacts PATH-family keys', () => {
      expect(isSecretLikeEnvironmentKey('PATH')).toBe(false);
      expect(isSecretLikeEnvironmentKey('GOPATH')).toBe(false);
      expect(isSecretLikeEnvironmentKey('LD_LIBRARY_PATH')).toBe(false);
    });
    it('flags token/secret/password/credential/auth/key-like keys', () => {
      for (const key of ['GITHUB_TOKEN', 'MY_PAT', 'DB_PASSWORD', 'PASSWD', 'API_SECRET', 'PRIVATE_THING', 'AWS_CREDENTIAL', 'GH_AUTH', 'SIGNING_KEY']) {
        expect(isSecretLikeEnvironmentKey(key)).toBe(true);
      }
    });
    it('does not flag ordinary keys', () => {
      expect(isSecretLikeEnvironmentKey('HOME')).toBe(false);
      expect(isSecretLikeEnvironmentKey('LANG')).toBe(false);
    });
  });

  describe('buildReportableEnvironment', () => {
    it('redacts secret-like values, keeps others, and sorts keys', () => {
      const result = buildReportableEnvironment({
        ZED: 'last',
        GITHUB_TOKEN: 'ghp_xxx',
        ALPHA: 'first',
        PATH: '/usr/bin'
      });
      expect(Object.keys(result)).toEqual(['ALPHA', 'GITHUB_TOKEN', 'PATH', 'ZED']);
      expect(result.GITHUB_TOKEN).toBe('<redacted-secret-like-env-var>');
      expect(result.PATH).toBe('/usr/bin');
      expect(result.ALPHA).toBe('first');
    });
    it('coerces an undefined value to an empty string', () => {
      expect(buildReportableEnvironment({ EMPTY: undefined })).toEqual({ EMPTY: '' });
    });
  });

  describe('formatPersistedFact', () => {
    it('returns the value or a <missing> placeholder', () => {
      expect(formatPersistedFact('host')).toBe('host');
      expect(formatPersistedFact(undefined)).toBe('<missing>');
    });
  });

  describe('resolveCliRuntimePlatform', () => {
    it('passes through supported platforms', () => {
      expect(resolveCliRuntimePlatform('win32')).toBe('win32');
      expect(resolveCliRuntimePlatform('linux')).toBe('linux');
      expect(resolveCliRuntimePlatform('darwin')).toBe('darwin');
    });
    it('throws for an unsupported platform', () => {
      expect(() => resolveCliRuntimePlatform('aix' as NodeJS.Platform)).toThrow(
        /Unsupported runtime platform/
      );
    });
  });

  describe('resolveCurrentPlatformLauncherPath', () => {
    it('picks the windows launcher on win32, else posix', () => {
      expect(resolveCurrentPlatformLauncherPath('W.cmd', 'p.sh', 'win32')).toBe('W.cmd');
      expect(resolveCurrentPlatformLauncherPath('W.cmd', 'p.sh', 'linux')).toBe('p.sh');
    });
  });

  describe('buildPathPrependValue', () => {
    it('appends the platform PATH separator', () => {
      expect(buildPathPrependValue('C:\\bin', 'win32')).toBe('C:\\bin;');
      expect(buildPathPrependValue('/usr/bin', 'linux')).toBe('/usr/bin:');
    });
  });

  describe('quoteLauncherPathForShell', () => {
    it('double-quotes and escapes embedded quotes on win32', () => {
      expect(quoteLauncherPathForShell('C:\\a "b".cmd', 'win32')).toBe('"C:\\a ""b"".cmd"');
    });
    it('single-quotes and escapes for posix', () => {
      expect(quoteLauncherPathForShell("/a/it's.sh", 'linux')).toBe(`'/a/it'"'"'s.sh'`);
    });
  });

  describe('escapeWindowsBatchEcho / escapeSingleQuotedShellString', () => {
    it('escapes double quotes for batch echo', () => {
      expect(escapeWindowsBatchEcho('say "hi"')).toBe('say ""hi""');
    });
    it('escapes single quotes for a POSIX single-quoted string', () => {
      expect(escapeSingleQuotedShellString("a'b")).toBe(`a'"'"'b`);
    });
  });
});

describe('local runtime settings CLI additional branch coverage (VHS-REQ-623 coverage)', () => {
  it('parses --help into a help request', () => {
    const parsed = parseLocalRuntimeSettingsCliArgs(['--help']);
    expect(parsed.helpRequested).toBe(true);
    expect(parsed.validateRequested).toBeUndefined();
  });

  it('prints usage and returns a help outcome for --help', async () => {
    const stdout = createWritable();
    const result = await runLocalRuntimeSettingsCli(['--help'], { stdout: stdout.stream });
    expect(result).toEqual({ outcome: 'help' });
    expect(stdout.text()).toContain(getLocalRuntimeSettingsCliUsage());
  });

  it('resolves interactivity from stdin/stdout TTY flags when isInteractiveTerminal is unset', async () => {
    const stdout = createWritable();
    const code = await runLocalRuntimeSettingsCliMain([], {
      stdin: { isTTY: false },
      stdout: { ...stdout.stream, isTTY: false }
    });
    // Non-interactive TTY -> discovery text, not the interactive flow.
    expect(code).toBe(0);
    expect(stdout.text()).toContain('VI History runtime-settings terminal entrypoint');
  });

  it('runs the interactive flow through main when the terminal is interactive', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    const code = await runLocalRuntimeSettingsCliMain([], {
      isInteractiveTerminal: true,
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime: vi.fn().mockResolvedValue(readyRuntimeSelection()),
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('Current VI History settings');
  });

  it('skips creating default settings when complete runtime facts already exist', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const settingsPath = resolveDefaultVsCodeSettingsPath(
      'win32',
      { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      () => 'C:\\Users\\Test'
    );
    memoryFs.seed(
      settingsPath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'host',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x86'
      })
    );
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime: vi.fn().mockResolvedValue(readyRuntimeSelection()),
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });
    expect(result).toMatchObject({ outcome: 'validated-settings', persistedProvider: 'host' });
    // The early-return path is taken: no default-settings creation message.
    expect(stdout.text()).not.toContain('Created default VI History runtime settings');
    expect(stdout.text()).toContain('Current VI History settings');
  });

  it('falls back to interactive defaults when persisted facts are a docker provider with unsupported version/bitness', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const settingsPath = resolveDefaultVsCodeSettingsPath(
      'win32',
      { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      () => 'C:\\Users\\Test'
    );
    // All three facts are present (so the early-return path preserves them),
    // but the year is unsupported and the bitness is invalid — exercising the
    // deriveInteractiveSelection fallbacks (docker provider, '2026' year, docker
    // default bitness).
    memoryFs.seed(
      settingsPath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'docker',
        'viHistorySuite.labviewVersion': '2020',
        'viHistorySuite.labviewBitness': 'weird'
      })
    );
    const promptLine = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdout: stdout.stream,
      promptLine,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime: vi.fn().mockResolvedValue(dockerReadyRuntimeSelection()),
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });
    expect(result).toMatchObject({
      outcome: 'validated-settings',
      persistedProvider: 'docker',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64'
    });
    expect(stdout.text()).not.toContain('Created default VI History runtime settings');
  });

  it('rethrows a non-ENOENT settings read error', async () => {
    const failing = {
      readFile: vi.fn(async () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      })
    };
    await expect(
      readPersistedRuntimeSettingsFacts('/some/settings.json', failing as never)
    ).rejects.toThrow('EACCES');
  });

  it('resolves a host provider and keeps the existing-Windows-host allowance', async () => {
    const memory = new MemoryFs();
    const settingsPath = '/home/test/.config/Code/User/settings.json';
    memory.seed(
      settingsPath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'host',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    const facts = await readPersistedRuntimeSettingsFacts(settingsPath, memory as never);
    expect(facts.runtimeSettings.requestedProvider).toBe('host');
    expect(facts.runtimeSettings.allowExistingWindowsHostRuntime).toBe(true);
    expect(facts.runtimeSettings.bitness).toBe('x64');
  });

  it('admits the terminal entrypoint and persists the Windows user PATH via the injected persister', async () => {
    const memoryFs = new MemoryFs();
    const plan = buildLocalRuntimeSettingsCliMaterialization(
      '/global-storage',
      '/extension-root',
      'win32'
    );
    memoryFs.seed(plan.modulePath, 'module.exports = {};');
    const environment = { prepend: vi.fn() };
    const persistWindowsUserPathPrepend = vi.fn(async () => {});
    await admitLocalRuntimeSettingsCliToTerminalPath(
      '/global-storage',
      '/extension-root',
      environment,
      {
        fs: memoryFs as never,
        platform: 'win32',
        env: {},
        persistWindowsUserPathPrepend
      }
    );
    expect(environment.prepend).toHaveBeenCalledWith('PATH', plan.pathPrependValue);
    expect(persistWindowsUserPathPrepend).toHaveBeenCalledWith(plan.rootDirectoryPath);
  });

  it('skips Windows user PATH persistence when the disable signal is set', async () => {
    const memoryFs = new MemoryFs();
    const plan = buildLocalRuntimeSettingsCliMaterialization(
      '/global-storage',
      '/extension-root',
      'win32'
    );
    memoryFs.seed(plan.modulePath, 'module.exports = {};');
    const environment = { prepend: vi.fn() };
    const persistWindowsUserPathPrepend = vi.fn(async () => {});
    await admitLocalRuntimeSettingsCliToTerminalPath(
      '/global-storage',
      '/extension-root',
      environment,
      {
        fs: memoryFs as never,
        platform: 'win32',
        env: { VI_HISTORY_SUITE_DISABLE_PERSISTENT_USER_PATH_ADMISSION: '1' },
        persistWindowsUserPathPrepend
      }
    );
    expect(environment.prepend).toHaveBeenCalledWith('PATH', plan.pathPrependValue);
    // The disable signal short-circuits before the injected persister runs.
    expect(persistWindowsUserPathPrepend).not.toHaveBeenCalled();
  });

  it('formats a non-Error thrown value through the CLI main error path', async () => {
    const memoryFs = new MemoryFs();
    const stderr = createWritable();
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const code = await runLocalRuntimeSettingsCliMain(
      ['--validate', '--settings-file', 'runtime-settings.json'],
      {
        cwd: () => '/workspace',
        fs: memoryFs as never,
        stderr: stderr.stream,
        locateRuntime: (async () => {
          // A non-Error rejection exercises the String(error) fallback.
          throw 'stringy runtime failure';
        }) as never,
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );
    expect(code).toBe(1);
    expect(stderr.text()).toContain('stringy runtime failure');
  });
});

describe('local runtime settings CLI proof-packet content branches (VHS-REQ-612)', () => {
  it('suggests the feature-not-implemented template in the proof for a not-implemented runtime block', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    const proofDirectory = path.resolve('/workspace', 'proof');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'docker',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const locateRuntime = vi
      .fn()
      .mockResolvedValue(blockedRuntimeSelection('docker-provider-labview-version-not-implemented'));

    await runLocalRuntimeSettingsCli(
      ['--validate', '--settings-file', 'runtime-settings.json', '--proof-out', 'proof'],
      {
        cwd: () => '/workspace',
        env: { PATH: '/usr/bin' },
        fs: memoryFs as never,
        stdout: stdout.stream,
        platform: 'linux',
        locateRuntime,
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );

    const proof = JSON.parse(
      memoryFs.text(path.join(proofDirectory, 'vihs-validation-proof.json'))
    ) as { implementationStatus: string; publicIntake: { suggestedTemplate: string } };
    expect(proof.implementationStatus).toBe('not-implemented');
    expect(proof.publicIntake.suggestedTemplate).toBe('feature-not-implemented.yml');
  });

  it('renders <missing> selected-variant facts in the issue body when persisted settings are empty', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    const proofDirectory = path.resolve('/workspace', 'proof');
    // No viHistorySuite.* keys -> persisted facts resolve to null -> the issue
    // body falls back to the <missing> placeholders.
    memoryFs.seed(settingsFilePath, '{}');
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const locateRuntime = vi
      .fn()
      .mockResolvedValue(blockedRuntimeSelection('docker-provider-unavailable'));

    await runLocalRuntimeSettingsCli(
      ['--validate', '--settings-file', 'runtime-settings.json', '--proof-out', 'proof'],
      {
        cwd: () => '/workspace',
        env: { PATH: '/usr/bin' },
        fs: memoryFs as never,
        stdout: stdout.stream,
        platform: 'linux',
        locateRuntime,
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );

    const issueBody = memoryFs.text(path.join(proofDirectory, 'vihs-validation-issue.md'));
    expect(issueBody).toContain('- Provider: <missing>');
    expect(issueBody).toContain('- LabVIEW year: <missing>');
    expect(issueBody).toContain('- Bitness: <missing>');
  });
});

/**
 * Covers the default-dependency fall-throughs the injected-deps tests never
 * reach: the `process.stdout`/`process.cwd`/`process.platform` sides of the
 * `deps.x ?? process.x` defaults, the default `node:readline/promises`
 * interactive controller, and the default `powershell.exe` PATH persister. All
 * paths stay deterministic — `process.stdout` is spied, `createInterface` is
 * globally stubbed, and `child_process` is mocked per test — so nothing spawns a
 * real subprocess or blocks on a TTY.
 */
describe('local runtime settings CLI default-dependency coverage (VHS-REQ-612)', () => {
  function spyStdout() {
    return vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
  }

  function makeChildProcessMock(
    handler: (file: string, args: readonly string[]) => { stdout: string; stderr: string }
  ): { execFile: unknown; default: { execFile: unknown } } {
    const execFileImpl = function execFileCallbackForm(): never {
      throw new Error('callback-form execFile is not used by the persister');
    } as unknown as Record<symbol, unknown>;
    execFileImpl[promisify.custom] = async (file: string, args: readonly string[]) => handler(file, args);
    return { execFile: execFileImpl, default: { execFile: execFileImpl } };
  }

  it('writes the terminal discovery text to process.stdout when no stdout is injected', async () => {
    const writeSpy = spyStdout();
    try {
      const result = await runLocalRuntimeSettingsCli([]);
      expect(result).toEqual({ outcome: 'help' });
      expect(
        writeSpy.mock.calls.some(([text]) => String(text).includes('terminal entrypoint'))
      ).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('writes the usage text to process.stdout for --help when no stdout is injected', async () => {
    const writeSpy = spyStdout();
    try {
      const result = await runLocalRuntimeSettingsCli(['--help']);
      expect(result).toEqual({ outcome: 'help' });
      expect(writeSpy.mock.calls.some(([text]) => String(text).includes('Usage: vihs'))).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('writes every update settings line to process.stdout when no stdout is injected', async () => {
    const memoryFs = new MemoryFs();
    const writeSpy = spyStdout();
    try {
      const result = await runLocalRuntimeSettingsCli(
        [
          '--provider',
          'host',
          '--labview-version',
          '2026',
          '--labview-bitness',
          'x86',
          '--settings-file',
          'runtime-settings.json'
        ],
        { cwd: () => '/workspace', fs: memoryFs as never }
      );
      expect(result).toMatchObject({
        outcome: 'updated-settings',
        provider: 'host',
        labviewVersion: '2026',
        labviewBitness: 'x86'
      });
      expect(
        writeSpy.mock.calls.some(([text]) => String(text).includes('viHistorySuite.labviewBitness=x86'))
      ).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('validate falls back to process.stdout/cwd/platform and records host defaults in the proof', async () => {
    const memoryFs = new MemoryFs();
    const settingsFilePath = path.join(os.tmpdir(), 'vihs-validate-defaults', 'runtime-settings.json');
    const proofDirectory = path.join(os.tmpdir(), 'vihs-validate-defaults', 'proof');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'host',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const writeSpy = spyStdout();
    try {
      const result = await runLocalRuntimeSettingsCli(
        ['--validate', '--settings-file', settingsFilePath, '--proof-out', proofDirectory],
        {
          fs: memoryFs as never,
          locateRuntime: vi.fn().mockResolvedValue(readyRuntimeSelection()),
          buildInfoDeps: {
            fs: memoryFs as never,
            buildInfoPath: '/build/buildInfo.json',
            packageJsonPath: '/package.json'
          }
        }
      );
      expect(result).toMatchObject({
        outcome: 'validated-settings',
        runtimeValidationOutcome: 'ready',
        runtimeErrorCode: 'VIHS_OK'
      });
      expect(
        writeSpy.mock.calls.some(([text]) => String(text).includes('runtimeValidationOutcome=ready'))
      ).toBe(true);
      const proof = JSON.parse(
        memoryFs.text(path.join(proofDirectory, 'vihs-validation-proof.json'))
      ) as { host: { processPlatform: string }; publicIntake: { suggestedTemplate: string } };
      expect(proof.host.processPlatform).toBe(process.platform);
      expect(proof.publicIntake.suggestedTemplate).toBe('validation-success.yml');
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('validate suggests the not-implemented template and honors an injected homedir in the proof', async () => {
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    const settingsFilePath = path.resolve('/workspace', 'runtime-settings.json');
    const proofDirectory = path.resolve('/workspace', 'proof');
    memoryFs.seed(
      settingsFilePath,
      JSON.stringify({
        'viHistorySuite.runtimeProvider': 'docker',
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      })
    );
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const result = await runLocalRuntimeSettingsCli(
      ['--validate', '--settings-file', 'runtime-settings.json', '--proof-out', 'proof'],
      {
        cwd: () => '/workspace',
        fs: memoryFs as never,
        stdout: stdout.stream,
        platform: 'linux',
        env: { PATH: '/usr/bin' },
        homedir: () => '/home/injected-user',
        locateRuntime: vi
          .fn()
          .mockResolvedValue(blockedRuntimeSelection('docker-provider-labview-version-not-implemented')),
        buildInfoDeps: {
          fs: memoryFs as never,
          buildInfoPath: '/build/buildInfo.json',
          packageJsonPath: '/package.json'
        }
      }
    );
    expect(result).toMatchObject({
      runtimeValidationOutcome: 'blocked',
      runtimeImplementationStatus: 'not-implemented'
    });
    const proof = JSON.parse(
      memoryFs.text(path.join(proofDirectory, 'vihs-validation-proof.json'))
    ) as { host: { homedir: string }; publicIntake: { suggestedTemplate: string } };
    expect(proof.host.homedir).toBe('/home/injected-user');
    expect(proof.publicIntake.suggestedTemplate).toBe('feature-not-implemented.yml');
  });

  it('main honors an explicit non-interactive terminal signal and prints discovery text', async () => {
    const writeSpy = spyStdout();
    try {
      const code = await runLocalRuntimeSettingsCliMain([], { isInteractiveTerminal: false });
      expect(code).toBe(0);
      expect(
        writeSpy.mock.calls.some(([text]) => String(text).includes('terminal entrypoint'))
      ).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('builds the default readline controller when no promptLine is injected', async () => {
    readlineMockState.answers = ['', '', '', ''];
    readlineMockState.created = 0;
    readlineMockState.closed = 0;
    const memoryFs = new MemoryFs();
    const stdout = createWritable();
    memoryFs.seed(
      '/build/buildInfo.json',
      JSON.stringify({ extensionVersion: '1.4.2', extensionCommit: 'abcdef1234567890' })
    );
    const result = await runInteractiveLocalRuntimeSettingsCli({
      fs: memoryFs as never,
      stdin: {} as never,
      stdout: stdout.stream,
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      homedir: () => 'C:\\Users\\Test',
      locateRuntime: vi.fn().mockResolvedValue(readyRuntimeSelection()),
      buildInfoDeps: {
        fs: memoryFs as never,
        buildInfoPath: '/build/buildInfo.json',
        packageJsonPath: '/package.json'
      }
    });
    expect(result).toMatchObject({
      outcome: 'validated-settings',
      persistedProvider: 'host',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x86'
    });
    expect(readlineMockState.created).toBe(1);
    expect(readlineMockState.closed).toBe(1);
  });

  it('admits the terminal entrypoint through the default powershell persister on success', async () => {
    vi.resetModules();
    const execCalls: Array<{ file: string; args: readonly string[] }> = [];
    vi.doMock('node:child_process', () =>
      makeChildProcessMock((file, args) => {
        execCalls.push({ file, args });
        return { stdout: '', stderr: '' };
      })
    );
    try {
      const mod = await import('../../src/tooling/localRuntimeSettingsCli');
      const memoryFs = new MemoryFs();
      const plan = mod.buildLocalRuntimeSettingsCliMaterialization(
        '/global-storage',
        '/extension-root',
        'win32'
      );
      memoryFs.seed(plan.modulePath, 'module.exports = {};');
      const environment = { prepend: vi.fn() };
      await mod.admitLocalRuntimeSettingsCliToTerminalPath(
        '/global-storage',
        '/extension-root',
        environment,
        { fs: memoryFs as never, platform: 'win32', env: {} }
      );
      expect(environment.prepend).toHaveBeenCalledWith('PATH', plan.pathPrependValue);
      expect(execCalls).toHaveLength(1);
      expect(execCalls[0].file).toBe('powershell.exe');
      expect(execCalls[0].args).toContain('-NonInteractive');
      expect(execCalls[0].args.some((arg) => arg.includes("SetEnvironmentVariable('Path'"))).toBe(true);
    } finally {
      vi.doUnmock('node:child_process');
      vi.resetModules();
    }
  });

  it('wraps a failure from the default powershell persister with an actionable message', async () => {
    vi.resetModules();
    vi.doMock('node:child_process', () =>
      makeChildProcessMock(() => {
        throw new Error('powershell.exe exited 1');
      })
    );
    try {
      const mod = await import('../../src/tooling/localRuntimeSettingsCli');
      const memoryFs = new MemoryFs();
      const plan = mod.buildLocalRuntimeSettingsCliMaterialization(
        '/global-storage',
        '/extension-root',
        'win32'
      );
      memoryFs.seed(plan.modulePath, 'module.exports = {};');
      await expect(
        mod.admitLocalRuntimeSettingsCliToTerminalPath(
          '/global-storage',
          '/extension-root',
          { prepend: vi.fn() },
          { fs: memoryFs as never, platform: 'win32', env: {} }
        )
      ).rejects.toThrow('Failed to admit bare vihs terminal entrypoint into the user PATH');
    } finally {
      vi.doUnmock('node:child_process');
      vi.resetModules();
    }
  });
});
