import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { archiveComparisonReportSource } from '../dashboard/comparisonReportArchive';
import {
  buildAndPersistMultiReportDashboard,
  BuildMultiReportDashboardResult,
  MultiReportDashboardRecord
} from '../dashboard/multiReportDashboard';
import {
  executeHarnessComparisonReportForCommit,
  HarnessReportSmokeDeps,
  HarnessReportSmokeOptions
} from './harnessReportSmoke';
import { ensureHarnessClone } from './harnessSmoke';
import {
  evaluateViEligibilityForFsPath,
  loadViHistoryViewModelFromFsPath,
  ViHistoryViewModel
} from '../services/viHistoryModel';
import { getRepoHead } from '../git/gitCli';
import { getCanonicalHarnessDefinition } from './canonicalHarnesses';

export interface HarnessDashboardSmokeOptions extends HarnessReportSmokeOptions {
  dashboardCommitWindow?: number;
}

export interface HarnessDashboardSmokePairSummary {
  pairId?: string;
  selectedHash: string;
  baseHash: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  runtimeProvider?: string;
  runtimeEngine?: string;
  generatedReportExists: boolean;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
  sourceRecordFilePath?: string;
}

export interface HarnessDashboardSmokeReport {
  harnessId: string;
  repositoryUrl: string;
  cloneDirectory: string;
  targetRelativePath: string;
  head: string;
  generatedAt: string;
  eligible: boolean;
  signature: ViHistoryViewModel['signature'];
  dashboardCommitWindow: number;
  comparePairCount: number;
  dashboardFilePath: string;
  dashboardJsonFilePath: string;
  dashboardWindowCompletenessState: MultiReportDashboardRecord['summary']['windowCompletenessState'];
  dashboardArchivedPairCount: number;
  dashboardMissingPairCount: number;
  dashboardGeneratedReportCount: number;
  dashboardMetadataPairCount: number;
  dashboardOverviewImageCount: number;
  dashboardDetailItemCount: number;
  dashboardProviderSummaries: MultiReportDashboardRecord['summary']['providerSummaries'];
  pairSummaries: HarnessDashboardSmokePairSummary[];
}

export interface HarnessDashboardSmokeDeps extends HarnessReportSmokeDeps {
  executeHarnessComparisonReportForCommit?: typeof executeHarnessComparisonReportForCommit;
  buildDashboard?: (
    storageRoot: string,
    model: ViHistoryViewModel
  ) => Promise<BuildMultiReportDashboardResult>;
}

