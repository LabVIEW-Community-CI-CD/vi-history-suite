# Dev-Tools GitHub Release Channel

The development toolset — the `scripts/` CLIs, the maintainer `.cjs` drivers, the
compiled Model Context Protocol server, the requirements documents, and the agent
customization surfaces — is distributable as a **versioned, content-addressed
GitHub Release artifact**, independent of the VS Code marketplace release. This
lets maintainers and agents pin and verify a known-good toolset that is
cryptographically bound to the requirements state it was cut from
(VHS-REQ-667).

This channel distributes the **tools**, not the extension. The marketplace
release (VHS-REQ-609) is a separate, maintainer-only manual lever.

## What ships

[`docs/devtools-release.manifest.json`](./devtools-release.manifest.json) is the
committed **source of truth** for the bundled toolset (schema
`vi-history-suite/devtools-release@v1`). It lists include globs grouped by
category (scripts CLIs, `.cjs` drivers, compiled MCP `out/`, requirements docs,
`AGENTS.md` plus `.github` skills/prompts/instructions/agents) and exclude
patterns. Editing this file changes which files ship and therefore the release
content digest.

## Building the artifact

```bash
npm run compile                       # compiled MCP/CLI output must be built first
npm run devtools:release -- \
  --channel stable \                  # or prerelease; defaults to prerelease
  --output devtools-dist/devtools-release.json \
  --pack devtools-dist/devtools-tools.tgz
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
  changed. Tags follow `devtools-YYYYMMDD-<sha7>` (stable) and
  `devtools-dev-YYYYMMDD-<sha7>` (prerelease, marked as a GitHub pre-release).

The workflow names no Vagrant helper (VHS-REQ-599 alignment).
