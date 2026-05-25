import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  workspaceState,
  configurationValues,
  commandExecuteMock,
  withProgressMock,
  createStatusBarItemMock,
  progressReportMock,
  workspaceFolderListeners,
  workspaceTrustListeners,
  getRepoRootMock,
  listTrackedFilesMock,
  getRepoHeadMock,
  evaluateViEligibilityMock
} = vi.hoisted(() => ({
  workspaceState: {
    isTrusted: true,
    workspaceFolders: [] as Array<{ uri: { fsPath: string; path: string } }>
  },
  configurationValues: new Map<string, unknown>([
    ['strictRsrcHeader', false],
    ['maxIndexedConcurrency', 6]
  ]),
  commandExecuteMock: vi.fn(),
  withProgressMock: vi.fn(),
  createStatusBarItemMock: vi.fn(() => ({
    text: '',
    tooltip: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn()
  })),
  progressReportMock: vi.fn(),
  workspaceFolderListeners: [] as Array<() => unknown>,
  workspaceTrustListeners: [] as Array<() => unknown>,
  getRepoRootMock: vi.fn<(fsPath: string) => Promise<string>>(),
  listTrackedFilesMock: vi.fn<(cwd: string) => Promise<string[]>>(),
  getRepoHeadMock: vi.fn<(cwd: string) => Promise<string>>(),
  evaluateViEligibilityMock: vi.fn<(fsPath: string, options: unknown) => Promise<{ eligible: boolean }>>()
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      path: fsPath
    }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => {
      const joined = [base.fsPath, ...segments]
        .join('/')
        .replace(/\/+/g, '/')
        .replace(':/', '://');
      return {
        fsPath: joined,
        path: joined
      };
    }
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    },
    get workspaceFolders() {
      return workspaceState.workspaceFolders;
    },
    getConfiguration: vi.fn(() => ({
      get: (key: string, fallback: unknown) =>
        configurationValues.has(key) ? configurationValues.get(key) : fallback
    })),
    onDidChangeWorkspaceFolders: (listener: () => unknown) => {
      workspaceFolderListeners.push(listener);
      return {
        dispose() {
          // no-op
        }
      };
    },
    onDidGrantWorkspaceTrust: (listener: () => unknown) => {
      workspaceTrustListeners.push(listener);
      return {
        dispose() {
          // no-op
        }
      };
    }
  },
  window: {
    withProgress: withProgressMock,
    createStatusBarItem: createStatusBarItemMock
  },
  commands: {
    executeCommand: commandExecuteMock
  },
  ProgressLocation: {
    Window: 10
  },
  StatusBarAlignment: {
    Left: 1
  },
  Disposable: class Disposable {
    static from(...disposables: Array<{ dispose?: () => void }>) {
      return {
        dispose() {
          for (const disposable of disposables) {
            disposable?.dispose?.();
          }
        }
      };
    }
  }
}));

vi.mock('../../src/git/gitCli', async () => {
  const actual = await vi.importActual<typeof import('../../src/git/gitCli')>(
    '../../src/git/gitCli'
  );
  return {
    ...actual,
    getRepoRoot: getRepoRootMock,
    listTrackedFiles: listTrackedFilesMock,
    getRepoHead: getRepoHeadMock
  };
});

vi.mock('../../src/services/viHistoryModel', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/viHistoryModel')>(
    '../../src/services/viHistoryModel'
  );
  return {
    ...actual,
    evaluateViEligibilityForFsPath: evaluateViEligibilityMock
  };
});

import {
  buildCacheKey,
  contextKeysForUri,
  forEachConcurrent,
  getConfiguredConcurrency,
  isRepositoryRelevantToWorkspace,
  getStrictHeaderSetting,
  resolveIndexedRepositories,
  ViEligibilityIndexer
} from '../../src/indexing/viEligibilityIndexer';

