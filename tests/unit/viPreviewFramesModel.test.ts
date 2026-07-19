import { describe, expect, it } from 'vitest';

import {
  findFramesRoot,
  groupFramesIntoStructures,
  normalizeViPreviewFrames,
  buildFramesModelFromCoordinateJson,
  type ViPreviewFrame
} from '../../src/reporting/viPreview/viPreviewFramesModel';

describe('normalizeViPreviewFrames', () => {
  it('returns undefined for non-array or empty input (VHS-REQ-659.11)', () => {
    expect(normalizeViPreviewFrames(undefined)).toBeUndefined();
    expect(normalizeViPreviewFrames(null)).toBeUndefined();
    expect(normalizeViPreviewFrames('nope')).toBeUndefined();
    expect(normalizeViPreviewFrames([])).toBeUndefined();
  });

  it('normalizes field-name variants and prefixes bare base64 with a data URI (VHS-REQ-659.17)', () => {
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

  it('yields an empty image string when the image field is missing or non-string (VHS-REQ-659.17)', () => {
    const model = normalizeViPreviewFrames([
      { Position: { Left: 0, Top: 0, Width: 1, Height: 1 } }, // no image key at all
      { Image: 12345 }, // non-string image
      { Image: '' } // explicitly empty
    ]);
    expect(model!.frames[0].image).toBe('');
    expect(model!.frames[1].image).toBe('');
    expect(model!.frames[2].image).toBe('');
  });

  it('reads the lowercase image/base64 field-name fallbacks (VHS-REQ-659.17)', () => {
    const model = normalizeViPreviewFrames([
      { base64: 'CCCC' },
      { image: 'data:image/png;base64,DDDD' }
    ]);
    // Bare base64 gets the data-URI prefix; an already-prefixed value is kept.
    expect(model!.frames[0].image).toBe('data:image/png;base64,CCCC');
    expect(model!.frames[1].image).toBe('data:image/png;base64,DDDD');
  });

  it('treats a non-array Children field as no children (VHS-REQ-659.11)', () => {
    // A malformed export could emit Children as a scalar/object; it must yield an
    // empty child list rather than throw or iterate a non-array.
    const model = normalizeViPreviewFrames([
      { Image: 'A', Children: 'not-an-array' as unknown as number[] },
      { Image: 'B', Children: { bogus: true } as unknown as number[] }
    ]);
    expect(model!.frames[0].children).toEqual([]);
    expect(model!.frames[1].children).toEqual([]);
  });
});

describe('buildFramesModelFromCoordinateJson', () => {
  const oneFrame = [{ Image: 'AAAA', Position: { Left: 0, Top: 0, Width: 10, Height: 8 } }];

  it('parses a JSON-string bare frames array (#2117)', () => {
    const model = buildFramesModelFromCoordinateJson(JSON.stringify(oneFrame));
    expect(model).toBeDefined();
    expect(model!.frames).toHaveLength(1);
    expect(model!.frames[0].rect).toEqual({ left: 0, top: 0, width: 10, height: 8 });
  });

  it('parses an object wrapping the array under frames/Frames (#2117)', () => {
    expect(buildFramesModelFromCoordinateJson(JSON.stringify({ frames: oneFrame }))!.frames).toHaveLength(1);
    expect(buildFramesModelFromCoordinateJson(JSON.stringify({ Frames: oneFrame }))!.frames).toHaveLength(1);
  });

  it('accepts an already-parsed value (array or wrapper object) (#2117)', () => {
    expect(buildFramesModelFromCoordinateJson(oneFrame)!.frames).toHaveLength(1);
    expect(buildFramesModelFromCoordinateJson({ frames: oneFrame })!.frames).toHaveLength(1);
  });

  it('returns undefined for absent, empty, unparseable, or wrong-shaped payloads (#2117)', () => {
    expect(buildFramesModelFromCoordinateJson(undefined)).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson('')).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson('   ')).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson('{ not valid json')).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson('[]')).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson(JSON.stringify({ frames: [] }))).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson(JSON.stringify({ other: 1 }))).toBeUndefined();
    expect(buildFramesModelFromCoordinateJson(42)).toBeUndefined();
  });

  it('preserves real coordinates and structure (no size-grouping heuristic) (#2117)', () => {
    // A root plus two same-size children at DIFFERENT positions: the coordinate
    // model keeps their real rects (the flat builder would have collapsed them
    // into one stacked group).
    const model = buildFramesModelFromCoordinateJson([
      { Image: 'root', Position: { Left: 0, Top: 0, Width: 100, Height: 80 }, Children: [1, 2] },
      { Image: 'caseA', Position: { Left: 10, Top: 20, Width: 30, Height: 30 } },
      { Image: 'caseB', Position: { Left: 50, Top: 20, Width: 30, Height: 30 } }
    ])!;
    expect(model.rootIndex).toBe(0);
    expect(model.frames[1].rect).toEqual({ left: 10, top: 20, width: 30, height: 30 });
    expect(model.frames[2].rect).toEqual({ left: 50, top: 20, width: 30, height: 30 });
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
