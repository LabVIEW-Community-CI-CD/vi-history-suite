import { describe, expect, it, vi } from 'vitest';

const {
  DEFAULT_AUDIT_BRANCHES,
  DEFAULT_BRANCH,
  DEFAULT_REPO,
  EXPECTED_ACTIVE_BRANCH_RULESETS,
  EXPECTED_ACTIVE_RULESET_RULE_TYPES,
  EXPECTED_REQUIRED_STATUS_CHECKS,
  EXPECTED_REQUIRED_STATUS_CHECK_APP_ID,
  isAllowedExecutableCommand,
  isValidBranchName,
  isValidRepoSlug,
  parseArgs,
  usage,
  buildGhApiArgs,
  buildGhRulesetDetailApiArgs,
  requiredApprovingReviewCount,
  requiredStatusContexts,
  requiredStatusCheckAppBindings,
  activeRulesetSummaries,
  rulesetRuleTypes,
  evaluateBranchProtection,
  renderResult,
  branchesForOptions,
  auditBranches,
  main
} = require('../../scripts/auditBranchProtectionSettings.js') as {
  DEFAULT_AUDIT_BRANCHES: string[];
  DEFAULT_BRANCH: string;
  DEFAULT_REPO: string;
  EXPECTED_ACTIVE_BRANCH_RULESETS: string[];
  EXPECTED_ACTIVE_RULESET_RULE_TYPES: string[];
  EXPECTED_REQUIRED_STATUS_CHECKS: string[];
  EXPECTED_REQUIRED_STATUS_CHECK_APP_ID: number;
  isAllowedExecutableCommand: (command: string) => boolean;
  isValidBranchName: (branch: string) => boolean;
  isValidRepoSlug: (repo: string) => boolean;
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
    emitJson: boolean;
    help: boolean;
  };
  usage: () => string;
  buildGhApiArgs: (repo: string, branch: string, resource: string) => string[];
  buildGhRulesetDetailApiArgs: (repo: string, rulesetId: number | string) => string[];
  requiredApprovingReviewCount: (protection: Record<string, unknown>) => number;
  requiredStatusContexts: (protection: Record<string, unknown>) => string[];
  requiredStatusCheckAppBindings: (protection: Record<string, unknown>) => Array<{ context: string; appId: number | null }>;
  activeRulesetSummaries: (rulesets: unknown[]) => Array<{
    name: string;
    ruleCount: number;
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
      expectedActiveRulesetRuleTypes?: string[];
      expectedRequiredStatusCheckAppId?: number;
    }
  ) => { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] };
  renderResult: (
    result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }>; notices: string[] },
    options?: { repo?: string; branch?: string }
  ) => string;
  branchesForOptions: (options?: { branch?: string; allBranches?: boolean }) => string[];
  auditBranches: (options?: Record<string, unknown>, deps?: Record<string, unknown>) => Array<{ branch: string; result: { success: boolean } }>;
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
    required_status_checks: {
      strict: overrides.strict ?? true,
      contexts,
      checks: checkContexts.map((context) => ({ context, app_id: overrides.checkAppId ?? EXPECTED_REQUIRED_STATUS_CHECK_APP_ID }))
    },
    enforce_admins: { enabled: overrides.enforceAdmins ?? true },
    allow_force_pushes: { enabled: overrides.allowForcePushes ?? false },
    allow_deletions: { enabled: overrides.allowDeletions ?? false },
    lock_branch: { enabled: overrides.lockBranch ?? false },
    allow_fork_syncing: { enabled: overrides.allowForkSyncing ?? false },
    required_deployments: overrides.requiredDeployments ? { enabled: true } : null,
    restrictions: overrides.pushRestrictions
      ? { users: [{ login: 'maintainer' }], teams: [{ slug: 'release' }], apps: [{ slug: 'github-actions' }] }
      : null,
    required_linear_history: { enabled: overrides.requiredLinearHistory ?? false },
    required_conversation_resolution: { enabled: overrides.requiredConversationResolution ?? false },
    required_signatures: { enabled: overrides.requiredSignedCommits ?? false },
    block_creations: { enabled: overrides.blockCreations ?? false },
    required_pull_request_reviews: {
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
  return names.map((name, index) => ({
    id: 18415000 + index,
    name,
    target: 'branch',
    enforcement: 'active',
    rules: EXPECTED_ACTIVE_RULESET_RULE_TYPES.map((type) => ({ type })),
    bypass_actors: [],
    current_user_can_bypass: 'never'
  }));
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
      emitJson: false,
      help: false
    });
  });

  it('parses repo, branch, all, hardening, json, and help options', () => {
    expect(parseArgs(['--repo', 'owner/repo', '--branch', 'release/v1.2.3', '--all', '--require-advisory', '--require-review', '--require-linear-history', '--require-conversation-resolution', '--require-signed-commits', '--require-stale-review-dismissal', '--require-code-owner-review', '--require-last-push-approval', '--require-branch-creation-block', '--json'])).toMatchObject({
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
      emitJson: true
    });
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
    expect(requiredStatusCheckAppBindings(protection())).toEqual([
      { context: 'Build, Test, Package', appId: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID },
      { context: 'Integration Host (Linux)', appId: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID },
      { context: 'Windows Unit Tests', appId: EXPECTED_REQUIRED_STATUS_CHECK_APP_ID }
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
    expect(result.checks.find((check) => check.name === 'unexpected active branch rulesets')).toMatchObject({
      passed: true,
      details: 'none beyond: develop, main'
    });
    expect(result.checks.find((check) => check.name === 'duplicate active branch rulesets')).toMatchObject({
      passed: true,
      details: 'none'
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
        ruleCount: 2,
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
    expect(output.checks).toHaveLength(21);
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
      branches: Array<{ branch: string; success: boolean }>;
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
    expect(output.branches.map((item) => item.branch)).toEqual(DEFAULT_AUDIT_BRANCHES);
    expect(output.branches.every((item) => item.success)).toBe(true);
    expect(output.branch).toBeUndefined();
    expect(output.checks).toBeUndefined();
    expect(output.notices).toBeUndefined();
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

  it('returns nonzero when GitHub returns malformed JSON', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn(() => ({ status: 0, stdout: 'not json', stderr: '' }));

    expect(main([], { spawnSync, stdout: stdout.stream, stderr: stderr.stream })).toBe(1);
    expect(stderr.read()).toContain('returned invalid JSON');
  });
});
