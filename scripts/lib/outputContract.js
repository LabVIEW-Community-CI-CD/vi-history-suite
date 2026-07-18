'use strict';

// Shared read-model CLI output-contract plumbing for the read-model / aggregator
// scripts (risk ledger, release readiness, supply-chain state, requirements
// health, branch-protection audit, criterion/coverage/customization auditors,
// assurance state, multi-standards audit, and the dev-tools/manifest/triage/
// closeout summaries). These scripts historically hand-rolled an identical set of
// CLI helpers: a shared-flag argv parser, an output-mode selector, a `--output`
// path-safety guard, a provenance object builder, and a write-or-print sink. Each
// copy drifted slightly (two different `resolveOutputPath` signatures, two
// different `generatedAt*` names, inline provenance literals). This module
// centralizes that contract so the plumbing stays byte-identical across every
// read-model, complementing scripts/lib/schemaEnvelope.js (which centralizes the
// emitted PACKET SHAPE; this centralizes the CLI PLUMBING).
//
// Cross-platform note: path handling here uses node:path exclusively (no
// hard-coded separators) so `--output` safety behaves identically on win32 and
// POSIX. This is a pure, testable helper with no CLI entrypoint (imported by the
// read-model scripts).

const fs = require('node:fs');
const path = require('node:path');

const { assertSingleOutputMode } = require('./schemaEnvelope.js');

// The common output-mode + provenance boolean flags every read-model CLI shares.
// Maps CLI flag -> normalized options key. Scripts extend this with their own
// boolean flags via the parser spec.
const COMMON_BOOL_FLAGS = Object.freeze({
  '--json': 'json',
  '--markdown': 'markdown',
  '--schema': 'schema',
  '--strict': 'strict',
  '--include-provenance': 'includeProvenance'
});

// The common value flag shared by every read-model CLI. Maps CLI flag -> key.
// Scripts extend this with their own value flags via the parser spec.
const COMMON_VALUE_FLAGS = Object.freeze({
  '--output': 'outputPath'
});

// Resolve the canonical output mode for a parsed options object. Precedence is
// schema > markdown > json > text, matching every read-model's existing
// `outputModeForOptions`.
function outputModeForOptions(options = {}) {
  if (options.schema) return 'schema';
  if (options.markdown) return 'markdown';
  return options.json ? 'json' : 'text';
}

