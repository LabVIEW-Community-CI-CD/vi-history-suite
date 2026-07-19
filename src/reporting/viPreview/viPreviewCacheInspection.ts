import { isSha256HexKey } from '../../support/cacheKey';
import {
  assessFramesModelFidelity,
  buildFramesModelFromFlatExport
} from './viPreviewFlatFrames';

/**
 * VHS-REQ-659: read-only inspection of a VI-preview render cache directory.
 *
 * The single-VI preview render cache stores each rendered document as
 * `<sha256-hex>.html` under a cache directory (see `createFileViPreviewCache`).
 * This module inspects such a directory — enumerating entries, classifying each
 * document's health, summarizing the whole cache, fetching one entry, and
 * searching by content marker — so an agent (over the MCP surface) or an
 * operator (via the verify CLI) can reason about a downloaded/local cache
 * WITHOUT re-rendering. It is READ-ONLY and never launches LabVIEW.
 *
 * Every filesystem boundary is injected (`ViPreviewCacheInspectionFsDeps`) so
 * the logic is deterministically unit-testable without a real directory; the
 * MCP/CLI callers supply a node-fs adapter.
 */

const CACHE_FILE_SUFFIX = '.html';

/** Injected filesystem boundary for cache inspection (read-only). */
export interface ViPreviewCacheInspectionFsDeps {
  /** Lists file names directly under `directory` (non-recursive). */
  listFiles: (directory: string) => Promise<string[]>;
  /** Reads a cache document's UTF-8 contents. */
  readFile: (filePath: string) => Promise<string>;
  /** Returns a document's size in bytes (cheaper than reading it). */
  fileSizeBytes: (filePath: string) => Promise<number>;
  /** Joins a directory and a file name into a path. */
  joinPath: (directory: string, name: string) => string;
}

/** Health flags for a single cached preview document. */
export type ViPreviewCacheEntryFlag = 'empty' | 'error-marker' | 'no-rendered-content';

/** One cache entry's metadata (never the raw HTML). */
export interface ViPreviewCacheEntry {
  /** The cache key (file basename without `.html`); sha256-hex for real keys. */
  key: string;
  /** Absolute path to the cached document. */
  filePath: string;
  /** Document size in bytes. */
  bytes: number;
  /** Count of inline `data:image/...` occurrences (preview render images). */
  inlineImageCount: number;
  /**
   * True when an interactive block-diagram viewer would actually be presented
   * from this document. The cache stores NI's flat `PrintToSingleFileHtml` export
   * (the `lvr-frames` viewer island is injected only later by the display path),
   * so capability is derived exactly the way `selectViPreviewDocument` decides —
   * the flat export yields a block-diagram frames model AND that model is faithful
   * enough to present (a complex, coordinate-less diagram falls back to the flat
   * document; see `assessFramesModelFidelity`). An already-assembled viewer island
   * is also recognized.
   */
  interactive: boolean;
  /**
   * When `interactive` is false because a block-diagram frames model DID extract
   * but was too low-fidelity to present (a complex, coordinate-less diagram that
   * the display path falls back to the flat document for), the concise reason
   * from `assessFramesModelFidelity`. Undefined when the document is interactive,
   * or when it simply has no block diagram (e.g. a `.ctl`) — that is a plain
   * non-diagram document, not a fidelity fallback.
   */
  interactiveFallbackReason?: string;
  /** Health flags; empty means a healthy rendered preview. */
  flags: ViPreviewCacheEntryFlag[];
  /** Convenience: true when `flags` is empty. */
  healthy: boolean;
}

const ERROR_MARKER_PATTERN =
  /preview-cache-miss|error 1125|labview-preview-operation-load-failed|placeholder/i;
const RENDERED_CONTENT_PATTERN = /data:image\/|lvr-frames|difference-image/i;
const INLINE_IMAGE_PATTERN = /data:image\//gi;

/**
 * Whether a flat export would actually yield a presentable interactive viewer:
 * a block-diagram frames model extracts AND it is faithful enough to show (a
 * complex, coordinate-less diagram is rejected). Mirrors `selectViPreviewDocument`
 * so the cache's `interactive` signal matches what the display path would do.
 * When a model extracts but is not faithful, `fallbackReason` names why (an
 * absent model is a plain non-diagram document, so it carries no reason).
 */
