import { describe, expect, it, vi } from 'vitest';

import {
  applyDevHostCliExitCode,
  maybeRunDevHostCliAsMain,
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
