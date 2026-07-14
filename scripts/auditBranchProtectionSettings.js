#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const DEFAULT_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';
const DEFAULT_BRANCH = 'develop';
const DEFAULT_AUDIT_BRANCHES = Object.freeze(['develop', 'main']);
const EXPECTED_ACTIVE_BRANCH_RULESETS = Object.freeze(['develop', 'main']);
const EXPECTED_ACTIVE_RULESET_RULE_TYPES = Object.freeze(['deletion', 'non_fast_forward']);
const GH_TIMEOUT_MS = 60000;
const ALLOWED_EXECUTABLE_COMMANDS = Object.freeze(['gh']);
const EXPECTED_REQUIRED_STATUS_CHECKS = Object.freeze([
  'Build, Test, Package',
  'Windows Unit Tests',
  'Integration Host (Linux)'
]);
const EXPECTED_REQUIRED_STATUS_CHECK_APP_ID = 15368;
const ADVISORY_STATUS_CHECKS = Object.freeze([
  'Requirements CSV Integrity',
  'CodeQL'
]);
const REPO_SLUG_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._\/-]+$/u;

function isAllowedExecutableCommand(command) {
  return ALLOWED_EXECUTABLE_COMMANDS.includes(String(command || ''));
}

function assertAllowedExecutableCommand(command) {
  if (!isAllowedExecutableCommand(command)) {
    throw new Error(`Refusing to execute non-allow-listed command: ${String(command)}`);
  }
}

function isValidRepoSlug(repo) {
  return REPO_SLUG_PATTERN.test(String(repo || ''));
}

function isValidBranchName(branch) {
  return BRANCH_NAME_PATTERN.test(String(branch || ''));
}

function parseArgs(argv) {
  const options = {
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
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--repo') options.repo = next();
    else if (arg === '--branch') options.branch = next();
    else if (arg === '--all') options.allBranches = true;
    else if (arg === '--require-advisory') options.requireAdvisory = true;
    else if (arg === '--require-review') options.requireReview = true;
    else if (arg === '--require-linear-history') options.requireLinearHistory = true;
    else if (arg === '--require-conversation-resolution') options.requireConversationResolution = true;
    else if (arg === '--require-signed-commits') options.requireSignedCommits = true;
    else if (arg === '--require-stale-review-dismissal') options.requireStaleReviewDismissal = true;
    else if (arg === '--require-code-owner-review') options.requireCodeOwnerReview = true;
    else if (arg === '--require-last-push-approval') options.requireLastPushApproval = true;
    else if (arg === '--require-branch-creation-block') options.requireBranchCreationBlock = true;
    else if (arg === '--json') options.emitJson = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }
  if (!isValidRepoSlug(options.repo)) {
    throw new Error(`--repo must be a valid owner/repo slug, got: ${options.repo}`);
  }
  if (!isValidBranchName(options.branch)) {
    throw new Error(`--branch must be a branch name without spaces, got: ${options.branch}`);
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/auditBranchProtectionSettings.js [options]',
    '',
    'Audits live GitHub branch protection settings for the canonical repository.',
    '',
    'Options:',
    `  --repo <owner/repo>    Repository to inspect (default: ${DEFAULT_REPO})`,
    `  --branch <name>       Branch to inspect (default: ${DEFAULT_BRANCH})`,
    `  --all                 Audit protected branches: ${DEFAULT_AUDIT_BRANCHES.join(', ')}`,
    '  --require-advisory    Fail when advisory checks are not branch-protection-required',
    '  --require-review      Fail when approving pull request reviews are not required',
    '  --require-linear-history Fail when linear history is not required',
    '  --require-conversation-resolution Fail when conversation resolution is not required',
    '  --require-signed-commits Fail when signed commits are not required',
    '  --require-stale-review-dismissal Fail when stale review dismissal is not required',
    '  --require-code-owner-review Fail when code-owner review is not required',
    '  --require-last-push-approval Fail when last-push approval is not required',
    '  --require-branch-creation-block Fail when matching branch creation is not blocked',
    '  --json                Emit machine-readable JSON instead of text',
    '  --help                Show this help'
  ].join('\n');
}

function buildGhApiArgs(repo, branch, resource) {
  if (resource === 'protection') {
    return ['api', `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`];
  }
  if (resource === 'rulesets') {
    return ['api', `repos/${repo}/rulesets`];
  }
  throw new Error(`Unknown GitHub API resource: ${resource}`);
}

