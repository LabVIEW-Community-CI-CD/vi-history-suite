/**
 * VHS-REQ-619: Verifies the Git --version probe handles available, missing,
 * and probe-failed cases via an injected runner so detection stays
 * deterministic in CI.
 */
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import {
  createRunGitVersion,
  detectGitPrerequisite,
  parseGitVersionOutput
} from '../../src/tooling/gitPrerequisiteDetect';

// Minimal fake ChildProcess: an EventEmitter with stdout/stderr emitters and a
// no-op kill, so createRunGitVersion's stdio/close/error branches can be driven
// deterministically without spawning a real process.
function createFakeChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => undefined;
  return child;
}

describe('detectGitPrerequisite', () => {
  it('returns available with the parsed version when git --version succeeds (VHS-REQ-619.1)', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => ({
        exitCode: 0,
        stdout: 'git version 2.46.0.windows.1\n',
        stderr: ''
      })
    });
    expect(detection).toEqual({ available: true, version: '2.46.0.windows.1' });
  });

  it('classifies ENOENT spawn failures as not-found', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => {
        const error = new Error("spawn git ENOENT");
        throw error;
      }
    });
    expect(detection.available).toBe(false);
    if (!detection.available) {
      expect(detection.reason).toBe('not-found');
      expect(detection.errorMessage).toContain('ENOENT');
    }
  });

  it('classifies non-ENOENT spawn failures as probe-failed', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => {
        throw new Error('boom');
      }
    });
    expect(detection.available).toBe(false);
    if (!detection.available) {
      expect(detection.reason).toBe('probe-failed');
      expect(detection.errorMessage).toBe('boom');
    }
  });

  it('treats non-zero exit codes as probe-failed', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'fatal: bad config'
      })
    });
    expect(detection.available).toBe(false);
    if (!detection.available) {
      expect(detection.reason).toBe('probe-failed');
      expect(detection.errorMessage).toContain('fatal: bad config');
    }
  });

  it('treats unrecognized stdout as probe-failed', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => ({
        exitCode: 0,
        stdout: 'something else',
        stderr: ''
      })
    });
    expect(detection.available).toBe(false);
    if (!detection.available) {
      expect(detection.reason).toBe('probe-failed');
    }
  });

  it('parses git version output ignoring case and trailing whitespace', () => {
    expect(parseGitVersionOutput('git version 2.45.1\n')).toBe('2.45.1');
    expect(parseGitVersionOutput('Git Version 2.46.0\n')).toBe('2.46.0');
    expect(parseGitVersionOutput('not a version line')).toBeUndefined();
  });

  it('falls back to a synthesized message when a non-zero exit has no stderr', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => ({
        exitCode: 129,
        stdout: '',
        stderr: '   '
      })
    });
    expect(detection.available).toBe(false);
    if (!detection.available) {
      expect(detection.reason).toBe('probe-failed');
      // stderr is whitespace-only, so the synthesized exit-code message is used.
      expect(detection.errorMessage).toBe('git --version exit code 129');
    }
  });

  it('classifies a non-Error thrown value as probe-failed', async () => {
    const detection = await detectGitPrerequisite({
      runGitVersion: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string failure';
      }
    });
    expect(detection.available).toBe(false);
    if (!detection.available) {
      expect(detection.reason).toBe('probe-failed');
      expect(detection.errorMessage).toBe('string failure');
    }
  });

  it('probes the real git on PATH through the default spawn runner', async () => {
    // No injected runner: exercises defaultRunGitVersion (spawn + stdio + close
    // + parse). Git is present on every CI leg, so this stays deterministic; we
    // assert the discriminated shape rather than an exact version string.
    const detection = await detectGitPrerequisite();
    expect(detection.available).toBe(true);
    if (detection.available) {
      expect(detection.version).toMatch(/^\d+\.\d+/u);
    }
  });
});

describe('createRunGitVersion (VHS-REQ-619.1)', () => {
  it('resolves the captured stdio and exit code on a normal close', async () => {
    const child = createFakeChild();
    const runGitVersion = createRunGitVersion((() => child) as never);
    const promise = runGitVersion();
    child.stdout.emit('data', Buffer.from('git version 2.4'));
    child.stdout.emit('data', Buffer.from('6.0\n'));
    child.stderr.emit('data', Buffer.from('warn'));
    child.emit('close', 0);
    await expect(promise).resolves.toEqual({
      exitCode: 0,
      stdout: 'git version 2.46.0\n',
      stderr: 'warn'
    });
  });

  it('rejects when the child emits an error', async () => {
    const child = createFakeChild();
    const runGitVersion = createRunGitVersion((() => child) as never);
    const promise = runGitVersion();
    child.emit('error', new Error('spawn git ENOENT'));
    await expect(promise).rejects.toThrow('spawn git ENOENT');
  });

  it('rejects when spawn throws synchronously', async () => {
    const runGitVersion = createRunGitVersion(((() => {
      throw new Error('spawn threw');
    }) as never));
    await expect(runGitVersion()).rejects.toThrow('spawn threw');
  });

  it('ignores a late close after an error has already settled the probe', async () => {
    const child = createFakeChild();
    const runGitVersion = createRunGitVersion((() => child) as never);
    const promise = runGitVersion();
    child.emit('error', new Error('first'));
    // A subsequent close must not throw or change the already-rejected result.
    child.emit('close', 0);
    await expect(promise).rejects.toThrow('first');
  });

  it('kills the child and rejects when the probe exceeds the timeout', async () => {
    vi.useFakeTimers();
    try {
      const child = createFakeChild();
      const kill = vi.fn();
      child.kill = kill;
      const runGitVersion = createRunGitVersion((() => child) as never);
      const promise = runGitVersion();
      const assertion = expect(promise).rejects.toThrow('git --version timed out');
      vi.advanceTimersByTime(5_000);
      await assertion;
      expect(kill).toHaveBeenCalledTimes(1);
      // A close after the timeout has settled the probe must be ignored.
      child.emit('close', 0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a late error after a close has already settled the probe', async () => {
    const child = createFakeChild();
    const runGitVersion = createRunGitVersion((() => child) as never);
    const promise = runGitVersion();
    child.emit('close', 0);
    // A subsequent error must hit the already-settled guard in the error
    // handler and must not reject or change the already-resolved result.
    child.emit('error', new Error('late error after close'));
    await expect(promise).resolves.toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
});
