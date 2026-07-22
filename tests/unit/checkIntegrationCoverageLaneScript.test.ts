import { describe, expect, it } from 'vitest';

// VHS-REQ-690 (dev-only sweep, epic #2159): self-hosted integration-coverage lane
// security-contract gate. Deterministic unit tests of the pure evaluator against
// synthetic workflow text, plus a real-repo assertion that the shipped lane
// passes its own contract.

const {
  LANE_WORKFLOW_PATH,
  SELF_HOSTED_LABEL,
  evaluateIntegrationCoverageLane,
  renderIntegrationCoverageLane,
  loadLaneWorkflow
} = require('../../scripts/checkIntegrationCoverageLane.js') as {
  LANE_WORKFLOW_PATH: string;
  SELF_HOSTED_LABEL: string;
  evaluateIntegrationCoverageLane: (
    workflow: unknown,
    options?: { selfHostedLabel?: string }
  ) => { ok: boolean; problems: Array<{ reason: string; detail: string }> };
  renderIntegrationCoverageLane: (result: unknown) => string;
  loadLaneWorkflow: (repoRoot: string, deps?: Record<string, unknown>) => string;
};

const path = require('node:path') as typeof import('node:path');
const fs = require('node:fs') as typeof import('node:fs');

const COMPLIANT = [
  'on:',
  '  workflow_dispatch:',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  integration-coverage:',
  `    runs-on: [self-hosted, Linux, X64, ${SELF_HOSTED_LABEL}]`,
  '    steps:',
  '      - name: Guard Trusted Ref',
  '        run: echo trusted'
].join('\n');

describe('checkIntegrationCoverageLane: evaluate (VHS-REQ-690.1)', () => {
  it('passes a compliant lane', () => {
    expect(evaluateIntegrationCoverageLane(COMPLIANT)).toEqual({ ok: true, problems: [] });
  });

  it('fails closed on a missing workflow', () => {
    expect(evaluateIntegrationCoverageLane('').problems).toContainEqual({
      reason: 'workflow-missing',
      detail: LANE_WORKFLOW_PATH
    });
  });

  it('fails closed on a forbidden push/pull_request/schedule trigger', () => {
    const withPush = COMPLIANT.replace('  workflow_dispatch:', '  workflow_dispatch:\n  push:\n    branches: [develop]');
    const problems = evaluateIntegrationCoverageLane(withPush).problems;
    expect(problems).toContainEqual({ reason: 'forbidden-trigger', detail: 'push' });
  });

  it('fails closed on a write permission scope', () => {
    const withWrite = COMPLIANT.replace('  contents: read', '  contents: read\n  issues: write');
    expect(evaluateIntegrationCoverageLane(withWrite).problems).toContainEqual({
      reason: 'write-permission',
      detail: 'lane token must be read-only'
    });
  });

  it('fails closed when permissions are unset', () => {
    const noPerms = COMPLIANT.replace('permissions:\n  contents: read\n', '');
    expect(evaluateIntegrationCoverageLane(noPerms).problems.some((p) => p.reason === 'permissions-unset')).toBe(true);
  });

  it('fails closed when it does not run on the self-hosted runner', () => {
    const hosted = COMPLIANT.replace(`    runs-on: [self-hosted, Linux, X64, ${SELF_HOSTED_LABEL}]`, '    runs-on: ubuntu-24.04');
    const reasons = evaluateIntegrationCoverageLane(hosted).problems.map((p) => p.reason);
    expect(reasons).toContain('not-self-hosted');
  });

  it('fails closed when the trusted-ref guard is missing', () => {
    const noGuard = COMPLIANT.replace('      - name: Guard Trusted Ref\n        run: echo trusted', '      - name: Checkout');
    expect(evaluateIntegrationCoverageLane(noGuard).problems).toContainEqual({
      reason: 'no-trusted-ref-guard',
      detail: 'missing trusted-ref guard step'
    });
  });
});

