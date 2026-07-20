#!/usr/bin/env node

'use strict';

// VHS-REQ-692 (Agent Operating Control-Plane, epic #2144): repo-truth read-model
// aggregator. Emits ONE schema'd JSON packet describing live repo ground-truth so
// an agent's behavior is driven by truth, not stale prose. Slice 1 wires the
// merge-queue policy domain plus the coverage and requirement-health domains;
// remaining domains (traceability, release/supply-chain, ADR/governance, open
// work) are added incrementally behind the same schema.
//
// FAIL-CLOSED ON AUTH (VHS-REQ-692 contract): the merge-queue domain requires a
// gh/live-GitHub-capable token. When gh is missing/unauthenticated the read-model
// does NOT degrade to documented defaults; it fails closed (nonzero exit, no
// packet) so a consumer never mistakes "unknown" for "no policy". This is a
// deliberate precondition gate, not honest-degrade.
//
// Pure/testable: all external effects (gh calls, sibling read-model scripts) go
// through injectable deps; the CLI is a thin entrypoint.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  SCHEMA_PROVENANCE_KEY,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes,
  collectSchemaEnvelopeDrift,
  provenanceFooterLines
} = require('./lib/schemaEnvelope.js');
const {
  parseSharedOutputArgs,
  outputModeForOptions,
  generatedAt,
  buildProvenance
} = require('./lib/outputContract.js');

const DEFAULT_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';
const DEFAULT_BRANCH = 'develop';
const GH_TIMEOUT_MS = 60000;
const ALLOWED_EXECUTABLE_COMMANDS = Object.freeze(['gh', 'node']);

const REPO_TRUTH_SCHEMA_VERSION = 1;
const REPO_TRUTH_SCHEMA_ID =
  'https://labview-community-cicd.github.io/vi-history-suite/schemas/repo-truth-read-model-v1.schema.json';

const MERGE_QUEUE_PARAMETER_KEYS = Object.freeze([
  'check_response_timeout_minutes',
  'grouping_strategy',
  'max_entries_to_build',
  'max_entries_to_merge',
  'merge_method',
  'min_entries_to_merge',
  'min_entries_to_merge_wait_minutes'
]);

function assertAllowedExecutableCommand(command) {
  if (!ALLOWED_EXECUTABLE_COMMANDS.includes(command)) {
    throw new Error(`Refusing to spawn disallowed command: ${String(command)}`);
  }
}

// A gh-auth failure is distinguished from any other error so the caller can fail
// closed with an actionable, token-specific message (VHS-REQ-692 posture).
class RepoTruthAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RepoTruthAuthError';
    this.authFailure = true;
  }
}

function isAuthFailureText(text) {
  const value = String(text || '').toLowerCase();
  return (
    value.includes('gh auth login') ||
    value.includes('authentication') ||
    value.includes('missing required scopes') ||
    value.includes('http 401') ||
    value.includes('http 403') ||
    value.includes('resource not accessible') ||
    value.includes('bad credentials')
  );
}

