/**
 * mprr review-capture calibration-surface evaluator (VHS-REQ-710 diagnostics family).
 *
 * SPATIAL calibration is the PREREQUISITE for every temporal/synchronization
 * claim: only once a capture is proven geometrically aligned to the screen can
 * the stopwatch strip region be located and its printed timestamp trusted (and
 * therefore correlated with a perfmon trace). This module grounds calibration in
 * the authoritative mprr contract `review-capture-calibration-surface-v1`, which
 * renders a full-screen surface with a solid black border and EIGHT edge fiducial
 * markers (not four corners), each at a fixed screen-relative rectangle and a
 * distinct expected color, detected when its color is within a maximum Euclidean
 * RGB distance of 60.
 *
 * Pure and deterministic: detected observations in, one calibration verdict out,
 * with the fault classified in root-cause order (a missing border means the wrong
 * surface entirely, before a missing marker, before a misplaced marker, before a
 * color drift) so the reported cause is fundamental, not a downstream symptom.
 */

export const MPRR_CALIBRATION_SURFACE_SCHEMA = 'vi-history-suite/mprr-calibration-surface@v1';
export const MPRR_CALIBRATION_SURFACE_SCHEMA_VERSION = 1;

/** The source-of-truth mprr surface schema this evaluator validates against. */
export const MPRR_SOURCE_SURFACE_SCHEMA = 'review-capture-calibration-surface-v1';

/** mprr's maximum Euclidean RGB distance for a marker to count as detected. */
export const MPRR_CALIBRATION_MAX_COLOR_DISTANCE = 60;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface CalibrationMarkerExpectation {
  readonly id: string;
  readonly role: string;
  readonly relativeLeft: number;
  readonly relativeTop: number;
  readonly relativeWidth: number;
  readonly relativeHeight: number;
  readonly expectedColorRgb: Rgb;
}

/** The eight edge fiducials exactly as mprr's calibration surface renders them. */
export const MPRR_CALIBRATION_MARKERS: readonly CalibrationMarkerExpectation[] = [
  { id: 'top-left', role: 'top-left', relativeLeft: 0.0, relativeTop: 0.0, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 220, g: 30, b: 30 } },
  { id: 'top-center', role: 'top-center', relativeLeft: 0.455, relativeTop: 0.0, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 245, g: 130, b: 32 } },
  { id: 'top-right', role: 'top-right', relativeLeft: 0.91, relativeTop: 0.0, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 24, g: 170, b: 52 } },
  { id: 'right-center', role: 'right-center', relativeLeft: 0.91, relativeTop: 0.45, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 24, g: 188, b: 216 } },
  { id: 'bottom-right', role: 'bottom-right', relativeLeft: 0.91, relativeTop: 0.9, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 236, g: 214, b: 31 } },
  { id: 'bottom-center', role: 'bottom-center', relativeLeft: 0.455, relativeTop: 0.9, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 188, g: 64, b: 214 } },
  { id: 'bottom-left', role: 'bottom-left', relativeLeft: 0.0, relativeTop: 0.9, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 45, g: 96, b: 227 } },
  { id: 'left-center', role: 'left-center', relativeLeft: 0.0, relativeTop: 0.45, relativeWidth: 0.09, relativeHeight: 0.1, expectedColorRgb: { r: 117, g: 48, b: 198 } }
];

export const MPRR_CALIBRATION_MARKER_IDS: readonly string[] = MPRR_CALIBRATION_MARKERS.map((marker) => marker.id);

/** A detected marker read back from a captured calibration frame. */
export interface CalibrationMarkerObservation {
  readonly id: string;
  readonly detectedColorRgb: Rgb;
  /** Whether the detected marker fell within its expected screen-relative rectangle. */
  readonly withinExpectedBounds: boolean;
}

export interface CalibrationMarkerResult {
  readonly id: string;
  readonly role: string;
  readonly present: boolean;
  /** Euclidean RGB distance to the expected color, or null when not observed. */
  readonly colorDistance: number | null;
  readonly colorWithinTolerance: boolean;
  readonly withinExpectedBounds: boolean;
  readonly detected: boolean;
}

export type CalibrationFault = 'none' | 'border-missing' | 'fiducial-missing' | 'fiducial-misplaced' | 'fiducial-color-drift';

