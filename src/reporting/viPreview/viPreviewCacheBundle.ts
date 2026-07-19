import { createHash } from 'node:crypto';

import { isSha256HexKey } from '../../support/cacheKey';

/**
 * VHS-REQ-672: portable, content-addressed preview-cache bundle.
 *
 * A bundle packages a set of rendered preview documents (each keyed by the
 * content-addressed cache key from VHS-REQ-659) into a self-describing,
 * verifiable, mergeable artifact so a cache generated in one environment (a
 * Codespace worker, a CI fleet — VHS-REQ-671) can be moved to and reused in
 * another. Each entry carries an integrity digest of its document bytes and the
 * VI path(s) it renders, so a consumer can verify a bundle before trusting it
 * and merge it losslessly into a local cache (content-addressing makes the
 * merge order-independent and de-duplicating).
 *
 * This module is the PURE model: manifest construction, integrity verification,
 * and merge planning operate on in-memory `{key, html}` records. The CLI wires
 * the filesystem (reading a cache directory, writing a bundle, importing into a
 * target cache) around these pure functions.
 */

export const PREVIEW_CACHE_BUNDLE_SCHEMA = 'vi-history-suite/preview-cache-bundle@v1';

/** One document to include in a bundle. */
export interface ViPreviewCacheBundleInput {
  /** Content-addressed cache key (sha256 hex). */
  key: string;
  /** The rendered preview HTML document. */
  html: string;
  /** VI path(s) this document renders (repo-relative), for the human-readable manifest. */
  viPaths?: readonly string[];
}

/** One entry recorded in a bundle manifest. */
export interface ViPreviewCacheBundleManifestEntry {
  /** Content-addressed cache key (sha256 hex); also the `<key>.html` file name. */
  key: string;
  /** SHA-256 hex digest of the document bytes (integrity check on import). */
  integritySha256: string;
  /** Byte length of the document. */
  bytes: number;
  /** VI path(s) this document renders, sorted; empty when unknown. */
  viPaths: string[];
}

/** Optional provenance for a bundle. */
export interface ViPreviewCacheBundleProvenance {
  generatedAt: string;
  /** Free-form source label (e.g. "codespace:<name>" or "ci:<run>"). */
  source?: string;
}

/** The self-describing bundle manifest. */
export interface ViPreviewCacheBundleManifest {
  $schema: typeof PREVIEW_CACHE_BUNDLE_SCHEMA;
  schemaVersion: 1;
  entryCount: number;
  totalBytes: number;
  entries: ViPreviewCacheBundleManifestEntry[];
  provenance?: ViPreviewCacheBundleProvenance;
}

/** Computes the integrity digest of a document's bytes. */
export function computeBundleIntegrity(html: string): string {
  return createHash('sha256').update(Buffer.from(html, 'utf8')).digest('hex');
}

/**
 * Builds a bundle manifest from a set of documents. Invalid keys are dropped,
 * duplicate keys are collapsed (first wins; their viPaths merged), and entries
 * are sorted by key so the manifest is deterministic and content-addressed.
 */
export function buildViPreviewCacheBundleManifest(
  inputs: readonly ViPreviewCacheBundleInput[],
  provenance?: ViPreviewCacheBundleProvenance
): ViPreviewCacheBundleManifest {
  const byKey = new Map<string, { html: string; viPaths: Set<string> }>();
  for (const input of inputs) {
    if (!isSha256HexKey(input.key)) {
      continue;
    }
    let record = byKey.get(input.key);
    if (!record) {
      record = { html: input.html, viPaths: new Set<string>() };
      byKey.set(input.key, record);
    }
    for (const viPath of input.viPaths ?? []) {
      record.viPaths.add(viPath.replace(/\\/g, '/'));
    }
  }

  const entries: ViPreviewCacheBundleManifestEntry[] = Array.from(byKey.entries())
    .map(([key, record]) => ({
      key,
      integritySha256: computeBundleIntegrity(record.html),
      bytes: Buffer.byteLength(record.html, 'utf8'),
      viPaths: Array.from(record.viPaths).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  return {
    $schema: PREVIEW_CACHE_BUNDLE_SCHEMA,
    schemaVersion: 1,
    entryCount: entries.length,
    totalBytes,
    entries,
    ...(provenance ? { provenance } : {})
  };
}

/** Result of verifying one bundle document against its manifest entry. */
export type ViPreviewCacheBundleVerifyStatus = 'ok' | 'integrity-mismatch' | 'missing-document';

/**
 * Verifies a bundle's documents against its manifest. `documents` maps key to
 * the document bytes read from the bundle. Every manifest entry must have a
 * document whose digest matches; a missing document or a digest mismatch is
 * reported (never thrown) so a caller can fail closed on a tampered/corrupt
 * bundle.
 */
export interface ViPreviewCacheBundleVerifyResult {
  ok: boolean;
  entries: Array<{ key: string; status: ViPreviewCacheBundleVerifyStatus }>;
}

export function verifyViPreviewCacheBundle(
  manifest: ViPreviewCacheBundleManifest,
  documents: ReadonlyMap<string, string>
): ViPreviewCacheBundleVerifyResult {
  const entries = manifest.entries.map((entry) => {
    const html = documents.get(entry.key);
    if (html === undefined) {
      return { key: entry.key, status: 'missing-document' as const };
    }
    if (computeBundleIntegrity(html) !== entry.integritySha256) {
      return { key: entry.key, status: 'integrity-mismatch' as const };
    }
    return { key: entry.key, status: 'ok' as const };
  });
  return { ok: entries.every((entry) => entry.status === 'ok'), entries };
}

/** Per-entry disposition when merging a bundle into a target cache. */
export type ViPreviewCacheBundleImportAction = 'add' | 'skip-present' | 'reject-integrity-mismatch';

export interface ViPreviewCacheBundleImportPlanEntry {
  key: string;
  action: ViPreviewCacheBundleImportAction;
}

export interface ViPreviewCacheBundleImportPlan {
  entries: ViPreviewCacheBundleImportPlanEntry[];
  /** Keys to write into the target cache (the `add` entries). */
  toAdd: string[];
  added: number;
  skippedPresent: number;
  rejected: number;
}

/**
 * Plans a lossless merge of a verified bundle into a target cache. Content-
 * addressing makes the merge safe: a key already present in the target is
 * skipped (identical content by construction), a key whose bundle document
 * fails its integrity digest is rejected (never written), and the rest are
 * added. Pure: the caller performs the actual copies for `toAdd`.
 */
export function planViPreviewCacheBundleImport(
  manifest: ViPreviewCacheBundleManifest,
  documents: ReadonlyMap<string, string>,
  presentTargetKeys: ReadonlySet<string>
): ViPreviewCacheBundleImportPlan {
  const entries: ViPreviewCacheBundleImportPlanEntry[] = [];
  const toAdd: string[] = [];
  let added = 0;
  let skippedPresent = 0;
  let rejected = 0;

  for (const entry of manifest.entries) {
    const html = documents.get(entry.key);
    if (html === undefined || computeBundleIntegrity(html) !== entry.integritySha256) {
      entries.push({ key: entry.key, action: 'reject-integrity-mismatch' });
      rejected += 1;
      continue;
    }
    if (presentTargetKeys.has(entry.key)) {
      entries.push({ key: entry.key, action: 'skip-present' });
      skippedPresent += 1;
      continue;
    }
    entries.push({ key: entry.key, action: 'add' });
    toAdd.push(entry.key);
    added += 1;
  }

  return { entries, toAdd, added, skippedPresent, rejected };
}
