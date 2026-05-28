import { describe, expect, it, vi } from 'vitest';

const {
  DEFAULT_STANDARDS_IMAGE,
  LOCAL_STANDARDS_IMAGE,
  STANDARDS_TOOLCHAIN_EXPECTED_COMMIT,
  STANDARDS_TOOLCHAIN_GITHUB_TAG,
  STANDARDS_TOOLCHAIN_GITHUB_URL,
  STANDARDS_TOOLCHAIN_GITLAB_URL,
  STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
  generateCloseoutEvidence,
  parseArgs,
  parseLsRemote,
  runDockerStandards,
  verifyStandardsToolchainProvenance
} = require('../../scripts/generateCloseoutEvidence.js') as {
  DEFAULT_STANDARDS_IMAGE: string;
  LOCAL_STANDARDS_IMAGE: string;
  STANDARDS_TOOLCHAIN_EXPECTED_COMMIT: string;
  STANDARDS_TOOLCHAIN_GITHUB_TAG: string;
  STANDARDS_TOOLCHAIN_GITHUB_URL: string;
  STANDARDS_TOOLCHAIN_GITLAB_URL: string;
  STANDARDS_TOOLCHAIN_REGISTRY_IMAGE: string;
  parseArgs: (argv: string[]) => {
    kind: string;
    issue?: string;
    standardsRunner: string;
    standardsImage: string;
    runGates: boolean;
  };
  parseLsRemote: (stdout: string) => Array<{ commit: string; ref: string }>;
  runDockerStandards: (
    options: { standardsImage: string; skillRoot: string; buildStandardsImage?: boolean },
    deps: {
      cwd?: string;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
    }
  ) => { runner: string; image?: string; imageAccess?: string; success: boolean; failure?: string };
  verifyStandardsToolchainProvenance: (
    options: { skillRoot: string },
    deps: {
      existsSync?: (targetPath: string) => boolean;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
    }
  ) => { success: boolean; failure?: string; registry: { image: string; success: boolean } };
  generateCloseoutEvidence: (
    argv: string[],
    deps: {
      cwd?: string;
      existsSync?: (targetPath: string) => boolean;
      platform?: string;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
    }
  ) => {
    exitCode: number;
    markdown: string;
    context: {
      standards: { runner: string; success: boolean; failure?: string };
      provenance: { success: boolean; failure?: string };
      gates?: Array<{ name: string; success: boolean }>;
    };
  };
};

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const preflightOk = json({ ok: true, checks: [{ name: 'python3', ok: true }] });
const requirementsOk = json({ ok: true, findings: [] });
const evidenceOk = json({
  inventory: { file_count: 251 },
  areas: {
    REQ: { signal: 'strong' },
    TEST: { signal: 'strong' }
  }
});
const scorecardOk = [
  'Gate Scorecard',
  '| Gate | Status | Confidence | Missing Proof |',
  '| --- | --- | --- | --- |',
  '| coverage | PASS | High | - |',
  '| cm | PASS | High | - |',
  '| req | PASS | High | - |',
  '| arch | PASS | High | - |',
  '| doc | FAIL | High | A docs link-check such as lychee |',
  '| dod | N/A | Low | DoD Gate / dod |'
].join('\n');

function gitlabRemoteOk(): string {
  return [
    `${STANDARDS_TOOLCHAIN_EXPECTED_COMMIT}\tHEAD`,
    `${STANDARDS_TOOLCHAIN_EXPECTED_COMMIT}\trefs/heads/main`
  ].join('\n');
}

function githubRemoteOk(): string {
  return [
    `${STANDARDS_TOOLCHAIN_EXPECTED_COMMIT}\tHEAD`,
    `${STANDARDS_TOOLCHAIN_EXPECTED_COMMIT}\trefs/heads/main`,
    `${STANDARDS_TOOLCHAIN_EXPECTED_COMMIT}\trefs/tags/${STANDARDS_TOOLCHAIN_GITHUB_TAG}`
  ].join('\n');
}

function hostSuccessSpawnSync() {
  return vi.fn((command: string, args: string[]) => {
    const line = [command, ...args].join(' ');
    if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
      return { status: 0, stdout: gitlabRemoteOk() };
    }
    if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
      return { status: 0, stdout: githubRemoteOk() };
    }
    if (command === 'git' && args.includes('--show-current')) return { status: 0, stdout: 'feature/test\n' };
    if (command === 'git' && args.includes('--short=8')) return { status: 0, stdout: '12345678\n' };
    if (command === 'git' && args.includes('HEAD')) return { status: 0, stdout: '1234567890abcdef\n' };
    if (command === 'gh') return { status: 1, stderr: 'not authenticated' };
    if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
      return { status: 0, stdout: json({ schemaVersion: 2 }) };
    }
    if (command === 'npm.cmd' && args.join(' ') === 'run traceability:audit') {
      return {
        status: 0,
        stdout:
          '[traceability-audit] Total inventory entries: 156\n[traceability-audit] Gap entries pending classification: 0\n'
      };
    }
    if (command === 'npm.cmd') return { status: 0, stdout: `${args.join(' ')} ok\n` };
    if (line.includes('preflight_local_dependencies.py')) return { status: 0, stdout: preflightOk };
    if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
    if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceOk };
    if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardOk };
    return { status: 0, stdout: '' };
  });
}

