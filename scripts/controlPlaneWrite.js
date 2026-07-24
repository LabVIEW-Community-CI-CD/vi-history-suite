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
const { spawnSync } = require('node:child_process');

const WRITE_CONFIG_FILENAME = 'control-plane-write.json';
const WRITE_LOG_FILENAME = 'control-plane-write-log.jsonl';

// Project #4 ("vihs") field/option identifiers for the Tier 1 board-sync live
// executor. These are stable GitHub ProjectV2 node ids; a board field rename in
// the GitHub UI would require updating them here (and the resolver fails closed
// on any field/value it does not know rather than issuing a blind edit).
// The board node id comes from the single source of truth (referenced by node id,
// never by the ambiguous "vihs"/"VIHS" name) so it cannot drift or target the
// duplicate Project #3.
const { PROJECT_ID } = require('./lib/controlPlaneProject.js');
const BOARD_FIELD_MAP = {
  Status: {
    fieldId: 'PVTSSF_lADODQiayc4Bd5RqzhYXb_U',
    options: { Done: '98236657' }
  },
  'Evidence State': {
    fieldId: 'PVTSSF_lADODQiayc4Bd5RqzhYXcAU',
    options: { Proven: '0c635d9f' }
  }
};

// Repository the Tier 2 annotate live executor acts on. Comments/labels are
// posted here through `gh`; the trust gate additionally verifies the approver's
// permission on this repo before any annotate write is authorized.
const REPOSITORY = 'LabVIEW-Community-CI-CD/vi-history-suite';

// Auth/exec failures on the live write boundary are fail-closed: they throw so a
// board write never silently no-ops or degrades.
class ControlPlaneWriteError extends Error {}


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

// Pure: resolve a Tier 1 board field update ({ itemId, field, value }) into the
// `gh project item-edit` argv that sets that single-select option. Fails closed
// (throws) on any field or value not in BOARD_FIELD_MAP so a live write is never
// issued blind. The Tier 1 planner only ever produces Status=Done and
// Evidence State=Proven, which this map covers.
function resolveBoardFieldEdit(update) {
  if (!update || typeof update.itemId !== 'string' || update.itemId.length === 0) {
    throw new ControlPlaneWriteError('board field edit requires an itemId');
  }
  const field = BOARD_FIELD_MAP[update.field];
  if (!field) {
    throw new ControlPlaneWriteError(`unknown board field: ${update.field}`);
  }
  const optionId = field.options[update.value];
  if (!optionId) {
    throw new ControlPlaneWriteError(`unknown value '${update.value}' for board field '${update.field}'`);
  }
  return [
    'project',
    'item-edit',
    '--id',
    update.itemId,
    '--project-id',
    PROJECT_ID,
    '--field-id',
    field.fieldId,
    '--single-select-option-id',
    optionId
  ];
}

