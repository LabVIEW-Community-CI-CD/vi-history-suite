import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const {
  buildContainerInvocation,
  buildRunAssuranceArgs,
  parseArgs,
  resolveExecutor,
  selectScopePaths
} = require('../../scripts/runAssuranceAudit.js') as {
  buildContainerInvocation: (
    lane: string,
    targetPath: string,
    rawOutputRoot: string,
    env?: Record<string, string>,
    platform?: NodeJS.Platform
  ) => { command: string; args: string[] };
  buildRunAssuranceArgs: (lane: string, targetPath: string, rawOutputRoot: string) => string[];
  parseArgs: (argv: string[]) => {
    lane: string;
    repoRoot: string;
    evidenceRoot: string;
    executor: string;
  };
  resolveExecutor: (explicitExecutor?: string, env?: Record<string, string>) => string;
  selectScopePaths: (scope: string, trackedFiles: string[]) => string[];
};

describe('run assurance audit script', () => {
  it('parses lane arguments and defaults the evidence directory from the lane id', () => {
    const parsed = parseArgs(['--lane', 'release-gate', '--repo-root', '/repo/root']);

    expect(parsed.lane).toBe('release-gate');
    expect(parsed.repoRoot).toBe(path.resolve('/repo/root'));
    expect(parsed.evidenceRoot).toBe(path.join(path.resolve('/repo/root'), 'assurance-release-gate-evidence'));
  });

  it('filters the staged repo scope to tracked non-transient files only', () => {
    const selected = selectScopePaths('repo', [
      'README.md',
      '.gitlab-ci.yml',
      'docs/product/current-state.md',
      '.cache/design-gate/latest.json',
      'coverage/coverage-summary.json',
      'docs-integration-evidence/public/report.json',
      'windows-private-release-evidence/manifest.json',
      'src/extension.ts',
      'tests/unit/packageManifest.test.ts'
    ]);

    expect(selected).toEqual([
      'README.md',
      '.gitlab-ci.yml',
      'docs/product/current-state.md',
      'src/extension.ts',
      'tests/unit/packageManifest.test.ts'
    ]);
  });

  it('filters the authority-doc scope to the governed authority package only', () => {
    const selected = selectScopePaths('authority-docs', [
      'README.md',
      'INSTALL.md',
      'docs/user-guide.md',
      'docs/faq.md',
      'docs/glossary.md',
      'docs/quick-reference.md',
      'docs/documentation-workbench.md',
      'docs/information-item-map.md',
      'docs/information-for-users/faq.md',
      'docs/information-for-users/command-reference.md',
      'docs/requirements/srs.md',
      'docs/testing/test-plan.md',
      'docs/product/current-state.md',
      'docs/release-procedure.md',
      'docs/product/private-release-windows-x64-v1.3.0.md',
      'docs/product/private-release-windows-x64-v1.3.0.json',
      'docs/product/public-release-candidate.md'
    ]);

    expect(selected).toEqual([
      'README.md',
      'INSTALL.md',
      'docs/user-guide.md',
      'docs/faq.md',
      'docs/glossary.md',
      'docs/quick-reference.md',
      'docs/documentation-workbench.md',
      'docs/information-item-map.md',
      'docs/information-for-users/faq.md',
      'docs/information-for-users/command-reference.md',
      'docs/product/current-state.md',
      'docs/release-procedure.md',
      'docs/product/private-release-windows-x64-v1.3.0.md',
      'docs/product/private-release-windows-x64-v1.3.0.json',
      'docs/product/public-release-candidate.md'
    ]);
  });

  it('builds the expected run_assurance argument surface for staged audit lanes', () => {
    expect(buildRunAssuranceArgs('release-gate', '/target', '/output')).toEqual([
      '/target',
      '--profile',
      'release-gate',
      '--output',
      'gate-scorecard',
      '--save-dir',
      '/output'
    ]);
    expect(buildRunAssuranceArgs('26514-authority', '/target', '/output')).toEqual([
      '/target',
      '--profile',
      '26514-review',
      '--output',
      'documentation-proof',
      '--save-dir',
      '/output'
    ]);
    expect(buildRunAssuranceArgs('uplift', '/target', '/output')).toEqual([
      '/target',
      '--profile',
      'compliance-uplift',
      '--output',
      'risk-register',
      '--save-dir',
      '/output',
      '--mode',
      'uplift'
    ]);
  });

  it('builds the expected Linux container invocation for the release gate lane', () => {
    const invocation = buildContainerInvocation(
      'release-gate',
      '/tmp/staged-target',
      '/tmp/raw-output',
      {
        VIHS_ASSURANCE_CONTAINER_RUNTIME: 'docker',
        VIHS_ASSURANCE_IMAGE:
          'registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main'
      },
      'linux'
    );

    expect(invocation.command).toBe('docker');
    expect(invocation.args).toContain('run');
    expect(invocation.args).toContain('/opt/repo-standards-review/scripts/run_assurance.py');
    expect(invocation.args).toContain('--profile');
    expect(invocation.args).toContain('release-gate');
    expect(invocation.args).toContain('/tmp/staged-target:/target:ro');
    expect(invocation.args).toContain('/tmp/raw-output:/output');
  });

  it('resolves the assurance executor from explicit or environment input', () => {
    expect(resolveExecutor('container', {})).toBe('container');
    expect(resolveExecutor('', { VIHS_ASSURANCE_EXECUTOR: 'local-skill' })).toBe('local-skill');
  });
});
