// Requirement coverage: VHS-REQ-713 (Real Windows Full-Matrix Runtime Validation
// Host) — the dev-only live mprr timing-stopwatch surface (VHS-REQ-713.6), the
// ground-truth per-frame capture clock. Pure/deterministic: the client-side strip
// encoding must match the shipped decodeMprrStripImage convention so a captured
// frame decodes back to the printed centiseconds.
import { describe, expect, it } from 'vitest';

import { renderLiveTimingStopwatchHtml } from '../../src/dev/timingStopwatchSurface';
import { MACHINE_STRIP_BIT_LENGTH } from '../../src/reporting/syncDiagnostics/syncPatternFailureSignature';

describe('renderLiveTimingStopwatchHtml (VHS-REQ-713.6)', () => {
  it('is a deterministic full-viewport HTML document', () => {
    const a = renderLiveTimingStopwatchHtml();
    const b = renderLiveTimingStopwatchHtml();
    expect(a).toBe(b);
    expect(a.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(a).toContain('width: 100vw');
    expect(a).toContain('height: 100vh');
  });

  it('positions the 40-cell strip at the mprr strip region (7vh..16vh, full width) (VHS-REQ-713.6)', () => {
    const html = renderLiveTimingStopwatchHtml();
    expect(html).toContain('id="strip"');
    expect(html).toContain('top: 7vh');
    expect(html).toContain('height: 9vh');
    expect(html).toContain('width: 100vw');
    expect(html).toContain(`var CELLS = ${MACHINE_STRIP_BIT_LENGTH}`);
    expect(MACHINE_STRIP_BIT_LENGTH).toBe(40);
  });

  it('ports the shipped strip encoding verbatim: 10100101 preamble + 24-bit cs + 8-bit XOR checksum (VHS-REQ-713.6)', () => {
    const html = renderLiveTimingStopwatchHtml();
    // Preamble literal, 24-bit payload pad, 8-bit checksum pad, XOR of the three bytes.
    expect(html).toContain("return '10100101' + payload + chk;");
    expect(html).toContain('while (payload.length < 24)');
    expect(html).toContain('while (chk.length < 8)');
    expect(html).toContain('(hi ^ mid ^ lo)');
    expect(html).toContain('Math.min(16777215');
  });

  it('uses the decoder bit convention (bit 1 = black, 0 = white) and animates at frame rate (VHS-REQ-713.6)', () => {
    const html = renderLiveTimingStopwatchHtml();
    expect(html).toContain("bits.charAt(i) === '1' ? '#000000' : '#ffffff'");
    expect(html).toContain('requestAnimationFrame(frame)');
  });
});
