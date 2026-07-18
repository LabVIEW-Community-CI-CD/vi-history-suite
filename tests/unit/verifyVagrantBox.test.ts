import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const verifyVagrantBox = require('../../scripts/verifyVagrantBox.cjs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const committedManifest = require('../../vagrant/box-manifest.json');

const { MANIFEST_SCHEMA, SHA256_PATTERN, validateManifestShape } = verifyVagrantBox;

function validManifest() {
  return {
    schema: MANIFEST_SCHEMA,
    schemaVersion: 1,
    sha256: 'a'.repeat(64),
    sizeBytes: 71297903213
  };
}

describe('verifyVagrantBox.validateManifestShape', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifestShape(validManifest())).toEqual([]);
  });

  it('accepts the committed box manifest', () => {
    expect(validateManifestShape(committedManifest)).toEqual([]);
  });

  it('rejects a non-object manifest', () => {
    expect(validateManifestShape(null)).toEqual(['manifest is not a JSON object']);
    expect(validateManifestShape('nope')).toEqual(['manifest is not a JSON object']);
  });

  it('rejects a wrong schema id', () => {
    const manifest = { ...validManifest(), schema: 'other/schema@v9' };
    expect(validateManifestShape(manifest)).toContain(
      `schema must be "${MANIFEST_SCHEMA}" (found "other/schema@v9")`
    );
  });

  it('rejects a wrong schema version', () => {
    const manifest = { ...validManifest(), schemaVersion: 2 };
    expect(validateManifestShape(manifest)).toContain('schemaVersion must be 1 (found 2)');
  });

  it('rejects a missing or malformed sha256', () => {
    expect(validateManifestShape({ ...validManifest(), sha256: undefined })).toContain(
      'sha256 must be a 64-character lowercase hex digest'
    );
    expect(validateManifestShape({ ...validManifest(), sha256: 'ABCDEF' })).toContain(
      'sha256 must be a 64-character lowercase hex digest'
    );
    // Uppercase hex is rejected (digest is recorded lowercase).
    expect(validateManifestShape({ ...validManifest(), sha256: 'A'.repeat(64) })).toContain(
      'sha256 must be a 64-character lowercase hex digest'
    );
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(validateManifestShape({ ...validManifest(), sizeBytes: 0 })).toContain(
      'sizeBytes must be a positive integer'
    );
    expect(validateManifestShape({ ...validManifest(), sizeBytes: -1 })).toContain(
      'sizeBytes must be a positive integer'
    );
    expect(validateManifestShape({ ...validManifest(), sizeBytes: 1.5 })).toContain(
      'sizeBytes must be a positive integer'
    );
    expect(validateManifestShape({ ...validManifest(), sizeBytes: undefined })).toContain(
      'sizeBytes must be a positive integer'
    );
  });

  it('collects multiple problems at once', () => {
    const problems = validateManifestShape({ schema: 'x', schemaVersion: 9, sha256: '', sizeBytes: 0 });
    expect(problems.length).toBe(4);
  });

  it('exposes a strict lowercase-hex sha256 pattern', () => {
    expect(SHA256_PATTERN.test('a'.repeat(64))).toBe(true);
    expect(SHA256_PATTERN.test('A'.repeat(64))).toBe(false);
    expect(SHA256_PATTERN.test('a'.repeat(63))).toBe(false);
  });
});
