# ADR-0023: Control-Plane Loop

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the control-plane loop under system
> requirement VHS-SYS-REQ-013 (CI And Developer Environment), within the Agent
> Operating Control-Plane program (#2144). The requirements package holds the
> authoritative text; this is the design record.

## Context

The Agent Operating Control-Plane built the read side (repo-truth read-model,
VHS-REQ-692), the shadow side (board-sync shadow mode, VHS-REQ-695), and a
governed, default-disabled acting surface (write path, VHS-REQ-696). Those pieces
existed but the loop stayed **open**: a human ran the readers, eyeballed drift,
and hand-reconciled the board each cycle. The shadow board-sync repeatedly proved
this drift is real and detectable (it found board items that were verified-closed
but not reflected), but nothing surfaced that signal continuously.

Graduating from *observing* truth to *acting* on it is a security-sensitive step,
so the design was ratified with the maintainer before build. The ratified posture:

- **Altitude A+B** — a continuous drift radar plus a Tier-1 board autopilot that
  mirrors only directly-verified truth.
- **Runner** — GitHub Actions, manual dispatch only (no schedule yet).
- **Write auth** — Tier-1 project writes run in CI via a maintainer-provisioned
  Projects-scoped secret; the ambient `GITHUB_TOKEN` cannot edit Project #4.
- **Write scope** — only `Status=Done` + `Evidence=Proven` when a linked issue/PR
  is verified closed/merged, via the existing pure `planBoardSync`.
- **Enablement** — the committed `control-plane-write.json` `enabled:true` flag is
  the sole authorizer; it ships disabled and the maintainer flips it in a separate
  reviewed PR.

## Decision

Ship the loop in slices. **This ADR covers slice 1: the drift radar (read-only).**

- `scripts/renderControlPlaneDigest.js` — a pure `buildControlPlaneDigest` that
  composes collected signals (board-vs-verified-truth drift from the shadow
  board-sync planner, plus optional gate-health, open-work, and debt sections)
  into a marker-stamped digest, and an injectable `collectControlPlaneSignals`
  whose live board read fails closed on GitHub auth.
- `.github/workflows/control-plane-loop.yml` — a **manual-dispatch-only**,
  **board-read-only** workflow (least-privilege `contents: read` + `issues:
  write`) that renders the digest and **upserts a single sticky tracking issue**
  via its marker. It never edits Project #4.

The Tier-1 apply (slice 2) is the separate governed write path (VHS-REQ-696),
inert until both a committed flag flip and a provisioned Projects-scoped secret
are present. Tier 2+ actions (comment/label/create work) remain design-only and,
when enabled, require a server-verified allowlisted approver on an explicit
label/comment signal.

## Consequences

- The drift signal a human ran by hand becomes continuous and visible in one
  sticky issue, with zero board-write risk.
- The radar reuses the shadow board-sync planner, so what it reports and what the
  apply would do cannot diverge.
- The acting surface stays fail-closed and disabled; turning it on is a reviewed,
  committed decision, never a runtime toggle.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-698; VHS-REQ-704.
