// preview-time lvkit scan trigger (VHS-REQ-717, epic #2348 Phase B). Bridges a
// successful preview render (VHS-REQ-659) to the Phase A single-VI lvkit scan
// provider (VHS-REQ-714) and the Phase C content-addressed store (VHS-REQ-716):
// when a VI has been successfully rendered on the runtime, this best-effort
// trigger runs the scan against the runtime-staged VI and persists the resulting
// `lvkit-vi-scan@v1` envelope, so the Phase C MCP tool (`get_vi_generated_code`)
// can later serve the generated Python to an agent.
//
// Best-effort BY CONSTRUCTION: `runPreviewTimeViScan` never throws and always
// resolves to a typed {@link PreviewTimeViScanOutcome}. A scan that is blocked
// (no lvkit runtime), fails, or throws — and a store write that throws — is
// swallowed into an outcome, because persisting a scan must NEVER fail or slow a
// preview the user asked for. Validation of the target is delegated to the scan
// provider (its `blocked-preflight` result), so there is a single source of
// validation truth.

import type { LvkitViScanInput, LvkitViScanResult } from './lvkitViScanProvider';
import type { LvkitViScanStore } from './lvkitViScanStore';

/** The VI that was just rendered on the runtime, addressed for the scan. */
export interface PreviewTimeViScanRequest {
  /** Repository root the previewed VI lives under (repository-boundary anchor). */
  readonly repositoryRoot: string;
  /** Previewed VI path relative to `repositoryRoot`. */
  readonly relativePath: string;
  /** Runtime the VI was rendered on, recorded in the envelope (e.g. `host-native`). */
  readonly runtime: string;
}

/**
 * Typed, non-throwing outcome of a preview-time scan attempt.
 * - `persisted`: the scan completed and its envelope was written to the store.
 * - `not-persisted`: the scan did not complete (runtime blocked, preflight
 *   blocked, or lvkit failed); nothing was written. This is an expected,
 *   non-error best-effort outcome.
 * - `errored`: the scan or the store write threw unexpectedly; swallowed here so
 *   the preview is never affected.
 */
export type PreviewTimeViScanOutcome =
  | { readonly status: 'persisted'; readonly viPath: string; readonly contentSignature: string }
  | { readonly status: 'not-persisted'; readonly reason: string }
  | { readonly status: 'errored'; readonly reason: string };

/** Injected collaborators for the preview-time scan trigger. */
export interface PreviewTimeViScanDeps {
  /** The Phase A scan function (from `createLvkitViScanProvider`). */
  readonly scan: (input: LvkitViScanInput) => Promise<LvkitViScanResult>;
  /** The Phase C store; only its best-effort `put` is used. */
  readonly store: Pick<LvkitViScanStore, 'put'>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * VHS-REQ-717: run a best-effort single-VI lvkit scan for a just-rendered VI and
 * persist it to the store. Never throws; always resolves to a typed outcome so
 * the caller can fire it and forget (or observe the returned outcome for
 * diagnostics) without any risk to the preview pipeline.
 */
export async function runPreviewTimeViScan(
  request: PreviewTimeViScanRequest,
  deps: PreviewTimeViScanDeps
): Promise<PreviewTimeViScanOutcome> {
  let result: LvkitViScanResult;
  try {
    result = await deps.scan({
      repositoryRoot: request.repositoryRoot,
      relativePath: request.relativePath,
      runtime: request.runtime
    });
  } catch (error) {
    return { status: 'errored', reason: `scan-threw: ${describeError(error)}` };
  }

  if (result.status !== 'completed') {
    return { status: 'not-persisted', reason: `scan-${result.status}: ${result.reason}` };
  }

  try {
    await deps.store.put(result.envelope);
  } catch (error) {
    return { status: 'errored', reason: `store-threw: ${describeError(error)}` };
  }

  return {
    status: 'persisted',
    viPath: result.envelope.viPath,
    contentSignature: result.envelope.contentSignature
  };
}
