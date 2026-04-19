import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { archiveComparisonReportSource } from '../dashboard/comparisonReportArchive';
import {
  buildDashboardPairEtaAccuracyRecord,
  buildPairEtaAccuracySample,
  DASHBOARD_PAIR_ETA_ACCURACY_FILENAME,
  deriveEstimatedPairSeconds,
  isDashboardPairEtaEligible,
  MultiReportDashboardEtaAccuracyRecord
} from '../dashboard/dashboardEtaAccuracy';
import {
  attachDashboardEtaAccuracyContext,
  buildDashboardLatestRunFilePath,
  buildDashboardLatestRunRecord
} from '../dashboard/dashboardLatestRun';
import {
  buildAndPersistMultiReportDashboard,
  BuildMultiReportDashboardResult,
  MultiReportDashboardRecord
} from '../dashboard/multiReportDashboard';
import {
  executeHarnessComparisonReportForCommit,
  applyRuntimeEngineOverride,
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
import { locateComparisonRuntime } from '../reporting/comparisonRuntimeLocator';

export interface HarnessDashboardSmokeOptions extends HarnessReportSmokeOptions {
  dashboardCommitWindow?: number;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  runtimeExecutionTimeoutMs?: number;
  runtimeHeartbeatIntervalMs?: number;
  progressLabel?: string;
}

export interface HarnessDashboardSmokePairSummary {
  pairId?: string;
  pairIndex: number;
  selectedHash: string;
  baseHash: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimeBlockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  generatedReportExists: boolean;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
  sourceRecordFilePath?: string;
  runtimeStdoutPath?: string;
  runtimeStderrPath?: string;
  runtimeDiagnosticLogPath?: string;
  runtimeHeadlessDiagnosticArtifactPaths?: string[];
  runtimeProcessObservationPath?: string;
  actualPreparationSeconds: number;
  estimatedPreparationSeconds?: number;
  absoluteEtaErrorSeconds?: number;
  signedEtaErrorSeconds?: number;
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
  dashboardEtaAccuracyFilePath?: string;
  dashboardEtaAccuracyRecord?: MultiReportDashboardEtaAccuracyRecord;
  completionState: 'completed' | 'failed';
  processedPairCount: number;
  terminalPairIndex?: number;
  terminalPairFailureReason?: string;
  comparabilityState: 'comparable-to-windows-baseline' | 'characterization-only';
  pairSummaries: HarnessDashboardSmokePairSummary[];
}

export interface HarnessDashboardSmokeDeps extends HarnessReportSmokeDeps {
  executeHarnessComparisonReportForCommit?: typeof executeHarnessComparisonReportForCommit;
  buildDashboard?: (
    storageRoot: string,
    model: ViHistoryViewModel
  ) => Promise<BuildMultiReportDashboardResult>;
  nowMs?: () => number;
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
  const targetAbsolutePath = joinPreservingExplicitPathStyle(
    cloneDirectory,
    definition.targetRelativePath
  );
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
  const progressLabel =
    options.progressLabel ??
    (options.runtimePlatform === 'win32'
      ? 'Windows benchmark'
      : options.runtimePlatform === 'linux'
        ? 'Linux benchmark'
        : 'Benchmark');
  const pairSummaries: HarnessDashboardSmokePairSummary[] = [];
  const completedPairDurationsMs: number[] = [];
  let etaEligiblePairCount = 0;
  const etaAccuracySamples: MultiReportDashboardEtaAccuracyRecord['samples'] = [];
  const nowMs = deps.nowMs ?? Date.now;
  const benchmarkRuntimeSelection = applyRuntimeEngineOverride(
    await (deps.locateComparisonRuntime ?? locateComparisonRuntime)(
      options.runtimePlatform ?? resolveCurrentRuntimePlatform(),
      options.runtimeSettings ?? {}
    ),
    options.runtimeEngineOverride
  );
  let completionState: HarnessDashboardSmokeReport['completionState'] = 'completed';
  let terminalPairIndex: number | undefined;
  let terminalPairFailureReason: string | undefined;

  await options.reportProgress?.({
    message: `Loaded ${dashboardModel.commits.length} retained commit(s) and ${pairCommits.length} compare pair(s) for ${definition.targetRelativePath}.`
  });

  for (const [index, compareCommit] of pairCommits.entries()) {
    const pairStartMs = nowMs();
    const estimatedPairSeconds = deriveEstimatedPairSeconds(completedPairDurationsMs);
    const remainingPairCount = pairCommits.length - index;
    const estimatedRemainingSeconds =
      estimatedPairSeconds === undefined
        ? undefined
        : roundSeconds(estimatedPairSeconds * remainingPairCount);
    await options.reportProgress?.({
      message:
        estimatedRemainingSeconds === undefined
          ? `Preparing dashboard pair ${index + 1}/${pairCommits.length}: executing LabVIEW comparison-report runtime.`
          : `Preparing dashboard pair ${index + 1}/${pairCommits.length}; est. ${formatDurationSeconds(
              estimatedRemainingSeconds
            )} left: executing LabVIEW comparison-report runtime.`
    });
    const heartbeatStop = startBenchmarkPairHeartbeat({
      pairIndex: index + 1,
      pairCount: pairCommits.length,
      runtimeProvider: benchmarkRuntimeSelection.provider,
      runtimeEngine: benchmarkRuntimeSelection.engine,
      startedMs: pairStartMs,
      estimatedRemainingSeconds,
      intervalMs: options.runtimeHeartbeatIntervalMs,
      nowMs,
      reportProgress: options.reportProgress
    });
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
    ).finally(() => {
      heartbeatStop();
    });
    const pairDurationMs = Math.max(0, nowMs() - pairStartMs);
    const etaEligible = isDashboardPairEtaEligible(execution.record.runtimeExecution.reportExists);
    if (etaEligible) {
      etaEligiblePairCount += 1;
      completedPairDurationsMs.push(pairDurationMs);
    }
    const actualPreparationSeconds = roundSeconds(pairDurationMs / 1000);
    const signedEtaErrorSeconds =
      estimatedPairSeconds === undefined
        ? undefined
        : roundSeconds(actualPreparationSeconds - estimatedPairSeconds);
    const absoluteEtaErrorSeconds =
      signedEtaErrorSeconds === undefined
        ? undefined
        : roundSeconds(Math.abs(signedEtaErrorSeconds));
    const accuracySample =
      estimatedPairSeconds === undefined || !etaEligible
        ? undefined
        : buildPairEtaAccuracySample(
            index,
            pairCommits.length,
            estimatedPairSeconds,
            pairDurationMs,
            nowMs
          );
    if (accuracySample) {
      etaAccuracySamples.push(accuracySample);
    }
    await options.reportProgress?.({
      message: `Prepared dashboard pair ${index + 1}/${pairCommits.length}: ${describePreparedPairOutcome(
        execution.record.reportStatus,
        execution.record.runtimeExecutionState,
        execution.record.runtimeExecution.reportExists
      )}.`
    });
    pairSummaries.push({
      pairId: execution.archivedSourceRecord?.archivePlan.pairId,
      pairIndex: index + 1,
      selectedHash: execution.record.selectedHash,
      baseHash: execution.record.baseHash,
      reportStatus: execution.record.reportStatus,
      runtimeExecutionState: execution.record.runtimeExecutionState,
      runtimeProvider: execution.record.runtimeSelection.provider,
      runtimeEngine: execution.record.runtimeSelection.engine,
      runtimeBlockedReason: execution.record.runtimeExecution.blockedReason,
      runtimeFailureReason: execution.record.runtimeExecution.failureReason,
      runtimeDiagnosticReason: execution.record.runtimeExecution.diagnosticReason,
      runtimeDiagnosticNotes: execution.record.runtimeExecution.diagnosticNotes,
      generatedReportExists: execution.record.runtimeExecution.reportExists,
      packetFilePath:
        execution.archivedSourceRecord?.archivePlan.packetFilePath ?? execution.packetFilePath,
      reportFilePath:
        execution.archivedSourceRecord?.archivePlan.reportFilePath ?? execution.reportFilePath,
      metadataFilePath:
        execution.archivedSourceRecord?.archivePlan.metadataFilePath ?? execution.metadataFilePath,
      sourceRecordFilePath: execution.archivedSourceRecord?.archivePlan.sourceRecordFilePath,
      runtimeStdoutPath: execution.record.runtimeExecution.stdoutFilePath,
      runtimeStderrPath: execution.record.runtimeExecution.stderrFilePath,
      runtimeDiagnosticLogPath: execution.record.runtimeExecution.diagnosticLogArtifactPath,
      runtimeHeadlessDiagnosticArtifactPaths:
        execution.record.runtimeExecution.headlessDiagnosticArtifactPaths,
      runtimeProcessObservationPath:
        execution.record.runtimeExecution.processObservationArtifactPath,
      actualPreparationSeconds,
      estimatedPreparationSeconds:
        estimatedPairSeconds === undefined ? undefined : roundSeconds(estimatedPairSeconds),
      absoluteEtaErrorSeconds,
      signedEtaErrorSeconds
    });

    if (execution.record.runtimeExecutionState === 'failed') {
      completionState = 'failed';
      terminalPairIndex = index + 1;
      terminalPairFailureReason =
        execution.record.runtimeExecution.failureReason ?? 'runtime-execution-failed';
      await options.reportProgress?.({
        message: `Stopping ${progressLabel} at pair ${index + 1}/${pairCommits.length}: ${
          execution.record.runtimeExecution.failureReason ?? 'runtime-execution-failed'
        }.`
      });
      break;
    }
  }
  const etaAccuracyRecord = buildDashboardPairEtaAccuracyRecord(
    pairSummaries.length,
    etaEligiblePairCount,
    etaAccuracySamples,
    nowMs
  );
  await options.reportProgress?.({
    message: 'Concentrating retained dashboard metadata.'
  });

  const storageRoot = path.join(options.reportRoot, definition.id, 'workspace-storage');
  const dashboard = await (deps.buildDashboard ?? buildAndPersistMultiReportDashboard)(
    storageRoot,
    dashboardModel
  );
  const dashboardEtaAccuracyFilePath = etaAccuracyRecord
    ? path.join(
        dashboard.record.artifactPlan.dashboardDirectory,
        DASHBOARD_PAIR_ETA_ACCURACY_FILENAME
      )
    : undefined;
  const etaAccuracyRecordWithContext = attachDashboardEtaAccuracyContext(etaAccuracyRecord, {
    source: 'harness-dashboard-smoke',
    workspaceStorageRoot: storageRoot,
    repositoryName: dashboard.record.repositoryName,
    repositoryRoot: dashboard.record.repositoryRoot,
    relativePath: dashboard.record.relativePath,
    signature: dashboard.record.signature,
    dashboardGeneratedAt: dashboard.record.generatedAt,
    dashboardDirectory: dashboard.record.artifactPlan.dashboardDirectory,
    dashboardJsonFilePath: dashboard.jsonFilePath,
    dashboardHtmlFilePath: dashboard.htmlFilePath,
    etaAccuracyFilePath: dashboardEtaAccuracyFilePath
  });
  await (deps.mkdir ?? fs.mkdir)(dashboard.record.artifactPlan.dashboardDirectory, {
    recursive: true
  });
  if (etaAccuracyRecordWithContext && dashboardEtaAccuracyFilePath) {
    await (deps.writeFile ?? fs.writeFile)(
      dashboardEtaAccuracyFilePath,
      JSON.stringify(etaAccuracyRecordWithContext, null, 2)
    );
  }
  await (deps.writeFile ?? fs.writeFile)(
    buildDashboardLatestRunFilePath(storageRoot),
    JSON.stringify(
      buildDashboardLatestRunRecord({
        source: 'harness-dashboard-smoke',
        workspaceStorageRoot: storageRoot,
        dashboard,
        etaAccuracyRecord: etaAccuracyRecordWithContext,
        recordedAt: (deps.now ?? defaultNow)()
      }),
      null,
      2
    )
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
    dashboardEtaAccuracyFilePath,
    dashboardEtaAccuracyRecord: etaAccuracyRecordWithContext,
    completionState,
    processedPairCount: pairSummaries.length,
    terminalPairIndex,
    terminalPairFailureReason,
    comparabilityState:
      completionState === 'completed' &&
      pairSummaries.length === pairCommits.length &&
      pairSummaries.every((pair) => pair.runtimeExecutionState === 'succeeded')
        ? 'comparable-to-windows-baseline'
        : 'characterization-only',
    pairSummaries
  };

  const outputDirectory = joinPreservingExplicitPathStyle(options.reportRoot, definition.id);
  await (deps.mkdir ?? fs.mkdir)(outputDirectory, { recursive: true });
  const reportJsonPath = joinPreservingExplicitPathStyle(outputDirectory, 'dashboard-smoke.json');
  const reportMarkdownPath = joinPreservingExplicitPathStyle(outputDirectory, 'dashboard-smoke.md');
  const reportHtmlPath = joinPreservingExplicitPathStyle(outputDirectory, 'dashboard-smoke.html');

  await (deps.writeFile ?? fs.writeFile)(reportJsonPath, JSON.stringify(report, null, 2));
  await (deps.writeFile ?? fs.writeFile)(
    reportMarkdownPath,
    renderHarnessDashboardSmokeMarkdown(report)
  );
  await (deps.writeFile ?? fs.writeFile)(reportHtmlPath, renderHarnessDashboardSmokeHtml(report));
  await options.reportProgress?.({
    message:
      completionState === 'completed'
        ? `${progressLabel} dashboard complete.`
        : `${progressLabel} retained a partial failed summary.`
  });

  return { report, reportJsonPath, reportMarkdownPath, reportHtmlPath };
}

