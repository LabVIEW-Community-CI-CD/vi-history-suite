// lvkit single-VI scan store (VHS-REQ-716, epic #2348 Phase C). A dedicated,
// content-addressed on-disk store for the pure `lvkit-vi-scan@v1` envelopes the
// Phase A scan provider produces (VHS-REQ-714), so the Phase B preview-time
// trigger can persist a scan and an agent MCP tool (`get_vi_generated_code`) can
// later retrieve the generated Python by content address. Mirrors the comparison
// -model cache (VHS-REQ-662.8): a deterministic SHA-256 key, `<key>.json` files,
// an injected filesystem boundary, a fail-closed structural guard on read, and a
// best-effort write. Pure apart from `node:crypto`; performs no I/O of its own.
//
// The store is content-addressed by (VI path, content signature) exactly as the
// epic locks it: a change to either the path or the scanned VI's content
// signature yields a different key, so a lookup only ever returns the scan
// captured for those precise VI bytes. `get` additionally verifies the stored
// envelope describes the requested (path, signature) so a collided or hand-edited
// file can never surface the wrong VI's generated code to an agent.

import { createHash } from 'node:crypto';

import { LVKIT_VI_SCAN_SCHEMA, type LvkitViScanEnvelope } from './lvkitViScanModel';

/** Normalize a Windows or POSIX relative path to POSIX separators. */
function toPosixRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Deterministic SHA-256 store key over the repository-relative VI path and the
 * scanned VI's content signature. The path is normalized to POSIX and folded in
 * first so two VIs never collide; a change to either the path or the content
 * signature yields a different key. The result is a bare 64-character lowercase
 * hex digest, safe to use as a file name.
 */
export function computeLvkitViScanStoreKey(viPath: string, contentSignature: string): string {
  const normalizedPath = toPosixRelativePath(viPath);
  return createHash('sha256')
    .update(`path:${normalizedPath}\nsignature:${contentSignature}`)
    .digest('hex');
}

/** Content-addressed store of single-VI lvkit scan envelopes. */
export interface LvkitViScanStore {
  /**
   * Returns the scan envelope captured for exactly this (VI path, content
   * signature), or `undefined` on any miss (absent, unreadable, malformed,
   * schema-drifted, or a stored envelope that does not describe the requested
   * path + signature).
   */
  get(viPath: string, contentSignature: string): Promise<LvkitViScanEnvelope | undefined>;
  /**
   * Persists a scan envelope under its content address (derived from the
   * envelope's own `viPath` + `contentSignature`). Best-effort: a store write
   * failure never throws into the caller, because persisting a scan must never
   * fail the preview/scan pipeline that produced it.
   */
  put(envelope: LvkitViScanEnvelope): Promise<void>;
}

/** Injected filesystem boundary for the file-backed store. */
export interface FileLvkitViScanStoreFsDeps {
  ensureDirectory: (directory: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: string) => Promise<void>;
}

export interface FileLvkitViScanStoreOptions {
  storeDirectory: string;
  joinPath: (directory: string, name: string) => string;
}

/**
 * Structural guard mirroring the comparison-model cache: a stored value is only
 * reused when it is an object carrying the current `lvkit-vi-scan@v1` schema id
 * plus the fields consumers rely on, so a truncated, hand-edited, or
 * schema-drifted file is treated as a miss rather than surfaced as a bad scan.
 */
function isLvkitViScanEnvelope(value: unknown): value is LvkitViScanEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const envelope = value as LvkitViScanEnvelope;
  return (
    envelope.schema === LVKIT_VI_SCAN_SCHEMA &&
    typeof envelope.viPath === 'string' &&
    typeof envelope.contentSignature === 'string' &&
    Array.isArray(envelope.modules)
  );
}

/**
 * File-backed scan store. Stores `<key>.json` under the store directory. `get`
 * treats any read/parse failure, a value that is not a current-schema envelope,
 * or a stored envelope that does not describe the requested (path, signature) as
 * a miss; `put` writes best-effort and never throws into the caller.
 */
export function createFileLvkitViScanStore(
  options: FileLvkitViScanStoreOptions,
  fsDeps: FileLvkitViScanStoreFsDeps
): LvkitViScanStore {
  function storeFilePath(key: string): string {
    return options.joinPath(options.storeDirectory, `${key}.json`);
  }

  return {
    async get(viPath, contentSignature) {
      const normalizedPath = toPosixRelativePath(viPath);
      const key = computeLvkitViScanStoreKey(normalizedPath, contentSignature);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await fsDeps.readFile(storeFilePath(key)));
      } catch {
        return undefined;
      }
      if (!isLvkitViScanEnvelope(parsed)) {
        return undefined;
      }
      // Content-address verification: the stored envelope must describe exactly
      // the requested (path, signature); reject a collided or tampered file so an
      // agent never receives another VI's generated code.
      if (parsed.viPath !== normalizedPath || parsed.contentSignature !== contentSignature) {
        return undefined;
      }
      return parsed;
    },
    async put(envelope) {
      const key = computeLvkitViScanStoreKey(envelope.viPath, envelope.contentSignature);
      try {
        await fsDeps.ensureDirectory(options.storeDirectory);
        await fsDeps.writeFile(storeFilePath(key), JSON.stringify(envelope));
      } catch {
        // Best-effort: a store write failure must never fail the preview/scan
        // pipeline that produced the envelope.
      }
    }
  };
}
