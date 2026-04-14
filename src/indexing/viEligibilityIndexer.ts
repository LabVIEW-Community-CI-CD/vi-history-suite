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
type IndexedRepositoryWorkItem = {
  repository: IndexedRepository;
  trackedFiles: string[];
  head: string;
};

export interface EligibilityDebugSnapshot {
  indexedRepositoryRoots: string[];
  eligiblePathCount: number;
  eligiblePathsSample: string[];
}

export class ViEligibilityIndexer implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repositoryStateDisposables = new Map<string, vscode.Disposable>();
  private readonly eligibilityCache = new Map<string, boolean>();
  private readonly statusBarItem: vscode.StatusBarItem;
  private refreshHandle: NodeJS.Timeout | undefined;
  private refreshRunning = false;
  private refreshPending = false;
  private eligiblePaths: EligibilityMap = {};
  private lastIndexedRepositoryRoots: string[] = [];

  constructor(private readonly gitApi: GitApi | undefined) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      95
    );
    this.statusBarItem.hide();
    this.disposables.push(this.statusBarItem);
  }

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
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.syncRepositoryStateListeners();
        this.scheduleRefresh();
      })
    );

    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        this.syncRepositoryStateListeners();
        this.scheduleRefresh();
      })
    );

    if (!this.gitApi) {
      return;
    }

    this.disposables.push(
      this.gitApi.onDidOpenRepository((repository) => {
        if (!isRepositoryRelevantToWorkspace(repository.rootUri.fsPath, vscode.workspace.workspaceFolders ?? [])) {
          return;
        }
        this.registerRepositoryStateListener(repository);
        this.scheduleRefresh();
      }),
      this.gitApi.onDidCloseRepository((repository) => {
        const existingDisposable = this.repositoryStateDisposables.get(repository.rootUri.fsPath);
        existingDisposable?.dispose();
        if (existingDisposable) {
          this.repositoryStateDisposables.delete(repository.rootUri.fsPath);
          this.scheduleRefresh();
        }
      })
    );

    this.syncRepositoryStateListeners();
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

  private syncRepositoryStateListeners(): void {
    if (!this.gitApi) {
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const relevantRoots = new Set(
      this.gitApi.repositories
        .filter((repository) =>
          isRepositoryRelevantToWorkspace(repository.rootUri.fsPath, workspaceFolders)
        )
        .map((repository) => repository.rootUri.fsPath)
    );

    for (const [repositoryRoot, disposable] of this.repositoryStateDisposables.entries()) {
      if (relevantRoots.has(repositoryRoot)) {
        continue;
      }

      disposable.dispose();
      this.repositoryStateDisposables.delete(repositoryRoot);
    }

    for (const repository of this.gitApi.repositories) {
      if (!relevantRoots.has(repository.rootUri.fsPath)) {
        continue;
      }

      this.registerRepositoryStateListener(repository);
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshRunning) {
      this.refreshPending = true;
      return;
    }

    this.refreshRunning = true;
    try {
      do {
        this.refreshPending = false;
        await this.runRefresh();
      } while (this.refreshPending);
    } finally {
      this.refreshRunning = false;
    }
  }

  private async runRefresh(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      this.hideStatusBarProgress();
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    const repositories = await resolveIndexedRepositories(
      this.gitApi?.repositories ?? [],
      vscode.workspace.workspaceFolders ?? []
    );
    const nextIndexedRepositoryRoots = repositories.map((repository) => repository.rootUri.fsPath);
    const repositoryWorkItems: IndexedRepositoryWorkItem[] = [];
    let totalTrackedFiles = 0;
    const nextEligiblePaths: EligibilityMap = {};
    let refreshOutcome: 'applied' | 'cancelled' | 'workspace-untrusted' = 'applied';

    for (const repository of repositories) {
      if (!vscode.workspace.isTrusted) {
        refreshOutcome = 'workspace-untrusted';
        break;
      }

      try {
        const trackedFiles = await listTrackedFiles(repository.rootUri.fsPath);
        const head = await getRepoHead(repository.rootUri.fsPath);
        repositoryWorkItems.push({
          repository,
          trackedFiles,
          head
        });
        totalTrackedFiles += trackedFiles.length;
      } catch {
        // Fail closed per repository and continue indexing other repositories.
      }
    }

    let processedTrackedFiles = 0;
    let lastReportedPercent = 0;
    const refreshStartMs = Date.now();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing LabVIEW VIs',
        cancellable: true
      },
      async (progress, cancellationToken) => {
        if (totalTrackedFiles > 0) {
          const initialUpdate = buildIndexingProgressUpdate({
            repositoryName: path.basename(repositoryWorkItems[0].repository.rootUri.fsPath),
            processed: 0,
            total: totalTrackedFiles,
            elapsedMs: 0
          });
          this.showStatusBarProgress(initialUpdate);
        }

        for (const workItem of repositoryWorkItems) {
          if (cancellationToken.isCancellationRequested) {
            refreshOutcome = 'cancelled';
            return;
          }
          if (!vscode.workspace.isTrusted) {
            refreshOutcome = 'workspace-untrusted';
            return;
          }

          const concurrency = getConfiguredConcurrency();
          const repositoryName = path.basename(workItem.repository.rootUri.fsPath);

          await forEachConcurrent(workItem.trackedFiles, concurrency, async (relativePath) => {
            if (refreshOutcome !== 'applied') {
              return;
            }
            if (cancellationToken.isCancellationRequested) {
              refreshOutcome = 'cancelled';
              return;
            }
            if (!vscode.workspace.isTrusted) {
              refreshOutcome = 'workspace-untrusted';
              return;
            }

            const cacheKey = buildCacheKey(workItem.repository, workItem.head, relativePath);
            const fileUri = vscode.Uri.joinPath(workItem.repository.rootUri, relativePath);

            let isEligible = this.eligibilityCache.get(cacheKey);
            if (isEligible === undefined) {
              try {
                const eligibility = await evaluateViEligibilityForFsPath(fileUri.fsPath, {
                  repoRoot: workItem.repository.rootUri.fsPath,
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

            processedTrackedFiles += 1;
            const progressUpdate = buildIndexingProgressUpdate({
              repositoryName,
              processed: processedTrackedFiles,
              total: totalTrackedFiles,
              elapsedMs: Math.max(0, Date.now() - refreshStartMs)
            });
            const progressIncrement = Math.max(
              0,
              progressUpdate.percent - lastReportedPercent
            );
            lastReportedPercent = progressUpdate.percent;
            progress.report({
              message: progressUpdate.message,
              increment: progressIncrement > 0 ? progressIncrement : undefined
            });
            this.showStatusBarProgress(progressUpdate);
          });

          if (refreshOutcome !== 'applied') {
            return;
          }
        }
      }
    );

    const finalRefreshOutcome = refreshOutcome as
      | 'applied'
      | 'cancelled'
      | 'workspace-untrusted';

    if (finalRefreshOutcome === 'cancelled') {
      this.hideStatusBarProgress();
      return;
    }

    if (finalRefreshOutcome === 'workspace-untrusted') {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      this.hideStatusBarProgress();
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    this.lastIndexedRepositoryRoots = nextIndexedRepositoryRoots;
    this.eligiblePaths = nextEligiblePaths;
    this.hideStatusBarProgress();
    await vscode.commands.executeCommand(
      'setContext',
      'labviewViHistory.eligiblePaths',
      nextEligiblePaths
    );
  }

  private showStatusBarProgress(update: IndexingProgressUpdate): void {
    this.statusBarItem.text = `$(sync~spin) VI History ${update.percentLabel} (${update.processed}/${update.total}) ETA ${update.etaLabel}`;
    this.statusBarItem.tooltip = [
      'VI History indexing',
      '',
      `${update.repositoryName}: ${update.percentLabel} (${update.processed}/${update.total})`,
      `ETA ${update.etaLabel}`
    ].join('\n');
    this.statusBarItem.show();
  }

  private hideStatusBarProgress(): void {
    this.statusBarItem.hide();
  }
}

type IndexingProgressUpdate = {
  repositoryName: string;
  processed: number;
  total: number;
  percent: number;
  percentLabel: string;
  etaLabel: string;
  message: string;
};

function buildIndexingProgressUpdate(options: {
  repositoryName: string;
  processed: number;
  total: number;
  elapsedMs: number;
}): IndexingProgressUpdate {
  const total = Math.max(1, options.total);
  const processed = Math.max(0, Math.min(options.processed, total));
  const percent = (processed / total) * 100;
  const percentLabel = `${Math.round(percent)}%`;
  const remainingItems = Math.max(0, total - processed);
  const etaMs =
    processed > 0 && remainingItems > 0
      ? Math.round((options.elapsedMs / processed) * remainingItems)
      : 0;
  const etaLabel = formatEta(etaMs);
  return {
    repositoryName: options.repositoryName,
    processed,
    total,
    percent,
    percentLabel,
    etaLabel,
    message: `${options.repositoryName} ${percentLabel} (${processed}/${total}) ETA ${etaLabel}`
  };
}

function formatEta(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
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
    if (!isRepositoryRelevantToWorkspace(repository.rootUri.fsPath, workspaceFolders)) {
      continue;
    }

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

export function isRepositoryRelevantToWorkspace(
  repositoryRoot: string,
  workspaceFolders: readonly Pick<vscode.WorkspaceFolder, 'uri'>[]
): boolean {
  if (workspaceFolders.length === 0) {
    return false;
  }

  const normalizedRepositoryRoot = normalizeScopePath(repositoryRoot);

  return workspaceFolders.some((folder) => {
    const normalizedWorkspaceRoot = normalizeScopePath(folder.uri.fsPath);
    return (
      normalizedWorkspaceRoot === normalizedRepositoryRoot ||
      normalizedWorkspaceRoot.startsWith(`${normalizedRepositoryRoot}${path.sep}`) ||
      normalizedRepositoryRoot.startsWith(`${normalizedWorkspaceRoot}${path.sep}`)
    );
  });
}

function normalizeScopePath(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
