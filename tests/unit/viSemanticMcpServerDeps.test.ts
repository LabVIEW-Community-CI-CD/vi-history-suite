// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the MCP server dependency wiring - that all four tools are
// injected and compare_vi_revisions is bound to the shared comparison-model
// cache (VHS-REQ-662.7, VHS-REQ-662.8).
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildViSemanticMcpServerDeps,
  createDefaultComparisonModelCache
} from '../../src/mcp/viSemanticMcpServerDeps';
import type {
  CompareViRevisionsDeps,
  CompareViRevisionsInput,
  CompareViRevisionsResult
} from '../../src/semantic/compareViRevisions';
import {
  computeViComparisonModelCacheKey,
  type ViComparisonModelCache
} from '../../src/semantic/viComparisonModelCache';
import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';

const cache: ViComparisonModelCache = {
  get: async () => undefined,
  set: async () => {}
};

describe('buildViSemanticMcpServerDeps', () => {
  it('wires all four VI semantic MCP tools', () => {
    const deps = buildViSemanticMcpServerDeps(cache);
    expect(typeof deps.compareViRevisions).toBe('function');
    expect(typeof deps.buildViSemanticHistory).toBe('function');
    expect(typeof deps.buildViRepositoryIndex).toBe('function');
    expect(typeof deps.buildViSemanticPrReview).toBe('function');
  });

  it('binds compare_vi_revisions to the shared comparison-model cache', async () => {
    const compareFn = vi.fn(
      async (
        _input: CompareViRevisionsInput,
        _deps?: CompareViRevisionsDeps
      ): Promise<CompareViRevisionsResult> => ({ status: 'failed', reason: 'stub' })
    );
    const deps = buildViSemanticMcpServerDeps(cache, compareFn);
    const input: CompareViRevisionsInput = {
      repositoryRoot: '/repo',
      relativePath: 'vis/A.vi',
      baseHash: 'aaaa',
      selectedHash: 'bbbb'
    };

    await deps.compareViRevisions?.(input);

    expect(compareFn).toHaveBeenCalledWith(input, { comparisonModelCache: cache });
  });
});

describe('createDefaultComparisonModelCache', () => {
  it('returns a cache exposing get and set operations', () => {
    const created = createDefaultComparisonModelCache();
    expect(typeof created.get).toBe('function');
    expect(typeof created.set).toBe('function');
  });

  it('round-trips a model through the OS temp-dir file store (exercises the fs deps)', async () => {
    const created = createDefaultComparisonModelCache();
    // A unique key keeps the round-trip isolated from other runs sharing the
    // fixed OS temp cache directory.
    const key = computeViComparisonModelCacheKey(
      'vis/RoundTrip.vi',
      `base-${process.pid}-${Date.now()}`,
      `selected-${process.pid}-${Date.now()}`,
      'diff'
    );
    const model: ViSemanticComparisonModel = {
      schema: VI_SEMANTIC_COMPARISON_SCHEMA,
      vi: { title: 'RoundTrip.vi' },
      hasDifferences: true,
      changedSurfaces: ['block-diagram'],
      attributes: { included: [], excluded: [] },
      overviewSections: [],
      detailSections: [],
      totals: {
        changedSurfaceCount: 1,
        overviewImageCount: 0,
        detailSectionCount: 0,
        detailItemCount: 0,
        includedAttributeCount: 0,
        excludedAttributeCount: 0
      },
      narrative: 'round-trip narrative'
    };
    const cacheFile = path.join(os.tmpdir(), 'vihs-vi-comparison-cache', `${key}.json`);
    try {
      await created.set(key, model);
      await expect(created.get(key)).resolves.toEqual(model);
    } finally {
      await fsp.rm(cacheFile, { force: true });
    }
  });
});
