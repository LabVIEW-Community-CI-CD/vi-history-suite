// Requirement coverage: VHS-REQ-710 (NI LabVIEW setup diagnostics family) — the
// governed mprr stopwatch-surface renderer (VHS-REQ-710.11). Pure/deterministic;
// exercises edge cases (zero, 24-bit clamping, multi-hour text, geometry).
import { describe, expect, it } from 'vitest';

import { encodeMprrMachineStrip, formatMprrStopwatchText, MPRR_MAX_STRIP_CENTISECONDS } from '../../src/reporting/mirror/perfmonMprrSync';
import {
  buildMprrStopwatchStripRegion,
  renderMprrStopwatchSurfaceHtml
} from '../../src/reporting/syncDiagnostics/mprrStopwatchSurfaceRenderer';

function renderedBits(html: string): string {
  return [...html.matchAll(/data-cell-index="(\d+)" data-bit="([01])"/g)]
    .map((m) => ({ i: Number(m[1]), bit: m[2] }))
    .sort((a, b) => a.i - b.i)
    .map((c) => c.bit)
    .join('');
}

describe('buildMprrStopwatchStripRegion (VHS-REQ-710.11)', () => {
  it('places the strip at mprr geometry (top 7%, height 9%, full width)', () => {
    expect(buildMprrStopwatchStripRegion({ width: 1280, height: 800 })).toEqual({ left: 0, top: 56, width: 1280, height: 72 });
  });

  it('fails closed on tiny dimensions', () => {
    expect(() => buildMprrStopwatchStripRegion({ width: 32, height: 800 })).toThrow(/integers >= 64/);
  });
});

describe('renderMprrStopwatchSurfaceHtml (VHS-REQ-710.11)', () => {
  it('renders exactly 40 strip cells that reconstruct the encoded machine strip', () => {
    const html = renderMprrStopwatchSurfaceHtml({ centiseconds: 100, width: 800, height: 200 });
    expect((html.match(/data-cell-index=/g) ?? []).length).toBe(40);
    expect(renderedBits(html)).toBe(encodeMprrMachineStrip(100));
    expect(html).toContain('>00:00:01.00<');
  });

  it('renders zero centiseconds as the preamble + zero payload + zero checksum', () => {
    const html = renderMprrStopwatchSurfaceHtml({ centiseconds: 0, width: 800, height: 200 });
    expect(renderedBits(html)).toBe(encodeMprrMachineStrip(0));
    expect(html).toContain('>00:00:00.00<');
  });

  it('clamps the strip payload at the 24-bit ceiling while the printed time reflects the full elapsed value', () => {
    const overflow = MPRR_MAX_STRIP_CENTISECONDS + 5000;
    const html = renderMprrStopwatchSurfaceHtml({ centiseconds: overflow, width: 800, height: 200 });
    // Strip clamps to the ceiling...
    expect(renderedBits(html)).toBe(encodeMprrMachineStrip(MPRR_MAX_STRIP_CENTISECONDS));
    // ...but the printed multi-hour text uses the full value.
    expect(html).toContain(`>${formatMprrStopwatchText(overflow * 10)}<`);
  });

  it('floors a negative centiseconds on the unsigned strip + time but preserves the signed value in the diagnostic title', () => {
    // A negative reading is a signed difference (e.g. a cross-time-zone or
    // cross-source capture skew). mprr's strip + HH:MM:SS.cc are unsigned, so
    // they floor to zero...
    const html = renderMprrStopwatchSurfaceHtml({ centiseconds: -50, width: 800, height: 200 });
    expect(renderedBits(html)).toBe(encodeMprrMachineStrip(0));
    expect(html).toContain('>00:00:00.00<');
    // ...but the diagnostic <title> preserves the true signed centiseconds so the
    // difference is not misrepresented as zero.
    expect(html).toContain('cs=-50</title>');
  });

  it('renders the black border and the strip band at the strip region', () => {
    const html = renderMprrStopwatchSurfaceHtml({ centiseconds: 1234, width: 800, height: 200 });
    expect(html).toContain('solid #000000');
    const region = buildMprrStopwatchStripRegion({ width: 800, height: 200 });
    expect(html).toContain(`top: ${region.top}px; width: ${region.width}px; height: ${region.height}px`);
  });

  it('fails closed on non-finite centiseconds and tiny dimensions', () => {
    expect(() => renderMprrStopwatchSurfaceHtml({ centiseconds: Number.NaN, width: 800, height: 200 })).toThrow(/finite number/);
    expect(() => renderMprrStopwatchSurfaceHtml({ centiseconds: 0, width: 10, height: 200 })).toThrow(/integers >= 64/);
  });
});