export function renderHarnessDashboardSmokeMarkdown(report: HarnessDashboardSmokeReport): string {
  const pairLines = report.pairSummaries
    .map(
      (pair) =>
        `- \`${pair.selectedHash.slice(0, 8)}\` vs \`${pair.baseHash.slice(0, 8)}\` :: status=${pair.reportStatus} runtime=${pair.runtimeExecutionState} provider=${pair.runtimeProvider ?? 'none'} engine=${pair.runtimeEngine ?? 'none'} metadata=${pair.generatedReportExists ? 'yes' : 'no'} actual-prep=${formatOptionalSeconds(pair.actualPreparationSeconds)} estimated-prep=${formatOptionalSeconds(pair.estimatedPreparationSeconds)} abs-eta-error=${formatOptionalSeconds(pair.absoluteEtaErrorSeconds)}`
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
- Dashboard ETA accuracy: ${formatHarnessDashboardEtaAccuracySummary(report.dashboardEtaAccuracyRecord)}
- Dashboard ETA accuracy file: ${report.dashboardEtaAccuracyFilePath ?? 'none'}
- Completion state: ${report.completionState}
- Processed pair count: ${report.processedPairCount}
- Terminal pair index: ${report.terminalPairIndex ?? 'none'}
- Terminal pair failure: ${report.terminalPairFailureReason ?? 'none'}
- Comparability: ${report.comparabilityState}
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
  <td>${escapeHtml(formatOptionalSeconds(pair.actualPreparationSeconds))}</td>
  <td>${escapeHtml(formatOptionalSeconds(pair.estimatedPreparationSeconds))}</td>
  <td>${escapeHtml(formatOptionalSeconds(pair.absoluteEtaErrorSeconds))}</td>
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
      <div><strong>Dashboard ETA accuracy:</strong> ${escapeHtml(
        formatHarnessDashboardEtaAccuracySummary(report.dashboardEtaAccuracyRecord)
      )}</div>
      <div><strong>Dashboard ETA accuracy file:</strong> ${escapeHtml(
        report.dashboardEtaAccuracyFilePath ?? 'none'
      )}</div>
      <div><strong>Completion state:</strong> ${escapeHtml(report.completionState)}</div>
      <div><strong>Processed pair count:</strong> ${report.processedPairCount}</div>
      <div><strong>Terminal pair index:</strong> ${escapeHtml(
        String(report.terminalPairIndex ?? 'none')
      )}</div>
      <div><strong>Terminal pair failure:</strong> ${escapeHtml(
        report.terminalPairFailureReason ?? 'none'
      )}</div>
      <div><strong>Comparability:</strong> ${escapeHtml(report.comparabilityState)}</div>
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
          <th>Actual prep</th>
          <th>Estimated prep</th>
          <th>Abs ETA error</th>
        </tr>
      </thead>
      <tbody>
        ${pairRows || '<tr><td colspan="10">No pair summaries were retained.</td></tr>'}
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

function formatOptionalSeconds(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${value}s`;
}

function formatHarnessDashboardEtaAccuracySummary(
  record: MultiReportDashboardEtaAccuracyRecord | undefined
): string {
  if (!record) {
    return 'not-retained';
  }
  if (record.measuredPairCount <= 0) {
    return `not-yet-measurable (${record.etaEligiblePairCount} eta-eligible pair(s)${
      record.excludedPairCount > 0 ? `, ${record.excludedPairCount} excluded` : ''
    })`;
  }
  return `measured=${record.measuredPairCount}/${record.etaEligiblePairCount} mean-abs=${formatOptionalSeconds(
    record.meanAbsoluteErrorSeconds
  )} max-abs=${formatOptionalSeconds(
    record.maxAbsoluteErrorSeconds
  )} mean-bias=${formatOptionalSeconds(record.meanSignedErrorSeconds)} mape=${
    record.meanAbsolutePercentageError === undefined
      ? 'n/a'
      : `${Math.round(record.meanAbsolutePercentageError)}%`
  }${record.excludedPairCount > 0 ? ` excluded=${record.excludedPairCount}` : ''}`;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveCurrentRuntimePlatform(): 'win32' | 'linux' | 'darwin' {
  if (process.platform === 'win32') {
    return 'win32';
  }
  if (process.platform === 'darwin') {
    return 'darwin';
  }
  return 'linux';
}

function formatDurationSeconds(value: number): string {
  if (value >= 3600) {
    return `${roundSeconds(value / 3600)}h`;
  }
  if (value >= 60) {
    return `${roundSeconds(value / 60)}m`;
  }
  return `${roundSeconds(value)}s`;
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (rootPath.startsWith('/')) {
    return path.posix.join(rootPath, ...segments);
  }

  return path.join(rootPath, ...segments);
}

function describePreparedPairOutcome(
  reportStatus: HarnessDashboardSmokePairSummary['reportStatus'],
  runtimeExecutionState: HarnessDashboardSmokePairSummary['runtimeExecutionState'],
  generatedReportExists: boolean
): string {
  if (generatedReportExists) {
    return 'generated retained comparison metadata';
  }
  if (
    reportStatus === 'blocked-preflight' ||
    reportStatus === 'blocked-runtime' ||
    runtimeExecutionState === 'not-available'
  ) {
    return 'blocked retained pair evidence';
  }
  if (runtimeExecutionState === 'failed') {
    return 'failed retained pair evidence';
  }
  return 'retained pair evidence without a generated comparison report';
}

function startBenchmarkPairHeartbeat(options: {
  pairIndex: number;
  pairCount: number;
  runtimeProvider?: string;
  runtimeEngine?: string;
  startedMs: number;
  estimatedRemainingSeconds?: number;
  intervalMs?: number;
  nowMs: () => number;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
}): () => void {
  if (!options.reportProgress) {
    return () => undefined;
  }

  const intervalMs =
    typeof options.intervalMs === 'number' && options.intervalMs > 0
      ? options.intervalMs
      : 15_000;
  const handle = setInterval(() => {
    const elapsedSeconds = roundSeconds(
      Math.max(0, options.nowMs() - options.startedMs) / 1000
    );
    const providerSummary = [
      options.runtimeProvider ?? 'unknown-provider',
      options.runtimeEngine ?? 'unknown-engine'
    ].join(' / ');
    const estimatedLeft =
      options.estimatedRemainingSeconds === undefined
        ? undefined
        : `; est. ${formatDurationSeconds(options.estimatedRemainingSeconds)} left`;
    void options.reportProgress?.({
      message:
        `Preparing dashboard pair ${options.pairIndex}/${options.pairCount}${estimatedLeft ?? ''}: ` +
        `executing LabVIEW comparison-report runtime via ${providerSummary}; elapsed ${formatDurationSeconds(
          elapsedSeconds
        )}.`
    });
  }, intervalMs);

  return () => {
    clearInterval(handle);
  };
}
