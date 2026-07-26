#!/usr/bin/env node
// Preview / comparison render IMAGE INSPECTOR (maintainer prototype tool; inventory-exempt).
//
// Why: LabVIEW block-diagram renders are frequently taller/wider than the vision
// model's 8000px/side limit, so view_image 400s ("image dimensions exceed max
// allowed size"). This tool extracts the inline images from a rendered LabVIEW
// HTML (preview or CreateComparisonReport), records per-image dimensions + a
// content hash, DOWNSCALES any image exceeding the limit into a viewable copy,
// and emits a JSON summary the NEXT cycle can read from disk (data-first; no huge
// image ever hits the model). It is the substrate for missing-dependency ("?"
// subVI icon) detection, refined incrementally.
//
// Requires ffprobe + ffmpeg on PATH (Gyan.FFmpeg via WinGet Links on Windows).
//
// Usage (from repo root):
//   node prototype/win-lvkit/previewImageInspect.mjs --html <rendered.html> --out <dir> [--max 7800]
//   node prototype/win-lvkit/previewImageInspect.mjs --image <file.png> --out <dir> [--max 7800]
// Emits <out>/inspect.json (schema vi-history-suite/preview-image-inspect@v1) and,
// for each oversized image, <out>/viewable/<name> scaled to fit --max.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SCHEMA = 'vi-history-suite/preview-image-inspect@v1';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
      a[k] = v;
    }
  }
  return a;
}

