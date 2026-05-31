# System Requirements Specification

## Document Control

- System: `vi-history-suite`
- Source home: `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`
- License: `0BSD`
- Status: active GitHub-first baseline
- Software specification: [srs.md](./srs.md)

## System Purpose

VI History Suite provides a VS Code desktop extension for content-aware LabVIEW
VI history review in Git repositories. The system also provides the lightweight
project operations needed to maintain the extension in public, including
requirements, traceability, hosted CI, devcontainer source evaluation, optional
trusted Windows/LabVIEW validation, and optional Vagrant local validation.

## System Requirements

### VHS-SYS-REQ-001: VS Code LabVIEW VI History System

- Status: Active
- Area: Product Boundary
- Statement: The system shall provide a VS Code desktop extension for reviewing
  LabVIEW VI history in Git repositories.
- Acceptance Criteria:
  - The package manifest declares a VS Code desktop extension.
  - The extension exposes VI History commands and review surfaces.
  - The active architecture overview identifies the extension runtime, Git
    adapter, history panel, and report subsystem.
- Verification References:
  - `package.json`
  - `docs/architecture/overview.md`
  - `tests/unit/packageManifest.test.ts`

### VHS-SYS-REQ-003: System And Software Requirement Split

- Status: Active
- Area: Requirements
- Statement: The system shall separate system-level operating boundaries from
  implementation-level software requirements.
- Acceptance Criteria:
  - `syrs.md` describes the project boundary and operating model.
  - `srs.md` refines current software behavior.
  - `rtm.csv` links active software requirements to evidence.
- Verification References:
  - `docs/requirements/syrs.md`
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
  - `tests/unit/requirementsDocs.test.ts`

### VHS-SYS-REQ-004: Host LabVIEW Comparison Path

- Status: Active
- Area: Runtime
- Statement: The system shall support installed-user comparison workflows through
  local LabVIEW and LabVIEWCLI when those tools are available.
- Acceptance Criteria:
  - Runtime settings expose provider, LabVIEW version, and bitness choices.
  - Runtime preflight fails closed when required host tools are unavailable.
  - Comparison report execution records factual outcome evidence.
- Verification References:
  - `package.json`
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`

### VHS-SYS-REQ-005: Optional Expert Docker Path

- Status: Active
- Area: Runtime
- Statement: The system shall keep Docker as an explicit expert-selected
  comparison provider, not as the default validation path.
- Acceptance Criteria:
  - Runtime settings expose the `docker` provider.
  - Docker-specific limitations are surfaced before or during comparison.
  - Docker use is not required by hosted CI.
- Verification References:
  - `package.json`
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `docs/architecture/overview.md`

### VHS-SYS-REQ-007: Fail-Closed Runtime Evidence

- Status: Active
- Area: Runtime
- Statement: The system shall fail closed with factual runtime evidence when a
  requested comparison provider, version, bitness, or executable cannot be used.
- Acceptance Criteria:
  - Missing or unsupported runtime facts produce actionable diagnostics.
  - Runtime attempts retain status, failure reason, and available process facts.
  - The user-facing flow does not silently substitute a different runtime.
- Verification References:
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`

### VHS-SYS-REQ-008: Explicit Compare Action

- Status: Active
- Area: Review Workflow
- Statement: The system shall require an explicit compare action after a review
  pair is selected.
- Acceptance Criteria:
  - The history panel exposes selected/base pair state.
  - Compare execution is user-initiated from the review surface.
  - Runtime preflight does not hide the ability to capture a factual local
    failure.
