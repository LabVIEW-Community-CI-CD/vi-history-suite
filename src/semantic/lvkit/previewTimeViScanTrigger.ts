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

import * as path from 'node:path';

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
  /**
   * Exact-frame guard (#2363): the content signature of the exact VI bytes the
   * runtime rendered, when the render pipeline can supply it. When set, the
   * trigger persists the scan only if the scan read those same bytes (its
   * envelope's content signature matches), so a VI edited on disk during a long
   * render does not persist a scan describing a different revision than the
   * displayed preview. Optional and backward-compatible: when absent, no
   * cross-check is performed. Compared modulo an optional `sha256:` prefix.
   */
  readonly expectedContentSignature?: string;
}

/**
 * Typed, non-throwing outcome of a preview-time scan attempt.
 * - `persisted`: the scan completed and its envelope was written to the store.
 * - `not-persisted`: the scan did not complete (runtime blocked, preflight
 *   blocked, or lvkit failed), or it completed but read different bytes than the
 *   render displayed (`content-changed`, the exact-frame guard for #2363);
 *   nothing was written. This is an expected, non-error best-effort outcome.
 * - `errored`: the scan or the store write failed. This covers both an
 *   unexpected throw from the scan or store (`scan-threw`/`store-threw`) and a
 *   best-effort store write that was suppressed without throwing and reported
 *   `false` (`store-write-failed`), so a caller never reads `persisted` for a
 *   scan that was not actually written. Always swallowed here so the preview is
 *   never affected.
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
 * Strip an optional `sha256:` algorithm prefix and lowercase, so a signature
 * produced with the prefix (the scan envelope) compares equal to one produced
 * without it (a bare hex digest from the render's file hasher).
 */
function normalizeContentSignature(signature: string): string {
  return signature.replace(/^sha256:/i, '').toLowerCase();
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

  if (
    request.expectedContentSignature !== undefined &&
    normalizeContentSignature(result.envelope.contentSignature) !==
      normalizeContentSignature(request.expectedContentSignature)
  ) {
    // The VI changed on disk between the render staging and the scan read, so the
    // scan describes a different revision than the displayed preview. Skip the
    // write rather than persist a scan mislabeled against the rendered frame.
    return { status: 'not-persisted', reason: 'content-changed' };
  }

  let written: boolean;
  try {
    written = await deps.store.put(result.envelope);
  } catch (error) {
    return { status: 'errored', reason: `store-threw: ${describeError(error)}` };
  }

  if (!written) {
    // The store swallowed a filesystem error (disk full, permission), so the
    // envelope was NOT persisted; report it honestly rather than claiming
    // `persisted` and leaving the later MCP lookup to miss with no signal.
    return { status: 'errored', reason: 'store-write-failed' };
  }

  return {
    status: 'persisted',
    viPath: result.envelope.viPath,
    contentSignature: result.envelope.contentSignature
  };
}

/** Minimal shape of a VS Code workspace folder (its root path). */
export interface WorkspaceFolderLike {
  readonly uri: { readonly fsPath: string };
}

/**
 * VHS-REQ-717: map a just-rendered VI to a {@link PreviewTimeViScanRequest}, or
 * `undefined` when there is nothing to scan — the VI is not inside any open
 * workspace folder (so it has no repository-relative address). Returns the
 * deepest (most specific) containing folder in a multi-root workspace. Pure and
 * deterministic; the repository-boundary check itself is delegated downstream to
 * the scan provider, so this only establishes the (repositoryRoot, relativePath)
 * address and skips VIs that sit outside every folder.
 */
export function buildPreviewTimeViScanRequest(
  viFsPath: string,
  workspaceFolders: readonly WorkspaceFolderLike[] | undefined,
  runtime: string
): PreviewTimeViScanRequest | undefined {
  if (viFsPath.length === 0 || !workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  let best: PreviewTimeViScanRequest | undefined;
  for (const folder of workspaceFolders) {
    const root = folder.uri.fsPath;
    if (root.length === 0) {
      continue;
    }
    const relativePath = path.relative(root, viFsPath);
    // Reject only an actual parent-directory escape (`..` alone or a `..<sep>`
    // prefix), not a valid in-workspace VI whose own basename merely begins with
    // two dots (e.g. `..diagnostic.vi`). Also reject an absolute result (a
    // different drive on Windows) — the VI is outside this folder either way.
    if (
      relativePath.length === 0 ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      continue;
    }
    if (!best || relativePath.length < best.relativePath.length) {
      best = { repositoryRoot: root, relativePath, runtime };
    }
  }
  return best;
}
