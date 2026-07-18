import { joinPreservingExplicitPathStyle } from '../support/pathStyle';
import { createDeterministicId } from '../support/deterministicId';
import type { ViHistoryViewModel } from '../services/viHistoryModel';
import type { MultiReportDashboardArtifactPlan } from './multiReportDashboard';

const DASHBOARDS_DIRECTORY = 'dashboards';

export function buildMultiReportDashboardArtifactPlan(
  storageRoot: string,
  model: ViHistoryViewModel
): MultiReportDashboardArtifactPlan {
  const repoId = createDeterministicId(model.repositoryRoot);
  const fileId = createDeterministicId(`${model.repositoryRoot}\n${model.relativePath}`);
  const windowId = createDeterministicId(model.commits.map((commit) => commit.hash).join('\n'));
  const dashboardDirectory = joinPreservingExplicitPathStyle(
    storageRoot,
    DASHBOARDS_DIRECTORY,
    repoId,
    fileId,
    windowId
  );

  return {
    repoId,
    fileId,
    windowId,
    dashboardDirectory,
    jsonFilePath: joinPreservingExplicitPathStyle(dashboardDirectory, 'dashboard.json'),
    htmlFilePath: joinPreservingExplicitPathStyle(dashboardDirectory, 'dashboard.html'),
    assetsDirectory: joinPreservingExplicitPathStyle(dashboardDirectory, 'assets')
  };
}
