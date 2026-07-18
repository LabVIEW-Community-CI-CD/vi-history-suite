/**
 * VHS-REQ-659: flat-export block-diagram frames extractor.
 *
 * NI's `PrintToSingleFileHtml` export is flat — it emits the top-level block
 * diagram followed by one image per case of each Case / Event / Stacked-Sequence
 * structure, with NO geometry and NO ownership. A true position-aware export
 * (`PrintToImagesJson`, a later slice that requires LabVIEW scripting) is the
 * only source of real coordinates. Until that exists, we can still recover an
 * interactive stepper from the flat export the way the reference implementation
 * does: parse the Block Diagram section's consecutive images and group them by
 * their rendered PIXEL SIZE — every case of one structure shares that
 * structure's fixed border size, so equal sizes group together even when
 * LabVIEW interleaves nested structures. Pixel size is the only structural
 * signal the flat export exposes.
 *
 * This module is pure and dependency-free: it decodes each inline PNG's
 * dimensions from its IHDR header (no image decoding/rendering) and produces a
 * {@link ViPreviewFramesModel} the interactive viewer consumes. Because the flat
 * export has no positions, the synthesized structures are laid out stacked below
 * the root diagram (distinct rectangles) rather than composited in place; the
 * position-aware export upgrades placement later without changing the viewer.
 */

import type { FrameRect, ViPreviewFramesModel } from './viPreviewFramesModel';

/** A raw inline image parsed out of the flat export, with decoded dimensions. */
interface FlatImage {
  dataUri: string;
  width: number;
  height: number;
}

const BASE64_PNG_PREFIX = 'data:image/png;base64,';

/**
 * Decodes a PNG's pixel dimensions from the IHDR chunk of a base64 data URI.
 * The PNG signature is 8 bytes, then a 4-byte length, the "IHDR" tag, then the
 * width and height as big-endian uint32. Returns `undefined` for anything that
 * is not a base64 PNG with a well-formed IHDR (so a malformed image is skipped,
 * never crashes the parse).
 */
export function decodePngSize(dataUri: string): { width: number; height: number } | undefined {
  const trimmed = dataUri.trim();
  const comma = trimmed.indexOf('base64,');
  if (comma < 0) {
    return undefined;
  }
  const b64 = trimmed.slice(comma + 'base64,'.length).replace(/\s+/g, '');
  // IHDR width/height live at byte offset 16..24; decode just the first 24 bytes
  // (32 base64 chars) rather than the whole (potentially huge) image.
  let header: Buffer;
  try {
    header = Buffer.from(b64.slice(0, 48), 'base64');
  } catch {
    return undefined;
  }
  if (header.length < 24) {
    return undefined;
  }
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A.
  const signatureOk =
    header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  const ihdrOk =
    header[12] === 0x49 && header[13] === 0x48 && header[14] === 0x44 && header[15] === 0x52;
  if (!signatureOk || !ihdrOk) {
    return undefined;
  }
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

/**
 * Extracts the Block Diagram section's inline images (in document order) from a
 * `PrintToSingleFileHtml` document. The section runs from the case-insensitive
 * `Block Diagram` heading to the next `<H3>`/`<HR>` (or end of document).
 * Returns each image's data URI plus its decoded dimensions; images whose size
 * cannot be decoded are dropped.
 */
export function extractBlockDiagramFrames(labviewHtml: string): FlatImage[] {
  const headingMatch = /<h3[^>]*>\s*Block Diagram\s*<\/h3>/i.exec(labviewHtml);
  if (!headingMatch) {
    return [];
  }
  const start = headingMatch.index + headingMatch[0].length;
  const rest = labviewHtml.slice(start);
  const endMatch = /<h3[^>]*>|<hr[^>]*>/i.exec(rest);
  const section = endMatch ? rest.slice(0, endMatch.index) : rest;

  const frames: FlatImage[] = [];
  const imgRe = /<img[^>]*\bsrc\s*=\s*"([^"]*base64,[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(section)) !== null) {
    const raw = match[1].replace(/\s+/g, '');
    const dataUri = raw.startsWith('data:') ? raw : `${BASE64_PNG_PREFIX}${raw}`;
    const size = decodePngSize(dataUri);
    if (size) {
      frames.push({ dataUri, width: size.width, height: size.height });
    }
  }
  return frames;
}

/**
 * Builds a {@link ViPreviewFramesModel} from a flat `PrintToSingleFileHtml`
 * document. The first block-diagram image is the top-level diagram (the root);
 * the remaining images are additional structure cases, grouped by identical
 * pixel size (a structure's cases share its fixed border size). Each group
 * becomes a child structure of the root, laid out stacked below the diagram in
 * distinct rectangles (the flat export has no real coordinates), so the viewer
 * renders one in-place stepper per structure. Returns `undefined` when the
 * document has no decodable block-diagram image, so callers fall back to the
 * flat HTML preview.
 */
export function buildFramesModelFromFlatExport(labviewHtml: string): ViPreviewFramesModel | undefined {
  const images = extractBlockDiagramFrames(labviewHtml);
  if (images.length === 0) {
    return undefined;
  }

  const [root, ...rest] = images;
  const rootRect: FrameRect = { left: 0, top: 0, width: root.width, height: root.height };

  // Group the remaining images by exact pixel size, preserving first-seen order.
  const groups: FlatImage[][] = [];
  const byKey = new Map<string, FlatImage[]>();
  for (const image of rest) {
    const key = `${image.width}x${image.height}`;
    let group = byKey.get(key);
    if (!group) {
      group = [];
      byKey.set(key, group);
      groups.push(group);
    }
    group.push(image);
  }

  // The frames array is [root, ...all case images]; the root references each
  // group's cases as children. Cases are stacked below the diagram in distinct
  // rectangles (synthetic, since the flat export exposes no positions), one
  // column per structure so the viewer shows a separate stepper for each.
  const frames: ViPreviewFramesModel['frames'] = [
    { image: root.dataUri, rect: rootRect, children: [] }
  ];
  const STACK_GAP = 24;
  let stackTop = root.height + STACK_GAP;
  const rootChildren: number[] = [];
  for (const group of groups) {
    const { width, height } = group[0];
    const rect: FrameRect = { left: 0, top: stackTop, width, height };
    stackTop += height + STACK_GAP;
    for (let caseIndex = 0; caseIndex < group.length; caseIndex += 1) {
      const frameIndex = frames.length;
      rootChildren.push(frameIndex);
      frames.push({
        image: group[caseIndex].dataUri,
        rect,
        children: [],
        label: group.length > 1 ? `case ${caseIndex + 1}` : undefined
      });
    }
  }
  frames[0].children = rootChildren;

  return { frames, rootIndex: 0 };
}