export interface MprrCalibrationResult {
  readonly schema: typeof MPRR_CALIBRATION_SURFACE_SCHEMA;
  readonly schemaVersion: typeof MPRR_CALIBRATION_SURFACE_SCHEMA_VERSION;
  readonly sourceSurfaceSchema: typeof MPRR_SOURCE_SURFACE_SCHEMA;
  readonly maximumColorDistance: number;
  readonly borderVisible: boolean;
  readonly markers: readonly CalibrationMarkerResult[];
  readonly expectedMarkerCount: number;
  readonly detectedMarkerCount: number;
  /** True only when the border is visible and all eight fiducials are detected. */
  readonly calibrated: boolean;
  /** Root-cause fault classification (most fundamental first). */
  readonly fault: CalibrationFault;
}

export interface EvaluateMprrCalibrationInput {
  readonly borderVisible: boolean;
  readonly markers: readonly CalibrationMarkerObservation[];
  readonly maximumColorDistance?: number;
}

/** Euclidean distance between two RGB colors. */
export function colorDistanceRgb(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Evaluate a captured calibration frame against the mprr calibration-surface
 * contract. Fail-closed on a non-array marker list or a non-positive tolerance.
 * Pure and deterministic.
 */
export function evaluateMprrCalibration(input: EvaluateMprrCalibrationInput): MprrCalibrationResult {
  if (!input || !Array.isArray(input.markers)) {
    throw new Error('evaluateMprrCalibration requires a markers array.');
  }
  const maximumColorDistance = input.maximumColorDistance ?? MPRR_CALIBRATION_MAX_COLOR_DISTANCE;
  if (!Number.isFinite(maximumColorDistance) || maximumColorDistance <= 0) {
    throw new Error('maximumColorDistance must be a positive number.');
  }

  const observationsById = new Map<string, CalibrationMarkerObservation>();
  for (const observation of input.markers) {
    if (observation && typeof observation.id === 'string') {
      observationsById.set(observation.id, observation);
    }
  }

  const markers: CalibrationMarkerResult[] = MPRR_CALIBRATION_MARKERS.map((expected) => {
    const observation = observationsById.get(expected.id);
    if (!observation) {
      return {
        id: expected.id,
        role: expected.role,
        present: false,
        colorDistance: null,
        colorWithinTolerance: false,
        withinExpectedBounds: false,
        detected: false
      };
    }
    const colorDistance = colorDistanceRgb(observation.detectedColorRgb, expected.expectedColorRgb);
    const colorWithinTolerance = colorDistance <= maximumColorDistance;
    const withinExpectedBounds = observation.withinExpectedBounds === true;
    return {
      id: expected.id,
      role: expected.role,
      present: true,
      colorDistance,
      colorWithinTolerance,
      withinExpectedBounds,
      detected: colorWithinTolerance && withinExpectedBounds
    };
  });

  const detectedMarkerCount = markers.filter((marker) => marker.detected).length;
  const borderVisible = input.borderVisible === true;
  const calibrated = borderVisible && detectedMarkerCount === MPRR_CALIBRATION_MARKERS.length;

  let fault: CalibrationFault = 'none';
  if (!borderVisible) {
    fault = 'border-missing';
  } else if (markers.some((marker) => !marker.present)) {
    fault = 'fiducial-missing';
  } else if (markers.some((marker) => !marker.withinExpectedBounds)) {
    fault = 'fiducial-misplaced';
  } else if (markers.some((marker) => !marker.colorWithinTolerance)) {
    fault = 'fiducial-color-drift';
  }

  return {
    schema: MPRR_CALIBRATION_SURFACE_SCHEMA,
    schemaVersion: MPRR_CALIBRATION_SURFACE_SCHEMA_VERSION,
    sourceSurfaceSchema: MPRR_SOURCE_SURFACE_SCHEMA,
    maximumColorDistance,
    borderVisible,
    markers,
    expectedMarkerCount: MPRR_CALIBRATION_MARKERS.length,
    detectedMarkerCount,
    calibrated,
    fault
  };
}

/**
 * Render a compact, deterministic one-line-per-fact summary of a calibration
 * verdict for a log or a pull request.
 */
export function renderMprrCalibrationSummary(result: MprrCalibrationResult): string {
  const verdict = result.calibrated ? 'CALIBRATED' : `NOT CALIBRATED (${result.fault})`;
  const lines = [
    `mprr calibration ${verdict}: ${result.detectedMarkerCount}/${result.expectedMarkerCount} fiducials, border ${result.borderVisible ? 'visible' : 'missing'}`
  ];
  for (const marker of result.markers) {
    const distance = marker.colorDistance === null ? 'absent' : `Δcolor ${Math.round(marker.colorDistance * 10) / 10}`;
    lines.push(`- ${marker.id}: ${marker.detected ? 'ok' : 'fail'} (${distance})`);
  }
  return lines.join('\n');
}
