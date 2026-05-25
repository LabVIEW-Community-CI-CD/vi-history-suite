import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ViSignature } from '../domain/viMagicCore';
import { GitApi, GitRepository } from '../git/gitApi';
import {
  type GitTrackedFileEntry,
  findReachableCommitHashes,
  getRepoHead,
  getRepoRoot,
  listChangedTrackedPaths,
  listTrackedFileEntries,
  normalizeRelativeGitPath
} from '../git/gitCli';
import { evaluateViEligibilityForFsPath } from '../services/viHistoryModel';

type EligibilityMap = Record<string, true>;
type IndexedRepository = Pick<GitRepository, 'rootUri'>;
type EligibilityCacheStore = Pick<vscode.Memento, 'get' | 'update'>;
type IndexedRepositoryWorkItem = {
  repository: IndexedRepository;
  trackedFiles: string[];
  cleanObjectIdsByPath: Map<string, string>;
  getReachableProofHashes: () => Promise<Set<string>>;
  head: string;
};

const ELIGIBILITY_CACHE_SCHEMA_VERSION = 2;
const ELIGIBILITY_CACHE_STORAGE_KEY = 'viHistorySuite.eligibilityCache';

type EligibilityCacheEntry = {
  eligible: boolean;
  signature: ViSignature | 'unknown';
  commitHashes: string[];
};

type PersistedEligibilityCache = {
  schemaVersion: number;
  entries: Record<string, EligibilityCacheEntry>;
};

/**
 * Refresh state types for large-repository indexing operating model (VHS-REQ-603).
 * - cold-scan: No prior eligibility data exists; all files evaluated from scratch.
 * - warm-restart: Prior eligibility data exists; file-level cache reuse possible.
 * - branch-switch: HEAD changed since last refresh; changed or unproven files re-evaluated.
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
 * Refresh reason types for indexing diagnostics (VHS-REQ-606).
 * Identifies what triggered the refresh.
 */
export type IndexRefreshReason =
  | 'initial-activation'
  | 'head-change'
  | 'workspace-folder-change'
  | 'git-state-change'
  | 'setting-change'
  | 'user-cancellation'
  | 'trust-disabled'
  | 'repository-enumeration-failed'
  | 'scheduled-refresh';

/**
 * Work accounting for indexing refresh results (VHS-REQ-603).
 * These counts describe observable work rather than wall-clock timing.
 */
export interface IndexRefreshWorkCounts {
  /** Total tracked files discovered across all repositories. */
  tracked: number;
  /** Files whose eligibility was reused from valid file-level cache evidence. */
  reused: number;
  /** Files freshly evaluated (cache miss, changed blob, or invalidated proof). */
  evaluated: number;
  /** Files determined eligible for VI history. */
  eligible: number;
  /** Previously indexed tracked files no longer present in the active tracked set. */
  removed: number;
  /** Files skipped due to cancellation or trust loss mid-refresh. */
  skipped: number;
  /** Files that failed eligibility evaluation with an error. */
  failed: number;
}

