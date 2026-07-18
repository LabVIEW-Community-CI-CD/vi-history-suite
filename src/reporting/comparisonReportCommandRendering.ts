import type { ComparisonReportRuntimeExecution } from './comparisonReportPacket';

/**
 * Pure runtime-command renderer extracted verbatim from comparisonReportPacket.
 * `renderCommand` joins the runtime execution's executable and args into a single
 * display string, returning `none` when no executable was recorded. Isolated from
 * packet orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function renderCommand(runtimeExecution: ComparisonReportRuntimeExecution): string {
  if (!runtimeExecution.executable) {
    return 'none';
  }

  return [runtimeExecution.executable, ...(runtimeExecution.args ?? [])].join(' ');
}
