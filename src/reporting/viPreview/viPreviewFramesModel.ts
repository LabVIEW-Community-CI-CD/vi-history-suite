/**
 * VHS-REQ-659: position-aware "frames" model for the interactive block-diagram
 * preview.
 *
 * NI's `PrintToSingleFileHtml` export is flat: it emits one image per case of a
 * structure with no geometry and no ownership, so a reader cannot see a case in
 * its real place on the diagram. An interactive editor-style preview instead
 * needs a POSITION-AWARE model: the root diagram plus every Case / Event /
 * Stacked-Sequence structure composited in place, with each structure's cases
 * paged without the diagram jumping, and nested structures paging inside the
 * case that owns them.
 *
 * This module defines that model and a pure, dependency-free normalizer. The
 * model is produced by a position-aware LabVIEW export (a later slice); the
 * viewer front-end ({@link ./viPreviewFramesViewer}) consumes the normalized
 * form. Keeping the model and its validation pure makes both deterministically
 * unit-testable without a LabVIEW runtime.
 *
 * The wire shape (one array element per frame) is tolerant of the field-name
 * variants a LabVIEW exporter may emit:
 *
 *   {
 *     "Image":     "<base64 PNG>",              // or "Base64 Image" / "base64"
 *     "Position":  { "Left":int, "Top":int, "Width":int, "Height":int },
 *     "Children":  [int, ...],                  // or "Child Indices"; indices
 *                                               // into the SAME array
 *     "Label":     "True"                       // optional case/frame label
 *   }
 *
 * Sibling frames that share the same Position rectangle are the cases of ONE
 * structure (LabVIEW paints every case at the structure's fixed border).
 */

/** A rectangle in diagram coordinates. */
export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A single normalized frame: an image, its rectangle, and its child frames. */
export interface ViPreviewFrame {
  /** Inline image as a `data:` URI (base64 PNG). Empty string when absent. */
  image: string;
  /** Frame rectangle in the owning diagram's coordinates. */
  rect: FrameRect;
  /** Indices (into the normalized frame array) of this frame's child frames. */
  children: number[];
  /** Optional case/frame selector label (e.g. `"True"`, `"0"`). */
  label?: string;
}

/** Normalized frames plus the resolved root index. */
export interface ViPreviewFramesModel {
  frames: ViPreviewFrame[];
  /** Index of the root diagram frame (the frame no other frame references). */
  rootIndex: number;
}

function asInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function normalizeRect(raw: unknown): FrameRect {
  const r = (raw ?? {}) as Record<string, unknown>;
  const left = asInt(r.Left ?? r.left);
  const top = asInt(r.Top ?? r.top);
  // Accept either Width/Height or Right/Bottom pairs.
  const width = r.Width != null || r.width != null
    ? asInt(r.Width ?? r.width)
    : asInt(r.Right ?? r.right) - left;
  const height = r.Height != null || r.height != null
    ? asInt(r.Height ?? r.height)
    : asInt(r.Bottom ?? r.bottom) - top;
  return { left, top, width, height };
}

function normalizeImage(raw: Record<string, unknown>): string {
  const b64 = raw.Image ?? raw['Base64 Image'] ?? raw.base64 ?? raw.image ?? '';
  const value = typeof b64 === 'string' ? b64 : '';
  if (!value) {
    return '';
  }
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function normalizeChildren(raw: Record<string, unknown>, frameCount: number): number[] {
  const list = raw.Children ?? raw['Child Indices'] ?? raw.children ?? [];
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of list) {
    const idx = asInt(entry);
    // Drop out-of-range and self/duplicate references so a malformed export can
    // never produce an infinite paint loop or a dangling child.
    if (idx >= 0 && idx < frameCount && !seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return out;
}

function normalizeLabel(raw: Record<string, unknown>): string | undefined {
  const label = raw.Label ?? raw.label ?? raw.Name ?? raw.name;
  if (typeof label === 'string' && label.length > 0) {
    return label;
  }
  return undefined;
}

/**
 * Resolves the root frame: the one no other frame lists as a child. Falls back
 * to index 0 when every frame is referenced (a malformed cycle) or none exists.
 */
export function findFramesRoot(frames: ViPreviewFrame[]): number {
  if (frames.length === 0) {
    return 0;
  }
  const referenced = new Set<number>();
  for (const frame of frames) {
    for (const child of frame.children) {
      referenced.add(child);
    }
  }
  for (let i = 0; i < frames.length; i += 1) {
    if (!referenced.has(i)) {
      return i;
    }
  }
  return 0;
}

/**
 * Normalizes a raw frames array (any accepted field-name variant) into the
 * {@link ViPreviewFramesModel}. Returns `undefined` when the input is not a
 * non-empty array, so callers can fall back to the flat HTML preview.
 */
export function normalizeViPreviewFrames(raw: unknown): ViPreviewFramesModel | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const frameCount = raw.length;
  const frames: ViPreviewFrame[] = raw.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      image: normalizeImage(record),
      rect: normalizeRect(record.Position ?? record.position ?? record.Cluster ?? record.cluster),
      children: normalizeChildren(record, frameCount),
      label: normalizeLabel(record)
    };
  });
  return { frames, rootIndex: findFramesRoot(frames) };
}

/**
 * Groups a frame's child indices into structures: children sharing the same
 * Position rectangle are the cases of one multi-case structure. Preserves the
 * first-seen order of each distinct rectangle. Pure so grouping is testable
 * independently of the DOM viewer.
 */
export function groupFramesIntoStructures(
  frames: ViPreviewFrame[],
  childIndices: number[]
): Array<{ rect: FrameRect; cases: number[] }> {
  const groups: Array<{ rect: FrameRect; cases: number[] }> = [];
  const byKey = new Map<string, { rect: FrameRect; cases: number[] }>();
  for (const index of childIndices) {
    const frame = frames[index];
    if (!frame) {
      continue;
    }
    const { left, top, width, height } = frame.rect;
    const key = `${left}:${top}:${width}:${height}`;
    let group = byKey.get(key);
    if (!group) {
      group = { rect: frame.rect, cases: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.cases.push(index);
  }
  return groups;
}
