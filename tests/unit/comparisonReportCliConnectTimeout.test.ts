import { describe, expect, it } from 'vitest';

import {
  clampCliConnectTimeoutSeconds,
  DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS,
  MAX_CLI_CONNECT_TIMEOUT_SECONDS,
  MIN_CLI_CONNECT_TIMEOUT_SECONDS
} from '../../src/reporting/comparisonReportCliConnectTimeout';

describe('comparisonReportCliConnectTimeout', () => {
  it('exposes the supported window constants', () => {
    expect(DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS).toBe(180);
    expect(MIN_CLI_CONNECT_TIMEOUT_SECONDS).toBe(30);
    expect(MAX_CLI_CONNECT_TIMEOUT_SECONDS).toBe(600);
  });

  it('passes an in-window value through unchanged', () => {
    expect(clampCliConnectTimeoutSeconds(240)).toBe(240);
  });

  it('rounds a fractional value to the nearest integer', () => {
    expect(clampCliConnectTimeoutSeconds(180.5)).toBe(181);
  });

  it('clamps below the minimum and above the maximum', () => {
    expect(clampCliConnectTimeoutSeconds(5)).toBe(MIN_CLI_CONNECT_TIMEOUT_SECONDS);
    expect(clampCliConnectTimeoutSeconds(9999)).toBe(MAX_CLI_CONNECT_TIMEOUT_SECONDS);
  });

  it('falls back to the default for non-finite or non-number input', () => {
    expect(clampCliConnectTimeoutSeconds(Number.NaN)).toBe(DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS);
    expect(clampCliConnectTimeoutSeconds(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS
    );
    expect(clampCliConnectTimeoutSeconds('180' as unknown)).toBe(DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS);
  });
});
