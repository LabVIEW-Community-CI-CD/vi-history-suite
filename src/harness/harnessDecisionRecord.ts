import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  HarnessDashboardSmokeDeps,
  HarnessDashboardSmokeOptions,
  HarnessDashboardSmokeReport,
  runHarnessDashboardSmoke
} from './harnessDashboardSmoke';
import { MultiReportDashboardRecord } from '../dashboard/multiReportDashboard';
import {
  buildDecisionRecordMissingOrBlockedFacts,
  collectDecisionRecordPairwiseReportPaths,
  PersistReviewDecisionRecordDeps,
  persistReviewDecisionRecord,
  ReviewDecisionConfidence,
  ReviewDecisionOutcome,
  ReviewDecisionRecord
} from '../scenarios/decisionRecord';
import {
  getDefaultReviewScenarioForHarness,
  getReviewScenarioDefinition,
  ReviewScenarioDefinition,
  validateReviewScenarioEvidence
} from '../scenarios/reviewScenarioRegistry';
import { getCanonicalHarnessDefinition } from './canonicalHarnesses';

export interface HarnessDecisionRecordOptions extends HarnessDashboardSmokeOptions {
  scenarioId?: string;
  reviewer: string;
  reviewQuestion: string;
  outcome: ReviewDecisionOutcome;
  confidence: ReviewDecisionConfidence;
  decisionRationale: string;
  additionalReportGenerationRequired?: boolean;
  additionalManualLabVIEWInspectionRequired?: boolean;
  issuesOrBacklogItemsCreated?: string[];
}

export interface HarnessDecisionRecordReport {
  harnessId: string;
  scenarioId: string;
  generatedAt: string;
  reviewer: string;
  outcome: ReviewDecisionOutcome;
  confidence: ReviewDecisionConfidence;
  dashboardSmokeJsonPath: string;
  dashboardJsonPath: string;
  dashboardHtmlPath: string;
  decisionRecordJsonPath: string;
  decisionRecordMarkdownPath: string;
}

export interface HarnessDecisionRecordDeps
  extends HarnessDashboardSmokeDeps,
    PersistReviewDecisionRecordDeps {
  runDashboardSmoke?: typeof runHarnessDashboardSmoke;
  readFile?: typeof fs.readFile;
  persistDecisionRecord?: typeof persistReviewDecisionRecord;
}

export async function runHarnessDecisionRecord(
  harnessId: string,
  options: HarnessDecisionRecordOptions,
  deps: HarnessDecisionRecordDeps = {}
): Promise<{
  report: HarnessDecisionRecordReport;
  reportJsonPath: string;
  reportMarkdownPath: string;
}> {
  const definition = getCanonicalHarnessDefinition(harnessId);
  const dashboardSmokeResult = await (deps.runDashboardSmoke ?? runHarnessDashboardSmoke)(
    harnessId,
    options,
    deps
  );
  const scenario =
    options.scenarioId === undefined
      ? getDefaultReviewScenarioForHarness(harnessId)
      : getReviewScenarioDefinition(options.scenarioId);

  if (!scenario) {
    throw new Error(`No active review scenario is registered for harness ${harnessId}.`);
  }

  const mismatches = validateReviewScenarioEvidence(scenario, {
    harnessId,
    repositoryUrl: definition.repositoryUrl,
    targetRelativePath: definition.targetRelativePath,
    commitCount: dashboardSmokeResult.report.dashboardCommitWindow,
    comparisonPairCount: dashboardSmokeResult.report.comparePairCount
  });
  if (mismatches.length > 0) {
    throw new Error(mismatches.join(' '));
  }

  const dashboardRecord = await readDashboardRecord(
    dashboardSmokeResult.report.dashboardJsonFilePath,
    deps.readFile ?? fs.readFile
  );
  const storageRoot = path.join(options.reportRoot, definition.id, 'workspace-storage');
  const pairwiseReportPaths = collectDecisionRecordPairwiseReportPaths(dashboardRecord);
  const retainedPairwiseReportPaths =
    pairwiseReportPaths.length > 0
      ? pairwiseReportPaths
      : dashboardSmokeResult.report.pairSummaries
          .map((pair) => pair.reportFilePath)
          .filter(
            (targetPath, index, values): targetPath is string =>
              typeof targetPath === 'string' &&
              targetPath.length > 0 &&
              values.indexOf(targetPath) === index
          );
  const missingOrBlockedFacts = buildDecisionRecordMissingOrBlockedFacts(dashboardRecord);
  const persisted = await (deps.persistDecisionRecord ?? persistReviewDecisionRecord)(
    storageRoot,
    {
      scenario,
      harnessId,
      repositoryUrl: definition.repositoryUrl,
      targetRelativePath: definition.targetRelativePath,
      dashboardRecord,
      dashboardHtmlPath: dashboardSmokeResult.report.dashboardFilePath,
      dashboardJsonPath: dashboardSmokeResult.report.dashboardJsonFilePath,
      reviewer: options.reviewer,
      reviewQuestion: options.reviewQuestion,
      outcome: options.outcome,
      confidence: options.confidence,
      decisionRationale: options.decisionRationale,
      pairwiseReportPaths: retainedPairwiseReportPaths,
      missingOrBlockedFacts,
      additionalReportGenerationRequired: options.additionalReportGenerationRequired,
      additionalManualLabVIEWInspectionRequired:
        options.additionalManualLabVIEWInspectionRequired,
      issuesOrBacklogItemsCreated: options.issuesOrBacklogItemsCreated
    },
    deps
  );

  const report: HarnessDecisionRecordReport = {
    harnessId,
    scenarioId: scenario.id,
    generatedAt: persisted.record.generatedAt,
    reviewer: options.reviewer,
    outcome: options.outcome,
    confidence: options.confidence,
    dashboardSmokeJsonPath: dashboardSmokeResult.reportJsonPath,
    dashboardJsonPath: dashboardSmokeResult.report.dashboardJsonFilePath,
    dashboardHtmlPath: dashboardSmokeResult.report.dashboardFilePath,
    decisionRecordJsonPath: persisted.artifactPlan.jsonFilePath,
    decisionRecordMarkdownPath: persisted.artifactPlan.markdownFilePath
  };

  return {
    report,
    reportJsonPath: persisted.artifactPlan.jsonFilePath,
    reportMarkdownPath: persisted.artifactPlan.markdownFilePath
  };
}

async function readDashboardRecord(
  dashboardJsonPath: string,
  readFile: typeof fs.readFile
): Promise<MultiReportDashboardRecord> {
  return JSON.parse(await readFile(dashboardJsonPath, 'utf8')) as MultiReportDashboardRecord;
}
