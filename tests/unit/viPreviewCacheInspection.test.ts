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
});

describe('isPreviewCacheKey', () => {
  it('accepts a sha256-hex key', () => {
    expect(isPreviewCacheKey(KEY_A)).toBe(true);
  });

  it('rejects a non-hex key', () => {
    expect(isPreviewCacheKey('not-a-key')).toBe(false);
  });
});
