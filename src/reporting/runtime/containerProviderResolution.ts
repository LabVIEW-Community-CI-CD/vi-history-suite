import type {
  RuntimePlatform,
  ComparisonRuntimeProvider,
  WindowsContainerProviderFacts
} from '../comparisonRuntimeLocator';

/**
 * Pure container-provider resolution predicates extracted verbatim from
 * comparisonRuntimeLocator. `resolveContainerProvider` collapses the observed
 * provider (or Windows/Linux host-mode fallback) to a concrete container provider;
 * `resolveContainerRuntimePlatform` derives the concrete runtime platform from the
 * same facts. Both are consumed broadly by the locator's selection paths and are
 * imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function resolveContainerProvider(
  facts: WindowsContainerProviderFacts
): Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'> {
  return facts.provider ?? (facts.windowsContainerHostMode === 'linux' ? 'linux-container' : 'windows-container');
}

export function resolveContainerRuntimePlatform(
  facts: WindowsContainerProviderFacts
): Extract<RuntimePlatform, 'win32' | 'linux'> {
  return facts.runtimePlatform ?? (resolveContainerProvider(facts) === 'linux-container' ? 'linux' : 'win32');
}
