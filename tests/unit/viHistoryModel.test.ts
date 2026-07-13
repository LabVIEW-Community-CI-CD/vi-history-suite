import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  detectViSignatureFromFsPathMock,
  getFileCommitHashesMock,
  getFileHistoryCountMock,
  getFileHistoryEntriesMock,
  getRepoRemoteUrlMock,
  getRepoRootMock,
  isFileDirtyInWorkingTreeMock
} = vi.hoisted(() => ({
  detectViSignatureFromFsPathMock: vi.fn(),
  getFileCommitHashesMock: vi.fn(),
  getFileHistoryCountMock: vi.fn(),
  getFileHistoryEntriesMock: vi.fn(),
  getRepoRemoteUrlMock: vi.fn(),
  getRepoRootMock: vi.fn(),
  isFileDirtyInWorkingTreeMock: vi.fn()
}));

vi.mock('../../src/domain/viFile', () => ({
  detectViSignatureFromFsPath: detectViSignatureFromFsPathMock
}));

vi.mock('../../src/git/gitCli', () => ({
  getFileCommitHashes: getFileCommitHashesMock,
  getFileHistoryCount: getFileHistoryCountMock,
  getFileHistoryEntries: getFileHistoryEntriesMock,
  getRepoRemoteUrl: getRepoRemoteUrlMock,
  getRepoRoot: getRepoRootMock,
  isFileDirtyInWorkingTree: isFileDirtyInWorkingTreeMock,
  normalizeRelativeGitPath: (value: string) => value.replace(/\\/g, '/')
}));

import {
  evaluateViEligibilityForFsPath,
  loadViHistoryViewModelFromFsPath
} from '../../src/services/viHistoryModel';

