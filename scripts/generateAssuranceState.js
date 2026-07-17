#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope.js');
const { parseSharedOutputArgs } = require('./lib/outputContract.js');

const DEFAULT_SAVE_DIR = 'assurance-state-evidence';
const DEFAULT_STANDARDS_AUDIT_DIR = 'assurance-multi-standards-evidence';
const SCHEMA_VERSION = 1;
const ASSURANCE_STATE_SCHEMA_ID = 'vi-history-suite/assurance-state@v1';
const SIGNAL_STATES = ['green', 'candidate', 'known', 'resolved', 'needs-review'];

function usage() {
  return [
    'Usage: node scripts/generateAssuranceState.js [options]',
    '',
    'Options:',
    '  --audit-summary <path>        Retained standards audit-summary.json path',
    '  --audit-run-id <id>           Run id under assurance-multi-standards-evidence',
    `  --standards-audit-dir <dir>   Standards audit evidence root (default: ${DEFAULT_STANDARDS_AUDIT_DIR})`,
    `  --save-dir <dir>              Output root (default: ${DEFAULT_SAVE_DIR})`,
    '  --run-id <id>                 Assurance state output run id (default: source audit run id)',
    '  --issue-link <url>            Issue link to retain in state provenance; repeatable',
    '  --pr-link <url>               PR link to retain in state provenance; repeatable',
    '  --merge-sha <sha>             Merge SHA to retain in state provenance; repeatable',
    '  --requirement <id>            Requirement id to retain in state provenance; repeatable',
    '  --review-finding <json>       Review finding JSON with state, url, title; repeatable',
    '  --help                        Show this help'
  ].join('\n');
}

function parseArgs(argv) {
  const { options, positionals } = parseSharedOutputArgs(argv, {
    defaults: {
      auditSummary: undefined,
      auditRunId: undefined,
      standardsAuditDir: DEFAULT_STANDARDS_AUDIT_DIR,
      saveDir: DEFAULT_SAVE_DIR,
      runId: undefined,
      issueLinks: [],
      prLinks: [],
      mergeShas: [],
      requirements: [],
      reviewFindings: [],
      schema: false,
      help: false
    },
    // This CLI only shares --schema; reject the other common flags as unknown.
    excludeCommonFlags: ['--json', '--markdown', '--strict', '--include-provenance', '--output'],
    boolFlags: {
      '--help': 'help',
      '-h': 'help'
    },
    valueFlags: {
      '--audit-summary': 'auditSummary',
      '--audit-run-id': 'auditRunId',
      '--standards-audit-dir': 'standardsAuditDir',
      '--save-dir': 'saveDir',
      '--run-id': 'runId',
      '--issue-link': 'issueLinks',
      '--pr-link': 'prLinks',
      '--merge-sha': 'mergeShas',
      '--requirement': 'requirements',
      '--review-finding': 'reviewFindings'
    },
    repeatable: ['issueLinks', 'prLinks', 'mergeShas', 'requirements', 'reviewFindings'],
    transforms: {
      reviewFindings: (value) => parseReviewFinding(value)
    }
  });

  // This CLI takes no positional arguments; reject any as unknown (as before).
  if (positionals.length > 0) {
    throw new Error(`Unknown argument: ${positionals[0]}`);
  }

  if (options.auditSummary && options.auditRunId) {
    throw new Error('Use either --audit-summary or --audit-run-id, not both.');
  }

  return options;
}

function ensureDir(dirPath, deps = {}) {
  const mkdirSync = deps.mkdirSync || fs.mkdirSync;
  mkdirSync(dirPath, { recursive: true });
}

function readText(filePath, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  return readFileSync(filePath, 'utf8');
}