function assessFlatExportInteractivity(html: string): {
  presentable: boolean;
  fallbackReason?: string;
} {
  const model = buildFramesModelFromFlatExport(html);
  if (model === undefined) {
    return { presentable: false };
  }
  const fidelity = assessFramesModelFidelity(model);
  if (fidelity.faithful) {
    return { presentable: true };
  }
  return { presentable: false, fallbackReason: fidelity.reason };
}

/**
 * Classifies a preview document's content into health flags plus derived
 * signals (inline image count, interactive-viewer presence). Pure over the
 * document text; the caller supplies the key and reads the file.
 */
export function classifyPreviewCacheDocument(content: string): {
  flags: ViPreviewCacheEntryFlag[];
  inlineImageCount: number;
  interactive: boolean;
  interactiveFallbackReason?: string;
} {
  const text = typeof content === 'string' ? content : '';
  const inlineImageCount = (text.match(INLINE_IMAGE_PATTERN) ?? []).length;
  // The cache stores the flat LabVIEW export, whose interactive viewer is only
  // built at display time; so derive interactive capability the way the display
  // path (`selectViPreviewDocument`) does — the flat export yields a block-diagram
  // frames model that is ALSO faithful enough to present (a complex diagram falls
  // back to the flat document), while still recognizing an already-assembled
  // viewer island (`lvr-frames`) for the case a viewer document is inspected.
  const hasViewerIsland = /lvr-frames/i.test(text);
  const flatInteractivity = hasViewerIsland
    ? { presentable: true as const, fallbackReason: undefined }
    : assessFlatExportInteractivity(text);
  const interactive = flatInteractivity.presentable;
  const interactiveFallbackReason = interactive ? undefined : flatInteractivity.fallbackReason;
  const flags: ViPreviewCacheEntryFlag[] = [];
  if (text.trim().length === 0) {
    flags.push('empty');
    return { flags, inlineImageCount, interactive, interactiveFallbackReason };
  }
  if (ERROR_MARKER_PATTERN.test(text)) {
    flags.push('error-marker');
  }
  if (!RENDERED_CONTENT_PATTERN.test(text)) {
    flags.push('no-rendered-content');
  }
  return { flags, inlineImageCount, interactive, interactiveFallbackReason };
}

function cacheKeyFromName(name: string): string {
  return name.endsWith(CACHE_FILE_SUFFIX) ? name.slice(0, -CACHE_FILE_SUFFIX.length) : name;
}

/** Lists `.html` cache file names under a directory, or [] when unreadable. */
async function listCacheFileNames(
  directory: string,
  deps: ViPreviewCacheInspectionFsDeps
): Promise<string[]> {
  let names: string[];
  try {
    names = await deps.listFiles(directory);
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith(CACHE_FILE_SUFFIX));
}

/**
 * Enumerates every cache entry with metadata + health flags (reads each document
 * to classify it). Never throws; unreadable entries are flagged `empty`.
 */