describe('viEligibilityIndexer helpers', () => {
  beforeEach(() => {
    configurationValues.set('strictRsrcHeader', false);
    configurationValues.set('maxIndexedConcurrency', 6);
    getRepoRootMock.mockReset();
    getRepoRootMock.mockImplementation(async (fsPath: string) => fsPath);
    listTrackedFilesMock.mockReset();
    getRepoHeadMock.mockReset();
    evaluateViEligibilityMock.mockReset();
    commandExecuteMock.mockReset();
    progressReportMock.mockReset();
    workspaceFolderListeners.length = 0;
    workspaceTrustListeners.length = 0;
    workspaceState.isTrusted = true;
    workspaceState.workspaceFolders = [];
    withProgressMock.mockReset();
    createStatusBarItemMock.mockClear();
    withProgressMock.mockImplementation(async (_options, task) =>
      task(
        {
          report: progressReportMock
        },
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(() => ({ dispose() {} }))
        }
      )
    );
  });

  it('builds cache keys, context keys, settings, and bounded concurrency deterministically', async () => {
    configurationValues.set('strictRsrcHeader', true);
    configurationValues.set('maxIndexedConcurrency', 0);

    expect(
      buildCacheKey(
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } },
        'head123',
        'nested\\file.vi'
      )
    ).toBe('/workspace/repo::nested/file.vi::head123');
    expect(
      contextKeysForUri({
        fsPath: 'C:\\Repo\\nested\\file.vi',
        path: 'C:\\Repo\\nested\\file.vi'
      } as never)
    ).toContain('C:/Repo/nested/file.vi');
    expect(getStrictHeaderSetting()).toBe(true);
    expect(getConfiguredConcurrency()).toBe(0);

    const processed: number[] = [];
    await forEachConcurrent([1, 2, 3], 0, async (value) => {
      processed.push(value);
    });
    expect(processed.sort()).toEqual([1, 2, 3]);
  });

  it('keeps discovered git repositories and adds workspace git roots that are missing', async () => {
    getRepoRootMock.mockImplementation(async (fsPath: string) =>
      fsPath === '/workspace/repo-a' ? '/workspace/repo-a' : '/workspace/repo-b'
    );

    const repositories = await resolveIndexedRepositories(
      [{ rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never],
      [
        { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never,
        { uri: { fsPath: '/workspace/nested/subdir', path: '/workspace/nested/subdir' } } as never
      ]
    );

    expect(repositories.map((repository) => repository.rootUri.fsPath)).toEqual([
      '/workspace/repo-a',
      '/workspace/repo-b'
    ]);
  });

  it('ignores workspace folders that are not inside a git working tree', async () => {
    getRepoRootMock.mockRejectedValue(new Error('not a repo'));

    const repositories = await resolveIndexedRepositories([], [
      { uri: { fsPath: '/workspace/not-a-repo', path: '/workspace/not-a-repo' } } as never
    ]);

    expect(repositories).toEqual([]);
  });

  it('filters repository relevance to the current workspace scope', () => {
    const workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never,
      { uri: { fsPath: '/workspace/nested/child', path: '/workspace/nested/child' } } as never
    ];

    expect(isRepositoryRelevantToWorkspace('/workspace/repo', workspaceFolders)).toBe(true);
    expect(isRepositoryRelevantToWorkspace('/workspace', workspaceFolders)).toBe(true);
    expect(isRepositoryRelevantToWorkspace('/workspace/nested/child', workspaceFolders)).toBe(true);
    expect(isRepositoryRelevantToWorkspace('/elsewhere/other', workspaceFolders)).toBe(false);
  });

  it('ignores git-api repositories that are outside the current workspace scope', async () => {
    getRepoRootMock.mockResolvedValue('/workspace/repo');

    const repositories = await resolveIndexedRepositories(
      [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never,
        { rootUri: { fsPath: '/elsewhere/unrelated', path: '/elsewhere/unrelated' } } as never
      ],
      [{ uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never]
    );

    expect(repositories.map((repository) => repository.rootUri.fsPath)).toEqual([
      '/workspace/repo'
    ]);
  });
});

