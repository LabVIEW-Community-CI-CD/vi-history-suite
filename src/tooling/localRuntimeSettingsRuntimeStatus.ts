import type { RuntimePlatform } from '../reporting/comparisonRuntimeLocator';
import type {
  LocalRuntimeSettingsCliBitness,
  LocalRuntimeSettingsCliProvider,
  RuntimeImplementationStatus,
  RuntimeProofStatus,
  RuntimeValidationErrorCode
} from './localRuntimeSettingsCli';

const MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR = 2025;

export function normalizeLabviewBitness(value: string): LocalRuntimeSettingsCliBitness {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'x86' || normalized === 'x64') {
    return normalized;
  }

  throw new Error(`Unsupported LabVIEW bitness: ${value}`);
}

export function normalizeProvider(value: string): LocalRuntimeSettingsCliProvider {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'host' || normalized === 'docker') {
    return normalized;
  }

  throw new Error(`Unsupported compare provider: ${value}`);
}

export function isSupportedInstalledLabviewVersion(value: string | undefined): value is string {
  const requestedYear = Number.parseInt(value ?? '', 10);
  return (
    Number.isFinite(requestedYear) &&
    requestedYear >= MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR
  );
}

export function deriveRuntimeValidationErrorCode(
  blockedReason: string | undefined
): RuntimeValidationErrorCode {
  if (!blockedReason) {
    return 'VIHS_OK';
  }

  if (blockedReason === 'installed-provider-invalid') {
    return 'VIHS_E_PROVIDER_INVALID';
  }

  if (blockedReason === 'labview-runtime-selection-required') {
    return 'VIHS_E_RUNTIME_SELECTION_REQUIRED';
  }

  if (blockedReason === 'labview-version-required') {
    return 'VIHS_E_LABVIEW_VERSION_REQUIRED';
  }

  if (blockedReason === 'labview-version-unsupported-for-comparison-report') {
    return 'VIHS_E_LABVIEW_VERSION_UNSUPPORTED';
  }

  if (blockedReason === 'labview-bitness-required') {
    return 'VIHS_E_LABVIEW_BITNESS_REQUIRED';
  }

  if (
    blockedReason === 'labview-2026q1-unsupported-on-macos' ||
    blockedReason.endsWith('provider-not-supported-on-platform')
  ) {
    return 'VIHS_E_PLATFORM_UNSUPPORTED';
  }

  if (blockedReason.startsWith('configured-') && blockedReason.endsWith('-path-missing')) {
    return 'VIHS_E_CONFIGURED_PATH_MISSING';
  }

  if (blockedReason === 'docker-provider-labview-version-not-implemented') {
    return 'VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED';
  }

  if (
    blockedReason === 'docker-provider-requires-windows-x64' ||
    blockedReason === 'docker-only-requires-windows-x64-provider'
  ) {
    return 'VIHS_E_DOCKER_PROVIDER_UNSUPPORTED_BITNESS';
  }

  if (
    blockedReason === 'docker-provider-unavailable' ||
    blockedReason === 'docker-only-provider-unavailable' ||
    blockedReason === 'auto-docker-installed-provider-unavailable'
  ) {
    return 'VIHS_E_DOCKER_UNAVAILABLE';
  }

  if (blockedReason === 'labview-exe-not-found') {
    return 'VIHS_E_LABVIEW_NOT_FOUND';
  }

  if (blockedReason === 'labview-exe-ambiguous') {
    return 'VIHS_E_LABVIEW_AMBIGUOUS';
  }

  if (blockedReason === 'labview-cli-not-found-for-bitness') {
    return 'VIHS_E_LABVIEW_CLI_BITNESS_NOT_FOUND';
  }

  if (
    blockedReason === 'canonical-labview-cli-not-found' ||
    blockedReason === 'comparison-tool-not-found'
  ) {
    return 'VIHS_E_COMPARISON_TOOL_NOT_FOUND';
  }

  if (blockedReason === 'windows-host-runtime-surface-contaminated') {
    return 'VIHS_E_RUNTIME_SURFACE_CONTAMINATED';
  }

  return 'VIHS_E_RUNTIME_VALIDATION_BLOCKED';
}

export function deriveRuntimeProofStatus(
  runtimeValidationOutcome: 'ready' | 'blocked'
): RuntimeProofStatus {
  return runtimeValidationOutcome === 'ready'
    ? 'ready'
    : 'blocked-with-actionable-error';
}

export function deriveRuntimeImplementationStatus(
  blockedReason: string | undefined
): RuntimeImplementationStatus {
  if (!blockedReason) {
    return 'implemented';
  }

  if (
    blockedReason === 'docker-provider-labview-version-not-implemented' ||
    blockedReason === 'docker-provider-requires-windows-x64' ||
    blockedReason === 'docker-only-requires-windows-x64-provider' ||
    blockedReason.endsWith('provider-not-supported-on-platform') ||
    blockedReason === 'labview-2026q1-unsupported-on-macos'
  ) {
    return 'not-implemented';
  }

  return 'blocked-or-missing-prerequisite';
}

export function formatPersistedFact(value: string | undefined): string {
  return value ?? '<missing>';
}

export function resolveCliRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }

  throw new Error(
    `Unsupported runtime platform for VI History settings CLI validation: ${platform}`
  );
}
