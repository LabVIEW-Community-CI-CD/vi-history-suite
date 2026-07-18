import type { ComparisonRuntimeSelection } from './comparisonRuntimeLocator';

/**
 * Pure provider-request label deriver extracted verbatim from comparisonReportPacket.
 * `deriveProviderRequestLabel` resolves the human-facing provider-request label from a
 * runtime selection: an explicit `requestedProvider` wins, otherwise the execution mode
 * maps `host-only`->`host` / `docker-only`->`docker`, falling back to the raw execution
 * mode or `auto`. Isolated from packet orchestration and imported back to preserve
 * behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function deriveProviderRequestLabel(runtimeSelection: ComparisonRuntimeSelection): string {
  if (runtimeSelection.requestedProvider) {
    return runtimeSelection.requestedProvider;
  }

  if (runtimeSelection.executionMode === 'host-only') {
    return 'host';
  }

  if (runtimeSelection.executionMode === 'docker-only') {
    return 'docker';
  }

  return runtimeSelection.executionMode ?? 'auto';
}
