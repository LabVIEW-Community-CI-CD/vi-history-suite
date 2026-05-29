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
