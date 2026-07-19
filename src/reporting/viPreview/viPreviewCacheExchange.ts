import { createHash } from 'node:crypto';

import type { ViPreviewCacheBundleManifest } from './viPreviewCacheBundle';

/**
 * VHS-REQ-673: preview-cache exchange (publish / fetch planning).
 *
 * The exchange distributes portable preview-cache bundles (VHS-REQ-672) between
 * environments by attaching them to GitHub Releases, reusing the dev-tools
 * release-channel pattern (VHS-REQ-667): a single artifact plus a detached
 * manifest, addressed by a content digest so a bundle is published once and
 * de-duplicated on re-publish. This module is the PURE planning layer — it
 * derives the content-addressed release tag, decides publish-vs-skip against the
 * set of already-published tags, and selects which release to fetch — so the CLI
 * only wires the GitHub and filesystem boundaries around it.
 */

export const PREVIEW_CACHE_EXCHANGE_TAG_PREFIX = 'preview-cache-';

/**
 * Aggregate SHA-256 over a bundle manifest's entries (key + integrity digest,
 * sorted). Two bundles with the same set of content-addressed documents produce
 * the same digest regardless of build order, so the exchange can dedup them.
 */
export function computeBundleContentDigest(manifest: ViPreviewCacheBundleManifest): string {
  const lines = manifest.entries
    .map((entry) => `${entry.key}:${entry.integritySha256}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Content-addressed release tag for a bundle: `preview-cache-<12-hex>` from the
 * aggregate content digest. Stable for identical content, so re-publishing the
 * same bundle targets the same tag (and is skipped as already-present).
 */
export function deriveExchangeReleaseTag(manifest: ViPreviewCacheBundleManifest): string {
  return `${PREVIEW_CACHE_EXCHANGE_TAG_PREFIX}${computeBundleContentDigest(manifest).slice(0, 12)}`;
}

export type ViPreviewCacheExchangePublishAction = 'publish' | 'skip-existing' | 'skip-empty';

export interface ViPreviewCacheExchangePublishPlan {
  action: ViPreviewCacheExchangePublishAction;
  tag: string;
  contentDigest: string;
  entryCount: number;
}

/**
 * Plans publishing a bundle to the exchange. An empty bundle is `skip-empty`; a
 * bundle whose content-addressed tag is already published is `skip-existing`
 * (idempotent re-publish); otherwise `publish`. Pure over the manifest and the
 * set of existing tags.
 */
export function planExchangePublish(
  manifest: ViPreviewCacheBundleManifest,
  existingTags: readonly string[]
): ViPreviewCacheExchangePublishPlan {
  const contentDigest = computeBundleContentDigest(manifest);
  const tag = deriveExchangeReleaseTag(manifest);
  if (manifest.entries.length === 0) {
    return { action: 'skip-empty', tag, contentDigest, entryCount: 0 };
  }
  const existing = new Set(existingTags);
  return {
    action: existing.has(tag) ? 'skip-existing' : 'publish',
    tag,
    contentDigest,
    entryCount: manifest.entries.length
  };
}

/** One release visible on the exchange, as needed for fetch selection. */
export interface ViPreviewCacheExchangeRelease {
  tag: string;
  /** ISO timestamp used to pick the most recent when no explicit tag is given. */
  createdAt?: string;
}

/**
 * Selects which exchange release to fetch: the one matching an explicit `tag`
 * when provided, otherwise the most recently created `preview-cache-*` release.
 * Returns undefined when nothing matches. Pure over the release list.
 */
export function selectExchangeReleaseToFetch(
  releases: readonly ViPreviewCacheExchangeRelease[],
  options: { tag?: string } = {}
): ViPreviewCacheExchangeRelease | undefined {
  if (options.tag) {
    return releases.find((release) => release.tag === options.tag);
  }
  const cacheReleases = releases
    .filter((release) => release.tag.startsWith(PREVIEW_CACHE_EXCHANGE_TAG_PREFIX))
    .slice()
    .sort((a, b) => {
      const at = a.createdAt ?? '';
      const bt = b.createdAt ?? '';
      // Most recent first; ties broken by tag for determinism.
      if (at !== bt) {
        return at < bt ? 1 : -1;
      }
      return a.tag < b.tag ? 1 : a.tag > b.tag ? -1 : 0;
    });
  return cacheReleases[0];
}
