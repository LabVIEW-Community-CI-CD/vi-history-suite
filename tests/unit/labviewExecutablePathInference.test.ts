import { describe, expect, it } from 'vitest';

import {
  inferLabviewBitnessFromExecutablePath,
  inferLabviewYearFromExecutablePath,
  inferSupportedLabviewYearFromExecutablePath
} from '../../src/reporting/runtime/labviewExecutablePathInference';

describe('inferLabviewBitnessFromExecutablePath', () => {
  it('infers x86 from a Program Files (x86) path', () => {
    expect(
      inferLabviewBitnessFromExecutablePath(
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
      )
    ).toBe('x86');
  });

  it('infers x64 from a Program Files path', () => {
    expect(
      inferLabviewBitnessFromExecutablePath(
        'C:/Program Files/National Instruments/LabVIEW 2025/LabVIEW.exe'
      )
    ).toBe('x64');
  });

  it('returns unknown for an unrecognized path and undefined for blank input', () => {
    expect(inferLabviewBitnessFromExecutablePath('D:\\custom\\LabVIEW.exe')).toBe('unknown');
    expect(inferLabviewBitnessFromExecutablePath('')).toBeUndefined();
    expect(inferLabviewBitnessFromExecutablePath(undefined)).toBeUndefined();
  });
});

describe('inferLabviewYearFromExecutablePath', () => {
  it('extracts the 20xx year from a LabVIEW install path', () => {
    expect(
      inferLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      )
    ).toBe('2026');
  });

  it('returns undefined when no plausible year is present', () => {
    expect(inferLabviewYearFromExecutablePath('C:\\tools\\labview.exe')).toBeUndefined();
    expect(inferLabviewYearFromExecutablePath(undefined)).toBeUndefined();
  });
});

describe('inferSupportedLabviewYearFromExecutablePath', () => {
  it('returns the year when it is within the supported host range', () => {
    expect(
      inferSupportedLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
      )
    ).toBe('2025');
  });

  it('returns undefined for an out-of-range year', () => {
    expect(
      inferSupportedLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2001\\LabVIEW.exe'
      )
    ).toBeUndefined();
  });
});