describe('ViEligibilityIndexer refresh and listeners', () => {
  beforeEach(() => {
    configurationValues.set('strictRsrcHeader', false);
    configurationValues.set('maxIndexedConcurrency', 6);
    getRepoRootMock.mockReset();
    getRepoRootMock.mockImplementation(async (fsPath: string) => fsPath);
    listTrackedFilesMock.mockReset();
    getRepoHeadMock.mockReset();
    evaluateViEligibilityMock.mockReset();
    commandExecuteMock.mockReset();
    progressReportMock.mockReset();
    workspaceFolderListeners.length = 0;
    workspaceTrustListeners.length = 0;
    workspaceState.isTrusted = true;
    workspaceState.workspaceFolders = [];
    withProgressMock.mockReset();
    createStatusBarItemMock.mockClear();
    withProgressMock.mockImplementation(async (_options, task) =>
      task(
        {
          report: progressReportMock
        },
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(() => ({ dispose() {} }))
        }
      )
    );
  });

  it('clears eligible paths and indexed roots when the workspace is untrusted', async () => {
    workspaceState.isTrusted = false;
    const indexer = new ViEligibilityIndexer(undefined);

    await indexer.refresh();

    expect(indexer.getDebugSnapshot()).toEqual({
      indexedRepositoryRoots: [],
      eligiblePathCount: 0,
      eligiblePathsSample: [],
      lastRefreshResult: {
        state: 'trust-disabled',
        counts: { tracked: 0, reused: 0, evaluated: 0, eligible: 0, skipped: 0, failed: 0 },
        indexedRepositoryRoots: [],
        snapshotPreserved: false
      }
    });
    expect(commandExecuteMock.mock.calls).toEqual([
      ['setContext', 'labviewViHistory.eligiblePaths', {}]
    ]);
    expect(withProgressMock).not.toHaveBeenCalled();
  });

  it('reuses cached eligibility for the same HEAD and invalidates when HEAD changes', async () => {
    configurationValues.set('strictRsrcHeader', true);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock
      .mockResolvedValueOnce('head-1')
      .mockResolvedValueOnce('head-1')
      .mockResolvedValueOnce('head-2');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    await indexer.refresh();
    await indexer.refresh();
    await indexer.refresh();

    expect(evaluateViEligibilityMock).toHaveBeenCalledTimes(2);
    expect(evaluateViEligibilityMock).toHaveBeenNthCalledWith(
      1,
      '/workspace/repo/tracked.vi',
      {
        repoRoot: '/workspace/repo',
        strictRsrcHeader: true
      }
    );
    expect(indexer.isEligible({ fsPath: '/workspace/repo/tracked.vi', path: '/workspace/repo/tracked.vi' } as never)).toBe(true);
    expect(indexer.getDebugSnapshot().indexedRepositoryRoots).toEqual(['/workspace/repo']);
  });

  it('fails closed on repository and file errors while still indexing successful files', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never,
      { uri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' }
        },
        {
          rootUri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockImplementation(async (cwd: string) => {
      if (cwd === '/workspace/repo-a') {
        throw new Error('cannot enumerate repo-a');
      }

      return ['good.vi', 'bad.vi'];
    });
    getRepoHeadMock.mockResolvedValue('head-good');
    evaluateViEligibilityMock.mockImplementation(async (fsPath: string) => {
      if (fsPath.endsWith('bad.vi')) {
        throw new Error('bad file');
      }

      return { eligible: true };
    });

    await expect(indexer.refresh()).resolves.toBeUndefined();

    expect(indexer.isEligible({ fsPath: '/workspace/repo-b/good.vi', path: '/workspace/repo-b/good.vi' } as never)).toBe(true);
    expect(indexer.isEligible({ fsPath: '/workspace/repo-b/bad.vi', path: '/workspace/repo-b/bad.vi' } as never)).toBe(false);
    expect(indexer.getDebugSnapshot().indexedRepositoryRoots).toEqual([
      '/workspace/repo-a',
      '/workspace/repo-b'
    ]);
  });

  it('reports global indexing percent, processed totals, and ETA through notification progress and status bar', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never,
      { uri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' }
        },
        {
          rootUri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockImplementation(async (cwd: string) => {
      if (cwd === '/workspace/repo-a') {
        return ['a-1.vi', 'a-2.vi'];
      }

      return ['b-1.vi'];
    });
    getRepoHeadMock
      .mockResolvedValueOnce('head-a')
      .mockResolvedValueOnce('head-b');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: false });

    await indexer.refresh();

    const progressMessages = progressReportMock.mock.calls.map(
      ([update]) => (update as { message: string }).message
    );
    expect(progressMessages).toEqual([
      'repo-a 33% (1/3) ETA 00:00',
      'repo-a 67% (2/3) ETA 00:00',
      'repo-b 100% (3/3) ETA 00:00'
    ]);

    const statusBar = createStatusBarItemMock.mock.results[0]?.value as
      | {
          text: string;
          tooltip: string;
          show: ReturnType<typeof vi.fn>;
          hide: ReturnType<typeof vi.fn>;
        }
      | undefined;
    expect(statusBar).toBeDefined();
    expect(statusBar?.show).toHaveBeenCalled();
    expect(statusBar?.text).toContain('100% (3/3) ETA 00:00');
    expect(statusBar?.tooltip).toContain('repo-b: 100% (3/3)');
    expect(statusBar?.hide).toHaveBeenCalled();
  });

  it('preserves the previous eligibility snapshot when cancellation is requested mid-refresh', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-1');
    evaluateViEligibilityMock.mockResolvedValueOnce({ eligible: true });

    await indexer.refresh();

    const cancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(() => ({ dispose() {} }))
    };
    withProgressMock.mockImplementationOnce(async (options, task) => {
      expect(options).toMatchObject({
        title: 'Indexing LabVIEW VIs',
        cancellable: true
      });
      return task(
        {
          report: vi.fn(() => {
            cancellationToken.isCancellationRequested = true;
          })
        },
        cancellationToken as never
      );
    });
    listTrackedFilesMock.mockResolvedValue(['other-a.vi', 'other-b.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-2');
    evaluateViEligibilityMock
      .mockResolvedValueOnce({ eligible: false })
      .mockResolvedValueOnce({ eligible: false });

    await indexer.refresh();

    expect(
      indexer.isEligible({
        fsPath: '/workspace/repo/tracked.vi',
        path: '/workspace/repo/tracked.vi'
      } as never)
    ).toBe(true);
    expect(
      indexer.isEligible({
        fsPath: '/workspace/repo/other-a.vi',
        path: '/workspace/repo/other-a.vi'
      } as never)
    ).toBe(false);
    expect(indexer.getDebugSnapshot().indexedRepositoryRoots).toEqual(['/workspace/repo']);
    expect(commandExecuteMock.mock.calls.at(-1)).toEqual([
      'setContext',
      'labviewViHistory.eligiblePaths',
      expect.objectContaining({
        '/workspace/repo/tracked.vi': true
      })
    ]);
  });

  it('fails closed and clears eligibility when workspace trust is lost during refresh', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-1');
    evaluateViEligibilityMock.mockResolvedValueOnce({ eligible: true });
    await indexer.refresh();

    listTrackedFilesMock.mockResolvedValue(['other-a.vi', 'other-b.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-2');
    let eligibilityCallCount = 0;
    evaluateViEligibilityMock.mockImplementation(async () => {
      eligibilityCallCount += 1;
      if (eligibilityCallCount === 1) {
        workspaceState.isTrusted = false;
        return { eligible: true };
      }

      return { eligible: false };
    });

    await indexer.refresh();

    expect(indexer.getDebugSnapshot()).toMatchObject({
      indexedRepositoryRoots: [],
      eligiblePathCount: 0,
      eligiblePathsSample: []
    });
    expect(indexer.getDebugSnapshot().lastRefreshResult?.state).toBe('trust-disabled');
    expect(
      indexer.isEligible({
        fsPath: '/workspace/repo/tracked.vi',
        path: '/workspace/repo/tracked.vi'
      } as never)
    ).toBe(false);
    expect(commandExecuteMock.mock.calls.at(-1)).toEqual([
      'setContext',
      'labviewViHistory.eligiblePaths',
      {}
    ]);
    workspaceState.isTrusted = true;
  });

  it('fails closed when workspace trust is lost after repository resolution but before file indexing begins', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-1');
    evaluateViEligibilityMock.mockResolvedValueOnce({ eligible: true });
    await indexer.refresh();

    listTrackedFilesMock.mockResolvedValue(['other-a.vi', 'other-b.vi']);
    getRepoHeadMock.mockImplementationOnce(async () => {
      workspaceState.isTrusted = false;
      return 'head-2';
    });

    await indexer.refresh();

    expect(evaluateViEligibilityMock).toHaveBeenCalledTimes(1);
    expect(indexer.getDebugSnapshot()).toMatchObject({
      indexedRepositoryRoots: [],
      eligiblePathCount: 0,
      eligiblePathsSample: []
    });
    expect(indexer.getDebugSnapshot().lastRefreshResult?.state).toBe('trust-disabled');
    expect(commandExecuteMock.mock.calls.at(-1)).toEqual([
      'setContext',
      'labviewViHistory.eligiblePaths',
      {}
    ]);
    workspaceState.isTrusted = true;
  });

  it('preserves the previous snapshot when cancellation is already requested at repository iteration time', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-1');
    evaluateViEligibilityMock.mockResolvedValueOnce({ eligible: true });
    await indexer.refresh();

    withProgressMock.mockImplementationOnce(async (_options, task) =>
      task(
        {
          report: progressReportMock
        },
        {
          isCancellationRequested: true,
          onCancellationRequested: vi.fn(() => ({ dispose() {} }))
        }
      )
    );
    listTrackedFilesMock.mockResolvedValue(['other-a.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-2');

    await indexer.refresh();

    expect(listTrackedFilesMock).toHaveBeenCalledTimes(2);
    expect(getRepoHeadMock).toHaveBeenCalledTimes(2);
    expect(indexer.isEligible({ fsPath: '/workspace/repo/tracked.vi', path: '/workspace/repo/tracked.vi' } as never)).toBe(true);
    expect(commandExecuteMock.mock.calls.at(-1)).toEqual([
      'setContext',
      'labviewViHistory.eligiblePaths',
      expect.objectContaining({
        '/workspace/repo/tracked.vi': true
      })
    ]);
  });

  it('fails closed when workspace trust is lost after progress starts but before repository iteration begins', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-1');
    evaluateViEligibilityMock.mockResolvedValueOnce({ eligible: true });
    await indexer.refresh();

    withProgressMock.mockImplementationOnce(async (_options, task) => {
      workspaceState.isTrusted = false;
      return task(
        {
          report: progressReportMock
        },
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(() => ({ dispose() {} }))
        }
      );
    });
    listTrackedFilesMock.mockResolvedValue(['other-a.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-2');

    await indexer.refresh();

    expect(listTrackedFilesMock).toHaveBeenCalledTimes(2);
    expect(getRepoHeadMock).toHaveBeenCalledTimes(2);
    expect(indexer.getDebugSnapshot()).toMatchObject({
      indexedRepositoryRoots: [],
      eligiblePathCount: 0,
      eligiblePathsSample: []
    });
    expect(indexer.getDebugSnapshot().lastRefreshResult?.state).toBe('trust-disabled');
    expect(commandExecuteMock.mock.calls.at(-1)).toEqual([
      'setContext',
      'labviewViHistory.eligiblePaths',
      {}
    ]);
    workspaceState.isTrusted = true;
  });

  it('registers state listeners for initial and newly opened repositories and disposes them on close', async () => {
    workspaceState.isTrusted = false;
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never
    ];
    const openListeners: Array<(repository: never) => unknown> = [];
    const closeListeners: Array<(repository: never) => unknown> = [];
    const initialStateDispose = vi.fn();
    const openedStateDispose = vi.fn();
    const initialRepository = {
      rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' },
      state: {
        onDidChange: vi.fn(() => ({
          dispose: initialStateDispose
        }))
      }
    };
    const openedRepository = {
      rootUri: { fsPath: '/workspace/repo-a/nested-repo', path: '/workspace/repo-a/nested-repo' },
      state: {
        onDidChange: vi.fn(() => ({
          dispose: openedStateDispose
        }))
      }
    };

    const indexer = new ViEligibilityIndexer({
      repositories: [initialRepository],
      onDidOpenRepository: vi.fn((listener) => {
        openListeners.push(listener as never);
        return { dispose() {} };
      }),
      onDidCloseRepository: vi.fn((listener) => {
        closeListeners.push(listener as never);
        return { dispose() {} };
      }),
      toGitUri: vi.fn()
    } as never);

    await indexer.start();

    expect(initialRepository.state.onDidChange).toHaveBeenCalledTimes(1);
    expect(openListeners).toHaveLength(1);
    expect(closeListeners).toHaveLength(1);

    openListeners[0](openedRepository as never);
    expect(openedRepository.state.onDidChange).toHaveBeenCalledTimes(1);

    closeListeners[0](openedRepository as never);
    expect(openedStateDispose).toHaveBeenCalledTimes(1);

    indexer.dispose();
    expect(initialStateDispose).toHaveBeenCalledTimes(1);
  });

  it('debounces workspace-triggered refreshes, tolerates missing Git API startup, and ignores duplicate or state-less repository listeners', async () => {
    vi.useFakeTimers();
    try {
      workspaceState.isTrusted = false;
      const indexer = new ViEligibilityIndexer(undefined);
      const refreshSpy = vi.spyOn(indexer, 'refresh').mockResolvedValue(undefined);

      await indexer.start();

      expect(workspaceFolderListeners).toHaveLength(1);
      expect(workspaceTrustListeners).toHaveLength(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      workspaceFolderListeners[0]();
      workspaceTrustListeners[0]();
      await vi.advanceTimersByTimeAsync(299);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      const openListeners: Array<(repository: never) => unknown> = [];
      workspaceState.workspaceFolders = [
        { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never
      ];
      const duplicateRepository = {
        rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' },
        state: {
          onDidChange: vi.fn(() => ({ dispose() {} }))
        }
      };
      const statelessRepository = {
        rootUri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' },
        state: {}
      };

      const indexerWithGit = new ViEligibilityIndexer({
        repositories: [duplicateRepository],
        onDidOpenRepository: vi.fn((listener) => {
          openListeners.push(listener as never);
          return { dispose() {} };
        }),
        onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
        toGitUri: vi.fn()
      } as never);

      await indexerWithGit.start();
      expect(duplicateRepository.state.onDidChange).toHaveBeenCalledTimes(1);

      openListeners[0](duplicateRepository as never);
      openListeners[0](statelessRepository as never);
      expect(duplicateRepository.state.onDidChange).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces refresh requests that arrive while a refresh is already running', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        {
          rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' }
        }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    let signalFirstEvaluationStarted: (() => void) | undefined;
    const firstEvaluationStarted = new Promise<void>((resolve) => {
      signalFirstEvaluationStarted = resolve;
    });
    let releaseFirstEvaluation: (() => void) | undefined;
    evaluateViEligibilityMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          if (!releaseFirstEvaluation) {
            signalFirstEvaluationStarted?.();
            releaseFirstEvaluation = () => resolve({ eligible: true });
            return;
          }

          resolve({ eligible: true });
        })
    );
    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValue('head-1');

    const firstRefresh = indexer.refresh();
    const secondRefresh = indexer.refresh();
    await firstEvaluationStarted;
    expect(withProgressMock).toHaveBeenCalledTimes(1);

    releaseFirstEvaluation?.();
    await firstRefresh;
    await secondRefresh;

    expect(withProgressMock).toHaveBeenCalledTimes(2);
  });

  it('ignores newly opened repositories that are outside the current workspace scope', async () => {
    workspaceState.isTrusted = false;
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never
    ];
    const openListeners: Array<(repository: never) => unknown> = [];
    const closeListeners: Array<(repository: never) => unknown> = [];
    const inScopeDispose = vi.fn();
    const outOfScopeOnDidChange = vi.fn(() => ({ dispose() {} }));
    const inScopeRepository = {
      rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' },
      state: {
        onDidChange: vi.fn(() => ({
          dispose: inScopeDispose
        }))
      }
    };
    const outOfScopeRepository = {
      rootUri: { fsPath: '/elsewhere/repo-b', path: '/elsewhere/repo-b' },
      state: {
        onDidChange: outOfScopeOnDidChange
      }
    };

    const indexer = new ViEligibilityIndexer({
      repositories: [inScopeRepository],
      onDidOpenRepository: vi.fn((listener) => {
        openListeners.push(listener as never);
        return { dispose() {} };
      }),
      onDidCloseRepository: vi.fn((listener) => {
        closeListeners.push(listener as never);
        return { dispose() {} };
      }),
      toGitUri: vi.fn()
    } as never);

    await indexer.start();
    expect(openListeners).toHaveLength(1);
    expect(closeListeners).toHaveLength(1);

    openListeners[0](outOfScopeRepository as never);

    expect(outOfScopeOnDidChange).not.toHaveBeenCalled();
  });

  it('adds windows lowercase context keys, ignores empty values, and stops concurrent workers cleanly when the queue is exhausted', async () => {
    expect(contextKeysForUri({ fsPath: '', path: '' } as never)).toEqual([]);

    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
      value: 'win32'
    });
    try {
      expect(
        contextKeysForUri({
          fsPath: 'C:\\Repo\\Nested\\File.vi',
          path: 'C:\\Repo\\Nested\\File.vi'
        } as never)
      ).toEqual(
        expect.arrayContaining([
          'C:\\Repo\\Nested\\File.vi',
          'C:/Repo/Nested/File.vi',
          'c:\\repo\\nested\\file.vi',
          'c:/repo/nested/file.vi'
        ])
      );
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }

    const processed: number[] = [];
    await forEachConcurrent([1], 3, async (value) => {
      processed.push(value);
    });
    expect(processed).toEqual([1]);
  });
});

