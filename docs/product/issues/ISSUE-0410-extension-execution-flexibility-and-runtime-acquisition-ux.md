# ISSUE-0410: Extension Execution Flexibility And Runtime Acquisition UX

## Goal

Give installed extension users one explicit execution contract for host-native
and Docker-backed LabVIEW execution, including conflict hard stops, image-pull
progress, and transparent provider feedback.

## Status

Queued follow-on post-release issue.

Activation depends on:

- `PROGRAM-0003` closing the benchmark-proof packet
- `TRANCHE-013` becoming the active queue tranche

## Scope

- first-class `auto` / `host-only` / `docker-only` execution modes
- compatible host LabVIEW 2026 Q1 x86 and x64 execution when host-native mode
  is selected and the governed host surface is clean
- host-runtime conflict detection for already-open LabVIEW sessions and
  governed VI Server collisions
- Docker-required hard stops with actionable user guidance
- visible Docker image-pull progress, including the governed Windows image on
  Windows hosts
- runtime-doctor and front-facing provider/acquisition transparency

## Non-Goals

- reopening benchmark proof under `PROGRAM-0003`
- reopening public-release closeout under `PROGRAM-0002`
- unbounded runtime feature expansion without a clear execution-policy contract

## Dependencies

- completed `PROGRAM-0003`
- truthful current-state, queue, and debt-ledger surfaces
- the dedicated execution-policy doc and ADR package

## Acceptance Criteria

- the execution-mode contract is explicit and bounded
- no selected mode silently falls back to a different provider class
- Docker-required runs show acquisition progress and actionable failure states
- user-facing runtime feedback is transparent enough that provider choice does
  not require shell logs to understand

## Required Evidence

- updated README, current-state, queue, ADR, and execution-policy docs
- updated requirements, RTM, and test plan
- updated wiki/bundled-doc reader surfaces
- green docs and design gates after the control-plane update

## First Active Slice

- retain the execution-mode policy in the control plane
- make the Docker-required hard-stop and acquisition-progress UX explicit
- keep the policy separate from current benchmark-proof and sustainment work
