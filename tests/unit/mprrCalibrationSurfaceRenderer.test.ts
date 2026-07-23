// Requirement coverage: VHS-REQ-710 (NI LabVIEW setup diagnostics family) — the
// cross-platform mprr calibration-surface renderer (VHS-REQ-710.7). Pure and
// deterministic: dimensions in, identical HTML + review-capture-calibration-
// surface-v1 metadata out, so calibration can be proven on a non-Windows host.
import { describe, expect, it } from 'vitest';

import { MPRR_CALIBRATION_MARKERS } from '../../src/reporting/syncDiagnostics/mprrCalibrationSurface';
import {
  buildMprrCalibrationSurfaceMetadata,
  renderMprrCalibrationSurfaceHtml,
  resolveMarkerRect
} from '../../src/reporting/syncDiagnostics/mprrCalibrationSurfaceRenderer';

const DIM = { width: 1920, height: 1080 };

describe('resolveMarkerRect (VHS-REQ-710.7)', () => {
  it('mirrors mprr geometry: round, 12px minimum, clamp inside the surface', () => {
    const topLeft = resolveMarkerRect(DIM, MPRR_CALIBRATION_MARKERS[0]); // 0,0,0.09,0.10
    expect(topLeft).toEqual({ left: 0, top: 0, width: 173, height: 108 });
    const topRight = MPRR_CALIBRATION_MARKERS.find((m) => m.id === 'top-right')!;
    const rect = resolveMarkerRect(DIM, topRight); // relLeft 0.91
    // round(1920*0.91)=1747 clamped to width-width(173)=1747.
    expect(rect.left).toBe(1747);
    expect(rect.left + rect.width).toBeLessThanOrEqual(DIM.width);
  });

  it('applies the 12px minimum on a tiny surface', () => {
    const rect = resolveMarkerRect({ width: 64, height: 64 }, MPRR_CALIBRATION_MARKERS[0]);
    expect(rect.width).toBeGreaterThanOrEqual(12);
    expect(rect.height).toBeGreaterThanOrEqual(12);
  });
});

describe('buildMprrCalibrationSurfaceMetadata (VHS-REQ-710.7)', () => {
  it('emits the review-capture-calibration-surface-v1 contract', () => {
    const meta = buildMprrCalibrationSurfaceMetadata(DIM);
    expect(meta.schemaVersion).toBe('review-capture-calibration-surface-v1');
    expect(meta.surfaceId).toBe('windows-host-primary-monitor-calibration-surface');
    expect(meta.maximumColorDistance).toBe(60);
    expect(meta.screenBounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(meta.markers).toHaveLength(8);
    expect(meta.markers[0]).toMatchObject({ id: 'top-left', expectedColorRgb: { r: 220, g: 30, b: 30 } });
  });

  it('fails closed on invalid dimensions', () => {
    expect(() => buildMprrCalibrationSurfaceMetadata({ width: 32, height: 1080 })).toThrow(/integers >= 64/);
    expect(() => buildMprrCalibrationSurfaceMetadata({ width: 100.5, height: 100 })).toThrow(/integers >= 64/);
  });
});

describe('renderMprrCalibrationSurfaceHtml (VHS-REQ-710.7)', () => {
  it('renders a bordered white surface with all eight colored markers', () => {
    const html = renderMprrCalibrationSurfaceHtml(DIM);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('border:');
    expect(html).toContain('solid #000000');
    for (const marker of MPRR_CALIBRATION_MARKERS) {
      expect(html).toContain(`data-marker-id="${marker.id}"`);
      expect(html).toContain(`rgb(${marker.expectedColorRgb.r}, ${marker.expectedColorRgb.g}, ${marker.expectedColorRgb.b})`);
    }
    expect(html).toContain('width: 1920px');
  });

  it('fails closed on invalid dimensions', () => {
    expect(() => renderMprrCalibrationSurfaceHtml({ width: 10, height: 10 })).toThrow(/integers >= 64/);
  });
});
