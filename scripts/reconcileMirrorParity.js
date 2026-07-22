#!/usr/bin/env node

'use strict';

/**
 * Mirror-Mode parity reconciler CLI (VHS-REQ-707.11, Phase 4).
 *
 * The deterministic, queue-safe REQUIRED-gate entrypoint: reads the committed
 * `vi-history-suite/mirror-benchmark@v1` ledger and applies the pure reconciler
 * (out/reporting/mirror/mirrorParityReconciler.js) for a queued revision. Exits
 * non-zero when the required gate fails (report-digest divergence or a missing
 * left-channel precondition); an advisory outcome (fresh left, absent right) exits
 * 0 unless --strict is set. This is a data-at-rest read — never a live image pull
 * (queue-safety per ADR-0028).
 *
 * Usage:
 *   node scripts/reconcileMirrorParity.js --queued-revision <sha> \
 *     [--ledger <relative-path>] [--strict] [--json]
 *   node scripts/reconcileMirrorParity.js --schema [--include-provenance]
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope');

const DEFAULT_LEDGER_PATH = 'docs/requirements/mirror-benchmark-ledger.json';
const SCHEMA_ID = 'vi-history-suite/mirror-parity-reconciliation@v1';
const SCHEMA_VERSION = 1;

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

function buildSchema() {
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: SCHEMA_ID,
    title: 'Mirror-Mode parity reconciliation',
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'schemaVersion', 'queuedRevision', 'gate', 'failures', 'verdicts'],
    properties: {
      ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION),
      queuedRevision: { type: 'string' },
      gate: { type: 'string', enum: ['pass', 'fail', 'advisory'] },
      failures: { type: 'array', items: { type: 'string' } },
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'parityKey',
            'actorsPresent',
            'reportDigests',
            'reportSha256Agree',
            'leftChannelFresh',
            'rightChannelFresh',
            'rightAdvisory',
            'gate',
            'reason'
          ],
          properties: {
            parityKey: { type: 'string' },
            actorsPresent: { type: 'array', items: { type: 'string' } },
            reportDigests: { type: 'array', items: { type: 'string' } },
            reportSha256Agree: { type: 'boolean' },
            leftChannelFresh: { type: 'boolean' },
            rightChannelFresh: { type: 'boolean' },
            rightAdvisory: { type: 'boolean' },
            gate: { type: 'string', enum: ['pass', 'fail', 'advisory'] },
            reason: { type: 'string' }
          }
        }
      }
    }
  };
}

function parseArgs(argv = []) {
  const options = {
    queuedRevision: undefined,
    ledgerPath: undefined,
    strict: false,
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
    if (arg === '--queued-revision') options.queuedRevision = next();
    else if (arg === '--ledger') options.ledgerPath = next();
    else if (arg === '--strict') options.strict = true;
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
    return 2;
  }

  if (options.schema) {
    const provenance = options.includeProvenance
      ? { generatedAt: (deps.now ?? (() => new Date()))().toISOString(), argv }
      : undefined;
    stdout.write(`${renderSchemaDocument(buildSchema(), { provenance })}\n`);
    return 0;
  }

  if (!options.queuedRevision) {
    stderr.write('--queued-revision is required.\n');
    return 2;
  }

  const cwd = deps.cwd || process.cwd();
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const reconcile = deps.reconcile ?? require(path.resolve(cwd, 'out/reporting/mirror/mirrorParityReconciler.js')).reconcileMirrorParity;

  let ledger;
  try {
    ledger = JSON.parse(readFile(resolveLedgerPath(cwd, options.ledgerPath)));
  } catch (error) {
    stderr.write(`Failed to read mirror-benchmark ledger: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  let result;
  try {
    result = reconcile(ledger, { queuedRevision: options.queuedRevision });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const packet = { ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION), ...result };
  if (options.json) {
    stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  } else {
    stdout.write(
      `[mirror-reconcile] ${result.queuedRevision}: gate=${result.gate} ` +
        `(${result.verdicts.length} parityKey(s), ${result.failures.length} failure(s)).\n`
    );
    for (const v of result.verdicts) {
      stdout.write(`  ${v.parityKey.slice(0, 12)}… ${v.gate} (${v.reason})\n`);
    }
  }

  if (result.gate === 'fail') return 1;
  if (result.gate === 'advisory' && options.strict) return 1;
  return 0;
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  SCHEMA_ID,
  SCHEMA_VERSION,
  resolveLedgerPath,
  buildSchema,
  parseArgs,
  main
};

if (require.main === module) {
  process.exit(main());
}
