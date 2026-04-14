# Information For Users Command Reference

Applies to: exact released installed baseline `v1.2.2` plus the active
`develop` authority direction
Last reviewed: `2026-04-13`
Primary audience: maintainers, source evaluators, and advanced installed users
Topic type: reference
Primary entry route: `README.md` or `INSTALL.md`

See also:

- [Plan](./plan.md)
- [FAQ](./faq.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [Release Procedure](../release-procedure.md)

## Quick-Reference Boundary

- This surface is a compact command and route locator.
- It is not a full user guide and it is not an API reference.
- Keep stable task walkthroughs in `README.md`, `INSTALL.md`,
  `docs/documentation-workbench.md`, `PROGRAM-0005`, or `ISSUE-0412`.
- Use the FAQ for short answers and reload guidance, then move stable doctrine
  back into the main governed surfaces.

## Public Evaluation And Installed Baseline

`npm run public:repo:clone`

- Purpose: clone a supported public GitHub or GitLab repo for source
  evaluation.
- Use when: you are following the public source-evaluation route instead of
  the exact released installed extension route.

`npm run public:fixture:icon-editor`

- Purpose: clone the canonical governed public sample repository.
- Use when: you want the easiest first proof route for public evaluation.

`npm run public:smoke:linux`

- Purpose: run the public Linux cold-pull smoke lane.
- Use when: checking the public evaluation surface on the governed Linux path.

## Documentation Package Workbench

`npm run docs:workbench:build`

- Purpose: build the repo-native docs-authoring workbench image.
- Use when: iterating on documentation-package changes through the governed
  Docker-backed authoring surface.

`npm run docs:workbench:gate`

- Purpose: run the documentation-package gate inside the repo-native docs
  workbench.
- Use when: validating documentation-package changes against the same
  containerized surface used by the repo workbench.

`npm run docs:workbench:shell`

- Purpose: open an interactive shell inside the repo-native docs workbench.
- Use when: you need to inspect or run docs-authoring steps manually inside
  the workbench container.

`node scripts/run-docs-gate.js`

- Purpose: run the repo-native docs gate from the host.
- Use when: validating documentation-package changes without entering the
  workbench shell.

`npm run docs:ci`

- Purpose: run the retained documentation continuous-integration lane locally.
- Use when: you need the broader docs evidence surface, not only the fast gate.

## Runtime Provider CLI And Proof

`vihs-runtime-settings --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]`

- Purpose: persist the active branch provider request, LabVIEW version, and
  LabVIEW bitness into VS Code settings.
- Use when: switching between host and the bounded expert Docker provider on
  the active branch.
- Notes:
  - the CLI is generated into user-profile storage on first use
  - if VS Code is already running, reload or restart the window before using
    Compare

`npm run test:integration:windows`

- Purpose: prove the Windows integration-host lane, including the `.cmd`
  launcher path and default no-`--settings-file` target.
- Use when: validating the current runtime-provider CLI proof slice.

## Outer Compliance Baseline

`docker run --rm -v /path/to/repo:/target registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:v0.2.12 python3 scripts/run_assurance.py /target --profile release-gate`

- Purpose: assess this repo against the released `repo-standards-review v0.2.12`
  assurance baseline from the published compliance workbench.
- Use when: checking the outer standards posture for a branch after the
  repo-native docs gate is already clean.

`python3 /tmp/repo-standards-review-v0.2.12-tag/scripts/information_for_users_check.py /home/sveld/code/standards/vi-history-suite-user-rounds --json`

- Purpose: reproduce the exact released `v0.2.12` user-information boundary in
  the current local environment.
- Use when: advancing the `26514` uptake branches and confirming the next
  precise failure boundary.

## Release And Control Surfaces

`python3 /tmp/repo-standards-review-v0.2.12-tag/scripts/requirements_quality_check.py /home/sveld/code/standards/vi-history-suite-user-rounds --json`

- Purpose: check the governed requirements package with the released skill.
- Use when: a branch changes `docs/requirements/srs.md`, `docs/requirements/syrs.md`,
  or `docs/requirements/rtm.csv`.

`npm run test`

- Purpose: run the main repo validation suite.
- Use when: a slice changes source, docs guards, or integration behavior beyond
  one narrow local proof.
