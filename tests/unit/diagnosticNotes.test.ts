import { describe, expect, it } from 'vitest';

import {
  isLabviewCliLogOnlyStdout,
  mergeDiagnosticNotes,
  buildProcessObservationNotes,
  buildLinuxContainerBindMountVisibilityNote,
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

describe('buildLinuxContainerBindMountVisibilityNote', () => {
  const base = {
    provider: 'linux-container',
    diagnosticReason: 'labview-cli-invalid-vi-path',
    hostBindMountPath: '/mnt/data/reports',
    homeDir: '/home/u'
  };

  it('builds the snap-Docker visibility note when the report dir is outside home', () => {
    const note = buildLinuxContainerBindMountVisibilityNote(base);
    expect(note).toContain('/mnt/data/reports');
    expect(note).toContain('/home/u');
    expect(note).toContain('snap connect docker:removable-media');
  });

  it('matches on failureReason as well as diagnosticReason', () => {
    const note = buildLinuxContainerBindMountVisibilityNote({
      provider: 'linux-container',
      failureReason: 'labview-cli-invalid-vi-path',
      hostBindMountPath: '/mnt/data/reports',
      homeDir: '/home/u'
    });
    expect(note).toBeTruthy();
  });

  it('returns undefined for a non-linux-container provider', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({ ...base, provider: 'windows-container' })
    ).toBeUndefined();
  });

  it('returns undefined for an unrelated failure reason', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        ...base,
        diagnosticReason: 'something-else'
      })
    ).toBeUndefined();
  });

  it('returns undefined when the report dir is inside the home directory', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        ...base,
        hostBindMountPath: '/home/u/reports'
      })
    ).toBeUndefined();
  });

  it('returns undefined when the host path or home dir is missing', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({ ...base, hostBindMountPath: '  ' })
    ).toBeUndefined();
    expect(
      buildLinuxContainerBindMountVisibilityNote({ ...base, homeDir: undefined })
    ).toBeUndefined();
  });
});
