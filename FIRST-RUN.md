# First Run

## Installed Extension

1. Install the extension.
2. Open or restart VS Code.
3. Run `VI History: Prepare Local Runtime Settings CLI` from the Command
   Palette.
4. Open an integrated terminal and run `vihs`.
5. Choose `host` or `docker`, then choose the LabVIEW year and bitness.
6. Run `vihs --validate`.
7. Open a trusted Git repository with a tracked LabVIEW file.
8. Open `VI History`, select two revisions, review the preflight, and choose
   `Compare`.

If validation reports a blocked runtime, fix that runtime first. The extension
does not silently switch provider, year, or bitness during compare.

The `VI History runtime` status bar item is clickable. Selecting it opens
`Pick Runtime Provider`, a quick-pick listing every detected host LabVIEW
installation plus Docker (when the Docker CLI is detected) and a
`(none) — auto-detect` option that clears the persisted selection. Choices
are written to your User settings as `viHistorySuite.runtimeProvider`,
`viHistorySuite.labviewVersion`, and `viHistorySuite.labviewBitness`. The
status bar label updates immediately when those keys change, whether you
edit them in `settings.json`, run `vihs --provider …`, or use the
quick-pick. (VHS-REQ-620)

Expected quiet behavior:

- Installing or selecting the extension should not ask for GitHub
  authorization.
- Opening the bundled documentation should not start Git indexing, LabVIEW, or
  `LabVIEWCLI`.
- LabVIEW or `LabVIEWCLI` should start only when you explicitly run validation
  or compare work that needs it.

## Source Evaluation

Use a devcontainer or Codespace when you want to test the repository source
without turning your workstation into the project test harness:

```bash
npm run check
npm run customization:audit
npm test
npm run package
```

After `postStartCommand` completes, select `Run VI History Suite` from the Run
and Debug view and press `F5`. A successful first launch opens an
Extension Development Host window.

## Feedback

Use the first-time onboarding tracker for Marketplace, first-run, and
source-evaluation feedback:

https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12

Helpful feedback includes:

- install surface: Marketplace, VSIX, Codespaces, Dev Containers in VS Code, or
  local clone
- extension version and VS Code version
- first command or UI action attempted
- the first unclear instruction, stale link, unexpected prompt, or blocked step
- `vihs --validate` output when runtime setup was involved
