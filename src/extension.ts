import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

import { createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { createBenchmarkStatusAction } from './benchmark/benchmarkStatusAction';
import { buildComparisonReportArchivePlanFromSelection } from './dashboard/comparisonReportArchive';
import { createMultiReportDashboardAction } from './dashboard/multiReportDashboardAction';
import { createBundledDocumentationAction } from './docs/bundledDocumentationAction';
import { getBuiltInGitApi } from './git/gitApi';
import { getFileHistoryCount } from './git/gitCli';
import {
  EligibilityDebugSnapshot,
  ViEligibilityIndexer
} from './indexing/viEligibilityIndexer';
import {
  createComparisonReportAction,
  createEnsureComparisonReportEvidenceAction,
  readComparisonRuntimeSettings,
  createOpenRetainedComparisonReportAction
} from './reporting/comparisonReportAction';
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
  ensureLocalRuntimeSettingsCli,
  type MaterializedLocalRuntimeSettingsCli,
  resolveLocalRuntimeSettingsCliGovernanceContract,
  runLocalRuntimeSettingsCli
} from './tooling/localRuntimeSettingsCli';
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

export async function activate(
  context: vscode.ExtensionContext
): Promise<ViHistorySuiteApi> {
  const gitApi = await getBuiltInGitApi();
  const eligibilityIndexer = new ViEligibilityIndexer(gitApi);
  const historyService = new ViHistoryService(gitApi);
  const panelTracker = new HistoryPanelTracker();
  const comparisonReportAction = createComparisonReportAction(context);
  const ensureComparisonReportEvidenceAction =
    createEnsureComparisonReportEvidenceAction(context);
  const openRetainedComparisonReportAction = createOpenRetainedComparisonReportAction(context);
  const reviewDecisionRecordAction = createReviewDecisionRecordAction(context);
  const humanReviewMachineCapability = resolveHumanReviewMachineCapability();
  const humanReviewSubmissionAction = humanReviewMachineCapability.isCanonicalHostMachine
    ? createHumanReviewSubmissionAction(context)
    : undefined;
  const benchmarkStatusAction = humanReviewMachineCapability.isCanonicalHostMachine
    ? createBenchmarkStatusAction(context)
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
  if (context.globalStorageUri) {
    admittedLocalRuntimeSettingsCli = await admitLocalRuntimeSettingsCliToTerminalPath(
      context.globalStorageUri.fsPath,
      context.extensionPath,
      context.environmentVariableCollection
    );
  }

  context.subscriptions.push(eligibilityIndexer);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.open',
      createOpenViHistoryCommand(
        historyService,
        eligibilityIndexer,
        gitApi,
        panelTracker,
        comparisonReportAction,
        multiReportDashboardAction,
        openRetainedComparisonReportAction,
        hasRetainedComparisonReport,
        reviewDecisionRecordAction,
        bundledDocumentationAction,
        humanReviewSubmissionAction,
        benchmarkStatusAction
      )
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

      const materializedCli = await ensureLocalRuntimeSettingsCli(
        context.globalStorageUri.fsPath,
        context.extensionPath
      );
      const governanceContract = resolveLocalRuntimeSettingsCliGovernanceContract();

      void vscode.window.showInformationMessage(
        [
          `Prepared VI History local runtime settings CLI at ${materializedCli.rootDirectoryPath}.`,
          `Bare repo-terminal command: ${materializedCli.terminalCommandName}.`,
          `Current terminal entrypoint path: ${materializedCli.currentPlatformTerminalEntrypointPath}.`,
          `Compatibility launcher path: ${materializedCli.currentPlatformLauncherPath}.`,
          `Run next: ${materializedCli.nextCommand}.`,
          `Governed settings targets: default user settings.json at ${governanceContract.defaultSettingsFilePath} or an explicit --settings-file path.`,
          'This prepare command is admitted in untrusted workspaces because it only materializes the launcher; installed compare remains disabled there.'
        ].join(' ')
      );

      return {
        outcome: 'prepared-local-runtime-settings-cli' as const,
        ...materializedCli,
        ...governanceContract
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

  await eligibilityIndexer.start();

  return {
    refreshEligibility: async () => eligibilityIndexer.refresh(),
    isEligible: (uri: vscode.Uri) => eligibilityIndexer.isEligible(uri),
    loadHistory: (uri: vscode.Uri) => historyService.load(uri),
    getLocalRuntimeSettingsTerminalEntrypoint: () => admittedLocalRuntimeSettingsCli,
    getEligibilityDebugSnapshot: () => eligibilityIndexer.getDebugSnapshot(),
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
