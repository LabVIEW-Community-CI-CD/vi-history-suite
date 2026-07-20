#!/usr/bin/env node

'use strict';

// VHS-REQ-698 (Agent Operating Control-Plane, epic #2144): control-plane loop —
// drift radar (slice 1, read-only).
//
// This closes the "observe" side of the read -> shadow -> apply loop as a
// continuous, human-visible signal. It composes directly-verifiable ground truth
// into a single digest: how far the project board is behind verified reality,
// plus governance-gate health, open-work state, and coverage/requirement debt.
// The digest is rendered for a sticky tracking issue; this module WRITES NOTHING
// to the board. The Tier-1 apply that acts on the board drift is the separate,
// enable-flag-gated governed write path (VHS-REQ-696) wired in slice 2.
//
// The renderer is pure and the collector's live boundaries are injected, so the
// logic is unit-tested with synthetic signals and no GitHub.

const { collectBoardSyncPlan } = require('./controlPlaneBoardSync.js');

let buildRepoTruthPacket;
try {
  // Reused to derive the richer digest sections from live ground truth. Loaded
  // defensively so the pure renderer/mappers stay usable even if the read-model
  // module changes shape.
  ({ buildRepoTruthPacket } = require('./readRepoTruth.js'));
} catch {
  buildRepoTruthPacket = undefined;
}

// Stable marker so the workflow can upsert one sticky issue instead of posting a
// new comment every run.
const DIGEST_MARKER = '<!-- vi-history-suite:control-plane-drift-radar -->';

// --- pure read-model -> digest-section mappers ------------------------------
// Each maps an already-collected repo-truth packet to a digest section, or
// returns undefined when the underlying domain is unavailable (so a failed or
// absent domain simply omits its section rather than reporting a false signal).
// Accepts either a full read-model packet (domains nested under `.domains`) or a
// flat domains object.

function resolveDomains(packet) {
  const p = packet && typeof packet === 'object' ? packet : {};
  return p.domains && typeof p.domains === 'object' ? p.domains : p;
}

function deriveGateHealthFromReadModel(packet) {
  const d = resolveDomains(packet);
  const gates = [];
  const adr = d.adrGovernance;
  if (adr && adr.available) {
    gates.push({ id: 'adr:governance', ok: adr.consistent === true, detail: adr.consistent === true ? '' : `${adr.violationCount ?? '?'} violation(s)` });
  }
  const req = d.requirementHealth;
  if (req && req.available) {
    gates.push({ id: 'requirements:health', ok: req.healthy === true, detail: req.healthy === true ? '' : String(req.status || 'attention') });
  }
  const cov = d.coverage;
  if (cov && cov.available) {
    const below = Number(cov.mappedBelowThreshold) || 0;
    gates.push({ id: 'coverage:risk', ok: below === 0, detail: below === 0 ? '' : `${below} mapped file(s) below threshold` });
  }
  return gates.length > 0 ? gates : undefined;
}

function deriveOpenWorkFromReadModel(packet) {
  const d = resolveDomains(packet);
  const ow = d.openWork;
  if (!ow || !ow.available) {
    return undefined;
  }
  const byState = ow.byMergeStateStatus && typeof ow.byMergeStateStatus === 'object' ? ow.byMergeStateStatus : {};
  return {
    openPrs: Number(ow.openPullRequests) || 0,
    blocked: Number(byState.BLOCKED) || 0
  };
}

function deriveDebtFromReadModel(packet) {
  const d = resolveDomains(packet);
  const cov = d.coverage;
  const req = d.requirementHealth;
  const debt = {};
  if (cov && cov.available) {
    const below = Number(cov.mappedBelowThreshold) || 0;
    debt.coverageDebtTitle = below === 0 ? 'No mapped files below the coverage risk threshold' : `${below} mapped file(s) below the coverage risk threshold`;
  }
  if (req && req.available && req.requirementsNeedingAttention != null) {
    debt.requirementAttention = Number(req.requirementsNeedingAttention) || 0;
  }
  return Object.keys(debt).length > 0 ? debt : undefined;
}