function writeText(filePath, content, deps = {}) {
  ensureDir(path.dirname(filePath), deps);
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, payload, deps = {}) {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`, deps);
}

function readJson(filePath, deps = {}) {
  try {
    return JSON.parse(readText(filePath, deps));
  } catch (error) {
    throw new Error(`Unable to read JSON from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildRunId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function repoRelative(filePath, cwd) {
  const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
  return relative || '.';
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function uniqueStrings(values) {
  return [...new Set(arrayOfStrings(values).filter(Boolean))];
}

function parseReviewFinding(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`--review-finding must be JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--review-finding must be a JSON object.');
  }
  const state = normalizeState(parsed.state);
  if (!state) {
    throw new Error(`--review-finding state must be one of: ${SIGNAL_STATES.join(', ')}.`);
  }
  if (typeof parsed.url !== 'string' || parsed.url.trim() === '') {
    throw new Error('--review-finding url must be a non-empty string.');
  }
  if (typeof parsed.title !== 'string' || parsed.title.trim() === '') {
    throw new Error('--review-finding title must be a non-empty string.');
  }
  return {
    state,
    url: parsed.url.trim(),
    title: parsed.title.trim(),
    source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source.trim() : 'post-merge-review',
    basis: typeof parsed.basis === 'string' && parsed.basis.trim() ? parsed.basis.trim() : undefined
  };
}

function uniqueReviewFindings(findings) {
  const seen = new Set();
  const unique = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding || typeof finding !== 'object') {
      continue;
    }
    const key = [finding.state, finding.url, finding.title, finding.source].join('\u0000');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

function slugifySignalPart(value) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'finding';
}

function reviewFindingSignalId(finding) {
  const digest = crypto
    .createHash('sha256')
    .update([finding.state, finding.source, finding.title, finding.url].join('\u0000'))
    .digest('hex')
    .slice(0, 12);
  return `post-merge-review:${slugifySignalPart(finding.source)}:${slugifySignalPart(finding.title)}:${digest}`;
}

function normalizeState(value) {
  return SIGNAL_STATES.includes(value) ? value : undefined;
}

function statusIsPass(status) {
  return String(status || '').toUpperCase() === 'PASS';
}

function metadataFromOptions(options) {
  return {
    issueLinks: uniqueStrings(options.issueLinks),
    prLinks: uniqueStrings(options.prLinks),
    mergeShas: uniqueStrings(options.mergeShas),
    requirements: uniqueStrings(options.requirements),
    reviewFindings: uniqueReviewFindings(options.reviewFindings)
  };
}

function sourceRunId(auditSummary) {
  return auditSummary && auditSummary.options && typeof auditSummary.options.runId === 'string'
    ? auditSummary.options.runId
    : undefined;
}

function commandProvenance(auditSummary) {
  const commands = [];
  const addCommand = (stage, step) => {
    if (!step || typeof step !== 'object') {
      return;
    }
    commands.push({
      stage,
      name: step.name,
      status: step.status,
      file: step.file,
      command: step.command,
      scoreFile: step.scoreFile
    });
  };
  for (const step of Array.isArray(auditSummary.imagePreparation) ? auditSummary.imagePreparation : []) {
    addCommand('image', step);
  }
  for (const step of Array.isArray(auditSummary.directChecks) ? auditSummary.directChecks : []) {
    addCommand('direct-check', step);
  }
  for (const step of Array.isArray(auditSummary.profiles) ? auditSummary.profiles : []) {
    addCommand('profile', step);
  }
  return commands;
}

function sourceArtifactPath(auditSummaryPath, relativePath, cwd) {
  if (!relativePath) {
    return undefined;
  }
  return repoRelative(path.resolve(path.dirname(auditSummaryPath), relativePath), cwd);
}

function sourceArtifacts(auditSummaryPath, cwd, relativePaths = []) {
  const auditArtifact = repoRelative(auditSummaryPath, cwd);
  return uniqueStrings([
    auditArtifact,
    ...relativePaths.map((relativePath) => sourceArtifactPath(auditSummaryPath, relativePath, cwd)).filter(Boolean)
  ]);
}

function directCheckSummary(check) {
  if (check.requirementsQuality) {
    return check.requirementsQuality;
  }
  if (check.externalUserInformation) {
    return check.externalUserInformation;
  }
  return {};
}

function classifyDirectCheck(check) {
  const explicit = normalizeState(check.state);
  if (explicit) {
    return explicit;
  }
  const summary = directCheckSummary(check);
  const findingCount = typeof summary.findingCount === 'number' ? summary.findingCount : 0;
  if (check.status !== 0 || summary.ok === false || findingCount > 0) {
    return 'candidate';
  }
  if (summary.ok === true || check.status === 0) {
    return 'green';
  }
  return 'needs-review';
}

function classifyGateBasis(row) {
  const explicit = normalizeState(row.state);
  if (explicit) {
    return explicit;
  }
  if (statusIsPass(row.status) && row.confidence === 'High') {
    return 'green';
  }
  if (!statusIsPass(row.status)) {
    return 'candidate';
  }
  return 'needs-review';
}

function classifyGateDetail(row) {
  const explicit = normalizeState(row.state);
  if (explicit) {
    return explicit;
  }
  const missingProof = arrayOfStrings(row.missingProof);
  if (!statusIsPass(row.status) || missingProof.length > 0) {
    return 'candidate';
  }
  if (row.confidence === 'High') {
    return 'green';
  }
  return 'needs-review';
}

function classifyEvidenceRow(row) {
  const explicit = normalizeState(row.state);
  if (explicit) {
    return explicit;
  }
  const hasProvenance = arrayOfStrings(row.profiles).length > 0 && arrayOfStrings(row.scoreFiles).length > 0;
  const hasEvidence = arrayOfStrings(row.evidencePaths).length > 0 || row.basis || row.rationale || row.summary;
  return hasProvenance && hasEvidence ? 'green' : 'needs-review';
}

function commandSubset(commands, predicate) {
  return commands.filter(predicate).map((command) => ({
    stage: command.stage,
    name: command.name,
    status: command.status,
    file: command.file,
    command: command.command,
    scoreFile: command.scoreFile
  }));
}

function failedCommandSignals(auditSummary, common, detailedSignals = []) {
  const failedCommands = common.commands.filter((command) => typeof command.status === 'number' && command.status !== 0);
  const signals = failedCommands.map((command) => buildSignal({
    id: `standards-audit:command:${command.stage || 'unknown'}:${command.name || 'unknown'}`,
    state: 'candidate',
    kind: 'retained-command-failure',
    title: `Failed ${command.stage || 'command'}: ${command.name || 'unknown'}`,
    status: `FAIL (${command.status})`,
    confidence: 'High',
    basis: `Retained ${command.stage || 'audit'} command exited non-zero.`,
    standards: [],
    profiles: command.stage === 'profile' && command.name ? [command.name] : [],
    scoreFiles: command.scoreFile ? [command.scoreFile] : [],
    checkedPaths: [],
    evidencePaths: [],
    sourceArtifactRelatives: [command.file, command.scoreFile].filter(Boolean),
    commandProvenance: [command]
  }, common));

  const hasDetailedCandidateSignals = detailedSignals.some((signal) => signal.state === 'candidate');
  if (auditSummary.success === false && failedCommands.length === 0 && !hasDetailedCandidateSignals) {
    signals.push(buildSignal({
      id: 'standards-audit:summary:failed',
      state: 'candidate',
      kind: 'standards-audit-summary',
      title: 'Retained standards audit did not complete cleanly',
      status: 'FAIL',
      confidence: 'High',
      basis: 'Retained audit summary reported success: false without command-level failure details.',
      standards: [],
      profiles: [],
      scoreFiles: [],
      checkedPaths: [],
      evidencePaths: [],
      sourceArtifactRelatives: [],
      commandProvenance: []
    }, common));
  }

  return signals;
}

function buildSignal(input, common) {
  const signal = {
    id: input.id,
    state: input.state,
    kind: input.kind,
    title: input.title,
    status: input.status,
    confidence: input.confidence,
    basis: input.basis,
    standards: uniqueStrings(input.standards),
    requirements: uniqueStrings([...(input.requirements || []), ...common.metadata.requirements]),
    profiles: uniqueStrings(input.profiles),
    scoreFiles: uniqueStrings(input.scoreFiles),
    checkedPaths: uniqueStrings(input.checkedPaths),
    evidencePaths: uniqueStrings(input.evidencePaths),
    snapshotMetadata: common.snapshot,
    commandProvenance: input.commandProvenance || [],
    sourceArtifacts: sourceArtifacts(common.auditSummaryPath, common.cwd, input.sourceArtifactRelatives || []),
    issueLinks: common.metadata.issueLinks,
    prLinks: common.metadata.prLinks,
    mergeShas: common.metadata.mergeShas
  };
  return signal;
}

function directCheckSignals(auditSummary, common) {
  const checks = Array.isArray(auditSummary.directChecks) ? auditSummary.directChecks : [];
  return checks.map((check) => {
    const summary = directCheckSummary(check);
    const relativePaths = [check.file];
    const checkedPaths = arrayOfStrings(summary.checkedPaths);
    return buildSignal({
      id: `standards-audit:direct-check:${check.name || 'unknown'}`,
      state: classifyDirectCheck(check),
      kind: 'direct-check',
      title: check.name || 'direct-check',
      status: check.status === 0 ? 'PASS' : `FAIL (${check.status})`,
      confidence: summary.ok === true ? 'High' : undefined,
      basis: summary.summary || (summary.ok === true ? 'Direct standards check completed without findings.' : undefined),
      standards: check.name === 'requirements-quality-system' ? ['29148'] : check.name === 'external-user-information' ? ['26514'] : [],
      profiles: [],
      scoreFiles: [],
      checkedPaths,
      evidencePaths: checkedPaths,
      sourceArtifactRelatives: relativePaths,
      commandProvenance: commandSubset(common.commands, (command) => command.stage === 'direct-check' && command.name === check.name)
    }, common);
  });
}

function coverageRationaleSignals(auditSummary, common) {
  const rows = Array.isArray(auditSummary.standardsCoverageRationaleSummary) ? auditSummary.standardsCoverageRationaleSummary : [];
  return rows.map((row) => buildSignal({
    id: `standards-audit:coverage-rationale:${String(row.area || 'unknown').toLowerCase()}`,
    state: classifyEvidenceRow(row),
    kind: 'standards-coverage-rationale',
    title: `Coverage rationale: ${row.area || 'unknown'}`,
    status: 'PASS',
    confidence: undefined,
    basis: row.rationale,
    standards: row.standards,
    profiles: row.profiles,
    scoreFiles: row.scoreFiles,
    checkedPaths: [],
    evidencePaths: [],
    sourceArtifactRelatives: row.scoreFiles,
    commandProvenance: commandSubset(common.commands, (command) => command.stage === 'profile' && arrayOfStrings(row.profiles).includes(command.name))
  }, common));
}

function standardsEvidenceSignals(auditSummary, common) {
  const rows = Array.isArray(auditSummary.standardsEvidenceSummary) ? auditSummary.standardsEvidenceSummary : [];
  return rows.map((row) => buildSignal({
    id: `standards-audit:evidence:${row.id || row.summary || 'unknown'}`,
    state: classifyEvidenceRow(row),
    kind: 'standards-evidence',
    title: row.summary || row.id || 'Standards evidence',
    status: 'PASS',
    confidence: undefined,
    basis: row.summary,
    standards: row.standards,
    profiles: row.profiles,
    scoreFiles: row.scoreFiles,
    checkedPaths: [],
    evidencePaths: row.evidencePaths,
    sourceArtifactRelatives: row.scoreFiles,
    commandProvenance: commandSubset(common.commands, (command) => command.stage === 'profile' && arrayOfStrings(row.profiles).includes(command.name))
  }, common));
}

function gateStrengthSignals(auditSummary, common) {
  const rows = Array.isArray(auditSummary.standardsGateStrengthSummary) ? auditSummary.standardsGateStrengthSummary : [];
  return rows.map((row) => buildSignal({
    id: `standards-audit:gate-strength:${row.id || row.summary || 'unknown'}`,
    state: classifyEvidenceRow(row),
    kind: 'standards-gate-strength',
    title: row.summary || row.id || 'Gate strength',
    status: 'PASS',
    confidence: undefined,
    basis: row.summary,
    standards: row.standards,
    profiles: row.profiles,
    scoreFiles: row.scoreFiles,
    checkedPaths: [],
    evidencePaths: [],
    sourceArtifactRelatives: row.scoreFiles,
    commandProvenance: commandSubset(common.commands, (command) => command.stage === 'profile' && arrayOfStrings(row.profiles).includes(command.name))
  }, common));
}

function gateBasisSignals(auditSummary, common) {
  const rows = Array.isArray(auditSummary.standardsGateBasisSummary) ? auditSummary.standardsGateBasisSummary : [];
  return rows.map((row) => buildSignal({
    id: `standards-audit:gate-basis:${row.gate || 'unknown'}`,
    state: classifyGateBasis(row),
    kind: 'standards-gate-basis',
    title: `Gate basis: ${row.gate || 'unknown'}`,
    status: row.status,
    confidence: row.confidence,
    basis: row.basis,
    standards: row.standards,
    profiles: row.profiles,
    scoreFiles: row.scoreFiles,
    checkedPaths: [],
    evidencePaths: [],
    sourceArtifactRelatives: row.scoreFiles,
    commandProvenance: commandSubset(common.commands, (command) => command.stage === 'profile' && arrayOfStrings(row.profiles).includes(command.name))
  }, common));
}

function gateDetailSignals(auditSummary, common) {
  const rows = Array.isArray(auditSummary.standardsGateDetailSummary) ? auditSummary.standardsGateDetailSummary : [];
  return rows.map((row) => buildSignal({
    id: `standards-audit:gate-detail:${row.gate || 'unknown'}`,
    state: classifyGateDetail(row),
    kind: 'standards-gate-detail',
    title: `Gate detail: ${row.gate || 'unknown'}`,
    status: row.status,
    confidence: row.confidence || 'unknown',
    basis: row.basis,
    standards: row.standards,
    profiles: row.profiles,
    scoreFiles: row.scoreFiles,
    checkedPaths: [],
    evidencePaths: row.missingProof,
    sourceArtifactRelatives: row.scoreFiles,
    commandProvenance: commandSubset(common.commands, (command) => command.stage === 'profile' && arrayOfStrings(row.profiles).includes(command.name))
  }, common));
}

function reviewFindingSignals(common) {
  return uniqueReviewFindings(common.metadata.reviewFindings).map((finding) => buildSignal({
    id: reviewFindingSignalId(finding),
    state: finding.state,
    kind: 'post-merge-review',
    title: finding.title,
    status: finding.state.toUpperCase(),
    confidence: 'High',
    basis: finding.basis || 'Post-merge review finding supplied as assurance-state provenance.',
    standards: [],
    profiles: [],
    scoreFiles: [],
    checkedPaths: [],
    evidencePaths: [finding.url],
    sourceArtifactRelatives: [],
    commandProvenance: []
  }, common));
}

function countsByState(signals) {
  return Object.fromEntries(SIGNAL_STATES.map((state) => [state, signals.filter((signal) => signal.state === state).length]));
}

function unionField(signals, field) {
  return uniqueStrings(signals.flatMap((signal) => arrayOfStrings(signal[field])));
}

function buildAssuranceState(auditSummary, options) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const metadata = options.metadata || { issueLinks: [], prLinks: [], mergeShas: [], requirements: [] };
  const commands = commandProvenance(auditSummary);
  const common = {
    cwd: options.cwd,
    auditSummaryPath: options.auditSummaryPath,
    snapshot: auditSummary.snapshot || {},
    commands,
    metadata
  };
  const detailedSignals = [
    ...directCheckSignals(auditSummary, common),
    ...coverageRationaleSignals(auditSummary, common),
    ...standardsEvidenceSignals(auditSummary, common),
    ...gateStrengthSignals(auditSummary, common),
    ...gateBasisSignals(auditSummary, common),
    ...gateDetailSignals(auditSummary, common)
  ];
  const signals = [
    ...failedCommandSignals(auditSummary, common, detailedSignals),
    ...detailedSignals,
    ...reviewFindingSignals(common)
  ];
  const source = {
    type: 'standards-audit',
    schemaVersion: auditSummary.schemaVersion,
    runId: sourceRunId(auditSummary),
    success: auditSummary.success === true,
    artifactPath: repoRelative(options.auditSummaryPath, options.cwd)
  };
  return {
    ...schemaEnvelopeFields(ASSURANCE_STATE_SCHEMA_ID, SCHEMA_VERSION),
    runId: options.runId,
    generatedAt,
    sources: [source],
    metadata,
    standards: unionField(signals, 'standards'),
    requirements: unionField(signals, 'requirements'),
    profiles: unionField(signals, 'profiles'),
    scoreFiles: unionField(signals, 'scoreFiles'),
    checkedPaths: unionField(signals, 'checkedPaths'),
    sourceArtifacts: unionField(signals, 'sourceArtifacts'),
    reviewFindings: metadata.reviewFindings || [],
    issueLinks: metadata.issueLinks,
    prLinks: metadata.prLinks,
    mergeShas: metadata.mergeShas,
    snapshotMetadata: auditSummary.snapshot || {},
    commandProvenance: commands,
    countsByState: countsByState(signals),
    signalCount: signals.length,
    signals
  };
}

// Published JSON Schema for the retained assurance-state packet, so consumers can
// validate assurance-state.json and the `--schema` mode can publish the contract
// without running the aggregation. Shares the self-describing envelope via
// scripts/lib/schemaEnvelope.js. The rich nested signal/metadata records use
// permissive object shapes for forward-compatibility.
const ASSURANCE_STATE_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DIALECT,
  $id: ASSURANCE_STATE_SCHEMA_ID,
  title: 'vi-history-suite assurance state',
  type: 'object',
  additionalProperties: true,
  required: [
    '$schema',
    'schemaVersion',
    'runId',
    'generatedAt',
    'sources',
    'metadata',
    'countsByState',
    'signalCount',
    'signals'
  ],
  properties: {
    ...schemaEnvelopePropertyNodes(ASSURANCE_STATE_SCHEMA_ID, SCHEMA_VERSION),
    runId: { type: 'string' },
    generatedAt: { type: 'string' },
    sources: { type: 'array', items: { type: 'object' } },
    metadata: { type: 'object' },
    countsByState: { type: 'object' },
    signalCount: { type: 'integer' },
    signals: { type: 'array', items: { type: 'object' } }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(ASSURANCE_STATE_JSON_SCHEMA, options);
}

function markdownCell(value) {
  return String(value === undefined || value === null || value === '' ? '-' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function renderList(values) {
  return Array.isArray(values) && values.length > 0 ? values.map(markdownCell).join('<br>') : '-';
}

function renderAssuranceStateMarkdown(state) {
  const lines = [
    '# Assurance State',
    '',
    `Run ID: ${state.runId}`,
    `Generated At: ${state.generatedAt}`,
    '',
    '## Sources',
    '',
    '| Type | Run ID | Success | Artifact |',
    '| --- | --- | --- | --- |'
  ];
  for (const source of state.sources) {
    lines.push(`| ${markdownCell(source.type)} | ${markdownCell(source.runId)} | ${markdownCell(source.success === true ? 'yes' : 'no')} | ${markdownCell(source.artifactPath)} |`);
  }
  lines.push('');
  lines.push('## Signal Counts');
  lines.push('');
  lines.push('| State | Count |');
  lines.push('| --- | --- |');
  for (const signalState of SIGNAL_STATES) {
    lines.push(`| ${markdownCell(signalState)} | ${markdownCell(state.countsByState[signalState] || 0)} |`);
  }
  lines.push('');
  lines.push('## Signals');
  lines.push('');
  lines.push('| State | Signal | Kind | Status | Confidence | Standards | Profiles | Source Artifacts | Evidence Paths |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const signal of state.signals) {
    lines.push(`| ${markdownCell(signal.state)} | ${markdownCell(signal.title)} | ${markdownCell(signal.kind)} | ${markdownCell(signal.status)} | ${markdownCell(signal.confidence)} | ${renderList(signal.standards)} | ${renderList(signal.profiles)} | ${renderList(signal.sourceArtifacts)} | ${renderList(signal.evidencePaths)} |`);
  }
  const reviewFindings = Array.isArray(state.reviewFindings) ? state.reviewFindings : [];
  if (reviewFindings.length > 0) {
    lines.push('');
    lines.push('## Review Findings');
    lines.push('');
    lines.push('| State | Title | Source | Basis | URL |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const finding of reviewFindings) {
      lines.push(`| ${markdownCell(finding.state)} | ${markdownCell(finding.title)} | ${markdownCell(finding.source)} | ${markdownCell(finding.basis)} | ${markdownCell(finding.url)} |`);
    }
  }
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Standards | ${renderList(state.standards)} |`);
  lines.push(`| Requirements | ${renderList(state.requirements)} |`);
  lines.push(`| Profiles | ${renderList(state.profiles)} |`);
  lines.push(`| Score Files | ${renderList(state.scoreFiles)} |`);
  lines.push(`| Checked Paths | ${renderList(state.checkedPaths)} |`);
  lines.push(`| Issue Links | ${renderList(state.issueLinks)} |`);
  lines.push(`| PR Links | ${renderList(state.prLinks)} |`);
  lines.push(`| Merge SHAs | ${renderList(state.mergeShas)} |`);
  lines.push(`| Review Findings | ${renderList((state.reviewFindings || []).map((finding) => `${finding.state}: ${finding.title} (${finding.url})`))} |`);
  return `${lines.join('\n')}\n`;
}

function resolveAuditSummaryPath(options, cwd, deps = {}) {
  if (options.auditSummary) {
    return path.resolve(cwd, options.auditSummary);
  }
  if (options.auditRunId) {
    return path.resolve(cwd, options.standardsAuditDir, options.auditRunId, 'audit-summary.json');
  }
  const root = path.resolve(cwd, options.standardsAuditDir);
  const readdirSync = deps.readdirSync || fs.readdirSync;
  const statSync = deps.statSync || fs.statSync;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    throw new Error('No audit summary found. Pass --audit-summary or --audit-run-id.');
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(root, entry.name, 'audit-summary.json');
      try {
        return { filePath, name: entry.name, mtimeMs: statSync(filePath).mtimeMs };
      } catch {
        return undefined;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
  if (candidates.length === 0) {
    throw new Error('No audit summary found. Pass --audit-summary or --audit-run-id.');
  }
  return candidates[0].filePath;
}

function runAssuranceState(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    return { exitCode: 0, markdown: usage(), context: { options } };
  }
  // --schema publishes the JSON Schema without reading any audit summary.
  if (options.schema) {
    return { exitCode: 0, markdown: renderSchema(), context: { options, schema: true } };
  }
  const cwd = deps.cwd || process.cwd();
  const auditSummaryPath = resolveAuditSummaryPath(options, cwd, deps);
  const auditSummary = readJson(auditSummaryPath, deps);
  const runId = options.runId || sourceRunId(auditSummary) || buildRunId(deps.now ? deps.now() : new Date());
  const outputDir = path.resolve(cwd, options.saveDir, runId);
  const state = buildAssuranceState(auditSummary, {
    cwd,
    auditSummaryPath,
    runId,
    metadata: metadataFromOptions(options),
    generatedAt: (deps.now ? deps.now() : new Date()).toISOString()
  });
  const markdown = renderAssuranceStateMarkdown(state);
  writeJson(path.join(outputDir, 'assurance-state.json'), state, deps);
  writeText(path.join(outputDir, 'assurance-state.md'), markdown, deps);
  return { exitCode: 0, markdown, context: { options, outputDir, state } };
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = runAssuranceState(argv, deps);
    (deps.stdout || process.stdout).write(`${result.markdown}\n`);
    return result.exitCode;
  } catch (error) {
    (deps.stderr || process.stderr).write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_SAVE_DIR,
  DEFAULT_STANDARDS_AUDIT_DIR,
  SCHEMA_VERSION,
  ASSURANCE_STATE_SCHEMA_ID,
  ASSURANCE_STATE_JSON_SCHEMA,
  renderSchema,
  SIGNAL_STATES,
  parseArgs,
  buildRunId,
  metadataFromOptions,
  parseReviewFinding,
  commandProvenance,
  classifyDirectCheck,
  classifyGateBasis,
  classifyGateDetail,
  classifyEvidenceRow,
  buildAssuranceState,
  renderAssuranceStateMarkdown,
  resolveAuditSummaryPath,
  runAssuranceState,
  main
};