// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the MCP server dependency wiring - that all four tools are
// injected and compare_vi_revisions is bound to the shared comparison-model
// cache (VHS-REQ-662.7, VHS-REQ-662.8).
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
import type { ViComparisonModelCache } from '../../src/semantic/viComparisonModelCache';

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
});
