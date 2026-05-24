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
