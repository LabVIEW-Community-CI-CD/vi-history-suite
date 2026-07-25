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

**Handshake bus:** coordinate through the GitHub **Discussion** thread
**#2365** — <https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/discussions/2365>.
The branch carries the *artifacts* (commits); the Discussion carries the
*coordination* (claims, acks, progress, done, handoffs). Use the executable
protocol helper `prototype/collab.mjs` (details below) so every message is both
human-readable and machine-parseable — never edit a shared file without first
claiming it on the bus and seeing no live conflicting claim.

---

## FIRST ACTION — kickoff check-in (do this before anything else)

The operator starts you with a **single word**. On that trigger, do **exactly
this and nothing else**:

```bash
export VIHS_COLLAB_AGENT=LINUX
export VIHS_MCP_REPO="$HOME/repos/labview-icon-editor"   # your Linux corpus path
git switch prototype/ollama-mcp-linux-collab && git pull --rebase
node prototype/collab.mjs checkin
```

`checkin` probes your environment — branch + in-sync-with-origin, `npm` + built
`out/`, Docker **Linux** engine + the `2026q1patch2-linux` image, Ollama + the
`llama3.1:8b` model, the corpus repo + PR #537 base/head commits, and `gh` auth —
and posts a **READY** (all green) or **BLOCKED** (with the exact remedy for each
gap) message to Discussion #2365. **Then STOP and wait. Do not run any validators
yet.**

The Windows agent polls the thread, reads your `checks`, and replies with one of:

- **AUTHORIZE** (task `kickoff`, `to: LINUX`) → you are cleared. Proceed to *Run
  the Linux-native validators* below.
- **REFINE** (carries a `ref` SHA) → the Windows agent pushed a flow refinement.
  Run `git pull --rebase`, then `node prototype/collab.mjs checkin` again, and wait
  once more.

Watch for the decision with `node prototype/collab.mjs poll --type AUTHORIZE` and
`--type REFINE`. If your own check-in was **BLOCKED**, fix the listed blockers
(the Set-up section has every command), then re-run `checkin` — you don't need to
wait for the Windows agent to clear an environment gap you can fix yourself.

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
gh auth status || gh auth login                # REQUIRED for the Discussions handshake bus
node prototype/collab.mjs poll                 # read the handshake thread before doing anything

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

**Two channels, one loop.** The Discussion thread **#2365** is the *handshake +
status bus*; the branch is the *artifact channel*. Identify yourself with
`export VIHS_COLLAB_AGENT=LINUX` (the Windows side uses `WIN`).

The `prototype/collab.mjs` helper wraps the Discussions GraphQL API. Every
message is a Discussion comment that is both prose and a fenced
`vihs-collab-msg@v1` JSON block (fields: `agent`, `type`, `task`, `ts`, `ref`,
`msg`, `next`, `to`, `checks`). Message types: `READY`, `AUTHORIZE`, `REFINE`,
`CLAIM`, `ACK`, `PROGRESS`, `DONE`, `BLOCKED`, `HANDOFF`, `QUESTION`, `ANSWER`,
`NOTE` (the Windows agent sends `AUTHORIZE`/`REFINE`; you send `READY`/`BLOCKED`
via `checkin`, then `PROGRESS`/`DONE`/`HANDOFF`).

```bash
export VIHS_COLLAB_AGENT=LINUX
node prototype/collab.mjs checkin                      # kickoff readiness probe -> READY/BLOCKED (your FIRST action)
node prototype/collab.mjs poll                         # read recent handshake messages
node prototype/collab.mjs claim --task <id> --msg "…"  # advisory lock; warns on a live conflicting claim
node prototype/collab.mjs ack   --task <id>            # acknowledge the other agent's claim/handoff
node prototype/collab.mjs post  --type PROGRESS --task <id> --msg "…"
node prototype/collab.mjs done  --task <id> --ref <pushed-sha> --msg "…" --next "…"
node prototype/collab.mjs handoff --to WIN --task <id> --ref <sha> --msg "…"
```

**The loop for every unit of work:**

1. `git pull --rebase` and `node prototype/collab.mjs poll` — see what WIN is doing.
2. `node prototype/collab.mjs claim --task <id>` — if it reports a CONFLICT (WIN
   holds a live claim on that task), pick different work or resolve it on the bus
   (`ack`/`handoff`) first. Otherwise proceed.
3. Do the work; drop a `PROGRESS` message for anything long-running.
4. `git push origin prototype/ollama-mcp-linux-collab` (rebase + retry if rejected;
   **never** force-push), then `node prototype/collab.mjs done --task <id> --ref <sha>`.
5. `handoff --to WIN` when you want the Windows side to pick up the next step.

**Commit hygiene:** small commits, messages prefixed `linux:` so WIN can scan the
log (e.g., `linux: mcp:pr-review runs in 2026q1patch2-linux container`). Do **not**
open a PR; do **not** touch `develop`/`main`.

---

## Safety

- The worktree/Ollama drivers create a **reversible** uncommitted edit (overwriting
  one VI with another revision's bytes) and **always restore** the working tree in a
  `finally` block; they refuse to start if the target VI is already dirty. Operator
  mode (`VIHS_MCP_ALT=none`) never mutates the working tree.
- Don't commit the ~5 GB Docker image, the `labview-icon-editor` corpus, or `/tmp`
  evidence JSON into the repo. Commit only source (`scripts/`, docs) and notes.

---

## Report back (on the handshake bus + a commit on this branch)

When you finish a unit of work: push the commit, then
`node prototype/collab.mjs done --task <id> --ref <sha> --msg "…" --next "…"`.
Use the bus for the running narrative (which validators passed on Linux, timings
vs Windows, whether the comparison model hash matched, Linux-specific fixes,
blockers via `BLOCKED`, and the next iteration you recommend). For longer-form
findings you may also append to `prototype/COLLAB-NOTES.md` and commit, but the
Discussion thread is the source of truth for coordination. Finish a session with a
`handoff --to WIN` (or a `NOTE` summarizing state) so the Windows side knows the
baton is free.
