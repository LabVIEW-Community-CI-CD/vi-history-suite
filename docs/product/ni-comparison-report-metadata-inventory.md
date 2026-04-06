# NI Comparison Report Metadata Inventory

## Purpose

Record the actual metadata surfaces observed in a generated NI VI Comparison
Report so dashboard requirements can be derived from empirical report content
instead of assumed UI ideas.

## Evidence Source

- canonical smoke command:
  - `node out/cli/runHarnessReportSmoke.js --harness-id HARNESS-VHS-001 --platform win32 --bitness x64`
- generated report artifact:
  - `.cache/harness-reports/HARNESS-VHS-001/workspace-storage/reports/7f077e37eff8/3fadb8e7b4e3/diff-report-VIP_Pre-Install Custom Action.vi.html`

This artifact is regenerated locally and is not committed source of truth.
This document captures the observed metadata shape from that generated report.

## Observed Metadata Fields

The produced report surfaced these metadata fields:

- report title
  - observed value: `LabVIEW VI Comparison Report`
- generation time
  - observed value shape: `4/2/2026 10:42:16 PM`
- compared VI paths
  - `First VI: ...`
  - `Second VI: ...`
- overview sections
  - observed captions:
    - `Front Panel Overview`
    - `Block Diagram Overview`
- overview image counts per section
  - each observed overview section carried two images in the canonical smoke
- included attributes
  - observed labels:
    - `Front Panel`
    - `Front Panel Position/Size`
    - `Block Diagram Functional`
    - `Block Diagram Cosmetic`
    - `VI Attribute`
- detailed-information sections
  - observed heading:
    - `1. VI Attribute - Miscellaneous`
- detailed-information items
  - observed item:
    - `VI Version : changed from "21.0" to "20.0"`

## Requirement Implication

The dashboard should concentrate these report-emitted metadata surfaces:

- report title
- generation time
- compared VI paths
- overview section captions and image counts
- included attributes
- detailed-information headings and items

The dashboard should not invent semantic priority or ranking cues beyond those
retained metadata surfaces.
