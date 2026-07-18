import { archiveComparisonReportSource } from '../dashboard/comparisonReportArchive';
import { isWorktreeRevision } from '../git/gitCli';

/**
 * Pure archive-eligibility predicate extracted verbatim from comparisonReportAction.
 *
 * VHS-REQ-641 (Phase 3, issue #1366): working-tree comparisons compare uncommitted
 * on-disk bytes. They are retained only when a content-addressed snapshot identity is
 * available (the exact bytes that were compared), which makes the retained pair
 * reproducible/collision-free and lets the dashboard rediscover it through the per-VI
 * snapshot index. A working-tree pair without a snapshot identity (e.g. the runtime did
 * not stage the bytes) stays unarchived, since its evidence could not be
 * content-addressed. Isolated from action orchestration and imported back to preserve
 * behavior.
 *
 * Supporting VHS-REQ-641.
 */
export function canArchiveComparisonReport(
  record: Parameters<typeof archiveComparisonReportSource>[0]
): boolean {
  const hasWorktreeSide =
    isWorktreeRevision(record.selectedHash) || isWorktreeRevision(record.baseHash);
  if (hasWorktreeSide && !record.runtimeExecution?.worktreeSnapshotId) {
    return false;
  }
  return Boolean(
    record.artifactPlan.allowedLocalRootPaths?.[0] &&
      record.artifactPlan.normalizedRelativePath &&
      record.artifactPlan.reportFilename &&
      record.artifactPlan.packetFilename
  );
}
