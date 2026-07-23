import { describe, expect, it } from 'vitest';
import {
  analyzeSyncPattern,
  decodeMachineStrip,
  STOPWATCH_PREAMBLE,
  MACHINE_STRIP_BIT_LENGTH,
  type SyncFrameInput
} from '../../src/reporting/syncDiagnostics/syncPatternFailureSignature';

// Build a valid 40-bit machine strip exactly as the stopwatch surface renders it:
// [8-bit preamble 10100101][24-bit centiseconds][8-bit XOR checksum].
function strip(centiseconds: number): string {
  const payload = (centiseconds & 0xffffff).toString(2).padStart(24, '0');
  const high = Number.parseInt(payload.slice(0, 8), 2);
  const mid = Number.parseInt(payload.slice(8, 16), 2);
  const low = Number.parseInt(payload.slice(16, 24), 2);
  const checksum = (high ^ mid ^ low).toString(2).padStart(8, '0');
  return `${STOPWATCH_PREAMBLE}${payload}${checksum}`;
}

function frame(index: number, over: Partial<SyncFrameInput> = {}): SyncFrameInput {
  return { index, stripBits: strip(index * 5), fiducialMarkersDetected: 4, stripWithinBounds: true, ...over };
}

describe('decodeMachineStrip (VHS-REQ-710.4)', () => {
  it('decodes a well-formed strip with matching checksum', () => {
    const d = decodeMachineStrip(strip(12345));
    expect(d.wellFormed).toBe(true);
    expect(d.preambleOk).toBe(true);
    expect(d.centiseconds).toBe(12345);
    expect(d.checksumOk).toBe(true);
  });

  it('marks a wrong-length strip not well-formed', () => {
    expect(decodeMachineStrip('1010').wellFormed).toBe(false);
    expect(decodeMachineStrip(42 as never).wellFormed).toBe(false);
    expect(strip(0).length).toBe(MACHINE_STRIP_BIT_LENGTH);
  });

  it('detects a flipped checksum bit', () => {
    const good = strip(1000);
    const flipped = good.slice(0, 39) + (good[39] === '0' ? '1' : '0');
    expect(decodeMachineStrip(flipped).checksumOk).toBe(false);
  });
});

describe('analyzeSyncPattern (VHS-REQ-710.4)', () => {
  it('reports healthy for a clean monotonic sequence', () => {
    const r = analyzeSyncPattern([frame(0), frame(1), frame(2)]);
    expect(r.signature).toBe('healthy');
    expect(r.firstOffendingFrame).toBeNull();
    expect(r.findings).toHaveLength(0);
  });

  it('classifies a preamble mismatch (mislocated strip)', () => {
    const bad = frame(1, { stripBits: '00000000' + strip(5).slice(8) });
    const r = analyzeSyncPattern([frame(0), bad, frame(2)]);
    expect(r.signature).toBe('preamble-mismatch');
    expect(r.firstOffendingFrame).toBe(1);
  });

  it('classifies a checksum mismatch (bit corruption)', () => {
    const good = strip(5);
    const corrupt = good.slice(0, 39) + (good[39] === '0' ? '1' : '0');
    const r = analyzeSyncPattern([frame(0), frame(1, { stripBits: corrupt }), frame(2)]);
    expect(r.signature).toBe('checksum-mismatch');
    expect(r.firstOffendingFrame).toBe(1);
  });

  it('classifies non-monotonic centiseconds (reordered/reset frames)', () => {
    const r = analyzeSyncPattern([
      { index: 0, stripBits: strip(100), fiducialMarkersDetected: 4, stripWithinBounds: true },
      { index: 1, stripBits: strip(50), fiducialMarkersDetected: 4, stripWithinBounds: true }
    ]);
    expect(r.signature).toBe('centiseconds-non-monotonic');
    expect(r.firstOffendingFrame).toBe(1);
  });

  it('classifies a stalled clock when an expected step is given', () => {
    const r = analyzeSyncPattern(
      [
        { index: 0, stripBits: strip(10), fiducialMarkersDetected: 4, stripWithinBounds: true },
        { index: 1, stripBits: strip(10), fiducialMarkersDetected: 4, stripWithinBounds: true }
      ],
      { expectedCentisecondStep: 5 }
    );
    expect(r.signature).toBe('centiseconds-stalled');
  });

  it('classifies a dropped-frame gap when an expected step is given', () => {
    const r = analyzeSyncPattern(
      [
        { index: 0, stripBits: strip(10), fiducialMarkersDetected: 4, stripWithinBounds: true },
        { index: 1, stripBits: strip(100), fiducialMarkersDetected: 4, stripWithinBounds: true }
      ],
      { expectedCentisecondStep: 5, gapTolerance: 0.5 }
    );
    expect(r.signature).toBe('centiseconds-gap');
  });

  it('reports fiducial-missing as the root cause over downstream symptoms', () => {
    // A frame missing fiducials AND with a corrupt strip -> fiducial-missing wins.
    const bad = { index: 1, stripBits: '111', fiducialMarkersDetected: 2, stripWithinBounds: false };
    const r = analyzeSyncPattern([frame(0), bad, frame(2)]);
    expect(r.signature).toBe('fiducial-missing');
    expect(r.firstOffendingFrame).toBe(1);
  });

  it('classifies strip-out-of-bounds when fiducials are present', () => {
    const r = analyzeSyncPattern([frame(0), frame(1, { stripWithinBounds: false })]);
    expect(r.signature).toBe('strip-out-of-bounds');
  });

  it('throws on a non-array input', () => {
    expect(() => analyzeSyncPattern(undefined as never)).toThrow(/array of frames/);
  });
});

