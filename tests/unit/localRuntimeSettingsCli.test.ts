import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'jsonc-parser';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  admitLocalRuntimeSettingsCliToTerminalPath,
  buildLocalRuntimeSettingsCliMaterialization,
  ensureLocalRuntimeSettingsCli,
  getLocalRuntimeSettingsCliUsage,
  parseLocalRuntimeSettingsCliArgs,
  resolveLocalRuntimeSettingsCliGovernanceContract,
  resolveDefaultVsCodeSettingsPath,
  runInteractiveLocalRuntimeSettingsCli,
  runLocalRuntimeSettingsCli,
  runLocalRuntimeSettingsCliMain
} from '../../src/tooling/localRuntimeSettingsCli';

const execFile = promisify(execFileCallback);

describe('localRuntimeSettingsCli', () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('parses explicit provider, version, bitness, and settings-file arguments', () => {
    expect(
      parseLocalRuntimeSettingsCliArgs([
        '--provider',
        'docker',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64',
        '--settings-file',
        './settings.json',
        '--proof-out',
        './proof'
      ])
    ).toEqual({
      helpRequested: false,
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      settingsFilePath: './settings.json',
      proofOutDirectoryPath: './proof'
    });

    expect(parseLocalRuntimeSettingsCliArgs(['--help'])).toEqual({
      helpRequested: true
    });
    expect(
      parseLocalRuntimeSettingsCliArgs(['--validate', '--settings-file', './settings.json'])
    ).toEqual({
      helpRequested: false,
      validateRequested: true,
      settingsFilePath: './settings.json'
    });
    expect(
      parseLocalRuntimeSettingsCliArgs([
        'validate-fixture',
        '--provider',
        'docker',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64',
        '--settings-file',
        './settings.json',
        '--proof-out',
        './fixture-proof',
        '--runtime-timeout-ms',
        '180000'
      ])
    ).toEqual({
      helpRequested: false,
      validateFixtureRequested: true,
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      settingsFilePath: './settings.json',
      proofOutDirectoryPath: './fixture-proof',
      runtimeExecutionTimeoutMs: 180000
    });
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--labview-version');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--labview-bitness');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--provider');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--validate');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('validate-fixture');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--proof-out');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--runtime-timeout-ms');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('Usage: vihs ');
    expect(() => parseLocalRuntimeSettingsCliArgs(['--labview-version'])).toThrow(
      /Missing value for --labview-version/
    );
    expect(() => parseLocalRuntimeSettingsCliArgs(['--provider', 'auto'])).toThrow(
      /Unsupported compare provider/
    );
    expect(() =>
      parseLocalRuntimeSettingsCliArgs(['--labview-bitness', 'arm64'])
    ).toThrow(/Unsupported LabVIEW bitness/);
    expect(() =>
      parseLocalRuntimeSettingsCliArgs(['validate-fixture', '--runtime-timeout-ms', '0'])
    ).toThrow(/Unsupported runtime timeout/);
  });

  it('resolves default VS Code settings paths for Windows and Linux', () => {
    expect(
      resolveDefaultVsCodeSettingsPath(
        'win32',
        { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' },
        () => 'C:\\Users\\tester'
      )
    ).toBe(path.win32.join('C:\\Users\\tester\\AppData\\Roaming', 'Code', 'User', 'settings.json'));

    expect(resolveDefaultVsCodeSettingsPath('linux', {}, () => '/home/tester')).toBe(
      path.posix.join('/home/tester', '.config', 'Code', 'User', 'settings.json')
    );
  });

  it('retains the governed settings-target contract and admitted untrusted-workspace posture', () => {
    expect(
      resolveLocalRuntimeSettingsCliGovernanceContract({
        platform: 'win32',
        env: {
          APPDATA: 'C:\\Users\\tester\\AppData\\Roaming'
        },
        homedir: () => 'C:\\Users\\tester'
      })
    ).toEqual({
      defaultSettingsFilePath: path.win32.join(
        'C:\\Users\\tester\\AppData\\Roaming',
        'Code',
        'User',
        'settings.json'
      ),
      supportedSettingsTargets: ['default-user-settings', 'explicit-settings-file'],
      untrustedWorkspacePosture: 'prepare-command-admitted-compare-blocked'
    });
  });

  it('updates governed provider settings in JSONC targets without destroying unrelated content', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-cli-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(
      settingsFilePath,
      [
        '{',
        '  // keep this comment',
        '  "editor.tabSize": 2,',
        '  "workbench.colorTheme": "Default Dark+",',
        '}',
        ''
      ].join('\n'),
      'utf8'
    );
    const stdout: string[] = [];

    const result = await runLocalRuntimeSettingsCli(
      [
        '--provider',
        'docker',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64',
        '--settings-file',
        settingsFilePath
      ],
      {
        stdout: {
          write(text: string) {
            stdout.push(text);
          }
        }
      }
    );

    expect(result).toEqual({
      outcome: 'updated-settings',
      settingsFilePath,
      settingsTarget: 'explicit-settings-file',
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });

    const updatedSettingsText = await fs.readFile(settingsFilePath, 'utf8');
    expect(updatedSettingsText).toContain('// keep this comment');
    expect(updatedSettingsText).toContain('"editor.tabSize": 2');
    expect(updatedSettingsText).toContain('"workbench.colorTheme": "Default Dark+"');
    expect(parse(updatedSettingsText)).toEqual({
      'editor.tabSize': 2,
      'workbench.colorTheme': 'Default Dark+',
      'viHistorySuite.runtimeProvider': 'docker',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });
    expect(stdout.join('')).toContain(settingsFilePath);
    expect(stdout.join('')).toContain('settingsTarget=explicit-settings-file');
    expect(stdout.join('')).toContain(`settingsFilePath=${settingsFilePath}`);
    expect(stdout.join('')).toContain('viHistorySuite.runtimeProvider=docker');
    expect(stdout.join('')).toContain('viHistorySuite.labviewVersion=2026');
    expect(stdout.join('')).toContain('viHistorySuite.labviewBitness=x64');
    expect(stdout.join('')).toContain(
      'Review Compare or runtime validation again after the CLI update. Reload or restart the window only if this already-running VS Code session still shows stale provider or runtime facts.'
    );
  });

  it('fails closed when the settings target cannot be normalized into one mutable settings object', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-cli-invalid-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(settingsFilePath, '[1, 2, 3]\n', 'utf8');

    await expect(
      runLocalRuntimeSettingsCli(
        [
          '--provider',
          'host',
          '--labview-version',
          '2026',
          '--labview-bitness',
          'x64',
          '--settings-file',
          settingsFilePath
        ],
        {}
      )
    ).rejects.toThrow('VS Code settings.json must contain a JSON object.');
  });

  it('rejects workspace settings targets for both mutation and validation', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-cli-workspace-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, '.vscode', 'settings.json');
    await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
    await fs.writeFile(settingsFilePath, '{}\n', 'utf8');

    await expect(
      runLocalRuntimeSettingsCli(
        [
          '--provider',
          'host',
          '--labview-version',
          '2026',
          '--labview-bitness',
          'x64',
          '--settings-file',
          settingsFilePath
        ],
        {}
      )
    ).rejects.toThrow(
      'Workspace settings are not supported for VI History runtime-settings CLI.'
    );

    await expect(
      runLocalRuntimeSettingsCli(['--validate', '--settings-file', settingsFilePath], {})
    ).rejects.toThrow(
      'Workspace settings are not supported for VI History runtime-settings CLI.'
    );
  });

  it('reports persisted provider/version/bitness truth plus bounded runtime validation outcome', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-cli-validate-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(
      settingsFilePath,
      [
        '{',
        '  "viHistorySuite.runtimeProvider": "mystery",',
        '  "viHistorySuite.labviewVersion": "2026",',
        '  "viHistorySuite.labviewBitness": "x64"',
        '}',
        ''
      ].join('\n'),
      'utf8'
    );
    const stdout: string[] = [];

    const result = await runLocalRuntimeSettingsCli(['--validate', '--settings-file', settingsFilePath], {
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      }
    });

    expect(result).toEqual({
      outcome: 'validated-settings',
      settingsFilePath,
      settingsTarget: 'explicit-settings-file',
      persistedProvider: 'mystery',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64',
      runtimeValidationOutcome: 'blocked',
      runtimeProvider: 'unavailable',
      runtimeEngine: undefined,
      runtimeBlockedReason: 'installed-provider-invalid',
      runtimeErrorCode: 'VIHS_E_PROVIDER_INVALID',
      runtimeProofStatus: 'blocked-with-actionable-error',
      runtimeImplementationStatus: 'blocked-or-missing-prerequisite'
    });

    expect(stdout.join('')).toContain(`Validated explicit-settings-file target ${settingsFilePath}`);
    expect(stdout.join('')).toContain('settingsTarget=explicit-settings-file');
    expect(stdout.join('')).toContain(`settingsFilePath=${settingsFilePath}`);
    expect(stdout.join('')).toContain('viHistorySuite.runtimeProvider=mystery');
    expect(stdout.join('')).toContain('viHistorySuite.labviewVersion=2026');
    expect(stdout.join('')).toContain('viHistorySuite.labviewBitness=x64');
    expect(stdout.join('')).toContain('runtimeValidationOutcome=blocked');
    expect(stdout.join('')).toContain('runtimeProvider=unavailable');
    expect(stdout.join('')).toContain('runtimeEngine=<none>');
    expect(stdout.join('')).toContain('runtimeBlockedReason=installed-provider-invalid');
    expect(stdout.join('')).toContain('runtimeErrorCode=VIHS_E_PROVIDER_INVALID');
    expect(stdout.join('')).toContain('runtimeProofStatus=blocked-with-actionable-error');
    expect(stdout.join('')).toContain(
      'runtimeImplementationStatus=blocked-or-missing-prerequisite'
    );
  });

  it('writes a public validation proof packet and ready-to-file issue body', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-proof-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const proofRoot = path.join(tempRoot, 'proof');
    await fs.writeFile(
      settingsFilePath,
      [
        '{',
        '  "viHistorySuite.runtimeProvider": "docker",',
        '  "viHistorySuite.labviewVersion": "2024",',
        '  "viHistorySuite.labviewBitness": "x64"',
        '}',
        ''
      ].join('\n'),
      'utf8'
    );

    const result = await runLocalRuntimeSettingsCli(
      ['--validate', '--settings-file', settingsFilePath, '--proof-out', proofRoot],
      {
        env: {
          PATH: '/usr/bin',
          SECRET_TOKEN: 'do-not-retain'
        },
        locateRuntime: async (_platform, settings) => ({
          platform: 'linux',
          requestedProvider: settings.requestedProvider,
          bitness: settings.bitness ?? 'x64',
          provider: 'unavailable',
          blockedReason: 'docker-provider-labview-version-not-implemented',
          notes: ['LabVIEW 2024 Docker path is not implemented.'],
          providerDecisions: [
            {
              provider: 'linux-container',
              outcome: 'rejected',
              reason: 'docker-provider-labview-version-not-implemented',
              detail: 'Requested Docker LabVIEW year is not implemented.'
            }
          ],
          registryQueryPlans: [],
          candidates: []
        })
      }
    );

    expect(result).toMatchObject({
      runtimeValidationOutcome: 'blocked',
      runtimeErrorCode: 'VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED',
      runtimeProofStatus: 'blocked-with-actionable-error',
      runtimeImplementationStatus: 'not-implemented',
      proofReportPath: path.join(proofRoot, 'vihs-validation-proof.json'),
      proofIssueBodyPath: path.join(proofRoot, 'vihs-validation-issue.md')
    });
    const proof = JSON.parse(
      await fs.readFile(path.join(proofRoot, 'vihs-validation-proof.json'), 'utf8')
    );
    const issueBody = await fs.readFile(
      path.join(proofRoot, 'vihs-validation-issue.md'),
      'utf8'
    );
    expect(proof).toMatchObject({
      schema: 'vi-history-suite/runtime-validation-proof@v1',
      proofStatus: 'blocked-with-actionable-error',
      implementationStatus: 'not-implemented',
      errorCode: 'VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED',
      settings: {
        provider: 'docker',
        labviewVersion: '2024',
        labviewBitness: 'x64'
      },
      publicIntake: {
        issueChooserUrl: 'https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose',
        suggestedTemplate: 'feature-not-implemented.yml'
      }
    });
    expect(proof.host.env.PATH).toBe('/usr/bin');
    expect(proof.host.env.SECRET_TOKEN).toBe('<redacted-secret-like-env-var>');
    expect(issueBody).toContain('Suggested template: feature-not-implemented.yml');
    expect(issueBody).toContain('VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED');
  });

  it('runs the canonical public fixture validation without mutating settings', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-fixture-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const proofRoot = path.join(tempRoot, 'fixture-proof');
    await fs.writeFile(
      settingsFilePath,
      [
        '{',
        '  "viHistorySuite.runtimeProvider": "host",',
        '  "viHistorySuite.labviewVersion": "2026",',
        '  "viHistorySuite.labviewBitness": "x64"',
        '}',
        ''
      ].join('\n'),
      'utf8'
    );
    const validateFixture = vi.fn().mockResolvedValue({
      outcome: 'validated-fixture',
      proofRootPath: proofRoot,
      proofReportPath: path.join(proofRoot, 'vihs-fixture-validation-proof.json'),
      proofIssueBodyPath: path.join(proofRoot, 'vihs-fixture-validation-issue.md'),
      harnessReportJsonPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.json'),
      harnessReportMarkdownPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.md'),
      harnessReportHtmlPath: path.join(proofRoot, 'reports', 'HARNESS-VHS-002', 'comparison-report-smoke.html'),
      fixture: {},
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      runtimeProvider: 'host-native',
      runtimeEngine: 'labview-cli',
      generatedReportExists: true,
      validationClassification: 'validation-success',
      suggestedIssueTemplate: 'validation-success.yml'
    });
    const stdout: string[] = [];

    const result = await runLocalRuntimeSettingsCli(
      [
        'validate-fixture',
        '--provider',
        'docker',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64',
        '--settings-file',
        settingsFilePath,
        '--proof-out',
        proofRoot,
        '--runtime-timeout-ms',
        '180000'
      ],
      {
        platform: 'linux',
        cwd: () => tempRoot,
        validateFixture: validateFixture as never,
        stdout: {
          write(text: string) {
            stdout.push(text);
          }
        }
      }
    );

    expect(validateFixture).toHaveBeenCalledWith(
      {
        cwd: tempRoot,
        proofOutDirectoryPath: proofRoot,
        runtimePlatform: 'linux',
        runtimeExecutionTimeoutMs: 180000,
        runtimeSettings: {
          requestedProvider: 'docker',
          invalidRequestedProvider: undefined,
          requireVersionAndBitness: true,
          labviewVersion: '2026',
          bitness: 'x64'
        }
      },
      expect.objectContaining({
        now: expect.any(Function)
      })
    );
    expect(result).toMatchObject({
      outcome: 'validated-fixture',
      settingsFilePath,
      settingsTarget: 'explicit-settings-file',
      persistedProvider: 'host',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64',
      proofReportPath: path.join(proofRoot, 'vihs-fixture-validation-proof.json'),
      proofIssueBodyPath: path.join(proofRoot, 'vihs-fixture-validation-issue.md')
    });
    expect(parse(await fs.readFile(settingsFilePath, 'utf8'))).toEqual({
      'viHistorySuite.runtimeProvider': 'host',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });
    expect(stdout.join('')).toContain('Validated canonical public fixture');
    expect(stdout.join('')).toContain('runtimeExecutionState=succeeded');
    expect(stdout.join('')).toContain('validationClassification=validation-success');
  });

  it('accepts UTF-8 BOM-prefixed settings during validation', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-cli-bom-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(
      settingsFilePath,
      '\uFEFF{\n  "viHistorySuite.runtimeProvider": "host",\n  "viHistorySuite.labviewVersion": "2026",\n  "viHistorySuite.labviewBitness": "x64"\n}\n',
      'utf8'
    );

    const result = await runLocalRuntimeSettingsCli(['--validate', '--settings-file', settingsFilePath], {
      locateRuntime: async (_platform, settings) => ({
        platform: 'win32',
        requestedProvider: settings.requestedProvider,
        provider: 'host',
        engine: 'labview-cli',
        bitness: settings.bitness ?? 'x64',
        notes: [],
        registryQueryPlans: [],
        candidates: []
      })
    });

    expect(result).toMatchObject({
      outcome: 'validated-settings',
      settingsFilePath,
      persistedProvider: 'host',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64',
      runtimeValidationOutcome: 'ready',
      runtimeProvider: 'host'
    });
  });

  it('returns a non-zero exit code when required settings arguments are missing', async () => {
    const stderr: string[] = [];

    await expect(
      runLocalRuntimeSettingsCliMain(['--provider', 'host', '--labview-version', '2026'], {
        stderr: {
          write(text: string) {
            stderr.push(text);
          }
        }
      })
    ).resolves.toBe(1);

    expect(stderr.join('')).toContain('Missing required --labview-bitness');
  });

  it('prints bare vihs copyable next commands when invoked without arguments', async () => {
    const stdout: string[] = [];

    const result = await runLocalRuntimeSettingsCli([], {
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      }
    });

    expect(result).toEqual({ outcome: 'help' });
    expect(stdout.join('')).toContain('VI History runtime-settings terminal entrypoint');
    expect(stdout.join('')).toContain(
      'vihs --provider host --labview-version 2026 --labview-bitness x64'
    );
    expect(stdout.join('')).toContain(
      'vihs --provider docker --labview-version 2026 --labview-bitness x64'
    );
    expect(stdout.join('')).toContain('vihs --validate');
  });

  it('materializes launchers under global storage without shipping a separate binary payload', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-launchers-'));
    tempDirectories.push(tempRoot);

    const globalStoragePath = path.join(tempRoot, 'global storage');
    const extensionPath = path.join(tempRoot, 'extension with spaces');
    const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(modulePath, 'exports.runLocalRuntimeSettingsCliMain = async () => 0;\n', 'utf8');

    const expectedPlan = buildLocalRuntimeSettingsCliMaterialization(globalStoragePath, extensionPath);
    const materialized = await ensureLocalRuntimeSettingsCli(globalStoragePath, extensionPath);

    expect(materialized).toEqual(expectedPlan);
    await expect(fs.access(materialized.javascriptLauncherPath)).resolves.toBeUndefined();
    await expect(fs.access(materialized.windowsLauncherPath)).resolves.toBeUndefined();
    await expect(fs.access(materialized.posixLauncherPath)).resolves.toBeUndefined();
    await expect(fs.access(materialized.windowsTerminalEntrypointPath)).resolves.toBeUndefined();
    await expect(fs.access(materialized.posixTerminalEntrypointPath)).resolves.toBeUndefined();

    if (process.platform === 'win32') {
      expect(materialized.currentPlatformLauncherPath).toBe(materialized.windowsLauncherPath);
      expect(materialized.currentPlatformTerminalEntrypointPath).toBe(
        materialized.windowsTerminalEntrypointPath
      );
    } else {
      expect(materialized.currentPlatformLauncherPath).toBe(materialized.posixLauncherPath);
      expect(materialized.currentPlatformTerminalEntrypointPath).toBe(
        materialized.posixTerminalEntrypointPath
      );
    }

    const javascriptLauncher = await fs.readFile(materialized.javascriptLauncherPath, 'utf8');
    const windowsLauncher = await fs.readFile(materialized.windowsLauncherPath, 'utf8');
    const posixLauncher = await fs.readFile(materialized.posixLauncherPath, 'utf8');
    const windowsTerminalEntrypoint = await fs.readFile(
      materialized.windowsTerminalEntrypointPath,
      'utf8'
    );
    const posixTerminalEntrypoint = await fs.readFile(
      materialized.posixTerminalEntrypointPath,
      'utf8'
    );

    expect(javascriptLauncher).toContain(JSON.stringify(materialized.modulePath));
    expect(javascriptLauncher).toContain(
      'VI History runtime-settings CLI launcher is stale or incomplete.'
    );
    expect(windowsLauncher).toContain('run-local-runtime-settings-cli.js');
    expect(windowsLauncher).toContain('VI_HISTORY_SUITE_NODE_EXE');
    expect(windowsLauncher).toContain('Microsoft VS Code\\Code.exe');
    expect(windowsLauncher).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(windowsLauncher).toContain('for %%I in (node.exe) do');
    expect(windowsLauncher).toContain(
      'VI History runtime-settings CLI requires the standard VS Code runtime or a usable Node.js runtime.'
    );
    expect(posixLauncher).toContain('run-local-runtime-settings-cli.js');
    expect(posixLauncher).toContain('command -v node >/dev/null 2>&1');
    expect(posixLauncher).toContain(
      'VI History runtime-settings CLI requires the standard VS Code runtime or a usable Node.js runtime.'
    );
    expect(windowsTerminalEntrypoint).toContain('run-local-runtime-settings-cli.js');
    expect(posixTerminalEntrypoint).toContain('run-local-runtime-settings-cli.js');
    expect(materialized.terminalCommandName).toBe('vihs');
    expect(materialized.pathPrependValue).toBe(
      `${materialized.rootDirectoryPath}${process.platform === 'win32' ? ';' : ':'}`
    );
    expect(materialized.exampleCommand).toContain('--provider host');
    expect(materialized.exampleCommand).toBe(materialized.nextCommand);
    expect(materialized.nextCommand).toContain('vihs --provider host');
  });

  it('executes the Windows launcher through an explicit Node runtime override without PATH node', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-node-override-'));
    tempDirectories.push(tempRoot);

    const globalStoragePath = path.join(tempRoot, 'global storage');
    const extensionPath = path.join(tempRoot, 'extension with spaces');
    const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');
    const markerPath = path.join(tempRoot, 'marker.txt');
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(
      modulePath,
      [
        'const fs = require("node:fs");',
        `exports.runLocalRuntimeSettingsCliMain = async () => { fs.writeFileSync(${JSON.stringify(markerPath)}, "ok\\n"); return 0; };`,
        ''
      ].join('\n'),
      'utf8'
    );

    const materialized = await ensureLocalRuntimeSettingsCli(globalStoragePath, extensionPath);
    const result = await execFile('cmd.exe', ['/d', '/c', 'call', materialized.windowsLauncherPath], {
      encoding: 'utf8',
      env: {
        ComSpec: process.env.ComSpec,
        PATHEXT: process.env.PATHEXT,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATH: path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
        VI_HISTORY_SUITE_NODE_EXE: process.execPath
      }
    });

    expect(result.stderr).toBe('');
    await expect(fs.readFile(markerPath, 'utf8')).resolves.toBe('ok\n');
  });

  it('admits the bare vihs terminal entrypoint through PATH prepend', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-admission-'));
    tempDirectories.push(tempRoot);

    const globalStoragePath = path.join(tempRoot, 'global storage');
    const extensionPath = path.join(tempRoot, 'extension with spaces');
    const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(modulePath, 'exports.runLocalRuntimeSettingsCliMain = async () => 0;\n', 'utf8');

    const prepends: Array<{ name: string; value: string }> = [];
    const persistedPathEntries: string[] = [];
    const admitted = await admitLocalRuntimeSettingsCliToTerminalPath(
      globalStoragePath,
      extensionPath,
      {
        prepend(name: string, value: string) {
          prepends.push({ name, value });
        }
      },
      {
        platform: 'win32',
        persistWindowsUserPathPrepend: async (pathEntry: string) => {
          persistedPathEntries.push(pathEntry);
        }
      }
    );

    expect(prepends).toEqual([
      {
        name: 'PATH',
        value: admitted.pathPrependValue
      }
    ]);
    expect(persistedPathEntries).toEqual([admitted.rootDirectoryPath]);
    await expect(fs.access(admitted.currentPlatformTerminalEntrypointPath)).resolves.toBeUndefined();
  });

  it('skips persistent user PATH admission when the test guard disables it', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-admission-disabled-'));
    tempDirectories.push(tempRoot);

    const globalStoragePath = path.join(tempRoot, 'global storage');
    const extensionPath = path.join(tempRoot, 'extension with spaces');
    const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(modulePath, 'exports.runLocalRuntimeSettingsCliMain = async () => 0;\n', 'utf8');

    const persistedPathEntries: string[] = [];
    await admitLocalRuntimeSettingsCliToTerminalPath(
      globalStoragePath,
      extensionPath,
      {
        prepend() {}
      },
      {
        platform: 'win32',
        env: {
          VI_HISTORY_SUITE_DISABLE_PERSISTENT_USER_PATH_ADMISSION: '1'
        },
        persistWindowsUserPathPrepend: async (pathEntry: string) => {
          persistedPathEntries.push(pathEntry);
        }
      }
    );

    expect(persistedPathEntries).toEqual([]);
  });

  it('seeds default host settings and validates them when interactive vihs accepts defaults', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-interactive-defaults-'));
    tempDirectories.push(tempRoot);

    const appDataRoot = path.join(tempRoot, 'AppData', 'Roaming');
    const settingsFilePath = resolveDefaultVsCodeSettingsPath(
      'win32',
      { APPDATA: appDataRoot },
      () => tempRoot
    );
    const stdout: string[] = [];
    const prompts = ['', '', '', ''];

    const result = await runInteractiveLocalRuntimeSettingsCli({
      platform: 'win32',
      env: {
        APPDATA: appDataRoot
      },
      homedir: () => tempRoot,
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      },
      promptLine: async () => prompts.shift() ?? '',
      locateRuntime: async (_platform, settings) => ({
        platform: 'win32',
        requestedProvider: settings.requestedProvider,
        bitness: settings.bitness ?? 'x64',
        provider: 'host-native',
        engine: 'labview-cli',
        notes: [],
        registryQueryPlans: [],
        candidates: []
      })
    });

    expect(result.outcome).toBe('validated-settings');
    expect(result.runtimeValidationOutcome).toBe('ready');
    expect(result.runtimeProvider).toBe('host-native');
    expect(parse(await fs.readFile(settingsFilePath, 'utf8'))).toEqual({
      'viHistorySuite.runtimeProvider': 'host',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });
    expect(stdout.join('')).toContain(
      `Created default VI History runtime settings at ${settingsFilePath} with host/windows/2026/x64.`
    );
    expect(stdout.join('')).toContain(
      'Current VI History settings: provider=host, platform=windows, labviewVersion=2026, labviewBitness=x64'
    );
    expect(stdout.join('')).toContain('runtimeValidationOutcome=ready');
  });

  it('accepts a host year selection and reports the runtime failure instead of hiding the variant', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-interactive-host-year-'));
    tempDirectories.push(tempRoot);

    const appDataRoot = path.join(tempRoot, 'AppData', 'Roaming');
    const settingsFilePath = resolveDefaultVsCodeSettingsPath(
      'win32',
      { APPDATA: appDataRoot },
      () => tempRoot
    );
    const stdout: string[] = [];
    const prompts = ['', '', '2024', ''];

    const result = await runInteractiveLocalRuntimeSettingsCli({
      platform: 'win32',
      env: {
        APPDATA: appDataRoot
      },
      homedir: () => tempRoot,
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      },
      promptLine: async () => prompts.shift() ?? '',
      locateRuntime: async (_platform, settings) => {
        if (settings.requestedProvider === 'host' && settings.labviewVersion === '2024') {
          return {
            platform: 'win32',
            requestedProvider: settings.requestedProvider,
            bitness: settings.bitness ?? 'x64',
            provider: 'unavailable',
            blockedReason: 'labview-exe-not-found',
            notes: [],
            registryQueryPlans: [],
            candidates: []
          };
        }

        return {
          platform: 'win32',
          requestedProvider: settings.requestedProvider,
          bitness: settings.bitness ?? 'x64',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        };
      }
    });

    expect(result.runtimeValidationOutcome).toBe('blocked');
    expect(result.runtimeBlockedReason).toBe('labview-exe-not-found');
    expect(result.runtimeErrorCode).toBe('VIHS_E_LABVIEW_NOT_FOUND');
    expect(parse(await fs.readFile(settingsFilePath, 'utf8'))).toEqual({
      'viHistorySuite.runtimeProvider': 'host',
      'viHistorySuite.labviewVersion': '2024',
      'viHistorySuite.labviewBitness': 'x64'
    });
  });

  it('accepts not-yet-implemented Docker variants and reports stable error codes', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-interactive-docker-'));
    tempDirectories.push(tempRoot);

    const appDataRoot = path.join(tempRoot, 'AppData', 'Roaming');
    const settingsFilePath = resolveDefaultVsCodeSettingsPath(
      'win32',
      { APPDATA: appDataRoot },
      () => tempRoot
    );
    const stdout: string[] = [];
    const prompts = ['docker', 'linux', '2024', ''];

    const result = await runInteractiveLocalRuntimeSettingsCli({
      platform: 'win32',
      env: {
        APPDATA: appDataRoot
      },
      homedir: () => tempRoot,
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      },
      promptLine: async () => prompts.shift() ?? '',
      locateRuntime: async (_platform, settings) => {
        expect(settings).toEqual(
          expect.objectContaining({
            requestedProvider: 'docker',
            labviewVersion: '2024',
            bitness: 'x64'
          })
        );
        return {
          platform: 'win32',
          requestedProvider: settings.requestedProvider,
          bitness: settings.bitness ?? 'x64',
          provider: 'unavailable',
          blockedReason: 'docker-provider-labview-version-not-implemented',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        };
      }
    });

    expect(result.runtimeValidationOutcome).toBe('blocked');
    expect(result.runtimeProvider).toBe('unavailable');
    expect(result.runtimeBlockedReason).toBe('docker-provider-labview-version-not-implemented');
    expect(result.runtimeErrorCode).toBe('VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED');
    expect(result.runtimeImplementationStatus).toBe('not-implemented');
    expect(parse(await fs.readFile(settingsFilePath, 'utf8'))).toEqual({
      'viHistorySuite.runtimeProvider': 'docker',
      'viHistorySuite.labviewVersion': '2024',
      'viHistorySuite.labviewBitness': 'x64'
    });
  });

  it('admits docker/linux 2026 x64 on Linux Docker hosts during interactive vihs selection', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-interactive-linux-docker-'));
    tempDirectories.push(tempRoot);

    const configRoot = path.join(tempRoot, '.config');
    const settingsFilePath = resolveDefaultVsCodeSettingsPath(
      'linux',
      { XDG_CONFIG_HOME: configRoot },
      () => tempRoot
    );
    const stdout: string[] = [];
    const prompts = ['docker', 'linux', '', ''];

    const result = await runInteractiveLocalRuntimeSettingsCli({
      platform: 'linux',
      env: {
        XDG_CONFIG_HOME: configRoot
      },
      homedir: () => tempRoot,
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      },
      promptLine: async () => prompts.shift() ?? '',
      locateRuntime: async (platform, settings) => {
        expect(platform).toBe('linux');
        expect(settings).toEqual(
          expect.objectContaining({
            requestedProvider: 'docker',
            requireVersionAndBitness: true,
            labviewVersion: '2026',
            bitness: 'x64'
          })
        );
        return {
          platform: 'linux',
          requestedProvider: settings.requestedProvider,
          bitness: settings.bitness ?? 'x64',
          provider: 'linux-container',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        };
      }
    });

    expect(result.runtimeValidationOutcome).toBe('ready');
    expect(result.runtimeProvider).toBe('linux-container');
    expect(stdout.join('')).toContain('runtimeValidationOutcome=ready');
    expect(stdout.join('')).toContain('runtimeProvider=linux-container');
    expect(stdout.join('')).not.toContain('docker/linux is not currently implemented');
    expect(parse(await fs.readFile(settingsFilePath, 'utf8'))).toEqual({
      'viHistorySuite.runtimeProvider': 'docker',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });
  });

  it('fails closed with a stable stale-launcher message when the generated module is missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-stale-launcher-'));
    tempDirectories.push(tempRoot);

    const globalStoragePath = path.join(tempRoot, 'global storage');
    const extensionPath = path.join(tempRoot, 'extension with spaces');
    const modulePath = path.join(extensionPath, 'out', 'tooling', 'localRuntimeSettingsCli.js');
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(modulePath, 'exports.runLocalRuntimeSettingsCliMain = async () => 0;\n', 'utf8');

    const materialized = await ensureLocalRuntimeSettingsCli(globalStoragePath, extensionPath);
    await fs.rm(modulePath, { force: true });

    const result = await execFile(process.execPath, [materialized.javascriptLauncherPath], {
      encoding: 'utf8'
    }).catch((error: Error & { stdout?: string; stderr?: string; code?: number }) => error);

    expect(result.code).toBe(1);
    expect(result.stderr ?? '').toContain(
      'VI History runtime-settings CLI launcher is stale or incomplete.'
    );
    expect(result.stderr ?? '').toContain(materialized.modulePath);
  });
});