export async function runHarnessDashboardSmoke(
  harnessId: string,
  options: HarnessDashboardSmokeOptions,
  deps: HarnessDashboardSmokeDeps = {}
): Promise<{
  report: HarnessDashboardSmokeReport;
  reportJsonPath: string;
  reportMarkdownPath: string;
  reportHtmlPath: string;
}> {
  const definition = getCanonicalHarnessDefinition(harnessId);
  const cloneDirectory = await (deps.ensureHarnessClone ?? ensureHarnessClone)(
    definition,
    options.cloneRoot,
    deps
  );
  const targetAbsolutePath = path.join(cloneDirectory, definition.targetRelativePath);
  const historyLimit = Math.max(3, options.dashboardCommitWindow ?? 3);
  const [head, model, eligibility] = await Promise.all([
    (deps.getRepoHead ?? getRepoHead)(cloneDirectory),
    (deps.loadViHistoryViewModelFromFsPath ?? loadViHistoryViewModelFromFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false,
      historyLimit
    }),
    (deps.evaluateViEligibilityForFsPath ?? evaluateViEligibilityForFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false
    })
  ]);
  const dashboardModel = {
    ...model,
    commits: model.commits.slice(0, historyLimit)
  };
  const pairCommits = dashboardModel.commits.filter((commit) => Boolean(commit.previousHash));
  const pairSummaries: HarnessDashboardSmokePairSummary[] = [];

  for (const compareCommit of pairCommits) {
    const execution = await (
      deps.executeHarnessComparisonReportForCommit ?? executeHarnessComparisonReportForCommit
    )(
      definition,
      cloneDirectory,
      head,
      dashboardModel,
      eligibility.signature,
      compareCommit,
      {
        ...options,
        historyLimit
      },
      {
        ...deps,
        archiveComparisonReportSource:
          deps.archiveComparisonReportSource ?? archiveComparisonReportSource
      },
      true
    );
    pairSummaries.push({
      pairId: execution.archivedSourceRecord?.archivePlan.pairId,
      selectedHash: execution.record.selectedHash,
      baseHash: execution.record.baseHash,
      reportStatus: execution.record.reportStatus,
      runtimeExecutionState: execution.record.runtimeExecutionState,
      runtimeProvider: execution.record.runtimeSelection.provider,
      runtimeEngine: execution.record.runtimeSelection.engine,
      generatedReportExists: execution.record.runtimeExecution.reportExists,
      packetFilePath:
        execution.archivedSourceRecord?.archivePlan.packetFilePath ?? execution.packetFilePath,
      reportFilePath:
        execution.archivedSourceRecord?.archivePlan.reportFilePath ?? execution.reportFilePath,
      metadataFilePath:
        execution.archivedSourceRecord?.archivePlan.metadataFilePath ?? execution.metadataFilePath,
      sourceRecordFilePath: execution.archivedSourceRecord?.archivePlan.sourceRecordFilePath
    });
  }

  const storageRoot = path.join(options.reportRoot, definition.id, 'workspace-storage');
  const dashboard = await (deps.buildDashboard ?? buildAndPersistMultiReportDashboard)(
    storageRoot,
    dashboardModel
  );
  const report: HarnessDashboardSmokeReport = {
    harnessId: definition.id,
    repositoryUrl: definition.repositoryUrl,
    cloneDirectory,
    targetRelativePath: definition.targetRelativePath,
    head,
    generatedAt: (deps.now ?? defaultNow)(),
    eligible: model.eligible,
    signature: eligibility.signature,
    dashboardCommitWindow: dashboardModel.commits.length,
    comparePairCount: pairCommits.length,
    dashboardFilePath: dashboard.htmlFilePath,
    dashboardJsonFilePath: dashboard.jsonFilePath,
    dashboardWindowCompletenessState: dashboard.record.summary.windowCompletenessState,
    dashboardArchivedPairCount: dashboard.record.summary.archivedPairCount,
    dashboardMissingPairCount: dashboard.record.summary.missingPairCount,
    dashboardGeneratedReportCount: dashboard.record.summary.generatedReportCount,
    dashboardMetadataPairCount: dashboard.record.summary.reportMetadataPairCount,
    dashboardOverviewImageCount: dashboard.record.summary.overviewImageCount,
    dashboardDetailItemCount: dashboard.record.summary.detailItemCount,
    dashboardProviderSummaries: dashboard.record.summary.providerSummaries,
    pairSummaries
  };

  const outputDirectory = path.join(options.reportRoot, definition.id);
  await (deps.mkdir ?? fs.mkdir)(outputDirectory, { recursive: true });
  const reportJsonPath = path.join(outputDirectory, 'dashboard-smoke.json');
  const reportMarkdownPath = path.join(outputDirectory, 'dashboard-smoke.md');
  const reportHtmlPath = path.join(outputDirectory, 'dashboard-smoke.html');

  await (deps.writeFile ?? fs.writeFile)(reportJsonPath, JSON.stringify(report, null, 2));
  await (deps.writeFile ?? fs.writeFile)(
    reportMarkdownPath,
    renderHarnessDashboardSmokeMarkdown(report)
  );
  await (deps.writeFile ?? fs.writeFile)(reportHtmlPath, renderHarnessDashboardSmokeHtml(report));

  return { report, reportJsonPath, reportMarkdownPath, reportHtmlPath };
}

