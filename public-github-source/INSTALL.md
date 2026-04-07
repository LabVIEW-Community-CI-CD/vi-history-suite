# Install

## Public Runtime Contract

The installed extension compare workflow is Docker-only and x64-only.

Required surfaces:

- Visual Studio Code
- Docker Desktop or another Docker-compatible engine available to VS Code
- a trusted Git repository containing an eligible LabVIEW VI

Not required:

- host LabVIEW
- host LabVIEW CLI
- private GitLab access

## Runtime Selection

The extension selects the governed image from the current host and Docker
daemon engine:

- Windows host + Linux engine: governed Linux image
- Windows host + Windows engine: governed Windows image
- Linux host: governed Linux image

If the selected governed image is missing locally, the extension pulls it on
first use before compare execution.

## Installed User Flow

1. Install the VSIX from a governed release.
2. Open a trusted Git repository with an eligible LabVIEW VI.
3. Run `VI History`.
4. Select one commit checkbox.
5. Select a second distinct commit checkbox.
6. Wait for first-use image acquisition if the selected governed image is not
   already present.
7. Review the generated comparison report.

## Public Development And Evaluation

The public repo is intended to support devcontainer/Codespaces evaluation.

Typical path:

1. Open the repo in a devcontainer or Codespace.
2. Let `npm ci` complete.
3. Run `npm run compile`.
4. Press `F5`.
5. Exercise the checkbox-selected compare flow.

The public Linux cold-pull smoke lane is:

```bash
npm run public:smoke:linux
```

## Current Public Boundary

This repo is the public source facade.

It does not publish:

- private requirements and RTM artifacts
- benchmark-control packets
- maintainer-only human-review evidence
- internal GitLab control-plane docs
