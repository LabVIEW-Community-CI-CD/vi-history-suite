// Host-native provider rejection reason/detail mapping and Windows TCP listener
// description (supporting VHS-REQ-659). Extracted verbatim from
// comparisonRuntimeLocator to keep pure rejection-reason mapping and listener
// formatting separate from runtime locator orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import type { WindowsTcpListenerObservation } from '../comparisonReportRuntimeExecution';
import type { BuildProviderDecisionsOptions } from '../comparisonRuntimeLocator';

// Map the blocked provider-decision state to a stable host-native rejection
// reason code.
export function deriveHostNativeRejectedReason(options: BuildProviderDecisionsOptions): string {
  if (options.blockedReason === 'labview-version-unsupported-for-comparison-report') {
    return 'host-native-labview-version-unsupported-for-comparison-report';
  }
  if (options.blockedReason === 'labview-runtime-selection-required') {
    return 'host-native-runtime-selection-required';
  }
  if (options.blockedReason === 'labview-version-required') {
    return 'host-native-labview-version-required';
  }
  if (options.blockedReason === 'labview-bitness-required') {
    return 'host-native-labview-bitness-required';
  }
  if (options.blockedReason === 'labview-exe-ambiguous') {
    return 'host-native-labview-exe-ambiguous';
  }
  if (options.blockedReason === 'labview-cli-not-found-for-bitness') {
    return 'host-native-labview-cli-not-found-for-bitness';
  }
  if (options.blockedReason === 'labview-cli-ambiguous-for-bitness') {
    return 'host-native-labview-cli-ambiguous-for-bitness';
  }
  if (options.requestedProvider === 'docker') {
    return 'provider-request-docker-disallows-host-native';
  }
  if (options.executionMode === 'docker-only') {
    return 'execution-mode-docker-only-disallows-host-native';
  }
  if (options.blockedReason === 'auto-docker-installed-provider-unavailable') {
    return 'auto-docker-installed-disallows-host-native';
  }
  if (options.blockedReason === 'windows-host-runtime-surface-contaminated') {
    return 'host-native-runtime-surface-contaminated';
  }
  if (options.blockedReason === 'labview-2026q1-unsupported-on-macos') {
    return 'host-native-unsupported-on-macos';
  }
  if (options.blockedReason === 'windows-host-bitness-conflict') {
    return 'host-native-windows-host-bitness-conflict';
  }
  if (options.blockedReason === 'windows-host-version-conflict') {
    return 'host-native-windows-host-version-conflict';
  }
  if (options.configuredFailure) {
    return `host-native-configured-${options.configuredFailure.kind}-path-missing`;
  }
  if (options.blockedReason === 'labview-exe-not-found' || options.labviewExeFound === false) {
    return 'host-native-labview-exe-not-found';
  }
  return 'host-native-comparison-tool-not-found';
}

// Map the blocked provider-decision state to a human-readable host-native
// rejection detail message.
export function deriveHostNativeRejectedDetail(options: BuildProviderDecisionsOptions): string {
  if (options.blockedReason === 'labview-version-unsupported-for-comparison-report') {
    return 'Host-native execution was not selected because VI History Suite requires LabVIEW 2025 or newer to create VI Comparison Reports.';
  }
  if (options.blockedReason === 'labview-runtime-selection-required') {
    return 'Host-native execution was not selected because installed compare requires both LabVIEW version and bitness settings before runtime preflight can proceed.';
  }
  if (options.blockedReason === 'labview-version-required') {
    return 'Host-native execution was not selected because installed compare requires a LabVIEW version setting before runtime preflight can proceed.';
  }
  if (options.blockedReason === 'labview-bitness-required') {
    return 'Host-native execution was not selected because installed compare requires a LabVIEW bitness setting before runtime preflight can proceed.';
  }
  if (options.blockedReason === 'labview-exe-ambiguous') {
    return 'Host-native execution was not selected because multiple supported LabVIEW executables matched the requested version and bitness.';
  }
  if (options.blockedReason === 'labview-cli-not-found-for-bitness') {
    return 'A supported LabVIEW executable matched the requested version and bitness, but LabVIEWCLI was not located.';
  }
  if (options.blockedReason === 'labview-cli-ambiguous-for-bitness') {
    return 'A supported LabVIEW executable matched the requested version and bitness, but multiple LabVIEWCLI surfaces were located.';
  }
  if (options.requestedProvider === 'docker') {
    return 'Host-native execution was not selected because the Docker provider was requested.';
  }
  if (options.executionMode === 'docker-only') {
    return 'Host-native execution was not selected because docker-only execution was requested.';
  }
  if (options.blockedReason === 'auto-docker-installed-provider-unavailable') {
    return 'Host-native execution was not selected because Docker Desktop is installed and auto execution uses the current Docker engine provider.';
  }
  if (options.blockedReason === 'windows-host-runtime-surface-contaminated') {
    return 'Validated Windows host runtime facts showed existing LabVIEW-related process or configured VI Server port activity, so host-native execution was not selected.';
  }
  if (options.blockedReason === 'labview-2026q1-unsupported-on-macos') {
    return 'LabVIEW 2026 Q1 comparison-report execution is unsupported on macOS.';
  }
  if (options.blockedReason === 'windows-host-bitness-conflict') {
    return 'Host-native execution was not selected because a different LabVIEW bitness is already running; LabVIEW cannot run two bitnesses at the same time.';
  }
  if (options.blockedReason === 'windows-host-version-conflict') {
    return 'Host-native execution was not selected because a different LabVIEW version is already running; LabVIEW would attach to the running version instead of the selected one.';
  }
  if (options.configuredFailure) {
    return `Configured ${options.configuredFailure.kind} path does not exist: ${options.configuredFailure.path}`;
  }
  if (options.blockedReason === 'labview-exe-not-found' || options.labviewExeFound === false) {
    return 'No supported LabVIEW 2025 or newer executable was located for host-native comparison-report execution.';
  }
  return 'A supported LabVIEW 2025 or newer executable was located, but canonical CreateComparisonReport execution could not proceed because LabVIEWCLI was not located.';
}

// Format observed Windows TCP listeners into a diagnostic string.
export function describeWindowsTcpListeners(listeners: WindowsTcpListenerObservation[]): string {
  return listeners
    .map((listener) => {
      const processName = listener.processName?.trim() || 'unknown-process';
      return `${listener.localAddress}:${String(listener.localPort)} pid=${String(listener.pid)} process=${processName}`;
    })
    .join(' | ');
}
