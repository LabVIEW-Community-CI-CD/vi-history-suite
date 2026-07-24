'use strict';

// Authoritative progress-board identity — single source of truth
// (VHS-REQ-704 / VHS-REQ-695 / VHS-REQ-696 / VHS-REQ-698, epic #2144).
//
// Reference the board ONLY by its NUMBER and stable NODE ID — never by name.
// The LabVIEW-Community-CI-CD org hosts TWO similarly-named projects:
//   * Project #4 "vihs"  <- AUTHORITATIVE progress board (this one).
//   * Project #3 "VIHS"  <- duplicate (note the casing); do NOT target it.
// A name/title-based lookup (`gh project ... --title vihs`, a `projectsV2(query:)`
// filter, etc.) is therefore AMBIGUOUS and must not be used anywhere in the
// control plane. The number (unique per owner) and the node id (globally stable)
// are unambiguous, so every control-plane script imports these constants instead
// of hard-coding `4` / `PVT_...` / a title string in more than one place.
//
// `PROJECT_TITLE` and `DUPLICATE_PROJECT_NUMBER` are recorded for humans/diagnostics
// only and MUST NOT be used to resolve the board.

/** Authoritative progress board number (unique within PROJECT_OWNER). */
const PROJECT_NUMBER = 4;

/** Authoritative progress board GraphQL node id (globally stable). */
const PROJECT_ID = 'PVT_kwDODQiayc4Bd5Rq';

/** Org that owns the board. */
const PROJECT_OWNER = 'LabVIEW-Community-CI-CD';

/** Human-facing board title. Informational ONLY — never used to resolve the board. */
const PROJECT_TITLE = 'vihs';

/** The duplicate org project ("VIHS", #3). Recorded so it is never targeted. */
const DUPLICATE_PROJECT_NUMBER = 3;

module.exports = {
  PROJECT_NUMBER,
  PROJECT_ID,
  PROJECT_OWNER,
  PROJECT_TITLE,
  DUPLICATE_PROJECT_NUMBER
};
