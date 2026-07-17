import { createHash } from 'node:crypto';
import { isSha256HexKey as isValidKey } from '../support/cacheKey';

import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from './viSemanticModel';

/**
 * VHS-REQ-662.8: content-addressed cache of computed VI comparison models.
 *
 * Producing a `ViSemanticComparisonModel` for a revision pair requires a
 * LabVIEW comparison in a container and takes minutes, but the produced model
 * is fully determined by the two compared revision trees and the report type.
 * This cache stores the produced model keyed by each side's revision commit
 * signature so a re-run of the same comparison (a repeated agent query, a
 * re-triggered CI review) reuses the model and skips the container run. The
 * on-disk report is
 * not cached, so a hit reuses the model and narrative but not the visual report
 * (mirroring the `--from-file` review tradeoff).
 */

/**
 * Deterministic SHA-256 key over the repository-relative path, the two revision
 * commit signatures of the compared sides, and the report type. The path is
 * folded in first so two VIs never collide; a change to either side's signature
 * or the report type yields a different key, so the cache never returns a model
 * produced for a different comparison.
 */
export function computeViComparisonModelCacheKey(
  relativePath: string,
  baseSignature: string,
  selectedSignature: string,
  reportType: string
): string {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return createHash('sha256')
    .update(
      `path:${normalizedPath}\nbase:${baseSignature}\nselected:${selectedSignature}\ntype:${reportType}`
    )
    .digest('hex');
}

export interface ViComparisonModelCache {
  get(key: string): Promise<ViSemanticComparisonModel | undefined>;
  set(key: string, model: ViSemanticComparisonModel): Promise<void>;
}

export interface FileViComparisonModelCacheFsDeps {
  ensureDirectory: (directory: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: string) => Promise<void>;
}

export interface FileViComparisonModelCacheOptions {
  cacheDirectory: string;
  joinPath: (directory: string, name: string) => string;
}

/**
 * Structural guard mirroring the narrative cache: a stored value is only reused
 * when it is an object carrying the current comparison-model schema id plus the
 * fields consumers rely on, so a truncated, hand-edited, or schema-drifted file
 * is treated as a miss rather than surfaced as a bad model.
 */
function isViSemanticComparisonModel(value: unknown): value is ViSemanticComparisonModel {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const model = value as ViSemanticComparisonModel;
  return (
    model.schema === VI_SEMANTIC_COMPARISON_SCHEMA &&
    typeof model.hasDifferences === 'boolean' &&
    typeof model.narrative === 'string' &&
    Array.isArray(model.changedSurfaces)
  );
}

/**
 * File-backed model cache. Stores `<key>.json` under the cache directory. `get`
 * treats any read/parse failure or a value that is not a current-schema model
 * as a miss; `set` writes best-effort and never throws into the caller, because
 * a failed cache write must never fail a comparison.
 */
export function createFileViComparisonModelCache(
  options: FileViComparisonModelCacheOptions,
  fsDeps: FileViComparisonModelCacheFsDeps
): ViComparisonModelCache {
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
        return isViSemanticComparisonModel(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, model) {
      if (!isValidKey(key)) {
        return;
      }
      try {
        await fsDeps.ensureDirectory(options.cacheDirectory);
        await fsDeps.writeFile(cacheFilePath(key), JSON.stringify(model));
      } catch {
        // Best-effort: a cache write failure must never fail the comparison.
      }
    }
  };
}
