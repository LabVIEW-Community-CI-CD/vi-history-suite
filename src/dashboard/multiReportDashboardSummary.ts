import { mapPairIdsToOrdinals } from './multiReportDashboardPairOrdinals';
import type {
  MultiReportDashboardEntry,
  MultiReportDashboardEntryEvidenceState
} from './multiReportDashboard';

export function buildDashboardSummary(entries: MultiReportDashboardEntry[]) {
  const representedPairCount = entries.length;
  const archivedPairCount = entries.filter((entry) => entry.archiveStatus === 'archived').length;
  const missingPairCount = entries.filter((entry) => entry.archiveStatus === 'missing').length;
  const missingPairIds = entries
    .filter((entry) => entry.archiveStatus === 'missing')
    .map((entry) => entry.pairId);
  const generatedReportCount = entries.filter((entry) => entry.generatedReportExists).length;
  const reportMetadataPairCount = entries.filter((entry) => Boolean(entry.parsedReport)).length;
  const failedEntries = entries.filter((entry) => entry.pairEvidenceState === 'archived-failed');
  const failedPairCount = failedEntries.length;
  const failedPairIds = failedEntries.map((entry) => entry.pairId);
  const blockedEntries = entries.filter((entry) => entry.pairEvidenceState === 'archived-blocked');
  const blockedPairCount = blockedEntries.length;
  const blockedPairIds = blockedEntries.map((entry) => entry.pairId);
  const overviewSectionCount = entries.reduce(
    (total, entry) => total + (entry.parsedReport?.overviewSections.length ?? 0),
    0
  );
  const overviewImageCount = entries.reduce(
    (total, entry) => total + entry.overviewImageCount,
    0
  );
  const includedAttributeCount = entries.reduce(
    (total, entry) => total + (entry.parsedReport?.includedAttributes.length ?? 0),
    0
  );
  const detailSectionCount = entries.reduce(
    (total, entry) => total + (entry.parsedReport?.detailSections.length ?? 0),
    0
  );
  const detailItemCount = entries.reduce((total, entry) => total + entry.detailItemCount, 0);
  const pairWithOverviewImageCount = entries.filter((entry) => entry.overviewImageCount > 0).length;
  const pairWithDetailCount = entries.filter((entry) => entry.detailItemCount > 0).length;
  const providerCounts = new Map<string, number>();
  const comparedPathCounts = new Map<
    string,
    {
      firstViPath: string;
      secondViPath: string;
      pairIds: Set<string>;
    }
  >();
  const overviewCaptionCounts = new Map<
    string,
    {
      pairIds: Set<string>;
      imageCount: number;
    }
  >();
  const includedAttributeCounts = new Map<
    string,
    {
      includedPairIds: Set<string>;
      excludedPairIds: Set<string>;
    }
  >();
  const detailHeadingCounts = new Map<
    string,
    {
      pairIds: Set<string>;
      itemCount: number;
    }
  >();
  const detailItemCounts = new Map<
    string,
    {
      pairIds: Set<string>;
    }
  >();
  const pairOrdinalById = new Map(entries.map((entry, index) => [entry.pairId, index + 1]));
  for (const entry of entries) {
    const label = entry.runtimeProviderLabel ?? 'none';
    providerCounts.set(label, (providerCounts.get(label) ?? 0) + 1);
    if (entry.parsedReport?.firstViPath || entry.parsedReport?.secondViPath) {
      const firstViPath = entry.parsedReport?.firstViPath ?? 'none';
      const secondViPath = entry.parsedReport?.secondViPath ?? 'none';
      const key = `${firstViPath}\n${secondViPath}`;
      const summary = comparedPathCounts.get(key) ?? {
        firstViPath,
        secondViPath,
        pairIds: new Set<string>()
      };
      summary.pairIds.add(entry.pairId);
      comparedPathCounts.set(key, summary);
    }
    for (const section of entry.parsedReport?.overviewSections ?? []) {
      const summary = overviewCaptionCounts.get(section.caption) ?? {
        pairIds: new Set<string>(),
        imageCount: 0
      };
      summary.pairIds.add(entry.pairId);
      summary.imageCount += section.images.length;
      overviewCaptionCounts.set(section.caption, summary);
    }
    for (const attribute of entry.parsedReport?.includedAttributes ?? []) {
      const summary = includedAttributeCounts.get(attribute.label) ?? {
        includedPairIds: new Set<string>(),
        excludedPairIds: new Set<string>()
      };
      if (attribute.included) {
        summary.includedPairIds.add(entry.pairId);
      } else {
        summary.excludedPairIds.add(entry.pairId);
      }
      includedAttributeCounts.set(attribute.label, summary);
    }
    for (const section of entry.parsedReport?.detailSections ?? []) {
      const summary = detailHeadingCounts.get(section.heading) ?? {
        pairIds: new Set<string>(),
        itemCount: 0
      };
      summary.pairIds.add(entry.pairId);
      summary.itemCount += section.items.length;
      detailHeadingCounts.set(section.heading, summary);
      for (const item of section.items) {
        const itemSummary = detailItemCounts.get(item) ?? {
          pairIds: new Set<string>()
        };
        itemSummary.pairIds.add(entry.pairId);
        detailItemCounts.set(item, itemSummary);
      }
    }
  }
  const providerSummaries = [...providerCounts.entries()]
    .map(([label, pairCount]) => ({ label, pairCount }))
    .sort((left, right) => right.pairCount - left.pairCount || left.label.localeCompare(right.label));
  const comparedPathSummaries = [...comparedPathCounts.values()]
    .map((summary) => ({
      firstViPath: summary.firstViPath,
      secondViPath: summary.secondViPath,
      pairCount: summary.pairIds.size,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => {
      return (
        right.pairCount - left.pairCount ||
        left.firstViPath.localeCompare(right.firstViPath) ||
        left.secondViPath.localeCompare(right.secondViPath)
      );
    });
  const overviewCaptionSummaries = [...overviewCaptionCounts.entries()]
    .map(([caption, summary]) => ({
      caption,
      pairCount: summary.pairIds.size,
      imageCount: summary.imageCount,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => right.pairCount - left.pairCount || left.caption.localeCompare(right.caption));
  const includedAttributeSummaries = [...includedAttributeCounts.entries()]
    .map(([label, summary]) => ({
      label,
      includedPairCount: summary.includedPairIds.size,
      excludedPairCount: summary.excludedPairIds.size,
      includedPairOrdinals: mapPairIdsToOrdinals(summary.includedPairIds, pairOrdinalById),
      excludedPairOrdinals: mapPairIdsToOrdinals(summary.excludedPairIds, pairOrdinalById)
    }))
    .sort((left, right) => {
      const leftTotal = left.includedPairCount + left.excludedPairCount;
      const rightTotal = right.includedPairCount + right.excludedPairCount;
      return rightTotal - leftTotal || left.label.localeCompare(right.label);
    });
  const detailHeadingSummaries = [...detailHeadingCounts.entries()]
    .map(([heading, summary]) => ({
      heading,
      pairCount: summary.pairIds.size,
      itemCount: summary.itemCount,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => right.pairCount - left.pairCount || left.heading.localeCompare(right.heading));
  const detailItemSummaries = [...detailItemCounts.entries()]
    .map(([item, summary]) => ({
      item,
      pairCount: summary.pairIds.size,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => right.pairCount - left.pairCount || left.item.localeCompare(right.item));
  const evidenceStateCounts = new Map<MultiReportDashboardEntryEvidenceState, number>();
  for (const entry of entries) {
    evidenceStateCounts.set(
      entry.pairEvidenceState,
      (evidenceStateCounts.get(entry.pairEvidenceState) ?? 0) + 1
    );
  }
  const evidenceStateSummaries = [...evidenceStateCounts.entries()]
    .map(([state, pairCount]) => ({ state, pairCount }))
    .sort((left, right) => right.pairCount - left.pairCount || left.state.localeCompare(right.state));

  return {
    representedPairCount,
    windowCompletenessState:
      missingPairCount === 0
        ? ('complete' as const)
        : ('incomplete-missing-archives' as const),
    archivedPairCount,
    missingPairCount,
    missingPairIds,
    generatedReportCount,
    reportMetadataPairCount,
    failedPairCount,
    failedPairIds,
    blockedPairCount,
    blockedPairIds,
    overviewSectionCount,
    overviewImageCount,
    includedAttributeCount,
    detailSectionCount,
    detailItemCount,
    pairWithOverviewImageCount,
    pairWithDetailCount,
    providerSummaries,
    comparedPathSummaries,
    overviewCaptionSummaries,
    includedAttributeSummaries,
    detailHeadingSummaries,
    detailItemSummaries,
    evidenceStateSummaries
  };
}
