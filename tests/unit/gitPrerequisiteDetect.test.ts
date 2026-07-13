/**
 * VHS-REQ-619: Verifies the Git --version probe handles available, missing,
 * and probe-failed cases via an injected runner so detection stays
 * deterministic in CI.
 */
import { describe, expect, it } from 'vitest';

import {
  detectGitPrerequisite,
  parseGitVersionOutput
} from '../../src/tooling/gitPrerequisiteDetect';

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
