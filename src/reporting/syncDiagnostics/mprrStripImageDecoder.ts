/**
 * mprr stopwatch machine-strip image decoder (VHS-REQ-710 diagnostics family).
 *
 * Image-processing primitive that recovers the printed stopwatch time from a
 * CAPTURED FRAME. mprr's stopwatch surface renders a 40-bit machine strip as a row
 * of black/white cells: an 8-bit preamble (`10100101`), a 24-bit centiseconds
 * payload, and an 8-bit XOR checksum. This module segments a sampled strip row
 * into 40 cells, thresholds each cell's luminance to a bit, and decodes the
 * centiseconds — so a headless capture can be post-processed into the same time
 * the stopwatch printed, and its accuracy measured against the capture cadence.
 *
 * Pure and deterministic: pixel samples in, decoded bits + centiseconds out, no
 * I/O. It never throws on a malformed strip; the caller inspects `wellFormed`.
 */

import { MACHINE_STRIP_BIT_LENGTH, STOPWATCH_PREAMBLE } from './syncPatternFailureSignature';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Rec. 601 luma of an RGB triple (0-255). */
export function luminance(rgb: Rgb): number {
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

export interface DecodeStripImageInput {
  /** Luminance samples spanning the full strip width, left to right (length >= bitCount). */
  readonly rowLuminance: readonly number[];
  /** Number of strip cells; defaults to the 40-bit machine strip. */
  readonly bitCount?: number;
  /** Optional fixed black/white threshold; defaults to the min/max midpoint. */
  readonly threshold?: number;
}

export interface DecodedStripImage {
  readonly stripBits: string;
  readonly cellLuminance: readonly number[];
  readonly threshold: number;
  readonly preambleOk: boolean;
  readonly centiseconds: number | null;
  readonly checksumField: number | null;
  readonly checksumComputed: number | null;
  readonly checksumOk: boolean;
  readonly wellFormed: boolean;
}

/**
 * Decode the machine strip from a sampled luminance row. Segments the row into
 * `bitCount` equal cells, samples each cell's middle third (avoiding cell-edge
 * bleed), thresholds to a bit (darker than threshold = 1/black), and decodes the
 * centiseconds + checksum. Fail-closed on a row shorter than the cell count or a
 * non-positive cell count.
 */
export function decodeMprrStripImage(input: DecodeStripImageInput): DecodedStripImage {
  const bitCount = input.bitCount ?? MACHINE_STRIP_BIT_LENGTH;
  if (!Number.isInteger(bitCount) || bitCount <= 0) {
    throw new Error('bitCount must be a positive integer.');
  }
  if (!Array.isArray(input.rowLuminance) || input.rowLuminance.length < bitCount) {
    throw new Error(`rowLuminance must have at least ${bitCount} samples.`);
  }

  const length = input.rowLuminance.length;
  const cellWidth = length / bitCount;
  const cellLuminance: number[] = [];
  for (let i = 0; i < bitCount; i += 1) {
    const start = Math.floor(i * cellWidth);
    const end = Math.max(start + 1, Math.floor((i + 1) * cellWidth));
    const inset = Math.floor((end - start) / 3);
    const from = start + inset;
    const to = Math.max(from + 1, end - inset);
    // length >= bitCount guarantees cellWidth >= 1, so [from, to) always has a
    // sample within the row.
    let sum = 0;
    let count = 0;
    for (let x = from; x < to; x += 1) {
      sum += input.rowLuminance[x];
      count += 1;
    }
    cellLuminance.push(sum / count);
  }

  // Compute the black/white midpoint iteratively: `bitCount` is caller-controlled,
  // so a spread (Math.min(...cellLuminance)) could throw on a very large array.
  let minLuminance = cellLuminance[0];
  let maxLuminance = cellLuminance[0];
  for (const value of cellLuminance) {
    if (value < minLuminance) {
      minLuminance = value;
    }
    if (value > maxLuminance) {
      maxLuminance = value;
    }
  }
  const threshold = input.threshold ?? (minLuminance + maxLuminance) / 2;
  const stripBits = cellLuminance.map((value) => (value < threshold ? '1' : '0')).join('');

  const preamble = stripBits.slice(0, STOPWATCH_PREAMBLE.length);
  const preambleOk = preamble === STOPWATCH_PREAMBLE;
  const payloadBits = stripBits.slice(8, 32);
  const checksumBits = stripBits.slice(32, 40);
  const centiseconds = /^[01]{24}$/u.test(payloadBits) ? Number.parseInt(payloadBits, 2) : null;
  const checksumField = /^[01]{8}$/u.test(checksumBits) ? Number.parseInt(checksumBits, 2) : null;

  let checksumComputed: number | null = null;
  let checksumOk = false;
  if (centiseconds !== null) {
    const high = (centiseconds >> 16) & 0xff;
    const middle = (centiseconds >> 8) & 0xff;
    const low = centiseconds & 0xff;
    checksumComputed = high ^ middle ^ low;
    checksumOk = checksumField === checksumComputed;
  }
  const wellFormed = preambleOk && centiseconds !== null && checksumField !== null && checksumOk && stripBits.length === bitCount;

  return {
    stripBits,
    cellLuminance,
    threshold,
    preambleOk,
    centiseconds,
    checksumField,
    checksumComputed,
    checksumOk,
    wellFormed
  };
}
