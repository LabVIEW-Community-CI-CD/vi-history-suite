import { describe, expect, it } from 'vitest';

import { selectViPreviewDocument } from '../../src/reporting/viPreview/viPreviewRenderMode';

// Minimal valid PNGs (signature + IHDR only) at known sizes so the flat-frames
// extractor decodes real dimensions.
const PNG_200x150 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAIAAAA=';
const PNG_60x40 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAA=';

function diagramHtml(): string {
  return `<HTML><HEAD></HEAD><BODY>\n<H3>Block Diagram</H3>\n<P><IMG src="${PNG_200x150}"></P>\n<P><IMG src="${PNG_60x40}"></P>\n<P><IMG src="${PNG_60x40}"></P>\n<H3>VI Revision History</H3>\n</BODY></HTML>`;
}

const NONCE = 'sel123NONCE';

describe('selectViPreviewDocument', () => {
  it('returns the static document for document mode (VHS-REQ-659.19)', () => {
    const out = selectViPreviewDocument({ labviewHtml: diagramHtml(), mode: 'document' });
    expect(out.mode).toBe('document');
    expect(out.html).toContain('Content-Security-Policy');
    expect(out.html).toContain("script-src 'none'");
  });

  it('honors an explicit document request even when interactive rendering would be possible (VHS-REQ-659.19)', () => {
    // A document request supplies a valid nonce AND frames-capable HTML, i.e. the
    // interactive viewer COULD be built. The `mode !== 'interactive'` guard must
    // still return the static document; without that guard this would wrongly
    // emit the interactive viewer.
    const out = selectViPreviewDocument({ labviewHtml: diagramHtml(), mode: 'document', nonce: NONCE });
    expect(out.mode).toBe('document');
    expect(out.html).toContain("script-src 'none'");
    expect(out.html).not.toContain('id="lvr-frames"');
    expect(out.html).not.toContain(`nonce-${NONCE}`);
  });

  it('builds the interactive viewer for interactive mode with frames + nonce (VHS-REQ-659.19)', () => {
    const out = selectViPreviewDocument({ labviewHtml: diagramHtml(), mode: 'interactive', nonce: NONCE });
    expect(out.mode).toBe('interactive');
    expect(out.html).toContain(`script-src 'nonce-${NONCE}';`);
    expect(out.html).toContain('id="lvr-frames"');
  });

  it('falls back to the document when interactive mode has no nonce (VHS-REQ-659.19)', () => {
    const out = selectViPreviewDocument({ labviewHtml: diagramHtml(), mode: 'interactive' });
    expect(out.mode).toBe('document');
    expect(out.html).toContain("script-src 'none'");
  });

  it('falls back to the document when no block-diagram frames extract (VHS-REQ-659.19)', () => {
    const noDiagram = '<HTML><HEAD></HEAD><BODY><H3>Front Panel</H3></BODY></HTML>';
    const out = selectViPreviewDocument({ labviewHtml: noDiagram, mode: 'interactive', nonce: NONCE });
    expect(out.mode).toBe('document');
    expect(out.html).not.toContain('id="lvr-frames"');
  });

  it('falls back to the document when the reconstruction is too low-fidelity (#2096)', () => {
    // A complex diagram: 9 differently-sized block-diagram images reconstruct
    // into 9 coordinate-less structure groups (> the fidelity cap), so the
    // interactive layout would misrepresent the diagram — fall back instead.
    const png = (w: number, h: number): string => {
      const header = Buffer.alloc(24);
      header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      header.writeUInt32BE(13, 8);
      header.write('IHDR', 12, 'ascii');
      header.writeUInt32BE(w, 16);
      header.writeUInt32BE(h, 20);
      return `data:image/png;base64,${header.toString('base64')}`;
    };
    const imgs = Array.from({ length: 10 }, (_v, i) => `<P><IMG src="${png(100 + i, 50 + i)}"></P>`).join('\n');
    const complex = `<HTML><BODY>\n<H3>Block Diagram</H3>\n${imgs}\n<H3>VI Revision History</H3>\n</BODY></HTML>`;
    const out = selectViPreviewDocument({ labviewHtml: complex, mode: 'interactive', nonce: NONCE });
    expect(out.mode).toBe('document');
    expect(out.html).toContain("script-src 'none'");
    expect(out.html).not.toContain('id="lvr-frames"');
    // The user is told why the interactive stepper was skipped.
    expect(out.fallbackReason).toBeDefined();
    expect(out.html).toContain('interactive block-diagram viewer was skipped');
  });

  it('does not attach a fallback reason or notice for an explicit document request (#2096)', () => {
    const out = selectViPreviewDocument({ labviewHtml: diagramHtml(), mode: 'document', nonce: NONCE });
    expect(out.mode).toBe('document');
    expect(out.fallbackReason).toBeUndefined();
    expect(out.html).not.toContain('interactive block-diagram viewer was skipped');
  });

  it('prefers a coordinate frames payload over the flat reconstruction (#2117)', () => {
    // The coordinate model renders the interactive viewer even when the labviewHtml
    // has no extractable block-diagram frames (the flat path would fall back).
    const noFlatFrames = '<HTML><HEAD></HEAD><BODY><H3>Front Panel</H3></BODY></HTML>';
    const coordinateFramesJson = JSON.stringify([
      { Image: 'AAAA', Position: { Left: 0, Top: 0, Width: 100, Height: 80 }, Children: [1] },
      { Image: 'BBBB', Position: { Left: 10, Top: 20, Width: 40, Height: 40 }, Label: 'True' }
    ]);
    const out = selectViPreviewDocument({
      labviewHtml: noFlatFrames,
      mode: 'interactive',
      nonce: NONCE,
      coordinateFramesJson
    });
    expect(out.mode).toBe('interactive');
    expect(out.html).toContain(`script-src 'nonce-${NONCE}';`);
    expect(out.html).toContain('id="lvr-frames"');
    expect(out.fallbackReason).toBeUndefined();
  });

  it('renders interactively from coordinates even when the flat path would reject as low-fidelity (#2117)', () => {
    // A complex diagram (many distinct same-size groups) that the flat #2096
    // fidelity gate rejects — but with real coordinates it is faithful, so the
    // coordinate model is shown interactively.
    const complexFlat = (() => {
      const png = (w: number, h: number): string => {
        const header = Buffer.alloc(24);
        header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
        header.writeUInt32BE(13, 8);
        header.write('IHDR', 12, 'ascii');
        header.writeUInt32BE(w, 16);
        header.writeUInt32BE(h, 20);
        return `data:image/png;base64,${header.toString('base64')}`;
      };
      const imgs = Array.from({ length: 10 }, (_v, i) => `<P><IMG src="${png(100 + i, 50 + i)}"></P>`).join('\n');
      return `<HTML><BODY>\n<H3>Block Diagram</H3>\n${imgs}\n</BODY></HTML>`;
    })();
    const coordinateFramesJson = JSON.stringify(
      Array.from({ length: 11 }, (_v, i) =>
        i === 0
          ? { Image: 'root', Position: { Left: 0, Top: 0, Width: 500, Height: 400 }, Children: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
          : { Image: `c${i}`, Position: { Left: i * 40, Top: i * 30, Width: 30, Height: 30 } }
      )
    );
    const out = selectViPreviewDocument({
      labviewHtml: complexFlat,
      mode: 'interactive',
      nonce: NONCE,
      coordinateFramesJson
    });
    expect(out.mode).toBe('interactive');
    expect(out.html).toContain('id="lvr-frames"');
  });

  it('falls back to the flat path when the coordinate payload is invalid (#2117)', () => {
    // An unparseable/empty coordinate payload must not break rendering: it falls
    // through to the flat-export path, which renders interactively for this
    // simple diagram.
    const out = selectViPreviewDocument({
      labviewHtml: diagramHtml(),
      mode: 'interactive',
      nonce: NONCE,
      coordinateFramesJson: '{ not valid json'
    });
    expect(out.mode).toBe('interactive');
    expect(out.html).toContain('id="lvr-frames"');
  });
});
