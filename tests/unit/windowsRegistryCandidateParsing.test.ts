import { describe, expect, it } from 'vitest';

import { parseWindowsRegistryLabviewCandidates } from '../../src/reporting/runtime/windowsRegistryCandidateParsing';

describe('parseWindowsRegistryLabviewCandidates', () => {
  it('parses a direct LabVIEW.exe path', () => {
    const output = 'HKLM\\...    Path    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe';
    const candidates = parseWindowsRegistryLabviewCandidates(output);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe',
      source: 'registry',
      exists: false
    });
  });

  it('derives LabVIEW.exe from an install-directory registry value', () => {
    const output = 'Path    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2026\\ ';
    const candidates = parseWindowsRegistryLabviewCandidates(output);
    expect(candidates.map((candidate) => candidate.path)).toContain(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
  });

  it('deduplicates candidates that appear as both direct and derived forms', () => {
    const output = [
      'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe',
      'C:\\Program Files\\National Instruments\\LabVIEW 2025\\ '
    ].join('\r\n');
    const candidates = parseWindowsRegistryLabviewCandidates(output);
    const paths = candidates.map((candidate) => candidate.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('drops candidates whose inferable year is below the supported minimum', () => {
    const output = 'C:\\Program Files\\National Instruments\\LabVIEW 2020\\LabVIEW.exe';
    expect(parseWindowsRegistryLabviewCandidates(output)).toEqual([]);
  });

  it('keeps candidates with an inferable supported year', () => {
    const output = 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe';
    expect(parseWindowsRegistryLabviewCandidates(output)).toHaveLength(1);
  });

  it('returns an empty list when there are no LabVIEW paths', () => {
    expect(parseWindowsRegistryLabviewCandidates('no matching paths here')).toEqual([]);
  });
});