describe('checkIntegrationCoverageLane: render (VHS-REQ-690.1)', () => {
  it('renders OK when clean', () => {
    expect(renderIntegrationCoverageLane({ ok: true, problems: [] })).toContain('OK:');
  });

  it('lists problems when failing', () => {
    const out = renderIntegrationCoverageLane({ ok: false, problems: [{ reason: 'write-permission', detail: 'x' }] });
    expect(out).toContain('FAIL: 1');
    expect(out).toContain('write-permission (x)');
  });
});

describe('checkIntegrationCoverageLane: real repo lane (VHS-REQ-690.2)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');

  it('the shipped integration-coverage lane satisfies its own security contract', () => {
    const workflow = loadLaneWorkflow(repoRoot, { readFileSync: fs.readFileSync });
    const result = evaluateIntegrationCoverageLane(workflow);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('bootstraps the VS Code host (installs Xvfb) before running the integration host', () => {
    const workflow = loadLaneWorkflow(repoRoot, { readFileSync: fs.readFileSync }).replace(/\r\n/g, '\n');
    // The extension host is headless-hostile without a display; the bootstrap
    // step (a coverage-excluded host-runner script) installs Xvfb first.
    expect(workflow).toContain('public:host:bootstrap-linux install');
    const bootstrapIndex = workflow.indexOf('Bootstrap Linux VS Code host');
    const runIndex = workflow.indexOf('Run Linux integration host');
    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(runIndex).toBeGreaterThan(bootstrapIndex);
  });
});

describe('checkIntegrationCoverageLane: default factories and edge branches (VHS-REQ-690.3)', () => {
  it('flags a lane that lacks the workflow_dispatch trigger', () => {
    const noDispatch = COMPLIANT.replace('  workflow_dispatch:', '  workflow_call:');
    expect(evaluateIntegrationCoverageLane(noDispatch).problems).toContainEqual({
      reason: 'not-dispatch-only',
      detail: 'missing workflow_dispatch trigger'
    });
  });

  it('treats a non-string workflow as a missing workflow', () => {
    const result = evaluateIntegrationCoverageLane(undefined);
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual({ reason: 'workflow-missing', detail: LANE_WORKFLOW_PATH });
  });

  it('honors a custom self-hosted runner label supplied via options', () => {
    const customLabel = 'custom-maintainer-runner';
    const withCustom = COMPLIANT.replace(SELF_HOSTED_LABEL, customLabel);
    expect(evaluateIntegrationCoverageLane(withCustom, { selfHostedLabel: customLabel })).toEqual({
      ok: true,
      problems: []
    });
    // With the default label absent the default-label evaluation flags it.
    expect(
      evaluateIntegrationCoverageLane(withCustom).problems.some((p) => p.reason === 'not-self-hosted')
    ).toBe(true);
  });

  it('renders OK when the result carries no problems array', () => {
    expect(renderIntegrationCoverageLane(null)).toContain('OK:');
    expect(renderIntegrationCoverageLane({})).toContain('OK:');
  });

  it('loadLaneWorkflow returns an empty string when the read throws', () => {
    const workflow = loadLaneWorkflow('/repo', {
      readFileSync: () => {
        throw new Error('boom');
      }
    });
    expect(workflow).toBe('');
  });

  it('loadLaneWorkflow uses the real fs by default against the shipped lane', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    // No deps -> the default fs.readFileSync reads the committed lane workflow.
    expect(loadLaneWorkflow(repoRoot)).toContain('workflow_dispatch');
  });

  it('loadLaneWorkflow falls back to process.cwd() when no repoRoot is given', () => {
    const seen: string[] = [];
    const workflow = loadLaneWorkflow(undefined, {
      readFileSync: (target: string) => {
        seen.push(String(target));
        return 'stub-workflow';
      }
    });
    expect(workflow).toBe('stub-workflow');
    // The resolved path is anchored under the process cwd, not "undefined".
    expect(seen[0].replace(/\\/g, '/')).toContain('.github/workflows/integration-coverage.yml');
  });
});
