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
type EligibilityCacheStore = Pick<vscode.Memento, 'get' | 'update'>;
type IndexedRepositoryWorkItem = {
  repository: IndexedRepository;
  trackedFiles: string[];
  head: string;
};

const ELIGIBILITY_CACHE_SCHEMA_VERSION = 1;
const ELIGIBILITY_CACHE_STORAGE_KEY = 'viHistorySuite.eligibilityCache';

type PersistedEligibilityCache = {
  schemaVersion: number;
  entries: Record<string, boolean>;
};

/**
 * Refresh state types for large-repository indexing operating model (VHS-REQ-603).
 * - cold-scan: No prior eligibility data exists; all files evaluated from scratch.
 * - warm-restart: Prior eligibility data exists with same HEAD(s); cache reuse possible.
 * - branch-switch: HEAD changed since last refresh; affected files re-evaluated.
 * - cancelled: User cancelled the refresh; previous snapshot preserved.
 * - trust-disabled: Workspace is not trusted; eligibility cleared.
 * - failed: Refresh failed with no repositories successfully indexed; previous snapshot
 *   preserved when one exists.
 */
export type IndexRefreshState =
  | 'cold-scan'
  | 'warm-restart'
  | 'branch-switch'
  | 'cancelled'
  | 'trust-disabled'
  | 'failed';

/**
 * Work accounting for indexing refresh results (VHS-REQ-603).
 * These counts describe observable work rather than wall-clock timing.
 */
export interface IndexRefreshWorkCounts {
  /** Total tracked files discovered across all repositories. */
  tracked: number;
  /** Files whose eligibility was reused from cache (same HEAD + path). */
  reused: number;
  /** Files freshly evaluated (cache miss or HEAD change). */
  evaluated: number;
  /** Files determined eligible for VI history. */
  eligible: number;
  /** Files skipped due to cancellation or trust loss mid-refresh. */
  skipped: number;
  /** Files that failed eligibility evaluation with an error. */
  failed: number;
}

/**
 * Complete refresh result for diagnostics and state accounting (VHS-REQ-603).
 */
export interface IndexRefreshResult {
  /** The determined refresh state. */
  state: IndexRefreshState;
  /** Work counts for this refresh. */
  counts: IndexRefreshWorkCounts;
  /**
   * Repository roots represented by this result. Applied refreshes report roots
   * indexed in the refresh; preserved snapshots report the preserved roots.
   */
  indexedRepositoryRoots: string[];
  /** Whether the previous eligibility snapshot was preserved (cancellation/failure). */
  snapshotPreserved: boolean;
}

export interface EligibilityDebugSnapshot {
  indexedRepositoryRoots: string[];
  eligiblePathCount: number;
  eligiblePathsSample: string[];
  /** Last refresh result for diagnostics (VHS-REQ-603). */
  lastRefreshResult: IndexRefreshResult | undefined;
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
  /** Last recorded HEAD values per repository root for branch-switch detection (VHS-REQ-603). */
  private lastIndexedHeads = new Map<string, string>();
  /** Last refresh result for diagnostics (VHS-REQ-603). */
  private lastRefreshResult: IndexRefreshResult | undefined;

