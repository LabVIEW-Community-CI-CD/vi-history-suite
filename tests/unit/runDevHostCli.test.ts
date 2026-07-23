import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  applyDevHostCliExitCode,
  joinPreservingExplicitPathStyle,
  maybeRunDevHostCliAsMain,
  normalizeWorkspacePath,
  runDevHostCli,
  runDevHostCliMain
} from '../../src/cli/runDevHost';
import type {
  ViHistoryDevHostLaunchPlan,
  ViHistoryDevHostWorkspaceMetadata
} from '../../src/tooling/devHostLoop';

describe('runDevHostCli', () => {
  it('prints usage text and returns help when --help is requested', async () => {
    const write = vi.fn();

    const outcome = await runDevHostCli(['--help'], {
      stdout: { write }
    });

    expect(outcome).toBe('help');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain('Usage: runDevHost');
  });

  it('prepares a workspace and reports fixture paths for --prepare-workspace-only', async () => {
    const write = vi.fn();
    const resolveRuntimeRoot = vi.fn().mockResolvedValue('/tmp/runtime');
    const prepareFixtureWorkspace = vi
      .fn<
        (workspacePath: string) => Promise<ViHistoryDevHostWorkspaceMetadata>
      >()
      .mockResolvedValue({
        workspacePath: '/tmp/runtime/workspace-fixture',
        eligibleRelativePath: 'fixtures/eligible.vi',
        ineligibleRelativePath: 'fixtures/ineligible.txt',
        metadataPath: '/tmp/runtime/workspace-fixture/.vihs-metadata.json'
      });

    const outcome = await runDevHostCli(
      ['--workspace-path', '/explicit/workspace', '--prepare-workspace-only'],
      {
        repoRoot: '/repo',
        resolveRuntimeRoot,
        prepareFixtureWorkspace,
        stdout: { write }
      }
    );

    expect(outcome).toBe('prepared');
    expect(resolveRuntimeRoot).toHaveBeenCalledWith('/repo');
    expect(prepareFixtureWorkspace).toHaveBeenCalledWith('/tmp/runtime/workspace-fixture');
    expect(write).toHaveBeenCalledWith(
      'Prepared VI History Suite dev-host workspace: /tmp/runtime/workspace-fixture\n'
    );
    expect(write).toHaveBeenCalledWith(
      'Eligible fixture: /tmp/runtime/workspace-fixture/fixtures/eligible.vi\n'
    );
  });

  it('builds and launches a staged dev-host plan', async () => {
    const write = vi.fn();
    const resolveRuntimeRoot = vi.fn().mockResolvedValue('/tmp/runtime');
    const prepareFixtureWorkspace = vi
      .fn<
        (workspacePath: string) => Promise<ViHistoryDevHostWorkspaceMetadata>
      >()
      .mockResolvedValue({
        workspacePath: '/tmp/runtime/workspace-fixture',
        eligibleRelativePath: 'fixtures/eligible.vi',
        ineligibleRelativePath: 'fixtures/ineligible.txt',
        metadataPath: '/tmp/runtime/workspace-fixture/.vihs-metadata.json'
      });
    const resolveCodeExecutablePath = vi.fn().mockReturnValue('/opt/vscode/code');
    const stageExtension = vi.fn().mockResolvedValue('/tmp/runtime/extension-stage/vi-history-suite');
    const launcher = vi.fn<(plan: ViHistoryDevHostLaunchPlan) => Promise<void>>().mockResolvedValue();

    const outcome = await runDevHostCli(['--stage-extension', '--code-path', '/custom/code'], {
      repoRoot: '/repo',
      resolveRuntimeRoot,
      prepareFixtureWorkspace,
      resolveCodeExecutablePath,
      stageExtension,
      launcher,
      stdout: { write }
    });

    expect(outcome).toBe('launched');
    expect(resolveCodeExecutablePath).toHaveBeenCalledWith('/custom/code');
    expect(stageExtension).toHaveBeenCalledWith('/repo', '/tmp/runtime/extension-stage');
    expect(launcher).toHaveBeenCalledTimes(1);
    const launchPlan = launcher.mock.calls[0]?.[0];
    expect(launchPlan?.codeExecutablePath).toBe('/opt/vscode/code');
    expect(launchPlan?.workspacePath).toBe('/tmp/runtime/workspace-fixture');
    expect(launchPlan?.extensionDevelopmentPath).toBe('/tmp/runtime/extension-stage/vi-history-suite');
    expect(launchPlan?.preparedFixtureWorkspace).toBe(true);
    expect(launchPlan?.extensionMode).toBe('staged');
    expect(write).toHaveBeenCalled();
  });

  it('launches with a user-supplied --workspace in direct extension mode (no fixture prepared)', async () => {
    const write = vi.fn();
    const prepareFixtureWorkspace = vi.fn<
      (workspacePath: string) => Promise<ViHistoryDevHostWorkspaceMetadata>
    >();
    const launcher = vi.fn<(plan: ViHistoryDevHostLaunchPlan) => Promise<void>>().mockResolvedValue();

    const outcome = await runDevHostCli(['--workspace-path', '/home/dev/my-workspace'], {
      repoRoot: '/repo',
      resolveRuntimeRoot: vi.fn().mockResolvedValue('/tmp/runtime'),
      prepareFixtureWorkspace,
      resolveCodeExecutablePath: vi.fn().mockReturnValue('/opt/vscode/code'),
      launcher,
      stdout: { write }
    });

    expect(outcome).toBe('launched');
    // A user-supplied workspace path bypasses fixture preparation entirely.
    expect(prepareFixtureWorkspace).not.toHaveBeenCalled();
    const launchPlan = launcher.mock.calls[0]?.[0];
    expect(launchPlan?.workspacePath.replace(/\\/g, '/')).toContain('my-workspace');
    expect(launchPlan?.preparedFixtureWorkspace).toBe(false);
    // No --stage-extension -> direct mode, extension development path is the repo root.
    expect(launchPlan?.extensionMode).toBe('direct');
    expect(launchPlan?.extensionDevelopmentPath).toBe('/repo');
  });

  it('re-prepares the fixture workspace for --prepare-workspace-only when a workspace path is also supplied', async () => {
    const write = vi.fn();
    const prepareFixtureWorkspace = vi
      .fn<(workspacePath: string) => Promise<ViHistoryDevHostWorkspaceMetadata>>()
      .mockResolvedValue({
        workspacePath: '/tmp/runtime/workspace-fixture',
        eligibleRelativePath: 'fixtures/eligible.vi',
        ineligibleRelativePath: 'fixtures/ineligible.txt',
        metadataPath: '/tmp/runtime/workspace-fixture/.vihs-metadata.json'
      });
    const launcher = vi.fn<(plan: ViHistoryDevHostLaunchPlan) => Promise<void>>().mockResolvedValue();

    const outcome = await runDevHostCli(
      ['--prepare-workspace-only', '--workspace-path', '/home/dev/my-workspace'],
      {
        repoRoot: '/repo',
        resolveRuntimeRoot: vi.fn().mockResolvedValue('/tmp/runtime'),
        prepareFixtureWorkspace,
        launcher,
        stdout: { write }
      }
    );

    expect(outcome).toBe('prepared');
    // The supplied workspace path skips the inline fixture prepare, so the
    // prepare-workspace-only branch must call prepareFixtureWorkspace itself.
    expect(prepareFixtureWorkspace).toHaveBeenCalledTimes(1);
    expect(launcher).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
  });
});

