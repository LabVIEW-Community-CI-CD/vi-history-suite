import { describe, expect, it } from 'vitest';

import {
  buildFramesModelFromFlatExport,
  assessFramesModelFidelity,
  decodePngSize,
  extractBlockDiagramFrames
} from '../../src/reporting/viPreview/viPreviewFlatFrames';

// Minimal valid PNGs (signature + IHDR only) at known sizes, generated so the
// IHDR width/height decode deterministically without a real image.
const PNG_200x150 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAIAAAA=';
const PNG_60x40 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAA=';

function blockDiagramHtml(images: string[]): string {
  const imgs = images.map((src) => `<P><IMG src="${src}"></P>`).join('\n');
  return `<HTML><BODY>\n<H3>Front Panel</H3><P><IMG src="${PNG_200x150}"></P>\n<H3>Block Diagram</H3>\n${imgs}\n<H3>VI Revision History</H3><P>none</P>\n</BODY></HTML>`;
}

describe('decodePngSize', () => {
  it('decodes width/height from the PNG IHDR (VHS-REQ-659.12)', () => {
    expect(decodePngSize(PNG_200x150)).toEqual({ width: 200, height: 150 });
    expect(decodePngSize(PNG_60x40)).toEqual({ width: 60, height: 40 });
  });

  it('returns undefined for a non-PNG or malformed data URI (VHS-REQ-659.12)', () => {
    expect(decodePngSize('not a data uri')).toBeUndefined();
    expect(decodePngSize('data:image/png;base64,AAAA')).toBeUndefined();
    expect(decodePngSize('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBeUndefined();
  });
});

describe('extractBlockDiagramFrames', () => {
  it('extracts only the Block Diagram section images in order (VHS-REQ-659.12)', () => {
    const html = blockDiagramHtml([PNG_200x150, PNG_60x40, PNG_60x40]);
    const frames = extractBlockDiagramFrames(html);
    // The Front Panel image before the Block Diagram heading is excluded.
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({ width: 200, height: 150 });
    expect(frames[1]).toMatchObject({ width: 60, height: 40 });
    expect(frames[2]).toMatchObject({ width: 60, height: 40 });
  });

  it('returns an empty array when there is no Block Diagram section', () => {
    expect(extractBlockDiagramFrames('<HTML><BODY><H3>Front Panel</H3></BODY></HTML>')).toEqual([]);
  });
});

describe('buildFramesModelFromFlatExport', () => {
  it('makes the first image the root and groups equal-size cases into structures (VHS-REQ-659.16)', () => {
    const html = blockDiagramHtml([PNG_200x150, PNG_60x40, PNG_60x40]);
    const model = buildFramesModelFromFlatExport(html)!;
    expect(model.rootIndex).toBe(0);
    expect(model.frames).toHaveLength(3);
    // Root is the top-level diagram.
    expect(model.frames[0].rect).toEqual({ left: 0, top: 0, width: 200, height: 150 });
    expect(model.frames[0].children).toEqual([1, 2]);
    // The two 60x40 images are the cases of ONE structure: same synthesized rect.
    expect(model.frames[1].rect).toEqual(model.frames[2].rect);
    expect(model.frames[1].rect.width).toBe(60);
    expect(model.frames[1].label).toBe('case 1');
    expect(model.frames[2].label).toBe('case 2');
    // Cases are stacked below the root diagram (top > root height).
    expect(model.frames[1].rect.top).toBeGreaterThan(150);
  });

  it('separates differently-sized structures into distinct stacked rectangles (VHS-REQ-659.12)', () => {
    const html = blockDiagramHtml([PNG_200x150, PNG_60x40, PNG_200x150]);
    const model = buildFramesModelFromFlatExport(html)!;
    // Two distinct sizes => two structures => two distinct rectangles.
    expect(model.frames[1].rect).not.toEqual(model.frames[2].rect);
    // A single-case structure carries no case label.
    expect(model.frames[1].label).toBeUndefined();
  });

  it('returns undefined when no decodable block-diagram image exists', () => {
    expect(buildFramesModelFromFlatExport('<HTML><BODY><H3>Block Diagram</H3></BODY></HTML>')).toBeUndefined();
  });
});

// Builds a minimal PNG data URI (signature + IHDR only) at an arbitrary size so
// the extractor decodes distinct dimensions without shipping many fixtures.
function pngDataUri(width: number, height: number): string {
  const header = Buffer.alloc(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
}

describe('assessFramesModelFidelity', () => {
  it('rates a small reconstruction as faithful (#2096)', () => {
    const model = buildFramesModelFromFlatExport(
      blockDiagramHtml([PNG_200x150, PNG_60x40, PNG_60x40])
    )!;
    const fidelity = assessFramesModelFidelity(model);
    expect(fidelity.faithful).toBe(true);
    expect(fidelity.childCount).toBe(2);
    expect(fidelity.structureGroupCount).toBe(1);
    expect(fidelity.reason).toBeUndefined();
  });

  it('keeps a single many-case structure faithful (one group, bounded children) (#2096)', () => {
    // 20 equal-size cases of ONE structure: one group, under the child cap.
    const cases = Array.from({ length: 20 }, () => PNG_60x40);
    const model = buildFramesModelFromFlatExport(blockDiagramHtml([PNG_200x150, ...cases]))!;
    const fidelity = assessFramesModelFidelity(model);
    expect(fidelity.structureGroupCount).toBe(1);
    expect(fidelity.faithful).toBe(true);
  });

  it('flags too many distinct same-size structure groups as low fidelity (#2096)', () => {
    // 9 differently-sized block-diagram images => 9 structure groups (> 8).
    const many = Array.from({ length: 9 }, (_value, index) => pngDataUri(100 + index, 50 + index));
    const model = buildFramesModelFromFlatExport(blockDiagramHtml([PNG_200x150, ...many]))!;
    const fidelity = assessFramesModelFidelity(model);
    expect(fidelity.structureGroupCount).toBe(9);
    expect(fidelity.faithful).toBe(false);
    expect(fidelity.reason).toContain('structure groups');
  });

  it('flags an oversized stacked child count as low fidelity (#2096)', () => {
    // 25 equal-size children: one group, but the stack exceeds the child cap.
    const cases = Array.from({ length: 25 }, () => PNG_60x40);
    const model = buildFramesModelFromFlatExport(blockDiagramHtml([PNG_200x150, ...cases]))!;
    const fidelity = assessFramesModelFidelity(model);
    expect(fidelity.childCount).toBe(25);
    expect(fidelity.faithful).toBe(false);
    expect(fidelity.reason).toContain('stacked child frames');
  });
});
