import { beforeEach, describe, expect, it, vi } from 'vitest';

const { workspaceGetMock, getRepoRootMock, loadViHistoryViewModelFromFsPathMock } = vi.hoisted(
  () => ({
    workspaceGetMock: vi.fn(),
    getRepoRootMock: vi.fn<(cwd: string) => Promise<string>>(),
    loadViHistoryViewModelFromFsPathMock: vi.fn()
  })
);

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: workspaceGetMock
    }))
  }
}));

vi.mock('../../src/git/gitCli', async () => {
  const actual = await vi.importActual<typeof import('../../src/git/gitCli')>(
    '../../src/git/gitCli'
  );
  return {
    ...actual,
    getRepoRoot: getRepoRootMock
  };
});

vi.mock('../../src/services/viHistoryModel', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/viHistoryModel')>(
    '../../src/services/viHistoryModel'
  );
  return {
    ...actual,
    loadViHistoryViewModelFromFsPath: loadViHistoryViewModelFromFsPathMock
  };
});

import {
  AUTO_HISTORY_ENTRY_CEILING,
  getViHistoryServiceSettings,
  selectMostSpecificGitRepositoryRoot,
  ViHistoryService
} from '../../src/services/viHistoryService';

describe('viHistoryService', () => {
  beforeEach(() => {
    workspaceGetMock.mockReset();
    getRepoRootMock.mockReset();
    loadViHistoryViewModelFromFsPathMock.mockReset();
    workspaceGetMock.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'strictRsrcHeader') {
        return true;
      }

      if (key === 'historyWindowMode') {
        return 'auto';
      }

      if (key === 'maxHistoryEntries') {
        return 25;
      }

      return fallback;
    });
  });

  it('selects the most specific matching Git API repository root', () => {
    expect(
      selectMostSpecificGitRepositoryRoot('/workspace/repo-a/nested/vi/sample.vi', [
        { rootUri: { fsPath: '/workspace/repo-a' } },
        { rootUri: { fsPath: '/workspace/repo-a/nested' } },
        { rootUri: { fsPath: '/workspace/other' } }
      ] as never)
    ).toBe('/workspace/repo-a/nested');
  });

  it('loads history using the most specific Git API root and forwarded configuration', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'nested',
      repositoryRoot: '/workspace/repo-a/nested',
      relativePath: 'vi/sample.vi',
      signature: 'LVIN',
      eligible: true,
      commits: []
    });

    const service = new ViHistoryService({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo-a' } },
        { rootUri: { fsPath: '/workspace/repo-a/nested' } }
      ],
      toGitUri: vi.fn()
    } as never);

    await service.load({
      fsPath: '/workspace/repo-a/nested/vi/sample.vi'
    } as never);

    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/repo-a/nested/vi/sample.vi',
      {
        repoRoot: '/workspace/repo-a/nested',
        strictRsrcHeader: true,
        historyLimit: AUTO_HISTORY_ENTRY_CEILING,
        configuredMaxHistoryEntries: 25,
        historyWindowMode: 'auto'
      }
    );
    expect(getRepoRootMock).not.toHaveBeenCalled();
  });

  it('falls back to Git CLI repository-root resolution when the Git API has no matching repository', async () => {
    getRepoRootMock.mockResolvedValue('/workspace/fallback-root');
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'fallback-root',
      repositoryRoot: '/workspace/fallback-root',
      relativePath: 'sample.vi',
      signature: 'LVIN',
      eligible: true,
      commits: []
    });

    const service = new ViHistoryService({
      repositories: [{ rootUri: { fsPath: '/workspace/other' } }],
      toGitUri: vi.fn()
    } as never);

    await service.load({
      fsPath: '/workspace/fallback-root/child/sample.vi'
    } as never);

    expect(getRepoRootMock).toHaveBeenCalledWith('/workspace/fallback-root/child');
    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/fallback-root/child/sample.vi',
      {
        repoRoot: '/workspace/fallback-root',
        strictRsrcHeader: true,
        historyLimit: AUTO_HISTORY_ENTRY_CEILING,
        configuredMaxHistoryEntries: 25,
        historyWindowMode: 'auto'
      }
    );
  });

  it('uses the explicit capped history window when configured', () => {
    workspaceGetMock.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'strictRsrcHeader') {
        return true;
      }
      if (key === 'historyWindowMode') {
        return 'capped';
      }
      if (key === 'maxHistoryEntries') {
        return 25;
      }
      return fallback;
    });

    expect(getViHistoryServiceSettings()).toEqual({
      strictRsrcHeader: true,
      historyWindowMode: 'capped',
      maxHistoryEntries: 25,
      historyLimit: 25
    });
  });

  it('delegates Git URI translation only when a Git API is available', () => {
    const gitUri = {
      toString: () => 'git:/workspace/sample.vi?ref=abc'
    };
    const withGit = new ViHistoryService({
      repositories: [],
      toGitUri: vi.fn().mockReturnValue(gitUri)
    } as never);
    const withoutGit = new ViHistoryService(undefined);
    const fileUri = {
      fsPath: '/workspace/sample.vi'
    };

    expect(withGit.toGitUri(fileUri as never, 'abc')).toBe(gitUri);
    expect(withoutGit.toGitUri(fileUri as never, 'abc')).toBeUndefined();
  });

  it('reads the history-service settings from workspace configuration', () => {
    expect(getViHistoryServiceSettings()).toEqual({
      strictRsrcHeader: true,
      historyWindowMode: 'auto',
      maxHistoryEntries: 25,
      historyLimit: AUTO_HISTORY_ENTRY_CEILING
    });
  });
});

