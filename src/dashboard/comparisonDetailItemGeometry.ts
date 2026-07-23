/**
 * VHS-REQ-703.10 (epic #2262): extract structured geometry from NI VI Comparison
 * Report detail items.
 *
 * The NI comparison report writes each block-diagram difference as a `diff-detail`
 * list item whose TEXT already carries the object, the change action, and — for
 * placed objects — the diagram coordinate, e.g.
 *
 *   SubVI "Finalize Text.vi" - deleted at (1397,358)
 *   Boolean Constant "Visible" - added at (1538,393)
 *   SubVI - VI linkage
 *   wiring changes
 *
 * This module turns that free text into a structured, additive record so the
 * correlation model can tag each change with its change type, object kind/name,
 * and coordinate. It is pure and dependency-free (a string in, a record out) so
 * it is deterministically unit-testable without a LabVIEW render.
 *
 * Coordinates are recorded in **VI diagram coordinate space** (the report's own
 * space), NOT preview-image pixels — there is no calibrated diagram->preview
 * transform yet, so a consumer must treat these as labeled diagram data, never a
 * fabricated pixel overlay.
 */

/** A point in VI diagram coordinate space (as written by the comparison report). */
export interface DiagramPoint {
  x: number;
  y: number;
}

/**
 * The change action a detail item describes. `other` covers items with no
 * recognized action verb (e.g. `SubVI - VI linkage`, `wiring changes`).
 */
export type ComparisonDetailChangeType =
  | 'added'
  | 'deleted'
  | 'moved'
  | 'changed'
  | 'resized'
  | 'other';

/** Structured geometry/metadata extracted from one `diff-detail` item's text. */
export interface ComparisonDetailItemGeometry {
  /** The original detail-item text, always retained. */
  text: string;
  /** The recognized change action, or `other` when none is recognized. */
  changeType: ComparisonDetailChangeType;
  /** The object kind (e.g. `SubVI`, `Boolean Constant`) when present. */
  objectKind?: string;
  /** The quoted object name (e.g. `Finalize Text.vi`, `Visible`) when present. */
  objectName?: string;
  /**
   * The primary diagram coordinate (`at (x,y)`), or the destination of a move
   * (`to (x,y)`), when present. Diagram space, not preview pixels.
   */
  coordinate?: DiagramPoint;
  /** The source coordinate of a move (`from (x,y) to (x,y)`), when present. */
  fromCoordinate?: DiagramPoint;
}

const CHANGE_VERBS: Array<{ pattern: RegExp; type: ComparisonDetailChangeType }> = [
  { pattern: /\b(added|inserted)\b/i, type: 'added' },
  { pattern: /\b(deleted|removed)\b/i, type: 'deleted' },
  { pattern: /\b(moved|relocated)\b/i, type: 'moved' },
  { pattern: /\b(resized)\b/i, type: 'resized' },
  { pattern: /\b(changed|modified|edited)\b/i, type: 'changed' }
];

// A coordinate token `(<int>,<int>)` with optional whitespace around the comma.
const POINT = /\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
const FROM_POINT = new RegExp(`\\bfrom\\s*${POINT.source}`, 'i');
const TO_POINT = new RegExp(`\\bto\\s*${POINT.source}`, 'i');
const AT_POINT = new RegExp(`\\bat\\s*${POINT.source}`, 'i');

export function toPoint(match: RegExpMatchArray | null): DiagramPoint | undefined {
  if (!match) {
    return undefined;
  }
  const x = Number.parseInt(match[1], 10);
  const y = Number.parseInt(match[2], 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  return { x, y };
}

/**
 * Parses one comparison-report `diff-detail` item string into a structured
 * geometry record. Always returns a record (never throws): unrecognized text
 * yields `{ text, changeType: 'other' }` with no coordinate, so a caller can map
 * over every item safely. The raw `text` is always retained. Accepts `unknown`
 * so callers passing loosely-typed report data need no unsafe cast; non-string
 * input yields the safe `other` record.
 */
export function parseComparisonDetailItemGeometry(text: unknown): ComparisonDetailItemGeometry {
  const raw = typeof text === 'string' ? text : '';
  const result: ComparisonDetailItemGeometry = { text: raw, changeType: 'other' };
  if (raw.trim().length === 0) {
    return result;
  }

  for (const { pattern, type } of CHANGE_VERBS) {
    if (pattern.test(raw)) {
      result.changeType = type;
      break;
    }
  }

  // Object kind + optional quoted name: `<Kind> "<name>"` or a leading `<Kind> -`.
  // The kind is the run of words before the first quote or ` - ` separator.
  const named = raw.match(/^([A-Za-z][A-Za-z0-9 .]*?)\s*"([^"]*)"/);
  if (named) {
    result.objectKind = named[1].trim();
    result.objectName = named[2];
  } else {
    const kindOnly = raw.match(/^([A-Za-z][A-Za-z0-9 .]*?)\s*-\s/);
    if (kindOnly) {
      result.objectKind = kindOnly[1].trim();
    }
  }

  // Coordinates: prefer explicit from/to (a move), else a single `at (x,y)`.
  const from = toPoint(raw.match(FROM_POINT));
  const to = toPoint(raw.match(TO_POINT));
  if (from || to) {
    if (from) {
      result.fromCoordinate = from;
    }
    if (to) {
      result.coordinate = to;
    }
  } else {
    const at = toPoint(raw.match(AT_POINT));
    if (at) {
      result.coordinate = at;
    }
  }

  return result;
}

/** Maps an array of detail-item strings to their structured geometry records. */
export function parseComparisonDetailItemsGeometry(
  items: readonly string[]
): ComparisonDetailItemGeometry[] {
  return items.map((item) => parseComparisonDetailItemGeometry(item));
}

/** True when a record carries at least one diagram coordinate. */
export function hasDiagramCoordinate(record: ComparisonDetailItemGeometry): boolean {
  return record.coordinate !== undefined || record.fromCoordinate !== undefined;
}
