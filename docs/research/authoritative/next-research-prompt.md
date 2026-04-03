# Next Research Prompt

Use this prompt to generate the next authoritative research packet for
`vi-history-suite`.

```md
Produce a new authoritative deep-research report for the `vi-history-suite`
repository.

Important constraints:

- Output clean Markdown only.
- Do not emit hidden citation tokens like `citeturn...`.
- Preserve tables and code blocks correctly.
- Separate source-backed statements, empirical artifact observations, and
  assumptions explicitly.
- Include a final “Direct Source List” section with plain URLs.
- Prefer official sources first, then clearly-labeled secondary sources only
  when official documentation is incomplete.
- When official documentation is silent about VI Comparison Report HTML
  structure or dashboard concentration behavior, clearly-labeled empirical
  analysis of real NI-generated report artifacts is allowed.
- Use the current date at generation time and state it explicitly.

Context:

- Product: a VS Code desktop/remote-host extension for reviewing Git-backed
  LabVIEW VI history by content detection.
- Existing implemented baseline already covers:
  - magic-byte detection at bytes 8..11 for `LVIN` / `LVCC`
  - menu gating with
    `resourcePath in labviewViHistory.eligiblePaths && isWorkspaceTrusted && gitOpenRepositoryCount >= 1`
  - Explorer and `editor/title/context` menu entry points
  - webview-based history viewer with open/diff/copy actions
  - Git-backed tracked-file eligibility and clone-on-demand real-history harness
- comparison-report preflight, storage, packet rendering, and host-native
  runtime proof lanes
- pair-archived report retention keyed by commit pair
- concentrated dashboard packets and dashboard HTML for one VI across at least
  three commits
- review-scenario and decision-record modeling
- canonical real-history and comparison-report smoke lanes
- governed requirements, ADRs, and a development queue
- The previously consumed unresolved-workstream research round has already been
  implemented or normalized into governed queue items. Do not restate basic
  compare-report storage, basic runtime detection, or basic trust-gating work
  except as short context.

Focus only on these future-facing unresolved workstreams:

1. Multi-report developer dashboard for expert LabVIEW review
- How to concentrate multiple VI Comparison Reports into one HTML without
  inventing semantic claims the product cannot prove.
- How to surface chronology, pair provenance, missing/blocked report facts,
  and drill-down navigation for at least three commits.
- How to recollect images, included attributes, and detailed sections from
  multiple NI reports into one first-class review dashboard.
- How to reduce reviewer wear when a VI has many changes in an open-source repo.

2. High-volume dashboard triage and prioritization cues
- Authoritative or clearly-labeled empirical guidance for ordering or grouping
  multiple report transitions so expert reviewers can focus quickly.
- How to provide concentration cues without hiding raw evidence.
- How to represent uncertainty, absence, or partial runtime coverage honestly.

3. Mixed-provider dashboard contribution
- How host-native x32 report evidence and future isolated Windows x64
  container-provider evidence should coexist in one dashboard packet.
- Provider provenance, artifact identity, blocked reasons, and chronology when
  more than one runtime/provider contributes reports.

4. Human decision-support model
- Best guidance for bounded review scenarios and separate human decision
  records tied to one VI and one commit window.
- How to keep the dashboard as a decision-support surface rather than an
  automated semantic judge.

5. Runtime doctor and developer experience
- Best guidance for explaining provider choice, engine choice, rejected
  alternatives, environment problems, and next actions from the extension UI.
- Progress UX for long-running report generation or dashboard refresh:
  - `window.withProgress` percent/items/ETA
  - discreet status bar presence
  - webview progress
  - cancellation and partial evidence retention

6. Packaging, release, and adoption for a dashboard-centric extension
- VSIX packaging and release evidence for a product whose main value is the
  concentrated review dashboard.
- CI/release guidance for retaining generated dashboard and comparison-report
  evidence as artifacts.

Required output structure:

1. Executive summary
2. Repo-state assumptions you are making
3. Decision matrix for unresolved workstreams
4. Dashboard information model and data-concentration strategy
5. Implementation guidance by workstream
6. Risks, ambiguities, and explicit assumptions
7. Acceptance criteria for each workstream
8. Direct Source List (plain URLs)

Do not spend space re-explaining already-consumed solved areas unless needed as
short context. Concentrate on the future-facing unresolved workstreams above.
```
