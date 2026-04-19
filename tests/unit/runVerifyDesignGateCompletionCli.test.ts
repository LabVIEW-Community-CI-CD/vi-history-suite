import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

import {
  applyVerifyDesignGateCompletionCliExitCode,
  maybeRunVerifyDesignGateCompletionCliAsMain,
  reportVerifyDesignGateCompletionFailure,
  resolveVerifyDesignGateCompletionRepoRoot,
  verifyDesignGateCompletionCli,
  verifyDesignGateCompletionCliMain
} from '../../src/cli/runVerifyDesignGateCompletion';

describe('runVerifyDesignGateCompletionCli', () => {
  it('resolves the default repo root relative to the CLI module directory', () => {
    expect(resolveVerifyDesignGateCompletionRepoRoot('/tmp/vi-history-suite/out/cli')).toBe(
      path.resolve('/tmp/vi-history-suite')
    );
  });

  it('returns the retained report when the latest retained report is complete and passing', async () => {
    await expect(
      verifyDesignGateCompletionCli({
        repoRoot: '/tmp/vi-history-suite',
        readFile: async () =>
          JSON.stringify({
            generatedAt: '2026-04-02T00:00:00.000Z',
            repoRoot: '/tmp/vi-history-suite',
            status: 'pass',
            completionState: 'complete',
            steps: []
          })
      })
    ).resolves.toMatchObject({
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass',
      completionState: 'complete'
    });
  });

  it('fails closed when the retained report is still running', async () => {
    await expect(
      verifyDesignGateCompletionCli({
        repoRoot: '/tmp/vi-history-suite',
        readFile: async () =>
          JSON.stringify({
            generatedAt: '2026-04-02T00:00:00.000Z',
            repoRoot: '/tmp/vi-history-suite',
            status: 'pass',
            completionState: 'running',
            pendingStepId: 'standards-assurance',
            pendingStepTitle: 'Standards assurance',
            steps: []
          })
      })
    ).rejects.toThrow(
      'design gate report is still running; pending step: standards-assurance (Standards assurance)'
    );
  });

  it('writes stable failure text for error and non-error failures', () => {
    const writes: string[] = [];
    const stderr = {
      write(text: string) {
        writes.push(text);
        return true;
      }
    };

    expect(
      reportVerifyDesignGateCompletionFailure(new Error('design gate report is still running'), stderr)
    ).toBe('design gate report is still running');
    expect(reportVerifyDesignGateCompletionFailure('string failure', stderr)).toBe('string failure');
    expect(writes).toEqual(['design gate report is still running\n', 'string failure\n']);
  });

  it('returns process-style exit codes for success and failure in the verifier main helper', async () => {
    const writes: string[] = [];
    const stderr = {
      write(text: string) {
        writes.push(text);
        return true;
      }
    };

    await expect(
      verifyDesignGateCompletionCliMain(
        {
          repoRoot: '/tmp/vi-history-suite',
          readFile: async () =>
            JSON.stringify({
              generatedAt: '2026-04-02T00:00:00.000Z',
              repoRoot: '/tmp/vi-history-suite',
              status: 'pass',
              completionState: 'complete',
              steps: []
            })
        },
        stderr
      )
    ).resolves.toBe(0);

    await expect(
      verifyDesignGateCompletionCliMain(
        {
          repoRoot: '/tmp/vi-history-suite',
          readFile: async () =>
            JSON.stringify({
              generatedAt: '2026-04-02T00:00:00.000Z',
              repoRoot: '/tmp/vi-history-suite',
              status: 'pass',
              completionState: 'running',
              pendingStepId: 'standards-assurance',
              pendingStepTitle: 'Standards assurance',
              steps: []
            })
        },
        stderr
      )
    ).resolves.toBe(1);

    expect(writes).toEqual([
      'design gate report is still running; pending step: standards-assurance (Standards assurance)\n'
    ]);
  });

  it('applies the retained verifier exit code through a process-like target', () => {
    const processLike: { exitCode?: number } = {};

    expect(applyVerifyDesignGateCompletionCliExitCode(7, processLike)).toBe(7);
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
      maybeRunVerifyDesignGateCompletionCliAsMain(
        mainModule,
        currentModule,
        {},
        processLike,
        stderr
      )
    ).toBe(false);
    expect(processLike.exitCode).toBeUndefined();

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunVerifyDesignGateCompletionCliAsMain(
        sharedModule,
        sharedModule,
        {
          repoRoot: '/tmp/vi-history-suite',
          readFile: async () =>
            JSON.stringify({
              generatedAt: '2026-04-02T00:00:00.000Z',
              repoRoot: '/tmp/vi-history-suite',
              status: 'pass',
              completionState: 'complete',
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
