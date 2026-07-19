import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { createCopyReviewPacketCommand, createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { buildComparisonReportArchivePlanFromSelection } from './dashboard/comparisonReportArchive';
import { createMultiReportDashboardAction } from './dashboard/multiReportDashboardAction';
import { createBundledDocumentationAction } from './docs/bundledDocumentationAction';
import { type GitApi, getBuiltInGitApi } from './git/gitApi';
import {
  getFileHistoryCount,
  isWorktreeRevision,
  runGit,
  WORKTREE_REVISION_SENTINEL
} from './git/gitCli';
import {
  registerViSemanticMcpServerProvider,
  resolveViSemanticMcpLaunch
} from './mcp/viSemanticMcpServerProvider';
import {
  installPinnedDevTools,
  reportDevToolsStatus,
  runDevToolsUpdateCheck,
  uninstallDevTools,
  type DevToolsNotifier
} from './tooling/devToolsRuntime';
import {
  computeViSemanticNarrativeCacheKey,
  createFileViSemanticNarrativeCache,
  recordViSemanticNarrativeFromReport
} from './semantic/viSemanticNarrativeCache';
import { registerViSemanticDecorationProvider } from './ui/viSemanticDecorationProvider';
import {
  createComparisonReportAction,
  createEnsureComparisonReportEvidenceAction,
  readComparisonRuntimeSettings,
  createOpenRetainedComparisonReportAction
} from './reporting/comparisonReportAction';
import {
  ComparisonReportExportRegistry,
  runComparisonReportExport
} from './reporting/comparisonReportExport';
import { probeWindowsRegistryHostLabviewAvailable } from './reporting/comparisonRuntimeLocator';
import { createReviewDecisionRecordAction } from './scenarios/reviewDecisionRecordAction';
import { ViHistoryViewModel } from './services/viHistoryModel';
import { getViHistoryServiceSettings, ViHistoryService } from './services/viHistoryService';
import {
  DashboardArtifactActionSummary,
  OpenedDocumentationPanelSummary,
  DashboardPanelMessage,
  HistoryPanelActionSummary,
  HistoryPanelMessage,
  HistoryPanelTracker,
  OpenedDashboardPanelSummary,
  OpenedHistoryPanelSummary
} from './ui/historyPanelTracker';
import {
  admitLocalRuntimeSettingsCliToTerminalPath,
  type MaterializedLocalRuntimeSettingsCli,
  resolveDefaultVsCodeSettingsPath,
  resolveLocalRuntimeSettingsCliContract,
  runLocalRuntimeSettingsCli
} from './tooling/localRuntimeSettingsCli';
import { detectAvailableRuntimes } from './tooling/runtimeAutoDetect';
import { applyRuntimeSettingsSeed } from './tooling/runtimeSettingsSeed';
import {
  createRuntimeAvailabilityWatcher,
  decideBitnessOpenGate,
  decideLabviewCliOpenGate,
  decideLabviewCliOpenGateWithRegistryFallback,
  decideVersionOpenGate,
  decideViServerOpenGate,
  presentBitnessOpenBlockedToast,
  presentLabviewCliOpenBlockedToast,
  presentVersionOpenBlockedToast,
  presentViServerOpenBlockedToast
} from './ui/runtimeAvailabilityNotice';
import {
  createGitPrerequisiteWatcher,
  decideOpenGate,
  presentOpenBlockedToast
} from './ui/gitPrerequisiteNotice';
import { registerRuntimeRuntimeCommands } from './commands/runtimeCommands';
import { registerOpenRuntimeReportPanelCommand } from './commands/openRuntimeReportPanelCommand';
import { registerPickContainerImageVersionCommand } from './commands/pickContainerImageVersionCommand';
import { registerViPreviewCustomEditor } from './ui/viPreviewEditor';
import { createViPreviewCacheWarmerService } from './ui/viPreviewCacheWarmerService';
import { createViChangeWarmerService } from './ui/viChangeWarmerService';
import { createViPreviewSessionManager } from './ui/viPreviewSessionManager';
import { createViPreviewCache, getViPreviewOperationDirectory, isViPreviewEnabled, resolvePreviewRuntime } from './ui/viPreviewRenderHost';
import { toViPreviewSessionRuntime } from './reporting/viPreview/viPreviewSessionRuntime';
import {
  isViChangeWarmPlanEmpty,
  resolveViChangeWarmPlan,
  warmChangedVi
} from './reporting/viPreview/viChangeWarmScheduler';
import { buildRuntimeSettingsLiveSessionProbeSummary } from './tooling/runtimeSettingsLiveSessionProbe';
import { persistRuntimeSettingsLiveSessionProbePacket } from './tooling/runtimeSettingsLiveSessionProbePacket';
import {
  deriveRuntimeSettingsLiveSessionMutationRequest,
  runWithRuntimeSettingsSafeRestore
} from './tooling/runtimeSettingsLiveSessionSafeRestore';

export interface ViHistorySuiteApi {
  refreshEligibility(): Promise<void>;
  isEligible(uri: vscode.Uri): boolean;
  loadHistory(uri: vscode.Uri): Promise<ViHistoryViewModel>;
  getLocalRuntimeSettingsTerminalEntrypoint():
    | MaterializedLocalRuntimeSettingsCli
    | undefined;
  getEligibilityDebugSnapshot(): EligibilityDebugSnapshot;
  getLastOpenedPanel(): OpenedHistoryPanelSummary | undefined;
  getOpenHistoryPanelCount(): number;
  dispatchLastPanelMessage(message: HistoryPanelMessage): Promise<void>;
  getLastPanelActionSummary(): HistoryPanelActionSummary | undefined;
  getPanelActionCount(): number;
  getLastOpenedDashboardPanel(): OpenedDashboardPanelSummary | undefined;
  getOpenDashboardPanelCount(): number;
  dispatchLastDashboardPanelMessage(message: DashboardPanelMessage): Promise<void>;
  getLastDashboardArtifactActionSummary(): DashboardArtifactActionSummary | undefined;
  getDashboardArtifactActionCount(): number;
  getLastOpenedDocumentationPanel(): OpenedDocumentationPanelSummary | undefined;
  getOpenDocumentationPanelCount(): number;
  clearHistoryPanelTracking(): void;
}

interface WorkspaceRuntime {
  gitApi: GitApi | undefined;
  historyService: ViHistoryService;
  openViHistory: ReturnType<typeof createOpenViHistoryCommand>;
}

interface EligibilityDebugSnapshot {
  eligiblePathCount: number;
  eligiblePathsSample: string[];
}

const EMPTY_ELIGIBILITY_DEBUG_SNAPSHOT: EligibilityDebugSnapshot = {
  eligiblePathCount: 0,
  eligiblePathsSample: []
};

function buildUntrustedWorkspaceHistoryModel(
  uri: Pick<vscode.Uri, 'fsPath' | 'path'>
): ViHistoryViewModel {
  return {
    repositoryName: '',
    repositoryRoot: '',
    relativePath: uri.fsPath || uri.path || '',
    signature: 'unknown',
    eligible: false,
    commits: []
  };
}

function rememberSelectedEligibility(
  uri: vscode.Uri,
  model: Pick<ViHistoryViewModel, 'eligible'>,
  selectedEligiblePaths: Record<string, true>
): void {
  for (const key of selectedEligibilityContextKeysForUri(uri)) {
    delete selectedEligiblePaths[key];
    if (model.eligible) {
      selectedEligiblePaths[key] = true;
    }
  }
}

function buildSelectedEligibilityDebugSnapshot(
  selectedEligiblePaths: Record<string, true>
): EligibilityDebugSnapshot {
  const eligiblePaths = Object.keys(selectedEligiblePaths).sort();
  return {
    ...EMPTY_ELIGIBILITY_DEBUG_SNAPSHOT,
    eligiblePathCount: eligiblePaths.length,
    eligiblePathsSample: eligiblePaths.slice(0, 12)
  };
}

function selectedEligibilityContextKeysForUri(
  uri: Pick<vscode.Uri, 'fsPath' | 'path'>
): string[] {
  const keys = new Set<string>();
  addSelectedEligibilityPathVariants(keys, uri.fsPath);
  addSelectedEligibilityPathVariants(keys, uri.path);
  return [...keys];
}

function addSelectedEligibilityPathVariants(
  keys: Set<string>,
  value: string | undefined
): void {
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

export async function activate(
  context: vscode.ExtensionContext
): Promise<ViHistorySuiteApi> {
  const panelTracker = new HistoryPanelTracker();
  const comparisonReportExportRegistry = new ComparisonReportExportRegistry();
  const baseComparisonReportAction = createComparisonReportAction(context, {
    exportRegistry: comparisonReportExportRegistry
  });
  const ensureComparisonReportEvidenceAction =
    createEnsureComparisonReportEvidenceAction(context);
  const openRetainedComparisonReportAction = createOpenRetainedComparisonReportAction(context, {
    exportRegistry: comparisonReportExportRegistry
  });

  // VHS-REQ-660: Source Control semantic change hover. A file-decoration
  // provider surfaces the cached semantic "what changed" narrative for a changed
  // VI as a badge plus hover tooltip across the Source Control, Explorer, and
  // editor-tab surfaces. The cache is populated after a working-tree comparison
  // completes (below), reusing the produced report HTML; the decoration path
  // never runs LabVIEW and is workspace-trust gated, so an untrusted workspace
  // (which never produces a comparison) simply shows no decorations.
  const semanticNarrativeCacheRoot = (context.storageUri ?? context.globalStorageUri)?.fsPath;
  const resolveGitToplevel = async (fsPath: string): Promise<string | undefined> => {
    try {
      const output = await runGit(['rev-parse', '--show-toplevel'], path.dirname(fsPath));
      const root = String(output).trim();
      return root.length > 0 ? root : undefined;
    } catch {
      return undefined;
    }
  };
  const resolveViContentBlobId = async (
    repositoryRoot: string,
    ref: string,
    relativePath: string
  ): Promise<string | undefined> => {
    try {
      const output = await runGit(
        isWorktreeRevision(ref)
          ? ['hash-object', '--', relativePath]
          : ['rev-parse', `${ref}:${relativePath}`],
        repositoryRoot
      );
      const blobId = String(output).trim();
      return blobId.length > 0 ? blobId : undefined;
    } catch {
      return undefined;
    }
  };
  const semanticNarrativeCache = semanticNarrativeCacheRoot
    ? createFileViSemanticNarrativeCache(
        {
          cacheDirectory: path.join(semanticNarrativeCacheRoot, 'semantic-narrative-cache'),
          joinPath: path.join
        },
        {
          ensureDirectory: async (directory) => {
            await fs.mkdir(directory, { recursive: true });
          },
          readFile: (filePath) => fs.readFile(filePath, 'utf8'),
          writeFile: (filePath, data) => fs.writeFile(filePath, data, 'utf8')
        }
      )
    : undefined;
  const semanticDecorationProvider =
    semanticNarrativeCache && vscode.workspace.isTrusted
      ? registerViSemanticDecorationProvider(context, {
          isTrusted: () => vscode.workspace.isTrusted,
          cache: semanticNarrativeCache,
          resolveRepositoryRoot: resolveGitToplevel,
          resolveBlobId: resolveViContentBlobId
        })
      : undefined;
  const comparisonReportAction: typeof baseComparisonReportAction = async (request) => {
    const result = await baseComparisonReportAction(request);
    if (
      semanticDecorationProvider &&
      semanticNarrativeCache &&
      typeof result.reportFilePath === 'string' &&
      typeof request.baseHash === 'string' &&
      isWorktreeRevision(request.selectedHash)
    ) {
      const reportFilePath = result.reportFilePath;
      const baseHash = request.baseHash;
      const repositoryRoot = request.model.repositoryRoot;
      const relativePath = request.model.relativePath;
      void (async () => {
        try {
          const [reportHtml, baseSignature, selectedSignature] = await Promise.all([
            fs.readFile(reportFilePath, 'utf8'),
            resolveViContentBlobId(repositoryRoot, baseHash, relativePath),
            resolveViContentBlobId(repositoryRoot, WORKTREE_REVISION_SENTINEL, relativePath)
          ]);
          if (!baseSignature || !selectedSignature) {
            return;
          }
          const stored = await recordViSemanticNarrativeFromReport(
            {
              relativePath,
              reportHtml,
              reportFilePath,
              signatures: { baseSignature, selectedSignature }
            },
            semanticNarrativeCache
          );
          if (stored) {
            semanticDecorationProvider.refresh(
              vscode.Uri.file(path.join(repositoryRoot, relativePath))
            );
          }
        } catch {
          // Best-effort narrative caching; never affects the comparison result.
        }
      })();
    }
    return result;
  };

  const reviewDecisionRecordAction = createReviewDecisionRecordAction(context);
  const bundledDocumentationAction = createBundledDocumentationAction(context, panelTracker);
  const multiReportDashboardAction = createMultiReportDashboardAction(
    context,
    {
      ensureComparisonReportEvidence: ensureComparisonReportEvidenceAction,
      getHistoryServiceSettings: getViHistoryServiceSettings,
      getRuntimeSettings: readComparisonRuntimeSettings,
      getFileHistoryCount
    },
    panelTracker
  );
  const hasRetainedComparisonReport = async (request: {
    model: ViHistoryViewModel;
    selectedHash: string;
    baseHash: string;
  }): Promise<boolean> => {
    if (!context.storageUri) {
      return false;
    }

    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      reportType: 'diff',
      selectedHash: request.selectedHash,
      baseHash: request.baseHash
    });

    try {
      await fs.access(archivePlan.sourceRecordFilePath);
      return true;
    } catch {
      return false;
    }
  };
  let admittedLocalRuntimeSettingsCli: MaterializedLocalRuntimeSettingsCli | undefined;
  let workspaceRuntime: WorkspaceRuntime | undefined;
  let workspaceRuntimePromise: Promise<WorkspaceRuntime> | undefined;

  // VHS-REQ-612: Idempotently materialize the local runtime settings CLI on every
  // activation so terminal users never need to manually run the prepare command
  // after install or upgrade. The explicit prepare command remains as a manual
  // refresh path. Failures are logged but never block extension activation.
  if (context.globalStorageUri) {
    try {
      admittedLocalRuntimeSettingsCli = await admitLocalRuntimeSettingsCliToTerminalPath(
        context.globalStorageUri.fsPath,
        context.extensionPath,
        context.environmentVariableCollection
      );
    } catch (error) {
      console.error(
        '[vi-history-suite] Failed to auto-materialize local runtime settings CLI during activation.',
        error
      );
    }
  }

  // VHS-REQ-616: Seed or repair runtime selection in the user settings.json so
  // that fresh installs and upgrades arrive with a working comparison provider
  // already chosen, and stale persisted values are corrected automatically.
  // Detection is filesystem-only so activation cost stays bounded; the heavier
  // `comparisonRuntimeLocator` continues to gate report execution.
  try {
    const detection = await detectAvailableRuntimes();
    const settingsFilePath = resolveDefaultVsCodeSettingsPath();
    await applyRuntimeSettingsSeed(detection, settingsFilePath);
  } catch (error) {
    console.error(
      '[vi-history-suite] Failed to seed or repair runtime selection in user settings.',
      error
    );
  }

  // VHS-REQ-617: Surface runtime availability in the status bar plus a
  // first-run notification when no comparison runtime is detected. The watcher
  // re-detects on window focus events with a 5 second throttle.
  const runtimeAvailabilityWatcher = createRuntimeAvailabilityWatcher(context);
  context.subscriptions.push(runtimeAvailabilityWatcher);
  registerRuntimeRuntimeCommands(context, runtimeAvailabilityWatcher);
  // VHS-REQ-620 / VHS-REQ-645: Register the Runtime & Report Settings panel
  // under the historical runtime-provider command id. The status bar item
  // created by the watcher (and the bitness/version open-gate toasts) target
  // this command, so a click now opens the panel where the user selects the
  // runtime provider, the container image version, and the report difference
  // filters — replacing the former quick-pick chain.
  registerOpenRuntimeReportPanelCommand(context, runtimeAvailabilityWatcher);

  // VHS-REQ-649: Pick LabVIEW Container Image Version command. Discovers the
  // container image versions published on Docker Hub and already pulled locally
  // and persists the chosen tag to viHistorySuite.container.imageVersion.
  registerPickContainerImageVersionCommand(context);

  // VHS-REQ-659: single-VI interactive preview. Opening a LabVIEW source file
  // (.vi/.vit/.vim/.ctl) renders it to a self-contained HTML document via NI's
  // PrintToSingleFileHtml operation through the configured comparison runtime
  // (Host or Docker) and shows it in a read-only custom editor. Under the Docker
  // runtime, the editor and a silent background warmer share one warm LabVIEW
  // container session so opens are fast once warm; the first successful preview
  // starts the warmer, which caches the remaining workspace VIs with a status-
  // bar progress percentage.
  const viPreviewSessionManager = createViPreviewSessionManager({
    operationDirectory: getViPreviewOperationDirectory(context),
    cache: createViPreviewCache(context)
  });
  context.subscriptions.push({
    dispose: () => {
      void viPreviewSessionManager.dispose();
    }
  });
  const viPreviewCacheWarmer = createViPreviewCacheWarmerService(context, viPreviewSessionManager);
  context.subscriptions.push(viPreviewCacheWarmer);
  registerViPreviewCustomEditor(context, {
    sessionManager: viPreviewSessionManager,
    onPreviewOpened: (viFsPath) => viPreviewCacheWarmer.notePreviewOpened(viFsPath),
    // Test-only: when the integration test sets VIHS_TEST_CAPTURE_PREVIEW=1 (and
    // VIHS_TEST_PREVIEW_OUT), persist the exact rendered custom-editor webview
    // HTML so an automated test can assert the live content. The env is checked
    // at render time (not activation) so a test can toggle it in-process before
    // opening a VI. Never active in production (env unset). (VHS-REQ-659.)
    onPreviewRendered: (viFsPath, html, mode) => {
      if (process.env.VIHS_TEST_CAPTURE_PREVIEW !== '1') {
        return;
      }
      const outPath = process.env.VIHS_TEST_PREVIEW_OUT;
      if (!outPath) {
        return;
      }
      void fs.writeFile(outPath, `${mode}\n${html}`, 'utf8').catch(() => {
        /* test-only capture; ignore write failures */
      });
    }
  });

  // VHS-REQ-659: VI Preview is Docker-only + opt-in. Enabling it (via the
  // Runtime & Report Settings panel or a settings edit) immediately kicks off
  // background caching of the whole repo through the warm Docker session;
  // disabling it, or switching off the Docker runtime, cancels in-progress
  // caching. Reconcile on the settings that determine "enabled + Docker".
  const reconcilePreviewWarming = async (): Promise<void> => {
    // Gate on workspace trust: background warming schedules whole-workspace
    // preview rendering, which launches LabVIEW/Docker as external tooling. The
    // interactive custom editor refuses to render in untrusted workspaces for
    // the same reason, so warming must never run external tooling against
    // untrusted files before the user trusts the folder. Reconcile again on
    // trust grant (see onDidGrantWorkspaceTrust below).
    if (!vscode.workspace.isTrusted) {
      viPreviewCacheWarmer.cancelWarming();
      return;
    }
    if (!isViPreviewEnabled()) {
      viPreviewCacheWarmer.cancelWarming();
      return;
    }
    try {
      const runtime = await resolvePreviewRuntime();
      const isDocker = runtime.outcome === 'ready' && runtime.runtime.provider !== 'host-native';
      if (isDocker) {
        viPreviewCacheWarmer.startWarming();
      } else {
        viPreviewCacheWarmer.cancelWarming();
      }
    } catch {
      // Runtime resolution failure must not disrupt activation; leave warming as-is.
    }
  };
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('viHistorySuite.preview.enabled') ||
        event.affectsConfiguration('viHistorySuite.runtimeProvider')
      ) {
        void reconcilePreviewWarming();
      }
    })
  );
  // Reconcile once at activation so, when VI Preview is already enabled on the
  // Docker runtime, the whole-workspace cache warms immediately after the
  // extension loads — without waiting for a settings change or a first manual
  // open. This makes a preview ready as soon as the user selects a VI. (#659)
  void reconcilePreviewWarming();

  // VHS-REQ-619: Detect Git on PATH once per activation, surface a status
  // bar warning plus a one-time first-run information notice when Git is
  // missing, and gate `labviewViHistory.open` with a toast that points at
  // the install link. Comparison flows depend on `git log`/`git show`, so
  // refusing to start without Git fails fast and clearly.
  const gitPrerequisiteWatcher = createGitPrerequisiteWatcher(context);
  context.subscriptions.push(gitPrerequisiteWatcher);
  let selectedEligiblePaths: Record<string, true> = {};

  // VHS-REQ-635 (#366): the selected-file eligibility cache is a best-effort
  // hint that is re-evaluated authoritatively on every `loadHistory`/open.
  // Clear it on configuration changes, workspace-folder changes, and when
  // workspace trust is granted, so a cached `true` can never outlive the
  // conditions under which it was computed. VS Code exposes only
  // `onDidGrantWorkspaceTrust` (untrusted -> trusted); trust revocation requires
  // a window reload that restarts the extension host and resets this cache, and
  // `isEligible` additionally fails closed while the workspace is untrusted, so
  // the grant-only subscription covers the trust lifecycle. Clearing (rather
  // than recomputing) keeps activation cheap and avoids any repository-wide
  // scan; the next open re-evaluates the file. Resetting to a fresh object
  // (rather than deleting keys) avoids the V8 dictionary-mode de-opt; all
  // readers reference the variable, not the object identity.
  const clearSelectedEligibilityCache = (): void => {
    selectedEligiblePaths = {};
  };
  context.subscriptions.push(
    // VHS-REQ-635 (#366): mirror the runtime watcher and invalidate only on
    // `viHistorySuite` configuration changes (e.g. `strictRsrcHeader`, which
    // affects signature eligibility). Unrelated configuration churn — other
    // extensions, themes, or VS Code's own startup events — must not wipe a
    // freshly populated cache, otherwise `isEligible` becomes racy right after
    // a `loadHistory`.
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('viHistorySuite')) {
        clearSelectedEligibilityCache();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(clearSelectedEligibilityCache),
    vscode.workspace.onDidGrantWorkspaceTrust(clearSelectedEligibilityCache),
    // Once the workspace becomes trusted, reconcile preview warming so a
    // grant unblocks background caching that was suppressed while untrusted.
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      void reconcilePreviewWarming();
    })
  );

  const ensureWorkspaceRuntime = async (): Promise<WorkspaceRuntime> => {
    if (workspaceRuntime) {
      return workspaceRuntime;
    }

    if (!workspaceRuntimePromise) {
      workspaceRuntimePromise = (async () => {
        const gitApi = await getBuiltInGitApi();
        const historyService = new ViHistoryService(gitApi);
        const openViHistory = createOpenViHistoryCommand(
          historyService,
          gitApi,
          panelTracker,
          comparisonReportAction,
          multiReportDashboardAction,
          openRetainedComparisonReportAction,
          hasRetainedComparisonReport,
          reviewDecisionRecordAction,
          bundledDocumentationAction
        );

        workspaceRuntime = {
          gitApi,
          historyService,
          openViHistory
        };
        return workspaceRuntime;
      })().catch((error) => {
        workspaceRuntimePromise = undefined;
        throw error;
      });
    }

    return workspaceRuntimePromise;
  };

  // VHS-REQ-664: warm the preview render cache and the semantic comparison
  // narrative cache for a VI as soon as it changes on disk, so a reviewer finds
  // the preview and the Source Control "what changed" hover ready. Docker-only
  // and opt-in: the preview warm needs `preview.enabled`, the comparison warm
  // needs workspace trust (it launches LabVIEW), and the whole feature is gated
  // on `viHistorySuite.preview.warmOnChange` (default true). The warmer service
  // debounces and serializes changes so a burst of LabVIEW saves never starts
  // overlapping background runs.
  const resolveIsDockerPreviewRuntime = async (): Promise<boolean> => {
    try {
      const runtime = await resolvePreviewRuntime();
      return runtime.outcome === 'ready' && runtime.runtime.provider !== 'host-native';
    } catch {
      return false;
    }
  };
  const warmChangedViPreview = async (viFsPath: string): Promise<void> => {
    const runtime = await resolvePreviewRuntime();
    if (runtime.outcome !== 'ready') {
      return;
    }
    const sessionRuntime = toViPreviewSessionRuntime(runtime.runtime, process.platform);
    if (!sessionRuntime) {
      return;
    }
    await viPreviewSessionManager.renderVi(sessionRuntime, viFsPath, 'warm');
  };
  const warmChangedViComparison = async (viFsPath: string): Promise<void> => {
    if (!semanticNarrativeCache) {
      return;
    }
    const repositoryRoot = await resolveGitToplevel(viFsPath);
    if (!repositoryRoot) {
      return;
    }
    const relativePath = path.relative(repositoryRoot, viFsPath).replace(/\\/g, '/');
    const [baseSignature, selectedSignature] = await Promise.all([
      resolveViContentBlobId(repositoryRoot, 'HEAD', relativePath),
      resolveViContentBlobId(repositoryRoot, WORKTREE_REVISION_SENTINEL, relativePath)
    ]);
    // Only compare a VI that actually differs from HEAD, and skip when the hover
    // cache already holds this exact change (avoids a redundant LabVIEW run).
    if (!baseSignature || !selectedSignature || baseSignature === selectedSignature) {
      return;
    }
    const existing = await semanticNarrativeCache.get(
      computeViSemanticNarrativeCacheKey(relativePath, baseSignature, selectedSignature)
    );
    if (existing) {
      return;
    }
    const { historyService } = await ensureWorkspaceRuntime();
    const model = await historyService.load(vscode.Uri.file(viFsPath));
    const headCommit = model.commits[0];
    if (!headCommit) {
      return;
    }
    await comparisonReportAction({
      model,
      selectedHash: WORKTREE_REVISION_SENTINEL,
      baseHash: headCommit.hash
    });
  };
  const viChangeWarmer = createViChangeWarmerService(context, {
    onSettledChange: async (viFsPath) => {
      const plan = resolveViChangeWarmPlan({
        warmOnChangeEnabled: vscode.workspace
          .getConfiguration('viHistorySuite')
          .get<boolean>('preview.warmOnChange', true),
        isDocker: await resolveIsDockerPreviewRuntime(),
        previewEnabled: isViPreviewEnabled(),
        isTrusted: vscode.workspace.isTrusted
      });
      if (isViChangeWarmPlanEmpty(plan)) {
        return;
      }
      await warmChangedVi(viFsPath, plan, {
        warmPreview: warmChangedViPreview,
        warmComparison: warmChangedViComparison
      });
    }
  });
  context.subscriptions.push(viChangeWarmer);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.open',
      async (uri?: vscode.Uri) => {
        const detection = gitPrerequisiteWatcher.getDetection();
        if (detection) {
          const decision = decideOpenGate(detection);
          if (decision.kind === 'block') {
            await presentOpenBlockedToast();
            return;
          }
        }
        // VHS-REQ-627: After the Git prerequisite gate, refuse to open the VI
        // History panel when the LabVIEW CLI is not installed so users get an
        // explicit, actionable toast instead of a panel whose Compare action
        // would fail later. Detection is sourced from the cached runtime probe;
        // a not-yet-available probe or a satisfiable Docker runtime allows the
        // command so activation races and container users are never blocked.
        // VHS-REQ-633: an explicit viHistorySuite.labviewCliPath override also
        // allows the command (restricted in untrusted workspaces, so a malicious
        // workspace cannot supply it).
        const baseLabviewCliGate = decideLabviewCliOpenGate(
          runtimeAvailabilityWatcher.getLastDetection(),
          runtimeAvailabilityWatcher.getLastSnapshot(),
          vscode.workspace
            .getConfiguration('viHistorySuite')
            .get<string>('labviewCliPath')
        );
        // VHS-REQ-634: before blocking, consult a bounded authoritative probe so
        // a Windows registry-resolved / custom-path LabVIEW the filesystem-only
        // activation detector cannot see does not false-block the panel. The
        // probe runs only on the block branch, only on Windows.
        const labviewCliGate = await decideLabviewCliOpenGateWithRegistryFallback(
          baseLabviewCliGate,
          { probeRegistryHostLabview: () => probeWindowsRegistryHostLabviewAvailable() }
        );
        if (labviewCliGate.kind === 'block') {
          await presentLabviewCliOpenBlockedToast(labviewCliGate);
          return;
        }
        // VHS-REQ-631: After the LabVIEW CLI gate, refuse to open the VI History
        // panel when the selected LabVIEW does not explicitly enable VI Server
        // (TCP/IP) in its LabVIEW.ini (Windows) / labview.conf (Linux). An absent
        // server.tcp.enabled key is treated as not enabled, so users learn to
        // turn VI Server on before meeting a -350000 connection failure at
        // compare time. Reaches at most one bounded config read here because the
        // Docker / no-CLI cases already short-circuited above.
        const viServerGate = await decideViServerOpenGate(
          runtimeAvailabilityWatcher.getLastDetection(),
          runtimeAvailabilityWatcher.getLastSnapshot()
        );
        if (viServerGate.kind === 'block') {
          await presentViServerOpenBlockedToast(viServerGate);
          return;
        }
        // VHS-REQ-636: After the VI Server gate, refuse to open the VI History
        // panel when a LabVIEW process is already running at a bitness that
        // differs from the selected viHistorySuite.labviewBitness. LabVIEW
        // cannot start a second instance at a different bitness, so a plain
        // toast (offering Pick Runtime Provider) is shown before the panel
        // instead of the verbose compare-time windows-host-bitness-conflict
        // report. The gate runs a single bounded, Windows-only process
        // observation and fails open on any error.
        const bitnessGate = await decideBitnessOpenGate(
          runtimeAvailabilityWatcher.getLastDetection(),
          runtimeAvailabilityWatcher.getLastSnapshot()
        );
        if (bitnessGate.kind === 'block') {
          await presentBitnessOpenBlockedToast(bitnessGate);
          return;
        }
        // VHS-REQ-637: After the bitness gate, refuse to open the VI History
        // panel when a LabVIEW process is already running at a different major
        // version (year) than the selected viHistorySuite.labviewVersion while
        // its bitness matches. LabVIEWCLI would attach to the wrong-version
        // LabVIEW already listening on VI Server, so a plain toast (offering
        // Pick Runtime Provider and a Docker-on-x64 recovery option) is shown
        // before the panel. A known differing bitness is the VHS-REQ-636 hard
        // conflict and is deferred to that gate so the two never double-fire.
        // The gate runs a single bounded, Windows-only observation and fails
        // open on any error; a matching-version session is admitted.
        const versionGate = await decideVersionOpenGate(
          runtimeAvailabilityWatcher.getLastDetection(),
          runtimeAvailabilityWatcher.getLastSnapshot()
        );
        if (versionGate.kind === 'block') {
          await presentVersionOpenBlockedToast(versionGate);
          return;
        }
        const runtime = await ensureWorkspaceRuntime();
        return runtime.openViHistory(uri);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.exportComparisonReport', async () => {
      return runComparisonReportExport(comparisonReportExportRegistry.getActiveSource(), {
        showOpenDialog: (options) => vscode.window.showOpenDialog(options),
        showInformationMessage: (message, ...items) =>
          vscode.window.showInformationMessage(message, ...items),
        showWarningMessage: (message, options, ...items) =>
          vscode.window.showWarningMessage(message, options ?? {}, ...items),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
        openExternal: (target) => vscode.env.openExternal(target),
        executeCommand: (command, ...rest) => vscode.commands.executeCommand(command, ...rest),
        uriFile: (fsPath) => vscode.Uri.file(fsPath),
        defaultDestinationDirectory: os.homedir()
      });
    })
  );

  // VHS-REQ-638: Re-open VI History for the comparison report's source VI from
  // the report title bar. After Compare, the report webview becomes the active
  // editor and clears `resourceExtname`, which hides the Explorer/editor
  // `VI History` menu entry; this action restores a direct re-entry path that
  // does not depend on the active editor resource. It delegates to
  // `labviewViHistory.open`, so all trust, Git, and LabVIEW prerequisite gates
  // continue to apply.
  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.openViHistoryFromReport', async () => {
      const sourceViFsPath = comparisonReportExportRegistry.getActiveSource()?.sourceViFsPath;
      if (!sourceViFsPath) {
        void vscode.window.showWarningMessage(
          'VI History could not resolve the source file for this comparison report. Select the LabVIEW VI in the Explorer and choose VI History.'
        );
        return { outcome: 'missing-source-vi' as const };
      }
      await vscode.commands.executeCommand(
        'labviewViHistory.open',
        vscode.Uri.file(sourceViFsPath)
      );
      return { outcome: 'reopened-vi-history' as const, sourceViFsPath };
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.copyReviewPacket',
      async (uri?: vscode.Uri) => {
        const runtime = await ensureWorkspaceRuntime();
        await createCopyReviewPacketCommand(runtime.historyService)(uri);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.openDocumentation',
      async (pageId?: string) => {
        const result = await bundledDocumentationAction({
          pageId: typeof pageId === 'string' ? pageId : undefined
        });
        if (result.outcome === 'missing-bundled-documentation') {
          void vscode.window.showWarningMessage(
            'Bundled VI History documentation is not available in this extension build.'
          );
        } else if (result.outcome === 'unknown-documentation-page') {
          void vscode.window.showInformationMessage(
            'VI History could not resolve the requested bundled documentation page.'
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.prepareLocalRuntimeSettingsCli', async () => {
      if (!context.globalStorageUri) {
        void vscode.window.showWarningMessage(
          'VI History could not prepare the local runtime settings CLI because extension-global storage is unavailable.'
        );
        return {
          outcome: 'missing-global-storage-uri' as const
        };
      }

      const materializedCli = await admitLocalRuntimeSettingsCliToTerminalPath(
        context.globalStorageUri.fsPath,
        context.extensionPath,
        context.environmentVariableCollection
      );
      admittedLocalRuntimeSettingsCli = materializedCli;
      const runtimeSettingsCliContract = resolveLocalRuntimeSettingsCliContract();

      void vscode.window.showInformationMessage(
        [
          `Prepared VI History local runtime settings CLI at ${materializedCli.rootDirectoryPath}.`,
          `Bare repo-terminal command: ${materializedCli.terminalCommandName}.`,
          `Current terminal entrypoint path: ${materializedCli.currentPlatformTerminalEntrypointPath}.`,
          `Compatibility launcher path: ${materializedCli.currentPlatformLauncherPath}.`,
          `Run next: ${materializedCli.nextCommand}.`,
          `Settings targets: default user settings.json at ${runtimeSettingsCliContract.defaultSettingsFilePath} or an explicit --settings-file path.`,
          'This prepare command is admitted in untrusted workspaces because it only materializes the launcher; installed compare remains disabled there.'
        ].join(' ')
      );

      return {
        outcome: 'prepared-local-runtime-settings-cli' as const,
        ...materializedCli,
        ...runtimeSettingsCliContract
      };
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.probeRuntimeSettingsLiveSession', async () => {
      if (!context.globalStorageUri) {
        throw new Error(
          'VI History could not retain a runtime settings live-session probe packet because extension-global storage is unavailable.'
        );
      }

      const quietStdout = {
        write(_text: string): void {
          // Intentionally suppressed: command result carries the probe summary.
        }
      };

      const validatedBaseline = await runLocalRuntimeSettingsCli(['--validate'], {
        stdout: quietStdout
      });
      if (validatedBaseline.outcome !== 'validated-settings') {
        throw new Error(
          `Runtime settings live-session probe expected validated-settings outcome, received ${validatedBaseline.outcome}.`
        );
      }

      if (!validatedBaseline.settingsFilePath) {
        throw new Error(
          'Runtime settings live-session probe expected a validated settings file path before safe-restore mutation.'
        );
      }
      const baselineSettingsFilePath = validatedBaseline.settingsFilePath;

      const mutationRequest = deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: validatedBaseline.persistedProvider,
        persistedLabviewVersion: validatedBaseline.persistedLabviewVersion,
        persistedLabviewBitness: validatedBaseline.persistedLabviewBitness
      });

      const probedMutation = await runWithRuntimeSettingsSafeRestore(
        baselineSettingsFilePath,
        async () => {
          const updated = await runLocalRuntimeSettingsCli(
            [
              '--provider',
              mutationRequest.provider,
              '--labview-version',
              mutationRequest.labviewVersion,
              '--labview-bitness',
              mutationRequest.labviewBitness,
              '--settings-file',
              baselineSettingsFilePath
            ],
            { stdout: quietStdout }
          );
          if (updated.outcome !== 'updated-settings') {
            throw new Error(
              `Runtime settings live-session probe expected updated-settings outcome, received ${updated.outcome}.`
            );
          }

          const validatedMutated = await runLocalRuntimeSettingsCli(
            ['--validate', '--settings-file', baselineSettingsFilePath],
            { stdout: quietStdout }
          );
          if (validatedMutated.outcome !== 'validated-settings') {
            throw new Error(
              `Runtime settings live-session probe expected validated-settings outcome after mutation, received ${validatedMutated.outcome}.`
            );
          }

          return {
            validatedMutated,
            liveSettingsDuringMutation: readTrimmedLiveRuntimeSettings()
          };
        }
      );

      const summary = buildRuntimeSettingsLiveSessionProbeSummary({
        settingsFilePath: baselineSettingsFilePath,
        persisted: {
          runtimeProvider: probedMutation.value.validatedMutated.persistedProvider,
          labviewVersion: probedMutation.value.validatedMutated.persistedLabviewVersion,
          labviewBitness: probedMutation.value.validatedMutated.persistedLabviewBitness
        },
        baselinePersisted: {
          runtimeProvider: validatedBaseline.persistedProvider,
          labviewVersion: validatedBaseline.persistedLabviewVersion,
          labviewBitness: validatedBaseline.persistedLabviewBitness
        },
        live: probedMutation.value.liveSettingsDuringMutation,
        mutationProviderTarget: mutationRequest.provider,
        safeRestoreApplied: true,
        safeRestoreVerified: probedMutation.safeRestoreVerified,
        runtimeValidationOutcome: probedMutation.value.validatedMutated.runtimeValidationOutcome,
        runtimeProvider: probedMutation.value.validatedMutated.runtimeProvider,
        runtimeEngine: probedMutation.value.validatedMutated.runtimeEngine,
        runtimeBlockedReason: probedMutation.value.validatedMutated.runtimeBlockedReason
      });
      const packetSummary = await persistRuntimeSettingsLiveSessionProbePacket(
        summary,
        context.globalStorageUri.fsPath
      );

      if (packetSummary.driftDetected) {
        void vscode.window.showWarningMessage(
          `Runtime settings drift is present between persisted settings.json values and the active VS Code session. Reload or restart the window before trusting Compare surfaces. Retained probe packet: ${packetSummary.packetJsonPath}.`
        );
      } else {
        void vscode.window.showInformationMessage(
          `Runtime settings live-session probe found no drift between persisted settings.json values and the active VS Code session. Retained probe packet: ${packetSummary.packetJsonPath}.`
        );
      }

      return packetSummary;
    })
  );

  // Expose the VI semantic comparison MCP server to VS Code so Copilot agent
  // mode can discover and launch its tools. Guarded for hosts predating the
  // stable MCP provider API (VS Code 1.101); a no-op on older hosts.
  registerViSemanticMcpServerProvider(context);

  // VHS-REQ-679: dev-tools install/uninstall commands and the opt-in update
  // check. The pinned dev-tools version (VHS-REQ-677) is installed on demand
  // into global storage, integrity-verified, and launched by the MCP provider;
  // these commands and the activation check make that lifecycle drivable.
  const devToolsInstallBaseDir = context.globalStorageUri
    ? path.join(context.globalStorageUri.fsPath, 'devtools')
    : undefined;
  const devToolsNotifier: DevToolsNotifier = {
    info: (message) => void vscode.window.showInformationMessage(message),
    warn: (message) => void vscode.window.showWarningMessage(message),
    error: (message) => void vscode.window.showErrorMessage(message)
  };
  const readDevToolsVersionSetting = (): string | undefined =>
    vscode.workspace.getConfiguration('viHistorySuite').get<string>('devTools.version');

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.installPinnedDevTools', async () => {
      if (devToolsInstallBaseDir === undefined) {
        void vscode.window.showErrorMessage(
          'Dev-tools cannot be installed because the extension global storage is unavailable.'
        );
        return;
      }
      await installPinnedDevTools({
        versionSetting: readDevToolsVersionSetting(),
        installBaseDir: devToolsInstallBaseDir,
        isWorkspaceTrusted: vscode.workspace.isTrusted,
        notifier: devToolsNotifier
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.uninstallDevTools', async () => {
      if (devToolsInstallBaseDir === undefined) {
        void vscode.window.showInformationMessage('No pinned dev-tools versions are installed.');
        return;
      }
      await uninstallDevTools({
        installBaseDir: devToolsInstallBaseDir,
        versionSetting: readDevToolsVersionSetting(),
        notifier: devToolsNotifier,
        pickVersion: (installedVersions) =>
          Promise.resolve(
            vscode.window.showQuickPick([...installedVersions], {
              placeHolder: 'Select an installed dev-tools version to remove'
            })
          )
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.showDevToolsStatus', async () => {
      if (devToolsInstallBaseDir === undefined) {
        void vscode.window.showInformationMessage(
          'Dev-tools status is unavailable because the extension global storage is unavailable.'
        );
        return;
      }
      await reportDevToolsStatus({
        installBaseDir: devToolsInstallBaseDir,
        versionSetting: readDevToolsVersionSetting(),
        checkForUpdates:
          vscode.workspace.getConfiguration('viHistorySuite').get<boolean>('devTools.checkForUpdates') ?? false,
        notifier: devToolsNotifier
      });
    })
  );

  // Opt-in, best-effort update check on activation (no network unless enabled,
  // a version is pinned, and the workspace is trusted).
  if (devToolsInstallBaseDir !== undefined) {
    void runDevToolsUpdateCheck({
      checkForUpdates:
        vscode.workspace.getConfiguration('viHistorySuite').get<boolean>('devTools.checkForUpdates') ?? false,
      versionSetting: readDevToolsVersionSetting(),
      isWorkspaceTrusted: vscode.workspace.isTrusted,
      notifier: devToolsNotifier
    });
  }

  // When a dev-tools version is pinned but not yet installed, the MCP server
  // launches from the bundled build (fail-closed). Surface an actionable
  // notification offering to run the install command so the pin takes effect.
  if (context.globalStorageUri) {
    const mcpLaunch = resolveViSemanticMcpLaunch({
      extensionPath: context.extensionPath,
      globalStorageDir: context.globalStorageUri.fsPath,
      isWorkspaceTrusted: vscode.workspace.isTrusted,
      devToolsVersionSetting: readDevToolsVersionSetting()
    });
    if (mcpLaunch.fallbackReason === 'pinned-install-missing') {
      void vscode.window
        .showWarningMessage(
          'A dev-tools version is pinned but not installed; the MCP server is using the bundled build. Install the pinned version to use it.',
          'Install Pinned Dev-Tools'
        )
        .then((choice) => {
          if (choice === 'Install Pinned Dev-Tools') {
            void vscode.commands.executeCommand('labviewViHistory.installPinnedDevTools');
          }
        });
    }
  }


  return {
    refreshEligibility: async () => undefined,
    // VHS-REQ-635 (#366): `isEligible` is a best-effort hint, refreshed
    // authoritatively on every `loadHistory`/open. Fail closed in untrusted
    // workspaces so a cached `true` recorded while trusted can never outlive
    // the trust boundary, independent of when invalidation events fire.
    isEligible: (uri: vscode.Uri) =>
      vscode.workspace.isTrusted &&
      selectedEligibilityContextKeysForUri(uri).some(
        (key) => selectedEligiblePaths[key] === true
      ),
    loadHistory: async (uri: vscode.Uri) => {
      // VHS-REQ-012: Honor the workspace-trust safety boundary on the exported
      // API too, so history loading never invokes Git CLI operations from an
      // untrusted workspace. Fail closed with an ineligible model instead of
      // evaluating the selected file.
      if (!vscode.workspace.isTrusted) {
        return buildUntrustedWorkspaceHistoryModel(uri);
      }
      const runtime = await ensureWorkspaceRuntime();
      const model = await runtime.historyService.load(uri);
      rememberSelectedEligibility(uri, model, selectedEligiblePaths);
      return model;
    },
    getLocalRuntimeSettingsTerminalEntrypoint: () => admittedLocalRuntimeSettingsCli,
    getEligibilityDebugSnapshot: () => buildSelectedEligibilityDebugSnapshot(selectedEligiblePaths),
    getLastOpenedPanel: () => panelTracker.getLastOpenedPanel(),
    getOpenHistoryPanelCount: () => panelTracker.getOpenCount(),
    dispatchLastPanelMessage: (message: HistoryPanelMessage) =>
      panelTracker.dispatchLastPanelMessage(message),
    getLastPanelActionSummary: () => panelTracker.getLastActionSummary(),
    getPanelActionCount: () => panelTracker.getActionCount(),
    getLastOpenedDashboardPanel: () => panelTracker.getLastOpenedDashboardPanel(),
    getOpenDashboardPanelCount: () => panelTracker.getDashboardOpenCount(),
    dispatchLastDashboardPanelMessage: (message: DashboardPanelMessage) =>
      panelTracker.dispatchLastDashboardPanelMessage(message),
    getLastDashboardArtifactActionSummary: () =>
      panelTracker.getLastDashboardArtifactActionSummary(),
    getDashboardArtifactActionCount: () => panelTracker.getDashboardArtifactActionCount(),
    getLastOpenedDocumentationPanel: () => panelTracker.getLastOpenedDocumentationPanel(),
    getOpenDocumentationPanelCount: () => panelTracker.getDocumentationOpenCount(),
    clearHistoryPanelTracking: () => panelTracker.clear()
  };
}

export function deactivate(): void {
  // Nothing to do yet.
}

function readTrimmedLiveRuntimeSettings(): {
  runtimeProvider?: string;
  labviewVersion?: string;
  labviewBitness?: string;
} {
  const configuration = vscode.workspace.getConfiguration('viHistorySuite');
  return {
    runtimeProvider: readTrimmedStringSetting(configuration, 'runtimeProvider'),
    labviewVersion: readTrimmedStringSetting(configuration, 'labviewVersion'),
    labviewBitness: readTrimmedStringSetting(configuration, 'labviewBitness')
  };
}

function readTrimmedStringSetting(
  configuration: vscode.WorkspaceConfiguration,
  key: string
): string | undefined {
  const value = configuration.get<string>(key);
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
