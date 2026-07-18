import type { ComparisonReportPacketRecord } from './comparisonReportPacket';

/**
 * Derive the concise blocked reason surfaced for a comparison-report packet
 * record. Extracted verbatim from comparisonReportAction: a runtime-blocked record
 * reports its runtime-selection blockedReason, a preflight-blocked record reports
 * its preflight blockedReason, and any other status has no blocked reason. Pure
 * projection isolated from the action orchestration and imported back to preserve
 * behavior.
 *
 * Supporting VHS-REQ-624.
 */
export function deriveComparisonBlockedReason(
  record: ComparisonReportPacketRecord
): string | undefined {
  return record.reportStatus === 'blocked-runtime'
    ? record.runtimeSelection?.blockedReason
    : record.reportStatus === 'blocked-preflight'
      ? record.preflight?.blockedReason
      : undefined;
}
