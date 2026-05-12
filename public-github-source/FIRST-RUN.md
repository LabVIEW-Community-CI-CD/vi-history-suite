# First-Run Guide

This guide gets you from a fresh extension install to one successful VI
comparison using local LabVIEW on Windows.

## Prerequisites

- Windows with LabVIEW `2025`, `2026`, or newer installed
- Visual Studio Code
- A Git repository containing `.vi`, `.ctl`, or `.vit` files

LabVIEW `2024` and older cannot create the VI Comparison Report that VI History
Suite uses. Use LabVIEW `2025`, `2026`, or newer for this workflow.

LabVIEW `2025` and `2026` can open older VI source for comparison without
requiring migration of the source files before report generation.

## Step 1: Install The Extension

Use one of these install surfaces:

- install from the VS Code Extensions view (search for `VI History Suite`)
- run `code --install-extension svelderrainruiz.vi-history-suite`
- install the released VSIX when you intentionally need that exact package

## Step 2: Open Or Restart VS Code

After installation, open or restart VS Code once so the extension activates and
registers its CLI and commands.

## Step 3: Run `vihs`

1. Open an integrated terminal in VS Code.
2. Run `vihs`.
3. If `vihs` is not available yet, run `VI History: Prepare Local Runtime
   Settings CLI` from the Command Palette (Ctrl+Shift+P), then run `vihs` again.

## Step 4: Select Local LabVIEW

When `vihs` starts:

1. Choose `host` as the provider (local LabVIEW).
2. Select your LabVIEW year: `2025`, `2026`, or enter a manual path for newer
   versions.
3. Choose the bitness intentionally:
   - `x86` (32-bit) if you installed LabVIEW 32-bit
   - `x64` (64-bit) if you installed LabVIEW 64-bit

Select the bitness that matches your actual LabVIEW installation. If the
selected bitness is not found but an alternative bitness is detected, VI History
Suite reports the detected alternative but does not auto-switch.

## Step 5: Run `vihs --validate`

Run:

```bash
vihs --validate
```

This confirms:

- the selected provider, LabVIEW year, and bitness are valid
- `LabVIEWCLI` is reachable at the expected path
- the VI Server and session are ready for compare operations

If validation fails, check the `runtimeErrorCode` in the output for next-step
guidance.

## Step 6: Compare A VI

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit` file.
2. Right-click the file in the Explorer and choose `VI History`, or use the
   `VI History` button in the editor title when the file is open.
3. Select exactly two revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

## First-Failure Guidance

### `vihs` is not found

Run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette
(Ctrl+Shift+P), then run `vihs` again.

### `LabVIEWCLI` is not found or missing

Confirm LabVIEW `2025`, `2026`, or newer is installed. LabVIEW `2024` and older
cannot create the VI Comparison Report. Use `vihs --validate` to check the
expected path.

### Selected bitness is not found

If you selected `x64` but LabVIEW is installed as `x86` (or vice versa),
re-run `vihs` and select the correct bitness. VI History Suite reports a
detected alternative bitness but does not auto-switch.

### VI Server or session readiness issues

Run `vihs --validate` and check the `runtimeErrorCode`. Common causes:

- LabVIEW is not installed or not discoverable
- the selected LabVIEW year or bitness does not match the installed runtime
- another LabVIEW process is blocking the VI Server port

### Docker is mentioned

Docker is an expert/validation path rather than the primary local-LabVIEW path.
If you have local LabVIEW `2025`/`2026` or newer, use `provider=host` for the
simplest workflow. Docker requires additional setup and is not covered in this
first-run guide.

## Next Steps

- [Installed-user LabVIEW support matrix](./README.md#installed-user-labview-support-matrix)
- [Troubleshooting guide (#80)](https://github.com/svelderrainruiz/vi-history-suite/issues/80)
- [Support](./SUPPORT.md)
