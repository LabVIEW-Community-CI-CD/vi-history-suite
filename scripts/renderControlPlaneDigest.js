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

// Stable marker so the workflow can upsert one sticky issue instead of posting a
// new comment every run.
const DIGEST_MARKER = '<!-- vi-history-suite:control-plane-drift-radar -->';

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
  if (typeof deps.collectGateHealth === 'function') {
    signals.gateHealth = deps.collectGateHealth();
  }
  if (typeof deps.collectOpenWork === 'function') {
    signals.openWork = deps.collectOpenWork();
  }
  if (typeof deps.collectDebt === 'function') {
    signals.debt = deps.collectDebt();
  }
  return signals;
}

module.exports = {
  DIGEST_MARKER,
  buildControlPlaneDigest,
  collectControlPlaneSignals
};

if (require.main === module) {
  try {
    const signals = collectControlPlaneSignals();
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
