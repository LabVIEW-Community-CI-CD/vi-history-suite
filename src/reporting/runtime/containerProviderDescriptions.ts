import type {
  RuntimePlatform,
  RuntimeExecutionMode,
  ComparisonRuntimeProvider,
  DockerContainerHostMode,
  WindowsContainerProviderFacts
} from '../comparisonRuntimeLocator';
import { resolveContainerProvider } from './containerProviderResolution';
import { resolveContainerImageForHostMode } from './containerRuntimePaths';

/**
 * Pure container-provider note formatters extracted verbatim from
 * comparisonRuntimeLocator. These build the human-readable "why this provider"
 * strings surfaced in runtime-selection notes for the selected container provider
 * and the various unavailable-provider paths. They depend only on the already
 * extracted pure resolvers (`resolveContainerProvider`,
 * `resolveContainerImageForHostMode`) and locator types, so they carry no
 * orchestration state and are imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function describeContainerProviderLabel(
  provider: Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'>
): string {
  return provider === 'linux-container' ? 'Linux container' : 'Windows container';
}

export function describeUnavailableContainerProvider(
  facts: WindowsContainerProviderFacts | undefined,
  configuredImages: {
    configuredWindowsContainerImage: string;
    configuredLinuxContainerImage: string;
  }
): string {
  if (!facts) {
    return 'the Docker provider facts could not be derived on the current host.';
  }

  const providerLabel = describeContainerProviderLabel(resolveContainerProvider(facts));
  const selectedImage =
    facts.image ||
    resolveContainerImageForHostMode({
      hostMode: facts.windowsContainerHostMode,
      windowsContainerImage: configuredImages.configuredWindowsContainerImage,
      linuxContainerImage: configuredImages.configuredLinuxContainerImage
    });

  if (facts.dockerCliAvailable === false) {
    return `Docker CLI was not available on the current host, so ${providerLabel} image ${selectedImage} could not be used.`;
  }

  if (facts.dockerDaemonReachable === false) {
    return `Docker CLI was present, but the Docker daemon was not reachable, so ${providerLabel} image ${selectedImage} could not be used.`;
  }

  if (facts.windowsContainerCapabilityAvailable === false) {
    return facts.windowsContainerHostMode === 'unknown'
      ? 'Docker daemon was reachable, but the active container engine could not be confirmed as either Windows-container mode or Linux-container mode.'
      : `Docker daemon was reachable in ${facts.windowsContainerHostMode ?? 'unknown'}-container mode, but the selected provider could not be derived.`;
  }

  if (facts.imageAvailable === false) {
    return `${providerLabel} image ${selectedImage} was not present locally on the current host.`;
  }

  return `${providerLabel} image ${selectedImage} was not available to the current host.`;
}

export function describeSelectedContainerProvider(options: {
  provider: Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'>;
  runtimePlatform: Extract<RuntimePlatform, 'win32' | 'linux'>;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  containerImage: string;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  containerCapabilityAvailable?: boolean;
  containerHostMode?: DockerContainerHostMode;
  imageAvailable?: boolean;
  acquisitionState?: 'not-required' | 'required' | 'acquired' | 'failed';
  selectionReason?:
    | 'docker-installed'
    | 'preferred-isolation'
    | 'host-runtime-conflict'
    | 'host-runtime-unavailable'
    | 'host-comparison-tool-missing';
}): string {
  const providerLabel = describeContainerProviderLabel(options.provider);
  const runtimeLabel = options.runtimePlatform === 'linux' ? 'Linux' : 'Windows';
  const capabilitySummary =
    options.dockerCliAvailable === true &&
    options.dockerDaemonReachable === true &&
    options.containerCapabilityAvailable === true &&
    options.imageAvailable === true
      ? `Docker daemon was reachable in ${options.containerHostMode ?? 'unknown'}-container mode with ${providerLabel} image ${options.containerImage} present locally`
      : options.dockerCliAvailable === true &&
          options.dockerDaemonReachable === true &&
          options.containerCapabilityAvailable === true &&
          options.imageAvailable === false
        ? `Docker daemon was reachable in ${options.containerHostMode ?? 'unknown'}-container mode, and ${providerLabel} image ${options.containerImage} will be acquired before launch`
      : `${providerLabel} image ${options.containerImage} was selected`;

  if (options.requestedProvider === 'docker') {
    return `${capabilitySummary} because the Docker provider was requested.`;
  }

  if (options.executionMode === 'docker-only') {
    return `${capabilitySummary} for docker-only execution.`;
  }

  if (options.selectionReason === 'docker-installed') {
    return `${capabilitySummary}, so isolated execution was selected because Docker Desktop is installed and auto execution uses the current Docker engine provider.`;
  }

  if (options.selectionReason === 'host-runtime-conflict') {
    return `${capabilitySummary}, so isolated execution was selected because the validated Windows host runtime surface was contaminated.`;
  }

  if (options.selectionReason === 'host-runtime-unavailable') {
    return `${capabilitySummary}, so isolated execution was selected because no compatible host-native LabVIEW 2025 or newer runtime was located.`;
  }

  if (options.selectionReason === 'host-comparison-tool-missing') {
    return `${capabilitySummary}, so isolated execution was selected because no host comparison tool was available.`;
  }

  return `${capabilitySummary}, so ${runtimeLabel} 64-bit comparison-report execution selected isolated provider execution.`;
}
