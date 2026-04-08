# PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX

## Status

Active post-release program.

Reopen facts:

- `TRANCHE-013` landed the core Docker-only installed contract, engine-aware
  image-selection rule, and public/internal documentation split baseline
- `TRANCHE-015` is active on first-time installed-user Docker onboarding and
  missing-Docker fail-closed guidance
- the installed extension now depends on Docker for comparison generation
- the old flexible installed-mode story is no longer valid repo truth
- `PROGRAM-0002` now needs a later Docker-only public acceptance rerun before
  the public closeout can be reclosed

## Purpose

Implement the Docker-only installed execution contract, the current
Docker-engine image-selection rules, and the public/internal documentation
split needed for that contract to be supportable.

## North Star

An installed extension user:

- uses one compare workflow with no provider-mode choice
- relies on Docker for comparison generation
- gets the governed Windows image when Docker is in Windows-engine mode
- gets the governed Linux image when Docker is in Linux-engine mode
- sees visible image-acquisition and next-action truth
- can tell from the installed-user docs and runtime doctor whether Docker is
  missing, not running yet, or merely still pulling the governed image
- never has the extension probe or compete with host LabVIEW as fallback

## Workstreams

1. installed manifest and package metadata contract
2. canonical Docker-only execution-request validation
3. engine-aware Windows/Linux image selection and acquisition UX
4. front-facing runtime truth in the panel, notifications, and packets
5. authority, bundled-doc, internal wiki, and public GitHub user-surface
   normalization
6. first-run missing-Docker onboarding and fail-closed recovery guidance
7. handoff to `PROGRAM-0002` for the next Gate D acceptance rerun

## Queue Mapping

- `TRANCHE-013`
  - `ISSUE-0410`
- `TRANCHE-015`
  - `ISSUE-0410`

## Exit Gates

### Gate A: Installed Contract

- the installed extension exposes Docker-only compare generation
- installed users no longer receive host-runtime mode or path knobs
- installed compare execution constrains to x64 container surfaces

### Gate B: Canonical Request

- provider selection validates one canonical Docker-only installed request
- on Windows, the current Docker daemon engine selects the governed Windows or
  governed Linux image truthfully
- the installed extension does not probe host LabVIEW as fallback

### Gate C: Acquisition And Runtime Feedback

- missing governed images are acquired with visible progress
- the history panel, notifications, and retained packet surfaces expose the
  selected provider, current engine, selected image, acquisition outcome, and
  next action
- missing-Docker first-run states tell the user to install or start Docker and
  verify it before expecting image acquisition to begin

### Gate D: Public/Internal Surface Split

- package metadata points extension users at the public GitHub facade
- the private GitLab repo and internal GitLab wiki remain maintainer/control-
  plane surfaces
- bundled docs and public GitHub user docs remain aligned to the installed
  Docker-only contract

### Gate E: Public Acceptance Handoff

- the repo retains one explicit handoff into `PROGRAM-0002` for the next
  deterministic Gate D rerun on the Docker-only public bundle, including the
  planned Linux-engine cold-pull acceptance case

## Delivery Rules

Every slice shall preserve:

- no installed host fallback
- no execution-policy bypass around canonical Docker-only validation
- no silent Windows-versus-Linux image substitution beyond the current Docker
  daemon engine
- no public/internal documentation audience collapse

## Success Condition

This program is complete when the installed extension can execute comparison
work through one Docker-only x64 contract with engine-aware image selection,
visible acquisition truth, coherent public/internal docs, and no reliance on
host LabVIEW as part of the extension-user workflow.