describe('viHistoryService eligibility edge cases (VHS-REQ-006, VHS-REQ-061)', () => {
  beforeEach(() => {
    workspaceGetMock.mockReset();
    getRepoRootMock.mockReset();
    loadViHistoryViewModelFromFsPathMock.mockReset();
    workspaceGetMock.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'strictRsrcHeader') return true;
      if (key === 'historyWindowMode') return 'auto';
      if (key === 'maxHistoryEntries') return 25;
      return fallback;
    });
  });

  it('returns undefined when no Git API repository matches a path', () => {
    expect(
      selectMostSpecificGitRepositoryRoot('/workspace/unrelated/file.vi', [
        { rootUri: { fsPath: '/workspace/repo-a' } },
        { rootUri: { fsPath: '/workspace/repo-b' } }
      ] as never)
    ).toBeUndefined();
  });

  it('selects the most specific root when multiple nested repositories match', () => {
    expect(
      selectMostSpecificGitRepositoryRoot('/workspace/outer/inner/deep/file.vi', [
        { rootUri: { fsPath: '/workspace/outer' } },
        { rootUri: { fsPath: '/workspace/outer/inner' } },
        { rootUri: { fsPath: '/workspace/outer/inner/deep' } }
      ] as never)
    ).toBe('/workspace/outer/inner/deep');
  });

  it('does not match repositories with prefix collisions', () => {
    expect(
      selectMostSpecificGitRepositoryRoot('/workspace/repo-a2/file.vi', [
        { rootUri: { fsPath: '/workspace/repo-a' } },
        { rootUri: { fsPath: '/workspace/repo-b' } }
      ] as never)
    ).toBeUndefined();
  });

  it('handles multi-root workspace with independent repositories', () => {
    const repositories = [
      { rootUri: { fsPath: '/workspace/project-a' } },
      { rootUri: { fsPath: '/workspace/project-b' } },
      { rootUri: { fsPath: '/home/user/external' } }
    ] as never;

    expect(
      selectMostSpecificGitRepositoryRoot('/workspace/project-a/src/file.vi', repositories)
    ).toBe('/workspace/project-a');
    expect(
      selectMostSpecificGitRepositoryRoot('/workspace/project-b/lib/util.vi', repositories)
    ).toBe('/workspace/project-b');
    expect(
      selectMostSpecificGitRepositoryRoot('/home/user/external/nested/tool.vi', repositories)
    ).toBe('/home/user/external');
  });

  it('falls back to CLI repository discovery when Git API cannot match a file path', async () => {
    getRepoRootMock.mockResolvedValue('/workspace/discovered-root');
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'discovered-root',
      repositoryRoot: '/workspace/discovered-root',
      relativePath: 'orphan/file.vi',
      signature: 'LVIN',
      eligible: true,
      commits: []
    });

    const service = new ViHistoryService({
      repositories: [],
      toGitUri: vi.fn()
    } as never);

    await service.load({ fsPath: '/workspace/discovered-root/orphan/file.vi' } as never);

    expect(getRepoRootMock).toHaveBeenCalledWith('/workspace/discovered-root/orphan');
    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/discovered-root/orphan/file.vi',
      expect.objectContaining({
        repoRoot: '/workspace/discovered-root'
      })
    );
  });

  it('propagates CLI fallback failure when file is outside any Git repository', async () => {
    getRepoRootMock.mockRejectedValue(new Error('fatal: not a git repository'));

    const service = new ViHistoryService({
      repositories: [],
      toGitUri: vi.fn()
    } as never);

    await expect(
      service.load({ fsPath: '/not-a-repo/orphan.vi' } as never)
    ).rejects.toThrow('fatal: not a git repository');
  });

  it('does not call CLI fallback when Git API match is available', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'matched-repo',
      repositoryRoot: '/workspace/matched-repo',
      relativePath: 'src/file.vi',
      signature: 'LVIN',
      eligible: true,
      commits: []
    });

    const service = new ViHistoryService({
      repositories: [
        { rootUri: { fsPath: '/workspace/matched-repo' } }
      ],
      toGitUri: vi.fn()
    } as never);

    await service.load({ fsPath: '/workspace/matched-repo/src/file.vi' } as never);

    expect(getRepoRootMock).not.toHaveBeenCalled();
  });
});

