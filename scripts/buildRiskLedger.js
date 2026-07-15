#!/usr/bin/env node

/**
 * Ranked risk ledger aggregator (advisory; VHS-REQ-601).
 *
 * The autonomous improvement loop needs an evidence-driven way to choose the
 * next-highest-value work instead of picking targets ad hoc. This aggregator
 * ingests the objective risk signals the repo already emits and ranks them into
 * a single ledger with one `nextTarget`:
 *   - coverage:           generateCoverageMap() (mapCoverageToTraceability.js)
 *   - requirement health: verifyRequirementsHealth() (verifyRequirementsHealth.js)
 *   - standards:          audit-summary.json from `npm run standards:audit`
 *                         (OPTIONAL; graceful-degrade when absent — no Docker here)
 *
 * Decision B: the ledger only SELECTS work that is fully executable and
 * verifiable on a Linux host. Platform-proof risk (Windows host-native /
 * windows-container comparison runtime, tracked by the recurring per-release
 * Windows validation, issue #1316) is a DECLARED, non-selectable "parked"
 * awareness list — it is ranked and reported but never chosen as `nextTarget`.
 *
 * Advisory by default (exit 0). `--strict` exits non-zero only when a selectable
 * CRITICAL/HIGH risk exists. Pure helpers stay separate from a thin CLI so the
 * scoring/ranking is unit-testable with injected fixtures; only Node built-ins
 * plus sibling report modules are used, so no dependency install is required.
 *
 * NOTE (Phase 1 seed): the requirements-drift dimension (diffing the shipped
 * requirements-manifest.json against a baseline) is intentionally NOT included
 * here; it lands in a follow-up once the manifest has shipped at least once.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const RISK_LEDGER_SCHEMA_ID =
  'https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/requirements/risk-ledger.schema.json';
const RISK_LEDGER_SCHEMA_PROVENANCE_KEY = 'x-vi-history-suite-provenance';
const UNKNOWN_COMMIT = '<unknown>';

const SEVERITY_TIERS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const TIER_BASE_SCORE = { CRITICAL: 1000, HIGH: 800, MEDIUM: 500, LOW: 200, INFO: 50 };

// Deterministic tie-break ordering when two entries share a severity score.
const DIMENSIONS = [
  'verification',
  'requirement-quality',
  'coverage',
  'requirements-drift',
  'platform-proof'
];
const DIMENSION_ORDER = new Map(DIMENSIONS.map((dimension, index) => [dimension, index]));

// Declared platform-proof awareness list (decision B): highest real risk but not
// selectable on a Linux host. Windows comparison-runtime correctness is not a
// one-time close — it must be RE-VALIDATED on a Windows host every release (the
// last sweep at 1.33.2 in #1316 found and fixed a real cold-launch defect,
// #1322/#1323). Sourced to the recurring tracking issue, never fabricated.
const PLATFORM_PROOF_RISKS = [
  {
    id: 'platform-proof/windows-host-native',
    title: 'Windows host-native comparison runtime needs per-release re-validation',
    requirementIds: ['VHS-REQ-634'],
    provenance: 'issue:#1316',
    suggestedAction:
      'Re-validate on a Windows host with native LabVIEW for the current build (see #1316 runbook); triage results.'
  },
  {
    id: 'platform-proof/windows-container',
    title: 'Windows-container comparison runtime needs per-release re-validation',
    requirementIds: ['VHS-REQ-622'],
    provenance: 'issue:#1316',
    suggestedAction:
      'Re-validate the windows-container comparison on a Windows host with Docker Desktop (Windows containers) for the current build; triage results.'
  }
];

function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return UNKNOWN_COMMIT;
  }
}

function getPackageVersion(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

function clampSubScore(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(99, Math.round(value));
}

// Build a normalized ledger entry. subScore (0..99) ranks entries within a tier
// so higher-magnitude evidence (e.g. larger coverage debt) sorts first.
function makeEntry(fields) {
  const tier = fields.severityTier;
  const subScore = clampSubScore(fields.subScore ?? 0);
  const selectable = fields.selectable !== false && fields.dimension !== 'platform-proof';
  const linuxExecutable = fields.linuxExecutable !== false && fields.dimension !== 'platform-proof';
  return {
    id: fields.id,
    dimension: fields.dimension,
    severityTier: tier,
    severityScore: (TIER_BASE_SCORE[tier] ?? 0) + subScore,
    requirementIds: fields.requirementIds ?? [],
    title: fields.title,
    evidence: { source: fields.source, provenance: fields.provenance ?? '' },
    linuxExecutable,
    selectable,
    suggestedAction: fields.suggestedAction ?? ''
  };
}

// verification dimension: from verifyRequirementsHealth() result shape.
// coverage-risk reasons are intentionally NOT emitted here — the coverage
// dimension owns them (dedup).
function buildVerificationEntries(health) {
  if (!health) {
    return [];
  }
  const entries = [];
  if (health.integrity && health.integrity.success === false) {
    entries.push(
      makeEntry({
        id: 'verification/structural-integrity',
        dimension: 'verification',
        severityTier: 'CRITICAL',
        title: `Requirements structural integrity failing (${health.integrity.violationCount ?? 'unknown'} violation(s))`,
        source: 'requirements-verify',
        provenance: 'integrity.success=false',
        suggestedAction: 'Run npm run requirements:integrity and resolve the reported violations.'
      })
    );
  }
  for (const requirement of health.attention ?? []) {
    for (const reason of requirement.attentionReasons ?? []) {
      if (reason.reasonId === 'unlinked') {
        entries.push(
          makeEntry({
            id: `verification/unlinked/${requirement.reqId}`,
            dimension: 'verification',
            severityTier: 'HIGH',
            requirementIds: [requirement.reqId],
            title: `${requirement.reqId} has no verification test citing its ID`,
            source: 'requirements-verify',
            provenance: 'attentionReason:unlinked',
            suggestedAction: `Add or annotate a test that cites ${requirement.reqId}.`
          })
        );
      } else if (reason.reasonId === 'uncited-criteria') {
        const count = reason.count ?? requirement.criteriaUncited ?? 0;
        entries.push(
          makeEntry({
            id: `verification/uncited-criteria/${requirement.reqId}`,
            dimension: 'verification',
            severityTier: 'MEDIUM',
            subScore: count,
            requirementIds: [requirement.reqId],
            title: `${requirement.reqId} has ${count} acceptance criterion(s) not cited at criterion level`,
            source: 'requirements-verify',
            provenance: 'attentionReason:uncited-criteria',
            suggestedAction: `Cite the missing VHS-REQ-NNN.M ids in ${requirement.reqId}'s verification tests.`
          })
        );
      }
    }
  }
  return entries;
}

// coverage dimension: mapped-below-threshold (HIGH), zero-coverage supporting
// (MEDIUM), and requirement-level coverage debt (MEDIUM, ranked by magnitude).
function buildCoverageEntries(coverageMap, options = {}) {
  if (!coverageMap) {
    return [];
  }
  const maxDebtEntries = options.maxCoverageDebtEntries ?? 10;
  const entries = [];

  for (const file of coverageMap.mappedBelowThreshold ?? []) {
    entries.push(
      makeEntry({
        id: `coverage/mapped-below/${file.path}`,
        dimension: 'coverage',
        severityTier: 'HIGH',
        requirementIds: file.requirementIds ?? [],
        title: `${file.path} is requirement-mapped but below the ${coverageMap.riskThreshold}% coverage risk threshold`,
        source: 'coverage-map',
        provenance: 'mappedBelowThreshold',
        suggestedAction: `Add tests for ${file.path} or reclassify it if it is not requirement-critical.`
      })
    );
  }

  for (const file of coverageMap.zeroCoverageSupportingRequirements ?? []) {
    entries.push(
      makeEntry({
        id: `coverage/zero-supporting/${file.path}`,
        dimension: 'coverage',
        severityTier: 'MEDIUM',
        requirementIds: file.requirementIds ?? [],
        title: `${file.path} is a requirement-supporting file with zero coverage`,
        source: 'coverage-map',
        provenance: 'zeroCoverageSupportingRequirements',
        suggestedAction: `Add a first test for ${file.path} or reclassify it.`
      })
    );
  }

  const byRequirement = [...(coverageMap.byRequirement ?? [])];
  const debtOf = (row) =>
    (row.missingLines ?? 0) + (row.missingBranches ?? 0) + (row.missingFunctions ?? 0);
  byRequirement.sort((left, right) => debtOf(right) - debtOf(left) || left.reqId.localeCompare(right.reqId, 'en'));
  const maxDebt = byRequirement.length > 0 ? debtOf(byRequirement[0]) : 0;
  for (const row of byRequirement.slice(0, maxDebtEntries)) {
    const debt = debtOf(row);
    if (debt <= 0) {
      continue;
    }
    entries.push(
      makeEntry({
        id: `coverage/debt/${row.reqId}`,
        dimension: 'coverage',
        severityTier: 'MEDIUM',
        subScore: maxDebt > 0 ? (99 * debt) / maxDebt : 0,
        requirementIds: [row.reqId],
        title: `${row.reqId} carries ${debt} uncovered line/branch/function unit(s) across ${row.fileCount} file(s)`,
        source: 'coverage-map',
        provenance: 'byRequirement',
        suggestedAction: `Add behavioral tests for ${row.reqId}'s highest-debt files: ${(row.files ?? []).slice(0, 3).join(', ')}.`
      })
    );
  }

  return entries;
}

// requirement-quality dimension: OPTIONAL standards audit-summary.json. Parsed
// defensively — only fields that exist are used; an unrecognized summary yields
// zero entries rather than throwing.
function buildStandardsEntries(standardsSummary) {
  if (!standardsSummary || typeof standardsSummary !== 'object') {
    return [];
  }
  const entries = [];

  for (const check of standardsSummary.directChecks ?? []) {
    const quality = check.requirementsQuality ?? check.summary ?? {};
    const findingCount = quality.findingCount ?? quality.findings ?? 0;
    const ok = quality.ok !== false && findingCount === 0;
    if (!ok) {
      const name = check.name ?? check.check ?? 'direct-check';
      entries.push(
        makeEntry({
          id: `standards/requirements-quality/${name}`,
          dimension: 'requirement-quality',
          severityTier: 'HIGH',
          subScore: findingCount,
          title: `Standards direct check "${name}" reported ${findingCount} finding(s)`,
          source: 'standards-audit',
          provenance: 'directChecks',
          suggestedAction: `Review the ${name} standards findings against the packaged requirement surface.`
        })
      );
    }
  }

  for (const profile of standardsSummary.profiles ?? []) {
    const status = String(profile.status ?? profile.scorecard ?? '').toUpperCase();
    if (status === 'FAIL') {
      const name = profile.profile ?? profile.name ?? 'profile';
      entries.push(
        makeEntry({
          id: `standards/gate/${name}`,
          dimension: 'requirement-quality',
          severityTier: 'HIGH',
          title: `Standards gate profile "${name}" scored FAIL`,
          source: 'standards-audit',
          provenance: 'profiles',
          suggestedAction: `Address the failing "${name}" standards gate before release.`
        })
      );
    }
  }

  for (const gate of standardsSummary.standardsGateDetailSummary ?? []) {
    const status = String(gate.status ?? '').toUpperCase();
    const missingProof = Array.isArray(gate.missingProof) ? gate.missingProof : [];
    if (status !== 'PASS' || missingProof.length > 0) {
      const name = gate.gate ?? 'gate';
      entries.push(
        makeEntry({
          id: `standards/gate-detail/${name}`,
          dimension: 'requirement-quality',
          severityTier: 'MEDIUM',
          subScore: missingProof.length,
          title: `Standards gate "${name}" is ${status || 'unmapped'}${missingProof.length ? ` with ${missingProof.length} missing-proof item(s)` : ''}`,
          source: 'standards-audit',
          provenance: 'standardsGateDetailSummary',
          suggestedAction: `Supply the missing proof or confirm the "${name}" gate basis.`
        })
      );
    }
  }

  return entries;
}

function buildPlatformProofEntries() {
  return PLATFORM_PROOF_RISKS.map((risk) =>
    makeEntry({
      id: risk.id,
      dimension: 'platform-proof',
      severityTier: 'HIGH',
      requirementIds: risk.requirementIds,
      title: risk.title,
      source: 'declared-platform-proof',
      provenance: risk.provenance,
      suggestedAction: risk.suggestedAction
    })
  );
}

function compareEntries(left, right) {
  if (right.severityScore !== left.severityScore) {
    return right.severityScore - left.severityScore;
  }
  const leftOrder = DIMENSION_ORDER.get(left.dimension) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = DIMENSION_ORDER.get(right.dimension) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.id.localeCompare(right.id, 'en');
}

function isSelectable(entry) {
  return entry.selectable && entry.linuxExecutable && entry.dimension !== 'platform-proof';
}

function tallyBy(entries, key) {
  const counts = {};
  for (const entry of entries) {
    const value = entry[key];
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

// Pure ledger builder over already-loaded signals. `signals` carries
// availability + the loaded objects so graceful-degrade is explicit in output.
function buildRiskLedger(signals = {}, meta = {}) {
  const options = { maxCoverageDebtEntries: meta.maxCoverageDebtEntries ?? 10 };
  const entries = [
    ...buildVerificationEntries(signals.requirements?.available ? signals.requirements.health : undefined),
    ...buildCoverageEntries(signals.coverage?.available ? signals.coverage.map : undefined, options),
    ...buildStandardsEntries(signals.standards?.available ? signals.standards.summary : undefined),
    ...buildPlatformProofEntries()
  ];
  entries.sort(compareEntries);

  const selectable = entries.filter(isSelectable);
  const parked = entries.filter((entry) => !isSelectable(entry));

  const inputs = {
    coverage: { available: Boolean(signals.coverage?.available), source: signals.coverage?.source ?? null },
    requirements: {
      available: Boolean(signals.requirements?.available),
      source: signals.requirements?.source ?? null
    },
    standards: { available: Boolean(signals.standards?.available), source: signals.standards?.source ?? null }
  };

  return {
    $schema: RISK_LEDGER_SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: meta.generatedAt,
    extensionVersion: meta.extensionVersion,
    extensionCommit: meta.extensionCommit,
    inputs,
    entries,
    ranking: {
      nextTarget: selectable.length > 0 ? selectable[0].id : null,
      selectable: selectable.map((entry) => entry.id),
      parked: parked.map((entry) => entry.id)
    },
    countsByDimension: tallyBy(entries, 'dimension'),
    countsByTier: tallyBy(entries, 'severityTier')
  };
}

function hasSelectableHighRisk(ledger) {
  return ledger.entries.some(
    (entry) => isSelectable(entry) && (entry.severityTier === 'CRITICAL' || entry.severityTier === 'HIGH')
  );
}

// ---- signal loading (file inputs or in-process generators; graceful-degrade) ----

function loadCoverageSignal(cwd, deps = {}) {
  if (deps.coverageJsonPath) {
    try {
      const raw = (deps.readFile ?? defaultReadFile(cwd))(deps.coverageJsonPath);
      return { available: true, map: JSON.parse(raw), source: deps.coverageJsonPath };
    } catch (error) {
      return { available: false, source: deps.coverageJsonPath, error: String(error && error.message) };
    }
  }
  try {
    const generateCoverageMap = deps.generateCoverageMap ?? require('./mapCoverageToTraceability.js').generateCoverageMap;
    return { available: true, map: generateCoverageMap({ repoRoot: cwd }), source: 'in-process:coverage-map' };
  } catch (error) {
    return { available: false, source: 'in-process:coverage-map', error: String(error && error.message) };
  }
}

function loadRequirementsSignal(cwd, deps = {}) {
  if (deps.requirementsJsonPath) {
    try {
      const raw = (deps.readFile ?? defaultReadFile(cwd))(deps.requirementsJsonPath);
      return { available: true, health: JSON.parse(raw), source: deps.requirementsJsonPath };
    } catch (error) {
      return { available: false, source: deps.requirementsJsonPath, error: String(error && error.message) };
    }
  }
  try {
    const verifyRequirementsHealth =
      deps.verifyRequirementsHealth ?? require('./verifyRequirementsHealth.js').verifyRequirementsHealth;
    return { available: true, health: verifyRequirementsHealth(cwd, {}), source: 'in-process:requirements-verify' };
  } catch (error) {
    return { available: false, source: 'in-process:requirements-verify', error: String(error && error.message) };
  }
}

function loadStandardsSignal(cwd, deps = {}) {
  const explicitPath = deps.standardsSummaryPath;
  if (!explicitPath) {
    return { available: false, source: null };
  }
  try {
    const raw = (deps.readFile ?? defaultReadFile(cwd))(explicitPath);
    return { available: true, summary: JSON.parse(raw), source: explicitPath };
  } catch (error) {
    return { available: false, source: explicitPath, error: String(error && error.message) };
  }
}

function defaultReadFile(cwd) {
  return (relativePath) => fs.readFileSync(path.isAbsolute(relativePath) ? relativePath : path.join(cwd, relativePath), 'utf8');
}

// ---- rendering ----

function renderSummary(ledger) {
  const lines = [];
  lines.push('[risk-ledger] Ranked risk ledger (advisory single-pane report).');
  lines.push(
    `[risk-ledger] Inputs: coverage=${ledger.inputs.coverage.available ? 'ok' : 'unavailable'}, ` +
      `requirements=${ledger.inputs.requirements.available ? 'ok' : 'unavailable'}, ` +
      `standards=${ledger.inputs.standards.available ? 'ok' : 'unavailable'}.`
  );
  lines.push(`[risk-ledger] Entries: ${ledger.entries.length} (selectable ${ledger.ranking.selectable.length}, parked ${ledger.ranking.parked.length}).`);
  const tierParts = SEVERITY_TIERS.filter((tier) => ledger.countsByTier[tier]).map(
    (tier) => `${tier}=${ledger.countsByTier[tier]}`
  );
  lines.push(`[risk-ledger] By tier: ${tierParts.join(', ') || 'none'}.`);
  if (ledger.ranking.nextTarget) {
    const target = ledger.entries.find((entry) => entry.id === ledger.ranking.nextTarget);
    lines.push(`[risk-ledger] Next target: ${target.id} [${target.severityTier}] — ${target.title}`);
    lines.push(`[risk-ledger]   Suggested action: ${target.suggestedAction}`);
  } else {
    lines.push('[risk-ledger] Next target: none (no selectable Linux-executable risk).');
  }
  if (ledger.ranking.parked.length > 0) {
    lines.push(`[risk-ledger] Parked (not auto-selectable): ${ledger.ranking.parked.join(', ')}.`);
  }
  lines.push('[risk-ledger] Advisory report; use --strict to fail on a selectable CRITICAL/HIGH risk.');
  return lines.join('\n');
}

function renderMarkdown(ledger) {
  const lines = [];
  lines.push('# Risk Ledger');
  lines.push('');
  lines.push(`- Extension version: \`${ledger.extensionVersion}\``);
  lines.push(`- Generated at: ${ledger.generatedAt}`);
  lines.push(
    `- Inputs: coverage=${ledger.inputs.coverage.available ? 'ok' : 'unavailable'}, ` +
      `requirements=${ledger.inputs.requirements.available ? 'ok' : 'unavailable'}, ` +
      `standards=${ledger.inputs.standards.available ? 'ok' : 'unavailable'}`
  );
  lines.push(`- Next target: ${ledger.ranking.nextTarget ? `\`${ledger.ranking.nextTarget}\`` : 'none'}`);
  lines.push('');
  lines.push('| Rank | ID | Dimension | Tier | Score | Selectable | Title |');
  lines.push('| ---: | --- | --- | --- | ---: | :---: | --- |');
  ledger.entries.forEach((entry, index) => {
    const title = entry.title.replace(/\|/g, '\\|');
    lines.push(
      `| ${index + 1} | \`${entry.id}\` | ${entry.dimension} | ${entry.severityTier} | ${entry.severityScore} | ${entry.selectable ? 'yes' : 'no'} | ${title} |`
    );
  });
  lines.push('');
  return lines.join('\n');
}

const RISK_LEDGER_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: RISK_LEDGER_SCHEMA_ID,
  title: 'vi-history-suite risk ledger',
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema',
    'schemaVersion',
    'generatedAt',
    'extensionVersion',
    'extensionCommit',
    'inputs',
    'entries',
    'ranking',
    'countsByDimension',
    'countsByTier'
  ],
  properties: {
    $schema: { const: RISK_LEDGER_SCHEMA_ID },
    schemaVersion: { const: SCHEMA_VERSION },
    generatedAt: { type: 'string' },
    extensionVersion: { type: 'string' },
    extensionCommit: { type: 'string' },
    inputs: { type: 'object' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'dimension',
          'severityTier',
          'severityScore',
          'requirementIds',
          'title',
          'evidence',
          'linuxExecutable',
          'selectable',
          'suggestedAction'
        ],
        properties: {
          id: { type: 'string' },
          dimension: { enum: DIMENSIONS },
          severityTier: { enum: SEVERITY_TIERS },
          severityScore: { type: 'number' },
          requirementIds: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          evidence: { type: 'object' },
          linuxExecutable: { type: 'boolean' },
          selectable: { type: 'boolean' },
          suggestedAction: { type: 'string' }
        }
      }
    },
    ranking: {
      type: 'object',
      additionalProperties: false,
      required: ['nextTarget', 'selectable', 'parked'],
      properties: {
        nextTarget: { type: ['string', 'null'] },
        selectable: { type: 'array', items: { type: 'string' } },
        parked: { type: 'array', items: { type: 'string' } }
      }
    },
    countsByDimension: { type: 'object' },
    countsByTier: { type: 'object' }
  }
};

function renderSchema(options = {}) {
  const schema = options.provenance
    ? { ...RISK_LEDGER_JSON_SCHEMA, [RISK_LEDGER_SCHEMA_PROVENANCE_KEY]: options.provenance }
    : RISK_LEDGER_JSON_SCHEMA;
  return JSON.stringify(schema, null, 2);
}

// ---- CLI ----

function parseArgs(argv = []) {
  const options = {
    json: false,
    markdown: false,
    schema: false,
    strict: false,
    includeProvenance: false,
    outputPath: undefined,
    coverageJsonPath: undefined,
    requirementsJsonPath: undefined,
    standardsSummaryPath: undefined,
    maxCoverageDebtEntries: 10,
    positionals: []
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
    if (arg === '--json') options.json = true;
    else if (arg === '--markdown') options.markdown = true;
    else if (arg === '--schema') options.schema = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--include-provenance') options.includeProvenance = true;
    else if (arg === '--output') options.outputPath = next();
    else if (arg === '--coverage-json') options.coverageJsonPath = next();
    else if (arg === '--requirements-json') options.requirementsJsonPath = next();
    else if (arg === '--standards-summary') options.standardsSummaryPath = next();
    else if (arg === '--max-coverage-debt-entries') options.maxCoverageDebtEntries = Number(next());
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else options.positionals.push(arg);
  }
  if ([options.json, options.markdown, options.schema].filter(Boolean).length > 1) {
    throw new Error('Use only one output mode: --json, --markdown, or --schema');
  }
  return options;
}

function outputModeForOptions(options = {}) {
  if (options.schema) return 'schema';
  if (options.markdown) return 'markdown';
  return options.json ? 'json' : 'text';
}

// Reject empty, absolute, or parent-escaping output paths (write inside cwd only).
function resolveOutputPath(cwd, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new Error('--output requires a non-empty relative path');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('--output must be a relative path inside the working directory');
  }
  const resolved = path.resolve(cwd, relativePath);
  const normalizedRoot = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error('--output must stay inside the working directory');
  }
  return resolved;
}

function generatedAtFor(deps = {}) {
  if (typeof deps.now === 'function') {
    const value = deps.now();
    return value instanceof Date ? value.toISOString() : String(value);
  }
  return new Date().toISOString();
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

  const cwd = deps.cwd || options.positionals[0] || process.cwd();
  const outputMode = outputModeForOptions(options);

  const provenance = options.includeProvenance
    ? {
        generatedAt: generatedAtFor(deps),
        cwd,
        outputMode,
        strict: options.strict,
        argv: [...argv]
      }
    : undefined;

  if (options.schema) {
    const rendered = renderSchema({ provenance });
    writeOrPrint(rendered, options, cwd, stdout, deps);
    return 0;
  }

  const signals = {
    coverage: loadCoverageSignal(cwd, { ...deps, coverageJsonPath: options.coverageJsonPath }),
    requirements: loadRequirementsSignal(cwd, { ...deps, requirementsJsonPath: options.requirementsJsonPath }),
    standards: loadStandardsSignal(cwd, { ...deps, standardsSummaryPath: options.standardsSummaryPath })
  };

  const ledger = buildRiskLedger(signals, {
    generatedAt: generatedAtFor(deps),
    extensionVersion: (deps.getPackageVersion ?? getPackageVersion)(cwd),
    extensionCommit: (deps.getGitCommit ?? getGitCommit)(),
    maxCoverageDebtEntries: options.maxCoverageDebtEntries
  });

  let rendered;
  if (outputMode === 'json') {
    rendered = JSON.stringify(provenance ? { ...ledger, provenance } : ledger, null, 2);
  } else if (outputMode === 'markdown') {
    rendered = renderMarkdown(ledger);
  } else {
    rendered = renderSummary(ledger);
  }

  writeOrPrint(rendered, options, cwd, stdout, deps);

  if (options.strict && hasSelectableHighRisk(ledger)) {
    return 1;
  }
  return 0;
}

function writeOrPrint(content, options, cwd, stdout, deps) {
  if (options.outputPath) {
    const resolved = resolveOutputPath(cwd, options.outputPath);
    const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
    const writeFile = deps.writeFile ?? fs.writeFileSync;
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFile(resolved, `${content}\n`, 'utf8');
    stdout.write(`[risk-ledger] Wrote ${options.outputPath}\n`);
    return;
  }
  stdout.write(`${content}\n`);
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SCHEMA_VERSION,
  RISK_LEDGER_SCHEMA_ID,
  RISK_LEDGER_SCHEMA_PROVENANCE_KEY,
  RISK_LEDGER_JSON_SCHEMA,
  SEVERITY_TIERS,
  TIER_BASE_SCORE,
  DIMENSIONS,
  PLATFORM_PROOF_RISKS,
  makeEntry,
  buildVerificationEntries,
  buildCoverageEntries,
  buildStandardsEntries,
  buildPlatformProofEntries,
  buildRiskLedger,
  hasSelectableHighRisk,
  compareEntries,
  isSelectable,
  loadCoverageSignal,
  loadRequirementsSignal,
  loadStandardsSignal,
  renderSummary,
  renderMarkdown,
  renderSchema,
  parseArgs,
  outputModeForOptions,
  resolveOutputPath,
  main
};
