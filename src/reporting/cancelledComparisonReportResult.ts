import type { ComparisonReportActionResult } from './comparisonReportAction';
import type { persistComparisonReportPacket } from './comparisonReportPacket';
import type { executeComparisonReport } from './comparisonReportRuntimeExecution';
import { deriveComparisonBlockedReason } from './comparisonBlockedReason';

/**
 * Pure cancelled-outcome result builder extracted verbatim from comparisonReportAction.
 * `buildCancelledComparisonReportResult` projects a persisted or executed comparison
 * packet onto a `cancelled` {@link ComparisonReportActionResult}, tagging the
 * cancellation stage and optionally the retained-archive availability and archive
 * failure reason. Isolated from action orchestration and imported back to preserve
 * behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function buildCancelledComparisonReportResult(
  cancellationStage: string,
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>,
  options: {
    retainedArchiveAvailable?: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  } = {}
): ComparisonReportActionResult {
  const result: ComparisonReportActionResult = {
    outcome: 'cancelled',
    cancellationStage,
    reportStatus: packet.record.reportStatus,
    runtimeExecutionState: packet.record.runtimeExecutionState,
    blockedReason: deriveComparisonBlockedReason(packet.record),
    runtimeFailureReason: packet.record.runtimeExecution.failureReason,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedReportExists: packet.record.runtimeExecution.reportExists
  };
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }
  return result;
}
