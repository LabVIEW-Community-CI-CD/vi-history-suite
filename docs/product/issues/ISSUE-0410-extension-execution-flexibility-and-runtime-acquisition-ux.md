# ISSUE-0410: Extension Execution Flexibility And Runtime Acquisition UX

## Goal

Give installed extension users one Docker-only comparison contract with
engine-aware Windows/Linux image selection, visible acquisition truth, and no
host-native fallback behavior.

## Status

Active post-release issue.

Activation facts:

- `TRANCHE-013` landed the Docker-only installed-extension contract and the
  initial public/internal documentation split normalization
- `TRANCHE-015` is now active on first-time installed-user Docker onboarding,
  explicit missing-Docker guidance, and fail-closed first-run next actions
- the runtime/package layer already removed installed host-mode/path knobs
- the next retained gap is no longer “assume Docker already exists on the
  machine”; it is “make that first-run dependency explicit and recoverable”

## Scope

- Docker-only installed compare execution
- current-Docker-engine selection of governed Windows versus governed Linux
  image on Windows hosts
- canonical Docker-only request validation
- no execution-policy bypass around that validation boundary
- visible image-acquisition and front-facing runtime feedback
- first-run missing-Docker onboarding and fail-closed recovery guidance
- public GitHub front-face versus internal GitLab control-plane normalization
- handoff to `PROGRAM-0002` for the next deterministic public Gate D rerun

## Non-Goals

- reopening benchmark proof under `PROGRAM-0003`
- using host-native LabVIEW as part of the installed extension compare path
- unbounded runtime expansion without a clear installed contract

## Dependencies

- truthful current-state, queue, and execution-policy surfaces
- the dedicated ADR package for Docker-only execution and public/internal
  audience split

## Acceptance Criteria

- installed users no longer receive provider-mode or host-runtime knobs
- the installed extension validates one canonical Docker-only request before
  pull or launch
- the current Docker daemon engine chooses the governed Windows or Linux image
  truthfully on Windows
- missing images are acquired with visible progress and explicit failure truth
- first-time users who do not yet have Docker installed or running get clear
  install/start/retry guidance before image acquisition is treated as the next
  step
- package metadata and user-facing docs point to the public GitHub front face
  instead of the private GitLab authority repo

## Required Evidence

- updated package manifest and runtime docs
- updated README, current-state, queue, ADR, and execution-policy docs
- updated requirements, RTM, and test plan
- updated bundled/public/internal reader surfaces
- green docs and design gates after the control-plane update

## Current Active Slice

- account explicitly for a first-time installed-extension user whose machine
  does not yet have Docker installed or running
- harden runtime-doctor, blocked-next-action, and installed-user reader
  surfaces so they explain the missing-Docker boundary without assuming prior
  Docker familiarity
- preserve the Docker-only compare contract and no-host-fallback rule while
  making the prerequisite and recovery path clearer
- keep the later Gate D rerun handoff to `PROGRAM-0002` explicit without
  claiming that public acceptance is reclosed yet
