import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { MultiReportDashboardRecord } from '../dashboard/multiReportDashboard';
import { ReviewScenarioDefinition } from './reviewScenarioRegistry';

export type ReviewDecisionOutcome = 'approved' | 'rejected' | 'needs-more-review';
export type ReviewDecisionConfidence = 'low' | 'medium' | 'high';

export interface ReviewDecisionRecordArtifactPlan {
  scenarioId: string;
  decisionId: string;
  decisionDirectory: string;
  jsonFilePath: string;
  markdownFilePath: string;
}

export interface PersistReviewDecisionRecordInput {
  scenario: ReviewScenarioDefinition;
  harnessId?: string;
  repositoryUrl: string;
  targetRelativePath: string;
  dashboardRecord: MultiReportDashboardRecord;
  dashboardHtmlPath: string;
  dashboardJsonPath: string;
  reviewer: string;
  reviewQuestion: string;
  outcome: ReviewDecisionOutcome;
  confidence: ReviewDecisionConfidence;
  decisionRationale: string;
  pairwiseReportPaths: string[];
  missingOrBlockedFacts: string[];
  additionalReportGenerationRequired?: boolean;
  additionalManualLabVIEWInspectionRequired?: boolean;
  issuesOrBacklogItemsCreated?: string[];
}

export interface ReviewDecisionRecord {
  scenarioId: string;
  scenarioTitle: string;
  harnessId?: string;
  repositoryUrl: string;
  repositoryName: string;
  viPath: string;
  commitWindowStart?: string;
  commitWindowEnd?: string;
  comparisonPairsIncluded: number;
  dashboardPacketPath: string;
  dashboardHtmlPath: string;
  generatedAt: string;
  reviewer: string;
  reviewQuestion: string;
  evidenceUsed: {
    dashboardHtmlPath: string;
    dashboardPacketPath: string;
    underlyingPairwiseReportPaths: string[];
    missingOrBlockedFacts: string[];
  };
  reviewerOutcome: {
    outcome: ReviewDecisionOutcome;
    confidence: ReviewDecisionConfidence;
    decisionRationale: string;
  };
  followUp: {
    additionalReportGenerationRequired: boolean;
    additionalManualLabVIEWInspectionRequired: boolean;
    issuesOrBacklogItemsCreated: string[];
  };
}

export interface PersistReviewDecisionRecordDeps {
  now?: () => string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
}

export async function persistReviewDecisionRecord(
  storageRoot: string,
  input: PersistReviewDecisionRecordInput,
  deps: PersistReviewDecisionRecordDeps = {}
): Promise<{
  artifactPlan: ReviewDecisionRecordArtifactPlan;
  record: ReviewDecisionRecord;
}> {
  const now = deps.now ?? defaultNow;
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const generatedAt = now();
  const artifactPlan = buildReviewDecisionRecordArtifactPlan(
    storageRoot,
    input.dashboardRecord,
    input.scenario.id,
    input.reviewer,
    generatedAt
  );
  const record: ReviewDecisionRecord = {
    scenarioId: input.scenario.id,
    scenarioTitle: input.scenario.title,
    harnessId: input.harnessId,
    repositoryUrl: input.repositoryUrl,
    repositoryName: input.dashboardRecord.repositoryName,
    viPath: input.targetRelativePath,
    commitWindowStart: input.dashboardRecord.commitWindow.oldestHash,
    commitWindowEnd: input.dashboardRecord.commitWindow.newestHash,
    comparisonPairsIncluded: input.dashboardRecord.commitWindow.pairCount,
    dashboardPacketPath: input.dashboardJsonPath,
    dashboardHtmlPath: input.dashboardHtmlPath,
    generatedAt,
    reviewer: input.reviewer,
    reviewQuestion: input.reviewQuestion,
    evidenceUsed: {
      dashboardHtmlPath: input.dashboardHtmlPath,
      dashboardPacketPath: input.dashboardJsonPath,
      underlyingPairwiseReportPaths: input.pairwiseReportPaths,
      missingOrBlockedFacts: input.missingOrBlockedFacts
    },
    reviewerOutcome: {
      outcome: input.outcome,
      confidence: input.confidence,
      decisionRationale: input.decisionRationale
    },
    followUp: {
      additionalReportGenerationRequired: input.additionalReportGenerationRequired ?? false,
      additionalManualLabVIEWInspectionRequired:
        input.additionalManualLabVIEWInspectionRequired ?? false,
      issuesOrBacklogItemsCreated: input.issuesOrBacklogItemsCreated ?? []
    }
  };

  await mkdir(artifactPlan.decisionDirectory, { recursive: true });
  await writeFile(artifactPlan.jsonFilePath, JSON.stringify(record, null, 2), 'utf8');
  await writeFile(artifactPlan.markdownFilePath, renderReviewDecisionRecordMarkdown(record), 'utf8');

  return {
    artifactPlan,
    record
  };
}

