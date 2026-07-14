import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const {
  DEFAULT_AUDIT_BRANCHES,
  DEFAULT_BRANCH,
  DEFAULT_REPO,
  EXPECTED_ACTIVE_BRANCH_RULESETS,
  EXPECTED_ACTIVE_RULESET_TARGET,
  EXPECTED_ACTIVE_RULESET_ENFORCEMENT,
  EXPECTED_ACTIVE_RULESET_SOURCE_TYPE,
  EXPECTED_ACTIVE_RULESET_CONDITION_KEYS,
  EXPECTED_ACTIVE_RULESET_REF_NAME_KEYS,
  EXPECTED_ACTIVE_RULESET_SECTION_KEYS,
  EXPECTED_ACTIVE_RULESET_RULE_KEYS,
  EXPECTED_ACTIVE_RULESET_RULE_TYPES,
  EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS,
  EXPECTED_BRANCH_PROTECTION_SECTION_KEYS,
  EXPECTED_REQUIRED_STATUS_CHECKS,
  EXPECTED_REQUIRED_STATUS_CHECK_APP_ID,
  EXPECTED_REQUIRED_STATUS_CHECK_SECTION_KEYS,
  EXPECTED_REQUIRED_STATUS_CHECK_KEYS,
  EXPECTED_PULL_REQUEST_REVIEW_SECTION_KEYS,
  FULL_HARDENING_OPTION_KEYS,
  isAllowedExecutableCommand,
  isValidBranchName,
  isValidRepoSlug,
  enableFullHardeningOptions,
  parseArgs,
  usage,
  buildGhApiArgs,
  buildGhRulesetDetailApiArgs,
  requiredApprovingReviewCount,
  branchProtectionFlagSectionKeySummaries,
  branchProtectionSectionKeys,
  pullRequestReviewSectionKeys,
  requiredStatusContexts,
  requiredStatusCheckSectionKeys,
  requiredStatusCheckAppBindings,
  requiredStatusCheckObjectKeys,
  rulesetConditionKeys,
  rulesetRefNameKeys,
  rulesetSectionKeys,
  rulesetTargetEnforcementSummaries,
  activeRulesetSummaries,
  rulesetRuleKeys,
  rulesetRuleTypes,
  evaluateBranchProtection,
  renderResult,
  summarizeAuditResult,
  summarizeBranchResults,
  markdownCell,
  markdownCodeSpan,
  outputModeForOptions,
  generatedAtForProvenance,
  buildAuditProvenance,
  provenanceMarkdownLines,
  renderTextProvenance,
  renderMarkdown,
  renderAuditOutput,
  resolveOutputPath,
  writeAuditOutput,
  branchesForOptions,
  auditBranches,
  main
} = require('../../scripts/auditBranchProtectionSettings.js') as {
  DEFAULT_AUDIT_BRANCHES: string[];
  DEFAULT_BRANCH: string;
  DEFAULT_REPO: string;
  EXPECTED_ACTIVE_BRANCH_RULESETS: string[];
  EXPECTED_ACTIVE_RULESET_TARGET: string;
  EXPECTED_ACTIVE_RULESET_ENFORCEMENT: string;
  EXPECTED_ACTIVE_RULESET_SOURCE_TYPE: string;
  EXPECTED_ACTIVE_RULESET_CONDITION_KEYS: string[];
  EXPECTED_ACTIVE_RULESET_REF_NAME_KEYS: string[];
  EXPECTED_ACTIVE_RULESET_SECTION_KEYS: string[];
  EXPECTED_ACTIVE_RULESET_RULE_KEYS: string[];
  EXPECTED_ACTIVE_RULESET_RULE_TYPES: string[];
  EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS: Record<string, string[]>;
  EXPECTED_BRANCH_PROTECTION_SECTION_KEYS: string[];
  EXPECTED_REQUIRED_STATUS_CHECKS: string[];
  EXPECTED_REQUIRED_STATUS_CHECK_APP_ID: number;
  EXPECTED_REQUIRED_STATUS_CHECK_SECTION_KEYS: string[];
  EXPECTED_REQUIRED_STATUS_CHECK_KEYS: string[];
  EXPECTED_PULL_REQUEST_REVIEW_SECTION_KEYS: string[];
  FULL_HARDENING_OPTION_KEYS: string[];
  isAllowedExecutableCommand: (command: string) => boolean;
  isValidBranchName: (branch: string) => boolean;
  isValidRepoSlug: (repo: string) => boolean;
  enableFullHardeningOptions: (options: Record<string, boolean>) => void;
  parseArgs: (argv: string[]) => {
    repo: string;
    branch: string;
    allBranches: boolean;
    requireAdvisory: boolean;
    requireReview: boolean;
    requireLinearHistory: boolean;
    requireConversationResolution: boolean;
    requireSignedCommits: boolean;
    requireStaleReviewDismissal: boolean;
    requireCodeOwnerReview: boolean;
    requireLastPushApproval: boolean;
    requireBranchCreationBlock: boolean;
    requireFullHardening: boolean;
    emitJson: boolean;
    emitMarkdown: boolean;
    includeProvenance: boolean;
    outputPath?: string;
    help: boolean;
  };
  usage: () => string;
  buildGhApiArgs: (repo: string, branch: string, resource: string) => string[];
  buildGhRulesetDetailApiArgs: (repo: string, rulesetId: number | string) => string[];
  requiredApprovingReviewCount: (protection: Record<string, unknown>) => number;
  branchProtectionFlagSectionKeySummaries: (
    protection: Record<string, unknown>,
    expectedFlagSectionKeys?: Record<string, string[]>
  ) => Array<{ section: string; expectedKeys: string[]; observedKeys: string[]; missingKeys: string[]; unexpectedKeys: string[] }>;
  branchProtectionSectionKeys: (protection: Record<string, unknown>) => string[];
  pullRequestReviewSectionKeys: (protection: Record<string, unknown>) => string[];
  requiredStatusContexts: (protection: Record<string, unknown>) => string[];
  requiredStatusCheckSectionKeys: (protection: Record<string, unknown>) => string[];
  requiredStatusCheckAppBindings: (protection: Record<string, unknown>) => Array<{ context: string; appId: number | null }>;
  requiredStatusCheckObjectKeys: (protection: Record<string, unknown>) => string[];
  rulesetConditionKeys: (ruleset: unknown) => string[];
  rulesetRefNameKeys: (ruleset: unknown) => string[];
  rulesetSectionKeys: (ruleset: unknown) => string[];
  rulesetTargetEnforcementSummaries: (rulesets: unknown[]) => Array<{ name: string; target: string; enforcement: string }>;
  activeRulesetSummaries: (rulesets: unknown[]) => Array<{
    name: string;
    sourceType: string;
    source: string;
    sectionKeys: string[];
    conditionKeys: string[];
    refNameKeys: string[];
    ruleCount: number;
    ruleKeys: string[];
    ruleTypes: string[];
    refNameExclusions: string[];
    bypassActorCount: number;
    currentUserCanBypass: string;
  }>;
  rulesetRuleTypes: (ruleset: unknown) => string[];
  evaluateBranchProtection: (
    settings: { protection?: Record<string, unknown>; rulesets?: unknown[] },
    options?: {
      expectedRequiredChecks?: string[];
      expectedBranchProtectionSectionKeys?: string[];
      expectedBranchProtectionFlagSectionKeys?: Record<string, string[]>;
      expectedRequiredStatusCheckSectionKeys?: string[];
      expectedRequiredStatusCheckKeys?: string[];
      expectedPullRequestReviewSectionKeys?: string[];
      advisoryChecks?: string[];
      requireAdvisory?: boolean;
      requireReview?: boolean;
      requireLinearHistory?: boolean;
      requireConversationResolution?: boolean;
      requireSignedCommits?: boolean;
      requireStaleReviewDismissal?: boolean;
      requireCodeOwnerReview?: boolean;
      requireLastPushApproval?: boolean;
      requireBranchCreationBlock?: boolean;
      minimumApprovingReviews?: number;
      expectedActiveBranchRulesets?: string[];
      expectedActiveRulesetTarget?: string;
      expectedActiveRulesetEnforcement?: string;
      expectedActiveRulesetSourceType?: string;
      expectedActiveRulesetSource?: string;
      expectedActiveRulesetSectionKeys?: string[];
      expectedActiveRulesetConditionKeys?: string[];
      expectedActiveRulesetRefNameKeys?: string[];
      expectedActiveRulesetRuleKeys?: string[];
      expectedActiveRulesetRuleTypes?: string[];
      expectedRequiredStatusCheckAppId?: number;
    }
  ) => { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] };
  renderResult: (
    result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] },
    options?: { repo?: string; branch?: string }
  ) => string;
  summarizeAuditResult: (
    result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] }
  ) => {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    noticeCount: number;
    failures: Array<{ name: string; details: string }>;
  };
  summarizeBranchResults: (
    branchResults: Array<{
      branch: string;
      result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] };
    }>
  ) => {
    totalBranches: number;
    passedBranches: number;
    failedBranches: number;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    noticeCount: number;
    failures: Array<{ branch: string; name: string; details: string }>;
  };
  markdownCell: (value: unknown) => string;
  markdownCodeSpan: (value: unknown) => string;
  outputModeForOptions: (options?: { emitJson?: boolean; emitMarkdown?: boolean }) => string;
  generatedAtForProvenance: (deps?: { now?: () => Date | string; generatedAt?: Date | string }) => string;
  buildAuditProvenance: (
    branchResults: Array<{ branch: string; result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] } }>,
    options?: { repo?: string; emitJson?: boolean; emitMarkdown?: boolean },
    deps?: { now?: () => Date | string; generatedAt?: Date | string; argv?: string[] }
  ) => { generatedAt: string; repo: string; branches: string[]; outputMode: string; argv: string[] };
  provenanceMarkdownLines: (provenance?: { generatedAt: string; repo: string; branches: string[]; outputMode: string; argv: string[] }) => string[];
  renderTextProvenance: (provenance?: { generatedAt: string; repo: string; branches: string[]; outputMode: string; argv: string[] }) => string;
  renderMarkdown: (
    branchResults: Array<{
      branch: string;
      result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] };
    }>,
    options?: { repo?: string; provenance?: { generatedAt: string; repo: string; branches: string[]; outputMode: string; argv: string[] } }
  ) => string;
  renderAuditOutput: (
    branchResults: Array<{
      branch: string;
      result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] };
    }>,
    options?: { repo?: string; allBranches?: boolean; emitJson?: boolean; emitMarkdown?: boolean; provenance?: { generatedAt: string; repo: string; branches: string[]; outputMode: string; argv: string[] } }
  ) => string;
  resolveOutputPath: (outputPath: string, deps?: { cwd?: string }) => string;
  writeAuditOutput: (outputPath: string, content: string, deps?: Record<string, unknown>) => void;
  branchesForOptions: (options?: { branch?: string; allBranches?: boolean }) => string[];
  auditBranches: (options?: Record<string, unknown>, deps?: Record<string, unknown>) => Array<{ branch: string; result: { success: boolean } }>;
  rulesetRuleKeys: (ruleset: unknown) => string[];
  main: (argv: string[], deps?: Record<string, unknown>) => number;
};

