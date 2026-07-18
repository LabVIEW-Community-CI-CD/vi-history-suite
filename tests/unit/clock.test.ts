import { describe, expect, it } from 'vitest';

import { nowIso } from '../../src/support/clock';

describe('nowIso', () => {
  it('returns a parseable ISO-8601 timestamp string', () => {
    const value = nowIso();
    expect(typeof value).toBe('string');
    expect(value).toBe(new Date(value).toISOString());
  });

  it('returns a value close to the current time', () => {
    const before = Date.now();
    const parsed = new Date(nowIso()).getTime();
    const after = Date.now();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
