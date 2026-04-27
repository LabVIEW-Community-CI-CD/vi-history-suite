# Public Validation Pre-Release v1.3.13

Status: prepared and authorized, awaiting public GitHub and Marketplace
publication after GitLab authority is green.

## Objective

`1.3.13` refreshes the public validation lane so installed users receive the
admitted Windows host LabVIEW 2026 x64 proof wording and the diagnostic-note
fix for successful LabVIEWCLI comparisons. It carries forward the retained
canonical public fixture evidence from `1.3.12`; users can run the same public
`lv_icon.vi` compare battery from the `vihs` CLI and file success, failure, or
feature-not-implemented reports with proof packets.

## Fixture

- Repository: `https://github.com/ni/labview-icon-editor`
- VI: `resource/plugins/lv_icon.vi`
- Old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a`
- New commit: `8741bb08026c104100720c0ef48621e4ab7762fd`
- Docker image: `nationalinstruments/labview:2026q1-linux`
- First uncached Docker compare may pull about `1.4 GB`

Retained `1.3.11` public issue evidence from #48-#59 already proves the
positive Docker compare succeeded, the no-change Docker compare succeeded, and
the missing-file control blocked before Docker at `left-blob-read-failed`.

## Executable Proof

Linux/Docker:

```bash
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof
```

Linux host LabVIEW:

```bash
vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof
```

Windows host LabVIEW 2026 x64:

```powershell
vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof
```

The command writes `vihs-fixture-validation-proof.json` and
`vihs-fixture-validation-issue.md`, and it retains the underlying
`HARNESS-VHS-002` comparison-report smoke artifacts.

Retained Linux host `validate-fixture` proof:

- Packet:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.md`
- Packet JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.json`
- Result: `runtimeExecutionState=succeeded`, `runtimeProvider=host-native`,
  `runtimeEngine=labview-cli`, generated report size `410373` bytes
- Regression retained: Linux host observed-command execution now settles on
  process exit and closes inherited stdio handles so successful headless
  LabVIEW reports do not hang before proof retention.

Retained Linux/Docker `validate-fixture` proof:

- Packet:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.md`
- Packet JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.json`
- Result: `runtimeExecutionState=succeeded`, `runtimeProvider=linux-container`,
  `runtimeEngine=labview-cli`, generated report size `403891` bytes

Retained Windows host LabVIEW `validate-fixture` proof:

- Packet:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md`
- Packet JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json`
- Result: `runtimeValidationOutcome=ready`, `runtimeExecutionState=succeeded`,
  `runtimeProvider=host-native`, `runtimeEngine=labview-cli`,
  `runtimeErrorCode=VIHS_OK`, generated report size `146915` bytes
- Installed-user surface: exact public `1.3.12` pre-release VSIX,
  `vihs.cmd` launcher, Windows 11 VM, LabVIEW 2026 x64, local LabVIEWCLI
- Follow-up retained: the successful v1.3.12 run exposed a stale diagnostic
  note that said the operation failed even though retained stdout and the
  diagnostic log both reported `CreateComparisonReport operation succeeded`;
  authority source now fixes that note and tracks the public issue as #66.

## Proof-Status Matrix

| Variant | Status | Evidence path |
| --- | --- | --- |
| Linux/Docker `2026` `x64` | admitted | public issue #49 plus the `1.3.12` Linux/Docker `validate-fixture` proof packet |
| Linux host LabVIEW `2026` `x64` | admitted | Linux host proof packets under `docs/product/benchmark-packets/`, including the `1.3.12` `validate-fixture` proof |
| Windows host LabVIEW `2026` `x64` | admitted | Windows host proof packet under `docs/product/benchmark-packets/` |
| Windows Docker Desktop Windows containers | community/deferred | Windows Docker Desktop proof packet required |
| Unsupported provider/year/bitness variants | selectable/reportable | stable `VIHS_E_*` code or feature-not-implemented issue |

## Publication Closeout

- GitLab authority merge commit: pending
- GitLab authority pipeline: pending
- Public GitHub PR:
  pending
- Public GitHub main commit:
  pending
- Public GitHub pre-release:
  `v1.3.13-public-validation-prerelease`
- Corrected public GitHub release id: pending
- Corrected VSIX SHA-256:
  pending
- Marketplace target: `1.3.13` pre-release, prepared and authorized
- Marketplace readback: pending
- Windows installed-user LabVIEW proof remains admitted for host LabVIEW 2026
  x64; Windows Docker Desktop / Windows-container proof remains
  community/deferred and is tracked by public issue #65.

Public `develop` branch hygiene remains a separate policy decision: PR #64
confirmed `main` to `develop` is mergeable and checked, but repository branch
protection forbids merge commits, while squash/rebase would not satisfy the
ancestry requirement that `develop` contain `main`.