type ProtectionOverrides = {
  strict?: boolean;
  contexts?: string[];
  checkContexts?: string[];
  checkAppId?: number;
  enforceAdmins?: boolean;
  allowForcePushes?: boolean;
  allowDeletions?: boolean;
  lockBranch?: boolean;
  allowForkSyncing?: boolean;
  requiredDeployments?: boolean;
  pushRestrictions?: boolean;
  requiredApprovingReviewCount?: number;
  requiredLinearHistory?: boolean;
  requiredConversationResolution?: boolean;
  requiredSignedCommits?: boolean;
  dismissStaleReviews?: boolean;
  requireCodeOwnerReviews?: boolean;
  requireLastPushApproval?: boolean;
  blockCreations?: boolean;
};

function protection(overrides: ProtectionOverrides = {}) {
  const contexts = overrides.contexts || [...EXPECTED_REQUIRED_STATUS_CHECKS];
  const checkContexts = overrides.checkContexts || contexts;
  return {
    url: `https://api.github.com/repos/${DEFAULT_REPO}/branches/develop/protection`,
    required_status_checks: {
      url: `https://api.github.com/repos/${DEFAULT_REPO}/branches/develop/protection/required_status_checks`,
      strict: overrides.strict ?? true,
      contexts,
      contexts_url: `https://api.github.com/repos/${DEFAULT_REPO}/branches/develop/protection/required_status_checks/contexts`,
      checks: checkContexts.map((context) => ({ context, app_id: overrides.checkAppId ?? EXPECTED_REQUIRED_STATUS_CHECK_APP_ID }))
    },
    enforce_admins: {
      url: `https://api.github.com/repos/${DEFAULT_REPO}/branches/develop/protection/enforce_admins`,
      enabled: overrides.enforceAdmins ?? true
    },
    allow_force_pushes: { enabled: overrides.allowForcePushes ?? false },
    allow_deletions: { enabled: overrides.allowDeletions ?? false },
    lock_branch: { enabled: overrides.lockBranch ?? false },
    allow_fork_syncing: { enabled: overrides.allowForkSyncing ?? false },
    ...(overrides.requiredDeployments ? { required_deployments: { enabled: true } } : {}),
    ...(overrides.pushRestrictions
      ? { restrictions: { users: [{ login: 'maintainer' }], teams: [{ slug: 'release' }], apps: [{ slug: 'github-actions' }] } }
      : {}),
    required_linear_history: { enabled: overrides.requiredLinearHistory ?? false },
    required_conversation_resolution: { enabled: overrides.requiredConversationResolution ?? false },
    required_signatures: {
      url: `https://api.github.com/repos/${DEFAULT_REPO}/branches/develop/protection/required_signatures`,
      enabled: overrides.requiredSignedCommits ?? false
    },
    block_creations: { enabled: overrides.blockCreations ?? false },
    required_pull_request_reviews: {
      url: `https://api.github.com/repos/${DEFAULT_REPO}/branches/develop/protection/required_pull_request_reviews`,
      dismiss_stale_reviews: overrides.dismissStaleReviews ?? false,
      require_code_owner_reviews: overrides.requireCodeOwnerReviews ?? false,
      require_last_push_approval: overrides.requireLastPushApproval ?? false,
      required_approving_review_count: overrides.requiredApprovingReviewCount ?? 0
    }
  };
}

function captureWrite() {
  let output = '';
  return {
    stream: {
      write: (chunk: string) => {
        output += chunk;
        return true;
      }
    },
    read: () => output
  };
}

function branchRulesets(names = [...EXPECTED_ACTIVE_BRANCH_RULESETS]) {
  return names.map((name, index) => {
    const rulesetId = 18415000 + index;
    return {
      id: rulesetId,
      node_id: `RRS_${rulesetId}`,
      name,
      target: EXPECTED_ACTIVE_RULESET_TARGET,
      enforcement: EXPECTED_ACTIVE_RULESET_ENFORCEMENT,
      source_type: EXPECTED_ACTIVE_RULESET_SOURCE_TYPE,
      source: DEFAULT_REPO,
      conditions: { ref_name: { include: [], exclude: [] } },
      rules: EXPECTED_ACTIVE_RULESET_RULE_TYPES.map((type) => ({ type })),
      bypass_actors: [],
      current_user_can_bypass: 'never',
      created_at: '2026-07-14T00:00:00Z',
      updated_at: '2026-07-14T00:00:00Z',
      _links: {
        self: { href: `https://api.github.com/repos/${DEFAULT_REPO}/rulesets/${rulesetId}` },
        html: { href: `https://github.com/${DEFAULT_REPO}/rules/${rulesetId}` }
      }
    };
  });
}

function branchRulesetResource(path: string) {
  const rulesets = branchRulesets();
  if (path.endsWith('/rulesets')) {
    return rulesets;
  }
  const id = path.match(/\/rulesets\/(\d+)$/u)?.[1];
  return rulesets.find((ruleset) => String(ruleset.id) === id) || rulesets[0];
}

