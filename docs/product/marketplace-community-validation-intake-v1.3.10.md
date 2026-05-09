# Marketplace Community-Validation Intake v1.3.10

## Purpose

Prepare the intake route for users validating the VS Code Marketplace
community-validation pre-release `1.3.10`, especially Windows/LabVIEW
installed-user combinations that this Ubuntu/Docker machine cannot prove.

This packet prepares user-facing instructions, proof-status wording, issue
template source, labels, and triage rules. It does not mutate public GitHub,
public GitHub labels, public GitHub issue templates, or the VS Code
Marketplace.

Machine-readable companion:

- `docs/product/marketplace-community-validation-intake-v1.3.10.json`

## Scope

- Marketplace item: `svelderrainruiz.vi-history-suite`
- Community-validation version: `1.3.10`
- Regular exact Marketplace version retained: `1.3.9`
- Publication kind: pre-release
- Linux/Docker claim: Linux/Docker validated preview
- Windows/LabVIEW installed-user proof: deferred until reported evidence is
  reproduced or retained on an admitted Windows/LabVIEW host
- Public GitHub mutation: gated separately through public facade promotion and
  publication approval

## User Validation Instructions

1. Install the pre-release from the VS Code Extensions view by choosing the
   pre-release channel for `svelderrainruiz.vi-history-suite`, or use:

   ```bash
   code --install-extension svelderrainruiz.vi-history-suite@prerelease
   ```

2. Open or restart VS Code.
3. Run `VI History: Prepare Local Runtime Settings CLI` if `vihs` is not
   available in the integrated terminal.
4. Run `code --version` and retain the complete output.
5. Run `code --list-extensions --show-versions` and retain the
   `svelderrainruiz.vi-history-suite` line.
6. Run `vihs` and record whether the generated runtime-settings CLI opens.
7. Run `vihs --validate` and retain the complete output.
8. Select the exact provider, LabVIEW year, and bitness you are validating.
9. Open a trusted Git repository containing a tracked `.vi`, `.ctl`, or `.vit`
   file with at least two revisions.
10. Run `VI History`, select exactly two revisions, review the compare
   preflight, and choose `Compare`.
11. File a report with the exact outcome, whether it worked or failed.

For Docker-selected paths, also retain:

```bash
docker version
docker info --format '{{.OSType}}'
```

Do not include private repository paths, proprietary VI contents, PATs, access
tokens, internal GitLab evidence, or screenshots that disclose confidential
project material.

## Proof-Status Wording

Use this wording in user-facing surfaces:

> Marketplace pre-release `1.3.10` is a community-validation preview. The
> Linux/Docker preview lane is maintainer-validated. Windows/LabVIEW
> installed-user combinations are selectable so users with those machines can
> report evidence, but they remain proof-deferred until reproduced or retained
> by the maintainer proof lane.

Use this short form in issue templates:

> Selectable does not mean maintainer-proven. Please include `vihs --validate`
> output and the exact provider, LabVIEW year, and bitness so the proof status
> can be updated from reported to reproduced or deferred.

Do not say that Linux/Docker evidence proves Windows/LabVIEW installed-user
behavior.

## Prepared Issue Templates

The public source facade now retains prepared issue-template source files in
GitLab authority. They are not live on public GitHub until a separate public
facade promotion and publication act is approved.

| Template | Source Path | Primary Labels | Purpose |
| --- | --- | --- | --- |
| Marketplace community validation report | `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml` | `community-validation`, `marketplace-preview`, `windows-labview`, `needs-triage` | collect success, failure, or blocked Windows/LabVIEW validation reports for `1.3.10` |
| Bug report | `public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml` | `bug`, `community-validation`, `needs-triage` | collect installed-user defects with proof-status context |
| LabVIEW version support request | `public-github-source/.github/ISSUE_TEMPLATE/labview-version-support.yml` | `enhancement`, `windows-labview`, `community-validation` | collect missing LabVIEW year/bitness/provider requests |
| Feature request | `public-github-source/.github/ISSUE_TEMPLATE/feature-request.yml` | `enhancement`, `needs-triage` | collect bounded installed-user improvements |

