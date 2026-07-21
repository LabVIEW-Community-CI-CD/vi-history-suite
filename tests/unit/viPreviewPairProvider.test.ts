import { describe, expect, it, vi } from 'vitest';

import {
  createCachePeekPreviewPairProvider,
  type PeekRevisionPreviewInput,
  type PeekRevisionPreviewResult
} from '../../src/semantic/viPreviewPairProvider';

// Cache-peek preview-pair provider — epic #2262 iteration 2.5 (VHS-REQ-703.4).
// Pure orchestration over an injected cache-only peek boundary; reports preview
// availability HONESTLY (hit => available, miss/error => unavailable) and
// resolves base/head independently.

const input = {
  repositoryRoot: '/repo',
  relativePath: 'src/A.vi',
  baseHash: 'aaaa',
  selectedHash: 'bbbb'
};

describe('createCachePeekPreviewPairProvider (VHS-REQ-703.4)', () => {
  it('maps a genuine cache hit to an available reference with revision/key/image count', async () => {
    const peek = vi.fn(
      async (i: PeekRevisionPreviewInput): Promise<PeekRevisionPreviewResult> => ({
        available: true,
        cacheKey: i.side === 'base' ? 'key-base' : 'key-head',
        inlineImageCount: i.side === 'base' ? 3 : 4
      })
    );
    const resolve = createCachePeekPreviewPairProvider({ peekRevisionPreview: peek });
    const pair = await resolve(input);

    expect(pair.base).toEqual({
      available: true,
      relativePath: 'src/A.vi',
      revision: 'aaaa',
      cacheKey: 'key-base',
      inlineImageCount: 3
    });
    expect(pair.head).toEqual({
      available: true,
      relativePath: 'src/A.vi',
      revision: 'bbbb',
      cacheKey: 'key-head',
      inlineImageCount: 4
    });
  });

  it('reports a cache miss as honestly unavailable (never fabricated)', async () => {
    const resolve = createCachePeekPreviewPairProvider({
      peekRevisionPreview: async () => ({ available: false })
    });
    const pair = await resolve(input);
    expect(pair.base).toEqual({ available: false });
    expect(pair.head).toEqual({ available: false });
  });

  it('resolves base and head independently — one side missing never suppresses the other', async () => {
    const resolve = createCachePeekPreviewPairProvider({
      peekRevisionPreview: async (i) =>
        i.side === 'head' ? { available: true, cacheKey: 'k' } : { available: false }
    });
    const pair = await resolve(input);
    expect(pair.base?.available).toBe(false);
    expect(pair.head?.available).toBe(true);
    expect(pair.head?.revision).toBe('bbbb');
  });

  it('treats a peek that throws as unavailable for that side only', async () => {
    const resolve = createCachePeekPreviewPairProvider({
      peekRevisionPreview: async (i) => {
        if (i.side === 'base') {
          throw new Error('unexpected peek failure');
        }
        return { available: true };
      }
    });
    const pair = await resolve(input);
    expect(pair.base).toEqual({ available: false });
    expect(pair.head?.available).toBe(true);
  });

  it('omits cacheKey/inlineImageCount when the peek does not supply them', async () => {
    const resolve = createCachePeekPreviewPairProvider({
      peekRevisionPreview: async () => ({ available: true })
    });
    const pair = await resolve(input);
    expect(pair.base).toEqual({ available: true, relativePath: 'src/A.vi', revision: 'aaaa' });
    expect(pair.base && 'cacheKey' in pair.base).toBe(false);
    expect(pair.base && 'inlineImageCount' in pair.base).toBe(false);
  });

  it('passes the repository root, relative path, and per-side revision to the peek', async () => {
    const seen: PeekRevisionPreviewInput[] = [];
    const resolve = createCachePeekPreviewPairProvider({
      peekRevisionPreview: async (i) => {
        seen.push(i);
        return { available: false };
      }
    });
    await resolve(input);
    expect(seen).toContainEqual({
      repositoryRoot: '/repo',
      relativePath: 'src/A.vi',
      revision: 'aaaa',
      side: 'base'
    });
    expect(seen).toContainEqual({
      repositoryRoot: '/repo',
      relativePath: 'src/A.vi',
      revision: 'bbbb',
      side: 'head'
    });
  });
});
