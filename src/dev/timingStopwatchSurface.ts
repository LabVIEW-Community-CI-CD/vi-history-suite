// Dev-only live mprr timing-stopwatch surface (VHS-REQ-710 diagnostics family).
//
// Pure, deterministic generator for a FULL-VIEWPORT live stopwatch page whose
// 40-bit machine strip is a verbatim client-side port of the shipped
// `encodeMprrMachineStrip` (8-bit `10100101` preamble + 24-bit centiseconds +
// 8-bit XOR checksum, bit `1` = black / `0` = white — the exact convention
// `decodeMprrStripImage` reads). Rendered full-screen and captured at >=12fps,
// each frame's strip decodes back to an exact centisecond timestamp, giving a
// ground-truth per-frame clock to validate screen-capture cadence and to anchor
// screen frames to a real-time base. The strip occupies 7vh..16vh across 100vw
// so a captured frame's `buildMprrStopwatchStripRegion` row aligns to the cells.
//
// This is a DEV/TEST timing source: `timingStopwatchHost` only wires it into the
// Extension Development Host, never the shipped user-facing command surface.

import { MACHINE_STRIP_BIT_LENGTH } from '../reporting/syncDiagnostics/syncPatternFailureSignature';

/**
 * Render the live timing-stopwatch page. Pure and deterministic: identical
 * output every call, so the strip-encoding contract is unit-testable without a
 * browser. The client script advances at `requestAnimationFrame` (>=60Hz on a
 * normal display, comfortably above the 12fps capture rate).
 */
export function renderLiveTimingStopwatchHtml(): string {
  const cells = MACHINE_STRIP_BIT_LENGTH; // 40
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>mprr live timing stopwatch</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100vw; height: 100vh; background: #ffffff; overflow: hidden; }
  .border { position: absolute; inset: 0; border: 8px solid #000000; box-sizing: border-box; }
  .strip { position: absolute; left: 0; top: 7vh; width: 100vw; height: 9vh; display: flex; }
  .cell { height: 100%; flex: 1 1 0; }
  .time { position: absolute; left: 0; top: 24vh; width: 100vw; text-align: center; font-family: 'Consolas', monospace; font-size: 12vh; color: #000000; }
  .hint { position: absolute; left: 0; bottom: 3vh; width: 100vw; text-align: center; font-family: monospace; font-size: 2vh; color: #888888; }
</style>
</head>
<body>
<div class="border"></div>
<div class="strip" id="strip"></div>
<div class="time" id="time">00:00:00.00</div>
<div class="hint">mprr live timing source &mdash; 40-bit decodable strip @ &gt;=12fps (dev/test only)</div>
<script>
  var CELLS = ${cells};
  var stripEl = document.getElementById('strip');
  var cellEls = [];
  for (var i = 0; i < CELLS; i += 1) { var d = document.createElement('div'); d.className = 'cell'; stripEl.appendChild(d); cellEls.push(d); }
  // Verbatim port of encodeMprrMachineStrip: preamble + 24-bit cs + 8-bit XOR checksum.
  function encodeStrip(cs) {
    var b = Math.max(0, Math.min(16777215, Math.floor(cs)));
    var payload = b.toString(2); while (payload.length < 24) { payload = '0' + payload; }
    var hi = (b >> 16) & 255, mid = (b >> 8) & 255, lo = b & 255;
    var chk = (hi ^ mid ^ lo).toString(2); while (chk.length < 8) { chk = '0' + chk; }
    return '10100101' + payload + chk;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(ms) { var t = Math.max(0, Math.floor(ms)); var h = Math.floor(t / 3600000); var m = Math.floor((t % 3600000) / 60000); var s = Math.floor((t % 60000) / 1000); var c = Math.floor((t % 1000) / 10); return pad(h) + ':' + pad(m) + ':' + pad(s) + '.' + pad(c); }
  var start = performance.now();
  var timeEl = document.getElementById('time');
  var lastBits = '';
  function frame() {
    var ms = performance.now() - start;
    var bits = encodeStrip(Math.floor(ms / 10));
    if (bits !== lastBits) { for (var i = 0; i < CELLS; i += 1) { cellEls[i].style.background = bits.charAt(i) === '1' ? '#000000' : '#ffffff'; } lastBits = bits; }
    timeEl.textContent = fmt(ms);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
</script>
</body>
</html>`;
}
