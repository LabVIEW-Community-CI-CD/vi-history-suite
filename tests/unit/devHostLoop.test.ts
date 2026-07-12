import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildViHistoryDevHostLaunchPlan,
  canWriteDirectory,
  formatViHistoryDevHostSummary,
  getViHistoryDevHostUsage,
  launchViHistoryDevHost,
  parseViHistoryDevHostArgs,
  prepareViHistoryDevHostWorkspace,
  resolveViHistoryCodeExecutablePath,
  resolveViHistoryDevHostRuntimeRoot,
  stageViHistoryDevHostExtension,
  toWindowsPath,
  type LaunchViHistoryDevHostDeps,
  type PrepareViHistoryDevHostWorkspaceDeps,
  type ViHistoryDevHostWorkspaceMetadata
} from '../../src/tooling/devHostLoop';

describe('devHostLoop', () => {
  const tempRoots: string[] = [];

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempRoots.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const dir = tempRoots.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  describe('getViHistoryDevHostUsage', () => {
    it('describes usage and every supported flag', () => {
      const usage = getViHistoryDevHostUsage();
      expect(usage).toContain('Usage:');
      for (const flag of [
        '--workspace-path',
        '--code-path',
        '--stage-extension',
        '--prepare-workspace-only',
        '--help'
      ]) {
        expect(usage).toContain(flag);
      }
    });
  });

  describe('parseViHistoryDevHostArgs', () => {
    it('returns defaults for an empty argument vector', () => {
      expect(parseViHistoryDevHostArgs([])).toEqual({
        workspacePath: undefined,
        codePath: undefined,
        stageExtension: false,
        prepareWorkspaceOnly: false,
        helpRequested: false
      });
    });

    it('parses value flags and boolean flags', () => {
      expect(parseViHistoryDevHostArgs(['--workspace-path', '/tmp/ws']).workspacePath).toBe(
        '/tmp/ws'
      );
      expect(parseViHistoryDevHostArgs(['--code-path', '/tmp/code']).codePath).toBe('/tmp/code');
      expect(parseViHistoryDevHostArgs(['--stage-extension']).stageExtension).toBe(true);
      expect(parseViHistoryDevHostArgs(['--prepare-workspace-only']).prepareWorkspaceOnly).toBe(
        true
      );
      expect(parseViHistoryDevHostArgs(['--help']).helpRequested).toBe(true);
      expect(parseViHistoryDevHostArgs(['-h']).helpRequested).toBe(true);
    });

    it('throws when a value flag is missing its value or precedes another flag', () => {
      expect(() => parseViHistoryDevHostArgs(['--workspace-path'])).toThrow(
        /Missing value for --workspace-path/
      );
      expect(() =>
        parseViHistoryDevHostArgs(['--workspace-path', '--code-path', '/tmp/code'])
      ).toThrow(/Missing value for --workspace-path/);
    });

    it('throws on an unknown argument', () => {
      expect(() => parseViHistoryDevHostArgs(['--bogus'])).toThrow(/Unknown argument: --bogus/);
    });
  });

  describe('toWindowsPath', () => {
    it('normalizes Windows, /mnt, and relative paths while rejecting other POSIX paths', () => {
      expect(toWindowsPath('C:\\a\\b')).toBe(path.win32.normalize('C:\\a\\b'));
      expect(toWindowsPath('/mnt/c/foo/bar')).toBe(path.win32.normalize('C:\\foo\\bar'));
      expect(toWindowsPath('rel/seg')).toBe(path.win32.normalize('rel\\seg'));
      expect(() => toWindowsPath('/usr/x')).toThrow(/Unsupported non-Windows path/);
    });
  });

  describe('canWriteDirectory', () => {
    it('reports true for a writable directory and false when the parent is a file', async () => {
      const base = await makeTempDir('vihs-devhost-canwrite-');

      expect(await canWriteDirectory(path.join(base, 'writable'))).toBe(true);

      const filePath = path.join(base, 'a-file');
      await fs.writeFile(filePath, 'contents', 'utf8');
      expect(await canWriteDirectory(path.join(filePath, 'sub'))).toBe(false);
    });
  });

  describe('resolveViHistoryDevHostRuntimeRoot', () => {
    it('returns the default runtime root when it is writable', async () => {
      const repoRoot = await makeTempDir('vihs-devhost-runtime-writable-');
      const first = await resolveViHistoryDevHostRuntimeRoot(repoRoot, async () => true);
      const second = await resolveViHistoryDevHostRuntimeRoot(repoRoot, async () => true);

      expect(second).toBe(first);
      expect(first).not.toBe(path.join(repoRoot, '.cache', 'dev-host'));
    });

    it('falls back to the repo cache directory when the default root is not writable', async () => {
      const repoRoot = await makeTempDir('vihs-devhost-runtime-fallback-');
      const runtimeRoot = await resolveViHistoryDevHostRuntimeRoot(repoRoot, async () => false);

      expect(runtimeRoot).toBe(path.join(repoRoot, '.cache', 'dev-host'));
      expect((await fs.stat(runtimeRoot)).isDirectory()).toBe(true);
    });
  });

  describe('resolveViHistoryCodeExecutablePath', () => {
    it('returns an explicit code path when it exists and throws when it does not', async () => {
      const base = await makeTempDir('vihs-devhost-code-');
      const codePath = path.join(base, 'Code.exe');
      await fs.writeFile(codePath, 'binary', 'utf8');

      expect(resolveViHistoryCodeExecutablePath(codePath)).toBe(codePath);
      expect(() => resolveViHistoryCodeExecutablePath(path.join(base, 'missing.exe'))).toThrow(
        /VS Code executable not found/
      );
    });
  });

  describe('prepareViHistoryDevHostWorkspace', () => {
    it('initializes git, writes fixtures, and returns metadata with a written manifest', async () => {
      const workspacePath = await makeTempDir('vihs-devhost-workspace-');
      const gitRunner = vi.fn(async () => '');

      const metadata = await prepareViHistoryDevHostWorkspace(workspacePath, {
        gitRunner: gitRunner as unknown as PrepareViHistoryDevHostWorkspaceDeps['gitRunner']
      });

      expect(gitRunner).toHaveBeenCalledWith(['init'], workspacePath);
      expect(gitRunner).toHaveBeenCalledWith(
        ['config', 'user.name', 'VI History Suite Dev Host'],
        workspacePath
      );
      expect(gitRunner).toHaveBeenCalledWith(
        ['config', 'user.email', 'vihs-dev-host@example.invalid'],
        workspacePath
      );
      expect(gitRunner).toHaveBeenCalledWith(['add', '.'], workspacePath);
      expect(gitRunner).toHaveBeenCalledWith(
        ['commit', '-m', 'Add initial dev-host fixtures'],
        workspacePath
      );
      expect(gitRunner).toHaveBeenCalledWith(
        ['commit', '-m', 'Update dev-host eligible fixture'],
        workspacePath
      );
      expect(gitRunner).toHaveBeenCalledWith(
        ['commit', '-m', 'Add third dev-host eligible fixture revision'],
        workspacePath
      );

      expect(metadata.workspacePath).toBe(workspacePath);
      expect(metadata.eligibleRelativePath).toBe('fixtures/eligible-dev-loop.vi');
      expect(metadata.ineligibleRelativePath).toBe('fixtures/ineligible-dev-loop.bin');
      expect(metadata.metadataPath).toBe(path.join(workspacePath, '.vihs-dev-host-meta.json'));

      const written = JSON.parse(await fs.readFile(metadata.metadataPath, 'utf8'));
      expect(written).toEqual(metadata);
      expect(
        (await fs.stat(path.join(workspacePath, 'fixtures', 'eligible-dev-loop.vi'))).isFile()
      ).toBe(true);
      expect(
        (await fs.stat(path.join(workspacePath, 'fixtures', 'ineligible-dev-loop.bin'))).isFile()
      ).toBe(true);
      expect(
        (await fs.stat(path.join(workspacePath, '.vscode', 'settings.json'))).isFile()
      ).toBe(true);
    });
  });

  describe('stageViHistoryDevHostExtension', () => {
    it('copies package.json and the out/ tree into the stage root', async () => {
      const repoRoot = await makeTempDir('vihs-devhost-stage-src-');
      const stageRoot = await makeTempDir('vihs-devhost-stage-dest-');

      await fs.writeFile(path.join(repoRoot, 'package.json'), '{"name":"dev-host"}', 'utf8');
      await fs.mkdir(path.join(repoRoot, 'out', 'nested'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'out', 'extension.js'), 'entry', 'utf8');
      await fs.writeFile(path.join(repoRoot, 'out', 'nested', 'inner.js'), 'inner', 'utf8');

      const result = await stageViHistoryDevHostExtension(repoRoot, stageRoot);

      expect(result).toBe(stageRoot);
      expect(await fs.readFile(path.join(stageRoot, 'package.json'), 'utf8')).toBe(
        '{"name":"dev-host"}'
      );
      expect(await fs.readFile(path.join(stageRoot, 'out', 'extension.js'), 'utf8')).toBe('entry');
      expect(await fs.readFile(path.join(stageRoot, 'out', 'nested', 'inner.js'), 'utf8')).toBe(
        'inner'
      );
    });
  });

  describe('buildViHistoryDevHostLaunchPlan', () => {
    it('builds launch args and windows paths for a POSIX-style runtime root and /mnt workspace', () => {
      const plan = buildViHistoryDevHostLaunchPlan({
        codeExecutablePath: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        runtimeRoot: '/tmp/rt',
        repoRoot: '/tmp/repo',
        workspacePath: '/mnt/c/ws/repo',
        extensionDevelopmentPath: '/mnt/c/ext',
        preparedFixtureWorkspace: true,
        extensionMode: 'staged'
      });

      expect(plan.userDataDir).toBe(path.posix.join('/tmp/rt', 'user-data'));
      expect(plan.extensionsDir).toBe(path.posix.join('/tmp/rt', 'extensions'));
      // /mnt/<drive> paths convert to a drive-letter Windows path.
      expect(plan.windowsWorkspacePath).toBe(path.win32.normalize('C:\\ws\\repo'));
      expect(plan.windowsExtensionDevelopmentPath).toBe(path.win32.normalize('C:\\ext'));
      // A POSIX runtime root keeps its derived dirs POSIX-normalized.
      expect(plan.windowsUserDataDir).toBe(path.posix.normalize('/tmp/rt/user-data'));
      expect(plan.windowsExtensionsDir).toBe(path.posix.normalize('/tmp/rt/extensions'));

      expect(plan.launchArgs).toContain('--new-window');
      expect(plan.launchArgs).toContain('--disable-workspace-trust');
      expect(plan.launchArgs).toContain(`--user-data-dir=${plan.windowsUserDataDir}`);
      expect(plan.launchArgs).toContain(`--extensions-dir=${plan.windowsExtensionsDir}`);
      expect(plan.launchArgs).toContain(
        `--extensionDevelopmentPath=${plan.windowsExtensionDevelopmentPath}`
      );
      expect(plan.launchArgs[plan.launchArgs.length - 1]).toBe(plan.windowsWorkspacePath);

      expect(plan.extensionMode).toBe('staged');
      expect(plan.preparedFixtureWorkspace).toBe(true);
    });

    it('builds launch args and windows paths for a Windows-style runtime root', () => {
      const plan = buildViHistoryDevHostLaunchPlan({
        codeExecutablePath: 'C:\\Code.exe',
        runtimeRoot: 'C:\\rt',
        repoRoot: 'C:\\repo',
        workspacePath: 'C:\\ws\\repo',
        extensionDevelopmentPath: 'C:\\ext',
        preparedFixtureWorkspace: false,
        extensionMode: 'direct'
      });

      expect(plan.userDataDir).toBe(path.win32.join('C:\\rt', 'user-data'));
      expect(plan.extensionsDir).toBe(path.win32.join('C:\\rt', 'extensions'));
      expect(plan.windowsWorkspacePath).toBe(path.win32.normalize('C:\\ws\\repo'));
      expect(plan.windowsExtensionDevelopmentPath).toBe(path.win32.normalize('C:\\ext'));
      expect(plan.windowsUserDataDir).toBe(path.win32.normalize('C:\\rt\\user-data'));
      expect(plan.windowsExtensionsDir).toBe(path.win32.normalize('C:\\rt\\extensions'));

      expect(plan.launchArgs).toContain(`--user-data-dir=${plan.windowsUserDataDir}`);
      expect(plan.launchArgs[plan.launchArgs.length - 1]).toBe(plan.windowsWorkspacePath);
      expect(plan.extensionMode).toBe('direct');
      expect(plan.preparedFixtureWorkspace).toBe(false);
    });

    it('falls back to platform joining/normalization for relative-style inputs', () => {
      const plan = buildViHistoryDevHostLaunchPlan({
        codeExecutablePath: 'Code.exe',
        runtimeRoot: 'rel/rt',
        repoRoot: 'rel/repo',
        workspacePath: 'rel/ws',
        extensionDevelopmentPath: 'rel/ext',
        preparedFixtureWorkspace: true,
        extensionMode: 'direct'
      });

      expect(plan.userDataDir).toBe(path.join('rel/rt', 'user-data'));
      expect(plan.extensionsDir).toBe(path.join('rel/rt', 'extensions'));
      expect(plan.windowsWorkspacePath).toBe(path.normalize('rel/ws'));
      expect(plan.windowsExtensionDevelopmentPath).toBe(path.normalize('rel/ext'));
      expect(plan.launchArgs[plan.launchArgs.length - 1]).toBe(plan.windowsWorkspacePath);
    });
  });

  describe('launchViHistoryDevHost', () => {
    it('creates the runtime dirs, spawns detached, and unrefs the child', async () => {
      const runtimeRoot = await makeTempDir('vihs-devhost-launch-');
      const plan = buildViHistoryDevHostLaunchPlan({
        codeExecutablePath: path.join(runtimeRoot, 'Code.exe'),
        runtimeRoot,
        repoRoot: runtimeRoot,
        workspacePath: path.join(runtimeRoot, 'ws'),
        extensionDevelopmentPath: path.join(runtimeRoot, 'ext'),
        preparedFixtureWorkspace: true,
        extensionMode: 'staged'
      });

      const unref = vi.fn();
      const spawnImpl = vi.fn(() => ({ unref }) as unknown as ChildProcess);

      await launchViHistoryDevHost(plan, {
        spawnImpl: spawnImpl as unknown as LaunchViHistoryDevHostDeps['spawnImpl']
      });

      expect(spawnImpl).toHaveBeenCalledWith(plan.codeExecutablePath, plan.launchArgs, {
        detached: true,
        stdio: 'ignore'
      });
      expect(unref).toHaveBeenCalledTimes(1);
      expect((await fs.stat(plan.userDataDir)).isDirectory()).toBe(true);
      expect((await fs.stat(plan.extensionsDir)).isDirectory()).toBe(true);
    });
  });

  describe('formatViHistoryDevHostSummary', () => {
    it('includes fixture lines only when workspace metadata is provided', () => {
      const plan = buildViHistoryDevHostLaunchPlan({
        codeExecutablePath: 'C:\\Code.exe',
        runtimeRoot: 'C:\\rt',
        repoRoot: 'C:\\repo',
        workspacePath: 'C:\\ws',
        extensionDevelopmentPath: 'C:\\ext',
        preparedFixtureWorkspace: true,
        extensionMode: 'staged'
      });
      const metadata: ViHistoryDevHostWorkspaceMetadata = {
        workspacePath: 'C:\\ws',
        eligibleRelativePath: 'fixtures/eligible-dev-loop.vi',
        ineligibleRelativePath: 'fixtures/ineligible-dev-loop.bin',
        metadataPath: 'C:\\ws\\.vihs-dev-host-meta.json'
      };

      const withMeta = formatViHistoryDevHostSummary(plan, metadata);
      expect(withMeta[0]).toBe('Launched VI History Suite dev host');
      expect(withMeta.some((line) => line.startsWith('Eligible fixture:'))).toBe(true);
      expect(withMeta.some((line) => line.startsWith('Ineligible fixture:'))).toBe(true);

      const withoutMeta = formatViHistoryDevHostSummary(plan);
      expect(withoutMeta[0]).toBe('Launched VI History Suite dev host');
      expect(withoutMeta.some((line) => line.startsWith('Eligible fixture:'))).toBe(false);
      expect(withoutMeta.some((line) => line.startsWith('Ineligible fixture:'))).toBe(false);
    });
  });
});