describe('viHistoryModel direct history facts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detectViSignatureFromFsPathMock.mockResolvedValue('LVIN');
    getFileCommitHashesMock.mockResolvedValue(['c3', 'b2']);
    getFileHistoryCountMock.mockResolvedValue(3);
    getFileHistoryEntriesMock.mockResolvedValue([
      {
        hash: 'c3',
        authorName: 'Dev',
        authorDate: '2026-01-03',
        subject: 'Third'
      },
      {
        hash: 'b2',
        authorName: 'Dev',
        authorDate: '2026-01-02',
        subject: 'Second'
      },
      {
        hash: 'a1',
        authorName: 'Dev',
        authorDate: '2026-01-01',
        subject: 'First'
      }
    ]);
    getRepoRemoteUrlMock.mockResolvedValue('https://github.com/org/repo');
    getRepoRootMock.mockResolvedValue('/workspace/repo');
    isFileDirtyInWorkingTreeMock.mockResolvedValue(false);
  });

  it('evaluates tracked VI eligibility with bounded commit proof (VHS-REQ-008.1)', async () => {
    const result = await evaluateViEligibilityForFsPath('/workspace/repo/src/Sample.vi', {
      strictRsrcHeader: true
    });

    expect(getRepoRootMock).toHaveBeenCalledWith('/workspace/repo/src');
    expect(detectViSignatureFromFsPathMock).toHaveBeenCalledWith('/workspace/repo/src/Sample.vi', {
      strictRsrcHeader: true
    });
    expect(getFileCommitHashesMock).toHaveBeenCalledWith('/workspace/repo', 'src/Sample.vi', 2);
    expect(result).toEqual({
      repositoryRoot: '/workspace/repo',
      relativePath: 'src/Sample.vi',
      signature: 'LVIN',
      commitHashes: ['c3', 'b2'],
      hasUncommittedChanges: false,
      eligible: true
    });
  });

  it('fails eligibility closed when signature or commit proof is insufficient', async () => {
    detectViSignatureFromFsPathMock.mockResolvedValueOnce(undefined);
    await expect(
      evaluateViEligibilityForFsPath('/workspace/repo/src/Unknown.bin', {
        repoRoot: '/workspace/repo'
      })
    ).resolves.toMatchObject({
      signature: 'unknown',
      commitHashes: ['c3', 'b2'],
      eligible: false
    });

    detectViSignatureFromFsPathMock.mockResolvedValueOnce('LVIN');
    getFileCommitHashesMock.mockResolvedValueOnce(['c3']);
    await expect(
      evaluateViEligibilityForFsPath('/workspace/repo/src/Single.vi', {
        repoRoot: '/workspace/repo'
      })
    ).resolves.toMatchObject({
      signature: 'LVIN',
      commitHashes: ['c3'],
      eligible: false
    });
  });

  it('makes a single-commit VI eligible when it has uncommitted working-tree changes (VHS-REQ-641.1)', async () => {
    detectViSignatureFromFsPathMock.mockResolvedValueOnce('LVIN');
    getFileCommitHashesMock.mockResolvedValueOnce(['c3']);
    isFileDirtyInWorkingTreeMock.mockResolvedValueOnce(true);

    const result = await evaluateViEligibilityForFsPath('/workspace/repo/src/Single.vi', {
      repoRoot: '/workspace/repo'
    });

    expect(isFileDirtyInWorkingTreeMock).toHaveBeenCalledWith('/workspace/repo', 'src/Single.vi');
    expect(result).toMatchObject({
      signature: 'LVIN',
      commitHashes: ['c3'],
      hasUncommittedChanges: true,
      eligible: true
    });
  });

  it('probes working-tree status and exposes it for a two-commit VI with uncommitted changes (VHS-REQ-641)', async () => {
    // Default mocks return two commits; mark the file dirty.
    isFileDirtyInWorkingTreeMock.mockResolvedValue(true);

    const model = await loadViHistoryViewModelFromFsPath('/workspace/repo/src/Sample.vi', {
      repoRoot: '/workspace/repo'
    });

    expect(isFileDirtyInWorkingTreeMock).toHaveBeenCalledWith('/workspace/repo', 'src/Sample.vi');
    expect(model.commits.length).toBe(3);
    expect(model.workingTree).toEqual({ hasUncommittedChanges: true, headHash: 'c3' });
  });

  it('exposes working-tree state on the view model when the file is dirty (VHS-REQ-641)', async () => {
    getFileCommitHashesMock.mockResolvedValue(['c3']);
    getFileHistoryCountMock.mockResolvedValue(1);
    getFileHistoryEntriesMock.mockResolvedValue([
      { hash: 'c3', authorName: 'Dev', authorDate: '2026-01-03', subject: 'Only commit' }
    ]);
    isFileDirtyInWorkingTreeMock.mockResolvedValue(true);

    const model = await loadViHistoryViewModelFromFsPath('/workspace/repo/src/Single.vi', {
      repoRoot: '/workspace/repo'
    });

    expect(model.eligible).toBe(true);
    expect(model.workingTree).toEqual({ hasUncommittedChanges: true, headHash: 'c3' });
  });

  it('omits working-tree state when the file is clean (VHS-REQ-641)', async () => {
    const model = await loadViHistoryViewModelFromFsPath('/workspace/repo/src/Sample.vi', {
      repoRoot: '/workspace/repo'
    });

    expect(model.workingTree).toBeUndefined();
  });

  it('loads factual history model content with previous-hash links and full-history decision', async () => {
    const model = await loadViHistoryViewModelFromFsPath('/workspace/repo/src/Sample.vi', {
      repoRoot: '/workspace/repo',
      historyLimit: 10,
      configuredMaxHistoryEntries: 25
    });

    expect(getRepoRemoteUrlMock).toHaveBeenCalledWith('/workspace/repo');
    expect(getFileHistoryCountMock).toHaveBeenCalledWith('/workspace/repo', 'src/Sample.vi');
    expect(getFileHistoryEntriesMock).toHaveBeenCalledWith('/workspace/repo', 'src/Sample.vi', 3);
    expect(model).toMatchObject({
      repositoryName: 'repo',
      repositoryRoot: '/workspace/repo',
      repositoryUrl: 'https://github.com/org/repo',
      relativePath: 'src/Sample.vi',
      signature: 'LVIN',
      eligible: true,
      historyWindow: {
        mode: 'auto',
        configuredMaxEntries: 25,
        effectiveEntryCeiling: 10,
        loadedCommitCount: 3,
        totalCommitCount: 3,
        truncated: false,
        decision: 'auto-full-history'
      }
    });
    expect(model.commits.map((commit) => [commit.hash, commit.previousHash])).toEqual([
      ['c3', 'b2'],
      ['b2', 'a1'],
      ['a1', undefined]
    ]);
  });

  it('records capped truncation facts when the configured history window is smaller than total history', async () => {
    getFileHistoryCountMock.mockResolvedValue(5);
    getFileHistoryEntriesMock.mockResolvedValue([
      {
        hash: 'e5',
        authorName: 'Dev',
        authorDate: '2026-01-05',
        subject: 'Fifth'
      },
      {
        hash: 'd4',
        authorName: 'Dev',
        authorDate: '2026-01-04',
        subject: 'Fourth'
      }
    ]);

    const model = await loadViHistoryViewModelFromFsPath('/workspace/repo/src/Sample.vi', {
      repoRoot: '/workspace/repo',
      historyLimit: 2,
      configuredMaxHistoryEntries: 2,
      historyWindowMode: 'capped'
    });

    expect(getFileHistoryEntriesMock).toHaveBeenCalledWith('/workspace/repo', 'src/Sample.vi', 2);
    expect(model.historyWindow).toEqual({
      mode: 'capped',
      configuredMaxEntries: 2,
      effectiveEntryCeiling: 2,
      loadedCommitCount: 2,
      totalCommitCount: 5,
      truncated: true,
      decision: 'capped-truncated-to-max'
    });
    expect(model.commits.map((commit) => [commit.hash, commit.previousHash])).toEqual([
      ['e5', 'd4'],
      ['d4', undefined]
    ]);
  });

  it('keeps history loading bounded when total count cannot be resolved', async () => {
    getFileHistoryCountMock.mockRejectedValue(new Error('history count unavailable'));
    getFileHistoryEntriesMock.mockResolvedValue([
      {
        hash: 'c3',
        authorName: 'Dev',
        authorDate: '2026-01-03',
        subject: 'Third'
      }
    ]);

    const model = await loadViHistoryViewModelFromFsPath('/workspace/repo/src/Sample.vi', {
      repoRoot: '/workspace/repo',
      historyLimit: 7,
      historyWindowMode: 'auto'
    });

    expect(getFileHistoryEntriesMock).toHaveBeenCalledWith('/workspace/repo', 'src/Sample.vi', 7);
    expect(model.historyWindow).toMatchObject({
      mode: 'auto',
      effectiveEntryCeiling: 7,
      loadedCommitCount: 1,
      totalCommitCount: undefined,
      truncated: false,
      decision: 'auto-fallback-unknown-total'
    });
  });
});
