# Linux collaboration prompt — Ollama × VI-History MCP × Docker Linux containers

> Copy **this entire file** into a fresh agent session on the Linux machine. It is
> self-contained: it carries all the context an autonomous coding agent needs to
> continue the Windows↔Linux collaboration on the shared prototype branch. No
> prior chat history is required.

---

## Your mission

You are an autonomous coding agent on a **Linux** workstation, collaborating with a
Windows machine on the shared branch **`prototype/ollama-mcp-linux-collab`** of the
repo **`LabVIEW-Community-CI-CD/vi-history-suite`**. The two machines communicate
**only through this branch on the remote** (push/pull commits). The end goal is an
**on-demand local operator-review workflow**: a local **Ollama** LLM drives the
shipped VI-History **MCP server** to review a LabVIEW VI a human is *currently
editing* (the **uncommitted working tree** as the head) against a **real LabVIEW
comparison running in a Docker Linux container** (`nationalinstruments/labview:2026q1patch2-linux`).

The real production target is a Linux host that can **only** use **Docker Linux
containers and Vagrant** (no Windows containers, no host-native LabVIEW). Your job
is to prove and harden that workflow natively on Linux, and to iterate on the parts
that were built/validated on Windows but need Linux parity.

Work as a **prototype**: iterate with throwaway drivers in a temp dir first, promote
proven ones into `scripts/*.mjs`/`*.cjs` (these are coverage/inventory-exempt), and
communicate progress back to the Windows machine via commits on this branch.

**Hard rules:** Do **NOT** open a pull request. Do **NOT** push to or modify
`develop`/`main`. Only push to `prototype/ollama-mcp-linux-collab`. **Never
force-push** this shared branch — always `git pull --rebase` first.

---

## What already exists on this branch (built + validated on Windows)

Commit stack on top of `develop` (read the commit messages for detail):

