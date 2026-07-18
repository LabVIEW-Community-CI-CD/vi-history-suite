import * as vscode from 'vscode';

import { DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT } from '../dashboard/worktreeSnapshotIndex';
import {
  readBooleanSetting,
  readConfiguredLabviewBitness,
  readConfiguredRuntimeProvider,
  readTrimmedStringSetting
} from './comparisonReportActionSettingsPrimitives';
import {
  DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS,
  MAX_CLI_CONNECT_TIMEOUT_SECONDS,
  MIN_CLI_CONNECT_TIMEOUT_SECONDS
} from './comparisonReportCliConnectTimeout';
import type { ComparisonReportOptions } from './comparisonReportPlan';
import type { ComparisonRuntimeSettings } from './comparisonRuntimeLocator';

export function readComparisonRuntimeSettings(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): ComparisonRuntimeSettings {
  const labviewVersion = readTrimmedStringSetting(configuration, 'labviewVersion');
  const labviewBitness = readConfiguredLabviewBitness(configuration);
  const configuredProvider = readConfiguredRuntimeProvider(configuration);

  return {
    requestedProvider:
      configuredProvider.provider ??
      (configuredProvider.invalidProvider ? undefined : 'host'),
    invalidRequestedProvider: configuredProvider.invalidProvider,
    requireVersionAndBitness: true,
    labviewVersion,
    bitness: labviewBitness,
    // VHS-REQ-633: optional manual overrides for installs auto-detection does
    // not cover. The locator consumes these as `configured` candidates and
    // reports configured-labview-(cli|exe)-path-missing when the path is wrong.
    labviewCliPath: readTrimmedStringSetting(configuration, 'labviewCliPath'),
    labviewExePath: readTrimmedStringSetting(configuration, 'labviewExePath'),
    // VHS-REQ-650: optional selected LabVIEW container image version that drives
    // the container provider's image; unset preserves the platform default.
    containerImageVersion: readTrimmedStringSetting(configuration, 'container.imageVersion'),
    allowExistingWindowsHostRuntime: configuredProvider.provider !== 'docker'
  };
}

/**
 * VHS-REQ-645: reads the user-configurable comparison report flags from
 * `viHistorySuite.report.*`. The difference-suppression booleans default to
 * false (compare everything), so an unconfigured workspace reproduces today's
 * exact `CreateComparisonReport` args. The report output format is fixed to
 * single-file HTML (VHS-REQ-640) and is not read from settings.
 */
export function readComparisonReportOptions(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): ComparisonReportOptions {
  return {
    ignoreViAttributes: readBooleanSetting(configuration, 'report.ignoreViAttributes'),
    ignoreFrontPanel: readBooleanSetting(configuration, 'report.ignoreFrontPanel'),
    ignoreFrontPanelObjectPosition: readBooleanSetting(
      configuration,
      'report.ignoreFrontPanelObjectPosition'
    ),
    ignoreBlockDiagram: readBooleanSetting(configuration, 'report.ignoreBlockDiagram'),
    ignoreBlockDiagramCosmetic: readBooleanSetting(
      configuration,
      'report.ignoreBlockDiagramCosmetic'
    )
  };
}

/**
 * VHS-REQ-148: read the configured LabVIEW CLI connect-window timeout (seconds) from
 * `viHistorySuite.runtime.cliConnectTimeoutSeconds`. Falls back to the shipped default
 * (180s, matching the existing Windows-container constant). Out-of-range values fall back
 * to the default to keep the helper idempotent and predictable.
 */
export function readCliConnectTimeoutSeconds(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): number {
  const raw = configuration.get<unknown>('runtime.cliConnectTimeoutSeconds');
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  if (raw < MIN_CLI_CONNECT_TIMEOUT_SECONDS || raw > MAX_CLI_CONNECT_TIMEOUT_SECONDS) {
    return DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  return raw;
}

/**
 * VHS-REQ-641 (Phase 3, issue #1366): read the configured keep-last-N retention
 * limit for working-tree snapshots from
 * `viHistorySuite.comparison.worktreeSnapshotRetentionLimit`. A value of 0
 * disables retention; a negative or non-integer value falls back to the shipped
 * default (`DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT`). The archive layer
 * applies the same clamp, so this reader only needs to reject clearly invalid
 * input.
 */
export function readWorktreeSnapshotRetentionLimit(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): number {
  const raw = configuration.get<unknown>('comparison.worktreeSnapshotRetentionLimit');
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    return DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT;
  }
  return raw;
}
