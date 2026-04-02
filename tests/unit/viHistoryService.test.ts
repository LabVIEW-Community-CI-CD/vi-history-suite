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
        historyLimit: 25
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
        historyLimit: 25
      }
    );
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

  it('reads the governed history-service settings from workspace configuration', () => {
    expect(getViHistoryServiceSettings()).toEqual({
      strictRsrcHeader: true,
      historyLimit: 25
    });
  });
});
