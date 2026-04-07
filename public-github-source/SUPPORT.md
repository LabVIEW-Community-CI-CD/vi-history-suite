# Support

## Public Support Boundary

Use this public GitHub repo for:

- installed-extension bugs
- compare-generation issues
- Docker image acquisition/runtime issues
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
- whether the workspace was trusted
- whether the target file was an eligible tracked LabVIEW VI
- whether the issue happened on first-use image pull or on a warm image
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
docker version
docker info --format '{{.OSType}}'
```

## Current Product Boundary

The public product contract is Docker-only and x64-only.

The extension does not use host LabVIEW as an installed-user fallback path.

If Docker is unavailable or the governed image cannot be acquired, the product
should fail closed with visible next-step guidance.