function deriveReleaseStateFromReadModel(packet) {
  const d = resolveDomains(packet);
  const rs = d.releaseState;
  if (!rs || !rs.available) {
    return undefined;
  }
  return {
    stage: typeof rs.stage === 'string' ? rs.stage : 'unknown',
    status: typeof rs.status === 'string' ? rs.status : 'unknown',
    authorityComplete: rs.authorityComplete === true
  };
}

function deriveSupplyChainFromReadModel(packet) {
  const d = resolveDomains(packet);
  const sc = d.supplyChain;
  if (!sc || !sc.available) {
    return undefined;
  }
  return {
    status: typeof sc.status === 'string' ? sc.status : 'unknown',
    artifactCount: Number(sc.artifactCount) || 0,
    attentionCount: Number(sc.attentionCount) || 0
  };
}

// Pure: render the digest markdown from an already-collected signals object. Every
// section is optional; absent sections are simply omitted. Returns
// { marker, markdown, driftCount }.
function buildControlPlaneDigest(signals, options = {}) {
  const s = signals && typeof signals === 'object' ? signals : {};
  const generatedAt = typeof options.generatedAt === 'string' ? options.generatedAt : new Date().toISOString();
  const boardDrift = Array.isArray(s.boardDrift) ? s.boardDrift : [];
  const lines = [DIGEST_MARKER, '', '# Control-Plane Drift Radar', '', `_Generated ${generatedAt}. Read-only; writes nothing._`, ''];

  // Board-vs-truth drift.
  lines.push('## Board vs. verified truth', '');
  if (boardDrift.length === 0) {
    lines.push('- ✅ Board is in sync with directly-verified truth (0 updates).');
  } else {
    lines.push(`- ⚠️ ${boardDrift.length} board field(s) behind verified reality:`);
    for (const u of boardDrift) {
      lines.push(`  - #${u.number} → ${u.field} = ${u.value} (${u.reason})`);
    }
  }
  lines.push('');

  // Governance gate health.
  if (Array.isArray(s.gateHealth) && s.gateHealth.length > 0) {
    lines.push('## Governance gate health', '');
    for (const g of s.gateHealth) {
      const icon = g.ok ? '✅' : '❌';
      lines.push(`- ${icon} ${g.id}${g.ok ? '' : `: ${g.detail || 'failing'}`}`);
    }
    lines.push('');
  }

  // Open-work state.
  if (s.openWork && typeof s.openWork === 'object') {
    lines.push('## Open work', '');
    const ow = s.openWork;
    lines.push(`- Open PRs: ${Number(ow.openPrs) || 0}` + (ow.blocked != null ? ` (${ow.blocked} blocked)` : ''));
    if (ow.queueDepth != null) {
      lines.push(`- Merge-queue depth: ${ow.queueDepth}`);
    }
    lines.push('');
  }

  // Coverage / requirement debt.
  if (s.debt && typeof s.debt === 'object') {
    lines.push('## Coverage & requirement debt', '');
    if (s.debt.coverageDebtTitle) {
      lines.push(`- ${s.debt.coverageDebtTitle}`);
    }
    if (s.debt.requirementAttention != null) {
      lines.push(`- Requirements needing attention: ${s.debt.requirementAttention}`);
    }
    lines.push('');
  }

  // Release state.
  if (s.releaseState && typeof s.releaseState === 'object') {
    const rs = s.releaseState;
    lines.push('## Release state', '');
    lines.push(`- Furthest stage: ${rs.stage} (${rs.status})`);
    lines.push(`- Publish authority: ${rs.authorityComplete ? 'complete' : 'incomplete'}`);
    lines.push('');
  }

  // Supply-chain state.
  if (s.supplyChain && typeof s.supplyChain === 'object') {
    const sc = s.supplyChain;
    const icon = sc.attentionCount > 0 ? '⚠️' : '✅';
    lines.push('## Supply chain', '');
    lines.push(`- ${icon} ${sc.status}: ${sc.artifactCount} artifact(s), ${sc.attentionCount} needing attention`);
    lines.push('');
  }

  return { marker: DIGEST_MARKER, markdown: lines.join('\n').trimEnd() + '\n', driftCount: boardDrift.length };
}

