import { describe, expect, it } from 'vitest';

import { describeBitness, inferBitnessFromPath } from '../../src/reporting/runtime/bitnessHelpers';

describe('describeBitness', () => {
  it('labels x86 as 32-bit and x64 as 64-bit', () => {
    expect(describeBitness('x86')).toBe('32-bit');
    expect(describeBitness('x64')).toBe('64-bit');
  });
});

describe('inferBitnessFromPath', () => {
  it('infers x86 from a Program Files (x86) path', () => {
    expect(
      inferBitnessFromPath('C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe')
    ).toBe('x86');
  });

  it('infers x64 from a Windows Program Files path', () => {
    expect(
      inferBitnessFromPath('C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe')
    ).toBe('x64');
  });

  it('infers x64 from Linux and macOS NI install paths', () => {
    expect(inferBitnessFromPath('/usr/local/natinst/LabVIEW-2026-64/labview')).toBe('x64');
    expect(inferBitnessFromPath('/Applications/National Instruments/LabVIEW 2026/LabVIEW.app')).toBe(
      'x64'
    );
  });

  it('returns undefined for an unrecognized path', () => {
    expect(inferBitnessFromPath('/opt/custom/labview')).toBeUndefined();
  });
});
