# Copilot cloud-agent MCP runbook (consumer repo)

How to let a **GitHub Copilot cloud (coding) agent** in your LabVIEW repository
launch the shipped vi-history-suite VI semantic-comparison MCP server and use
its live tools (`compare_vi_revisions`, `build_vi_pr_review`) while it works
issues and PRs autonomously (VHS-REQ-705).

This is the P-A consumer documentation. Applying it to a specific repo (P-B) and
capturing a live cloud-agent run (P-C) are tracked separately in issue #2258.

## Prerequisites

- Write access to the consumer repository's Settings.
- The repository can run Docker on the Copilot coding-agent runner and pull the
  public NI LabVIEW image (`nationalinstruments/labview:2026q1-linux`).

## Step 1 — add the setup-steps workflow

Copy [`copilot-setup-steps.yml`](./copilot-setup-steps.yml) into the consumer
repo at `.github/workflows/copilot-setup-steps.yml` on the **default branch**.

That workflow runs BEFORE the agent starts (and before the agent firewall is
applied), so it does all network-heavy preparation:

- clones vi-history-suite at the pinned `VIHS_REF` and builds `out/` (`npm ci` +
  `npm run compile`), so `out/cli/runViSemanticMcpServer.js` exists at a stable
  absolute path (`$VIHS_HOME`);
- validates Docker and pre-pulls the NI LabVIEW image, **failing loudly** if the
  live comparison runtime cannot be made available (no silent read-only degrade);
- prepares a container-visible `TMPDIR` under `$HOME`.

You can run it manually from the **Actions** tab (`workflow_dispatch`) to verify
the preparation succeeds before assigning work to the agent.

## Step 2 — register the MCP server in repo settings

The cloud agent's MCP configuration is a **JSON blob entered in the repo UI**,
not a committed file:

**Settings → Copilot → coding agent → MCP servers**

Paste:

```json
{
  "mcpServers": {
    "vi-history-suite": {
      "type": "local",
      "command": "node",
      "args": [
        "${{ github.workspace }}/.vi-history-suite/out/cli/runViSemanticMcpServer.js"
      ],
      "tools": [
        "get_vi_semantic_comparison",
        "summarize_vi_comparison",
        "summarize_vi_history",
        "list_changed_vis",
        "compare_vi_revisions",
        "build_vi_pr_review",
        "get_runtime_health"
      ]
    }
  }
}
```

Notes:

- `type` is `local` (a.k.a. stdio): the agent launches the process and speaks
  newline-delimited JSON-RPC 2.0 over stdin/stdout. The server writes a ready
  banner and all diagnostics to stderr.
- The `args` path must match `$VIHS_HOME/out/cli/runViSemanticMcpServer.js` from
  the setup-steps workflow. If you changed `VIHS_HOME` there, change it here too.
- `tools` is an allowlist. `compare_vi_revisions` and `build_vi_pr_review` are
  the live tools that require the Docker + NI LabVIEW runtime prepared in
  step 1; the others operate on supplied report HTML or Git data.
- The cloud agent supports MCP **tools only** — it ignores the server's
  resources and prompts, so none are listed here.

## Step 3 — secrets (only if a tool needs one)

Any secret an MCP tool needs must be a repository Copilot **Agents** secret
whose name is prefixed `COPILOT_MCP_` (only those are exposed to the MCP
process). The VI semantic tools above need no secret to run a local comparison;
add `COPILOT_MCP_*` secrets and reference them under an `env` block in the MCP
JSON only if your workflow extends the tools to reach an authenticated service.

## Step 4 — assign work to the agent

Assign an issue (or request changes on a PR) to the Copilot coding agent. During
its run it can call the allowlisted tools — for example `build_vi_pr_review` to
produce a LabVIEW "what changed" review for the PR range, backed by a real
containerized comparison.

## Troubleshooting

- **The agent cannot launch the server**: confirm the setup-steps run built
  `out/` and that the `args` path matches `$VIHS_HOME`. The setup step fails
  loudly if `out/cli/runViSemanticMcpServer.js` was not produced.
- **A live tool errors about the runtime**: the NI image pull in step 1 must
  have succeeded; re-run the setup-steps workflow from the Actions tab and read
  its "Validate Docker and pre-pull" step log.
- **A comparison fails with "VI path invalid or does not exist"**: the
  container-visible `TMPDIR` was not honored; confirm the "Prepare a
  container-visible temp root" step ran and exported `TMPDIR`.
