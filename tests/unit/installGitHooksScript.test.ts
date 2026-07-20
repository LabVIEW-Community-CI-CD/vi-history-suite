import { describe, expect, it } from 'vitest';

// VHS-REQ-697: idempotent git-hook enablement. Injected spawnSync — no real git.

const { HOOKS_PATH, installGitHooks } = require('../../scripts/installGitHooks.js') as {
  HOOKS_PATH: string;
  installGitHooks: (deps: Record<string, unknown>) => Record<string, unknown>;
};

function gitStub(responses: Record<string, { status?: number; stdout?: string; stderr?: string; error?: Error }>) {
  return (_cmd: string, args: string[]) => {
    const key = args.join(' ');
    for (const prefix of Object.keys(responses)) {
      if (key.startsWith(prefix)) return responses[prefix];
    }
    return { status: 0, stdout: '' };
  };
}

describe('installGitHooks (VHS-REQ-697.4)', () => {
  it('sets core.hooksPath when unset', () => {
    const calls: string[] = [];
    const spawnSync = (_c: string, a: string[]) => {
      calls.push(a.join(' '));
      if (a.join(' ').startsWith('rev-parse --is-inside-work-tree')) return { status: 0, stdout: 'true' };
      if (a.join(' ').startsWith('config --get core.hooksPath')) return { status: 1, stdout: '' };
      return { status: 0, stdout: '' };
    };
    const r = installGitHooks({ spawnSync });
    expect(r).toMatchObject({ action: 'set', hooksPath: HOOKS_PATH });
    expect(calls.some((c) => c === `config core.hooksPath ${HOOKS_PATH}`)).toBe(true);
  });

  it('no-ops when core.hooksPath already points at .githooks', () => {
    const spawnSync = gitStub({
      'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true' },
      'config --get core.hooksPath': { status: 0, stdout: `${HOOKS_PATH}\n` }
    });
    expect(installGitHooks({ spawnSync })).toMatchObject({ action: 'already-set' });
  });

  it('skips when not inside a git work-tree', () => {
    const spawnSync = gitStub({
      'rev-parse --is-inside-work-tree': { status: 128, stderr: 'not a git repository' }
    });
    expect(installGitHooks({ spawnSync })).toMatchObject({ action: 'skipped', reason: 'not-a-git-work-tree' });
  });

  it('reports failure when git config cannot be set', () => {
    const spawnSync = gitStub({
      'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true' },
      'config --get core.hooksPath': { status: 1, stdout: '' },
      'config core.hooksPath': { status: 1, stderr: 'permission denied' }
    });
    expect(installGitHooks({ spawnSync })).toMatchObject({ action: 'failed' });
  });
});
