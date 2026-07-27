# VHS-REQ-156 -PortNumber carve-out + 706 root-cause correction (draft)

Handoff for the real 706 fix (LINUX requirements-steward draft -> WIN carries in the -PortNumber-drop runtime PR, one-PR co-land per option A, cite me). Root cause proven by LINUX via a reversible single-variable toggle (raw LabVIEWCLI, same warm session + same checkout-index trees, back-to-back): no -PortNumber -> EXIT 0 green; ADD -PortNumber 3363 -> EXIT 157 GSW recursive load; DROP -> green; ADD -> red. Fix also validated on the SHIPPED runtime (appendLabviewCliPortNumberArg no-op'd -> outcome ok, 46 imgs, no GSW).

## Requirement-mapping correction (for WIN)

- The `-PortNumber` mandate is in VHS-REQ-156 (Linux Host-Native Headless Comparison Invocation), lines ~1635-1637 + ~1693 -- NOT VHS-REQ-631. VHS-REQ-631 is the panel-OPEN gate on `server.tcp.enabled` (it does not touch `-PortNumber`) and is UNAFFECTED by this fix. So the carve-out is VHS-REQ-156 only (plus the 706 narrative in the #2503 brief).
- OPEN QUESTION (flag, not in this draft): the PrintToSingleFileHtml preview plan requirement (srs.md ~L4357) emits `-PortNumber` "only when provided". My toggle was on CreateComparisonReport; I have NOT tested whether the host-native PREVIEW path passes `-PortNumber` on Linux and whether it also recurses. If the preview host-native path supplies `-PortNumber`, it likely needs the same carve-out -- please confirm whether the preview path provides it on linux-host-native; if so I extend the carve-out.

## Gate analysis

- referenceAgreement: unaffected as long as the impl/verification ref LISTS stay identical in srs.md + rtm.csv. This is a prose/criteria change to VHS-REQ-156; keep its refs (comparisonReportRuntimeExecution.ts + tests) unchanged unless your runtime fix adds a file.
- requirements:criteria:enforce: the two `-PortNumber` criteria change meaning; your new unit tests (linux-host-native argv has NO -PortNumber; win/container argv still appends) must cite the revised criteria. Same one-PR co-land as VHS-REQ-624.

## VHS-REQ-156 criteria changes (replace the two -PortNumber criteria)

REPLACE the existing criterion:
> Before launching LabVIEWCLI, Linux host-native `labview-cli` runs read the active `labview.conf` ... When TCP is enabled, the resolved `server.tcp.port` is passed to LabVIEWCLI as `-PortNumber`; there is no fabricated default port. When VI Server TCP is enabled but no explicit `server.tcp.port` is declared, execution is blocked with `blockedReason: 'linux-vi-server-tcp-port-unknown'` rather than assuming a port (see the dedicated fail-closed criterion below).

WITH:
> Before launching LabVIEWCLI, Linux host-native `labview-cli` runs read the active `labview.conf` (searched under the same candidate set) and block execution with `blockedReason: 'linux-vi-server-tcp-disabled'` when `server.tcp.enabled=False`, when the key is absent in a readable config, or when no candidate config is readable at all. When the runtime selection does not carry an explicit `requestedLabviewVersion`, the year is inferred from the resolved `labviewExe` directory segment. The `lvcompare` engine is exempt (it does not connect to VI Server). When VI Server TCP is enabled, the Linux host-native comparison does NOT pass `-PortNumber` to LabVIEWCLI: it lets LabVIEWCLI auto-connect to the running VI Server (LabVIEWCLI resolves the port itself). Passing `-PortNumber` explicitly -- even the resolved, disk-declared `server.tcp.port` -- drives a divergent LabVIEWCLI VI-Server attach path that recursive-loads the packed Getting Started Window (`GSW.lvlibp/GSW_MainPanel.vi`) on Linux host-native LabVIEW 2026 and fails the operation (exit 157 / `linux-headless-recursive-load`); this was proven by a reversible single-variable toggle (present -> recursion, absent -> success) and generalizes the previously-scoped "fabricated 3363" observation to ANY explicit `-PortNumber`. Because the Linux host-native path no longer supplies `-PortNumber`, a declared `server.tcp.port` is NOT required to proceed; the prior `linux-vi-server-tcp-port-unknown` fail-closed block is removed for this path (a still-required `server.tcp.enabled=True` remains enforced as above).

ALSO REMOVE / RETIRE the dedicated fail-closed criterion (the one keyed on `linux-vi-server-tcp-port-unknown` at ~L1693 that requires an explicit `server.tcp.port`), since the runtime no longer needs a declared port. Keep the `server.tcp.enabled` requirement.

UPDATE the Statement if it references `-PortNumber` supply (it does not directly, but ensure no lingering "passes the resolved port" language survives in the block).

## Change Guidance addition (VHS-REQ-156)

- Linux host-native comparison MUST NOT emit `-PortNumber`; gate `appendLabviewCliPortNumberArg` (or the port supply) off for the `platform=linux + engine=labview-cli + provider=host-native` triple. LabVIEWCLI auto-connects to the VI Server declared in `labview.conf`. This supersedes the prior "supply the disk-declared port; fail closed on an undeclared port" rule, which rested on the incorrect assumption that only a fabricated default port recursive-loaded.
- Correct the runtime diagnostic note for this path (drop "passed it explicitly to LabVIEWCLI"; state that LabVIEWCLI auto-connects).
- Container (Docker) and Windows host-native invocations still append `-PortNumber` as before (unaffected).

## 706 narrative correction (for the #2503 brief follow-up)

- Root cause of the Linux host-native `CreateComparisonReport` GSW recursion = passing `-PortNumber` to LabVIEWCLI, NOT the newest-revision-tree staging. The #2503 brief's staging-dependency-fidelity framing was a mis-attribution (confounded: every green baseline used raw LabVIEWCLI without `-PortNumber`; every red used the shipped runtime which passed it). The two-tree staging change (#2509) is a genuine dependency-fidelity improvement and is kept, but it does not fix 706. The fix is dropping `-PortNumber` on the Linux host-native path.
