#!/usr/bin/env node

'use strict';

// VHS-REQ-698 slice 2 (Agent Operating Control-Plane, epic #2144): Tier-1 board
// APPLY. This is the acting half of the control-plane loop.
//
// It collects the same directly-verified board drift the shadow radar reports
// (via the board-sync collector) and applies it through the governed write path
// (VHS-REQ-696) `runBoardSync`, using a real `gh project item-edit` executor.
// Everything is fail-closed:
//   - The committed `control-plane-write.json` must have `enabled: true`
//     (runBoardSync refuses otherwise); it ships enabled only by a reviewed flip.
//   - Only Tier-1 board-sync is exercised: verified closures -> Status Done +
//     Evidence Proven. Nothing is inferred, no other field or tier is touched.
//   - Every applied write is appended to the write log by the write path.
//
// The (field, value) -> (fieldId, optionId) mapping and the collect step are pure
// / injectable; the gh executor is the only live boundary, so the logic is
// unit-tested with no real GitHub.

const { spawnSync } = require('node:child_process');
const { runBoardSync, loadWriteConfig } = require('./controlPlaneWrite.js');
const {
  PROJECT_NUMBER,
  PROJECT_OWNER,
  buildBoardSyncItems,
  defaultReadProjectItems,
  defaultReadVerifiedClosures,
  BoardSyncAuthError
} = require('./controlPlaneBoardSync.js');

// Project #4 field/option ids. Recorded in repo memory; the source of truth is
// the live project, but Tier-1 only ever sets these two known values, so pinning
// them keeps the executor a pure lookup.
const PROJECT_ID = 'PVT_kwDODQiayc4Bd5Rq';
const FIELD_MAP = {
  'Status::Done': { fieldId: 'PVTSSF_lADODQiayc4Bd5RqzhYXb_U', optionId: '98236657' },
  'Evidence State::Proven': { fieldId: 'PVTSSF_lADODQiayc4Bd5RqzhYXcAU', optionId: '0c635d9f' }
};

// Pure: resolve a planned update to the gh field/option ids. Returns null for any
// (field, value) pair Tier-1 is not allowed to set, so an unexpected update can
// never be applied.
function resolveFieldTarget(update) {
  if (!update || typeof update.field !== 'string' || typeof update.value !== 'string') {
    return null;
  }
  return FIELD_MAP[`${update.field}::${update.value}`] || null;
}

function runGh(args, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const res = spawn('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.error) {
    throw new BoardSyncAuthError(`gh invocation failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new BoardSyncAuthError(`gh exited ${res.status}: ${(res.stderr || '').toString().trim() || 'unknown error'}`);
  }
  return res.stdout || '';
}

// Build the applyFieldUpdate executor the write path calls per authorized update.
// Refuses (throws) any update not in the Tier-1 field map, so the write path can
// only ever set Status=Done / Evidence=Proven.
function createGhFieldUpdater(deps = {}) {
  const projectId = deps.projectId || PROJECT_ID;
  return (update) => {
    const target = resolveFieldTarget(update);
    if (!target) {
      throw new Error(`refusing to apply unsupported board update: ${update && update.field}=${update && update.value}`);
    }
    runGh(
      [
        'project',
        'item-edit',
        '--id',
        update.itemId,
        '--project-id',
        projectId,
        '--field-id',
        target.fieldId,
        '--single-select-option-id',
        target.optionId
      ],
      deps
    );
  };
}

// Orchestration: collect live board items + verified closures, then apply through
// the governed write path. Does nothing unless the committed flag is enabled.
function runControlPlaneApply(deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const config = deps.config || loadWriteConfig(repoRoot, deps);
  const readProjectItems = deps.readProjectItems || defaultReadProjectItems;
  const readVerifiedClosures = deps.readVerifiedClosures || defaultReadVerifiedClosures;

  const projectItems = readProjectItems(deps);
  const numbers = projectItems.map((i) => i && i.number).filter((n) => typeof n === 'number');
  const verifiedClosures = readVerifiedClosures(numbers, deps);
  const items = buildBoardSyncItems(projectItems, verifiedClosures);

  const applyFieldUpdate = deps.applyFieldUpdate || createGhFieldUpdater(deps);
  return runBoardSync({ items }, { ...deps, repoRoot, config, applyFieldUpdate });
}

module.exports = {
  PROJECT_ID,
  FIELD_MAP,
  resolveFieldTarget,
  createGhFieldUpdater,
  runControlPlaneApply
};

if (require.main === module) {
  try {
    const result = runControlPlaneApply();
    if (!result.executed) {
      process.stdout.write(`[control-plane-apply] no writes (${result.reason}). plannedCount=${result.plannedCount}\n`);
      // Disabled/no-op is a clean exit; the loop is fail-closed by design.
      process.exit(0);
    }
    process.stdout.write(`[control-plane-apply] applied ${result.appliedCount} of ${result.plannedCount} verified board update(s).\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[control-plane-apply] ${err.message}\n`);
    process.exit(1);
  }
}
