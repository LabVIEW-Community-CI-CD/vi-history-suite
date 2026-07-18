import type {
  RuntimePlatform,
  RuntimeProviderDecision,
  BuildProviderDecisionsOptions
} from '../comparisonRuntimeLocator';
import {
  deriveHostNativeRejectedReason,
  deriveHostNativeRejectedDetail
} from './hostNativeRejection';
import {
  describeSelectedContainerProvider,
  describeUnavailableContainerProvider
} from './containerProviderDescriptions';
import { resolveContainerImageForHostMode } from './containerRuntimePaths';

/**
 * Provider-decision assembler extracted verbatim from comparisonRuntimeLocator.
 * `buildProviderDecisions` maps a probed provider-selection snapshot
 * (BuildProviderDecisionsOptions) to the ordered RuntimeProviderDecision[] that
 * records why each candidate provider (host-native / windows-container /
 * linux-container) was selected or rejected, with human-readable detail. It is a
 * pure composition of the already-extracted host-native rejection reasons,
 * container-provider descriptions, and image resolver, so it carries no probing
 * state and is imported back to preserve the doctor's decision contract.
 *
 * Supporting VHS-REQ-657.
 */
export function buildProviderDecisions(
  options: BuildProviderDecisionsOptions
): RuntimeProviderDecision[] {
  const decisions: RuntimeProviderDecision[] = [];
  const hostProviderRequested = options.requestedProvider === 'host';
  const dockerProviderRequested = options.requestedProvider === 'docker';
  const containerRelevant =
    options.platform === 'win32' ||
    (options.platform === 'linux' &&
      (options.executionMode === 'docker-only' ||
        options.containerEvaluated === true ||
        options.selectedProvider === 'linux-container' ||
        options.containerRuntimePlatform === 'linux'));
  const windowsAutoDockerInstalled =
    options.platform === 'win32' &&
    options.executionMode === 'auto' &&
    options.containerEvaluated === true &&
    options.dockerCliAvailable === true;
  const windowsAutoDockerMissing =
    options.platform === 'win32' &&
    options.executionMode === 'auto' &&
    options.containerEvaluated === true &&
    options.dockerCliAvailable === false;
  const selectedContainerProvider =
    options.selectedProvider && options.selectedProvider !== 'host-native'
      ? options.selectedProvider
      : options.containerHostMode === 'linux'
        ? 'linux-container'
        : 'windows-container';

  if (
    options.selectedProvider === 'windows-container' ||
    options.selectedProvider === 'linux-container'
  ) {
    decisions.push({
      provider: selectedContainerProvider,
      outcome: 'selected',
      reason:
        dockerProviderRequested
          ? `provider-request-docker-selected-${selectedContainerProvider}`
          : options.executionMode === 'docker-only'
          ? `execution-mode-docker-only-selected-${selectedContainerProvider}`
          : windowsAutoDockerInstalled && !options.hostRuntimeConflictDetected
            ? `auto-selected-${selectedContainerProvider}-because-docker-installed`
          : options.hostRuntimeConflictDetected
            ? 'auto-required-docker-because-host-runtime-conflict'
            : options.labviewExeFound === false
              ? `${selectedContainerProvider}-selected-host-runtime-unavailable`
              : options.labviewCliFound === false && options.lvCompareFound === false
                ? `${selectedContainerProvider}-selected-because-host-comparison-tool-missing`
                : `${selectedContainerProvider}-preferred-and-available`,
      detail:
        describeSelectedContainerProvider({
          provider: selectedContainerProvider,
          runtimePlatform: options.containerRuntimePlatform ?? 'win32',
          executionMode: options.executionMode,
          requestedProvider: options.requestedProvider,
          containerImage:
            options.containerImage ??
            resolveContainerImageForHostMode({
              hostMode: options.containerHostMode,
              windowsContainerImage: options.configuredWindowsContainerImage,
              linuxContainerImage: options.configuredLinuxContainerImage
            }),
          dockerCliAvailable: options.dockerCliAvailable,
          dockerDaemonReachable: options.dockerDaemonReachable,
          containerCapabilityAvailable: options.containerCapabilityAvailable,
          containerHostMode: options.containerHostMode,
          imageAvailable: options.containerImageAvailable,
          acquisitionState: options.containerAcquisitionState,
          selectionReason:
            windowsAutoDockerInstalled && !options.hostRuntimeConflictDetected
              ? 'docker-installed'
              : options.hostRuntimeConflictDetected
              ? 'host-runtime-conflict'
              : options.labviewExeFound === false
                ? 'host-runtime-unavailable'
                : options.labviewCliFound === false && options.lvCompareFound === false
                  ? 'host-comparison-tool-missing'
                  : 'preferred-isolation'
        })
    });
    decisions.push({
      provider: 'host-native',
      outcome: 'rejected',
      reason:
        dockerProviderRequested
          ? 'provider-request-docker-disallows-host-native'
          : options.executionMode === 'docker-only'
          ? 'execution-mode-docker-only-disallows-host-native'
          : windowsAutoDockerInstalled
            ? 'auto-docker-installed-disallows-host-native'
          : options.hostRuntimeConflictDetected
            ? 'host-native-runtime-surface-contaminated'
            : deriveHostNativeRejectedReason(options),
      detail:
        dockerProviderRequested
          ? 'Host-native execution was not selected because the Docker provider was requested.'
          : options.executionMode === 'docker-only'
          ? 'Host-native execution was not selected because docker-only execution was requested.'
          : windowsAutoDockerInstalled
            ? 'Host-native execution was not selected because Docker Desktop is installed and auto execution uses the current Docker engine provider.'
            : options.hostRuntimeConflictDetected
            ? 'Host-native execution was not selected because the validated Windows host runtime surface was contaminated by existing LabVIEW-related activity.'
            : deriveHostNativeRejectedDetail(options)
    });
    return decisions;
  }

  if (containerRelevant) {
    if (options.executionMode === 'host-only') {
      decisions.push({
        provider: selectedContainerProvider,
        outcome: 'rejected',
        reason: hostProviderRequested
          ? 'provider-request-host-disallows-docker'
          : 'execution-mode-host-only-disallows-docker',
        detail: hostProviderRequested
          ? 'Docker container execution was not selected because the host provider was requested.'
          : 'Docker container execution was not selected because host-only execution was requested.'
      });
    } else if (options.executionMode === 'docker-only') {
      decisions.push(
        options.blockedReason === 'labview-version-unsupported-for-comparison-report'
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'labview-version-unsupported-for-comparison-report',
              detail:
                'Docker provider execution was not selected because VI History Suite requires LabVIEW 2025 or newer to create VI Comparison Reports.'
            }
          : options.blockedReason === 'docker-provider-labview-version-not-implemented'
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'docker-provider-labview-version-not-implemented',
              detail:
                'Docker provider execution was accepted for validation reporting, but the requested LabVIEW year does not have a Docker implementation yet.'
            }
          : options.blockedReason === 'docker-only-requires-windows-x64-provider' ||
        options.blockedReason === 'docker-provider-requires-windows-x64'
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason:
                options.requestedProvider === 'docker'
                  ? 'docker-provider-windows-x64-required'
                  : 'docker-only-windows-x64-provider-required',
              detail:
                options.requestedProvider === 'docker'
                  ? 'The Docker provider currently requires the supported 64-bit container provider.'
                  : 'Docker-only execution currently requires the supported 64-bit container provider.'
            }
          : {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason:
                options.requestedProvider === 'docker'
                  ? 'docker-provider-unavailable'
                  : 'docker-only-provider-unavailable',
              detail: `${
                options.requestedProvider === 'docker'
                  ? 'The Docker provider was requested'
                  : 'Docker-only execution was requested'
              }, but ${describeUnavailableContainerProvider(
                options.containerImage
                  ? {
                      image: options.containerImage,
                      provider: selectedContainerProvider,
                      runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                      hostPlatform: options.platform,
                      dockerCliAvailable: options.dockerCliAvailable ?? false,
                      dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                      windowsContainerCapabilityAvailable: options.containerCapabilityAvailable ?? false,
                      windowsContainerHostMode: options.containerHostMode,
                      imageAvailable: options.containerImageAvailable ?? false,
                      notes: []
                    }
                  : undefined,
                {
                  configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                  configuredLinuxContainerImage: options.configuredLinuxContainerImage
                }
              )}`
            }
      );
    } else {
      decisions.push(
        windowsAutoDockerMissing
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'auto-docker-not-installed',
              detail:
                'Docker container execution was not selected because Docker Desktop was not detected on this Windows host.'
            }
          : options.executionMode === 'auto' &&
              options.blockedReason === 'auto-docker-installed-provider-unavailable'
            ? {
                provider: selectedContainerProvider,
                outcome: 'rejected',
                reason: 'auto-docker-installed-provider-unavailable',
                detail: `Docker Desktop was detected on Windows, but ${describeUnavailableContainerProvider(
                  options.containerImage
                    ? {
                        image: options.containerImage,
                        provider: selectedContainerProvider,
                        runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                        hostPlatform: options.platform,
                        dockerCliAvailable: options.dockerCliAvailable ?? false,
                        dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                        windowsContainerCapabilityAvailable:
                          options.containerCapabilityAvailable ?? false,
                        windowsContainerHostMode: options.containerHostMode,
                        imageAvailable: options.containerImageAvailable ?? false,
                        notes: []
                      }
                    : undefined,
                  {
                    configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                    configuredLinuxContainerImage: options.configuredLinuxContainerImage
                  }
                )}`
              }
          : options.blockedReason === 'labview-version-unsupported-for-comparison-report'
            ? {
                provider: selectedContainerProvider,
                outcome: 'rejected',
                reason: 'labview-version-unsupported-for-comparison-report',
                detail:
                  'Docker container execution was not selected because VI History Suite requires LabVIEW 2025 or newer to create VI Comparison Reports.'
              }
          : options.bitness === 'x86'
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'windows-x86-reference-lane-stays-host-native',
              detail:
                'Windows x86 comparison-report execution stays host-native, so the Docker container provider was not selected for this lane.'
            }
            : options.executionMode === 'auto' &&
                options.blockedReason === 'windows-host-runtime-surface-contaminated' &&
                options.containerEvaluated
              ? {
                  provider: selectedContainerProvider,
                  outcome: 'rejected',
                  reason: 'auto-required-docker-because-host-runtime-conflict-but-provider-unavailable',
                  detail: `Validated Windows host runtime facts required Docker, but ${describeUnavailableContainerProvider(
                    options.containerImage
                      ? {
                          image: options.containerImage,
                          provider: selectedContainerProvider,
                          runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                          hostPlatform: options.platform,
                          dockerCliAvailable: options.dockerCliAvailable ?? false,
                          dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                          windowsContainerCapabilityAvailable:
                            options.containerCapabilityAvailable ?? false,
                          windowsContainerHostMode: options.containerHostMode,
                          imageAvailable: options.containerImageAvailable ?? false,
                          notes: []
                        }
                      : undefined,
                    {
                      configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                      configuredLinuxContainerImage: options.configuredLinuxContainerImage
                    }
                  )}`
                }
          : {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'docker-container-image-unavailable',
              detail: describeUnavailableContainerProvider(
                options.containerImage
                  ? {
                      image: options.containerImage,
                      provider: selectedContainerProvider,
                      runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                      hostPlatform: options.platform,
                      dockerCliAvailable: options.dockerCliAvailable ?? false,
                      dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                      windowsContainerCapabilityAvailable: options.containerCapabilityAvailable ?? false,
                      windowsContainerHostMode: options.containerHostMode,
                      imageAvailable: options.containerImageAvailable ?? false,
                      notes: []
                    }
                  : undefined,
                {
                  configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                  configuredLinuxContainerImage: options.configuredLinuxContainerImage
                }
              )
            }
      );
    }
  }

  if (options.selectedProvider === 'host-native') {
    decisions.push({
      provider: 'host-native',
      outcome: 'selected',
      reason:
        hostProviderRequested
          ? 'provider-request-host-selected-host-native'
          : options.executionMode === 'host-only'
          ? 'execution-mode-host-only-selected-host-native'
          : windowsAutoDockerMissing
            ? 'auto-selected-host-native-because-docker-not-installed'
            : 'host-native-labview-cli-selected',
      detail:
        hostProviderRequested
          ? 'Host provider was requested and host-native LabVIEW 2025 or newer plus LabVIEWCLI were available.'
          : options.executionMode === 'host-only'
          ? 'Host-only execution was requested and host-native LabVIEW 2025 or newer plus LabVIEWCLI were available.'
          : windowsAutoDockerMissing
            ? 'Auto execution selected host-native LabVIEW 2025 or newer plus LabVIEWCLI because Docker Desktop was not detected on Windows.'
            : options.bitness === 'x86'
              ? 'Host-native LabVIEW 2025 or newer and LabVIEWCLI were available, and the Windows x86 lane prefers host-native execution.'
              : 'Host-native LabVIEW 2025 or newer and LabVIEWCLI were available for comparison-report execution.'
    });
    return decisions;
  }

  decisions.push({
    provider: 'host-native',
    outcome: 'rejected',
    reason: deriveHostNativeRejectedReason(options),
    detail: deriveHostNativeRejectedDetail(options)
  });
  return decisions;
}
