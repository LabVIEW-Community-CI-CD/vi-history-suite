import { describe, expect, it } from 'vitest';

import {
  buildLinuxLabviewIniCandidatePaths,
  inferLinuxLabviewVersionFromExecutablePath
} from '../../src/reporting/runtime/linuxLabviewConfigPaths';

describe('buildLinuxLabviewIniCandidatePaths', () => {
  it('returns an empty list when no version is requested', () => {
    expect(buildLinuxLabviewIniCandidatePaths({ homeDir: '/home/u' })).toEqual([]);
  });

  it('builds the x64 candidate set including the -64 token', () => {
    const paths = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/u',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(paths).toContain('/home/u/natinst/.config/LabVIEW-2026/labview.conf');
    expect(paths).toContain('/home/u/.config/natinst/LabVIEW-2026-64/labview.conf');
    expect(paths).toContain('/etc/natinst/LabVIEW-2026-64/labview.conf');
  });

  it('uses the -32 token for x86', () => {
    const paths = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/u',
      requestedLabviewVersion: '2026',
      bitness: 'x86'
    });
    expect(paths.some((p) => p.includes('LabVIEW-2026-32'))).toBe(true);
    expect(paths.some((p) => p.includes('LabVIEW-2026-64'))).toBe(false);
  });

  it('defaults to the -64 token when bitness is unknown', () => {
    const paths = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/u',
      requestedLabviewVersion: '2025'
    });
    expect(paths.some((p) => p.includes('LabVIEW-2025-64'))).toBe(true);
  });

  it('deduplicates candidate paths', () => {
    const paths = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/u',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('inferLinuxLabviewVersionFromExecutablePath', () => {
  it('returns undefined for an empty path', () => {
    expect(inferLinuxLabviewVersionFromExecutablePath(undefined)).toBeUndefined();
    expect(inferLinuxLabviewVersionFromExecutablePath('')).toBeUndefined();
  });

  it('infers the year from a canonical LabVIEW-<year>-<bits> segment', () => {
    expect(
      inferLinuxLabviewVersionFromExecutablePath('/usr/local/natinst/LabVIEW-2026-64/labview')
    ).toBe('2026');
  });

  it('infers the year from a bare LabVIEW-<year> segment', () => {
    expect(
      inferLinuxLabviewVersionFromExecutablePath('/opt/natinst/LabVIEW-2025/labview')
    ).toBe('2025');
  });

  it('returns undefined when no segment matches the canonical shape', () => {
    expect(
      inferLinuxLabviewVersionFromExecutablePath('/usr/local/bin/labview')
    ).toBeUndefined();
  });
});
