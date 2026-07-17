import { describe, expect, it } from 'vitest';

// Contract tests for the shared self-describing schema-envelope helper used by
// the read-model / aggregator scripts (VHS-REQ-601). The helper centralizes the
// $schema/schemaVersion envelope, the provenance extension key, and the
// schema-drift assertion so every read-model packet stays self-describing and
// aligned with its published JSON Schema.
const envelope = require('../../scripts/lib/schemaEnvelope.js') as {
  SCHEMA_PROVENANCE_KEY: string;
  JSON_SCHEMA_DIALECT: string;
  SCHEMA_ENVELOPE_REQUIRED_KEYS: string[];
  renderSchemaDocument: (schema: unknown, options?: { provenance?: unknown }) => string;
  schemaEnvelopeFields: (schemaId: string, schemaVersion: number) => Record<string, unknown>;
  schemaEnvelopePropertyNodes: (schemaId: string, schemaVersion: number) => Record<string, unknown>;
  collectSchemaEnvelopeDrift: (packet: unknown, schema: unknown) => string[];
};

const {
  SCHEMA_PROVENANCE_KEY,
  JSON_SCHEMA_DIALECT,
  SCHEMA_ENVELOPE_REQUIRED_KEYS,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes,
  collectSchemaEnvelopeDrift
} = envelope;

const SCHEMA_ID = 'vi-history-suite/example@v1';
const SCHEMA_VERSION = 1;

function exampleSchema(): Record<string, unknown> {
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: SCHEMA_ID,
    type: 'object',
    additionalProperties: false,
    required: [...SCHEMA_ENVELOPE_REQUIRED_KEYS, 'status'],
    properties: {
      ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION),
      status: { type: 'string' }
    }
  };
}

describe('schemaEnvelope shared read-model helper (VHS-REQ-601)', () => {
  it('exposes the single provenance extension key and JSON Schema dialect', () => {
    expect(SCHEMA_PROVENANCE_KEY).toBe('x-vi-history-suite-provenance');
    expect(JSON_SCHEMA_DIALECT).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(SCHEMA_ENVELOPE_REQUIRED_KEYS).toEqual(['$schema', 'schemaVersion']);
  });

  it('renderSchemaDocument serializes stably and attaches provenance under the shared key', () => {
    const schema = exampleSchema();
    const plain = renderSchemaDocument(schema);
    expect(plain).toBe(JSON.stringify(schema, null, 2));
    expect(JSON.parse(plain)[SCHEMA_PROVENANCE_KEY]).toBeUndefined();

    const withProvenance = JSON.parse(renderSchemaDocument(schema, { provenance: { generatedAt: 'x' } }));
    expect(withProvenance[SCHEMA_PROVENANCE_KEY]).toEqual({ generatedAt: 'x' });
    // Attaching provenance must not mutate the source schema object.
    expect((schema as Record<string, unknown>)[SCHEMA_PROVENANCE_KEY]).toBeUndefined();
  });

  it('renderSchemaDocument rejects a non-object schema', () => {
    expect(() => renderSchemaDocument(undefined)).toThrow(/requires a schema object/);
  });

  it('schemaEnvelopeFields returns the self-describing top-level fields and validates inputs', () => {
    expect(schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION)).toEqual({
      $schema: SCHEMA_ID,
      schemaVersion: SCHEMA_VERSION
    });
    expect(() => schemaEnvelopeFields('', 1)).toThrow(/non-empty schemaId/);
    expect(() => schemaEnvelopeFields(SCHEMA_ID, 0)).toThrow(/positive integer schemaVersion/);
    expect(() => schemaEnvelopeFields(SCHEMA_ID, 1.5)).toThrow(/positive integer schemaVersion/);
  });

  it('schemaEnvelopePropertyNodes constrains $schema/schemaVersion to consts', () => {
    expect(schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION)).toEqual({
      $schema: { const: SCHEMA_ID },
      schemaVersion: { const: SCHEMA_VERSION }
    });
    expect(() => schemaEnvelopePropertyNodes('', 1)).toThrow(/non-empty schemaId/);
    expect(() => schemaEnvelopePropertyNodes(SCHEMA_ID, -1)).toThrow(/positive integer schemaVersion/);
  });

  it('collectSchemaEnvelopeDrift reports no problems for an aligned packet', () => {
    const schema = exampleSchema();
    const packet = { ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION), status: 'fresh' };
    expect(collectSchemaEnvelopeDrift(packet, schema)).toEqual([]);
  });

  it('collectSchemaEnvelopeDrift catches missing keys and const mismatches', () => {
    const schema = exampleSchema();

    // Missing a required top-level key.
    const missing = { ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION) };
    expect(collectSchemaEnvelopeDrift(missing, schema).join(' ')).toContain('missing required keys: status');

    // Wrong $schema const.
    const wrongId = { $schema: 'vi-history-suite/other@v1', schemaVersion: SCHEMA_VERSION, status: 'x' };
    expect(collectSchemaEnvelopeDrift(wrongId, schema).join(' ')).toContain('packet.$schema');

    // Wrong schemaVersion const.
    const wrongVersion = { $schema: SCHEMA_ID, schemaVersion: 2, status: 'x' };
    expect(collectSchemaEnvelopeDrift(wrongVersion, schema).join(' ')).toContain('packet.schemaVersion');
  });

  it('collectSchemaEnvelopeDrift fails closed on malformed inputs', () => {
    expect(collectSchemaEnvelopeDrift(undefined, exampleSchema())).toEqual(['packet is not an object']);
    expect(collectSchemaEnvelopeDrift({}, {})).toEqual(['schema is missing a required[] array']);
  });
});
