# Troubleshooting

## `vihs` Is Not Found

Run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette,
then open a new integrated terminal and run:

```bash
vihs
vihs --validate
```

If VS Code or Node.js was repaired after the extension was installed, rerun the
same prepare command to refresh the launcher.

## Runtime Validation Fails

Run:

```bash
vihs --validate --proof-out ./vihs-proof
```

Use the `runtimeErrorCode`, provider, LabVIEW year, bitness, and generated
proof packet when filing an issue.

## Compare Does Not Start

Confirm that the workspace is trusted, the selected file is a tracked `.vi`,
`.ctl`, or `.vit`, and `vihs --validate` reports the intended runtime facts.
`VI History` starts Git repository inspection lazily when you open the command;
opening docs or selecting the extension should not start indexing, GitHub
authorization, LabVIEW, or `LabVIEWCLI`.

## More Help

- [First Run](./FIRST-RUN.md)
- [FAQ](./docs/information-for-users/faq.md)
- [Command Reference](./docs/information-for-users/command-reference.md)
- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
