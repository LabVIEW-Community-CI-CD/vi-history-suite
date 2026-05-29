---
name: onboarding
description: 'Onboard contributors and agents to vi-history-suite quickly. Use when setting up a dev environment, doing first-run validation, or collecting onboarding feedback.'
argument-hint: 'Optional context: installed-extension, source-evaluation, troubleshooting'
---

# Onboarding

## When To Use
- First session in this repository.
- Environment setup or first-run validation.
- Clarifying where key docs and commands live.

## Quick Start (Source Evaluation)
1. `npm install`
2. `npm run compile`
3. `npm run check`
4. `npm run customization:audit`
5. `npm test`
6. `npm run package`

If you are in a devcontainer or Codespace, run `F5` with `Run VI History Suite` after `postStartCommand` completes.

## Customization Drift Check
- If your change touches `AGENTS.md`, `.github/skills/**`, `.github/prompts/**`, `.github/instructions/**`, or `.github/agents/**`, run `npm run customization:audit` before handoff.
- Include `npm run customization:audit` in PR validation commands when customization surfaces changed.
- Use `.github/prompts/pr-handoff-evidence.prompt.md` to keep the PR evidence block labels aligned.

## Installed Extension First-Run
1. Run `VI History: Prepare Local Runtime Settings CLI`.
2. Run `vihs`.
3. Choose provider, LabVIEW year, and bitness.
4. Run `vihs --validate`.

## What To Capture In Feedback
- Environment used (Codespaces, Dev Container, local clone, Marketplace install).
- First command or launch step that failed.
- First unclear instruction, stale link, or blocked step.

## References
- [README.md](../../../README.md)
- [INSTALL.md](../../../INSTALL.md)
- [FIRST-RUN.md](../../../FIRST-RUN.md)
- [docs/development.md](../../../docs/development.md)
- [docs/vagrant.md](../../../docs/vagrant.md)
- [CONTRIBUTING.md](../../../CONTRIBUTING.md)
- [TROUBLESHOOTING.md](../../../TROUBLESHOOTING.md)
