import { createHash } from 'node:crypto';
import { isSha256HexKey as isValidKey } from '../support/cacheKey';

import {
  buildViSemanticComparisonModelFromHtml,
  type ViChangeSurface
} from './viSemanticModel';

/**
 * VHS-REQ-660: cache backing the Source Control semantic change hover.
 *
 * The hover must be instant, but the narrative it shows is produced by a
 * comparison that needs a LabVIEW runtime and takes minutes. So the decoration
 * is served from this cache, which is populated after a working-tree comparison
 * completes (reusing the already-produced report HTML). The key folds in the
 * repository-relative path plus the base-revision and selected-content
 * signatures, so a cached narrative is returned only while it still describes
 * the VI's current HEAD-versus-working-tree change; once the VI changes again
 * the signatures diverge and the stale narrative is no longer matched.
 */

/** The reviewable unit stored per compared VI. */
export interface StoredViSemanticNarrative {
  narrative: string;
  changedSurfaces: ViChangeSurface[];
}

/**
 * Deterministic SHA-256 key over the repository-relative path plus the two
 * content signatures of the compared sides. The path is folded in first so two
 * VIs never collide; a change to either side's signature yields a different
 * key, so the cache never returns a stale narrative for an edited VI.
 */
export function computeViSemanticNarrativeCacheKey(
  relativePath: string,
  baseSignature: string,
  selectedSignature: string
): string {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return createHash('sha256')
    .update(`path:${normalizedPath}\nbase:${baseSignature}\nselected:${selectedSignature}`)
    .digest('hex');
}

export interface ViSemanticNarrativeCache {
  get(key: string): Promise<StoredViSemanticNarrative | undefined>;
  set(key: string, value: StoredViSemanticNarrative): Promise<void>;
}

export interface FileViSemanticNarrativeCacheFsDeps {
  ensureDirectory: (directory: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: string) => Promise<void>;
}

export interface FileViSemanticNarrativeCacheOptions {
  cacheDirectory: string;
  joinPath: (directory: string, name: string) => string;
}

function isStoredNarrative(value: unknown): value is StoredViSemanticNarrative {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredViSemanticNarrative).narrative === 'string' &&
    Array.isArray((value as StoredViSemanticNarrative).changedSurfaces)
  );
}

/**
 * File-backed narrative cache. Stores `<key>.json` under the cache directory.
 * `get` treats any read/parse failure as a miss; `set` writes best-effort and
 * never throws into the caller, because a failed cache write must never fail a
 * comparison.
 */
export function createFileViSemanticNarrativeCache(
  options: FileViSemanticNarrativeCacheOptions,
  fsDeps: FileViSemanticNarrativeCacheFsDeps
): ViSemanticNarrativeCache {
  function cacheFilePath(key: string): string {
    return options.joinPath(options.cacheDirectory, `${key}.json`);
  }

  return {
    async get(key) {
      if (!isValidKey(key)) {
        return undefined;
      }
      try {
        const parsed: unknown = JSON.parse(await fsDeps.readFile(cacheFilePath(key)));
        if (!isStoredNarrative(parsed)) {
          return undefined;
        }
        return { narrative: parsed.narrative, changedSurfaces: parsed.changedSurfaces };
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      if (!isValidKey(key)) {
        return;
      }
      try {
        await fsDeps.ensureDirectory(options.cacheDirectory);
        await fsDeps.writeFile(cacheFilePath(key), JSON.stringify(value));
      } catch {
        // Best-effort: a cache write failure must never fail the comparison.
      }
    }
  };
}

/** Signatures of the two compared sides of a VI (opaque content identifiers). */
export interface ViComparisonSignatures {
  baseSignature: string;
  selectedSignature: string;
}

export interface RecordViSemanticNarrativeInput {
  relativePath: string;
  reportHtml: string;
  reportFilePath?: string;
  signatures: ViComparisonSignatures;
}

/**
 * Projects a produced comparison report onto the semantic model, derives the
 * narrative and changed surfaces, and writes them to the cache keyed by the
 * compared VI and its content signatures. Reuses the already-produced report
 * HTML and never invokes a LabVIEW runtime. Returns the stored value, or
 * undefined when the report shows no differences (in which case nothing is
 * cached, so no hover appears for an unchanged VI).
 */
export async function recordViSemanticNarrativeFromReport(
  input: RecordViSemanticNarrativeInput,
  cache: ViSemanticNarrativeCache
): Promise<StoredViSemanticNarrative | undefined> {
  const model = buildViSemanticComparisonModelFromHtml(input.reportHtml, {
    reportFilePath: input.reportFilePath
  });
  if (!model.hasDifferences) {
    return undefined;
  }
  const stored: StoredViSemanticNarrative = {
    narrative: model.narrative,
    changedSurfaces: model.changedSurfaces
  };
  await cache.set(
    computeViSemanticNarrativeCacheKey(
      input.relativePath,
      input.signatures.baseSignature,
      input.signatures.selectedSignature
    ),
    stored
  );
  return stored;
}