describe('analyzeSyncPattern branch coverage (VHS-REQ-710.4)', () => {
  it('reports a malformed (wrong-length) strip as preamble-mismatch when fiducials are present and in bounds', () => {
    // Fiducials present + in bounds, but the strip is not 40 clean bits: the
    // preamble-mismatch detail takes the "malformed strip" branch.
    const bad: SyncFrameInput = { index: 1, stripBits: '111', fiducialMarkersDetected: 4, stripWithinBounds: true };
    const r = analyzeSyncPattern([frame(0), bad]);
    expect(r.signature).toBe('preamble-mismatch');
    expect(r.firstOffendingFrame).toBe(1);
    expect(r.findings.find((f) => f.index === 1)?.detail).toContain('malformed strip');
  });

  it('stays healthy for a normal in-tolerance step when an expected step is given', () => {
    // step === 5 is neither a stall (0) nor a gap (> 5 * 1.5): the else-if guard
    // falls through to its implicit else and the sequence stays healthy.
    const r = analyzeSyncPattern(
      [
        { index: 0, stripBits: strip(10), fiducialMarkersDetected: 4, stripWithinBounds: true },
        { index: 1, stripBits: strip(15), fiducialMarkersDetected: 4, stripWithinBounds: true }
      ],
      { expectedCentisecondStep: 5, gapTolerance: 0.5 }
    );
    expect(r.signature).toBe('healthy');
    expect(r.findings).toHaveLength(0);
  });

  it('keeps the earliest frame as the offender when multiple frames share the dominant signature', () => {
    // Two frames carry the same (checksum-mismatch) signature. The second frame
    // is not more fundamental than the running dominant, so the reduction takes
    // the else-if guard (evaluating both operands) while the earliest frame index
    // is retained as the offender.
    const flip = (n: number): string => {
      const good = strip(n);
      return good.slice(0, 39) + (good[39] === '0' ? '1' : '0');
    };
    const r = analyzeSyncPattern([
      { index: 0, stripBits: flip(5), fiducialMarkersDetected: 4, stripWithinBounds: true },
      { index: 1, stripBits: flip(6), fiducialMarkersDetected: 4, stripWithinBounds: true }
    ]);
    expect(r.signature).toBe('checksum-mismatch');
    expect(r.findings).toHaveLength(2);
    expect(r.firstOffendingFrame).toBe(0);
  });
});
