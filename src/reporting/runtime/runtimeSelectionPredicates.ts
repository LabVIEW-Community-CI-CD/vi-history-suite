import type { ComparisonReportPacketRecord } from '../comparisonReportPacket';

/**
 * Pure runtime-selection predicates extracted verbatim from
 * comparisonReportRuntimeExecution to isolate them from runtime orchestration.
 *
 * `resolveEffectiveRuntimePlatform` collapses a selection's optional
 * container-runtime platform over its host platform; it is consumed broadly by
 * the orchestration path and by the effective-command-timeout policy.
 * `isHeadlessLabviewCliExecution` detects a `-Headless` argument in a resolved
 * LabVIEWCLI argv. Both are re-exported by the parent to preserve the public API.
 *
 * Supporting VHS-REQ-156.
 */
export function resolveEffectiveRuntimePlatform(
  selection: ComparisonReportPacketRecord['runtimeSelection']
): ComparisonReportPacketRecord['runtimeSelection']['platform'] {
  return selection.containerRuntimePlatform ?? selection.platform;
}

export function isHeadlessLabviewCliExecution(args: string[] | undefined): boolean {
  if (!args || args.length === 0) {
    return false;
  }

  const headlessIndex = args.findIndex((argument) => argument.toLowerCase() === '-headless');
  return headlessIndex >= 0;
}
