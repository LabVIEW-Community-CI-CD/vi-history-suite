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
docker version
docker info --format '{{.OSType}}'
```

## Current Product Boundary

- Windows defaults to local `LabVIEWCLI`
- Docker remains a bounded expert provider
- if the selected host or Docker bundle is missing, contradictory,
  unsupported, or blocked, the product should fail closed with visible
  next-step guidance instead of silently switching provider classes
