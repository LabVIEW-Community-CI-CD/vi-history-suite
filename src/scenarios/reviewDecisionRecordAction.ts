import * as os from 'node:os';
import * as vscode from 'vscode';

import { buildAndPersistMultiReportDashboard } from '../dashboard/multiReportDashboard';
import { getRepoRemoteUrl } from '../git/gitCli';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import {
  buildDecisionRecordMissingOrBlockedFacts,
  collectDecisionRecordPairwiseReportPaths,
  persistReviewDecisionRecord,
  PersistReviewDecisionRecordDeps,
  ReviewDecisionConfidence,
  ReviewDecisionOutcome
} from './decisionRecord';
import {
  getDefaultReviewScenarioForRepository,
  validateReviewScenarioEvidence
} from './reviewScenarioRegistry';

export interface ReviewDecisionRecordActionRequest {
  model: ViHistoryViewModel;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  cancellationToken?: vscode.CancellationToken;
}

export interface ReviewDecisionRecordActionResult {
  outcome:
    | 'created-decision-record'
    | 'cancelled'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'insufficient-commits'
    | 'missing-repository-url'
    | 'missing-review-scenario'
    | 'scenario-contract-mismatch';
  cancellationStage?: string;
  scenarioId?: string;
  mismatchSummary?: string;
  dashboardFilePath?: string;
  dashboardJsonFilePath?: string;
  decisionRecordJsonPath?: string;
  decisionRecordMarkdownPath?: string;
  title?: string;
}

interface DecisionRecordPromptResult {
  reviewer: string;
  reviewQuestion: string;
  outcome: ReviewDecisionOutcome;
  confidence: ReviewDecisionConfidence;
  decisionRationale: string;
}

interface DecisionRecordQuickPickItem<T extends string> extends vscode.QuickPickItem {
  value: T;
}

export interface ReviewDecisionRecordActionDeps
  extends PersistReviewDecisionRecordDeps {
  buildDashboard?: typeof buildAndPersistMultiReportDashboard;
  persistDecisionRecord?: typeof persistReviewDecisionRecord;
  readRepoRemoteUrl?: (repositoryRoot: string) => Promise<string | undefined>;
  executeCommand?: typeof vscode.commands.executeCommand;
  uriFile?: typeof vscode.Uri.file;
  showInputBox?: typeof vscode.window.showInputBox;
  showQuickPick?: typeof vscode.window.showQuickPick;
  automationInputs?: Partial<DecisionRecordPromptResult>;
  reviewerNameProvider?: () => string;
}

const LAST_REVIEWER_STATE_KEY = 'viHistorySuite.lastDecisionReviewer';

const OUTCOME_ITEMS: DecisionRecordQuickPickItem<ReviewDecisionOutcome>[] = [
  {
    label: 'Needs More Review',
    description: 'Recommended when concentrated evidence still needs deeper inspection',
    value: 'needs-more-review'
  },
  {
    label: 'Approved',
    description: 'Use when the bounded evidence is sufficient for acceptance',
    value: 'approved'
  },
  {
    label: 'Rejected',
    description: 'Use when the bounded evidence supports rejection',
    value: 'rejected'
  }
];

const CONFIDENCE_ITEMS: DecisionRecordQuickPickItem<ReviewDecisionConfidence>[] = [
  {
    label: 'Medium',
    description: 'Recommended default for bounded dashboard review',
    value: 'medium'
  },
  {
    label: 'High',
    description: 'Use when the retained evidence is unusually complete and clear',
    value: 'high'
  },
  {
    label: 'Low',
    description: 'Use when substantial uncertainty remains',
    value: 'low'
  }
];

