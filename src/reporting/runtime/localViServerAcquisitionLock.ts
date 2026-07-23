/**
 * VHS-REQ-669: serialize local VI Server acquisition.
 *
 * A single host-native LabVIEW install exposes exactly one local VI Server
 * endpoint (the derived `server.tcp.port`, default 3363). When more than one
 * host-native LabVIEWCLI launch is issued at once against that same endpoint —
 * for example an interactive preview render racing a background warm render, or
 * several previews requested in quick succession — they contend on the one VI
 * Server, which manifests as slow/stalled cold launches under load. This module
 * provides a small in-process serialization primitive so those launches take
 * turns on a given endpoint instead of racing.
 *
 * The lock is a per-key FIFO single-flight queue: `acquire(key)` resolves only
 * once every earlier acquirer of the same key has released, and returns a
 * release function. Distinct keys (distinct endpoints) never block each other.
 * The release function is idempotent so callers can safely invoke it from a
 * `finally` block whether or not the launch succeeded.
 *
 * The lock governs only local (host-native) VI Server acquisition; container /
 * docker runs address their own container endpoint and never acquire a slot.
 */

/** Serialization lock for local VI Server acquisition, keyed by endpoint. */
export interface LocalViServerAcquisitionLock {
  /**
   * Acquires the slot for `key`, resolving once all earlier acquirers of the
   * same key have released. Returns an idempotent release function.
   */
  acquire(key: string): Promise<() => void>;
  /** True when the slot for `key` is currently held or has waiters queued. */
  isBusy(key: string): boolean;
  /** Number of acquirers queued behind the current holder of `key`. */
  waitingCount(key: string): number;
}

/** Inputs used to derive a stable local VI Server lock key. */
export interface LocalViServerLockKeyParams {
  /** Runtime provider requesting the launch (only `host-native` serializes). */
  provider: string;
  /** Derived local VI Server TCP port; falls back to `default` when unknown. */
  portNumber?: number;
}

/**
 * Derives a stable lock key for a local VI Server endpoint. Two launches that
 * resolve to the same provider and port share a key (and therefore serialize);
 * launches against different ports get different keys and run concurrently.
 */
export function localViServerLockKey(params: LocalViServerLockKeyParams): string {
  const port =
    typeof params.portNumber === 'number' &&
    Number.isInteger(params.portNumber) &&
    params.portNumber > 0
      ? String(params.portNumber)
      : 'default';
  return `${params.provider}:${port}`;
}

/**
 * Creates an isolated local VI Server acquisition lock. Each instance keeps its
 * own per-key queues; use {@link sharedLocalViServerAcquisitionLock} for the
 * process-wide default and a fresh instance in unit tests.
 */
export function createLocalViServerAcquisitionLock(): LocalViServerAcquisitionLock {
  // Tail promise per key: the newest acquirer's "I have released" promise. A
  // new acquirer waits on the current tail, then installs its own tail.
  const tails = new Map<string, Promise<void>>();
  // Total acquirers per key (current holder + queued waiters), used to report
  // busy/waiting state and to prune the map once a key goes fully idle.
  const depth = new Map<string, number>();

  async function acquire(key: string): Promise<() => void> {
    const previous = tails.get(key) ?? Promise.resolve();
    // Definite-assignment: the Promise executor runs synchronously during
    // construction below, so releaseSlot is always assigned before any use. A
    // placeholder initializer would be dead code (never invoked).
    let releaseSlot!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });
    tails.set(key, current);
    depth.set(key, (depth.get(key) ?? 0) + 1);

    await previous;

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const remaining = (depth.get(key) ?? 1) - 1;
      if (remaining <= 0) {
        depth.delete(key);
      } else {
        depth.set(key, remaining);
      }
      // Only clear the tail when no newer acquirer replaced it, so the map does
      // not grow unbounded once an endpoint goes idle.
      if (tails.get(key) === current) {
        tails.delete(key);
      }
      releaseSlot();
    };
  }

  function isBusy(key: string): boolean {
    return (depth.get(key) ?? 0) > 0;
  }

  function waitingCount(key: string): number {
    return Math.max(0, (depth.get(key) ?? 0) - 1);
  }

  return { acquire, isBusy, waitingCount };
}

/** Process-wide shared lock used by the host-native execution paths. */
export const sharedLocalViServerAcquisitionLock: LocalViServerAcquisitionLock =
  createLocalViServerAcquisitionLock();