## Prepared Labels

The prepared label manifest is:

- `public-github-source/.github/labels.yml`

Required labels:

| Label | Use |
| --- | --- |
| `community-validation` | user-submitted validation evidence from the Marketplace pre-release |
| `marketplace-preview` | reports specific to the `1.3.10` pre-release channel |
| `windows-labview` | Windows host or Docker Desktop Windows-container LabVIEW reports |
| `proof:reported` | user evidence received but not maintainer-reproduced |
| `proof:reproduced` | maintainer reproduced or retained the reported path |
| `proof:deferred` | evidence is insufficient or blocked without rejecting the feature request |
| `needs-triage` | report still needs classification |
| `needs-reproduction` | maintainer reproduction is required before proof status changes |
| `provider:host` | local Windows `LabVIEWCLI` provider |
| `provider:docker` | Docker provider |
| `labview:x64` | x64 LabVIEW request or report |
| `labview:x86` | x86 LabVIEW request or report |

## Triage Loop

1. Intake
   - Confirm version `1.3.10` or identify the actual installed version.
   - Confirm the install route and whether the user selected the pre-release
     channel.
   - Apply `community-validation`, `marketplace-preview`, `needs-triage`, and
     the provider/bitness labels when known.

2. Evidence completeness
   - Require `vihs --validate` output, VS Code version, extension version,
     provider, LabVIEW year, bitness, operating system, and reproduction steps.
   - If the report is missing key facts, keep `needs-triage` and ask for the
     missing fields.

3. Classification
   - Success report: add `proof:reported`; keep it open until another matching
     report or maintainer reproduction confirms the path.
   - Failure report: add `needs-reproduction`; classify as install,
     validation, preflight, compare execution, Docker acquisition, or docs.
   - Missing version/bitness request: keep `windows-labview` and
     `proof:deferred` until the product and traceability matrix admit the
     requested path.

4. Maintainer reproduction
   - Reproduce only on an admitted Windows/LabVIEW host or explicitly document
     that no admitted host is available.
   - Do not use Ubuntu/Docker success as Windows/LabVIEW installed-user proof.
   - If reproduced, add `proof:reproduced` and link the retained proof receipt
     or follow-up authority packet.

5. Close or promote
   - Close as answered when the report is unsupported by design and the user
     guidance is already accurate.
   - Promote to a GitLab authority issue or branch when source, docs, or proof
     surfaces must change.
   - Update `docs/requirements/rtm.csv`, proof-status docs, and release-control
     state only after retained evidence changes.

## Public GitHub Boundary

Prepared files under `public-github-source/` were source-of-truth inputs for
the public facade publication. They were published to public GitHub through
protected-branch PR #45 after the explicit `publish the public intake now`
trigger.

The completed public intake publication evidence is:

- Public PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/45`
- Public `main` commit:
  `b56fde158fe151a736fe72c833efdfd0874d8537`
- Public labels: applied and verified
- Public GitHub release/tag/wiki mutation: not performed
- VS Code Marketplace mutation by this intake publication: not performed

Future Public GitHub intake mutation remains gated by:

1. `npm run public:source:check`
2. a governed public facade promotion decision
3. the separate public intake promotion plan:
   `docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md`
4. a separate explicit `publish the public intake now` approval
5. post-publication verification of the public repo templates and labels

The label manifest remains the authority source for future label changes, but
live public labels are updated only when the public promotion act applies them
through GitHub.

## Release-Control Evidence

- Release publication state:
  `docs/product/release-publication-state.md`
- Marketplace publication ledger:
  `docs/product/vscode-marketplace-publication-ledger.md`
- Windows/LabVIEW deferred proof handoff:
  `docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.md`
- Windows/LabVIEW community proof intake checklist:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md`
- Linux/Docker preview packet:
  `docs/product/linux-docker-preview-release-control-packet-2026-04-25.md`
- Traceability matrix:
  `docs/requirements/rtm.csv`
