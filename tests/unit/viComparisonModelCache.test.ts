// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the content-addressed comparison-model cache key and the
// file-backed store used to skip the container comparison on re-runs
// (VHS-REQ-662.8).
import { describe, expect, it } from 'vitest';

import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';
import {
  computeViComparisonModelCacheKey,
  createFileViComparisonModelCache,
  type FileViComparisonModelCacheFsDeps
} from '../../src/semantic/viComparisonModelCache';

// The cache mechanics only depend on the schema-guard fields, so a compact
// stand-in model keeps the round-trip assertions focused.
function model(overrides: Partial<ViSemanticComparisonModel> = {}): ViSemanticComparisonModel {
  return {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    hasDifferences: true,
    narrative: 'Block diagram changed.',
    changedSurfaces: ['block-diagram'],
    ...overrides
  } as unknown as ViSemanticComparisonModel;
}

function memoryFs(): {
  files: Map<string, string>;
  ensured: Set<string>;
  deps: FileViComparisonModelCacheFsDeps;
} {
  const files = new Map<string, string>();
  const ensured = new Set<string>();
  return {
    files,
    ensured,
    deps: {
      ensureDirectory: async (directory) => {
        ensured.add(directory);
      },
      readFile: async (filePath) => {
        const contents = files.get(filePath);
        if (contents === undefined) {
          throw new Error(`ENOENT: ${filePath}`);
        }
        return contents;
      },
      writeFile: async (filePath, data) => {
        files.set(filePath, data);
      }
    }
  };
}

const OPTIONS = {
  cacheDirectory: '/cache',
  joinPath: (directory: string, name: string) => `${directory}/${name}`
};

describe('computeViComparisonModelCacheKey', () => {
  it('is a deterministic 64-character hex digest', () => {
    const key = computeViComparisonModelCacheKey('vis/A.vi', 'base', 'selected', 'diff');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(computeViComparisonModelCacheKey('vis/A.vi', 'base', 'selected', 'diff')).toBe(key);
  });

  it('normalizes backslash paths so a VI has one key across platforms', () => {
    expect(computeViComparisonModelCacheKey('vis\\A.vi', 'b', 's', 'diff')).toBe(
      computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'diff')
    );
  });

  it('changes when the path, either signature, or the report type changes', () => {
    const base = computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'diff');
    expect(computeViComparisonModelCacheKey('vis/B.vi', 'b', 's', 'diff')).not.toBe(base);
    expect(computeViComparisonModelCacheKey('vis/A.vi', 'b2', 's', 'diff')).not.toBe(base);
    expect(computeViComparisonModelCacheKey('vis/A.vi', 'b', 's2', 'diff')).not.toBe(base);
    expect(computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'print')).not.toBe(base);
  });
});

describe('createFileViComparisonModelCache', () => {
  it('round-trips a stored model through set then get', async () => {
    const fs = memoryFs();
    const cache = createFileViComparisonModelCache(OPTIONS, fs.deps);
    const key = computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'diff');

    await cache.set(key, model({ narrative: 'Front panel changed.' }));
    expect(fs.ensured.has('/cache')).toBe(true);

    const loaded = await cache.get(key);
    expect(loaded?.narrative).toBe('Front panel changed.');
    expect(loaded?.schema).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
  });

  it('treats a non-64-hex key as a miss and never touches the store', async () => {
    const fs = memoryFs();
    const cache = createFileViComparisonModelCache(OPTIONS, fs.deps);

    await cache.set('not-a-valid-key', model());
    expect(fs.files.size).toBe(0);
    expect(await cache.get('not-a-valid-key')).toBeUndefined();
  });

  it('treats a missing file as a miss', async () => {
    const fs = memoryFs();
    const cache = createFileViComparisonModelCache(OPTIONS, fs.deps);
    const key = computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'diff');

    expect(await cache.get(key)).toBeUndefined();
  });

  it('treats a schema-drifted or malformed stored value as a miss', async () => {
    const fs = memoryFs();
    const cache = createFileViComparisonModelCache(OPTIONS, fs.deps);
    const key = computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'diff');
    const filePath = `/cache/${key}.json`;

    fs.files.set(filePath, JSON.stringify({ schema: 'other@v9', hasDifferences: true }));
    expect(await cache.get(key)).toBeUndefined();

    fs.files.set(filePath, 'not json');
    expect(await cache.get(key)).toBeUndefined();
  });

  it('is best-effort on write: a failing writeFile never throws into the caller', async () => {
    const fs = memoryFs();
    const failing: FileViComparisonModelCacheFsDeps = {
      ...fs.deps,
      writeFile: async () => {
        throw new Error('disk full');
      }
    };
    const cache = createFileViComparisonModelCache(OPTIONS, failing);
    const key = computeViComparisonModelCacheKey('vis/A.vi', 'b', 's', 'diff');

    await expect(cache.set(key, model())).resolves.toBeUndefined();
  });
});
