import { describe, expect, it } from 'vitest';

import {
  extractErrorCode,
  normalizeComparisonProcessError
} from '../../src/reporting/runtime/comparisonProcessErrorNormalization';

describe('extractErrorCode', () => {
  it('returns a string code from an errno-like error', () => {
    const error: NodeJS.ErrnoException = new Error('missing');
    error.code = 'ENOENT';
    expect(extractErrorCode(error)).toBe('ENOENT');
  });

  it('returns undefined when there is no string code', () => {
    expect(extractErrorCode(new Error('plain'))).toBeUndefined();
    expect(extractErrorCode('not an object')).toBeUndefined();
    expect(extractErrorCode(null)).toBeUndefined();
  });
});

describe('normalizeComparisonProcessError', () => {
  it('normalizes an object error with stdout/stderr/signal', () => {
    expect(
      normalizeComparisonProcessError({ stdout: 'out', stderr: 'err', signal: 'SIGKILL' })
    ).toEqual({ stdout: 'out', stderr: 'err', signal: 'SIGKILL' });
  });

  it('falls back to message for stderr and omits signal', () => {
    expect(normalizeComparisonProcessError({ message: 'boom' })).toEqual({
      stdout: '',
      stderr: 'boom',
      signal: undefined
    });
  });

  it('stringifies a non-object error into stderr', () => {
    expect(normalizeComparisonProcessError('raw failure')).toEqual({
      stdout: '',
      stderr: 'raw failure'
    });
  });

  it('produces an empty stderr for null/undefined', () => {
    expect(normalizeComparisonProcessError(undefined)).toEqual({ stdout: '', stderr: '' });
  });
});