describe('viEligibilityIndexer eligibility edge cases (VHS-REQ-006, VHS-REQ-061)', () => {
  beforeEach(() => {
    configurationValues.set('strictRsrcHeader', false);
    configurationValues.set('maxIndexedConcurrency', 6);
    getRepoRootMock.mockReset();
    getRepoRootMock.mockImplementation(async (fsPath: string) => fsPath);
    listTrackedFilesMock.mockReset();
    getRepoHeadMock.mockReset();
    evaluateViEligibilityMock.mockReset();
    commandExecuteMock.mockReset();
    progressReportMock.mockReset();
    workspaceFolderListeners.length = 0;
    workspaceTrustListeners.length = 0;
    workspaceState.isTrusted = true;
    workspaceState.workspaceFolders = [];
    withProgressMock.mockReset();
    createStatusBarItemMock.mockClear();
    withProgressMock.mockImplementation(async (_options, task) =>
      task(
        {
          report: progressReportMock
        },
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(() => ({ dispose() {} }))
        }
      )
    );
  });

  it('indexes files from multiple independent repositories in a multi-root workspace', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } } as never,
      { uri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo-a', path: '/workspace/repo-a' } },
        { rootUri: { fsPath: '/workspace/repo-b', path: '/workspace/repo-b' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockImplementation(async (cwd: string) => {
      if (cwd === '/workspace/repo-a') return ['module-a/file.vi'];
      if (cwd === '/workspace/repo-b') return ['module-b/tool.vi'];
      return [];
    });
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    await indexer.refresh();

    expect(indexer.isEligible({
      fsPath: '/workspace/repo-a/module-a/file.vi',
      path: '/workspace/repo-a/module-a/file.vi'
    } as never)).toBe(true);
    expect(indexer.isEligible({
      fsPath: '/workspace/repo-b/module-b/tool.vi',
      path: '/workspace/repo-b/module-b/tool.vi'
    } as never)).toBe(true);
    expect(indexer.getDebugSnapshot().indexedRepositoryRoots).toEqual([
      '/workspace/repo-a',
      '/workspace/repo-b'
    ]);
  });

  it('resolves nested repositories and indexes files in the most-specific repository', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/outer', path: '/workspace/outer' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/outer', path: '/workspace/outer' } },
        { rootUri: { fsPath: '/workspace/outer/nested', path: '/workspace/outer/nested' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockImplementation(async (cwd: string) => {
      if (cwd === '/workspace/outer') return ['outer-file.vi'];
      if (cwd === '/workspace/outer/nested') return ['nested-file.vi'];
      return [];
    });
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    await indexer.refresh();

    expect(indexer.isEligible({
      fsPath: '/workspace/outer/outer-file.vi',
      path: '/workspace/outer/outer-file.vi'
    } as never)).toBe(true);
    expect(indexer.isEligible({
      fsPath: '/workspace/outer/nested/nested-file.vi',
      path: '/workspace/outer/nested/nested-file.vi'
    } as never)).toBe(true);
    expect(indexer.getDebugSnapshot().indexedRepositoryRoots).toEqual([
      '/workspace/outer',
      '/workspace/outer/nested'
    ]);
  });

  it('marks untracked files as ineligible even when tracked files exist in the repository', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['tracked.vi']);
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    await indexer.refresh();

    expect(indexer.isEligible({
      fsPath: '/workspace/repo/tracked.vi',
      path: '/workspace/repo/tracked.vi'
    } as never)).toBe(true);
    expect(indexer.isEligible({
      fsPath: '/workspace/repo/untracked.vi',
      path: '/workspace/repo/untracked.vi'
    } as never)).toBe(false);
  });

  it('marks files with fewer than two commits as ineligible', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['one-commit.vi', 'two-commits.vi']);
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock.mockImplementation(async (fsPath: string) => {
      if (fsPath.endsWith('one-commit.vi')) {
        return { eligible: false };
      }
      return { eligible: true };
    });

    await indexer.refresh();

    expect(indexer.isEligible({
      fsPath: '/workspace/repo/one-commit.vi',
      path: '/workspace/repo/one-commit.vi'
    } as never)).toBe(false);
    expect(indexer.isEligible({
      fsPath: '/workspace/repo/two-commits.vi',
      path: '/workspace/repo/two-commits.vi'
    } as never)).toBe(true);
  });

  it('keeps eligibility conservative when Git API repository list is empty', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/folder', path: '/workspace/folder' } } as never
    ];
    getRepoRootMock.mockRejectedValue(new Error('not a git repository'));

    const indexer = new ViEligibilityIndexer({
      repositories: [],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    await indexer.refresh();

    expect(indexer.getDebugSnapshot().indexedRepositoryRoots).toEqual([]);
    expect(indexer.getDebugSnapshot().eligiblePathCount).toBe(0);
    expect(indexer.isEligible({
      fsPath: '/workspace/folder/orphan.vi',
      path: '/workspace/folder/orphan.vi'
    } as never)).toBe(false);
  });

  it('handles paths with unusual characters during eligibility indexing', async () => {
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue([
      'folder with spaces/file.vi',
      'path/[brackets]/file.vi'
    ]);
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    await indexer.refresh();

    expect(indexer.isEligible({
      fsPath: '/workspace/repo/folder with spaces/file.vi',
      path: '/workspace/repo/folder with spaces/file.vi'
    } as never)).toBe(true);
    expect(indexer.isEligible({
      fsPath: '/workspace/repo/path/[brackets]/file.vi',
      path: '/workspace/repo/path/[brackets]/file.vi'
    } as never)).toBe(true);
  });
});

