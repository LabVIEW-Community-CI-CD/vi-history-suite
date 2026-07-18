import type {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution
} from '../comparisonReportPacket';

/**
 * Pure Windows cold-launch recovery-eligibility predicate extracted verbatim from
 * comparisonReportRuntimeExecution.
 *
 * VHS-REQ-148 (Windows host-native parity): a Windows host-native `labview-cli`
 * compare whose first attempt failed with the cold-launch VI Server connect race
 * (`labview-cli-connection-failed` / `-350000`) is retried exactly once. Attempt 1
 * launches LabVIEW and leaves it resident and warming, so attempt 2 connects on the
 * same derived `-PortNumber`. The windows-container provider (its own in-script
 * retry) and the Linux paths are deliberately excluded; container/headless failures
 * are handled by the dedicated recovery branches. Isolated from runtime-execution
 * orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-148.
 */
export function shouldAttemptWindowsColdLaunchRecovery(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  return (
    record.runtimeSelection.platform === 'win32' &&
    record.runtimeSelection.provider === 'host-native' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    execution.state === 'failed' &&
    execution.failureReason === 'labview-cli-connection-failed'
  );
}
