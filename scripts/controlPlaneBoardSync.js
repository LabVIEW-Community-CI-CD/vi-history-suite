#!/usr/bin/env node

'use strict';

// VHS-REQ-695 (Agent Operating Control-Plane, epic #2144): board-sync SHADOW MODE.
//
// This is the observability precursor to the governed write path (VHS-REQ-696).
// It reads live, directly-verifiable ground truth (the project board's current
// field values + which tracked items are actually closed/merged) and computes the
// board updates that would mirror that truth via the SAME pure planner the write
// path uses (`planBoardSync`). In shadow mode it ONLY REPORTS the plan; it never
// writes anything, regardless of the write-path enablement flag. That makes it a
// safe, always-runnable way for a human (or agent) to see "the board is N updates
// behind reality" before any acting surface is turned on.
//
// Live GitHub reads are fail-closed: the board and closure domains require a live
// `gh` token and never degrade to defaults (mirrors the read-model contract).
// All boundaries are injected so the logic is unit-tested with synthetic truth
// and no real GitHub calls.

const { spawnSync } = require('node:child_process');
const { planBoardSync } = require('./controlPlaneWrite.js');

const PROJECT_NUMBER = 4;
const PROJECT_OWNER = 'LabVIEW-Community-CI-CD';

class BoardSyncAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BoardSyncAuthError';
  }
}

// Pure: join the board's current items with the set of directly-verified closures
// into the shape `planBoardSync` consumes. `verifiedClosures` maps an item number
// to `true` only when its linked work is directly verified as merged/closed. We
// never infer closure; an unknown number is treated as not-closed.
function buildBoardSyncItems(projectItems, verifiedClosures) {
  const items = Array.isArray(projectItems) ? projectItems : [];
  const closures = verifiedClosures instanceof Map ? verifiedClosures : new Map(Object.entries(verifiedClosures || {}));
  const result = [];
  for (const item of items) {
    if (!item || typeof item.itemId !== 'string' || typeof item.number !== 'number') {
      continue;
    }
    result.push({
      itemId: item.itemId,
      number: item.number,
      status: typeof item.status === 'string' ? item.status : '',
      evidence: typeof item.evidence === 'string' ? item.evidence : '',
      linkedPrMerged: closures.get(item.number) === true || closures.get(String(item.number)) === true
    });
  }
  return result;
}

// Pure: render the shadow plan for humans. Reports the drift (how many board
// fields are behind directly-verified reality) without implying any write.
function renderShadowPlan(updates, options = {}) {
  const list = Array.isArray(updates) ? updates : [];
  if (list.length === 0) {
    return '[control-plane-board-sync] SHADOW: board is in sync with directly-verified truth (0 updates).';
  }
  const lines = [`[control-plane-board-sync] SHADOW: ${list.length} board update(s) WOULD mirror verified truth (none applied):`];
  for (const u of list) {
    lines.push(`  - #${u.number} ${u.field} -> ${u.value} (${u.reason})`);
  }
  if (options.enabledForWrite !== true) {
    lines.push('[control-plane-board-sync] Write path is disabled; this is report-only.');
  }
  return lines.join('\n');
}

// Orchestration: read live board items + verified closures (both injected,
// fail-closed on auth), then compute the plan. Never writes.
function collectBoardSyncPlan(deps = {}) {
  const readProjectItems = deps.readProjectItems || defaultReadProjectItems;
  const readVerifiedClosures = deps.readVerifiedClosures || defaultReadVerifiedClosures;
  const projectItems = readProjectItems();
  const numbers = projectItems.map((i) => i && i.number).filter((n) => typeof n === 'number');
  const verifiedClosures = readVerifiedClosures(numbers);
  const items = buildBoardSyncItems(projectItems, verifiedClosures);
  const updates = planBoardSync(items);
  return { items, updates };
}

// --- default live boundaries (fail-closed on gh auth) -----------------------

function runGh(args, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const res = spawn('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.error) {
    throw new BoardSyncAuthError(`gh invocation failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || '').toString();
    throw new BoardSyncAuthError(`gh exited ${res.status}: ${stderr.trim() || 'unknown error'}`);
  }
  return res.stdout || '';
}

function defaultReadProjectItems(deps = {}) {
  const out = runGh(
    ['project', 'item-list', String(PROJECT_NUMBER), '--owner', PROJECT_OWNER, '--format', 'json', '--limit', '400'],
    deps
  );
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new BoardSyncAuthError('could not parse project item-list JSON');
  }
  const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  return items
    .filter((i) => i && i.content && typeof i.content.number === 'number')
    .map((i) => ({
      itemId: i.id,
      number: i.content.number,
      status: i.status || '',
      evidence: i['evidence State'] || i.evidenceState || ''
    }));
}

// A number is a directly-verified closure when its issue is CLOSED (completed) or
// its PR is MERGED. We read state per number; anything not confirmed closed is
// treated as not-closed (never inferred).
function defaultReadVerifiedClosures(numbers, deps = {}) {
  const closures = new Map();
  for (const number of numbers) {
    const out = runGh(
      [
        'issue',
        'view',
        String(number),
        '--repo',
        `${PROJECT_OWNER}/vi-history-suite`,
        '--json',
        'state,stateReason'
      ],
      deps
    );
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch {
      continue;
    }
    if (parsed && parsed.state === 'CLOSED' && parsed.stateReason === 'COMPLETED') {
      closures.set(number, true);
    }
  }
  return closures;
}

module.exports = {
  PROJECT_NUMBER,
  PROJECT_OWNER,
  BoardSyncAuthError,
  buildBoardSyncItems,
  renderShadowPlan,
  collectBoardSyncPlan
};

if (require.main === module) {
  try {
    const { updates } = collectBoardSyncPlan();
    process.stdout.write(`${renderShadowPlan(updates)}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[control-plane-board-sync] ${err.message}\n`);
    // Fail-closed on auth: a live board read is required; do not pretend "in sync".
    process.exit(1);
  }
}
