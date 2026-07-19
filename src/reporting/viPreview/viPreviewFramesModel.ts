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
  /**
   * Frame rectangle relative to the OWNING frame's top-left (parent-relative).
   * The root frame's rect is relative to the stage origin. The viewer places a
   * child at `rect.left`/`rect.top` within its parent without subtracting the
   * parent's offset, so the export contract must emit parent-relative geometry.
   */
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

function normalizeChildren(
  raw: Record<string, unknown>,
  frameCount: number,
  selfIndex: number
): number[] {
  const list = raw.Children ?? raw['Child Indices'] ?? raw.children ?? [];
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of list) {
    const idx = asInt(entry);
    // Drop out-of-range, self, and duplicate references so a malformed export
    // can never produce an infinite paint loop (a self child would recurse into
    // the same frame forever) or a dangling child.
    if (idx >= 0 && idx < frameCount && idx !== selfIndex && !seen.has(idx)) {
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
  const frames: ViPreviewFrame[] = raw.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      image: normalizeImage(record),
      rect: normalizeRect(record.Position ?? record.position ?? record.Cluster ?? record.cluster),
      children: normalizeChildren(record, frameCount, index),
      label: normalizeLabel(record)
    };
  });
  return { frames, rootIndex: findFramesRoot(frames) };
}

/**
 * Extracts the frames array from a position-aware export payload. Accepts the
 * documented top-level shapes a LabVIEW exporter may emit: a bare frames array,
 * or an object wrapping the array under `frames`/`Frames`. Returns `undefined`
 * for anything else so callers fall back to the flat preview.
 */
function extractFramesArray(payload: unknown): unknown[] | undefined {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    const framesField = record.frames ?? record.Frames;
    if (Array.isArray(framesField)) {
      return framesField;
    }
  }
  return undefined;
}

/**
 * Builds a {@link ViPreviewFramesModel} from a position-aware ("PrintToImagesJson")
 * export payload — the real-coordinate source the flat `PrintToSingleFileHtml`
 * export cannot provide (VHS-REQ-659). Accepts a JSON string or an already-parsed
 * value; tolerates a bare frames array or an object with a `frames`/`Frames`
 * array. Returns `undefined` when the payload is absent, unparseable, or not a
 * non-empty frames array, so the caller can fall back to the flat-export builder.
 *
 * Unlike `buildFramesModelFromFlatExport`, this model carries the diagram's real
 * geometry, so it needs no size-grouping fidelity heuristic: a coordinate model
 * is faithful by construction.
 */
export function buildFramesModelFromCoordinateJson(
  payload: string | unknown
): ViPreviewFramesModel | undefined {
  let parsed: unknown = payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  const frames = extractFramesArray(parsed);
  if (!frames) {
    return undefined;
  }
  return normalizeViPreviewFrames(frames);
}

/**
 * The element id of the inert `application/json` island a position-aware LabVIEW
 * export embeds in its rendered HTML to carry the coordinate frames payload.
 * Distinct from the viewer's own output island (`lvr-frames`) so the input data
 * and the assembled viewer never collide.
 */
export const EMBEDDED_COORDINATE_FRAMES_ISLAND_ID = 'lvr-coordinate-frames';

/**
 * Extracts the raw text of an embedded coordinate-frames island
 * (`<script type="application/json" id="lvr-coordinate-frames">…</script>`) from
 * a rendered LabVIEW HTML document, or `undefined` when none is present. The
 * island is inert JSON (never executed): callers parse it with
 * {@link buildFramesModelFromCoordinateJson} and re-serialize it into the
 * viewer's own nonce-guarded island, so the raw island is never injected into a
 * webview. Because the island rides inside the rendered HTML, it survives the
 * content-addressed render cache unchanged (cold == warm) with no cache-format
 * change.
 */
export function extractEmbeddedCoordinateFramesJson(html: string): string | undefined {
  if (typeof html !== 'string' || html.length === 0) {
    return undefined;
  }
  // The start-tag attribute group tolerates a `>` inside a quoted attribute value
  // (`(?:[^>"']|"[^"]*"|'[^']*')*`), and the end tag accepts `</script>` as well
  // as `</script` + whitespace + non-`>` junk + `>` (browsers treat `</script foo>`
  // as a close) while NOT matching `</scriptfoo>`, so a crafted document cannot
  // hide or mis-terminate a script the way a `[^>]*` / `</script\s*>` filter would
  // (CodeQL js/bad-tag-filter).
  const scriptPattern = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script(?:\s[^>]*)?>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = match[1];
    if (
      new RegExp(`id\\s*=\\s*["']${EMBEDDED_COORDINATE_FRAMES_ISLAND_ID}["']`, 'i').test(attributes) &&
      /type\s*=\s*["']application\/json["']/i.test(attributes)
    ) {
      const body = match[2].trim();
      return body.length > 0 ? body : undefined;
    }
  }
  return undefined;
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
