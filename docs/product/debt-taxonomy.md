# Debt Taxonomy

## Purpose

Define the allowed classes and required evaluation fields for the governed
debt-retirement contract.

## Debt Classes

| Class | Meaning |
| --- | --- |
| `technical` | Implementation debt that weakens maintainability, correctness, or safe extension of the codebase. |
| `documentation` | Debt caused by missing, stale, contradictory, or undiscoverable authority documentation. |
| `control-plane` | Debt in queue, program, release, wiki, or operator-governance surfaces that weakens bounded truth. |
| `evidence` | Debt caused by weak, missing, misleading, or hard-to-consume retained evidence. |
| `runtime` | Debt caused by host, container, engine, or environment seams that weaken repeatable execution truth. |
| `benchmark` | Debt caused by incomplete, bounded, or non-comparable benchmark evidence. |
| `release` | Debt caused by incomplete release, packaging, or install-surface governance. |

## Statuses

| Status | Meaning |
| --- | --- |
| `open` | The debt remains active and must retain a next gate plus exit criteria. |
| `retired` | The debt was removed and retains the commit that closed it. |
| `accepted-exception` | The debt is intentionally left in place for now and retains an explicit rationale. |

## Severity

| Severity | Meaning |
| --- | --- |
| `low` | Worth tracking, but not likely to invalidate a near-term decision by itself. |
| `medium` | Important and should be retired or explicitly bounded before adjacent work widens. |
| `high` | Risks invalid evidence, misleading docs, or unsafe program claims if left unmanaged. |

## Contamination Risk

| Risk | Meaning |
| --- | --- |
| `low` | Unlikely to bias experiments, release claims, or reader understanding. |
| `medium` | Can distort future work if ignored. |
| `high` | Can poison benchmark, runtime, release, or documentation truth if left implicit. |

## Required Owner Mapping

Every debt item shall map to:

- one tranche id
- one issue id
- one execution program id

The debt contract is cross-program, but every item still needs a concrete
execution owner.

## Required Next-Gate Semantics

- `open` debt must keep one next gate and explicit exit criteria
- `retired` debt must keep the retirement commit and no next gate
- `accepted-exception` debt must keep a rationale explaining why the item is
  intentionally not retired now

## Reader Rule

Future sessions shall prefer the debt taxonomy plus the machine-readable debt
ledger over chat memory when deciding whether discovered debt is:

- technical
- documentation
- benchmark/runtime
- evidence/control-plane

If a new debt shape does not fit the taxonomy, update this document and the
machine-readable ledger in the same tranche.
