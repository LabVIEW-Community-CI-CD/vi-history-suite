// Comparison report action settings primitives (supporting VHS-REQ-645).
// Extracted verbatim from comparisonReportAction to keep pure workspace-settings
// normalization separate from the command/panel orchestration (per the
// reporting-orchestration guardrails). These consume only an injected
// `configuration.get` seam (type-only vscode import), so they stay runtime-pure.
// Behavior is unchanged.
import type * as vscode from 'vscode';

// Read a string setting, defending the boundary against non-string values and
// returning `undefined` for blank/absent values.
export function readTrimmedStringSetting(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>,
  key: string
): string | undefined {
  const value = configuration.get<unknown>(key);
  if (typeof value !== 'string') {
    // Defend the system boundary: a misconfigured settings.json can return a
    // non-string (e.g. a number) for a string-typed setting, and calling
    // `.trim()` on it would throw and break runtime-settings resolution.
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

// Read the configured LabVIEW bitness (`x86`/`x64`), or `undefined` when unset or
// invalid.
export function readConfiguredLabviewBitness(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): 'x86' | 'x64' | undefined {
  const value = readTrimmedStringSetting(configuration, 'labviewBitness');
  if (value === 'x86' || value === 'x64') {
    return value;
  }

  return undefined;
}

// Read the configured runtime provider (`host`/`docker`), distinguishing an
// unset value from an invalid one.
export function readConfiguredRuntimeProvider(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): { provider?: 'host' | 'docker'; invalidProvider?: string } {
  const value = readTrimmedStringSetting(configuration, 'runtimeProvider');
  if (!value) {
    return {};
  }

  if (value === 'host' || value === 'docker') {
    return { provider: value };
  }

  return { invalidProvider: value };
}

// Read a boolean setting, treating anything other than `true` as `false`.
export function readBooleanSetting(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>,
  key: string
): boolean {
  // Defend the system boundary: a misconfigured settings.json can return a
  // non-boolean for a boolean-typed setting; treat anything but `true` as the
  // default (false = include this difference class).
  return configuration.get<unknown>(key) === true;
}
