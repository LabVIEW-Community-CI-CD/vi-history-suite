// Windows runtime-observation formatting helpers (supporting VHS-REQ-659).
// Extracted verbatim from comparisonReportRuntimeExecution to keep pure
// diagnostics string formatting separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import type {
  RuntimeObservedProcess,
  WindowsTcpListenerObservation
} from '../comparisonReportRuntimeExecution';

// Render observed runtime processes as a de-duplicated `image (pid N)` list
// joined with ` | ` for preflight/doctor notes.
export function describeObservedRuntimeProcesses(processes: RuntimeObservedProcess[]): string {
  const descriptions = [...new Map(
    processes.map((processInfo) => [
      `${processInfo.imageName}:${String(processInfo.pid)}`,
      `${processInfo.imageName} (pid ${String(processInfo.pid)})`
    ])
  ).values()];
  return descriptions.join(' | ');
}

// Render observed Windows TCP listeners as a `name listening on addr:port` list
// joined with ` | ` for preflight/doctor notes.
export function describeObservedWindowsTcpListeners(
  listeners: WindowsTcpListenerObservation[]
): string {
  return listeners
    .map((listener) =>
      `${listener.processName ?? `pid ${String(listener.pid)}`} listening on ${listener.localAddress}:${String(
        listener.localPort
      )}`
    )
    .join(' | ');
}
