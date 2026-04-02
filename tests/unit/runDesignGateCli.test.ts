import { describe, expect, it } from 'vitest';

import {
  applyRunDesignGateCliExitCode,
  maybeRunDesignGateCliAsMain,
  reportRunDesignGateCliFailure,
  resolveRunDesignGateRepoRoot,
  runDesignGateCliMain,
  runDesignGateCli
} from '../../src/cli/runDesignGate';

describe('runDesignGateCli', () => {
  it('returns the retained report when the shared runner passes', async () => {
    await expect(
      runDesignGateCli({
        repoRoot: '/tmp/vi-history-suite',
        runner: async () => ({
          generatedAt: '2026-04-02T00:00:00.000Z',
          repoRoot: '/tmp/vi-history-suite',
          status: 'pass',
          steps: []
        })
      })
    ).resolves.toMatchObject({
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass'
    });
  });

  it('throws when the shared runner returns a failed report', async () => {
    await expect(
      runDesignGateCli({
        repoRoot: '/tmp/vi-history-suite',
        runner: async () => ({
          generatedAt: '2026-04-02T00:00:00.000Z',
          repoRoot: '/tmp/vi-history-suite',
          status: 'fail',
          steps: []
        })
      })
    ).rejects.toThrow('design gate failed');
  });

  it('resolves the default repo root relative to the CLI module directory', () => {
    expect(resolveRunDesignGateRepoRoot('/tmp/vi-history-suite/out/cli')).toBe(
      '/tmp/vi-history-suite'
    );
  });

  it('writes a stable CLI failure message for Error and non-Error failures', () => {
    const writes: string[] = [];
    const stderr = {
      write(text: string) {
        writes.push(text);
        return true;
      }
    };

    expect(reportRunDesignGateCliFailure(new Error('design gate failed'), stderr)).toBe(
      'design gate failed'
    );
    expect(reportRunDesignGateCliFailure('string failure', stderr)).toBe('string failure');
    expect(writes).toEqual(['design gate failed\n', 'string failure\n']);
  });

  it('returns process-style exit codes for success and failure in the CLI main helper', async () => {
    const writes: string[] = [];
    const stderr = {
      write(text: string) {
        writes.push(text);
        return true;
      }
    };

    await expect(
      runDesignGateCliMain(
        {
          repoRoot: '/tmp/vi-history-suite',
          runner: async () => ({
            generatedAt: '2026-04-02T00:00:00.000Z',
            repoRoot: '/tmp/vi-history-suite',
            status: 'pass',
            steps: []
          })
        },
        stderr
      )
    ).resolves.toBe(0);

    await expect(
      runDesignGateCliMain(
        {
          repoRoot: '/tmp/vi-history-suite',
          runner: async () => ({
            generatedAt: '2026-04-02T00:00:00.000Z',
            repoRoot: '/tmp/vi-history-suite',
            status: 'fail',
            steps: []
          })
        },
        stderr
      )
    ).resolves.toBe(1);

    expect(writes).toEqual(['design gate failed\n']);
  });

  it('applies the retained CLI exit code through a process-like target', () => {
    const processLike: { exitCode?: number } = {};

    expect(applyRunDesignGateCliExitCode(7, processLike)).toBe(7);
    expect(processLike.exitCode).toBe(7);
  });

  it('runs the script-mode branch only when the current module is the main module', async () => {
    const processLike: { exitCode?: number } = {};
    const stderrWrites: string[] = [];
    const stderr = {
      write(text: string) {
        stderrWrites.push(text);
        return true;
      }
    };
    const mainModule = {} as NodeModule;
    const currentModule = {} as NodeModule;

    expect(
      maybeRunDesignGateCliAsMain(mainModule, currentModule, {}, processLike, stderr)
    ).toBe(false);
    expect(processLike.exitCode).toBeUndefined();

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunDesignGateCliAsMain(
        sharedModule,
        sharedModule,
        {
          repoRoot: '/tmp/vi-history-suite',
          runner: async () => ({
            generatedAt: '2026-04-02T00:00:00.000Z',
            repoRoot: '/tmp/vi-history-suite',
            status: 'pass',
            steps: []
          })
        },
        processLike,
        stderr
      )
    ).toBe(true);

    await new Promise((resolve) => setImmediate(resolve));

    expect(processLike.exitCode).toBe(0);
    expect(stderrWrites).toEqual([]);
  });
});
