import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const {
  buildContainerInvocation,
  buildLocalSkillInvocation,
  getWindowsPythonExecutableCandidates,
  buildRunAssuranceArgs,
  parseArgs,
  resolveExecutor,
  resolvePythonInvocation,
  selectScopePaths
} = require('../../scripts/runAssuranceAudit.js') as {
  buildContainerInvocation: (
    lane: string,
    targetPath: string,
    rawOutputRoot: string,
    env?: Record<string, string>,
    platform?: NodeJS.Platform
  ) => { command: string; args: string[] };
  buildLocalSkillInvocation: (
    lane: string,
    targetPath: string,
    rawOutputRoot: string,
    env?: Record<string, string>,
    platform?: NodeJS.Platform,
    existsSyncImpl?: (candidate: string) => boolean
  ) => { command: string; args: string[] };
  buildRunAssuranceArgs: (lane: string, targetPath: string, rawOutputRoot: string) => string[];
  getWindowsPythonExecutableCandidates: (env?: Record<string, string>) => string[];
  parseArgs: (argv: string[]) => {
    lane: string;
    repoRoot: string;
    evidenceRoot: string;
    executor: string;
  };
  resolveExecutor: (explicitExecutor?: string, env?: Record<string, string>) => string;
  resolvePythonInvocation: (
    env?: Record<string, string>,
    platform?: NodeJS.Platform,
    existsSyncImpl?: (candidate: string) => boolean
  ) => { command: string; args: string[] };
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
      'windows-installed-user-host-evidence/manifest.json',
      'windows-installed-user-release-claim-evidence/assertion.json',
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
        VIHS_ASSURANCE_CONTAINER_USER: '1000:1000',
        VIHS_ASSURANCE_IMAGE:
          'registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main'
      },
      'linux'
    );

    expect(invocation.command).toBe('docker');
    expect(invocation.args).toContain('run');
    expect(invocation.args).toContain('--user');
    expect(invocation.args).toContain('1000:1000');
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

  it('prefers explicit and deterministic Windows Python toolchains before falling back to py -3', () => {
    const windowsEnv = {
      LocalAppData: 'C:\\Users\\tester\\AppData\\Local'
    };

    expect(getWindowsPythonExecutableCandidates(windowsEnv).slice(0, 5)).toEqual([
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python39\\python.exe'
    ]);
    expect(
      resolvePythonInvocation({
        VIHS_ASSURANCE_PYTHON: 'D:\\tools\\python\\python.exe'
      }, 'win32')
    ).toEqual({
      command: 'D:\\tools\\python\\python.exe',
      args: []
    });
    expect(
      resolvePythonInvocation(
        windowsEnv,
        'win32',
        (candidate) =>
          candidate === 'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
      )
    ).toEqual({
      command: 'C:\\Users\\tester\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      args: []
    });
    expect(resolvePythonInvocation(windowsEnv, 'win32', () => false)).toEqual({
      command: 'py',
      args: ['-3']
    });
  });

  it('falls back to the admitted WSL Python assurance surface when Windows Python is unavailable', () => {
    const invocation = buildLocalSkillInvocation(
      'release-gate',
      'C:\\repo\\staged-target',
      'C:\\repo\\raw-output',
      {
        SystemRoot: 'C:\\Windows',
        VIHS_LINUX_ASSURANCE_DISTRO: 'Ubuntu-24.04',
        VIHS_ASSURANCE_SKILL_ROOT: 'C:\\skills\\repo-standards-review'
      },
      'win32',
      (candidate) =>
        candidate === 'C:\\Windows\\System32\\wsl.exe' ||
        candidate === 'C:\\skills\\repo-standards-review\\scripts\\run_assurance.py'
    );

    expect(invocation).toEqual({
      command: 'C:\\Windows\\System32\\wsl.exe',
      args: [
        '-d',
        'Ubuntu-24.04',
        '--exec',
        'python3',
        '/mnt/c/skills/repo-standards-review/scripts/run_assurance.py',
        '/mnt/c/repo/staged-target',
        '--profile',
        'release-gate',
        '--output',
        'gate-scorecard',
        '--save-dir',
        '/mnt/c/repo/raw-output'
      ]
    });
  });
});
