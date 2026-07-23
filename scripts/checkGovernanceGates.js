#!/usr/bin/env node

'use strict';

// VHS-REQ-681 (dev-only sweep, epic #2159 under control-plane #2144): governance
// gate-tooling integrity.
//
// The repository's governance/CI posture is enforced by a set of gate scripts
// (ADR index, agent-delegation drift, branch-protection, dev-dependency preflight,
// documentation workbench). Each is invoked through a committed npm alias and,
// for several, a git hook or CI step. Before this requirement those scripts were
// unmapped `dev-only` surface: one could be deleted, renamed, or silently
// unwired from its npm alias and no gate would notice.
//
// This gate declares the governance gate tools as a manifest and FAILS CLOSED
// when a declared gate script is missing on disk, its npm alias is absent, or the
// alias no longer invokes the declared script. The evaluation is pure and
// injectable so it is unit-tested with a synthetic manifest and no real fs.

const fs = require('node:fs');
const path = require('node:path');

// The governance gate tools. `script` is the repo-relative gate implementation;
// `alias` is the committed npm script that must invoke it. Extend this manifest
// when a new governance gate script is added so it cannot be silently unwired.
const GOVERNANCE_GATES = [
  { id: 'adr-index', script: 'scripts/checkAdrIndex.js', alias: 'adr:check' },
  { id: 'agent-delegation', script: 'scripts/checkAgentDelegation.js', alias: 'agent:check' },
  { id: 'branch-protection', script: 'scripts/auditBranchProtectionSettings.js', alias: 'branch-protection:audit' },
  { id: 'dev-dependencies', script: 'scripts/checkDevDependencies.js', alias: 'deps:check' },
  { id: 'documentation-workbench', script: 'scripts/checkDocumentationWorkbench.js', alias: 'docs:gate' }
];

// Pure: evaluate the manifest against the repo's package scripts and on-disk
// files. Returns { ok, problems: [{ gateId, reason, detail }] }. Fail-closed:
// any missing script, missing alias, or alias/script mismatch is a problem.
function evaluateGovernanceGates(manifest, deps = {}) {
  const gates = Array.isArray(manifest) ? manifest : [];
  const packageScripts = deps.packageScripts && typeof deps.packageScripts === 'object' ? deps.packageScripts : {};
  const existsSync = typeof deps.existsSync === 'function' ? deps.existsSync : () => false;
  const problems = [];
  const seenIds = new Set();
  for (const gate of gates) {
    if (!gate || typeof gate.id !== 'string' || typeof gate.script !== 'string' || typeof gate.alias !== 'string') {
      problems.push({ gateId: (gate && gate.id) || '(unknown)', reason: 'malformed-gate', detail: 'gate must declare id, script, alias' });
      continue;
    }
    if (seenIds.has(gate.id)) {
      problems.push({ gateId: gate.id, reason: 'duplicate-gate-id', detail: gate.id });
    }
    seenIds.add(gate.id);
    if (!existsSync(gate.script)) {
      problems.push({ gateId: gate.id, reason: 'script-missing', detail: gate.script });
    }
    const aliasCommand = packageScripts[gate.alias];
    if (typeof aliasCommand !== 'string' || aliasCommand.length === 0) {
      problems.push({ gateId: gate.id, reason: 'alias-missing', detail: gate.alias });
    } else if (!aliasCommand.includes(gate.script)) {
      problems.push({ gateId: gate.id, reason: 'alias-mismatch', detail: `${gate.alias} does not invoke ${gate.script}` });
    }
  }
  return { ok: problems.length === 0, problems };
}

// Render the evaluation for humans.
function renderGovernanceGates(result) {
  const problems = (result && Array.isArray(result.problems)) ? result.problems : [];
  if (problems.length === 0) {
    return '[governance-gates] OK: all declared governance gate tools are present and wired to their npm alias.';
  }
  const lines = [`[governance-gates] FAIL: ${problems.length} governance gate integrity problem(s):`];
  for (const p of problems) {
    lines.push(`  - ${p.gateId}: ${p.reason} (${p.detail})`);
  }
  return lines.join('\n');
}

function loadPackageScripts(repoRoot, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  try {
    const raw = readFileSync(path.join(repoRoot || process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    return {};
  }
}

// CLI entrypoint. Pure aside from the injected collaborators (defaulting to the
// process cwd, real fs, and stdout) so it is unit-testable without spawning a
// process or touching the real filesystem. Returns the intended exit code.
function main(deps = {}) {
  const repoRoot = deps.repoRoot || process.cwd();
  const existsSync = typeof deps.existsSync === 'function' ? deps.existsSync : fs.existsSync;
  const write = typeof deps.write === 'function' ? deps.write : (text) => process.stdout.write(text);
  const packageScripts = loadPackageScripts(repoRoot, deps);
  const result = evaluateGovernanceGates(GOVERNANCE_GATES, {
    packageScripts,
    existsSync: (rel) => existsSync(path.join(repoRoot, rel))
  });
  write(`${renderGovernanceGates(result)}\n`);
  return result.ok ? 0 : 1;
}

module.exports = {
  GOVERNANCE_GATES,
  evaluateGovernanceGates,
  renderGovernanceGates,
  loadPackageScripts,
  main
};

if (require.main === module) {
  process.exit(main());
}
