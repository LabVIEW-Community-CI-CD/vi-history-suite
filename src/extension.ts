import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { buildComparisonReportArchivePlanFromSelection } from './dashboard/comparisonReportArchive';
import { createMultiReportDashboardAction } from './dashboard/multiReportDashboardAction';
import { createBundledDocumentationAction } from './docs/bundledDocumentationAction';
import { type GitApi, getBuiltInGitApi } from './git/gitApi';
import { getFileHistoryCount } from './git/gitCli';
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
import {
  createHumanReviewSubmissionAction,
  resolveHumanReviewMachineCapability
} from './review/humanReviewSubmissionAction';
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
  decideLabviewCliOpenGate,
  decideLabviewCliOpenGateWithRegistryFallback,
  decideViServerOpenGate,
  presentLabviewCliOpenBlockedToast,
  presentViServerOpenBlockedToast
} from './ui/runtimeAvailabilityNotice';
import {
  createGitPrerequisiteWatcher,
  decideOpenGate,
  presentOpenBlockedToast
} from './ui/gitPrerequisiteNotice';
import { registerRuntimeRuntimeCommands } from './commands/runtimeCommands';
import { registerPickRuntimeProviderCommand } from './commands/pickRuntimeProviderCommand';
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
  const comparisonReportAction = createComparisonReportAction(context, {
    exportRegistry: comparisonReportExportRegistry
  });
  const ensureComparisonReportEvidenceAction =
    createEnsureComparisonReportEvidenceAction(context);
  const openRetainedComparisonReportAction = createOpenRetainedComparisonReportAction(context, {
    exportRegistry: comparisonReportExportRegistry
  });
  const reviewDecisionRecordAction = createReviewDecisionRecordAction(context);
  const humanReviewMachineCapability = resolveHumanReviewMachineCapability();
  const humanReviewSubmissionAction = humanReviewMachineCapability.isCanonicalHostMachine
    ? createHumanReviewSubmissionAction(context)
    : undefined;
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
  // VHS-REQ-620: Register the runtime provider quick-pick. The status bar
  // item created by the watcher targets this command, so a click flips the
  // persisted runtime selection just like a `vihs --provider …` invocation.
  registerPickRuntimeProviderCommand(context, runtimeAvailabilityWatcher);

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
    vscode.workspace.onDidChangeConfiguration(clearSelectedEligibilityCache),
    vscode.workspace.onDidChangeWorkspaceFolders(clearSelectedEligibilityCache),
    vscode.workspace.onDidGrantWorkspaceTrust(clearSelectedEligibilityCache)
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
          bundledDocumentationAction,
          humanReviewSubmissionAction
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
