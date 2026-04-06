import { normalizeGitHubRepositoryUrl } from '../support/repositorySupportPolicy';

export type ReviewScenarioMaturity = 'draft' | 'active' | 'certified';

export interface ReviewScenarioDefinition {
  id: string;
  title: string;
  maturity: ReviewScenarioMaturity;
  harnessId: string;
  repositoryUrl: string;
  targetRelativePath: string;
  minimumCommitWindow: number;
  minimumComparisonPairs: number;
  decisionGoal: string;
  humanDecisionBoundary: string;
}

export interface ReviewScenarioEvidence {
  harnessId?: string;
  repositoryUrl?: string;
  targetRelativePath?: string;
  commitCount: number;
  comparisonPairCount: number;
}

const REVIEW_SCENARIOS: ReviewScenarioDefinition[] = [
  {
    id: 'SCENARIO-VHS-001',
    title: 'Canonical Multi-Report VI Review',
    maturity: 'active',
    harnessId: 'HARNESS-VHS-001',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
    targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    minimumCommitWindow: 3,
    minimumComparisonPairs: 2,
    decisionGoal:
      'Help a human reviewer make a bounded decision about one VI after multiple modifications using concentrated comparison-report evidence.',
    humanDecisionBoundary:
      'The dashboard may improve a human review decision, but it shall not claim that it can decide VI correctness automatically.'
  },
  {
    id: 'SCENARIO-VHS-002',
    title: 'High-Volume Open-Source VI Review',
    maturity: 'draft',
    harnessId: 'HARNESS-VHS-001',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
    targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    minimumCommitWindow: 4,
    minimumComparisonPairs: 3,
    decisionGoal:
      'Help a human reviewer triage many modifications on one VI without opening every pairwise comparison report by default.',
    humanDecisionBoundary:
      'The dashboard concentrates metadata and images for human triage, but the reviewer remains responsible for deciding whether deeper manual inspection is required.'
  }
];

export function listReviewScenarios(): ReviewScenarioDefinition[] {
  return REVIEW_SCENARIOS.map((scenario) => ({ ...scenario }));
}

export function getReviewScenarioDefinition(id: string): ReviewScenarioDefinition {
  const scenario = REVIEW_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new Error(`Unknown review scenario: ${id}`);
  }

  return { ...scenario };
}

export function getDefaultReviewScenarioForHarness(
  harnessId: string
): ReviewScenarioDefinition | undefined {
  const scenario = REVIEW_SCENARIOS.find(
    (candidate) => candidate.harnessId === harnessId && candidate.maturity === 'active'
  );
  return scenario ? { ...scenario } : undefined;
}

export function getDefaultReviewScenarioForRepository(
  repositoryUrl: string,
  targetRelativePath: string
): ReviewScenarioDefinition | undefined {
  const normalizedRepositoryUrl =
    normalizeGitHubRepositoryUrl(repositoryUrl) ?? repositoryUrl;
  const scenario = REVIEW_SCENARIOS.find(
    (candidate) =>
      candidate.maturity === 'active' &&
      (normalizeGitHubRepositoryUrl(candidate.repositoryUrl) ?? candidate.repositoryUrl) ===
        normalizedRepositoryUrl &&
      candidate.targetRelativePath === targetRelativePath
  );
  if (scenario) {
    return { ...scenario };
  }

  return {
    id: 'SCENARIO-VHS-ANY',
    title: 'Repo-Agnostic VI Review',
    maturity: 'active',
    harnessId: 'HARNESS-VHS-001',
    repositoryUrl: normalizedRepositoryUrl,
    targetRelativePath,
    minimumCommitWindow: 3,
    minimumComparisonPairs: 2,
    decisionGoal:
      'Help a human reviewer make a bounded decision about one VI using retained comparison evidence on any repository the extension is opened against.',
    humanDecisionBoundary:
      'The extension may concentrate evidence for any repository, but the reviewer remains responsible for deciding whether the retained evidence is sufficient for acceptance.'
  };
}

export function validateReviewScenarioEvidence(
  scenario: ReviewScenarioDefinition,
  evidence: ReviewScenarioEvidence
): string[] {
  const mismatches: string[] = [];

  if (evidence.harnessId !== undefined && scenario.harnessId !== evidence.harnessId) {
    mismatches.push(
      `Scenario ${scenario.id} requires harness ${scenario.harnessId}, got ${evidence.harnessId}.`
    );
  }

  if (
    evidence.repositoryUrl !== undefined &&
    (normalizeGitHubRepositoryUrl(scenario.repositoryUrl) ?? scenario.repositoryUrl) !==
      (normalizeGitHubRepositoryUrl(evidence.repositoryUrl) ?? evidence.repositoryUrl)
  ) {
    mismatches.push(
      `Scenario ${scenario.id} requires repository ${scenario.repositoryUrl}, got ${evidence.repositoryUrl}.`
    );
  }

  if (
    evidence.targetRelativePath !== undefined &&
    scenario.targetRelativePath !== evidence.targetRelativePath
  ) {
    mismatches.push(
      `Scenario ${scenario.id} requires target ${scenario.targetRelativePath}, got ${evidence.targetRelativePath}.`
    );
  }

  if (evidence.commitCount < scenario.minimumCommitWindow) {
    mismatches.push(
      `Scenario ${scenario.id} requires at least ${String(scenario.minimumCommitWindow)} commits, got ${String(
        evidence.commitCount
      )}.`
    );
  }

  if (evidence.comparisonPairCount < scenario.minimumComparisonPairs) {
    mismatches.push(
      `Scenario ${scenario.id} requires at least ${String(
        scenario.minimumComparisonPairs
      )} comparison pairs, got ${String(evidence.comparisonPairCount)}.`
    );
  }

  return mismatches;
}
