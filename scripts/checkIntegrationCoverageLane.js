#!/usr/bin/env node

'use strict';

// VHS-REQ-690 (dev-only sweep, epic #2159): self-hosted integration-coverage
// lane — security-contract integrity gate.
//
// The integration-coverage lane runs the host-runner scripts (which need a real
// VS Code host / integration host and so are excluded from unit coverage) on a
// self-hosted runner to produce coverage evidence. Because it runs on a
// self-hosted machine, its security posture is load-bearing: it must stay
// dispatch-only (no untrusted-PR code ever executes on the box), least-privilege
// read-only, trusted-ref-gated, and advisory (never a required merge gate).
//
// This gate parses the lane workflow and FAILS CLOSED when that committed
// security contract drifts — a push/PR/schedule trigger, a write token scope, a
// missing trusted-ref guard, or a non-self-hosted runner. The evaluation is pure
// and injectable so it is unit-tested against synthetic workflow text with no
// real GitHub or runner.

const fs = require('node:fs');
const path = require('node:path');

const LANE_WORKFLOW_PATH = '.github/workflows/integration-coverage.yml';
const SELF_HOSTED_LABEL = 'vihs-linux-labview-maintainer';

// Pure: evaluate the lane workflow text against the ratified security contract.
// Returns { ok, problems: [{ reason, detail }] }.
function evaluateIntegrationCoverageLane(workflow, options = {}) {
  const text = typeof workflow === 'string' ? workflow.replace(/\r\n/g, '\n') : '';
  const label = options.selfHostedLabel || SELF_HOSTED_LABEL;
  const problems = [];

  if (text.trim().length === 0) {
    return { ok: false, problems: [{ reason: 'workflow-missing', detail: LANE_WORKFLOW_PATH }] };
  }

  // Dispatch-only: workflow_dispatch present; no push / pull_request* / schedule.
  if (!/workflow_dispatch\s*:/.test(text)) {
    problems.push({ reason: 'not-dispatch-only', detail: 'missing workflow_dispatch trigger' });
  }
  for (const forbidden of ['push', 'pull_request', 'pull_request_target', 'schedule']) {
    // A trigger key at the top-level `on:` block appears as `  <key>:` at 2-space indent.
    const re = new RegExp(`^\\s{2}${forbidden}\\s*:`, 'm');
    if (re.test(text)) {
      problems.push({ reason: 'forbidden-trigger', detail: forbidden });
    }
  }

  // Least-privilege read-only token: no write scopes anywhere.
  if (/permissions:/.test(text)) {
    if (/:\s*write\b/.test(text)) {
      problems.push({ reason: 'write-permission', detail: 'lane token must be read-only' });
    }
  } else {
    problems.push({ reason: 'permissions-unset', detail: 'declare explicit least-privilege permissions' });
  }

  // Runs on the self-hosted runner label.
  if (!text.includes(label)) {
    problems.push({ reason: 'not-self-hosted', detail: `missing runner label ${label}` });
  }
  if (!/self-hosted/.test(text)) {
    problems.push({ reason: 'not-self-hosted', detail: 'missing self-hosted runs-on label' });
  }

  // Trusted-ref guard: the lane must gate execution on a trusted ref.
  if (!/[Tt]rusted [Rr]ef/.test(text)) {
    problems.push({ reason: 'no-trusted-ref-guard', detail: 'missing trusted-ref guard step' });
  }

  return { ok: problems.length === 0, problems };
}

function renderIntegrationCoverageLane(result) {
  const problems = (result && Array.isArray(result.problems)) ? result.problems : [];
  if (problems.length === 0) {
    return '[integration-coverage-lane] OK: the self-hosted lane matches its ratified security contract.';
  }
  const lines = [`[integration-coverage-lane] FAIL: ${problems.length} security-contract problem(s):`];
  for (const p of problems) {
    lines.push(`  - ${p.reason} (${p.detail})`);
  }
  return lines.join('\n');
}

function loadLaneWorkflow(repoRoot, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  try {
    return readFileSync(path.join(repoRoot || process.cwd(), LANE_WORKFLOW_PATH), 'utf8');
  } catch {
    return '';
  }
}

module.exports = {
  LANE_WORKFLOW_PATH,
  SELF_HOSTED_LABEL,
  evaluateIntegrationCoverageLane,
  renderIntegrationCoverageLane,
  loadLaneWorkflow
};

if (require.main === module) {
  const workflow = loadLaneWorkflow(process.cwd());
  const result = evaluateIntegrationCoverageLane(workflow);
  process.stdout.write(`${renderIntegrationCoverageLane(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
