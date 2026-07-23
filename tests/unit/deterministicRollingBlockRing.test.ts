// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the deterministic rolling-block ring (VHS-REQ-707.18), a faithful cross-platform
// mirror of mprr's Windows zero-copy rolling-block ring IP. Pure/deterministic:
// bounded RAM, no per-write allocation, SPSC, three-block admission control.
import { describe, expect, it } from 'vitest';

import {
  BLOCK_BOUNDARY_AUTHORITATIVE_MAX_PERCENT,
  DEFAULT_BLOCK_DURATION_MS,
  DeterministicRollingBlockRing,
  MIN_RING_CAPACITY_BYTES,
  MPRR_TICKS_PER_MILLISECOND,
  blockBoundaryVariationPercent,
  blockDurationTicks,
  blockIdForTick,
  classifyBlockBoundary,
  computeRequiredThreeBlockCapacityBytes,
  decideDegradation,
  pinCurrentAndReservedNext,
  planRingAdmission
} from '../../src/reporting/mirror/deterministicRollingBlockRing';

describe('block timing helpers (VHS-REQ-707.18)', () => {
  it('converts block duration to 100ns ticks and derives block ids', () => {
    expect(MPRR_TICKS_PER_MILLISECOND).toBe(10_000);
    expect(blockDurationTicks()).toBe(DEFAULT_BLOCK_DURATION_MS * 10_000); // 450,000,000
    expect(blockDurationTicks(1)).toBe(10_000);
    expect(blockIdForTick(0)).toBe(0);
    expect(blockIdForTick(450_000_000)).toBe(1);
    expect(blockIdForTick(449_999_999)).toBe(0);
  });

  it('pins the current block and reserves the next', () => {
    expect(pinCurrentAndReservedNext(450_000_000)).toEqual({ currentBlockId: 1, reservedNextBlockId: 2 });
  });

  it('fails closed on a non-positive block duration and a non-finite tick', () => {
    expect(() => blockDurationTicks(0)).toThrow(/positive number/);
    expect(() => blockDurationTicks(Number.NaN)).toThrow(/positive number/);
    expect(() => blockIdForTick(Number.POSITIVE_INFINITY)).toThrow(/finite number/);
  });
});

describe('three-block capacity + admission control (VHS-REQ-707.18)', () => {
  it('computes the max three-consecutive-block window times 1.10 headroom', () => {
    // windows: [0..2]=600, [1..3]=900, [2..4]=700, [3..5]=400 -> max 900 -> ceil(900*1.10)=991.
    const record = { 0: 100, 1: 200, 2: 300, 3: 400 };
    expect(computeRequiredThreeBlockCapacityBytes(record)).toBe(991);
    const map = new Map<number, number>([[0, 100], [1, 200], [2, 300], [3, 400]]);
    expect(computeRequiredThreeBlockCapacityBytes(map)).toBe(991);
    expect(computeRequiredThreeBlockCapacityBytes(new Map())).toBe(0);
  });

  it('scores a sparse ledger by populated block (not the id range) so widely-separated blocks stay cheap', () => {
    // Blocks 0 and 1_000_000 are populated; the max three-consecutive-block
    // window is the lone 500-byte block. The result is correct WITHOUT scanning
    // the million empty ids between them (candidate starts derive from populated
    // blocks only).
    const sparse = new Map<number, number>([[0, 100], [1_000_000, 500]]);
    expect(computeRequiredThreeBlockCapacityBytes(sparse)).toBe(Math.ceil(500 * 1.1));
  });

  it('admits when the budget holds the horizon and fails closed otherwise', () => {
    const record = { 0: 100, 1: 200, 2: 300, 3: 400 };
    expect(planRingAdmission(991, record)).toMatchObject({ ok: true, requiredBytes: 991, configuredBytes: 991 });
    const blocked = planRingAdmission(500, record);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/admission-control-blocked/);
    expect(blocked.requiredBytes).toBe(991);
  });
});

describe('block-boundary variation (VHS-REQ-707.18)', () => {
  it('measures percent deviation and classifies at the 5 percent gate', () => {
    const expected = blockDurationTicks(); // 450,000,000
    expect(blockBoundaryVariationPercent(0, expected, expected)).toBe(0);
    expect(blockBoundaryVariationPercent(0, expected * 1.01, expected)).toBeCloseTo(1, 6);
    expect(classifyBlockBoundary(1)).toBe('authoritative');
    expect(classifyBlockBoundary(BLOCK_BOUNDARY_AUTHORITATIVE_MAX_PERCENT)).toBe('authoritative');
    expect(classifyBlockBoundary(6)).toBe('non-authoritative');
    expect(() => blockBoundaryVariationPercent(0, 1, 0)).toThrow(/positive number/);
  });
});

