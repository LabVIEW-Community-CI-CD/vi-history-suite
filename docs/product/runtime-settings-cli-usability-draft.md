# Runtime Settings CLI Usability Draft

## Purpose

Draft usability requirements for the VI History runtime-settings CLI so the
terminal experience matches the product reality that users may open and work in
any Git repo, not only the `vi-history-suite` authority repo.

This file is a standards-guided draft iteration surface. It is not yet the
formal SRS, RTM, or test-plan authority surface, but this draft is now
finalized as the promotion input for those governed surfaces.

## Draft Posture

- promotion target: `docs/requirements/srs.md` plus RTM and test-plan updates
- document role: product usability draft for the generated runtime-settings CLI
- current governed touchpoints:
  - `VHS-REQ-536`
  - `VHS-REQ-537`
  - `VHS-REQ-542`
  - `VHS-REQ-543`
  - `VHS-REQ-544`
  - `VHS-REQ-546`
  - `VHS-REQ-550`

## Stakeholders And Concerns

| Stakeholder | Primary concern |
| --- | --- |
| Installed extension user | invoke the CLI from any repo shell without learning hidden storage paths or machine-specific implementation details |
| Maintainer or proof operator | keep bootstrap, refresh, and diagnostics bounded while preserving the current host-default plus expert-Docker contract |
| Documentation owner | give users one help and recovery surface that is truthful, copy-pasteable, and aligned to the active product contract |

This draft keeps stakeholders, concerns, and rationale explicit so the later
entrypoint decision can be promoted cleanly into governed requirements and
architecture rationale. See `Std 42010 §5.2.3`, `Std 42010 §5.2.4`, and
`Std 42010 §6.10`.

## Standards Posture

- Candidate requirements are written as individually identifiable `shall`
  statements with fit criteria and planned verification intent. See
  `Std 29148 §5.2.5`.
- If one candidate expands into multiple independently testable behaviors
  during promotion, it should be split into multiple governed `VHS-REQ-*`
  rows instead of preserved as a conjunction-heavy requirement. See
  `Std 29148 §5.2.7 Note 1`.
- The user-facing help, recovery, and usability objective surfaces should stay
  explicit in both the CLI and the promoted user-information package. See
  `Std 26514 §6.1.3` and `Std 26514 §6.1.7`.

## Observed Repo Evidence

| ID | Observation | Repo evidence |
| --- | --- | --- |
| OBS-CLI-001 | The current installed-user docs already define a prepare surface that materializes the launcher under extension-global storage. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md` |
| OBS-CLI-002 | The current installed-user docs already define the write surface for provider, version, and bitness, with the default target at user `settings.json` and workspace settings out of scope. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; `docs/requirements/srs.md` (`VHS-REQ-537`, `VHS-REQ-543`) |
| OBS-CLI-003 | The current installed-user docs already define `--validate` as the governed readback and runtime-validation surface. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; `docs/requirements/srs.md` (`VHS-REQ-546`) |
| OBS-CLI-004 | The current docs and test-plan surfaces already keep the live-session conditional stale-result guidance explicit after CLI updates. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; `docs/testing/test-plan.md`; `docs/requirements/srs.md` (`VHS-REQ-542`) |
| OBS-CLI-005 | The current requirement, RTM, and test-plan surfaces already govern launcher runtime dependency failure and Windows mixed-bitness host validation. | `docs/requirements/srs.md` (`VHS-REQ-544`, `VHS-REQ-550`); `docs/requirements/rtm.csv`; `docs/testing/test-plan.md` |
| OBS-CLI-006 | The reviewed installed-user docs already provide a doc-driven support surface for command inventory, target rules, validation usage, and recovery guidance. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md` |
| OBS-CLI-007 | In the reviewed installed-user docs, no dedicated `where` command or CLI help subcommand is yet explicit as a governed user-facing surface. | Missing proof in `docs/information-for-users/command-reference.md` and `docs/information-for-users/faq.md` |

## Decision Pass

