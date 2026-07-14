import { describe, expect, it, vi } from 'vitest';

const {
  DEFAULT_AUDIT_BRANCHES,
  DEFAULT_BRANCH,
  DEFAULT_REPO,
  EXPECTED_ACTIVE_BRANCH_RULESETS,
  EXPECTED_REQUIRED_STATUS_CHECKS,
  isAllowedExecutableCommand,
  isValidBranchName,
  isValidRepoSlug,
  parseArgs,
  usage,
  buildGhApiArgs,
  requiredApprovingReviewCount,
  requiredStatusContexts,
  activeRulesetSummaries,
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
  EXPECTED_REQUIRED_STATUS_CHECKS: string[];
  isAllowedExecutableCommand: (command: string) => boolean;
  isValidBranchName: (branch: string) => boolean;
  isValidRepoSlug: (repo: string) => boolean;
  parseArgs: (argv: string[]) => {
    repo: string;
    branch: string;
    allBranches: boolean;
    requireAdvisory: boolean;
    requireReview: boolean;
    emitJson: boolean;
    help: boolean;
  };
  usage: () => string;
  buildGhApiArgs: (repo: string, branch: string, resource: string) => string[];
  requiredApprovingReviewCount: (protection: Record<string, unknown>) => number;
  requiredStatusContexts: (protection: Record<string, unknown>) => string[];
  activeRulesetSummaries: (rulesets: unknown[]) => Array<{ name: string; ruleCount: number }>;
  evaluateBranchProtection: (
    settings: { protection?: Record<string, unknown>; rulesets?: unknown[] },
    options?: {
      expectedRequiredChecks?: string[];
      advisoryChecks?: string[];
      requireAdvisory?: boolean;
      requireReview?: boolean;
      minimumApprovingReviews?: number;
      expectedActiveBranchRulesets?: string[];
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
  enforceAdmins?: boolean;
  allowForcePushes?: boolean;
  allowDeletions?: boolean;
  requiredApprovingReviewCount?: number;
};

function protection(overrides: ProtectionOverrides = {}) {
  const contexts = overrides.contexts || [...EXPECTED_REQUIRED_STATUS_CHECKS];
  return {
    required_status_checks: {
      strict: overrides.strict ?? true,
      contexts,
      checks: contexts.map((context) => ({ context, app_id: 15368 }))
    },
    enforce_admins: { enabled: overrides.enforceAdmins ?? true },
    allow_force_pushes: { enabled: overrides.allowForcePushes ?? false },
    allow_deletions: { enabled: overrides.allowDeletions ?? false },
    required_pull_request_reviews: {
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
  return names.map((name) => ({ name, target: 'branch', enforcement: 'active', rules: [] }));
}

describe('branch protection audit arguments', () => {
  it('defaults to the canonical repo and develop branch', () => {
    expect(parseArgs([])).toMatchObject({
      repo: DEFAULT_REPO,
      branch: DEFAULT_BRANCH,
      allBranches: false,
      requireAdvisory: false,
      requireReview: false,
      emitJson: false,
      help: false
    });
  });

  it('parses repo, branch, all, advisory, review, json, and help options', () => {
    expect(parseArgs(['--repo', 'owner/repo', '--branch', 'release/v1.2.3', '--all', '--require-advisory', '--require-review', '--json'])).toMatchObject({
      repo: 'owner/repo',
      branch: 'release/v1.2.3',
      allBranches: true,
      requireAdvisory: true,
      requireReview: true,
      emitJson: true
    });
    expect(parseArgs(['--help']).help).toBe(true);
    expect(usage()).toContain('auditBranchProtectionSettings');
    expect(usage()).toContain('--require-advisory');
    expect(usage()).toContain('--require-review');
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
      'admin enforcement',
      'force pushes disabled',
      'branch deletions disabled',
      'active branch rulesets'
    ]);
    expect(result.notices).toContain('advisory checks not branch-protection-required: Requirements CSV Integrity, CodeQL');
    expect(result.checks.find((check) => check.name === 'active branch rulesets')).toMatchObject({
      passed: true,
      details: 'present: develop, main'
    });
    expect(activeRulesetSummaries([{ name: 'develop', target: 'branch', enforcement: 'active', rules: [] }])).toEqual([
      { name: 'develop', ruleCount: 0 }
    ]);
  });

  it('fails closed when critical branch protection settings drift', () => {
    const result = evaluateBranchProtection({
      protection: protection({
        strict: false,
        contexts: ['Build, Test, Package'],
        enforceAdmins: false,
        allowForcePushes: true,
        allowDeletions: true
      }),
      rulesets: []
    });

    expect(result.success).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.name)).toEqual([
      'required status checks are strict',
      'required status check contexts',
      'admin enforcement',
      'force pushes disabled',
      'branch deletions disabled',
      'active branch rulesets'
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
});

describe('branch protection audit main', () => {
  it('uses injected gh execution and renders a passing summary', () => {
    const calls: string[][] = [];
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main([], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(calls).toEqual([
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, DEFAULT_BRANCH, 'protection')],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, DEFAULT_BRANCH, 'rulesets')]
    ]);
    expect(stdout.read()).toContain('[branch-protection-audit] Audit passed.');
  });

  it('audits all default protected branches with --all', () => {
    const calls: string[][] = [];
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--all'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(calls).toEqual([
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'rulesets')],
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
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    expect(auditBranches({ repo: DEFAULT_REPO, allBranches: true }, { spawnSync }).map((item) => item.branch)).toEqual(
      DEFAULT_AUDIT_BRANCHES
    );
    expect(calls).toEqual([
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'rulesets')],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'develop', 'protection')],
      ['gh', ...buildGhApiArgs(DEFAULT_REPO, 'main', 'protection')]
    ]);
  });

  it('preserves the v1 single-branch JSON shape without --all', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
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
    expect(output.checks).toHaveLength(6);
    expect(output.notices.length).toBeGreaterThan(0);
    expect(output.branches).toBeUndefined();
  });

  it('emits aggregate JSON when --all is requested', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
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
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
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
      const resource = args[1].endsWith('/rulesets') ? branchRulesets() : protection();
      return { status: 0, stdout: JSON.stringify(resource), stderr: '' };
    });

    const exitCode = main(['--require-review'], { spawnSync, stdout: stdout.stream, stderr: stderr.stream });

    expect(exitCode).toBe(1);
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('FAIL pull request approving reviews');
  });

  it('returns nonzero when GitHub returns malformed JSON', () => {
    const stdout = captureWrite();
    const stderr = captureWrite();
    const spawnSync = vi.fn(() => ({ status: 0, stdout: 'not json', stderr: '' }));

    expect(main([], { spawnSync, stdout: stdout.stream, stderr: stderr.stream })).toBe(1);
    expect(stderr.read()).toContain('returned invalid JSON');
  });
});
