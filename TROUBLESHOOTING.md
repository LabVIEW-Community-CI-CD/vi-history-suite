# Troubleshooting

## `vihs` Is Not Found

Run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette,
then open a new integrated terminal and run:

```bash
vihs --validate
```

## Compare Is Blocked

Run:

```bash
vihs --validate
```

Check the selected provider, LabVIEW year, bitness, runtime engine, and any
`VIHS_E_*` error code. Fix the reported runtime state before retrying compare.

## Status Bar Label Does Not Match The CLI Choice

The `VI History runtime` status bar label is sourced from the persisted
selection (`viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`,
`viHistorySuite.labviewBitness`) when all three keys are populated and the
combination is satisfiable on this host. It refreshes immediately when those
keys change.

If `vihs --provider …` (or a `settings.json` edit) does not update the label:

1. Run `VI History: Show Runtime Summary` and inspect the `Drift:` line.
   - `none` means selection and recommendation already align.
   - `selection differs from recommendation: …` means the persisted choice
     is satisfiable but diverges (the label honors the persisted choice).
   - `selection unsatisfiable on this host; falling back to recommendation`
     means LabVIEW for that year/bitness is not installed and Docker is not
     available; clear or change the persisted keys.
2. Click the `VI History runtime` status bar item to open
   `Pick Runtime Provider`. Choosing `(none) — auto-detect` clears the three
   keys and lets detection drive the label.
3. Confirm the CLI wrote to **User** settings (not Workspace). The extension
   reads from the merged `viHistorySuite` configuration; a workspace override
   wins over a user-level CLI write.

## Docker Was Selected

Confirm Docker is running in the same environment that launched VS Code:

```bash
docker version
docker info --format "{{.OSType}}"
```

The first Docker compare can pull a large LabVIEW runtime image.

## Source Evaluation

Inside a devcontainer or Codespace, reset the basic loop with:

```bash
npm ci
npm run check
npm test
```

## Closeout Evidence Registry Access Fails

If closeout evidence fails while inspecting or pulling the published standards
workbench image:

```bash
npm run closeout:evidence -- --kind standards --issue <issue-number> --standards-runner docker --save-dir assurance-closeout-evidence
```

Use these failure signatures to choose remediation:

- `error getting credentials`, `credential helper`, `credsStore`, or
  `credHelpers`: Docker credential-helper configuration is invalid for the
  current environment. Fix `~/.docker/config.json` helper settings and retry.
- `unauthorized`, `access forbidden`, `requested access ... denied`, or
  `pull access denied`: refresh credentials and rerun
  `docker login registry.gitlab.com`.
- `manifest unknown`, `name unknown`, or repository not found: verify published
  image availability before retry.

For non-interactive environments, set auth upfront:

```bash
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/absolute/path/to/askpass-helper.sh
printf '%s' "$RSR_PAT" | docker login registry.gitlab.com -u oauth2 --password-stdin
```
