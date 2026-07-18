import { describe, expect, it } from 'vitest';

import { buildViPreviewFramesViewerHtml } from '../../src/reporting/viPreview/viPreviewFramesViewer';
import { normalizeViPreviewFrames } from '../../src/reporting/viPreview/viPreviewFramesModel';

const NONCE = 'abc123NONCE';

function sampleModel() {
  return normalizeViPreviewFrames([
    { Image: 'AAAA', Position: { Left: 0, Top: 0, Width: 200, Height: 150 }, Children: [1, 2] },
    { Image: 'BBBB', Position: { Left: 20, Top: 20, Width: 60, Height: 60 }, Label: 'True' },
    { Image: 'CCCC', Position: { Left: 20, Top: 20, Width: 60, Height: 60 }, Label: 'False' }
  ])!;
}

describe('buildViPreviewFramesViewerHtml', () => {
  it('emits a nonce-scoped CSP that forbids remote origins and non-nonce scripts (VHS-REQ-659.11)', () => {
    const html = buildViPreviewFramesViewerHtml(sampleModel(), NONCE);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(`script-src 'nonce-${NONCE}';`);
    expect(html).toContain('img-src data:;');
    expect(html).toContain("default-src 'none';");
    // Both scripts carry the nonce.
    expect(html).toContain(`<script id="lvr-frames" type="application/json" nonce="${NONCE}">`);
    expect(html).toContain(`<script nonce="${NONCE}">`);
  });

  it('embeds the frames JSON island with the resolved root and case labels (VHS-REQ-659.11)', () => {
    const html = buildViPreviewFramesViewerHtml(sampleModel(), NONCE);
    const islandMatch = /<script id="lvr-frames"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(islandMatch).not.toBeNull();
    const parsed = JSON.parse(islandMatch![1].replace(/\\u003c/g, '<'));
    expect(parsed.rootIndex).toBe(0);
    expect(parsed.frames).toHaveLength(3);
    expect(parsed.frames[1].label).toBe('True');
    expect(parsed.frames[2].label).toBe('False');
  });

  it('escapes < in the JSON island so an image or label cannot close the script tag early (VHS-REQ-659.11)', () => {
    const model = normalizeViPreviewFrames([
      { Image: 'AAAA', Position: { Left: 0, Top: 0, Width: 10, Height: 10 }, Label: '</script><script>evil()' }
    ])!;
    const html = buildViPreviewFramesViewerHtml(model, NONCE);
    // The raw closing sequence must never appear inside the island.
    const islandMatch = /<script id="lvr-frames"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(islandMatch![1]).not.toContain('</script>');
    expect(islandMatch![1]).toContain('\\u003c/script>');
  });

  it('renders an empty-state message container for a model with no frames', () => {
    // normalizeViPreviewFrames rejects empty input, so build directly with an
    // empty model to prove the viewer script guards the no-frames case.
    const html = buildViPreviewFramesViewerHtml({ frames: [], rootIndex: 0 }, NONCE);
    expect(html).toContain('id="lvr-root"');
    // The runtime script contains the empty-state fallback text.
    expect(html).toContain('No diagram frames to display.');
  });

  it('places child structures parent-relative without subtracting the parent offset (VHS-REQ-659.11)', () => {
    const html = buildViPreviewFramesViewerHtml(sampleModel(), NONCE);
    // Regression guard for the #1904 P2: the earlier absolute-vs-relative
    // heuristic subtracted the parent offset and shifted valid nested cases.
    expect(html).not.toContain('childRect.left - parentRect.left');
    expect(html).toContain('function placeWithin(childRect)');
  });
});
