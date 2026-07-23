import { describe, expect, it, vi } from 'vitest';

// VHS-REQ-697: idempotent git-hook enablement. Injected spawnSync — no real git.

const { HOOKS_PATH, installGitHooks, main } = require('../../scripts/installGitHooks.js') as {
  HOOKS_PATH: string;
  installGitHooks: (deps: Record<string, unknown>) => Record<string, unknown>;
  main: (deps: Record<string, unknown>) => Record<string, unknown>;
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

describe('installGitHooks main CLI reporter (VHS-REQ-697.4)', () => {
  // Drive the extracted require.main reporter with an injected installer + streams
  // + exit so every action-branch is covered without a real git subprocess.
  function harness(action: Record<string, unknown>) {
    const out: string[] = [];
    const err: string[] = [];
    const exits: number[] = [];
    const result = main({
      installGitHooks: () => action,
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: (text: string) => err.push(text) },
      exit: (code: number) => exits.push(code)
    });
    return { out: out.join(''), err: err.join(''), exits, result };
  }

  it('prints the set message on stdout and exits 0', () => {
    const { out, err, exits, result } = harness({ action: 'set', hooksPath: HOOKS_PATH });
    expect(out).toContain(`[install-git-hooks] core.hooksPath set to ${HOOKS_PATH}`);
    expect(err).toBe('');
    expect(exits).toEqual([0]);
    expect(result).toMatchObject({ action: 'set' });
  });

  it('prints the already-set message on stdout and exits 0', () => {
    const { out, exits } = harness({ action: 'already-set', hooksPath: HOOKS_PATH });
    expect(out).toContain(`[install-git-hooks] core.hooksPath already ${HOOKS_PATH}`);
    expect(exits).toEqual([0]);
  });

  it('prints the skipped reason on stdout and exits 0', () => {
    const { out, exits } = harness({ action: 'skipped', reason: 'not-a-git-work-tree' });
    expect(out).toContain('[install-git-hooks] skipped (not-a-git-work-tree)');
    expect(exits).toEqual([0]);
  });

  it('prints a failure hint on stderr but still exits 0 (never fails the install)', () => {
    const { out, err, exits } = harness({ action: 'failed', reason: 'permission denied' });
    expect(out).toBe('');
    expect(err).toContain("could not set core.hooksPath (permission denied); run 'npm run hooks:install'");
    expect(exits).toEqual([0]);
  });

  it('defaults to the real installer (injected spawnSync) when no installer dep is given', () => {
    // No installGitHooks dep -> main falls back to the real installer, which
    // consumes the injected spawnSync (so still no real git subprocess runs).
    const out: string[] = [];
    const exits: number[] = [];
    const result = main({
      spawnSync: (_c: string, a: string[]) =>
        a.join(' ').startsWith('rev-parse')
          ? { status: 128, stderr: 'not a git repository' }
          : { status: 0, stdout: '' },
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: () => {} },
      exit: (code: number) => exits.push(code)
    });
    expect(result).toMatchObject({ action: 'skipped', reason: 'not-a-git-work-tree' });
    expect(out.join('')).toContain('[install-git-hooks] skipped (not-a-git-work-tree)');
    expect(exits).toEqual([0]);
  });
});

describe('installGitHooks failure-reason branches (VHS-REQ-697.4)', () => {
  // The failure reason is `String(set.stderr || set.error || 'git config failed')`;
  // exercise the set.error and the generic fallback arms (stderr is covered above).
  function gitStub(responses: Record<string, { status?: number; stdout?: string; stderr?: string; error?: Error }>) {
    return (_cmd: string, args: string[]) => {
      const key = args.join(' ');
      for (const prefix of Object.keys(responses)) {
        if (key.startsWith(prefix)) return responses[prefix];
      }
      return { status: 0, stdout: '' };
    };
  }

  it('uses the spawn error when git config fails without stderr', () => {
    const spawnSync = gitStub({
      'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true' },
      'config --get core.hooksPath': { status: 1, stdout: '' },
      'config core.hooksPath': { error: new Error('spawn ENOENT') }
    });
    expect(installGitHooks({ spawnSync })).toMatchObject({
      action: 'failed',
      reason: expect.stringContaining('spawn ENOENT')
    });
  });

  it('falls back to a generic reason when git config fails with neither stderr nor error', () => {
    const spawnSync = gitStub({
      'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true' },
      'config --get core.hooksPath': { status: 1, stdout: '' },
      'config core.hooksPath': { status: 1 }
    });
    expect(installGitHooks({ spawnSync })).toMatchObject({
      action: 'failed',
      reason: 'git config failed'
    });
  });
});

describe('installGitHooks main default streams (VHS-REQ-697.4)', () => {
  // With no stdout/stderr deps, main writes to process.stdout / process.stderr;
  // spy on both so the default-stream branches are covered without real git.
  it('writes the set message to process.stdout when no stdout dep is given', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exits: number[] = [];
    main({
      installGitHooks: () => ({ action: 'set', hooksPath: HOOKS_PATH }),
      exit: (code: number) => exits.push(code)
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('core.hooksPath set to'));
    expect(exits).toEqual([0]);
    spy.mockRestore();
  });

  it('writes the failure hint to process.stderr when no stderr dep is given', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exits: number[] = [];
    main({
      installGitHooks: () => ({ action: 'failed', reason: 'permission denied' }),
      exit: (code: number) => exits.push(code)
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('could not set core.hooksPath'));
    expect(exits).toEqual([0]);
    spy.mockRestore();
  });
});
