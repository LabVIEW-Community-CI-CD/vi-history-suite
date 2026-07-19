import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  PREVIEW_CACHE_BUNDLE_SCHEMA,
  buildViPreviewCacheBundleManifest,
  computeBundleIntegrity,
  planViPreviewCacheBundleImport,
  verifyViPreviewCacheBundle
} from '../../src/reporting/viPreview/viPreviewCacheBundle';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const KEY_C = 'c'.repeat(64);

function sha256(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

describe('computeBundleIntegrity (VHS-REQ-672.1)', () => {
  it('is the sha256 of the document bytes', () => {
    expect(computeBundleIntegrity('<html>x</html>')).toBe(sha256('<html>x</html>'));
  });
});

describe('buildViPreviewCacheBundleManifest (VHS-REQ-672.1)', () => {
  it('builds a self-describing, sorted, integrity-bearing manifest', () => {
    const manifest = buildViPreviewCacheBundleManifest([
      { key: KEY_B, html: '<b/>', viPaths: ['z/B.vi'] },
      { key: KEY_A, html: '<a/>', viPaths: ['a/A.vi'] }
    ]);
    expect(manifest.$schema).toBe(PREVIEW_CACHE_BUNDLE_SCHEMA);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.entryCount).toBe(2);
    expect(manifest.totalBytes).toBe(Buffer.byteLength('<a/>') + Buffer.byteLength('<b/>'));
    // Sorted by key (content-addressed order).
    expect(manifest.entries.map((e) => e.key)).toEqual([KEY_A, KEY_B]);
    expect(manifest.entries[0]).toMatchObject({
      key: KEY_A,
      integritySha256: sha256('<a/>'),
      bytes: 4,
      viPaths: ['a/A.vi']
    });
  });

  it('drops invalid keys and collapses duplicates, merging their VI paths', () => {
    const manifest = buildViPreviewCacheBundleManifest([
      { key: 'not-a-key', html: '<x/>' },
      { key: KEY_A, html: '<a/>', viPaths: ['a/A.vi'] },
      { key: KEY_A, html: '<a/>', viPaths: ['dup/A2.vi'] }
    ]);
    expect(manifest.entryCount).toBe(1);
    expect(manifest.entries[0].viPaths).toEqual(['a/A.vi', 'dup/A2.vi']);
  });

  it('records provenance when supplied', () => {
    const manifest = buildViPreviewCacheBundleManifest([{ key: KEY_A, html: '<a/>' }], {
      generatedAt: '2026-07-19T00:00:00.000Z',
      source: 'codespace:demo'
    });
    expect(manifest.provenance).toEqual({
      generatedAt: '2026-07-19T00:00:00.000Z',
      source: 'codespace:demo'
    });
  });

  it('normalizes backslash VI paths to forward slashes', () => {
    const manifest = buildViPreviewCacheBundleManifest([
      { key: KEY_A, html: '<a/>', viPaths: ['sub\\Nested.vi'] }
    ]);
    expect(manifest.entries[0].viPaths).toEqual(['sub/Nested.vi']);
  });
});

describe('verifyViPreviewCacheBundle (VHS-REQ-672.2)', () => {
  const manifest = buildViPreviewCacheBundleManifest([
    { key: KEY_A, html: '<a/>' },
    { key: KEY_B, html: '<b/>' }
  ]);

  it('passes when every document matches its integrity digest', () => {
    const result = verifyViPreviewCacheBundle(
      manifest,
      new Map([
        [KEY_A, '<a/>'],
        [KEY_B, '<b/>']
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.entries.every((e) => e.status === 'ok')).toBe(true);
  });

  it('fails on a tampered document', () => {
    const result = verifyViPreviewCacheBundle(
      manifest,
      new Map([
        [KEY_A, '<a/>'],
        [KEY_B, '<TAMPERED/>']
      ])
    );
    expect(result.ok).toBe(false);
    expect(result.entries.find((e) => e.key === KEY_B)?.status).toBe('integrity-mismatch');
  });

  it('fails on a missing document', () => {
    const result = verifyViPreviewCacheBundle(manifest, new Map([[KEY_A, '<a/>']]));
    expect(result.ok).toBe(false);
    expect(result.entries.find((e) => e.key === KEY_B)?.status).toBe('missing-document');
  });
});

describe('planViPreviewCacheBundleImport (VHS-REQ-672.3)', () => {
  const manifest = buildViPreviewCacheBundleManifest([
    { key: KEY_A, html: '<a/>' },
    { key: KEY_B, html: '<b/>' },
    { key: KEY_C, html: '<c/>' }
  ]);
  const documents = new Map([
    [KEY_A, '<a/>'],
    [KEY_B, '<b/>'],
    [KEY_C, '<c/>']
  ]);

  it('adds absent keys, skips present ones, and rejects integrity mismatches (lossless merge)', () => {
    const tampered = new Map(documents);
    tampered.set(KEY_C, '<WRONG/>');
    const plan = planViPreviewCacheBundleImport(manifest, tampered, new Set([KEY_A]));
    const byKey = Object.fromEntries(plan.entries.map((e) => [e.key, e.action]));
    expect(byKey[KEY_A]).toBe('skip-present');
    expect(byKey[KEY_B]).toBe('add');
    expect(byKey[KEY_C]).toBe('reject-integrity-mismatch');
    expect(plan.toAdd).toEqual([KEY_B]);
    expect(plan).toMatchObject({ added: 1, skippedPresent: 1, rejected: 1 });
  });

  it('rejects an entry whose document is missing from the bundle', () => {
    const plan = planViPreviewCacheBundleImport(manifest, new Map([[KEY_A, '<a/>']]), new Set());
    expect(plan.rejected).toBe(2); // KEY_B, KEY_C missing
    expect(plan.toAdd).toEqual([KEY_A]);
  });
});