export function buildReviewDecisionRecordArtifactPlan(
  storageRoot: string,
  dashboardRecord: MultiReportDashboardRecord,
  scenarioId: string,
  reviewer: string,
  generatedAt: string
): ReviewDecisionRecordArtifactPlan {
  const decisionId = createHash('sha1')
    .update(
      [
        scenarioId,
        reviewer,
        generatedAt,
        dashboardRecord.repositoryRoot,
        dashboardRecord.relativePath,
        dashboardRecord.commitWindow.newestHash ?? '',
        dashboardRecord.commitWindow.oldestHash ?? ''
      ].join('|')
    )
    .digest('hex')
    .slice(0, 12);
  const decisionDirectory = path.join(
    storageRoot,
    'decision-records',
    dashboardRecord.artifactPlan.repoId,
    dashboardRecord.artifactPlan.fileId,
    dashboardRecord.artifactPlan.windowId,
    scenarioId,
    decisionId
  );

  return {
    scenarioId,
    decisionId,
    decisionDirectory,
    jsonFilePath: path.join(decisionDirectory, 'decision-record.json'),
    markdownFilePath: path.join(decisionDirectory, 'decision-record.md')
  };
}

export function renderReviewDecisionRecordMarkdown(record: ReviewDecisionRecord): string {
  const pairwiseReportLines = record.evidenceUsed.underlyingPairwiseReportPaths.length
    ? record.evidenceUsed.underlyingPairwiseReportPaths.map((target) => `- ${target}`).join('\n')
    : '- none';
  const missingOrBlockedLines = record.evidenceUsed.missingOrBlockedFacts.length
    ? record.evidenceUsed.missingOrBlockedFacts.map((fact) => `- ${fact}`).join('\n')
    : '- none';
  const issueLines = record.followUp.issuesOrBacklogItemsCreated.length
    ? record.followUp.issuesOrBacklogItemsCreated.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# Review Decision Record

## Metadata

- Scenario ID: ${record.scenarioId}
- Scenario Title: ${record.scenarioTitle}
- Harness ID: ${record.harnessId ?? 'none'}
- Repository URL: ${record.repositoryUrl}
- VI path: ${record.viPath}
- Commit-window start: ${record.commitWindowStart ?? 'unknown'}
- Commit-window end: ${record.commitWindowEnd ?? 'unknown'}
- Comparison pairs included: ${String(record.comparisonPairsIncluded)}
- Dashboard packet path: ${record.dashboardPacketPath}
- Dashboard HTML path: ${record.dashboardHtmlPath}
- Generated at: ${record.generatedAt}
- Reviewer: ${record.reviewer}

## Review Question

- ${record.reviewQuestion}

## Evidence Used

- Dashboard HTML path: ${record.evidenceUsed.dashboardHtmlPath}
- Dashboard packet path: ${record.evidenceUsed.dashboardPacketPath}

### Underlying Pairwise Report Paths

${pairwiseReportLines}

### Missing Or Blocked Facts Considered

${missingOrBlockedLines}

## Reviewer Outcome

- Outcome: ${record.reviewerOutcome.outcome}
- Confidence: ${record.reviewerOutcome.confidence}
- Decision rationale: ${record.reviewerOutcome.decisionRationale}

## Follow-Up

- Additional report generation required: ${record.followUp.additionalReportGenerationRequired ? 'yes' : 'no'}
- Additional manual LabVIEW inspection required: ${record.followUp.additionalManualLabVIEWInspectionRequired ? 'yes' : 'no'}

### Issues Or Backlog Items Created

${issueLines}
`;
}

export function collectDecisionRecordPairwiseReportPaths(
  dashboardRecord: MultiReportDashboardRecord
): string[] {
  return dashboardRecord.entries
    .map((entry) => entry.reportFilePath)
    .filter(
      (targetPath, index, values): targetPath is string =>
        typeof targetPath === 'string' &&
        targetPath.length > 0 &&
        values.indexOf(targetPath) === index
    );
}

export function buildDecisionRecordMissingOrBlockedFacts(
  dashboardRecord: MultiReportDashboardRecord
): string[] {
  const facts: string[] = [];
  for (const pairId of dashboardRecord.summary.missingPairIds) {
    facts.push(`Missing archived pair evidence: ${pairId}`);
  }
  for (const pairId of dashboardRecord.summary.blockedPairIds) {
    facts.push(`Blocked pair evidence: ${pairId}`);
  }
  for (const pairId of dashboardRecord.summary.failedPairIds) {
    facts.push(`Failed pair evidence: ${pairId}`);
  }

  return facts;
}

function defaultNow(): string {
  return new Date().toISOString();
}