describe('viHistoryService blocked and empty state handling (VHS-REQ-016)', () => {
  const expectedOptions = {
    repoRoot: '/workspace/test-repo',
    strictRsrcHeader: true,
    historyLimit: AUTO_HISTORY_ENTRY_CEILING,
    configuredMaxHistoryEntries: 25,
    historyWindowMode: 'auto'
  } as const;

  beforeEach(() => {
    workspaceGetMock.mockReset();
    getRepoRootMock.mockReset();
    loadViHistoryViewModelFromFsPathMock.mockReset();
    workspaceGetMock.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'strictRsrcHeader') return true;
      if (key === 'historyWindowMode') return 'auto';
      if (key === 'maxHistoryEntries') return 25;
      return fallback;
    });
  });

  it('returns ineligible when file has unknown signature and no commits', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'test-repo',
      repositoryRoot: '/workspace/test-repo',
      relativePath: 'unknown-file.txt',
      signature: 'unknown',
      eligible: false,
      commits: []
    });

    const service = new ViHistoryService({
      repositories: [{ rootUri: { fsPath: '/workspace/test-repo' } }],
      toGitUri: vi.fn()
    } as never);

    const result = await service.load({ fsPath: '/workspace/test-repo/unknown-file.txt' } as never);

    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/test-repo/unknown-file.txt',
      expectedOptions
    );
    expect(getRepoRootMock).not.toHaveBeenCalled();
    expect(result.eligible).toBe(false);
    expect(result.signature).toBe('unknown');
    expect(result.commits.length).toBe(0);
  });

  it('returns ineligible when file has valid signature but no commits (untracked)', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'test-repo',
      repositoryRoot: '/workspace/test-repo',
      relativePath: 'new-file.vi',
      signature: 'LVIN',
      eligible: false,
      commits: []
    });

    const service = new ViHistoryService({
      repositories: [{ rootUri: { fsPath: '/workspace/test-repo' } }],
      toGitUri: vi.fn()
    } as never);

    const result = await service.load({ fsPath: '/workspace/test-repo/new-file.vi' } as never);

    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/test-repo/new-file.vi',
      expectedOptions
    );
    expect(getRepoRootMock).not.toHaveBeenCalled();
    expect(result.eligible).toBe(false);
    expect(result.signature).toBe('LVIN');
    expect(result.commits.length).toBe(0);
  });

  it('returns ineligible when file has valid signature but only one commit', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'test-repo',
      repositoryRoot: '/workspace/test-repo',
      relativePath: 'single-commit.vi',
      signature: 'LVIN',
      eligible: false,
      commits: [
        { hash: 'abc123', authorDate: '2024-01-01', authorName: 'Dev', subject: 'Initial commit' }
      ]
    });

    const service = new ViHistoryService({
      repositories: [{ rootUri: { fsPath: '/workspace/test-repo' } }],
      toGitUri: vi.fn()
    } as never);

    const result = await service.load({ fsPath: '/workspace/test-repo/single-commit.vi' } as never);

    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/test-repo/single-commit.vi',
      expectedOptions
    );
    expect(getRepoRootMock).not.toHaveBeenCalled();
    expect(result.eligible).toBe(false);
    expect(result.signature).toBe('LVIN');
    expect(result.commits.length).toBe(1);
  });

  it('returns ineligible when file has unknown signature even with commits', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'test-repo',
      repositoryRoot: '/workspace/test-repo',
      relativePath: 'not-a-vi.txt',
      signature: 'unknown',
      eligible: false,
      commits: [
        { hash: 'abc123', authorDate: '2024-01-01', authorName: 'Dev', subject: 'First commit' },
        { hash: 'def456', authorDate: '2024-01-02', authorName: 'Dev', subject: 'Second commit' }
      ]
    });

    const service = new ViHistoryService({
      repositories: [{ rootUri: { fsPath: '/workspace/test-repo' } }],
      toGitUri: vi.fn()
    } as never);

    const result = await service.load({ fsPath: '/workspace/test-repo/not-a-vi.txt' } as never);

    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/test-repo/not-a-vi.txt',
      expectedOptions
    );
    expect(getRepoRootMock).not.toHaveBeenCalled();
    expect(result.eligible).toBe(false);
    expect(result.signature).toBe('unknown');
    expect(result.commits.length).toBe(2);
  });

  it('returns eligible when file has valid signature and at least two commits', async () => {
    loadViHistoryViewModelFromFsPathMock.mockResolvedValue({
      repositoryName: 'test-repo',
      repositoryRoot: '/workspace/test-repo',
      relativePath: 'valid.vi',
      signature: 'LVIN',
      eligible: true,
      commits: [
        { hash: 'abc123', authorDate: '2024-01-01', authorName: 'Dev', subject: 'First commit' },
        { hash: 'def456', authorDate: '2024-01-02', authorName: 'Dev', subject: 'Second commit' }
      ]
    });

    const service = new ViHistoryService({
      repositories: [{ rootUri: { fsPath: '/workspace/test-repo' } }],
      toGitUri: vi.fn()
    } as never);

    const result = await service.load({ fsPath: '/workspace/test-repo/valid.vi' } as never);

    expect(loadViHistoryViewModelFromFsPathMock).toHaveBeenCalledWith(
      '/workspace/test-repo/valid.vi',
      expectedOptions
    );
    expect(getRepoRootMock).not.toHaveBeenCalled();
    expect(result.eligible).toBe(true);
    expect(result.signature).toBe('LVIN');
    expect(result.commits.length).toBe(2);
  });
});
