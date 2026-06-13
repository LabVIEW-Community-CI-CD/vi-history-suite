import * as path from 'node:path';
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
  runLocalRuntimeSettingsCliMain
} from '../../src/tooling/localRuntimeSettingsCli';
import type { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';

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

  it('materializes launchers, honors platform injection, and refreshes idempotently', async () => {
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
    expect(memoryFs.text(materialized.javascriptLauncherPath)).toContain(
      'runLocalRuntimeSettingsCliMain'
    );
    expect(memoryFs.text(materialized.javascriptLauncherPath)).toContain(
      JSON.stringify(plan.modulePath)
    );
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

  it('serializes the observed non-default host VI Server port into the validation proof (VHS-REQ-623)', async () => {
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