describe('VHS-REQ-603 Large-Repository Indexing State Accounting', () => {
  beforeEach(() => {
    configurationValues.set('strictRsrcHeader', false);
    configurationValues.set('maxIndexedConcurrency', 6);
    getRepoRootMock.mockReset();
    getRepoRootMock.mockImplementation(async (fsPath: string) => fsPath);
    listTrackedFilesMock.mockReset();
    getRepoHeadMock.mockReset();
    evaluateViEligibilityMock.mockReset();
    commandExecuteMock.mockReset();
    progressReportMock.mockReset();
    workspaceFolderListeners.length = 0;
    workspaceTrustListeners.length = 0;
    workspaceState.isTrusted = true;
    workspaceState.workspaceFolders = [];
    withProgressMock.mockReset();
    createStatusBarItemMock.mockClear();
    withProgressMock.mockImplementation(async (_options, task) =>
      task(
        {
          report: progressReportMock
        },
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(() => ({ dispose() {} }))
        }
      )
    );
  });

  it('reports cold-scan state with correct work counts on first refresh', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['a.vi', 'b.vi', 'c.txt']);
    getRepoHeadMock.mockResolvedValue('head-initial');
    evaluateViEligibilityMock
      .mockResolvedValueOnce({ eligible: true })
      .mockResolvedValueOnce({ eligible: false })
      .mockResolvedValueOnce({ eligible: true });

    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result).toBeDefined();
    expect(result?.state).toBe('cold-scan');
    expect(result?.counts.tracked).toBe(3);
    expect(result?.counts.evaluated).toBe(3);
    expect(result?.counts.reused).toBe(0);
    expect(result?.counts.eligible).toBe(2);
    expect(result?.counts.skipped).toBe(0);
    expect(result?.counts.failed).toBe(0);
    expect(result?.snapshotPreserved).toBe(false);
    expect(result?.indexedRepositoryRoots).toEqual(['/workspace/repo']);
  });

  it('reports warm-restart state with cache reuse counts when HEAD unchanged', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['a.vi', 'b.vi']);
    getRepoHeadMock.mockResolvedValue('head-stable');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    // First refresh: cold-scan
    await indexer.refresh();
    expect(indexer.getLastRefreshResult()?.state).toBe('cold-scan');

    // Second refresh: warm-restart with cache reuse
    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result?.state).toBe('warm-restart');
    expect(result?.counts.tracked).toBe(2);
    expect(result?.counts.reused).toBe(2);
    expect(result?.counts.evaluated).toBe(0);
    expect(result?.counts.eligible).toBe(2);
    expect(result?.snapshotPreserved).toBe(false);
  });

  it('reports branch-switch state when HEAD changes between refreshes', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['feature.vi']);
    getRepoHeadMock
      .mockResolvedValueOnce('head-main')
      .mockResolvedValueOnce('head-feature-branch');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    // First refresh: cold-scan on main branch
    await indexer.refresh();
    expect(indexer.getLastRefreshResult()?.state).toBe('cold-scan');

    // Second refresh: branch-switch to feature branch
    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result?.state).toBe('branch-switch');
    expect(result?.counts.tracked).toBe(1);
    expect(result?.counts.reused).toBe(0);
    expect(result?.counts.evaluated).toBe(1);
    expect(result?.snapshotPreserved).toBe(false);
  });

  it('reports cancelled state and preserves previous snapshot when cancellation requested', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['initial.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-1');
    evaluateViEligibilityMock.mockResolvedValueOnce({ eligible: true });

    // First refresh establishes baseline
    await indexer.refresh();
    expect(indexer.getDebugSnapshot().eligiblePathCount).toBeGreaterThan(0);

    // Set up cancellation during second refresh
    const cancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(() => ({ dispose() {} }))
    };
    withProgressMock.mockImplementationOnce(async (_options, task) => {
      cancellationToken.isCancellationRequested = true;
      return task({ report: progressReportMock }, cancellationToken);
    });
    listTrackedFilesMock.mockResolvedValue(['new-file.vi']);
    getRepoHeadMock.mockResolvedValueOnce('head-2');

    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result?.state).toBe('cancelled');
    expect(result?.snapshotPreserved).toBe(true);
    // Previous eligibility preserved
    expect(indexer.isEligible({
      fsPath: '/workspace/repo/initial.vi',
      path: '/workspace/repo/initial.vi'
    } as never)).toBe(true);
  });

  it('reports trust-disabled state when workspace is untrusted', async () => {
    workspaceState.isTrusted = false;
    const indexer = new ViEligibilityIndexer(undefined);

    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result?.state).toBe('trust-disabled');
    expect(result?.counts.tracked).toBe(0);
    expect(result?.snapshotPreserved).toBe(false);
  });

  it('reports failed counts separately from skipped counts on evaluation errors', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    listTrackedFilesMock.mockResolvedValue(['good.vi', 'broken.vi', 'also-good.vi']);
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock
      .mockResolvedValueOnce({ eligible: true })
      .mockRejectedValueOnce(new Error('Evaluation failed'))
      .mockResolvedValueOnce({ eligible: true });

    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result?.state).toBe('cold-scan');
    expect(result?.counts.tracked).toBe(3);
    expect(result?.counts.evaluated).toBe(3);
    expect(result?.counts.eligible).toBe(2);
    expect(result?.counts.failed).toBe(1);
    expect(result?.counts.skipped).toBe(0);
  });

  it('tracks skipped files when cancellation interrupts mid-refresh', async () => {
    configurationValues.set('maxIndexedConcurrency', 1);
    workspaceState.workspaceFolders = [
      { uri: { fsPath: '/workspace/repo', path: '/workspace/repo' } } as never
    ];
    const indexer = new ViEligibilityIndexer({
      repositories: [
        { rootUri: { fsPath: '/workspace/repo', path: '/workspace/repo' } }
      ],
      onDidOpenRepository: vi.fn(() => ({ dispose() {} })),
      onDidCloseRepository: vi.fn(() => ({ dispose() {} })),
      toGitUri: vi.fn()
    } as never);

    const cancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(() => ({ dispose() {} }))
    };
    withProgressMock.mockImplementationOnce(async (options, task) =>
      task(
        {
          report: vi.fn(() => {
            // Cancel after first file
            cancellationToken.isCancellationRequested = true;
          })
        },
        cancellationToken
      )
    );

    listTrackedFilesMock.mockResolvedValue(['file-1.vi', 'file-2.vi', 'file-3.vi']);
    getRepoHeadMock.mockResolvedValue('head-1');
    evaluateViEligibilityMock.mockResolvedValue({ eligible: true });

    await indexer.refresh();

    const result = indexer.getLastRefreshResult();
    expect(result?.state).toBe('cancelled');
    expect(result?.counts.tracked).toBe(3);
    expect(result?.counts.skipped).toBeGreaterThan(0);
  });

  it('provides getLastRefreshResult method for diagnostics access', async () => {
    const indexer = new ViEligibilityIndexer(undefined);

    // Before any refresh
    expect(indexer.getLastRefreshResult()).toBeUndefined();

    workspaceState.isTrusted = false;
    await indexer.refresh();

    // After refresh
    const result = indexer.getLastRefreshResult();
    expect(result).toBeDefined();
    expect(result?.state).toBe('trust-disabled');
  });

  it('includes lastRefreshResult in getDebugSnapshot for diagnostics', async () => {
    workspaceState.isTrusted = false;
    const indexer = new ViEligibilityIndexer(undefined);

    await indexer.refresh();

    const snapshot = indexer.getDebugSnapshot();
    expect(snapshot.lastRefreshResult).toBeDefined();
    expect(snapshot.lastRefreshResult?.state).toBe('trust-disabled');
    expect(snapshot.lastRefreshResult?.counts).toMatchObject({
      tracked: 0,
      reused: 0,
      evaluated: 0,
      eligible: 0,
      skipped: 0,
      failed: 0
    });
  });
});
