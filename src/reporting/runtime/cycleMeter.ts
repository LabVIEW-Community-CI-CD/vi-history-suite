/**
 * VHS-REQ-669: single-cycle timing instrumentation for external LabVIEW
 * invocations.
 *
 * Each external LabVIEW invocation (a preview render, a comparison
 * CreateComparisonReport run, or a session-manager render) is treated as one
 * cycle of a single-cycle timed loop — exactly one attempt, no retry. This meter
 * measures each cycle so latency can be observed:
 *
 * - `durationMs`: monotonic wall-clock time of the single attempt
 *   (start → completion of the awaited invocation).
 * - `cycleIndex`: a 1-based, monotonically increasing count of cycles measured
 *   by this meter instance.
 * - `interCycleGapMs`: the time between the END of the previous cycle and the
 *   START of this one (undefined for the first cycle) — the pipeline latency
 *   between back-to-back cycles.
 * - `outcome`: a caller-supplied tag so latency can be correlated with
 *   success/failure.
 *
 * The clock defaults to `performance.now()` (a monotonic high-resolution timer)
 * and can be injected so unit tests stay deterministic. A single meter instance
 * carries the cross-cycle state (count + last end time); a fresh
 * `createCycleMeter()` with no shared state still measures a single cycle's
 * duration/outcome with `cycleIndex: 1` and no inter-cycle gap.
 */

export interface CycleMeasurement {
  /** 1-based index of this cycle within the meter instance. */
  cycleIndex: number;
  /** Monotonic timestamp (ms) when the cycle started. */
  startedAtMs: number;
  /** Monotonic timestamp (ms) when the cycle completed. */
  endedAtMs: number;
  /** Wall-clock duration of the single attempt (`endedAtMs - startedAtMs`). */
  durationMs: number;
  /**
   * Time (ms) between the previous cycle's end and this cycle's start; undefined
   * for the first cycle measured by this meter.
   */
  interCycleGapMs: number | undefined;
  /** Caller-supplied outcome tag (for example a failure reason or `rendered`). */
  outcome: string;
}

/** An in-flight cycle; complete it with the observed outcome to finalize timing. */
export interface CycleHandle {
  /** Finalizes the cycle at the current clock time and records its outcome. */
  complete(outcome: string): CycleMeasurement;
}

export interface CycleMeter {
  /** Starts measuring a new cycle at the current clock time. */
  startCycle(): CycleHandle;
  /** Number of cycles completed by this meter instance. */
  readonly completedCycleCount: number;
}

const defaultNow = (): number => performance.now();

/**
 * Creates a cycle meter. `now` defaults to `performance.now()`; inject a fake
 * monotonic clock in tests for deterministic measurements.
 */
export function createCycleMeter(now: () => number = defaultNow): CycleMeter {
  let completedCycleCount = 0;
  let previousEndedAtMs: number | undefined;

  return {
    get completedCycleCount(): number {
      return completedCycleCount;
    },
    startCycle(): CycleHandle {
      const startedAtMs = now();
      const interCycleGapMs =
        previousEndedAtMs === undefined ? undefined : startedAtMs - previousEndedAtMs;
      let completed = false;
      return {
        complete(outcome: string): CycleMeasurement {
          if (completed) {
            throw new Error('cycle already completed');
          }
          completed = true;
          const endedAtMs = now();
          previousEndedAtMs = endedAtMs;
          completedCycleCount += 1;
          return {
            cycleIndex: completedCycleCount,
            startedAtMs,
            endedAtMs,
            durationMs: endedAtMs - startedAtMs,
            interCycleGapMs,
            outcome
          };
        }
      };
    }
  };
}
