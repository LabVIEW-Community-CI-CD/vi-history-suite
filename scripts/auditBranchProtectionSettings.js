#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';
const DEFAULT_BRANCH = 'develop';
const DEFAULT_AUDIT_BRANCHES = Object.freeze(['develop', 'main']);
const EXPECTED_ACTIVE_BRANCH_RULESETS = Object.freeze(['develop', 'main']);
const EXPECTED_ACTIVE_RULESET_TARGET = 'branch';
const EXPECTED_ACTIVE_RULESET_ENFORCEMENT = 'active';
const EXPECTED_ACTIVE_RULESET_SOURCE_TYPE = 'Repository';
const EXPECTED_ACTIVE_RULESET_CONDITION_KEYS = Object.freeze(['ref_name']);
const EXPECTED_ACTIVE_RULESET_REF_NAME_KEYS = Object.freeze(['exclude', 'include']);
const EXPECTED_ACTIVE_RULESET_SECTION_KEYS = Object.freeze([
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
const EXPECTED_ACTIVE_RULESET_RULE_KEYS = Object.freeze(['type']);
const EXPECTED_ACTIVE_RULESET_RULE_TYPES = Object.freeze(['deletion', 'non_fast_forward']);
const GH_TIMEOUT_MS = 60000;
const ALLOWED_EXECUTABLE_COMMANDS = Object.freeze(['gh']);
const EXPECTED_BRANCH_PROTECTION_SECTION_KEYS = Object.freeze([
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
const EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS = Object.freeze({
  allow_deletions: Object.freeze(['enabled']),
  allow_force_pushes: Object.freeze(['enabled']),
  allow_fork_syncing: Object.freeze(['enabled']),
  block_creations: Object.freeze(['enabled']),
  enforce_admins: Object.freeze(['enabled', 'url']),
  lock_branch: Object.freeze(['enabled']),
  required_conversation_resolution: Object.freeze(['enabled']),
  required_linear_history: Object.freeze(['enabled']),
  required_signatures: Object.freeze(['enabled', 'url'])
});
const EXPECTED_REQUIRED_STATUS_CHECKS = Object.freeze([
  'Build, Test, Package',
  'Windows Unit Tests',
  'Integration Host (Linux)'
]);
const EXPECTED_REQUIRED_STATUS_CHECK_APP_ID = 15368;
const EXPECTED_REQUIRED_STATUS_CHECK_SECTION_KEYS = Object.freeze(['checks', 'contexts', 'contexts_url', 'strict', 'url']);
const EXPECTED_REQUIRED_STATUS_CHECK_KEYS = Object.freeze(['app_id', 'context']);
const EXPECTED_PULL_REQUEST_REVIEW_SECTION_KEYS = Object.freeze([
  'dismiss_stale_reviews',
  'require_code_owner_reviews',
  'require_last_push_approval',
  'required_approving_review_count',
  'url'
]);
const ADVISORY_STATUS_CHECKS = Object.freeze([
  'Requirements CSV Integrity',
  'CodeQL'
]);
const FULL_HARDENING_OPTION_KEYS = Object.freeze([
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
const BRANCH_PROTECTION_AUDIT_SCHEMA_VERSION = 1;
const BRANCH_PROTECTION_AUDIT_SCHEMA_ID = 'https://labview-community-cicd.github.io/vi-history-suite/schemas/branch-protection-audit-v1.schema.json';
const BRANCH_PROTECTION_AUDIT_SCHEMA_PROVENANCE_KEY = 'x-vi-history-suite-provenance';
const BRANCH_PROTECTION_AUDIT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: BRANCH_PROTECTION_AUDIT_SCHEMA_ID,
  title: 'VI History Suite branch protection audit output',
  description: 'Machine-readable schemaVersion 1 output from scripts/auditBranchProtectionSettings.js.',
  type: 'object',
  oneOf: [
    { required: ['$schema', 'schemaVersion', 'repo', 'branch', 'success', 'checks', 'notices', 'noticeDetails', 'summary'] },
    { required: ['$schema', 'schemaVersion', 'repo', 'success', 'summary', 'branches'] }
  ],
  required: ['$schema', 'schemaVersion', 'repo', 'success', 'summary'],
  properties: {
    $schema: { const: BRANCH_PROTECTION_AUDIT_SCHEMA_ID },
    schemaVersion: { const: BRANCH_PROTECTION_AUDIT_SCHEMA_VERSION },
    repo: { type: 'string' },
    branch: { type: 'string' },
    success: { type: 'boolean' },
    checks: { type: 'array', items: { $ref: '#/$defs/check' } },
    notices: { type: 'array', items: { type: 'string' } },
    noticeDetails: { type: 'array', items: { $ref: '#/$defs/notice' } },
    summary: { oneOf: [{ $ref: '#/$defs/branchSummary' }, { $ref: '#/$defs/aggregateSummary' }] },
    branches: { type: 'array', items: { $ref: '#/$defs/branchAuditResult' } },
    provenance: { $ref: '#/$defs/provenance' }
  },
  additionalProperties: false,
  $defs: {
    check: {
      type: 'object',
      required: ['id', 'name', 'passed', 'details'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        passed: { type: 'boolean' },
        details: { type: 'string' }
      },
      additionalProperties: false
    },
    notice: {
      type: 'object',
      required: ['noticeId', 'message'],
      properties: {
        noticeId: { type: 'string' },
        message: { type: 'string' }
      },
      additionalProperties: false
    },
    duplicateCheckId: {
      type: 'object',
      required: ['checkId', 'count', 'names'],
      properties: {
        checkId: { type: 'string' },
        count: { type: 'integer', minimum: 2 },
        names: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    branchDuplicateCheckId: {
      type: 'object',
      required: ['branch', 'checkId', 'count', 'names'],
      properties: {
        branch: { type: 'string' },
        checkId: { type: 'string' },
        count: { type: 'integer', minimum: 2 },
        names: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    failure: {
      type: 'object',
      required: ['checkId', 'name', 'details'],
      properties: {
        checkId: { type: 'string' },
        name: { type: 'string' },
        details: { type: 'string' }
      },
      additionalProperties: false
    },
    branchFailure: {
      type: 'object',
      required: ['branch', 'checkId', 'name', 'details'],
      properties: {
        branch: { type: 'string' },
        checkId: { type: 'string' },
        name: { type: 'string' },
        details: { type: 'string' }
      },
      additionalProperties: false
    },
    branchNotice: {
      type: 'object',
      required: ['branch', 'noticeId', 'message'],
      properties: {
        branch: { type: 'string' },
        noticeId: { type: 'string' },
        message: { type: 'string' }
      },
      additionalProperties: false
    },
    branchSummary: {
      type: 'object',
      required: ['totalChecks', 'passedChecks', 'failedChecks', 'noticeCount', 'noticeDetails', 'duplicateCheckIdCount', 'duplicateCheckIds', 'failures'],
      properties: {
        totalChecks: { type: 'integer', minimum: 0 },
        passedChecks: { type: 'integer', minimum: 0 },
        failedChecks: { type: 'integer', minimum: 0 },
        noticeCount: { type: 'integer', minimum: 0 },
        noticeDetails: { type: 'array', items: { $ref: '#/$defs/notice' } },
        duplicateCheckIdCount: { type: 'integer', minimum: 0 },
        duplicateCheckIds: { type: 'array', items: { $ref: '#/$defs/duplicateCheckId' } },
        duplicateCheckIdFailure: { type: 'boolean' },
        failures: { type: 'array', items: { $ref: '#/$defs/failure' } }
      },
      additionalProperties: false
    },
    aggregateSummary: {
      type: 'object',
      required: ['totalBranches', 'passedBranches', 'failedBranches', 'totalChecks', 'passedChecks', 'failedChecks', 'noticeCount', 'noticeDetails', 'duplicateCheckIdCount', 'duplicateCheckIds', 'failures'],
      properties: {
        totalBranches: { type: 'integer', minimum: 0 },
        passedBranches: { type: 'integer', minimum: 0 },
        failedBranches: { type: 'integer', minimum: 0 },
        totalChecks: { type: 'integer', minimum: 0 },
        passedChecks: { type: 'integer', minimum: 0 },
        failedChecks: { type: 'integer', minimum: 0 },
        noticeCount: { type: 'integer', minimum: 0 },
        noticeDetails: { type: 'array', items: { $ref: '#/$defs/branchNotice' } },
        duplicateCheckIdCount: { type: 'integer', minimum: 0 },
        duplicateCheckIds: { type: 'array', items: { $ref: '#/$defs/branchDuplicateCheckId' } },
        duplicateCheckIdFailure: { type: 'boolean' },
        failures: { type: 'array', items: { $ref: '#/$defs/branchFailure' } }
      },
      additionalProperties: false
    },
    branchAuditResult: {
      type: 'object',
      required: ['branch', 'success', 'checks', 'notices', 'noticeDetails', 'summary'],
      properties: {
        branch: { type: 'string' },
        success: { type: 'boolean' },
        checks: { type: 'array', items: { $ref: '#/$defs/check' } },
        notices: { type: 'array', items: { type: 'string' } },
        noticeDetails: { type: 'array', items: { $ref: '#/$defs/notice' } },
        summary: { $ref: '#/$defs/branchSummary' }
      },
      additionalProperties: false
    },
    provenance: {
      type: 'object',
      required: ['generatedAt', 'repo', 'branches', 'outputMode', 'argv'],
      properties: {
        generatedAt: { type: 'string', format: 'date-time' },
        repo: { type: 'string' },
        branches: { type: 'array', items: { type: 'string' } },
        outputMode: { enum: ['text', 'json', 'markdown', 'schema'] },
        argv: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    }
  }
});
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

function enableFullHardeningOptions(options) {
  for (const key of FULL_HARDENING_OPTION_KEYS) {
    options[key] = true;
  }
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
    requireFullHardening: false,
    emitJson: false,
    emitMarkdown: false,
    emitSchema: false,
    includeProvenance: false,
    failOnDuplicateCheckIds: false,
    outputPath: undefined,
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
    else if (arg === '--require-full-hardening') {
      options.requireFullHardening = true;
      enableFullHardeningOptions(options);
    }
    else if (arg === '--json') options.emitJson = true;
    else if (arg === '--markdown') options.emitMarkdown = true;
    else if (arg === '--schema') options.emitSchema = true;
    else if (arg === '--include-provenance') options.includeProvenance = true;
    else if (arg === '--fail-on-duplicate-check-ids') options.failOnDuplicateCheckIds = true;
    else if (arg === '--output') options.outputPath = next();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }
  if ([options.emitJson, options.emitMarkdown, options.emitSchema].filter(Boolean).length > 1) {
    throw new Error('Use only one of --json, --markdown, or --schema');
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
    '  --require-full-hardening Fail unless every opt-in hardening check passes',
    '  --json                Emit machine-readable JSON instead of text',
    '  --markdown            Emit compact Markdown evidence instead of text',
    '  --schema              Emit the schemaVersion 1 JSON Schema without auditing live settings',
    '  --include-provenance  Include generated timestamp, argv, repo, branches, and output mode',
    '  --fail-on-duplicate-check-ids Fail when stable check IDs are duplicated',
    '  --output <path>       Write rendered audit output to a relative file path',
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

function branchProtectionSectionKeys(protection) {
  if (!protection || typeof protection !== 'object' || Array.isArray(protection)) {
    return [];
  }
  return Object.keys(protection).sort();
}

function branchProtectionFlagSectionKeySummaries(protection, expectedFlagSectionKeys = EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS) {
  return Object.keys(expectedFlagSectionKeys)
    .sort()
    .map((section) => {
      const value = protection && protection[section];
      const observedKeys = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).sort()
        : [];
      const expectedKeys = expectedFlagSectionKeys[section];
      return {
        section,
        expectedKeys,
        observedKeys,
        missingKeys: expectedKeys.filter((key) => !observedKeys.includes(key)),
        unexpectedKeys: observedKeys.filter((key) => !expectedKeys.includes(key))
      };
    });
}

function pullRequestReviewSectionKeys(protection) {
  const reviews = protection && protection.required_pull_request_reviews;
  if (!reviews || typeof reviews !== 'object' || Array.isArray(reviews)) {
    return [];
  }
  return Object.keys(reviews).sort();
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

function requiredStatusCheckSectionKeys(protection) {
  const checks = protection && protection.required_status_checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    return [];
  }
  return Object.keys(checks).sort();
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

function requiredStatusCheckObjectKeys(protection) {
  const checks = protection && protection.required_status_checks;
  const keys = new Set();
  for (const check of Array.isArray(checks && checks.checks) ? checks.checks : []) {
    if (check && typeof check === 'object' && !Array.isArray(check)) {
      for (const key of Object.keys(check)) {
        keys.add(String(key));
      }
    }
  }
  return [...keys].sort();
}

function rulesetRefNameExclusions(ruleset) {
  const conditions = ruleset && ruleset.conditions;
  const refName = conditions && conditions.ref_name;
  return (Array.isArray(refName && refName.exclude) ? refName.exclude : [])
    .map((pattern) => String(pattern))
    .sort();
}

function rulesetConditionKeys(ruleset) {
  const conditions = ruleset && ruleset.conditions;
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
    return [];
  }
  return Object.keys(conditions).sort();
}

function rulesetRefNameKeys(ruleset) {
  const conditions = ruleset && ruleset.conditions;
  const refName = conditions && conditions.ref_name;
  if (!refName || typeof refName !== 'object' || Array.isArray(refName)) {
    return [];
  }
  return Object.keys(refName).sort();
}

function rulesetSectionKeys(ruleset) {
  if (!ruleset || typeof ruleset !== 'object' || Array.isArray(ruleset)) {
    return [];
  }
  return Object.keys(ruleset).sort();
}

function rulesetRuleKeys(ruleset) {
  const keys = new Set();
  for (const rule of Array.isArray(ruleset && ruleset.rules) ? ruleset.rules : []) {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      for (const key of Object.keys(rule)) {
        keys.add(String(key));
      }
    }
  }
  return [...keys].sort();
}

function rulesetTargetEnforcementSummaries(rulesets) {
  return (Array.isArray(rulesets) ? rulesets : [])
    .filter(Boolean)
    .map((ruleset) => ({
      name: String(ruleset.name || '(unnamed)'),
      target: String(ruleset.target || 'unknown'),
      enforcement: String(ruleset.enforcement || 'unknown')
    }));
}

function activeRulesetSummaries(rulesets) {
  return (Array.isArray(rulesets) ? rulesets : [])
    .filter((ruleset) => ruleset && ruleset.enforcement === EXPECTED_ACTIVE_RULESET_ENFORCEMENT && ruleset.target === EXPECTED_ACTIVE_RULESET_TARGET)
    .map((ruleset) => ({
      name: String(ruleset.name || '(unnamed)'),
      sourceType: String(ruleset.source_type || 'unknown'),
      source: String(ruleset.source || 'unknown'),
      sectionKeys: rulesetSectionKeys(ruleset),
      conditionKeys: rulesetConditionKeys(ruleset),
      refNameKeys: rulesetRefNameKeys(ruleset),
      ruleCount: Array.isArray(ruleset.rules) ? ruleset.rules.length : 0,
      ruleKeys: rulesetRuleKeys(ruleset),
      ruleTypes: rulesetRuleTypes(ruleset),
      refNameExclusions: rulesetRefNameExclusions(ruleset),
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
  const expectedBranchProtectionSectionKeys = options.expectedBranchProtectionSectionKeys || EXPECTED_BRANCH_PROTECTION_SECTION_KEYS;
  const expectedBranchProtectionFlagSectionKeys = options.expectedBranchProtectionFlagSectionKeys || EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS;
  const expectedRequiredStatusCheckSectionKeys = options.expectedRequiredStatusCheckSectionKeys || EXPECTED_REQUIRED_STATUS_CHECK_SECTION_KEYS;
  const expectedRequiredStatusCheckKeys = options.expectedRequiredStatusCheckKeys || EXPECTED_REQUIRED_STATUS_CHECK_KEYS;
  const expectedPullRequestReviewSectionKeys = options.expectedPullRequestReviewSectionKeys || EXPECTED_PULL_REQUEST_REVIEW_SECTION_KEYS;
  const advisoryChecks = options.advisoryChecks || ADVISORY_STATUS_CHECKS;
  const expectedActiveBranchRulesets = options.expectedActiveBranchRulesets || EXPECTED_ACTIVE_BRANCH_RULESETS;
  const expectedActiveRulesetTarget = options.expectedActiveRulesetTarget || EXPECTED_ACTIVE_RULESET_TARGET;
  const expectedActiveRulesetEnforcement = options.expectedActiveRulesetEnforcement || EXPECTED_ACTIVE_RULESET_ENFORCEMENT;
  const expectedActiveRulesetSourceType = options.expectedActiveRulesetSourceType || EXPECTED_ACTIVE_RULESET_SOURCE_TYPE;
  const expectedActiveRulesetSource = options.expectedActiveRulesetSource || options.repo || DEFAULT_REPO;
  const expectedActiveRulesetSectionKeys = options.expectedActiveRulesetSectionKeys || EXPECTED_ACTIVE_RULESET_SECTION_KEYS;
  const expectedActiveRulesetConditionKeys = options.expectedActiveRulesetConditionKeys || EXPECTED_ACTIVE_RULESET_CONDITION_KEYS;
  const expectedActiveRulesetRefNameKeys = options.expectedActiveRulesetRefNameKeys || EXPECTED_ACTIVE_RULESET_REF_NAME_KEYS;
  const expectedActiveRulesetRuleKeys = options.expectedActiveRulesetRuleKeys || EXPECTED_ACTIVE_RULESET_RULE_KEYS;
  const expectedActiveRulesetRuleTypes = options.expectedActiveRulesetRuleTypes || EXPECTED_ACTIVE_RULESET_RULE_TYPES;
  const expectedActiveRulesetRuleCount = expectedActiveRulesetRuleTypes.length;
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
  const observedBranchProtectionSectionKeys = branchProtectionSectionKeys(protection);
  const missingBranchProtectionSectionKeys = expectedBranchProtectionSectionKeys.filter((key) => !observedBranchProtectionSectionKeys.includes(key));
  const unexpectedBranchProtectionSectionKeys = observedBranchProtectionSectionKeys.filter((key) => !expectedBranchProtectionSectionKeys.includes(key));
  const branchProtectionFlagSectionKeyDrift = branchProtectionFlagSectionKeySummaries(protection, expectedBranchProtectionFlagSectionKeys)
    .filter((item) => item.missingKeys.length > 0 || item.unexpectedKeys.length > 0);
  const observedRequiredStatusCheckSectionKeys = requiredStatusCheckSectionKeys(protection);
  const missingRequiredStatusCheckSectionKeys = expectedRequiredStatusCheckSectionKeys.filter((key) => !observedRequiredStatusCheckSectionKeys.includes(key));
  const unexpectedRequiredStatusCheckSectionKeys = observedRequiredStatusCheckSectionKeys.filter((key) => !expectedRequiredStatusCheckSectionKeys.includes(key));
  const requiredStatusCheckKeys = requiredStatusCheckObjectKeys(protection);
  const missingRequiredStatusCheckKeys = expectedRequiredStatusCheckKeys.filter((key) => !requiredStatusCheckKeys.includes(key));
  const unexpectedRequiredStatusCheckKeys = requiredStatusCheckKeys.filter((key) => !expectedRequiredStatusCheckKeys.includes(key));
  const observedPullRequestReviewSectionKeys = pullRequestReviewSectionKeys(protection);
  const missingPullRequestReviewSectionKeys = expectedPullRequestReviewSectionKeys.filter((key) => !observedPullRequestReviewSectionKeys.includes(key));
  const unexpectedPullRequestReviewSectionKeys = observedPullRequestReviewSectionKeys.filter((key) => !expectedPullRequestReviewSectionKeys.includes(key));
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
  const rulesetTargetEnforcements = rulesetTargetEnforcementSummaries(settings.rulesets);
  const activeRulesets = activeRulesetSummaries(settings.rulesets);
  const activeRulesetNames = activeRulesets.map((ruleset) => ruleset.name).sort();
  const missingActiveRulesets = expectedActiveBranchRulesets.filter((name) => !activeRulesetNames.includes(name));
  const unexpectedActiveRulesets = activeRulesetNames.filter((name) => !expectedActiveBranchRulesets.includes(name));
  const duplicateActiveRulesets = duplicateNameCounts(activeRulesetNames);
  const activeRulesetsByName = new Map(activeRulesets.map((ruleset) => [ruleset.name, ruleset]));
  const rulesetsWithUnexpectedTargetEnforcement = expectedActiveBranchRulesets
    .flatMap((name) => rulesetTargetEnforcements.filter((ruleset) => ruleset.name === name))
    .filter((ruleset) => ruleset.target !== expectedActiveRulesetTarget || ruleset.enforcement !== expectedActiveRulesetEnforcement);
  const rulesetsWithUnexpectedSources = expectedActiveBranchRulesets
    .map((name) => activeRulesetsByName.get(name))
    .filter((ruleset) => ruleset && (ruleset.sourceType !== expectedActiveRulesetSourceType || ruleset.source !== expectedActiveRulesetSource));
  const rulesetsWithSectionKeyDrift = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      if (!ruleset) {
        return undefined;
      }
      return {
        name,
        missingSectionKeys: expectedActiveRulesetSectionKeys.filter((key) => !ruleset.sectionKeys.includes(key)),
        unexpectedSectionKeys: ruleset.sectionKeys.filter((key) => !expectedActiveRulesetSectionKeys.includes(key)),
        observedSectionKeys: ruleset.sectionKeys
      };
    })
    .filter((item) => item && (item.missingSectionKeys.length > 0 || item.unexpectedSectionKeys.length > 0));
  const rulesetsWithConditionKeyDrift = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      if (!ruleset) {
        return undefined;
      }
      return {
        name,
        missingConditionKeys: expectedActiveRulesetConditionKeys.filter((key) => !ruleset.conditionKeys.includes(key)),
        unexpectedConditionKeys: ruleset.conditionKeys.filter((key) => !expectedActiveRulesetConditionKeys.includes(key)),
        observedConditionKeys: ruleset.conditionKeys
      };
    })
    .filter((item) => item && (item.missingConditionKeys.length > 0 || item.unexpectedConditionKeys.length > 0));
  const rulesetsWithRefNameKeyDrift = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      if (!ruleset) {
        return undefined;
      }
      return {
        name,
        missingRefNameKeys: expectedActiveRulesetRefNameKeys.filter((key) => !ruleset.refNameKeys.includes(key)),
        unexpectedRefNameKeys: ruleset.refNameKeys.filter((key) => !expectedActiveRulesetRefNameKeys.includes(key)),
        observedRefNameKeys: ruleset.refNameKeys
      };
    })
    .filter((item) => item && (item.missingRefNameKeys.length > 0 || item.unexpectedRefNameKeys.length > 0));
  const rulesetsWithUnexpectedRuleCounts = expectedActiveBranchRulesets
    .map((name) => activeRulesetsByName.get(name))
    .filter((ruleset) => ruleset && ruleset.ruleCount !== expectedActiveRulesetRuleCount);
  const rulesetsWithRuleKeyDrift = expectedActiveBranchRulesets
    .map((name) => {
      const ruleset = activeRulesetsByName.get(name);
      if (!ruleset) {
        return undefined;
      }
      return {
        name,
        missingRuleKeys: expectedActiveRulesetRuleKeys.filter((key) => !ruleset.ruleKeys.includes(key)),
        unexpectedRuleKeys: ruleset.ruleKeys.filter((key) => !expectedActiveRulesetRuleKeys.includes(key)),
        observedRuleKeys: ruleset.ruleKeys
      };
    })
    .filter((item) => item && (item.missingRuleKeys.length > 0 || item.unexpectedRuleKeys.length > 0));
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
  const rulesetsWithRefExclusions = expectedActiveBranchRulesets
    .map((name) => activeRulesetsByName.get(name))
    .filter((ruleset) => ruleset && ruleset.refNameExclusions.length > 0);
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
      name: 'branch protection section keys',
      passed: missingBranchProtectionSectionKeys.length === 0 && unexpectedBranchProtectionSectionKeys.length === 0,
      details: missingBranchProtectionSectionKeys.length === 0 && unexpectedBranchProtectionSectionKeys.length === 0
        ? `${expectedBranchProtectionSectionKeys.join(', ') || 'none'} only`
        : `missing: ${missingBranchProtectionSectionKeys.join(', ') || 'none'}; unexpected: ${unexpectedBranchProtectionSectionKeys.join(', ') || 'none'}; observed: ${observedBranchProtectionSectionKeys.join(', ') || 'none'}; allowed: ${expectedBranchProtectionSectionKeys.join(', ') || 'none'}`
    },
    {
      name: 'branch protection flag section keys',
      passed: branchProtectionFlagSectionKeyDrift.length === 0,
      details: branchProtectionFlagSectionKeyDrift.length === 0
        ? branchProtectionFlagSectionKeySummaries(protection, expectedBranchProtectionFlagSectionKeys)
          .map((item) => `${item.section}: ${item.expectedKeys.join(', ') || 'none'}`)
          .join('; ') + ' only'
        : branchProtectionFlagSectionKeyDrift
          .map((item) => `${item.section} missing: ${item.missingKeys.join(', ') || 'none'}; unexpected: ${item.unexpectedKeys.join(', ') || 'none'}; observed: ${item.observedKeys.join(', ') || 'none'}; allowed: ${item.expectedKeys.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'required status checks section keys',
      passed: missingRequiredStatusCheckSectionKeys.length === 0 && unexpectedRequiredStatusCheckSectionKeys.length === 0,
      details: missingRequiredStatusCheckSectionKeys.length === 0 && unexpectedRequiredStatusCheckSectionKeys.length === 0
        ? `${expectedRequiredStatusCheckSectionKeys.join(', ') || 'none'} only`
        : `missing: ${missingRequiredStatusCheckSectionKeys.join(', ') || 'none'}; unexpected: ${unexpectedRequiredStatusCheckSectionKeys.join(', ') || 'none'}; observed: ${observedRequiredStatusCheckSectionKeys.join(', ') || 'none'}; allowed: ${expectedRequiredStatusCheckSectionKeys.join(', ') || 'none'}`
    },
    {
      name: 'required status check object keys',
      passed: missingRequiredStatusCheckKeys.length === 0 && unexpectedRequiredStatusCheckKeys.length === 0,
      details: missingRequiredStatusCheckKeys.length === 0 && unexpectedRequiredStatusCheckKeys.length === 0
        ? `${expectedRequiredStatusCheckKeys.join(', ') || 'none'} only`
        : `missing: ${missingRequiredStatusCheckKeys.join(', ') || 'none'}; unexpected: ${unexpectedRequiredStatusCheckKeys.join(', ') || 'none'}; observed: ${requiredStatusCheckKeys.join(', ') || 'none'}; allowed: ${expectedRequiredStatusCheckKeys.join(', ') || 'none'}`
    },
    {
      name: 'pull request review section keys',
      passed: missingPullRequestReviewSectionKeys.length === 0 && unexpectedPullRequestReviewSectionKeys.length === 0,
      details: missingPullRequestReviewSectionKeys.length === 0 && unexpectedPullRequestReviewSectionKeys.length === 0
        ? `${expectedPullRequestReviewSectionKeys.join(', ') || 'none'} only`
        : `missing: ${missingPullRequestReviewSectionKeys.join(', ') || 'none'}; unexpected: ${unexpectedPullRequestReviewSectionKeys.join(', ') || 'none'}; observed: ${observedPullRequestReviewSectionKeys.join(', ') || 'none'}; allowed: ${expectedPullRequestReviewSectionKeys.join(', ') || 'none'}`
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
      name: 'active branch ruleset target/enforcement',
      passed: rulesetsWithUnexpectedTargetEnforcement.length === 0,
      details: rulesetsWithUnexpectedTargetEnforcement.length === 0
        ? `target ${expectedActiveRulesetTarget} and enforcement ${expectedActiveRulesetEnforcement} on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithUnexpectedTargetEnforcement
          .map((ruleset) => `${ruleset.name} target ${ruleset.target}, enforcement ${ruleset.enforcement}; expected target ${expectedActiveRulesetTarget} and enforcement ${expectedActiveRulesetEnforcement}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset sources',
      passed: rulesetsWithUnexpectedSources.length === 0,
      details: rulesetsWithUnexpectedSources.length === 0
        ? `${expectedActiveRulesetSourceType} ${expectedActiveRulesetSource} on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithUnexpectedSources
          .map((ruleset) => `${ruleset.name} source ${ruleset.sourceType} ${ruleset.source}; expected ${expectedActiveRulesetSourceType} ${expectedActiveRulesetSource}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset section keys',
      passed: rulesetsWithSectionKeyDrift.length === 0,
      details: rulesetsWithSectionKeyDrift.length === 0
        ? `${expectedActiveRulesetSectionKeys.join(', ') || 'none'} only on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithSectionKeyDrift
          .map((item) => `${item.name} missing: ${item.missingSectionKeys.join(', ') || 'none'}; unexpected: ${item.unexpectedSectionKeys.join(', ') || 'none'}; observed: ${item.observedSectionKeys.join(', ') || 'none'}; allowed: ${expectedActiveRulesetSectionKeys.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset condition keys',
      passed: rulesetsWithConditionKeyDrift.length === 0,
      details: rulesetsWithConditionKeyDrift.length === 0
        ? `${expectedActiveRulesetConditionKeys.join(', ') || 'none'} only on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithConditionKeyDrift
          .map((item) => `${item.name} missing: ${item.missingConditionKeys.join(', ') || 'none'}; unexpected: ${item.unexpectedConditionKeys.join(', ') || 'none'}; observed: ${item.observedConditionKeys.join(', ') || 'none'}; allowed: ${expectedActiveRulesetConditionKeys.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset ref_name keys',
      passed: rulesetsWithRefNameKeyDrift.length === 0,
      details: rulesetsWithRefNameKeyDrift.length === 0
        ? `${expectedActiveRulesetRefNameKeys.join(', ') || 'none'} only on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithRefNameKeyDrift
          .map((item) => `${item.name} missing: ${item.missingRefNameKeys.join(', ') || 'none'}; unexpected: ${item.unexpectedRefNameKeys.join(', ') || 'none'}; observed: ${item.observedRefNameKeys.join(', ') || 'none'}; allowed: ${expectedActiveRulesetRefNameKeys.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset rule count',
      passed: rulesetsWithUnexpectedRuleCounts.length === 0,
      details: rulesetsWithUnexpectedRuleCounts.length === 0
        ? `${expectedActiveRulesetRuleCount} rules on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithUnexpectedRuleCounts
          .map((ruleset) => `${ruleset.name} rule count ${ruleset.ruleCount}; expected ${expectedActiveRulesetRuleCount}; observed: ${ruleset.ruleTypes.join(', ') || 'none'}`)
          .join('; ')
    },
    {
      name: 'active branch ruleset rule keys',
      passed: rulesetsWithRuleKeyDrift.length === 0,
      details: rulesetsWithRuleKeyDrift.length === 0
        ? `${expectedActiveRulesetRuleKeys.join(', ') || 'none'} only on ${expectedActiveBranchRulesets.join(', ')}`
        : rulesetsWithRuleKeyDrift
          .map((item) => `${item.name} missing: ${item.missingRuleKeys.join(', ') || 'none'}; unexpected: ${item.unexpectedRuleKeys.join(', ') || 'none'}; observed: ${item.observedRuleKeys.join(', ') || 'none'}; allowed: ${expectedActiveRulesetRuleKeys.join(', ') || 'none'}`)
          .join('; ')
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
      name: 'active branch ruleset ref exclusions',
      passed: rulesetsWithRefExclusions.length === 0,
      details: rulesetsWithRefExclusions.length === 0
        ? 'none'
        : rulesetsWithRefExclusions
          .map((ruleset) => `${ruleset.name} excludes: ${ruleset.refNameExclusions.join(', ')}`)
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

function slugIdForText(value, fallback) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '') || fallback;
}

function checkIdForName(name) {
  return slugIdForText(name, 'unnamed-check');
}

function checkIdForCheck(check) {
  return check && check.id ? String(check.id) : checkIdForName(check && check.name);
}

function checkResultJson(check) {
  return {
    ...check,
    id: checkIdForCheck(check)
  };
}

function noticeIdForMessage(message) {
  const text = String(message || '').trim();
  const labelEnd = text.indexOf(':');
  const label = labelEnd >= 0 ? text.slice(0, labelEnd) : text;
  return slugIdForText(label, 'unnamed-notice');
}

function noticeResultJson(notice) {
  return {
    noticeId: noticeIdForMessage(notice),
    message: String(notice ?? '')
  };
}

function noticeDetailsForResult(result) {
  const notices = Array.isArray(result && result.notices) ? result.notices : [];
  return notices.map(noticeResultJson);
}

function duplicateCheckIdsForResult(result) {
  const checks = Array.isArray(result && result.checks) ? result.checks : [];
  const checkIds = new Map();
  for (const check of checks) {
    const checkId = checkIdForCheck(check);
    const entry = checkIds.get(checkId) || { checkId, count: 0, names: [] };
    entry.count += 1;
    const name = String(check && check.name ? check.name : 'unnamed check');
    if (!entry.names.includes(name)) {
      entry.names.push(name);
    }
    checkIds.set(checkId, entry);
  }
  return [...checkIds.values()].filter((entry) => entry.count > 1);
}

function duplicateCheckIdFailureForResult(result, options = {}) {
  return Boolean(options.failOnDuplicateCheckIds && duplicateCheckIdsForResult(result).length > 0);
}

function auditResultSuccess(result, options = {}) {
  return Boolean(result && result.success) && !duplicateCheckIdFailureForResult(result, options);
}

function summarizeAuditResult(result, options = {}) {
  const checks = Array.isArray(result && result.checks) ? result.checks : [];
  const notices = Array.isArray(result && result.notices) ? result.notices : [];
  const noticeDetails = noticeDetailsForResult(result);
  const duplicateCheckIds = duplicateCheckIdsForResult(result);
  const duplicateCheckIdFailure = Boolean(options.failOnDuplicateCheckIds && duplicateCheckIds.length > 0);
  const failures = checks
    .filter((check) => !check.passed)
    .map((check) => ({ checkId: checkIdForCheck(check), name: check.name, details: check.details }));
  const summary = {
    totalChecks: checks.length,
    passedChecks: checks.length - failures.length,
    failedChecks: failures.length,
    noticeCount: notices.length,
    noticeDetails,
    duplicateCheckIdCount: duplicateCheckIds.length,
    duplicateCheckIds,
    failures
  };
  if (options.failOnDuplicateCheckIds) {
    summary.duplicateCheckIdFailure = duplicateCheckIdFailure;
  }
  return summary;
}

function summarizeBranchResults(branchResults, options = {}) {
  const branchSummaries = branchResults.map((item) => {
    const summary = summarizeAuditResult(item.result, options);
    return {
      branch: item.branch,
      success: auditResultSuccess(item.result, options),
      ...summary
    };
  });
  const summary = {
    totalBranches: branchSummaries.length,
    passedBranches: branchSummaries.filter((item) => item.success).length,
    failedBranches: branchSummaries.filter((item) => !item.success).length,
    totalChecks: branchSummaries.reduce((total, item) => total + item.totalChecks, 0),
    passedChecks: branchSummaries.reduce((total, item) => total + item.passedChecks, 0),
    failedChecks: branchSummaries.reduce((total, item) => total + item.failedChecks, 0),
    noticeCount: branchSummaries.reduce((total, item) => total + item.noticeCount, 0),
    noticeDetails: branchSummaries.flatMap((item) => item.noticeDetails.map((notice) => ({ branch: item.branch, ...notice }))),
    duplicateCheckIdCount: branchSummaries.reduce((total, item) => total + item.duplicateCheckIdCount, 0),
    duplicateCheckIds: branchSummaries.flatMap((item) => item.duplicateCheckIds.map((duplicate) => ({ branch: item.branch, ...duplicate }))),
    failures: branchSummaries.flatMap((item) => item.failures.map((failure) => ({ branch: item.branch, ...failure })))
  };
  if (options.failOnDuplicateCheckIds) {
    summary.duplicateCheckIdFailure = summary.duplicateCheckIdCount > 0;
  }
  return summary;
}

function auditResultJson(item, options = {}) {
  return {
    branch: item.branch,
    success: auditResultSuccess(item.result, options),
    checks: Array.isArray(item.result.checks) ? item.result.checks.map(checkResultJson) : [],
    notices: Array.isArray(item.result.notices) ? item.result.notices : [],
    noticeDetails: noticeDetailsForResult(item.result),
    summary: summarizeAuditResult(item.result, options)
  };
}

function markdownCell(value) {
  return String(value ?? '').replace(/\r?\n/gu, ' ').replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|');
}

function markdownCodeSpan(value) {
  const content = String(value ?? '').replace(/\r?\n/gu, ' ');
  const longestBacktickRun = Math.max(0, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = '`'.repeat(longestBacktickRun + 1);
  const paddedContent = content.startsWith('`') || content.endsWith('`') ? ` ${content} ` : content;
  return `${fence}${paddedContent}${fence}`;
}

function outputModeForOptions(options = {}) {
  if (options.emitJson) return 'json';
  if (options.emitMarkdown) return 'markdown';
  if (options.emitSchema) return 'schema';
  return 'text';
}

function generatedAtForProvenance(deps = {}) {
  if (typeof deps.now === 'function') {
    const now = deps.now();
    return now instanceof Date ? now.toISOString() : String(now);
  }
  if (deps.generatedAt !== undefined) {
    return deps.generatedAt instanceof Date ? deps.generatedAt.toISOString() : String(deps.generatedAt);
  }
  return new Date().toISOString();
}

function buildAuditProvenance(branchResults, options = {}, deps = {}) {
  return buildAuditProvenanceForBranches(branchResults.map((item) => item.branch), options, deps);
}

function buildAuditProvenanceForBranches(branches, options = {}, deps = {}) {
  return {
    generatedAt: generatedAtForProvenance(deps),
    repo: options.repo || DEFAULT_REPO,
    branches: Array.isArray(branches) ? [...branches] : [],
    outputMode: outputModeForOptions(options),
    argv: Array.isArray(deps.argv) ? [...deps.argv] : []
  };
}

function buildAuditSchemaProvenance(options = {}, deps = {}) {
  return buildAuditProvenanceForBranches(branchesForOptions(options), options, deps);
}

function renderBranchProtectionAuditJsonSchema(options = {}) {
  const schema = options.provenance
    ? {
        ...BRANCH_PROTECTION_AUDIT_JSON_SCHEMA,
        [BRANCH_PROTECTION_AUDIT_SCHEMA_PROVENANCE_KEY]: options.provenance
      }
    : BRANCH_PROTECTION_AUDIT_JSON_SCHEMA;
  return JSON.stringify(schema, null, 2);
}

function provenanceMarkdownLines(provenance) {
  if (!provenance) return [];
  return [
    `- Generated: ${markdownCodeSpan(provenance.generatedAt)}`,
    `- Output: ${markdownCodeSpan(provenance.outputMode)}`,
    `- Audit argv: ${markdownCodeSpan(JSON.stringify(provenance.argv))}`
  ];
}

function renderTextProvenance(provenance) {
  if (!provenance) return '';
  return [
    '[branch-protection-audit] Provenance',
    `generatedAt: ${provenance.generatedAt}`,
    `repo: ${provenance.repo}`,
    `branches: ${provenance.branches.join(', ')}`,
    `outputMode: ${provenance.outputMode}`,
    `argv: ${JSON.stringify(provenance.argv)}`,
    ''
  ].join('\n');
}

function renderMarkdown(branchResults, options = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const summary = summarizeBranchResults(branchResults, options);
  const success = branchResults.every((item) => auditResultSuccess(item.result, options));
  const lines = [
    '## Branch Protection Audit',
    '',
    `- Repository: \`${repo}\``,
    `- Result: ${success ? 'PASS' : 'FAIL'}`,
    `- Branches: ${summary.passedBranches}/${summary.totalBranches} passed`,
    `- Checks: ${summary.passedChecks}/${summary.totalChecks} passed`,
    `- Notices: ${summary.noticeCount}`,
    '',
    '| Branch | Result | Checks | Failed | Notices |',
    '| --- | --- | ---: | ---: | ---: |'
  ];

  const provenanceLines = provenanceMarkdownLines(options.provenance);
  if (provenanceLines.length > 0) {
    lines.splice(7, 0, ...provenanceLines, '');
  }

  for (const item of branchResults) {
    const branchSummary = summarizeAuditResult(item.result, options);
    lines.push(
      `| ${markdownCell(item.branch)} | ${auditResultSuccess(item.result, options) ? 'PASS' : 'FAIL'} | ${branchSummary.passedChecks}/${branchSummary.totalChecks} | ${branchSummary.failedChecks} | ${branchSummary.noticeCount} |`
    );
  }

  if (summary.noticeDetails.length > 0) {
    lines.push('', '### Notices', '', '| Branch | Notice ID | Message |', '| --- | --- | --- |');
    for (const notice of summary.noticeDetails) {
      lines.push(`| ${markdownCell(notice.branch)} | ${markdownCell(notice.noticeId)} | ${markdownCell(notice.message)} |`);
    }
  }

  if (summary.failures.length === 0) {
    lines.push('', 'No failures.');
  } else {
    lines.push('', '### Failures', '', '| Branch | Check ID | Check | Details |', '| --- | --- | --- | --- |');
    for (const failure of summary.failures) {
      lines.push(`| ${markdownCell(failure.branch)} | ${markdownCell(failure.checkId)} | ${markdownCell(failure.name)} | ${markdownCell(failure.details)} |`);
    }
  }

  if (summary.duplicateCheckIds.length > 0) {
    lines.push('', '### Duplicate Check IDs', '', '| Branch | Check ID | Count | Checks |', '| --- | --- | ---: | --- |');
    for (const duplicate of summary.duplicateCheckIds) {
      lines.push(`| ${markdownCell(duplicate.branch)} | ${markdownCell(duplicate.checkId)} | ${duplicate.count} | ${markdownCell(duplicate.names.join(', '))} |`);
    }
  }

  return lines.join('\n');
}

function renderAuditOutput(branchResults, options = {}) {
  const success = branchResults.every((item) => auditResultSuccess(item.result, options));
  if (options.emitJson) {
    const provenance = options.provenance ? { provenance: options.provenance } : {};
    if (options.allBranches) {
      return JSON.stringify({
        $schema: BRANCH_PROTECTION_AUDIT_SCHEMA_ID,
        schemaVersion: 1,
        repo: options.repo,
        ...provenance,
        success,
        summary: summarizeBranchResults(branchResults, options),
        branches: branchResults.map((item) => auditResultJson(item, options))
      }, null, 2);
    }
    const [branchResult] = branchResults;
    return JSON.stringify({ $schema: BRANCH_PROTECTION_AUDIT_SCHEMA_ID, schemaVersion: 1, repo: options.repo, ...provenance, ...auditResultJson(branchResult, options) }, null, 2);
  }
  if (options.emitMarkdown) {
    return renderMarkdown(branchResults, options);
  }
  const textOutput = branchResults
    .map((item) => renderResult(item.result, { ...options, branch: item.branch }))
    .join('\n');
  return `${renderTextProvenance(options.provenance)}${textOutput}`;
}

function resolveOutputPath(outputPath, deps = {}) {
  const requestedPath = String(outputPath || '');
  if (requestedPath.trim() === '') {
    throw new Error('--output requires a non-empty path');
  }
  if (path.isAbsolute(requestedPath)) {
    throw new Error('--output must be a relative path inside the working directory');
  }
  const cwd = path.resolve(deps.cwd || process.cwd());
  const resolvedPath = path.resolve(cwd, requestedPath);
  const relativePath = path.relative(cwd, resolvedPath);
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('--output must stay inside the working directory');
  }
  return resolvedPath;
}

function writeAuditOutput(outputPath, content, deps = {}) {
  const mkdirSync = deps.mkdirSync || fs.mkdirSync;
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  const resolvedPath = resolveOutputPath(outputPath, deps);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${content}\n`, 'utf8');
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
    if (options.emitSchema) {
      const schemaOptions = options.includeProvenance
        ? { provenance: buildAuditSchemaProvenance(options, { ...deps, argv }) }
        : {};
      const schemaOutput = renderBranchProtectionAuditJsonSchema(schemaOptions);
      if (options.outputPath) {
        writeAuditOutput(options.outputPath, schemaOutput, deps);
        stdout.write(`[branch-protection-audit] Wrote audit output to ${options.outputPath}\n`);
      } else {
        stdout.write(`${schemaOutput}\n`);
      }
      return 0;
    }
    const runAuditBranches = deps.auditBranches || auditBranches;
    const branchResults = runAuditBranches(options, deps);
    const success = branchResults.every((item) => auditResultSuccess(item.result, options));
    const renderOptions = options.includeProvenance
      ? { ...options, provenance: buildAuditProvenance(branchResults, options, { ...deps, argv }) }
      : options;
    const auditOutput = renderAuditOutput(branchResults, renderOptions);
    if (options.outputPath) {
      writeAuditOutput(options.outputPath, auditOutput, deps);
      stdout.write(`[branch-protection-audit] Wrote audit output to ${options.outputPath}\n`);
    } else {
      stdout.write(`${auditOutput}\n`);
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
  BRANCH_PROTECTION_AUDIT_SCHEMA_VERSION,
  BRANCH_PROTECTION_AUDIT_SCHEMA_ID,
  BRANCH_PROTECTION_AUDIT_SCHEMA_PROVENANCE_KEY,
  BRANCH_PROTECTION_AUDIT_JSON_SCHEMA,
  EXPECTED_ACTIVE_BRANCH_RULESETS,
  EXPECTED_ACTIVE_RULESET_TARGET,
  EXPECTED_ACTIVE_RULESET_ENFORCEMENT,
  EXPECTED_ACTIVE_RULESET_SOURCE_TYPE,
  EXPECTED_ACTIVE_RULESET_CONDITION_KEYS,
  EXPECTED_ACTIVE_RULESET_REF_NAME_KEYS,
  EXPECTED_ACTIVE_RULESET_SECTION_KEYS,
  EXPECTED_ACTIVE_RULESET_RULE_KEYS,
  EXPECTED_ACTIVE_RULESET_RULE_TYPES,
  EXPECTED_BRANCH_PROTECTION_SECTION_KEYS,
  EXPECTED_BRANCH_PROTECTION_FLAG_SECTION_KEYS,
  EXPECTED_REQUIRED_STATUS_CHECKS,
  EXPECTED_REQUIRED_STATUS_CHECK_APP_ID,
  EXPECTED_REQUIRED_STATUS_CHECK_SECTION_KEYS,
  EXPECTED_REQUIRED_STATUS_CHECK_KEYS,
  EXPECTED_PULL_REQUEST_REVIEW_SECTION_KEYS,
  ADVISORY_STATUS_CHECKS,
  FULL_HARDENING_OPTION_KEYS,
  ALLOWED_EXECUTABLE_COMMANDS,
  isAllowedExecutableCommand,
  assertAllowedExecutableCommand,
  isValidRepoSlug,
  isValidBranchName,
  enableFullHardeningOptions,
  parseArgs,
  usage,
  buildGhApiArgs,
  buildGhRulesetDetailApiArgs,
  fetchBranchProtection,
  fetchBranchRulesets,
  requiredApprovingReviewCount,
  branchProtectionSectionKeys,
  branchProtectionFlagSectionKeySummaries,
  pullRequestReviewSectionKeys,
  requiredStatusContexts,
  requiredStatusCheckSectionKeys,
  requiredStatusCheckAppBindings,
  requiredStatusCheckObjectKeys,
  rulesetConditionKeys,
  rulesetRefNameKeys,
  rulesetSectionKeys,
  rulesetRuleKeys,
  rulesetTargetEnforcementSummaries,
  activeRulesetSummaries,
  rulesetRuleTypes,
  evaluateBranchProtection,
  renderResult,
  slugIdForText,
  checkIdForName,
  checkIdForCheck,
  checkResultJson,
  noticeIdForMessage,
  noticeResultJson,
  noticeDetailsForResult,
  duplicateCheckIdsForResult,
  duplicateCheckIdFailureForResult,
  auditResultSuccess,
  summarizeAuditResult,
  summarizeBranchResults,
  auditResultJson,
  markdownCell,
  markdownCodeSpan,
  outputModeForOptions,
  generatedAtForProvenance,
  buildAuditProvenance,
  buildAuditProvenanceForBranches,
  buildAuditSchemaProvenance,
  renderBranchProtectionAuditJsonSchema,
  provenanceMarkdownLines,
  renderTextProvenance,
  renderMarkdown,
  renderAuditOutput,
  resolveOutputPath,
  writeAuditOutput,
  branchesForOptions,
  auditBranches,
  auditBranchProtectionSettings,
  main
};
