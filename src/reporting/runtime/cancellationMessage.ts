/**
 * Pure cancellation-marker appender extracted verbatim from
 * comparisonReportRuntimeExecution. `appendCancellationMessage` idempotently ensures
 * the captured stderr carries the `comparison-command cancelled by user` marker,
 * appending it only when it is not already present. Isolated from runtime-execution
 * orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-659.
 */
export function appendCancellationMessage(stderr: string): string {
  if (/comparison-command cancelled by user/iu.test(stderr)) {
    return stderr;
  }

  return `${stderr}comparison-command cancelled by user\n`;
}
