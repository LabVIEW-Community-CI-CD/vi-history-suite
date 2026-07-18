import { describe, expect, it } from 'vitest';

import {
  parseWindowsTasklistCsv,
  parseWindowsTasklistCsvLine,
  isObservedRuntimeProcessName,
  isExactObservedRuntimeProcessName
} from '../../src/reporting/runtime/windowsTasklistParsing';

describe('parseWindowsTasklistCsvLine', () => {
  it('parses a well-formed tasklist CSV line', () => {
    const line = '"LabVIEW.exe","1234","Console","1","123,456 K"';
    expect(parseWindowsTasklistCsvLine(line)).toEqual({
      imageName: 'LabVIEW.exe',
      pid: 1234,
      sessionName: 'Console',
      sessionNumber: 1,
      memUsage: '123,456 K'
    });
  });

  it('unescapes doubled quotes inside a field', () => {
    const line = '"a""b.exe","7","","",""';
    expect(parseWindowsTasklistCsvLine(line)?.imageName).toBe('a"b.exe');
  });

  it('returns undefined for a line without a usable image name / PID', () => {
    expect(parseWindowsTasklistCsvLine('"","notapid"')).toBeUndefined();
    expect(parseWindowsTasklistCsvLine('onlyonecolumn')).toBeUndefined();
  });

  it('omits optional fields that are blank', () => {
    const parsed = parseWindowsTasklistCsvLine('"proc.exe","9"');
    expect(parsed).toEqual({
      imageName: 'proc.exe',
      pid: 9,
      sessionName: undefined,
      sessionNumber: undefined,
      memUsage: undefined
    });
  });
});

describe('isExactObservedRuntimeProcessName', () => {
  it('matches case-insensitively after trimming', () => {
    expect(isExactObservedRuntimeProcessName('  labview.exe  ', 'LabVIEW.exe')).toBe(true);
  });

  it('does not match a different image', () => {
    expect(isExactObservedRuntimeProcessName('other.exe', 'LabVIEW.exe')).toBe(false);
  });
});

describe('isObservedRuntimeProcessName', () => {
  it('recognizes the three runtime process images', () => {
    expect(isObservedRuntimeProcessName('LabVIEW.exe')).toBe(true);
    expect(isObservedRuntimeProcessName('labviewcli.exe')).toBe(true);
    expect(isObservedRuntimeProcessName('LVCompare.exe')).toBe(true);
  });

  it('rejects an unrelated image', () => {
    expect(isObservedRuntimeProcessName('notepad.exe')).toBe(false);
  });
});

describe('parseWindowsTasklistCsv', () => {
  it('parses multiple CSV rows into observed-process records', () => {
    const stdout = [
      '"LabVIEW.exe","1234","Console","1","123,456 K"',
      '"LVCompare.exe","5678","Console","1","7,890 K"'
    ].join('\r\n');
    const parsed = parseWindowsTasklistCsv(stdout);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ imageName: 'LabVIEW.exe', pid: 1234 });
    expect(parsed[1]).toMatchObject({ imageName: 'LVCompare.exe', pid: 5678 });
  });

  it('drops blank lines and rows the line parser rejects', () => {
    const stdout = [
      '',
      '   ',
      'not,enough',
      '"LabVIEW.exe","1234","Console","1","123,456 K"'
    ].join('\n');
    expect(parseWindowsTasklistCsv(stdout)).toHaveLength(1);
  });

  it('returns an empty array for empty stdout', () => {
    expect(parseWindowsTasklistCsv('')).toEqual([]);
  });
});
