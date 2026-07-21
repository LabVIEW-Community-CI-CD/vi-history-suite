#!/usr/bin/env node

'use strict';

// VHS-REQ-696 (Agent Operating Control-Plane, epic #2144): governed write path.
//
// This is the ONE acting surface of the control-plane, and it is FAIL-CLOSED and
// DEFAULT-DISABLED. No write can occur unless a human has committed
// `control-plane-write.json` with `enabled: true` (a reviewed PR). Only Tier 1
// (board-sync) is in scope initially; it mirrors DIRECTLY-VERIFIED read-model
// truth onto the project board and needs the enabled flag but not per-action
// approval. Higher tiers (annotate / merge-queue / create-work) are declared but
// disabled and require server-verified per-action approval when implemented.
//
// The decision logic (gate + Tier 1 planner) is pure and injectable so it is
// unit-tested with synthetic config/truth and no real GitHub calls. The executor
// is a thin, injectable boundary that only runs when the gate authorizes it.

const fs = require('node:fs');
const path = require('node:path');

const WRITE_CONFIG_FILENAME = 'control-plane-write.json';
const WRITE_LOG_FILENAME = 'control-plane-write-log.jsonl';

// Load and normalize the committed write-path config. Fail-closed: a missing or
// malformed config yields a disabled posture, never an enabled one.
function loadWriteConfig(repoRoot, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  let raw;
  try {
    raw = readFileSync(path.join(repoRoot || process.cwd(), WRITE_CONFIG_FILENAME), 'utf8');
  } catch {
    return { enabled: false, approvers: [], tiers: {}, reason: 'config-missing' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { enabled: false, approvers: [], tiers: {}, reason: 'config-malformed' };
  }
  return {
    enabled: parsed.enabled === true,
    approvers: Array.isArray(parsed.approvers) ? parsed.approvers.filter((a) => typeof a === 'string') : [],
    tokenSource: typeof parsed.tokenSource === 'string' ? parsed.tokenSource : undefined,
    tiers: parsed.tiers && typeof parsed.tiers === 'object' ? parsed.tiers : {}
  };
}

// Pure: authorize (or refuse) a write action against the config. Fail-closed on
// every unmet precondition. `tier` is one of boardSync/annotate/mergeQueue/createWork.
function authorizeWrite(config, tier, context = {}) {
  if (!config || config.enabled !== true) {
    return { authorized: false, reason: 'write-path-disabled' };
  }
  if (!config.tiers || config.tiers[tier] !== true) {
    return { authorized: false, reason: `tier-disabled:${tier}` };
  }
  // Tier 1 (boardSync) mirrors only directly-verified truth -> no per-action
  // approval. All other tiers require a server-verified approver from the allowlist.
  if (tier !== 'boardSync') {
    const approver = context.approver;
    if (typeof approver !== 'string' || !config.approvers.includes(approver)) {
      return { authorized: false, reason: 'approver-not-authorized' };
    }
    if (context.approverVerified !== true) {
      return { authorized: false, reason: 'approver-not-server-verified' };
    }
  }
  return { authorized: true };
}

// Pure Tier 1 planner: from directly-verified read-model/board facts, compute the
// board field updates that mirror ground truth. It ONLY proposes updates it can
// directly verify (a linked PR is merged -> Status Done / Evidence Proven); it
// never infers state. Returns [] when nothing needs changing.
//
// items: [{ itemId, number, status, evidence, linkedPrMerged }]
function planBoardSync(items) {
  const list = Array.isArray(items) ? items : [];
  const updates = [];
  for (const item of list) {
    if (!item || typeof item.itemId !== 'string') {
      continue;
    }
    // Directly verified: the item's linked PR is merged -> it is Done/Proven.
    if (item.linkedPrMerged === true) {
      if (item.status !== 'Done') {
        updates.push({ itemId: item.itemId, number: item.number, field: 'Status', value: 'Done', reason: 'linked-pr-merged' });
      }
      if (item.evidence !== 'Proven') {
        updates.push({ itemId: item.itemId, number: item.number, field: 'Evidence State', value: 'Proven', reason: 'linked-pr-merged' });
      }
    }
  }
  return updates;
}

// Execute planned board updates ONLY when the gate authorizes. Every applied
// update is appended to the write log for auditability. The actual field-setter
// and log-appender are injected; when disabled, nothing runs and the outcome
// records the refusal.
function runBoardSync(options = {}, deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const config = deps.config || loadWriteConfig(repoRoot, deps);
  const auth = authorizeWrite(config, 'boardSync');
  if (!auth.authorized) {
    return { executed: false, reason: auth.reason, plannedCount: 0, appliedCount: 0 };
  }
  const updates = planBoardSync(options.items || []);
  const applyFieldUpdate = deps.applyFieldUpdate;
  const appendLog = deps.appendLog || defaultAppendLog(repoRoot, deps);
  if (typeof applyFieldUpdate !== 'function') {
    return { executed: false, reason: 'no-executor', plannedCount: updates.length, appliedCount: 0 };
  }
  let applied = 0;
  for (const update of updates) {
    applyFieldUpdate(update);
    appendLog({
      action: 'board-sync',
      tier: 'boardSync',
      itemId: update.itemId,
      number: update.number,
      field: update.field,
      value: update.value,
      reason: update.reason,
      timestamp: (deps.now ? deps.now() : new Date()).toISOString()
    });
    applied += 1;
  }
  return { executed: true, plannedCount: updates.length, appliedCount: applied };
}

function defaultAppendLog(repoRoot, deps = {}) {
  const appendFileSync = deps.appendFileSync || fs.appendFileSync;
  return (entry) => {
    appendFileSync(path.join(repoRoot || process.cwd(), WRITE_LOG_FILENAME), `${JSON.stringify(entry)}\n`, 'utf8');
  };
}

// Pure Tier 2 (annotate) planner: normalize proposed annotate actions
// (comment/label on an issue or PR) into a validated apply-list, dropping any
// malformed entry. Unlike Tier 1 this does NOT derive actions from truth — the
// actions are supplied by an approved proposer — so the planner only validates
// shape; the gate (server-verified approver) is what authorizes acting on them.
//
// actions: [{ kind: 'comment'|'label', target: 'issue'|'pr', number, body?, label? }]
function planAnnotate(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const planned = [];
  for (const action of list) {
    if (!action || typeof action !== 'object') {
      continue;
    }
    const { kind, target, number } = action;
    if (target !== 'issue' && target !== 'pr') {
      continue;
    }
    if (!Number.isInteger(number) || number <= 0) {
      continue;
    }
    if (kind === 'comment') {
      if (typeof action.body !== 'string' || action.body.trim().length === 0) {
        continue;
      }
      planned.push({ kind: 'comment', target, number, body: action.body });
    } else if (kind === 'label') {
      if (typeof action.label !== 'string' || action.label.trim().length === 0) {
        continue;
      }
      planned.push({ kind: 'label', target, number, label: action.label });
    }
  }
  return planned;
}

// Execute planned Tier 2 annotate actions ONLY when the gate authorizes. Unlike
// Tier 1, annotate additionally requires a server-verified allowlisted approver
// (context.approver + context.approverVerified) because it acts beyond mirroring
// directly-verified truth. Every applied annotation is appended to the write log.
// The annotation applier and log-appender are injected; nothing runs when the
// gate refuses, and the outcome records the refusal reason.
function runAnnotate(options = {}, deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const config = deps.config || loadWriteConfig(repoRoot, deps);
  const auth = authorizeWrite(config, 'annotate', {
    approver: options.approver,
    approverVerified: options.approverVerified
  });
  if (!auth.authorized) {
    return { executed: false, reason: auth.reason, plannedCount: 0, appliedCount: 0 };
  }
  const planned = planAnnotate(options.actions || []);
  const applyAnnotation = deps.applyAnnotation;
  const appendLog = deps.appendLog || defaultAppendLog(repoRoot, deps);
  if (typeof applyAnnotation !== 'function') {
    return { executed: false, reason: 'no-executor', plannedCount: planned.length, appliedCount: 0 };
  }
  let applied = 0;
  for (const action of planned) {
    applyAnnotation(action);
    appendLog({
      action: 'annotate',
      tier: 'annotate',
      kind: action.kind,
      target: action.target,
      number: action.number,
      value: action.kind === 'comment' ? action.body : action.label,
      approver: options.approver,
      timestamp: (deps.now ? deps.now() : new Date()).toISOString()
    });
    applied += 1;
  }
  return { executed: true, plannedCount: planned.length, appliedCount: applied };
}

// Pure Tier 3 (mergeQueue) planner: normalize proposed merge-queue actions
// (arm auto-merge on, or dequeue, a pull request) into a validated apply-list,
// dropping any malformed entry. Like Tier 2 the actions are supplied by an
// approved proposer, not derived from truth, so the planner only validates shape;
// the gate (server-verified approver) authorizes acting on them. A duplicate
// (op, number) pair is de-duplicated so the queue is not double-armed.
//
// actions: [{ op: 'arm'|'dequeue', number }]
function planMergeQueue(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const planned = [];
  const seen = new Set();
  for (const action of list) {
    if (!action || typeof action !== 'object') {
      continue;
    }
    const { op, number } = action;
    if (op !== 'arm' && op !== 'dequeue') {
      continue;
    }
    if (!Number.isInteger(number) || number <= 0) {
      continue;
    }
    const key = `${op}:${number}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    planned.push({ op, number });
  }
  return planned;
}

// Execute planned Tier 3 merge-queue actions ONLY when the gate authorizes. Like
// Tier 2, mergeQueue is default-disabled and requires a server-verified
// allowlisted approver because it acts beyond mirroring directly-verified truth.
// Every applied action is appended to the write log. The queue actor and
// log-appender are injected; nothing runs when the gate refuses.
function runMergeQueue(options = {}, deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const config = deps.config || loadWriteConfig(repoRoot, deps);
  const auth = authorizeWrite(config, 'mergeQueue', {
    approver: options.approver,
    approverVerified: options.approverVerified
  });
  if (!auth.authorized) {
    return { executed: false, reason: auth.reason, plannedCount: 0, appliedCount: 0 };
  }
  const planned = planMergeQueue(options.actions || []);
  const applyMergeQueueAction = deps.applyMergeQueueAction;
  const appendLog = deps.appendLog || defaultAppendLog(repoRoot, deps);
  if (typeof applyMergeQueueAction !== 'function') {
    return { executed: false, reason: 'no-executor', plannedCount: planned.length, appliedCount: 0 };
  }
  let applied = 0;
  for (const action of planned) {
    applyMergeQueueAction(action);
    appendLog({
      action: 'merge-queue',
      tier: 'mergeQueue',
      op: action.op,
      number: action.number,
      approver: options.approver,
      timestamp: (deps.now ? deps.now() : new Date()).toISOString()
    });
    applied += 1;
  }
  return { executed: true, plannedCount: planned.length, appliedCount: applied };
}

// Pure Tier 4 (createWork) planner: normalize proposed work-creation actions
// (open a new tracking issue) into a validated apply-list, dropping any malformed
// entry. Like Tiers 2/3 the actions are supplied by an approved proposer, not
// derived from truth, so the planner only validates shape (a non-empty title;
// optional string body defaulting to empty; optional string label list); the
// gate (server-verified approver) authorizes acting on them. Identical titles are
// de-duplicated so the same work item is not opened twice in one run.
//
// actions: [{ title, body?, labels? }]
function planCreateWork(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const planned = [];
  const seen = new Set();
  for (const action of list) {
    if (!action || typeof action !== 'object') {
      continue;
    }
    if (typeof action.title !== 'string' || action.title.trim().length === 0) {
      continue;
    }
    const title = action.title.trim();
    if (seen.has(title)) {
      continue;
    }
    const body = typeof action.body === 'string' ? action.body : '';
    const labels = Array.isArray(action.labels)
      ? action.labels.filter((l) => typeof l === 'string' && l.trim().length > 0)
      : [];
    seen.add(title);
    planned.push({ title, body, labels });
  }
  return planned;
}

// Execute planned Tier 4 createWork actions ONLY when the gate authorizes. Like
// Tiers 2/3, createWork is default-disabled and requires a server-verified
// allowlisted approver because it acts beyond mirroring directly-verified truth.
// Every created work item is appended to the write log. The issue creator and
// log-appender are injected; nothing runs when the gate refuses.
function runCreateWork(options = {}, deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const config = deps.config || loadWriteConfig(repoRoot, deps);
  const auth = authorizeWrite(config, 'createWork', {
    approver: options.approver,
    approverVerified: options.approverVerified
  });
  if (!auth.authorized) {
    return { executed: false, reason: auth.reason, plannedCount: 0, appliedCount: 0 };
  }
  const planned = planCreateWork(options.actions || []);
  const applyCreateWork = deps.applyCreateWork;
  const appendLog = deps.appendLog || defaultAppendLog(repoRoot, deps);
  if (typeof applyCreateWork !== 'function') {
    return { executed: false, reason: 'no-executor', plannedCount: planned.length, appliedCount: 0 };
  }
  let applied = 0;
  for (const action of planned) {
    applyCreateWork(action);
    appendLog({
      action: 'create-work',
      tier: 'createWork',
      title: action.title,
      labels: action.labels,
      approver: options.approver,
      timestamp: (deps.now ? deps.now() : new Date()).toISOString()
    });
    applied += 1;
  }
  return { executed: true, plannedCount: planned.length, appliedCount: applied };
}

module.exports = {
  WRITE_CONFIG_FILENAME,
  WRITE_LOG_FILENAME,
  loadWriteConfig,
  authorizeWrite,
  planBoardSync,
  runBoardSync,
  planAnnotate,
  runAnnotate,
  planMergeQueue,
  runMergeQueue,
  planCreateWork,
  runCreateWork
};

if (require.main === module) {
  const config = loadWriteConfig(process.cwd());
  const auth = authorizeWrite(config, 'boardSync');
  process.stdout.write(
    `[control-plane-write] enabled=${config.enabled}; boardSync ${auth.authorized ? 'AUTHORIZED' : `refused (${auth.reason})`}.\n`
  );
  // Never acts from the CLI without an injected executor; this entrypoint only
  // reports the gate posture.
  process.exit(0);
}
