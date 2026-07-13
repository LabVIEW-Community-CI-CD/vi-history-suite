import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  findReachableCommitHashes,
  getFileCommitHashes,
  getFileHistoryCount,
  getFileHistoryEntries,
  getRepoHead,
  getRepoRoot,
  getWindowsGitExecutableCandidates,
  isFileDirtyInWorkingTree,
  isWorktreeRevision,
  listChangedTrackedPaths,
  listReachableCommitHashes,
  listTrackedFileEntries,
  listTrackedFiles,
  normalizeRelativeGitPath,
  parseCommitHashes,
  parseHistoryEntries,
  parseLsFilesStageZ,
  parseLsFilesZ,
  parseStatusPorcelainHasChange,
  runGit,
  resolveGitExecutable,
  resolveGitTimeoutMs,
  WORKTREE_REVISION_SENTINEL
} from '../../src/git/gitCli';

const tempDirectories: string[] = [];

function normalizeAssertPath(candidatePath: string): string {
  const normalized = path.normalize(candidatePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function createTempGitRepo(): Promise<string> {
  const createdRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-git-cli-'));
  // Canonicalize the temp root so it matches what `git rev-parse --show-toplevel`
  // returns: on Windows runners os.tmpdir() yields an 8.3 short name
  // (C:\Users\RUNNER~1\...) while git reports the long name
  // (C:\Users\runneradmin\...), and on macOS /var is a symlink to /private/var.
  const repoRoot = await fs.realpath(createdRoot);
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
  it('recognizes the working-tree revision sentinel (VHS-REQ-641)', () => {
    expect(WORKTREE_REVISION_SENTINEL).toBe('WORKTREE');
    expect(isWorktreeRevision('WORKTREE')).toBe(true);
    expect(isWorktreeRevision('abc1234')).toBe(false);
    expect(isWorktreeRevision(undefined)).toBe(false);
  });

  it('detects tracked change from git status porcelain output (VHS-REQ-641.1)', () => {
    expect(parseStatusPorcelainHasChange(' M path/to/File.vi\n')).toBe(true);
    expect(parseStatusPorcelainHasChange('M  staged.vi\n')).toBe(true);
    expect(parseStatusPorcelainHasChange('')).toBe(false);
    expect(parseStatusPorcelainHasChange('\n')).toBe(false);
  });
  it('parses NUL-separated tracked files safely', () => {
    expect(parseLsFilesZ('alpha.vi\0folder/with spaces.vi\0')).toEqual([
      'alpha.vi',
      'folder/with spaces.vi'
    ]);
  });

  it('parses staged ls-files entries with object IDs and stages', () => {
    expect(
      parseLsFilesStageZ(
        '100644 abcdef1234567890abcdef1234567890abcdef12 0\talpha.vi\0' +
          '100755 0123456789abcdef0123456789abcdef01234567 2\tfolder\\beta.vi\0' +
          'malformed-without-tab\0'
      )
    ).toEqual([
      {
        mode: '100644',
        objectId: 'abcdef1234567890abcdef1234567890abcdef12',
        stage: 0,
        relativePath: 'alpha.vi'
      },
      {
        mode: '100755',
        objectId: '0123456789abcdef0123456789abcdef01234567',
        stage: 2,
        relativePath: 'folder/beta.vi'
      }
    ]);
  });

  it('parses bounded commit hashes', () => {
    expect(parseCommitHashes('abc123\n\ndef456\n')).toEqual(['abc123', 'def456']);
  });

  it('parses history entry records including single-line, multi-line, and empty commit bodies', () => {
    const stdout =
      'abc123\x1f2026-04-02T10:00:00Z\x1fA User\x1fFirst subject\x1fFirst body line\x1e' +
      'def456\x1f2026-04-01T09:00:00Z\x1fB User\x1fSecond subject\x1fSecond body\nwith two lines\x1e' +
      'ghi789\x1f2026-03-31T08:00:00Z\x1fC User\x1fThird subject\x1f\x1e';

    expect(parseHistoryEntries(stdout)).toEqual([
      {
        hash: 'abc123',
        authorDate: '2026-04-02T10:00:00Z',
        authorName: 'A User',
        subject: 'First subject',
        body: 'First body line'
      },
      {
        hash: 'def456',
        authorDate: '2026-04-01T09:00:00Z',
        authorName: 'B User',
        subject: 'Second subject',
        body: 'Second body\nwith two lines'
      },
      {
        hash: 'ghi789',
        authorDate: '2026-03-31T08:00:00Z',
        authorName: 'C User',
        subject: 'Third subject',
        body: ''
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

  it('uses a bounded Git subprocess timeout with an operator override', () => {
    expect(resolveGitTimeoutMs({})).toBe(300000);
    expect(resolveGitTimeoutMs({ VI_HISTORY_SUITE_GIT_TIMEOUT_MS: '450000' })).toBe(450000);
    expect(() =>
      resolveGitTimeoutMs({ VI_HISTORY_SUITE_GIT_TIMEOUT_MS: 'not-a-number' })
    ).toThrow(/Unsupported VI_HISTORY_SUITE_GIT_TIMEOUT_MS value/);
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
    expect(normalizeAssertPath(resolvedRoot)).toBe(normalizeAssertPath(repoRoot));
    expect(trackedFiles).toEqual(['folder with spaces/other.vi', 'nested/sample.vi']);
  });

  it('returns tracked file entries with blob object IDs from a real temporary Git repo', async () => {
    const repoRoot = await createTempGitRepo();
    const trackedPath = path.join(repoRoot, 'nested', 'sample.vi');

    await fs.mkdir(path.dirname(trackedPath), { recursive: true });
    await fs.writeFile(trackedPath, 'first');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add tracked file'], repoRoot);

    const trackedEntries = await listTrackedFileEntries(repoRoot);

    expect(trackedEntries).toEqual([
      expect.objectContaining({
        mode: '100644',
        stage: 0,
        relativePath: 'nested/sample.vi'
      })
    ]);
    expect(trackedEntries[0]?.objectId).toMatch(/^[0-9a-f]{40}$/);
  });

  it('lists dirty, staged, and unmerged tracked paths once', async () => {
    const repoRoot = await createTempGitRepo();
    const dirtyPath = path.join(repoRoot, 'dirty.vi');
    const stagedPath = path.join(repoRoot, 'staged.vi');
    const conflictedPath = path.join(repoRoot, 'conflict.vi');

    await fs.writeFile(dirtyPath, 'clean dirty');
    await fs.writeFile(stagedPath, 'clean staged');
    await fs.writeFile(conflictedPath, 'base\n');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add base files'], repoRoot);
    const baseBranch = String(await runGit(['branch', '--show-current'], repoRoot)).trim();

    await runGit(['checkout', '-b', 'feature'], repoRoot);
    await fs.writeFile(conflictedPath, 'feature\n');
    await runGit(['add', 'conflict.vi'], repoRoot);
    await runGit(['commit', '-m', 'Feature conflict change'], repoRoot);

    await runGit(['checkout', baseBranch], repoRoot);
    await fs.writeFile(conflictedPath, 'master\n');
    await runGit(['add', 'conflict.vi'], repoRoot);
    await runGit(['commit', '-m', 'Master conflict change'], repoRoot);

    await expect(runGit(['merge', 'feature'], repoRoot)).rejects.toThrow();
    await fs.writeFile(dirtyPath, 'dirty worktree');
    await fs.writeFile(stagedPath, 'staged worktree');
    await runGit(['add', 'staged.vi'], repoRoot);

    await expect(listChangedTrackedPaths(repoRoot)).resolves.toEqual([
      'conflict.vi',
      'dirty.vi',
      'staged.vi'
    ]);
  });

  it('reports per-file working-tree dirtiness scoped to the path (VHS-REQ-641.1)', async () => {
    const repoRoot = await createTempGitRepo();
    const targetPath = path.join(repoRoot, 'nested', 'Target.vi');
    const otherPath = path.join(repoRoot, 'Other.vi');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, 'committed target');
    await fs.writeFile(otherPath, 'committed other');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add files'], repoRoot);

    // Clean working tree: no file is dirty.
    await expect(isFileDirtyInWorkingTree(repoRoot, 'nested/Target.vi')).resolves.toBe(false);

    // Dirty only the unrelated file: the scoped target stays clean.
    await fs.writeFile(otherPath, 'changed other');
    await expect(isFileDirtyInWorkingTree(repoRoot, 'nested/Target.vi')).resolves.toBe(false);

    // Dirty the target file itself (unstaged): detected.
    await fs.writeFile(targetPath, 'changed target');
    await expect(isFileDirtyInWorkingTree(repoRoot, 'nested/Target.vi')).resolves.toBe(true);

    // Staged change is also detected; backslash input is normalized.
    await runGit(['add', 'nested/Target.vi'], repoRoot);
    await expect(isFileDirtyInWorkingTree(repoRoot, 'nested\\Target.vi')).resolves.toBe(true);
  });

  it('lists commits reachable from HEAD in reverse chronological order', async () => {
    const repoRoot = await createTempGitRepo();
    const trackedPath = path.join(repoRoot, 'sample.vi');

    await fs.writeFile(trackedPath, 'first');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'First commit'], repoRoot);
    await fs.writeFile(trackedPath, 'second');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Second commit'], repoRoot);

    const head = await getRepoHead(repoRoot);
    const reachableCommits = await listReachableCommitHashes(repoRoot);

    expect(reachableCommits).toHaveLength(2);
    expect(reachableCommits[0]).toBe(head);
    expect(reachableCommits[1]).toMatch(/^[0-9a-f]{40}$/);
  });

  it('finds only requested commits reachable from HEAD', async () => {
    const repoRoot = await createTempGitRepo();
    const trackedPath = path.join(repoRoot, 'sample.vi');

    await fs.writeFile(trackedPath, 'first');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'First commit'], repoRoot);
    await fs.writeFile(trackedPath, 'second');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Second commit'], repoRoot);

    const [head, firstCommit] = await listReachableCommitHashes(repoRoot);
    const reachableProofs = await findReachableCommitHashes(repoRoot, [
      head,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    ]);

    expect(firstCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(reachableProofs).toEqual(new Set([head]));
  });

  it('returns bounded commit hashes and structured history entries from a real temporary Git repo (VHS-REQ-008.1, VHS-REQ-008.2, VHS-REQ-639.3)', async () => {
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
    await runGit(['commit', '-m', 'Third revision', '-m', 'Third revision body line'], repoRoot);

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
    expect(historyEntries[0]?.body).toBe('Third revision body line');
    expect(historyEntries[1]?.body).toBe('');
    expect(historyEntries[2]?.body).toBe('');
    expect(historyEntries[0]?.hash).toBe(commitHashes[0]);
    expect(historyEntries[0]?.authorName).toBe('VI History Suite Test');
    expect(historyEntries[0]?.authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('falls back to bare git when no Windows candidate exists and rejects Git subprocess failures', async () => {
    expect(resolveGitExecutable({}, 'win32', () => false)).toBe('git');

    const repoRoot = await createTempGitRepo();

    await expect(runGit(['definitely-not-a-real-subcommand'], repoRoot, 'utf8')).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'fails closed when a Git subprocess exceeds its timeout',
    async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-git-timeout-'));
      tempDirectories.push(repoRoot);
      const previousGitExe = process.env.VI_HISTORY_SUITE_GIT_EXE;
      process.env.VI_HISTORY_SUITE_GIT_EXE = '/bin/sleep';

      try {
        await expect(runGit(['1'], repoRoot, 'utf8', { timeoutMs: 1 })).rejects.toThrow(
          /Git command timed out after 1 ms/
        );
      } finally {
        if (previousGitExe === undefined) {
          delete process.env.VI_HISTORY_SUITE_GIT_EXE;
        } else {
          process.env.VI_HISTORY_SUITE_GIT_EXE = previousGitExe;
        }
      }
    }
  );
});

describe('gitCli eligibility edge cases (VHS-REQ-006, VHS-REQ-007)', () => {
  it('follows renamed file history and returns commit hashes from before the rename (VHS-REQ-008.3)', async () => {
    const repoRoot = await createTempGitRepo();
    const originalPath = path.join(repoRoot, 'original.vi');
    const renamedPath = path.join(repoRoot, 'renamed.vi');

    await fs.writeFile(originalPath, 'first version');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add original.vi'], repoRoot);
    await fs.writeFile(originalPath, 'second version');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Modify original.vi'], repoRoot);
    await runGit(['mv', 'original.vi', 'renamed.vi'], repoRoot);
    await runGit(['commit', '-m', 'Rename to renamed.vi'], repoRoot);

    const commitHashes = await getFileCommitHashes(repoRoot, 'renamed.vi', 3);
    const historyEntries = await getFileHistoryEntries(repoRoot, 'renamed.vi', 3);

    expect(commitHashes).toHaveLength(3);
    expect(historyEntries).toHaveLength(3);
    expect(historyEntries[0]?.subject).toBe('Rename to renamed.vi');
    expect(historyEntries[1]?.subject).toBe('Modify original.vi');
    expect(historyEntries[2]?.subject).toBe('Add original.vi');
  });

  it('returns empty commit hashes for untracked files in a repository with history (VHS-REQ-006.1)', async () => {
    const repoRoot = await createTempGitRepo();
    const trackedPath = path.join(repoRoot, 'tracked.vi');
    const untrackedPath = path.join(repoRoot, 'untracked.vi');

    await fs.writeFile(trackedPath, 'tracked content');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add tracked file'], repoRoot);
    await fs.writeFile(untrackedPath, 'untracked content');

    const commitHashes = await getFileCommitHashes(repoRoot, 'untracked.vi', 2);
    const historyCount = await getFileHistoryCount(repoRoot, 'untracked.vi');

    expect(commitHashes).toEqual([]);
    expect(historyCount).toBe(0);
  });

  it('rejects queries for files outside the repository boundary', async () => {
    const repoRoot = await createTempGitRepo();
    const trackedPath = path.join(repoRoot, 'tracked.vi');

    await fs.writeFile(trackedPath, 'content');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add file'], repoRoot);

    await expect(
      getFileCommitHashes(repoRoot, '../outside/nonexistent.vi', 2)
    ).rejects.toThrow(/outside repository/);
  });

  it('handles paths with special characters safely when NUL-delimited (VHS-REQ-007.1)', async () => {
    const repoRoot = await createTempGitRepo();
    const specialPath = path.join(repoRoot, 'folder with spaces', 'file [special] (chars).vi');

    await fs.mkdir(path.dirname(specialPath), { recursive: true });
    await fs.writeFile(specialPath, 'first');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Add special char file'], repoRoot);
    await fs.writeFile(specialPath, 'second');
    await runGit(['add', '.'], repoRoot);
    await runGit(['commit', '-m', 'Modify special char file'], repoRoot);

    const trackedFiles = await listTrackedFiles(repoRoot);
    const commitHashes = await getFileCommitHashes(
      repoRoot,
      'folder with spaces/file [special] (chars).vi',
      2
    );

    expect(trackedFiles).toContain('folder with spaces/file [special] (chars).vi');
    expect(commitHashes).toHaveLength(2);
  });

  it('fails closed when tracked path enumeration cannot run at the caller boundary (VHS-REQ-007.3)', async () => {
    const nonRepositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-git-nonrepo-'));
    tempDirectories.push(nonRepositoryRoot);

    await expect(listTrackedFiles(nonRepositoryRoot)).rejects.toThrow(/not a git repository/i);
  });

  it('parses NUL-separated paths with empty segments and trailing NUL bytes correctly (VHS-REQ-007.2)', () => {
    expect(parseLsFilesZ('')).toEqual([]);
    expect(parseLsFilesZ('\0')).toEqual([]);
    expect(parseLsFilesZ('\0\0\0')).toEqual([]);
    expect(parseLsFilesZ('a.vi\0\0b.vi\0')).toEqual(['a.vi', 'b.vi']);
    expect(parseLsFilesZ('single.vi')).toEqual(['single.vi']);
  });

  it('parses NUL-separated buffer output with UTF-8 paths', () => {
    const bufferOutput = Buffer.from('folder/日本語.vi\0path/ñ-file.vi\0', 'utf8');
    expect(parseLsFilesZ(bufferOutput)).toEqual(['folder/日本語.vi', 'path/ñ-file.vi']);
  });

  it('parses commit hashes with CRLF line endings', () => {
    expect(parseCommitHashes('abc123\r\ndef456\r\n')).toEqual(['abc123', 'def456']);
    expect(parseCommitHashes('abc123\r\n\r\ndef456')).toEqual(['abc123', 'def456']);
  });

  it('normalizes mixed path separators and collapses multiple consecutive separators', () => {
    expect(normalizeRelativeGitPath('folder\\\\nested\\\\file.vi')).toBe(
      'folder/nested/file.vi'
    );
    expect(normalizeRelativeGitPath('folder/nested\\mixed/file.vi')).toBe(
      'folder/nested/mixed/file.vi'
    );
    expect(normalizeRelativeGitPath('folder///nested//file.vi')).toBe(
      'folder/nested/file.vi'
    );
  });
});
