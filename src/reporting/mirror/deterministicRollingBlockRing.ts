// Deterministic rolling-block ring buffer (VHS-REQ-707).
//
// A faithful cross-platform mirror of mprr's Windows zero-copy rolling-block ring
// IP (mprr MPRR-REQ-094, -104..-119). vi-history-suite is mprr's first governed
// fixture repo, and this substrate is what lets a first-run capture reach the
// DETERMINISM the Windows path achieved: a single preallocated continuous byte
// ring with no per-packet allocation in the hot path (so no GC/alloc jitter),
// SPSC producer/consumer semantics, admission control sized to a three-logical-
// block horizon, and a degradation policy that preserves short-packet continuity
// before long-packet completeness.
//
// mprr's Windows implementation gets zero-copy from a pagefile-backed section
// double-mapped so a wrap-spanning span is still contiguous; that VM trick is
// Windows-only. This TS mirror preallocates one typed array and returns a
// subarray VIEW for a contiguous read (true zero-copy) and a single copy only for
// a wrap-spanning read — the determinism-relevant property (no per-packet
// allocation on write) is preserved on every platform.
//
// Design (reporting-orchestration guardrails): pure/deterministic helpers plus a
// self-contained ring with no I/O, no clock, and no external dependency.

/** mprr monotonic timing authority resolution: 100 nanoseconds per tick. */
export const MPRR_TICKS_PER_MILLISECOND = 10_000;
/** mprr default logical block duration: 45 seconds. */
export const DEFAULT_BLOCK_DURATION_MS = 45_000;
/** The rolling live-history horizon: three logical blocks. */
export const THREE_BLOCK_HORIZON = 3;
/** Admission-control headroom applied over the three-block byte window (mprr uses 1.10). */
export const THREE_BLOCK_CAPACITY_HEADROOM = 1.1;
/** Hard minimum ring capacity (mirrors mprr's >= 4096 floor). */
export const MIN_RING_CAPACITY_BYTES = 4_096;
/** Block-boundary variation at or below this percent stays authoritative (mprr gate). */
export const BLOCK_BOUNDARY_AUTHORITATIVE_MAX_PERCENT = 5;
/** Normal-load block-boundary variation target (mprr aspirational bound). */
export const BLOCK_BOUNDARY_NORMAL_LOAD_TARGET_PERCENT = 1;

/** Convert a whole-millisecond block duration to 100ns timing-authority ticks. */
export function blockDurationTicks(blockDurationMs: number = DEFAULT_BLOCK_DURATION_MS): number {
  if (!Number.isFinite(blockDurationMs) || blockDurationMs <= 0) {
    throw new Error('blockDurationMs must be a positive number of milliseconds.');
  }
  return blockDurationMs * MPRR_TICKS_PER_MILLISECOND;
}

/** Logical block id for a 64-bit-style monotonic tick: floor(tick / blockDurationTicks). */
export function blockIdForTick(tick: number, blockDurationMs: number = DEFAULT_BLOCK_DURATION_MS): number {
  if (!Number.isFinite(tick)) {
    throw new Error('tick must be a finite number of timing-authority ticks.');
  }
  return Math.floor(tick / blockDurationTicks(blockDurationMs));
}

export interface PinnedBlocks {
  readonly currentBlockId: number;
  readonly reservedNextBlockId: number;
}

/**
 * mprr MPRR-REQ-107: an event pins the current logical block immediately and
 * reserves the next chronological block for mandatory persistence.
 */
export function pinCurrentAndReservedNext(triggerTick: number, blockDurationMs: number = DEFAULT_BLOCK_DURATION_MS): PinnedBlocks {
  const currentBlockId = blockIdForTick(triggerTick, blockDurationMs);
  return { currentBlockId, reservedNextBlockId: currentBlockId + 1 };
}

/** Bytes-per-block keyed by logical block id. */
export type BytesByBlockId = ReadonlyMap<number, number> | Readonly<Record<number, number>>;

