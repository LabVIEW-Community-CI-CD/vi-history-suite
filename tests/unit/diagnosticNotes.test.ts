import { describe, expect, it } from 'vitest';

import {
  isLabviewCliLogOnlyStdout,
  mergeDiagnosticNotes,
  buildProcessObservationNotes,
  extractCommandOptionValue
} from '../../src/reporting/runtime/diagnosticNotes';

describe('isLabviewCliLogOnlyStdout', () => {
  it('is true when only the logging banner is present', () => {
    expect(isLabviewCliLogOnlyStdout('LabVIEWCLI started logging in file: C:\\x.log')).toBe(true);
  });

  it('is false when other content is present', () => {
    expect(
      isLabviewCliLogOnlyStdout('LabVIEWCLI started logging in file: C:\\x.log\nother line')
    ).toBe(false);
    expect(isLabviewCliLogOnlyStdout('')).toBe(false);
  });
});

describe('mergeDiagnosticNotes', () => {
  it('merges groups preserving order and dropping duplicates', () => {
    expect(mergeDiagnosticNotes(['a', 'b'], undefined, ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array when all groups are empty/undefined', () => {
    expect(mergeDiagnosticNotes(undefined, [])).toEqual([]);
  });
});

describe('buildProcessObservationNotes', () => {
  it('formats banner and exit snapshots into notes', () => {
    const notes = buildProcessObservationNotes({
      bannerSnapshot: {
        trigger: 'banner',
        capturedAt: '2026-01-01T00:00:00.000Z',
        observedProcessNames: ['LabVIEWCLI.exe'],
        labviewProcessObserved: false,
        labviewCliProcessObserved: true,
        lvcompareProcessObserved: false
      }
    });
    expect(notes.some((n) => n.includes('observed LabVIEW-related processes: LabVIEWCLI.exe'))).toBe(
      true
    );
    expect(
      notes.some((n) => n.includes('LabVIEWCLI.exe was observed while LabVIEW.exe was not observed'))
    ).toBe(true);
    expect(notes.some((n) => n.includes('LVCompare.exe was not observed'))).toBe(true);
  });

  it('returns an empty array for no observations', () => {
    expect(buildProcessObservationNotes(undefined)).toEqual([]);
  });
});

describe('extractCommandOptionValue', () => {
  it('returns the value following the option name', () => {
    expect(extractCommandOptionValue(['-LabVIEWPath', 'C:\\NI\\LabVIEW.exe'], '-LabVIEWPath')).toBe(
      'C:\\NI\\LabVIEW.exe'
    );
  });

  it('returns undefined when the option is absent or has no value', () => {
    expect(extractCommandOptionValue(['-x', 'y'], '-LabVIEWPath')).toBeUndefined();
    expect(extractCommandOptionValue(['-LabVIEWPath'], '-LabVIEWPath')).toBeUndefined();
    expect(extractCommandOptionValue(['-LabVIEWPath', '   '], '-LabVIEWPath')).toBeUndefined();
  });
});
