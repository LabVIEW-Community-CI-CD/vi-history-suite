import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  ALLOWED_EXECUTABLE_COMMANDS,
  DEFAULT_STANDARDS_IMAGE,
  GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT,
  LOCAL_STANDARDS_IMAGE,
  STANDARDS_TOOLCHAIN_EXPECTED_COMMIT,
  STANDARDS_TOOLCHAIN_GITHUB_TAG,
  STANDARDS_TOOLCHAIN_GITHUB_URL,
  STANDARDS_TOOLCHAIN_GITLAB_URL,
  STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
  classifyDockerRegistryFailure,
  createTrackedWorktreeSnapshot,
  isAllowedExecutableCommand,
  assertAllowedExecutableCommand,
  isTransientNetworkFailure,
  generateCloseoutEvidence,
  parseGateScorecard,
  parseArgs,
  parseGitTrackedFiles,
  parseLsRemote,
  runCommand,
  runDockerStandards,
  summarizeDodGateEvidence,
  verifyStandardsToolchainProvenance
} = require('../../scripts/generateCloseoutEvidence.js') as {
  ALLOWED_EXECUTABLE_COMMANDS: string[];
  DEFAULT_STANDARDS_IMAGE: string;
  GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT: string[];
  LOCAL_STANDARDS_IMAGE: string;
  STANDARDS_TOOLCHAIN_EXPECTED_COMMIT: string;
  STANDARDS_TOOLCHAIN_GITHUB_TAG: string;
  STANDARDS_TOOLCHAIN_GITHUB_URL: string;
  STANDARDS_TOOLCHAIN_GITLAB_URL: string;
  STANDARDS_TOOLCHAIN_REGISTRY_IMAGE: string;
  classifyDockerRegistryFailure: (
    commandResult: { status: number; stderr?: string; error?: string; command?: string; timedOut?: boolean },
    image: string,
    commandDescription: string
  ) => { category: string; message: string };
  createTrackedWorktreeSnapshot: (
    repoRoot: string,
    deps?: {
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean; timeout?: number }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
      tmpdir?: () => string;
    }
  ) => {
    mode: string;
    path: string;
    trackedFileCount: number;
    symlinkFiles: string[];
    missingFiles: string[];
    generatedRootsExcluded: string[];
  };
  isAllowedExecutableCommand: (command: string) => boolean;
  assertAllowedExecutableCommand: (command: string) => void;
  isTransientNetworkFailure: (commandResult: {
    stderr?: string;
    error?: string;
    timedOut?: boolean;
  }) => boolean;
  parseGateScorecard: (scorecard: string) => Record<string, string>;
  parseGitTrackedFiles: (stdout: string) => string[];
  parseArgs: (argv: string[]) => {
    kind: string;
    issue?: string;
    standardsRunner: string;
    standardsImage: string;
    runGates: boolean;
  };
  parseLsRemote: (stdout: string) => Array<{ commit: string; ref: string }>;
  summarizeDodGateEvidence: (
    evidenceScan: Record<string, unknown> | undefined,
    scorecard: string
  ) => {
    status: 'PASS' | 'N/A' | 'FAIL';
    scorecardStatus: 'PASS' | 'N/A' | 'FAIL';
    source: string;
    trustedSources: Array<{ path: string; classification: string }>;
    disqualifiedSources: Array<{ path: string; classification: string }>;
  };
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
  ) => {
    runner: string;
    image?: string;
    imageAccess?: string;
    success: boolean;
    failure?: string;
    failureCategory?: string;
  };
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
  ) => {
    success: boolean;
    failure?: string;
    checks: Array<{ name: string; attempts?: number; maxAttempts?: number }>;
    registry: {
      image: string;
      success: boolean;
      failureCategory?: string;
      timedOut?: boolean;
      attempts?: number;
      maxAttempts?: number;
    };
  };
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
      standards: {
        runner: string;
        success: boolean;
        failure?: string;
        summary?: {
          dodGate?: string;
          dodGateEvidence?: {
            status: 'PASS' | 'N/A' | 'FAIL';
            source: string;
            trustedSources: Array<{ path: string; classification: string }>;
            disqualifiedSources: Array<{ path: string; classification: string }>;
          };
        };
      };
      provenance: { success: boolean; failure?: string };
      gates?: Array<{ name: string; success: boolean }>;
      closureDecision?: { closable: boolean; reasons: string[] };
      machineReadableSummary?: {
        schemaVersion: number;
        localGates: {
          ran: boolean;
          passed: boolean;
          results: Array<{ name: string; status: string; command: string }>;
        };
        standards: {
          success: boolean;
          auditTarget?: {
            mode: string;
            trackedFileCount: number;
            generatedRootsExcluded: string[];
          };
        };
        provenance: { success: boolean };
        closureDecision: { closable: boolean; reasons: string[] };
        exitCode: number;
      };
    };
  };
  runCommand: (
    command: string,
    args: string[],
    deps?: {
      cwd?: string;
      platform?: string;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean; timeout?: number }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
    }
  ) => {
    command: string;
    status: number;
    stdout: string;
    stderr: string;
    error: string;
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
const scorecardDodPass = [
  'Gate Scorecard',
  '| Gate | Status | Confidence | Missing Proof |',
  '| --- | --- | --- | --- |',
  '| coverage | PASS | High | - |',
  '| doc | PASS | High | - |',
  '| dod | PASS | Med | - |'
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
    if (command === 'git' && args.join(' ') === 'ls-files -z') {
      return { status: 0, stdout: 'package.json\0scripts/generateCloseoutEvidence.js\0' };
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

  it('parses nul-delimited tracked files for audit snapshots', () => {
    expect(parseGitTrackedFiles('package.json\0docs/requirements/srs.md\0 leading-space.md\0trailing-space.md \0')).toEqual([
      'package.json',
      'docs/requirements/srs.md',
      ' leading-space.md',
      'trailing-space.md '
    ]);
    expect(GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT).toEqual(
      expect.arrayContaining(['.cache/', 'win-validation/', 'assurance-*-evidence/'])
    );
  });

  it('keeps closeout command execution on an explicit executable allowlist', () => {
    expect(ALLOWED_EXECUTABLE_COMMANDS).toEqual([
      'npm',
      'npm.cmd',
      'git',
      'docker',
      'python3',
      'gh'
    ]);
    expect(isAllowedExecutableCommand('git')).toBe(true);
    expect(isAllowedExecutableCommand('/tmp/evil')).toBe(false);
  });

  it('rejects unsupported executable commands before spawn', () => {
    const spawnSync = vi.fn(() => ({ status: 0, stdout: '' }));

    expect(() => runCommand('/tmp/evil', [], { spawnSync })).toThrow(
      "Unsupported executable command '/tmp/evil'"
    );
    expect(() => assertAllowedExecutableCommand('/tmp/evil')).toThrow(
      "Unsupported executable command '/tmp/evil'"
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('preserves tracked symlink targets in the audit snapshot without following them', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'closeout-snapshot-test-'));
    const snapshotRoot = path.join(tempRoot, 'snapshot');

    try {
      const snapshot = createTrackedWorktreeSnapshot('C:\\repo', {
        tmpdir: () => tempRoot,
        mkdtempSync: () => {
          fs.mkdirSync(snapshotRoot, { recursive: true });
          return snapshotRoot;
        },
        spawnSync: vi.fn((command: string, args: string[]) => {
          if (command === 'git' && args.join(' ') === 'ls-files -z') {
            return { status: 0, stdout: 'package.json\0.tools/bin/vagrant\0' };
          }
          return { status: 0, stdout: '' };
        }),
        lstatSync: (targetPath: string) => {
          const normalized = targetPath.replace(/\\/g, '/');
          return {
            isSymbolicLink: () => normalized.endsWith('/.tools/bin/vagrant'),
            isFile: () => !normalized.endsWith('/.tools/bin/vagrant')
          };
        },
        copyFileSync: (_sourcePath: string, targetPath: string) => {
          fs.writeFileSync(targetPath, 'tracked package content', 'utf8');
        },
        readlinkSync: () => '\\home\\sergio\\repos\\gl\\vi-history-suite\\.cache\\vagrant-install\\usr\\bin\\vagrant',
        writeFileSync: fs.writeFileSync,
        mkdirSync: fs.mkdirSync
      } as any);

      expect(snapshot).toMatchObject({
        mode: 'tracked-worktree-snapshot',
        trackedFileCount: 2,
        symlinkFiles: ['.tools/bin/vagrant'],
        missingFiles: []
      });
      expect(fs.readFileSync(path.join(snapshot.path, 'package.json'), 'utf8')).toBe('tracked package content');
      expect(fs.readFileSync(path.join(snapshot.path, '.tools/bin/vagrant'), 'utf8')).toContain('.cache');
      expect(snapshot.generatedRootsExcluded).toContain('win-validation/');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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

  it('retries transient git remote failures before failing provenance', () => {
    let gitlabAttempts = 0;
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
        gitlabAttempts += 1;
        if (gitlabAttempts === 1) {
          return { status: 1, stderr: 'TLS handshake timeout' };
        }
        return { status: 0, stdout: gitlabRemoteOk() };
      }
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
        return { status: 0, stdout: githubRemoteOk() };
      }
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        return { status: 0, stdout: json({ schemaVersion: 2 }) };
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

    const gitlabCheck = provenance.checks.find((check) => check.name === 'GitLab source main');

    expect(provenance.success).toBe(true);
    expect(gitlabAttempts).toBe(2);
    expect(gitlabCheck?.attempts).toBe(2);
    expect(gitlabCheck?.maxAttempts).toBe(2);
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
    expect(provenance.registry.failureCategory).toBe('auth-denied');
    expect(provenance.failure).toContain('docker login registry.gitlab.com');
  });

  it('classifies Docker credential-helper registry failures with explicit remediation', () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
        return { status: 0, stdout: gitlabRemoteOk() };
      }
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
        return { status: 0, stdout: githubRemoteOk() };
      }
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        return { status: 1, stderr: 'error getting credentials - err: exit status 1, out: `not implemented`' };
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
    expect(provenance.registry.failureCategory).toBe('credential-helper');
    expect(provenance.failure).toContain('credential helper');
  });

  it('classifies Docker registry timeout failures and records retry attempts', () => {
    let manifestAttempts = 0;
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
        return { status: 0, stdout: gitlabRemoteOk() };
      }
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
        return { status: 0, stdout: githubRemoteOk() };
      }
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        manifestAttempts += 1;
        return {
          status: null,
          error: Object.assign(new Error('command timed out'), { code: 'ETIMEDOUT' })
        };
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
    expect(manifestAttempts).toBe(2);
    expect(provenance.registry.failureCategory).toBe('timeout');
    expect(provenance.registry.timedOut).toBe(true);
    expect(provenance.registry.attempts).toBe(2);
    expect(provenance.failure).toContain('timed out');
  });

  it('classifies missing published registry images separately from auth failures', () => {
    const classification = classifyDockerRegistryFailure(
      {
        status: 1,
        stderr: 'manifest unknown: manifest unknown',
        command: `docker manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`
      },
      STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
      'docker manifest inspect'
    );

    expect(classification.category).toBe('image-unavailable');
    expect(classification.message).toContain('verify image publication');
  });

  it('treats explicit timeout metadata as transient network failure', () => {
    expect(isTransientNetworkFailure({ timedOut: true })).toBe(true);
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

  it('parses explicit gate scorecard statuses', () => {
    expect(parseGateScorecard(scorecardDodPass)).toMatchObject({
      coverage: 'PASS',
      doc: 'PASS',
      dod: 'PASS'
    });
  });

  it('does not let generated assurance evidence satisfy the DoD gate', () => {
    const dod = summarizeDodGateEvidence(
      {
        evidence: [
          {
            path: 'assurance-closeout-evidence/assurance-scorecard.txt',
            rule_source: 'GATE:dod:context',
            matched_text: 'DoD Gate / dod'
          }
        ]
      },
      scorecardDodPass
    );

    expect(dod).toMatchObject({
      status: 'N/A',
      scorecardStatus: 'PASS',
      source: 'disqualified-only'
    });
    expect(dod.disqualifiedSources).toEqual([
      expect.objectContaining({
        path: 'assurance-closeout-evidence/assurance-scorecard.txt',
        classification: 'generated-assurance-evidence'
      })
    ]);
  });

  it('does not let unit-test fixture text satisfy the DoD gate', () => {
    const dod = summarizeDodGateEvidence(
      {
        evidence: [
          {
            path: 'tests/unit/closeoutEvidenceScript.test.ts',
            rule_source: 'GATE:dod:context',
            matched_text: 'DoD Gate / dod'
          }
        ]
      },
      scorecardDodPass
    );

    expect(dod.status).toBe('N/A');
    expect(dod.disqualifiedSources[0]).toMatchObject({
      classification: 'test-fixture',
      path: 'tests/unit/closeoutEvidenceScript.test.ts'
    });
  });

  it('allows DoD to pass only when scanner-visible evidence is .github/workflows/ci.yml', () => {
    const dod = summarizeDodGateEvidence(
      {
        evidence: [
          {
            path: '.github/workflows/ci.yml',
            rule_source: 'GATE:dod:context',
            matched_text: 'name: DoD Gate / dod'
          }
        ]
      },
      scorecardDodPass
    );

    expect(dod).toMatchObject({
      status: 'PASS',
      scorecardStatus: 'PASS',
      source: 'workflow'
    });
    expect(dod.trustedSources).toEqual([
      expect.objectContaining({
        classification: 'workflow',
        path: '.github/workflows/ci.yml'
      })
    ]);
  });

  it('does not let non-ci workflow files satisfy the DoD gate', () => {
    const dod = summarizeDodGateEvidence(
      {
        evidence: [
          {
            path: '.github/workflows/release.yml',
            rule_source: 'GATE:dod:context',
            matched_text: 'name: DoD Gate / dod'
          }
        ]
      },
      scorecardDodPass
    );

    expect(dod).toMatchObject({
      status: 'N/A',
      scorecardStatus: 'PASS',
      source: 'disqualified-only'
    });
    expect(dod.disqualifiedSources).toEqual([
      expect.objectContaining({
        path: '.github/workflows/release.yml',
        classification: 'untrusted-source'
      })
    ]);
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
    let pullCalls = 0;
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'docker' && args.join(' ') === `image inspect ${DEFAULT_STANDARDS_IMAGE}`) {
        return { status: 1, stderr: 'missing' };
      }
      if (command === 'docker' && args.join(' ') === `pull ${DEFAULT_STANDARDS_IMAGE}`) {
        pullCalls += 1;
        return { status: 1, stderr: 'denied' };
      }
      return { status: 0, stdout: '' };
    });

    const result = runDockerStandards(
      {
        standardsImage: DEFAULT_STANDARDS_IMAGE,
        skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review'
      },
      { spawnSync }
    );

    expect(result.success).toBe(false);
    expect(result.imageAccess).toBe('pull-failed');
    expect(result.failureCategory).toBe('auth-denied');
    expect(result.failure).toContain('docker login registry.gitlab.com');
    expect(pullCalls).toBe(1);
  });

  it('retries docker pull once for transient network failures', () => {
    let pullCalls = 0;
    let inspectCalls = 0;
    const result = runDockerStandards(
      {
        standardsImage: DEFAULT_STANDARDS_IMAGE,
        skillRoot: 'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review'
      },
      {
        spawnSync: vi.fn((command: string, args: string[]) => {
          if (command === 'docker' && args.join(' ') === `image inspect ${DEFAULT_STANDARDS_IMAGE}`) {
            inspectCalls += 1;
            if (inspectCalls === 1) {
              return { status: 1, stderr: 'missing' };
            }
            return { status: 0, stdout: '[]' };
          }
          if (command === 'docker' && args.join(' ') === `pull ${DEFAULT_STANDARDS_IMAGE}`) {
            pullCalls += 1;
            if (pullCalls === 1) {
              return { status: 1, stderr: 'TLS handshake timeout' };
            }
            return { status: 0, stdout: 'pulled' };
          }
          const line = [command, ...args].join(' ');
          if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
          if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceOk };
          if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardOk };
          return { status: 0, stdout: '' };
        })
      }
    );

    expect(result.success).toBe(true);
    expect(pullCalls).toBe(2);
  });

  it('reports credential-helper remediation when docker pull fails before standards execution', () => {
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
            return {
              status: 1,
              stderr: 'error getting credentials - err: exit status 1, out: `not implemented`'
            };
          }
          return { status: 0, stdout: '' };
        })
      }
    );

    expect(result.success).toBe(false);
    expect(result.imageAccess).toBe('pull-failed');
    expect(result.failureCategory).toBe('credential-helper');
    expect(result.failure).toContain('credential helper');
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
    const spawnSync = hostSuccessSpawnSync();
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '130', '--run-gates'],
      {
        platform: 'win32',
        cwd: 'C:\\repo',
        existsSync: () => true,
        spawnSync
      }
    );
    const requirementsQualityCall = spawnSync.mock.calls.find(([_command, args]) =>
      args.join(' ').includes('requirements_quality_check.py')
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
    expect(result.markdown).toContain('Audit target: tracked-worktree-snapshot; 2 tracked files; generated roots excluded.');
    expect(result.markdown).toContain('Evidence scan: 251 files; REQ=strong; TEST=strong');
    expect(result.markdown).toContain('Closable: yes');
    expect(result.markdown).toContain('| docs:links | PASS | npm.cmd run docs:links |');
    expect(result.markdown).toContain('| coverage:map | PASS | npm.cmd run coverage:map |');
    expect(result.markdown).toContain('Definition-of-Done');
    expect(result.markdown).not.toContain('Defer docs link-check/lychee automation');
    expect(requirementsQualityCall?.[2].cwd).toContain('vi-history-suite-audit-snapshot-');
    expect(result.context.machineReadableSummary?.standards.auditTarget).toMatchObject({
      mode: 'tracked-worktree-snapshot',
      trackedFileCount: 2,
      generatedRootsExcluded: expect.arrayContaining(['win-validation/', '.cache/'])
    });
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
    expect(result.context.machineReadableSummary?.schemaVersion).toBe(1);
    expect(result.context.machineReadableSummary?.localGates.ran).toBe(false);
    expect(result.context.machineReadableSummary?.closureDecision.closable).toBe(false);
    expect(result.context.machineReadableSummary?.closureDecision.reasons[0]).toContain('Local gates were not run');
  });

  it('writes closeout-summary.json when save-dir is provided', () => {
    const saveDirRel = `.tmp-closeout-summary-${Date.now()}-${process.pid}`;
    const saveDirAbs = path.join(repoRoot, saveDirRel);

    try {
      const result = generateCloseoutEvidence(
        [
          '--kind',
          'standards',
          '--issue',
          '130',
          '--run-gates',
          '--save-dir',
          saveDirRel
        ],
        {
          platform: 'win32',
          existsSync: () => true,
          spawnSync: hostSuccessSpawnSync()
        }
      );

      const summaryPath = path.join(saveDirAbs, 'closeout-summary.json');
      const auditTargetPath = path.join(saveDirAbs, 'standards-audit-target.json');
      expect(fs.existsSync(summaryPath)).toBe(true);
      expect(fs.existsSync(auditTargetPath)).toBe(true);

      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
        schemaVersion: number;
        localGates: {
          ran: boolean;
          passed: boolean;
          traceabilitySummary: { inventoryEntries?: number };
          results: Array<{ name: string; status: string }>;
        };
        standards: {
          success: boolean;
          auditTarget?: {
            mode: string;
            trackedFileCount: number;
            generatedRootsExcluded: string[];
          };
        };
        provenance: { success: boolean };
        closureDecision: { closable: boolean };
        exitCode: number;
      };
      const auditTarget = JSON.parse(fs.readFileSync(auditTargetPath, 'utf8')) as {
        path?: string;
        mode: string;
        trackedFileCount: number;
        generatedRootsExcluded: string[];
      };

      expect(summary.schemaVersion).toBe(1);
      expect(summary.localGates.ran).toBe(true);
      expect(summary.localGates.passed).toBe(true);
      expect(summary.localGates.traceabilitySummary.inventoryEntries).toBe(156);
      expect(summary.localGates.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'traceability:audit', status: 'PASS' }),
          expect.objectContaining({ name: 'docs:links', status: 'PASS' }),
          expect.objectContaining({ name: 'coverage:map', status: 'PASS' })
        ])
      );
      expect(summary.standards.success).toBe(true);
      expect(summary.standards.auditTarget).toMatchObject({
        mode: 'tracked-worktree-snapshot',
        trackedFileCount: 2,
        generatedRootsExcluded: expect.arrayContaining(['win-validation/', 'assurance-*-evidence/'])
      });
      expect(auditTarget).toMatchObject({
        mode: 'tracked-worktree-snapshot',
        trackedFileCount: 2,
        generatedRootsExcluded: expect.arrayContaining(['win-validation/', 'assurance-*-evidence/'])
      });
      expect(auditTarget.path).toBeUndefined();
      expect(summary.provenance.success).toBe(true);
      expect(summary.closureDecision.closable).toBe(true);
      expect(summary.exitCode).toBe(0);
      expect(result.context.machineReadableSummary?.closureDecision.closable).toBe(true);
    } finally {
      fs.rmSync(saveDirAbs, { recursive: true, force: true });
    }
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
      if (command === 'git' && args.join(' ') === 'ls-files -z') {
        return { status: 0, stdout: 'package.json\0' };
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
    expect(spawnSync.mock.calls.some(([command, args]) =>
      command === 'docker' &&
      args.includes('-v') &&
      args.some((arg) => arg.includes('vi-history-suite-audit-snapshot-') && arg.endsWith(':/target'))
    )).toBe(true);
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
