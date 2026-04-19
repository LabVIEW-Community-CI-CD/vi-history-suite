import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getFileCommitHashes,
  getFileHistoryCount,
  getFileHistoryEntries,
  getRepoHead,
  getRepoRoot,
  getWindowsGitExecutableCandidates,
  listTrackedFiles,
  normalizeRelativeGitPath,
  parseCommitHashes,
  parseHistoryEntries,
  parseLsFilesZ,
  runGit,
  resolveGitExecutable
} from '../../src/git/gitCli';

const tempDirectories: string[] = [];

async function createTempGitRepo(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-git-cli-'));
  tempDirectories.push(repoRoot);
  await runGit(['init'], repoRoot);
  await runGit(['config', 'user.name', 'VI History Suite Test'], repoRoot);
  await runGit(['config', 'user.email', 'vihs@example.invalid'], repoRoot);
  return repoRoot;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

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

  it('returns trimmed HEAD, repository root, and tracked files from a real temporary Git repo', async () => {
    const repoRoot = await createTempGitRepo();
    const nestedRoot = path.join(repoRoot, 'nested');
    const trackedPath = path.join(nestedRoot, 'sample.vi');
    const secondTrackedPath = path.join(repoRoot, 'folder with spaces', 'other.vi');

    await fs.mkdir(path.dirname(trackedPath), { recursive: true });
    await fs.mkdir(path.dirname(secondTrackedPath), { recursive: true });
    await fs.writeFile(trackedPath, 'first');
    await fs.writeFile(secondTrackedPath, 'second');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add tracked files'], repoRoot);

    const head = await getRepoHead(repoRoot);
    const resolvedRoot = await getRepoRoot(nestedRoot);
    const trackedFiles = await listTrackedFiles(repoRoot);

    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(path.normalize(resolvedRoot)).toBe(path.normalize(repoRoot));
    expect(trackedFiles).toEqual(['folder with spaces/other.vi', 'nested/sample.vi']);
  });

  it('returns bounded commit hashes and structured history entries from a real temporary Git repo', async () => {
    const repoRoot = await createTempGitRepo();
    const trackedPath = path.join(repoRoot, 'nested', 'history.vi');

    await fs.mkdir(path.dirname(trackedPath), { recursive: true });
    await fs.writeFile(trackedPath, 'first');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'First revision'], repoRoot);
    await fs.writeFile(trackedPath, 'second');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Second revision'], repoRoot);
    await fs.writeFile(trackedPath, 'third');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Third revision'], repoRoot);

    const commitHashes = await getFileCommitHashes(repoRoot, 'nested\\history.vi', 2);
    const historyCount = await getFileHistoryCount(repoRoot, 'nested\\history.vi');
    const historyEntries = await getFileHistoryEntries(repoRoot, 'nested\\history.vi', 3);

    expect(commitHashes).toHaveLength(2);
    expect(historyCount).toBe(3);
    expect(commitHashes[0]).toMatch(/^[0-9a-f]{40}$/);
    expect(commitHashes[1]).toMatch(/^[0-9a-f]{40}$/);
    expect(historyEntries).toHaveLength(3);
    expect(historyEntries[0]?.subject).toBe('Third revision');
    expect(historyEntries[1]?.subject).toBe('Second revision');
    expect(historyEntries[2]?.subject).toBe('First revision');
    expect(historyEntries[0]?.hash).toBe(commitHashes[0]);
    expect(historyEntries[0]?.authorName).toBe('VI History Suite Test');
    expect(historyEntries[0]?.authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('falls back to bare git when no Windows candidate exists and rejects Git subprocess failures', async () => {
    expect(resolveGitExecutable({}, 'win32', () => false)).toBe('git');

    const repoRoot = await createTempGitRepo();

    await expect(runGit(['definitely-not-a-real-subcommand'], repoRoot, 'utf8')).rejects.toThrow();
  });
});