export function createReviewDecisionRecordAction(
  context: vscode.ExtensionContext,
  deps: ReviewDecisionRecordActionDeps = {}
): (request: ReviewDecisionRecordActionRequest) => Promise<ReviewDecisionRecordActionResult> {
  return async (request) => {
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-decision-record-input'
      };
    }

    if (!vscode.workspace.isTrusted) {
      return { outcome: 'workspace-untrusted' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    if (request.model.commits.length < 3) {
      return { outcome: 'insufficient-commits' };
    }

    const prompts = await collectDecisionRecordPromptInputs(context, request.model, deps);
    if (!prompts) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'during-decision-record-input'
      };
    }

    await persistLastReviewerName(context, prompts.reviewer);

    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-dashboard-build'
      };
    }

    await request.reportProgress?.({
      message: 'Preparing retained dashboard evidence for the review decision record.',
      increment: 5
    });

    const buildDashboard = deps.buildDashboard ?? buildAndPersistMultiReportDashboard;
    const dashboard = await buildDashboard(context.storageUri.fsPath, request.model, {
      reportProgress: request.reportProgress
    });
    const title = buildReviewDecisionRecordTitle(request.model.relativePath);

    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'after-dashboard-build',
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath,
        title
      };
    }

    const readRepoRemoteUrl = deps.readRepoRemoteUrl ?? defaultReadRepoRemoteUrl;
    const repositoryUrl = await readRepoRemoteUrl(request.model.repositoryRoot);
    if (!repositoryUrl) {
      return {
        outcome: 'missing-repository-url',
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath
      };
    }

    const scenario = getDefaultReviewScenarioForRepository(
      repositoryUrl,
      request.model.relativePath
    );
    if (!scenario) {
      return {
        outcome: 'missing-review-scenario',
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath
      };
    }

    const mismatches = validateReviewScenarioEvidence(scenario, {
      repositoryUrl,
      targetRelativePath: request.model.relativePath,
      commitCount: dashboard.record.commitWindow.commitCount,
      comparisonPairCount: dashboard.record.commitWindow.pairCount
    });
    if (mismatches.length > 0) {
      return {
        outcome: 'scenario-contract-mismatch',
        scenarioId: scenario.id,
        mismatchSummary: mismatches.join(' '),
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath
      };
    }

    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-decision-record-persist',
        scenarioId: scenario.id,
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath,
        title
      };
    }

    const pairwiseReportPaths = collectDecisionRecordPairwiseReportPaths(dashboard.record);
    const missingOrBlockedFacts = buildDecisionRecordMissingOrBlockedFacts(dashboard.record);
    const persistDecisionRecord = deps.persistDecisionRecord ?? persistReviewDecisionRecord;
    const persisted = await persistDecisionRecord(
      context.storageUri.fsPath,
      {
        scenario,
        repositoryUrl,
        targetRelativePath: request.model.relativePath,
        dashboardRecord: dashboard.record,
        dashboardHtmlPath: dashboard.htmlFilePath,
        dashboardJsonPath: dashboard.jsonFilePath,
        reviewer: prompts.reviewer,
        reviewQuestion: prompts.reviewQuestion,
        outcome: prompts.outcome,
        confidence: prompts.confidence,
        decisionRationale: prompts.decisionRationale,
        pairwiseReportPaths,
        missingOrBlockedFacts,
        additionalReportGenerationRequired: missingOrBlockedFacts.length > 0,
        additionalManualLabVIEWInspectionRequired: prompts.outcome !== 'approved',
        issuesOrBacklogItemsCreated: []
      },
      deps
    );

    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-decision-record-open',
        scenarioId: scenario.id,
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath,
        decisionRecordJsonPath: persisted.artifactPlan.jsonFilePath,
        decisionRecordMarkdownPath: persisted.artifactPlan.markdownFilePath,
        title
      };
    }

    const executeCommand = deps.executeCommand ?? vscode.commands.executeCommand;
    const uriFile = deps.uriFile ?? vscode.Uri.file;
    await executeCommand('vscode.open', uriFile(persisted.artifactPlan.markdownFilePath), {
      preview: false
    });

    return {
      outcome: 'created-decision-record',
      scenarioId: scenario.id,
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      decisionRecordJsonPath: persisted.artifactPlan.jsonFilePath,
      decisionRecordMarkdownPath: persisted.artifactPlan.markdownFilePath,
      title
    };
  };
}

function buildReviewDecisionRecordTitle(relativePath: string): string {
  return `Review Decision Record: ${relativePath.split('/').pop() ?? relativePath}`;
}

