# Support

## Public Support Boundary

Use this public GitHub repo for:

- installed-extension bugs
- compare-generation issues
- runtime-provider issues
- Docker image acquisition/runtime issues
- local Windows `LabVIEWCLI` preflight and readiness issues
- checkbox-selected compare UX feedback
- public documentation problems

Do not use this repo to request:

- private GitLab access
- internal control-plane artifacts
- benchmark-governance packets
- maintainer-only review evidence

## Useful Issue Facts

Please include:

- extension version
- operating system
- whether you installed from the Marketplace, from `code --install-extension`,
  or from a VSIX
- whether the workspace was trusted
- whether the target file was an eligible tracked LabVIEW VI
- the persisted provider, LabVIEW version, and LabVIEW bitness bundle
- whether you ran `vihs --validate`
- the stable `runtimeErrorCode` shown by `vihs --validate`
- whether you generated `vihs --validate --proof-out ./vihs-proof`
- whether VS Code was already open when the generated settings CLI last wrote
  settings
- whether the issue happened on first-use image pull, on a warm image, or on a
  host-default Windows local `LabVIEWCLI` path
- Docker engine and host combination
  - Windows host with Linux engine
  - Windows host with Windows engine
  - Linux host
- what you expected
- what happened instead

Useful command output:

```bash
code --version
code --list-extensions --show-versions
git --version
vihs --validate
vihs --validate --proof-out ./vihs-proof
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof
docker version
docker info --format '{{.OSType}}'
docker info --format "{{.OSType}} {{.OperatingSystem}}"
```

## Community Validation Triage

Marketplace pre-release `1.3.13` accepts Windows/LabVIEW community validation
reports and not-yet-implemented feature reports before every selectable
combination has maintainer-retained proof.

Triage labels start with `community-validation`, `marketplace-preview`,
`windows-labview`, and `needs-triage`. A report moves to
`validation:success`, `validation:failure`, or `feature:not-implemented`
based on the submitted proof packet, with `proof:reported` retained when user
evidence is complete and `needs-reproduction` retained when maintainer
reproduction is still required.

The public validation lane is intentionally test-seeking: selectable variants
may work, fail with a stable `VIHS_E_*` code, or report
`feature:not-implemented`. File the report either way.

Linux/Docker and Linux host LabVIEW success do not prove native Windows/LabVIEW
installed-user behavior. They are accepted evidence for the selected Linux
machine only; Windows host LabVIEW 2026 x64 is admitted from retained
Windows installed-user proof. Windows Docker Desktop proof remains
community/deferred until public issue #65 receives a `vihs validate-fixture`
packet from a real Windows host with Docker Desktop OSType `windows`.

## Current Product Boundary

- Windows defaults to local `LabVIEWCLI`
- Docker remains a bounded expert provider
- if the selected host or Docker bundle is missing, contradictory,
  unsupported, or blocked, the product should fail closed with visible
  next-step guidance instead of silently switching provider classes
