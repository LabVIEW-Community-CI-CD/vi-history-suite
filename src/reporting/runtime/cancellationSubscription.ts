import type { ComparisonRuntimeCancellationToken } from '../comparisonReportRuntimeExecution';

/**
 * Pure cancellation-subscription helper extracted verbatim from
 * comparisonReportRuntimeExecution. `subscribeToCancellation` wires a listener to the
 * optional cancellation token's `onCancellationRequested` event and returns an
 * idempotent unsubscribe callback (a no-op when the token or event is absent).
 * Isolated from runtime-execution orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-659.
 */
export function subscribeToCancellation(
  cancellationToken: ComparisonRuntimeCancellationToken | undefined,
  listener: () => void
): () => void {
  if (!cancellationToken?.onCancellationRequested) {
    return () => undefined;
  }

  const disposable = cancellationToken.onCancellationRequested(listener);
  return () => {
    disposable?.dispose?.();
  };
}
