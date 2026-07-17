'use strict';

// Shared self-describing schema-envelope helpers for the read-model / aggregator
// scripts (risk ledger, release readiness, supply-chain state, requirements
// health, branch-protection audit, and the criterion/coverage/customization
// auditors). Every one of these scripts publishes a JSON packet plus a JSON
// Schema via a `--schema` CLI mode, and each supports an optional
// `x-vi-history-suite-provenance` extension. Historically each script hand-rolled
// an identical `renderSchema` closure and provenance-key constant; this module
// centralizes that contract so the shape stays byte-identical across every
// read-model and future scripts inherit it for free.
//
// Cross-platform note: this module performs no path handling and no OS-specific
// behavior; it only serializes JSON. It is a pure, testable helper with no CLI
// entrypoint (imported by the read-model scripts).

// The single provenance extension keyword used across all read-model schemas.
// Kept here so every script agrees on the exact key (avoids the class of drift
// where one script emits a differently-named provenance block).
const SCHEMA_PROVENANCE_KEY = 'x-vi-history-suite-provenance';

// The JSON Schema dialect every read-model schema declares.
const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

// Render a published JSON Schema document to a stable 2-space-indented string,
// optionally attaching the provenance extension. This is the exact behavior the
// mature read-models (requirements-health, branch-protection) already implement;
// factoring it here keeps every script's `--schema` output identical in shape.
//
// - schema: the JSON Schema object (must already declare $schema/$id/required).
// - options.provenance: when present, attached under SCHEMA_PROVENANCE_KEY.
function renderSchemaDocument(schema, options = {}) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('renderSchemaDocument requires a schema object');
  }
  const document = options.provenance
    ? { ...schema, [SCHEMA_PROVENANCE_KEY]: options.provenance }
    : schema;
  return JSON.stringify(document, null, 2);
}

// Build the self-describing top-level fields ($schema + schemaVersion) shared by
// every read-model packet. Read-models spread the result at the head of their
// emitted object so the packet is self-identifying for machine consumers.
//
//   return { ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION), generatedAt, ... };
function schemaEnvelopeFields(schemaId, schemaVersion) {
  if (typeof schemaId !== 'string' || schemaId.length === 0) {
    throw new Error('schemaEnvelopeFields requires a non-empty schemaId');
  }
  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    throw new Error('schemaEnvelopeFields requires a positive integer schemaVersion');
  }
  return { $schema: schemaId, schemaVersion };
}

// Build the shared JSON Schema property/const nodes for the self-describing
// envelope fields, so a script's schema `properties` block constrains $schema and
// schemaVersion to the exact published values. Returned as a fragment to spread
// into the schema's `properties`:
//
//   properties: { ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION), ... }
function schemaEnvelopePropertyNodes(schemaId, schemaVersion) {
  if (typeof schemaId !== 'string' || schemaId.length === 0) {
    throw new Error('schemaEnvelopePropertyNodes requires a non-empty schemaId');
  }
  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    throw new Error('schemaEnvelopePropertyNodes requires a positive integer schemaVersion');
  }
  return {
    $schema: { const: schemaId },
    schemaVersion: { const: schemaVersion }
  };
}

// The two envelope keys every read-model packet must declare as `required`.
const SCHEMA_ENVELOPE_REQUIRED_KEYS = Object.freeze(['$schema', 'schemaVersion']);

// Assert that an emitted read-model packet satisfies its published schema's
// required-field contract at the top level and self-describes correctly. This is
// the reusable core of the per-script schema-drift tests; scripts/tests call it
// to guarantee the packet and schema never silently diverge. Returns a list of
// human-readable problems (empty when aligned) so callers can assert on it.
function collectSchemaEnvelopeDrift(packet, schema) {
  const problems = [];
  if (!packet || typeof packet !== 'object') {
    return ['packet is not an object'];
  }
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.required)) {
    return ['schema is missing a required[] array'];
  }
  const missing = schema.required.filter((key) => !(key in packet));
  if (missing.length > 0) {
    problems.push(`packet missing required keys: ${missing.join(', ')}`);
  }
  const schemaIdConst =
    schema.properties && schema.properties.$schema && schema.properties.$schema.const;
  if (schemaIdConst !== undefined && packet.$schema !== schemaIdConst) {
    problems.push(`packet.$schema ${JSON.stringify(packet.$schema)} != schema const ${JSON.stringify(schemaIdConst)}`);
  }
  const schemaVersionConst =
    schema.properties && schema.properties.schemaVersion && schema.properties.schemaVersion.const;
  if (schemaVersionConst !== undefined && packet.schemaVersion !== schemaVersionConst) {
    problems.push(
      `packet.schemaVersion ${JSON.stringify(packet.schemaVersion)} != schema const ${JSON.stringify(schemaVersionConst)}`
    );
  }
  return problems;
}

// Shared plain-text provenance footer lines for read-model CLIs that support
// `--include-provenance` in their default text output. Centralizing this keeps
// the footer identical across scripts and guarantees the flag is honored in text
// mode (not silently dropped for non-JSON output). Returns [] when no provenance.
function provenanceFooterLines(provenance, label) {
  if (!provenance) return [];
  const prefix = label ? `[${label}] ` : '';
  return [
    `${prefix}provenance generatedAt: ${provenance.generatedAt}`,
    `${prefix}provenance cwd: ${provenance.cwd}`,
    `${prefix}provenance outputMode: ${provenance.outputMode}`,
    `${prefix}provenance argv: ${JSON.stringify(provenance.argv)}`
  ];
}

// Reject conflicting output-mode flags. Read-model CLIs expose mutually
// exclusive output modes (json/markdown/schema); passing more than one is a
// caller error, not a silent precedence win. Throws with a clear message when
// more than one is set. `modes` is an object of { name: boolean }.
function assertSingleOutputMode(modes = {}) {
  const active = Object.entries(modes)
    .filter(([, on]) => on === true)
    .map(([name]) => name);
  if (active.length > 1) {
    throw new Error(`Use only one output mode: ${Object.keys(modes).map((name) => `--${name}`).join(', ')}`);
  }
  return active[0];
}

module.exports = {
  SCHEMA_PROVENANCE_KEY,
  JSON_SCHEMA_DIALECT,
  SCHEMA_ENVELOPE_REQUIRED_KEYS,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes,
  collectSchemaEnvelopeDrift,
  provenanceFooterLines,
  assertSingleOutputMode
};
