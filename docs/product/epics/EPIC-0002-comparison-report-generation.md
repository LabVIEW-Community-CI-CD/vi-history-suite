# EPIC-0002: Comparison Report Generation

## Outcome

Deliver a governed report-generation path from the `VI History` review surface:

- select two retained Git-backed VI revisions
- verify both revision blobs are VIs by content
- generate an HTML comparison report
- store and link the report safely from the webview

## Scope

- blob verification for both selected revisions
- same-name revision extraction to distinct temporary filenames
- report artifact naming with `{type}-report-{fullFilename}.html`
- workspace-scoped storage under `context.storageUri`
- report metadata retention
- webview-safe report linking with `asWebviewUri` and narrow `localResourceRoots`
- report progress and failure visibility

## Excluded From This Epic

- deep semantic interpretation of report contents
- Marketplace release automation
- non-HTML report formats as primary artifacts

## Exit Criteria

- report generation fails closed on non-VI blobs
- generated HTML reports use the mandated filename contract
- same-name revision pairs do not collide on disk
- report links appear only when HTML output exists
- report metadata and artifacts are retained under workspace storage

## Initial Child Slices

1. blob verification and preflight contract
2. report artifact storage and naming
3. webview report linking and existence gating
4. report progress and retained failure reporting