function extractInlineImages(html, rawDir) {
  fs.mkdirSync(rawDir, { recursive: true });
  const re = /data:image\/(png|jpeg|jpg|gif);base64,\s*([^"']+)/g;
  let m;
  let i = 0;
  const files = [];
  while ((m = re.exec(html)) !== null) {
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    const name = `img-${String(i).padStart(4, '0')}.${ext}`;
    const dest = path.join(rawDir, name);
    fs.writeFileSync(dest, buf);
    files.push(dest);
    i += 1;
  }
  return files;
}

function ffprobeDims(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  const mm = /(\d+)x(\d+)/.exec(out);
  return mm ? { width: Number(mm[1]), height: Number(mm[2]) } : { width: null, height: null };
}

function downscale(file, outFile, maxDim) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const vf = `scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease`;
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', vf, outFile], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(outFile);
}

/**
 * Crop `file` into a cols x rows grid of FULL-RESOLUTION tiles (each <= maxDim so
 * it is viewable). Detail is preserved (unlike downscale), so a subsequent
 * view-cycle can inspect a tile for the "?" subVI icon. Returns tile descriptors.
 */
function tileImage(file, cols, rows, outDir, dims, maxDim) {
  fs.mkdirSync(outDir, { recursive: true });
  const tileW = Math.ceil(dims.width / cols);
  const tileH = Math.ceil(dims.height / rows);
  const tiles = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * tileW;
      const y = r * tileH;
      const w = Math.min(tileW, dims.width - x);
      const h = Math.min(tileH, dims.height - y);
      if (w <= 0 || h <= 0) continue;
      const name = `tile-r${r}-c${c}.png`;
      const out = path.join(outDir, name);
      const res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `crop=${w}:${h}:${x}:${y}`, out], { encoding: 'utf8' });
      const ok = res.status === 0 && fs.existsSync(out);
      tiles.push({ name, col: c, row: r, x, y, width: w, height: h, path: ok ? out : null, viewable: w <= maxDim && h <= maxDim });
    }
  }
  return tiles;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const maxDim = a.max && a.max !== true ? Number(a.max) : 7800;
  const outDir = a.out && a.out !== true ? String(a.out) : path.join(process.env.TEMP || '/tmp', 'preview-inspect');
  const rawDir = path.join(outDir, 'raw');
  const viewDir = path.join(outDir, 'viewable');
  fs.mkdirSync(outDir, { recursive: true });

  // TILE MODE: crop ONE image into full-resolution tiles for detailed inspection.
  // This is a distinct PRODUCER cycle (writes tiles + tiles.json); a later cycle
  // views a tile. Kept separate from the downscale/inspect path by design.
  if (a.tile && a.tile !== true && a.image && a.image !== true) {
    const mm = /^(\d+)x(\d+)$/.exec(String(a.tile));
    if (!mm) { console.error('--tile must be <cols>x<rows>, e.g. 3x1'); process.exit(2); }
    const cols = Number(mm[1]);
    const rows = Number(mm[2]);
    const src = String(a.image);
    const dims = ffprobeDims(src);
    const tiles = tileImage(src, cols, rows, path.join(outDir, 'tiles'), dims, maxDim);
    const jsonPath = path.join(outDir, 'tiles.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ schema: 'vi-history-suite/preview-image-tiles@v1', generatedAt: new Date().toISOString(), source: src, sourceDims: dims, grid: { cols, rows }, maxDim, tiles }, null, 2), 'utf8');
    console.log('TILES_DONE ' + jsonPath + '  (' + tiles.length + ' tiles from ' + dims.width + 'x' + dims.height + ')');
    for (const t of tiles) console.log('  ' + t.name + ' ' + t.width + 'x' + t.height + (t.viewable ? '' : ' [STILL OVERSIZED]') + ' -> ' + t.path);
    return;
  }

  let files = [];
  let source = null;
  if (a.html && a.html !== true) {
    source = String(a.html);
    files = extractInlineImages(fs.readFileSync(source, 'utf8'), rawDir);
  } else if (a.image && a.image !== true) {
    source = String(a.image);
    files = [source];
  } else if (a.dir && a.dir !== true) {
    source = String(a.dir);
    files = fs.readdirSync(source).filter((n) => /\.(png|jpe?g|gif)$/i.test(n)).map((n) => path.join(source, n));
  } else {
    console.error('usage: --html <file> | --image <file> | --dir <dir>  --out <dir> [--max 7800]');
    process.exit(2);
  }

  const images = [];
  const hashCounts = new Map();
  for (const f of files) {
    const dims = ffprobeDims(f);
    const hash = sha256(f);
    hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
    const oversized = (dims.width && dims.width > maxDim) || (dims.height && dims.height > maxDim);
    let viewablePath = null;
    if (oversized) {
      const vp = path.join(viewDir, path.basename(f).replace(/\.(png|jpe?g|gif)$/i, `.view.png`));
      if (downscale(f, vp, maxDim)) viewablePath = vp;
    }
    images.push({ name: path.basename(f), bytes: fs.statSync(f).size, width: dims.width, height: dims.height, sha256: hash, oversized, viewablePath });
  }

  const uniqueHashes = new Set(images.map((x) => x.sha256)).size;
  const dupTop = [...hashCounts.entries()].map(([h, c]) => ({ sha256: h, count: c })).sort((x, y) => y.count - x.count).slice(0, 12);
  const bySize = [...images].sort((x, y) => y.bytes - x.bytes);
  const oversizedImages = images.filter((x) => x.oversized);

  const report = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    source,
    maxDim,
    summary: {
      totalImages: images.length,
      uniqueImages: uniqueHashes,
      oversizedCount: oversizedImages.length,
      largestBytes: bySize[0] ? bySize[0].bytes : 0,
      maxWidth: Math.max(0, ...images.map((x) => x.width || 0)),
      maxHeight: Math.max(0, ...images.map((x) => x.height || 0))
    },
    // The biggest images are the block-diagram frames; their viewable copies are
    // what a subsequent cycle should view_image to inspect for "?" subVI icons.
    largestImages: bySize.slice(0, 6).map((x) => ({ name: x.name, bytes: x.bytes, width: x.width, height: x.height, viewablePath: x.viewablePath })),
    duplicateTop: dupTop,
    images
  };
  const jsonPath = path.join(outDir, 'inspect.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('INSPECT_DONE ' + jsonPath);
  console.log('total=' + report.summary.totalImages + ' unique=' + report.summary.uniqueImages + ' oversized=' + report.summary.oversizedCount + ' maxDims=' + report.summary.maxWidth + 'x' + report.summary.maxHeight);
  for (const li of report.largestImages) console.log('  largest ' + li.name + ' ' + li.width + 'x' + li.height + ' -> ' + (li.viewablePath || '(view raw)'));
}

main();
