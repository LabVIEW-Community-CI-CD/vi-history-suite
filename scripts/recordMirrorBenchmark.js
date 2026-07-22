#!/usr/bin/env node

'use strict';

/**
 * Mirror-Mode benchmark ledger recorder (VHS-REQ-707, Phase 1).
 *
 * Mirror Mode runs the same LabVIEW comparison/preview sample on multiple
 * independent runtime actors (Vagrant x86, hosted Docker x64, Linux host-native
 * x64) that must agree, and captures per-run performance alongside a per-actor
 * capability fingerprint so timings are comparable across very different
 * hardware. This script is the idempotent WRITE side of that ledger — the
 * counterpart to scripts/recordRuntimeValidation.js. A real-runtime benchmark
 * driver computes the parity digests (parityKey / actorRef / reportSha256 via
 * src/reporting/mirror/mirrorParityDigest.ts) and hands them here; this script
 * safely interns the actor fingerprint and appends the run row, instead of
 * hand-editing JSON.
 *
 * Ledger shape (schema vi-history-suite/mirror-benchmark@v1): a normalized
 * two-part model —
 *   - `actors{}`  interned registry keyed by actorRef (fingerprint sha256),
 *   - `runs[]`    append-only tidy fact table; each row references an actor by
 *                 actorRef and is grouped across actors by `parityKey`, and is
 *                 bound to a `sourceRevision` for freshness (VHS-REQ-707.6).
 *
 * Idempotent: a run row is identified by (parityKey, actorRef, mode,
 * sourceRevision). Re-applying an identical row is a no-op; re-applying the same
 * identity with a newer measurement replaces it in place (latest-wins) so a CI
 * re-run of the same revision never duplicates rows or grows the ledger
 * unbounded. Fail-closed: malformed digests / missing identity / unknown mode
 * are rejected before any write. Only Node built-ins are used.
 *
 * Usage:
 *   node scripts/recordMirrorBenchmark.js \
 *     --parity-key <sha256> --actor-ref <sha256> --source-revision <sha> \
 *     --vi-path <path> --fixture-sha <sha> --recipe <id> \
 *     --mode <cold|warm> --outcome <ok|failed|blocked> \
 *     --report-sha256 <sha256> --preview-image-count <n> --wall-ms <n> \
 *     --fingerprint-file <path.json> \
 *     [--ledger <relative-path>] [--json]
 *   node scripts/recordMirrorBenchmark.js --schema
 *
 * (--json and --schema are mutually exclusive; --actor-ref is optional and, when
 * supplied, must equal the fingerprint's derived id or the record is rejected.)
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  SCHEMA_PROVENANCE_KEY,
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope');

const DEFAULT_LEDGER_PATH = 'docs/requirements/mirror-benchmark-ledger.json';
const SCHEMA_ID = 'vi-history-suite/mirror-benchmark@v1';
const SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VALID_MODES = new Set(['cold', 'warm']);
const VALID_OUTCOMES = new Set(['ok', 'failed', 'blocked']);
const VALID_ROLES = new Set(['tangled-left', 'tangled-right', 'decoupled']);
const VALID_CAPTURED_FROM = new Set(['in-guest', 'in-container', 'host']);
const VALID_BITNESS = new Set(['x86', 'x64']);

const FINGERPRINT_FIELDS = [
  'actor',
  'role',
  'capturedFrom',
  'os',
  'cpuModel',
  'cpuLogical',
  'ramTotalMb',
  'diskFreeGb',
  'labviewBuild',
  'labviewBitness'
];

function requireSha256(name, value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`--${name} must be a 64-character lowercase hex sha256 digest.`);
  }
  return normalized;
}

function requireNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`--${name} is required.`);
  }
  return value.trim();
}

function requireNonNegativeInteger(name, value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return n;
}

function requireNonNegativeNumber(name, value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`--${name} must be a non-negative number.`);
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`--${name} must be a non-negative number.`);
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative number.`);
  }
  return n;
}

// Validate an actor capability fingerprint (fail-closed). Returns a NEW object
// with only the known fields, in a stable order, so the interned registry entry
// is canonical regardless of input key order.
function normalizeFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'object') {
    throw new Error('Fingerprint must be an object.');
  }
  for (const field of FINGERPRINT_FIELDS) {
    if (fingerprint[field] === undefined || fingerprint[field] === null) {
      throw new Error(`Fingerprint field "${field}" is required.`);
    }
  }
  if (!VALID_ROLES.has(fingerprint.role)) {
    throw new Error(`Fingerprint role must be one of: ${[...VALID_ROLES].join(', ')}.`);
  }
  if (!VALID_CAPTURED_FROM.has(fingerprint.capturedFrom)) {
    throw new Error(`Fingerprint capturedFrom must be one of: ${[...VALID_CAPTURED_FROM].join(', ')}.`);
  }
  if (!VALID_BITNESS.has(fingerprint.labviewBitness)) {
    throw new Error(`Fingerprint labviewBitness must be "x86" or "x64".`);
  }
  return {
    actor: requireNonEmpty('fingerprint.actor', fingerprint.actor),
    role: fingerprint.role,
    capturedFrom: fingerprint.capturedFrom,
    os: requireNonEmpty('fingerprint.os', fingerprint.os),
    cpuModel: requireNonEmpty('fingerprint.cpuModel', fingerprint.cpuModel),
    cpuLogical: requireNonNegativeInteger('fingerprint.cpuLogical', fingerprint.cpuLogical),
    ramTotalMb: requireNonNegativeNumber('fingerprint.ramTotalMb', fingerprint.ramTotalMb),
    diskFreeGb: requireNonNegativeNumber('fingerprint.diskFreeGb', fingerprint.diskFreeGb),
    labviewBuild: requireNonEmpty('fingerprint.labviewBuild', fingerprint.labviewBuild),
    labviewBitness: fingerprint.labviewBitness
  };
}

// Derive the interned-registry key for a normalized fingerprint. MUST match
// src/reporting/mirror/mirrorParityDigest.ts deriveActorFingerprintId exactly:
// sha256 over the field VALUES in FINGERPRINT_FIELDS order (string fields trimmed,
// numbers passed through), JSON-array encoded.
function deriveActorFingerprintId(normalizedFingerprint) {
  const values = FINGERPRINT_FIELDS.map((field) => {
    const v = normalizedFingerprint[field];
    return typeof v === 'number' ? v : String(v).trim();
  });
  return crypto.createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');
}

// Return an empty, schema-tagged ledger (used when the file does not yet exist).
function emptyLedger() {
  return { ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION), actors: {}, runs: [] };
}

// Pure idempotent apply: return a NEW ledger object with the actor interned and
// the run row upserted by identity (parityKey, actorRef, mode, sourceRevision).
// Returns { ledger, changed } — changed=false when the row was already present
// byte-identical (a true no-op), so callers can skip the write.
//
// Fail-closed: a non-null ledger that lacks an object `actors` field or an array
// `runs` field is rejected (never silently reset), so a truncated/schema-drifted
// file can never be overwritten and lose prior evidence. Pass emptyLedger() (or
// null/undefined) only for the explicit no-file path.
function applyMirrorBenchmarkRecord(ledger, record) {
  let base;
  if (ledger === null || ledger === undefined) {
    base = emptyLedger();
  } else if (
    typeof ledger === 'object' &&
    ledger.actors &&
    typeof ledger.actors === 'object' &&
    !Array.isArray(ledger.actors) &&
    Array.isArray(ledger.runs)
  ) {
    base = ledger;
  } else {
    throw new Error(
      'Existing mirror-benchmark ledger is malformed (missing object "actors" or array "runs"); refusing to overwrite.'
    );
  }

  const parityKey = requireSha256('parity-key', record.parityKey);
  const actorRef = requireSha256('actor-ref', record.actorRef);
  const reportSha256 = requireSha256('report-sha256', record.reportSha256);
  const sourceRevision = requireNonEmpty('source-revision', record.sourceRevision);
  const mode = requireNonEmpty('mode', record.mode);
  if (!VALID_MODES.has(mode)) {
    throw new Error(`--mode must be one of: ${[...VALID_MODES].join(', ')}.`);
  }
  const outcome = requireNonEmpty('outcome', record.outcome);
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error(`--outcome must be one of: ${[...VALID_OUTCOMES].join(', ')}.`);
  }
  const fingerprint = normalizeFingerprint(record.fingerprint);

  // Integrity: actorRef MUST be the derived id of the supplied fingerprint, so a
  // stale/mistyped ref can never overwrite the registry or retro-alter earlier
  // rows that share the ref.
  const derivedActorRef = deriveActorFingerprintId(fingerprint);
  if (actorRef !== derivedActorRef) {
    throw new Error(
      `--actor-ref ${actorRef} does not match the fingerprint's derived id ${derivedActorRef}.`
    );
  }

  const row = {
    parityKey,
    actorRef,
    sourceRevision,
    fixture: {
      viPath: requireNonEmpty('vi-path', record.viPath).replace(/\\/g, '/'),
      fixtureSha: requireSha256('fixture-sha', record.fixtureSha),
      recipe: requireNonEmpty('recipe', record.recipe)
    },
    mode,
    outcome,
    reportSha256,
    previewImageCount: requireNonNegativeInteger('preview-image-count', record.previewImageCount),
    wallMs: requireNonNegativeNumber('wall-ms', record.wallMs)
  };

  // Intern the actor fingerprint under its actorRef (stable content key).
  // Clone-then-assign so an overwrite preserves the existing key position
  // (byte-stable serialization when only a run row changes).
  const actors = { ...base.actors };
  actors[actorRef] = fingerprint;

  const identity = (candidate) =>
    candidate.parityKey === row.parityKey &&
    candidate.actorRef === row.actorRef &&
    candidate.mode === row.mode &&
    candidate.sourceRevision === row.sourceRevision;

  const existingIndex = base.runs.findIndex(identity);
  let runs;
  let changed;
  if (existingIndex < 0) {
    runs = [...base.runs, row];
    changed = true;
  } else {
    const existing = base.runs[existingIndex];
    const identical =
      JSON.stringify(existing) === JSON.stringify(row) &&
      JSON.stringify(base.actors[actorRef]) === JSON.stringify(fingerprint);
    if (identical) {
      return { ledger: base, changed: false };
    }
    runs = [...base.runs];
    runs[existingIndex] = row;
    changed = true;
  }

  return {
    ledger: { ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION), actors, runs },
    changed
  };
}

// Two-space JSON + trailing newline (matches the committed-ledger style).
function serializeLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

function resolveLedgerPath(cwd, relativePath) {
  const target = relativePath || DEFAULT_LEDGER_PATH;
  if (path.isAbsolute(target)) {
    throw new Error('--ledger must be a relative path inside the working directory.');
  }
  const resolved = path.resolve(cwd, target);
  const root = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(root)) {
    throw new Error('--ledger must stay inside the working directory.');
  }
  return resolved;
}

// Published JSON Schema for the ledger packet (emitted by --schema).
function buildSchema() {
  const fingerprintSchema = {
    type: 'object',
    additionalProperties: false,
    required: FINGERPRINT_FIELDS,
    properties: {
      actor: { type: 'string' },
      role: { type: 'string', enum: [...VALID_ROLES] },
      capturedFrom: { type: 'string', enum: [...VALID_CAPTURED_FROM] },
      os: { type: 'string' },
      cpuModel: { type: 'string' },
      cpuLogical: { type: 'integer', minimum: 0 },
      ramTotalMb: { type: 'number', minimum: 0 },
      diskFreeGb: { type: 'number', minimum: 0 },
      labviewBuild: { type: 'string' },
      labviewBitness: { type: 'string', enum: [...VALID_BITNESS] }
    }
  };
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: SCHEMA_ID,
    title: 'Mirror-Mode benchmark ledger',
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'schemaVersion', 'actors', 'runs'],
    properties: {
      ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION),
      actors: {
        type: 'object',
        description: 'Interned actor registry keyed by actorRef (fingerprint sha256).',
        additionalProperties: fingerprintSchema
      },
      runs: {
        type: 'array',
        description: 'Append-only tidy fact table; grouped across actors by parityKey.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'parityKey',
            'actorRef',
            'sourceRevision',
            'fixture',
            'mode',
            'outcome',
            'reportSha256',
            'previewImageCount',
            'wallMs'
          ],
          properties: {
            parityKey: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            actorRef: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            sourceRevision: { type: 'string' },
            fixture: {
              type: 'object',
              additionalProperties: false,
              required: ['viPath', 'fixtureSha', 'recipe'],
              properties: {
                viPath: { type: 'string' },
                fixtureSha: { type: 'string', pattern: '^[0-9a-f]{64}$' },
                recipe: { type: 'string' }
              }
            },
            mode: { type: 'string', enum: [...VALID_MODES] },
            outcome: { type: 'string', enum: [...VALID_OUTCOMES] },
            reportSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            previewImageCount: { type: 'integer', minimum: 0 },
            wallMs: { type: 'number', minimum: 0 }
          }
        }
      }
    }
  };
}

function parseArgs(argv = []) {
  const options = {
    parityKey: undefined,
    actorRef: undefined,
    sourceRevision: undefined,
    viPath: undefined,
    fixtureSha: undefined,
    recipe: undefined,
    mode: undefined,
    outcome: undefined,
    reportSha256: undefined,
    previewImageCount: undefined,
    wallMs: undefined,
    fingerprintFile: undefined,
    ledgerPath: undefined,
    json: false,
    schema: false,
    includeProvenance: false,
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
    if (arg === '--parity-key') options.parityKey = next();
    else if (arg === '--actor-ref') options.actorRef = next();
    else if (arg === '--source-revision') options.sourceRevision = next();
    else if (arg === '--vi-path') options.viPath = next();
    else if (arg === '--fixture-sha') options.fixtureSha = next();
    else if (arg === '--recipe') options.recipe = next();
    else if (arg === '--mode') options.mode = next();
    else if (arg === '--outcome') options.outcome = next();
    else if (arg === '--report-sha256') options.reportSha256 = next();
    else if (arg === '--preview-image-count') options.previewImageCount = next();
    else if (arg === '--wall-ms') options.wallMs = next();
    else if (arg === '--fingerprint-file') options.fingerprintFile = next();
    else if (arg === '--ledger') options.ledgerPath = next();
    else if (arg === '--json') options.json = true;
    else if (arg === '--schema') options.schema = true;
    else if (arg === '--include-provenance') options.includeProvenance = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else options.positionals.push(arg);
  }
  if (options.json && options.schema) {
    throw new Error('--json and --schema cannot be combined.');
  }
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

  if (options.schema) {
    const provenance = options.includeProvenance
      ? { generatedAt: (deps.now ?? (() => new Date()))().toISOString(), argv }
      : undefined;
    stdout.write(`${renderSchemaDocument(buildSchema(), { provenance })}\n`);
    return 0;
  }

  const cwd = deps.cwd || process.cwd();
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const writeFile = deps.writeFile ?? ((p, content) => fs.writeFileSync(p, content, 'utf8'));
  const fileExists = deps.fileExists ?? ((p) => fs.existsSync(p));

  let ledgerPath;
  try {
    ledgerPath = resolveLedgerPath(cwd, options.ledgerPath);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let fingerprint;
  try {
    const fpPath = resolveLedgerPath(cwd, requireNonEmpty('fingerprint-file', options.fingerprintFile));
    fingerprint = JSON.parse(readFile(fpPath));
  } catch (error) {
    stderr.write(`Failed to read fingerprint file: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let ledger;
  try {
    ledger = fileExists(ledgerPath) ? JSON.parse(readFile(ledgerPath)) : emptyLedger();
  } catch (error) {
    stderr.write(`Failed to read mirror-benchmark ledger: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let result;
  try {
    result = applyMirrorBenchmarkRecord(ledger, {
      parityKey: options.parityKey,
      actorRef: options.actorRef,
      sourceRevision: options.sourceRevision,
      viPath: options.viPath,
      fixtureSha: options.fixtureSha,
      recipe: options.recipe,
      mode: options.mode,
      outcome: options.outcome,
      reportSha256: options.reportSha256,
      previewImageCount: options.previewImageCount,
      wallMs: options.wallMs,
      fingerprint
    });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  if (result.changed) {
    writeFile(ledgerPath, serializeLedger(result.ledger));
  }

  if (options.json) {
    stdout.write(`${JSON.stringify({ ledger: options.ledgerPath || DEFAULT_LEDGER_PATH, changed: result.changed, runs: result.ledger.runs.length, actors: Object.keys(result.ledger.actors).length }, null, 2)}\n`);
  } else {
    stdout.write(
      `[mirror-benchmark] ${result.changed ? 'Recorded' : 'No-op (already present)'} ` +
        `parityKey ${options.parityKey.trim().slice(0, 12)}… mode ${options.mode} ` +
        `-> ${result.ledger.runs.length} run(s), ${Object.keys(result.ledger.actors).length} actor(s).\n`
    );
  }
  return 0;
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  SCHEMA_ID,
  SCHEMA_VERSION,
  SCHEMA_PROVENANCE_KEY,
  applyMirrorBenchmarkRecord,
  normalizeFingerprint,
  deriveActorFingerprintId,
  emptyLedger,
  serializeLedger,
  resolveLedgerPath,
  buildSchema,
  parseArgs,
  main
};

if (require.main === module) {
  process.exit(main());
}
