import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const tempRoots = new Set<string>();

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function registerTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.add(root);
  return root;
}

function buildWindowsShellEnv(homeRoot: string, appDataRoot: string): NodeJS.ProcessEnv {
  const parsedHomeRoot = path.parse(homeRoot);
  const homeDrive = parsedHomeRoot.root.replace(/[\\\/]+$/, '');
  const homePath = homeRoot.slice(parsedHomeRoot.root.length - 1);

  return {
    ...process.env,
    HOME: homeRoot,
    USERPROFILE: homeRoot,
    HOMEDRIVE: homeDrive,
    HOMEPATH: homePath,
    APPDATA: appDataRoot
  };
}

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  tempRoots.clear();
});

describe('install vihs extension bootstrap script', () => {
  it('retains the governed Windows PowerShell install bootstrap contract', () => {
    const script = readText('scripts/install-vihs-extension.ps1');

    expect(script).toContain("$ExtensionId = 'svelderrainruiz.vi-history-suite'");
    expect(script).toContain('[string]$VsixPath');
    expect(script).toContain('[string]$UserDataDir');
    expect(script).toContain('[string]$ExtensionsRoot');
    expect(script).toContain('[switch]$SkipUserPathPersist');
    expect(script).toContain('function Resolve-VSCodeCliCommand');
    expect(script).toContain('function Resolve-VSCodeUserDataDir');
    expect(script).toContain('function Resolve-VSCodeSettingsPath');
    expect(script).toContain('function Resolve-VSCodeExtensionsRoot');
    expect(script).toContain("\\bin\\code.cmd");
    expect(script).toContain("Resolve-VihsGlobalStorageRoot");
    expect(script).toContain("vihs.cmd");
    expect(script).toContain("vihs-runtime-settings.cmd");
    expect(script).toContain("VI_HISTORY_SUITE_NODE_EXE");
    expect(script).toContain("ELECTRON_RUN_AS_NODE=1");
    expect(script).toContain("Microsoft VS Code\\Code.exe");
    expect(script).toContain("Ensure-WindowsUserPathPrepend");
    expect(script).toContain("--user-data-dir");
    expect(script).toContain("--extensions-dir");
    expect(script).toContain("exact VSIX $ResolvedVsixPath");
    expect(script).toContain("does not yet include the vihs terminal-entrypoint surface");
    expect(script).toContain("Current VI History install settings:");
    expect(script).toContain("Provider");
    expect(script).toContain("LabVIEW year");
    expect(script).toContain("Bitness");
    expect(script).toContain("LabVIEW $labviewVersion not installed.");
    expect(script).toContain("Seeded default VI History runtime settings");
    expect(script).toContain("Interactive input was not available.");
    expect(script).toContain("Next commands:");
    expect(script).toContain("vihs --validate");
    expect(script).toContain("System.Text.UTF8Encoding($false)");
    expect(script).toContain("[System.IO.File]::WriteAllText");
  });

  it.runIf(process.platform === 'win32')(
    'executes under powershell -File and seeds the governed default bundle in noninteractive mode',
    () => {
      const proofRoot = registerTempRoot('vihs-install-bootstrap-proof-');
      const homeRoot = path.join(proofRoot, 'home');
      const appDataRoot = path.join(proofRoot, 'appdata');
      const settingsPath = path.join(proofRoot, 'settings.json');
      const extensionRoot = path.join(
        homeRoot,
        '.vscode',
        'extensions',
        'svelderrainruiz.vi-history-suite-proof',
        'out',
        'tooling'
      );
      fs.mkdirSync(extensionRoot, { recursive: true });
      fs.writeFileSync(
        path.join(extensionRoot, 'localRuntimeSettingsCli.js'),
        'exports.runLocalRuntimeSettingsCliMain = async () => 0;\n',
        'utf8'
      );

      const output = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(repoRoot, 'scripts', 'install-vihs-extension.ps1'),
          '-SkipInstall',
          '-NonInteractive',
          '-ExtensionId',
          'svelderrainruiz.vi-history-suite',
          '-SettingsFilePath',
          settingsPath
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: buildWindowsShellEnv(homeRoot, appDataRoot)
        }
      );

      const settingsText = fs.readFileSync(settingsPath, 'utf8');
      const launcherRoot = path.join(
        appDataRoot,
        'Code',
        'User',
        'globalStorage',
        'svelderrainruiz.vi-history-suite',
        'local-runtime-settings-cli'
      );

      expect(output).toContain('Interactive input was not available.');
      expect(output).toContain(`settingsFilePath=${settingsPath}`);
      expect(output).toContain('viHistorySuite.runtimeProvider=host');
      expect(output).toContain('viHistorySuite.labviewVersion=2026');
      expect(output).toContain('viHistorySuite.labviewBitness=x64');
      expect(output).toContain(`launcherRoot=${launcherRoot}`);
      expect(output).toContain('  vihs');
      expect(output).toContain('  vihs --validate');

      expect(settingsText).toContain('"viHistorySuite.runtimeProvider": "host"');
      expect(settingsText).toContain('"viHistorySuite.labviewVersion": "2026"');
      expect(settingsText).toContain('"viHistorySuite.labviewBitness": "x64"');
      expect(settingsText.charCodeAt(0)).not.toBe(0xfeff);
      expect(fs.existsSync(path.join(launcherRoot, 'vihs.cmd'))).toBe(true);
      expect(fs.existsSync(path.join(launcherRoot, 'vihs-runtime-settings.cmd'))).toBe(true);
      const launcherText = fs.readFileSync(path.join(launcherRoot, 'vihs.cmd'), 'utf8');
      expect(launcherText).toContain('VI_HISTORY_SUITE_NODE_EXE');
      expect(launcherText).toContain('Microsoft VS Code\\Code.exe');
      expect(launcherText).toContain('ELECTRON_RUN_AS_NODE=1');
    }
  );

  it.runIf(process.platform === 'win32')(
    'falls back from Code.exe to the governed bin\\code.cmd CLI during install',
    () => {
      const proofRoot = registerTempRoot('vihs-install-bootstrap-cli-proof-');
      const homeRoot = path.join(proofRoot, 'home');
      const appDataRoot = path.join(proofRoot, 'appdata');
      const settingsPath = path.join(proofRoot, 'settings.json');
      const extensionRoot = path.join(
        homeRoot,
        '.vscode',
        'extensions',
        'svelderrainruiz.vi-history-suite-proof',
        'out',
        'tooling'
      );
      const fakeVsCodeRoot = path.join(proofRoot, 'Program Files', 'Microsoft VS Code');
      const fakeCliBinRoot = path.join(fakeVsCodeRoot, 'bin');
      const fakeCliLogPath = path.join(proofRoot, 'code-cli.log');

      fs.mkdirSync(extensionRoot, { recursive: true });
      fs.mkdirSync(fakeCliBinRoot, { recursive: true });
      fs.writeFileSync(
        path.join(extensionRoot, 'localRuntimeSettingsCli.js'),
        'exports.runLocalRuntimeSettingsCliMain = async () => 0;\n',
        'utf8'
      );
      fs.writeFileSync(path.join(fakeVsCodeRoot, 'Code.exe'), '', 'utf8');
      fs.writeFileSync(
        path.join(fakeCliBinRoot, 'code.cmd'),
        `@echo off\r\nsetlocal\r\necho %* > "${fakeCliLogPath.replace(/\\/g, '\\\\')}"\r\nexit /b 0\r\n`,
        'ascii'
      );

      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(repoRoot, 'scripts', 'install-vihs-extension.ps1'),
          '-NonInteractive',
          '-CodeCommand',
          path.join(fakeVsCodeRoot, 'Code.exe'),
          '-ExtensionId',
          'svelderrainruiz.vi-history-suite',
          '-SettingsFilePath',
          settingsPath
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: buildWindowsShellEnv(homeRoot, appDataRoot)
        }
      );

      const cliLogText = fs.readFileSync(fakeCliLogPath, 'utf8');
      expect(cliLogText).toContain('--install-extension svelderrainruiz.vi-history-suite --force');
      expect(cliLogText).toContain(`--user-data-dir ${path.join(appDataRoot, 'Code')}`);
      expect(cliLogText).toContain(
        `--extensions-dir ${path.join(homeRoot, '.vscode', 'extensions')}`
      );
    }
  );
});