// Parse the shared read-model CLI flags from argv into a normalized options
// object, routing script-specific flags through the provided spec and rejecting
// unknown `--flags`. Returns { options, positionals }.
//
// spec:
//   - boolFlags:  { '--flag': 'optionsKey' } merged over COMMON_BOOL_FLAGS
//   - valueFlags: { '--flag': 'optionsKey' } merged over COMMON_VALUE_FLAGS
//   - transforms: { optionsKey: (rawValue) => value } applied to value flags
//   - defaults:   initial options object (shallow-copied)
//   - requireValue: when true (default), a value flag at end-of-argv, followed
//                   by another `--flag`, or given an empty-string value throws;
//                   when false, the next token is
//                   taken verbatim (looser, matches scripts that used a bare
//                   `next()` accessor)
//   - enforceSingleOutputMode: when true (default), throws if more than one of
//                   json/markdown/schema is set (via schemaEnvelope helper)
//   - excludeCommonFlags: array of common flag names (e.g. ['--strict']) to DROP
//                   from the merged bool/value flag sets, so a script that does
//                   not support a shared flag rejects it as an unknown argument
//                   instead of silently accepting it.
//   - repeatable: array of option KEYS (value-flag targets) that accumulate into
//                   an array (push) instead of single-assign, for repeatable
//                   value flags such as --issue-link. The transform (when present)
//                   is applied per element. The default for a repeatable key
//                   should be an array (e.g. defaults: { issueLinks: [] }).
function parseSharedOutputArgs(argv, spec = {}) {
  const boolFlags = { ...COMMON_BOOL_FLAGS, ...(spec.boolFlags || {}) };
  const valueFlags = { ...COMMON_VALUE_FLAGS, ...(spec.valueFlags || {}) };
  for (const flag of Array.isArray(spec.excludeCommonFlags) ? spec.excludeCommonFlags : []) {
    delete boolFlags[flag];
    delete valueFlags[flag];
  }
  const transforms = spec.transforms || {};
  const repeatable = new Set(Array.isArray(spec.repeatable) ? spec.repeatable : []);
  const requireValue = spec.requireValue !== false;
  const options = { ...(spec.defaults || {}) };
  const positionals = [];
  const list = Array.isArray(argv) ? argv : [];

  for (let index = 0; index < list.length; index += 1) {
    const arg = list[index];
    if (Object.prototype.hasOwnProperty.call(boolFlags, arg)) {
      options[boolFlags[arg]] = true;
    } else if (Object.prototype.hasOwnProperty.call(valueFlags, arg)) {
      const key = valueFlags[arg];
      const raw = list[index + 1];
      if (requireValue && (raw === undefined || raw === '' || (typeof raw === 'string' && raw.startsWith('--')))) {
        throw new Error(`${arg} requires a value`);
      }
      const value = typeof transforms[key] === 'function' ? transforms[key](raw) : raw;
      if (repeatable.has(key)) {
        if (!Array.isArray(options[key])) {
          options[key] = [];
        }
        options[key].push(value);
      } else {
        options[key] = value;
      }
      index += 1;
    } else if (typeof arg === 'string' && arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (spec.enforceSingleOutputMode !== false) {
    assertSingleOutputMode({ json: options.json, markdown: options.markdown, schema: options.schema });
  }

  return { options, positionals };
}

// Resolve a provenance/generated-at ISO timestamp honoring injected clocks, so
// tests stay deterministic. Precedence: deps.now() (Date or value) > deps.generatedAt
// (Date or value) > new Date(). This is the union of every read-model's
// `generatedAtFor`/`generatedAtForProvenance`.
function generatedAt(deps = {}) {
  if (typeof deps.now === 'function') {
    const value = deps.now();
    return value instanceof Date ? value.toISOString() : String(value);
  }
  if (deps.generatedAt !== undefined) {
    return deps.generatedAt instanceof Date ? deps.generatedAt.toISOString() : String(deps.generatedAt);
  }
  return new Date().toISOString();
}

// Build the shared provenance object attached under `--include-provenance`. Key
// order is stable: generatedAt, cwd, outputMode, (strict when provided), then any
// caller `extra` fields, then argv last — matching the existing read-model
// provenance literals so migrated JSON stays byte-identical.
//
//   buildProvenance({ cwd, outputMode, strict, extra: { repo }, argv }, deps)
function buildProvenance({ cwd, outputMode, strict, extra, argv } = {}, deps = {}) {
  const provenance = {
    generatedAt: generatedAt(deps),
    cwd,
    outputMode
  };
  if (strict !== undefined) {
    provenance.strict = strict;
  }
  if (extra && typeof extra === 'object') {
    Object.assign(provenance, extra);
  }
  provenance.argv = Array.isArray(argv) ? [...argv] : [];
  return provenance;
}

// Reject empty, absolute, or parent-escaping output paths (write inside cwd only).
// Canonical signature is (cwd, relativePath); uses path.relative so it behaves
// identically on win32 and POSIX. Throws with a clear message; returns the
// resolved absolute path when safe.
function resolveOutputPath(cwd, relativePath) {
  const requested = typeof relativePath === 'string' ? relativePath : '';
  if (requested.trim() === '') {
    throw new Error('--output requires a non-empty relative path');
  }
  if (path.isAbsolute(requested)) {
    throw new Error('--output must be a relative path inside the working directory');
  }
  const root = path.resolve(cwd || process.cwd());
  const resolved = path.resolve(root, requested);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--output must stay inside the working directory');
  }
  return resolved;
}

// Write rendered content to a safe `--output` file (creating parent dirs) or, when
// no outputPath is given, print it to stdout. A stdout write-confirmation is emitted
// only when `stdout` is provided AND a confirmation source is given:
//   - `confirm`: a full message string, OR a function (outputPath) => string, giving
//     callers exact control over their CLI contract (e.g. the mode-specific
//     `[requirements-verify] Wrote schema output to <path>` messages). Highest priority.
//   - `label`: shorthand for the common `[label] Wrote <outputPath>` message.
// Supports both `deps.writeFile` and `deps.writeFileSync` injection names.
// Returns the resolved absolute path when a file was written, otherwise undefined.
function writeOutput(content, { outputPath, cwd, stdout, deps = {}, label, confirm } = {}) {
  if (outputPath) {
    const resolved = resolveOutputPath(cwd, outputPath);
    const mkdirSync = deps.mkdirSync || fs.mkdirSync;
    const writeFileSync = deps.writeFile || deps.writeFileSync || fs.writeFileSync;
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, `${content}\n`, 'utf8');
    if (stdout) {
      let message;
      if (typeof confirm === 'function') {
        message = confirm(outputPath);
      } else if (typeof confirm === 'string') {
        message = confirm;
      } else if (label) {
        message = `[${label}] Wrote ${outputPath}`;
      }
      if (message !== undefined) {
        stdout.write(`${message}\n`);
      }
    }
    return resolved;
  }
  if (stdout) {
    stdout.write(`${content}\n`);
  }
  return undefined;
}

module.exports = {
  COMMON_BOOL_FLAGS,
  COMMON_VALUE_FLAGS,
  outputModeForOptions,
  parseSharedOutputArgs,
  generatedAt,
  buildProvenance,
  resolveOutputPath,
  writeOutput
};
