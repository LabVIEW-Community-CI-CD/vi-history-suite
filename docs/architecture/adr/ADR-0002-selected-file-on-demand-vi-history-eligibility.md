# ADR-0002: Selected-File On-Demand VI History Eligibility

- Status: Accepted
- Date: 2026-06-10

## Context

VI History Suite reviews the Git history of a single LabVIEW VI that a user
selects in their workspace. An earlier design resolved eligibility through a
repository-wide indexer (`ViEligibilityIndexer`): on activation and on Git state
changes it enumerated every tracked VI in the repository, classified each one,
and cached the result so the `labviewViHistory.open` command and the manifest
menu visibility could consult a precomputed answer.

That approach did not scale. Repositories with thousands of VIs paid a full
tracked-VI scan — and a visible `Indexing LabVIEW VIs` progress step — before a
user could open the history of one file, even though only the selected file's
eligibility was ever needed to satisfy the request (issue #61). The index also
introduced cache-coherence obligations on branch switches, new commits, file
renames, and workspace-trust transitions that were costly to keep correct.

## Decision

Evaluate VI History eligibility on demand for the selected file only, and remove
the repository-wide VI eligibility indexer.

When `labviewViHistory.open` runs, the command resolves eligibility for the
requested URI alone: repository root, VI content signature, Git tracking, and
the minimum two modifying commits required for history review. Opening one file
never enumerates the repository's other VIs and never shows repository-wide
indexing progress as a prerequisite. Manifest menu visibility remains a hint;
command-time selected-file evaluation is the source of truth.

This decision is recorded in system requirement VHS-SYS-REQ-018 (Selected VI
On-Demand History Eligibility) and software requirement VHS-REQ-635
(Selected-File On-Demand Eligibility), and shipped in issue #365.

## Rationale

Only the selected file's eligibility is needed to answer an open request, so the
repository-wide scan was pure overhead on large repositories and the dominant
source of first-open latency. On-demand evaluation makes open cost independent
of repository VI count, removes the persistent eligibility cache and its
coherence burden, and keeps the heavier Git work scoped to the file the user
actually asked about.

Workspace trust remains the safety boundary: selected-file history and
comparison execution still fail closed in untrusted workspaces. The separate
pre-panel comparison-runtime prerequisite gates — LabVIEW CLI availability
(VHS-REQ-627) and VI Server availability (VHS-REQ-631) — are unchanged and out
of scope for this decision; they continue to protect comparison execution after
a file is found eligible.

## Consequences

- Open cost scales with the selected file, not with the repository's tracked-VI
  count; no repository-wide `Indexing LabVIEW VIs` step precedes a selected-file
  result.
- The exported `isEligible()` API is a best-effort hint, not an authoritative
  answer. It is refreshed authoritatively on every `loadHistory`/open, fails
  closed in untrusted workspaces, and is cleared on workspace, configuration,
  and workspace-trust change events so a cached `true` cannot outlive the
  conditions under which it was computed (issue #366).
- The eligibility debug snapshot exposes only selected-file fields
  (`eligiblePathCount`, `eligiblePathsSample`); the vestigial
  `indexedRepositoryRoots` field carried over from the removed indexer was
  retired (issue #367).
- Future features that genuinely need repository-wide VI inventory must add it as
  an explicit, opt-in surface rather than as a prerequisite for opening one
  selected file.
- This is a documentation-only architecture record; it introduces no command,
  runtime-selection, storage, or Marketplace-identity change.
