import type { WindowsContainerProviderFacts } from '../comparisonRuntimeLocator';

/**
 * Legacy Windows container provider-facts builder extracted verbatim from
 * comparisonRuntimeLocator. Synthesizes a `WindowsContainerProviderFacts` object
 * from a legacy image-inspect probe result (image reference + availability),
 * populating the derived docker/host-mode fields and an explanatory note. Isolated
 * from provider-probing orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function buildLegacyWindowsContainerProviderFacts(
  image: string,
  hostPlatform: NodeJS.Platform,
  imageAvailable: boolean
): WindowsContainerProviderFacts {
  return {
    image,
    provider: 'windows-container',
    runtimePlatform: 'win32',
    hostPlatform,
    dockerCliAvailable: imageAvailable,
    dockerDaemonReachable: imageAvailable,
    windowsContainerCapabilityAvailable: imageAvailable,
    windowsContainerHostMode: imageAvailable ? 'windows' : undefined,
    imageAvailable,
    notes: imageAvailable
      ? [`Windows container image ${image} was available through the legacy image-inspect probe.`]
      : [`Legacy Windows container image probe did not find image ${image} on the current host.`]
  };
}
