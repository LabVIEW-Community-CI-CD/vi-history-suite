import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isPathInsideDirectory,
  posixDirname,
  buildReportAssetsDirectoryPath
} from '../../src/reporting/runtime/runtimePathHelpers';

describe('isPathInsideDirectory', () => {
  it('is true for the directory itself and nested paths', () => {
    expect(isPathInsideDirectory('/a/b', '/a/b')).toBe(true);
    expect(isPathInsideDirectory('/a/b/c/d.vi', '/a/b')).toBe(true);
  });

  it('normalizes a trailing slash on the directory', () => {
    expect(isPathInsideDirectory('/a/b/c', '/a/b/')).toBe(true);
  });

  it('is false for a sibling or outside path', () => {
    expect(isPathInsideDirectory('/a/bc', '/a/b')).toBe(false);
    expect(isPathInsideDirectory('/x/y', '/a/b')).toBe(false);
  });
});

describe('posixDirname', () => {
  it('uses POSIX dirname for explicit POSIX paths', () => {
    expect(posixDirname('/a/b/c.vi')).toBe('/a/b');
  });

  it('defers to the platform dirname for relative paths', () => {
    expect(posixDirname('a/b/c.vi')).toBe(path.dirname('a/b/c.vi'));
  });
});

describe('buildReportAssetsDirectoryPath', () => {
  it('replaces the .html suffix with _files', () => {
    expect(buildReportAssetsDirectoryPath('/reports/diff.html')).toBe('/reports/diff_files');
  });

  it('is case-insensitive on the .html suffix', () => {
    expect(buildReportAssetsDirectoryPath('/reports/diff.HTML')).toBe('/reports/diff_files');
  });

  it('appends _files when there is no .html suffix', () => {
    expect(buildReportAssetsDirectoryPath('/reports/diff')).toBe('/reports/diff_files');
  });
});
