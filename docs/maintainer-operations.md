# Maintainer Operations

This repository uses a lightweight GitHub-first operating model. Hosted CI is
the public merge gate. Maintainer-only validation is used for local
Windows/LabVIEW confidence and release evidence, but it is not a public pull
request gate.

## Release Flow

1. Prepare the release on `main` through a pull request.
2. Confirm hosted CI passes.
3. Tag the exact release on the merged `main` commit.
4. Create the GitHub Release from the existing tag.
5. Package and publish to the VS Code Marketplace manually.
6. Verify the Marketplace version and links with:

   ```powershell
   node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json
   ```

The Marketplace extension identity remains `svelderrainruiz.vi-history-suite`.
Source, support, and release links point to
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`.

Do not attach VSIX files to GitHub Releases unless a future release plan makes
GitHub a second install channel. The Marketplace is the install channel.

## Token Handling

Marketplace publishing tokens are local, short-lived maintainer secrets.

- Do not commit tokens.
- Do not store tokens in this repository.
- Do not add Marketplace tokens to GitHub Actions secrets for the first
  operations pass.
- Delete temporary token files immediately after use.
- Revoke or rotate temporary Marketplace tokens after publication.

GitHub secret scanning and push protection are enabled for this repository.

## Validation Surfaces

| Surface | Role | Release Claim |
| --- | --- | --- |
| Hosted GitHub CI | Required public merge gate on Ubuntu | Required before merge |
| Codespaces/devcontainer | Primary source-evaluation path | Human/source confidence |
| Maintainer Windows/LabVIEW runner | Trusted installed-user validation | Maintainer evidence only |
| Vagrant | Optional isolated local helper | Not a release gate |

## Windows/LabVIEW Runner

The self-hosted runner is a repository-level maintainer runner for trusted refs
only. It must not run arbitrary pull request code.

Runner settings:

- Runner name: `vihs-win-labview-sveld`
- Custom label: `vihs-windows-labview-maintainer`
- Mode: interactive `run.cmd`, not a Windows service
- Scope: `LabVIEW-Community-CI-CD/vi-history-suite`

Expected host prerequisites:

- Node.js and npm
- VS Code
- LabVIEW 2026
- LabVIEWCLI
- Git
- GitHub Actions runner application
- a PowerShell execution policy for the runner user that allows GitHub's
  temporary `.ps1` scripts, such as `CurrentUser RemoteSigned`

The runner workflow must be `workflow_dispatch` only, use read-only repository
permissions, and hard-fail unless the ref is `main` or an exact `v*` tag.
The workflow file is `.github/workflows/windows-labview-maintainer.yml`.

Start the runner only when needed:

```powershell
cd C:\dev\github-actions-runners\vi-history-suite
.\run.cmd
```

Stop it after validation by closing the runner terminal or pressing `Ctrl+C`.

## Evidence

Maintainer evidence should be small and repeatable:

- trusted-ref decision line (`allowed`/`blocked`) with evaluated ref facts
- workflow run URL
- commit ref and SHA
- runner name and runner labels
- Node/npm versions
- VS Code path
- LabVIEW/LabVIEWCLI paths and LabVIEWCLI detection result
- VSIX evidence path recorded in `runner-evidence/windows-labview-maintainer-summary.txt`
- packaged VSIX artifact from that run (`vi-history-suite-*.vsix`)

What this evidence proves:

- a trusted maintainer workflow run executed on the maintainer runner label
- the run captured factual host/tooling context and trusted-ref gating outcome
- the run produced (or explicitly failed to produce) the expected VSIX evidence path

What this evidence does **not** prove:

- Marketplace publication occurred
- self-hosted validation is a public PR gate
- untrusted refs were ever allowed to execute maintainer validation

Do not claim Vagrant evidence unless the Vagrant issue is run on a
Vagrant-capable host and recorded separately.

## External Marketplace Verification

The Marketplace extension identity `svelderrainruiz.vi-history-suite` is tested
statically through `tests/unit/packageManifest.test.ts` and
`tests/unit/publicDocSourceLinks.test.ts`, but the live Marketplace listing
itself requires manual verification after publication.

Manual verification steps:

1. Run the `vsce show` command:

   ```powershell
   node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json
   ```

2. Confirm the returned URLs use the organization repository as their base:

   ```
   repository.url = https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git
   bugs.url = https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues
   ```

3. Visit the Marketplace listing page and confirm the source repository link
   leads to the organization repository, not the old personal repository.

This external evidence reference is documented in RTM as
`external:vscode-marketplace-svelderrainruiz.vi-history-suite` for VHS-REQ-600.

## Post-Publish Reconciliation Checklist

After any Marketplace publish, use this checklist to verify that the live
listing reflects the expected source, support, and identity metadata. This
checklist is verification-only and does not require Marketplace credentials.

### Checklist

- [ ] **Extension Identity**: Confirm the Marketplace listing shows
      `svelderrainruiz.vi-history-suite` as the extension identifier.
- [ ] **Published Version**: Confirm the Marketplace version matches the
      released tag (e.g., `1.4.0` for `v1.4.0`).
- [ ] **Source URL**: Confirm the Marketplace "Repository" link points to
      `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`.
- [ ] **Support URL**: Confirm the Marketplace "Issues" or "Support" link
      points to
      `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues`.
- [ ] **Repository URL**: Confirm the `vsce show` output shows the organization
      repository URL, not the old personal repository.
- [ ] **Installed Bundled Docs**: After installing the published version in
      VS Code, confirm the bundled `README.md` and `CHANGELOG.md` display the
      organization repository links, not the old personal repository.

### Verification Commands

Run these commands to gather evidence without Marketplace credentials:

```powershell
# Show live Marketplace metadata (no credentials required)
node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json

# Confirm local package.json matches expectations
npm run check
npx vitest run tests/unit/packageManifest.test.ts tests/unit/publicDocSourceLinks.test.ts
```

### Reporting Stale Links

If the Marketplace listing shows stale source or support links after a publish:

1. File an issue using the First-Time Onboarding Feedback template at
   `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12`.
2. Include the `vsce show` JSON output and a screenshot of the Marketplace page.
3. Do not attempt to fix the listing without coordinating with the maintainer
   who owns the Marketplace publisher credentials.