export async function listPreviewCacheEntries(
  directory: string,
  deps: ViPreviewCacheInspectionFsDeps
): Promise<ViPreviewCacheEntry[]> {
  const names = await listCacheFileNames(directory, deps);
  const entries: ViPreviewCacheEntry[] = [];
  for (const name of names) {
    const filePath = deps.joinPath(directory, name);
    let content = '';
    let bytes = 0;
    try {
      content = await deps.readFile(filePath);
      bytes = Buffer.byteLength(content, 'utf8');
    } catch {
      content = '';
      bytes = 0;
    }
    const { flags, inlineImageCount, interactive, interactiveFallbackReason } =
      classifyPreviewCacheDocument(content);
    entries.push({
      key: cacheKeyFromName(name),
      filePath,
      bytes,
      inlineImageCount,
      interactive,
      ...(interactiveFallbackReason ? { interactiveFallbackReason } : {}),
      flags,
      healthy: flags.length === 0
    });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return entries;
}

/** Aggregate summary of a cache directory. */
export interface ViPreviewCacheSummary {
  directory: string;
  entryCount: number;
  totalBytes: number;
  healthyCount: number;
  flaggedCount: number;
  interactiveCount: number;
  flagged: Array<{ key: string; flags: ViPreviewCacheEntryFlag[] }>;
}

/** Summarizes a cache directory (counts, bytes, and the flagged entries). */
export async function summarizePreviewCache(
  directory: string,
  deps: ViPreviewCacheInspectionFsDeps
): Promise<ViPreviewCacheSummary> {
  const entries = await listPreviewCacheEntries(directory, deps);
  let totalBytes = 0;
  let healthyCount = 0;
  let interactiveCount = 0;
  const flagged: Array<{ key: string; flags: ViPreviewCacheEntryFlag[] }> = [];
  for (const entry of entries) {
    totalBytes += entry.bytes;
    if (entry.healthy) {
      healthyCount += 1;
    } else {
      flagged.push({ key: entry.key, flags: entry.flags });
    }
    if (entry.interactive) {
      interactiveCount += 1;
    }
  }
  return {
    directory,
    entryCount: entries.length,
    totalBytes,
    healthyCount,
    flaggedCount: flagged.length,
    interactiveCount,
    flagged
  };
}

/** Result of fetching one cache entry. */
export interface ViPreviewCacheEntryDocument extends ViPreviewCacheEntry {
  /** Raw HTML, present only when `includeHtml` was requested. */
  html?: string;
}

/**
 * Fetches one cache entry by key. Returns metadata + a file-path pointer by
 * default (a cached preview can be ~2MB with hundreds of inline images, so the
 * raw HTML is withheld unless `includeHtml` is true). Rejects a malformed key
 * and returns undefined when the entry is absent.
 */
export async function getPreviewCacheEntry(
  directory: string,
  key: string,
  deps: ViPreviewCacheInspectionFsDeps,
  options: { includeHtml?: boolean } = {}
): Promise<ViPreviewCacheEntryDocument | undefined> {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('cache key is required');
  }
  // Guard against path traversal / unexpected keys: only accept a bare file-name
  // token (the real keys are sha256-hex, but accept any non-separator token so a
  // future key scheme still works, while rejecting anything with a separator).
  if (/[\\/]/.test(key) || key.includes('..')) {
    throw new Error(`invalid cache key: ${key}`);
  }
  const fileName = `${key}${CACHE_FILE_SUFFIX}`;
  const filePath = deps.joinPath(directory, fileName);
  let content: string;
  try {
    content = await deps.readFile(filePath);
  } catch {
    return undefined;
  }
  const { flags, inlineImageCount, interactive, interactiveFallbackReason } =
    classifyPreviewCacheDocument(content);
  const entry: ViPreviewCacheEntryDocument = {
    key,
    filePath,
    bytes: Buffer.byteLength(content, 'utf8'),
    inlineImageCount,
    interactive,
    ...(interactiveFallbackReason ? { interactiveFallbackReason } : {}),
    flags,
    healthy: flags.length === 0
  };
  if (options.includeHtml === true) {
    entry.html = content;
  }
  return entry;
}

/** A search predicate over a cache document. */
export type ViPreviewCacheSearchMarker = 'error' | 'interactive' | 'image' | 'empty' | 'fallback';

/**
 * Returns the entries whose content matches a marker: `error` (any error flag),
 * `interactive` (the block-diagram viewer would be presented), `image` (>=1
 * inline image), `empty`, or `fallback` (a block diagram rendered but was too
 * low-fidelity to present interactively, so the display path falls back to the
 * flat document — i.e. `interactiveFallbackReason` is set). Reuses the same
 * classification as the listing.
 */
export async function searchPreviewCache(
  directory: string,
  marker: ViPreviewCacheSearchMarker,
  deps: ViPreviewCacheInspectionFsDeps
): Promise<ViPreviewCacheEntry[]> {
  const entries = await listPreviewCacheEntries(directory, deps);
  return entries.filter((entry) => {
    switch (marker) {
      case 'error':
        return entry.flags.includes('error-marker');
      case 'empty':
        return entry.flags.includes('empty');
      case 'interactive':
        return entry.interactive;
      case 'image':
        return entry.inlineImageCount > 0;
      case 'fallback':
        return entry.interactiveFallbackReason !== undefined;
      default:
        return false;
    }
  });
}

/** True when a key is a well-formed content-addressed cache key (sha256-hex). */
export function isPreviewCacheKey(key: string): boolean {
  return typeof key === 'string' && isSha256HexKey(key);
}
