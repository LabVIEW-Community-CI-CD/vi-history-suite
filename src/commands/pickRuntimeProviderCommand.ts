/**
 * VHS-REQ-620: Pick Runtime Provider quick-pick command.
 *
 * Surfaces a `vscode.window.showQuickPick` built from the cached detection on
 * the runtime availability watcher, then writes the user's choice to the three
 * `viHistorySuite.*` settings via `ConfigurationTarget.Global`. The watcher
 * already subscribes to `onDidChangeConfiguration`, so the status bar label
 * updates immediately after the writes commit — the same path the
 * `vihs --provider …` CLI exercises.
 *
 * Trust posture: identical to the other VHS-REQ-617 runtime commands —
 * blocked outside trusted workspaces because the persisted selection feeds
 * external-process invocation in comparison flows, and surfacing host paths
 * inside an untrusted folder leaks filesystem layout.
 *
 * Pure helpers (`buildPickRuntimeProviderItems`, `applyPickRuntimeProviderSelection`)
 * are exported for unit tests; `registerPickRuntimeProviderCommand` wires the
 * handler into VS Code.
 */

import * as vscode from 'vscode';

import {
  type DetectedHostInstallation,
  type DetectedRuntimes
} from '../tooling/runtimeAutoDetect';
import {
  STATUS_BAR_PICK_COMMAND_ID,
  type RuntimeAvailabilityWatcher
} from '../ui/runtimeAvailabilityNotice';
import { PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID } from './pickContainerImageVersionCommand';

export const PICK_RUNTIME_PROVIDER_COMMAND_ID = STATUS_BAR_PICK_COMMAND_ID;

export const PICK_RUNTIME_PROVIDER_PLACEHOLDER =
  'Select the comparison runtime VI History should use';

export const PICK_RUNTIME_PROVIDER_NO_DETECTION_MESSAGE =
  'VI History runtime detection has not completed yet. Try again shortly or run "Detect Runtime Now" first.';

export const PICK_RUNTIME_PROVIDER_NO_RUNTIMES_MESSAGE =
  'No comparison runtime was detected on this host. Install LabVIEW 2025 or newer or install Docker, then re-run detection.';

export const PICK_RUNTIME_PROVIDER_CLEAR_LABEL =
  '$(close) Clear (auto-detect each session)';

export const PICK_RUNTIME_PROVIDER_TOAST_PREFIX =
  'VI History runtime selection saved:';

export const PICK_RUNTIME_PROVIDER_CLEAR_TOAST_MESSAGE =
  'VI History runtime selection cleared. The status bar now reflects auto-detection.';

export interface PickRuntimeProviderOption {
  readonly kind: 'host' | 'docker' | 'clear';
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly runtimeProvider?: 'host' | 'docker';
  readonly labviewVersion?: string;
  readonly labviewBitness?: 'x86' | 'x64';
}

