// VHS-REQ-699 (vagrant lane instrumentation, LOCAL until stable): pure parser for
// the guest progress NDJSON log written by vagrant/lib/guestProgress.cjs.
//
// Turns the append-only event stream into a structured status snapshot an agent
// (or the local MCP harness) can consume in one call: which pipeline state is
// live, how long the current state has been running, whether it looks stalled,
// and the final result when done. Pure (string in -> object out), so it is unit-
// testable without a guest, a driver, or LabVIEW.

/** Ordered pipeline states, for deriving "current state" from preview events. */
const PIPELINE_ORDER = [
  'STAGING',
  'PREVIEW_LEFT',
  'PREVIEW_RIGHT',
  'VALIDATION',
  'COMPARISON',
  'UNSTAGING'
];

/**
 * Parse NDJSON progress text into a status snapshot.
 *
 * @param {string} ndjson  the full progress-log contents (one JSON object/line).
 * @param {object} [options]
 * @param {number} [options.stallThresholdMs=120000]  since-last-event gap that
 *   marks the run as `stalled` (default 2 min; a cold LabVIEW render is slow but
 *   a real heartbeat fires every 5s, so a long silence means trouble).
 * @param {number} [options.nowMs]  clock override for deterministic tests;
 *   defaults to the newest event's elapsedMs (so a static log reads as "fresh").
 * @returns {{
 *   parsed:number, malformed:number, events:object[],
 *   phase:'not-started'|'running'|'done'|'error',
 *   currentState:string|null, lastEvent:object|null,
 *   startedAtMs:number|null, latestElapsedMs:number|null,
 *   sinceLastEventMs:number|null, stalled:boolean,
 *   result:object|null
 * }}
 */
function parseGuestProgress(ndjson, options = {}) {
  const stallThresholdMs = options.stallThresholdMs ?? 120000;
  const lines = String(ndjson ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const events = [];
  let malformed = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && typeof obj.event === 'string') {
        events.push(obj);
      } else {
        malformed += 1;
      }
    } catch {
      malformed += 1;
    }
  }

  const lastEvent = events.length ? events[events.length - 1] : null;
  const startedAtMs = events.length ? (events[0].elapsedMs ?? 0) : null;
  const latestElapsedMs = lastEvent ? (lastEvent.elapsedMs ?? null) : null;

  // Derive the live state from the most recent state-bearing event.
  let currentState = null;
  let phase = events.length ? 'running' : 'not-started';
  let result = null;
  for (const ev of events) {
    if (ev.event === 'preview-start' && ev.side) {
      currentState = ev.side === 'left' ? 'PREVIEW_LEFT' : 'PREVIEW_RIGHT';
    } else if (ev.event === 'preview-end' && ev.side) {
      // After a preview ends, the next state is VALIDATION then COMPARISON; mark
      // COMPARISON as the live state once the right preview has ended (the long
      // fragile cycle the agent most wants to follow).
      currentState = ev.side === 'right' ? 'COMPARISON' : 'PREVIEW_LEFT';
    } else if (ev.event === 'preview-error') {
      currentState = ev.side === 'left' ? 'PREVIEW_LEFT' : 'PREVIEW_RIGHT';
      phase = 'error';
    } else if (ev.event === 'pipeline-start') {
      currentState = 'STAGING';
    } else if (ev.event === 'pipeline-end') {
      currentState = 'UNSTAGING';
    } else if (ev.event === 'result-written') {
      phase = 'done';
      result = { runtimeState: ev.runtimeState ?? null, proofPath: ev.proofPath ?? null };
    }
  }

  // Since a static log has no external clock, default "now" to the newest event
  // so a completed/just-read log is never falsely flagged stalled; callers that
  // know wall-clock time pass options.nowMs for true staleness.
  const nowMs = options.nowMs ?? latestElapsedMs ?? 0;
  const sinceLastEventMs = latestElapsedMs === null ? null : Math.max(0, nowMs - latestElapsedMs);
  const stalled =
    phase === 'running' && sinceLastEventMs !== null && sinceLastEventMs > stallThresholdMs;

  return {
    parsed: events.length,
    malformed,
    events,
    phase,
    currentState,
    lastEvent,
    startedAtMs,
    latestElapsedMs,
    sinceLastEventMs,
    stalled,
    result
  };
}

module.exports = { parseGuestProgress, PIPELINE_ORDER };