async function collectDecisionRecordPromptInputs(
  context: vscode.ExtensionContext,
  model: ViHistoryViewModel,
  deps: ReviewDecisionRecordActionDeps
): Promise<DecisionRecordPromptResult | undefined> {
  const automationInputs = deps.automationInputs ?? readDecisionRecordAutomationInputs();
  if (hasCompleteDecisionRecordAutomationInputs(automationInputs)) {
    return automationInputs;
  }
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    return buildTestDecisionRecordInputs(model);
  }

  const showInputBox = deps.showInputBox ?? vscode.window.showInputBox;
  const showQuickPick = deps.showQuickPick ?? vscode.window.showQuickPick;
  const defaultReviewer =
    automationInputs.reviewer ??
    readPersistedReviewerName(context) ??
    (deps.reviewerNameProvider ?? defaultReviewerNameProvider)();
  const reviewer = await showInputBox({
    title: 'Create Review Decision Record',
    prompt: 'Reviewer name',
    value: automationInputs.reviewer ?? defaultReviewer,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : 'Reviewer name is required.'
  });
  if (!reviewer) {
    return undefined;
  }

  const reviewQuestion = await showInputBox({
    title: 'Create Review Decision Record',
    prompt: 'Bounded review question',
    value:
      automationInputs.reviewQuestion ??
      `What decision should be made for ${model.relativePath} from the retained dashboard evidence?`,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : 'A review question is required.'
  });
  if (!reviewQuestion) {
    return undefined;
  }

  const outcomeItem =
    automationInputs.outcome !== undefined
      ? OUTCOME_ITEMS.find((item) => item.value === automationInputs.outcome)
      : await showQuickPick(OUTCOME_ITEMS, {
          title: 'Create Review Decision Record',
          placeHolder: 'Reviewer outcome',
          ignoreFocusOut: true
        });
  if (!outcomeItem) {
    return undefined;
  }

  const confidenceItem =
    automationInputs.confidence !== undefined
      ? CONFIDENCE_ITEMS.find((item) => item.value === automationInputs.confidence)
      : await showQuickPick(CONFIDENCE_ITEMS, {
          title: 'Create Review Decision Record',
          placeHolder: 'Reviewer confidence',
          ignoreFocusOut: true
        });
  if (!confidenceItem) {
    return undefined;
  }

  const decisionRationale = await showInputBox({
    title: 'Create Review Decision Record',
    prompt: 'Decision rationale',
    value: automationInputs.decisionRationale,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : 'A decision rationale is required.'
  });
  if (!decisionRationale) {
    return undefined;
  }

  return {
    reviewer: reviewer.trim(),
    reviewQuestion: reviewQuestion.trim(),
    outcome: outcomeItem.value,
    confidence: confidenceItem.value,
    decisionRationale: decisionRationale.trim()
  };
}

function buildTestDecisionRecordInputs(
  model: ViHistoryViewModel
): DecisionRecordPromptResult {
  return {
    reviewer: 'Integration Reviewer',
    reviewQuestion: `Does the retained dashboard evidence support a bounded review decision for ${model.relativePath}?`,
    outcome: 'needs-more-review',
    confidence: 'medium',
    decisionRationale:
      'Extension-host automation uses a stable bounded rationale so the governed decision-record flow remains non-interactive during test execution.'
  };
}

function hasCompleteDecisionRecordAutomationInputs(
  value: Partial<DecisionRecordPromptResult>
): value is DecisionRecordPromptResult {
  return (
    typeof value.reviewer === 'string' &&
    value.reviewer.trim().length > 0 &&
    typeof value.reviewQuestion === 'string' &&
    value.reviewQuestion.trim().length > 0 &&
    (value.outcome === 'approved' ||
      value.outcome === 'rejected' ||
      value.outcome === 'needs-more-review') &&
    (value.confidence === 'low' ||
      value.confidence === 'medium' ||
      value.confidence === 'high') &&
    typeof value.decisionRationale === 'string' &&
    value.decisionRationale.trim().length > 0
  );
}

function readDecisionRecordAutomationInputs(
  environment: NodeJS.ProcessEnv = process.env
): Partial<DecisionRecordPromptResult> {
  const outcome = environment.VI_HISTORY_SUITE_DECISION_OUTCOME?.trim();
  const confidence = environment.VI_HISTORY_SUITE_DECISION_CONFIDENCE?.trim();

  return {
    reviewer: environment.VI_HISTORY_SUITE_DECISION_REVIEWER?.trim(),
    reviewQuestion: environment.VI_HISTORY_SUITE_DECISION_QUESTION?.trim(),
    outcome:
      outcome === 'approved' || outcome === 'rejected' || outcome === 'needs-more-review'
        ? outcome
        : undefined,
    confidence:
      confidence === 'low' || confidence === 'medium' || confidence === 'high'
        ? confidence
        : undefined,
    decisionRationale: environment.VI_HISTORY_SUITE_DECISION_RATIONALE?.trim()
  };
}

function defaultReviewerNameProvider(): string {
  const fromEnvironment =
    process.env.VI_HISTORY_SUITE_DECISION_REVIEWER?.trim() ||
    process.env.USERNAME?.trim() ||
    process.env.USER?.trim();
  if (fromEnvironment) {
    return fromEnvironment;
  }

  try {
    return os.userInfo().username;
  } catch {
    return 'Reviewer';
  }
}

function readPersistedReviewerName(context: vscode.ExtensionContext): string | undefined {
  const candidate = context.globalState?.get<string>(LAST_REVIEWER_STATE_KEY);
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

async function persistLastReviewerName(
  context: vscode.ExtensionContext,
  reviewer: string
): Promise<void> {
  const trimmed = reviewer.trim();
  if (trimmed.length === 0 || !context.globalState?.update) {
    return;
  }

  try {
    await context.globalState.update(LAST_REVIEWER_STATE_KEY, trimmed);
  } catch {
    // Best-effort only. Reviewer persistence should not block decision creation.
  }
}

async function defaultReadRepoRemoteUrl(repositoryRoot: string): Promise<string | undefined> {
  return getRepoRemoteUrl(repositoryRoot);
}
