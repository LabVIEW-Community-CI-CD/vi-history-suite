# First Run

Use this guide after installing VI History Suite from the VS Code Marketplace,
with `code --install-extension svelderrainruiz.vi-history-suite`, or from an
exact released VSIX.

## Prepare Runtime Settings

1. Run `VI History: Prepare Local Runtime Settings CLI` from the Command
   Palette.
2. Open an integrated terminal.
3. Run `vihs`.
4. Choose provider, LabVIEW year, and bitness for this machine.
5. Run `vihs --validate`.

The prepare command is the expected way to create or refresh the local `vihs`
launcher. VS Code startup alone does not prepare the command.

## First Compare

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit` file.
2. Open `VI History` from the Explorer context menu or editor title action.
3. Select exactly two retained revisions.
4. Review the compare preflight.
5. Choose `Compare`.

## More Help

- [Troubleshooting](./TROUBLESHOOTING.md)
- [FAQ](./docs/information-for-users/faq.md)
- [Command Reference](./docs/information-for-users/command-reference.md)
