import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi, GitRepository } from '../git/gitApi';
import {
  getRepoHead,
  getRepoRoot,
  listTrackedFiles,
  normalizeRelativeGitPath
} from '../git/gitCli';
import { evaluateViEligibilityForFsPath } from '../services/viHistoryModel';

type EligibilityMap = Record<string, true>;
type IndexedRepository = Pick<GitRepository, 'rootUri'>;

export interface EligibilityDebugSnapshot {
  indexedRepositoryRoots: string[];
  eligiblePathCount: number;
  eligiblePathsSample: string[];
}

export class ViEligibilityIndexer implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repositoryStateDisposables = new Map<string, vscode.Disposable>();
  private readonly eligibilityCache = new Map<string, boolean>();
  private refreshHandle: NodeJS.Timeout | undefined;
  private eligiblePaths: EligibilityMap = {};
  private lastIndexedRepositoryRoots: string[] = [];

  constructor(private readonly gitApi: GitApi | undefined) {}

  async start(): Promise<void> {
    this.registerListeners();
    await this.refresh();
  }

  dispose(): void {
    if (this.refreshHandle) {
      clearTimeout(this.refreshHandle);
    }

    vscode.Disposable.from(
      ...this.disposables,
      ...this.repositoryStateDisposables.values()
    ).dispose();
    this.repositoryStateDisposables.clear();
  }

  isEligible(uri: vscode.Uri): boolean {
    return contextKeysForUri(uri).some((key) => this.eligiblePaths[key] === true);
  }

  getDebugSnapshot(): EligibilityDebugSnapshot {
    const eligiblePaths = Object.keys(this.eligiblePaths).sort();
    return {
      indexedRepositoryRoots: [...this.lastIndexedRepositoryRoots],
      eligiblePathCount: eligiblePaths.length,
      eligiblePathsSample: eligiblePaths.slice(0, 12)
    };
  }

  scheduleRefresh(): void {
    if (this.refreshHandle) {
      clearTimeout(this.refreshHandle);
    }

    this.refreshHandle = setTimeout(() => {
      void this.refresh();
    }, 300);
  }

  private registerListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRefresh())
    );

    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        this.scheduleRefresh();
      })
    );

    if (!this.gitApi) {
      return;
    }

    this.disposables.push(
      this.gitApi.onDidOpenRepository((repository) => {
        this.registerRepositoryStateListener(repository);
        this.scheduleRefresh();
      }),
      this.gitApi.onDidCloseRepository((repository) => {
        this.repositoryStateDisposables.get(repository.rootUri.fsPath)?.dispose();
        this.repositoryStateDisposables.delete(repository.rootUri.fsPath);
        this.scheduleRefresh();
      })
    );

    for (const repository of this.gitApi.repositories) {
      this.registerRepositoryStateListener(repository);
    }
  }

  private registerRepositoryStateListener(repository: GitRepository): void {
    if (
      this.repositoryStateDisposables.has(repository.rootUri.fsPath) ||
      !repository.state?.onDidChange
    ) {
      return;
    }

    this.repositoryStateDisposables.set(
      repository.rootUri.fsPath,
      repository.state.onDidChange(() => this.scheduleRefresh())
    );
  }

  async refresh(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    const repositories = await resolveIndexedRepositories(
      this.gitApi?.repositories ?? [],
      vscode.workspace.workspaceFolders ?? []
    );
    this.lastIndexedRepositoryRoots = repositories.map((repository) => repository.rootUri.fsPath);
    const nextEligiblePaths: EligibilityMap = {};

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing LabVIEW VIs'
      },
      async (progress) => {
        let processed = 0;

        for (const repository of repositories) {
          let trackedFiles: string[];
          let head: string;

          try {
            trackedFiles = await listTrackedFiles(repository.rootUri.fsPath);
            head = await getRepoHead(repository.rootUri.fsPath);
          } catch {
            continue;
          }

          const concurrency = getConfiguredConcurrency();

          await forEachConcurrent(trackedFiles, concurrency, async (relativePath) => {
            const cacheKey = buildCacheKey(repository, head, relativePath);
            const fileUri = vscode.Uri.joinPath(repository.rootUri, relativePath);

            let isEligible = this.eligibilityCache.get(cacheKey);
            if (isEligible === undefined) {
              try {
                const eligibility = await evaluateViEligibilityForFsPath(fileUri.fsPath, {
                  repoRoot: repository.rootUri.fsPath,
                  strictRsrcHeader: getStrictHeaderSetting()
                });
                isEligible = eligibility.eligible;
                this.eligibilityCache.set(cacheKey, isEligible);
              } catch {
                isEligible = false;
              }
            }

            if (isEligible) {
              for (const key of contextKeysForUri(fileUri)) {
                nextEligiblePaths[key] = true;
              }
            }

            processed += 1;
            progress.report({
              message: `${path.basename(repository.rootUri.fsPath)} ${processed}/${trackedFiles.length}`
            });
          });
        }
      }
    );

    this.eligiblePaths = nextEligiblePaths;
    await vscode.commands.executeCommand(
      'setContext',
      'labviewViHistory.eligiblePaths',
      nextEligiblePaths
    );
  }
}

export function buildCacheKey(
  repository: IndexedRepository,
  head: string,
  relativePath: string
): string {
  return [repository.rootUri.fsPath, normalizeRelativeGitPath(relativePath), head].join('::');
}

export function contextKeysForUri(uri: vscode.Uri): string[] {
  const keys = new Set<string>();
  addContextKeyVariants(keys, uri.fsPath);
  addContextKeyVariants(keys, uri.path);
  return [...keys];
}

function addContextKeyVariants(keys: Set<string>, value: string | undefined): void {
  if (!value) {
    return;
  }

  const normalizedPath = path.normalize(value);
  const slashNormalized = normalizedPath.replaceAll('\\', '/');

  keys.add(value);
  keys.add(normalizedPath);
  keys.add(slashNormalized);

  if (process.platform === 'win32') {
    keys.add(value.toLowerCase());
    keys.add(normalizedPath.toLowerCase());
    keys.add(slashNormalized.toLowerCase());
  }
}

export function getStrictHeaderSetting(): boolean {
  return vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<boolean>('strictRsrcHeader', false);
}

export function getConfiguredConcurrency(): number {
  return vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<number>('maxIndexedConcurrency', 6);
}

export async function forEachConcurrent<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  const queue = [...values];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }

      await worker(next);
    }
  });

  await Promise.all(workers);
}

export async function resolveIndexedRepositories(
  gitRepositories: readonly Pick<GitRepository, 'rootUri'>[],
  workspaceFolders: readonly Pick<vscode.WorkspaceFolder, 'uri'>[]
): Promise<IndexedRepository[]> {
  const repositories = new Map<string, IndexedRepository>();

  for (const repository of gitRepositories) {
    repositories.set(repository.rootUri.fsPath, { rootUri: repository.rootUri });
  }

  for (const folder of workspaceFolders) {
    try {
      const repositoryRoot = await getRepoRoot(folder.uri.fsPath);
      repositories.set(repositoryRoot, {
        rootUri: vscode.Uri.file(repositoryRoot)
      });
    } catch {
      // Ignore folders that are not part of a Git working tree.
    }
  }

  return [...repositories.values()].sort((left, right) =>
    left.rootUri.fsPath.localeCompare(right.rootUri.fsPath)
  );
}
