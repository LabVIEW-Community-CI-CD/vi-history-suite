/**
 * Cross-platform mprr calibration-surface renderer (VHS-REQ-710 diagnostics family).
 *
 * mprr renders its calibration surface with a Windows-only WinForms app. To PROVE
 * calibration on a non-Windows host (Linux/Ubuntu), this pure module renders the
 * identical surface — a white field with a solid black border and the eight edge
 * fiducial markers at their exact screen-relative rectangles and expected colors —
 * as a self-contained HTML document a headless browser can display and screenshot.
 * It also builds the matching `review-capture-calibration-surface-v1` metadata so
 * the captured frame is validated against the same contract mprr uses.
 *
 * Geometry mirrors mprr's ResolveMarkerRectangle exactly (round, 12px minimum,
 * clamp inside the surface) so a marker rectangle lands on the same pixels the
 * validator samples. Pure and deterministic: dimensions in, identical HTML +
 * metadata out.
 */

import {
  MPRR_CALIBRATION_MARKERS,
  MPRR_CALIBRATION_MAX_COLOR_DISTANCE,
  MPRR_SOURCE_SURFACE_SCHEMA,
  type CalibrationMarkerExpectation
} from './mprrCalibrationSurface';

export interface CalibrationSurfaceDimensions {
  readonly width: number;
  readonly height: number;
}

export interface MarkerRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** mprr ResolveMarkerRectangle: round to px, 12px minimum, clamp inside the surface. */
export function resolveMarkerRect(dimensions: CalibrationSurfaceDimensions, marker: CalibrationMarkerExpectation): MarkerRect {
  const round = (value: number): number => Math.round(value);
  const width = Math.max(12, round(dimensions.width * marker.relativeWidth));
  const height = Math.max(12, round(dimensions.height * marker.relativeHeight));
  const left = Math.min(Math.max(round(dimensions.width * marker.relativeLeft), 0), Math.max(0, dimensions.width - width));
  const top = Math.min(Math.max(round(dimensions.height * marker.relativeTop), 0), Math.max(0, dimensions.height - height));
  return { left, top, width, height };
}

function assertDimensions(dimensions: CalibrationSurfaceDimensions): void {
  if (
    !dimensions ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 64 ||
    dimensions.height < 64
  ) {
    throw new Error('calibration surface dimensions must be integers >= 64.');
  }
}

/** Build the `review-capture-calibration-surface-v1` metadata for the rendered surface. */
export function buildMprrCalibrationSurfaceMetadata(dimensions: CalibrationSurfaceDimensions): {
  readonly schemaVersion: string;
  readonly surfaceId: string;
  readonly screenBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly maximumColorDistance: number;
  readonly markers: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly relativeLeft: number;
    readonly relativeTop: number;
    readonly relativeWidth: number;
    readonly relativeHeight: number;
    readonly expectedColorRgb: { readonly r: number; readonly g: number; readonly b: number };
  }>;
} {
  assertDimensions(dimensions);
  return {
    schemaVersion: MPRR_SOURCE_SURFACE_SCHEMA,
    surfaceId: 'windows-host-primary-monitor-calibration-surface',
    screenBounds: { x: 0, y: 0, width: dimensions.width, height: dimensions.height },
    maximumColorDistance: MPRR_CALIBRATION_MAX_COLOR_DISTANCE,
    markers: MPRR_CALIBRATION_MARKERS.map((marker) => ({
      id: marker.id,
      role: marker.role,
      relativeLeft: marker.relativeLeft,
      relativeTop: marker.relativeTop,
      relativeWidth: marker.relativeWidth,
      relativeHeight: marker.relativeHeight,
      expectedColorRgb: { ...marker.expectedColorRgb }
    }))
  };
}

function rgbCss(marker: CalibrationMarkerExpectation): string {
  return `rgb(${marker.expectedColorRgb.r}, ${marker.expectedColorRgb.g}, ${marker.expectedColorRgb.b})`;
}

/**
 * Render the calibration surface as a self-contained HTML document sized to the
 * given dimensions: a white body, a solid black border, and the eight fiducial
 * markers as absolutely-positioned blocks at their resolved rectangles. No
 * external resources, scripts, or fonts, so a headless browser renders it
 * deterministically.
 */
export function renderMprrCalibrationSurfaceHtml(dimensions: CalibrationSurfaceDimensions): string {
  assertDimensions(dimensions);
  const borderWidth = Math.max(6, Math.round(dimensions.width / 240));
  const markerDivs = MPRR_CALIBRATION_MARKERS.map((marker) => {
    const rect = resolveMarkerRect(dimensions, marker);
    return (
      `      <div class="marker" data-marker-id="${marker.id}" style="left:${rect.left}px;top:${rect.top}px;` +
      `width:${rect.width}px;height:${rect.height}px;background:${rgbCss(marker)};"></div>`
    );
  }).join('\n');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>mprr calibration surface ${dimensions.width}x${dimensions.height}</title>`,
    '<style>',
    '  * { margin: 0; padding: 0; box-sizing: border-box; }',
    `  html, body { width: ${dimensions.width}px; height: ${dimensions.height}px; background: #ffffff; overflow: hidden; }`,
    `  .surface { position: relative; width: ${dimensions.width}px; height: ${dimensions.height}px; background: #ffffff; }`,
    // The border is an underlay so it never insets the markers: marker rectangles
    // stay at their exact screen-relative coordinates (resolveMarkerRect), and the
    // markers paint OVER the border ring at the edges (marker color wins there),
    // matching mprr's draw order.
    `  .border { position: absolute; inset: 0; border: ${borderWidth}px solid #000000; box-sizing: border-box; z-index: 0; }`,
    '  .marker { position: absolute; z-index: 1; }',
    '</style>',
    '</head>',
    '<body>',
    '  <div class="surface">',
    '    <div class="border"></div>',
    markerDivs,
    '  </div>',
    '</body>',
    '</html>'
  ].join('\n');
}