// Live Tier 1 executor boundary: apply a board field update through `gh project
// item-edit`. Fail-closed on gh auth/exec error (throws ControlPlaneWriteError),
// so an unauthenticated or failed write never silently no-ops. `spawnSync` is
// injectable for testing without a real gh. In CI the ambient token cannot edit
// Project #4 — a maintainer-provisioned CONTROL_PLANE_PROJECT_TOKEN is required —
// so this fails closed there rather than degrading.
function defaultApplyFieldUpdate(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  return (update) => {
    const args = resolveBoardFieldEdit(update);
    const res = spawn('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (res.error) {
      throw new ControlPlaneWriteError(`gh invocation failed: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const stderr = (res.stderr || '').toString();
      throw new ControlPlaneWriteError(`gh exited ${res.status}: ${stderr.trim() || 'unknown error'}`);
    }
  };
}

// Pure: resolve a planned Tier 2 annotate action into the `gh` argv that applies
// it. A comment maps to `gh issue|pr comment ... --body`, a label to
// `gh issue|pr edit ... --add-label`. Fails closed (throws) on any kind/target
// the planner would not have produced, so a live annotate write is never issued
// blind. planAnnotate only ever produces comment/label on issue/pr.
function resolveAnnotateCommand(action) {
  if (!action || typeof action !== 'object') {
    throw new ControlPlaneWriteError('annotate action must be an object');
  }
  const { kind, target, number } = action;
  const subject = target === 'issue' ? 'issue' : target === 'pr' ? 'pr' : null;
  if (!subject) {
    throw new ControlPlaneWriteError(`unknown annotate target: ${target}`);
  }
  if (!Number.isInteger(number) || number <= 0) {
    throw new ControlPlaneWriteError(`annotate action requires a positive integer number, got: ${number}`);
  }
  if (kind === 'comment') {
    if (typeof action.body !== 'string' || action.body.trim().length === 0) {
      throw new ControlPlaneWriteError('annotate comment requires a non-empty body');
    }
    return [subject, 'comment', String(number), '--repo', REPOSITORY, '--body', action.body];
  }
  if (kind === 'label') {
    if (typeof action.label !== 'string' || action.label.trim().length === 0) {
      throw new ControlPlaneWriteError('annotate label requires a non-empty label');
    }
    return [subject, 'edit', String(number), '--repo', REPOSITORY, '--add-label', action.label];
  }
  throw new ControlPlaneWriteError(`unknown annotate kind: ${kind}`);
}

// Live Tier 2 executor boundary: apply an annotate action through `gh`. Same
// fail-closed posture as the Tier 1 field updater — a gh auth/exec error throws
// ControlPlaneWriteError so an unauthenticated or failed annotate never silently
// no-ops. `spawnSync` is injectable for testing without a real gh.
function defaultApplyAnnotation(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  return (action) => {
    const args = resolveAnnotateCommand(action);
    const res = spawn('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (res.error) {
      throw new ControlPlaneWriteError(`gh invocation failed: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const stderr = (res.stderr || '').toString();
      throw new ControlPlaneWriteError(`gh exited ${res.status}: ${stderr.trim() || 'unknown error'}`);
    }
  };
}

// Live approver verification boundary for tiers that act beyond mirroring truth.
// A write-permission (admin/write/maintain) collaborator on the repository is
// treated as server-verified; anyone else (or an unresolvable permission) is
// NOT verified. Fail-closed: a gh error or unparseable response verifies nobody.
// `spawnSync` is injectable so the gate is unit-tested without a real gh.
function defaultVerifyApprover(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  return (approver) => {
    if (typeof approver !== 'string' || approver.trim().length === 0) {
      return false;
    }
    const res = spawn(
      'gh',
      ['api', `repos/${REPOSITORY}/collaborators/${approver}/permission`, '--jq', '.permission'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    if (res.error || res.status !== 0) {
      return false;
    }
    const permission = (res.stdout || '').toString().trim();
    return permission === 'admin' || permission === 'write' || permission === 'maintain';
  };
}

// Parse the annotate CLI's proposed actions. Actions are supplied by an approved
// proposer (never derived from truth), either inline as a JSON array via
// --actions <json> or from a JSON file via --actions-file <path>. Fails closed
// (throws) on unreadable/non-JSON/non-array input so the CLI never acts on a
// malformed proposal; planAnnotate then drops individually-malformed entries.
function loadAnnotateActions(argv, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  const inlineIndex = argv.indexOf('--actions');
  const fileIndex = argv.indexOf('--actions-file');
  let raw;
  if (inlineIndex !== -1) {
    raw = argv[inlineIndex + 1];
    if (typeof raw !== 'string') {
      throw new ControlPlaneWriteError('--actions requires a JSON array value');
    }
  } else if (fileIndex !== -1) {
    const filePath = argv[fileIndex + 1];
    if (typeof filePath !== 'string') {
      throw new ControlPlaneWriteError('--actions-file requires a path value');
    }
    raw = readFileSync(filePath, 'utf8');
  } else {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ControlPlaneWriteError('annotate actions must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new ControlPlaneWriteError('annotate actions must be a JSON array');
  }
  return parsed;
}

// Thin, testable CLI runner for the Tier 2 annotate surface. It wires the
// proposed-action loader, the live approver-verification boundary, the governed
// write path, and the live `gh` annotate executor — but only acts when ALL hold:
// the committed gate has annotate enabled AND a server-verified allowlisted
// approver is supplied AND `--apply` is passed. Enablement/tier are checked
// before any live approver call, so a disabled path verifies nobody. Without
// `--apply` it is a dry run that reports the gate posture and the number of
// well-formed actions that WOULD be applied, writing nothing.
function runAnnotateCli(argv = [], deps = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const repoRoot = deps.repoRoot || process.cwd();
  const apply = args.includes('--apply');
  const approverIndex = args.indexOf('--approver');
  const approver = approverIndex !== -1 ? args[approverIndex + 1] : undefined;
  const loadConfig = deps.loadWriteConfig || loadWriteConfig;
  const config = deps.config || loadConfig(repoRoot, deps);

  const lines = [];
  // Fail-closed enablement/tier precheck BEFORE any live approver verification,
  // so a disabled path never reaches out to gh.
  const pre = authorizeWrite(config, 'annotate');
  if (!pre.authorized && (pre.reason === 'write-path-disabled' || pre.reason.startsWith('tier-disabled'))) {
    lines.push(`[control-plane-write] enabled=${config.enabled === true}; annotate refused (${pre.reason}).`);
    return { authorized: false, reason: pre.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  const actions = deps.actions || loadAnnotateActions(args, deps);
  const planned = planAnnotate(actions);

  const verifyApprover = deps.verifyApprover || defaultVerifyApprover(deps);
  const approverVerified = verifyApprover(approver);
  const auth = authorizeWrite(config, 'annotate', { approver, approverVerified });
  if (!auth.authorized) {
    lines.push(`[control-plane-write] enabled=${config.enabled === true}; annotate refused (${auth.reason}).`);
    return { authorized: false, reason: auth.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  lines.push(`[control-plane-write] annotate AUTHORIZED for verified approver ${approver}; ${planned.length} well-formed action(s).`);
  if (!apply) {
    lines.push('[control-plane-write] Dry run (no --apply); nothing written. Re-run with --apply to annotate.');
    return { authorized: true, applied: false, dryRun: true, plannedCount: planned.length, appliedCount: 0, lines };
  }

  const applyAnnotation = deps.applyAnnotation || defaultApplyAnnotation(deps);
  const result = runAnnotate({ actions, approver, approverVerified }, { ...deps, repoRoot, config, applyAnnotation });
  lines.push(`[control-plane-write] applied ${result.appliedCount} of ${result.plannedCount} annotate action(s).`);
  return { authorized: true, applied: true, dryRun: false, plannedCount: result.plannedCount, appliedCount: result.appliedCount, lines };
}

// Pure: resolve a planned Tier 3 `arm` merge-queue action into the `gh pr merge`
// argv that arms auto-merge (rebase; the queue owns the strategy, so no
// --delete-branch). Fails closed (throws) on anything but a well-formed arm.
// `dequeue` is not a single static argv (it needs the PR node id then a GraphQL
// mutation) and is handled directly by the executor, so this resolver rejects it.
function resolveMergeQueueArmCommand(action) {
  if (!action || typeof action !== 'object') {
    throw new ControlPlaneWriteError('merge-queue action must be an object');
  }
  const { op, number } = action;
  if (!Number.isInteger(number) || number <= 0) {
    throw new ControlPlaneWriteError(`merge-queue action requires a positive integer number, got: ${number}`);
  }
  if (op !== 'arm') {
    throw new ControlPlaneWriteError(`resolveMergeQueueArmCommand only resolves 'arm', got: ${op}`);
  }
  return ['pr', 'merge', String(number), '--repo', REPOSITORY, '--auto', '--rebase'];
}

// Live Tier 3 executor boundary: apply a merge-queue action through `gh`. `arm`
// runs `gh pr merge --auto --rebase`; `dequeue` first resolves the PR node id
// then runs the `dequeuePullRequest` GraphQL mutation (there is no gh flag for
// it). Same fail-closed posture — a gh auth/exec error throws
// ControlPlaneWriteError so a failed queue action never silently no-ops.
// `spawnSync` is injectable for testing without a real gh.
function defaultApplyMergeQueueAction(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const runGh = (args) => {
    const res = spawn('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (res.error) {
      throw new ControlPlaneWriteError(`gh invocation failed: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const stderr = (res.stderr || '').toString();
      throw new ControlPlaneWriteError(`gh exited ${res.status}: ${stderr.trim() || 'unknown error'}`);
    }
    return (res.stdout || '').toString();
  };
  const [owner, name] = REPOSITORY.split('/');
  return (action) => {
    if (action && action.op === 'dequeue') {
      if (!Number.isInteger(action.number) || action.number <= 0) {
        throw new ControlPlaneWriteError(`merge-queue action requires a positive integer number, got: ${action.number}`);
      }
      const idJson = runGh([
        'api',
        'graphql',
        '-f',
        `query={repository(owner:"${owner}",name:"${name}"){pullRequest(number:${action.number}){id}}}`,
        '--jq',
        '.data.repository.pullRequest.id'
      ]);
      const nodeId = idJson.trim();
      if (!nodeId) {
        throw new ControlPlaneWriteError(`could not resolve PR node id for #${action.number}`);
      }
      runGh([
        'api',
        'graphql',
        '-f',
        `query=mutation{dequeuePullRequest(input:{id:"${nodeId}"}){mergeQueueEntry{position}}}`
      ]);
      return;
    }
    runGh(resolveMergeQueueArmCommand(action));
  };
}

// Thin, testable CLI runner for the Tier 3 merge-queue surface. Same gated shape
// as the Tier 2 annotate CLI: enablement/tier are checked before any live
// approver verification; when authorized for a server-verified allowlisted
// approver it defaults to a dry run reporting the well-formed action count, and
// only acts (arm/dequeue via the live executor, append-logged) with `--apply`.
function runMergeQueueCli(argv = [], deps = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const repoRoot = deps.repoRoot || process.cwd();
  const apply = args.includes('--apply');
  const approverIndex = args.indexOf('--approver');
  const approver = approverIndex !== -1 ? args[approverIndex + 1] : undefined;
  const loadConfig = deps.loadWriteConfig || loadWriteConfig;
  const config = deps.config || loadConfig(repoRoot, deps);

  const lines = [];
  const pre = authorizeWrite(config, 'mergeQueue');
  if (!pre.authorized && (pre.reason === 'write-path-disabled' || pre.reason.startsWith('tier-disabled'))) {
    lines.push(`[control-plane-write] enabled=${config.enabled === true}; mergeQueue refused (${pre.reason}).`);
    return { authorized: false, reason: pre.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  const actions = deps.actions || loadAnnotateActions(args, deps);
  const planned = planMergeQueue(actions);

  const verifyApprover = deps.verifyApprover || defaultVerifyApprover(deps);
  const approverVerified = verifyApprover(approver);
  const auth = authorizeWrite(config, 'mergeQueue', { approver, approverVerified });
  if (!auth.authorized) {
    lines.push(`[control-plane-write] enabled=${config.enabled === true}; mergeQueue refused (${auth.reason}).`);
    return { authorized: false, reason: auth.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  lines.push(`[control-plane-write] mergeQueue AUTHORIZED for verified approver ${approver}; ${planned.length} well-formed action(s).`);
  if (!apply) {
    lines.push('[control-plane-write] Dry run (no --apply); nothing written. Re-run with --apply to act on the merge queue.');
    return { authorized: true, applied: false, dryRun: true, plannedCount: planned.length, appliedCount: 0, lines };
  }

  const applyMergeQueueAction = deps.applyMergeQueueAction || defaultApplyMergeQueueAction(deps);
  const result = runMergeQueue({ actions, approver, approverVerified }, { ...deps, repoRoot, config, applyMergeQueueAction });
  lines.push(`[control-plane-write] applied ${result.appliedCount} of ${result.plannedCount} merge-queue action(s).`);
  return { authorized: true, applied: true, dryRun: false, plannedCount: result.plannedCount, appliedCount: result.appliedCount, lines };
}

// Pure: resolve a planned Tier 4 create-work item ({ title, body, labels }) into
// the `gh issue create` argv that opens a tracking issue. Fails closed (throws)
// on a missing/empty title so a live create is never issued blind. planCreateWork
// only ever produces a non-empty title with a string body and string[] labels.
function resolveCreateWorkCommand(item) {
  if (!item || typeof item !== 'object') {
    throw new ControlPlaneWriteError('create-work item must be an object');
  }
  if (typeof item.title !== 'string' || item.title.trim().length === 0) {
    throw new ControlPlaneWriteError('create-work item requires a non-empty title');
  }
  const args = ['issue', 'create', '--repo', REPOSITORY, '--title', item.title, '--body', typeof item.body === 'string' ? item.body : ''];
  const labels = Array.isArray(item.labels) ? item.labels.filter((l) => typeof l === 'string' && l.trim().length > 0) : [];
  for (const label of labels) {
    args.push('--label', label);
  }
  return args;
}

// Live Tier 4 executor boundary: create a tracking issue through `gh issue
// create`. Same fail-closed posture as the other tiers — a gh auth/exec error
// throws ControlPlaneWriteError so a failed create never silently no-ops.
// `spawnSync` is injectable for testing without a real gh.
function defaultApplyCreateWork(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  return (item) => {
    const args = resolveCreateWorkCommand(item);
    const res = spawn('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (res.error) {
      throw new ControlPlaneWriteError(`gh invocation failed: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const stderr = (res.stderr || '').toString();
      throw new ControlPlaneWriteError(`gh exited ${res.status}: ${stderr.trim() || 'unknown error'}`);
    }
  };
}

// Thin, testable CLI runner for the Tier 4 create-work surface. Same gated shape
// as the Tier 2/Tier 3 CLIs: enablement/tier are checked before any live approver
// verification; when authorized for a server-verified allowlisted approver it
// defaults to a dry run reporting the well-formed item count, and only creates
// (via the live executor, append-logged) with `--apply`.
function runCreateWorkCli(argv = [], deps = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const repoRoot = deps.repoRoot || process.cwd();
  const apply = args.includes('--apply');
  const approverIndex = args.indexOf('--approver');
  const approver = approverIndex !== -1 ? args[approverIndex + 1] : undefined;
  const loadConfig = deps.loadWriteConfig || loadWriteConfig;
  const config = deps.config || loadConfig(repoRoot, deps);

  const lines = [];
  const pre = authorizeWrite(config, 'createWork');
  if (!pre.authorized && (pre.reason === 'write-path-disabled' || pre.reason.startsWith('tier-disabled'))) {
    lines.push(`[control-plane-write] enabled=${config.enabled === true}; createWork refused (${pre.reason}).`);
    return { authorized: false, reason: pre.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  const actions = deps.actions || loadAnnotateActions(args, deps);
  const planned = planCreateWork(actions);

  const verifyApprover = deps.verifyApprover || defaultVerifyApprover(deps);
  const approverVerified = verifyApprover(approver);
  const auth = authorizeWrite(config, 'createWork', { approver, approverVerified });
  if (!auth.authorized) {
    lines.push(`[control-plane-write] enabled=${config.enabled === true}; createWork refused (${auth.reason}).`);
    return { authorized: false, reason: auth.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  lines.push(`[control-plane-write] createWork AUTHORIZED for verified approver ${approver}; ${planned.length} well-formed item(s).`);
  if (!apply) {
    lines.push('[control-plane-write] Dry run (no --apply); nothing written. Re-run with --apply to create tracking work.');
    return { authorized: true, applied: false, dryRun: true, plannedCount: planned.length, appliedCount: 0, lines };
  }

  const applyCreateWork = deps.applyCreateWork || defaultApplyCreateWork(deps);
  const result = runCreateWork({ actions, approver, approverVerified }, { ...deps, repoRoot, config, applyCreateWork });
  lines.push(`[control-plane-write] created ${result.appliedCount} of ${result.plannedCount} tracking work item(s).`);
  return { authorized: true, applied: true, dryRun: false, plannedCount: result.plannedCount, appliedCount: result.appliedCount, lines };
}


// governed write path and the live `gh project item-edit` executor, but only
// acts when BOTH the committed gate authorizes boardSync AND `--apply` is
// passed. Without `--apply` it is a dry run: it reports the gate posture and the
// number of updates that WOULD mirror verified truth, applying nothing.
//
// Every boundary is injected so the runner is unit-tested with synthetic config
// / board plan and no real GitHub calls:
//   - deps.loadWriteConfig(repoRoot)         -> the committed gate config
//   - deps.collectBoardSyncPlan()            -> { items, updates } from live truth
//   - deps.applyFieldUpdate(update)          -> the live gh executor
//   - deps.now()                             -> write-log timestamps
function runBoardSyncCli(argv = [], deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const apply = Array.isArray(argv) && argv.includes('--apply');
  const loadConfig = deps.loadWriteConfig || loadWriteConfig;
  const config = deps.config || loadConfig(repoRoot, deps);
  const auth = authorizeWrite(config, 'boardSync');
  const lines = [
    `[control-plane-write] enabled=${config.enabled === true}; boardSync ${auth.authorized ? 'AUTHORIZED' : `refused (${auth.reason})`}.`
  ];

  if (!auth.authorized) {
    return { authorized: false, reason: auth.reason, applied: false, dryRun: !apply, plannedCount: 0, appliedCount: 0, lines };
  }

  // Authorized: read the live board plan (fail-closed on gh auth via the
  // injected collector). This is required in both dry-run and apply modes.
  const collect = deps.collectBoardSyncPlan || (() => require('./controlPlaneBoardSync.js').collectBoardSyncPlan(deps));
  const { items, updates } = collect();
  lines.push(`[control-plane-write] ${updates.length} board update(s) mirror directly-verified truth.`);

  if (!apply) {
    lines.push('[control-plane-write] Dry run (no --apply); nothing written. Re-run with --apply to mirror truth.');
    return { authorized: true, applied: false, dryRun: true, plannedCount: updates.length, appliedCount: 0, lines };
  }

  const applyFieldUpdate = deps.applyFieldUpdate || defaultApplyFieldUpdate(deps);
  const result = runBoardSync({ items }, { ...deps, repoRoot, config, applyFieldUpdate });
  lines.push(`[control-plane-write] applied ${result.appliedCount} of ${result.plannedCount} board update(s).`);
  return { authorized: true, applied: true, dryRun: false, plannedCount: result.plannedCount, appliedCount: result.appliedCount, lines };
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
  runCreateWork,
  PROJECT_ID,
  BOARD_FIELD_MAP,
  ControlPlaneWriteError,
  resolveBoardFieldEdit,
  defaultApplyFieldUpdate,
  runBoardSyncCli,
  REPOSITORY,
  resolveAnnotateCommand,
  defaultApplyAnnotation,
  defaultVerifyApprover,
  loadAnnotateActions,
  runAnnotateCli,
  resolveMergeQueueArmCommand,
  defaultApplyMergeQueueAction,
  runMergeQueueCli,
  resolveCreateWorkCommand,
  defaultApplyCreateWork,
  runCreateWorkCli,
  dispatchControlPlaneWriteCli,
  runControlPlaneWriteCli
};

// Subcommand dispatch (exported for unit coverage): `annotate` -> Tier 2 CLI,
// `merge-queue` -> Tier 3 CLI, `create-work` -> Tier 4 CLI; anything else runs
// the Tier 1 board-sync CLI (backward compatible with the bare invocation). Deps
// default to {}, so the guard invocation below is behavior-identical to the
// prior inline dispatch.
function dispatchControlPlaneWriteCli(argv = [], deps = {}) {
  return argv[0] === 'annotate'
    ? runAnnotateCli(argv.slice(1), deps)
    : argv[0] === 'merge-queue'
      ? runMergeQueueCli(argv.slice(1), deps)
      : argv[0] === 'create-work'
        ? runCreateWorkCli(argv.slice(1), deps)
        : runBoardSyncCli(argv, deps);
}

// Thin CLI entrypoint (exported for unit coverage): dispatch the requested
// subcommand, print its outcome, and return the process exit code. Fail-closed:
// a live read/write failure (e.g. gh auth) surfaces on stderr with exit 1, never
// a silent no-op. IO and deps are injected so the entrypoint is unit-tested
// without touching the real process streams or exiting the runner; the guard
// below invokes it behavior-identically to the prior inline try/catch.
function runControlPlaneWriteCli(argv = process.argv.slice(2), io = {}, deps = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  try {
    const outcome = dispatchControlPlaneWriteCli(argv, deps);
    stdout.write(`${outcome.lines.join('\n')}\n`);
    return 0;
  } catch (err) {
    stderr.write(`[control-plane-write] ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(runControlPlaneWriteCli());
}
