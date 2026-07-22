# Vendored TDMS transport infrastructure (`tools/tdms`)

Self-contained, **fully decoupled** copy of the dual-packet TDMS transport
infrastructure, vendored into vi-history-suite so an agent can produce and verify
TDMS artifacts locally across all hardware/runtime variants **without any
dependency on the upstream `mprr` repository** (VHS-REQ-710).

The C# projects already use the `ViHistorySuite.ReviewCaptureTransport` namespace
and reference each other by relative path, so the vendored set builds standalone.
Adjust these sources freely — this is now vi-history-suite-owned infrastructure.

## Projects

| Project | Purpose |
| --- | --- |
| `review-capture-transport-core` | The dual-packet TDMS transport (`DualPacketTransport`, `TransportCore`, replay projection). `net8.0`, platform-neutral. |
| `review-capture-dual-packet-self-test-writer` | Produces `short.tdms` / `long.tdms` + manifest + correlation receipt from a self-test surface + ground-truth ledger. |
| `review-capture-windows-zero-copy-packet-harness-generator` | Produces governed packet-harness `source-short.tdms` / `source-long.tdms` + schedule + manifest. |

## Build (local, exclusively offline)

Requires a .NET SDK. The projects target `net8.0`; on a host with only a newer
runtime, roll forward:

```bash
DOTNET_ROLL_FORWARD=Major dotnet build \
  tools/tdms/review-capture-dual-packet-self-test-writer/ReviewCaptureDualPacketSelfTestWriter.csproj -nologo
```

## Produce a TDMS

```bash
DOTNET_ROLL_FORWARD=Major dotnet \
  tools/tdms/review-capture-dual-packet-self-test-writer/bin/Debug/net8.0/ReviewCaptureDualPacketSelfTestWriter.dll \
  --surface-metadata-path tools/tdms/fixtures/surface-metadata.json \
  --ground-truth-ledger-path tools/tdms/fixtures/ground-truth-ledger.json \
  --output-dir <out> --attempt-id <id> --frame-count 8 --frame-interval-milliseconds 50
```

## Decoupling proof

With identical inputs the vendored infrastructure emits **byte-identical** TDMS to
the upstream original — confirming a faithful copy:

- `short.tdms` → `e45fb879a1cceb66349751d6ec00d832c0a4f39dbc3075bd9c82ca9ad4a55ce4`
- `long.tdms` → `94b0a433f8b31fa0443abfa1e79068770579e751a1e387325e7bda7504d05aee`

(`short.tdms` embeds the `--attempt-id`; identical ids reproduce the digest above.)

Build outputs (`bin/`, `obj/`) are git-ignored. `.cs` / `.csproj` files are exempt
from the traceability inventory glob (`src/**/*.ts`, `scripts/*.js`, `tests/**`).
