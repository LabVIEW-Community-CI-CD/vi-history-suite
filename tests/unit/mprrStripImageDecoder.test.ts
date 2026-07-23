// Requirement coverage: VHS-REQ-710 (NI LabVIEW setup diagnostics family) — the
// mprr stopwatch machine-strip image decoder (VHS-REQ-710.9). Image-processing
// primitive: sampled luminance row in, decoded 40-bit strip + centiseconds out.
import { describe, expect, it } from 'vitest';

import { decodeMprrStripImage, luminance } from '../../src/reporting/syncDiagnostics/mprrStripImageDecoder';

// Expand a 40-bit strip string into a sampled luminance row (dark cell = bit 1).
function bitsToRow(bits: string, samplesPerCell = 10, dark = 10, light = 245): number[] {
  const row: number[] = [];
  for (const bit of bits) {
    for (let i = 0; i < samplesPerCell; i += 1) {
      row.push(bit === '1' ? dark : light);
    }
  }
  return row;
}

function stripForCentiseconds(cs: number): string {
  const payload = cs.toString(2).padStart(24, '0');
  const checksum = (((cs >> 16) & 0xff) ^ ((cs >> 8) & 0xff) ^ (cs & 0xff)).toString(2).padStart(8, '0');
  return `10100101${payload}${checksum}`;
}

describe('luminance (VHS-REQ-710.9)', () => {
  it('computes Rec. 601 luma', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(255, 5);
    expect(luminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(76.245, 3);
  });
});

describe('decodeMprrStripImage (VHS-REQ-710.9)', () => {
  it('decodes a clean strip to the printed centiseconds', () => {
    const decoded = decodeMprrStripImage({ rowLuminance: bitsToRow(stripForCentiseconds(100)) });
    expect(decoded.stripBits).toBe(stripForCentiseconds(100));
    expect(decoded.preambleOk).toBe(true);
    expect(decoded.centiseconds).toBe(100);
    expect(decoded.checksumOk).toBe(true);
    expect(decoded.wellFormed).toBe(true);
  });

  it('decodes a non-trivial checksum value and is robust to noisy (non-0/255) luminance', () => {
    const bits = stripForCentiseconds(0x010205); // bytes 1,2,5 -> checksum 6
    const decoded = decodeMprrStripImage({ rowLuminance: bitsToRow(bits, 8, 60, 190) });
    expect(decoded.centiseconds).toBe(0x010205);
    expect(decoded.checksumComputed).toBe(6);
    expect(decoded.checksumOk).toBe(true);
    expect(decoded.wellFormed).toBe(true);
  });

  it('honors a fixed threshold override', () => {
    const decoded = decodeMprrStripImage({ rowLuminance: bitsToRow(stripForCentiseconds(50)), threshold: 128 });
    expect(decoded.threshold).toBe(128);
    expect(decoded.centiseconds).toBe(50);
  });

  it('marks a bad preamble as not well-formed without throwing', () => {
    const badBits = `00000000${stripForCentiseconds(100).slice(8)}`;
    const decoded = decodeMprrStripImage({ rowLuminance: bitsToRow(badBits) });
    expect(decoded.preambleOk).toBe(false);
    expect(decoded.wellFormed).toBe(false);
  });

  it('detects a corrupted checksum (bit flip in payload) as not well-formed', () => {
    const bits = stripForCentiseconds(100);
    // Flip a payload bit so the checksum no longer matches.
    const flipped = `${bits.slice(0, 9)}${bits[9] === '1' ? '0' : '1'}${bits.slice(10)}`;
    const decoded = decodeMprrStripImage({ rowLuminance: bitsToRow(flipped) });
    expect(decoded.preambleOk).toBe(true);
    expect(decoded.checksumOk).toBe(false);
    expect(decoded.wellFormed).toBe(false);
  });

  it('fails closed on a short row and a non-positive bit count', () => {
    expect(() => decodeMprrStripImage({ rowLuminance: [0, 255, 0] })).toThrow(/at least 40 samples/);
    expect(() => decodeMprrStripImage({ rowLuminance: bitsToRow(stripForCentiseconds(1)), bitCount: 0 })).toThrow(/positive integer/);
  });

  it('fails closed on a non-finite luminance sample instead of silently zeroing the strip', () => {
    const row: number[] = new Array(40).fill(120);
    row[5] = Number.NaN;
    expect(() => decodeMprrStripImage({ rowLuminance: row })).toThrow(/finite luminance samples/);
  });

  it('fails closed on a non-finite threshold override', () => {
    expect(() =>
      decodeMprrStripImage({ rowLuminance: bitsToRow(stripForCentiseconds(50)), threshold: Number.NaN })
    ).toThrow(/threshold must be a finite number/);
  });

  it('yields null centiseconds/checksum when the strip is too short to carry the payload', () => {
    const decoded = decodeMprrStripImage({ rowLuminance: bitsToRow('10100101'), bitCount: 8 });
    expect(decoded.preambleOk).toBe(true);
    expect(decoded.centiseconds).toBeNull();
    expect(decoded.checksumField).toBeNull();
    expect(decoded.checksumComputed).toBeNull();
    expect(decoded.wellFormed).toBe(false);
  });
});
