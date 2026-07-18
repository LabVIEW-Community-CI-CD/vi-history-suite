import { describe, expect, it } from 'vitest';

import { errorMessage } from '../../src/support/errorMessage';

describe('errorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the message of an Error subclass', () => {
    class CustomError extends Error {}
    expect(errorMessage(new CustomError('custom failure'))).toBe('custom failure');
  });

  it('stringifies a non-Error string value', () => {
    expect(errorMessage('plain string')).toBe('plain string');
  });

  it('stringifies a non-Error numeric value', () => {
    expect(errorMessage(42)).toBe('42');
  });

  it('stringifies null and undefined', () => {
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
