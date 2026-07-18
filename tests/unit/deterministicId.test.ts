import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createDeterministicId } from '../../src/support/deterministicId';

describe('createDeterministicId', () => {
  it('returns the first 12 hex characters of the SHA-256 digest', () => {
    const expected = createHash('sha256').update('example').digest('hex').slice(0, 12);
    expect(createDeterministicId('example')).toBe(expected);
  });

  it('produces a 12-character lowercase hex id', () => {
    expect(createDeterministicId('anything')).toMatch(/^[a-f0-9]{12}$/);
  });

  it('is deterministic for the same input', () => {
    expect(createDeterministicId('stable')).toBe(createDeterministicId('stable'));
  });

  it('produces different ids for different inputs', () => {
    expect(createDeterministicId('a')).not.toBe(createDeterministicId('b'));
  });
});