### Observations

- The repo already retains a doc-driven help surface through
  `docs/information-for-users/command-reference.md` and `faq.md`; current proof
  does not require a CLI help subcommand.
- The prepare surface already reports the governed materialization root, so the
  repo has a bootstrap-linked launcher-discovery path even though no dedicated
  `where`-equivalent command is documented today.
- The current governed `--validate` surface already reports persisted
  provider/version/bitness facts plus runtime-validation outcome, so splitting
  readback into a second standalone command would widen the surface beyond
  current proof.

### Decisions

| Decision | Chosen direction | Standards basis |
| --- | --- | --- |
| Help surface | Keep help doc-driven for now. Do not add a draft requirement that assumes a governed CLI help subcommand before repo evidence exists. | `Std 26514 §6.1.3`; `Std 26514 §6.1.7` |
| Launcher discovery | Keep launcher discovery on bootstrap output for now. Do not add a dedicated `where`-equivalent command requirement as the default next move. | `Std 29148 §5.2.5`; `Std 26514 §6.1.3` |
| Readback vs validation | Keep persisted-state readback inside the governed validation surface instead of splitting readback and validation into separate installed-user commands. | `Std 29148 §5.2.5`; `Std 29148 §5.2.7 Note 1`; `Std 26514 §6.1.7` |

### Deferred Uplift

- dedicated CLI help subcommand
- dedicated `where`-equivalent launcher-discovery command
- separate readback-only command distinct from `--validate`

## Finalization Decisions

| Question | Final decision | Repo basis |
| --- | --- | --- |
| Should no `PATH` mutation remain a hard rule? | Yes. Keep no-`PATH` as the current governed installed-user rule. | `VHS-REQ-537`; `docs/information-for-users/command-reference.md`; `TEST-UNIT-345`; `TEST-INTEG-009` |
| Should the command remain `vihs-runtime-settings` or move to a broader CLI shape? | Keep `vihs-runtime-settings` as the current governed installed-user CLI shape. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; missing proof for a broader governed CLI family |
| Should bootstrap remain VS Code-command-driven or gain a terminal-native prepare/install path? | Keep bootstrap anchored to `VI History: Prepare Local Runtime Settings CLI` for the current governed contract. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; `TEST-UNIT-353`; missing proof for a terminal-native prepare/install surface |
| Should user settings remain the only default target? | Yes. Keep user `settings.json` as the default target, with one explicit `--settings-file` override as the advanced path. | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; `VHS-REQ-543` |

## Finalization Outcome

- This draft is finalized as a standards-guided draft surface.
- The remaining decisions are now resolved to current repo truth rather than
  left as open design questions.
- The next step is promotion into governed SRS, RTM, test-plan, and
  information-for-users surfaces rather than more draft iteration.
- Any future reopening should happen only if new repo evidence contradicts the
  current governed contract or if the product intentionally changes direction.

## Current Observed Seam

Current documentation truth says:

- `vihs-runtime-settings` is generated on demand through `VI History: Prepare
  Local Runtime Settings CLI`
- the launcher is materialized under VS Code extension-global storage in the
  user profile
- the design does not rely on `PATH` mutation or a prebuilt VSIX-shipped CLI
  payload

That shape creates one recurring usability failure:

- a user types `vihs-runtime-settings ...` from an arbitrary repo shell and the
  shell fails before product guidance can run because the launcher is not
  shell-discoverable by default

Related draft boundary:

- the reviewed repo evidence supports doc-driven help, `prepare`, write, and
  `--validate`, but does not yet show a dedicated installed-user `where` or CLI
  help surface, so those remain deferred uplift rather than current proof

## Product Truth To Preserve While Iterating

These constraints should remain stable while the entrypoint model is revised:

- VI History is used across arbitrary repos, not only the authority repo
- the active private-release route is Windows-only, LabVIEW `2026`, `x64`
- provider selection remains two-state: `host` or `docker`
- Docker remains a bounded expert path, not the default
- admin elevation is undesirable
- hidden implementation storage paths should not be part of the normal user
  mental model
