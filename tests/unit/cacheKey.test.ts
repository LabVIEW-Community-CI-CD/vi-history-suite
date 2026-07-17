import { describe, expect, it } from 'vitest';

import { isSha256HexKey } from '../../src/support/cacheKey';

describe('isSha256HexKey', () => {
  const validKey = 'a'.repeat(64);

  it('accepts a 64-character lowercase hex string', () => {
    expect(isSha256HexKey(validKey)).toBe(true);
  });

  it('accepts a realistic sha256 hex digest', () => {
    expect(
      isSha256HexKey('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    ).toBe(true);
  });

  it('rejects a string that is too short', () => {
    expect(isSha256HexKey('a'.repeat(63))).toBe(false);
  });

  it('rejects a string that is too long', () => {
    expect(isSha256HexKey('a'.repeat(65))).toBe(false);
  });

  it('rejects uppercase hex characters', () => {
    expect(isSha256HexKey('A'.repeat(64))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isSha256HexKey('g'.repeat(64))).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSha256HexKey('')).toBe(false);
  });
});
