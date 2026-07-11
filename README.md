# VI History Suite

Review the history of your LabVIEW VIs without leaving Visual Studio Code. VI
History Suite lets you pick two saved versions of a `.vi`, `.ctl`, or `.vit`
file from Git, confirms your comparison runtime is ready, and generates a
visual LabVIEW comparison report you can read and share.

![Right-clicking a VI, selecting two revisions, and generating a comparison report.](https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/media/compare-flow.gif)

## Requirements

- Visual Studio Code 1.90 or newer.
- A trusted Git repository containing the tracked `.vi`, `.ctl`, or `.vit` file
  you want to review, with at least two saved versions to compare.
- A LabVIEW comparison runtime, either:
  - **Host** — LabVIEW 2025 or newer installed on your machine with the LabVIEW
    CLI (Windows uses this by default), or
  - **Docker** — an NI LabVIEW container image that you select.

The extension only reads your runtime — it never installs LabVIEW, Docker, or
any other tool for you.

## Install

Install from the VS Code Extensions view, or run:

```bash
code --install-extension svelderrainruiz.vi-history-suite
```

## Set up your comparison runtime

Run **VI History: Set Up Comparison Runtime** from the Command Palette, then in
a terminal run:

```bash
vihs
vihs --validate
```

`vihs` lets you choose where comparisons run and confirms the runtime is ready:

- **Host** uses the LabVIEW already installed on your machine (the default on
  Windows). Most people use this.
- **Docker** uses an NI LabVIEW container image instead — choose this if you
  prefer an isolated runtime.

You can change the provider any time with **VI History: Runtime & Report
Settings**.

![Choosing the comparison runtime provider and LabVIEW image version.](https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/media/runtime-settings.gif)

## Compare two revisions

1. Open a trusted Git repository that contains the `.vi`, `.ctl`, or `.vit`
   file you want to review.
2. Right-click that file and choose **Review VI History** (or use the editor
   title action). VI History looks at just that file instead of scanning every
   VI in the repository.
3. Select exactly two saved versions using the checkboxes.
4. Review the compare preflight.
5. Choose **Compare**.

![Right-clicking a VI, picking two revisions, reviewing the preflight, and clicking Compare.](https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/media/compare-steps.gif)

## Read and export the report

The report opens as a single self-contained page showing the differences
between the two versions, with the difference images embedded inline. Use
**Export Comparison Report (HTML)** to save a copy you can share.

![Viewing the comparison report and exporting it to HTML.](https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/media/report-export.gif)

## Runtime safety checks

Before each comparison, VI History checks both selected versions and your
runtime, then shows a clear status instead of failing partway through. When the
runtime cannot safely produce a correct report, the comparison is blocked up
front with guidance. Checks include:

- A running LabVIEW whose **bitness** (32- or 64-bit) does not match your
  selection — LabVIEW cannot start a second copy at a different bitness.
- A running LabVIEW whose **year** does not match your selection, so a
  comparison never attaches to the wrong LabVIEW on a machine with several
  installed.
- A selected Docker **image** your Docker engine cannot run, with a one-click
  **Pick Image Version** fix.
- **VI Server (TCP)** turned off in the selected LabVIEW, which would stop the
  LabVIEW CLI from connecting.

Each block offers a next step (such as **Pick Runtime Provider** or **Pick
Image Version**) so you can fix the runtime without leaving the panel.

## Use with Copilot agent mode

VI History Suite also exposes its comparison and history analysis to AI agents
through a built-in [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server. When the extension is installed, Copilot **agent mode** discovers
the server automatically — there is nothing to configure.

Ask agent mode to work with your VIs in plain language, for example:

- "Summarize what changed in this VI comparison report."
- "Compare the last two revisions of `Main.vi` and tell me what changed."
- "Index the LabVIEW VIs in this repository, ranked by recent activity."

The server provides seven tools in total: comparison summaries and the full
semantic model, on-demand comparison and history across Git revisions, a
repository VI index, and the published VI-diff schemas plus a document
validator. The two tools that compare revisions need a comparison runtime (the
same host LabVIEW or Docker image you set up above) and may take a few minutes;
the rest use Git only.

For the full tool catalog, inputs, and the open VI-diff schemas, see
[docs/mcp-server.md](./docs/mcp-server.md). Agent mode requires VS Code 1.101 or
later.

## Help and feedback

- Trouble getting started? See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and
  [FIRST-RUN.md](./FIRST-RUN.md).
- Questions or support: [SUPPORT.md](./SUPPORT.md).
- Reporting a security issue: [SECURITY.md](./SECURITY.md).
- First-time feedback (install surface, VS Code version, first action, and any
  stale link): the
  [onboarding tracker](https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12).

## Contribute

VI History Suite is open source under BSD0 / `0BSD`, and contributions are
welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) to set up the source and
[docs/development.md](./docs/development.md) for the development loop.

Source: https://github.com/LabVIEW-Community-CI-CD/vi-history-suite (Marketplace
ID `svelderrainruiz.vi-history-suite`).