- Verification References:
  - `src/ui/historyPanel.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `tests/integration/suite/extensionHost.test.ts`

### VHS-SYS-REQ-011: GitHub-First Source Authority

- Status: Active
- Area: Source Operations
- Statement: The active public source, issue, and release home shall be the
  organization repository at `github.com/LabVIEW-Community-CI-CD/vi-history-suite`.
- Acceptance Criteria:
  - Package metadata points source, homepage, and issues to the organization
    repository.
  - Active docs describe `main` as the release baseline and `develop` as the
    integration branch.
  - Release and hotfix branches are the normal promotion paths to `main`.
  - Historical source hosts are not described as active authority.
- Verification References:
  - `package.json`
  - `docs/architecture/overview.md`
  - `tests/unit/packageManifest.test.ts`

### VHS-SYS-REQ-012: Lightweight Public Verification

- Status: Active
- Area: Verification
- Statement: The required public verification path shall remain lightweight:
  install, typecheck, traceability audit, documentation link check, unit tests,
  and package sanity.
- Acceptance Criteria:
  - Hosted CI runs `npm ci`, `npm run check`, `npm run traceability:audit`,
    `npm run docs:links`, `npm test`, and `npm run package`.
  - The test plan names the same command set.
  - Hosted CI runs a lychee-named documentation link-check step before tests.
  - Hosted CI retains machine-readable coverage evidence from the required test
    run.
  - The test plan names the coverage artifact and baseline threshold policy.
  - Branch governance is enforced in the required hosted CI job for pull
    requests targeting `main` and `develop`.
  - Heavier local validation is not required as a public pull request gate.
- Verification References:
  - `.github/workflows/ci.yml`
  - `docs/testing/test-plan.md`

### VHS-SYS-REQ-013: Optional Human Validation Surfaces

- Status: Active
- Area: Verification
- Statement: The system shall support optional human validation through
  Codespaces/devcontainers, trusted Windows/LabVIEW maintainer runs,
  diagnostic test VSIX distribution, and Vagrant without making those surfaces
  mandatory release gates.
- Acceptance Criteria:
  - Devcontainer guidance exists for source evaluation.
  - The Windows/LabVIEW workflow is manual-only and trusted-ref-only for
    `main`, release branches, and exact release tags.
  - Diagnostic test VSIX distribution is maintainer-dispatched and
    trusted-ref-only for `main`, release branches, and exact release tags.
  - Vagrant is documented as optional local validation.
- Verification References:
  - `.devcontainer/devcontainer.json`
  - `.github/workflows/windows-labview-maintainer.yml`
  - `.github/workflows/package-test-vsix.yml`
  - `docs/maintainer-operations.md`
  - `docs/vagrant.md`
  - `tests/unit/packageTestVsixWorkflow.test.ts`
  - `tests/unit/windowsLabviewMaintainerWorkflow.test.ts`

### VHS-SYS-REQ-014: Agent-Targetable Requirements

- Status: Active
- Area: Requirements
- Statement: The system shall maintain requirement IDs as stable work contracts
  for human-directed agent changes.
- Acceptance Criteria:
  - Active software requirements use structured blocks.
  - The RTM maps active requirements to implementation and verification evidence.
  - The ID index records active, superseded, and retired IDs.
  - CI fails when the requirements pack loses coherence.
  - Umbrella issue closeout evidence includes mandatory standards-review output
    from host Python or the Docker assurance workbench fallback.
- Verification References:
  - `docs/requirements/README.md`
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
  - `docs/requirements/id-index.csv`
  - `tests/unit/requirementsDocs.test.ts`

### VHS-SYS-REQ-015: Large Repository Branch-Switch Responsiveness

- Status: Active
- Area: Git History Eligibility
- Statement: The system shall keep branch-switch indexing responsive for large
  LabVIEW repositories by reusing file-level Git object eligibility evidence
  for unchanged tracked files and re-evaluating only changed, unproven, or
  invalidated files.
- Acceptance Criteria:
  - Branch-switch eligibility reuse is based on repository identity, normalized
    path, tracked Git blob object ID, strict header setting, cache schema
    version, and reachable history proof evidence.
  - The selected branch or `HEAD` controls reachability checks and refresh
    state, but it is not the cache identity for unchanged clean file blobs.
  - Dirty, staged, unmerged, cache-missing, malformed, or history-unproven files
    fail closed by re-evaluating eligibility.
  - User-visible diagnostics report tracked, reused, evaluated, removed,
    skipped, failed, and eligible counts rather than wall-clock timing promises.
- Verification References:
  - `src/indexing/viEligibilityIndexer.ts`
  - `src/git/gitCli.ts`
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/gitCli.test.ts`
  - `tests/unit/requirementsDocs.test.ts`

### VHS-SYS-REQ-016: Governed Release Branch Promotion

- Status: Active
- Area: Source Operations
- Statement: The system shall separate integration, release promotion, and
  Marketplace publication through governed `develop`, `release/vX.Y.Z`,
  `hotfix/vX.Y.Z`, `main`, and exact tag controls.
- Acceptance Criteria:
  - `develop` is documented as the integration branch for completed work.
  - `main` is documented as the Marketplace and release baseline.
  - Pull requests to `main` are limited to `release/vX.Y.Z` and
    `hotfix/vX.Y.Z` branches by hosted CI.
  - Pull requests to `develop` admit `feature/*`, release, hotfix, and `main`
    back-sync branches by hosted CI.
  - Marketplace publication is tag-only from exact `vX.Y.Z` tags on commits
    reachable from `origin/main`.
  - Marketplace live-listing verification distinguishes bounded propagation lag
    from publication failure.
- Verification References:
  - `.github/workflows/ci.yml`
  - `.github/workflows/marketplace-release.yml`
  - `docs/maintainer-operations.md`
  - `tests/unit/branchGovernanceWorkflow.test.ts`
  - `tests/unit/marketplaceReleaseWorkflow.test.ts`

### VHS-SYS-REQ-017: Coverage-Led Assurance Operating Model

- Status: Active
- Area: CI And Developer Environment
- Statement: The system shall use retained coverage evidence and requirements
  traceability to prioritize product-risk discovery before raising coverage
  floors.
- Acceptance Criteria:
  - Coverage evidence from Vitest is joined with RTM and traceability inventory
    records so low-coverage requirement-mapped files are visible.
  - The coverage risk map highlights requirement-mapped files below 50%
    coverage and zero-coverage supporting files tied to active requirements.
  - Hosted coverage thresholds are raised only from measured evidence and remain
    documented as regression floors, not coverage-quality claims; the
    post-wave hosted floors are 60% statements, 50% branches, 65% functions,
    and 60% lines.
  - Coverage-led follow-up work targets user-facing requirement-mapped dark
    areas before dev-only tooling.
- Verification References:
  - `scripts/mapCoverageToTraceability.js`
  - `package.json`
  - `vitest.config.ts`
  - `docs/testing/test-plan.md`
  - `tests/unit/coverageMapScript.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
