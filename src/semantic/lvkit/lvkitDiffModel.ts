// Typed model + fail-closed parser for the `lvkit diff --format json` output
// (VHS-REQ-712). lvkit (pragmatest-dev/lvkit) reads `.vi` binaries directly via
// pylabview and emits a UID-correlated block-diagram change map WITHOUT LabVIEW
// installed — the LabVIEW-free semantic-diff backend for the agent MCP surface.
//
// This module owns ONLY the typed shape of lvkit's JSON and a pure, dependency
// -free parser. It never spawns lvkit and never touches the filesystem; the
// maintainer driver / compare provider run lvkit and feed its stdout here so the
// semantic contract is unit tested without lvkit, LabVIEW, or Python installed.
//
// lvkit's raw JSON is snake_case; this parser normalizes to a camelCase typed
// record and fails closed on a malformed document so a bad backend response is
// an explicit error, never a silently-empty comparison.

/** Schema id for the parsed lvkit diff document (this module's own contract). */
export const LVKIT_DIFF_SCHEMA = 'vi-history-suite/lvkit-diff@v1';

/** A 4-number bounding box `[x1, y1, x2, y2]` in VI diagram coordinate space. */
export type LvkitBounds = readonly [number, number, number, number];

/** A polyline (list of `[x, y]` points) describing a wire's routed path. */
export type LvkitPolyline = ReadonlyArray<readonly [number, number]>;

/**
 * One change in lvkit's UID-correlated change map. `kind` and `change` are kept
 * as open strings (not a closed union) so an lvkit release that emits a new kind
 * or action is preserved verbatim rather than dropped; the adapter maps the ones
 * it recognizes and treats the rest generically.
 */
export interface LvkitDiffChange {
  /** Stable object UID within the VI (lvkit's correlation key). */
  uid: string;
  /** Fully-qualified id, e.g. `lv_icon.vi::19725`. */
  fullId?: string;
  /** Object kind — `node`, `wire`, and future kinds. */
  kind: string;
  /** Change action — `added`, `removed`, `modified`, `moved`, and future actions. */
  change: string;
  /** Human label (e.g. a subVI filename or a wire's terminal name). */
  label?: string;
  /** Extra detail lvkit attaches (e.g. a wire's source subVI). */
  detail?: string;
  /** Post-change bounding box, when placed. */
  bounds?: LvkitBounds;
  /** Pre-change bounding box, when the object moved/was removed. */
  boundsBefore?: LvkitBounds;
  /** Wire path polyline(s), when the change is a wire. */
  path?: LvkitPolyline;
  /** Prior wire path polyline(s). */
  pathBefore?: LvkitPolyline;
  /** Wire chain routing polylines for a node's connections. */
  chainPaths?: LvkitPolyline[];
  /** UID of the containing structure (loop/case/sequence), when nested. */
  containerUid?: string;
  /** Structure frame path (e.g. `17597=False;8387=1`), when nested. */
  framePath?: string;
}

/** The parsed lvkit diff document: the change map plus the shared-node count. */
export interface LvkitDiffDocument {
  schema: typeof LVKIT_DIFF_SCHEMA;
  changes: LvkitDiffChange[];
  /** Count of nodes present and unchanged in both VIs (lvkit `common_nodes`). */
  commonNodes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalBounds(value: unknown): LvkitBounds | undefined {
  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return [value[0], value[1], value[2], value[3]] as LvkitBounds;
  }
  return undefined;
}

function optionalPolyline(value: unknown): LvkitPolyline | undefined {
  if (
    Array.isArray(value) &&
    value.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        typeof p[0] === 'number' &&
        Number.isFinite(p[0]) &&
        typeof p[1] === 'number' &&
        Number.isFinite(p[1])
    )
  ) {
    return value.map((p) => [p[0], p[1]] as readonly [number, number]);
  }
  return undefined;
}

function optionalPolylineList(value: unknown): LvkitPolyline[] | undefined {
  if (Array.isArray(value)) {
    const list = value.map((p) => optionalPolyline(p)).filter((p): p is LvkitPolyline => Boolean(p));
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

function parseChange(raw: unknown, index: number): LvkitDiffChange {
  if (!isRecord(raw)) {
    throw new Error(`lvkit diff change at index ${index} is not an object.`);
  }
  const kind = optionalString(raw.kind);
  const change = optionalString(raw.change);
  if (!kind) {
    throw new Error(`lvkit diff change at index ${index} is missing a "kind".`);
  }
  if (!change) {
    throw new Error(`lvkit diff change at index ${index} is missing a "change".`);
  }
  const uid = optionalString(raw.uid) ?? optionalString(raw.full_id) ?? String(index);
  const parsed: LvkitDiffChange = { uid, kind, change };
  const fullId = optionalString(raw.full_id);
  if (fullId) {
    parsed.fullId = fullId;
  }
  const label = optionalString(raw.label);
  if (label) {
    parsed.label = label;
  }
  const detail = optionalString(raw.detail);
  if (detail) {
    parsed.detail = detail;
  }
  const bounds = optionalBounds(raw.bounds);
  if (bounds) {
    parsed.bounds = bounds;
  }
  const boundsBefore = optionalBounds(raw.bounds_before);
  if (boundsBefore) {
    parsed.boundsBefore = boundsBefore;
  }
  const path = optionalPolyline(raw.path);
  if (path) {
    parsed.path = path;
  }
  const pathBefore = optionalPolyline(raw.path_before);
  if (pathBefore) {
    parsed.pathBefore = pathBefore;
  }
  const chainPaths = optionalPolylineList(raw.chain_paths);
  if (chainPaths) {
    parsed.chainPaths = chainPaths;
  }
  const containerUid = optionalString(raw.container_uid);
  if (containerUid) {
    parsed.containerUid = containerUid;
  }
  const framePath = optionalString(raw.frame_path);
  if (framePath) {
    parsed.framePath = framePath;
  }
  return parsed;
}

/**
 * VHS-REQ-712.1: parse a raw `lvkit diff --format json` document (an already
 * JSON-parsed value) into a typed, camelCase record. Fails closed: the value
 * must be an object whose `changes` is an array, and each change must carry a
 * `kind` and a `change`; a non-finite or absent `common_nodes` becomes 0.
 */
export function parseLvkitDiffDocument(raw: unknown): LvkitDiffDocument {
  if (!isRecord(raw)) {
    throw new Error('lvkit diff document is not an object.');
  }
  if (!Array.isArray(raw.changes)) {
    throw new Error('lvkit diff document is missing a "changes" array.');
  }
  const changes = raw.changes.map((change, index) => parseChange(change, index));
  const commonNodesRaw = raw.common_nodes;
  const commonNodes =
    typeof commonNodesRaw === 'number' && Number.isFinite(commonNodesRaw) && commonNodesRaw >= 0
      ? Math.floor(commonNodesRaw)
      : 0;
  return { schema: LVKIT_DIFF_SCHEMA, changes, commonNodes };
}

/**
 * VHS-REQ-712.1: parse a raw JSON string emitted by `lvkit diff --format json`.
 * Fails closed on invalid JSON before the structural parse runs.
 */
export function parseLvkitDiffJson(json: string): LvkitDiffDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `lvkit diff output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parseLvkitDiffDocument(value);
}
