import { describe, expect, it } from 'vitest';

import {
  isSupportedComparisonReportLabviewVersion,
  matchesRequestedLabviewVersion,
  normalizeRequestedLabviewVersion
} from '../../src/reporting/runtime/labviewVersionSelection';

describe('normalizeRequestedLabviewVersion', () => {
  it('extracts a 4-digit year from a longer version string', () => {
    expect(normalizeRequestedLabviewVersion('LabVIEW 2026 Q1')).toBe('2026');
  });

  it('returns the trimmed raw value when no year is present', () => {
    expect(normalizeRequestedLabviewVersion('  community  ')).toBe('community');
  });

  it('returns undefined for blank input', () => {
    expect(normalizeRequestedLabviewVersion('   ')).toBeUndefined();
    expect(normalizeRequestedLabviewVersion(undefined)).toBeUndefined();
  });
});

describe('isSupportedComparisonReportLabviewVersion', () => {
  it('accepts years at or after the minimum', () => {
    expect(isSupportedComparisonReportLabviewVersion('2025')).toBe(true);
    expect(isSupportedComparisonReportLabviewVersion('2026')).toBe(true);
  });

  it('rejects years before the minimum', () => {
    expect(isSupportedComparisonReportLabviewVersion('2024')).toBe(false);
  });

  it('treats a non-numeric request as supported', () => {
    expect(isSupportedComparisonReportLabviewVersion('community')).toBe(true);
  });
});

describe('matchesRequestedLabviewVersion', () => {
  it('matches a labview-exe candidate whose path year equals the request', () => {
    expect(
      matchesRequestedLabviewVersion(
        { kind: 'labview-exe', path: '/opt/LabVIEW 2026/LabVIEW.exe' } as never,
        '2026'
      )
    ).toBe(true);
  });

  it('does not match when the path year differs', () => {
    expect(
      matchesRequestedLabviewVersion(
        { kind: 'labview-exe', path: '/opt/LabVIEW 2025/LabVIEW.exe' } as never,
        '2026'
      )
    ).toBe(false);
  });

  it('always matches when no version is requested or the candidate is not labview-exe', () => {
    expect(
      matchesRequestedLabviewVersion({ kind: 'labview-exe', path: '/x' } as never, undefined)
    ).toBe(true);
    expect(
      matchesRequestedLabviewVersion({ kind: 'labview-cli', path: '/x' } as never, '2026')
    ).toBe(true);
  });
});
