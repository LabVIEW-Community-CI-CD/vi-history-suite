/**
 * VI History runtime convenience commands (VHS-REQ-617).
 *
 * Three commands extend the activation-time runtime auto-detection and
 * first-run notice surfaces:
 *
 *   - `labviewViHistory.detectRuntimeNow` — force a fresh runtime probe
 *     bypassing the watcher throttle and surface a summary toast.
 *   - `labviewViHistory.resetFirstRunNotice` — re-arm the first-run notice
 *     after a modal confirmation (useful for QA and troubleshooting).
 *   - `labviewViHistory.showRuntimeSummary` — write a multi-line detection
 *     report to a singleton output channel and copy it to the clipboard.
 *
 * Pure decision helpers are exported for unit tests; the
 * `registerRuntimeRuntimeCommands` function wires the handlers into VS Code.
 *
 * Trust posture: every command is gated behind `workspace.isTrusted` because
 * surfacing a runtime summary or re-arming notices alongside untrusted folder
 * contents could leak filesystem layout information to malicious workspace
 * configuration. Materialization of the launcher remains untrusted-allowed
 * under VHS-REQ-612 — these are different surfaces.
 */

import * as vscode from 'vscode';

import {
  detectAvailableRuntimes,
  recommendRuntimeFromDetection,
  type DetectedRuntimes,
  type RuntimeRecommendation
} from '../tooling/runtimeAutoDetect';
import { isPersistedSelectionSatisfiable } from '../tooling/runtimeSettingsSeed';
import {
  FIRST_RUN_NO_RUNTIME_NOTICE_KEY,
  type RuntimeAvailabilityWatcher
} from '../ui/runtimeAvailabilityNotice';

export const RUNTIME_OUTPUT_CHANNEL_NAME = 'VI History: Runtime';

export const UNTRUSTED_WORKSPACE_BLOCK_MESSAGE =
  'VI History runtime commands require workspace trust.';

export const RESET_FIRST_RUN_NOTICE_MODAL_DETAIL =
  'This re-arms the VI History first-run runtime notice. The notice will appear again the next time no comparison runtime is detected on activation.';

export const RESET_FIRST_RUN_NOTICE_CONFIRM_BUTTON = 'Reset Notice';
export const RESET_FIRST_RUN_NOTICE_TOAST_MESSAGE =
  'VI History first-run runtime notice reset.';

export const SHOW_RUNTIME_SUMMARY_COPY_BUTTON = 'Copy';

export function buildRuntimeSummaryLine(
  recommendation: RuntimeRecommendation
): string {
  switch (recommendation.provider) {
    case 'host':
      return `Detected LabVIEW host ${recommendation.labviewVersion} ${recommendation.labviewBitness}.`;
    case 'docker':
      return `Detected Docker CLI; recommendation: docker ${recommendation.labviewVersion} ${recommendation.labviewBitness}.`;
    case 'none':
      return 'No comparison runtime detected (LabVIEW \u22652025 host or Docker CLI).';
  }
}

export function buildRuntimeSummaryReport(
  detection: DetectedRuntimes,
  recommendation: RuntimeRecommendation,
  persisted: PersistedRuntimeSelection
): string {
  const lines: string[] = [];
  lines.push('VI History runtime detection summary');
  lines.push('====================================');
  lines.push(`Platform: ${detection.platform}`);
  lines.push('');
  lines.push(`Host installations: ${detection.host.installations.length}`);
  if (detection.host.installations.length === 0) {
    lines.push('  (none)');
  } else {
    for (const installation of detection.host.installations) {
      lines.push(
        `  - LabVIEW ${installation.year} ${installation.bitness} at ${installation.labviewExePath}`
      );
      if (installation.labviewCliPath) {
        lines.push(`      LabVIEW CLI: ${installation.labviewCliPath}`);
      }
    }
  }
  lines.push('');
  lines.push(`Docker CLI available: ${detection.docker.cliAvailable}`);
  if (detection.docker.cliPath) {
    lines.push(`Docker CLI path: ${detection.docker.cliPath}`);
  }
  lines.push('');
  lines.push(`Recommendation: ${describeRecommendation(recommendation)}`);
  lines.push('');
  lines.push('Persisted user settings:');
  lines.push(`  viHistorySuite.runtimeProvider: ${formatPersisted(persisted.runtimeProvider)}`);
  lines.push(`  viHistorySuite.labviewVersion:  ${formatPersisted(persisted.labviewVersion)}`);
  lines.push(`  viHistorySuite.labviewBitness:  ${formatPersisted(persisted.labviewBitness)}`);
  lines.push('');
  lines.push(`Drift: ${buildDriftSummaryLine(detection, recommendation, persisted)}`);
  return lines.join('\n');
}

/**
 * VHS-REQ-620: Classify the relationship between the persisted runtime
 * selection and the auto-detection recommendation. Three states are surfaced:
 *
 *   - `none` — either nothing is persisted, or the persisted selection
 *     matches the recommendation exactly.
 *   - `selection differs from recommendation: persisted=…, recommendation=…`
 *     — all three persisted keys are set, the selection is satisfiable on
 *     this host, and the persisted provider/version/bitness diverges from
 *     the recommendation. The status bar honors the persisted choice.
 *   - `selection unsatisfiable on this host; falling back to recommendation`
 *     — at least one persisted key is set but the combination cannot be
 *     served (e.g. the requested host install is not present, or docker is
 *     persisted without a docker CLI). The status bar silently falls back.
 */
