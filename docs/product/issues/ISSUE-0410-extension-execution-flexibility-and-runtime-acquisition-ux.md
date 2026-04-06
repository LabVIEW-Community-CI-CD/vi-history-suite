# ISSUE-0410: Extension Execution Flexibility And Runtime Acquisition UX

## Goal

Give installed extension users one Docker-only comparison contract with
engine-aware Windows/Linux image selection, visible acquisition truth, and no
host-native fallback behavior.

## Status

Active post-release issue.

Activation facts:

- `TRANCHE-013` is active on the `1.0.0` breaking installed-extension contract
- the runtime/package layer already removed installed host-mode/path knobs
- the control-plane and public/internal docs split now need to be normalized

## Scope

- Docker-only installed compare execution
- current-Docker-engine selection of governed Windows versus governed Linux
  image on Windows hosts
- canonical Docker-only request validation
- no execution-policy bypass around that validation boundary
- visible image-acquisition and front-facing runtime feedback
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
- package metadata and user-facing docs point to the public GitHub front face
  instead of the private GitLab authority repo

## Required Evidence

- updated package manifest and runtime docs
- updated README, current-state, queue, ADR, and execution-policy docs
- updated requirements, RTM, and test plan
- updated bundled/public/internal reader surfaces
- green docs and design gates after the control-plane update

## First Active Slice

- normalize the Docker-only installed contract into the control plane
- retain the engine-aware Windows/Linux image-selection rule explicitly
- add the public GitHub facade versus internal GitLab control-plane ADR
- hand off the later public Gate D rerun to `PROGRAM-0002` without claiming it
  complete yet
