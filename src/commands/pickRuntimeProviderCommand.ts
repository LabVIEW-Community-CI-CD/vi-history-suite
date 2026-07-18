/**
 * VHS-REQ-620: runtime provider selection helpers.
 *
 * Pure builders for the comparison runtime provider choices plus the settings
 * writer that persists (or clears) the three `viHistorySuite.*` runtime keys via
 * `ConfigurationTarget.Global`. These were extracted from the former status-bar
 * quick-pick and are now consumed by the Runtime & Report Settings panel
 * (`openRuntimeReportPanelCommand`). The panel derives its own webview-safe
 * labels; `PICK_RUNTIME_PROVIDER_CLEAR_LABEL` retains the codicon label only as a
 * stable selection sentinel for the `clear` option.
 *
 * Trust posture is enforced by the panel command: the persisted selection feeds
 * external-process invocation in comparison flows, so it is written only from a
 * trusted workspace.
 */

import * as vscode from 'vscode';

import {
  type DetectedHostInstallation,
  type DetectedRuntimes
} from '../tooling/runtimeAutoDetect';

export const PICK_RUNTIME_PROVIDER_CLEAR_LABEL =
  '$(close) Clear (auto-detect each session)';

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
      label: '$(server) Docker',
      description: detection.docker.cliPath,
      detail:
        'Bounded expert path. The selected LabVIEW container image determines the LabVIEW version.',
      runtimeProvider: 'docker'
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

export interface ApplyViPreviewEnabledSelectionDeps {
  readonly update: (
    key: string,
    value: boolean,
    target: vscode.ConfigurationTarget
  ) => Thenable<void>;
}

/**
 * VHS-REQ-659: persist the opt-in VI Preview flag (`viHistorySuite.preview.enabled`)
 * written by the Runtime & Report Settings panel's VI Preview toggle. Global-scoped
 * like the other panel writers.
 */
export async function applyViPreviewEnabledSelection(
  enabled: boolean,
  deps: ApplyViPreviewEnabledSelectionDeps
): Promise<void> {
  await deps.update('preview.enabled', enabled, vscode.ConfigurationTarget.Global);
}

