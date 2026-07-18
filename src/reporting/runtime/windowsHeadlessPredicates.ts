import { isHeadlessLabviewCliExecution } from './runtimeSelectionPredicates';
import type {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution
} from '../comparisonReportPacket';

/**
 * Pure Windows headless recovery predicates extracted verbatim from
 * comparisonReportRuntimeExecution.
 *
 * `wasWindowsHeadlessLabviewCliExecutionRequested` reports whether the run was a
 * headless Windows `labview-cli` execution (windows-container provider, an explicit
 * headless request, or a headless-shaped CLI invocation).
 *
 * `shouldAttemptWindowsHeadlessRecovery` gates the Windows call-by-reference headless
 * recovery: a failed win32 `labview-cli` run whose diagnostic reason is
 * `labview-cli-call-by-reference` and which was a headless request.
 *
 * Isolated from runtime-execution orchestration and imported back to preserve behavior.
 * Supporting VHS-REQ-657.
 */
export function wasWindowsHeadlessLabviewCliExecutionRequested(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  return (
    record.runtimeSelection.provider === 'windows-container' ||
    record.runtimeSelection.headlessRequested === true ||
    isHeadlessLabviewCliExecution(execution.args)
  );
}

export function shouldAttemptWindowsHeadlessRecovery(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  return (
    record.runtimeSelection.platform === 'win32' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    execution.state === 'failed' &&
    execution.diagnosticReason === 'labview-cli-call-by-reference' &&
    wasWindowsHeadlessLabviewCliExecutionRequested(record, execution)
  );
}
