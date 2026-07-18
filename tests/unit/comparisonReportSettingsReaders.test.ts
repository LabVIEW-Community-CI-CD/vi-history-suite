import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import {
  readCliConnectTimeoutSeconds,
  readComparisonReportOptions,
  readComparisonRuntimeSettings,
  readWorktreeSnapshotRetentionLimit
} from '../../src/reporting/comparisonReportSettingsReaders';

function configFrom(values: Record<string, unknown>): { get: <T>(key: string) => T | undefined } {
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined
  };
}

describe('readComparisonRuntimeSettings', () => {
  it('defaults to the host provider with version/bitness required', () => {
    const settings = readComparisonRuntimeSettings(configFrom({}));
    expect(settings.requestedProvider).toBe('host');
    expect(settings.requireVersionAndBitness).toBe(true);
    expect(settings.allowExistingWindowsHostRuntime).toBe(true);
  });

  it('maps trimmed overrides and disables host reuse for the docker provider', () => {
    const settings = readComparisonRuntimeSettings(
      configFrom({
        labviewVersion: '  2025  ',
        runtimeProvider: 'docker',
        labviewCliPath: ' C:/cli ',
        'container.imageVersion': ' 2025 '
      })
    );
    expect(settings.requestedProvider).toBe('docker');
    expect(settings.labviewVersion).toBe('2025');
    expect(settings.labviewCliPath).toBe('C:/cli');
    expect(settings.containerImageVersion).toBe('2025');
    expect(settings.allowExistingWindowsHostRuntime).toBe(false);
  });
});

describe('readComparisonReportOptions', () => {
  it('defaults every suppression flag to false', () => {
    expect(readComparisonReportOptions(configFrom({}))).toEqual({
      ignoreViAttributes: false,
      ignoreFrontPanel: false,
      ignoreFrontPanelObjectPosition: false,
      ignoreBlockDiagram: false,
      ignoreBlockDiagramCosmetic: false
    });
  });

  it('reads strict-true booleans from settings', () => {
    const options = readComparisonReportOptions(
      configFrom({ 'report.ignoreViAttributes': true, 'report.ignoreBlockDiagram': true })
    );
    expect(options.ignoreViAttributes).toBe(true);
    expect(options.ignoreBlockDiagram).toBe(true);
    expect(options.ignoreFrontPanel).toBe(false);
  });
});

describe('readCliConnectTimeoutSeconds', () => {
  it('reads a valid in-window integer', () => {
    expect(readCliConnectTimeoutSeconds(configFrom({ 'runtime.cliConnectTimeoutSeconds': 240 }))).toBe(240);
  });

  it('falls back to the default for out-of-window or non-integer input', () => {
    expect(readCliConnectTimeoutSeconds(configFrom({ 'runtime.cliConnectTimeoutSeconds': 5 }))).toBe(180);
    expect(readCliConnectTimeoutSeconds(configFrom({ 'runtime.cliConnectTimeoutSeconds': 1.5 }))).toBe(180);
    expect(readCliConnectTimeoutSeconds(configFrom({}))).toBe(180);
  });
});

describe('readWorktreeSnapshotRetentionLimit', () => {
  it('reads a valid non-negative integer', () => {
    expect(readWorktreeSnapshotRetentionLimit(configFrom({ 'comparison.worktreeSnapshotRetentionLimit': 0 }))).toBe(0);
    expect(readWorktreeSnapshotRetentionLimit(configFrom({ 'comparison.worktreeSnapshotRetentionLimit': 7 }))).toBe(7);
  });

  it('falls back to the default for negative or non-integer input', () => {
    expect(
      readWorktreeSnapshotRetentionLimit(configFrom({ 'comparison.worktreeSnapshotRetentionLimit': -1 }))
    ).not.toBe(-1);
    expect(
      readWorktreeSnapshotRetentionLimit(configFrom({ 'comparison.worktreeSnapshotRetentionLimit': 2.5 }))
    ).not.toBe(2.5);
  });
});