- public and bundled installed-user truth must remain separate from unreleased
  private control-plane details until the publication gate closes

## Candidate Usability Requirements

| ID | Requirement | Rationale | Fit Criterion | Planned verification |
| --- | --- | --- | --- | --- |
| CLI-UX-001 | After one bounded user-level bootstrap, the runtime-settings CLI shall be callable from any working directory without requiring the user to know the VS Code extension-global storage path. | Users operate across arbitrary repos, and hidden storage paths are implementation detail rather than product doctrine. | The same command works from `vi-history-suite`, `actor-framework`, and an unrelated repo checkout without manually typing a path under `%APPDATA%\\Code\\User\\globalStorage\\...`. | Windows integration test and documentation review |
| CLI-UX-002 | The product shall expose one stable bootstrap surface that prepares the terminal-usable runtime-settings CLI and returns the exact command the user can run next. | First-use bootstrap and stale-launcher refresh should be deterministic, copy-pasteable, and safe to rerun. | Bootstrap returns the launcher path plus one exact next command, and rerunning the bootstrap refreshes or confirms the launcher without destructive side effects. | Integration test and retained CLI transcript review |
| CLI-UX-003 | The installed-user support package shall retain one governed doc-driven help surface for the runtime-settings CLI that explains the supported command inventory, target rules, and first-step recovery path. | User information should support task completion and recovery without forcing hidden-path reconstruction or ad hoc shell experimentation. | The command reference or FAQ identifies the supported command inventory, target rules, and first recovery step when command resolution fails. | Documentation review |
| CLI-UX-004 | Every mutating runtime-settings invocation shall make the target settings file explicit so users do not mistake a user-settings change for a repo-local or workspace-local change. | Scope ambiguity is a user-hostile seam for configuration mutation. | Command output names the target settings file, labels the default target as user scope, and rejects unsupported workspace targets with direct explanation. | Unit and integration tests |
| CLI-UX-005 | The runtime-settings CLI shall keep persisted-state readback on the governed validation surface so users can see persisted provider, version, and bitness plus runtime-validation outcome without mutating settings. | Users need one bounded readback-and-validation path before trusting compare preflight or runtime-doctor outcomes. | `--validate` returns persisted provider, version, and bitness facts plus runtime-validation outcome from the default target or an explicit `--settings-file` override without rewriting settings. | Unit and integration tests |
| CLI-UX-006 | The bootstrap surface shall report the launcher materialization root or exact launcher path plus the supported refresh action. | Shell-resolution failures are harder to recover from when launcher location remains implicit, but current repo evidence already centers discovery on bootstrap output. | The prepare result reports the launcher path or materialization root and names the supported refresh path when the launcher is stale. | Integration test and documentation review |
| CLI-UX-007 | When the runtime-settings CLI or its launcher is missing, stale, or not resolvable, the product shall fail with one direct corrective action instead of forcing the user to reconstruct the hidden launcher model from documentation. | Recovery should be faster than rediscovering the implementation model. | Missing or stale launcher output states exactly how to refresh, and the recovery text is short enough to copy verbatim into a shell session. | Integration test and documentation review |
| CLI-UX-008 | The runtime-settings CLI shall behave consistently regardless of the repo the user is currently in, unless a command explicitly requires the `vi-history-suite` authority repo. | The product is intentionally repo-agnostic, and the CLI should preserve that posture unless a command is deliberately narrower. | Provider, version, and bitness seeding behave the same in arbitrary repos, and any repo-sensitive command declares that restriction before it runs. | Integration test |
| CLI-UX-009 | The runtime-settings CLI shall remain installable and refreshable at user scope without requiring admin elevation. | Normal use should not depend on machine-wide rights or privileged install paths. | Bootstrap succeeds under a standard user account, and repair flows stay inside user-owned locations unless the user explicitly opts into a broader install model. | Integration test and code review |
| CLI-UX-010 | For the current private-release route, the doc-driven help surface and the governed validation output shall state the supported runtime contract plainly: Windows only, LabVIEW `2026`, `x64`, native Windows host for `host`, and Docker Desktop in Windows-container mode for `docker`. | The active private-release truth should remain explicit so validation and recovery guidance do not overclaim unsupported environments. | The doc-driven help surface and validation output name the current Windows-only scope, and WSL or Linux-hosted assumptions are rejected with direct wording for this route. | Validation test and documentation review |
| CLI-UX-011 | The CLI shall provide machine-readable runtime-validation output that reports persisted configuration, validation outcome, runtime engine, and blocked reason without reopening path-picking or panel-side provider selection. | Automation and retained proof receipts need a stable structured validation surface rather than terminal prose alone. | A supported validation surface emits machine-readable fields for persisted provider, version, bitness, runtime-validation outcome, runtime engine, and blocked reason when applicable. | Unit and integration tests |

