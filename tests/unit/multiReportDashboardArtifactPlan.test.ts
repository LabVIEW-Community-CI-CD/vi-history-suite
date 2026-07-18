import { describe, expect, it } from 'vitest';

import { buildMultiReportDashboardArtifactPlan } from '../../src/dashboard/multiReportDashboardArtifactPlan';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';

function model(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryRoot: '/repo',
    relativePath: 'src/Foo.vi',
    commits: [{ hash: 'aaaa' }, { hash: 'bbbb' }],
    ...overrides
  } as ViHistoryViewModel;
}

describe('buildMultiReportDashboardArtifactPlan', () => {
  it('nests the dashboard directory under storageRoot/dashboards/<repoId>/<fileId>/<windowId>', () => {
    const plan = buildMultiReportDashboardArtifactPlan('/storage', model());
    const normalized = plan.dashboardDirectory.replace(/\\/g, '/');
    expect(normalized.startsWith('/storage/dashboards/')).toBe(true);
    expect(normalized.split('/').filter(Boolean)).toHaveLength(5);
    expect(plan.jsonFilePath.replace(/\\/g, '/')).toBe(`${normalized}/dashboard.json`);
    expect(plan.htmlFilePath.replace(/\\/g, '/')).toBe(`${normalized}/dashboard.html`);
    expect(plan.assetsDirectory.replace(/\\/g, '/')).toBe(`${normalized}/assets`);
  });

  it('is deterministic for identical inputs and diverges on path or commit-window change', () => {
    const a = buildMultiReportDashboardArtifactPlan('/storage', model());
    const b = buildMultiReportDashboardArtifactPlan('/storage', model());
    expect(a.dashboardDirectory).toBe(b.dashboardDirectory);

    const differentFile = buildMultiReportDashboardArtifactPlan(
      '/storage',
      model({ relativePath: 'src/Bar.vi' })
    );
    expect(differentFile.fileId).not.toBe(a.fileId);

    const differentWindow = buildMultiReportDashboardArtifactPlan(
      '/storage',
      model({ commits: [{ hash: 'cccc' }] as never })
    );
    expect(differentWindow.windowId).not.toBe(a.windowId);
  });
});