describe('runDevHostCliMain', () => {
  it('returns exit code 1 and writes errors for invalid arguments', async () => {
    const stderr = { write: vi.fn() };

    const exitCode = await runDevHostCliMain(['--unknown-flag'], {}, stderr);

    expect(exitCode).toBe(1);
    expect(stderr.write).toHaveBeenCalled();
    expect(stderr.write.mock.calls[0]?.[0]).toContain('Unknown argument: --unknown-flag');
  });
});

describe('dev-host CLI entry helpers', () => {
  it('applies process exit code', () => {
    const processLike = { exitCode: undefined as number | undefined };

    const exitCode = applyDevHostCliExitCode(7, processLike);

    expect(exitCode).toBe(7);
    expect(processLike.exitCode).toBe(7);
  });

  it('returns false when module is not the entrypoint', () => {
    const ran = maybeRunDevHostCliAsMain([], {} as NodeModule, {} as NodeModule);

    expect(ran).toBe(false);
  });

  it('runs main flow when module is the entrypoint and applies exit code asynchronously', async () => {
    const processLike = { exitCode: undefined as number | undefined };
    const write = vi.fn();
    const moduleRef = {} as NodeModule;

    const ran = maybeRunDevHostCliAsMain(
      ['--help'],
      moduleRef,
      moduleRef,
      { stdout: { write } },
      processLike,
      { write: vi.fn() }
    );

    expect(ran).toBe(true);
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });
    expect(processLike.exitCode).toBe(0);
    expect(write).toHaveBeenCalled();
  });
});