export function buildDriftSummaryLine(
  detection: DetectedRuntimes,
  recommendation: RuntimeRecommendation,
  persisted: PersistedRuntimeSelection
): string {
  const hasAnyPersistedKey =
    Boolean(persisted.runtimeProvider) ||
    Boolean(persisted.labviewVersion) ||
    Boolean(persisted.labviewBitness);
  if (!hasAnyPersistedKey) {
    return 'none';
  }

  const hasAllPersistedKeys =
    Boolean(persisted.runtimeProvider) &&
    Boolean(persisted.labviewVersion) &&
    Boolean(persisted.labviewBitness);
  if (!hasAllPersistedKeys || !isPersistedSelectionSatisfiable(persisted, detection)) {
    return 'selection unsatisfiable on this host; falling back to recommendation';
  }

  const persistedDescription = `${persisted.runtimeProvider} ${persisted.labviewVersion} ${persisted.labviewBitness}`;
  const recommendationDescription = describeRecommendation(recommendation);
  if (persistedDescription === recommendationDescription) {
    return 'none';
  }
  return `selection differs from recommendation: persisted=${persistedDescription}, recommendation=${recommendationDescription}`;
}

export interface PersistedRuntimeSelection {
  runtimeProvider: string | undefined;
  labviewVersion: string | undefined;
  labviewBitness: string | undefined;
}

function describeRecommendation(recommendation: RuntimeRecommendation): string {
  switch (recommendation.provider) {
    case 'host':
      return `host ${recommendation.labviewVersion} ${recommendation.labviewBitness}`;
    case 'docker':
      return `docker ${recommendation.labviewVersion} ${recommendation.labviewBitness}`;
    case 'none':
      return 'none';
  }
}

function formatPersisted(value: string | undefined): string {
  return value === undefined || value === '' ? '(unset)' : value;
}

export function readPersistedRuntimeSelection(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): PersistedRuntimeSelection {
  return {
    runtimeProvider: configuration.get<string>('runtimeProvider'),
    labviewVersion: configuration.get<string>('labviewVersion'),
    labviewBitness: configuration.get<string>('labviewBitness')
  };
}

export interface RegisterRuntimeRuntimeCommandsDeps {
  detect?: (deps?: never) => Promise<DetectedRuntimes>;
  isTrusted?: () => boolean;
}

export function registerRuntimeRuntimeCommands(
  context: vscode.ExtensionContext,
  watcher: RuntimeAvailabilityWatcher,
  deps: RegisterRuntimeRuntimeCommandsDeps = {}
): void {
  const detect = deps.detect ?? (() => detectAvailableRuntimes());
  const isTrusted = deps.isTrusted ?? (() => vscode.workspace.isTrusted);

  let outputChannel: vscode.OutputChannel | undefined;
  const ensureOutputChannel = (): vscode.OutputChannel => {
    if (!outputChannel) {
      outputChannel = vscode.window.createOutputChannel(RUNTIME_OUTPUT_CHANNEL_NAME);
      context.subscriptions.push(outputChannel);
    }
    return outputChannel;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.detectRuntimeNow', async () => {
      if (!isTrusted()) {
        void vscode.window.showWarningMessage(UNTRUSTED_WORKSPACE_BLOCK_MESSAGE);
        return { outcome: 'blocked-untrusted-workspace' as const };
      }
      const detection = await detect();
      const recommendation = recommendRuntimeFromDetection(detection);
      await watcher.forceRefresh();
      const summary = buildRuntimeSummaryLine(recommendation);
      void vscode.window.showInformationMessage(summary);
      return {
        outcome: 'detected-runtime' as const,
        detection,
        recommendation
      };
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.resetFirstRunNotice', async () => {
      if (!isTrusted()) {
        void vscode.window.showWarningMessage(UNTRUSTED_WORKSPACE_BLOCK_MESSAGE);
        return { outcome: 'blocked-untrusted-workspace' as const };
      }
      const choice = await vscode.window.showWarningMessage(
        'Reset VI History first-run runtime notice?',
        { modal: true, detail: RESET_FIRST_RUN_NOTICE_MODAL_DETAIL },
        RESET_FIRST_RUN_NOTICE_CONFIRM_BUTTON
      );
      if (choice !== RESET_FIRST_RUN_NOTICE_CONFIRM_BUTTON) {
        return { outcome: 'cancelled-by-user' as const };
      }
      await context.globalState.update(FIRST_RUN_NO_RUNTIME_NOTICE_KEY, undefined);
      void vscode.window.showInformationMessage(RESET_FIRST_RUN_NOTICE_TOAST_MESSAGE);
      return { outcome: 'reset-first-run-notice' as const };
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.showRuntimeSummary', async () => {
      if (!isTrusted()) {
        void vscode.window.showWarningMessage(UNTRUSTED_WORKSPACE_BLOCK_MESSAGE);
        return { outcome: 'blocked-untrusted-workspace' as const };
      }
      const detection = await detect();
      const recommendation = recommendRuntimeFromDetection(detection);
      const persisted = readPersistedRuntimeSelection(
        vscode.workspace.getConfiguration('viHistorySuite')
      );
      const report = buildRuntimeSummaryReport(detection, recommendation, persisted);
      const channel = ensureOutputChannel();
      channel.clear();
      channel.appendLine(report);
      channel.show(true);
      const choice = await vscode.window.showInformationMessage(
        buildRuntimeSummaryLine(recommendation),
        { modal: false },
        SHOW_RUNTIME_SUMMARY_COPY_BUTTON
      );
      if (choice === SHOW_RUNTIME_SUMMARY_COPY_BUTTON) {
        await vscode.env.clipboard.writeText(report);
      }
      return {
        outcome: 'shown-runtime-summary' as const,
        report,
        copiedToClipboard: choice === SHOW_RUNTIME_SUMMARY_COPY_BUTTON
      };
    })
  );
}
