# Ubuntu/Docker Release-Control Evidence - 2026-04-25

## Purpose

Retain the local branch-flow decision and evidence split for the Ubuntu/Docker
validation pass performed after the host setup moved to Ubuntu-only Docker.

This packet is release-control evidence for the current feature slice. It does
not open an exact release, hotfix, public GitHub production mutation, or VS
Code Marketplace publication act.

## Branch-Flow Decision

| Surface | Decision | Rationale |
| --- | --- | --- |
| GitLab authority repo | Commit on `feature/ubuntu-docker-evidence-lane-fixes`, targeting `develop` | The fixes repair Ubuntu/Docker validation lanes on top of current `origin/develop` without changing an exact released `main` line. |
| GitLab release branch | Do not open `release/*` | No SemVer release candidate, tag, package version change, or Marketplace act is admitted by this slice. |
| GitLab hotfix branch | Do not open `hotfix/*` | The change does not patch a production exact `main` emergency line. |
| Public GitHub facade | Do not commit directly to public `main` | The dirty public clone was used only to prove the downstream smoke path. Public source changes must be regenerated from GitLab authority with `npm run public:source:promote` after the authority branch is accepted. |
| Marketplace | No mutation | Ubuntu/Docker proof is necessary local evidence but does not replace external Windows/LabVIEW installed-user proof. |

## Local Fixes

| File | Change | Evidence Need Closed |
| --- | --- | --- |
| `docker/docs-authoring/Dockerfile` | Extract the pinned Lychee `v0.24.1` archive from its nested `lychee-x86_64-unknown-linux-musl/lychee` member with `--strip-components=1`. | The Docker docs-authoring workbench now builds from the pinned archive shape on Ubuntu. |
| `tests/integration/runTests.ts` | Clear inherited `ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ATTACH_CONSOLE`, and `VSCODE_*` variables before launching `@vscode/test-electron`. | Integration runs launched from an IDE-hosted Codex session no longer inherit VS Code extension-host variables that make the downloaded VS Code behave like Node. |

## Verified On This Ubuntu/Docker Host

| Check | Command Or Evidence | Result |
| --- | --- | --- |
| Standards preflight | `python3 scripts/preflight_local_dependencies.py --standards-root /home/ghostshadow/Documents/design/standards --json` from `repo-standards-review` | PASS |
| Standards release gate | `python3 scripts/run_assurance.py /home/ghostshadow/Public/repos/vi-history-suite-gitlab-develop --profile release-gate --output gate-scorecard` | PASS for coverage, CM, requirements, architecture, and documentation; DoD reported N/A by the skill scorecard. |
| Standards evidence table | `python3 scripts/run_assurance.py /home/ghostshadow/Public/repos/vi-history-suite-gitlab-develop --profile release-gate --output evidence-table` | PASS evidence generated for requirements, architecture, test, CM, and documentation lanes. |
| Branch baseline | `npm run branch:governance:assert` | PASS; `origin/develop` contains `origin/main`. |
| Targeted docs tests | `npm exec -- vitest run tests/unit/docsWorkbenchDocs.test.ts tests/unit/hostedCiGovernanceDocs.test.ts tests/unit/shipControlDocs.test.ts tests/unit/informationForUsersQualityDocs.test.ts` | PASS; 13 tests. |
| Docs workbench build | `sg docker -c "npm run docs:workbench:build"` | PASS after the Lychee archive extraction fix. |
| Docs workbench gate | `sg docker -c "npm run docs:workbench:gate"` | PASS; TypeScript compile, docs alignment, bundled-doc sync, and Lychee link checks completed with 532 OK links and 0 errors. |
| Authority compile and integration compile | `npm run compile && npm run test:integration:compile` | PASS. |
| Public facade compile and integration compile | `npm run compile && npm run test:integration:compile` in `/home/ghostshadow/Public/repos/vi-history-suite-github` | PASS. |
| Public Linux installed-user smoke | `sg docker -c "npm run public:smoke:linux -- --evidence-dir artifacts/public-linux-installed-user-smoke"` in `/home/ghostshadow/Public/repos/vi-history-suite-github` | PASS. Receipt retained outside authority repo at `/home/ghostshadow/Public/repos/vi-history-suite-github/artifacts/public-linux-installed-user-smoke/public-linux-installed-user-smoke.json`. |
| Docker engine access | `sg docker -c "docker info --format '{{.OSType}}'"` | PASS; returned `linux`. |
| Ubuntu package source health | `sudo apt-get update` after disabling duplicate Docker apt source | PASS; duplicate-source warning cleared. |

## Public Facade Review

The public GitHub checkout at
`/home/ghostshadow/Public/repos/vi-history-suite-github` was left dirty on
`main` with:

- `tests/integration/runTests.ts` carrying the same integration-runner
  environment sanitization fix
- `artifacts/public-linux-installed-user-smoke/` carrying the successful Linux
  installed-user smoke receipt and logs

Those changes prove that the downstream public facade can run after the same
fix, but they are not the governed publication path. The governed path remains:

1. merge the authority feature branch to GitLab `develop`
2. regenerate the curated public source facade from authority using
   `npm run public:source:promote`
3. verify the target public checkout is clean and bound to
   `https://github.com/svelderrainruiz/vi-history-suite.git`
4. promote through the public facade branch/PR route admitted by the current
   public candidate state

## External Windows/LabVIEW Proof Still Required

This Ubuntu/Docker pass does not cover:

- Windows local `LabVIEWCLI` installed-user validation
- Windows Docker container validation for the governed `docker/windows`
  `2026` `x64` lane
- `npm run public:contract:windows-installed-user`
- `npm run vscode:marketplace:install-proof`
- actual bare `vihs`, `vihs --validate`, and compare/report proof on the
  separate Windows/LabVIEW host setup

Any Marketplace or Windows LabVIEW claim that relies on those items remains
missing proof until the external Windows/LabVIEW host evidence is retained.

## Live-Service Boundary

No live GitHub, GitLab, or Marketplace API readback was performed for this
packet. The public GitHub clone evidence is local filesystem and Docker smoke
evidence only.

## Release-Control Classification

- Promotion class: develop feature slice
- Authority branch: `feature/ubuntu-docker-evidence-lane-fixes`
- Target branch: `develop`
- Public GitHub production mutation: not admitted
- Marketplace production mutation: not admitted
- Exact tag: not admitted
- Residual gate: external Windows/LabVIEW proof remains separate and required
  for Windows/Marketplace claims