// VHS-REQ-621: cover the win32 drive-letter and UNC branches of the path helpers
// that the Linux CLI-flow tests never exercise (they only produce POSIX inputs).
// Backslashes are built via String.fromCharCode(92) to keep the source escape-safe.
describe('runDevHost path helpers (VHS-REQ-621)', () => {
  const BS = String.fromCharCode(92); // a single backslash

  it('normalizeWorkspacePath returns win32 drive-letter and UNC paths verbatim, resolves POSIX', () => {
    const winPath = `C:${BS}Users${BS}dev${BS}ws`;
    expect(normalizeWorkspacePath(winPath)).toBe(winPath);
    const uncPath = `${BS}${BS}server${BS}share${BS}ws`;
    expect(normalizeWorkspacePath(uncPath)).toBe(uncPath);
    // A relative path is resolved against cwd. Compute the expected value the
    // same way production does (path.resolve) so the assertion is separator-
    // agnostic and passes on the Windows CI leg too (AGENTS.md guidance).
    expect(normalizeWorkspacePath('rel/ws')).toBe(path.resolve('rel/ws'));
  });

  it('joinPreservingExplicitPathStyle joins per the root path style (posix / win32 / UNC)', () => {
    // POSIX root -> forward slashes, backslashes in segments normalized to '/'.
    expect(joinPreservingExplicitPathStyle('/runtime/root', `a${BS}b`, 'c')).toBe('/runtime/root/a/b/c');
    // win32 drive root -> backslashes, forward slashes in segments normalized.
    expect(joinPreservingExplicitPathStyle(`C:${BS}runtime`, 'a/b', 'c')).toBe(`C:${BS}runtime${BS}a${BS}b${BS}c`);
    // UNC root -> win32 join preserving the leading double backslash.
    expect(joinPreservingExplicitPathStyle(`${BS}${BS}srv${BS}share`, 'a/b')).toBe(`${BS}${BS}srv${BS}share${BS}a${BS}b`);
  });
});

// VHS-REQ-621: exercise the default dependency fall-throughs that the fully
// injected CLI-flow tests above never reach, keeping every boundary hermetic
// (no git, no VS Code launch, and no bogus Windows runtime-root probe).
describe('runDevHostCli default dependency fall-throughs', () => {
  it('writes usage to process.stdout when no stdout dependency is injected', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const outcome = await runDevHostCli(['--help']);
      expect(outcome).toBe('help');
      expect(writeSpy).toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('reuses the inline-prepared fixture for --prepare-workspace-only without a workspace path', async () => {
    const write = vi.fn();
    const prepareFixtureWorkspace = vi
      .fn<(workspacePath: string) => Promise<ViHistoryDevHostWorkspaceMetadata>>()
      .mockImplementation(async (workspacePath: string) => ({
        workspacePath,
        eligibleRelativePath: 'fixtures/eligible.vi',
        ineligibleRelativePath: 'fixtures/ineligible.txt',
        metadataPath: path.join(workspacePath, '.vihs-metadata.json')
      }));

    const outcome = await runDevHostCli(['--prepare-workspace-only'], {
      repoRoot: '/repo',
      resolveRuntimeRoot: vi.fn().mockResolvedValue('/tmp/runtime'),
      prepareFixtureWorkspace,
      stdout: { write }
    });

    expect(outcome).toBe('prepared');
    // The workspace was prepared inline by the resolution ternary, so the
    // prepare-only branch must not prepare it a second time.
    expect(prepareFixtureWorkspace).toHaveBeenCalledTimes(1);
    // runtimeRoot/workspace-fixture, derived the same way production joins it.
    expect(prepareFixtureWorkspace).toHaveBeenCalledWith(
      joinPreservingExplicitPathStyle('/tmp/runtime', 'workspace-fixture')
    );
  });

  it('resolves the VS Code executable with the default resolver when none is injected', async () => {
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-devhost-code-'));
    const codeExecutablePath = path.join(stageDir, 'code');
    await fs.writeFile(codeExecutablePath, '#!/bin/sh\n', 'utf8');
    const launcher = vi
      .fn<(plan: ViHistoryDevHostLaunchPlan) => Promise<void>>()
      .mockResolvedValue();
    try {
      const outcome = await runDevHostCli(
        ['--workspace-path', '/home/dev/ws', '--code-path', codeExecutablePath],
        {
          repoRoot: '/repo',
          resolveRuntimeRoot: vi.fn().mockResolvedValue('/tmp/runtime'),
          prepareFixtureWorkspace: vi.fn(),
          launcher,
          stdout: { write: vi.fn() }
          // resolveCodeExecutablePath intentionally omitted -> the default
          // resolver runs and validates the real (temp) executable path.
        }
      );

      expect(outcome).toBe('launched');
      const plan = launcher.mock.calls[0]?.[0];
      expect(plan?.codeExecutablePath).toBe(codeExecutablePath);
    } finally {
      await fs.rm(stageDir, { recursive: true, force: true });
    }
  });
});
