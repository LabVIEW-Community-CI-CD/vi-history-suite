import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi, GitRepository } from '../git/gitApi';
import { getRepoHead, listTrackedFiles, normalizeRelativeGitPath } from '../git/gitCli';
import { evaluateViEligibilityForFsPath } from '../services/viHistoryModel';

type EligibilityMap = Record<string, true>;

export class ViEligibilityIndexer implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly eligibilityCache = new Map<string, boolean>();
  private refreshHandle: NodeJS.Timeout | undefined;
  private eligiblePaths: EligibilityMap = {};

  constructor(private readonly gitApi: GitApi | undefined) {}

  async start(): Promise<void> {
    this.registerListeners();
    await this.refresh();
  }

  dispose(): void {
    if (this.refreshHandle) {
      clearTimeout(this.refreshHandle);
    }

    vscode.Disposable.from(...this.disposables).dispose();
  }

  isEligible(uri: vscode.Uri): boolean {
    return contextKeysForUri(uri).some((key) => this.eligiblePaths[key] === true);
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
        void this.updateTrustContext();
        this.scheduleRefresh();
      })
    );

    if (!this.gitApi) {
      return;
    }

    this.disposables.push(
      this.gitApi.onDidOpenRepository(() => this.scheduleRefresh()),
      this.gitApi.onDidCloseRepository(() => this.scheduleRefresh())
    );

    for (const repository of this.gitApi.repositories) {
      if (repository.state?.onDidChange) {
        this.disposables.push(repository.state.onDidChange(() => this.scheduleRefresh()));
      }
    }
  }

  private async updateTrustContext(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'viHistorySuite.isWorkspaceTrusted',
      vscode.workspace.isTrusted
    );
  }

  async refresh(): Promise<void> {
    await this.updateTrustContext();

    if (!vscode.workspace.isTrusted || !this.gitApi) {
      this.eligiblePaths = {};
      await vscode.commands.executeCommand('setContext', 'viHistorySuite.eligiblePaths', {});
      return;
    }

    const gitApi = this.gitApi;
    const nextEligiblePaths: EligibilityMap = {};

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing LabVIEW VIs'
      },
      async (progress) => {
        const repositories = [...gitApi.repositories];
        let processed = 0;

        for (const repository of repositories) {
          const trackedFiles = await listTrackedFiles(repository.rootUri.fsPath);
          const head = await getRepoHead(repository.rootUri.fsPath);
          const concurrency = getConfiguredConcurrency();

          await forEachConcurrent(trackedFiles, concurrency, async (relativePath) => {
            const cacheKey = buildCacheKey(repository, head, relativePath);
            const fileUri = vscode.Uri.joinPath(repository.rootUri, relativePath);

            let isEligible = this.eligibilityCache.get(cacheKey);
            if (isEligible === undefined) {
              const eligibility = await evaluateViEligibilityForFsPath(fileUri.fsPath, {
                repoRoot: repository.rootUri.fsPath,
                strictRsrcHeader: getStrictHeaderSetting()
              });
              isEligible = eligibility.eligible;
              this.eligibilityCache.set(cacheKey, isEligible);
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
      'viHistorySuite.eligiblePaths',
      nextEligiblePaths
    );
  }
}

function buildCacheKey(repository: GitRepository, head: string, relativePath: string): string {
  return [repository.rootUri.fsPath, normalizeRelativeGitPath(relativePath), head].join('::');
}

function contextKeysForUri(uri: vscode.Uri): string[] {
  const keys = new Set<string>();
  if (uri.fsPath) {
    keys.add(uri.fsPath);
  }
  keys.add(uri.path);
  return [...keys];
}

function getStrictHeaderSetting(): boolean {
  return vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<boolean>('strictRsrcHeader', false);
}

function getConfiguredConcurrency(): number {
  return vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<number>('maxIndexedConcurrency', 6);
}

async function forEachConcurrent<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  const queue = [...values];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }

      await worker(next);
    }
  });

  await Promise.all(workers);
}
