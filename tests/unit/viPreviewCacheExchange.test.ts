import { describe, expect, it } from 'vitest';

import {
  PREVIEW_CACHE_EXCHANGE_TAG_PREFIX,
  computeBundleContentDigest,
  deriveExchangeReleaseTag,
  planExchangePublish,
  selectExchangeReleaseToFetch
} from '../../src/reporting/viPreview/viPreviewCacheExchange';
import type { ViPreviewCacheBundleManifest } from '../../src/reporting/viPreview/viPreviewCacheBundle';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

function manifest(
  entries: Array<{ key: string; integritySha256: string }>
): ViPreviewCacheBundleManifest {
  return {
    $schema: 'vi-history-suite/preview-cache-bundle@v1',
    schemaVersion: 1,
    entryCount: entries.length,
    totalBytes: 0,
    entries: entries.map((e) => ({ ...e, bytes: 0, viPaths: [] }))
  };
}

describe('computeBundleContentDigest / deriveExchangeReleaseTag (VHS-REQ-673.1)', () => {
  it('is order-independent over the bundle entries', () => {
    const a = computeBundleContentDigest(
      manifest([
        { key: KEY_A, integritySha256: 'aa' },
        { key: KEY_B, integritySha256: 'bb' }
      ])
    );
    const b = computeBundleContentDigest(
      manifest([
        { key: KEY_B, integritySha256: 'bb' },
        { key: KEY_A, integritySha256: 'aa' }
      ])
    );
    expect(a).toBe(b);
  });

  it('changes when a document integrity digest changes', () => {
    const base = computeBundleContentDigest(manifest([{ key: KEY_A, integritySha256: 'aa' }]));
    const changed = computeBundleContentDigest(manifest([{ key: KEY_A, integritySha256: 'ZZ' }]));
    expect(changed).not.toBe(base);
  });

  it('derives a preview-cache-<12hex> tag', () => {
    const tag = deriveExchangeReleaseTag(manifest([{ key: KEY_A, integritySha256: 'aa' }]));
    expect(tag).toMatch(new RegExp(`^${PREVIEW_CACHE_EXCHANGE_TAG_PREFIX}[a-f0-9]{12}$`));
  });
});

describe('planExchangePublish (VHS-REQ-673.1)', () => {
  const m = manifest([{ key: KEY_A, integritySha256: 'aa' }]);

  it('publishes a new bundle', () => {
    const plan = planExchangePublish(m, []);
    expect(plan.action).toBe('publish');
    expect(plan.entryCount).toBe(1);
  });

  it('skips a bundle whose content-addressed tag is already published (idempotent)', () => {
    const tag = deriveExchangeReleaseTag(m);
    expect(planExchangePublish(m, [tag]).action).toBe('skip-existing');
  });

  it('skips an empty bundle', () => {
    expect(planExchangePublish(manifest([]), []).action).toBe('skip-empty');
  });
});

describe('selectExchangeReleaseToFetch (VHS-REQ-673.2)', () => {
  const releases = [
    { tag: 'preview-cache-111111111111', createdAt: '2026-07-01T00:00:00Z' },
    { tag: 'preview-cache-222222222222', createdAt: '2026-07-19T00:00:00Z' },
    { tag: 'v1.34.2', createdAt: '2026-07-18T00:00:00Z' }
  ];

  it('selects an explicit tag when given', () => {
    expect(selectExchangeReleaseToFetch(releases, { tag: 'preview-cache-111111111111' })?.tag).toBe(
      'preview-cache-111111111111'
    );
  });

  it('selects the most recent preview-cache release by default (ignoring non-cache tags)', () => {
    expect(selectExchangeReleaseToFetch(releases)?.tag).toBe('preview-cache-222222222222');
  });

  it('returns undefined when nothing matches', () => {
    expect(selectExchangeReleaseToFetch([{ tag: 'v1.0.0' }])).toBeUndefined();
    expect(selectExchangeReleaseToFetch(releases, { tag: 'preview-cache-nope' })).toBeUndefined();
  });
});
