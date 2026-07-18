import { describe, expect, it } from 'vitest';

import { requireNonEmpty } from '../../src/support/requireNonEmpty';

describe('requireNonEmpty', () => {
  it('returns the trimmed value for a non-empty input', () => {
    expect(requireNonEmpty('  hello  ', 'name')).toBe('hello');
  });

  it('returns a value that needs no trimming unchanged', () => {
    expect(requireNonEmpty('value', 'name')).toBe('value');
  });

  it('throws a field-named error for an empty string', () => {
    expect(() => requireNonEmpty('', 'name')).toThrow('name must be non-empty');
  });

  it('throws a field-named error for a whitespace-only string', () => {
    expect(() => requireNonEmpty('   ', 'baseHash')).toThrow('baseHash must be non-empty');
  });
});
