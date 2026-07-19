# Dev-Tools GitHub Release Channel

The development toolset — the `scripts/` CLIs, the maintainer `.cjs` drivers, the
compiled Model Context Protocol server, the requirements documents, and the agent
customization surfaces — is distributable as a **versioned, content-addressed
GitHub Release artifact**, independent of the VS Code marketplace release. This
lets maintainers and agents pin and verify a known-good toolset that is
cryptographically bound to the requirements state it was cut from
(VHS-REQ-667).

This channel distributes the **tools**, not the extension. The marketplace
release (VHS-REQ-609) is a separate manual dispatch that an authorized agent is responsible for (a maintainer may also perform it).

## What ships

[`docs/devtools-release.manifest.json`](./devtools-release.manifest.json) is the
committed **source of truth** for the bundled toolset (schema
`vi-history-suite/devtools-release@v1`). It lists include globs grouped by
category (scripts CLIs, `.cjs` drivers, compiled MCP `out/`, requirements docs,
`AGENTS.md` plus `.github` skills/prompts/instructions/agents) and exclude
patterns. Editing this file changes which files ship and therefore the release
content digest.

## Building the artifact

Build the compiled output first, then produce the provenance manifest and
tarball (the `stable` channel is shown; omit `--channel` to default to
`prerelease`):

```bash
npm run compile
npm run devtools:release -- --channel stable --output devtools-dist/devtools-release.json --pack devtools-dist/devtools-tools.tgz
```

- The **provenance manifest** (`devtools-release.json`) records the aggregate
  `contentDigest`, per-file `sha256`, the `requirementsManifestDigest`, the git
  commit, the build version, and the channel.
- `--pack` produces a **deterministic** POSIX ustar + gzip tarball (sorted
  entries, normalized metadata, using Node built-ins only), so identical inputs
  yield a byte-identical archive.

## Verifying a downloaded toolset

Consumers verify what they downloaded against the shipped provenance manifest
before trusting or executing it:

```bash
node scripts/verifyDevToolsRelease.js --manifest devtools-release.json --root <extracted-dir>
```

It fails closed on any tampered, missing, or unexpected file, or an
aggregate-digest mismatch. A maintainer can also confirm the in-tree toolset
still matches a manifest:

```bash
node scripts/verifyDevToolsRelease.js --verify-self --manifest devtools-release.json
```

## Pinning a dev-tools version in the extension

The extension normally runs the dev-tools build it ships with (the MCP server
and companion tooling). You can instead **pin an independent dev-tools release**
and run it without waiting for a Marketplace update — useful for trying a newer
toolset or reproducing a specific version.

1. Set `viHistorySuite.devTools.version` to a release tag, for example
   `devtools-v1.4.0` (the default `bundled` uses the shipped build and never
   touches the network).
2. Run **VI History: Install Pinned Dev-Tools Version**. In a trusted workspace
   the extension downloads that release from the official repository over HTTPS,
   verifies its integrity (per-file SHA-256 plus the aggregate content digest),
   and stores it under the extension's global storage. Reload the window so the
   MCP server launches from the pinned build.

The pin is **fail-closed**: until a pinned version is installed and verified — or
if the workspace is untrusted — the MCP server keeps launching the bundled
build, and the extension offers to install the pin when it detects one is
missing.

Related commands and settings:

- **VI History: Show Dev-Tools Status** — reports the pinned setting, whether it
  is installed and verified, which build the MCP server currently launches, and
  the installed versions.
- **VI History: Uninstall Dev-Tools Version** — removes an installed version
  (and warns when you remove the one still pinned).
- `viHistorySuite.devTools.checkForUpdates` (off by default) — opt in to a
  best-effort activation check that notifies you when a newer **stable**
  dev-tools version is available. It contacts the network only when enabled, a
  version is pinned, and the workspace is trusted.

## The release workflow

[`.github/workflows/devtools-release.yml`](../.github/workflows/devtools-release.yml)
publishes the artifact. It is **dry-run-first**:

- `workflow_dispatch` accepts `channel` and `dry_run` (default **true**). A dry
  run builds, self-verifies, and reports the dedup decision, uploading the
  artifact to the run only — it creates no GitHub Release.
- A push to `develop` maps to the `prerelease` channel; a push to `main` maps to
  the `stable` channel. A push **behaves as a dry run** (build + verify + dedup,
  no release) unless the opt-in repository variable
  `DEVTOOLS_RELEASE_PUBLISH` is set to `true`. This keeps the channel
  dry-run-first: enabling live auto-publish on push is a deliberate switch. A
  manual dispatch with `dry_run=false` always publishes on explicit maintainer
  intent, regardless of the variable.
- The workflow **deduplicates on the content digest**: it compares against the
  latest release of the channel and skips when nothing tool-related changed, so
  no-op merges do not churn releases.
- A real GitHub Release is created only on a non-dry-run when the content digest
  changed. Tags follow the independent SemVer 2.0 dev-tools version line
  (VHS-REQ-676): `devtools-v<version>` (stable) and
  `devtools-v<version>-dev.<run-id>` (prerelease, a valid SemVer 2.0 prerelease,
  marked as a GitHub pre-release). The `version` is sourced from the committed
  `docs/devtools-release.manifest.json` and echoed into the provenance packet;
  the workflow fails closed if the two disagree. Bump the manifest `version`
  deliberately to publish a new dev-tools version.
- After a real release, the workflow **prunes superseded releases of that
  channel** beyond a keep-last-N bound (default 5, overridable via the
  repository variable `DEVTOOLS_RELEASE_RETENTION`; `0` disables pruning), so
  the dev channel does not accumulate one release per merge. Pruning is
  best-effort and deletes the release plus its tag.

The workflow names no Vagrant helper (VHS-REQ-599 alignment).