describe('branch protection audit arguments', () => {
  it('defaults to the canonical repo and develop branch', () => {
    expect(parseArgs([])).toMatchObject({
      repo: DEFAULT_REPO,
      branch: DEFAULT_BRANCH,
      allBranches: false,
      requireAdvisory: false,
      requireReview: false,
      requireLinearHistory: false,
      requireConversationResolution: false,
      requireSignedCommits: false,
      requireStaleReviewDismissal: false,
      requireCodeOwnerReview: false,
      requireLastPushApproval: false,
      requireBranchCreationBlock: false,
      requireFullHardening: false,
      emitJson: false,
      emitMarkdown: false,
      includeProvenance: false,
      outputPath: undefined,
      help: false
    });
  });

  it('parses repo, branch, all, hardening, output, and help options', () => {
    expect(parseArgs(['--repo', 'owner/repo', '--branch', 'release/v1.2.3', '--all', '--require-advisory', '--require-review', '--require-linear-history', '--require-conversation-resolution', '--require-signed-commits', '--require-stale-review-dismissal', '--require-code-owner-review', '--require-last-push-approval', '--require-branch-creation-block', '--json', '--include-provenance', '--output', 'reports/branch-protection.json'])).toMatchObject({
      repo: 'owner/repo',
      branch: 'release/v1.2.3',
      allBranches: true,
      requireAdvisory: true,
      requireReview: true,
      requireLinearHistory: true,
      requireConversationResolution: true,
      requireSignedCommits: true,
      requireStaleReviewDismissal: true,
      requireCodeOwnerReview: true,
      requireLastPushApproval: true,
      requireBranchCreationBlock: true,
      requireFullHardening: false,
      emitJson: true,
      emitMarkdown: false,
      includeProvenance: true,
      outputPath: 'reports/branch-protection.json'
    });
    expect(FULL_HARDENING_OPTION_KEYS).toEqual([
      'requireAdvisory',
      'requireReview',
      'requireLinearHistory',
      'requireConversationResolution',
      'requireSignedCommits',
      'requireStaleReviewDismissal',
      'requireCodeOwnerReview',
      'requireLastPushApproval',
      'requireBranchCreationBlock'
    ]);
    const fullHardeningOptions: Record<string, boolean> = { requireAdvisory: false, requireReview: false };
    enableFullHardeningOptions(fullHardeningOptions);
    expect(fullHardeningOptions).toMatchObject({ requireAdvisory: true, requireReview: true });
    expect(parseArgs(['--require-full-hardening'])).toMatchObject({
      requireAdvisory: true,
      requireReview: true,
      requireLinearHistory: true,
      requireConversationResolution: true,
      requireSignedCommits: true,
      requireStaleReviewDismissal: true,
      requireCodeOwnerReview: true,
      requireLastPushApproval: true,
      requireBranchCreationBlock: true,
      requireFullHardening: true
    });
    expect(parseArgs(['--markdown'])).toMatchObject({ emitMarkdown: true, emitJson: false });
    expect(parseArgs(['--help']).help).toBe(true);
    expect(usage()).toContain('auditBranchProtectionSettings');
    expect(usage()).toContain('--require-advisory');
    expect(usage()).toContain('--require-review');
    expect(usage()).toContain('--require-linear-history');
    expect(usage()).toContain('--require-conversation-resolution');
    expect(usage()).toContain('--require-signed-commits');
    expect(usage()).toContain('--require-stale-review-dismissal');
    expect(usage()).toContain('--require-code-owner-review');
    expect(usage()).toContain('--require-last-push-approval');
    expect(usage()).toContain('--require-branch-creation-block');
    expect(usage()).toContain('--require-full-hardening');
    expect(usage()).toContain('--markdown');
    expect(usage()).toContain('--output <path>');
    expect(branchesForOptions({ allBranches: true })).toEqual(DEFAULT_AUDIT_BRANCHES);
    expect(branchesForOptions({ branch: 'main' })).toEqual(['main']);
  });

  it('rejects invalid inputs and only allow-lists gh execution', () => {
    expect(isValidRepoSlug('owner/repo')).toBe(true);
    expect(isValidRepoSlug('owner')).toBe(false);
    expect(isValidBranchName('feature/1134-branch-protection')).toBe(true);
    expect(isValidBranchName('bad branch')).toBe(false);
    expect(isAllowedExecutableCommand('gh')).toBe(true);
    expect(isAllowedExecutableCommand('git')).toBe(false);
    expect(() => parseArgs(['--repo', 'owner'])).toThrow(/owner\/repo/);
    expect(() => parseArgs(['--branch', 'bad branch'])).toThrow(/without spaces/);
    expect(() => parseArgs(['--json', '--markdown'])).toThrow(/either --json or --markdown/);
    expect(() => parseArgs(['--output'])).toThrow(/requires a value/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });
});

describe('branch protection audit evaluation', () => {
  it('builds GitHub API calls without a shell', () => {
    expect(buildGhApiArgs(DEFAULT_REPO, 'feature/with-slash', 'protection')).toEqual([
      'api',
      `repos/${DEFAULT_REPO}/branches/feature%2Fwith-slash/protection`
    ]);
    expect(buildGhApiArgs(DEFAULT_REPO, DEFAULT_BRANCH, 'rulesets')).toEqual([
      'api',
      `repos/${DEFAULT_REPO}/rulesets`
    ]);
    expect(buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415000)).toEqual([
      'api',
      `repos/${DEFAULT_REPO}/rulesets/18415000`
    ]);
  });

  it('collects required contexts from both legacy contexts and check objects', () => {
    expect(
      requiredStatusContexts({
        required_status_checks: {
          contexts: ['Windows Unit Tests'],
          checks: [{ context: 'Build, Test, Package' }, { context: 'Windows Unit Tests' }]
        }
      })
    ).toEqual(['Build, Test, Package', 'Windows Unit Tests']);
    expect(requiredApprovingReviewCount(protection())).toBe(0);
    expect(requiredApprovingReviewCount(protection({ requiredApprovingReviewCount: 2 }))).toBe(2);
    expect(EXPECTED_BRANCH_PROTECTION_SECTION_KEYS).toEqual([
      'allow_deletions',
      'allow_force_pushes',
      'allow_fork_syncing',
      'block_creations',
      'enforce_admins',
      'lock_branch',
      'required_conversation_resolution',
      'required_linear_history',
      'required_pull_request_reviews',
      'required_signatures',
      'required_status_checks',
      'url'
    ]);
    expect(branchProtectionSectionKeys({
      url: 'https://example.test/protection',
      required_status_checks: {},
      required_pull_request_reviews: {},
      enforce_admins: {},
      allow_force_pushes: {},
      allow_deletions: {},
      lock_branch: {},
      allow_fork_syncing: {},
      required_linear_history: {},
      required_conversation_resolution: {},
      required_signatures: {},
      block_creations: {},
      node_id: 'unexpected'
    })).toEqual([
      'allow_deletions',
      'allow_force_pushes',
      'allow_fork_syncing',
      'block_creations',
      'enforce_admins',
      'lock_branch',
      'node_id',
      'required_conversation_resolution',
      'required_linear_history',
      'required_pull_request_reviews',
      'required_signatures',
      'required_status_checks',
      'url'
    ]);
    expect(EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS).toEqual({
      allow_deletions: ['enabled'],
      allow_force_pushes: ['enabled'],
      allow_fork_syncing: ['enabled'],
      block_creations: ['enabled'],
      enforce_admins: ['enabled', 'url'],
      lock_branch: ['enabled'],
      required_conversation_resolution: ['enabled'],
      required_linear_history: ['enabled'],
      required_signatures: ['enabled', 'url']
    });
    expect(branchProtectionFlagSectionKeySummaries(
      {
        allow_force_pushes: { enabled: false, node_id: 'unexpected' }
      },
      { allow_force_pushes: ['enabled'] }
    )).toEqual([
      {
        section: 'allow_force_pushes',
        expectedKeys: ['enabled'],
        observedKeys: ['enabled', 'node_id'],
        missingKeys: [],
        unexpectedKeys: ['node_id']
      }
    ]);
    expect(EXPECTED_PULL_REQUEST_REVIEW_SECTION_KEYS).toEqual([
      'dismiss_stale_reviews',
      'require_code_owner_reviews',
      'require_last_push_approval',
      'required_approving_review_count',
      'url'
    ]);
    expect(pullRequestReviewSectionKeys({
      required_pull_request_reviews: {
        url: 'https://example.test/reviews',
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
        required_approving_review_count: 0,
        node_id: 'unexpected'
      }
    })).toEqual([
      'dismiss_stale_reviews',
      'node_id',
      'require_code_owner_reviews',
      'require_last_push_approval',
      'required_approving_review_count',
      'url'
    ]);
    expect(requiredStatusCheckAppBindings(protection())).toEqual([
      { context: 'Build, Test, Package', appId: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID },
      { context: 'Integration Host (Linux)', appId: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID },
      { context: 'Windows Unit Tests', appId: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID }
    ]);
    expect(EXPECTED_REQUIRED_STATUS_CHECK_SECTION_KEYS).toEqual(['checks', 'contexts', 'contexts_url', 'strict', 'url']);
    expect(requiredStatusCheckSectionKeys({
      required_status_checks: {
        url: 'https://example.test/status-checks',
        strict: true,
        contexts: [],
        contexts_url: 'https://example.test/status-checks/contexts',
        checks: [],
        node_id: 'unexpected'
      }
    })).toEqual(['checks', 'contexts', 'contexts_url', 'node_id', 'strict', 'url']);
    expect(EXPECTED_REQUIRED_STATUS_CHECK_KEYS).toEqual(['app_id', 'context']);
    expect(requiredStatusCheckObjectKeys({
      required_status_checks: {
        checks: [
          { context: 'Build, Test, Package', app_id: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID, details_url: 'https://example.test/check' },
          { context: 'Windows Unit Tests', app_id: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID }
        ]
      }
    })).toEqual(['app_id', 'context', 'details_url']);
    expect(rulesetTargetEnforcementSummaries(branchRulesets(['develop']))).toEqual([
      { name: 'develop', target: 'branch', enforcement: 'active' }
    ]);
    expect(rulesetConditionKeys({ conditions: { repository_name: {}, ref_name: {} } })).toEqual([
      'ref_name',
      'repository_name'
    ]);
    expect(rulesetRefNameKeys({ conditions: { ref_name: { include: [], exclude: [], update: [] } } })).toEqual([
      'exclude',
      'include',
      'update'
    ]);
    expect(EXPECTED_ACTIVE_RULESET_SECTION_KEYS).toEqual([
      '_links',
      'bypass_actors',
      'conditions',
      'created_at',
      'current_user_can_bypass',
      'enforcement',
      'id',
      'name',
      'node_id',
      'rules',
      'source',
      'source_type',
      'target',
      'updated_at'
    ]);
    expect(rulesetSectionKeys({ id: 1, name: 'develop', html_url: 'unexpected' })).toEqual([
      'html_url',
      'id',
      'name'
    ]);
    expect(EXPECTED_ACTIVE_RULESET_RULE_KEYS).toEqual(['type']);
    expect(rulesetRuleKeys({ rules: [{ type: 'deletion', parameters: {} }, { type: 'non_fast_forward' }] })).toEqual([
      'parameters',
      'type'
    ]);
  });

  it('passes for the current expected develop protection contract', () => {
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'required status checks are strict',
      'required status check contexts',
      'unexpected required status check contexts',
      'required status check source consistency',
      'duplicate required status check contexts',
      'required status check app bindings',
      'branch protection section keys',
      'branch protection flag section keys',
      'required status checks section keys',
      'required status check object keys',
      'pull request review section keys',
      'admin enforcement',
      'force pushes disabled',
      'branch deletions disabled',
      'branch lock disabled',
      'fork syncing disabled',
      'required deployments disabled',
      'push restrictions disabled',
      'active branch rulesets',
      'unexpected active branch rulesets',
      'duplicate active branch rulesets',
      'active branch ruleset target/enforcement',
      'active branch ruleset sources',
      'active branch ruleset section keys',
      'active branch ruleset condition keys',
      'active branch ruleset ref_name keys',
      'active branch ruleset rule count',
      'active branch ruleset rule keys',
      'active branch ruleset rules',
      'unexpected active branch ruleset rules',
      'duplicate active branch ruleset rules',
      'active branch ruleset ref exclusions',
      'active branch ruleset bypasses disabled'
    ]);
    expect(result.notices).toContain('advisory checks not branch-protection-required: Requirements CSV Integrity, CodeQL');
    expect(result.checks.find((check) => check.name === 'active branch rulesets')).toMatchObject({
      passed: true,
      details: 'present: develop, main'
    });
    expect(result.checks.find((check) => check.name === 'required status checks section keys')).toMatchObject({
      passed: true,
      details: 'checks, contexts, contexts_url, strict, url only'
    });
    expect(result.checks.find((check) => check.name === 'branch protection section keys')).toMatchObject({
      passed: true,
      details: 'allow_deletions, allow_force_pushes, allow_fork_syncing, block_creations, enforce_admins, lock_branch, required_conversation_resolution, required_linear_history, required_pull_request_reviews, required_signatures, required_status_checks, url only'
    });
    expect(result.checks.find((check) => check.name === 'branch protection flag section keys')).toMatchObject({
      passed: true,
      details: 'allow_deletions: enabled; allow_force_pushes: enabled; allow_fork_syncing: enabled; block_creations: enabled; enforce_admins: enabled, url; lock_branch: enabled; required_conversation_resolution: enabled; required_linear_history: enabled; required_signatures: enabled, url only'
    });
    expect(result.checks.find((check) => check.name === 'required status check object keys')).toMatchObject({
      passed: true,
      details: 'app_id, context only'
    });
    expect(result.checks.find((check) => check.name === 'pull request review section keys')).toMatchObject({
      passed: true,
      details: 'dismiss_stale_reviews, require_code_owner_reviews, require_last_push_approval, required_approving_review_count, url only'
    });
    expect(result.checks.find((check) => check.name === 'unexpected active branch rulesets')).toMatchObject({
      passed: true,
      details: 'none beyond: develop, main'
    });
    expect(result.checks.find((check) => check.name === 'duplicate active branch rulesets')).toMatchObject({
      passed: true,
      details: 'none'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset target/enforcement')).toMatchObject({
      passed: true,
      details: 'target branch and enforcement active on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset sources')).toMatchObject({
      passed: true,
      details: 'Repository LabVIEW-Community-CI-CD/vi-history-suite on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset section keys')).toMatchObject({
      passed: true,
      details: '_links, bypass_actors, conditions, created_at, current_user_can_bypass, enforcement, id, name, node_id, rules, source, source_type, target, updated_at only on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset condition keys')).toMatchObject({
      passed: true,
      details: 'ref_name only on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset ref_name keys')).toMatchObject({
      passed: true,
      details: 'exclude, include only on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset rule count')).toMatchObject({
      passed: true,
      details: '2 rules on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset rule keys')).toMatchObject({
      passed: true,
      details: 'type only on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'required deployments disabled')).toMatchObject({
      passed: true,
      details: 'disabled'
    });
    expect(result.checks.find((check) => check.name === 'push restrictions disabled')).toMatchObject({
      passed: true,
      details: 'disabled'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset rules')).toMatchObject({
      passed: true,
      details: 'present on develop, main: deletion, non_fast_forward'
    });
    expect(result.checks.find((check) => check.name === 'unexpected active branch ruleset rules')).toMatchObject({
      passed: true,
      details: 'none beyond deletion, non_fast_forward on develop, main'
    });
    expect(result.checks.find((check) => check.name === 'duplicate active branch ruleset rules')).toMatchObject({
      passed: true,
      details: 'none'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset ref exclusions')).toMatchObject({
      passed: true,
      details: 'none'
    });
    expect(result.checks.find((check) => check.name === 'unexpected required status check contexts')).toMatchObject({
      passed: true,
      details: 'none beyond: Build, Test, Package, Windows Unit Tests, Integration Host (Linux)'
    });
    expect(result.checks.find((check) => check.name === 'required status check source consistency')).toMatchObject({
      passed: true,
      details: 'aligned: Build, Test, Package, Integration Host (Linux), Windows Unit Tests'
    });
    expect(result.checks.find((check) => check.name === 'duplicate required status check contexts')).toMatchObject({
      passed: true,
      details: 'none'
    });
    expect(activeRulesetSummaries([branchRulesets(['develop'])[0]])).toEqual([
      {
        name: 'develop',
        sourceType: 'Repository',
        source: DEFAULT_REPO,
        sectionKeys: [
          '_links',
          'bypass_actors',
          'conditions',
          'created_at',
          'current_user_can_bypass',
          'enforcement',
          'id',
          'name',
          'node_id',
          'rules',
          'source',
          'source_type',
          'target',
          'updated_at'
        ],
        conditionKeys: ['ref_name'],
        refNameKeys: ['exclude', 'include'],
        ruleCount: 2,
        ruleKeys: ['type'],
        ruleTypes: ['deletion', 'non_fast_forward'],
        refNameExclusions: [],
        bypassActorCount: 0,
        currentUserCanBypass: 'never'
      }
    ]);
    expect(rulesetRuleTypes({ rules: [{ type: 'non_fast_forward' }, { type: 'deletion' }] })).toEqual([
      'deletion',
      'non_fast_forward'
    ]);
  });

  it('fails closed when critical branch protection settings drift', () => {
    const result = evaluateBranchProtection({
      protection: protection({
        strict: false,
        contexts: ['Build, Test, Package'],
        enforceAdmins: false,
        allowForcePushes: true,
        allowDeletions: true,
        lockBranch: true,
        allowForkSyncing: true,
        requiredDeployments: true,
        pushRestrictions: true
      }),
      rulesets: []
    });

    expect(result.success).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.name)).toEqual([
      'required status checks are strict',
      'required status check contexts',
      'required status check app bindings',
      'branch protection section keys',
      'admin enforcement',
      'force pushes disabled',
      'branch deletions disabled',
      'branch lock disabled',
      'fork syncing disabled',
      'required deployments disabled',
      'push restrictions disabled',
      'active branch rulesets',
      'active branch ruleset rules'
    ]);
    expect(renderResult(result, { repo: DEFAULT_REPO, branch: DEFAULT_BRANCH })).toContain(
      '[branch-protection-audit] Audit failed.'
    );
  });

  it('summarizes audit results for JSON evidence consumers', () => {
    const failingResult = evaluateBranchProtection({
      protection: protection({
        strict: false,
        contexts: ['Build, Test, Package'],
        enforceAdmins: false,
        allowForcePushes: true,
        allowDeletions: true,
        lockBranch: true,
        allowForkSyncing: true,
        requiredDeployments: true,
        pushRestrictions: true
      }),
      rulesets: []
    });
    const passingResult = evaluateBranchProtection({ protection: protection(), rulesets: branchRulesets() });
    const failingSummary = summarizeAuditResult(failingResult);

    expect(failingSummary).toMatchObject({
      totalChecks: 33,
      passedChecks: 20,
      failedChecks: 13,
      noticeCount: 3
    });
    expect(failingSummary.failures.slice(0, 2)).toEqual([
      { name: 'required status checks are strict', details: 'missing or disabled' },
      { name: 'required status check contexts', details: 'missing: Windows Unit Tests, Integration Host (Linux); present: Build, Test, Package' }
    ]);

    const aggregateSummary = summarizeBranchResults([
      { branch: 'develop', result: failingResult },
      { branch: 'main', result: passingResult }
    ]);
    expect(aggregateSummary).toMatchObject({
      totalBranches: 2,
      passedBranches: 1,
      failedBranches: 1,
      totalChecks: 66,
      passedChecks: 53,
      failedChecks: 13,
      noticeCount: 6
    });
    expect(aggregateSummary.failures[0]).toEqual({ branch: 'develop', name: 'required status checks are strict', details: 'missing or disabled' });
  });

  it('renders compact Markdown audit evidence', () => {
    const passingResult = evaluateBranchProtection({ protection: protection(), rulesets: branchRulesets() });
    const failingResult = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireAdvisory: true }
    );

    expect(markdownCell('branch\\with|pipe\nnewline')).toBe('branch\\\\with\\|pipe newline');
    expect(markdownCodeSpan('branch\\with|pipe\nnewline')).toBe('`branch\\with|pipe newline`');
    expect(markdownCodeSpan('branch`with`ticks')).toBe('``branch`with`ticks``');
    expect(renderMarkdown([{ branch: 'develop', result: passingResult }], { repo: DEFAULT_REPO })).toBe([
      '## Branch Protection Audit',
      '',
      `- Repository: \`${DEFAULT_REPO}\``,
      '- Result: PASS',
      '- Branches: 1/1 passed',
      '- Checks: 33/33 passed',
      '- Notices: 3',
      '',
      '| Branch | Result | Checks | Failed | Notices |',
      '| --- | --- | ---: | ---: | ---: |',
      '| develop | PASS | 33/33 | 0 | 3 |',
      '',
      'No failures.'
    ].join('\n'));

    expect(renderMarkdown([{ branch: 'main', result: failingResult }], { repo: DEFAULT_REPO })).toContain(
      '| main | advisory status check contexts | missing: Requirements CSV Integrity, CodeQL; present: Build, Test, Package, Integration Host (Linux), Windows Unit Tests |'
    );
  });

  it('renders and writes audit output for file evidence consumers', () => {
    const passingResult = evaluateBranchProtection({ protection: protection(), rulesets: branchRulesets() });
    const branchResults = [{ branch: 'develop', result: passingResult }];
    const cwd = path.join(process.cwd(), 'fixture-root');
    const resolvedOutput = path.join(cwd, 'evidence', 'branch-protection.md');
    const mkdirSync = vi.fn();
    const writeFileSync = vi.fn();

    expect(renderAuditOutput(branchResults, { repo: DEFAULT_REPO, emitMarkdown: true })).toBe(
      renderMarkdown(branchResults, { repo: DEFAULT_REPO })
    );
    expect(JSON.parse(renderAuditOutput(branchResults, { repo: DEFAULT_REPO, emitJson: true }))).toMatchObject({
      schemaVersion: 1,
      repo: DEFAULT_REPO,
      branch: 'develop',
      success: true
    });
    expect(resolveOutputPath('evidence/branch-protection.md', { cwd })).toBe(resolvedOutput);
    expect(() => resolveOutputPath('', { cwd })).toThrow(/non-empty path/);
    expect(() => resolveOutputPath('../branch-protection.md', { cwd })).toThrow(/stay inside/);
    expect(() => resolveOutputPath(resolvedOutput, { cwd })).toThrow(/relative path/);

    writeAuditOutput('evidence/branch-protection.md', 'audit body', { cwd, mkdirSync, writeFileSync });

    expect(mkdirSync).toHaveBeenCalledWith(path.dirname(resolvedOutput), { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(resolvedOutput, 'audit body\n', 'utf8');
  });

  it('renders optional provenance for retained evidence', () => {
    const passingResult = evaluateBranchProtection({ protection: protection(), rulesets: branchRulesets() });
    const branchResults = [{ branch: 'develop', result: passingResult }];
    const provenance = buildAuditProvenance(
      branchResults,
      { repo: DEFAULT_REPO, emitMarkdown: true },
      { now: () => new Date('2026-07-14T12:00:00.000Z'), argv: ['--all', '--markdown', '--include-provenance'] }
    );

    expect(outputModeForOptions({ emitJson: true })).toBe('json');
    expect(outputModeForOptions({ emitMarkdown: true })).toBe('markdown');
    expect(outputModeForOptions()).toBe('text');
    expect(generatedAtForProvenance({ generatedAt: new Date('2026-07-14T12:00:00.000Z') })).toBe('2026-07-14T12:00:00.000Z');
    expect(provenance).toEqual({
      generatedAt: '2026-07-14T12:00:00.000Z',
      repo: DEFAULT_REPO,
      branches: ['develop'],
      outputMode: 'markdown',
      argv: ['--all', '--markdown', '--include-provenance']
    });
    expect(provenanceMarkdownLines(provenance)).toEqual([
      '- Generated: `2026-07-14T12:00:00.000Z`',
      '- Output: `markdown`',
      '- Audit argv: `["--all","--markdown","--include-provenance"]`'
    ]);
    expect(provenanceMarkdownLines({
      ...provenance,
      argv: ['--output', 'evidence\\branch-protection|audit.md']
    })).toContain('- Audit argv: `["--output","evidence\\\\branch-protection|audit.md"]`');
    expect(renderMarkdown(branchResults, { repo: DEFAULT_REPO, provenance })).toContain('- Generated: `2026-07-14T12:00:00.000Z`');
    expect(renderTextProvenance(provenance)).toBe([
      '[branch-protection-audit] Provenance',
      'generatedAt: 2026-07-14T12:00:00.000Z',
      `repo: ${DEFAULT_REPO}`,
      'branches: develop',
      'outputMode: markdown',
      'argv: ["--all","--markdown","--include-provenance"]',
      ''
    ].join('\n'));
    expect(JSON.parse(renderAuditOutput(branchResults, { repo: DEFAULT_REPO, emitJson: true, provenance }))).toMatchObject({
      schemaVersion: 1,
      repo: DEFAULT_REPO,
      provenance,
      branch: 'develop',
      success: true
    });
  });

  it('fails closed when expected active branch rulesets drift', () => {
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: branchRulesets(['develop'])
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch rulesets')).toMatchObject({
      passed: false,
      details: 'missing: main; present: develop'
    });
  });

  it('fails closed when unexpected active branch rulesets drift', () => {
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: branchRulesets([...EXPECTED_ACTIVE_BRANCH_RULESETS, 'release'])
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'unexpected active branch rulesets')).toMatchObject({
      passed: false,
      details: 'unexpected: release; allowed: develop, main'
    });
  });

  it('fails closed when duplicate active branch rulesets drift', () => {
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: branchRulesets([...EXPECTED_ACTIVE_BRANCH_RULESETS, 'develop'])
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'duplicate active branch rulesets')).toMatchObject({
      passed: false,
      details: 'duplicates: develop (2)'
    });
  });

  it('fails closed when expected active branch ruleset sources drift', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, source_type: 'Organization', source: 'LabVIEW-Community-CI-CD' },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset sources')).toMatchObject({
      passed: false,
      details: 'develop source Organization LabVIEW-Community-CI-CD; expected Repository LabVIEW-Community-CI-CD/vi-history-suite'
    });
  });

  it('fails closed when active branch rulesets use unexpected section keys', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, html_url: 'https://example.test/unexpected' },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset section keys')).toMatchObject({
      passed: false,
      details: 'develop missing: none; unexpected: html_url; observed: _links, bypass_actors, conditions, created_at, current_user_can_bypass, enforcement, html_url, id, name, node_id, rules, source, source_type, target, updated_at; allowed: _links, bypass_actors, conditions, created_at, current_user_can_bypass, enforcement, id, name, node_id, rules, source, source_type, target, updated_at'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: protection(),
        rulesets: [
          { ...developRuleset, html_url: 'https://example.test/expected' },
          { ...mainRuleset, html_url: 'https://example.test/expected' }
        ]
      },
      {
        expectedActiveRulesetSectionKeys: [
          '_links',
          'bypass_actors',
          'conditions',
          'created_at',
          'current_user_can_bypass',
          'enforcement',
          'html_url',
          'id',
          'name',
          'node_id',
          'rules',
          'source',
          'source_type',
          'target',
          'updated_at'
        ]
      }
    );

    expect(hardened.checks.find((check) => check.name === 'active branch ruleset section keys')).toMatchObject({
      passed: true,
      details: '_links, bypass_actors, conditions, created_at, current_user_can_bypass, enforcement, html_url, id, name, node_id, rules, source, source_type, target, updated_at only on develop, main'
    });
  });

  it('fails closed when expected active branch ruleset target or enforcement drifts', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, target: 'tag' },
        { ...mainRuleset, enforcement: 'disabled' }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset target/enforcement')).toMatchObject({
      passed: false,
      details: 'develop target tag, enforcement active; expected target branch and enforcement active; main target branch, enforcement disabled; expected target branch and enforcement active'
    });
  });

  it('fails closed when active branch rulesets use unexpected condition keys', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, conditions: { ref_name: { include: [], exclude: [] }, repository_name: { include: ['vi-history-suite'] } } },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset condition keys')).toMatchObject({
      passed: false,
      details: 'develop missing: none; unexpected: repository_name; observed: ref_name, repository_name; allowed: ref_name'
    });

    const custom = evaluateBranchProtection(
      { protection: protection(), rulesets: [{ ...developRuleset, conditions: {} }, { ...mainRuleset, conditions: {} }] },
      { expectedActiveRulesetConditionKeys: [] }
    );

    expect(custom.checks.find((check) => check.name === 'active branch ruleset condition keys')).toMatchObject({
      passed: true,
      details: 'none only on develop, main'
    });
  });

  it('fails closed when active branch rulesets use unexpected ref_name keys', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, conditions: { ref_name: { include: [], exclude: [], update: [] } } },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset ref_name keys')).toMatchObject({
      passed: false,
      details: 'develop missing: none; unexpected: update; observed: exclude, include, update; allowed: exclude, include'
    });

    const custom = evaluateBranchProtection(
      { protection: protection(), rulesets: [{ ...developRuleset, conditions: { ref_name: {} } }, { ...mainRuleset, conditions: { ref_name: {} } }] },
      { expectedActiveRulesetRefNameKeys: [] }
    );

    expect(custom.checks.find((check) => check.name === 'active branch ruleset ref_name keys')).toMatchObject({
      passed: true,
      details: 'none only on develop, main'
    });
  });

  it('fails closed when active branch ruleset rule counts drift', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, rules: [...developRuleset.rules, { type: '' }] },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset rule count')).toMatchObject({
      passed: false,
      details: 'develop rule count 3; expected 2; observed: deletion, non_fast_forward'
    });
  });

  it('fails closed when active branch rulesets use unexpected rule keys', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, rules: developRuleset.rules.map((rule) => ({ ...rule, parameters: {} })) },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset rule keys')).toMatchObject({
      passed: false,
      details: 'develop missing: none; unexpected: parameters; observed: parameters, type; allowed: type'
    });

    const custom = evaluateBranchProtection(
      {
        protection: protection(),
        rulesets: [
          { ...developRuleset, rules: developRuleset.rules.map((rule) => ({ ...rule, parameters: {} })) },
          { ...mainRuleset, rules: mainRuleset.rules.map((rule) => ({ ...rule, parameters: {} })) }
        ]
      },
      { expectedActiveRulesetRuleKeys: ['parameters', 'type'] }
    );

    expect(custom.checks.find((check) => check.name === 'active branch ruleset rule keys')).toMatchObject({
      passed: true,
      details: 'parameters, type only on develop, main'
    });
  });

  it('fails closed when required deployments are enabled', () => {
    const result = evaluateBranchProtection({
      protection: protection({ requiredDeployments: true }),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'required deployments disabled')).toMatchObject({
      passed: false,
      details: 'enabled or unavailable'
    });
  });

  it('fails closed when push restrictions are enabled', () => {
    const result = evaluateBranchProtection({
      protection: protection({ pushRestrictions: true }),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'push restrictions disabled')).toMatchObject({
      passed: false,
      details: 'enabled: users 1, teams 1, apps 1'
    });
  });

  it('fails closed when required status check app bindings drift', () => {
    const result = evaluateBranchProtection({
      protection: protection({ checkAppId: 12345 }),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'required status check app bindings')).toMatchObject({
      passed: false,
      details: 'Build, Test, Package app 12345; expected app 15368; Windows Unit Tests app 12345; expected app 15368; Integration Host (Linux) app 12345; expected app 15368'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ checkAppId: 12345 }), rulesets: branchRulesets() },
      { expectedRequiredStatusCheckAppId: 12345 }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'required status check app bindings')).toMatchObject({
      passed: true,
      details: 'app 12345: Build, Test, Package, Windows Unit Tests, Integration Host (Linux)'
    });
  });

  it('fails closed when required status checks section keys drift', () => {
    const baseProtection = protection();
    const result = evaluateBranchProtection({
      protection: {
        ...baseProtection,
        required_status_checks: {
          ...baseProtection.required_status_checks,
          node_id: 'unexpected-section-key'
        }
      },
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'required status checks section keys')).toMatchObject({
      passed: false,
      details: 'missing: none; unexpected: node_id; observed: checks, contexts, contexts_url, node_id, strict, url; allowed: checks, contexts, contexts_url, strict, url'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: {
          ...baseProtection,
          required_status_checks: {
            ...baseProtection.required_status_checks,
            node_id: 'expected-section-key'
          }
        },
        rulesets: branchRulesets()
      },
      { expectedRequiredStatusCheckSectionKeys: ['checks', 'contexts', 'contexts_url', 'node_id', 'strict', 'url'] }
    );

    expect(hardened.checks.find((check) => check.name === 'required status checks section keys')).toMatchObject({
      passed: true,
      details: 'checks, contexts, contexts_url, node_id, strict, url only'
    });
  });

  it('fails closed when branch protection section keys drift', () => {
    const baseProtection = protection();
    const result = evaluateBranchProtection({
      protection: {
        ...baseProtection,
        node_id: 'unexpected-section-key'
      },
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'branch protection section keys')).toMatchObject({
      passed: false,
      details: 'missing: none; unexpected: node_id; observed: allow_deletions, allow_force_pushes, allow_fork_syncing, block_creations, enforce_admins, lock_branch, node_id, required_conversation_resolution, required_linear_history, required_pull_request_reviews, required_signatures, required_status_checks, url; allowed: allow_deletions, allow_force_pushes, allow_fork_syncing, block_creations, enforce_admins, lock_branch, required_conversation_resolution, required_linear_history, required_pull_request_reviews, required_signatures, required_status_checks, url'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: {
          ...baseProtection,
          node_id: 'expected-section-key'
        },
        rulesets: branchRulesets()
      },
      {
        expectedBranchProtectionSectionKeys: [
          'allow_deletions',
          'allow_force_pushes',
          'allow_fork_syncing',
          'block_creations',
          'enforce_admins',
          'lock_branch',
          'node_id',
          'required_conversation_resolution',
          'required_linear_history',
          'required_pull_request_reviews',
          'required_signatures',
          'required_status_checks',
          'url'
        ]
      }
    );

    expect(hardened.checks.find((check) => check.name === 'branch protection section keys')).toMatchObject({
      passed: true,
      details: 'allow_deletions, allow_force_pushes, allow_fork_syncing, block_creations, enforce_admins, lock_branch, node_id, required_conversation_resolution, required_linear_history, required_pull_request_reviews, required_signatures, required_status_checks, url only'
    });
  });

  it('fails closed when branch protection flag section keys drift', () => {
    const baseProtection = protection();
    const result = evaluateBranchProtection({
      protection: {
        ...baseProtection,
        allow_force_pushes: {
          enabled: false,
          node_id: 'unexpected-section-key'
        }
      },
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'branch protection flag section keys')).toMatchObject({
      passed: false,
      details: 'allow_force_pushes missing: none; unexpected: node_id; observed: enabled, node_id; allowed: enabled'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: {
          ...baseProtection,
          allow_force_pushes: {
            enabled: false,
            node_id: 'expected-section-key'
          }
        },
        rulesets: branchRulesets()
      },
      {
        expectedBranchProtectionFlagSectionKeys: {
          ...EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS,
          allow_force_pushes: ['enabled', 'node_id']
        }
      }
    );

    expect(hardened.checks.find((check) => check.name === 'branch protection flag section keys')).toMatchObject({
      passed: true,
      details: 'allow_deletions: enabled; allow_force_pushes: enabled, node_id; allow_fork_syncing: enabled; block_creations: enabled; enforce_admins: enabled, url; lock_branch: enabled; required_conversation_resolution: enabled; required_linear_history: enabled; required_signatures: enabled, url only'
    });
  });

  it('fails closed when required status check object keys drift', () => {
    const baseProtection = protection();
    const result = evaluateBranchProtection({
      protection: {
        ...baseProtection,
        required_status_checks: {
          ...baseProtection.required_status_checks,
          checks: baseProtection.required_status_checks.checks.map((check) => ({
            ...check,
            details_url: `https://example.test/${check.context}`
          }))
        }
      },
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'required status check object keys')).toMatchObject({
      passed: false,
      details: 'missing: none; unexpected: details_url; observed: app_id, context, details_url; allowed: app_id, context'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: {
          ...baseProtection,
          required_status_checks: {
            ...baseProtection.required_status_checks,
            checks: baseProtection.required_status_checks.checks.map((check) => ({
              ...check,
              details_url: `https://example.test/${check.context}`
            }))
          }
        },
        rulesets: branchRulesets()
      },
      { expectedRequiredStatusCheckKeys: ['app_id', 'context', 'details_url'] }
    );

    expect(hardened.checks.find((check) => check.name === 'required status check object keys')).toMatchObject({
      passed: true,
      details: 'app_id, context, details_url only'
    });
  });

  it('fails closed when pull request review section keys drift', () => {
    const baseProtection = protection();
    const result = evaluateBranchProtection({
      protection: {
        ...baseProtection,
        required_pull_request_reviews: {
          ...baseProtection.required_pull_request_reviews,
          node_id: 'unexpected-section-key'
        }
      },
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'pull request review section keys')).toMatchObject({
      passed: false,
      details: 'missing: none; unexpected: node_id; observed: dismiss_stale_reviews, node_id, require_code_owner_reviews, require_last_push_approval, required_approving_review_count, url; allowed: dismiss_stale_reviews, require_code_owner_reviews, require_last_push_approval, required_approving_review_count, url'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: {
          ...baseProtection,
          required_pull_request_reviews: {
            ...baseProtection.required_pull_request_reviews,
            node_id: 'expected-section-key'
          }
        },
        rulesets: branchRulesets()
      },
      {
        expectedPullRequestReviewSectionKeys: [
          'dismiss_stale_reviews',
          'node_id',
          'require_code_owner_reviews',
          'require_last_push_approval',
          'required_approving_review_count',
          'url'
        ]
      }
    );

    expect(hardened.checks.find((check) => check.name === 'pull request review section keys')).toMatchObject({
      passed: true,
      details: 'dismiss_stale_reviews, node_id, require_code_owner_reviews, require_last_push_approval, required_approving_review_count, url only'
    });
  });

  it('fails closed when unexpected required status contexts drift', () => {
    const result = evaluateBranchProtection({
      protection: protection({ contexts: [...EXPECTED_REQUIRED_STATUS_CHECKS, 'Surprise Gate'] }),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'unexpected required status check contexts')).toMatchObject({
      passed: false,
      details: 'unexpected: Surprise Gate; allowed: Build, Test, Package, Windows Unit Tests, Integration Host (Linux)'
    });
  });

  it('fails closed when required status check sources drift', () => {
    const result = evaluateBranchProtection({
      protection: protection({
        checkContexts: EXPECTED_REQUIRED_STATUS_CHECKS.filter((context) => context !== 'Windows Unit Tests')
      }),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'required status check source consistency')).toMatchObject({
      passed: false,
      details: 'checks missing: Windows Unit Tests; contexts missing: none'
    });
  });

  it('fails closed when required status check contexts are duplicated', () => {
    const result = evaluateBranchProtection({
      protection: protection({
        contexts: [...EXPECTED_REQUIRED_STATUS_CHECKS, 'Windows Unit Tests'],
        checkContexts: [...EXPECTED_REQUIRED_STATUS_CHECKS, 'Build, Test, Package']
      }),
      rulesets: branchRulesets()
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'duplicate required status check contexts')).toMatchObject({
      passed: false,
      details: 'contexts duplicates: Windows Unit Tests (2); checks duplicates: Build, Test, Package (2)'
    });
  });

  it('fails closed when active branch ruleset details drift', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, rules: [{ type: 'deletion' }] },
        { ...mainRuleset, bypass_actors: [{ actor_id: 1, actor_type: 'Team', bypass_mode: 'always' }], current_user_can_bypass: 'always' }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset rules')).toMatchObject({
      passed: false,
      details: 'develop missing: non_fast_forward; observed: deletion'
    });
    expect(result.checks.find((check) => check.name === 'active branch ruleset bypasses disabled')).toMatchObject({
      passed: false,
      details: 'main: bypass actors 1, current user can bypass always'
    });
  });

  it('fails closed when active branch rulesets include unexpected rules', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, rules: [...developRuleset.rules, { type: 'pull_request' }] },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'unexpected active branch ruleset rules')).toMatchObject({
      passed: false,
      details: 'develop unexpected: pull_request; observed: deletion, non_fast_forward, pull_request'
    });
  });

  it('fails closed when active branch rulesets duplicate rules', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, rules: [...developRuleset.rules, { type: 'deletion' }] },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'duplicate active branch ruleset rules')).toMatchObject({
      passed: false,
      details: 'develop duplicates: deletion (2); observed: deletion, deletion, non_fast_forward'
    });
  });

  it('fails closed when active branch rulesets exclude refs', () => {
    const [developRuleset, mainRuleset] = branchRulesets();
    const result = evaluateBranchProtection({
      protection: protection(),
      rulesets: [
        { ...developRuleset, conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: ['refs/heads/release/*'] } } },
        mainRuleset
      ]
    });

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'active branch ruleset ref exclusions')).toMatchObject({
      passed: false,
      details: 'develop excludes: refs/heads/release/*'
    });
  });

  it('can require advisory contexts for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireAdvisory: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'advisory status check contexts')).toMatchObject({
      passed: false,
      details: 'missing: Requirements CSV Integrity, CodeQL; present: Build, Test, Package, Integration Host (Linux), Windows Unit Tests'
    });

    const hardened = evaluateBranchProtection(
      {
        protection: protection({ contexts: [...EXPECTED_REQUIRED_STATUS_CHECKS, 'Requirements CSV Integrity', 'CodeQL'] }),
        rulesets: branchRulesets()
      },
      { requireAdvisory: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'advisory status check contexts')).toMatchObject({
      passed: true,
      details: 'required: Requirements CSV Integrity, CodeQL'
    });
  });

  it('can require pull request approving reviews for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireReview: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'pull request approving reviews')).toMatchObject({
      passed: false,
      details: 'required approving reviews: 0; expected at least 1'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ requiredApprovingReviewCount: 1 }), rulesets: branchRulesets() },
      { requireReview: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'pull request approving reviews')).toMatchObject({
      passed: true,
      details: 'required approving reviews: 1'
    });
  });

  it('can require stale review dismissal for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireStaleReviewDismissal: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'stale review dismissal')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ dismissStaleReviews: true }), rulesets: branchRulesets() },
      { requireStaleReviewDismissal: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'stale review dismissal')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });

  it('can require code-owner reviews for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireCodeOwnerReview: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'code-owner review')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ requireCodeOwnerReviews: true }), rulesets: branchRulesets() },
      { requireCodeOwnerReview: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'code-owner review')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });

  it('can require last-push approval for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireLastPushApproval: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'last-push approval')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ requireLastPushApproval: true }), rulesets: branchRulesets() },
      { requireLastPushApproval: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'last-push approval')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });

  it('can require branch creation blocking for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireBranchCreationBlock: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'branch creation block')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ blockCreations: true }), rulesets: branchRulesets() },
      { requireBranchCreationBlock: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'branch creation block')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });

  it('can require linear history for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireLinearHistory: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'linear history')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ requiredLinearHistory: true }), rulesets: branchRulesets() },
      { requireLinearHistory: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'linear history')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });

  it('can require conversation resolution for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireConversationResolution: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'conversation resolution')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ requiredConversationResolution: true }), rulesets: branchRulesets() },
      { requireConversationResolution: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'conversation resolution')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });

  it('can require signed commits for branch-protection hardening audits', () => {
    const result = evaluateBranchProtection(
      { protection: protection(), rulesets: branchRulesets() },
      { requireSignedCommits: true }
    );

    expect(result.success).toBe(false);
    expect(result.checks.find((check) => check.name === 'signed commits')).toMatchObject({
      passed: false,
      details: 'disabled or unavailable'
    });

    const hardened = evaluateBranchProtection(
      { protection: protection({ requiredSignedCommits: true }), rulesets: branchRulesets() },
      { requireSignedCommits: true }
    );

    expect(hardened.success).toBe(true);
    expect(hardened.checks.find((check) => check.name === 'signed commits')).toMatchObject({
      passed: true,
      details: 'enabled'
    });
  });
});

