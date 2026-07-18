import { isWorktreeRevision } from '../git/gitCli';

/**
 * VHS-REQ-641: format the revision identifier shown in the comparison-report
 * revision-context cards. A working-tree comparison uses the `WORKTREE` sentinel
 * as its selected revision id, which must render as a human-meaningful label
 * rather than the raw sentinel token in the `<code>` chip. Committed revisions
 * render their hash verbatim; an absent id falls back to `not retained`.
 *
 * Extracted verbatim from comparisonReportPacket and re-exported to preserve the
 * public API while isolating this pure revision-display formatter from packet
 * orchestration. Supporting VHS-REQ-641.
 */
export function formatComparisonRevisionHashDisplay(value: string | undefined): string {
  if (value !== undefined && isWorktreeRevision(value)) {
    return 'Working tree (uncommitted)';
  }
  return value ?? 'not retained';
}
