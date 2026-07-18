import { describe, expect, it } from 'vitest';

import {
  findFramesRoot,
  groupFramesIntoStructures,
  normalizeViPreviewFrames,
  type ViPreviewFrame
} from '../../src/reporting/viPreview/viPreviewFramesModel';

describe('normalizeViPreviewFrames', () => {
  it('returns undefined for non-array or empty input (VHS-REQ-659.11)', () => {
    expect(normalizeViPreviewFrames(undefined)).toBeUndefined();
    expect(normalizeViPreviewFrames(null)).toBeUndefined();
    expect(normalizeViPreviewFrames('nope')).toBeUndefined();
    expect(normalizeViPreviewFrames([])).toBeUndefined();
  });

  it('normalizes field-name variants and prefixes bare base64 with a data URI (VHS-REQ-659.11)', () => {
    const model = normalizeViPreviewFrames([
      {
        'Base64 Image': 'AAAA',
        Position: { Left: 1, Top: 2, Width: 3, Height: 4 },
        'Child Indices': [1],
        Name: 'root'
      },
      {
        Image: 'data:image/png;base64,BBBB',
        Position: { Left: 5, Top: 6, Right: 15, Bottom: 26 },
        Label: 'True'
      }
    ]);
    expect(model).toBeDefined();
    const frames = model!.frames;
    expect(frames[0].image).toBe('data:image/png;base64,AAAA');
    expect(frames[0].rect).toEqual({ left: 1, top: 2, width: 3, height: 4 });
    expect(frames[0].children).toEqual([1]);
    expect(frames[0].label).toBe('root');
    // Right/Bottom pair resolves to width/height.
    expect(frames[1].image).toBe('data:image/png;base64,BBBB');
    expect(frames[1].rect).toEqual({ left: 5, top: 6, width: 10, height: 20 });
    expect(frames[1].label).toBe('True');
  });

  it('drops out-of-range, self, and duplicate child references (VHS-REQ-659.11)', () => {
    const model = normalizeViPreviewFrames([
      { Image: 'A', Children: [0, 1, 1, 9, -1] },
      { Image: 'B' }
    ]);
    // 0 is the frame's OWN index (self-reference) and is dropped to prevent
    // infinite recursion; 9 and -1 are out of range; duplicate 1 is collapsed.
    expect(model!.frames[0].children).toEqual([1]);
  });

  it('resolves the root as the unreferenced frame (VHS-REQ-659.11)', () => {
    const model = normalizeViPreviewFrames([
      { Image: 'child', Label: 'c' },
      { Image: 'root', Children: [0] }
    ]);
    expect(model!.rootIndex).toBe(1);
  });
});

describe('findFramesRoot', () => {
  it('falls back to 0 when every frame is referenced (cycle)', () => {
    const frames: ViPreviewFrame[] = [
      { image: 'a', rect: { left: 0, top: 0, width: 0, height: 0 }, children: [1] },
      { image: 'b', rect: { left: 0, top: 0, width: 0, height: 0 }, children: [0] }
    ];
    expect(findFramesRoot(frames)).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(findFramesRoot([])).toBe(0);
  });
});

describe('groupFramesIntoStructures', () => {
  it('groups children sharing a rectangle into one multi-case structure (VHS-REQ-659.11)', () => {
    const frames: ViPreviewFrame[] = [
      { image: 'root', rect: { left: 0, top: 0, width: 100, height: 100 }, children: [1, 2, 3] },
      { image: 'caseA', rect: { left: 10, top: 10, width: 40, height: 40 }, children: [], label: 'True' },
      { image: 'caseB', rect: { left: 10, top: 10, width: 40, height: 40 }, children: [], label: 'False' },
      { image: 'other', rect: { left: 60, top: 10, width: 20, height: 20 }, children: [] }
    ];
    const groups = groupFramesIntoStructures(frames, [1, 2, 3]);
    expect(groups).toHaveLength(2);
    expect(groups[0].cases).toEqual([1, 2]);
    expect(groups[0].rect).toEqual({ left: 10, top: 10, width: 40, height: 40 });
    expect(groups[1].cases).toEqual([3]);
  });

  it('ignores out-of-range indices safely', () => {
    const frames: ViPreviewFrame[] = [
      { image: 'root', rect: { left: 0, top: 0, width: 10, height: 10 }, children: [] }
    ];
    expect(groupFramesIntoStructures(frames, [5])).toEqual([]);
  });
});