1. `fix(perfmon)` — logman emits a single `-c` with all counter paths (real-logman bug fix).
2. `chore(perfmon)` — host-native perfmon↔LabVIEW-launch correlation e2e validator (Windows).
3. `chore(perfmon)` — containerized perfmon correlation e2e validator (Windows container).
4. `chore(mcp)` — MCP server end-to-end validator over a Windows LabVIEW container.
5. `chore(mcp)` — MCP PR-review e2e over a real change surface (ni/labview-icon-editor PR #537, Windows container).
6. `chore(mcp)` — MCP **linux-container** worktree-head e2e validator (`selectedHash="WORKTREE"`).
7. `chore(mcp)` — local **Ollama → MCP operator-review bridge** (Linux container).

Relevant npm scripts (see `package.json`):

| Script | What it does | Runs on Linux? |
| --- | --- | --- |
| `npm run mcp:worktree:e2e` | MCP `compare_vi_revisions(base=HEAD, selected=WORKTREE)` in the **linux** container | **Yes (native)** |
| `npm run mcp:ollama:review` | Ollama LLM drives the MCP to review an uncommitted edit via the **linux** container | **Yes (native)** |
| `npm run mcp:container:e2e` | Broad MCP surface over a container | Windows-only preflight today |
| `npm run mcp:pr-review:e2e` | `build_vi_pr_review` over a container (PR #537) | Windows-only preflight today |
| `npm run perfmon:labview:e2e`, `perfmon:labview:container:e2e` | perfmon correlation | Windows-only (`logman`) |

Key shipped facts the drivers rely on:

- **MCP server entry:** `out/cli/runViSemanticMcpServer.js` (stdio, newline JSON-RPC). Driven with `@modelcontextprotocol/sdk` (already a dependency).
- **Worktree head:** pass `selectedHash: "WORKTREE"` to `compare_vi_revisions` — the pipeline materializes the HEAD dependency tree plus the **on-disk uncommitted VI bytes** (VHS-REQ-641).
- **Runtime steering:** pass `runtime: { provider: "docker", platform: "linux", bitness: "x64", containerImageVersion: "2026q1patch2-linux" }`. On Linux, `get_runtime_health` resolves provider `linux-container`.
- **AI-design pattern in the Ollama bridge:** the *model owns intent*, the *bridge owns environment + correctness* — it exposes slim intent-only tool specs, injects the runtime policy + `repositoryRoot`, **pins** the review frame to `HEAD → WORKTREE`, and compacts large tool outputs so the small model stays grounded.

---

## Set up the Linux environment

```bash
# 1. Repo + shared branch
git clone https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git
cd vi-history-suite
git fetch origin
git switch prototype/ollama-mcp-linux-collab   # the shared collaboration branch
git pull --rebase                              # ALWAYS before you start

# 2. Node deps + build (Node LTS required; see INSTALL.md)
npm ci
npm run compile                                # produces out/ (the drivers require it)

# 3. Docker (native Linux engine — no mode switch needed)
docker version --format '{{.Server.Os}}'       # expect: linux
docker pull nationalinstruments/labview:2026q1patch2-linux   # ~5 GB

# 4. Ollama + a tool-capable model
curl -fsSL https://ollama.com/install.sh | sh  # if not already installed
#   ensure the server is running (systemd `ollama.service`, or `ollama serve &`)
curl -s http://localhost:11434/api/version     # expect a version JSON
ollama pull llama3.1:8b                         # reliable tool-calling model (~4.9 GB)

# 5. A LabVIEW VI corpus repo with the PR #537 commits available
mkdir -p ~/repos && cd ~/repos
git clone https://github.com/ni/labview-icon-editor.git
cd labview-icon-editor
git fetch origin pull/537/head                  # base 9545c483…, head f57c3cfd…
git status --porcelain                          # confirm the tree is CLEAN
cd ~/vi-history-suite  # (or wherever you cloned vi-history-suite)
```

---

## Run the Linux-native validators (the proof)

Point the drivers at the Linux corpus path via `VIHS_MCP_REPO` (the drivers default
to a Windows path). All other defaults (base SHA, VI path, image tag) are portable.

```bash
export VIHS_MCP_REPO="$HOME/repos/labview-icon-editor"

# A. MCP worktree-head compare in the real linux container
VIHS_MCP_OUT=/tmp/wt-evidence.json npm run mcp:worktree:e2e

# B. Local Ollama drives the MCP to review the uncommitted edit (linux container)
VIHS_OLLAMA_OUT=/tmp/ollama-evidence.json npm run mcp:ollama:review
```

Expected (matches the Windows runs): `get_runtime_health` → `linux-container` /
`2026q1patch2-linux`, a real `compare_vi_revisions(HEAD→WORKTREE)` completing in
tens of seconds, `changedSurfaces: ["block-diagram"]`, `riskLevel: high`, the model
returning a **grounded** plain-language verdict, and the working tree restored clean.

Real operator mode (review *your own* uncommitted edit, no synthetic edit, working
tree untouched): edit a VI in the corpus, then:

```bash
VIHS_MCP_ALT=none VIHS_MCP_VI="<repo-relative-path-of-the-vi-you-edited>" npm run mcp:ollama:review
```

---

## Iterate (forward-thinking work for the Linux machine)

Prioritize these; commit each proven step to the branch:

1. **Confirm native-Linux behavior differs favorably** vs Windows: Linux runs the
   LabVIEW container natively (no WSL2 Windows-path bind-mount translation). Capture
   timings and the comparison model hash; note whether the model hash matches the
   Windows result for the same VI/bytes (determinism across hosts is a strong signal).
2. **Give the PR-review + MCP-container validators Linux parity.** Today
   `scripts/validateMcpPrReviewContainerE2E.mjs` and `scripts/validateMcpContainerE2E.mjs`
   preflight-require `server-os == windows` and hardcode `platform: 'win32'` +
   `2026q1patch2-windows`. Generalize them (mirror how
   `scripts/validateMcpLinuxWorktreeE2E.mjs` and `scripts/ollamaMcpOperatorReview.mjs`
   detect/target Linux) so `npm run mcp:pr-review:e2e` reviews PR #537 in the
   **linux** container. Prove it, then commit.
3. **Vagrant isolation.** The real target pairs Docker Linux containers with Vagrant.
   See `docs/vagrant.md`. Prototype running the Ollama-operator-review flow from
   inside a Vagrant-managed environment (or documenting the exact Vagrant provider +
   Docker-in-guest setup) so the workflow is reproducible on a clean Linux host.
4. **Harden the Ollama bridge for operator UX.** Ideas: stream the model's answer;
   let the operator name the VI in natural language (map it to a repo path); expose
   `summarize_vi_history` and `list_changed_vis` as additional slim tools; try a
   larger/smaller local model (`VIHS_OLLAMA_MODEL`) and record tool-calling
   reliability. Keep the "model owns intent, bridge owns environment" split.

Throwaway-first: prototype in `/tmp`, then promote proven drivers into
`scripts/*.mjs`/`*.cjs` (both extensions are coverage/inventory-exempt — the
traceability glob is only top-level `scripts/*.js`). Read `AGENTS.md` for the repo's
agent operating rules (note: the gate suite is for PRs; on this prototype branch,
`npm run compile` + the targeted validators are enough).

---

## Collaboration protocol (how the two machines talk)

- **Before any work:** `git switch prototype/ollama-mcp-linux-collab && git pull --rebase`.
- **Commit small and often** with descriptive messages — the commit log *is* the
  conversation. Prefix Linux-side commits with `linux:` so the Windows machine can
  scan them (e.g., `linux: mcp:pr-review runs in 2026q1patch2-linux container`).
- **Push to this branch only:** `git push origin prototype/ollama-mcp-linux-collab`.
- To leave freeform notes for the Windows machine, append to
  `prototype/COLLAB-NOTES.md` (create it) and commit — keep a running log there.
- **Never** `git push --force` this shared branch. If your push is rejected because
  the Windows machine pushed first, `git pull --rebase` and re-push.
- Do **not** open a PR; do **not** touch `develop`/`main`.

---

## Safety

- The worktree/Ollama drivers create a **reversible** uncommitted edit (overwriting
  one VI with another revision's bytes) and **always restore** the working tree in a
  `finally` block; they refuse to start if the target VI is already dirty. Operator
  mode (`VIHS_MCP_ALT=none`) never mutates the working tree.
- Don't commit the ~5 GB Docker image, the `labview-icon-editor` corpus, or `/tmp`
  evidence JSON into the repo. Commit only source (`scripts/`, docs) and notes.

---

## Report back (in a commit on this branch)

Add your findings to `prototype/COLLAB-NOTES.md`: which validators passed on Linux,
timings vs Windows, whether the comparison model hash matched, any Linux-specific
fixes you made, and the next iteration you recommend. Then push.
