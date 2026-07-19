import { afterEach, describe, expect, it, vi } from 'vitest';

import { nowIso } from '../../src/support/clock';

const ISO_8601_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('nowIso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a UTC ISO-8601 timestamp with millisecond precision', () => {
    const value = nowIso();
    expect(typeof value).toBe('string');
    // Assert the exact shape rather than only round-trip parseability so a
    // locale/timezone-sensitive regression (e.g. a non-UTC or offset-bearing
    // format) fails loudly. toISOString is always UTC ("Z"), so this holds on
    // every platform including Windows CI regardless of the host timezone.
    expect(value).toMatch(ISO_8601_UTC_MS);
    expect(value).toBe(new Date(value).toISOString());
  });

  it('reflects the injected system time deterministically', () => {
    // Deterministic over a fixed fake clock instead of the ambient wall clock,
    // so the assertion is exact and never depends on host timer resolution or
    // clock jitter (a Windows-CI flake source for real-clock timing bounds).
    const fixed = new Date('2026-07-19T12:34:56.789Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixed);

    expect(nowIso()).toBe('2026-07-19T12:34:56.789Z');
  });

  it('advances with the injected clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T00:00:00.000Z'));
    const first = nowIso();

    vi.advanceTimersByTime(1500);
    const second = nowIso();

    expect(first).toBe('2026-07-19T00:00:00.000Z');
    expect(second).toBe('2026-07-19T00:00:01.500Z');
    expect(new Date(second).getTime() - new Date(first).getTime()).toBe(1500);
  });

  it('returns a value near the real current time within a tolerant window', () => {
    // A loose sanity check on the real clock. The window is generous (not a
    // strict before<=t<=after bound) because Windows timer resolution can be
    // ~15ms and CI clock adjustments can nudge the wall clock, which made a
    // tight bound flaky. We only assert the timestamp is recent, not exact.
    const toleranceMs = 60_000;
    const captured = Date.now();
    const parsed = new Date(nowIso()).getTime();

    expect(Math.abs(parsed - captured)).toBeLessThanOrEqual(toleranceMs);
  });
});
