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
  it('emits a nonce-scoped CSP that forbids remote origins and non-nonce scripts (VHS-REQ-659.18)', () => {
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

  it('paints the diagram stage on a fixed white surface in all themes (VHS-REQ-659)', () => {
    const html = buildViPreviewFramesViewerHtml(sampleModel(), NONCE);
    const styleMatch = html.match(/\.lvr-stage\s*\{[^}]*\}/);
    expect(styleMatch).not.toBeNull();
    expect(styleMatch![0]).toContain('background: #ffffff');
    // The white surface must not depend on the VS Code theme variable.
    expect(styleMatch![0]).not.toContain('--vscode-editor-background');
  });

  it('sizes the stage and Fit target to the content bounds so stacked case frames are not clipped (VHS-REQ-659)', () => {
    const html = buildViPreviewFramesViewerHtml(sampleModel(), NONCE);
    // The viewer computes a content bounding box (union of root + all frame
    // rects) and sizes/fits to it, not to the root image dimensions alone, so
    // flat-export case steppers stacked below the diagram stay in the viewport.
    expect(html).toContain('function contentBounds(');
    expect(html).toContain('var bounds = contentBounds(w, h);');
    expect(html).toContain("stage.style.width = bounds.width + 'px'; stage.style.height = bounds.height + 'px';");
    expect(html).toContain('fit(bounds.width, bounds.height);');
  });

  it('counter-scales the case-stepper selectors against zoom so they stay clickable at fit-zoom (VHS-REQ-659)', () => {
    const html = buildViPreviewFramesViewerHtml(sampleModel(), NONCE);
    // The viewer keeps a registry of selectors and rescales them in apply().
    expect(html).toContain('function scaleSelector(');
    expect(html).toContain('selectors.push(sel);');
    expect(html).toContain("sel.style.transform = 'scale(' + inv + ')';");
    // apply() refreshes the counter-scale whenever the zoom changes.
    expect(html).toContain('for (var i = 0; i < selectors.length; i++) { scaleSelector(selectors[i]); }');
    // The selector counter-scale is anchored at the top-left.
    const styleMatch = html.match(/\.lvr-sel\s*\{[^}]*\}/);
    expect(styleMatch).not.toBeNull();
    expect(styleMatch![0]).toContain('transform-origin: 0 0');
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
