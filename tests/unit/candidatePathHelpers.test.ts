import { describe, expect, it } from 'vitest';

import {
  normalizeCandidatePath,
  dedupeCandidates
} from '../../src/reporting/runtime/candidatePathHelpers';

describe('normalizeCandidatePath', () => {
  it('converts to backslashes and lowercases', () => {
    expect(normalizeCandidatePath('C:/NI/LabVIEW.exe')).toBe('c:\\ni\\labview.exe');
  });
});

describe('dedupeCandidates', () => {
  it('drops duplicate (kind, lowercased path) entries preserving first-seen order', () => {
    const candidates = [
      { kind: 'labview-exe', path: 'C:\\NI\\LabVIEW.exe' },
      { kind: 'labview-exe', path: 'c:\\ni\\labview.exe' },
      { kind: 'labview-cli', path: 'C:\\NI\\LabVIEW.exe' }
    ] as never[];
    const deduped = dedupeCandidates(candidates);
    expect(deduped).toHaveLength(2);
    expect((deduped[0] as { kind: string }).kind).toBe('labview-exe');
    expect((deduped[1] as { kind: string }).kind).toBe('labview-cli');
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeCandidates([])).toEqual([]);
  });
});
