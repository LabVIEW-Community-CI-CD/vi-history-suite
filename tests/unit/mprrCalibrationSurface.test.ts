// Requirement coverage: VHS-REQ-710 (NI LabVIEW setup diagnostics family) — the
// mprr review-capture calibration-surface evaluator (VHS-REQ-710.6). Pure and
// deterministic: observed markers in, one calibration verdict out. Grounded in
// the authoritative mprr contract review-capture-calibration-surface-v1.
import { describe, expect, it } from 'vitest';

import {
  MPRR_CALIBRATION_MARKERS,
  MPRR_CALIBRATION_MARKER_IDS,
  MPRR_CALIBRATION_MAX_COLOR_DISTANCE,
  MPRR_CALIBRATION_SURFACE_SCHEMA,
  MPRR_SOURCE_SURFACE_SCHEMA,
  type CalibrationMarkerObservation,
  colorDistanceRgb,
  evaluateMprrCalibration,
  renderMprrCalibrationSummary
} from '../../src/reporting/syncDiagnostics/mprrCalibrationSurface';

// Build the eight observations exactly matching mprr's expected marker colors,
// all within their bounds (a perfectly calibrated capture).
function perfectObservations(): CalibrationMarkerObservation[] {
  return MPRR_CALIBRATION_MARKERS.map((marker) => ({
    id: marker.id,
    detectedColorRgb: { ...marker.expectedColorRgb },
    withinExpectedBounds: true
  }));
}

describe('mprr calibration contract constants (VHS-REQ-710.6)', () => {
  it('mirrors the mprr eight-edge-fiducial surface', () => {
    expect(MPRR_CALIBRATION_MARKERS).toHaveLength(8);
    expect(MPRR_CALIBRATION_MARKER_IDS).toEqual([
      'top-left',
      'top-center',
      'top-right',
      'right-center',
      'bottom-right',
      'bottom-center',
      'bottom-left',
      'left-center'
    ]);
    expect(MPRR_CALIBRATION_MAX_COLOR_DISTANCE).toBe(60);
    expect(MPRR_SOURCE_SURFACE_SCHEMA).toBe('review-capture-calibration-surface-v1');
  });
});

describe('colorDistanceRgb (VHS-REQ-710.6)', () => {
  it('computes the Euclidean RGB distance', () => {
    expect(colorDistanceRgb({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 })).toBe(0);
    expect(colorDistanceRgb({ r: 0, g: 0, b: 0 }, { r: 3, g: 4, b: 0 })).toBe(5);
  });
});

describe('evaluateMprrCalibration (VHS-REQ-710.6)', () => {
  it('reports CALIBRATED when the border is visible and all eight fiducials match', () => {
    const result = evaluateMprrCalibration({ borderVisible: true, markers: perfectObservations() });
    expect(result.schema).toBe(MPRR_CALIBRATION_SURFACE_SCHEMA);
    expect(result.calibrated).toBe(true);
    expect(result.fault).toBe('none');
    expect(result.detectedMarkerCount).toBe(8);
    expect(result.expectedMarkerCount).toBe(8);
    expect(result.maximumColorDistance).toBe(60);
  });

  it('classifies border-missing over any marker fault (wrong surface entirely)', () => {
    // Border missing AND a marker absent -> border-missing wins (most fundamental).
    const markers = perfectObservations().slice(1);
    const result = evaluateMprrCalibration({ borderVisible: false, markers });
    expect(result.calibrated).toBe(false);
    expect(result.fault).toBe('border-missing');
  });

  it('classifies fiducial-missing when an expected marker is not observed', () => {
    const markers = perfectObservations().filter((m) => m.id !== 'bottom-left');
    const result = evaluateMprrCalibration({ borderVisible: true, markers });
    expect(result.fault).toBe('fiducial-missing');
    expect(result.detectedMarkerCount).toBe(7);
    const missing = result.markers.find((m) => m.id === 'bottom-left')!;
    expect(missing.present).toBe(false);
    expect(missing.colorDistance).toBeNull();
  });

  it('classifies fiducial-misplaced when a present marker is out of bounds', () => {
    const markers = perfectObservations().map((m) => (m.id === 'top-right' ? { ...m, withinExpectedBounds: false } : m));
    const result = evaluateMprrCalibration({ borderVisible: true, markers });
    expect(result.fault).toBe('fiducial-misplaced');
  });

  it('classifies fiducial-color-drift when a present, in-bounds marker exceeds the tolerance', () => {
    const markers = perfectObservations().map((m) =>
      m.id === 'top-left' ? { ...m, detectedColorRgb: { r: 0, g: 200, b: 200 } } : m
    );
    const result = evaluateMprrCalibration({ borderVisible: true, markers });
    expect(result.fault).toBe('fiducial-color-drift');
    const drifted = result.markers.find((m) => m.id === 'top-left')!;
    expect(drifted.colorWithinTolerance).toBe(false);
    expect(drifted.detected).toBe(false);
  });

  it('honors a stricter maximumColorDistance override', () => {
    // A small drift that passes at 60 but fails at 5.
    const markers = perfectObservations().map((m) =>
      m.id === 'left-center' ? { ...m, detectedColorRgb: { r: m.detectedColorRgb.r + 10, g: m.detectedColorRgb.g, b: m.detectedColorRgb.b } } : m
    );
    expect(evaluateMprrCalibration({ borderVisible: true, markers }).calibrated).toBe(true);
    const strict = evaluateMprrCalibration({ borderVisible: true, markers, maximumColorDistance: 5 });
    expect(strict.calibrated).toBe(false);
    expect(strict.fault).toBe('fiducial-color-drift');
  });

  it('fails closed on a non-array marker list and a non-positive tolerance', () => {
    expect(() => evaluateMprrCalibration({ borderVisible: true, markers: undefined as never })).toThrow(/markers array/);
    expect(() => evaluateMprrCalibration({ borderVisible: true, markers: [], maximumColorDistance: 0 })).toThrow(/positive number/);
  });
});

describe('renderMprrCalibrationSummary (VHS-REQ-710.6)', () => {
  it('summarizes a calibrated verdict and a faulted verdict deterministically', () => {
    const ok = renderMprrCalibrationSummary(evaluateMprrCalibration({ borderVisible: true, markers: perfectObservations() }));
    expect(ok).toContain('mprr calibration CALIBRATED: 8/8 fiducials, border visible');
    expect(ok).toContain('- top-left: ok');

    const bad = renderMprrCalibrationSummary(
      evaluateMprrCalibration({ borderVisible: false, markers: perfectObservations() })
    );
    expect(bad).toContain('NOT CALIBRATED (border-missing)');
    expect(bad).toContain('border missing');
  });
});
