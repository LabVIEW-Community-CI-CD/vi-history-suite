#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const {
  DEFAULT_STANDARDS_IMAGE,
  createTrackedWorktreeSnapshot,
  removeTrackedWorktreeSnapshot,
  parseGateScorecard
} = require('./generateCloseoutEvidence.js');
const {
  prepareStandardsImage,
  summarizeRequirementsQuality
} = require('./runIssueStandardsTriage.js');
const {
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope.js');

const DEFAULT_SAVE_DIR = 'assurance-multi-standards-evidence';
const DEFAULT_REQUIREMENTS_SPEC_SCOPE = 'system';
const SCHEMA_VERSION = 1;
const MULTI_STANDARDS_AUDIT_SCHEMA_ID = 'vi-history-suite/multi-standards-audit@v1';
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const GATE_SCORECARD_PROFILES = [
  'quick-triage',
  'release-gate',
  '26514-review',
  'due-diligence',
  'compliance-uplift'
];
const PORTFOLIO_PROFILE = 'portfolio-review';
const STANDARDS_COVERAGE_AREAS = ['REQ', 'ARCH', 'TEST', 'CM', 'DOC'];

function usage() {
  return [
    'Usage: node scripts/runMultiStandardsAudit.js [options]',
    '',
    'Options:',
    `  --image <image>                  Standards workbench image (default: ${DEFAULT_STANDARDS_IMAGE})`,
    `  --requirements-spec-scope <mode>  requirements_quality_check scope (default: ${DEFAULT_REQUIREMENTS_SPEC_SCOPE})`,
    `  --save-dir <dir>                 Output root (default: ${DEFAULT_SAVE_DIR})`,
    '  --run-id <id>                    Output run id directory (default: UTC timestamp)',
    '  --keep-snapshot                  Leave the tracked-worktree snapshot on disk for troubleshooting',
    '  --schema                         Publish the retained audit-summary JSON Schema and exit',
    '  --help                           Show this help'
  ].join('\n');
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function buildRunId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function parseArgs(argv) {
  const options = {
    image: DEFAULT_STANDARDS_IMAGE,
    requirementsSpecScope: DEFAULT_REQUIREMENTS_SPEC_SCOPE,
    saveDir: DEFAULT_SAVE_DIR,
    runId: undefined,
    keepSnapshot: false,
    schema: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--image':
        options.image = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--requirements-spec-scope':
        options.requirementsSpecScope = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--save-dir':
        options.saveDir = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--run-id':
        options.runId = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--keep-snapshot':
        options.keepSnapshot = true;
        break;
      case '--schema':
        options.schema = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function runCommand(command, args, deps = {}) {
  const spawnSync = deps.spawnSync || childProcess.spawnSync;
  const result = spawnSync(command, args, {
    cwd: deps.cwd,
    encoding: 'utf8',
    shell: false,
    timeout: deps.timeoutMs || COMMAND_TIMEOUT_MS
  });
  return {
    command,
    args,
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : ''
  };
}

function commandLine(command, args) {
  return [command, ...args].map((part) => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ');
}

function ensureDir(dirPath, deps = {}) {
  const mkdirSync = deps.mkdirSync || fs.mkdirSync;
  mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content, deps = {}) {
  ensureDir(path.dirname(filePath), deps);
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, payload, deps = {}) {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`, deps);
}

function parseJsonOrUndefined(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function directDockerSteps(options) {
  const mount = '${SNAPSHOT}:/target';
  return [
    {
      name: 'requirements-quality-system',
      file: 'requirements-quality-system.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        mount,
        options.image,
        'python3',
        'scripts/requirements_quality_check.py',
        '/target',
        '--requirements-spec-scope',
        options.requirementsSpecScope,
        '--json'
      ]
    },
    {
      name: 'external-user-information',
      file: 'external-user-information.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        mount,
        options.image,
        'python3',
        'scripts/external_user_information_check.py',
        '/target',
        '--json'
      ]
    }
  ];
}

function profileDockerSteps(options) {
  const mount = '${SNAPSHOT}:/target';
  const outputMount = '${OUTPUT}:/out';
  const gateSteps = GATE_SCORECARD_PROFILES.map((profile) => ({
    name: profile,
    file: `${profile}-gate-scorecard.txt`,
    saveDir: profile,
    output: 'gate-scorecard'
  }));
  const portfolioStep = {
    name: PORTFOLIO_PROFILE,
    file: `${PORTFOLIO_PROFILE}-table.txt`,
    saveDir: PORTFOLIO_PROFILE,
    scoreFile: path.posix.join(PORTFOLIO_PROFILE, 'repos', 'target', 'score.json'),
    output: 'portfolio-table'
  };

  return [...gateSteps, portfolioStep].map((step) => ({
    ...step,
    command: 'docker',
    args: [
      'run',
      '--rm',
      '-v',
      mount,
      '-v',
      outputMount,
      options.image,
      'python3',
      'scripts/run_assurance.py',
      '/target',
      '--profile',
      step.name,
      '--depth',
      'deep',
      '--include-snippets',
      '--max-examples',
      '8',
      '--max-evidence-per-rule',
      '8',
      '--save-dir',
      `/out/${step.saveDir}`,
      '--output',
      step.output,
      '--no-validate-workflows'
    ]
  }));
}

function replaceAuditMounts(args, snapshotPath, outputDir) {
  return args.map((arg) => {
    if (arg === '${SNAPSHOT}:/target') {
      return `${snapshotPath}:/target`;
    }
    if (arg === '${OUTPUT}:/out') {
      return `${outputDir}:/out`;
    }
    return arg;
  });
}

function writeCommandArtifacts(outputDir, step, result, deps = {}) {
  writeText(path.join(outputDir, step.file), result.stdout, deps);
  if (result.stderr) {
    writeText(path.join(outputDir, `${step.name}.stderr.txt`), result.stderr, deps);
  }
}

function removeStepSaveDir(outputDir, step, deps = {}) {
  if (!step.saveDir) {
    return;
  }
  const rmSync = deps.rmSync || fs.rmSync;
  rmSync(path.join(outputDir, step.saveDir), { recursive: true, force: true });
}

function runAuditStep(outputDir, step, snapshotPath, deps = {}) {
  removeStepSaveDir(outputDir, step, deps);
  const args = replaceAuditMounts(step.args, snapshotPath, outputDir);
  const result = runCommand(step.command, args, deps);
  writeCommandArtifacts(outputDir, step, result, deps);
  return { ...step, args, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error };
}

function summarizeExternalUserInformation(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, findingCount: undefined, checkedPathCount: undefined, checkedPaths: [] };
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const checkedPaths = Array.isArray(payload.checkedPaths) ? payload.checkedPaths : [];
  return {
    ok: payload.ok === true,
    findingCount: findings.length,
    checkedPathCount: checkedPaths.length,
    checkedPaths
  };
}

function markdownTableCells(line) {
  const trimmedLine = String(line || '').trim();
  if (!trimmedLine.startsWith('|') || !trimmedLine.endsWith('|')) {
    return [];
  }
  return trimmedLine.slice(1, -1).split('|').map((cell) => cell.trim());
}

function markdownDividerRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function portfolioAreaScore(value) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function summarizePortfolioTable(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const headerCells = markdownTableCells(lines[lineIndex]);
    if (!headerCells.includes('Repo') || !headerCells.includes('Overall') || !headerCells.includes('Gates')) {
      continue;
    }

    for (let dataLineIndex = lineIndex + 1; dataLineIndex < lines.length; dataLineIndex += 1) {
      const dataCells = markdownTableCells(lines[dataLineIndex]);
      if (dataCells.length === 0 || markdownDividerRow(dataCells)) {
        continue;
      }

      const row = {};
      headerCells.forEach((header, headerIndex) => {
        row[header] = dataCells[headerIndex];
      });
      const areaScores = {};
      for (const area of ['REQ', 'ARCH', 'TEST', 'CM', 'DOC']) {
        if (row[area]) {
          areaScores[area] = portfolioAreaScore(row[area]);
        }
      }
      return {
        repo: row.Repo,
        overall: row.Overall,
        gates: row.Gates,
        areaScores,
        topRisk: row['Top Risk']
      };
    }
  }
  return undefined;
}

function parseMissingProofCell(value) {
  const text = String(value || '').trim();
  if (!text || text === '-' || /^none$/i.test(text)) {
    return [];
  }
  return text.split(/<br\s*\/?>|;/i).map((part) => part.trim()).filter(Boolean);
}

function summarizeGateScorecard(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const headerCells = markdownTableCells(lines[lineIndex]);
    if (!headerCells.includes('Gate') || !headerCells.includes('Status')) {
      continue;
    }

    const details = {};
    for (let dataLineIndex = lineIndex + 1; dataLineIndex < lines.length; dataLineIndex += 1) {
      const dataCells = markdownTableCells(lines[dataLineIndex]);
      if (dataCells.length === 0) {
        break;
      }
      if (markdownDividerRow(dataCells)) {
        continue;
      }

      const row = {};
      headerCells.forEach((header, headerIndex) => {
        row[header] = dataCells[headerIndex];
      });
      if (row.Gate) {
        details[row.Gate] = {
          status: row.Status,
          confidence: row.Confidence,
          missingProof: parseMissingProofCell(row['Missing Proof'])
        };
      }
    }
    return details;
  }
  return {};
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function summarizeRetainedGateScore(payload) {
  if (!payload || typeof payload !== 'object' || !payload.gates || typeof payload.gates !== 'object') {
    return {};
  }
  const details = {};
  for (const [gate, data] of Object.entries(payload.gates)) {
    if (!data || typeof data !== 'object') {
      continue;
    }
    details[gate] = {
      status: data.status,
      confidence: data.confidence,
      basis: data.basis,
      standards: arrayOfStrings(data.standards),
      missingProof: arrayOfStrings(data.missing)
    };
  }
  return details;
}

function summarizeRetainedStandardsCoverage(payload) {
  if (!payload || typeof payload !== 'object' || !payload.areas || typeof payload.areas !== 'object') {
    return {};
  }
  const coverage = {};
  for (const [area, data] of Object.entries(payload.areas)) {
    if (!data || typeof data !== 'object') {
      continue;
    }
    coverage[area] = {
      score: data.score,
      confidence: data.confidence,
      standards: arrayOfStrings(data.standards),
      rationale: data.rationale
    };
  }
  return coverage;
}

function summarizeRetainedStandardsEvidence(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.top_strengths)) {
    return [];
  }
  return payload.top_strengths.filter((item) => item && typeof item === 'object').map((item) => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    summary: typeof item.summary === 'string' ? item.summary : undefined,
    standards: arrayOfStrings(item.standards),
    evidencePaths: arrayOfStrings(item.evidence_paths)
  })).filter((item) => item.summary || item.evidencePaths.length > 0 || item.standards.length > 0);
}

function mergeGateDetails(scorecardDetails, retainedDetails) {
  const merged = { ...scorecardDetails };
  for (const [gate, retainedDetail] of Object.entries(retainedDetails || {})) {
    const existingDetail = merged[gate] || {};
    const existingMissing = Array.isArray(existingDetail.missingProof) ? existingDetail.missingProof : [];
    const retainedMissing = Array.isArray(retainedDetail.missingProof) ? retainedDetail.missingProof : [];
    merged[gate] = {
      ...retainedDetail,
      ...existingDetail,
      standards: arrayOfStrings(retainedDetail.standards),
      basis: retainedDetail.basis || existingDetail.basis,
      missingProof: existingMissing.length > 0 ? existingMissing : retainedMissing
    };
  }
  return merged;
}

function profileScoreFile(step) {
  if (!step.saveDir) {
    return undefined;
  }
  return step.scoreFile || path.posix.join(step.saveDir, 'target', 'score.json');
}

function readProfileScore(outputDir, step, deps = {}) {
  const scoreFile = profileScoreFile(step);
  if (!outputDir || !scoreFile) {
    return undefined;
  }
  const readFileSync = deps.readFileSync || fs.readFileSync;
  const scoreFilePath = path.join(outputDir, ...scoreFile.split('/'));
  try {
    return JSON.parse(readFileSync(scoreFilePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function attachRetainedProfileScore(summary, retainedScore, scoreFile) {
  const retainedDetails = summarizeRetainedGateScore(retainedScore);
  const standardsCoverage = summarizeRetainedStandardsCoverage(retainedScore);
  const standardsEvidence = summarizeRetainedStandardsEvidence(retainedScore);
  if (Object.keys(retainedDetails).length > 0) {
    summary.scorecardDetails = mergeGateDetails(summary.scorecardDetails || {}, retainedDetails);
  }
  if (Object.keys(standardsCoverage).length > 0) {
    summary.standardsCoverage = standardsCoverage;
  }
  if (standardsEvidence.length > 0) {
    summary.standardsEvidence = standardsEvidence;
  }
  if (Object.keys(retainedDetails).length > 0 || Object.keys(standardsCoverage).length > 0 || standardsEvidence.length > 0) {
    summary.scoreFile = scoreFile;
  }
}

function summarizeDirectStep(step) {
  const payload = parseJsonOrUndefined(step.stdout);
  const summary = { name: step.name, status: step.status, file: step.file, command: commandLine(step.command, step.args) };
  if (step.name === 'requirements-quality-system') {
    summary.requirementsQuality = summarizeRequirementsQuality(payload);
  }
  if (step.name === 'external-user-information') {
    summary.externalUserInformation = summarizeExternalUserInformation(payload);
  }
  return summary;
}

function summarizeProfileStep(step, options = {}) {
  const summary = { name: step.name, status: step.status, file: step.file, command: commandLine(step.command, step.args) };
  if (step.output === 'gate-scorecard') {
    summary.scorecard = parseGateScorecard(step.stdout || '');
    summary.scorecardDetails = summarizeGateScorecard(step.stdout || '');
  }
  if (step.output === 'portfolio-table') {
    const portfolio = summarizePortfolioTable(step.stdout || '');
    summary.portfolio = portfolio ? { tableFile: step.file, ...portfolio } : { tableFile: step.file };
  }
  const scoreFile = profileScoreFile(step);
  attachRetainedProfileScore(summary, readProfileScore(options.outputDir, step, options.deps), scoreFile);
  return summary;
}

function buildStandardsCoverageMatrix(profiles) {
  return profiles.filter((profile) => profile.standardsCoverage && Object.keys(profile.standardsCoverage).length > 0).map((profile) => ({
    profile: profile.name,
    scoreFile: profile.scoreFile,
    areas: profile.standardsCoverage
  }));
}

function buildStandardsCoverageRationaleSummary(matrix) {
  const rowsByKey = new Map();
  for (const row of matrix || []) {
    const areas = row.areas || {};
    const areaNames = [...STANDARDS_COVERAGE_AREAS, ...Object.keys(areas).filter((area) => !STANDARDS_COVERAGE_AREAS.includes(area))];
    for (const area of areaNames) {
      const detail = areas[area];
      if (!detail || !detail.rationale) {
        continue;
      }
      const standards = arrayOfStrings(detail.standards);
      const key = [area, detail.rationale, standards.join('/')].join('\u0001');
      const existing = rowsByKey.get(key);
      if (existing) {
        if (!existing.profiles.includes(row.profile || 'unknown')) {
          existing.profiles.push(row.profile || 'unknown');
        }
        if (row.scoreFile && !existing.scoreFiles.includes(row.scoreFile)) {
          existing.scoreFiles.push(row.scoreFile);
        }
        continue;
      }
      rowsByKey.set(key, {
        area,
        rationale: detail.rationale,
        standards,
        profiles: [row.profile || 'unknown'],
        scoreFiles: row.scoreFile ? [row.scoreFile] : []
      });
    }
  }
  return Array.from(rowsByKey.values());
}

function buildStandardsScoreFileLegend(profiles) {
  const rows = [];
  const seen = new Set();
  for (const profile of profiles) {
    if (!profile.scoreFile) {
      continue;
    }
    const key = `${profile.name}\u0001${profile.scoreFile}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push({ profile: profile.name, scoreFile: profile.scoreFile });
  }
  return rows;
}

function buildStandardsEvidenceSummary(profiles) {
  const rowsByKey = new Map();
  for (const profile of profiles) {
    for (const item of profile.standardsEvidence || []) {
      const evidencePaths = Array.isArray(item.evidencePaths) ? item.evidencePaths : [];
      if (evidencePaths.length === 0) {
        continue;
      }
      const standards = arrayOfStrings(item.standards);
      const key = [item.id || item.summary || 'evidence', standards.join('/'), evidencePaths.join('\u0000')].join('\u0001');
      const existing = rowsByKey.get(key);
      if (existing) {
        if (!existing.profiles.includes(profile.name)) {
          existing.profiles.push(profile.name);
        }
        if (profile.scoreFile && !existing.scoreFiles.includes(profile.scoreFile)) {
          existing.scoreFiles.push(profile.scoreFile);
        }
        continue;
      }
      rowsByKey.set(key, {
        id: item.id,
        summary: item.summary,
        standards,
        evidencePaths,
        profiles: [profile.name],
        scoreFiles: profile.scoreFile ? [profile.scoreFile] : []
      });
    }
  }
  return Array.from(rowsByKey.values());
}

function buildStandardsGateStrengthSummary(profiles) {
  const rowsByKey = new Map();
  for (const profile of profiles) {
    for (const item of profile.standardsEvidence || []) {
      const evidencePaths = Array.isArray(item.evidencePaths) ? item.evidencePaths : [];
      if (evidencePaths.length > 0) {
        continue;
      }
      const standards = arrayOfStrings(item.standards);
      if (!item.summary && standards.length === 0) {
        continue;
      }
      const key = [item.id || 'gate-strength', item.summary || '', standards.join('/')].join('\u0001');
      const existing = rowsByKey.get(key);
      if (existing) {
        if (!existing.profiles.includes(profile.name)) {
          existing.profiles.push(profile.name);
        }
        if (profile.scoreFile && !existing.scoreFiles.includes(profile.scoreFile)) {
          existing.scoreFiles.push(profile.scoreFile);
        }
        continue;
      }
      rowsByKey.set(key, {
        id: item.id,
        summary: item.summary,
        standards,
        profiles: [profile.name],
        scoreFiles: profile.scoreFile ? [profile.scoreFile] : []
      });
    }
  }
  return Array.from(rowsByKey.values());
}

function buildStandardsGateBasisSummary(profiles) {
  const rowsByKey = new Map();
  for (const profile of profiles) {
    const details = profile.scorecardDetails || {};
    for (const [gate, detail] of Object.entries(details)) {
      const missingProof = arrayOfStrings(detail.missingProof);
      if (!detail.basis || detail.confidence !== 'High' || missingProof.length > 0) {
        continue;
      }
      const standards = arrayOfStrings(detail.standards);
      const key = [
        gate,
        detail.status || '',
        detail.confidence || '',
        detail.basis || '',
        standards.join('/')
      ].join('\u0001');
      const existing = rowsByKey.get(key);
      if (existing) {
        if (!existing.profiles.includes(profile.name)) {
          existing.profiles.push(profile.name);
        }
        if (profile.scoreFile && !existing.scoreFiles.includes(profile.scoreFile)) {
          existing.scoreFiles.push(profile.scoreFile);
        }
        continue;
      }
      rowsByKey.set(key, {
        gate,
        status: detail.status,
        confidence: detail.confidence,
        basis: detail.basis,
        standards,
        profiles: [profile.name],
        scoreFiles: profile.scoreFile ? [profile.scoreFile] : []
      });
    }
  }
  return Array.from(rowsByKey.values());
}

function buildStandardsGateDetailSummary(profiles) {
  const rowsByKey = new Map();
  for (const profile of profiles) {
    const details = profile.scorecardDetails || {};
    for (const [gate, detail] of Object.entries(details)) {
      const missingProof = arrayOfStrings(detail.missingProof);
      const hasLowerConfidence = detail.confidence !== 'High';
      if (!detail.basis || (!hasLowerConfidence && missingProof.length === 0)) {
        continue;
      }
      const standards = arrayOfStrings(detail.standards);
      const key = [
        gate,
        detail.status || '',
        detail.confidence || '',
        detail.basis || '',
        standards.join('/'),
        missingProof.join('\u0000')
      ].join('\u0001');
      const existing = rowsByKey.get(key);
      if (existing) {
        if (!existing.profiles.includes(profile.name)) {
          existing.profiles.push(profile.name);
        }
        if (profile.scoreFile && !existing.scoreFiles.includes(profile.scoreFile)) {
          existing.scoreFiles.push(profile.scoreFile);
        }
        continue;
      }
      rowsByKey.set(key, {
        gate,
        status: detail.status,
        confidence: detail.confidence,
        basis: detail.basis,
        standards,
        missingProof,
        profiles: [profile.name],
        scoreFiles: profile.scoreFile ? [profile.scoreFile] : []
      });
    }
  }
  return Array.from(rowsByKey.values());
}

function markdownCell(value) {
  return String(value || '-').replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function profilesMatchCompleteSet(profiles, completeProfiles) {
  return Array.isArray(profiles)
    && Array.isArray(completeProfiles)
    && profiles.length > 0
    && profiles.length === completeProfiles.length
    && profiles.every((profile, index) => profile === completeProfiles[index]);
}

function renderProfileList(profiles, completeProfiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return 'none';
  }
  return profilesMatchCompleteSet(profiles, completeProfiles) ? 'all profiles' : profiles.join(', ');
}

function renderStandardsEvidenceSummary(summary, completeProfiles = []) {
  if (!Array.isArray(summary) || summary.length === 0) {
    return [];
  }
  const lines = [
    '| Evidence | Standards | Profiles | Paths |',
    '| --- | --- | --- | --- |'
  ];
  for (const row of summary) {
    const label = row.summary || row.id || 'Retained evidence';
    const standards = Array.isArray(row.standards) && row.standards.length > 0 ? row.standards.join('/') : 'none';
    const profiles = renderProfileList(row.profiles, completeProfiles);
    const paths = Array.isArray(row.evidencePaths) && row.evidencePaths.length > 0 ? row.evidencePaths.map(markdownCell).join('<br>') : '-';
    lines.push(`| ${markdownCell(label)} | ${markdownCell(standards)} | ${markdownCell(profiles)} | ${paths} |`);
  }
  return lines;
}

function renderStandardsScoreFileLegend(legend) {
  if (!Array.isArray(legend) || legend.length === 0) {
    return [];
  }
  const lines = [
    '| Profile | Score File |',
    '| --- | --- |'
  ];
  for (const row of legend) {
    lines.push(`| ${markdownCell(row.profile || 'unknown')} | ${markdownCell(row.scoreFile || '-')} |`);
  }
  return lines;
}

function renderStandardsGateStrengthSummary(summary, completeProfiles = []) {
  if (!Array.isArray(summary) || summary.length === 0) {
    return [];
  }
  const lines = [
    '| Gate Strength | Standards | Profiles |',
    '| --- | --- | --- |'
  ];
  for (const row of summary) {
    const label = row.summary || row.id || 'Retained gate strength';
    const standards = Array.isArray(row.standards) && row.standards.length > 0 ? row.standards.join('/') : 'none';
    const profiles = renderProfileList(row.profiles, completeProfiles);
    lines.push(`| ${markdownCell(label)} | ${markdownCell(standards)} | ${markdownCell(profiles)} |`);
  }
  return lines;
}

function renderStandardsGateBasisSummary(summary, completeProfiles = []) {
  if (!Array.isArray(summary) || summary.length === 0) {
    return [];
  }
  const lines = [
    '| Gate | Status | Confidence | Standards | Basis | Profiles |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const row of summary) {
    const standards = Array.isArray(row.standards) && row.standards.length > 0 ? row.standards.join('/') : 'none';
    const profiles = renderProfileList(row.profiles, completeProfiles);
    lines.push(`| ${markdownCell(row.gate || 'unknown')} | ${markdownCell(row.status || 'UNKNOWN')} | ${markdownCell(row.confidence || 'unknown')} | ${markdownCell(standards)} | ${markdownCell(row.basis || '-')} | ${markdownCell(profiles)} |`);
  }
  return lines;
}

function renderStandardsGateDetailSummary(summary, completeProfiles = []) {
  if (!Array.isArray(summary) || summary.length === 0) {
    return [];
  }
  const lines = [
    '| Gate | Status | Confidence | Standards | Basis | Missing Proof | Profiles |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const row of summary) {
    const standards = Array.isArray(row.standards) && row.standards.length > 0 ? row.standards.join('/') : 'unmapped';
    const missingProof = Array.isArray(row.missingProof) && row.missingProof.length > 0 ? row.missingProof.map(markdownCell).join('<br>') : '-';
    const profiles = renderProfileList(row.profiles, completeProfiles);
    lines.push(`| ${markdownCell(row.gate || 'unknown')} | ${markdownCell(row.status || 'UNKNOWN')} | ${markdownCell(row.confidence || 'unknown')} | ${markdownCell(standards)} | ${markdownCell(row.basis || '-')} | ${missingProof} | ${markdownCell(profiles)} |`);
  }
  return lines;
}

function buildAuditRunProvenanceSummary(context, directCheckSummaries = [], profileSummaries = []) {
  const snapshot = context.snapshot || {};
  const commands = [];
  const addCommand = (stage, step) => {
    if (!step || !step.name) {
      return;
    }
    commands.push({
      stage,
      name: step.name,
      status: step.status,
      file: step.file,
      command: step.command
    });
  };

  for (const step of context.imagePreparation || []) {
    addCommand('image', step);
  }
  for (const step of directCheckSummaries || []) {
    addCommand('direct-check', step);
  }
  for (const step of profileSummaries || []) {
    addCommand('profile', step);
  }

  return {
    snapshot: {
      mode: snapshot.mode,
      path: snapshot.path,
      trackedFileCount: snapshot.trackedFileCount,
      removed: snapshot.removed,
      symlinkFiles: arrayOfStrings(snapshot.symlinkFiles),
      missingFiles: arrayOfStrings(snapshot.missingFiles),
      generatedRootsExcluded: arrayOfStrings(snapshot.generatedRootsExcluded)
    },
    commands
  };
}

function renderValueList(values) {
  return Array.isArray(values) && values.length > 0 ? values.map(markdownCell).join('<br>') : '-';
}

function renderAuditRunProvenanceSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return [];
  }
  const snapshot = summary.snapshot || {};
  const commands = Array.isArray(summary.commands) ? summary.commands : [];
  if (Object.keys(snapshot).length === 0 && commands.length === 0) {
    return [];
  }

  const lines = [
    'Snapshot:',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Mode | ${markdownCell(snapshot.mode || '-')} |`,
    `| Path | ${markdownCell(snapshot.path || '-')} |`,
    `| Tracked Files | ${markdownCell(snapshot.trackedFileCount !== undefined ? snapshot.trackedFileCount : '-')} |`,
    `| Removed After Run | ${markdownCell(snapshot.removed === true ? 'yes' : snapshot.removed === false ? 'no' : 'unknown')} |`,
    `| Symlink Files | ${renderValueList(snapshot.symlinkFiles)} |`,
    `| Missing Files | ${renderValueList(snapshot.missingFiles)} |`,
    `| Generated Roots Excluded | ${renderValueList(snapshot.generatedRootsExcluded)} |`
  ];

  if (commands.length > 0) {
    lines.push('');
    lines.push('Commands:');
    lines.push('');
    lines.push('| Stage | Step | Result | Artifact | Command |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const command of commands) {
      const result = command.status === 0 ? 'pass' : `FAIL (${command.status})`;
      lines.push(`| ${markdownCell(command.stage || 'unknown')} | ${markdownCell(command.name || 'unknown')} | ${markdownCell(result)} | ${markdownCell(command.file || '-')} | ${markdownCell(command.command || '-')} |`);
    }
  }

  return lines;
}

function renderStandardsCoverageCell(detail) {
  if (!detail || typeof detail !== 'object') {
    return '-';
  }
  const score = detail.score !== undefined ? `${detail.score}/5` : '?/5';
  const confidence = detail.confidence || 'unknown';
  const standards = Array.isArray(detail.standards) && detail.standards.length > 0
    ? ` (${detail.standards.join('/')})`
    : '';
  return `${score} ${confidence}${standards}`;
}

function renderStandardsCoverageMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return [];
  }
  const lines = [
    '| Profiles | REQ | ARCH | TEST | CM | DOC |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  const rowsByKey = new Map();
  for (const row of matrix) {
    const areas = row.areas || {};
    const cells = {
      req: renderStandardsCoverageCell(areas.REQ),
      arch: renderStandardsCoverageCell(areas.ARCH),
      test: renderStandardsCoverageCell(areas.TEST),
      cm: renderStandardsCoverageCell(areas.CM),
      doc: renderStandardsCoverageCell(areas.DOC)
    };
    const key = [cells.req, cells.arch, cells.test, cells.cm, cells.doc].join('\u0001');
    const existing = rowsByKey.get(key);
    if (existing) {
      existing.profiles.push(row.profile || 'unknown');
      continue;
    }
    rowsByKey.set(key, { profiles: [row.profile || 'unknown'], ...cells });
  }
  for (const row of rowsByKey.values()) {
    lines.push(`| ${markdownCell(row.profiles.join(', '))} | ${markdownCell(row.req)} | ${markdownCell(row.arch)} | ${markdownCell(row.test)} | ${markdownCell(row.cm)} | ${markdownCell(row.doc)} |`);
  }
  return lines;
}

function renderStandardsCoverageRationaleSummary(summary, completeProfiles = []) {
  if (!Array.isArray(summary) || summary.length === 0) {
    return [];
  }
  const lines = [
    '| Area | Rationale | Standards | Profiles |',
    '| --- | --- | --- | --- |'
  ];
  for (const row of summary) {
    const standards = Array.isArray(row.standards) && row.standards.length > 0 ? row.standards.join('/') : 'none';
    const profiles = renderProfileList(row.profiles, completeProfiles);
    lines.push(`| ${markdownCell(row.area || 'unknown')} | ${markdownCell(row.rationale || '-')} | ${markdownCell(standards)} | ${markdownCell(profiles)} |`);
  }
  return lines;
}

function renderGateScorecardSummary(step) {
  const details = step.scorecardDetails || {};
  if (Object.keys(details).length > 0) {
    return Object.entries(details).map(([gate, detail]) => {
      const confidence = detail.confidence ? `(${detail.confidence})` : '';
      const missingProof = Array.isArray(detail.missingProof) && detail.missingProof.length > 0
        ? ` missing=${detail.missingProof.join('; ')}`
        : '';
      return `${gate}=${detail.status || 'UNKNOWN'}${confidence}${missingProof}`;
    }).join(', ');
  }
  return Object.entries(step.scorecard).map(([gate, status]) => `${gate}=${status}`).join(', ');
}

function renderPortfolioSummary(portfolio) {
  const details = [];
  if (portfolio.overall) {
    details.push(`overall=${portfolio.overall}`);
  }
  if (portfolio.gates) {
    details.push(`gates=${portfolio.gates}`);
  }
  if (portfolio.areaScores && typeof portfolio.areaScores === 'object') {
    for (const area of ['REQ', 'ARCH', 'TEST', 'CM', 'DOC']) {
      if (portfolio.areaScores[area] !== undefined) {
        details.push(`${area}=${portfolio.areaScores[area]}`);
      }
    }
  }
  if (portfolio.topRisk) {
    details.push(`topRisk=${portfolio.topRisk}`);
  }
  return details.length > 0 ? `${details.join(', ')} (see ${portfolio.tableFile})` : `see ${portfolio.tableFile}`;
}

function renderProfileSignalLines(profileSummaries) {
  const scorecardRowsBySummary = new Map();
  const portfolioRows = [];

  for (const step of profileSummaries) {
    if (step.scorecard && Object.keys(step.scorecard).length > 0) {
      const summary = renderGateScorecardSummary(step);
      const existing = scorecardRowsBySummary.get(summary);
      if (existing) {
        existing.profiles.push(step.name);
        continue;
      }
      scorecardRowsBySummary.set(summary, { profiles: [step.name], summary });
    } else if (step.portfolio) {
      portfolioRows.push(`- ${step.name}: ${renderPortfolioSummary(step.portfolio)}`);
    }
  }

  return [
    ...Array.from(scorecardRowsBySummary.values()).map((row) => `- ${row.profiles.join(', ')}: ${row.summary}`),
    ...portfolioRows
  ];
}

function renderDirectCheckEvidenceSummary(directCheckSummaries) {
  if (!Array.isArray(directCheckSummaries) || directCheckSummaries.length === 0) {
    return [];
  }
  const lines = [
    '| Check | Artifact | Result | Findings | Checked Paths |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const step of directCheckSummaries) {
    let result = step.status === 0 ? 'pass' : `FAIL (${step.status})`;
    let findings = '-';
    let checkedPaths = '-';
    if (step.requirementsQuality) {
      result = step.requirementsQuality.ok ? 'ok' : 'not ok';
      findings = typeof step.requirementsQuality.findingCount === 'number' ? String(step.requirementsQuality.findingCount) : '-';
    }
    if (step.externalUserInformation) {
      result = step.externalUserInformation.ok ? 'ok' : 'not ok';
      findings = typeof step.externalUserInformation.findingCount === 'number' ? String(step.externalUserInformation.findingCount) : '-';
      const paths = arrayOfStrings(step.externalUserInformation.checkedPaths);
      checkedPaths = paths.length > 0 ? paths.map(markdownCell).join('<br>') : '-';
    }
    lines.push(`| ${markdownCell(step.name || 'unknown')} | ${markdownCell(step.file || '-')} | ${markdownCell(result)} | ${markdownCell(findings)} | ${checkedPaths} |`);
  }
  return lines;
}

function directStepIsClean(step) {
  if (step.status !== 0) {
    return false;
  }
  const summary = summarizeDirectStep(step);
  if (summary.requirementsQuality) {
    return summary.requirementsQuality.ok === true;
  }
  if (summary.externalUserInformation) {
    return summary.externalUserInformation.ok === true;
  }
  return true;
}

function renderMarkdown(context) {
  const lines = [];
  lines.push('# Multi-Standard Audit');
  lines.push('');
  lines.push(`- Standards image: ${context.options.image}`);
  if (context.imageAccess) {
    lines.push(`- Docker image access: ${context.imageAccess}`);
  }
  lines.push(`- Requirements scope: ${context.options.requirementsSpecScope}`);
  lines.push(`- Output directory: ${context.outputDir}`);
  lines.push(`- Snapshot: ${context.snapshot.mode}, ${context.snapshot.trackedFileCount} tracked files`);
  if (context.snapshot.removed === false) {
    lines.push(`- Snapshot retained: ${context.snapshot.path}`);
  }
  lines.push('');
  lines.push('## Command Results');
  lines.push('');
  for (const step of context.imagePreparation) {
    lines.push(`- ${step.name}: ${step.status === 0 ? 'pass' : `FAIL (${step.status})`}`);
  }
  for (const step of context.directChecks) {
    lines.push(`- ${step.name}: ${step.status === 0 ? 'pass' : `FAIL (${step.status})`} -> ${step.file}`);
  }
  for (const step of context.profiles) {
    lines.push(`- ${step.name}: ${step.status === 0 ? 'pass' : `FAIL (${step.status})`} -> ${step.file}`);
  }
  const directCheckSummaries = context.directChecks.map(summarizeDirectStep);
  const profileSummaries = context.profiles.map((step) => summarizeProfileStep(step, { outputDir: context.outputDir }));
  const auditRunProvenanceLines = renderAuditRunProvenanceSummary(buildAuditRunProvenanceSummary(context, directCheckSummaries, profileSummaries));
  if (auditRunProvenanceLines.length > 0) {
    lines.push('');
    lines.push('## Audit Run Provenance');
    lines.push('');
    lines.push(...auditRunProvenanceLines);
  }
  lines.push('');
  lines.push('## Signals');
  lines.push('');
  for (const step of directCheckSummaries) {
    if (step.requirementsQuality) {
      lines.push(`- Requirements quality: ${step.requirementsQuality.ok ? 'ok' : 'not ok'}${typeof step.requirementsQuality.findingCount === 'number' ? ` (${step.requirementsQuality.findingCount} finding(s))` : ''}`);
    }
    if (step.externalUserInformation) {
      const checked = typeof step.externalUserInformation.checkedPathCount === 'number'
        ? `, ${step.externalUserInformation.checkedPathCount} checked path(s)`
        : '';
      lines.push(`- External user information: ${step.externalUserInformation.ok ? 'ok' : 'not ok'}${typeof step.externalUserInformation.findingCount === 'number' ? ` (${step.externalUserInformation.findingCount} finding(s)${checked})` : ''}`);
    }
  }
  lines.push(...renderProfileSignalLines(profileSummaries));
  const standardsProfileSet = profileSummaries.map((row) => row.name);
  const directCheckEvidenceLines = renderDirectCheckEvidenceSummary(directCheckSummaries);
  if (directCheckEvidenceLines.length > 0) {
    lines.push('');
    lines.push('## Direct Check Evidence Summary');
    lines.push('');
    lines.push(...directCheckEvidenceLines);
  }
  const standardsCoverageMatrix = buildStandardsCoverageMatrix(profileSummaries);
  const standardsCoverageLines = renderStandardsCoverageMatrix(standardsCoverageMatrix);
  if (standardsCoverageLines.length > 0) {
    lines.push('');
    lines.push('## Standards Coverage Matrix');
    lines.push('');
    lines.push(...standardsCoverageLines);
  }
  const standardsCoverageRationaleSummary = buildStandardsCoverageRationaleSummary(standardsCoverageMatrix);
  const standardsCoverageRationaleLines = renderStandardsCoverageRationaleSummary(standardsCoverageRationaleSummary, standardsProfileSet);
  if (standardsCoverageRationaleLines.length > 0) {
    lines.push('');
    lines.push('## Standards Coverage Rationale Summary');
    lines.push('');
    lines.push(...standardsCoverageRationaleLines);
  }
  const standardsScoreFileLegend = buildStandardsScoreFileLegend(profileSummaries);
  const standardsScoreFileLegendLines = renderStandardsScoreFileLegend(standardsScoreFileLegend);
  if (standardsScoreFileLegendLines.length > 0) {
    lines.push('');
    lines.push('## Standards Score File Legend');
    lines.push('');
    lines.push(...standardsScoreFileLegendLines);
  }
  const standardsEvidenceSummary = buildStandardsEvidenceSummary(profileSummaries);
  const standardsEvidenceLines = renderStandardsEvidenceSummary(standardsEvidenceSummary, standardsProfileSet);
  if (standardsEvidenceLines.length > 0) {
    lines.push('');
    lines.push('## Standards Evidence Summary');
    lines.push('');
    lines.push(...standardsEvidenceLines);
  }
  const standardsGateStrengthSummary = buildStandardsGateStrengthSummary(profileSummaries);
  const standardsGateStrengthLines = renderStandardsGateStrengthSummary(standardsGateStrengthSummary, standardsProfileSet);
  if (standardsGateStrengthLines.length > 0) {
    lines.push('');
    lines.push('## Standards Gate Strength Summary');
    lines.push('');
    lines.push(...standardsGateStrengthLines);
  }
  const standardsGateBasisSummary = buildStandardsGateBasisSummary(profileSummaries);
  const standardsGateBasisLines = renderStandardsGateBasisSummary(standardsGateBasisSummary, standardsProfileSet);
  if (standardsGateBasisLines.length > 0) {
    lines.push('');
    lines.push('## Standards Gate Basis Summary');
    lines.push('');
    lines.push(...standardsGateBasisLines);
  }
  const standardsGateDetailSummary = buildStandardsGateDetailSummary(profileSummaries);
  const standardsGateDetailLines = renderStandardsGateDetailSummary(standardsGateDetailSummary, standardsProfileSet);
  if (standardsGateDetailLines.length > 0) {
    lines.push('');
    lines.push('## Standards Gate Detail Summary');
    lines.push('');
    lines.push(...standardsGateDetailLines);
  }
  lines.push('');
  lines.push('## Prioritization Use');
  lines.push('');
  lines.push('- Treat direct 29148 and 26514 failures as the first fix candidates because they report exact requirement or user-information findings.');
  lines.push('- Treat profile gate failures as cross-standard candidates and inspect the matching saved profile evidence before opening a follow-up issue.');
  lines.push('- When all checks pass, retain the packet as advisory assurance evidence; it is not a hosted CI gate or release substitute.');
  return lines.join('\n');
}

// Published JSON Schema for the retained multi-standards audit-summary.json
// packet, so consumers can validate the packet and the `--schema` mode can
// publish the contract without running the audit. Shares the self-describing
// envelope via scripts/lib/schemaEnvelope.js. The rich nested check/profile/
// coverage records use permissive object shapes for forward-compatibility.
const MULTI_STANDARDS_AUDIT_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DIALECT,
  $id: MULTI_STANDARDS_AUDIT_SCHEMA_ID,
  title: 'vi-history-suite multi-standards audit summary',
  type: 'object',
  additionalProperties: true,
  required: [
    '$schema',
    'schemaVersion',
    'options',
    'outputDir',
    'directChecks',
    'profiles',
    'success'
  ],
  properties: {
    ...schemaEnvelopePropertyNodes(MULTI_STANDARDS_AUDIT_SCHEMA_ID, SCHEMA_VERSION),
    options: { type: 'object' },
    outputDir: { type: 'string' },
    imageAccess: { type: 'string' },
    imagePreparation: { type: 'array', items: { type: 'object' } },
    snapshot: { type: 'object' },
    directChecks: { type: 'array', items: { type: 'object' } },
    profiles: { type: 'array', items: { type: 'object' } },
    success: { type: 'boolean' }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(MULTI_STANDARDS_AUDIT_JSON_SCHEMA, options);
}

function runMultiStandardsAudit(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    return { exitCode: 0, markdown: usage(), context: { options } };
  }
  // --schema publishes the JSON Schema without running the audit.
  if (options.schema) {
    return { exitCode: 0, markdown: renderSchema(), context: { options, schema: true } };
  }

  const cwd = deps.cwd || process.cwd();
  const runId = options.runId || buildRunId(deps.now ? deps.now() : new Date());
  const outputDir = path.resolve(cwd, options.saveDir, runId);
  ensureDir(outputDir, deps);
  writeText(path.join(outputDir, 'image.txt'), `${options.image}\n`, deps);

  const createSnapshot = deps.createTrackedWorktreeSnapshot || createTrackedWorktreeSnapshot;
  const removeSnapshot = deps.removeTrackedWorktreeSnapshot || removeTrackedWorktreeSnapshot;
  const snapshot = createSnapshot(cwd, deps);
  writeJson(path.join(outputDir, 'snapshot.json'), snapshot, deps);
  writeText(path.join(outputDir, 'snapshot-path.txt'), `${snapshot.path}\n`, deps);

  try {
    const { imageInspect, imagePreparation, imageAccess } = prepareStandardsImage(options, outputDir, deps, cwd);
    const directChecks = imageInspect.status === 0
      ? directDockerSteps(options).map((step) => runAuditStep(outputDir, step, snapshot.path, { ...deps, cwd }))
      : [];
    const profiles = imageInspect.status === 0
      ? profileDockerSteps(options).map((step) => runAuditStep(outputDir, step, snapshot.path, { ...deps, cwd }))
      : [];

    const context = {
      ...schemaEnvelopeFields(MULTI_STANDARDS_AUDIT_SCHEMA_ID, SCHEMA_VERSION),
      options: { ...options, runId },
      outputDir,
      imageAccess,
      imagePreparation: imagePreparation.map((step) => ({
        name: step.name,
        file: step.file,
        status: step.status,
        command: commandLine(step.command, step.args)
      })),
      snapshot: { ...snapshot, removed: !options.keepSnapshot },
      directChecks,
      profiles
    };
    const markdown = renderMarkdown(context);
    const summary = {
      ...context,
      directChecks: directChecks.map(summarizeDirectStep),
      profiles: profiles.map((step) => summarizeProfileStep(step, { outputDir })),
      success: imageInspect.status === 0 && directChecks.every(directStepIsClean) && profiles.every((step) => step.status === 0)
    };
    summary.standardsCoverageMatrix = buildStandardsCoverageMatrix(summary.profiles);
    summary.standardsCoverageRationaleSummary = buildStandardsCoverageRationaleSummary(summary.standardsCoverageMatrix);
    summary.standardsScoreFileLegend = buildStandardsScoreFileLegend(summary.profiles);
    summary.standardsEvidenceSummary = buildStandardsEvidenceSummary(summary.profiles);
    summary.standardsGateStrengthSummary = buildStandardsGateStrengthSummary(summary.profiles);
    summary.standardsGateBasisSummary = buildStandardsGateBasisSummary(summary.profiles);
    summary.standardsGateDetailSummary = buildStandardsGateDetailSummary(summary.profiles);
    writeJson(path.join(outputDir, 'audit-summary.json'), summary, deps);
    writeText(path.join(outputDir, 'audit-summary.md'), markdown, deps);
    return { exitCode: summary.success ? 0 : 1, markdown, context: summary };
  } finally {
    if (!options.keepSnapshot) {
      removeSnapshot(snapshot, deps);
    }
  }
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = runMultiStandardsAudit(argv, deps);
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
  DEFAULT_REQUIREMENTS_SPEC_SCOPE,
  MULTI_STANDARDS_AUDIT_SCHEMA_ID,
  MULTI_STANDARDS_AUDIT_JSON_SCHEMA,
  SCHEMA_VERSION,
  GATE_SCORECARD_PROFILES,
  PORTFOLIO_PROFILE,
  buildRunId,
  parseArgs,
  renderSchema,
  directDockerSteps,
  profileDockerSteps,
  replaceAuditMounts,
  summarizeExternalUserInformation,
  summarizePortfolioTable,
  summarizeGateScorecard,
  summarizeRetainedGateScore,
  summarizeRetainedStandardsCoverage,
  summarizeRetainedStandardsEvidence,
  summarizeDirectStep,
  summarizeProfileStep,
  profileScoreFile,
  buildAuditRunProvenanceSummary,
  buildStandardsCoverageMatrix,
  buildStandardsCoverageRationaleSummary,
  buildStandardsScoreFileLegend,
  buildStandardsEvidenceSummary,
  buildStandardsGateStrengthSummary,
  buildStandardsGateBasisSummary,
  buildStandardsGateDetailSummary,
  renderAuditRunProvenanceSummary,
  renderStandardsCoverageMatrix,
  renderStandardsCoverageRationaleSummary,
  renderStandardsEvidenceSummary,
  renderStandardsScoreFileLegend,
  renderStandardsGateStrengthSummary,
  renderStandardsGateBasisSummary,
  renderStandardsGateDetailSummary,
  renderProfileSignalLines,
  renderDirectCheckEvidenceSummary,
  renderMarkdown,
  runMultiStandardsAudit,
  main
};