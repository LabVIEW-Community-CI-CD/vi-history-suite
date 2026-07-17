import { describe, expect, it } from 'vitest';

import { serializeJsonArtifact } from '../../src/support/jsonArtifact';

describe('serializeJsonArtifact', () => {
  it('pretty-prints with 2-space indentation and a trailing newline', () => {
    expect(serializeJsonArtifact({ a: 1, b: { c: 2 } })).toBe(
      `${JSON.stringify({ a: 1, b: { c: 2 } }, null, 2)}\n`
    );
  });

  it('ends with exactly one trailing newline', () => {
    const output = serializeJsonArtifact({ x: 'y' });
    expect(output.endsWith('}\n')).toBe(true);
    expect(output.endsWith('}\n\n')).toBe(false);
  });

  it('serializes arrays and primitives', () => {
    expect(serializeJsonArtifact([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]\n');
    expect(serializeJsonArtifact('plain')).toBe('"plain"\n');
  });
});
