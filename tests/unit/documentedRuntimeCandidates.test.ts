import { describe, expect, it } from 'vitest';

import {
  buildDocumentedRuntimeCandidates,
  buildWindowsRegistryQueryPlans
} from '../../src/reporting/runtime/documentedRuntimeCandidates';

describe('buildWindowsRegistryQueryPlans', () => {
  it('returns the 64-bit and WOW6432Node query plans', () => {
    const plans = buildWindowsRegistryQueryPlans();
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      command: 'reg',
      keyPath: 'HKLM\\SOFTWARE\\National Instruments\\LabVIEW',
      regView: '64'
    });
    expect(plans[1]).toMatchObject({
      command: 'reg',
      keyPath: 'HKLM\\SOFTWARE\\WOW6432Node\\National Instruments\\LabVIEW',
      regView: '32'
    });
    expect(plans[0].args).toContain('/reg:64');
    expect(plans[1].args).toContain('/reg:32');
  });
});

describe('buildDocumentedRuntimeCandidates', () => {
  it('builds win32 candidates seeded exists:false with labview-cli and both lvcompare paths', () => {
    const candidates = buildDocumentedRuntimeCandidates('win32');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.exists === false)).toBe(true);
    expect(candidates.every((candidate) => candidate.source === 'scan')).toBe(true);
    expect(candidates.some((candidate) => candidate.kind === 'labview-cli')).toBe(true);
    expect(candidates.filter((candidate) => candidate.kind === 'lvcompare')).toHaveLength(2);
  });

  it('builds linux candidates including labview-cli and a single lvcompare path', () => {
    const candidates = buildDocumentedRuntimeCandidates('linux');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.source === 'scan')).toBe(true);
    expect(candidates.some((candidate) => candidate.kind === 'labview-cli')).toBe(true);
    expect(candidates.filter((candidate) => candidate.kind === 'lvcompare')).toHaveLength(1);
  });

  it('returns an empty list for an unsupported platform', () => {
    expect(buildDocumentedRuntimeCandidates('darwin')).toEqual([]);
  });
});
