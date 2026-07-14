# Audience And Task Model

## Document Control

- Product or service: vi-history-suite
- Repository: LabVIEW-Community-CI-CD/vi-history-suite
- Baseline: develop governed docs baseline
- Owner: maintainers
- Status: active

See also:

- `docs/information-for-users/plan.md`
- `docs/user-guide.md`
- `docs/information-for-users/delivery-profile.md`
- `docs/faq.md`

## Audience Profiles

| Audience | Stage | Frequency | Context | Assumptions | Failure tolerance |
| --- | --- | --- | --- | --- | --- |
| LabVIEW developer | new or returning use | occasional to recurring | reviewing VI changes inside a Git-backed workspace | needs clear install, runtime, and compare routes | low when runtime setup fails |
| Repository maintainer | continuous use | high | triaging issues, validating PRs, preparing releases | understands requirements, branch policy, and local gates | medium; evidence gaps need explicit follow-up |
| Release reviewer | review use | per release | checking Marketplace, package, standards, and closeout evidence | needs retained evidence and decision-complete routes | low for missing release proof |
| Agent or automation operator | task-scoped use | recurring | executing requirement-targeted repo work | follows issue, PR, standards, and validation contracts | medium; unclear scope risks rework |

## Task Profiles

| Task | Audience | Prerequisites | Output or decision | Failure effect |
| --- | --- | --- | --- | --- |
| Start the main workflow | LabVIEW developer | extension installed, workspace open, runtime available | first useful VI history review | onboarding stalls or runtime troubleshooting begins |
| Find the current rule or command | maintainer or agent | local clone and searchable docs | correct route, command, or requirement ID | validation or PR evidence may drift |
| Recover from a failed route | all audiences | fallback path is named | safe next action or support boundary | users repeat failed steps or lose confidence |
| Close a standards-targeted issue | maintainer or agent | issue ID, requirement scope, validation evidence | merged PR and closeout comment | incomplete evidence or unclosed follow-up |

## Review Notes

- Add or remove audience rows when the extension, Marketplace release path, or agent workflow gains a new user class.
- Keep assumptions and failure tolerance specific enough that writers can decide how much guidance each task needs.
- Review this model with `docs/information-for-users/delivery-profile.md` when user-facing routes move.