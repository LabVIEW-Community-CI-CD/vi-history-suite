// Requirement coverage: VHS-REQ-703 (epic #2262) — pixel-region correlation
// derived from the three existing artifacts (base/head preview HTML + the
// LabVIEW comparison report), with no VI authoring and no coordinate-frames
// emitter. Verifies the dependency-free PNG-dimension reader and the pure,
// injected-locator region-correlation model (VHS-REQ-703.14).
import { describe, expect, it } from 'vitest';

import {
  buildViPreviewRegionCorrelation,
  buildDiffRegionSourcesFromModel,
  diffRegionCoordinateForSide,
  buildViPreviewRegionCorrelationFromModel,
  withDiffRegionPixelSizes,
  buildPreviewImageInventory,
  associateDiffRegionsToPreviewImages,
  buildViPreviewRegionCorrelationBundle,
  renderRegionCorrelationTable,
  renderRegionCorrelationBundle,
  readPngDimensions,
  VI_PREVIEW_REGION_CORRELATION_SCHEMA,
  type DiffRegionSource,
  type LocatedPreviewRegion,
  type PreviewRegionLocator
} from '../../src/semantic/viPreviewRegionCorrelation';
import { buildViSemanticComparisonModelFromHtml } from '../../src/semantic/viSemanticModel';