function buildGhRulesetDetailApiArgs(repo, rulesetId) {
  return ['api', `repos/${repo}/rulesets/${encodeURIComponent(String(rulesetId))}`];
}

function runGhJson(args, deps = {}) {
  assertAllowedExecutableCommand('gh');
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const result = spawnSyncImpl('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed (status ${result.status}): ${String(result.stderr || '').trim()}`);
  }
  try {
    return JSON.parse(String(result.stdout || ''));
  } catch (error) {
    throw new Error(`gh ${args.join(' ')} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fetchBranchProtection(options, deps = {}) {
  return runGhJson(buildGhApiArgs(options.repo, options.branch, 'protection'), deps);
}

function fetchBranchRulesets(options, deps = {}) {
  const rulesets = runGhJson(buildGhApiArgs(options.repo, options.branch || DEFAULT_BRANCH, 'rulesets'), deps);
  if (!Array.isArray(rulesets)) {
    return rulesets;
  }
  return rulesets.map((ruleset) => {
    const rulesetId = ruleset && ruleset.id;
    if (rulesetId === undefined || rulesetId === null || String(rulesetId).trim() === '') {
      return ruleset;
    }
    return runGhJson(buildGhRulesetDetailApiArgs(options.repo, rulesetId), deps);
  });
}

function fetchBranchProtectionSettings(options, deps = {}) {
  return {
    protection: fetchBranchProtection(options, deps),
    rulesets: fetchBranchRulesets(options, deps)
  };
}

function enabledFlag(value) {
  return Boolean(value && value.enabled === true);
}

function disabledFlag(value) {
  return Boolean(value && value.enabled === false);
}

function nullableDisabledFlag(value) {
  return value === null || value === undefined || disabledFlag(value);
}

function restrictionActorCount(restrictions, actorType) {
  return Array.isArray(restrictions && restrictions[actorType]) ? restrictions[actorType].length : 0;
}

function pushRestrictionDetails(restrictions) {
  return `users ${restrictionActorCount(restrictions, 'users')}, teams ${restrictionActorCount(restrictions, 'teams')}, apps ${restrictionActorCount(restrictions, 'apps')}`;
}

function requiredApprovingReviewCount(protection) {
  const reviews = protection && protection.required_pull_request_reviews;
  const count = Number(reviews && reviews.required_approving_review_count);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function requiredStatusContexts(protection) {
  const checks = protection && protection.required_status_checks;
  const contexts = new Set();
  for (const context of checks && Array.isArray(checks.contexts) ? checks.contexts : []) {
    contexts.add(String(context));
  }
  for (const check of checks && Array.isArray(checks.checks) ? checks.checks : []) {
    if (check && check.context) {
      contexts.add(String(check.context));
    }
  }
  return [...contexts].sort();
}

function requiredStatusCheckSourceContexts(protection) {
  const checks = protection && protection.required_status_checks;
  const legacyContexts = checks && Array.isArray(checks.contexts) ? checks.contexts.map((context) => String(context)).sort() : [];
  const appBoundContexts = (checks && Array.isArray(checks.checks) ? checks.checks : [])
    .filter((check) => check && check.context)
    .map((check) => String(check.context))
    .sort();
  return {
    legacyContexts: [...new Set(legacyContexts)],
    appBoundContexts: [...new Set(appBoundContexts)]
  };
}

function requiredStatusCheckSourceDiff(protection) {
  const { legacyContexts, appBoundContexts } = requiredStatusCheckSourceContexts(protection);
  return {
    legacyContexts,
    appBoundContexts,
    missingFromAppBoundChecks: legacyContexts.filter((context) => !appBoundContexts.includes(context)),
    missingFromLegacyContexts: appBoundContexts.filter((context) => !legacyContexts.includes(context))
  };
}

function requiredStatusCheckDuplicateContexts(protection) {
  const checks = protection && protection.required_status_checks;
  const legacyContexts = checks && Array.isArray(checks.contexts) ? checks.contexts.map((context) => String(context)) : [];
  const appBoundContexts = (checks && Array.isArray(checks.checks) ? checks.checks : [])
    .filter((check) => check && check.context)
    .map((check) => String(check.context));
  return {
    legacyContexts: duplicateNameCounts(legacyContexts),
    appBoundContexts: duplicateNameCounts(appBoundContexts)
  };
}

function requiredStatusCheckAppBindings(protection) {
  const checks = protection && protection.required_status_checks;
  return (Array.isArray(checks && checks.checks) ? checks.checks : [])
    .filter((check) => check && check.context)
    .map((check) => {
      const appId = Number(check.app_id);
      return {
        context: String(check.context),
        appId: Number.isFinite(appId) ? appId : null
      };
    })
    .sort((left, right) => left.context.localeCompare(right.context));
}

function activeRulesetSummaries(rulesets) {
  return (Array.isArray(rulesets) ? rulesets : [])
    .filter((ruleset) => ruleset && ruleset.enforcement === 'active' && ruleset.target === 'branch')
    .map((ruleset) => ({
      name: String(ruleset.name || '(unnamed)'),
      ruleCount: Array.isArray(ruleset.rules) ? ruleset.rules.length : 0,
      ruleTypes: rulesetRuleTypes(ruleset),
      bypassActorCount: Array.isArray(ruleset.bypass_actors) ? ruleset.bypass_actors.length : 0,
      currentUserCanBypass: String(ruleset.current_user_can_bypass || 'unknown')
    }));
}

function duplicateNameCounts(names) {
  const counts = new Map();
  for (const name of names) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function formatDuplicateNameCounts(duplicates) {
  return duplicates.map(({ name, count }) => `${name} (${count})`).join(', ') || 'none';
}

function rulesetRuleTypes(ruleset) {
  return (Array.isArray(ruleset && ruleset.rules) ? ruleset.rules : [])
    .map((rule) => String(rule && rule.type ? rule.type : ''))
    .filter(Boolean)
    .sort();
}

function evaluateBranchProtection(settings, options = {}) {
  const protection = settings.protection || {};
  const requiredContexts = requiredStatusContexts(protection);
  const expectedRequiredChecks = options.expectedRequiredChecks || EXPECTED_REQUIRED_STATUS_CHECKS;
  const expectedRequiredStatusCheckAppId = Number.isFinite(Number(options.expectedRequiredStatusCheckAppId))
    ? Number(options.expectedRequiredStatusCheckAppId)
    : EXPECTED_REQUIRED_STATUS_CHECK_APP_ID;
  const advisoryChecks = options.advisoryChecks || ADVISORY_STATUS_CHECKS;
  const expectedActiveBranchRulesets = options.expectedActiveBranchRulesets || EXPECTED_ACTIVE_BRANCH_RULESETS;
  const expectedActiveRulesetRuleTypes = options.expectedActiveRulesetRuleTypes || EXPECTED_ACTIVE_RULESET_RULE_TYPES;
  const requireAdvisory = Boolean(options.requireAdvisory);
  const requireReview = Boolean(options.requireReview);
  const requireLinearHistory = Boolean(options.requireLinearHistory);
  const requireConversationResolution = Boolean(options.requireConversationResolution);
  const requireSignedCommits = Boolean(options.requireSignedCommits);
  const requireStaleReviewDismissal = Boolean(options.requireStaleReviewDismissal);
  const requireCodeOwnerReview = Boolean(options.requireCodeOwnerReview);
  const requireLastPushApproval = Boolean(options.requireLastPushApproval);
  const requireBranchCreationBlock = Boolean(options.requireBranchCreationBlock);
  const allowedRequiredContexts = requireAdvisory
    ? [...new Set([...expectedRequiredChecks, ...advisoryChecks])]
    : expectedRequiredChecks;
  const minimumApprovingReviews = Number.isFinite(Number(options.minimumApprovingReviews))
    ? Number(options.minimumApprovingReviews)
    : 1;
  const missingRequired = expectedRequiredChecks.filter((context) => !requiredContexts.includes(context));
  const unexpectedRequired = requiredContexts.filter((context) => !allowedRequiredContexts.includes(context));
  const requiredStatusSourceDiff = requiredStatusCheckSourceDiff(protection);
  const duplicateRequiredStatusContexts = requiredStatusCheckDuplicateContexts(protection);
  const requiredAppBindings = requiredStatusCheckAppBindings(protection);
  const requiredAppBindingsByContext = new Map(requiredAppBindings.map((binding) => [binding.context, binding]));
  const mismatchedRequiredAppBindings = expectedRequiredChecks
    .map((context) => {
      const binding = requiredAppBindingsByContext.get(context);
      if (!binding) {
        return { context, observedAppId: 'missing' };
      }
      if (binding.appId !== expectedRequiredStatusCheckAppId) {
        return { context, observedAppId: binding.appId === null ? 'missing' : String(binding.appId) };
      }
      return undefined;
    })
    .filter(Boolean);
  const advisoryNotRequired = advisoryChecks.filter((context) => !requiredContexts.includes(context));
  const approvingReviewCount = requiredApprovingReviewCount(protection);
  const activeRulesets = activeRulesetSummaries(settings.rulesets);
  const activeRulesetNames = activeRulesets.map((ruleset) => ruleset.name).sort();
  const missingActiveRulesets = expectedActiveBranchRulesets.filter((name) => !activeRulesetNames.includes(name));
  const unexpectedActiveRulesets = activeRulesetNames.filter((name) => !expectedActiveBranchRulesets.includes(name));
  const duplicateActiveRulesets = duplicateNameCounts(activeRulesetNames);
  const activeRulesetsByName = new Map(activeRulesets.map((ruleset) => [ruleset.name, ruleset]));
  const rulesetsMissingRuleTypes = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      const missingRuleTypes = expectedActiveRulesetRuleTypes.filter((type) => !ruleset || !ruleset.ruleTypes.includes(type));
      return { name, missingRuleTypes, observedRuleTypes: ruleset ? ruleset.ruleTypes : [] };
    })
    .filter((item) => item.missingRuleTypes.length > 0);
  const rulesetsWithUnexpectedRuleTypes = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      const unexpectedRuleTypes = ruleset
        ? [...new Set(ruleset.ruleTypes.filter((type) => !expectedActiveRulesetRuleTypes.includes(type)))]
        : [];
      return { name, unexpectedRuleTypes, observedRuleTypes: ruleset ? ruleset.ruleTypes : [] };
    })
    .filter((item) => item.unexpectedRuleTypes.length > 0);
  const rulesetsWithDuplicateRuleTypes = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      return {
        name,
        duplicateRuleTypes: ruleset ? duplicateNameCounts(ruleset.ruleTypes) : [],
        observedRuleTypes: ruleset ? ruleset.ruleTypes : []
      };
    })
    .filter((item) => item.duplicateRuleTypes.length > 0);
  const bypassableRulesets = expectedActiveBranchRulesets
    .map((name) => activeRulesetsByName.get(name))
    .filter((ruleset) => ruleset && (ruleset.bypassActorCount > 0 || ruleset.currentUserCanBypass !== 'never'));

  const checks = [
    {
      name: 'required status checks are strict',
      passed: Boolean(protection.required_status_checks && protection.required_status_checks.strict === true),
      details: protection.required_status_checks && protection.required_status_checks.strict === true ? 'enabled' : 'missing or disabled'
    },
    {
      name: 'required status check contexts',
      passed: missingRequired.length === 0,
      details: missingRequired.length === 0
        ? `present: ${expectedRequiredChecks.join(', ')}`
        : `missing: ${missingRequired.join(', ')}; present: ${requiredContexts.join(', ') || 'none'}`
    },
    {
      name: 'unexpected required status check contexts',
      passed: unexpectedRequired.length === 0,
      details: unexpectedRequired.length === 0
        ? `none beyond: ${allowedRequiredContexts.join(', ')}`
        : `unexpected: ${unexpectedRequired.join(', ')}; allowed: ${allowedRequiredContexts.join(', ')}`
    },
    {
      name: 'required status check source consistency',
      passed: requiredStatusSourceDiff.missingFromAppBoundChecks.length === 0 && requiredStatusSourceDiff.missingFromLegacyContexts.length === 0,
      details: requiredStatusSourceDiff.missingFromAppBoundChecks.length === 0 && requiredStatusSourceDiff.missingFromLegacyContexts.length === 0
        ? `aligned: ${requiredStatusSourceDiff.legacyContexts.join(', ') || 'none'}`
        : `checks missing: ${requiredStatusSourceDiff.missingFromAppBoundChecks.join(', ') || 'none'}; contexts missing: ${requiredStatusSourceDiff.missingFromLegacyContexts.join(', ') || 'none'}`
    },
    {
      name: 'duplicate required status check contexts',
      passed: duplicateRequiredStatusContexts.legacyContexts.length === 0 && duplicateRequiredStatusContexts.appBoundContexts.length === 0,
      details: duplicateRequiredStatusContexts.legacyContexts.length === 0 && duplicateRequiredStatusContexts.appBoundContexts.length === 0
        ? 'none'
        : `contexts duplicates: ${formatDuplicateNameCounts(duplicateRequiredStatusContexts.legacyContexts)}; checks duplicates: ${formatDuplicateNameCounts(duplicateRequiredStatusContexts.appBoundContexts)}`
    },
    {
      name: 'required status check app bindings',
      passed: mismatchedRequiredAppBindings.length === 0,
      details: mismatchedRequiredAppBindings.length === 0
        ? `app ${expectedRequiredStatusCheckAppId}: ${expectedRequiredChecks.join(', ')}`
        : mismatchedRequiredAppBindings
          .map((item) => `${item.context} app ${item.observedAppId}; expected app ${expectedRequiredStatusCheckAppId}`)
          .join('; ')
    },
    {
      name: 'admin enforcement',
      passed: enabledFlag(protection.enforce_admins),
      details: enabledFlag(protection.enforce_admins) ? 'enabled' : 'disabled or unavailable'
    },
    {
      name: 'force pushes disabled',
      passed: disabledFlag(protection.allow_force_pushes),
      details: disabledFlag(protection.allow_force_pushes) ? 'disabled' : 'enabled or unavailable'
    },
    {
      name: 'branch deletions disabled',
      passed: disabledFlag(protection.allow_deletions),
      details: disabledFlag(protection.allow_deletions) ? 'disabled' : 'enabled or unavailable'
    },
    {
      name: 'branch lock disabled',
      passed: disabledFlag(protection.lock_branch),
      details: disabledFlag(protection.lock_branch) ? 'disabled' : 'enabled or unavailable'
    },
    {
      name: 'fork syncing disabled',
      passed: disabledFlag(protection.allow_fork_syncing),
      details: disabledFlag(protection.allow_fork_syncing) ? 'disabled' : 'enabled or unavailable'
    },
    {
      name: 'required deployments disabled',
      passed: nullableDisabledFlag(protection.required_deployments),
      details: nullableDisabledFlag(protection.required_deployments) ? 'disabled' : 'enabled or unavailable'
    },
    {
      name: 'push restrictions disabled',
      passed: !protection.restrictions,
      details: !protection.restrictions ? 'disabled' : `enabled: ${pushRestrictionDetails(protection.restrictions)}`
    },
    {
      name: 'active branch rulesets',
      passed: missingActiveRulesets.length === 0,
      details: missingActiveRulesets.length === 0
        ? `present: ${expectedActiveBranchRulesets.join(', ')}`
        : `missing: ${missingActiveRulesets.join(', ')}; present: ${activeRulesetNames.join(', ') || 'none'}`
    },
    {
      name: 'unexpected active branch rulesets',
      passed: unexpectedActiveRulesets.length === 0,
      details: unexpectedActiveRulesets.length === 0
        ? `none beyond: ${expectedActiveBranchRulesets.join(', ')}`
        : `unexpected: ${unexpectedActiveRulesets.join(', ')}; allowed: ${expectedActiveBranchRulesets.join(', ')}`
    },
    {
      name: 'duplicate active branch rulesets',
      passed: duplicateActiveRulesets.length === 0,
      details: duplicateActiveRulesets.length === 0
        ? 'none'
        : `duplicates: ${formatDuplicateNameCounts(duplicateActiveRulesets)}`
    },
    {
      name: 'active branch ruleset rules',
      passed: rulesetsMissingRuleTypes.length === 0,
      details: rulesetsMissingRuleTypes.length === 0
        ? `present on ${expectedActiveBranchRulesets.join(', ')}: ${expectedActiveRulesetRuleTypes.join(', ')}`
        : rulesetsMissingRuleTypes
          .map((item) => `${item.name} missing: ${item.missingRuleTypes.join(', ')}; observed: ${item.observedRuleTypes.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'unexpected active branch ruleset rules',
      passed: rulesetsWithUnexpectedRuleTypes.length === 0,
      details: rulesetsWithUnexpectedRuleTypes.length === 0
        ? `none beyond ${expectedActiveRulesetRuleTypes.join(', ')} on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithUnexpectedRuleTypes
          .map((item) => `${item.name} unexpected: ${item.unexpectedRuleTypes.join(', ')}; observed: ${item.observedRuleTypes.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'duplicate active branch ruleset rules',
      passed: rulesetsWithDuplicateRuleTypes.length === 0,
      details: rulesetsWithDuplicateRuleTypes.length === 0
        ? 'none'
        : rulesetsWithDuplicateRuleTypes
          .map((item) => `${item.name} duplicates: ${formatDuplicateNameCounts(item.duplicateRuleTypes)}; observed: ${item.observedRuleTypes.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset bypasses disabled',
      passed: bypassableRulesets.length === 0,
      details: bypassableRulesets.length === 0
        ? `no bypass actors on ${expectedActiveBranchRulesets.join(', ')}; current user cannot bypass`
        : bypassableRulesets
          .map((ruleset) => `${ruleset.name}: bypass actors ${ruleset.bypassActorCount}, current user can bypass ${ruleset.currentUserCanBypass}`)
          .join('; ')
    }
  ];

  if (requireAdvisory) {
    checks.push({
      name: 'advisory status check contexts',
      passed: advisoryNotRequired.length === 0,
      details: advisoryNotRequired.length === 0
        ? `required: ${advisoryChecks.join(', ')}`
        : `missing: ${advisoryNotRequired.join(', ')}; present: ${requiredContexts.join(', ') || 'none'}`
    });
  }

  if (requireReview) {
    checks.push({
      name: 'pull request approving reviews',
      passed: approvingReviewCount >= minimumApprovingReviews,
      details: approvingReviewCount >= minimumApprovingReviews
        ? `required approving reviews: ${approvingReviewCount}`
        : `required approving reviews: ${approvingReviewCount}; expected at least ${minimumApprovingReviews}`
    });
  }

  if (requireStaleReviewDismissal) {
    checks.push({
      name: 'stale review dismissal',
      passed: Boolean(protection.required_pull_request_reviews && protection.required_pull_request_reviews.dismiss_stale_reviews === true),
      details: protection.required_pull_request_reviews && protection.required_pull_request_reviews.dismiss_stale_reviews === true ? 'enabled' : 'disabled or unavailable'
    });
  }

  if (requireCodeOwnerReview) {
    checks.push({
      name: 'code-owner review',
      passed: Boolean(protection.required_pull_request_reviews && protection.required_pull_request_reviews.require_code_owner_reviews === true),
      details: protection.required_pull_request_reviews && protection.required_pull_request_reviews.require_code_owner_reviews === true ? 'enabled' : 'disabled or unavailable'
    });
  }

  if (requireLastPushApproval) {
    checks.push({
      name: 'last-push approval',
      passed: Boolean(protection.required_pull_request_reviews && protection.required_pull_request_reviews.require_last_push_approval === true),
      details: protection.required_pull_request_reviews && protection.required_pull_request_reviews.require_last_push_approval === true ? 'enabled' : 'disabled or unavailable'
    });
  }

  if (requireBranchCreationBlock) {
    checks.push({
      name: 'branch creation block',
      passed: enabledFlag(protection.block_creations),
      details: enabledFlag(protection.block_creations) ? 'enabled' : 'disabled or unavailable'
    });
  }

  if (requireLinearHistory) {
    checks.push({
      name: 'linear history',
      passed: enabledFlag(protection.required_linear_history),
      details: enabledFlag(protection.required_linear_history) ? 'enabled' : 'disabled or unavailable'
    });
  }

  if (requireConversationResolution) {
    checks.push({
      name: 'conversation resolution',
      passed: enabledFlag(protection.required_conversation_resolution),
      details: enabledFlag(protection.required_conversation_resolution) ? 'enabled' : 'disabled or unavailable'
    });
  }

  if (requireSignedCommits) {
    checks.push({
      name: 'signed commits',
      passed: enabledFlag(protection.required_signatures),
      details: enabledFlag(protection.required_signatures) ? 'enabled' : 'disabled or unavailable'
    });
  }

  const notices = [];
  notices.push(`required contexts observed: ${requiredContexts.join(', ') || 'none'}`);
  notices.push(
    advisoryNotRequired.length === 0
      ? `advisory checks also branch-protection-required: ${advisoryChecks.join(', ')}`
      : `advisory checks not branch-protection-required: ${advisoryNotRequired.join(', ')}`
  );
  notices.push(
    activeRulesets.length === 0
      ? 'active branch rulesets: none'
      : `active branch rulesets: ${activeRulesets.map((ruleset) => `${ruleset.name} (${ruleset.ruleCount} rules)`).join(', ')}`
  );

  return {
    success: checks.every((check) => check.passed),
    checks,
    notices
  };
}

function renderResult(result, options = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const branch = options.branch || DEFAULT_BRANCH;
  const lines = [`[branch-protection-audit] Branch protection results for ${repo}:${branch}`];
  for (const check of result.checks) {
    lines.push(`[branch-protection-audit] ${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`);
  }
  for (const notice of result.notices) {
    lines.push(`[branch-protection-audit] NOTICE ${notice}`);
  }
  lines.push(result.success ? '[branch-protection-audit] Audit passed.' : '[branch-protection-audit] Audit failed.');
  return lines.join('\n');
}

function branchesForOptions(options = {}) {
  return options.allBranches ? [...DEFAULT_AUDIT_BRANCHES] : [options.branch || DEFAULT_BRANCH];
}

function auditBranchProtectionSettings(options = {}, deps = {}) {
  const normalizedOptions = {
    repo: options.repo || DEFAULT_REPO,
    branch: options.branch || DEFAULT_BRANCH
  };
  const settings = deps.settings || fetchBranchProtectionSettings(normalizedOptions, deps);
  return evaluateBranchProtection(settings, options);
}

function auditBranches(options = {}, deps = {}) {
  const normalizedOptions = { ...options, repo: options.repo || DEFAULT_REPO };
  const branches = branchesForOptions(normalizedOptions);
  const sharedRulesets = normalizedOptions.allBranches && !deps.settings
    ? fetchBranchRulesets({ ...normalizedOptions, branch: branches[0] || DEFAULT_BRANCH }, deps)
    : undefined;

  return branches.map((branch) => {
    const branchOptions = { ...normalizedOptions, branch };
    const branchDeps = sharedRulesets
      ? { ...deps, settings: { protection: fetchBranchProtection(branchOptions, deps), rulesets: sharedRulesets } }
      : deps;
    return {
      branch,
      result: auditBranchProtectionSettings(branchOptions, branchDeps)
    };
  });
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  try {
    const options = parseArgs(argv);
    if (options.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    const branchResults = auditBranches(options, deps);
    const success = branchResults.every((item) => item.result.success);
    if (options.emitJson) {
      if (options.allBranches) {
        stdout.write(`${JSON.stringify({
          schemaVersion: 1,
          repo: options.repo,
          branches: branchResults.map((item) => ({ branch: item.branch, ...item.result })),
          success
        }, null, 2)}\n`);
      } else {
        const [{ branch, result }] = branchResults;
        stdout.write(`${JSON.stringify({ schemaVersion: 1, repo: options.repo, branch, ...result }, null, 2)}\n`);
      }
    } else {
      stdout.write(`${branchResults
        .map((item) => renderResult(item.result, { ...options, branch: item.branch }))
        .join('\n')}\n`);
    }
    return success ? 0 : 1;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_REPO,
  DEFAULT_BRANCH,
  DEFAULT_AUDIT_BRANCHES,
  EXPECTED_ACTIVE_BRANCH_RULESETS,
  EXPECTED_ACTIVE_RULESET_RULE_TYPES,
  EXPECTED_REQUIRED_STATUS_CHECKS,
  EXPECTED_REQUIRED_STATUS_CHECK_APP_ID,
  ADVISORY_STATUS_CHECKS,
  ALLOWED_EXECUTABLE_COMMANDS,
  isAllowedExecutableCommand,
  assertAllowedExecutableCommand,
  isValidRepoSlug,
  isValidBranchName,
  parseArgs,
  usage,
  buildGhApiArgs,
  buildGhRulesetDetailApiArgs,
  fetchBranchProtection,
  fetchBranchRulesets,
  requiredApprovingReviewCount,
  requiredStatusContexts,
  requiredStatusCheckAppBindings,
  activeRulesetSummaries,
  rulesetRuleTypes,
  evaluateBranchProtection,
  renderResult,
  branchesForOptions,
  auditBranches,
  auditBranchProtectionSettings,
  main
};
