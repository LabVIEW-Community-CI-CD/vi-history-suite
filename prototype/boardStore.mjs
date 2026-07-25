// Offline-first local project board store (prototype governance).
//
// The board lives as a versioned JSON committed to the prototype branch, so the
// two machines share it offline via git and reconcile to a real GitHub Project
// later. The field/stage SCHEMA is digest-tracked: editing fields without an
// explicit `schema-bump` raises drift, and sync is blocked until the version is
// bumped and the remote schema matches. Per-field `fieldMeta {ts,by}` records the
// last writer so sync can reconcile conflicts by last-writer-wins on updatedAt.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const BOARD_DIR = path.join(process.cwd(), 'prototype', 'board');
export const BOARD_PATH = path.join(BOARD_DIR, 'board.json');
export const BOARD_SCHEMA = 'vihs-local-board@v1';

// Future-proof field model: Status (work lifecycle) and Intake Stage (provenance
// funnel) are orthogonal so promoting repo-wide later never churns the columns.
export const DEFAULT_FIELDS = [
  { key: 'status', name: 'Status', type: 'single-select', options: ['Triage', 'Backlog', 'In Progress', 'In Review', 'Blocked', 'Done', 'Dropped'] },
  { key: 'intakeStage', name: 'Intake Stage', type: 'single-select', options: ['Proposed', 'Aligned', 'Spawned', 'Direct'] },
  { key: 'sourceDiscussion', name: 'Source Discussion', type: 'number' },
  { key: 'origin', name: 'Origin', type: 'single-select', options: ['WIN', 'LINUX', 'collab', 'human'] }
];

export function computeDigest(fields) {
  return crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 16);
}
export function nowIso() {
  return new Date().toISOString();
}

export function defaultBoard(agent = 'WIN') {
  const fields = DEFAULT_FIELDS.map((f) => ({ ...f }));
  const digest = computeDigest(fields);
  return {
    schema: BOARD_SCHEMA,
    schemaVersion: 1,
    schemaDigest: digest,
    schemaChangelog: [{ version: 1, ts: nowIso(), by: agent, note: 'initial schema (Status, Intake Stage, Source Discussion, Origin)', digest }],
    board: {
      name: 'VIHS Intake — discussion → issue → board',
      remote: { provider: 'github-projects-v2', owner: 'LabVIEW-Community-CI-CD', projectNumber: null, projectId: null, createWhenReady: true }
    },
    fields,
    items: [],
    sync: { lastSyncedAt: null, lastSyncBy: null, remoteSchemaVersion: null, conflictPolicy: 'field-lww-by-updatedAt' }
  };
}

export function loadBoard() {
  if (!fs.existsSync(BOARD_PATH)) return null;
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}
export function saveBoard(b) {
  b.items.sort((x, y) => x.id.localeCompare(y.id));
  fs.mkdirSync(BOARD_DIR, { recursive: true });
  fs.writeFileSync(BOARD_PATH, JSON.stringify(b, null, 2) + '\n');
}
export function initBoard(agent) {
  if (fs.existsSync(BOARD_PATH)) return { created: false, board: loadBoard() };
  const b = defaultBoard(agent);
  saveBoard(b);
  return { created: true, board: b };
}

export function fieldDef(b, key) {
  return (b.fields || []).find((f) => f.key === key);
}
export function validateField(b, key, value) {
  const def = fieldDef(b, key);
  if (!def) throw new Error('unknown field "' + key + '"');
  if (value == null || value === '') return value;
  if (def.type === 'single-select' && !def.options.includes(value)) {
    throw new Error(`invalid ${key} "${value}" (allowed: ${def.options.join(', ')})`);
  }
  if (def.type === 'number') {
    if (Number.isNaN(Number(value))) throw new Error(key + ' must be a number');
    return Number(value);
  }
  return value;
}
export function nextItemId(b) {
  const n = (b.items || []).reduce((mx, it) => Math.max(mx, Number((it.id.match(/(\d+)$/) || [])[1] || 0)), 0);
  return 'item-' + String(n + 1).padStart(4, '0');
}
export function addItem(b, { title, issueUrl = null, fields = {} }, agent = 'WIN') {
  const ts = nowIso();
  const item = { id: nextItemId(b), title, issueUrl, fields: {}, fieldMeta: {}, remoteItemId: null, createdAt: ts, updatedAt: ts, syncedAt: null };
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '') continue;
    item.fields[k] = validateField(b, k, v);
    item.fieldMeta[k] = { ts, by: agent };
  }
  b.items.push(item);
  return item;
}
export function setField(b, itemRef, key, value, agent = 'WIN') {
  const item = (b.items || []).find((it) => it.id === itemRef || it.issueUrl === itemRef);
  if (!item) throw new Error('item not found: ' + itemRef);
  item.fields[key] = validateField(b, key, value);
  item.fieldMeta[key] = { ts: nowIso(), by: agent };
  item.updatedAt = nowIso();
  return item;
}
export function schemaState(b) {
  const current = computeDigest(b.fields);
  return { current, recorded: b.schemaDigest, drift: current !== b.schemaDigest, version: b.schemaVersion };
}
export function schemaBump(b, note, agent = 'WIN') {
  const digest = computeDigest(b.fields);
  b.schemaVersion += 1;
  b.schemaDigest = digest;
  b.schemaChangelog.push({ version: b.schemaVersion, ts: nowIso(), by: agent, note: note || 'schema change', digest });
  return b;
}
