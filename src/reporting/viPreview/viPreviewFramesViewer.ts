/**
 * VHS-REQ-659: interactive block-diagram preview viewer document.
 *
 * Builds a self-contained VS Code webview document that renders a
 * {@link ViPreviewFramesModel} the way the LabVIEW editor shows a diagram: the
 * root diagram is painted once and every Case / Event / Stacked-Sequence
 * structure is composited IN PLACE, each carrying a small `◀ n/N ▶ label`
 * selector so a reader pages through its cases without the diagram jumping;
 * nested structures page inside the case that owns them. The stage supports
 * drag-to-pan, Ctrl/Cmd+scroll zoom, double-click zoom, a Fit button, and
 * arrow-key paging of the last-touched structure.
 *
 * Unlike the flat `PrintToSingleFileHtml` preview (which forbids scripts), this
 * viewer needs inline JavaScript, so the document uses a strict NONCE-based CSP:
 * only the single embedded script (carrying the nonce) may run, only `data:`
 * images load, only inline styles apply, and every remote origin is forbidden.
 * The frames model is serialized into a JSON island the script reads; no VS
 * Code messaging, external resource, or eval is used.
 *
 * The builder is pure so the document shape stays deterministically
 * unit-testable without a webview host.
 */

import type { ViPreviewFramesModel } from './viPreviewFramesModel';

/**
 * Escapes a string for safe embedding in a `<script type="application/json">`
 * island: neutralizes `<` (so `</script>` cannot close the tag early) and the
 * U+2028/U+2029 line terminators that are invalid in JS string literals.
 */