describe('closeout evidence script', () => {
  it('parses ls-remote output for provenance checks', () => {
    expect(parseLsRemote(`${STANDARDS_TOOLCHAIN_EXPECTED_COMMIT}\trefs/heads/main\n`)).toEqual([
      { commit: STANDARDS_TOOLCHAIN_EXPECTED_COMMIT, ref: 'refs/heads/main' }
    ]);
  });

  it('verifies standards toolchain provenance as machine-readable evidence', () => {
    const provenance = verifyStandardsToolchainProvenance(
      { skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review' },
      {
        existsSync: () => true,
        spawnSync: hostSuccessSpawnSync()
      }
    );

    expect(provenance.success).toBe(true);
    expect(provenance.registry).toMatchObject({
      image: STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
      success: true
    });
  });

  it('fails provenance when the published Docker registry image is inaccessible', () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
        return { status: 0, stdout: gitlabRemoteOk() };
      }
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
        return { status: 0, stdout: githubRemoteOk() };
      }
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        return { status: 1, stderr: 'denied: access forbidden' };
      }
      return { status: 0, stdout: '' };
    });

    const provenance = verifyStandardsToolchainProvenance(
      { skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review' },
      {
        existsSync: () => true,
        spawnSync
      }
    );

    expect(provenance.success).toBe(false);
    expect(provenance.failure).toContain('docker login registry.gitlab.com');
  });

  it('parses standards closeout options', () => {
    expect(parseArgs(['--kind', 'standards', '--issue', '130', '--run-gates'])).toMatchObject({
      kind: 'standards',
      issue: '130',
      standardsRunner: 'auto',
      standardsImage: STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
      runGates: true
    });
  });

  it('pulls the published Docker standards image when it is not present locally', () => {
    let inspectCalls = 0;
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'docker' && args.join(' ') === `image inspect ${DEFAULT_STANDARDS_IMAGE}`) {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          return { status: 1, stderr: 'missing' };
        }
        return { status: 0, stdout: '[]' };
      }
      if (command === 'docker' && args.join(' ') === `pull ${DEFAULT_STANDARDS_IMAGE}`) {
        return { status: 0, stdout: 'pulled' };
      }
      const line = [command, ...args].join(' ');
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceOk };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardOk };
      return { status: 0, stdout: '' };
    });

    const result = runDockerStandards(
      {
        standardsImage: DEFAULT_STANDARDS_IMAGE,
        skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review'
      },
      { cwd: 'C:\\repo', spawnSync }
    );

    expect(result.success).toBe(true);
    expect(result.image).toBe(DEFAULT_STANDARDS_IMAGE);
    expect(result.imageAccess).toBe('pulled');
    expect(spawnSync).toHaveBeenCalledWith(
      'docker',
      ['pull', DEFAULT_STANDARDS_IMAGE],
      expect.objectContaining({ encoding: 'utf8', shell: false })
    );
  });

  it('fails Docker standards with registry login guidance when the published image cannot be pulled', () => {
    const result = runDockerStandards(
      {
        standardsImage: DEFAULT_STANDARDS_IMAGE,
        skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review'
      },
      {
        spawnSync: vi.fn((command: string, args: string[]) => {
          if (command === 'docker' && args.join(' ') === `image inspect ${DEFAULT_STANDARDS_IMAGE}`) {
            return { status: 1, stderr: 'missing' };
          }
          if (command === 'docker' && args.join(' ') === `pull ${DEFAULT_STANDARDS_IMAGE}`) {
            return { status: 1, stderr: 'denied' };
          }
          return { status: 0, stdout: '' };
        })
      }
    );

    expect(result.success).toBe(false);
    expect(result.imageAccess).toBe('pull-failed');
    expect(result.failure).toContain('docker login registry.gitlab.com');
  });

  it('keeps local Docker image usage behind an explicit standards image override', () => {
    const result = runDockerStandards(
      {
        standardsImage: LOCAL_STANDARDS_IMAGE,
        skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review'
      },
      {
        spawnSync: vi.fn((command: string, args: string[]) => {
          if (command === 'docker' && args.join(' ') === `image inspect ${LOCAL_STANDARDS_IMAGE}`) {
            return { status: 1, stderr: 'missing local image' };
          }
          return { status: 0, stdout: '' };
        })
      }
    );

    expect(result.success).toBe(false);
    expect(result.failure).toContain('explicit local override');
    expect(result.failure).toContain('docker build');
  });

  it('renders a closable standards summary when mandatory standards and gates pass', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '130', '--run-gates'],
      {
        platform: 'win32',
        cwd: 'C:\\repo',
        existsSync: () => true,
        spawnSync: hostSuccessSpawnSync()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.context.standards.runner).toBe('host');
    expect(result.markdown).toContain('Closeout Evidence: #130');
    expect(result.markdown).toContain('GitHub issue: unavailable; supply manually if needed');
    expect(result.markdown).toContain('| traceability summary | INFO | 156 inventory entries; 0 gaps |');
    expect(result.markdown).toContain('Standards runner: host');
    expect(result.markdown).toContain('## Standards Toolchain Provenance');
    expect(result.markdown).toContain('| GitLab source main | PASS |');
    expect(result.markdown).toContain('non-authoritative-cache');
    expect(result.markdown).toContain('Evidence scan: 251 files; REQ=strong; TEST=strong');
    expect(result.markdown).toContain('Closable: yes');
    expect(result.markdown).toContain('| docs:links | PASS | npm.cmd run docs:links |');
    expect(result.markdown).toContain('Definition-of-Done');
    expect(result.markdown).not.toContain('Defer docs link-check/lychee automation');
  });

  it('marks the summary not closable when local gates are not run', () => {
    const result = generateCloseoutEvidence(['--kind', 'standards', '--issue', '130'], {
      platform: 'win32',
      cwd: 'C:\\repo',
      existsSync: () => true,
      spawnSync: hostSuccessSpawnSync()
    });

    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain('NOT RUN');
    expect(result.markdown).toContain('Not closable yet');
  });

  it('falls back to Docker standards evidence when host preflight fails', () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      if (command === 'git' && args.includes('--show-current')) return { status: 0, stdout: 'feature/test\n' };
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
        return { status: 0, stdout: gitlabRemoteOk() };
      }
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
        return { status: 0, stdout: githubRemoteOk() };
      }
      if (command === 'git') return { status: 0, stdout: '1234567890abcdef\n' };
      if (command === 'gh') return { status: 1, stderr: 'gh unavailable' };
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        return { status: 0, stdout: json({ schemaVersion: 2 }) };
      }
      if (line.includes('preflight_local_dependencies.py')) return { status: 1, stderr: 'python3 missing' };
      if (command === 'docker' && args.join(' ').startsWith('image inspect')) return { status: 0, stdout: '[]' };
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceOk };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardOk };
      return { status: 0, stdout: '' };
    });

    const result = generateCloseoutEvidence(['--kind', 'standards', '--issue', '130'], {
      cwd: 'C:\\repo',
      existsSync: () => true,
      spawnSync
    });

    expect(result.exitCode).toBe(0);
    expect(result.context.standards.runner).toBe('docker');
    expect(result.markdown).toContain('Standards runner: docker');
    expect(result.markdown).toContain(`Docker image: ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}; image access=present`);
  });

  it('fails closeout when mandatory host and Docker standards evidence fail', () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      if (command === 'git') return { status: 0, stdout: '1234567890abcdef\n' };
      if (command === 'gh') return { status: 1, stderr: 'gh unavailable' };
      if (line.includes('preflight_local_dependencies.py')) return { status: 1, stderr: 'python3 missing' };
      if (command === 'docker' && args.join(' ').startsWith('image inspect')) {
        return { status: 1, stderr: 'image missing' };
      }
      return { status: 1, stderr: 'unexpected command' };
    });

    const result = generateCloseoutEvidence(['--kind', 'standards', '--issue', '130'], {
      cwd: 'C:\\repo',
      existsSync: () => false,
      spawnSync
    });

    expect(result.exitCode).toBe(1);
    expect(result.markdown).toContain('Standards evidence failed');
    expect(result.context.standards.success).toBe(false);
  });

  it('renders release references in release mode', () => {
    const result = generateCloseoutEvidence(
      [
        '--kind',
        'release',
        '--issue',
        '130',
        '--release-tag',
        'v1.4.2',
        '--release-pr',
        '126',
        '--back-sync-pr',
        '127',
        '--marketplace-run',
        'https://example.invalid/run'
      ],
      {
        platform: 'win32',
        cwd: 'C:\\repo',
        existsSync: () => true,
        spawnSync: hostSuccessSpawnSync()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain('## Release References');
    expect(result.markdown).toContain('Release tag: v1.4.2');
    expect(result.markdown).toContain('Marketplace workflow run: https://example.invalid/run');
  });
});