function toBlockEntries(bytesByBlockId: BytesByBlockId): Array<[number, number]> {
  if (bytesByBlockId instanceof Map) {
    return [...bytesByBlockId.entries()];
  }
  return Object.entries(bytesByBlockId).map(([key, value]) => [Number(key), value]);
}

/**
 * mprr MPRR-REQ-110 capacity formula: the maximum bytes summed over any three
 * consecutive logical blocks, times a 1.10 headroom, rounded up.
 */
export function computeRequiredThreeBlockCapacityBytes(bytesByBlockId: BytesByBlockId): number {
  const entries = toBlockEntries(bytesByBlockId);
  if (entries.length === 0) {
    return 0;
  }
  const bytesByBlock = new Map<number, number>();
  let minBlockId = Number.POSITIVE_INFINITY;
  let maxBlockId = Number.NEGATIVE_INFINITY;
  for (const [blockId, bytes] of entries) {
    bytesByBlock.set(blockId, bytes);
    minBlockId = Math.min(minBlockId, blockId);
    maxBlockId = Math.max(maxBlockId, blockId);
  }

  let maxWindowBytes = 0;
  for (let windowStart = minBlockId; windowStart <= maxBlockId; windowStart += 1) {
    let windowBytes = 0;
    for (let offset = 0; offset < THREE_BLOCK_HORIZON; offset += 1) {
      windowBytes += bytesByBlock.get(windowStart + offset) ?? 0;
    }
    maxWindowBytes = Math.max(maxWindowBytes, windowBytes);
  }
  return Math.ceil(maxWindowBytes * THREE_BLOCK_CAPACITY_HEADROOM);
}

export interface RingAdmission {
  readonly ok: boolean;
  readonly requiredBytes: number;
  readonly configuredBytes: number;
  readonly reason?: string;
}

/**
 * mprr MPRR-REQ-110 admission control: fail closed before capture starts when the
 * configured per-stream byte budget cannot hold the three-block horizon.
 */
export function planRingAdmission(configuredCapacityBytes: number, bytesByBlockId: BytesByBlockId): RingAdmission {
  const requiredBytes = computeRequiredThreeBlockCapacityBytes(bytesByBlockId);
  if (configuredCapacityBytes >= requiredBytes) {
    return { ok: true, requiredBytes, configuredBytes: configuredCapacityBytes };
  }
  return {
    ok: false,
    requiredBytes,
    configuredBytes: configuredCapacityBytes,
    reason: `admission-control-blocked: configured capacity ${configuredCapacityBytes} cannot hold required three-block horizon ${requiredBytes}`
  };
}

/** Percent deviation of an observed block span from its expected duration. */
export function blockBoundaryVariationPercent(startTick: number, endTick: number, expectedDurationTicks: number): number {
  if (!Number.isFinite(expectedDurationTicks) || expectedDurationTicks <= 0) {
    throw new Error('expectedDurationTicks must be a positive number.');
  }
  return (Math.abs(endTick - startTick - expectedDurationTicks) / expectedDurationTicks) * 100;
}

export type BlockBoundaryClassification = 'authoritative' | 'non-authoritative';

/** mprr MPRR-REQ-106: variation over 5 percent is classified non-authoritative. */
export function classifyBlockBoundary(variationPercent: number): BlockBoundaryClassification {
  return variationPercent <= BLOCK_BOUNDARY_AUTHORITATIVE_MAX_PERCENT ? 'authoritative' : 'non-authoritative';
}

export type PacketStreamKind = 'short' | 'long';
export type DegradeAction = 'admit' | 'block-producer' | 'defer-long' | 'fail-closed';

export interface DegradationInput {
  readonly stream: PacketStreamKind;
  readonly freeBytes: number;
  readonly payloadBytes: number;
  /** True when reclaiming to admit would overwrite still-unpersisted pinned short-packet bytes. */
  readonly pinnedShortAtRisk: boolean;
}

/**
 * mprr MPRR-REQ-094/-110/-111 degradation policy: preserve short-packet continuity
 * before long-packet completeness. Short packets never drop — the producer waits,
 * and fails closed rather than overwrite pinned short bytes; long packets defer.
 */
