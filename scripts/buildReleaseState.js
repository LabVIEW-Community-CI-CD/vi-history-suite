#!/usr/bin/env node

/*
 * Release state read-model (VHS-REQ-670).
 *
 * A Marketplace release is a multi-stage operation that crosses three trust
 * boundaries (agent-local git, the hosted merge queue + main, and the protected
 * publish environment). This read-only aggregator answers, from ground truth,
 * "where is release vX.Y.Z right now?" so an agent (or maintainer) can drive the
 * flow idempotently and resumably instead of re-deriving state by hand.
 *
 * Durable, ground-truth-derived stages (each reached is true | false | null,
 * where null means the signal could not be verified in this environment):
 *   - develop-ready  package.json version set and CHANGELOG has an [Unreleased]
 *                    section (structural readiness on develop).
 *   - tagged         a `vX.Y.Z` tag exists whose tree package.json equals the
 *                    target version.
 *   - on-main        the tag commit is reachable from origin/main.
 *   - published      the live Marketplace listing reports the target version
 *                    (injected `vsce show`; null when it cannot be queried).
 *   - backsynced     origin/main's tip package.json equals the target version
 *                    (the release delta has reached the release baseline).
 *
 * It also surfaces a `authority` posture. Publishing is a single authorized
 * principal that both dispatches the release and approves it; the safety control
 * is the protected `marketplace-release` environment, which enforces an explicit
 * manual-approval step before publish (it is NOT an independent second identity).
 * Authority is `complete` only when that manual-approval gate is enforced (the
 * environment has a required reviewer) AND a publish token is present; it
 * degrades to unverified (null) rather than false when a signal cannot be read
 * (e.g. an unauthorized `gh`).
 *
 * READ-MODEL contract: it never mutates any source. All git / gh / vsce process
 * boundaries are injected so the aggregator is deterministically unit-testable
 * without a network, a checkout, or the pinned publisher. `--strict` exits
 * nonzero when the packet status is not `ready`.
 *
 * Usage:
 *   node scripts/buildReleaseState.js [--json | --markdown | --schema] \
 *     [--strict] [--include-provenance] [--output <relative-path>]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope.js');
const {
  outputModeForOptions,
  parseSharedOutputArgs,
  buildProvenance,
  resolveOutputPath,
  writeOutput
} = require('./lib/outputContract.js');

const SCHEMA_ID = 'vi-history-suite/release-state@v1';
const SCHEMA_VERSION = 1;
const UNKNOWN_COMMIT = '<unknown>';

// Ordered stage identifiers, earliest to furthest.
const STAGE_ORDER = ['develop-ready', 'tagged', 'on-main', 'published', 'backsynced'];

// --- ground-truth readers (all injectable) ---

function getPackageVersion(cwd, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  try {
    return JSON.parse(readFile(path.join(cwd, 'package.json'))).version;
  } catch {
    return '0.0.0';
  }
}

function getGitCommit(cwd, deps = {}) {
  const runGit = deps.runGit ?? defaultRunGit(cwd);
  try {
    return runGit(['rev-parse', 'HEAD']).trim();
  } catch {
    return UNKNOWN_COMMIT;
  }
}

function changelogHasUnreleased(cwd, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  try {
    return /^##\s*\[Unreleased\]/m.test(readFile(path.join(cwd, 'CHANGELOG.md')));
  } catch {
    return false;
  }
}

// --- stage derivation (pure over injected signals) ---

function makeStage(id, reached, evidence, detail) {
  return { id, reached: reached === null ? null : reached === true, evidence: evidence ?? null, detail: detail ?? '' };
}

// Derive every stage from the injected signal bundle. Each signal getter returns
// its raw value or null when it cannot be determined in this environment.
function deriveStages(version, signals = {}) {
  const tag = `v${version}`;
  const stages = [];

  stages.push(
    makeStage(
      'develop-ready',
      signals.changelogHasUnreleased === true && Boolean(version) && version !== '0.0.0',
      `CHANGELOG [Unreleased]: ${signals.changelogHasUnreleased === true}`,
      'package.json version set and CHANGELOG has an [Unreleased] section.'
    )
  );

  const tagTreeVersion = signals.tagTreeVersion ?? null;
  stages.push(
    makeStage(
      'tagged',
      signals.tagExists === null ? null : signals.tagExists === true && tagTreeVersion === version,
      `tag ${tag} exists: ${signals.tagExists}; tree version: ${tagTreeVersion ?? 'n/a'}`,
      `A ${tag} tag exists whose tree package.json equals the target version.`
    )
  );

  stages.push(
    makeStage(
      'on-main',
      signals.tagReachableFromMain ?? null,
      `${tag} reachable from origin/main: ${signals.tagReachableFromMain ?? 'unverified'}`,
      'The tag commit is reachable from origin/main.'
    )
  );

  const publishedVersion = signals.marketplaceVersion ?? null;
  stages.push(
    makeStage(
      'published',
      publishedVersion === null ? null : publishedVersion === version,
      `Marketplace listing version: ${publishedVersion ?? 'unverified'}`,
      'The live Marketplace listing reports the target version.'
    )
  );

  // backsynced means the release delta has reached develop (the main->develop
  // back-sync completed), so it is derived from origin/develop's package version
  // — NOT origin/main's, which flips true the moment the release merges to main,
  // before the back-sync PR even exists.
  const developTipVersion = signals.developTipVersion ?? null;
  stages.push(
    makeStage(
      'backsynced',
      developTipVersion === null ? null : developTipVersion === version,
      `origin/develop tip version: ${developTipVersion ?? 'unverified'}`,
      'origin/develop tip package.json equals the target version (the back-sync reached develop).'
    )
  );

  return stages;
}

// Furthest stage reached === true, in STAGE_ORDER; undefined when none reached.
function furthestStage(stages) {
  let furthest;
  for (const id of STAGE_ORDER) {
    const stage = stages.find((s) => s.id === id);
    if (stage && stage.reached === true) {
      furthest = id;
    }
  }
  return furthest;
}

// A gap is a stage that is definitively NOT reached (false, not null) that sits
// before the furthest reached stage — i.e. state is internally inconsistent.
function stageGaps(stages) {
  const furthest = furthestStage(stages);
  if (!furthest) return [];
  const furthestIndex = STAGE_ORDER.indexOf(furthest);
  return stages
    .filter((s) => s.reached === false && STAGE_ORDER.indexOf(s.id) < furthestIndex)
    .map((s) => s.id);
}

// --- publish-authority posture ---

// Publishing is a single authorized principal that both dispatches and approves.
// The safety control is the protected environment's enforced manual-approval
// step (a required reviewer), NOT an independent second identity. `complete`
// only when that manual-approval gate is enforced AND a publish token is present.
// A null signal degrades to unverified: complete becomes null, never a false
// negative that would block a local advisory read.
function deriveReleaseAuthority(signals = {}) {
  const manualApprovalEnforced = signals.manualApprovalEnforced ?? null;
  const publishTokenPresent = signals.publishTokenPresent === true;
  const dispatcherActionsWrite = signals.dispatcherActionsWrite ?? null;

  let complete;
  if (manualApprovalEnforced === null) {
    complete = null;
  } else {
    complete = manualApprovalEnforced === true && publishTokenPresent === true;
  }

  return {
    model: 'gated-single-principal',
    manualApprovalEnforced,
    publishTokenPresent,
    dispatcherActionsWrite,
    complete,
    detail:
      complete === null
        ? 'Authority unverified in this environment (the marketplace-release approval gate could not be read).'
        : complete
          ? 'Publish authority intact: the marketplace-release environment enforces a manual-approval step and a publish token is present.'
          : 'Publish authority incomplete: an enforced marketplace-release approval gate and a publish token are both required.'
  };
}

// --- packet assembly ---

function buildReleaseState(inputs = {}, meta = {}) {
  const stages = inputs.stages ?? [];
  const authority = inputs.authority ?? deriveReleaseAuthority();
  const gaps = stageGaps(stages);
  // attention when authority is definitively incomplete OR there is a stage gap.
  const attention = authority.complete === false || gaps.length > 0;
  return {
    ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION),
    generatedAt: meta.generatedAt,
    version: meta.version,
    commit: meta.commit,
    stage: furthestStage(stages) ?? null,
    stages,
    stageGaps: gaps,
    authority,
    status: attention ? 'attention' : 'ready'
  };
}

// Gather the injected signals and assemble the packet. Real signal getters live
// in the deps so a caller in a workflow can supply live git/gh/vsce readers.
function collectReleaseState(cwd, options = {}, deps = {}) {
  const version = (deps.getPackageVersion ?? ((c) => getPackageVersion(c, deps)))(cwd);
  const signals = (deps.gatherSignals ?? gatherSignals)(cwd, version, deps);
  const stages = deriveStages(version, signals);
  const authority = deriveReleaseAuthority(signals);
  return buildReleaseState(
    { stages, authority },
    {
      generatedAt:
        typeof deps.now === 'function' ? new Date(deps.now()).toISOString() : new Date().toISOString(),
      version,
      commit: (deps.getGitCommit ?? ((c) => getGitCommit(c, deps)))(cwd)
    }
  );
}

// Default signal collection from live git/gh/vsce, each guarded so any failure
// degrades to null (unverified) rather than a false negative. Injected wholesale
// in unit tests via deps.gatherSignals.
function gatherSignals(cwd, version, deps = {}) {
  const runGit = deps.runGit ?? defaultRunGit(cwd);
  const tag = `v${version}`;
  // The release baseline ref. Defaults to origin/main (correct in a hosted CI
  // checkout where origin is the canonical remote); override for a fork clone
  // where the canonical remote is not origin (e.g. VIHS_RELEASE_MAIN_REF).
  const mainRef = deps.mainRef ?? (deps.env ?? process.env).VIHS_RELEASE_MAIN_REF ?? 'origin/main';
  // The develop integration ref (back-sync target). Same override rationale.
  const developRef =
    deps.developRef ?? (deps.env ?? process.env).VIHS_RELEASE_DEVELOP_REF ?? 'origin/develop';

  const tagExists = safe(() => {
    try {
      runGit(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
      return true;
    } catch {
      return false;
    }
  });

  const tagTreeVersion = safe(() => {
    if (tagExists !== true) return null;
    const raw = runGit(['show', `${tag}:package.json`]);
    return JSON.parse(raw).version;
  });

  const tagReachableFromMain = safe(() => {
    if (tagExists !== true) return null;
    try {
      runGit(['merge-base', '--is-ancestor', tag, mainRef]);
      return true;
    } catch {
      return false;
    }
  });

  const developTipVersion = safe(() => {
    const raw = runGit(['show', `${developRef}:package.json`]);
    return JSON.parse(raw).version;
  });

  const marketplaceVersion = safe(() =>
    (deps.queryMarketplaceVersion ?? (() => defaultQueryMarketplaceVersion(cwd, deps)))()
  );

  const manualApprovalEnforced = safe(() =>
    (deps.queryEnvironmentReviewerConfigured ?? (() => defaultQueryEnvironmentReviewerConfigured(deps)))()
  );
  const dispatcherActionsWrite =
    typeof deps.queryDispatcherActionsWrite === 'function'
      ? safe(() => deps.queryDispatcherActionsWrite())
      : null;
  const publishTokenPresent = Boolean((deps.env ?? process.env).VSCE_PAT);

  return {
    changelogHasUnreleased: changelogHasUnreleased(cwd, deps),
    tagExists,
    tagTreeVersion,
    tagReachableFromMain,
    developTipVersion,
    marketplaceVersion,
    manualApprovalEnforced,
    dispatcherActionsWrite,
    publishTokenPresent
  };
}

// Run a getter, returning null on any thrown error (unverified signal).
function safe(getter) {
  try {
    const value = getter();
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

// Default git runner: execFileSync scoped to cwd. Never throws to the caller of
// the readers above; those wrap it in try/catch and downgrade to unverified.
function defaultRunGit(cwd) {
  return (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

// Default environment-reviewer reader: asks `gh` whether the protected
// marketplace-release environment enforces a required-reviewers manual-approval
// step (at least one reviewer). Returns null (unverified) when the repo slug or
// an authorized `gh` is unavailable, so a local advisory read never produces a
// false negative; the authoritative check runs in the workflow.
function defaultQueryEnvironmentReviewerConfigured(deps = {}) {
  const repo = (deps.env ?? process.env).GITHUB_REPOSITORY;
  if (!repo) return null;
  const runGh =
    deps.runGh ??
    ((args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  const env = JSON.parse(runGh(['api', `repos/${repo}/environments/marketplace-release`]));
  const rules = Array.isArray(env.protection_rules) ? env.protection_rules : [];
  const reviewerRule = rules.find((rule) => rule && rule.type === 'required_reviewers');
  return Boolean(reviewerRule && Array.isArray(reviewerRule.reviewers) && reviewerRule.reviewers.length > 0);
}

// Default live-Marketplace version reader: runs the pinned `vsce show <id>
// --json` and returns the latest published version string. Returns null
// (unverified) when the publisher is absent, `vsce` is unavailable, or the
// invocation fails — so `published` degrades to unverified rather than a false
// negative offline; a real published release is observed where `vsce` can run.
function defaultQueryMarketplaceVersion(cwd, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const pkg = JSON.parse(readFile(path.join(cwd, 'package.json')));
  const extensionId =
    (deps.env ?? process.env).EXTENSION_ID ||
    (pkg.publisher && pkg.name ? `${pkg.publisher}.${pkg.name}` : null);
  if (!extensionId) return null;
  const { buildPinnedVsceInvocation } = deps.pinnedVsceModule ?? require('./runPinnedVsce.js');
  const invocation = buildPinnedVsceInvocation(['show', extensionId, '--json'], { cwd });
  const runVsce =
    deps.runVsce ??
    ((command, args) =>
      execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  const payload = JSON.parse(runVsce(invocation.command, invocation.args));
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  const latest = versions.find((v) => v && typeof v.version === 'string');
  return latest ? latest.version : null;
}

// --- rendering ---

function reachedLabel(reached) {
  return reached === null ? 'unverified' : reached ? 'reached' : 'NOT reached';
}

function provenanceTextLines(provenance) {
  if (!provenance) return [];
  return [
    `[release-state] provenance generatedAt: ${provenance.generatedAt}`,
    `[release-state] provenance cwd: ${provenance.cwd}`,
    `[release-state] provenance outputMode: ${provenance.outputMode}`,
    `[release-state] provenance strict: ${provenance.strict}`,
    `[release-state] provenance argv: ${JSON.stringify(provenance.argv)}`
  ];
}

function renderSummary(state, provenance) {
  const lines = [];
  lines.push('[release-state] Release state read-model (read-only).');
  lines.push(`[release-state] Release: ${state.version} (${state.commit})`);
  lines.push(`[release-state] Furthest stage: ${state.stage ?? '<none>'}`);
  for (const stage of state.stages) {
    lines.push(`[release-state] ${stage.id}: ${reachedLabel(stage.reached)} — ${stage.evidence}`);
  }
  lines.push(`[release-state] Authority: ${state.authority.complete === null ? 'unverified' : state.authority.complete ? 'complete' : 'INCOMPLETE'} — ${state.authority.detail}`);
  if (state.stageGaps.length > 0) {
    lines.push(`[release-state] Stage gaps: ${state.stageGaps.join(', ')}`);
  }
  lines.push(`[release-state] Status: ${state.status}`);
  lines.push(...provenanceTextLines(provenance));
  return `${lines.join('\n')}\n`;
}

function markdownCell(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function provenanceMarkdownLines(provenance) {
  if (!provenance) return [];
  return [
    '## Provenance',
    '',
    `- Generated: \`${markdownCell(provenance.generatedAt)}\``,
    `- Cwd: \`${markdownCell(provenance.cwd)}\``,
    `- Output: \`${markdownCell(provenance.outputMode)}\``,
    `- Strict: \`${markdownCell(String(provenance.strict))}\``,
    `- Argv: \`${markdownCell(JSON.stringify(provenance.argv))}\``,
    ''
  ];
}

function renderMarkdown(state, provenance) {
  const lines = [];
  lines.push('# Release State');
  lines.push('');
  lines.push(`- Release: \`${markdownCell(state.version)}\` (\`${markdownCell(state.commit)}\`)`);
  lines.push(`- Furthest stage: \`${markdownCell(state.stage ?? '<none>')}\``);
  lines.push(`- Status: \`${markdownCell(state.status)}\``);
  lines.push('');
  lines.push('## Stages');
  lines.push('');
  lines.push('| Stage | Reached | Evidence |');
  lines.push('| --- | --- | --- |');
  for (const stage of state.stages) {
    lines.push(`| ${markdownCell(stage.id)} | ${markdownCell(reachedLabel(stage.reached))} | ${markdownCell(stage.evidence)} |`);
  }
  lines.push('');
  lines.push('## Authority');
  lines.push('');
  lines.push(`- Model: \`${markdownCell(state.authority.model)}\``);
  lines.push(`- Complete: \`${markdownCell(String(state.authority.complete))}\``);
  lines.push(`- ${markdownCell(state.authority.detail)}`);
  lines.push('');
  lines.push(...provenanceMarkdownLines(provenance));
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

// --- JSON Schema ---

const RELEASE_STATE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SCHEMA_ID,
  title: 'vi-history-suite release state',
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema',
    'schemaVersion',
    'generatedAt',
    'version',
    'commit',
    'stage',
    'stages',
    'stageGaps',
    'authority',
    'status'
  ],
  properties: {
    ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION),
    generatedAt: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
    stage: { type: ['string', 'null'], enum: [...STAGE_ORDER, null] },
    stages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reached', 'evidence', 'detail'],
        properties: {
          id: { enum: STAGE_ORDER },
          reached: { type: ['boolean', 'null'] },
          evidence: { type: ['string', 'null'] },
          detail: { type: 'string' }
        }
      }
    },
    stageGaps: { type: 'array', items: { enum: STAGE_ORDER } },
    authority: {
      type: 'object',
      additionalProperties: false,
      required: [
        'model',
        'manualApprovalEnforced',
        'publishTokenPresent',
        'dispatcherActionsWrite',
        'complete',
        'detail'
      ],
      properties: {
        model: { const: 'gated-single-principal' },
        manualApprovalEnforced: { type: ['boolean', 'null'] },
        publishTokenPresent: { type: 'boolean' },
        dispatcherActionsWrite: { type: ['boolean', 'null'] },
        complete: { type: ['boolean', 'null'] },
        detail: { type: 'string' }
      }
    },
    status: { enum: ['ready', 'attention'] },
    provenance: {
      type: 'object',
      required: ['generatedAt', 'cwd', 'outputMode', 'strict', 'argv'],
      properties: {
        generatedAt: { type: 'string' },
        cwd: { type: 'string' },
        outputMode: { enum: ['text', 'json', 'markdown', 'schema'] },
        strict: { type: 'boolean' },
        argv: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(RELEASE_STATE_JSON_SCHEMA, options);
}

// --- CLI ---

function parseArgs(argv = []) {
  const { options } = parseSharedOutputArgs(argv, {
    defaults: {
      json: false,
      markdown: false,
      schema: false,
      strict: false,
      includeProvenance: false,
      outputPath: undefined
    }
  });
  return options;
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const cwd = deps.cwd || process.cwd();
  const outputMode = outputModeForOptions(options);
  const provenance = options.includeProvenance
    ? buildProvenance({ cwd, outputMode, strict: options.strict, argv }, deps)
    : undefined;

  if (options.schema) {
    const rendered = renderSchema({ provenance });
    writeOutput(rendered, { outputPath: options.outputPath, cwd, stdout, deps, label: 'release-state' });
    return 0;
  }

  const state = collectReleaseState(cwd, options, deps);
  const stateWithProvenance = provenance ? { ...state, provenance } : state;
  const rendered = options.json
    ? JSON.stringify(stateWithProvenance, null, 2)
    : options.markdown
      ? renderMarkdown(state, provenance)
      : renderSummary(state, provenance);
  writeOutput(rendered, { outputPath: options.outputPath, cwd, stdout, deps, label: 'release-state' });
  if (options.strict && state.status !== 'ready') {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SCHEMA_ID,
  SCHEMA_VERSION,
  STAGE_ORDER,
  getPackageVersion,
  getGitCommit,
  changelogHasUnreleased,
  makeStage,
  deriveStages,
  furthestStage,
  stageGaps,
  deriveReleaseAuthority,
  buildReleaseState,
  collectReleaseState,
  gatherSignals,
  defaultQueryEnvironmentReviewerConfigured,
  defaultQueryMarketplaceVersion,
  RELEASE_STATE_JSON_SCHEMA,
  renderSchema,
  renderSummary,
  renderMarkdown,
  markdownCell,
  parseArgs,
  resolveOutputPath,
  main
};
