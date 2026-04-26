# Public Validation Pre-Release v1.3.11

## Purpose

Prepare the `1.3.11` public validation lane for public GitHub and VS Code
Marketplace pre-release distribution. GitLab remains the authority repository;
public GitHub becomes the public source, release-asset, and issue-intake facade.

This packet changes the operating model from a blocked exact-release gate to a
community-validation lane: every selectable provider, LabVIEW year, and bitness
path may be exercised by users. Successful paths, failing paths, and
not-yet-implemented paths are classified by stable runtime codes and public
GitHub reports instead of being hidden from selection.

Machine-readable companion:

- `docs/product/public-validation-prerelease-v1.3.11.json`

## Publication Model

- Package version: `1.3.11`
- Authority branch: GitLab `develop`
- Public GitHub target: `github.com/svelderrainruiz/vi-history-suite`
- Public GitHub release target: `v1.3.11` pre-release or draft release with
  VSIX and checksum assets
- Marketplace target: `svelderrainruiz.vi-history-suite` pre-release
- Public mutation authorization: granted by the maintainer for the `1.3.11`
  validation lane
- Exact-release gate: no longer blocked by missing Windows/LabVIEW proof for
  this lane; failures and missing implementations route to public issues
- Windows installed-user LabVIEW proof: community/deferred until external proof
  arrives and is admitted

## Runtime Selection Policy

All provider/year/bitness combinations remain selectable so the runtime and
error-reporting layer can be exercised. The validation command classifies the
selected path instead of silently preventing selection:

```bash
vihs --validate --proof-out ./vihs-proof
```

Expected retained files:

- `vihs-validation-proof.json`
- `vihs-validation-issue.md`

The proof packet intentionally retains paths and environment facts useful for
debugging. Secret-looking environment variables are redacted; path-like
environment variables and configured executable paths remain visible because
they are diagnostic evidence for installed-user failures.

## Runtime Code Taxonomy

The public validation lane uses stable `VIHS_*` codes:

| Code | Meaning |
| --- | --- |
| `VIHS_OK` | selected runtime path is ready |
| `VIHS_E_PROVIDER_INVALID` | provider value is not recognized |
| `VIHS_E_RUNTIME_SELECTION_REQUIRED` | provider/year/bitness selection is incomplete |
| `VIHS_E_LABVIEW_VERSION_REQUIRED` | LabVIEW year is missing |
| `VIHS_E_LABVIEW_BITNESS_REQUIRED` | LabVIEW bitness is missing |
| `VIHS_E_PLATFORM_UNSUPPORTED` | selected path cannot run on the current platform |
| `VIHS_E_CONFIGURED_PATH_MISSING` | configured executable path does not exist |
| `VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED` | Docker provider accepted the request, but the selected LabVIEW year is not implemented |
| `VIHS_E_DOCKER_PROVIDER_UNSUPPORTED_BITNESS` | Docker provider accepted the request, but selected bitness is not implemented |
| `VIHS_E_DOCKER_UNAVAILABLE` | Docker is unavailable or not reachable |
| `VIHS_E_LABVIEW_NOT_FOUND` | local LabVIEWCLI path could not be found |
| `VIHS_E_LABVIEW_AMBIGUOUS` | multiple local LabVIEWCLI paths matched |
| `VIHS_E_LABVIEW_CLI_BITNESS_NOT_FOUND` | requested LabVIEWCLI bitness could not be found |
| `VIHS_E_COMPARISON_TOOL_NOT_FOUND` | compare tool was not found |
| `VIHS_E_RUNTIME_SURFACE_CONTAMINATED` | runtime surface contains conflicting ambient tooling |
| `VIHS_E_RUNTIME_VALIDATION_BLOCKED` | validation was blocked by an unexpected prerequisite or runtime failure |

## Public Intake

Public GitHub issue intake for `1.3.11` includes:

- bug reports
- validation success reports
- validation failure reports
- feature-not-implemented reports
- LabVIEW version/provider/bitness support requests

Prepared public template sources:

- `public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml`
- `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml`
- `public-github-source/.github/ISSUE_TEMPLATE/validation-success.yml`
- `public-github-source/.github/ISSUE_TEMPLATE/validation-failure.yml`
- `public-github-source/.github/ISSUE_TEMPLATE/feature-not-implemented.yml`
- `public-github-source/.github/ISSUE_TEMPLATE/labview-version-support.yml`
- `public-github-source/.github/labels.yml`

## Triage Loop

1. Intake
   - Confirm extension version `1.3.11`, install route, provider, LabVIEW
     year, bitness, operating system, and `runtimeErrorCode`.
2. Evidence completeness
   - Prefer `vihs-validation-proof.json`; accept exact `vihs --validate`
     output when the proof file is unavailable.
3. Classification
   - Success reports get `validation:success` and `proof:reported`.
   - Failures get `validation:failure`, `error-code`, and a provider label.
   - Not-yet-implemented reports get `feature:not-implemented` and the
     corresponding `VIHS_E_*` code.
4. Reproduction and consolidation
   - Reproduce where a maintainer host is available.
   - Keep Windows/LabVIEW installed-user proof community/deferred until
     admitted proof exists.
   - Do not treat Linux/Docker proof as Windows installed-user proof.
5. Authority follow-up
   - Promote source, docs, test, or traceability changes through GitLab
     authority.
   - Keep public issue links as the public evidence intake trail.

## Prior Windows x64 LabVIEW Proof

Prior extension testing of Windows 64-bit LabVIEW is retained as confidence
context, not as the current `1.3.11` installed-user proof claim. The current
lane intentionally admits community validation and routes any regression or
missing implementation to public GitHub.

## Guardrails

- Do not expose PATs, access tokens, or private GitLab tokens.
- Allow diagnostic paths and environment names/values in proof packets, with
  secret-looking variables redacted.
- Keep public GitHub and Marketplace mutation scoped to the `1.3.11` public
  validation lane.
- Retain exact public GitHub release assets before publishing a release when
  the GitHub release is used.
- Verify Marketplace publication after upload through an official Marketplace
  or `vsce show` readback.

## Release-Control Evidence

- Runtime proof/error implementation:
  `src/tooling/localRuntimeSettingsCli.ts`
- Docker not-implemented classification:
  `src/reporting/comparisonRuntimeLocator.ts`
- Public source promotion script:
  `scripts/promotePublicGithubSource.js`
- Publication state:
  `docs/product/release-publication-state.md`
- Marketplace ledger:
  `docs/product/vscode-marketplace-publication-ledger.md`
- Traceability matrix:
  `docs/requirements/rtm.csv`