describe('degradation policy — short continuity before long completeness (VHS-REQ-707.18)', () => {
  it('admits when it fits, defers long under pressure, blocks short, and fails closed on pinned short', () => {
    expect(decideDegradation({ stream: 'short', freeBytes: 100, payloadBytes: 50, pinnedShortAtRisk: false })).toBe('admit');
    expect(decideDegradation({ stream: 'long', freeBytes: 10, payloadBytes: 50, pinnedShortAtRisk: false })).toBe('defer-long');
    expect(decideDegradation({ stream: 'short', freeBytes: 10, payloadBytes: 50, pinnedShortAtRisk: false })).toBe('block-producer');
    expect(decideDegradation({ stream: 'short', freeBytes: 10, payloadBytes: 50, pinnedShortAtRisk: true })).toBe('fail-closed');
  });
});

describe('DeterministicRollingBlockRing (VHS-REQ-707.18)', () => {
  it('rejects an invalid capacity', () => {
    expect(() => new DeterministicRollingBlockRing(1024)).toThrow(/>= 4096/);
    expect(() => new DeterministicRollingBlockRing(4096.5)).toThrow(/integer/);
    expect(new DeterministicRollingBlockRing(MIN_RING_CAPACITY_BYTES).capacityBytes).toBe(4096);
  });

  it('writes and reads back a contiguous payload as a zero-copy view', () => {
    const ring = new DeterministicRollingBlockRing(4096);
    const payload = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);
    const write = ring.write(payload);
    expect(write).toMatchObject({ ok: true, absoluteStart: 0, absoluteEnd: 1000, wrapOccurred: false });
    expect(ring.usedBytes).toBe(1000);
    expect(ring.freeBytes).toBe(3096);

    const view = ring.read(0, 1000);
    expect(Array.from(view)).toEqual(Array.from(payload));
    // A contiguous read is a view into the full backing ArrayBuffer (zero-copy).
    expect(view.buffer.byteLength).toBe(4096);
  });

  it('fails closed on an over-capacity payload and on backpressure without allocating', () => {
    const ring = new DeterministicRollingBlockRing(4096);
    expect(ring.write(new Uint8Array(5000))).toMatchObject({ ok: false, reason: 'payload-exceeds-capacity' });
    expect(ring.write(new Uint8Array(3000)).ok).toBe(true);
    // 3000 used, 1096 free; a 2000 write would overwrite unconsumed bytes -> rejected.
    expect(ring.write(new Uint8Array(2000))).toMatchObject({ ok: false, reason: 'backpressure' });
  });

  it('wraps across the modulo boundary and reconstructs a wrap-spanning read as a copy', () => {
    const ring = new DeterministicRollingBlockRing(4096);
    ring.write(new Uint8Array(3000));
    ring.advanceTail(3000); // consume the first chunk, freeing space
    const payload = Uint8Array.from({ length: 2000 }, (_, i) => (i * 7 + 1) % 256);
    const write = ring.write(payload);
    expect(write).toMatchObject({ ok: true, absoluteStart: 3000, absoluteEnd: 5000, wrapOccurred: true });

    const readBack = ring.read(3000, 2000);
    expect(Array.from(readBack)).toEqual(Array.from(payload));
    // A wrap-spanning read is a fresh copy sized to the request (not the backing).
    expect(readBack.buffer.byteLength).toBe(2000);
  });

  it('bounds RAM across a long stream by reclaiming consumed bytes (MCP consumption model)', () => {
    const ring = new DeterministicRollingBlockRing(4096);
    let produced = 0;
    // Stream far more than the capacity through a bounded ring: consume-then-produce.
    for (let i = 0; i < 100; i += 1) {
      const chunk = new Uint8Array(1000).fill(i % 256);
      const write = ring.write(chunk);
      expect(write.ok).toBe(true);
      produced += 1000;
      // Consumer reads the just-published range then advances the tail (reclaim).
      const view = ring.read(write.absoluteStart, 1000);
      expect(view[0]).toBe(i % 256);
      ring.advanceTail(write.absoluteEnd);
      expect(ring.usedBytes).toBe(0);
    }
    expect(produced).toBe(100_000); // 100 KB streamed through a 4 KB ring
    expect(ring.capacityBytes).toBe(4096);
    expect(ring.publishedOffset).toBe(100_000);
    expect(ring.consumedOffset).toBe(100_000);
  });

  it('validates read and advanceTail ranges', () => {
    const ring = new DeterministicRollingBlockRing(4096);
    ring.write(new Uint8Array(500));
    expect(() => ring.read(0, -1)).toThrow(/between 0 and the ring capacity/);
    expect(() => ring.read(0, 5000)).toThrow(/between 0 and the ring capacity/);
    expect(() => ring.read(0, 1000)).toThrow(/outside the readable window/); // only 500 published
    expect(() => ring.advanceTail(-1)).toThrow(/between the consumed and published/);
    expect(() => ring.advanceTail(600)).toThrow(/between the consumed and published/); // beyond published 500
  });
});