export function decideDegradation(input: DegradationInput): DegradeAction {
  if (input.payloadBytes <= input.freeBytes) {
    return 'admit';
  }
  if (input.stream === 'long') {
    return 'defer-long';
  }
  return input.pinnedShortAtRisk ? 'fail-closed' : 'block-producer';
}

export interface RingWriteResult {
  readonly ok: boolean;
  readonly absoluteStart: number;
  readonly absoluteEnd: number;
  readonly wrapOccurred: boolean;
  readonly reason?: string;
}

/**
 * A single-producer/single-consumer continuous byte ring over one preallocated
 * backing buffer. Writes never allocate; a contiguous read returns a zero-copy
 * subarray view. Absolute byte offsets are monotonic; modulo maps them into the
 * backing buffer. Fail-closed: a write that would overwrite unconsumed bytes is
 * rejected rather than silently overwriting them (short-packet continuity).
 */
export class DeterministicRollingBlockRing {
  private readonly buffer: Uint8Array;
  private readonly capacity: number;
  private headPublished = 0;
  private tailConsumed = 0;

  constructor(capacityBytes: number) {
    if (!Number.isInteger(capacityBytes) || capacityBytes < MIN_RING_CAPACITY_BYTES) {
      throw new Error(`capacityBytes must be an integer >= ${MIN_RING_CAPACITY_BYTES}.`);
    }
    this.capacity = capacityBytes;
    this.buffer = new Uint8Array(capacityBytes);
  }

  get capacityBytes(): number {
    return this.capacity;
  }

  get usedBytes(): number {
    return this.headPublished - this.tailConsumed;
  }

  get freeBytes(): number {
    return this.capacity - this.usedBytes;
  }

  get publishedOffset(): number {
    return this.headPublished;
  }

  get consumedOffset(): number {
    return this.tailConsumed;
  }

  /** Producer: copy a payload into the ring, wrapping if needed. Never allocates. */
  write(payload: Uint8Array): RingWriteResult {
    const length = payload.length;
    const start = this.headPublished;
    if (length > this.capacity) {
      return { ok: false, absoluteStart: start, absoluteEnd: start, wrapOccurred: false, reason: 'payload-exceeds-capacity' };
    }
    if (length > this.freeBytes) {
      return { ok: false, absoluteStart: start, absoluteEnd: start, wrapOccurred: false, reason: 'backpressure' };
    }
    const offset = start % this.capacity;
    const wrapOccurred = offset + length > this.capacity;
    if (!wrapOccurred) {
      this.buffer.set(payload, offset);
    } else {
      const firstLength = this.capacity - offset;
      this.buffer.set(payload.subarray(0, firstLength), offset);
      this.buffer.set(payload.subarray(firstLength), 0);
    }
    this.headPublished = start + length;
    return { ok: true, absoluteStart: start, absoluteEnd: this.headPublished, wrapOccurred };
  }

  /** Consumer: read a published, unconsumed range. Zero-copy view when contiguous. */
  read(absoluteStart: number, length: number): Uint8Array {
    if (length < 0 || length > this.capacity) {
      throw new RangeError('length must be between 0 and the ring capacity.');
    }
    if (absoluteStart < this.tailConsumed || absoluteStart + length > this.headPublished) {
      throw new RangeError('requested range is outside the readable window.');
    }
    const offset = absoluteStart % this.capacity;
    if (offset + length <= this.capacity) {
      return this.buffer.subarray(offset, offset + length);
    }
    const out = new Uint8Array(length);
    const firstLength = this.capacity - offset;
    out.set(this.buffer.subarray(offset), 0);
    out.set(this.buffer.subarray(0, length - firstLength), firstLength);
    return out;
  }

  /** Consumer: advance the reclaim frontier after persisting up to an absolute offset. */
  advanceTail(absoluteOffset: number): void {
    if (absoluteOffset < this.tailConsumed || absoluteOffset > this.headPublished) {
      throw new RangeError('advanceTail offset must be between the consumed and published frontiers.');
    }
    this.tailConsumed = absoluteOffset;
  }
}
