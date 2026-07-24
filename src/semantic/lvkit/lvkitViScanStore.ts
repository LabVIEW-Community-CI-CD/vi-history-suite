// lvkit single-VI scan store (VHS-REQ-716, epic #2348 Phase C). A dedicated,
// content-addressed on-disk store for the pure `lvkit-vi-scan@v1` envelopes the
// Phase A scan provider produces (VHS-REQ-714), so the Phase B preview-time
// trigger can persist a scan and an agent MCP tool (`get_vi_generated_code`) can
// later retrieve the generated Python by content address. Mirrors the
// comparison-model cache (VHS-REQ-662.8): a deterministic SHA-256 key,
// `<key>.json` files, an injected filesystem boundary, a fail-closed structural
// guard on read, and a best-effort write. Pure apart from `node:crypto`; performs
// no I/O of its own.
//
// The store is content-addressed by (VI path, content signature) exactly as the
// epic locks it: a change to either the path or the scanned VI's content
// signature yields a different key, so a lookup only ever returns the scan
// captured for those precise VI bytes. `get` additionally verifies the stored
// envelope describes the requested (path, signature) so a collided or hand-edited
// file can never surface the wrong VI's generated code to an agent.

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  isIsoTimestamp,
  LVKIT_SCAN_SOURCES,
  LVKIT_VI_SCAN_SCHEMA,
  LVKIT_VI_SCAN_SCHEMA_VERSION,
  type LvkitGeneratedModule,
  type LvkitViScanEnvelope
} from './lvkitViScanModel';

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
 * True for a string with at least one non-whitespace character. Mirrors the
 * builder's `requireNonEmptyString`, which trims and rejects blank input, so the
 * read guard rejects a whitespace-only field the builder could never have
 * produced instead of surfacing it as a valid scan.
 */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Structural guard for one generated module: an object carrying a non-blank
 * `relativePath` and a string `python` (an empty generated file is valid).
 */
function isLvkitGeneratedModule(value: unknown): value is LvkitGeneratedModule {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const module = value as LvkitGeneratedModule;
  return isNonBlankString(module.relativePath) && typeof module.python === 'string';
}

/**
 * Fail-closed structural guard mirroring the comparison-model cache but validating
 * the COMPLETE `lvkit-vi-scan@v1` envelope shape, because `get` hands the envelope
 * to an agent as authoritative generated code. A stored value is only reused when
 * it carries the current schema id and version, every required metadata field
 * (with `generatedAt` a real ISO-8601 instant), a non-empty array of well-formed
 * modules (plus an optional well-formed primary module), and self-consistent
 * module counts. A truncated, hand-edited, old, or schema-drifted file therefore
 * fails every affected check and is treated as a miss rather than surfaced as a
 * partial or malformed scan.
 */
function isLvkitViScanEnvelope(value: unknown): value is LvkitViScanEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const envelope = value as LvkitViScanEnvelope;
  if (
    envelope.schema !== LVKIT_VI_SCAN_SCHEMA ||
    envelope.schemaVersion !== LVKIT_VI_SCAN_SCHEMA_VERSION ||
    !isNonBlankString(envelope.viPath) ||
    !isNonBlankString(envelope.contentSignature) ||
    !isNonBlankString(envelope.runtime) ||
    !isIsoTimestamp(envelope.generatedAt) ||
    !LVKIT_SCAN_SOURCES.includes(envelope.lvkitSource)
  ) {
    return false;
  }
  if (envelope.primaryModule !== null && !isLvkitGeneratedModule(envelope.primaryModule)) {
    return false;
  }
  if (!Array.isArray(envelope.modules) || envelope.modules.length === 0) {
    return false;
  }
  if (!envelope.modules.every(isLvkitGeneratedModule)) {
    return false;
  }
  // Self-consistent counts: total matches the array, the error count is a real
  // non-negative integer no larger than the total, and resolved is exactly the
  // remainder. Rejects a file whose counts were dropped or hand-edited.
  return (
    envelope.moduleCount === envelope.modules.length &&
    Number.isInteger(envelope.errorModuleCount) &&
    envelope.errorModuleCount >= 0 &&
    envelope.errorModuleCount <= envelope.moduleCount &&
    Number.isInteger(envelope.resolvedModuleCount) &&
    envelope.resolvedModuleCount === envelope.moduleCount - envelope.errorModuleCount
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
      // Normalize the VI path to POSIX before deriving the key AND before
      // persisting it, so an envelope carrying Windows separators (e.g. one built
      // outside buildLvkitViScanEnvelope) is stored under the same key and value
      // that get()'s content-address verification recomputes. Otherwise it would
      // be written under the normalized key but left permanently unreadable.
      const normalizedPath = toPosixRelativePath(envelope.viPath);
      const normalizedEnvelope =
        normalizedPath === envelope.viPath ? envelope : { ...envelope, viPath: normalizedPath };
      const key = computeLvkitViScanStoreKey(normalizedPath, envelope.contentSignature);
      try {
        await fsDeps.ensureDirectory(options.storeDirectory);
        await fsDeps.writeFile(storeFilePath(key), JSON.stringify(normalizedEnvelope));
      } catch {
        // Best-effort: a store write failure must never fail the preview/scan
        // pipeline that produced the envelope.
      }
    }
  };
}

/**
 * Default file-backed lvkit VI-scan store. Both sides of epic #2348 address the
 * SAME on-disk directory under the OS temp dir: the extension host writes here
 * from the Phase B preview-time trigger (VHS-REQ-717) and the long-lived MCP
 * server process reads here from the read-only `get_vi_generated_code` tool
 * (VHS-REQ-716). They are separate processes, so a fresh instance per process
 * over the shared directory is correct. Defined in this light, dependency-minimal
 * module (only `node:crypto`/`node:fs`/`node:os`/`node:path`) so the extension
 * entrypoint can construct the store without pulling in the MCP/PR-review graph.
 */
export function createDefaultLvkitViScanStore(): LvkitViScanStore {
  return createFileLvkitViScanStore(
    {
      storeDirectory: path.join(os.tmpdir(), 'vihs-lvkit-vi-scan-store'),
      joinPath: path.join
    },
    {
      ensureDirectory: async (directory) => {
        await fsp.mkdir(directory, { recursive: true });
      },
      readFile: (filePath) => fsp.readFile(filePath, 'utf8'),
      writeFile: (filePath, data) => fsp.writeFile(filePath, data)
    }
  );
}
