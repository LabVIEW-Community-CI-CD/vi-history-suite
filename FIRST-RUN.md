# First Run

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
