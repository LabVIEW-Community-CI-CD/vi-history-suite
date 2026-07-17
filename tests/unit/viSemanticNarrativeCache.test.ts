/**
 * Unit tests for the Source Control semantic narrative cache and recorder
 * (VHS-REQ-660).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  computeViSemanticNarrativeCacheKey,
  createFileViSemanticNarrativeCache,
  recordViSemanticNarrativeFromReport,
  type FileViSemanticNarrativeCacheFsDeps,
  type StoredViSemanticNarrative,
  type ViSemanticNarrativeCache
} from '../../src/semantic/viSemanticNarrativeCache';

function niReportHtml(): string {
  return `<!DOCTYPE html>
  <html>
    <body>
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
      <p class="generation-time">5/4/2026 11:01:16 AM</p>
      <details>
        <summary class="difference-heading">
          <div class="dropdown-left">First VI: C:\\repo\\Widget.vi</div>
          <div class="dropdown-right">Second VI: C:\\repo\\Widget.vi</div>
        </summary>
        <table class="difference">
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="assets/block.png"/></td></tr>
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="assets/front.png"/></td></tr>
        </table>
      </details>
      <ul class="inclusion-list">
        <li class="checked">Front Panel</li>
        <li class="unchecked">VI Attribute</li>
      </ul>
      <h2 class="section-header">Detailed Information</h2>
      <details open>
        <summary class="difference-heading">1. VI Attribute - Miscellaneous</summary>
        <ol>
          <li class="diff-detail">VI Version : changed from "21.0" to "20.0"</li>
          <li class="diff-detail">Connector pane changed</li>
        </ol>
      </details>
    </body>
  </html>`;
}

function emptyReportHtml(): string {
  return `<!DOCTYPE html>
  <html>
    <body>
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
    </body>
  </html>`;
}

function createInMemoryFsDeps(): {
  fsDeps: FileViSemanticNarrativeCacheFsDeps;
  files: Map<string, string>;
  directories: Set<string>;
} {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  return {
    files,
    directories,
    fsDeps: {
      ensureDirectory: vi.fn(async (directory: string) => {
        directories.add(directory);
      }),
      readFile: vi.fn(async (filePath: string) => {
        const value = files.get(filePath);
        if (value === undefined) {
          throw new Error(`ENOENT: ${filePath}`);
        }
        return value;
      }),
      writeFile: vi.fn(async (filePath: string, data: string) => {
        files.set(filePath, data);
      })
    }
  };
}

const joinPath = (directory: string, name: string): string => `${directory}/${name}`;

describe('computeViSemanticNarrativeCacheKey (VHS-REQ-660.1)', () => {
  it('is deterministic and yields a 64-character hex key', () => {
    const first = computeViSemanticNarrativeCacheKey('sub/Foo.vi', 'baseA', 'selA');
    const second = computeViSemanticNarrativeCacheKey('sub/Foo.vi', 'baseA', 'selA');
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalizes path separators so win32 and posix relatives map to one key', () => {
    expect(computeViSemanticNarrativeCacheKey('sub\\Foo.vi', 'b', 's')).toBe(
      computeViSemanticNarrativeCacheKey('sub/Foo.vi', 'b', 's')
    );
  });

  it('changes when the path or either signature changes', () => {
    const baseline = computeViSemanticNarrativeCacheKey('a.vi', 'b', 's');
    expect(computeViSemanticNarrativeCacheKey('b.vi', 'b', 's')).not.toBe(baseline);
    expect(computeViSemanticNarrativeCacheKey('a.vi', 'b2', 's')).not.toBe(baseline);
    expect(computeViSemanticNarrativeCacheKey('a.vi', 'b', 's2')).not.toBe(baseline);
  });
});

describe('createFileViSemanticNarrativeCache (VHS-REQ-660.1)', () => {
  const key = computeViSemanticNarrativeCacheKey('a.vi', 'b', 's');
  const value: StoredViSemanticNarrative = {
    narrative: 'The block diagram differs.',
    changedSurfaces: ['block-diagram']
  };

  it('round-trips a stored narrative and ensures the cache directory', async () => {
    const { fsDeps, directories } = createInMemoryFsDeps();
    const cache = createFileViSemanticNarrativeCache({ cacheDirectory: '/c', joinPath }, fsDeps);
    await cache.set(key, value);
    expect(directories.has('/c')).toBe(true);
    expect(await cache.get(key)).toEqual(value);
  });

  it('returns undefined for a miss and for an invalid key', async () => {
    const { fsDeps } = createInMemoryFsDeps();
    const cache = createFileViSemanticNarrativeCache({ cacheDirectory: '/c', joinPath }, fsDeps);
    expect(await cache.get(key)).toBeUndefined();
    expect(await cache.get('not-a-valid-key')).toBeUndefined();
  });

  it('returns undefined when the stored JSON is not a valid narrative shape', async () => {
    const { fsDeps, files } = createInMemoryFsDeps();
    const cache = createFileViSemanticNarrativeCache({ cacheDirectory: '/c', joinPath }, fsDeps);
    // Seed the cache file with parseable JSON that is not a StoredViSemanticNarrative.
    files.set(joinPath('/c', `${key}.json`), JSON.stringify({ unrelated: true }));
    expect(await cache.get(key)).toBeUndefined();
  });

  it('skips the write for an invalid key without touching the filesystem', async () => {
    const { fsDeps, files, directories } = createInMemoryFsDeps();
    const cache = createFileViSemanticNarrativeCache({ cacheDirectory: '/c', joinPath }, fsDeps);
    await cache.set('not-a-valid-key', value);
    expect(files.size).toBe(0);
    expect(directories.has('/c')).toBe(false);
  });

  it('treats a read failure as a miss and never throws on a write failure', async () => {
    const cache = createFileViSemanticNarrativeCache(
      { cacheDirectory: '/c', joinPath },
      {
        ensureDirectory: vi.fn(async () => {
          throw new Error('EACCES');
        }),
        readFile: vi.fn(async () => {
          throw new Error('EIO');
        }),
        writeFile: vi.fn(async () => undefined)
      }
    );
    await expect(cache.set(key, value)).resolves.toBeUndefined();
    expect(await cache.get(key)).toBeUndefined();
  });
});

describe('recordViSemanticNarrativeFromReport (VHS-REQ-660.2)', () => {
  it('caches the narrative from a report with differences under the compared signatures', async () => {
    const { fsDeps } = createInMemoryFsDeps();
    const cache = createFileViSemanticNarrativeCache({ cacheDirectory: '/c', joinPath }, fsDeps);

    const stored = await recordViSemanticNarrativeFromReport(
      {
        relativePath: 'sub/Widget.vi',
        reportHtml: niReportHtml(),
        signatures: { baseSignature: 'HEADSIG', selectedSignature: 'WORKSIG' }
      },
      cache
    );

    expect(stored).toBeDefined();
    expect(stored?.narrative.length).toBeGreaterThan(0);
    const key = computeViSemanticNarrativeCacheKey('sub/Widget.vi', 'HEADSIG', 'WORKSIG');
    expect(await cache.get(key)).toEqual(stored);
  });

  it('caches nothing when the report shows no differences', async () => {
    const set = vi.fn(async () => undefined);
    const cache: ViSemanticNarrativeCache = {
      get: vi.fn(async () => undefined),
      set
    };

    const stored = await recordViSemanticNarrativeFromReport(
      {
        relativePath: 'a.vi',
        reportHtml: emptyReportHtml(),
        signatures: { baseSignature: 'HEADSIG', selectedSignature: 'WORKSIG' }
      },
      cache
    );

    expect(stored).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  });
});