  constructor(
    private readonly gitApi: GitApi | undefined,
    private readonly cacheStore?: EligibilityCacheStore
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      95
    );
    this.statusBarItem.hide();
    this.restorePersistedEligibilityCache();
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
      eligiblePathsSample: eligiblePaths.slice(0, 12),
      lastRefreshResult: this.lastRefreshResult
    };
  }

  /** Returns the last refresh result for diagnostics (VHS-REQ-603). */
  getLastRefreshResult(): IndexRefreshResult | undefined {
    return this.lastRefreshResult;
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
    // Work counts for VHS-REQ-603 state accounting
    const workCounts: IndexRefreshWorkCounts = {
      tracked: 0,
      reused: 0,
      evaluated: 0,
      eligible: 0,
      skipped: 0,
      failed: 0
    };

    // Check workspace trust first
    if (!vscode.workspace.isTrusted) {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      this.lastIndexedHeads.clear();
      this.hideStatusBarProgress();
      this.lastRefreshResult = {
        state: 'trust-disabled',
        counts: workCounts,
        indexedRepositoryRoots: [],
        snapshotPreserved: false
      };
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    const strictRsrcHeader = getStrictHeaderSetting();
    const repositories = await resolveIndexedRepositories(
      this.gitApi?.repositories ?? [],
      vscode.workspace.workspaceFolders ?? []
    );
    const nextIndexedRepositoryRoots = repositories.map((repository) => repository.rootUri.fsPath);
    const repositoryWorkItems: IndexedRepositoryWorkItem[] = [];
    let totalTrackedFiles = 0;
    const nextEligiblePaths: EligibilityMap = {};
    const nextIndexedHeads = new Map<string, string>();
    let refreshOutcome: 'applied' | 'cancelled' | 'workspace-untrusted' = 'applied';

    // Track whether any HEAD changed to determine cold-scan vs warm-restart vs branch-switch
    let hadPriorIndexedRoots = this.lastIndexedRepositoryRoots.length > 0;
    let anyHeadChanged = false;

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
        nextIndexedHeads.set(repository.rootUri.fsPath, head);

        // Detect HEAD change for branch-switch detection
        const previousHead = this.lastIndexedHeads.get(repository.rootUri.fsPath);
        if (previousHead !== undefined && previousHead !== head) {
          anyHeadChanged = true;
        }
      } catch {
        // Fail closed per repository and continue indexing other repositories.
      }
    }

    workCounts.tracked = totalTrackedFiles;

    // Determine initial state type based on prior index state
    let determinedState: IndexRefreshState;
    if (!hadPriorIndexedRoots) {
      determinedState = 'cold-scan';
    } else if (anyHeadChanged) {
      determinedState = 'branch-switch';
    } else {
      determinedState = 'warm-restart';
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
              workCounts.skipped += 1;
              return;
            }
            if (cancellationToken.isCancellationRequested) {
              refreshOutcome = 'cancelled';
              workCounts.skipped += 1;
              return;
            }
            if (!vscode.workspace.isTrusted) {
              refreshOutcome = 'workspace-untrusted';
              workCounts.skipped += 1;
              return;
            }

            const cacheKey = buildCacheKey(
              workItem.repository,
              workItem.head,
              relativePath,
              strictRsrcHeader
            );
            const fileUri = vscode.Uri.joinPath(workItem.repository.rootUri, relativePath);

            let isEligible = this.eligibilityCache.get(cacheKey);
            if (isEligible !== undefined) {
              // Cache hit - reused
              workCounts.reused += 1;
            } else {
              // Cache miss - evaluate
              workCounts.evaluated += 1;
              try {
                const eligibility = await evaluateViEligibilityForFsPath(fileUri.fsPath, {
                  repoRoot: workItem.repository.rootUri.fsPath,
                  strictRsrcHeader
                });
                isEligible = eligibility.eligible;
                this.eligibilityCache.set(cacheKey, isEligible);
              } catch {
                isEligible = false;
                workCounts.failed += 1;
              }
            }

            if (isEligible) {
              workCounts.eligible += 1;
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
      // Preserve previous snapshot on cancellation (VHS-REQ-603)
      this.hideStatusBarProgress();
      finalizeSkippedCount(workCounts);
      this.lastRefreshResult = {
        state: 'cancelled',
        counts: workCounts,
        indexedRepositoryRoots: [...this.lastIndexedRepositoryRoots],
        snapshotPreserved: true
      };
      return;
    }

    if (finalRefreshOutcome === 'workspace-untrusted') {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      this.lastIndexedHeads.clear();
      this.hideStatusBarProgress();
      finalizeSkippedCount(workCounts);
      this.lastRefreshResult = {
        state: 'trust-disabled',
        counts: workCounts,
        indexedRepositoryRoots: [],
        snapshotPreserved: false
      };
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    // Check if refresh failed (no repositories successfully indexed despite having workspace folders)
    if (repositoryWorkItems.length === 0 && repositories.length > 0) {
      // Preserve previous snapshot on failed refresh (VHS-REQ-603)
      this.hideStatusBarProgress();
      const hasExistingSnapshot = this.lastIndexedRepositoryRoots.length > 0;
      this.lastRefreshResult = {
        state: 'failed',
        counts: workCounts,
        indexedRepositoryRoots: [],
        snapshotPreserved: hasExistingSnapshot
      };
      return;
    }

    // Successfully applied refresh
    this.lastIndexedRepositoryRoots = nextIndexedRepositoryRoots;
    this.lastIndexedHeads = nextIndexedHeads;
    this.eligiblePaths = nextEligiblePaths;
    this.hideStatusBarProgress();
    this.lastRefreshResult = {
      state: determinedState,
      counts: workCounts,
      indexedRepositoryRoots: nextIndexedRepositoryRoots,
      snapshotPreserved: false
    };
    await vscode.commands.executeCommand(
      'setContext',
      'labviewViHistory.eligiblePaths',
      nextEligiblePaths
    );
    await this.persistEligibilityCache();
  }

  private restorePersistedEligibilityCache(): void {
    let parsedEntries: Record<string, boolean>;
    try {
      const persistedCache = this.cacheStore?.get<unknown>(ELIGIBILITY_CACHE_STORAGE_KEY);
      parsedEntries = parsePersistedEligibilityCache(persistedCache);
    } catch {
      parsedEntries = {};
    }

    this.eligibilityCache.clear();
    for (const [cacheKey, isEligible] of Object.entries(parsedEntries)) {
      this.eligibilityCache.set(cacheKey, isEligible);
    }
  }

  private async persistEligibilityCache(): Promise<void> {
    if (!this.cacheStore) {
      return;
    }

    const entries: Record<string, boolean> = {};
    for (const [cacheKey, isEligible] of this.eligibilityCache.entries()) {
      entries[cacheKey] = isEligible;
    }

    const persistedCache: PersistedEligibilityCache = {
      schemaVersion: ELIGIBILITY_CACHE_SCHEMA_VERSION,
      entries
    };
    try {
      await this.cacheStore.update(ELIGIBILITY_CACHE_STORAGE_KEY, persistedCache);
    } catch {
      // Storage persistence is advisory; the in-memory eligibility result remains valid.
    }
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
  relativePath: string,
  strictRsrcHeader: boolean
): string {
  return [
    `v${ELIGIBILITY_CACHE_SCHEMA_VERSION}`,
    repository.rootUri.fsPath,
    normalizeRelativeGitPath(relativePath),
    head,
    strictRsrcHeader ? 'strict' : 'non-strict'
  ].join('::');
}

function parsePersistedEligibilityCache(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as Partial<PersistedEligibilityCache>;
  if (candidate.schemaVersion !== ELIGIBILITY_CACHE_SCHEMA_VERSION) {
    return {};
  }
  if (!candidate.entries || typeof candidate.entries !== 'object') {
    return {};
  }

  const parsedEntries: Record<string, boolean> = {};
  for (const [cacheKey, entryValue] of Object.entries(candidate.entries)) {
    if (typeof entryValue === 'boolean') {
      parsedEntries[cacheKey] = entryValue;
    }
  }
  return parsedEntries;
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

function finalizeSkippedCount(workCounts: IndexRefreshWorkCounts): void {
  workCounts.skipped = Math.max(
    workCounts.skipped,
    workCounts.tracked - workCounts.reused - workCounts.evaluated
  );
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
