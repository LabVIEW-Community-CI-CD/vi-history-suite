import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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
  toWindowsPath
} from '../../src/tooling/devHostLoop';
import {
  applyDevHostCliExitCode,
  maybeRunDevHostCliAsMain,
  runDevHostCli,
  runDevHostCliMain
} from '../../src/cli/runDevHost';

describe('runDevHostCli', () => {
  it('parses deterministic fast-loop args and usage', () => {
    expect(parseViHistoryDevHostArgs([])).toEqual({
      workspacePath: undefined,
      codePath: undefined,
      stageExtension: false,
      prepareWorkspaceOnly: false,
      helpRequested: false
    });

    expect(
      parseViHistoryDevHostArgs([
        '--workspace-path',
        'C:\\dev\\labview-icon-editor',
        '--code-path',
        'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        '--stage-extension',
        '--prepare-workspace-only'
      ])
    ).toEqual({
      workspacePath: 'C:\\dev\\labview-icon-editor',
      codePath: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      stageExtension: true,
      prepareWorkspaceOnly: true,
      helpRequested: false
    });

    expect(() => parseViHistoryDevHostArgs(['--workspace-path'])).toThrow(
      /Missing value for --workspace-path/
    );
    expect(() => parseViHistoryDevHostArgs(['--code-path'])).toThrow(
      /Missing value for --code-path/
    );
    expect(() => parseViHistoryDevHostArgs(['--unknown-flag'])).toThrow(
      /Unknown argument: --unknown-flag/
    );
    expect(getViHistoryDevHostUsage()).toContain('--prepare-workspace-only');
    expect(getViHistoryDevHostUsage()).toContain('--stage-extension');
  });

  it('builds a stable launch plan for a reusable dev host', () => {
    const plan = buildViHistoryDevHostLaunchPlan({
      codeExecutablePath: '/mnt/c/Program Files/Microsoft VS Code/Code.exe',
      runtimeRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vihs-dev-host',
      repoRoot: '/home/sveld/code/standards/vi-history-suite',
      workspacePath: '/mnt/c/dev/labview-icon-editor',
      extensionDevelopmentPath: '/home/sveld/code/standards/vi-history-suite',
      preparedFixtureWorkspace: false,
      extensionMode: 'direct'
    });

    expect(plan.windowsWorkspacePath).toBe('C:\\dev\\labview-icon-editor');
    expect(plan.windowsUserDataDir).toBe(
      'C:\\Users\\sveld\\AppData\\Local\\Temp\\vihs-dev-host\\user-data'
    );
    expect(plan.launchArgs).toContain('--new-window');
    expect(plan.launchArgs).toContain('--disable-workspace-trust');
    expect(
      plan.launchArgs.some(
        (argument) =>
          argument.startsWith('--extensionDevelopmentPath=\\\\wsl.localhost\\') &&
          argument.endsWith('\\home\\sveld\\code\\standards\\vi-history-suite')
      )
    ).toBe(
      true
    );
  });

  it('prepares the reusable fixture workspace without requiring Code.exe', async () => {
    const writes: string[] = [];
    const prepareFixtureWorkspace = vi.fn().mockResolvedValue({
      workspacePath: '/tmp/vihs-dev-host/workspace-fixture',
      eligibleRelativePath: 'fixtures/eligible-dev-loop.vi',
      ineligibleRelativePath: 'fixtures/ineligible-dev-loop.bin',
      metadataPath: '/tmp/vihs-dev-host/workspace-fixture/.vihs-dev-host-meta.json'
    });
    const resolveCodeExecutablePath = vi.fn();
    const launcher = vi.fn();

    await expect(
      runDevHostCli(['--prepare-workspace-only'], {
        repoRoot: '/workspace/vi-history-suite',
        resolveRuntimeRoot: async () => '/tmp/vihs-dev-host',
        resolveCodeExecutablePath,
        prepareFixtureWorkspace,
        launcher,
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('prepared');

    expect(resolveCodeExecutablePath).not.toHaveBeenCalled();
    expect(prepareFixtureWorkspace).toHaveBeenCalledWith('/tmp/vihs-dev-host/workspace-fixture');
    expect(launcher).not.toHaveBeenCalled();
    expect(writes.join('')).toContain('Prepared VI History Suite dev-host workspace');
    expect(writes.join('')).toContain('fixtures/eligible-dev-loop.vi');
  });

  it('launches the dev host in direct or staged mode with a stable summary', async () => {
    const writes: string[] = [];
    const launcher = vi.fn().mockResolvedValue(undefined);
    const stageExtension = vi.fn().mockResolvedValue('/tmp/vihs-dev-host/extension-stage');

    await expect(
      runDevHostCli(['--workspace-path', 'C:\\dev\\labview-icon-editor', '--stage-extension'], {
        repoRoot: '/workspace/vi-history-suite',
        resolveRuntimeRoot: async () => '/tmp/vihs-dev-host',
        resolveCodeExecutablePath: () => 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        stageExtension,
        launcher,
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('launched');

    expect(stageExtension).toHaveBeenCalledWith(
      '/workspace/vi-history-suite',
      '/tmp/vihs-dev-host/extension-stage'
    );
    expect(launcher).toHaveBeenCalledTimes(1);
    const launchedPlan = launcher.mock.calls[0]?.[0];
    expect(launchedPlan.extensionMode).toBe('staged');
    expect(launchedPlan.workspacePath).toBe('C:\\dev\\labview-icon-editor');
    expect(writes.join('')).toContain('Launched VI History Suite dev host');
    expect(writes.join('')).toContain('Extension mode: staged');
    expect(writes.join('')).toContain('Next step: keep `npm run dev:watch` running');
    expect(formatViHistoryDevHostSummary(launchedPlan).join('\n')).toContain(
      'Extension mode: staged'
    );
  });

  it('supports help, exit codes, and main-module execution', async () => {
    const writes: string[] = [];
    const stderrWrites: string[] = [];
    const processLike: { exitCode?: number } = {};

    await expect(
      runDevHostCli(['--help'], {
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('help');
    expect(writes.join('')).toContain('Usage: runDevHost');

    await expect(
      runDevHostCliMain(
        ['--unknown-flag'],
        {},
        {
          write(text: string) {
            stderrWrites.push(text);
            return true;
          }
        }
      )
    ).resolves.toBe(1);
    expect(stderrWrites.join('')).toContain('Unknown argument: --unknown-flag');

    expect(applyDevHostCliExitCode(4, processLike)).toBe(4);
    expect(processLike.exitCode).toBe(4);

    const unrelatedMain = {} as NodeModule;
    const unrelatedCurrent = {} as NodeModule;
    expect(maybeRunDevHostCliAsMain([], unrelatedMain, unrelatedCurrent, {}, processLike)).toBe(
      false
    );

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunDevHostCliAsMain(
        ['--help'],
        sharedModule,
        sharedModule,
        {
          stdout: { write() {} }
        },
        processLike
      )
    ).toBe(true);
  });

  it('normalizes WSL paths and resolves runtime roots for the fast loop', async () => {
    expect(toWindowsPath('/mnt/c/dev/labview-icon-editor')).toBe('C:\\dev\\labview-icon-editor');
    expect(toWindowsPath('/home/sveld/code/standards/vi-history-suite', 'Ubuntu')).toBe(
      '\\\\wsl.localhost\\Ubuntu\\home\\sveld\\code\\standards\\vi-history-suite'
    );
    expect(toWindowsPath('C:\\dev\\labview-icon-editor')).toBe('C:\\dev\\labview-icon-editor');

    const writableRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dev-host-runtime-'));
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dev-host-repo-'));
    expect(await canWriteDirectory(writableRoot)).toBe(true);
    expect(
      await resolveViHistoryDevHostRuntimeRoot('/workspace/vi-history-suite', async () => true)
    ).toBe('/mnt/c/Users/sveld/AppData/Local/Temp/vihs-dev-host');
    expect(await resolveViHistoryDevHostRuntimeRoot(repoRoot, async () => false)).toBe(
      path.join(repoRoot, '.cache', 'dev-host')
    );
  });

  it('prepares a real fixture workspace and stages extension output deterministically', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dev-host-real-'));
    const workspaceRoot = path.join(tempRoot, 'workspace-fixture');
    const stageRoot = path.join(tempRoot, 'stage');
    const repoRoot = path.join(tempRoot, 'repo');
    const gitCalls: Array<{ args: string[]; cwd: string }> = [];
    const gitRunner = vi.fn().mockImplementation(async (args: string[], cwd: string) => {
      gitCalls.push({ args, cwd });
    });

    const metadata = await prepareViHistoryDevHostWorkspace(workspaceRoot, { gitRunner });
    const eligibleBytes = await fs.readFile(path.join(workspaceRoot, metadata.eligibleRelativePath));
    const settings = JSON.parse(
      await fs.readFile(path.join(workspaceRoot, '.vscode', 'settings.json'), 'utf8')
    ) as Record<string, string>;
    const persistedMetadata = JSON.parse(await fs.readFile(metadata.metadataPath, 'utf8')) as {
      workspacePath: string;
      eligibleRelativePath: string;
    };

    expect(eligibleBytes.subarray(8, 12).toString('ascii')).toBe('LVIN');
    expect(settings['viHistorySuite.preferBitness']).toBe('x86');
    expect(persistedMetadata.workspacePath).toBe(workspaceRoot);
    expect(persistedMetadata.eligibleRelativePath).toBe('fixtures/eligible-dev-loop.vi');
    expect(gitCalls.map((call) => call.args.join(' '))).toEqual([
      'init',
      'config user.name VI History Suite Dev Host',
      'config user.email vihs-dev-host@example.invalid',
      'add .',
      'commit -m Add initial dev-host fixtures',
      'add .',
      'commit -m Update dev-host eligible fixture',
      'add .',
      'commit -m Add third dev-host eligible fixture revision'
    ]);

    await fs.mkdir(path.join(repoRoot, 'out', 'dashboard'), { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'package.json'), '{"name":"vi-history-suite"}', 'utf8');
    await fs.writeFile(path.join(repoRoot, 'out', 'dashboard', 'index.js'), 'console.log(\"ok\");');

    const stagedRoot = await stageViHistoryDevHostExtension(repoRoot, stageRoot);
    expect(stagedRoot).toBe(stageRoot);
    await expect(fs.readFile(path.join(stageRoot, 'package.json'), 'utf8')).resolves.toContain(
      '"name":"vi-history-suite"'
    );
    await expect(
      fs.readFile(path.join(stageRoot, 'out', 'dashboard', 'index.js'), 'utf8')
    ).resolves.toContain('console.log("ok");');
  });

  it('resolves explicit Code.exe overrides and launches a detached dev host', async () => {
    const explicitCodePath = path.join(os.tmpdir(), 'vihs-explicit-code.exe');
    await fs.writeFile(explicitCodePath, '');
    expect(resolveViHistoryCodeExecutablePath(explicitCodePath)).toBe(explicitCodePath);
    expect(() => resolveViHistoryCodeExecutablePath(`${explicitCodePath}.missing`)).toThrow(
      /VS Code executable not found/
    );

    const plan = buildViHistoryDevHostLaunchPlan({
      codeExecutablePath: explicitCodePath,
      runtimeRoot: path.join(os.tmpdir(), 'vihs-dev-host-launch'),
      repoRoot: '/home/sveld/code/standards/vi-history-suite',
      workspacePath: '/mnt/c/dev/labview-icon-editor',
      extensionDevelopmentPath: '/home/sveld/code/standards/vi-history-suite',
      preparedFixtureWorkspace: true,
      extensionMode: 'direct'
    });

    const unref = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ unref });
    await launchViHistoryDevHost(plan, { spawnImpl });
    expect(spawnImpl).toHaveBeenCalledWith(explicitCodePath, plan.launchArgs, {
      detached: true,
      stdio: 'ignore'
    });
    expect(unref).toHaveBeenCalled();
    expect(
      formatViHistoryDevHostSummary(plan, {
        workspacePath: '/tmp/workspace-fixture',
        eligibleRelativePath: 'fixtures/eligible-dev-loop.vi',
        ineligibleRelativePath: 'fixtures/ineligible-dev-loop.bin',
        metadataPath: '/tmp/workspace-fixture/.vihs-dev-host-meta.json'
      }).join('\n')
    ).toContain('Eligible fixture: /tmp/workspace-fixture/fixtures/eligible-dev-loop.vi');
  });
});
