# Product Charter

## Mission

Build a developer-facing VS Code extension that makes VI history in Git
repositories reviewable through content detection and factual Git history, not
through filename assumptions.

## Problem

Developers working with LabVIEW VIs in Git repositories often lack a lightweight
review surface that:

- recognizes VIs without relying on `.vi` extensions
- exposes a consistent history command only when history is meaningful
- keeps the first workflow inside VS Code before deeper NI-specific report
  tooling is introduced

## Primary User

- A developer reviewing the history of a LabVIEW VI inside a Git repository from
  VS Code

## Product Boundaries

In scope for the initial baseline:

- VS Code desktop extension
- content-based VI detection
- Git-backed eligibility indexing
- factual history review in a webview

Out of scope for the initial baseline:

- VS Code for Web
- vendoring external Git history into this repository
- full NI report-generation workflow
- commercialization or contribution intake

## Success Criteria

- The `VI History` Explorer command appears only for eligible content-detected
  VIs.
- The command opens a factual history review panel for the selected file.
- The repo contains a governed baseline with requirements, architecture,
  testing, and traceability from the start.