export function renderHarnessDashboardSmokeMarkdown(report: HarnessDashboardSmokeReport): string {
  const pairLines = report.pairSummaries
    .map(
      (pair) =>
        `- \`${pair.selectedHash.slice(0, 8)}\` vs \`${pair.baseHash.slice(0, 8)}\` :: status=${pair.reportStatus} runtime=${pair.runtimeExecutionState} provider=${pair.runtimeProvider ?? 'none'} engine=${pair.runtimeEngine ?? 'none'} metadata=${pair.generatedReportExists ? 'yes' : 'no'}`
    )
    .join('\n');

  return `# Harness Dashboard Smoke

- Harness: ${report.harnessId}
- Repository URL: ${report.repositoryUrl}
- Clone directory: ${report.cloneDirectory}
- Target path: ${report.targetRelativePath}
- HEAD: ${report.head}
- Eligible: ${report.eligible ? 'yes' : 'no'}
- Signature: ${report.signature}
- Dashboard commit window: ${report.dashboardCommitWindow}
- Compare pair count: ${report.comparePairCount}
- Dashboard completeness: ${report.dashboardWindowCompletenessState}
- Dashboard archived pairs: ${report.dashboardArchivedPairCount}
- Dashboard missing pairs: ${report.dashboardMissingPairCount}
- Dashboard generated reports: ${report.dashboardGeneratedReportCount}
- Dashboard metadata pairs: ${report.dashboardMetadataPairCount}
- Dashboard overview images: ${report.dashboardOverviewImageCount}
- Dashboard detail items: ${report.dashboardDetailItemCount}
- Dashboard HTML: ${report.dashboardFilePath}
- Dashboard JSON: ${report.dashboardJsonFilePath}
- Provider summaries: ${report.dashboardProviderSummaries.map((summary) => `${summary.label}=${summary.pairCount}`).join(' | ') || 'none'}
- Generated at: ${report.generatedAt}

## Pair Summaries

${pairLines || '- none'}
`;
}

export function renderHarnessDashboardSmokeHtml(report: HarnessDashboardSmokeReport): string {
  const pairRows = report.pairSummaries
    .map(
      (pair) => `<tr>
  <td><code>${escapeHtml(pair.selectedHash.slice(0, 8))}</code></td>
  <td><code>${escapeHtml(pair.baseHash.slice(0, 8))}</code></td>
  <td>${escapeHtml(pair.reportStatus)}</td>
  <td>${escapeHtml(pair.runtimeExecutionState)}</td>
  <td>${escapeHtml(pair.runtimeProvider ?? 'none')}</td>
  <td>${escapeHtml(pair.runtimeEngine ?? 'none')}</td>
  <td>${pair.generatedReportExists ? 'yes' : 'no'}</td>
</tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Harness Dashboard Smoke</title>
    <style>
      body { font-family: sans-serif; margin: 24px; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 8px 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
      code { word-break: break-all; }
    </style>
  </head>
  <body>
    <h1>Harness Dashboard Smoke</h1>
    <div class="meta">
      <div><strong>Harness:</strong> ${escapeHtml(report.harnessId)}</div>
      <div><strong>Repository URL:</strong> ${escapeHtml(report.repositoryUrl)}</div>
      <div><strong>Target path:</strong> ${escapeHtml(report.targetRelativePath)}</div>
      <div><strong>HEAD:</strong> <code>${escapeHtml(report.head)}</code></div>
      <div><strong>Eligible:</strong> ${report.eligible ? 'yes' : 'no'}</div>
      <div><strong>Signature:</strong> ${escapeHtml(report.signature)}</div>
      <div><strong>Dashboard commit window:</strong> ${report.dashboardCommitWindow}</div>
      <div><strong>Compare pair count:</strong> ${report.comparePairCount}</div>
      <div><strong>Dashboard completeness:</strong> ${escapeHtml(report.dashboardWindowCompletenessState)}</div>
      <div><strong>Dashboard archived pairs:</strong> ${report.dashboardArchivedPairCount}</div>
      <div><strong>Dashboard missing pairs:</strong> ${report.dashboardMissingPairCount}</div>
      <div><strong>Dashboard generated reports:</strong> ${report.dashboardGeneratedReportCount}</div>
      <div><strong>Dashboard metadata pairs:</strong> ${report.dashboardMetadataPairCount}</div>
      <div><strong>Dashboard overview images:</strong> ${report.dashboardOverviewImageCount}</div>
      <div><strong>Dashboard detail items:</strong> ${report.dashboardDetailItemCount}</div>
      <div><strong>Dashboard HTML:</strong> ${escapeHtml(report.dashboardFilePath)}</div>
      <div><strong>Dashboard JSON:</strong> ${escapeHtml(report.dashboardJsonFilePath)}</div>
      <div><strong>Provider summaries:</strong> ${escapeHtml(
        report.dashboardProviderSummaries.map((summary) => `${summary.label}=${summary.pairCount}`).join(' | ') || 'none'
      )}</div>
      <div><strong>Generated at:</strong> ${escapeHtml(report.generatedAt)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Selected</th>
          <th>Base</th>
          <th>Report status</th>
          <th>Runtime</th>
          <th>Provider</th>
          <th>Engine</th>
          <th>Generated report</th>
        </tr>
      </thead>
      <tbody>
        ${pairRows}
      </tbody>
    </table>
  </body>
</html>`;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
