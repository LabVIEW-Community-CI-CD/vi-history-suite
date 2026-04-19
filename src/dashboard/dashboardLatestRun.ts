import * as path from 'node:path';

import {
  MultiReportDashboardEtaAccuracyContext,
  MultiReportDashboardEtaAccuracyRecord
} from './dashboardEtaAccuracy';
import {
  BuildMultiReportDashboardResult,
  MultiReportDashboardPreparationSummary,
  MultiReportDashboardRecord
} from './multiReportDashboard';

export const DASHBOARD_LATEST_RUN_FILENAME = 'latest-dashboard-run.json';

export interface MultiReportDashboardLatestRunProgressEvent {
  offsetMs: number;
  message: string;
  increment?: number;
}

export interface MultiReportDashboardLatestRunExperimentRecord {
  host: {
    vscodeVersion?: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  configuration: {
    strictRsrcHeader: boolean;
    historyWindowMode: 'auto' | 'capped';
    maxHistoryEntries: number;
    effectiveHistoryEntryCeiling: number;
    providerRequest: 'host' | 'docker';
    labviewVersion?: string;
    labviewBitness?: 'x86' | 'x64';
    windowsContainerImage?: string;
    linuxContainerImage?: string;
  };
  historyWindow: {
    loadedCommitCount: number;
    loadedPairCount: number;
    configuredMaxHistoryEntries: number;
    effectiveHistoryEntryCeiling: number;
    totalCommitCount?: number;
    historyTruncated?: boolean;
    loadedFractionOfTotal?: number;
    decision?: string;
  };
  timings: {
    totalDurationMs: number;
    pairsNeedingEvidenceScanDurationMs: number;
    evidencePreparationDurationMs: number;
    dashboardBuildDurationMs: number;
    dashboardOpenDurationMs: number;
  };
  progress: {
    eventCount: number;
    events: MultiReportDashboardLatestRunProgressEvent[];
  };
}

export interface MultiReportDashboardLatestRunRecord {
  recordedAt: string;
  source: 'vscode-dashboard-action' | 'harness-dashboard-smoke';
  workspaceStorageRoot: string;
  artifactPaths: {
    dashboardsDirectory: string;
    dashboardDirectory: string;
    dashboardJsonFilePath: string;
    dashboardHtmlFilePath: string;
    etaAccuracyFilePath?: string;
  };
  dashboard: {
    generatedAt: string;
    repositoryName: string;
    repositoryRoot: string;
    relativePath: string;
    signature: MultiReportDashboardRecord['signature'];
    commitWindow: MultiReportDashboardRecord['commitWindow'];
    summary: Pick<
      MultiReportDashboardRecord['summary'],
      | 'representedPairCount'
      | 'windowCompletenessState'
      | 'archivedPairCount'
      | 'missingPairCount'
      | 'missingPairIds'
      | 'generatedReportCount'
      | 'reportMetadataPairCount'
      | 'failedPairCount'
      | 'failedPairIds'
      | 'blockedPairCount'
      | 'blockedPairIds'
      | 'overviewImageCount'
      | 'detailItemCount'
      | 'providerSummaries'
    >;
  };
  preparationSummary?: MultiReportDashboardPreparationSummary;
  etaAccuracyRecord?: MultiReportDashboardEtaAccuracyRecord;
  experiment?: MultiReportDashboardLatestRunExperimentRecord;
}

export function buildDashboardLatestRunFilePath(workspaceStorageRoot: string): string {
  return joinPreservingExplicitPathStyle(
    workspaceStorageRoot,
    'dashboards',
    DASHBOARD_LATEST_RUN_FILENAME
  );
}

export function attachDashboardEtaAccuracyContext(
  record: MultiReportDashboardEtaAccuracyRecord | undefined,
  context: MultiReportDashboardEtaAccuracyContext
): MultiReportDashboardEtaAccuracyRecord | undefined {
  if (!record) {
    return undefined;
  }
  return {
    ...record,
    context
  };
}

export function buildDashboardLatestRunRecord(options: {
  source: MultiReportDashboardLatestRunRecord['source'];
  workspaceStorageRoot: string;
  dashboard: BuildMultiReportDashboardResult;
  etaAccuracyRecord?: MultiReportDashboardEtaAccuracyRecord;
  preparationSummary?: MultiReportDashboardPreparationSummary;
  experiment?: MultiReportDashboardLatestRunExperimentRecord;
  recordedAt: string;
}): MultiReportDashboardLatestRunRecord {
  return {
    recordedAt: options.recordedAt,
    source: options.source,
    workspaceStorageRoot: options.workspaceStorageRoot,
    artifactPaths: {
      dashboardsDirectory: joinPreservingExplicitPathStyle(
        options.workspaceStorageRoot,
        'dashboards'
      ),
      dashboardDirectory: options.dashboard.record.artifactPlan.dashboardDirectory,
      dashboardJsonFilePath: options.dashboard.jsonFilePath,
      dashboardHtmlFilePath: options.dashboard.htmlFilePath,
      etaAccuracyFilePath: options.etaAccuracyRecord?.context?.etaAccuracyFilePath
    },
    dashboard: {
      generatedAt: options.dashboard.record.generatedAt,
      repositoryName: options.dashboard.record.repositoryName,
      repositoryRoot: options.dashboard.record.repositoryRoot,
      relativePath: options.dashboard.record.relativePath,
      signature: options.dashboard.record.signature,
      commitWindow: options.dashboard.record.commitWindow,
      summary: {
        representedPairCount: options.dashboard.record.summary.representedPairCount,
        windowCompletenessState: options.dashboard.record.summary.windowCompletenessState,
        archivedPairCount: options.dashboard.record.summary.archivedPairCount,
        missingPairCount: options.dashboard.record.summary.missingPairCount,
        missingPairIds: options.dashboard.record.summary.missingPairIds,
        generatedReportCount: options.dashboard.record.summary.generatedReportCount,
        reportMetadataPairCount: options.dashboard.record.summary.reportMetadataPairCount,
        failedPairCount: options.dashboard.record.summary.failedPairCount,
        failedPairIds: options.dashboard.record.summary.failedPairIds,
        blockedPairCount: options.dashboard.record.summary.blockedPairCount,
        blockedPairIds: options.dashboard.record.summary.blockedPairIds,
        overviewImageCount: options.dashboard.record.summary.overviewImageCount,
        detailItemCount: options.dashboard.record.summary.detailItemCount,
        providerSummaries: options.dashboard.record.summary.providerSummaries
      }
    },
    preparationSummary: options.preparationSummary,
    etaAccuracyRecord: options.etaAccuracyRecord,
    experiment: options.experiment
  };
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (rootPath.startsWith('/')) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  return path.join(rootPath, ...segments);
}
