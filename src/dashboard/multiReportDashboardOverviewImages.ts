import type { MultiReportDashboardImageAsset } from './multiReportDashboard';

export function groupOverviewImageAssets(
  assets: readonly MultiReportDashboardImageAsset[]
): Array<{
  caption: string;
  images: MultiReportDashboardImageAsset[];
}> {
  const groups = new Map<
    string,
    {
      caption: string;
      originalOrder: number;
      images: MultiReportDashboardImageAsset[];
    }
  >();

  for (const [index, asset] of assets.entries()) {
    const existing = groups.get(asset.caption);
    if (existing) {
      existing.images.push(asset);
      continue;
    }

    groups.set(asset.caption, {
      caption: asset.caption,
      originalOrder: index,
      images: [asset]
    });
  }

  return [...groups.values()]
    .sort((left, right) => {
      const priorityDifference =
        deriveOverviewCaptionPriority(left.caption) - deriveOverviewCaptionPriority(right.caption);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return left.originalOrder - right.originalOrder;
    })
    .map((group) => ({
      caption: group.caption,
      images: group.images.sort((left, right) => left.position - right.position)
    }));
}

export function deriveOverviewCaptionPriority(caption: string): number {
  const normalized = caption.trim().toLowerCase();
  if (normalized === 'block diagram overview') {
    return 0;
  }

  if (normalized === 'front panel overview') {
    return 1;
  }

  return 2;
}
