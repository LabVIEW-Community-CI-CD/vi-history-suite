import { describe, expect, it } from 'vitest';
import {
  LVKIT_DIFF_SCHEMA,
  parseLvkitDiffDocument,
  parseLvkitDiffJson
} from '../../src/semantic/lvkit/lvkitDiffModel';

// A real-shaped lvkit `diff --format json` change (a subVI node added), taken
// from the icon-editor lv_icon.vi 537683 -> fc09736 diff.
const RAW_NODE_ADDED = {
  uid: '19725',
  full_id: 'lv_icon.vi::19725',
  kind: 'node',
  change: 'added',
  label: 'VisibleTextMarker.vi',
  detail: null,
  bounds: [1615.0, 358.0, 1647.0, 390.0],
  bounds_before: null,
  path: null,
  path_before: null,
  chain_paths: [
    [
      [1595.0, 386.0],
      [1619.0, 386.0]
    ]
  ],
  container_uid: '8387',
  frame_path: '17597=False;8387=1'
};

const RAW_WIRE_REMOVED = {
  uid: '19644',
  full_id: 'lv_icon.vi::19644',
  kind: 'wire',
  change: 'removed',
  label: 'error in',
  detail: '\u2190 PictureControl_MouseUp.vi',
  bounds: [1706.0, 386.0, 1706.0, 386.0],
  bounds_before: [1592.0, 386.0, 1592.0, 386.0],
  path: [
    [1642.5, 386.5],
    [1706.0, 386.0]
  ],
  path_before: null,
  chain_paths: null,
  container_uid: null,
  frame_path: null
};

describe('parseLvkitDiffDocument (VHS-REQ-712.1)', () => {
  it('parses a real change map and normalizes snake_case to camelCase', () => {
    const doc = parseLvkitDiffDocument({
      changes: [RAW_NODE_ADDED, RAW_WIRE_REMOVED],
      common_nodes: 273
    });
    expect(doc.schema).toBe(LVKIT_DIFF_SCHEMA);
    expect(doc.commonNodes).toBe(273);
    expect(doc.changes).toHaveLength(2);

    const [node, wire] = doc.changes;
    expect(node).toMatchObject({
      uid: '19725',
      fullId: 'lv_icon.vi::19725',
      kind: 'node',
      change: 'added',
      label: 'VisibleTextMarker.vi',
      bounds: [1615, 358, 1647, 390],
      containerUid: '8387',
      framePath: '17597=False;8387=1'
    });
    expect(node.chainPaths?.[0]).toEqual([
      [1595, 386],
      [1619, 386]
    ]);
    expect(wire).toMatchObject({
      kind: 'wire',
      change: 'removed',
      label: 'error in',
      detail: '\u2190 PictureControl_MouseUp.vi',
      boundsBefore: [1592, 386, 1592, 386]
    });
    expect(wire.path).toEqual([
      [1642.5, 386.5],
      [1706, 386]
    ]);
  });

  it('drops null optional fields rather than carrying them', () => {
    const [node] = parseLvkitDiffDocument({ changes: [RAW_NODE_ADDED] }).changes;
    expect('detail' in node).toBe(false);
    expect('boundsBefore' in node).toBe(false);
    expect('path' in node).toBe(false);
  });

  it('treats an empty change map as no differences with zero common nodes', () => {
    const doc = parseLvkitDiffDocument({ changes: [], common_nodes: 0 });
    expect(doc.changes).toHaveLength(0);
    expect(doc.commonNodes).toBe(0);
  });

  it('defaults common_nodes to 0 when absent or invalid', () => {
    expect(parseLvkitDiffDocument({ changes: [] }).commonNodes).toBe(0);
    expect(parseLvkitDiffDocument({ changes: [], common_nodes: -5 }).commonNodes).toBe(0);
    expect(parseLvkitDiffDocument({ changes: [], common_nodes: 'x' }).commonNodes).toBe(0);
  });

  it('falls back to full_id then index for a change with no uid', () => {
    const doc = parseLvkitDiffDocument({
      changes: [{ kind: 'node', change: 'added', full_id: 'x.vi::7' }, { kind: 'wire', change: 'removed' }]
    });
    expect(doc.changes[0].uid).toBe('x.vi::7');
    expect(doc.changes[1].uid).toBe('1');
  });

  it('fails closed on a non-object document', () => {
    expect(() => parseLvkitDiffDocument(null)).toThrow(/not an object/);
    expect(() => parseLvkitDiffDocument([])).toThrow(/not an object/);
  });

  it('fails closed when changes is not an array', () => {
    expect(() => parseLvkitDiffDocument({ changes: {} })).toThrow(/changes/);
  });

  it('fails closed when a change is missing kind or change', () => {
    expect(() => parseLvkitDiffDocument({ changes: [{ change: 'added' }] })).toThrow(/kind/);
    expect(() => parseLvkitDiffDocument({ changes: [{ kind: 'node' }] })).toThrow(/change/);
    expect(() => parseLvkitDiffDocument({ changes: ['nope'] })).toThrow(/not an object/);
  });
});

describe('parseLvkitDiffJson (VHS-REQ-712.1)', () => {
  it('parses a JSON string', () => {
    const doc = parseLvkitDiffJson(JSON.stringify({ changes: [RAW_NODE_ADDED], common_nodes: 1 }));
    expect(doc.changes).toHaveLength(1);
    expect(doc.commonNodes).toBe(1);
  });

  it('fails closed on invalid JSON', () => {
    expect(() => parseLvkitDiffJson('{not json')).toThrow(/not valid JSON/);
  });
});