/**
 * Complete refresh result for diagnostics and state accounting (VHS-REQ-603, VHS-REQ-606).
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
  /** The reason that triggered this refresh (VHS-REQ-606). */
  refreshReason: IndexRefreshReason;
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
  private readonly eligibilityCache = new Map<string, EligibilityCacheEntry>();
  private readonly statusBarItem: vscode.StatusBarItem;
  private refreshHandle: NodeJS.Timeout | undefined;
  private refreshRunning = false;
  private refreshPending = false;
  private eligiblePaths: EligibilityMap = {};
  private lastIndexedRepositoryRoots: string[] = [];
  /** Last recorded HEAD values per repository root for branch-switch detection (VHS-REQ-603). */
  private lastIndexedHeads = new Map<string, string>();
  /** Last tracked path set per repository root for branch-switch diagnostics (VHS-REQ-603). */
  private lastIndexedTrackedPathsByRepository = new Map<string, Set<string>>();
  /** Last refresh result for diagnostics (VHS-REQ-603). */
  private lastRefreshResult: IndexRefreshResult | undefined;
  /** Pending refresh reason for the next refresh (VHS-REQ-606). */
  private pendingRefreshReason: IndexRefreshReason = 'initial-activation';

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

  scheduleRefresh(reason?: IndexRefreshReason): void {
    if (reason) {
      this.pendingRefreshReason = reason;
    }
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
        this.scheduleRefresh('workspace-folder-change');
      })
    );

    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        this.syncRepositoryStateListeners();
        this.scheduleRefresh('scheduled-refresh');
      })
    );

    // Watch for relevant indexing setting changes (VHS-REQ-605)
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('viHistorySuite.strictRsrcHeader')) {
          this.scheduleRefresh('setting-change');
        }
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
        this.scheduleRefresh('git-state-change');
      }),
      this.gitApi.onDidCloseRepository((repository) => {
        const existingDisposable = this.repositoryStateDisposables.get(repository.rootUri.fsPath);
        existingDisposable?.dispose();
        if (existingDisposable) {
          this.repositoryStateDisposables.delete(repository.rootUri.fsPath);
          this.scheduleRefresh('git-state-change');
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
      repository.state.onDidChange(() => this.scheduleRefresh('git-state-change'))
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
    // Capture the refresh reason at the start (VHS-REQ-606)
    const currentRefreshReason = this.pendingRefreshReason;
    this.pendingRefreshReason = 'scheduled-refresh';

    // Work counts for VHS-REQ-603 state accounting
    const workCounts: IndexRefreshWorkCounts = {
      tracked: 0,
      reused: 0,
      evaluated: 0,
      eligible: 0,
      removed: 0,
      skipped: 0,
      failed: 0
    };

    // Check workspace trust first
    if (!vscode.workspace.isTrusted) {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      this.lastIndexedHeads.clear();
      this.lastIndexedTrackedPathsByRepository.clear();
      this.hideStatusBarProgress();
      this.lastRefreshResult = {
        state: 'trust-disabled',
        counts: workCounts,
        indexedRepositoryRoots: [],
        snapshotPreserved: false,
        refreshReason: 'trust-disabled'
      };
      this.showStatusBarDiagnostic(this.lastRefreshResult);
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    const strictRsrcHeader = getStrictHeaderSetting();
    const repositories = await resolveIndexedRepositories(
      this.gitApi?.repositories ?? [],
      vscode.workspace.workspaceFolders ?? []
    );
    const repositoryWorkItems: IndexedRepositoryWorkItem[] = [];
    let totalTrackedFiles = 0;
    const nextEligiblePaths: EligibilityMap = {};
    const nextIndexedHeads = new Map<string, string>();
    const nextIndexedTrackedPathsByRepository = new Map<string, Set<string>>();
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
        const [
          trackedFileEntries,
          changedTrackedPaths,
          head
        ] = await Promise.all([
          listTrackedFileEntries(repository.rootUri.fsPath),
          listChangedTrackedPaths(repository.rootUri.fsPath),
          getRepoHead(repository.rootUri.fsPath)
        ]);
        const changedTrackedPathSet = new Set(
          changedTrackedPaths.map((relativePath) => normalizeRelativeGitPath(relativePath))
        );
        const trackedFiles = buildTrackedFilesFromEntries(trackedFileEntries);
        const trackedPathSet = new Set(
          trackedFiles.map((relativePath) => normalizeRelativeGitPath(relativePath))
        );
        const previousTrackedPaths = this.lastIndexedTrackedPathsByRepository.get(
          repository.rootUri.fsPath
        );
        workCounts.removed += countRemovedPaths(previousTrackedPaths, trackedPathSet);
        const cleanObjectIdsByPath = buildCleanObjectIdsByPath(
          trackedFileEntries,
          changedTrackedPathSet
        );
        repositoryWorkItems.push({
          repository,
          trackedFiles,
          cleanObjectIdsByPath,
          getReachableProofHashes: createReachableProofHashLoader(
            repository.rootUri.fsPath,
            collectCachedEligibleProofHashes(
              repository,
              trackedFiles,
              cleanObjectIdsByPath,
              strictRsrcHeader,
              this.eligibilityCache
            )
          ),
          head
        });
        totalTrackedFiles += trackedFiles.length;
        nextIndexedHeads.set(repository.rootUri.fsPath, head);
        nextIndexedTrackedPathsByRepository.set(repository.rootUri.fsPath, trackedPathSet);

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
    const nextIndexedRepositoryRoots = repositoryWorkItems.map(
      (workItem) => workItem.repository.rootUri.fsPath
    );

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

            const normalizedRelativePath = normalizeRelativeGitPath(relativePath);
            const cleanObjectId = workItem.cleanObjectIdsByPath.get(normalizedRelativePath);
            const cacheKey =
              cleanObjectId === undefined
                ? undefined
                : buildCacheKey(
                    workItem.repository,
                    cleanObjectId,
                    normalizedRelativePath,
                    strictRsrcHeader
                  );
            const fileUri = vscode.Uri.joinPath(workItem.repository.rootUri, relativePath);

            const cachedEntry = cacheKey === undefined ? undefined : this.eligibilityCache.get(cacheKey);
            let isEligible: boolean | undefined;
            if (
              cachedEntry !== undefined &&
              await canReuseEligibilityCacheEntry(
                cachedEntry,
                workItem.getReachableProofHashes
              )
            ) {
              isEligible = cachedEntry.eligible;
              workCounts.reused += 1;
            } else {
              workCounts.evaluated += 1;
              try {
                const eligibility = await evaluateViEligibilityForFsPath(fileUri.fsPath, {
                  repoRoot: workItem.repository.rootUri.fsPath,
                  strictRsrcHeader
                });
                isEligible = eligibility.eligible;
                if (cacheKey !== undefined) {
                  this.eligibilityCache.set(cacheKey, toEligibilityCacheEntry(eligibility));
                }
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
        snapshotPreserved: true,
        refreshReason: 'user-cancellation'
      };
      this.showStatusBarDiagnostic(this.lastRefreshResult);
      return;
    }

    if (finalRefreshOutcome === 'workspace-untrusted') {
      this.eligiblePaths = {};
      this.lastIndexedRepositoryRoots = [];
      this.lastIndexedHeads.clear();
      this.lastIndexedTrackedPathsByRepository.clear();
      this.hideStatusBarProgress();
      finalizeSkippedCount(workCounts);
      this.lastRefreshResult = {
        state: 'trust-disabled',
        counts: workCounts,
        indexedRepositoryRoots: [],
        snapshotPreserved: false,
        refreshReason: 'trust-disabled'
      };
      this.showStatusBarDiagnostic(this.lastRefreshResult);
      await vscode.commands.executeCommand('setContext', 'labviewViHistory.eligiblePaths', {});
      return;
    }

    // Check if refresh failed (no repositories successfully indexed despite having workspace folders)
    if (repositoryWorkItems.length === 0 && repositories.length > 0) {
      // Preserve previous snapshot on failed refresh (VHS-REQ-603)
      this.hideStatusBarProgress();
      const preservedRepositoryRoots = [...this.lastIndexedRepositoryRoots];
      const hasExistingSnapshot = this.lastIndexedRepositoryRoots.length > 0;
      this.lastRefreshResult = {
        state: 'failed',
        counts: workCounts,
        indexedRepositoryRoots: preservedRepositoryRoots,
        snapshotPreserved: hasExistingSnapshot,
        refreshReason: 'repository-enumeration-failed'
      };
      this.showStatusBarDiagnostic(this.lastRefreshResult);
      return;
    }

    // Successfully applied refresh
    this.lastIndexedRepositoryRoots = nextIndexedRepositoryRoots;
    this.lastIndexedHeads = nextIndexedHeads;
    this.lastIndexedTrackedPathsByRepository = nextIndexedTrackedPathsByRepository;
    this.eligiblePaths = nextEligiblePaths;
    this.hideStatusBarProgress();
    // Determine the effective refresh reason based on state (VHS-REQ-606)
    const effectiveRefreshReason: IndexRefreshReason = anyHeadChanged
      ? 'head-change'
      : currentRefreshReason;
    this.lastRefreshResult = {
      state: determinedState,
      counts: workCounts,
      indexedRepositoryRoots: nextIndexedRepositoryRoots,
      snapshotPreserved: false,
      refreshReason: effectiveRefreshReason
    };
    this.showStatusBarDiagnostic(this.lastRefreshResult);
    await vscode.commands.executeCommand(
      'setContext',
      'labviewViHistory.eligiblePaths',
      nextEligiblePaths
    );
    await this.persistEligibilityCache();
  }

  private restorePersistedEligibilityCache(): void {
    let parsedEntries: Record<string, EligibilityCacheEntry>;
    try {
      const persistedCache = this.cacheStore?.get<unknown>(ELIGIBILITY_CACHE_STORAGE_KEY);
      parsedEntries = parsePersistedEligibilityCache(persistedCache);
    } catch {
      parsedEntries = {};
    }

    this.eligibilityCache.clear();
    for (const [cacheKey, entry] of Object.entries(parsedEntries)) {
      this.eligibilityCache.set(cacheKey, entry);
    }
  }

  private async persistEligibilityCache(): Promise<void> {
    if (!this.cacheStore) {
      return;
    }

    const entries: Record<string, EligibilityCacheEntry> = {};
    for (const [cacheKey, entry] of this.eligibilityCache.entries()) {
      entries[cacheKey] = entry;
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

  private showStatusBarDiagnostic(result: IndexRefreshResult): void {
    this.statusBarItem.text = formatIndexRefreshStatusBarText(result);
    this.statusBarItem.tooltip = buildIndexingDiagnosticSummary(result).join('\n');
    this.statusBarItem.show();
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
  blobObjectId: string,
  relativePath: string,
  strictRsrcHeader: boolean
): string {
  return [
    `v${ELIGIBILITY_CACHE_SCHEMA_VERSION}`,
    normalizeCacheRepositoryRoot(repository.rootUri.fsPath),
    normalizeRelativeGitPath(relativePath),
    blobObjectId,
    strictRsrcHeader ? 'strict' : 'non-strict'
  ].join('::');
}

function parsePersistedEligibilityCache(value: unknown): Record<string, EligibilityCacheEntry> {
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

  const parsedEntries: Record<string, EligibilityCacheEntry> = {};
  for (const [cacheKey, entryValue] of Object.entries(candidate.entries)) {
    if (isEligibilityCacheEntry(entryValue)) {
      parsedEntries[cacheKey] = entryValue;
    }
  }
  return parsedEntries;
}

function isEligibilityCacheEntry(value: unknown): value is EligibilityCacheEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EligibilityCacheEntry>;
  if (typeof candidate.eligible !== 'boolean') {
    return false;
  }
  if (!isCacheableSignature(candidate.signature)) {
    return false;
  }
  if (
    !Array.isArray(candidate.commitHashes) ||
    !candidate.commitHashes.every((commitHash) => typeof commitHash === 'string')
  ) {
    return false;
  }
  if (candidate.signature === 'unknown' && candidate.eligible) {
    return false;
  }
  if (
    candidate.eligible &&
    (candidate.signature === 'unknown' || candidate.commitHashes.length < 2)
  ) {
    return false;
  }

  return true;
}

function isCacheableSignature(value: unknown): value is ViSignature | 'unknown' {
  return value === 'LVIN' || value === 'LVCC' || value === 'unknown';
}

function normalizeCacheRepositoryRoot(repositoryRoot: string): string {
  const normalizedRoot = path.resolve(repositoryRoot);
  return process.platform === 'win32' ? normalizedRoot.toLowerCase() : normalizedRoot;
}

function createReachableProofHashLoader(
  repositoryRoot: string,
  proofHashes: readonly string[]
): () => Promise<Set<string>> {
  let reachableProofHashesPromise: Promise<Set<string>> | undefined;
  return async () => {
    reachableProofHashesPromise ??= findReachableCommitHashes(repositoryRoot, proofHashes);
    return reachableProofHashesPromise;
  };
}

function collectCachedEligibleProofHashes(
  repository: IndexedRepository,
  trackedFiles: string[],
  cleanObjectIdsByPath: Map<string, string>,
  strictRsrcHeader: boolean,
  eligibilityCache: Map<string, EligibilityCacheEntry>
): string[] {
  const proofHashes = new Set<string>();
  for (const relativePath of trackedFiles) {
    const normalizedRelativePath = normalizeRelativeGitPath(relativePath);
    const cleanObjectId = cleanObjectIdsByPath.get(normalizedRelativePath);
    if (cleanObjectId === undefined) {
      continue;
    }

    const cachedEntry = eligibilityCache.get(
      buildCacheKey(repository, cleanObjectId, normalizedRelativePath, strictRsrcHeader)
    );
    if (!cachedEntry?.eligible) {
      continue;
    }

    for (const commitHash of cachedEntry.commitHashes) {
      proofHashes.add(commitHash);
    }
  }

  return [...proofHashes];
}

function buildTrackedFilesFromEntries(entries: GitTrackedFileEntry[]): string[] {
  const trackedFiles: string[] = [];
  const seenPaths = new Set<string>();
  for (const entry of entries) {
    const normalizedPath = normalizeRelativeGitPath(entry.relativePath);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    trackedFiles.push(normalizedPath);
  }

  return trackedFiles;
}

function buildCleanObjectIdsByPath(
  entries: GitTrackedFileEntry[],
  changedTrackedPaths: Set<string>
): Map<string, string> {
  const cleanObjectIdsByPath = new Map<string, string>();
  for (const entry of entries) {
    if (entry.stage !== 0) {
      continue;
    }

    const normalizedPath = normalizeRelativeGitPath(entry.relativePath);
    if (changedTrackedPaths.has(normalizedPath)) {
      continue;
    }

    cleanObjectIdsByPath.set(normalizedPath, entry.objectId);
  }

  return cleanObjectIdsByPath;
}

function countRemovedPaths(
  previousTrackedPaths: Set<string> | undefined,
  currentTrackedPaths: Set<string>
): number {
  if (!previousTrackedPaths) {
    return 0;
  }

  let removed = 0;
  for (const previousPath of previousTrackedPaths) {
    if (!currentTrackedPaths.has(previousPath)) {
      removed += 1;
    }
  }

  return removed;
}

function toEligibilityCacheEntry(
  eligibility: Awaited<ReturnType<typeof evaluateViEligibilityForFsPath>>
): EligibilityCacheEntry {
  return {
    eligible: eligibility.eligible,
    signature: eligibility.signature,
    commitHashes: [...eligibility.commitHashes]
  };
}

async function canReuseEligibilityCacheEntry(
  entry: EligibilityCacheEntry,
  getReachableProofHashes: () => Promise<Set<string>>
): Promise<boolean> {
  if (entry.signature === 'unknown') {
    return entry.eligible === false;
  }

  if (!entry.eligible || entry.commitHashes.length < 2) {
    return false;
  }

  try {
    const reachableProofHashes = await getReachableProofHashes();
    return entry.commitHashes.every((commitHash) =>
      reachableProofHashes.has(commitHash.toLowerCase())
    );
  } catch {
    return false;
  }
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

function formatIndexRefreshStatusBarText(result: IndexRefreshResult): string {
  switch (result.state) {
    case 'cold-scan':
      return `$(database) VI History: ${result.counts.eligible}/${result.counts.tracked} eligible`;
    case 'warm-restart':
      return `$(check) VI History: ${result.counts.reused} reused`;
    case 'branch-switch':
      return '$(git-branch) VI History: HEAD refreshed';
    case 'cancelled':
      return '$(circle-slash) VI History indexing cancelled';
    case 'trust-disabled':
      return '$(lock) VI History indexing disabled';
    case 'failed':
      return '$(warning) VI History indexing failed';
    default:
      return '$(info) VI History indexing status';
  }
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

/**
 * Builds a user-visible indexing diagnostic summary from an IndexRefreshResult (VHS-REQ-606).
 * The summary explains refresh state, work accounting, refresh reason, and the boundary
 * between indexing behavior and comparison-runtime validation.
 */
export function buildIndexingDiagnosticSummary(
  result: IndexRefreshResult | undefined
): string[] {
  if (!result) {
    return ['Indexing status: No refresh has been performed.'];
  }

  const lines: string[] = [];

  // State description
  const stateLabel = formatIndexRefreshState(result.state);
  lines.push(`Indexing status: ${stateLabel}.`);

  // Refresh reason
  const reasonLabel = formatIndexRefreshReason(result.refreshReason);
  lines.push(`Refresh reason: ${reasonLabel}.`);

  // Work counts
  const { counts } = result;
  lines.push(
    `Work counts: tracked=${counts.tracked}, reused=${counts.reused}, evaluated=${counts.evaluated}, eligible=${counts.eligible}, removed=${counts.removed}, skipped=${counts.skipped}, failed=${counts.failed}.`
  );

  // Repository roots
  if (result.indexedRepositoryRoots.length > 0) {
    lines.push(
      `Indexed repositories: ${result.indexedRepositoryRoots.length} (${result.indexedRepositoryRoots.slice(0, 3).map((root) => path.basename(root)).join(', ')}${result.indexedRepositoryRoots.length > 3 ? ', ...' : ''}).`
    );
  } else {
    lines.push('Indexed repositories: none.');
  }

  // Snapshot preservation
  if (result.snapshotPreserved) {
    lines.push('Previous eligibility snapshot preserved.');
  }

  // Runtime-separation boundary statement (VHS-REQ-606)
  lines.push(
    'Note: LabVIEWCLI or comparison-runtime validation failures are comparison/runtime setup evidence, not indexing-cache causes. Runtime discovery diagnostics (VHS-REQ-155) are separate from indexing diagnostics.'
  );

  return lines;
}

/**
 * Formats the IndexRefreshState as a user-visible label.
 */
function formatIndexRefreshState(state: IndexRefreshState): string {
  switch (state) {
    case 'cold-scan':
      return 'Cold scan (no prior eligibility data; all files evaluated from scratch)';
    case 'warm-restart':
      return 'Warm restart (prior eligibility data exists; file-level cache reuse possible)';
    case 'branch-switch':
      return 'Branch switch (HEAD changed since last refresh; changed or unproven files re-evaluated)';
    case 'cancelled':
      return 'Cancelled (user cancelled refresh; previous snapshot preserved)';
    case 'trust-disabled':
      return 'Trust disabled (workspace is not trusted; eligibility cleared)';
    case 'failed':
      return 'Failed (refresh failed with no repositories successfully indexed; previous snapshot preserved when exists)';
    default:
      return state;
  }
}

/**
 * Formats the IndexRefreshReason as a user-visible label.
 */
function formatIndexRefreshReason(reason: IndexRefreshReason): string {
  switch (reason) {
    case 'initial-activation':
      return 'Initial extension activation';
    case 'head-change':
      return 'HEAD change detected';
    case 'workspace-folder-change':
      return 'Workspace folder change';
    case 'git-state-change':
      return 'Git repository state change';
    case 'setting-change':
      return 'Relevant setting change (strictRsrcHeader)';
    case 'user-cancellation':
      return 'User cancellation';
    case 'trust-disabled':
      return 'Workspace trust disabled';
    case 'repository-enumeration-failed':
      return 'Repository enumeration failed';
    case 'scheduled-refresh':
      return 'Scheduled refresh';
    default:
      return reason;
  }
}
