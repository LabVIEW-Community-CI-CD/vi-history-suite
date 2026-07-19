import { describe, expect, it } from 'vitest';

import {
  classifyPreviewCacheDocument,
  getPreviewCacheEntry,
  isPreviewCacheKey,
  listPreviewCacheEntries,
  searchPreviewCache,
  summarizePreviewCache,
  type ViPreviewCacheInspectionFsDeps
} from '../../src/reporting/viPreview/viPreviewCacheInspection';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const KEY_C = 'c'.repeat(64);
const KEY_D = 'd'.repeat(64);

const HEALTHY_HTML =
  '<html><body><img src="data:image/png;base64,AAAA"/><img src="data:image/png;base64,BBBB"/></body></html>';
const INTERACTIVE_HTML =
  '<html><body><div class="lvr-frames"></div><img src="data:image/png;base64,AAAA"/></body></html>';
const ERROR_HTML = '<html><body>preview-cache-miss</body></html>';
const EMPTY_HTML = '   ';

/** Builds a base64 data URI for a minimal PNG of the given pixel size (IHDR only). */
function pngDataUri(width: number, height: number): string {
  const header = Buffer.alloc(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.writeUInt32BE(13, 8); // IHDR chunk length
  header.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
}

/**
 * A flat `PrintToSingleFileHtml` export with a Block Diagram section — the shape
 * the extension actually caches (the `lvr-frames` viewer island is injected only
 * later by the display path, so it is never present in a cached document).
 */
const FLAT_INTERACTIVE_HTML =
  `<html><body><h3>Block Diagram</h3><img src="${pngDataUri(100, 80)}"/>` +
  `<img src="${pngDataUri(40, 40)}"/></body></html>`;

function fakeFs(files: Record<string, string>): ViPreviewCacheInspectionFsDeps {
  return {
    listFiles: async () => Object.keys(files),
    readFile: async (filePath: string) => {
      const name = filePath.split('/').pop() as string;
      if (!(name in files)) {
        throw new Error(`ENOENT ${filePath}`);
      }
      return files[name];
    },
    fileSizeBytes: async (filePath: string) => {
      const name = filePath.split('/').pop() as string;
      return Buffer.byteLength(files[name] ?? '', 'utf8');
    },
    joinPath: (directory: string, name: string) => `${directory}/${name}`
  };
}

/** Like {@link fakeFs}, plus a `fileModifiedMs` source keyed by `${key}.html`. */
function fakeFsWithMtimes(
  files: Record<string, string>,
  mtimes: Record<string, number>
): ViPreviewCacheInspectionFsDeps {
  return {
    ...fakeFs(files),
    fileModifiedMs: async (filePath: string) => {
      const name = filePath.split('/').pop() as string;
      return mtimes[name] ?? 0;
    }
  };
}

const CACHE = {
  [`${KEY_A}.html`]: HEALTHY_HTML,
  [`${KEY_B}.html`]: INTERACTIVE_HTML,
  [`${KEY_C}.html`]: ERROR_HTML,
  [`${KEY_D}.html`]: EMPTY_HTML,
  'not-a-cache-file.txt': 'ignored'
};

describe('classifyPreviewCacheDocument (VHS-REQ-659.21)', () => {
  it('flags an empty document', () => {
    expect(classifyPreviewCacheDocument('   ')).toEqual({
      flags: ['empty'],
      inlineImageCount: 0,
      interactive: false
    });
  });

  it('counts inline images and detects the interactive island', () => {
    const result = classifyPreviewCacheDocument(INTERACTIVE_HTML);
    expect(result.inlineImageCount).toBe(1);
    expect(result.interactive).toBe(true);
    expect(result.flags).toEqual([]);
  });

  it('detects interactive capability from a cached flat export (Block Diagram frames, no lvr-frames marker)', () => {
    // The extension caches the flat export, which never contains lvr-frames;
    // interactivity must be derived from its Block Diagram frames, matching the
    // display path (selectViPreviewDocument / buildFramesModelFromFlatExport).
    expect(FLAT_INTERACTIVE_HTML).not.toMatch(/lvr-frames/);
    const result = classifyPreviewCacheDocument(FLAT_INTERACTIVE_HTML);
    expect(result.interactive).toBe(true);
    expect(result.inlineImageCount).toBe(2);
    expect(result.flags).toEqual([]);
  });

  it('does not mark a rendered document without a Block Diagram section interactive', () => {
    // HEALTHY_HTML has inline images but no Block Diagram heading -> not interactive.
    expect(classifyPreviewCacheDocument(HEALTHY_HTML).interactive).toBe(false);
  });

  it('does not mark a low-fidelity flat export interactive (matches display fallback) (#2096)', () => {
    // A complex diagram: 10 differently-sized block-diagram images reconstruct
    // into too many coordinate-less structure groups, so the display path
    // (selectViPreviewDocument) falls back to the flat document. The cache's
    // interactive flag must agree, or search_preview_cache(marker=interactive)
    // would mislead an agent.
    const imgs = Array.from({ length: 10 }, (_v, i) => `<img src="${pngDataUri(100 + i, 50 + i)}"/>`).join('');
    const complexFlat = `<html><body><h3>Block Diagram</h3>${imgs}</body></html>`;
    const result = classifyPreviewCacheDocument(complexFlat);
    expect(result.inlineImageCount).toBe(10);
    expect(result.interactive).toBe(false);
    expect(result.flags).toEqual([]);
  });

  it('names the fidelity fallback reason for a low-fidelity flat export (#2096)', () => {
    const imgs = Array.from({ length: 10 }, (_v, i) => `<img src="${pngDataUri(100 + i, 50 + i)}"/>`).join('');
    const complexFlat = `<html><body><h3>Block Diagram</h3>${imgs}</body></html>`;
    const result = classifyPreviewCacheDocument(complexFlat);
    expect(result.interactive).toBe(false);
    expect(result.interactiveFallbackReason).toBeDefined();
    expect(result.interactiveFallbackReason).toMatch(/structure groups|stacked child frames/);
  });

  it('classifies a document with a valid embedded coordinate island as interactive, even when its flat body is low-fidelity (#2121)', () => {
    // The display path (selectViPreviewDocument) prefers an embedded coordinate
    // island over the flat reconstruction, so the cache signal must agree: a
    // low-fidelity flat body PLUS a valid coordinate island is interactive with
    // no fidelity fallback reason.
    const imgs = Array.from({ length: 10 }, (_v, i) => `<img src="${pngDataUri(100 + i, 50 + i)}"/>`).join('');
    const frames = JSON.stringify([
      { Image: 'root', Position: { Left: 0, Top: 0, Width: 100, Height: 80 }, Children: [1] },
      { Image: 'caseTrue', Position: { Left: 10, Top: 20, Width: 40, Height: 40 }, Label: 'True' }
    ]);
    const doc =
      `<html><body><h3>Block Diagram</h3>${imgs}` +
      `<script type="application/json" id="lvr-coordinate-frames">${frames}</script></body></html>`;
    const result = classifyPreviewCacheDocument(doc);
    expect(result.interactive).toBe(true);
    expect(result.interactiveFallbackReason).toBeUndefined();
  });

  it('ignores an invalid embedded coordinate island and falls back to the flat classification (#2121)', () => {
    const imgs = Array.from({ length: 10 }, (_v, i) => `<img src="${pngDataUri(100 + i, 50 + i)}"/>`).join('');
    const doc =
      `<html><body><h3>Block Diagram</h3>${imgs}` +
      '<script type="application/json" id="lvr-coordinate-frames">{ not valid json</script></body></html>';
    const result = classifyPreviewCacheDocument(doc);
    // Invalid island -> flat assessment -> low-fidelity -> not interactive, with reason.
    expect(result.interactive).toBe(false);
    expect(result.interactiveFallbackReason).toMatch(/structure groups|stacked child frames/);
  });

  it('carries no fallback reason for a plain non-diagram document (not a fidelity fallback) (#2096)', () => {
    // HEALTHY_HTML has no Block Diagram section => no frames model => plain
    // non-diagram doc, which is not a fidelity fallback.
    const result = classifyPreviewCacheDocument(HEALTHY_HTML);
    expect(result.interactive).toBe(false);
    expect(result.interactiveFallbackReason).toBeUndefined();
  });

  it('carries no fallback reason for a faithful interactive flat export (#2096)', () => {
    const result = classifyPreviewCacheDocument(FLAT_INTERACTIVE_HTML);
    expect(result.interactive).toBe(true);
    expect(result.interactiveFallbackReason).toBeUndefined();
  });

  it('flags an error marker document', () => {
    expect(classifyPreviewCacheDocument(ERROR_HTML).flags).toContain('error-marker');
  });

  it('flags a document without rendered content', () => {
    expect(classifyPreviewCacheDocument('<html>hello</html>').flags).toContain(
      'no-rendered-content'
    );
  });
});

describe('listPreviewCacheEntries (VHS-REQ-659.21)', () => {
  it('lists only .html entries, sorted, with classification', async () => {
    const entries = await listPreviewCacheEntries('/cache', fakeFs(CACHE));
    expect(entries.map((e) => e.key)).toEqual([KEY_A, KEY_B, KEY_C, KEY_D]);
    expect(entries[0].healthy).toBe(true);
    expect(entries[1].interactive).toBe(true);
    expect(entries[2].flags).toContain('error-marker');
  });

  it('returns [] for an unreadable directory', async () => {
    const deps: ViPreviewCacheInspectionFsDeps = {
      ...fakeFs(CACHE),
      listFiles: async () => {
        throw new Error('EACCES');
      }
    };
    expect(await listPreviewCacheEntries('/cache', deps)).toEqual([]);
  });
});

describe('summarizePreviewCache (VHS-REQ-659.21)', () => {
  it('rolls up counts, bytes, and flagged entries', async () => {
    const summary = await summarizePreviewCache('/cache', fakeFs(CACHE));
    expect(summary.entryCount).toBe(4);
    expect(summary.healthyCount).toBe(2);
    expect(summary.flaggedCount).toBe(2);
    expect(summary.interactiveCount).toBe(1);
    expect(summary.flagged.map((f) => f.key).sort()).toEqual([KEY_C, KEY_D].sort());
    expect(summary.totalBytes).toBeGreaterThan(0);
  });

  it('reports newestModifiedAt as null when the fs exposes no fileModifiedMs (#2107)', async () => {
    const summary = await summarizePreviewCache('/cache', fakeFs(CACHE));
    expect(summary.newestModifiedAt).toBeNull();
  });

  it('reports newestModifiedAt as the most recent entry mtime (#2107)', async () => {
    const newest = Date.parse('2026-07-19T12:00:00.000Z');
    const summary = await summarizePreviewCache(
      '/cache',
      fakeFsWithMtimes(CACHE, {
        [`${KEY_A}.html`]: Date.parse('2026-07-18T00:00:00.000Z'),
        [`${KEY_B}.html`]: newest,
        [`${KEY_C}.html`]: Date.parse('2026-07-17T00:00:00.000Z'),
        [`${KEY_D}.html`]: Date.parse('2026-07-16T00:00:00.000Z')
      })
    );
    expect(summary.newestModifiedAt).toBe(new Date(newest).toISOString());
  });
});

describe('getPreviewCacheEntry (VHS-REQ-659.21)', () => {
  it('returns metadata plus filePath pointer, no html by default', async () => {
    const entry = await getPreviewCacheEntry('/cache', KEY_A, fakeFs(CACHE));
    expect(entry?.filePath).toBe(`/cache/${KEY_A}.html`);
    expect(entry?.html).toBeUndefined();
  });

  it('includes raw html when requested', async () => {
    const entry = await getPreviewCacheEntry('/cache', KEY_A, fakeFs(CACHE), { includeHtml: true });
    expect(entry?.html).toBe(HEALTHY_HTML);
  });

  it('returns undefined for a missing entry', async () => {
    expect(await getPreviewCacheEntry('/cache', 'e'.repeat(64), fakeFs(CACHE))).toBeUndefined();
  });

  it('rejects a key with path separators', async () => {
    await expect(getPreviewCacheEntry('/cache', '../secret', fakeFs(CACHE))).rejects.toThrow(
      /invalid cache key/
    );
  });

  it('rejects an empty key', async () => {
    await expect(getPreviewCacheEntry('/cache', '', fakeFs(CACHE))).rejects.toThrow(
      /cache key is required/
    );
  });
});

describe('searchPreviewCache (VHS-REQ-659.21)', () => {
  it('finds error entries', async () => {
    const found = await searchPreviewCache('/cache', 'error', fakeFs(CACHE));
    expect(found.map((e) => e.key)).toEqual([KEY_C]);
  });

  it('finds interactive entries', async () => {
    const found = await searchPreviewCache('/cache', 'interactive', fakeFs(CACHE));
    expect(found.map((e) => e.key)).toEqual([KEY_B]);
  });

  it('finds image entries', async () => {
    const found = await searchPreviewCache('/cache', 'image', fakeFs(CACHE));
    expect(found.map((e) => e.key).sort()).toEqual([KEY_A, KEY_B].sort());
  });

  it('finds empty entries', async () => {
    const found = await searchPreviewCache('/cache', 'empty', fakeFs(CACHE));
    expect(found.map((e) => e.key)).toEqual([KEY_D]);
  });

  it('finds fidelity-fallback entries (#2096)', async () => {
    // A low-fidelity flat export: rendered fine (has images) but too complex to
    // present interactively. `fallback` finds it; `interactive` does not.
    const imgs = Array.from({ length: 10 }, (_v, i) => `<img src="${pngDataUri(100 + i, 50 + i)}"/>`).join('');
    const fallbackHtml = `<html><body><h3>Block Diagram</h3>${imgs}</body></html>`;
    const cache = {
      [`${KEY_A}.html`]: FLAT_INTERACTIVE_HTML, // interactive, not a fallback
      [`${KEY_B}.html`]: fallbackHtml, // rendered but low-fidelity => fallback
      [`${KEY_C}.html`]: HEALTHY_HTML // no diagram => not a fallback
    };
    const fallback = await searchPreviewCache('/cache', 'fallback', fakeFs(cache));
    expect(fallback.map((e) => e.key)).toEqual([KEY_B]);
    const interactive = await searchPreviewCache('/cache', 'interactive', fakeFs(cache));
    expect(interactive.map((e) => e.key)).toEqual([KEY_A]);
  });

  it('returns [] for an unrecognized marker (default branch)', async () => {
    // The public marker type is a closed union, but the runtime default arm is a
    // real guard: an unknown marker must match nothing rather than everything.
    const found = await searchPreviewCache('/cache', 'bogus-marker' as never, fakeFs(CACHE));
    expect(found).toEqual([]);
  });
});

describe('listPreviewCacheEntries unreadable-file handling (VHS-REQ-659.21)', () => {
  it('classifies a listed cache file whose read fails as empty (0 bytes)', async () => {
    // listFiles surfaces the entry but readFile rejects (e.g. a file removed or
    // permission-denied between listing and reading). The entry is retained but
    // treated as empty rather than throwing the whole inspection.
    const deps: ViPreviewCacheInspectionFsDeps = {
      listFiles: async () => [`${KEY_A}.html`],
      readFile: async () => {
        throw new Error('EACCES');
      },
      fileSizeBytes: async () => 0,
      joinPath: (directory: string, name: string) => `${directory}/${name}`
    };
    const entries = await listPreviewCacheEntries('/cache', deps);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: KEY_A, bytes: 0 });
    expect(entries[0].flags).toContain('empty');
  });
});

describe('isPreviewCacheKey', () => {
  it('accepts a sha256-hex key', () => {
    expect(isPreviewCacheKey(KEY_A)).toBe(true);
  });

  it('rejects a non-hex key', () => {
    expect(isPreviewCacheKey('not-a-key')).toBe(false);
  });
});
