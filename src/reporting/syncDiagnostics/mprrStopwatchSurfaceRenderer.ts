/**
 * mprr stopwatch-surface renderer (VHS-REQ-710 diagnostics family).
 *
 * Cross-platform, deterministic renderer for the mprr stopwatch surface: a white
 * field with the 40-bit machine strip drawn as black/white cells at mprr's strip
 * region (top 7%, height 9%, full width) plus the printed `HH:MM:SS.cc` time. It
 * pairs with `decodeMprrStripImage`: a headless capture of this surface decodes
 * back to the same centiseconds, so stopwatch accuracy can be measured on any
 * host. Promoting it to a governed module lets edge cases (zero, clamping at the
 * 24-bit payload ceiling, multi-hour text) be exercised under unit test.
 *
 * The strip payload clamps to the 24-bit machine-strip range (mirroring the
 * encoder) while the printed text reflects the full elapsed time, exactly as the
 * mprr stopwatch surface renders it. Pure and deterministic: inputs in, identical
 * HTML + strip-region metadata out.
 */

import { encodeMprrMachineStrip, formatMprrStopwatchText, MPRR_MAX_STRIP_CENTISECONDS } from '../mirror/perfmonMprrSync';
import { MACHINE_STRIP_BIT_LENGTH } from './syncPatternFailureSignature';

export interface StopwatchSurfaceDimensions {
  readonly width: number;
  readonly height: number;
}

export interface StopwatchStripRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function assertDimensions(dimensions: StopwatchSurfaceDimensions): void {
  if (
    !dimensions ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 64 ||
    dimensions.height < 64
  ) {
    throw new Error('stopwatch surface dimensions must be integers >= 64.');
  }
}

/** mprr strip region: full width, top at 7% of height, height 9% of height. */
export function buildMprrStopwatchStripRegion(dimensions: StopwatchSurfaceDimensions): StopwatchStripRegion {
  assertDimensions(dimensions);
  return {
    left: 0,
    top: Math.round(dimensions.height * 0.07),
    width: dimensions.width,
    height: Math.max(1, Math.round(dimensions.height * 0.09))
  };
}

export interface RenderStopwatchSurfaceInput {
  readonly centiseconds: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Render the stopwatch surface HTML for a centiseconds reading. The strip encodes
 * the centiseconds clamped to the 24-bit payload range; the printed time reflects
 * the full elapsed value. Fail-closed on non-finite centiseconds or dimensions
 * below 64 pixels.
 */
export function renderMprrStopwatchSurfaceHtml(input: RenderStopwatchSurfaceInput): string {
  if (!Number.isFinite(input.centiseconds)) {
    throw new Error('centiseconds must be a finite number.');
  }
  const dimensions = { width: input.width, height: input.height };
  assertDimensions(dimensions);

  const region = buildMprrStopwatchStripRegion(dimensions);
  const bits = encodeMprrMachineStrip(input.centiseconds);
  const timeText = formatMprrStopwatchText(Math.max(0, Math.floor(input.centiseconds)) * 10);
  const borderWidth = Math.max(6, Math.round(dimensions.width / 240));

  const cellCount = bits.length; // MACHINE_STRIP_BIT_LENGTH
  const cells = bits
    .split('')
    .map((bit, i) => {
      const left = Math.round((i * region.width) / cellCount);
      const right = Math.round(((i + 1) * region.width) / cellCount);
      const width = Math.max(1, right - left);
      return (
        `      <div class="cell" data-cell-index="${i}" data-bit="${bit}" ` +
        `style="left:${left}px;width:${width}px;background:${bit === '1' ? '#000000' : '#ffffff'};"></div>`
      );
    })
    .join('\n');

  const timeTop = region.top + region.height + Math.round(dimensions.height * 0.06);
  const timeFontSize = Math.max(16, Math.round(dimensions.height * 0.12));

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>mprr stopwatch surface ${dimensions.width}x${dimensions.height} cs=${Math.floor(input.centiseconds)}</title>`,
    '<style>',
    '  * { margin: 0; padding: 0; box-sizing: border-box; }',
    `  html, body { width: ${dimensions.width}px; height: ${dimensions.height}px; background: #ffffff; overflow: hidden; }`,
    `  .surface { position: relative; width: ${dimensions.width}px; height: ${dimensions.height}px; background: #ffffff; }`,
    `  .border { position: absolute; inset: 0; border: ${borderWidth}px solid #000000; box-sizing: border-box; z-index: 0; }`,
    `  .strip { position: absolute; left: ${region.left}px; top: ${region.top}px; width: ${region.width}px; height: ${region.height}px; z-index: 1; }`,
    '  .cell { position: absolute; top: 0; height: 100%; }',
    `  .time { position: absolute; left: 0; top: ${timeTop}px; width: ${dimensions.width}px; text-align: center;`,
    `    font-family: "DejaVu Sans Mono", monospace; font-size: ${timeFontSize}px; color: #000000; z-index: 1; }`,
    '</style>',
    '</head>',
    '<body>',
    '  <div class="surface">',
    '    <div class="border"></div>',
    `    <div class="strip">\n${cells}\n    </div>`,
    `    <div class="time">${timeText}</div>`,
    '  </div>',
    '</body>',
    '</html>'
  ].join('\n');
}

export { MACHINE_STRIP_BIT_LENGTH, MPRR_MAX_STRIP_CENTISECONDS };