describe('branch protection audit main', () => {
  it('uses injected gh execution and renders a passing summary', () => {
    const calls: string[][] = [];
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main([], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(calls).toEqual([
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, DEFAULT_BRANCH, 'protection')],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, DEFAULT_BRANCH, 'rulesets')],
      ['gh', ...buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415000)],
      ['gh', ...buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415001)]
    ]);
    expect(stdout.read()).toContain('[branch-protection-audit] Audit passed.');
  });

  it('audits all default protected branches with --all', () => {
    const calls: string[][] = [];
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(calls).toEqual([
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'rulesets')],
      ['gh', ...buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415000)],
      ['gh', ...buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415001)],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'protection')],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'main', 'protection')],
    ]);
    expect(stdout.read()).toContain(`${DEFAULT_REPO}:develop`);
    expect(stdout.read()).toContain(`${DEFAULT_REPO}:main`);
  });

  it('reuses repository rulesets while auditing all default branches', () => {
    const calls: string[][] = [];
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    expect(auditBranches({ repo: DEFAULT_REPO, allBranches: true }, { spawnSync }).map((item) => item.branch)).toEqual(
      DEFAULT_AUDIT_BRANCHES
    );
    expect(calls).toEqual([
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'rulesets')],
      ['gh', ...buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415000)],
      ['gh', ...buildGhRulesetDetailApiArgs(DEFAULT_REPO, 18415001)],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'protection')],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'main', 'protection')]
    ]);
  });

  it('preserves the v1 single-branch JSON shape without --all', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--json'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });
    const output = JSON.parse(stdout.read()) as {
      schemaVersion: number;
      repo: string;
      branch: string;
      success: boolean;
      summary: { totalChecks: number; passedChecks: number; failedChecks: number; noticeCount: number; failures: unknown[] };
      checks: unknown[];
      notices: unknown[];
      branches?: unknown[];
    };

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(output).toMatchObject({
      schemaVersion: 1,
      repo: DEFAULT_REPO,
      branch: DEFAULT_BRANCH,
      success: true
    });
    expect(output.summary).toEqual({
      totalChecks: 33,
      passedChecks: 33,
      failedChecks: 0,
      noticeCount: 3,
      failures: []
    });
    expect(output.checks).toHaveLength(33);
    expect(output.notices.length).toBeGreaterThan(0);
    expect(output.branches).toBeUndefined();
  });

  it('emits aggregate JSON when --all is requested', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all', '--json'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });
    const output = JSON.parse(stdout.read()) as {
      schemaVersion: number;
      repo: string;
      success: boolean;
      summary: { totalBranches: number; passedBranches: number; failedBranches: number; totalChecks: number; passedChecks: number; failedChecks: number; noticeCount: number; failures: unknown[] };
      branches: Array<{ branch: string; success: boolean; summary: { totalChecks: number; passedChecks: number; failedChecks: number; noticeCount: number; failures: unknown[] } }>;
      branch?: string;
      checks?: unknown[];
      notices?: unknown[];
    };

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(output).toMatchObject({
      schemaVersion: 1,
      repo: DEFAULT_REPO,
      success: true
    });
    expect(output.summary).toEqual({
      totalBranches: 2,
      passedBranches: 2,
      failedBranches: 0,
      totalChecks: 66,
      passedChecks: 66,
      failedChecks: 0,
      noticeCount: 6,
      failures: []
    });
    expect(output.branches.map((item) => item.branch)).toEqual(DEFAULT_AUDIT_BRANCHES);
    expect(output.branches.every((item) => item.success)).toBe(true);
    expect(output.branches.map((item) => item.summary.totalChecks)).toEqual([33, 33]);
    expect(output.branches.every((item) => item.summary.failedChecks === 0)).toBe(true);
    expect(output.branch).toBeUndefined();
    expect(output.checks).toBeUndefined();
    expect(output.notices).toBeUndefined();
  });

  it('emits aggregate JSON provenance when requested', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all', '--json', '--include-provenance'], {
      spawnSync,
      stdout: stdout.stream,
      stderr: stderr.stream,
      now: () => new Date('2026-07-14T12:00:00.000Z')
    });
    const output = JSON.parse(stdout.read()) as {
      provenance: { generatedAt: string; repo: string; branches: string[]; outputMode: string; argv: string[] };
    };

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(output.provenance).toEqual({
      generatedAt: '2026-07-14T12:00:00.000Z',
      repo: DEFAULT_REPO,
      branches: DEFAULT_AUDIT_BRANCHES,
      outputMode: 'json',
      argv: ['--all', '--json', '--include-provenance']
    });
  });

  it('emits aggregate JSON failure summaries when opt-in hardening checks fail', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all', '--json', '--require-advisory'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });
    const output = JSON.parse(stdout.read()) as {
      success: boolean;
      summary: {
        totalBranches: number;
        passedBranches: number;
        failedBranches: number;
        totalChecks: number;
        passedChecks: number;
        failedChecks: number;
        noticeCount: number;
        failures: Array<{ branch: string; name: string; details: string }>;
      };
      branches: Array<{ branch: string; success: boolean; summary: { failedChecks: number; failures: Array<{ name: string; details: string }> } }>;
    };

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(output.success).toBe(false);
    expect(output.summary).toMatchObject({
      totalBranches: 2,
      passedBranches: 0,
      failedBranches: 2,
      totalChecks: 68,
      passedChecks: 66,
      failedChecks: 2,
      noticeCount: 6,
      failures: [
        {
          branch: 'develop',
          name: 'advisory status check contexts',
          details: 'missing: Requirements CSV Integrity, CodeQL; present: Build, Test, Package, Integration Host (Linux), Windows Unit Tests'
        },
        {
          branch: 'main',
          name: 'advisory status check contexts',
          details: 'missing: Requirements CSV Integrity, CodeQL; present: Build, Test, Package, Integration Host (Linux), Windows Unit Tests'
        }
      ]
    });
    expect(output.branches.map((item) => item.summary.failedChecks)).toEqual([1, 1]);
    expect(output.branches[0].summary.failures).toEqual([
      {
        name: 'advisory status check contexts',
        details: 'missing: Requirements CSV Integrity, CodeQL; present: Build, Test, Package, Integration Host (Linux), Windows Unit Tests'
      }
    ]);
  });

  it('emits Markdown evidence when requested', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all', '--markdown'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });
    const output = stdout.read();

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(output).toContain('## Branch Protection Audit');
    expect(output).toContain(`- Repository: \`${DEFAULT_REPO}\``);
    expect(output).toContain('| develop | PASS | 33/33 | 0 | 3 |');
    expect(output).toContain('| main | PASS | 33/33 | 0 | 3 |');
    expect(output).toContain('No failures.');
    expect(() => JSON.parse(output)).toThrow();
  });

  it('writes Markdown evidence to an output file when requested', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const cwd = path.join(process.cwd(), 'fixture-root');
    const resolvedOutput = path.join(cwd, 'evidence', 'branch-protection.md');
    const mkdirSync = vi.fn();
    const writeFileSync = vi.fn();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all', '--markdown', '--include-provenance', '--output', 'evidence/branch-protection.md'], {
      spawnSync,
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd,
      mkdirSync,
      writeFileSync,
      now: () => new Date('2026-07-14T12:00:00.000Z')
    });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toBe('[branch-protection-audit] Wrote audit output to evidence/branch-protection.md\n');
    expect(mkdirSync).toHaveBeenCalledWith(path.dirname(resolvedOutput), { recursive: true });
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(writeFileSync).toHaveBeenCalledWith(
      resolvedOutput,
      expect.stringContaining('## Branch Protection Audit'),
      'utf8'
    );
    expect(writeFileSync.mock.calls[0][1]).toContain('- Generated: `2026-07-14T12:00:00.000Z`');
    expect(writeFileSync.mock.calls[0][1]).toContain('- Audit argv: `["--all","--markdown","--include-provenance","--output","evidence/branch-protection.md"]`');
    expect(writeFileSync.mock.calls[0][1]).toContain('| develop | PASS | 33/33 | 0 | 3 |');
    expect(writeFileSync.mock.calls[0][1]).toContain('| main | PASS | 33/33 | 0 | 3 |');
  });

  it('writes failing JSON evidence before returning a nonzero audit status', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const cwd = path.join(process.cwd(), 'fixture-root');
    const mkdirSync = vi.fn();
    const writeFileSync = vi.fn();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all', '--json', '--require-advisory', '--output', 'evidence/branch-protection.json'], {
      spawnSync,
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd,
      mkdirSync,
      writeFileSync
    });
    const output = JSON.parse(writeFileSync.mock.calls[0][1]) as {
      success: boolean;
      summary: { failedBranches: number; failedChecks: number };
    };

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toBe('[branch-protection-audit] Wrote audit output to evidence/branch-protection.json\n');
    expect(output).toMatchObject({ success: false, summary: { failedBranches: 2, failedChecks: 2 } });
  });

  it('returns nonzero when the requested output file cannot be written', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });
    const writeFileSync = vi.fn(() => {
      throw new Error('disk full');
    });

    const exitCode = main(['--output', 'evidence/branch-protection.txt'], {
      spawnSync,
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: path.join(process.cwd(), 'fixture-root'),
      mkdirSync: vi.fn(),
      writeFileSync
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe('');
    expect(stderr.read()).toBe('disk full\n');
  });

  it('returns nonzero when advisory contexts are required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-advisory'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL advisory status check contexts');
  });

  it('returns nonzero when approving reviews are required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-review'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL pull request approving reviews');
  });

  it('returns nonzero when stale review dismissal is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-stale-review-dismissal'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL stale review dismissal');
  });

  it('returns nonzero when code-owner review is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-code-owner-review'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL code-owner review');
  });

  it('returns nonzero when last-push approval is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-last-push-approval'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL last-push approval');
  });

  it('returns nonzero when branch creation blocking is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-branch-creation-block'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL branch creation block');
  });

  it('returns nonzero when linear history is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-linear-history'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL linear history');
  });

  it('returns nonzero when conversation resolution is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-conversation-resolution'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL conversation resolution');
  });

  it('returns nonzero when signed commits are required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-signed-commits'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL signed commits');
  });

  it('returns nonzero when the full hardening profile is required but absent', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].includes('/rulesets') ? branchRulesetResource(args[1]) : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-full-hardening'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });
    const output = stdout.read();

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(output).toContain('FAIL advisory status check contexts');
    expect(output).toContain('FAIL pull request approving reviews');
    expect(output).toContain('FAIL stale review dismissal');
    expect(output).toContain('FAIL code-owner review');
    expect(output).toContain('FAIL last-push approval');
    expect(output).toContain('FAIL branch creation block');
    expect(output).toContain('FAIL linear history');
    expect(output).toContain('FAIL conversation resolution');
    expect(output).toContain('FAIL signed commits');
  });

  it('returns nonzero when GitHub returns malformed JSON', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn(() => ({ status: 0, stdout: 'not json', stderr: '' }));

    expect(main([], { spawnSync, stdout: stdout.stream, stderr: stderr.stream })).toBe(1);
    expect(stderr.read()).toContain('returned invalid JSON');
  });
});
