import { describe, expect, it } from 'vitest';

import {
  normalizeWindowsInteropPath,
  normalizeWindowsInteropExecutable,
  normalizeComparablePath
} from '../../src/reporting/runtime/windowsInteropPaths';

describe('normalizeWindowsInteropPath', () => {
  it('keeps a drive-letter path and coerces to backslashes', () => {
    expect(normalizeWindowsInteropPath('C:/workspace/staging/foo.vi')).toBe(
      'C:\\workspace\\staging\\foo.vi'
    );
  });

  it('maps a /mnt WSL path to drive-letter form', () => {
    expect(normalizeWindowsInteropPath('/mnt/d/workspace/foo.vi')).toBe('D:\\workspace\\foo.vi');
  });

  it('returns the drive root for an empty /mnt tail', () => {
    expect(normalizeWindowsInteropPath('/mnt/c/')).toBe('C:\\');
  });

  it('returns undefined for empty or unmappable input', () => {
    expect(normalizeWindowsInteropPath('   ')).toBeUndefined();
    expect(normalizeWindowsInteropPath('relative/without/drive')).toBeUndefined();
  });
});

describe('normalizeWindowsInteropExecutable', () => {
  it('passes /mnt paths through unchanged', () => {
    expect(normalizeWindowsInteropExecutable('/mnt/c/NI/LabVIEWCLI.exe')).toBe(
      '/mnt/c/NI/LabVIEWCLI.exe'
    );
  });

  it('maps a drive-letter path to /mnt form', () => {
    expect(normalizeWindowsInteropExecutable('C:\\NI\\LabVIEWCLI.exe')).toBe(
      '/mnt/c/NI/LabVIEWCLI.exe'
    );
  });

  it('returns undefined for empty or unmappable input', () => {
    expect(normalizeWindowsInteropExecutable('   ')).toBeUndefined();
    expect(normalizeWindowsInteropExecutable('relative-executable')).toBeUndefined();
  });
});

describe('normalizeComparablePath', () => {
  it('produces a lowercase backslash form for case-insensitive comparison', () => {
    expect(normalizeComparablePath('/mnt/c/NI/LabVIEW.exe')).toBe('c:\\ni\\labview.exe');
  });

  it('normalizes a forward-slash relative path without a drive', () => {
    expect(normalizeComparablePath('Foo/Bar')).toBe('foo\\bar');
  });

  it('returns undefined for blank input', () => {
    expect(normalizeComparablePath('   ')).toBeUndefined();
    expect(normalizeComparablePath(undefined)).toBeUndefined();
  });
});