/** Builds a minimal valid PNG header (signature + IHDR with w/h) as bytes. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length (13) at 8..12 (value irrelevant to the reader).
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  bytes.set([(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff], 16);
  bytes.set(
    [(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff],
    20
  );
  return bytes;
}

function pngDataUri(width: number, height: number): string {
  return `data:image/png;base64,${Buffer.from(pngHeader(width, height)).toString('base64')}`;
}

describe('readPngDimensions (VHS-REQ-703.14)', () => {
  it('reads width/height from a data URI', () => {
    expect(readPngDimensions(pngDataUri(1570, 358))).toEqual({ width: 1570, height: 358 });
  });

  it('tolerates the space NI writes after base64,', () => {
    const uri = `data:image/png;base64, ${Buffer.from(pngHeader(42, 99)).toString('base64')}`;
    expect(readPngDimensions(uri)).toEqual({ width: 42, height: 99 });
  });

  it('reads from a bare base64 string and from raw bytes', () => {
    expect(readPngDimensions(Buffer.from(pngHeader(7, 8)).toString('base64'))).toEqual({
      width: 7,
      height: 8
    });
    expect(readPngDimensions(pngHeader(3, 4))).toEqual({ width: 3, height: 4 });
  });

  it('returns undefined for a non-PNG, a truncated header, or an empty string', () => {
    expect(readPngDimensions('data:image/png;base64,')).toBeUndefined();
    expect(readPngDimensions('')).toBeUndefined();
    expect(readPngDimensions(new Uint8Array([0x89, 0x50]))).toBeUndefined();
    // Right length but wrong signature.
    const notPng = new Uint8Array(24);
    notPng.set([0x47, 0x49, 0x46], 0);
    expect(readPngDimensions(notPng)).toBeUndefined();
  });

  it('returns undefined when the first chunk is not IHDR', () => {
    const bytes = pngHeader(10, 10);
    bytes.set([0x49, 0x44, 0x41, 0x54], 12); // "IDAT" instead of IHDR
    expect(readPngDimensions(bytes)).toBeUndefined();
  });

  it('returns undefined for a zero dimension', () => {
    expect(readPngDimensions(pngHeader(0, 10))).toBeUndefined();
  });
});

describe('buildViPreviewRegionCorrelation (VHS-REQ-703.14)', () => {
  const sources: DiffRegionSource[] = [
    { id: 'SubVI "X.vi"', changeType: 'added', coordinate: { x: 1570, y: 358 }, pixelSize: { width: 40, height: 30 } },
    { id: 'wiring', changeType: 'other' }
  ];

  it('records diagram-space-only entries when no locator is supplied', () => {
    const correlation = buildViPreviewRegionCorrelation(sources);
    expect(correlation.schema).toBe(VI_PREVIEW_REGION_CORRELATION_SCHEMA);
    expect(correlation.entries).toHaveLength(2);
    expect(correlation.entries.every((e) => !e.located)).toBe(true);
    expect(correlation.entries[0].regions).toEqual([]);
    // The change context is retained even without a located region.
    expect(correlation.entries[0].coordinate).toEqual({ x: 1570, y: 358 });
    expect(correlation.entries[0].pixelSize).toEqual({ width: 40, height: 30 });
    expect(correlation.totals).toEqual({
      regionCount: 2,
      locatedRegionCount: 0,
      diagramOnlyRegionCount: 2
    });
  });

  it('keeps a located region on each side when the locator places it', () => {
    const locate: PreviewRegionLocator = (region, side) =>
      region.id === 'SubVI "X.vi"'
        ? { side, left: side === 'base' ? 10 : 12, top: 20, width: 40, height: 30, confidence: 0.9 }
        : undefined;
    const correlation = buildViPreviewRegionCorrelation(sources, locate);
    const subvi = correlation.entries[0];
    expect(subvi.located).toBe(true);
    expect(subvi.regions.map((r) => r.side)).toEqual(['base', 'head']);
    expect(subvi.regions[0]).toMatchObject({ side: 'base', left: 10, top: 20, width: 40, height: 30 });
    expect(subvi.regions[1]).toMatchObject({ side: 'head', left: 12 });
    // The wiring change had no locator hit -> diagram-space-only.
    expect(correlation.entries[1].located).toBe(false);
    expect(correlation.totals).toEqual({
      regionCount: 2,
      locatedRegionCount: 1,
      diagramOnlyRegionCount: 1
    });
  });

  it('never keeps a fabricated region: non-positive confidence or zero-area is dropped', () => {
    const bad: LocatedPreviewRegion = { side: 'base', left: 0, top: 0, width: 0, height: 5, confidence: 0.9 };
    const zeroConfidence: LocatedPreviewRegion = { side: 'base', left: 1, top: 1, width: 5, height: 5, confidence: 0 };
    const locateZeroArea: PreviewRegionLocator = (_r, side) => ({ ...bad, side });
    const locateNoConfidence: PreviewRegionLocator = (_r, side) => ({ ...zeroConfidence, side });
    expect(buildViPreviewRegionCorrelation(sources, locateZeroArea).totals.locatedRegionCount).toBe(0);
    expect(buildViPreviewRegionCorrelation(sources, locateNoConfidence).totals.locatedRegionCount).toBe(0);
  });

  it('is deterministic for the same sources and locator', () => {
    const locate: PreviewRegionLocator = (_r, side) => ({
      side,
      left: 1,
      top: 2,
      width: 3,
      height: 4,
      confidence: 0.5
    });
    const a = buildViPreviewRegionCorrelation(sources, locate);
    const b = buildViPreviewRegionCorrelation(sources, locate);
    expect(a).toEqual(b);
  });

  it('produces an empty correlation for no sources', () => {
    expect(buildViPreviewRegionCorrelation([])).toEqual({
      schema: VI_PREVIEW_REGION_CORRELATION_SCHEMA,
      entries: [],
      totals: { regionCount: 0, locatedRegionCount: 0, diagramOnlyRegionCount: 0 }
    });
  });
});

describe('buildDiffRegionSourcesFromModel (VHS-REQ-703.14)', () => {
  it('maps coordinate-bearing detail items into diff-region sources in order', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol>
           <li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li>
           <li class="diff-detail">wiring changes</li>
           <li class="diff-detail">Numeric "N" - moved from (10,20) to (30,40)</li>
         </ol></details>`,
      {}
    );
    const sources = buildDiffRegionSourcesFromModel(model);
    // Only the two coordinate-bearing items become sources (wiring is skipped);
    // a moved object carries BOTH endpoints (from = base, to = head).
    expect(sources).toEqual([
      { id: 'X.vi', changeType: 'added', coordinate: { x: 1570, y: 358 } },
      { id: 'N', changeType: 'moved', coordinate: { x: 30, y: 40 }, fromCoordinate: { x: 10, y: 20 } }
    ]);
  });

  it('falls back to the raw item text for the id when no object name is present', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">Structure - resized at (5,6)</li></ol></details>`,
      {}
    );
    const sources = buildDiffRegionSourcesFromModel(model);
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toContain('(5,6)');
    expect(sources[0].coordinate).toEqual({ x: 5, y: 6 });
  });

  it('returns an empty array when no detail item carries a coordinate', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">wiring changes</li></ol></details>`,
      {}
    );
    expect(buildDiffRegionSourcesFromModel(model)).toEqual([]);
  });

  it('feeds straight into the region correlation (diagram-space-only without a locator)', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`,
      {}
    );
    const correlation = buildViPreviewRegionCorrelation(buildDiffRegionSourcesFromModel(model));
    expect(correlation.totals).toEqual({
      regionCount: 1,
      locatedRegionCount: 0,
      diagramOnlyRegionCount: 1
    });
    expect(correlation.entries[0].coordinate).toEqual({ x: 1570, y: 358 });
  });
});

describe('renderRegionCorrelationTable (VHS-REQ-703.14)', () => {
  const sources: DiffRegionSource[] = [
    { id: 'X.vi', changeType: 'added', coordinate: { x: 1570, y: 358 } },
    { id: 'N', changeType: 'moved', coordinate: { x: 30, y: 40 } }
  ];

  it('renders located regions and honest dashes for unlocated sides', () => {
    const locate: PreviewRegionLocator = (region, side) =>
      region.id === 'X.vi'
        ? { side, left: 10, top: 20, width: 40, height: 30, confidence: 0.9 }
        : undefined;
    const table = renderRegionCorrelationTable(buildViPreviewRegionCorrelation(sources, locate));
    expect(table).toContain('| Object | Change | Diagram (x,y) | Base region (px) | Head region (px) |');
    expect(table).toContain('| X.vi | added | (1570,358) | 10,20 40×30 (90%) | 10,20 40×30 (90%) |');
    // N had no locator hit -> diagram-space only, both sides em dash.
    expect(table).toContain('| N | moved | (30,40) | — | — |');
    expect(table).toContain('1 of 2 change(s) located as a pixel region');
  });

  it('lists diagram-space-only changes with no fabricated regions when no locator', () => {
    const table = renderRegionCorrelationTable(buildViPreviewRegionCorrelation(sources));
    expect(table).toContain('| X.vi | added | (1570,358) | — | — |');
    expect(table).toContain('0 of 2 change(s) located');
  });

  it('escapes pipe and backslash in the object id', () => {
    const table = renderRegionCorrelationTable(
      buildViPreviewRegionCorrelation([{ id: 'a\\b|c', changeType: 'other' }])
    );
    expect(table).toContain('| a\\\\b\\|c | other | — | — | — |');
  });

  it('returns an empty string for no entries', () => {
    expect(renderRegionCorrelationTable(buildViPreviewRegionCorrelation([]))).toBe('');
  });
});

describe('buildViPreviewRegionCorrelationFromModel (VHS-REQ-703.14)', () => {
  const model = buildViSemanticComparisonModelFromHtml(
    `<h1 class="report-title">R</h1>
     <h2 class="section-header">Detailed Information</h2>
     <details><summary class="difference-heading">3. Block Diagram objects</summary>
       <ol>
         <li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li>
         <li class="diff-detail">wiring changes</li>
       </ol></details>`,
    {}
  );

  it('derives sources from the model and correlates in one call (diagram-space-only without a locator)', () => {
    const correlation = buildViPreviewRegionCorrelationFromModel(model);
    expect(correlation.entries).toHaveLength(1);
    expect(correlation.entries[0].id).toBe('X.vi');
    expect(correlation.entries[0].coordinate).toEqual({ x: 1570, y: 358 });
    expect(correlation.totals).toEqual({ regionCount: 1, locatedRegionCount: 0, diagramOnlyRegionCount: 1 });
  });

  it('equals the two-step composition (adapter then correlation)', () => {
    const locate: PreviewRegionLocator = (_r, side) => ({
      side,
      left: 1,
      top: 2,
      width: 3,
      height: 4,
      confidence: 0.7
    });
    const oneCall = buildViPreviewRegionCorrelationFromModel(model, locate);
    const twoStep = buildViPreviewRegionCorrelation(buildDiffRegionSourcesFromModel(model), locate);
    expect(oneCall).toEqual(twoStep);
    expect(oneCall.totals.locatedRegionCount).toBe(1);
  });
});

describe('withDiffRegionPixelSizes (VHS-REQ-703.14)', () => {
  const sources: DiffRegionSource[] = [
    { id: 'X.vi', changeType: 'added', coordinate: { x: 1, y: 2 } },
    { id: 'Y.vi', changeType: 'deleted', coordinate: { x: 3, y: 4 }, pixelSize: { width: 99, height: 88 } }
  ];

  it('populates pixel size from the resolved difference image PNG header', () => {
    const resolve = (s: DiffRegionSource) => (s.id === 'X.vi' ? pngDataUri(40, 30) : undefined);
    const enriched = withDiffRegionPixelSizes(sources, resolve);
    expect(enriched[0].pixelSize).toEqual({ width: 40, height: 30 });
    // An already-sized source is left untouched (no re-resolve).
    expect(enriched[1].pixelSize).toEqual({ width: 99, height: 88 });
  });

  it('leaves pixel size absent when the image is missing or unreadable', () => {
    const resolveNone = () => undefined;
    expect(withDiffRegionPixelSizes([sources[0]], resolveNone)[0].pixelSize).toBeUndefined();
    const resolveJunk = () => 'data:image/png;base64,not-a-png';
    expect(withDiffRegionPixelSizes([sources[0]], resolveJunk)[0].pixelSize).toBeUndefined();
  });

  it('accepts raw bytes from the resolver and is pure (does not mutate input)', () => {
    const resolve = () => pngHeader(12, 34);
    const input: DiffRegionSource[] = [{ id: 'Z', changeType: 'other', coordinate: { x: 0, y: 0 } }];
    const out = withDiffRegionPixelSizes(input, resolve);
    expect(out[0].pixelSize).toEqual({ width: 12, height: 34 });
    expect(input[0].pixelSize).toBeUndefined();
  });
});

describe('buildPreviewImageInventory (VHS-REQ-703.14)', () => {
  it('content-addresses each inline image with its side, index, and size', () => {
    const inv = buildPreviewImageInventory([pngDataUri(10, 20), pngDataUri(30, 40)], 'base');
    expect(inv).toHaveLength(2);
    expect(inv[0]).toMatchObject({ side: 'base', index: 0, pixelSize: { width: 10, height: 20 } });
    expect(inv[1]).toMatchObject({ side: 'base', index: 1, pixelSize: { width: 30, height: 40 } });
    // Identical content yields an identical stable key.
    const again = buildPreviewImageInventory([pngDataUri(10, 20)], 'head');
    expect(again[0].contentKey).toBe(inv[0].contentKey);
    // Different content -> different key.
    expect(inv[0].contentKey).not.toBe(inv[1].contentKey);
  });
});

describe('associateDiffRegionsToPreviewImages (VHS-REQ-703.14)', () => {
  const sources: DiffRegionSource[] = [
    { id: 'X.vi', changeType: 'added', coordinate: { x: 1, y: 2 } },
    { id: 'Y.vi', changeType: 'deleted', coordinate: { x: 3, y: 4 } }
  ];

  it('associates a change to the preview image with byte-identical content', () => {
    const xImg = pngDataUri(40, 30);
    const baseInv = buildPreviewImageInventory([pngDataUri(99, 99), xImg], 'base');
    const resolve = (s: DiffRegionSource) => (s.id === 'X.vi' ? xImg : undefined);
    const assoc = associateDiffRegionsToPreviewImages(sources, baseInv, resolve);
    expect(assoc).toHaveLength(1);
    expect(assoc[0]).toMatchObject({
      id: 'X.vi',
      side: 'base',
      previewImageIndex: 1,
      pixelSize: { width: 40, height: 30 }
    });
  });

  it('prefers the head side when both sides contain the matching image', () => {
    const img = pngDataUri(12, 12);
    const inv = [
      ...buildPreviewImageInventory([img], 'base'),
      ...buildPreviewImageInventory([img], 'head')
    ];
    const assoc = associateDiffRegionsToPreviewImages(
      [sources[0]],
      inv,
      () => img
    );
    expect(assoc[0].side).toBe('head');
  });

  it('yields no association when there is no image or no exact match', () => {
    const inv = buildPreviewImageInventory([pngDataUri(1, 1)], 'base');
    expect(associateDiffRegionsToPreviewImages(sources, inv, () => undefined)).toEqual([]);
    expect(associateDiffRegionsToPreviewImages(sources, inv, () => pngDataUri(2, 2))).toEqual([]);
  });
});

describe('buildViPreviewRegionCorrelationBundle (VHS-REQ-703.14)', () => {
  const model = buildViSemanticComparisonModelFromHtml(
    `<h1 class="report-title">R</h1>
     <h2 class="section-header">Detailed Information</h2>
     <details><summary class="difference-heading">3. Block Diagram objects</summary>
       <ol>
         <li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li>
         <li class="diff-detail">SubVI "Y.vi" - deleted at (10,20)</li>
       </ol></details>`,
    {}
  );

  it('assembles diagram-space correlation with no images or locator', () => {
    const bundle = buildViPreviewRegionCorrelationBundle({ model });
    expect(bundle.correlation.totals).toEqual({
      regionCount: 2,
      locatedRegionCount: 0,
      diagramOnlyRegionCount: 2
    });
    expect(bundle.imageAssociations).toEqual([]);
    expect(bundle.previewImageCounts).toEqual({ base: 0, head: 0 });
  });

  it('content-associates changes to preview images and records pixel size', () => {
    const xImg = pngDataUri(40, 30);
    const bundle = buildViPreviewRegionCorrelationBundle({
      model,
      previewImages: { base: [pngDataUri(9, 9)], head: [xImg] },
      resolveDifferenceImage: (s) => (s.id === 'X.vi' ? xImg : undefined)
    });
    // X.vi's difference image byte-matches the head preview image at index 0.
    expect(bundle.imageAssociations).toHaveLength(1);
    expect(bundle.imageAssociations[0]).toMatchObject({
      id: 'X.vi',
      side: 'head',
      previewImageIndex: 0,
      pixelSize: { width: 40, height: 30 }
    });
    // The correlation carries the difference-image pixel size for X.vi.
    const x = bundle.correlation.entries.find((e) => e.id === 'X.vi');
    expect(x?.pixelSize).toEqual({ width: 40, height: 30 });
    expect(bundle.previewImageCounts).toEqual({ base: 1, head: 1 });
  });

  it('applies an injected locator to produce located pixel regions', () => {
    const bundle = buildViPreviewRegionCorrelationBundle({
      model,
      locate: (_s, side) => ({ side, left: 1, top: 2, width: 3, height: 4, confidence: 0.8 })
    });
    expect(bundle.correlation.totals.locatedRegionCount).toBe(2);
  });
});

describe('renderRegionCorrelationBundle (VHS-REQ-703.14)', () => {
  const model = buildViSemanticComparisonModelFromHtml(
    `<h1 class="report-title">R</h1>
     <h2 class="section-header">Detailed Information</h2>
     <details><summary class="difference-heading">3. Block Diagram objects</summary>
       <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`,
    {}
  );

  it('renders the region table plus a byte-exact preview-image match section', () => {
    const xImg = pngDataUri(40, 30);
    const bundle = buildViPreviewRegionCorrelationBundle({
      model,
      previewImages: { head: [xImg] },
      resolveDifferenceImage: () => xImg
    });
    const md = renderRegionCorrelationBundle(bundle);
    expect(md).toContain('| Object | Change | Diagram (x,y) | Base region (px) | Head region (px) |');
    expect(md).toContain('**Preview image matches**');
    expect(md).toContain('| X.vi | head | 0 | 40×30 |');
  });

  it('omits the matches section when there are no associations', () => {
    const md = renderRegionCorrelationBundle(buildViPreviewRegionCorrelationBundle({ model }));
    expect(md).toContain('| X.vi | added | (1570,358) | — | — |');
    expect(md).not.toContain('Preview image matches');
  });

  it('returns an empty string when there are no changes', () => {
    const empty = buildViSemanticComparisonModelFromHtml('<h1 class="report-title">R</h1>', {});
    expect(renderRegionCorrelationBundle(buildViPreviewRegionCorrelationBundle({ model: empty }))).toBe('');
  });
});

describe('review-fold hardening (VHS-REQ-703.14)', () => {
  it('diffRegionCoordinateForSide anchors base on the move source and head on the destination', () => {
    const moved: DiffRegionSource = {
      id: 'N', changeType: 'moved', coordinate: { x: 30, y: 40 }, fromCoordinate: { x: 10, y: 20 }
    };
    expect(diffRegionCoordinateForSide(moved, 'base')).toEqual({ x: 10, y: 20 });
    expect(diffRegionCoordinateForSide(moved, 'head')).toEqual({ x: 30, y: 40 });
    // Falls back to the only known endpoint.
    const addedOnly: DiffRegionSource = { id: 'X', changeType: 'added', coordinate: { x: 5, y: 6 } };
    expect(diffRegionCoordinateForSide(addedOnly, 'base')).toEqual({ x: 5, y: 6 });
  });

  it('rejects non-integer, infinite, or over-1-confidence locator rectangles', () => {
    const src: DiffRegionSource[] = [{ id: 'X', changeType: 'added', coordinate: { x: 1, y: 2 } }];
    const fractional = buildViPreviewRegionCorrelation(src, (_s, side) => ({ side, left: 1.5, top: 2, width: 3, height: 4, confidence: 0.5 }));
    expect(fractional.totals.locatedRegionCount).toBe(0);
    const infinite = buildViPreviewRegionCorrelation(src, (_s, side) => ({ side, left: 0, top: 0, width: Infinity, height: 4, confidence: 0.5 }));
    expect(infinite.totals.locatedRegionCount).toBe(0);
    const over1 = buildViPreviewRegionCorrelation(src, (_s, side) => ({ side, left: 0, top: 0, width: 3, height: 4, confidence: 2 }));
    expect(over1.totals.locatedRegionCount).toBe(0);
    // A negative origin violates the schema's left/top minimum 0 and would render off-canvas.
    const negativeLeft = buildViPreviewRegionCorrelation(src, (_s, side) => ({ side, left: -1, top: 0, width: 3, height: 4, confidence: 0.5 }));
    expect(negativeLeft.totals.locatedRegionCount).toBe(0);
    const negativeTop = buildViPreviewRegionCorrelation(src, (_s, side) => ({ side, left: 0, top: -2, width: 3, height: 4, confidence: 0.5 }));
    expect(negativeTop.totals.locatedRegionCount).toBe(0);
    // A valid integer rect with confidence in (0,1] is kept.
    const ok = buildViPreviewRegionCorrelation(src, (_s, side) => ({ side, left: 0, top: 0, width: 3, height: 4, confidence: 1 }));
    expect(ok.totals.locatedRegionCount).toBe(1);
  });

  it('content-addresses by DECODED bytes so padding/whitespace variants match', () => {
    const bytes = pngHeader(10, 20);
    const b64 = Buffer.from(bytes).toString('base64');
    // Same bytes, different surface formatting (extra whitespace) -> same key.
    const invA = buildPreviewImageInventory([`data:image/png;base64,${b64}`], 'base');
    const invB = buildPreviewImageInventory([`data:image/png;base64, ${b64}\n`], 'head');
    expect(invA[0].contentKey).toBe(invB[0].contentKey);
    // Raw bytes hash identically to their base64 form.
    const invC = buildPreviewImageInventory([bytes], 'base');
    expect(invC[0].contentKey).toBe(invA[0].contentKey);
  });

  it('renderRegionCorrelationTable caps rows and reports a remainder', () => {
    const sources: DiffRegionSource[] = Array.from({ length: 5 }, (_v, i) => ({
      id: `O${i}`, changeType: 'added' as const, coordinate: { x: i, y: i }
    }));
    const table = renderRegionCorrelationTable(buildViPreviewRegionCorrelation(sources), 2);
    expect(table).toContain('| O0 | added |');
    expect(table).toContain('| O1 | added |');
    expect(table).not.toContain('| O2 | added |');
    expect(table).toContain('_+3 more_');
  });
});