// Run a gh invocation returning parsed JSON. Throws RepoTruthAuthError on an auth
// failure (fail-closed trigger) and a generic Error otherwise.
function runGhJson(args, deps = {}) {
  assertAllowedExecutableCommand('gh');
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const result = spawnSyncImpl('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
  if (result.error) {
    const message = String(result.error.message || result.error);
    if (result.error.code === 'ENOENT') {
      throw new RepoTruthAuthError('gh CLI not found; a gh/live-GitHub token is required');
    }
    throw new Error(`gh ${args.join(' ')} failed: ${message}`);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    if (isAuthFailureText(stderr)) {
      throw new RepoTruthAuthError(`gh authentication/authorization failure: ${stderr}`);
    }
    throw new Error(`gh ${args.join(' ')} failed (status ${result.status}): ${stderr}`);
  }
  try {
    return JSON.parse(String(result.stdout || ''));
  } catch (error) {
    throw new Error(
      `gh ${args.join(' ')} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Pure: extract the normalized merge-queue policy from a list of ruleset detail
// objects. GitHub models the merge queue as a ruleset rule `type: "merge_queue"`
// carrying a `parameters` object. Absent -> { present: false }.
function extractMergeQueuePolicy(rulesets) {
  const list = Array.isArray(rulesets) ? rulesets : [];
  for (const ruleset of list) {
    const rules = ruleset && Array.isArray(ruleset.rules) ? ruleset.rules : [];
    for (const rule of rules) {
      if (rule && rule.type === 'merge_queue') {
        const parameters = rule.parameters && typeof rule.parameters === 'object' ? rule.parameters : {};
        return {
          present: true,
          rulesetName: typeof ruleset.name === 'string' ? ruleset.name : undefined,
          minEntriesToMerge: parameters.min_entries_to_merge,
          minEntriesToMergeWaitMinutes: parameters.min_entries_to_merge_wait_minutes,
          maxEntriesToMerge: parameters.max_entries_to_merge,
          maxEntriesToBuild: parameters.max_entries_to_build,
          groupingStrategy: parameters.grouping_strategy,
          mergeMethod: parameters.merge_method,
          checkResponseTimeoutMinutes: parameters.check_response_timeout_minutes
        };
      }
    }
  }
  return { present: false };
}

// Fetch active rulesets (with per-ruleset detail so rules[] is populated) for the
// branch and extract the merge-queue policy. Fail-closed on auth.
function collectMergeQueueDomain(options, deps = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const branch = options.branch || DEFAULT_BRANCH;
  const rulesetSummaries = runGhJson(
    ['api', `repos/${repo}/rulesets`, '-X', 'GET', '-f', `ref=refs/heads/${branch}`],
    deps
  );
  const summaries = Array.isArray(rulesetSummaries) ? rulesetSummaries : [];
  const details = summaries
    .map((summary) => (summary && summary.id !== undefined && summary.id !== null ? summary.id : undefined))
    .filter((id) => id !== undefined)
    .map((id) => runGhJson(['api', `repos/${repo}/rulesets/${encodeURIComponent(String(id))}`], deps));
  const policy = extractMergeQueuePolicy(details);
  return { available: true, repo, branch, policy };
}

// Run a sibling read-model script (node scripts/X.js --json) and return its parsed
// packet plus a compact summary. Non-auth failures downgrade the domain to
// available:false with a reason (these are local artifacts, not the gh precondition).
function runSiblingReadModel(scriptRelPath, args, deps = {}) {
  assertAllowedExecutableCommand('node');
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const scriptPath = path.join(deps.repoRoot || process.cwd(), scriptRelPath);
  const result = spawnSyncImpl('node', [scriptPath, ...args], {
    encoding: 'utf8',
    timeout: GH_TIMEOUT_MS
  });
  if (result.error) {
    return { available: false, reason: String(result.error.message || result.error) };
  }
  // Some read-models exit nonzero in --enforce mode; slice-1 reads advisory JSON
  // without --enforce, so a nonzero status with no stdout is a real failure.
  const stdout = String(result.stdout || '').trim();
  if (!stdout) {
    return {
      available: false,
      reason: `no JSON from ${scriptRelPath} (status ${result.status})`
    };
  }
  try {
    return { available: true, packet: JSON.parse(stdout) };
  } catch (error) {
    return {
      available: false,
      reason: `invalid JSON from ${scriptRelPath}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function collectCoverageDomain(deps = {}) {
  const outcome = runSiblingReadModel('scripts/mapCoverageToTraceability.js', ['--json'], deps);
  if (!outcome.available) {
    return outcome;
  }
  const packet = outcome.packet || {};
  const mappedBelow = Array.isArray(packet.mappedBelowThreshold) ? packet.mappedBelowThreshold.length : packet.mappedBelowThreshold;
  const zeroSupporting = Array.isArray(packet.zeroCoverageSupportingRequirements)
    ? packet.zeroCoverageSupportingRequirements.length
    : packet.zeroCoverageSupportingRequirements;
  return {
    available: true,
    riskThreshold: packet.riskThreshold,
    mappedBelowThreshold: mappedBelow,
    zeroCoverageSupporting: zeroSupporting
  };
}

function collectRequirementHealthDomain(deps = {}) {
  const outcome = runSiblingReadModel('scripts/verifyRequirementsHealth.js', ['--json'], deps);
  if (!outcome.available) {
    return outcome;
  }
  const packet = outcome.packet || {};
  const summary = packet.summary && typeof packet.summary === 'object' ? packet.summary : {};
  return {
    available: true,
    healthy: summary.healthy,
    status: summary.status,
    requirementsNeedingAttention: summary.attentionCount
  };
}

// Pure: summarize open PRs into counts by mergeable state, so an agent sees the
// in-flight work and what is ready vs blocked without re-deriving it.
function summarizeOpenWork(pullRequests) {
  const list = Array.isArray(pullRequests) ? pullRequests : [];
  const byState = {};
  for (const pr of list) {
    const state = (pr && typeof pr.mergeStateStatus === 'string' && pr.mergeStateStatus) || 'UNKNOWN';
    byState[state] = (byState[state] || 0) + 1;
  }
  return { openPullRequests: list.length, byMergeStateStatus: byState };
}

// Fetch open PRs via gh (fail-closed on auth, like the merge-queue domain) and
// summarize them. Part of the live GitHub precondition, not a local artifact.
function collectOpenWorkDomain(options, deps = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const pulls = runGhJson(
    ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,mergeStateStatus'],
    deps
  );
  return { available: true, ...summarizeOpenWork(pulls) };
}

// Build the full read-model packet. Fail-closed on auth propagates as a thrown
// RepoTruthAuthError from the gh-backed domains (merge-queue, open-work).
function buildRepoTruthPacket(options = {}, deps = {}) {
  const mergeQueue = collectMergeQueueDomain(options, deps);
  const openWork = collectOpenWorkDomain(options, deps);
  const coverage = collectCoverageDomain(deps);
  const requirementHealth = collectRequirementHealthDomain(deps);
  return {
    ...schemaEnvelopeFields(REPO_TRUTH_SCHEMA_ID, REPO_TRUTH_SCHEMA_VERSION),
    generatedAt: generatedAt(deps),
    repo: options.repo || DEFAULT_REPO,
    branch: options.branch || DEFAULT_BRANCH,
    domains: {
      mergeQueue,
      openWork,
      coverage,
      requirementHealth
    }
  };
}

const REPO_TRUTH_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: REPO_TRUTH_SCHEMA_ID,
  title: 'vi-history-suite repo-truth read-model',
  description: 'Machine-readable schemaVersion 1 repo-truth read-model from scripts/readRepoTruth.js.',
  type: 'object',
  required: ['$schema', 'schemaVersion', 'generatedAt', 'repo', 'branch', 'domains'],
  properties: {
    ...schemaEnvelopePropertyNodes(REPO_TRUTH_SCHEMA_ID, REPO_TRUTH_SCHEMA_VERSION),
    generatedAt: { type: 'string' },
    repo: { type: 'string' },
    branch: { type: 'string' },
    domains: {
      type: 'object',
      required: ['mergeQueue', 'openWork', 'coverage', 'requirementHealth'],
      properties: {
        mergeQueue: { type: 'object' },
        openWork: { type: 'object' },
        coverage: { type: 'object' },
        requirementHealth: { type: 'object' }
      }
    }
  }
});

function renderTextReport(packet) {
  const lines = [];
  lines.push(`Repo-truth read-model for ${packet.repo} @ ${packet.branch}`);
  const mq = packet.domains.mergeQueue.policy || { present: false };
  if (mq.present) {
    lines.push(
      `Merge queue: min-to-merge=${mq.minEntriesToMerge}; wait=${mq.minEntriesToMergeWaitMinutes}min; ` +
        `grouping=${mq.groupingStrategy}; method=${mq.mergeMethod}.`
    );
  } else {
    lines.push('Merge queue: no merge_queue rule configured on this branch.');
  }
  const ow = packet.domains.openWork;
  lines.push(
    ow.available
      ? `Open work: ${ow.openPullRequests} open PR(s); byState=${JSON.stringify(ow.byMergeStateStatus)}.`
      : `Open work: unavailable (${ow.reason}).`
  );
  const cov = packet.domains.coverage;
  lines.push(
    cov.available
      ? `Coverage: threshold=${cov.riskThreshold}; mappedBelowThreshold=${cov.mappedBelowThreshold}; zeroCoverageSupporting=${cov.zeroCoverageSupporting}.`
      : `Coverage: unavailable (${cov.reason}).`
  );
  const rh = packet.domains.requirementHealth;
  lines.push(
    rh.available
      ? `Requirement health: status=${rh.status}; healthy=${rh.healthy}; needingAttention=${rh.requirementsNeedingAttention}.`
      : `Requirement health: unavailable (${rh.reason}).`
  );
  return lines;
}

function renderMarkdownReport(packet) {
  const mq = packet.domains.mergeQueue.policy || { present: false };
  const rows = [
    `| Domain | Fact |`,
    `| --- | --- |`,
    `| Merge queue | ${mq.present ? `min-to-merge ${mq.minEntriesToMerge}, wait ${mq.minEntriesToMergeWaitMinutes}min, grouping ${mq.groupingStrategy}, method ${mq.mergeMethod}` : 'no merge_queue rule'} |`,
    `| Open work | ${packet.domains.openWork.available ? `${packet.domains.openWork.openPullRequests} open PR(s)` : `unavailable (${packet.domains.openWork.reason})`} |`,
    `| Coverage | ${packet.domains.coverage.available ? `threshold ${packet.domains.coverage.riskThreshold}, below ${packet.domains.coverage.mappedBelowThreshold}` : `unavailable (${packet.domains.coverage.reason})`} |`,
    `| Requirement health | ${packet.domains.requirementHealth.available ? `${packet.domains.requirementHealth.requirementsNeedingAttention} need attention (status ${packet.domains.requirementHealth.status})` : `unavailable (${packet.domains.requirementHealth.reason})`} |`
  ];
  return [`# Repo-truth read-model: ${packet.repo} @ ${packet.branch}`, '', ...rows];
}

function parseArgs(argv) {
  return parseSharedOutputArgs(argv, {
    valueFlags: { '--repo': 'repo', '--branch': 'branch' },
    defaults: { repo: DEFAULT_REPO, branch: DEFAULT_BRANCH }
  });
}

function run(argv, deps = {}) {
  const { options } = parseArgs(argv);
  const outputMode = outputModeForOptions(options);

  if (options.schema) {
    const provenance = options.includeProvenance
      ? buildProvenance(
          { cwd: process.cwd(), outputMode: 'schema', extra: { repo: options.repo }, argv },
          deps
        )
      : undefined;
    return {
      exitCode: 0,
      stdout: renderSchemaDocument(REPO_TRUTH_JSON_SCHEMA, provenance ? { provenance } : {})
    };
  }

  let packet;
  try {
    packet = buildRepoTruthPacket(options, deps);
  } catch (error) {
    if (error instanceof RepoTruthAuthError) {
      return {
        exitCode: 2,
        stderr:
          `repo-truth read-model failed closed: ${error.message}. ` +
          'This read-model requires a gh/live-GitHub token (run: gh auth login). ' +
          'It does not fall back to documented defaults.'
      };
    }
    return { exitCode: 1, stderr: `repo-truth read-model error: ${error instanceof Error ? error.message : String(error)}` };
  }

  const drift = collectSchemaEnvelopeDrift(packet, REPO_TRUTH_JSON_SCHEMA);
  if (drift.length > 0) {
    return { exitCode: 1, stderr: `repo-truth packet failed self-schema check: ${drift.join('; ')}` };
  }

  if (options.includeProvenance) {
    packet[SCHEMA_PROVENANCE_KEY] = buildProvenance(
      { cwd: process.cwd(), outputMode, extra: { repo: options.repo }, argv },
      deps
    );
  }

  if (outputMode === 'json') {
    return { exitCode: 0, stdout: JSON.stringify(packet, null, 2) };
  }
  if (outputMode === 'markdown') {
    const lines = renderMarkdownReport(packet);
    if (options.includeProvenance) {
      lines.push('', ...provenanceFooterLines(packet[SCHEMA_PROVENANCE_KEY], 'repo-truth'));
    }
    return { exitCode: 0, stdout: lines.join('\n') };
  }
  const lines = renderTextReport(packet);
  if (options.includeProvenance) {
    lines.push(...provenanceFooterLines(packet[SCHEMA_PROVENANCE_KEY], 'repo-truth'));
  }
  return { exitCode: 0, stdout: lines.join('\n') };
}

module.exports = {
  REPO_TRUTH_SCHEMA_ID,
  REPO_TRUTH_SCHEMA_VERSION,
  REPO_TRUTH_JSON_SCHEMA,
  MERGE_QUEUE_PARAMETER_KEYS,
  RepoTruthAuthError,
  isAuthFailureText,
  extractMergeQueuePolicy,
  collectMergeQueueDomain,
  summarizeOpenWork,
  collectOpenWorkDomain,
  collectCoverageDomain,
  collectRequirementHealthDomain,
  buildRepoTruthPacket,
  run
};

if (require.main === module) {
  const outcome = run(process.argv.slice(2));
  if (outcome.stdout) {
    process.stdout.write(`${outcome.stdout}\n`);
  }
  if (outcome.stderr) {
    process.stderr.write(`${outcome.stderr}\n`);
  }
  process.exit(outcome.exitCode || 0);
}
