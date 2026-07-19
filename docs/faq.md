# FAQ

## Document Control

- Product or service: vi-history-suite
- Applies to: vi-history-suite user-information baseline
- Last reviewed: 2026-07-13
- Primary audience: New or returning users who need compact answers before following a detailed procedure.
- Primary entry route: `docs/user-guide.md`

See also:

- `README.md`
- `docs/user-guide.md`
- `docs/glossary.md`
- `docs/quick-reference.md`

## Questions

### How do I start?

Start with `README.md`, then use `INSTALL.md` and `FIRST-RUN.md` if the extension is not installed or has not been run on this machine. After installation, open a Git-backed LabVIEW workspace and use VI History on a supported VI file.

### Where do I find the key commands or checks?

Use `docs/quick-reference.md` for the short command list. Maintainers should use `docs/testing/test-plan.md` for validation scope, `docs/requirements/README.md` for requirement-targeted work, and `docs/maintainer-operations.md` for release or closeout evidence.

### What should I do when the expected route fails?

Use `TROUBLESHOOTING.md` first for runtime, Docker, Git, or LabVIEWCLI failures. If the failure is about support boundaries or responsible disclosure, use `SUPPORT.md` or `SECURITY.md` as appropriate.
### How do I preview a VI instead of comparing it?

Turn on the `viHistorySuite.preview.enabled` setting (on the Docker runtime).
Opening a `.vi`/`.vit`/`.ctl` then shows a read-only picture of its front panel
and block diagram. Turn on `viHistorySuite.preview.blockDiagramInteractive` to
pan, zoom, and step through the diagram's Case/Event/Sequence cases instead of
seeing a static image. See [README.md](../README.md#preview-a-vi).

### What is a pre-release version and how do I get it?

Releases follow the VS Code convention: an even minor version (for example
`1.34.x`) is stable and an odd minor version (for example `1.35.x`) is a
pre-release. Enable **Install Pre-Release Versions** on the extension in the
Extensions view to receive pre-release builds.

### What is the "dev-tools" version, and do I need to change it?

Most users never touch this. The extension bundles a "dev-tools" build (the
MCP server and companion tooling) and uses it by default
(`viHistorySuite.devTools.version` = `bundled`). You can pin an independently
released version with a `devtools-vX.Y.Z` tag and the **Install Pinned
Dev-Tools Version** command to try a newer toolset without waiting for a
Marketplace update. It is fail-closed: until a pinned version is installed and
integrity-verified in a trusted workspace, the bundled build keeps running. Use
**Show Dev-Tools Status** to see which build is active. See
[docs/devtools-release.md](devtools-release.md#pinning-a-dev-tools-version-in-the-extension).

### Does the extension contact the network on its own?

No. The bundled dev-tools build never uses the network. A pinned dev-tools
version is downloaded only when you run the install command in a trusted
workspace, and the opt-in `viHistorySuite.devTools.checkForUpdates` check
contacts the network only when you enable it and a version is pinned.