## Existing Governed Touchpoints

This draft should promote into the existing requirements package without
creating a parallel doctrine surface:

| Draft candidate | Existing governed touchpoints | Promotion note |
| --- | --- | --- |
| `CLI-UX-001`, `CLI-UX-002`, `CLI-UX-008` | `VHS-REQ-537`, `VHS-REQ-544` | tighten the bootstrap and launcher-runtime contract without reopening machine-wide install doctrine |
| `CLI-UX-003` | `docs/information-for-users/command-reference.md`; `docs/information-for-users/faq.md`; `TEST-DOC-106`; `TEST-DOC-107` | keep this as a doc-package help decision for now rather than a next SRS row |
| `CLI-UX-004` | `VHS-REQ-543` | keep mutation scope explicit and JSONC-safe without widening into arbitrary settings editing |
| `CLI-UX-005`, `CLI-UX-011` | `VHS-REQ-546`; `TEST-UNIT-354`; `TEST-INTEG-011` | strengthen the single validation surface instead of splitting readback and validation into separate commands |
| `CLI-UX-006`, `CLI-UX-007`, `CLI-UX-009` | `VHS-REQ-537`; `VHS-REQ-544`; `TEST-UNIT-353`; `TEST-UNIT-352`; `TEST-INTEG-010`; `TEST-DOC-107` | keep launcher discovery and recovery attached to the existing bootstrap and launcher-runtime contract |
| `CLI-UX-008`, `CLI-UX-010` | `VHS-REQ-536`; `VHS-REQ-550`; `TEST-DOC-110` | preserve host-default plus expert-Docker truth and current Windows-only private-release bounds |

## Promotion Notes

- Promote accepted candidates into `docs/requirements/srs.md` as individually
  verifiable `VHS-REQ-*` rows.
- Keep help doc-driven for now. Do not promote a new CLI help subcommand
  requirement until repo evidence shows a governed help command surface.
- Keep launcher discovery on bootstrap output for now. Do not promote a new
  dedicated `where`-equivalent command requirement as the next move.
- Keep persisted-state readback inside `--validate`. If this draft is promoted,
  refine `VHS-REQ-546` rather than splitting readback and validation into two
  installed-user commands.
- Add RTM rows so each promoted requirement traces to one or more unit,
  integration, or documentation-review checks.
- Keep the current released Docker-only public truth separate from the active
  develop-line private-release truth until the runtime-provider publication gate
  closes.
- Do not leak extension-global storage internals into bundled or public
  installed-user guidance unless that path becomes the intentional user-facing
  entry contract.

## Promotion Order

1. refine the existing governed `VHS-REQ-*` rows that already cover the current
   CLI contract instead of inventing a parallel requirement family
2. update RTM rows and test-plan anchors so the promoted wording stays
   traceable to the current unit, integration, and documentation-review checks
3. realign the information-for-users package to this finalized draft wording
   without widening the installed-user command inventory
4. run the governed validation steps only when promotion moves into the actual
   governed SRS, RTM, and test-plan surfaces
