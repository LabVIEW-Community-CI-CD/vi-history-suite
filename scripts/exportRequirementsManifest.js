#!/usr/bin/env node

/**
 * Versioned requirements manifest exporter (VHS-REQ-601).
 *
 * The requirements source of truth (docs/requirements/srs.md + rtm.csv) is
 * repo-only: it is NOT shipped in the VSIX (package.json `files` ships out/**,
 * resources/**, README, CHANGELOG, LICENSE). That leaves no way for a future
 * human or agent to know exactly which requirements shipped with a given
 * installed extension version.
 *
 * This exporter serializes the active requirement set into a build product
 * out/requirements/requirements-manifest.json (plus a human-readable .md),
 * stamped with the same extensionVersion + extensionCommit that
 * generateBuildInfo.js writes to out/buildInfo.json. Because it is generated
 * under out/ at `compile`, it ships inside the VSIX automatically and can also
 * be uploaded as an ephemeral CI artifact for local agent consumption without a
 * marketplace release.
 *
 * The manifest carries a deterministic `integrityDigest` (sha256 over the
 * canonical, version/time-independent requirement content) so a future agent can
 * detect requirements drift between two shipped versions by comparing digests.
 *
 * Pure helpers stay separate from a thin CLI so parsing/serialization is
 * unit-testable with injected fixtures. It uses only Node built-ins plus the
 * sibling traceability-audit module (parseCsv/splitReferences), so it needs no
 * dependency install. The SRS parser is intentionally local (mirroring the
 * per-script parsing in checkRequirementsIntegrity.js /
 * auditRequirementCriteriaInventory.js); extracting a shared requirements model
 * is a separate future refactor.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const { parseCsv, splitReferences } = require('./auditTraceabilitySteward.js');
const { JSON_SCHEMA_DIALECT, renderSchemaDocument } = require('./lib/schemaEnvelope.js');
const { parseSharedOutputArgs } = require('./lib/outputContract.js');

const SRS_PATH = 'docs/requirements/srs.md';
const RTM_PATH = 'docs/requirements/rtm.csv';
const DEFAULT_OUTPUT_DIR = 'out/requirements';
const MANIFEST_BASENAME = 'requirements-manifest';
const SCHEMA_VERSION = 1;
const MANIFEST_SCHEMA_ID =
  'https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/requirements/requirements-manifest.schema.json';
const UNKNOWN_COMMIT = '<unknown>';

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
  const manifestPath = path.join(repoRoot, 'package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
}

// Collapse internal whitespace / wrapped-line runs to single spaces so the
// serialized statement/criterion text is stable regardless of source wrapping.
function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripReference(reference) {
  return reference.replace(/`/g, '').trim();
}

// Slice srs.md into per-requirement blocks keyed by the software requirement
// heading, mirroring auditRequirementCriteriaInventory.extractRequirementCriteria.
function sliceRequirementBlocks(srsText) {
  const blocks = [];
  const headingPattern = /^### (VHS-REQ-\d+):[ \t]*(.*)$/gm;
  const headings = [...srsText.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const id = headings[index][1];
    const title = normalizeText(headings[index][2] || '');
    const start = headings[index].index;
    const end = index + 1 < headings.length ? headings[index + 1].index : srsText.length;
    blocks.push({ id, title, body: srsText.slice(start, end) });
  }
  return blocks;
}

// Read a single-line `- Field:` value (e.g. Status/Parent/Area).
function readScalarField(blockBody, field) {
  const match = new RegExp(`^- ${field}:[ \\t]*(.+)$`, 'm').exec(blockBody);
  return match ? normalizeText(match[1]) : '';
}

// Read a multi-line `- Field:` value that continues on indented lines until the
// next top-level `- Field:` bullet (e.g. Statement).
function readBlockField(blockBody, field) {
  const lines = blockBody.split('\n');
  let capturing = false;
  const collected = [];
  const startPattern = new RegExp(`^- ${field}:[ \\t]*(.*)$`);
  for (const line of lines) {
    if (capturing) {
      if (/^- [A-Za-z]/.test(line)) {
        break;
      }
      collected.push(line);
      continue;
    }
    const match = startPattern.exec(line);
    if (match) {
      capturing = true;
      if (match[1]) {
        collected.push(match[1]);
      }
    }
  }
  return normalizeText(collected.join(' '));
}

// Enumerate the two-space bullet list under a `- Field:` heading, joining
// indented continuation lines. Used for Acceptance Criteria and the reference
// lists. Mirrors auditRequirementCriteriaInventory.extractAcceptanceCriteria.
function readBulletField(blockBody, field) {
  const bullets = [];
  let inSection = false;
  let current = null;

  const flush = () => {
    if (current !== null) {
      bullets.push(normalizeText(current));
      current = null;
    }
  };

  for (const line of blockBody.split('\n')) {
    if (/^- [A-Za-z]/.test(line)) {
      flush();
      inSection = line.trim() === `- ${field}:`;
      continue;
    }
    if (!inSection) {
      continue;
    }
    const bulletMatch = /^ {2}- (.+)$/.exec(line);
    if (bulletMatch) {
      flush();
      current = bulletMatch[1].trim();
    } else if (current !== null && /^\s+\S/.test(line)) {
      current += ` ${line.trim()}`;
    }
  }
  flush();
  return bullets;
}

// Parse the active software requirement records from srs.md. Only requirements
// whose Status is Active are exported (mirrors the criterion inventory).
function parseRequirementsFromSrs(srsText) {
  const normalized = srsText.replace(/\r\n/g, '\n');
  const requirements = [];
  for (const block of sliceRequirementBlocks(normalized)) {
    const status = readScalarField(block.body, 'Status');
    if (status !== 'Active') {
      continue;
    }
    const acceptanceCriteria = readBulletField(block.body, 'Acceptance Criteria').map(
      (text, index) => ({ id: `${block.id}.${index + 1}`, text })
    );
    requirements.push({
      id: block.id,
      status,
      area: readScalarField(block.body, 'Area'),
      title: block.title,
      parent: readScalarField(block.body, 'Parent'),
      statement: readBlockField(block.body, 'Statement'),
      acceptanceCriteria,
      implementationRefs: readBulletField(block.body, 'Implementation References').map(stripReference),
      verificationRefs: readBulletField(block.body, 'Verification References').map(stripReference)
    });
  }
  requirements.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  return requirements;
}

// Active requirement IDs present in the RTM (used to keep the manifest aligned
// to the RTM ID set; the integrity gate independently enforces SRS/RTM equality).
function parseActiveRtmIds(rtmText) {
  const ids = new Set();
  for (const row of parseCsv(rtmText.replace(/\r\n/g, '\n'))) {
    const id = (row.ReqID || '').trim();
    const status = (row.Status || '').trim();
    if (/^VHS-REQ-\d+$/.test(id) && status === 'Active') {
      ids.add(id);
    }
  }
  return ids;
}

// Deterministic digest over the version/time-INDEPENDENT requirement content so
// two shipped manifests can be compared for real requirements drift regardless
// of build version, commit, or generation time.
function computeIntegrityDigest(requirements) {
  const canonical = JSON.stringify({ schemaVersion: SCHEMA_VERSION, requirements });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function buildRequirementsManifest(options = {}) {
  const srsText = options.srsText;
  if (typeof srsText !== 'string') {
    throw new Error(`SRS not found at ${SRS_PATH}`);
  }
  const requirements = parseRequirementsFromSrs(srsText);

  if (typeof options.rtmText === 'string') {
    const rtmIds = parseActiveRtmIds(options.rtmText);
    const srsIds = new Set(requirements.map((requirement) => requirement.id));
    const onlyInSrs = [...srsIds].filter((id) => !rtmIds.has(id));
    const onlyInRtm = [...rtmIds].filter((id) => !srsIds.has(id));
    if (onlyInSrs.length > 0 || onlyInRtm.length > 0) {
      throw new Error(
        `SRS/RTM active requirement ID sets disagree (only in SRS: ${onlyInSrs.join(', ') || 'none'}; ` +
          `only in RTM: ${onlyInRtm.join(', ') || 'none'}). Resolve with npm run requirements:integrity.`
      );
    }
  }

  const criteria = requirements.reduce(
    (total, requirement) => total + requirement.acceptanceCriteria.length,
    0
  );

  return {
    $schema: MANIFEST_SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    extensionVersion: options.extensionVersion,
    extensionCommit: options.extensionCommit,
    generatedAt: options.generatedAt,
    counts: { requirements: requirements.length, criteria },
    requirements,
    integrityDigest: computeIntegrityDigest(requirements)
  };
}

function renderManifestMarkdown(manifest) {
  const lines = [];
  lines.push('# Requirements Manifest');
  lines.push('');
  lines.push(`- Extension version: \`${manifest.extensionVersion}\``);
  lines.push(`- Extension commit: \`${manifest.extensionCommit}\``);
  lines.push(`- Generated at: ${manifest.generatedAt}`);
  lines.push(`- Requirements: ${manifest.counts.requirements}`);
  lines.push(`- Acceptance criteria: ${manifest.counts.criteria}`);
  lines.push(`- Integrity digest: \`${manifest.integrityDigest}\``);
  lines.push('');
  lines.push('| Requirement | Area | Title | Criteria |');
  lines.push('| --- | --- | --- | ---: |');
  for (const requirement of manifest.requirements) {
    const title = requirement.title.replace(/\|/g, '\\|');
    const area = requirement.area.replace(/\|/g, '\\|');
    lines.push(
      `| \`${requirement.id}\` | ${area} | ${title} | ${requirement.acceptanceCriteria.length} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

function exportRequirementsManifest(deps = {}) {
  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..');
  const outputDir = deps.outputDir ?? path.join(repoRoot, ...DEFAULT_OUTPUT_DIR.split('/'));
  const readFile =
    deps.readFile ??
    ((relativePath) => fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8'));
  const writeFile = deps.writeFile ?? fs.writeFileSync;
  const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
  const getCommit = deps.getGitCommit ?? getGitCommit;
  const getVersion = deps.getPackageVersion ?? getPackageVersion;
  const now = deps.now ?? (() => new Date());
  const includeMarkdown = deps.includeMarkdown ?? true;

  const srsText = readFile(SRS_PATH);
  let rtmText;
  try {
    rtmText = readFile(RTM_PATH);
  } catch {
    rtmText = undefined;
  }

  const manifest = buildRequirementsManifest({
    srsText,
    rtmText,
    extensionVersion: getVersion(repoRoot),
    extensionCommit: getCommit(),
    generatedAt: now().toISOString()
  });

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${MANIFEST_BASENAME}.json`);
  writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  let markdownPath;
  if (includeMarkdown) {
    markdownPath = path.join(outputDir, `${MANIFEST_BASENAME}.md`);
    writeFile(markdownPath, renderManifestMarkdown(manifest), 'utf8');
  }

  return { jsonPath, markdownPath, manifest };
}

// Published JSON Schema for the retained requirements-manifest.json packet, so
// consumers can validate the manifest and the `--schema` mode can publish the
// contract without exporting. The manifest is already self-describing ($schema +
// schemaVersion); this documents the top-level shape (permissive nested
// requirement records for forward-compatibility).
const REQUIREMENTS_MANIFEST_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DIALECT,
  $id: MANIFEST_SCHEMA_ID,
  title: 'vi-history-suite requirements manifest',
  type: 'object',
  additionalProperties: true,
  required: [
    '$schema',
    'schemaVersion',
    'extensionVersion',
    'extensionCommit',
    'generatedAt',
    'counts',
    'requirements',
    'integrityDigest'
  ],
  properties: {
    $schema: { const: MANIFEST_SCHEMA_ID },
    schemaVersion: { const: SCHEMA_VERSION },
    extensionVersion: { type: 'string' },
    extensionCommit: { type: 'string' },
    generatedAt: { type: 'string' },
    counts: {
      type: 'object',
      required: ['requirements', 'criteria'],
      properties: {
        requirements: { type: 'integer' },
        criteria: { type: 'integer' }
      }
    },
    requirements: { type: 'array', items: { type: 'object' } },
    integrityDigest: { type: 'string' }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(REQUIREMENTS_MANIFEST_JSON_SCHEMA, options);
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  let parsed;
  try {
    parsed = parseSharedOutputArgs(argv, {
      defaults: { schema: false, noMarkdown: false },
      // This CLI only shares --schema; --no-markdown is its own toggle.
      excludeCommonFlags: ['--json', '--markdown', '--strict', '--include-provenance', '--output'],
      boolFlags: { '--no-markdown': 'noMarkdown' },
      enforceSingleOutputMode: false
    }).options;
  } catch (error) {
    (deps.stderr ?? process.stderr).write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // --schema publishes the JSON Schema without exporting the manifest.
  if (deps.schema ?? parsed.schema) {
    stdout.write(`${renderSchema()}\n`);
    return 0;
  }

  const includeMarkdown = deps.includeMarkdown ?? !parsed.noMarkdown;
  try {
    const result = exportRequirementsManifest({ ...deps, includeMarkdown });
    stdout.write(
      `[requirements-manifest] Generated ${result.jsonPath}: ` +
        `${result.manifest.extensionVersion} (${result.manifest.counts.requirements} requirements, ` +
        `${result.manifest.counts.criteria} criteria, digest ${result.manifest.integrityDigest.slice(0, 12)})\n`
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SRS_PATH,
  RTM_PATH,
  DEFAULT_OUTPUT_DIR,
  MANIFEST_BASENAME,
  SCHEMA_VERSION,
  MANIFEST_SCHEMA_ID,
  REQUIREMENTS_MANIFEST_JSON_SCHEMA,
  UNKNOWN_COMMIT,
  normalizeText,
  sliceRequirementBlocks,
  readScalarField,
  readBlockField,
  readBulletField,
  parseRequirementsFromSrs,
  parseActiveRtmIds,
  computeIntegrityDigest,
  buildRequirementsManifest,
  renderManifestMarkdown,
  renderSchema,
  exportRequirementsManifest,
  main
};
