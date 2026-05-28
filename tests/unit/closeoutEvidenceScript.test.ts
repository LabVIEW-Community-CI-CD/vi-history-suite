import { describe, expect, it, vi } from 'vitest';

const {
  generateCloseoutEvidence,
  parseArgs
} = require('../../scripts/generateCloseoutEvidence.js') as {
  parseArgs: (argv: string[]) => {
    kind: string;
    issue?: string;
    standardsRunner: string;
    runGates: boolean;
  };
  generateCloseoutEvidence: (
    argv: string[],
    deps: {
      cwd?: string;
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

function hostSuccessSpawnSync() {
  return vi.fn((command: string, args: string[]) => {
    const line = [command, ...args].join(' ');
    if (command === 'git' && args.includes('--show-current')) return { status: 0, stdout: 'feature/test\n' };
    if (command === 'git' && args.includes('--short=8')) return { status: 0, stdout: '12345678\n' };
    if (command === 'git' && args.includes('HEAD')) return { status: 0, stdout: '1234567890abcdef\n' };
    if (command === 'gh') return { status: 1, stderr: 'not authenticated' };
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
  it('parses standards closeout options', () => {
    expect(parseArgs(['--kind', 'standards', '--issue', '130', '--run-gates'])).toMatchObject({
      kind: 'standards',
      issue: '130',
      standardsRunner: 'auto',
      runGates: true
    });
  });

  it('renders a closable standards summary when mandatory standards and gates pass', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '130', '--run-gates'],
      {
        platform: 'win32',
        cwd: 'C:\\repo',
        spawnSync: hostSuccessSpawnSync()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.context.standards.runner).toBe('host');
    expect(result.markdown).toContain('Closeout Evidence: #130');
    expect(result.markdown).toContain('GitHub issue: unavailable; supply manually if needed');
    expect(result.markdown).toContain('| traceability summary | INFO | 156 inventory entries; 0 gaps |');
    expect(result.markdown).toContain('Standards runner: host');
    expect(result.markdown).toContain('Evidence scan: 251 files; REQ=strong; TEST=strong');
    expect(result.markdown).toContain('Closable: yes');
    expect(result.markdown).toContain('docs link-check/lychee');
    expect(result.markdown).toContain('Definition-of-Done');
  });

  it('marks the summary not closable when local gates are not run', () => {
    const result = generateCloseoutEvidence(['--kind', 'standards', '--issue', '130'], {
      platform: 'win32',
      cwd: 'C:\\repo',
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
      if (command === 'git') return { status: 0, stdout: '1234567890abcdef\n' };
      if (command === 'gh') return { status: 1, stderr: 'gh unavailable' };
      if (line.includes('preflight_local_dependencies.py')) return { status: 1, stderr: 'python3 missing' };
      if (command === 'docker' && args.join(' ').startsWith('image inspect')) return { status: 0, stdout: '[]' };
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceOk };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardOk };
      return { status: 0, stdout: '' };
    });

    const result = generateCloseoutEvidence(['--kind', 'standards', '--issue', '130'], {
      cwd: 'C:\\repo',
      spawnSync
    });

    expect(result.exitCode).toBe(0);
    expect(result.context.standards.runner).toBe('docker');
    expect(result.markdown).toContain('Standards runner: docker');
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
        spawnSync: hostSuccessSpawnSync()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain('## Release References');
    expect(result.markdown).toContain('Release tag: v1.4.2');
    expect(result.markdown).toContain('Marketplace workflow run: https://example.invalid/run');
  });
});
