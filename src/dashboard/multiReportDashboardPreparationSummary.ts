import type { MultiReportDashboardPreparationSummary } from './multiReportDashboard';

export function formatDurationMinutesSeconds(totalSeconds: number): string {
  const boundedSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(boundedSeconds / 60);
  const seconds = boundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatSignedDurationMinutesSeconds(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '+';
  return `${sign}${formatDurationMinutesSeconds(Math.abs(totalSeconds))}`;
}

export function renderPreparationSummary(
  summary: MultiReportDashboardPreparationSummary
): string {
  if (summary.mode === 'retained-evidence-complete') {
    return 'All adjacent retained pairs already had retained comparison evidence before dashboard concentration began.';
  }

  if (summary.mode === 'backfilled-before-build') {
    const outcomeParts: string[] = [];
    if (summary.preparedGeneratedReportCount > 0) {
      outcomeParts.push(
        `${summary.preparedGeneratedReportCount} generated report${summary.preparedGeneratedReportCount === 1 ? '' : 's'}`
      );
    }
    if (summary.preparedBlockedPairCount > 0) {
      outcomeParts.push(
        `${summary.preparedBlockedPairCount} blocked pair${summary.preparedBlockedPairCount === 1 ? '' : 's'}`
      );
    }
    if (summary.preparedFailedPairCount > 0) {
      outcomeParts.push(
        `${summary.preparedFailedPairCount} failed pair${summary.preparedFailedPairCount === 1 ? '' : 's'}`
      );
    }
    if (summary.preparedNoGeneratedReportCount > 0) {
      outcomeParts.push(
        `${summary.preparedNoGeneratedReportCount} pair${summary.preparedNoGeneratedReportCount === 1 ? '' : 's'} without a generated report`
      );
    }
    if (summary.preparedMissingRetainedArchiveCount > 0) {
      outcomeParts.push(
        `${summary.preparedMissingRetainedArchiveCount} pair${summary.preparedMissingRetainedArchiveCount === 1 ? '' : 's'} without retained archive evidence`
      );
    }
    const baseSummary = `${summary.preparedPairCount} adjacent pair(s) were refreshed for retained comparison evidence before this dashboard was concentrated.`;
    if (outcomeParts.length === 0) {
      return baseSummary;
    }

    const needsFollowUpGuidance =
      summary.preparedBlockedPairCount > 0 ||
      summary.preparedFailedPairCount > 0 ||
      summary.preparedNoGeneratedReportCount > 0 ||
      summary.preparedMissingRetainedArchiveCount > 0;
    return `${baseSummary} Refresh outcomes: ${outcomeParts.join(', ')}.${needsFollowUpGuidance ? ' Review the pair ledger or Open compare for runtime doctor details.' : ''}`;
  }

  if (summary.mode === 'seeded-retained-before-build') {
    const seededCount = summary.seededImportedPairCount ?? 0;
    const baseSummary =
      `${seededCount} adjacent pair(s) were seeded from retained evidence before this dashboard was concentrated.`;
    if (summary.pairsNeedingEvidenceCount <= 0) {
      return `${baseSummary} No additional local pair refresh was needed from Open dashboard.`;
    }

    return `${baseSummary} ${summary.pairsNeedingEvidenceCount} adjacent pair(s) remain missing in the retained evidence set, and Open dashboard did not attempt a local pair refresh during this review.`;
  }

  return `${summary.pairsNeedingEvidenceCount} adjacent pair(s) still lacked retained comparison evidence, and this build could not refresh them from Open dashboard. This dashboard concentrates the currently retained archive set only.`;
}
