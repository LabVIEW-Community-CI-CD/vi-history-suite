# ADR-0026: Consumer Copilot Cloud-Agent MCP Enablement

- Status: Accepted
- Date: 2026-07-21

<!--
Promotion note: this decision is captured as active requirement VHS-REQ-705
(Consumer Copilot Cloud-Agent MCP Enablement, parent VHS-SYS-REQ-013). The text
below is the design record behind that requirement.
-->

## Context

The shipped VI semantic-comparison MCP server (`out/cli/runViSemanticMcpServer.js`,
VHS-REQ-662) is already discoverable by VS Code so a local Copilot agent can use
its tools. The Semantic Diff Intelligence bet wants to extend that reach so a
**consumer LabVIEW repository's GitHub Copilot cloud (coding) agent** can launch
the same MCP server and use its live tools (`compare_vi_revisions`,
`build_vi_pr_review`) while working issues and PRs autonomously.

The cloud agent imposes constraints the local path does not:

- It runs behind an **integrated firewall**, so all network-heavy preparation
  (cloning vi-history-suite, `npm ci` to build `out/`, and the multi-GB
  `docker pull` of the NI LabVIEW image) must happen in a
  `.github/workflows/copilot-setup-steps.yml` job — which GitHub runs before the
  agent starts and before the firewall applies — in a single job named exactly
  `copilot-setup-steps` on an Ubuntu x64 runner within 59 minutes.
- Its MCP configuration is a **JSON blob entered in repo Settings → Copilot →
  coding agent → MCP servers**, not a committed file, and the cloud agent
  supports MCP **tools only** (not resources or prompts). Secrets must be
  `COPILOT_MCP_`-prefixed Agents secrets.

The live comparison tools need a real NI LabVIEW runtime, so a consumer that
cannot run Docker or pull the image must find out at setup time, not mid-task.

## Decision

Ship the consumer enablement as **documentation-only artifacts in this
repository** (phase P-A of #2258), deferring the apply-to-a-repo (P-B) and
live-agent proof (P-C) phases:

- A copy-in `docs/consumer-workflows/copilot-setup-steps.yml` template that
  clones vi-history-suite at a **pinned ref**, builds `out/` via the same
  `npm ci` + `npm run compile` path CI uses, validates Docker and pre-pulls the
  canonical `nationalinstruments/labview:<version>-linux` image (kept in lockstep
  with `DEFAULT_LINUX_CONTAINER_IMAGE`), and prepares a container-visible
  `TMPDIR` under `$HOME`.
- A `docs/consumer-workflows/copilot-cloud-agent-mcp-runbook.md` runbook giving
  the exact repo-settings `mcpServers` JSON (a `local`/stdio server launching the
  built entrypoint, a tools allowlist, tools-only, `COPILOT_MCP_` secrets).
- A contract test (`tests/unit/copilotSetupStepsTemplate.test.ts`) pinning the
  template and runbook invariants.

**Fail loud, no silent degrade**: the setup step exits non-zero when Docker, the
daemon, or the NI image is unavailable, and when the MCP entrypoint is not built.
We explicitly reject a read-only fallback that would let the agent start without
a working comparison runtime, because that hides the failure until a tool call
errors deep in an autonomous run.

## Consequences

- A consumer repo gets a reviewed, reproducible toolset (pinned ref + stable
  `out/` path) instead of a moving `develop`, and a single documented place to
  register it.
- The template and the runbook's MCP JSON are coupled by the `VIHS_HOME` path;
  the contract test and requirement Change Guidance keep them consistent.
- Feasibility unknowns remain for P-C (does the pre-pulled image persist into the
  agent work phase; runner disk/time for a multi-GB image; whether the
  repo-settings JSON is API-settable; nested/privileged Docker). These are
  settled by the later phases on #2258, not by this repository's artifacts.
- Superseded ADRs: none.

Requirements: VHS-SYS-REQ-013; VHS-REQ-705.
