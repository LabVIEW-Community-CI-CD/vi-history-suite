import { describe, expect, it } from 'vitest';

import {
  assessCoordinateFramesIsland,
  describeCoordinateFramesAssessment,
  COORDINATE_FRAMES_ISLAND_ID
} from '../../src/reporting/viPreview/coordinateFramesAcceptance';

// VHS-REQ-703.9 (epic #2262): the coordinate-frames export acceptance predicate.
// Pure — grades a rendered HTML document against the island contract with no
// LabVIEW runtime or DOM.

const IMG = 'data:image/png;base64,AAAA';

/** Wraps a coordinate-frames JSON payload in the island tag the exporter emits. */
function withIsland(json: string): string {
  return (
    '<html><body><img src="x"/>' +
    `<script type="application/json" id="${COORDINATE_FRAMES_ISLAND_ID}">${json}</script>` +
    '</body></html>'
  );
}

describe('assessCoordinateFramesIsland (VHS-REQ-703.9)', () => {
  it('rejects HTML with no island (the current shipped export)', () => {
    const a = assessCoordinateFramesIsland('<html><body><img src="x"/></body></html>');
    expect(a.accepted).toBe(false);
    expect(a.islandPresent).toBe(false);
    expect(a.frameCount).toBe(0);
    expect(a.rootIndex).toBeNull();
    expect(a.issues).toEqual(['island-absent']);
  });

  it('rejects an island whose JSON does not parse', () => {
    const a = assessCoordinateFramesIsland(withIsland('{not json'));
    // An unparseable body is treated as no island by the extractor's consumer,
    // so it reports island-absent rather than a partial parse.
    expect(a.accepted).toBe(false);
    expect(a.issues.length).toBeGreaterThan(0);
  });

  it('rejects an island that parses but has an empty frames array', () => {
    const a = assessCoordinateFramesIsland(withIsland('{"frames": []}'));
    expect(a.accepted).toBe(false);
    // The island tag is present and its JSON parses, but an empty frames array
    // yields no model, so it is reported as unparseable (present-but-unusable).
    expect(a.islandPresent).toBe(true);
    expect(a.issues).toContain('island-unparseable');
  });

  it('rejects frames with no real geometry (all-zero rectangles)', () => {
    const json = JSON.stringify([
      { Image: IMG, Position: { Left: 0, Top: 0, Width: 0, Height: 0 } }
    ]);
    const a = assessCoordinateFramesIsland(withIsland(json));
    expect(a.islandPresent).toBe(true);
    expect(a.frameCount).toBe(1);
    expect(a.framesWithGeometry).toBe(0);
    expect(a.accepted).toBe(false);
    expect(a.issues).toContain('no-frame-geometry');
  });

  it('rejects frames with geometry but no images', () => {
    const json = JSON.stringify([
      { Position: { Left: 1, Top: 2, Width: 40, Height: 30 } }
    ]);
    const a = assessCoordinateFramesIsland(withIsland(json));
    expect(a.framesWithGeometry).toBe(1);
    expect(a.framesWithImages).toBe(0);
    expect(a.accepted).toBe(false);
    expect(a.issues).toContain('no-frame-images');
  });

  it('accepts a valid island with geometry and images', () => {
    const json = JSON.stringify([
      { Image: IMG, Position: { Left: 0, Top: 0, Width: 200, Height: 150 }, Children: [1] },
      { Image: IMG, Position: { Left: 10, Top: 10, Width: 60, Height: 40 }, Label: 'True' }
    ]);
    const a = assessCoordinateFramesIsland(withIsland(json));
    expect(a.accepted).toBe(true);
    expect(a.islandPresent).toBe(true);
    expect(a.frameCount).toBe(2);
    expect(a.framesWithGeometry).toBe(2);
    expect(a.framesWithImages).toBe(2);
    expect(a.rootIndex).toBe(0);
    expect(a.issues).toEqual([]);
  });

  it('accepts the bare frames-array top-level shape too', () => {
    const json = JSON.stringify([
      { Image: IMG, Position: { Left: 0, Top: 0, Width: 100, Height: 80 } }
    ]);
    const a = assessCoordinateFramesIsland(withIsland(json));
    expect(a.accepted).toBe(true);
    expect(a.frameCount).toBe(1);
  });

  it('describes an accepted and a rejected assessment for harness output', () => {
    const ok = describeCoordinateFramesAssessment(
      assessCoordinateFramesIsland(
        withIsland(JSON.stringify([{ Image: IMG, Position: { Left: 0, Top: 0, Width: 10, Height: 10 } }]))
      )
    );
    expect(ok).toContain('ACCEPTED');
    const bad = describeCoordinateFramesAssessment(assessCoordinateFramesIsland('<html></html>'));
    expect(bad).toContain('REJECTED');
    expect(bad).toContain(COORDINATE_FRAMES_ISLAND_ID);
  });
});
