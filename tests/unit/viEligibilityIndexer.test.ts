import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      path: fsPath
    })
  }
}));

const getRepoRootMock = vi.fn<(fsPath: string) => Promise<string>>();

vi.mock('../../src/git/gitCli', async () => {
  const actual = await vi.importActual<typeof import('../../src/git/gitCli')>(
    '../../src/git/gitCli'
  );
  return {
    ...actual,
    getRepoRoot: getRepoRootMock
  };
});

describe('resolveIndexedRepositories', () => {
  beforeEach(() => {
    getRepoRootMock.mockReset();
  });

  it('keeps discovered git repositories and adds workspace git roots that are missing', async () => {
    getRepoRootMock.mockImplementation(async (fsPath: string) =>
      fsPath === '/workspace/repo-a' ? '/workspace/repo-a' : '/workspace/repo-b'
    );

    const { resolveIndexedRepositories } = await import(
      '../../src/indexing/viEligibilityIndexer'
    );

    const repositories = await resolveIndexedRepositories(
      [{ rootUri: { fsPath: '/workspace/repo-a' } as { fsPath: string } }],
      [
        { uri: { fsPath: '/workspace/repo-a' } as { fsPath: string } },
        { uri: { fsPath: '/workspace/nested/subdir' } as { fsPath: string } }
      ]
    );

    expect(repositories.map((repository) => repository.rootUri.fsPath)).toEqual([
      '/workspace/repo-a',
      '/workspace/repo-b'
    ]);
  });

  it('ignores workspace folders that are not inside a git working tree', async () => {
    getRepoRootMock.mockRejectedValue(new Error('not a repo'));

    const { resolveIndexedRepositories } = await import(
      '../../src/indexing/viEligibilityIndexer'
    );

    const repositories = await resolveIndexedRepositories([], [
      { uri: { fsPath: '/workspace/not-a-repo' } as { fsPath: string } }
    ]);

    expect(repositories).toEqual([]);
  });
});
