// lvkit single-VI scan store (VHS-REQ-716, epic #2348 Phase C). A dedicated,
// content-addressed on-disk store for the pure `lvkit-vi-scan@v1` envelopes the
// Phase A scan provider produces (VHS-REQ-714), so the Phase B preview-time
// trigger can persist a scan and an agent MCP tool (`get_vi_generated_code`) can
// later retrieve the generated Python by content address. Mirrors the
// comparison-model cache (VHS-REQ-662.8): a deterministic SHA-256 key,
// `<key>.json` files, an injected filesystem boundary, a fail-closed structural
// guard on read, and a best-effort write. The key derivation and the store
// behavior are pure apart from `node:crypto` and do no I/O of their own — all
// filesystem access goes through the injected boundary; only the
// `createDefaultLvkitViScanStore` convenience factory wires the real node-fs
// adapter for production.
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
  summarizeModuleResolutions,
  type LvkitGeneratedModule,
  type LvkitResolutionCounts,
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

/**
 * Resolution counts for upgrade-only precedence ranking: the additive
 * `resolutionCounts` when present, else classify the always-present `modules`
 * (legacy envelopes captured before the field existed).
 */
function resolutionCountsFor(envelope: LvkitViScanEnvelope): LvkitResolutionCounts {
  return envelope.resolutionCounts ?? summarizeModuleResolutions(envelope.modules);
}

/**
 * True when `a` is STRICTLY cleaner (more resolved) than `b` for upgrade-only
 * precedence. Primary key: total UNRESOLVED provenance -- inline
 * `raise PrimitiveResolutionNeeded` / `raise VILibResolutionNeeded` placeholders
 * (which keep `errorModuleCount` at 0) counted alongside `.error.py` stubs, so an
 * inline placeholder is ranked unresolved, not clean. Tie-break on an equal total:
 * FEWER `.error.py` hard stubs, because a hard stub is less usable than an inline
 * placeholder (which keeps the surrounding generated module) -- so a later
 * hard-stub scan never downgrades an existing inline placeholder, and symmetrically
 * an inline result can still upgrade an existing hard stub. Order-independent.
 */
function isStrictlyCleaner(a: LvkitViScanEnvelope, b: LvkitViScanEnvelope): boolean {
  const ca = resolutionCountsFor(a);
  const cb = resolutionCountsFor(b);
  const totalA = ca.unresolvedPrimitive + ca.unresolvedVilib + ca.errorStub;
  const totalB = cb.unresolvedPrimitive + cb.unresolvedVilib + cb.errorStub;
  if (totalA !== totalB) {
    return totalA < totalB;
  }
  return ca.errorStub < cb.errorStub;
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
   * fail the preview/scan pipeline that produced it. Resolves to `true` when the
   * envelope was written and `false` when a filesystem error was suppressed, so
   * the caller can report an accurate persisted/failed outcome without a throw.
   */
  put(envelope: LvkitViScanEnvelope): Promise<boolean>;
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
  if (
    !(
      envelope.moduleCount === envelope.modules.length &&
      Number.isInteger(envelope.errorModuleCount) &&
      envelope.errorModuleCount >= 0 &&
      envelope.errorModuleCount <= envelope.moduleCount &&
      Number.isInteger(envelope.resolvedModuleCount) &&
      envelope.resolvedModuleCount === envelope.moduleCount - envelope.errorModuleCount
    )
  ) {
    return false;
  }
  // #2376 provenance (optional, additive): when present, resolutionCounts must be
  // four non-negative integers summing to moduleCount. Absent is valid (an
  // envelope captured before the field existed), so old cache entries still read.
  if (
    envelope.resolutionCounts !== undefined &&
    !isLvkitResolutionCounts(envelope.resolutionCounts, envelope.moduleCount)
  ) {
    return false;
  }
  return true;
}

/**
 * Structural guard for the optional {@link LvkitViScanEnvelope.resolutionCounts}:
 * an object carrying the four resolution buckets as non-negative integers that
 * sum to the envelope's module count. Mirrors the builder's
 * `summarizeModuleResolutions`, so a dropped bucket or an inconsistent total
 * (hand-edited or truncated) is a cache miss rather than a surfaced scan.
 */
function isLvkitResolutionCounts(value: unknown, moduleCount: number): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const counts = value as Record<string, unknown>;
  const buckets = ['resolved', 'unresolvedPrimitive', 'unresolvedVilib', 'errorStub'] as const;
  let sum = 0;
  for (const bucket of buckets) {
    const n = counts[bucket];
    if (!Number.isInteger(n) || (n as number) < 0) {
      return false;
    }
    sum += n as number;
  }
  return sum === moduleCount;
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
      // Upgrade-only precedence (#2373, unified cross-leg cache): the store keys by
      // (viPath, contentSignature), so a LabVIEW-free placeholder generate and a
      // real-LabVIEW clean generate of the SAME VI bytes share ONE key. A clean
      // generate must be able to REPLACE a placeholder ("the Windows leg fills in
      // the placeholders"), but a later placeholder run must NOT clobber a cleaner
      // generate. So skip the write when the existing envelope for this exact content
      // address is STRICTLY CLEANER (isStrictlyCleaner): fewer total UNRESOLVED modules
      // across ALL provenance (inline `raise ...ResolutionNeeded` primitive/vilib
      // placeholders AND `.error.py` stubs), and on an equal total fewer `.error.py`
      // hard stubs -- so neither an inline-placeholder run (errorModuleCount 0) nor a
      // hard-stub run can downgrade a cleaner cached generate. Best-effort read:
      // a miss/unreadable/mismatched existing entry just writes.
      try {
        const existing = JSON.parse(await fsDeps.readFile(storeFilePath(key)));
        if (
          isLvkitViScanEnvelope(existing) &&
          existing.viPath === normalizedPath &&
          existing.contentSignature === envelope.contentSignature &&
          isStrictlyCleaner(existing, normalizedEnvelope)
        ) {
          return true;
        }
      } catch {
        /* no existing entry (or unreadable) — fall through to write */
      }
      try {
        await fsDeps.ensureDirectory(options.storeDirectory);
        await fsDeps.writeFile(storeFilePath(key), JSON.stringify(normalizedEnvelope));
        return true;
      } catch {
        // Best-effort: a store write failure must never fail the preview/scan
        // pipeline that produced the envelope; report it as `false` so the caller
        // does not falsely claim the scan was persisted.
        return false;
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
