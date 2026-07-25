import { describe, it, expect } from 'vitest';
import {
  indexTerminals,
  compareTerminals,
  validatePackAgainstCensus
} from '../../prototype/primitiveSignatureValidator.mjs';

// #2376 primitive-mapping-pack: the census<->pack SIGNATURE CONTRACT validator.
// A shippable resolution stub must be signature-faithful (index+direction+type)
// against WIN's cleanroom primitive-census.json; a wrong-signature stub is worse
// than a raise. These tests pin the pure verdict logic (harness-first).

const censusEntry = (prim_id: string, addressable: boolean, terms: Array<{ index: number; direction: string; type: string }>) => ({
  prim_id,
  addressable,
  occurrences: 1,
  terminals: { value: terms.map((t) => ({ ...t, name: null, wired: true })), Count: terms.length }
});

// WIN census uses input/output; a pack uses in/out. Same signature.
const CENSUS_1926 = censusEntry('1926', true, [
  { index: 0, direction: 'output', type: 'Cluster' },
  { index: 3, direction: 'output', type: 'Refnum' },
  { index: 10, direction: 'input', type: 'String' },
  { index: 11, direction: 'input', type: 'Refnum' }
]);

const packEntry = (terms: Array<{ index: number; direction: string; type: string; name?: string }>) => ({
  terminals: terms.map((t) => ({ name: t.name ?? `t${t.index}`, ...t })),
  python_code: {}
});

const FAITHFUL_PACK_1926 = packEntry([
  { index: 0, direction: 'out', type: 'Cluster', name: 'error_out' },
  { index: 3, direction: 'out', type: 'Refnum', name: 'visa_resource_out' },
  { index: 10, direction: 'in', type: 'String', name: 'write_buffer' },
  { index: 11, direction: 'in', type: 'Refnum', name: 'visa_resource_in' }
]);

describe('indexTerminals', () => {
  it('normalizes input/output to in/out and unwraps the census {value,Count} shape', () => {
    const m = indexTerminals(CENSUS_1926.terminals);
    expect(m.get(0)).toEqual({ index: 0, direction: 'out', type: 'Cluster' });
    expect(m.get(10)).toEqual({ index: 10, direction: 'in', type: 'String' });
  });

  it('accepts a plain array (pack shape) equivalently', () => {
    const m = indexTerminals(FAITHFUL_PACK_1926.terminals);
    expect(m.get(11)).toEqual({ index: 11, direction: 'in', type: 'Refnum' });
  });
});

describe('compareTerminals', () => {
  it('passes when index+direction+type all match across in/out vs input/output', () => {
    const { ok, mismatches } = compareTerminals(CENSUS_1926.terminals, FAITHFUL_PACK_1926.terminals);
    expect(ok).toBe(true);
    expect(mismatches).toEqual([]);
  });

  it('flags a wrong terminal type', () => {
    const bad = packEntry([
      { index: 0, direction: 'out', type: 'Cluster' },
      { index: 3, direction: 'out', type: 'Refnum' },
      { index: 10, direction: 'in', type: 'Refnum' }, // String -> Refnum
      { index: 11, direction: 'in', type: 'Refnum' }
    ]);
    const { ok, mismatches } = compareTerminals(CENSUS_1926.terminals, bad.terminals);
    expect(ok).toBe(false);
    expect(mismatches.join(' ')).toContain('index 10 type pack=Refnum census=String');
  });

  it('flags a missing and an extra terminal', () => {
    const missing = packEntry([
      { index: 0, direction: 'out', type: 'Cluster' },
      { index: 3, direction: 'out', type: 'Refnum' },
      { index: 11, direction: 'in', type: 'Refnum' },
      { index: 99, direction: 'in', type: 'Boolean' } // extra
    ]);
    const { ok, mismatches } = compareTerminals(CENSUS_1926.terminals, missing.terminals);
    expect(ok).toBe(false);
    expect(mismatches.join(' ')).toContain('missing pack terminal index 10');
    expect(mismatches.join(' ')).toContain('extra pack terminal index 99');
  });
});

describe('validatePackAgainstCensus', () => {
  const census = { primitives: [CENSUS_1926, censusEntry('0', false, [{ index: 0, direction: 'output', type: 'Cluster' }]), censusEntry('1922', true, [{ index: 0, direction: 'output', type: 'Refnum' }])] };

  it('reports FAITHFUL + coverage gap for a valid partial pack', () => {
    const pack = { primitives: { '1926': FAITHFUL_PACK_1926 } };
    const { ok, results, uncovered } = validatePackAgainstCensus(pack, census);
    expect(ok).toBe(true);
    expect(results.find((r: any) => r.prim_id === '1926').status).toBe('FAITHFUL');
    expect(uncovered).toContain('1922'); // addressable, not mapped
    expect(uncovered).not.toContain('0'); // id-0 is not "coverable"
  });

  it('marks an id-0 mapping UNADDRESSABLE (not shippable) and fails the gate', () => {
    const pack = { primitives: { '0': packEntry([{ index: 0, direction: 'out', type: 'Cluster' }]) } };
    const { ok, results } = validatePackAgainstCensus(pack, census);
    expect(ok).toBe(false);
    expect(results[0].status).toBe('UNADDRESSABLE');
  });

  it('marks an unknown id (not in census) UNKNOWN and fails the gate', () => {
    const pack = { primitives: { '9999': packEntry([{ index: 0, direction: 'out', type: 'Refnum' }]) } };
    const { ok, results } = validatePackAgainstCensus(pack, census);
    expect(ok).toBe(false);
    expect(results[0].status).toBe('UNKNOWN');
  });
});