// Orchestration: collect live signals. The board drift is the primary,
// always-collected signal (via the shadow board-sync, which is fail-closed on
// auth). Other sections are supplied by injected collectors so slice 1 stays
// small; the workflow can pass a read-model packet for the richer sections.
function collectControlPlaneSignals(deps = {}) {
  const collectPlan = deps.collectBoardSyncPlan || collectBoardSyncPlan;
  const { updates } = collectPlan(deps.boardSyncDeps || {});
  const signals = { boardDrift: updates };

  // The richer sections derive from a repo-truth read-model packet. It is
  // supplied explicitly (injected packet, or a builder) so this stays
  // deterministic and side-effect-free; the CLI wires the real builder. If no
  // packet is available the board-drift radar still stands on its own.
  let packet = deps.readModelPacket;
  if (packet === undefined && typeof deps.buildReadModel === 'function') {
    try {
      packet = deps.buildReadModel();
    } catch {
      packet = undefined;
    }
  }

  // Explicit collectors win; otherwise derive from the read-model packet.
  if (typeof deps.collectGateHealth === 'function') {
    signals.gateHealth = deps.collectGateHealth();
  } else if (packet) {
    signals.gateHealth = deriveGateHealthFromReadModel(packet);
  }
  if (typeof deps.collectOpenWork === 'function') {
    signals.openWork = deps.collectOpenWork();
  } else if (packet) {
    signals.openWork = deriveOpenWorkFromReadModel(packet);
  }
  if (typeof deps.collectDebt === 'function') {
    signals.debt = deps.collectDebt();
  } else if (packet) {
    signals.debt = deriveDebtFromReadModel(packet);
  }
  if (typeof deps.collectReleaseState === 'function') {
    signals.releaseState = deps.collectReleaseState();
  } else if (packet) {
    signals.releaseState = deriveReleaseStateFromReadModel(packet);
  }
  if (typeof deps.collectSupplyChain === 'function') {
    signals.supplyChain = deps.collectSupplyChain();
  } else if (packet) {
    signals.supplyChain = deriveSupplyChainFromReadModel(packet);
  }

  // Drop any section a mapper returned as undefined so the renderer omits it.
  for (const key of ['gateHealth', 'openWork', 'debt', 'releaseState', 'supplyChain']) {
    if (signals[key] === undefined) {
      delete signals[key];
    }
  }
  return signals;
}

module.exports = {
  DIGEST_MARKER,
  buildControlPlaneDigest,
  collectControlPlaneSignals,
  deriveGateHealthFromReadModel,
  deriveOpenWorkFromReadModel,
  deriveDebtFromReadModel,
  deriveReleaseStateFromReadModel,
  deriveSupplyChainFromReadModel
};

if (require.main === module) {
  try {
    // Wire the real read-model builder so the CLI (and the workflow) get the
    // richer gate-health / open-work / debt sections. A read-model failure
    // degrades to the board-drift-only radar rather than failing the digest.
    const buildReadModel =
      typeof buildRepoTruthPacket === 'function'
        ? () => buildRepoTruthPacket({}, {})
        : undefined;
    const signals = collectControlPlaneSignals({ buildReadModel });
    const { markdown, driftCount } = buildControlPlaneDigest(signals);
    process.stdout.write(markdown);
    process.stderr.write(`[control-plane-loop] board drift: ${driftCount} update(s). Read-only radar; nothing written.\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[control-plane-loop] ${err.message}\n`);
    // Fail-closed on auth: a live board read is required for the radar.
    process.exit(1);
  }
}
