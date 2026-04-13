import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildLocalRuntimeSettingsCliMaterialization,
  ensureLocalRuntimeSettingsCli,
  getLocalRuntimeSettingsCliUsage,
  parseLocalRuntimeSettingsCliArgs,
  resolveDefaultVsCodeSettingsPath,
  runLocalRuntimeSettingsCli,
  runLocalRuntimeSettingsCliMain
} from '../../src/tooling/localRuntimeSettingsCli';

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
        './settings.json'
      ])
    ).toEqual({
      helpRequested: false,
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      settingsFilePath: './settings.json'
    });

    expect(parseLocalRuntimeSettingsCliArgs(['--help'])).toEqual({
      helpRequested: true
    });
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--labview-version');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--labview-bitness');
    expect(getLocalRuntimeSettingsCliUsage()).toContain('--provider');
    expect(() => parseLocalRuntimeSettingsCliArgs(['--labview-version'])).toThrow(
      /Missing value for --labview-version/
    );
    expect(() => parseLocalRuntimeSettingsCliArgs(['--provider', 'auto'])).toThrow(
      /Unsupported compare provider/
    );
    expect(() =>
      parseLocalRuntimeSettingsCliArgs(['--labview-bitness', 'arm64'])
    ).toThrow(/Unsupported LabVIEW bitness/);
  });

  it('resolves default VS Code settings paths for Windows and Linux', () => {
    expect(
      resolveDefaultVsCodeSettingsPath(
        'win32',
        { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' },
        () => 'C:\\Users\\tester'
      )
    ).toBe('C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\settings.json');

    expect(resolveDefaultVsCodeSettingsPath('linux', {}, () => '/home/tester')).toBe(
      '/home/tester/.config/Code/User/settings.json'
    );
  });

  it('writes provider, LabVIEW version, and bitness into the target VS Code settings file', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-local-runtime-cli-'));
    tempDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(
      settingsFilePath,
      `${JSON.stringify({ 'editor.tabSize': 2 }, null, 2)}\n`,
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
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });

    expect(JSON.parse(await fs.readFile(settingsFilePath, 'utf8'))).toEqual({
      'editor.tabSize': 2,
      'viHistorySuite.runtimeProvider': 'docker',
      'viHistorySuite.labviewVersion': '2026',
      'viHistorySuite.labviewBitness': 'x64'
    });
    expect(stdout.join('')).toContain(settingsFilePath);
    expect(stdout.join('')).toContain('viHistorySuite.runtimeProvider=docker');
    expect(stdout.join('')).toContain('viHistorySuite.labviewVersion=2026');
    expect(stdout.join('')).toContain('viHistorySuite.labviewBitness=x64');
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

    const javascriptLauncher = await fs.readFile(materialized.javascriptLauncherPath, 'utf8');
    const windowsLauncher = await fs.readFile(materialized.windowsLauncherPath, 'utf8');
    const posixLauncher = await fs.readFile(materialized.posixLauncherPath, 'utf8');

    expect(javascriptLauncher).toContain(JSON.stringify(materialized.modulePath));
    expect(windowsLauncher).toContain('run-local-runtime-settings-cli.js');
    expect(windowsLauncher).not.toContain('PATH=');
    expect(posixLauncher).toContain('run-local-runtime-settings-cli.js');
    expect(posixLauncher).not.toContain('PATH=');
    expect(materialized.exampleCommand).toContain('--provider host');
  });
});
