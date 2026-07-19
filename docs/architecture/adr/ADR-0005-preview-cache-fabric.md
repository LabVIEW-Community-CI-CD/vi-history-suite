# ADR-0005: Preview-Cache Fabric

- Status: Accepted
- Date: 2026-07-18

> Promoted into the active requirements package: VHS-REQ-671 (headless
> preview-cache worker), VHS-REQ-672 (portable bundle), VHS-REQ-673 (cache
> exchange), VHS-REQ-674 (generation fleet), and VHS-REQ-675 (cache health
> read-model) are the authoritative, Active requirement text. The text below is
> the design record. The governing system requirements are VHS-SYS-REQ-016
> (Governed Release Branch Promotion, for the worker/exchange/fleet/health CI
> surfaces) and VHS-SYS-REQ-008 (Explicit Compare Action, for the portable
> bundle that carries rendered previews).

## Context

VI Preview renders a LabVIEW VI into a read-only document (front panel and block
diagram) so it can be viewed without opening LabVIEW. A live render is expensive
and Docker-only: it launches a LabVIEW container and can take seconds to minutes
per VI. Rendering the same VI repeatedly — on every open, on every machine, in
every CI run — is wasteful, and a per-machine scratch folder cannot be shared or
trusted across environments.

We needed previews to be generated once and reused everywhere: across opens,
across machines, and across CI, without re-running LabVIEW.

## Decision

Treat rendered previews as a **content-addressed, portable cache fabric** rather
than a per-machine scratch folder, built in layers:

- **Worker (VHS-REQ-671).** A headless CLI renders a whole workspace's VIs into
  a cache directory through the Docker runtime, with no VS Code UI, so a
  Codespace or CI runner can pre-render a repository.
- **Content addressing.** Each cache entry's key is a SHA-256 over the target VI
  plus its staged dependency set (each staged relative path and the SHA-256 of
  its bytes), so the same VI content yields the same key on any machine and the
  stored document is reproducible and machine-independent.
- **Portable bundle (VHS-REQ-672).** A cache is packaged as a single portable
  bundle with a manifest and per-entry integrity digests for transport.
- **Exchange (VHS-REQ-673).** Bundles are published to and fetched from a
  content-addressed release exchange (reusing the dev-tools release pattern), so
  a bundle is published once and de-duplicated on re-publish.
- **Fleet (VHS-REQ-674).** A sharded workflow renders a repository's VIs across
  a runner matrix and merges the per-shard bundles into one published bundle.
- **Health read-model (VHS-REQ-675).** A read-only aggregator reports cache
  health (entry/byte counts, healthy vs flagged entries) for diagnostics.

The runtime model is "Docker generates the cache, any runtime displays it": a
live render is Docker-only, but displaying an already-cached preview launches no
external process and works on any runtime.

## Consequences

- A repository's previews can be generated once (locally, in a Codespace, or by
  the CI fleet) and shared through the exchange; opening a cached VI is a fast
  disk read rather than a LabVIEW render.
- Cache correctness rests on content addressing: an entry is valid for exactly
  the VI content it was rendered from, so a stale render can never be served for
  changed content.
- The layered surfaces (worker, bundle, exchange, fleet, health) are independent
  and individually testable; MCP tools expose read-only cache inspection.
- Displaying a cache on a non-Docker host is supported; generating one there is
  not, unless the host opts into direct rendering for a Docker-less LabVIEW
  environment.
