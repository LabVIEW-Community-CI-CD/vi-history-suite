import { describe, expect, it } from 'vitest';

import {
  getWindowsGitExecutableCandidates,
  normalizeRelativeGitPath,
  parseCommitHashes,
  parseHistoryEntries,
  parseLsFilesZ,
  resolveGitExecutable
} from '../../src/git/gitCli';

describe('gitCli parsing', () => {
  it('parses NUL-separated tracked files safely', () => {
    expect(parseLsFilesZ('alpha.vi\0folder/with spaces.vi\0')).toEqual([
      'alpha.vi',
      'folder/with spaces.vi'
    ]);
  });

  it('parses bounded commit hashes', () => {
    expect(parseCommitHashes('abc123\n\ndef456\n')).toEqual(['abc123', 'def456']);
  });

  it('parses history entry records', () => {
    const stdout =
      'abc123\x1f2026-04-02T10:00:00Z\x1fA User\x1fFirst subject\x1e' +
      'def456\x1f2026-04-01T09:00:00Z\x1fB User\x1fSecond subject\x1e';

    expect(parseHistoryEntries(stdout)).toEqual([
      {
        hash: 'abc123',
        authorDate: '2026-04-02T10:00:00Z',
        authorName: 'A User',
        subject: 'First subject'
      },
      {
        hash: 'def456',
        authorDate: '2026-04-01T09:00:00Z',
        authorName: 'B User',
        subject: 'Second subject'
      }
    ]);
  });

  it('normalizes Windows-style separators for Git paths', () => {
    expect(normalizeRelativeGitPath('folder\\nested\\file.vi')).toBe(
      'folder/nested/file.vi'
    );
  });

  it('prefers an explicit git executable override', () => {
    expect(
      resolveGitExecutable(
        {
          VI_HISTORY_SUITE_GIT_EXE: 'D:\\tools\\git\\bin\\git.exe'
        },
        'win32'
      )
    ).toBe('D:\\tools\\git\\bin\\git.exe');
  });

  it('resolves a deterministic Windows git path when PATH is unavailable', () => {
    expect(
      resolveGitExecutable(
        {
          ProgramFiles: 'C:\\Program Files'
        },
        'win32',
        (candidate) => candidate.endsWith('C:\\Program Files\\Git\\cmd\\git.exe')
      )
    ).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
  });

  it('returns stable Windows git candidates without duplicates', () => {
    expect(
      getWindowsGitExecutableCandidates({
        ProgramFiles: 'C:\\Program Files',
        ProgramW6432: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)'
      })
    ).toEqual([
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\bin\\git.exe'
    ]);
  });
});