function encodeJsonIsland(model: ViPreviewFramesModel): string {
  return JSON.stringify(model)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** CSP for the scripted viewer: only the nonce'd script, data: images, inline styles. */
function viewerCsp(nonce: string): string {
  return (
    "default-src 'none'; " +
    'img-src data:; ' +
    "style-src 'unsafe-inline'; " +
    `script-src 'nonce-${nonce}'; ` +
    "font-src 'none';"
  );
}

const VIEWER_STYLE = `
  html, body { margin: 0; height: 100%; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow: hidden;
  }
  .lvr-viewport {
    position: absolute; inset: 0; overflow: hidden; cursor: grab;
    touch-action: none;
  }
  .lvr-viewport.lvr-grabbing { cursor: grabbing; }
  .lvr-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .lvr-layer, .lvr-case { position: absolute; left: 0; top: 0; }
  .lvr-img { display: block; user-select: none; -webkit-user-drag: none; }
  .lvr-struct { position: absolute; }
  .lvr-case { width: 100%; height: 100%; }
  .lvr-case .lvr-img { width: 100%; height: 100%; }
  .lvr-sel {
    position: absolute; left: 0; top: -20px; height: 18px;
    display: inline-flex; align-items: center; gap: 2px;
    padding: 0 4px; font-size: 11px; line-height: 18px; white-space: nowrap;
    background: var(--vscode-editorWidget-background, #333);
    color: var(--vscode-editorWidget-foreground, #ddd);
    border: 1px solid var(--vscode-editorWidget-border, #555);
    border-radius: 3px; z-index: 2;
  }
  .lvr-sel--mono { display: none; }
  .lvr-sel__btn {
    border: none; background: transparent; color: inherit; cursor: pointer;
    font: inherit; padding: 0 2px;
  }
  .lvr-sel__btn:disabled { opacity: 0.4; cursor: default; }
  .lvr-reset {
    position: absolute; right: 8px; bottom: 8px; z-index: 3;
    font: inherit; font-size: 11px; padding: 2px 8px; cursor: pointer;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; border-radius: 3px;
  }
  .lvr-empty { padding: 16px; color: var(--vscode-descriptionForeground); }
`;

/**
 * The viewer runtime. Written as a string so the pure builder can embed it under
 * a nonce; it reads the `#lvr-frames` JSON island and renders into `#lvr-root`.
 * Self-contained, no external dependencies, no VS Code messaging.
 */
const VIEWER_SCRIPT = `
(function () {
  'use strict';
  var island = document.getElementById('lvr-frames');
  var container = document.getElementById('lvr-root');
  if (!island || !container) { return; }
  var model;
  try { model = JSON.parse(island.textContent || '{}'); } catch (e) { model = null; }
  var frames = model && Array.isArray(model.frames) ? model.frames : [];
  if (!frames.length) {
    container.innerHTML = '<div class="lvr-empty">No diagram frames to display.</div>';
    return;
  }
  var rootIndex = (model && typeof model.rootIndex === 'number') ? model.rootIndex : 0;

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (parent) { parent.appendChild(n); }
    return n;
  }
  function rectOf(f) { return (f && f.rect) || { left: 0, top: 0, width: 0, height: 0 }; }

  function groupStructures(indices) {
    var groups = [], byKey = {};
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i], r = rectOf(frames[idx]);
      var key = r.left + ':' + r.top + ':' + r.width + ':' + r.height;
      var g = byKey[key];
      if (!g) { g = { rect: r, cases: [] }; byKey[key] = g; groups.push(g); }
      g.cases.push(idx);
    }
    return groups;
  }

  // LabVIEW positions are relative to the owning diagram, but exports vary
  // between absolute (top-level) and parent-relative, so detect per child.
  function placeWithin(parentRect, pw, ph, childRect) {
    var relL = childRect.left - parentRect.left, relT = childRect.top - parentRect.top;
    if (relL >= -2 && relT >= -2 && relL <= pw + 2 && relT <= ph + 2) { return { x: relL, y: relT }; }
    return { x: childRect.left, y: childRect.top };
  }

  var stageState = { active: null };

  function paintFrame(frameIdx, layer) {
    var frame = frames[frameIdx], myRect = rectOf(frame);
    var img = el('img', 'lvr-img', layer);
    img.src = frame.image || '';
    img.alt = frame.label || 'diagram';
    img.draggable = false;
    var kids = (frame.children || []).slice();
    if (!kids.length) { return; }
    var mount = function () {
      var pw = img.naturalWidth || myRect.width || layer.offsetWidth;
      var ph = img.naturalHeight || myRect.height || layer.offsetHeight;
      var groups = groupStructures(kids);
      for (var i = 0; i < groups.length; i++) {
        mountStructure(groups[i], layer, myRect, pw, ph);
      }
    };
    if (img.complete && img.naturalWidth) { mount(); } else { img.addEventListener('load', mount, { once: true }); }
  }

  function mountStructure(group, parentLayer, parentRect, pw, ph) {
    var place = placeWithin(parentRect, pw, ph, group.rect);
    var host = el('div', 'lvr-struct', parentLayer);
    host.style.left = place.x + 'px';
    host.style.top = place.y + 'px';
    host.style.width = (group.rect.width || 0) + 'px';
    host.style.height = (group.rect.height || 0) + 'px';

    var caseLayers = group.cases.map(function (ci) {
      var cl = el('div', 'lvr-case', host);
      paintFrame(ci, cl);
      return cl;
    });

    var N = group.cases.length, idx = 0, single = N <= 1;
    var sel = el('div', 'lvr-sel' + (single ? ' lvr-sel--mono' : ''), host);
    var prev = el('button', 'lvr-sel__btn', sel); prev.type = 'button'; prev.textContent = '\u25C0'; prev.title = 'Previous case';
    var lbl = el('span', 'lvr-sel__lbl', sel);
    var next = el('button', 'lvr-sel__btn', sel); next.type = 'button'; next.textContent = '\u25B6'; next.title = 'Next case';

    function caseLabel(i) {
      var f = frames[group.cases[i]];
      var raw = (f && f.label) ? String(f.label) : '';
      var ord = N > 1 ? (i + 1) + '/' + N : '1';
      return raw ? (ord + '  ' + raw) : ord;
    }
    function show(i) {
      idx = (i + N) % N;
      for (var k = 0; k < caseLayers.length; k++) { caseLayers[k].style.display = k === idx ? 'block' : 'none'; }
      lbl.textContent = caseLabel(idx);
      prev.disabled = next.disabled = single;
      stageState.active = host;
    }
    prev.addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
    host.addEventListener('pointerdown', function () { stageState.active = host; });
    host.__step = function (d) { show(idx + d); };
    show(0);
  }

  var viewport = el('div', 'lvr-viewport', container);
  var stage = el('div', 'lvr-stage', viewport);
  var root = el('div', 'lvr-layer', stage);

  var zoom = 1, panX = 0, panY = 0, dragging = false, sx = 0, sy = 0, px = 0, py = 0;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function apply() { stage.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')'; }
  function zoomAt(nz, ax, ay) {
    nz = clamp(nz, 0.04, 8);
    var r = viewport.getBoundingClientRect();
    var cx = (ax - r.left - panX) / zoom, cy = (ay - r.top - panY) / zoom;
    zoom = nz; panX = ax - r.left - cx * zoom; panY = ay - r.top - cy * zoom; apply();
  }
  function fit(w, h) {
    var r = viewport.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2 && w > 0 && h > 0)) { return; }
    var pad = 24;
    zoom = clamp(Math.min((r.width - pad) / w, (r.height - pad) / h, 1), 0.04, 1);
    panX = Math.max(pad / 2, (r.width - w * zoom) / 2);
    panY = Math.max(pad / 2, (r.height - h * zoom) / 2);
    apply();
  }
  viewport.addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey)) { return; }
    e.preventDefault();
    var d = Math.max(-50, Math.min(50, e.deltaY));
    zoomAt(zoom * Math.exp(-d * 0.002), e.clientX, e.clientY);
  }, { passive: false });
  viewport.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.lvr-sel') || e.target.closest('.lvr-reset')) { return; }
    dragging = true; sx = e.clientX; sy = e.clientY; px = panX; py = panY;
    viewport.classList.add('lvr-grabbing');
    try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
  });
  viewport.addEventListener('pointermove', function (e) {
    if (!dragging) { return; }
    panX = px + (e.clientX - sx); panY = py + (e.clientY - sy); apply();
  });
  function end() { dragging = false; viewport.classList.remove('lvr-grabbing'); }
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  viewport.addEventListener('dblclick', function (e) {
    if (e.target.closest('.lvr-sel') || e.target.closest('.lvr-reset')) { return; }
    zoomAt(zoom > 1 ? 1 : 2, e.clientX, e.clientY);
  });

  var rootRect = rectOf(frames[rootIndex]);
  var probe = new Image();
  probe.onload = probe.onerror = function () {
    var w = probe.naturalWidth || rootRect.width || 800;
    var h = probe.naturalHeight || rootRect.height || 600;
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    paintFrame(rootIndex, root);
    fit(w, h);
    (window.requestAnimationFrame || function (f) { f(); })(function () { fit(w, h); });
    resetBtn.__w = w; resetBtn.__h = h;
  };
  probe.src = (frames[rootIndex] && frames[rootIndex].image) || '';

  var resetBtn = el('button', 'lvr-reset', viewport);
  resetBtn.type = 'button'; resetBtn.title = 'Reset view \u2014 fit the whole diagram'; resetBtn.textContent = 'Fit';
  resetBtn.addEventListener('click', function (e) { e.stopPropagation(); if (resetBtn.__w) { fit(resetBtn.__w, resetBtn.__h); } });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') { return; }
    var h = stageState.active;
    if (!h || !h.__step) { return; }
    h.__step(e.key === 'ArrowRight' ? 1 : -1);
    e.preventDefault();
  });
})();
`;

/**
 * Builds the full interactive viewer webview document for a frames model. The
 * `nonce` must be a per-load random token the webview host also passes to the
 * webview options so only this document's script executes.
 */
export function buildViPreviewFramesViewerHtml(
  model: ViPreviewFramesModel,
  nonce: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${viewerCsp(nonce)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VI Block Diagram</title>
    <style>${VIEWER_STYLE}</style>
  </head>
  <body>
    <div id="lvr-root"></div>
    <script id="lvr-frames" type="application/json" nonce="${nonce}">${encodeJsonIsland(model)}</script>
    <script nonce="${nonce}">${VIEWER_SCRIPT}</script>
  </body>
</html>`;
}