export function buildPickRuntimeProviderItems(
  detection: DetectedRuntimes
): readonly PickRuntimeProviderOption[] {
  const items: PickRuntimeProviderOption[] = [];

  for (const installation of detection.host.installations) {
    items.push(buildHostOption(installation));
  }

  if (detection.docker.cliAvailable) {
    items.push({
      kind: 'docker',
      label: '$(server) Docker — LabVIEW 2026 x64',
      description: detection.docker.cliPath,
      detail: 'Bounded expert path. Requires a configured LabVIEW Docker image.',
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  }

  if (items.length > 0) {
    items.push({
      kind: 'clear',
      label: PICK_RUNTIME_PROVIDER_CLEAR_LABEL,
      detail:
        'Removes viHistorySuite.runtimeProvider, .labviewVersion, and .labviewBitness from your user settings.'
    });
  }

  return items;
}

function buildHostOption(
  installation: DetectedHostInstallation
): PickRuntimeProviderOption {
  return {
    kind: 'host',
    label: `$(desktop-download) Host LabVIEW ${installation.year} ${installation.bitness}`,
    description: installation.labviewExePath,
    detail: installation.labviewCliPath
      ? `LabVIEWCLI: ${installation.labviewCliPath}`
      : undefined,
    runtimeProvider: 'host',
    labviewVersion: installation.year,
    labviewBitness: installation.bitness as 'x86' | 'x64'
  };
}

export interface ApplyPickRuntimeProviderSelectionDeps {
  readonly update: (
    key: string,
    value: string | undefined,
    target: vscode.ConfigurationTarget
  ) => Thenable<void>;
}

/**
 * Persist (or clear) the three runtime-selection keys for a chosen quick-pick
 * option. Always writes all three keys so partial-selection edge cases cannot
 * desync the persisted state from `isPersistedSelectionSatisfiable`.
 */
export async function applyPickRuntimeProviderSelection(
  option: PickRuntimeProviderOption,
  deps: ApplyPickRuntimeProviderSelectionDeps
): Promise<void> {
  if (option.kind === 'clear') {
    await deps.update('runtimeProvider', undefined, vscode.ConfigurationTarget.Global);
    await deps.update('labviewVersion', undefined, vscode.ConfigurationTarget.Global);
    await deps.update('labviewBitness', undefined, vscode.ConfigurationTarget.Global);
    return;
  }
  await deps.update(
    'runtimeProvider',
    option.runtimeProvider,
    vscode.ConfigurationTarget.Global
  );
  await deps.update(
    'labviewVersion',
    option.labviewVersion,
    vscode.ConfigurationTarget.Global
  );
  await deps.update(
    'labviewBitness',
    option.labviewBitness,
    vscode.ConfigurationTarget.Global
  );
}

export interface RegisterPickRuntimeProviderCommandDeps {
  isTrusted?: () => boolean;
  /**
   * VHS-REQ-651: command dispatcher used to chain into the container image
   * version picker after a docker provider selection. Injected for tests;
   * defaults to `vscode.commands.executeCommand`.
   */
  executeCommand?: (command: string) => Thenable<unknown>;
}

export function registerPickRuntimeProviderCommand(
  context: vscode.ExtensionContext,
  watcher: RuntimeAvailabilityWatcher,
  deps: RegisterPickRuntimeProviderCommandDeps = {}
): void {
  const isTrusted = deps.isTrusted ?? (() => vscode.workspace.isTrusted);
  const executeCommand =
    deps.executeCommand ?? ((command: string) => vscode.commands.executeCommand(command));

  context.subscriptions.push(
    vscode.commands.registerCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID, async () => {
      if (!isTrusted()) {
        void vscode.window.showWarningMessage(
          'VI History runtime commands require workspace trust.'
        );
        return { outcome: 'blocked-untrusted-workspace' as const };
      }

      const detection = watcher.getLastDetection();
      if (!detection) {
        void vscode.window.showWarningMessage(PICK_RUNTIME_PROVIDER_NO_DETECTION_MESSAGE);
        return { outcome: 'no-detection-cached' as const };
      }

      const items = buildPickRuntimeProviderItems(detection);
      if (items.length === 0) {
        void vscode.window.showWarningMessage(PICK_RUNTIME_PROVIDER_NO_RUNTIMES_MESSAGE);
        return { outcome: 'no-runtimes-detected' as const };
      }

      const picked = await vscode.window.showQuickPick(
        items.map((item) => ({
          label: item.label,
          description: item.description,
          detail: item.detail,
          option: item
        })),
        { placeHolder: PICK_RUNTIME_PROVIDER_PLACEHOLDER, ignoreFocusOut: false }
      );
      if (!picked) {
        return { outcome: 'cancelled-by-user' as const };
      }

      const configuration = vscode.workspace.getConfiguration('viHistorySuite');
      await applyPickRuntimeProviderSelection(picked.option, {
        update: configuration.update.bind(configuration)
      });

      if (picked.option.kind === 'clear') {
        void vscode.window.showInformationMessage(
          PICK_RUNTIME_PROVIDER_CLEAR_TOAST_MESSAGE
        );
        return { outcome: 'cleared-selection' as const };
      }
      void vscode.window.showInformationMessage(
        `${PICK_RUNTIME_PROVIDER_TOAST_PREFIX} ${picked.option.runtimeProvider} ${picked.option.labviewVersion} ${picked.option.labviewBitness}.`
      );

      // VHS-REQ-651: the docker provider always runs the comparison inside a
      // LabVIEW container image, so chain directly into the container image
      // version picker (VHS-REQ-649) as a follow-on step. Host picks need no
      // image and return without chaining. The chain is best-effort: the docker
      // selection is already persisted, so a cancelled or failing image pick
      // never undoes it and never throws out of this command.
      if (picked.option.kind === 'docker') {
        let chainedContainerImageVersionPick = true;
        try {
          await executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);
        } catch {
          chainedContainerImageVersionPick = false;
        }
        return {
          outcome: 'persisted-selection' as const,
          runtimeProvider: picked.option.runtimeProvider,
          labviewVersion: picked.option.labviewVersion,
          labviewBitness: picked.option.labviewBitness,
          chainedContainerImageVersionPick
        };
      }

      return {
        outcome: 'persisted-selection' as const,
        runtimeProvider: picked.option.runtimeProvider,
        labviewVersion: picked.option.labviewVersion,
        labviewBitness: picked.option.labviewBitness
      };
    })
  );
}
