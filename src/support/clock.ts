// Shared default ISO-8601 clock (supporting VHS-REQ-610 dashboard aggregate
// review). Several dashboard, reporting, and scenario modules each defined the
// byte-identical default-clock fallback `() => new Date().toISOString()` (as a
// private `defaultNow`/`defaultNowIso`). This centralizes the default clock so
// injected `deps.now`/`deps.nowIso` seams share one wall-clock implementation.

// Return the current time as an ISO-8601 string (the default clock used when no
// clock is injected).
export function nowIso(): string {
  return new Date().toISOString();
}
