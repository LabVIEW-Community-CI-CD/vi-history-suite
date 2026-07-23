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
  RELEASE_STANDARDS_PROFILES,
  STANDARDS_TOOLCHAIN_EXPECTED_COMMIT,
  STANDARDS_TOOLCHAIN_GITHUB_TAG,
  STANDARDS_TOOLCHAIN_GITHUB_URL,
  STANDARDS_TOOLCHAIN_GITLAB_URL,
  STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
  classifyDockerRegistryFailure,
  createTrackedWorktreeSnapshot,
  isAllowedExecutableCommand,
  assertAllowedExecutableCommand,
  assertShellSafeCommandArgv,
  isTransientNetworkFailure,
  generateCloseoutEvidence,
  renderSchema,
  CLOSEOUT_SUMMARY_SCHEMA_ID,
  CLOSEOUT_SUMMARY_JSON_SCHEMA,
  parseGateScorecard,
  parseArgs,
  parseGitTrackedFiles,
  parseLsRemote,
  resolveAuditSnapshotBase,
  runCommand,
  runDockerStandards,
  summarizeReleaseProfileResults,
  summarizeDodGateEvidence,
  evaluateClosureDecision,
  findTagCommit,
  findRemoteCommit,
  collectGitContext,
  collectGithubContext,
  verifyStandardsToolchainProvenance
} = require('../../scripts/generateCloseoutEvidence.js') as {
  ALLOWED_EXECUTABLE_COMMANDS: string[];
  DEFAULT_STANDARDS_IMAGE: string;
  GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT: string[];
  LOCAL_STANDARDS_IMAGE: string;
  RELEASE_STANDARDS_PROFILES: string[];
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
  assertShellSafeCommandArgv: (argv: string[]) => void;
  resolveAuditSnapshotBase: (deps?: {
    tmpdir?: () => string;
    homedir?: () => string;
    env?: Record<string, string | undefined>;
  }) => string;
  isTransientNetworkFailure: (commandResult: {
    stderr?: string;
    error?: string;
    timedOut?: boolean;
  }) => boolean;
  parseGateScorecard: (scorecard: string) => Record<string, string>;
  parseGitTrackedFiles: (stdout: string) => string[];
  renderSchema: (options?: { provenance?: unknown }) => string;
  CLOSEOUT_SUMMARY_SCHEMA_ID: string;
  CLOSEOUT_SUMMARY_JSON_SCHEMA: { required: string[]; properties: Record<string, { const?: unknown }> };
  parseArgs: (argv: string[]) => {
    kind: string;
    issue?: string;
    standardsRunner: string;
    standardsImage: string;
    runGates: boolean;
  };
  parseLsRemote: (stdout: string) => Array<{ commit: string; ref: string }>;
  summarizeReleaseProfileResults: (results: Array<{
    name: string;
    file?: string;
    status: number;
    stdout?: string;
  }>) => Array<{
    profile: string;
    status: number;
    success: boolean;
    gates: Array<{ gate: string; status: string }>;
    failedGates: string[];
    missingGates: string[];
    file?: string;
  }>;
  summarizeDodGateEvidence: (
    evidenceScan: Record<string, unknown> | undefined,
    scorecard: string
  ) => {
    status: 'PASS' | 'N/A' | 'FAIL';
    scorecardStatus: 'PASS' | 'N/A' | 'FAIL';
    source: string;
    trustedSources: Array<{ path: string; classification: string }>;
    disqualifiedSources: Array<{ path: string; classification: string }>;
    reason: string;
  };
  evaluateClosureDecision: (context: Record<string, unknown>) => {
    closable: boolean;
    localGatesRan: boolean;
    localGatesPassed: boolean;
    failedLocalGates: string[];
    standardsPassed: boolean;
    dodEvidencePassed: boolean;
    provenancePassed: boolean;
    reasons: string[];
  };
  findTagCommit: (entries: Array<{ commit: string; ref: string }>, tagName: string) => string | undefined;
  findRemoteCommit: (entries: Array<{ commit: string; ref: string }>, refName: string) => string | undefined;
  collectGitContext: (deps?: Record<string, unknown>) => { branch: string; commit: string; fullCommit: string };
  collectGithubContext: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => { issue?: unknown; releasePr?: unknown; backSyncPr?: unknown };
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
          releaseProfiles?: Array<{ profile: string; success: boolean }>;
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
          summary?: {
            releaseProfiles?: Array<{ profile: string; success: boolean }>;
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
const evidenceWithTrustedDod = json({
  inventory: { file_count: 251 },
  areas: {
    REQ: { signal: 'strong' },
    TEST: { signal: 'strong' }
  },
  evidence: [
    {
      path: '.github/workflows/ci.yml',
      rule_source: 'GATE:dod:context',
      matched_text: 'name: DoD Gate / dod'
    }
  ]
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
const releaseScorecardPass = [
  'Gate Scorecard',
  '| Gate | Status | Confidence | Missing Proof |',
  '| --- | --- | --- | --- |',
  '| coverage | PASS | High | - |',
  '| cm | PASS | High | - |',
  '| req | PASS | High | - |',
  '| arch | PASS | High | - |',
  '| doc | PASS | High | - |',
  '| dod | PASS | Med | - |'
].join('\n');
const releaseScorecardDocFail = [
  'Gate Scorecard',
  '| Gate | Status | Confidence | Missing Proof |',
  '| --- | --- | --- | --- |',
  '| coverage | PASS | High | - |',
  '| cm | PASS | High | - |',
  '| req | PASS | High | - |',
  '| arch | PASS | High | - |',
  '| doc | FAIL | High | A docs link-check such as lychee |',
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

function hostSuccessSpawnSync(options: { evidenceScan?: string; scorecard?: string } = {}) {
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
    if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: options.evidenceScan ?? evidenceWithTrustedDod };
    if (line.includes('run_assurance.py') && args.includes('--profile') && args.some((arg) => RELEASE_STANDARDS_PROFILES.includes(arg))) {
      return { status: 0, stdout: releaseScorecardPass };
    }
    if (line.includes('run_assurance.py')) return { status: 0, stdout: options.scorecard ?? scorecardDodPass };
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

  it('assertShellSafeCommandArgv rejects cmd metacharacters that enable injection (#2123 security)', () => {
    // Tokens that could chain/redirect/escape a second command when re-parsed by
    // `cmd /c` (e.g. an env-derived path like REPO_STANDARDS_REVIEW_ROOT).
    for (const bad of ['a&calc', 'x|y', 'in<file', 'out>file', 'a^b', 'say"hi"', 'a`b`', 'line1\nline2', 'a\rb']) {
      expect(() => assertShellSafeCommandArgv([bad])).toThrow(/shell metacharacter/);
    }
    // The metacharacter is caught wherever it sits in the argv.
    expect(() => assertShellSafeCommandArgv(['docker', 'run', 'img&evil'])).toThrow(/shell metacharacter/);
  });

  it('assertShellSafeCommandArgv accepts legitimate tokens including Windows paths with spaces and parentheses (#2123 security)', () => {
    // Parentheses and colons/backslashes/spaces are legitimate in Windows paths
    // (e.g. Program Files (x86)) and must NOT be rejected.
    expect(() =>
      assertShellSafeCommandArgv([
        'docker',
        'run',
        '-v',
        'C:\\Program Files (x86)\\repo:/repo',
        'ghcr.io/acme/img:2026q1',
        'run',
        'traceability:audit'
      ])
    ).not.toThrow();
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

  it('resolves the audit snapshot base to a Docker-visible home cache by default (VHS-REQ-601.25)', () => {
    // Snap-confined/rootless Docker cannot bind-mount host /tmp subpaths, so the
    // snapshot base defaults to a home-directory cache that the Docker daemon can
    // share, instead of os.tmpdir(). This keeps the standards scan non-empty
    // without an operator-set TMPDIR.
    const base = resolveAuditSnapshotBase({ homedir: () => '/home/agent', env: {} });
    expect(base).toBe(path.join('/home/agent', '.cache', 'vi-history-suite'));
  });

  it('honors the VIHS_CLOSEOUT_SNAPSHOT_DIR override before the home cache (VHS-REQ-601.25)', () => {
    const base = resolveAuditSnapshotBase({
      homedir: () => '/home/agent',
      env: { VIHS_CLOSEOUT_SNAPSHOT_DIR: '/mnt/docker-visible/snap' }
    });
    expect(base).toBe('/mnt/docker-visible/snap');
  });

  it('prefers an injected tmpdir seam above all other snapshot base sources', () => {
    const base = resolveAuditSnapshotBase({
      tmpdir: () => '/injected/tmp',
      homedir: () => '/home/agent',
      env: { VIHS_CLOSEOUT_SNAPSHOT_DIR: '/mnt/override' }
    });
    expect(base).toBe('/injected/tmp');
  });

  it('falls back to the OS temp dir when no home directory is resolvable', () => {
    const base = resolveAuditSnapshotBase({
      homedir: () => {
        throw new Error('no home');
      },
      env: {}
    });
    expect(base).toBe(os.tmpdir());
  });

  it('verifies standards toolchain provenance as machine-readable evidence (VHS-REQ-601.26)', () => {
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

  it('publishes the closeout-summary JSON Schema via --schema without collecting evidence (VHS-REQ-601)', () => {
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };
    expect(schema.$id).toBe(CLOSEOUT_SUMMARY_SCHEMA_ID);
    expect(schema.properties.$schema.const).toBe(CLOSEOUT_SUMMARY_SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(1);
    // --schema does not require --kind and never spawns any command.
    const spawnSync = vi.fn();
    const result = generateCloseoutEvidence(['--schema'], { spawnSync });
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.markdown) as Record<string, unknown>).$id).toBe(CLOSEOUT_SUMMARY_SCHEMA_ID);
    expect(spawnSync).not.toHaveBeenCalled();
    // --schema attaches provenance under the shared extension key.
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });
  });

  it('parses explicit gate scorecard statuses', () => {
    expect(parseGateScorecard(scorecardDodPass)).toMatchObject({
      coverage: 'PASS',
      doc: 'PASS',
      dod: 'PASS'
    });
  });

  it('summarizes release profile gate status failures', () => {
    const profiles = summarizeReleaseProfileResults([
      {
        name: 'release-profile-26514-review',
        file: 'release-26514-review-scorecard.txt',
        status: 0,
        stdout: releaseScorecardPass
      },
      {
        name: 'release-profile-release-gate',
        file: 'release-release-gate-scorecard.txt',
        status: 0,
        stdout: releaseScorecardDocFail
      }
    ]);

    expect(profiles).toHaveLength(RELEASE_STANDARDS_PROFILES.length);
    expect(profiles[0]).toMatchObject({ profile: '26514-review', success: true, failedGates: [], missingGates: [] });
    expect(profiles[1]).toMatchObject({ profile: 'release-gate', success: false, failedGates: ['doc'], missingGates: [] });
  });

  it('does not let generated assurance evidence satisfy the DoD gate (VHS-REQ-615.5)', () => {
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

  it('does not let unit-test fixture text satisfy the DoD gate (VHS-REQ-615.5)', () => {
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

  it('allows DoD to pass only when scanner-visible evidence is .github/workflows/ci.yml (VHS-REQ-601.27)', () => {
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
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
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

  it('renders a closable standards summary when mandatory standards and gates pass (VHS-REQ-601.24, VHS-REQ-601.28, VHS-REQ-613.8, VHS-REQ-615.5, VHS-REQ-615.6)', () => {
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
    expect(result.markdown).toContain('dod=PASS (raw=PASS; source=workflow');
    expect(result.markdown).toContain(
      'Definition-of-Done evidence: local `dod:gate` and standards scorecard status are retained in closeout evidence.'
    );
    expect(result.markdown).toContain(
      'Resolve any non-PASS Definition-of-Done evidence before umbrella closeout, or record the blocking follow-up issue.'
    );
    expect(result.markdown).not.toContain('Defer docs link-check/lychee automation');
    expect(requirementsQualityCall?.[2].cwd).toContain('vi-history-suite-audit-snapshot-');
    expect(result.context.machineReadableSummary?.standards.auditTarget).toMatchObject({
      mode: 'tracked-worktree-snapshot',
      trackedFileCount: 2,
      generatedRootsExcluded: expect.arrayContaining(['win-validation/', '.cache/'])
    });
    expect(result.context.machineReadableSummary?.standards.summary.dodGateEvidence).toMatchObject({
      status: 'PASS',
      scorecardStatus: 'PASS',
      source: 'workflow'
    });
  });

  it('blocks closeout when Definition-of-Done evidence remains unresolved (VHS-REQ-601.28)', () => {
    const result = generateCloseoutEvidence(['--kind', 'standards', '--issue', '130', '--run-gates'], {
      platform: 'win32',
      cwd: 'C:\\repo',
      existsSync: () => true,
      spawnSync: hostSuccessSpawnSync({ evidenceScan: evidenceOk, scorecard: scorecardOk })
    });

    expect(result.markdown).toContain('dod=N/A (raw=N/A; source=none');
    expect(result.markdown).toContain('Closable: no');
    expect(result.exitCode).toBe(1);
    expect(result.context.machineReadableSummary?.closureDecision).toMatchObject({
      closable: false,
      requirements: expect.objectContaining({ definitionOfDoneEvidence: false }),
      reasons: expect.arrayContaining([
        expect.stringContaining('Definition-of-Done evidence did not pass')
      ])
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

  it('writes closeout-summary.json when save-dir is provided (VHS-REQ-615.6)', () => {
    const saveDirRel = `.tmp-closeout-summary-${Date.now()}-${process.pid}`;
    const saveDirAbs = path.join(repoRoot, saveDirRel);
    const hygieneEvidenceScan = json({
      inventory: { file_count: 251 },
      areas: {
        REQ: { signal: 'strong' },
        TEST: { signal: 'strong' }
      },
      evidence: [
        {
          path: '.github/workflows/ci.yml',
          rule_source: 'GATE:dod:context',
          matched_text: 'name: DoD Gate / dod'
        },
        {
          path: 'assurance-closeout-evidence/assurance-scorecard.txt',
          rule_source: 'GATE:dod:context',
          matched_text: 'DoD Gate / dod'
        },
        {
          path: 'coverage/lcov.info',
          rule_source: 'GATE:dod:context',
          matched_text: 'DoD Gate / dod'
        },
        {
          path: 'tests/unit/closeoutEvidenceScript.test.ts',
          rule_source: 'GATE:dod:context',
          matched_text: 'DoD Gate / dod'
        },
        {
          path: 'docs/requirements/srs.md',
          rule_source: 'GATE:dod:context',
          matched_text: 'DoD Gate / dod'
        }
      ]
    });

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
          spawnSync: hostSuccessSpawnSync({ evidenceScan: hygieneEvidenceScan })
        }
      );

      const summaryPath = path.join(saveDirAbs, 'closeout-summary.json');
      const hygienePath = path.join(saveDirAbs, 'standards-evidence-hygiene.json');
      const auditTargetPath = path.join(saveDirAbs, 'standards-audit-target.json');
      expect(fs.existsSync(summaryPath)).toBe(true);
      expect(fs.existsSync(hygienePath)).toBe(true);
      expect(fs.existsSync(auditTargetPath)).toBe(true);

      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
        $schema: string;
        schemaVersion: number;
        localGates: {
          ran: boolean;
          passed: boolean;
          failed: string[];
          traceabilitySummary: { inventoryEntries?: number };
          results: Array<{ name: string; status: string; command: string; durationMs: number }>;
        };
        git: { branch: string; commit: string; shortCommit: string };
        standards: {
          runner: string;
          success: boolean;
          auditTarget?: {
            mode: string;
            trackedFileCount: number;
            generatedRootsExcluded: string[];
          };
          summary: {
            fileCount: number;
            reqSignal: string;
            testSignal: string;
            coverageGate: string;
            docGate: string;
            dodGate: string;
            dodGateEvidence: {
              status: string;
              scorecardStatus: string;
              source: string;
              trustedSources: Array<{
                path: string;
                ruleSource: string;
                matchedText: string;
                classification: string;
              }>;
              disqualifiedSources: Array<{ path: string; classification: string }>;
              reason: string;
            };
            releaseProfiles: Array<{ profile: string; success: boolean }>;
          };
        };
        provenance: {
          success: boolean;
          expectedCommit: string;
          checks: Array<{
            name: string;
            success: boolean;
            expectedCommit: string;
            actualCommit: string;
            message: string;
            status: number;
            timedOut: boolean;
            attempts: number;
            maxAttempts: number;
            timeoutMs: number;
          }>;
          skillCache: {
            path: string;
            exists: boolean;
            authority: string;
            success: boolean;
            message: string;
          };
          registry: {
            image: string;
            success: boolean;
            failureCategory: string;
            message: string;
            timedOut: boolean;
            attempts: number;
            maxAttempts: number;
            timeoutMs: number;
          };
        };
        closureDecision: {
          closable: boolean;
          requirements: {
            localGates: boolean;
            standardsEvidence: boolean;
            definitionOfDoneEvidence: boolean;
            standardsProvenance: boolean;
          };
          reasons: string[];
        };
        exitCode: number;
      };
      const auditTarget = JSON.parse(fs.readFileSync(auditTargetPath, 'utf8')) as {
        path?: string;
        mode: string;
        trackedFileCount: number;
        generatedRootsExcluded: string[];
        symlinkFiles: string[];
        missingFiles: string[];
      };
      const hygiene = JSON.parse(fs.readFileSync(hygienePath, 'utf8')) as {
        auditTarget: typeof auditTarget;
        dodGate: {
          status: string;
          scorecardStatus: string;
          source: string;
          trustedSources: Array<{
            path: string;
            ruleSource: string;
            matchedText: string;
            classification: string;
          }>;
          disqualifiedSources: Array<{
            path: string;
            ruleSource: string;
            matchedText: string;
            classification: string;
          }>;
          reason: string;
        };
        policy: {
          passSource: string;
          disqualifiedSources: string[];
        };
      };

      expect(Object.keys(summary)).toEqual([
        '$schema',
        'schemaVersion',
        'kind',
        'issueNumber',
        'git',
        'localGates',
        'standards',
        'provenance',
        'closureDecision',
        'exitCode'
      ]);
      // The retained packet self-describes and satisfies the published schema contract (no drift).
      expect((summary as { $schema: string }).$schema).toBe(CLOSEOUT_SUMMARY_SCHEMA_ID);
      expect(CLOSEOUT_SUMMARY_JSON_SCHEMA.required.filter((key) => !(key in summary))).toEqual([]);
      expect(Object.keys(summary.git)).toEqual(['branch', 'commit', 'shortCommit']);
      expect(Object.keys(summary.localGates)).toEqual([
        'ran',
        'passed',
        'failed',
        'traceabilitySummary',
        'results'
      ]);
      expect(Object.keys(summary.localGates.traceabilitySummary)).toEqual(['inventoryEntries', 'gapEntries']);
      expect(Object.keys(summary.localGates.results[0])).toEqual(['name', 'status', 'command', 'durationMs']);
      expect(Object.keys(summary.standards)).toEqual(['runner', 'success', 'auditTarget', 'summary']);
      expect(Object.keys(summary.standards.auditTarget ?? {})).toEqual([
        'mode',
        'trackedFileCount',
        'generatedRootsExcluded'
      ]);
      expect(Object.keys(auditTarget)).toEqual([
        'mode',
        'trackedFileCount',
        'generatedRootsExcluded',
        'symlinkFiles',
        'missingFiles'
      ]);
      expect(Object.keys(hygiene)).toEqual(['auditTarget', 'dodGate', 'policy']);
      expect(Object.keys(hygiene.auditTarget)).toEqual([
        'mode',
        'trackedFileCount',
        'generatedRootsExcluded',
        'symlinkFiles',
        'missingFiles'
      ]);
      expect(Object.keys(hygiene.dodGate)).toEqual([
        'status',
        'scorecardStatus',
        'source',
        'trustedSources',
        'disqualifiedSources',
        'reason'
      ]);
      expect(Object.keys(hygiene.dodGate.trustedSources[0])).toEqual([
        'path',
        'ruleSource',
        'matchedText',
        'classification'
      ]);
      expect(Object.keys(hygiene.dodGate.disqualifiedSources[0])).toEqual([
        'path',
        'ruleSource',
        'matchedText',
        'classification'
      ]);
      expect(Object.keys(hygiene.policy)).toEqual(['passSource', 'disqualifiedSources']);
      expect(Object.keys(summary.standards.summary)).toEqual([
        'fileCount',
        'reqSignal',
        'testSignal',
        'coverageGate',
        'docGate',
        'dodGate',
        'dodGateEvidence',
        'releaseProfiles'
      ]);
      expect(Object.keys(summary.standards.summary.dodGateEvidence)).toEqual([
        'status',
        'scorecardStatus',
        'source',
        'trustedSources',
        'disqualifiedSources',
        'reason'
      ]);
      expect(Object.keys(summary.standards.summary.dodGateEvidence.trustedSources[0])).toEqual([
        'path',
        'ruleSource',
        'matchedText',
        'classification'
      ]);
      expect(Object.keys(summary.provenance)).toEqual([
        'success',
        'expectedCommit',
        'checks',
        'skillCache',
        'registry'
      ]);
      expect(Object.keys(summary.provenance.checks[0])).toEqual([
        'name',
        'success',
        'expectedCommit',
        'actualCommit',
        'message',
        'status',
        'timedOut',
        'attempts',
        'maxAttempts',
        'timeoutMs'
      ]);
      expect(Object.keys(summary.provenance.skillCache)).toEqual([
        'path',
        'exists',
        'authority',
        'success',
        'message'
      ]);
      expect(Object.keys(summary.provenance.registry)).toEqual([
        'image',
        'success',
        'failureCategory',
        'message',
        'timedOut',
        'attempts',
        'maxAttempts',
        'timeoutMs'
      ]);
      expect(Object.keys(summary.closureDecision)).toEqual(['closable', 'requirements', 'reasons']);
      expect(Object.keys(summary.closureDecision.requirements)).toEqual([
        'localGates',
        'standardsEvidence',
        'definitionOfDoneEvidence',
        'standardsProvenance'
      ]);
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
      expect(Array.isArray(auditTarget.symlinkFiles)).toBe(true);
      expect(Array.isArray(auditTarget.missingFiles)).toBe(true);
      expect(auditTarget.path).toBeUndefined();
      expect(hygiene.auditTarget).toEqual(auditTarget);
      expect(hygiene.auditTarget.path).toBeUndefined();
      expect(hygiene.dodGate).toEqual(summary.standards.summary.dodGateEvidence);
      expect(hygiene.dodGate.disqualifiedSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'assurance-closeout-evidence/assurance-scorecard.txt',
            classification: 'generated-assurance-evidence'
          }),
          expect.objectContaining({ path: 'coverage/lcov.info', classification: 'generated-build-output' }),
          expect.objectContaining({ path: 'tests/unit/closeoutEvidenceScript.test.ts', classification: 'test-fixture' }),
          expect.objectContaining({ path: 'docs/requirements/srs.md', classification: 'untrusted-source' })
        ])
      );
      expect(hygiene.policy.passSource).toContain('.github/workflows/ci.yml');
      expect(hygiene.policy.disqualifiedSources).toEqual([
        'assurance-*-evidence generated evidence',
        'out/dist/build/coverage generated output',
        'tests/ unit or integration fixture text',
        'documentation-only references'
      ]);
      expect(summary.provenance.success).toBe(true);
      expect(summary.closureDecision.closable).toBe(true);
      expect(summary.exitCode).toBe(0);
      expect(result.context.machineReadableSummary?.closureDecision.closable).toBe(true);
    } finally {
      fs.rmSync(saveDirAbs, { recursive: true, force: true });
    }
  });

  it('falls back to Docker standards evidence when host preflight fails (VHS-REQ-601.25)', () => {
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
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
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

  it('falls back to Docker release profile evidence when host preflight fails (VHS-REQ-601.25)', () => {
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
      if (command === 'python3') return { status: 1, stderr: 'python3 missing' };
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        return { status: 0, stdout: json({ schemaVersion: 2 }) };
      }
      if (command === 'docker' && args.join(' ').startsWith('image inspect')) return { status: 0, stdout: '[]' };
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (line.includes('run_assurance.py') && args.includes('--profile') && args.some((arg) => RELEASE_STANDARDS_PROFILES.includes(arg))) {
        return { status: 0, stdout: releaseScorecardPass };
      }
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
      return { status: 0, stdout: '' };
    });

    const result = generateCloseoutEvidence(['--kind', 'release', '--issue', '1034'], {
      cwd: 'C:\\repo',
      existsSync: () => true,
      spawnSync
    });

    expect(result.exitCode).toBe(0);
    expect(result.context.standards.runner).toBe('docker');
    expect(result.markdown).toContain('Standards runner: docker');
    expect(result.markdown).toContain('26514-review: PASS (coverage=PASS; cm=PASS; req=PASS; arch=PASS; doc=PASS; dod=PASS)');
    expect(result.markdown).toContain('release-gate: PASS (coverage=PASS; cm=PASS; req=PASS; arch=PASS; doc=PASS; dod=PASS)');
    expect(result.context.machineReadableSummary?.standards.summary?.releaseProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profile: '26514-review', success: true }),
        expect.objectContaining({ profile: 'release-gate', success: true })
      ])
    );
  });

  it('fails closeout when mandatory host and Docker standards evidence fail (VHS-REQ-601.25)', () => {
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

  it('captures release standards profiles in release closeout evidence', () => {
    const saveDirRel = `.tmp-release-closeout-${Date.now()}-${process.pid}`;
    const saveDirAbs = path.join(repoRoot, saveDirRel);
    const spawnSync = hostSuccessSpawnSync();

    try {
      const result = generateCloseoutEvidence(
        ['--kind', 'release', '--issue', '1032', '--run-gates', '--save-dir', saveDirRel],
        {
          platform: 'win32',
          existsSync: () => true,
          spawnSync
        }
      );
      const profileCommands = spawnSync.mock.calls
        .filter(([_command, args]) => args.includes('--profile'))
        .map(([_command, args]) => args[args.indexOf('--profile') + 1]);
      const summaryProfiles = result.context.machineReadableSummary?.standards.summary?.releaseProfiles;

      expect(result.exitCode).toBe(0);
      expect(profileCommands).toEqual(expect.arrayContaining(RELEASE_STANDARDS_PROFILES));
      expect(result.markdown).toContain('Release/user-information profiles:');
      expect(result.markdown).toContain('26514-review: PASS (coverage=PASS; cm=PASS; req=PASS; arch=PASS; doc=PASS; dod=PASS)');
      expect(result.markdown).toContain('release-gate: PASS (coverage=PASS; cm=PASS; req=PASS; arch=PASS; doc=PASS; dod=PASS)');
      expect(summaryProfiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ profile: '26514-review', success: true, missingGates: [] }),
          expect.objectContaining({ profile: 'release-gate', success: true, missingGates: [] })
        ])
      );
      expect(fs.existsSync(path.join(saveDirAbs, 'release-26514-review-scorecard.txt'))).toBe(true);
      expect(fs.existsSync(path.join(saveDirAbs, 'release-release-gate-scorecard.txt'))).toBe(true);
    } finally {
      fs.rmSync(saveDirAbs, { recursive: true, force: true });
    }
  });

  it('blocks release closeout when a release standards profile fails', () => {
    const baseSpawnSync = hostSuccessSpawnSync();
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      if (line.includes('run_assurance.py') && args.includes('--profile') && args.includes('26514-review')) {
        return { status: 0, stdout: releaseScorecardPass };
      }
      if (line.includes('run_assurance.py') && args.includes('--profile') && args.includes('release-gate')) {
        return { status: 0, stdout: releaseScorecardDocFail };
      }
      return baseSpawnSync(command, args);
    });

    const result = generateCloseoutEvidence(['--kind', 'release', '--issue', '1032', '--run-gates'], {
      platform: 'win32',
      cwd: 'C:\\repo',
      existsSync: () => true,
      spawnSync
    });

    expect(result.exitCode).toBe(1);
    expect(result.context.standards.success).toBe(false);
    expect(result.markdown).toContain('Release/user-information profile failures: release-gate (doc=FAIL).');
    expect(result.markdown).toContain('release-gate: FAIL (coverage=PASS; cm=PASS; req=PASS; arch=PASS; doc=FAIL; dod=PASS)');
    expect(result.markdown).toContain('Closable: no');
    expect(result.context.machineReadableSummary?.standards.summary?.releaseProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profile: 'release-gate', success: false, failedGates: ['doc'] })
      ])
    );
    expect(result.context.closureDecision?.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Release/user-information profile failures: release-gate')
      ])
    );
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

describe('generateCloseoutEvidence: pure-helper branch coverage (#2331)', () => {
  it('classifies every Docker registry failure category', () => {
    const image = STANDARDS_TOOLCHAIN_REGISTRY_IMAGE;
    const desc = 'docker manifest inspect';
    expect(classifyDockerRegistryFailure({ status: 0 }, image, desc).category).toBe('none');
    expect(classifyDockerRegistryFailure({ status: 1, timedOut: true }, image, desc).category).toBe('timeout');
    expect(classifyDockerRegistryFailure({ status: 1, stderr: 'operation timed out' }, image, desc).category).toBe('timeout');
    expect(classifyDockerRegistryFailure({ status: 1, stderr: 'error getting credentials' }, image, desc).category).toBe(
      'credential-helper'
    );
    expect(classifyDockerRegistryFailure({ status: 1, stderr: 'pull access denied' }, image, desc).category).toBe(
      'auth-denied'
    );
    expect(
      classifyDockerRegistryFailure({ status: 1, stderr: 'some unexpected error', command: 'docker pull x' }, image, desc)
        .category
    ).toBe('unknown');
  });

  it('detects transient network failures from stderr patterns and clears clean results', () => {
    expect(isTransientNetworkFailure({ stderr: 'connection reset by peer' })).toBe(true);
    expect(isTransientNetworkFailure({ error: 'dial tcp: i/o timeout' })).toBe(true);
    expect(isTransientNetworkFailure({ stderr: 'ok', error: '' })).toBe(false);
  });

  it('normalizes N/A gate-status spelling variants and drops unrecognized statuses', () => {
    const scorecard = ['| Gate | Status |', '| --- | --- |', '| coverage | N A |', '| doc | NA |', '| req | bogus |'].join(
      '\n'
    );
    const statuses = parseGateScorecard(scorecard);
    expect(statuses.coverage).toBe('N/A');
    expect(statuses.doc).toBe('N/A');
    expect(statuses.req).toBeUndefined();
  });

  it('summarizeDodGateEvidence returns FAIL when the scorecard row is FAIL', () => {
    const failScorecard = ['| Gate | Status |', '| --- | --- |', '| dod | FAIL |'].join('\n');
    const dod = summarizeDodGateEvidence(
      { evidence: [{ path: '.github/workflows/ci.yml', rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      failScorecard
    );
    expect(dod.status).toBe('FAIL');
    expect(dod.source).toBe('workflow');
  });

  it('summarizeDodGateEvidence treats generated build output as a disqualified source', () => {
    const dod = summarizeDodGateEvidence(
      { evidence: [{ path: 'out/assurance/scorecard.txt', rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      scorecardDodPass
    );
    expect(dod.status).toBe('N/A');
    expect(dod.disqualifiedSources[0].classification).toBe('generated-build-output');
  });

  it('summarizeDodGateEvidence reports no evidence when the scorecard row is missing', () => {
    const dod = summarizeDodGateEvidence({ evidence: [] }, ['| Gate | Status |', '| --- | --- |'].join('\n'));
    expect(dod.status).toBe('FAIL');
    expect(dod.source).toBe('none');
  });

  it('summarizeDodGateEvidence stays N/A when the scorecard has not promoted DoD', () => {
    const withTrusted = summarizeDodGateEvidence(
      { evidence: [{ path: '.github/workflows/ci.yml', rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      scorecardOk
    );
    expect(withTrusted.status).toBe('N/A');
    expect(withTrusted.reason).toContain('visible');

    const withoutTrusted = summarizeDodGateEvidence({ evidence: [] }, scorecardOk);
    expect(withoutTrusted.status).toBe('N/A');
    expect(withoutTrusted.reason).toContain('No scanner-visible');
  });

  it('summarizeReleaseProfileResults flags missing gates', () => {
    const partialScorecard = ['| Gate | Status |', '| --- | --- |', '| coverage | PASS |'].join('\n');
    const profiles = summarizeReleaseProfileResults([
      { name: `release-profile-${RELEASE_STANDARDS_PROFILES[0]}`, file: 'f.txt', status: 0, stdout: partialScorecard }
    ]);
    expect(profiles[0].success).toBe(false);
    expect(profiles[0].missingGates.length).toBeGreaterThan(0);
  });

  it('finds remote and tag commits, preferring the peeled tag ref', () => {
    const entries = parseLsRemote(
      ['aaaa\trefs/heads/main', 'bbbb\trefs/tags/v1.0.0', 'cccc\trefs/tags/v1.0.0^{}'].join('\n')
    );
    expect(findRemoteCommit(entries, 'refs/heads/main')).toBe('aaaa');
    expect(findTagCommit(entries, 'v1.0.0')).toBe('cccc');

    const lightweight = parseLsRemote('dddd\trefs/tags/v2.0.0');
    expect(findTagCommit(lightweight, 'v2.0.0')).toBe('dddd');
    expect(findRemoteCommit(lightweight, 'refs/heads/none')).toBeUndefined();
  });

  const closurePassing = {
    gates: [{ name: 'check', success: true }],
    standards: { success: true, summary: { dodGateEvidence: { status: 'PASS' } } },
    provenance: { success: true }
  };

  it('evaluateClosureDecision is closable when every requirement passes', () => {
    const decision = evaluateClosureDecision(closurePassing);
    expect(decision.closable).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it('evaluateClosureDecision flags each failing requirement with a reason', () => {
    expect(evaluateClosureDecision({ ...closurePassing, gates: undefined }).reasons.join(' ')).toContain(
      'Local gates were not run'
    );
    expect(
      evaluateClosureDecision({ ...closurePassing, gates: [{ name: 'traceability', success: false }] }).reasons.join(' ')
    ).toContain('Local gate failures detected: traceability');
    expect(
      evaluateClosureDecision({ ...closurePassing, standards: { success: false, failure: 'boom-standards' } }).reasons.join(
        ' '
      )
    ).toContain('boom-standards');
    expect(evaluateClosureDecision({ ...closurePassing, standards: { success: false } }).reasons.join(' ')).toContain(
      'Standards evidence failed.'
    );
    expect(
      evaluateClosureDecision({
        ...closurePassing,
        standards: { success: true, summary: { dodGateEvidence: { status: 'FAIL' } } }
      }).reasons.join(' ')
    ).toContain('Definition-of-Done evidence did not pass');
    expect(
      evaluateClosureDecision({ ...closurePassing, provenance: { success: false, failure: 'prov-broke' } }).reasons.join(
        ' '
      )
    ).toContain('prov-broke');
    expect(evaluateClosureDecision({ ...closurePassing, provenance: { success: false } }).reasons.join(' ')).toContain(
      'Standards toolchain provenance failed.'
    );
  });
});

describe('generateCloseoutEvidence: parseArgs + snapshot branch coverage (#2331)', () => {
  it('parseArgs handles every flag plus defaults and validation errors', () => {
    const full = parseArgs([
      '--kind',
      'release',
      '--issue',
      '42',
      '--run-gates',
      '--save-dir',
      'ev',
      '--standards-runner',
      'docker',
      '--standards-image',
      'img:tag',
      '--skill-root',
      '/skills',
      '--build-standards-image',
      '--release-tag',
      'v1.2.3',
      '--release-pr',
      '7',
      '--back-sync-pr',
      '8',
      '--marketplace-run',
      'https://run/1'
    ]) as Record<string, unknown>;
    expect(full).toMatchObject({
      kind: 'release',
      issue: '42',
      runGates: true,
      saveDir: 'ev',
      standardsRunner: 'docker',
      standardsImage: 'img:tag',
      buildStandardsImage: true,
      releaseTag: 'v1.2.3',
      releasePr: '7',
      backSyncPr: '8',
      marketplaceRun: 'https://run/1'
    });
    expect(() => parseArgs(['--kind'])).toThrow(/--kind requires a value/);
    expect(() => parseArgs(['--issue', '--run-gates'])).toThrow(/--issue requires a value/);
    expect(() => parseArgs(['--zzz-unknown'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--kind', 'nope'])).toThrow(/--kind must be standards or release/);
    expect(() => parseArgs(['--kind', 'standards', '--standards-runner', 'nope'])).toThrow(
      /--standards-runner must be/
    );
    expect(parseArgs(['--help']) as Record<string, unknown>).toMatchObject({ help: true });
  });

  it('resolveAuditSnapshotBase honors an env override and tolerates homedir failure', () => {
    expect(resolveAuditSnapshotBase({ env: { VIHS_CLOSEOUT_SNAPSHOT_DIR: '  /custom-snap  ' } })).toBe('/custom-snap');
    const fallback = resolveAuditSnapshotBase({
      homedir: () => {
        throw new Error('no home');
      },
      env: {}
    });
    expect(typeof fallback).toBe('string');
    expect(fallback.length).toBeGreaterThan(0);
  });

  it('createTrackedWorktreeSnapshot copies files, materializes symlinks, and skips missing files', () => {
    const snapshotFn = createTrackedWorktreeSnapshot as unknown as (
      repoRoot: string,
      deps: Record<string, unknown>
    ) => { trackedFileCount: number; symlinkFiles: string[]; missingFiles: string[] };
    const copied: Array<[string, string]> = [];
    const symlinked: string[] = [];
    const snapshot = snapshotFn('/repo', {
      spawnSync: (_c: string, args: string[]) =>
        args.join(' ').startsWith('ls-files')
          ? { status: 0, stdout: 'a.txt\0link.txt\0gone.txt\0' }
          : { status: 0, stdout: '' },
      tmpdir: () => os.tmpdir(),
      mkdtempSync: (prefix: string) => `${prefix}snap`,
      mkdirSync: () => undefined,
      lstatSync: (p: string) => {
        if (p.endsWith('link.txt')) {
          return { isSymbolicLink: () => true, isFile: () => false };
        }
        if (p.endsWith('gone.txt')) {
          const error = new Error('missing') as Error & { code?: string };
          error.code = 'ENOENT';
          throw error;
        }
        return { isSymbolicLink: () => false, isFile: () => true };
      },
      copyFileSync: (src: string, dst: string) => {
        copied.push([src, dst]);
      },
      readlinkSync: () => '../target',
      writeFileSync: (dst: string) => {
        symlinked.push(dst);
      }
    });
    expect(snapshot.trackedFileCount).toBe(3);
    expect(snapshot.symlinkFiles).toEqual(['link.txt']);
    expect(snapshot.missingFiles).toEqual(['gone.txt']);
    expect(copied).toHaveLength(1);
    expect(symlinked).toHaveLength(1);
  });

  it('createTrackedWorktreeSnapshot throws when git ls-files fails', () => {
    const snapshotFn = createTrackedWorktreeSnapshot as unknown as (
      repoRoot: string,
      deps: Record<string, unknown>
    ) => unknown;
    expect(() =>
      snapshotFn('/repo', { spawnSync: () => ({ status: 1, stderr: 'not a repo' }), tmpdir: () => os.tmpdir() })
    ).toThrow(/enumerate tracked files/);
  });

  it('collectGitContext returns trimmed values or unknown on failure', () => {
    const ok = collectGitContext({
      spawnSync: (_c: string, args: string[]) => {
        const a = args.join(' ');
        if (a.includes('--show-current')) {
          return { status: 0, stdout: 'feature/x\n' };
        }
        if (a.includes('--short=8')) {
          return { status: 0, stdout: 'abcd1234\n' };
        }
        return { status: 0, stdout: 'abcd1234ffff\n' };
      }
    });
    expect(ok).toEqual({ branch: 'feature/x', commit: 'abcd1234', fullCommit: 'abcd1234ffff' });

    const failed = collectGitContext({ spawnSync: () => ({ status: 1, stdout: '', stderr: 'nope' }) });
    expect(failed).toEqual({ branch: 'unknown', commit: 'unknown', fullCommit: 'unknown' });
  });

  it('collectGithubContext fetches only the requested entities via gh', () => {
    const spawnSync = (_c: string, args: string[]) => {
      const a = args.join(' ');
      if (a.startsWith('issue view')) {
        return { status: 0, stdout: JSON.stringify({ number: 5, url: 'u/5' }) };
      }
      if (a.startsWith('pr view')) {
        return { status: 0, stdout: JSON.stringify({ number: 9, url: 'u/9' }) };
      }
      return { status: 1, stdout: '' };
    };
    const full = collectGithubContext({ issue: '5', releasePr: '9', backSyncPr: '9' }, { spawnSync });
    expect(full.issue).toMatchObject({ number: 5 });
    expect(full.releasePr).toMatchObject({ number: 9 });
    expect(full.backSyncPr).toMatchObject({ number: 9 });

    const none = collectGithubContext({}, { spawnSync: () => ({ status: 1, stdout: '' }) });
    expect(none.issue).toBeUndefined();

    // A gh failure -> tryGhJson returns undefined.
    const ghFail = collectGithubContext({ issue: '5' }, { spawnSync: () => ({ status: 1, stdout: '' }) });
    expect(ghFail.issue).toBeUndefined();
  });
});

describe('generateCloseoutEvidence: runner selection + render + command branches (#2333)', () => {
  it('runs the explicit host standards runner and renders host evidence', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '77', '--standards-runner', 'host'],
      { platform: 'win32', cwd: 'C:\\repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync() }
    );
    expect(result.context.standards.runner).toBe('host');
    expect(result.markdown).toContain('Standards runner: host');
  });

  it('runs the explicit docker standards runner and renders the docker image line', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '78', '--standards-runner', 'docker'],
      { platform: 'win32', cwd: 'C:\\repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync() }
    );
    expect(result.context.standards.runner).toBe('docker');
    expect(result.markdown).toContain('Docker image:');
  });

  it('renders supplied release references for a release-kind run', () => {
    const result = generateCloseoutEvidence(
      [
        '--kind', 'release', '--issue', '79', '--standards-runner', 'host',
        '--release-tag', 'v9.9.9',
        '--release-pr', 'https://github.com/x/y/pull/1',
        '--back-sync-pr', 'https://github.com/x/y/pull/2',
        '--marketplace-run', 'https://github.com/x/y/actions/runs/3'
      ],
      { platform: 'win32', cwd: 'C:\\repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync() }
    );
    expect(result.markdown).toContain('Release tag: v9.9.9');
    expect(result.markdown).toContain('Release PR: https://github.com/x/y/pull/1');
    expect(result.markdown).toContain('Back-sync PR: https://github.com/x/y/pull/2');
    expect(result.markdown).toContain('Marketplace workflow run: https://github.com/x/y/actions/runs/3');
  });

  it('normalizes a spawn error object with no message in runCommand', () => {
    const result = runCommand('git', ['status'], { spawnSync: () => ({ error: {} }) });
    expect(result.status).toBe(1);
    expect(result.error).toBe('[object Object]');
  });

  it('retries a transient network failure before succeeding in runCommand', () => {
    let attempts = 0;
    const result = runCommand('git', ['ls-remote'], {
      commandPolicy: { maxAttempts: 2, retryOnTransient: true },
      spawnSync: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 1, stderr: 'connection reset by peer' }
          : { status: 0, stdout: 'ok' };
      }
    });
    expect(attempts).toBe(2);
    expect(result.status).toBe(0);
    expect(result.attempts).toBe(2);
  });

  it('classifies untrusted, missing, and test-fixture DoD evidence sources', () => {
    const untrusted = summarizeDodGateEvidence(
      { evidence: [{ path: 'docs/closeout-notes.md', rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      scorecardDodPass
    );
    expect(untrusted.status).toBe('N/A');
    expect(untrusted.disqualifiedSources[0].classification).toBe('untrusted-source');
    expect(untrusted.source).toBe('disqualified-only');

    const missing = summarizeDodGateEvidence(
      { evidence: [{ rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      scorecardDodPass
    );
    expect(missing.disqualifiedSources[0].classification).toBe('missing-source');

    const testFixture = summarizeDodGateEvidence(
      { evidence: [{ path: 'tests/unit/example.test.ts', rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      scorecardDodPass
    );
    expect(testFixture.disqualifiedSources[0].classification).toBe('test-fixture');
  });

  it('reports "none" as the DoD source when a raw PASS has no evidence at all', () => {
    const none = summarizeDodGateEvidence({ evidence: [] }, scorecardDodPass);
    expect(none.status).toBe('N/A');
    expect(none.source).toBe('none');
  });

  it('marks a release profile successful when every required gate passes', () => {
    const profiles = summarizeReleaseProfileResults([
      { name: `release-profile-${RELEASE_STANDARDS_PROFILES[0]}`, file: 'f.txt', status: 0, stdout: releaseScorecardPass }
    ]);
    expect(profiles[0].success).toBe(true);
    expect(profiles[0].missingGates).toEqual([]);
    expect(profiles[0].failedGates).toEqual([]);
  });

  it('parses the --save-dir option', () => {
    const options = parseArgs(['--kind', 'standards', '--issue', '5', '--save-dir', 'evidence/run']);
    expect(options.saveDir).toBe('evidence/run');
  });

  it('classifies a FAILing DoD scorecard row with only a disqualified source and with none', () => {
    const disqualifiedOnly = summarizeDodGateEvidence(
      { evidence: [{ path: 'out/assurance/scorecard.txt', rule_source: 'GATE:dod:context', matched_text: 'x' }] },
      ['| Gate | Status |', '| --- | --- |', '| dod | FAIL |'].join('\n')
    );
    expect(disqualifiedOnly.status).toBe('FAIL');
    expect(disqualifiedOnly.source).toBe('disqualified-only');

    const none = summarizeDodGateEvidence(
      { evidence: [] },
      ['| Gate | Status |', '| --- | --- |', '| dod | FAIL |'].join('\n')
    );
    expect(none.status).toBe('FAIL');
    expect(none.source).toBe('none');
  });

  it('renders a release run with no supplied references as "not supplied"', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'release', '--issue', '81', '--standards-runner', 'host'],
      { platform: 'win32', cwd: 'C:\\repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync() }
    );
    expect(result.markdown).toContain('Release tag: not supplied');
    expect(result.markdown).toContain('Marketplace workflow run: not supplied');
  });

  it('runs the closeout gates on a non-Windows platform using the plain npm command', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '82', '--standards-runner', 'host', '--run-gates'],
      { platform: 'linux', cwd: '/repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync() }
    );
    // The gate commands resolve to `npm` (not `npm.cmd`) on a non-Windows host.
    const npmGate = result.context.gates?.find((gate) => gate.command.startsWith('npm '));
    expect(npmGate).toBeDefined();
  });

  it('exits nonzero and reports the DoD failure when a gate scorecard row fails', () => {
    const failingScorecard = [
      'Gate Scorecard',
      '| Gate | Status | Confidence | Missing Proof |',
      '| --- | --- | --- | --- |',
      '| coverage | FAIL | High | need coverage evidence |',
      '| doc | PASS | High | - |',
      '| dod | FAIL | Med | - |'
    ].join('\n');
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '90', '--standards-runner', 'host'],
      { platform: 'win32', cwd: 'C:\\repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync({ scorecard: failingScorecard }) }
    );
    // A failing DoD scorecard row blocks closure (exit 1) even when the host
    // standards runner itself completes.
    expect(result.exitCode).toBe(1);
    expect(result.context.closureDecision.closable).toBe(false);
    expect(result.markdown).toContain('dod=');
  });

  it('renders the docker standards summary with image-access detail on a docker run', () => {
    const result = generateCloseoutEvidence(
      ['--kind', 'standards', '--issue', '91', '--standards-runner', 'docker', '--run-gates'],
      { platform: 'win32', cwd: 'C:\\repo', existsSync: () => true, spawnSync: hostSuccessSpawnSync() }
    );
    expect(result.context.standards.runner).toBe('docker');
    expect(result.markdown).toContain('image access=');
  });
});

type SpawnResult = { status?: number | null; stdout?: string; stderr?: string; error?: Error };
type SpawnFn = (command: string, args: string[]) => SpawnResult;

const closeoutExtraExports = require('../../scripts/generateCloseoutEvidence.js') as {
  renderCloseoutMarkdown: (context: Record<string, unknown>) => string;
  runStandardsEvidence: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => { runner: string; success: boolean; failure?: string; hostFailure?: string };
  runHostStandards: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => { runner: string; success: boolean; failure?: string };
  runGateCommands: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => Array<{ name: string; command: string; success: boolean }>;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const { renderCloseoutMarkdown, runStandardsEvidence, runHostStandards, runGateCommands, main } =
  closeoutExtraExports;

describe('generateCloseoutEvidence: render + fallback branch coverage to the 90% floor (#2333)', () => {
  const provenanceAllPass = {
    success: true,
    failure: undefined,
    checks: [{ name: 'GitLab source main', success: true, message: 'GitLab source main resolves to abc.' }],
    skillCache: { success: true, message: 'cache present.', authority: 'non-authoritative-cache' },
    registry: { success: true, message: 'Published Docker workbench image is accessible.' }
  };

  it('renders the standards early-failure summary when standards fail with no summary object', () => {
    // renderStandardsSummary early-returns when the runner failed before producing a
    // summary; the failure fallback ('unknown failure') is used when failure is unset.
    const markdown = renderCloseoutMarkdown({
      options: { kind: 'standards', issue: '5' },
      git: { branch: 'feature/x', fullCommit: 'abcdef0' },
      githubContext: {},
      gates: [{ name: 'check', success: true, command: 'npm run check' }],
      traceabilitySummary: {},
      standards: { runner: 'host', success: false, summary: undefined, failure: undefined },
      provenance: provenanceAllPass,
      closureDecision: { closable: false, reasons: [] }
    });

    expect(markdown).toContain('- Standards runner: host');
    expect(markdown).toContain('- Standards evidence failed: unknown failure');
    // A supplied gates array bypasses the NOT RUN sentinel and renders gate rows.
    expect(markdown).toContain('| check | PASS | npm run check |');
    // An empty traceability summary (inventoryEntries undefined) omits the INFO row.
    expect(markdown).not.toContain('traceability summary | INFO');
    // A passing provenance surface never renders the provenance-decision failure row.
    expect(markdown).not.toContain('| provenance decision | FAIL |');
    expect(markdown).toContain('- Closable: no.');
  });

  it('renders a release docker summary with failure line, release profiles, and provenance decision row', () => {
    const markdown = renderCloseoutMarkdown({
      options: {
        kind: 'release',
        issue: '9',
        releaseTag: undefined,
        releasePr: undefined,
        backSyncPr: undefined,
        marketplaceRun: undefined
      },
      git: { branch: 'develop', fullCommit: 'deadbeef' },
      githubContext: {},
      gates: [{ name: 'check', success: false, command: 'npm run check' }],
      traceabilitySummary: { inventoryEntries: 100, gapEntries: undefined },
      standards: {
        runner: 'docker',
        image: 'img:tag',
        imageAccess: 'present',
        success: false,
        failure: 'docker standards failed',
        summary: {
          runner: 'docker',
          requirementsQuality: { ok: false },
          fileCount: undefined,
          reqSignal: undefined,
          testSignal: undefined,
          coverageGate: undefined,
          docGate: undefined,
          dodGateEvidence: {
            status: 'FAIL',
            scorecardStatus: 'FAIL',
            source: 'none',
            trustedSources: [],
            disqualifiedSources: []
          },
          releaseProfiles: [
            { profile: '26514-review', success: true, gates: [{ gate: 'coverage', status: 'PASS' }] },
            { profile: 'release-gate', success: false, gates: [] }
          ]
        }
      },
      provenance: {
        success: false,
        failure: 'provenance failed',
        checks: [{ name: 'GitHub mirror main', success: false, message: 'GitHub mirror is unavailable.' }],
        skillCache: { success: false, message: 'cache missing.', authority: 'non-authoritative-cache' },
        registry: { success: false, message: 'registry denied.' }
      },
      closureDecision: { closable: false, reasons: [] }
    });

    // The non-early-return path renders the failure line inside the summary list.
    expect(markdown).toContain('- Standards evidence failed: docker standards failed');
    // A docker runner splices in the docker image/access line.
    expect(markdown).toContain('- Docker image: img:tag; image access=present');
    // Unknown/undefined summary metrics fall back to their sentinels.
    expect(markdown).toContain('- Requirements quality: see raw evidence');
    expect(markdown).toContain('coverage=FAIL; doc=FAIL');
    expect(markdown).toContain('- Evidence scan: unknown files; REQ=unknown; TEST=unknown');
    // Release profiles render, including the empty-gates fallback message.
    expect(markdown).toContain('- Release/user-information profiles:');
    expect(markdown).toContain('- 26514-review: PASS (coverage=PASS)');
    expect(markdown).toContain('- release-gate: FAIL (no scorecard gates parsed)');
    // Release references render with 'not supplied' defaults (right-hand fallbacks).
    expect(markdown).toContain('## Release References');
    expect(markdown).toContain('- Release tag: not supplied');
    expect(markdown).toContain('- Release PR: not supplied');
    expect(markdown).toContain('- Back-sync PR: not supplied');
    expect(markdown).toContain('- Marketplace workflow run: not supplied');
    // A failed provenance surface renders the decision row and the INFO traceability row.
    expect(markdown).toContain('| provenance decision | FAIL | provenance failed |');
    expect(markdown).toContain('100 inventory entries; unknown gaps');
  });

  it('runGateCommands honors an injected platform and falls back to process.platform', () => {
    const spawnSync = vi.fn((): SpawnResult => ({ status: 0, stdout: 'ok' }));
    const linuxGates = runGateCommands({}, { platform: 'linux', spawnSync });
    expect(linuxGates.length).toBeGreaterThan(0);
    expect(linuxGates.every((gate) => gate.command.startsWith('npm '))).toBe(true);

    // Omitting deps.platform exercises the process.platform fallback operand.
    const defaultGates = runGateCommands({}, { spawnSync });
    expect(defaultGates.length).toBe(linuxGates.length);
  });

  it('reports an unavailable GitLab source in provenance when the git remote fails', () => {
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITLAB_URL)) {
        return { status: 1, stderr: 'network is unreachable' };
      }
      if (command === 'git' && args[0] === 'ls-remote' && args.includes(STANDARDS_TOOLCHAIN_GITHUB_URL)) {
        return { status: 0, stdout: githubRemoteOk() };
      }
      if (command === 'docker' && args.join(' ') === `manifest inspect ${STANDARDS_TOOLCHAIN_REGISTRY_IMAGE}`) {
        return { status: 0, stdout: json({ schemaVersion: 2 }) };
      }
      return { status: 0, stdout: '' };
    });

    const provenance = verifyStandardsToolchainProvenance({ skillRoot: '/skills' }, { existsSync: () => true, spawnSync });
    const gitlabCheck = provenance.checks.find((check) => check.name === 'GitLab source main');

    expect(gitlabCheck?.success).toBe(false);
    expect(gitlabCheck?.message).toContain('GitLab source is unavailable');
    expect(provenance.success).toBe(false);
  });

  it('surfaces the git ls-files error field when creating a snapshot without stderr', () => {
    expect(() =>
      createTrackedWorktreeSnapshot('/repo', {
        spawnSync: () => ({ status: 1, error: new Error('spawn boom') }),
        tmpdir: () => os.tmpdir()
      } as never)
    ).toThrow(/enumerate tracked files/);
  });

  it('resolves the snapshot base to the OS temp dir when the home directory is empty', () => {
    // An empty homedir string forces the `|| ''` fallback and the tmpdir default.
    const base = resolveAuditSnapshotBase({ homedir: () => '', env: {} });
    expect(base).toBe(os.tmpdir());
  });

  it('builds an explicit local Docker image and fails closed when the build fails', () => {
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      if (command === 'docker' && args.join(' ') === `image inspect ${LOCAL_STANDARDS_IMAGE}`) {
        return { status: 1, stderr: 'missing local image' };
      }
      if (command === 'docker' && args[0] === 'build') {
        return { status: 1, stderr: 'build broke' };
      }
      return { status: 0, stdout: '' };
    });

    const result = runDockerStandards(
      { standardsImage: LOCAL_STANDARDS_IMAGE, skillRoot: '/skills', buildStandardsImage: true },
      { spawnSync }
    );

    expect(result.success).toBe(false);
    expect(result.imageAccess).toBe('build-failed');
    expect(result.failure).toContain('build failed');
  });

  it('fails closed when a built local Docker image cannot be inspected afterwards', () => {
    let inspectCalls = 0;
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      if (command === 'docker' && args.join(' ') === `image inspect ${LOCAL_STANDARDS_IMAGE}`) {
        inspectCalls += 1;
        return { status: 1, stderr: 'still missing' };
      }
      if (command === 'docker' && args[0] === 'build') {
        return { status: 0, stdout: 'built' };
      }
      return { status: 0, stdout: '' };
    });

    const result = runDockerStandards(
      { standardsImage: LOCAL_STANDARDS_IMAGE, skillRoot: '/skills', buildStandardsImage: true },
      { spawnSync }
    );

    expect(result.success).toBe(false);
    expect(result.imageAccess).toBe('build-unverified');
    expect(result.failure).toContain('could not be inspected');
    expect(inspectCalls).toBe(2);
  });

  it('runs standards on a freshly built local Docker image (built-local)', () => {
    let inspectCalls = 0;
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      const line = [command, ...args].join(' ');
      if (command === 'docker' && args.join(' ') === `image inspect ${LOCAL_STANDARDS_IMAGE}`) {
        inspectCalls += 1;
        return inspectCalls === 1 ? { status: 1, stderr: 'missing' } : { status: 0, stdout: '[]' };
      }
      if (command === 'docker' && args[0] === 'build') {
        return { status: 0, stdout: 'built' };
      }
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
      return { status: 0, stdout: '' };
    });

    const result = runDockerStandards(
      { standardsImage: LOCAL_STANDARDS_IMAGE, skillRoot: '/skills', buildStandardsImage: true, kind: 'standards' },
      { cwd: '/repo', spawnSync }
    );

    expect(result.success).toBe(true);
    expect(result.imageAccess).toBe('built-local');
    expect(inspectCalls).toBe(2);
  });

  it('summarizes a Docker standards command failure via summarizeStandardsFailure', () => {
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      const line = [command, ...args].join(' ');
      if (command === 'docker' && args.join(' ') === `image inspect ${DEFAULT_STANDARDS_IMAGE}`) {
        return { status: 0, stdout: '[]' };
      }
      if (line.includes('requirements_quality_check.py')) return { status: 1, stderr: 'requirements crashed' };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
      return { status: 0, stdout: '' };
    });

    const result = runDockerStandards(
      { standardsImage: DEFAULT_STANDARDS_IMAGE, skillRoot: '/skills', kind: 'standards' },
      { cwd: '/repo', spawnSync }
    );

    expect(result.success).toBe(false);
    expect(result.failure).toContain('Standards command failures');
    expect(result.failure).toContain('requirements-quality');
  });

  it('summarizes a non-zero release profile command with a command-status detail (host runner)', () => {
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      const line = [command, ...args].join(' ');
      if (line.includes('preflight_local_dependencies.py')) return { status: 0, stdout: preflightOk };
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (
        line.includes('run_assurance.py') &&
        args.some((arg) => RELEASE_STANDARDS_PROFILES.includes(arg))
      ) {
        return { status: 3, stderr: 'profile crashed' };
      }
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
      return { status: 0, stdout: '' };
    });

    const result = runHostStandards({ skillRoot: '/skills', kind: 'release' }, { spawnSync });

    expect(result.success).toBe(false);
    expect(result.failure).toContain('command status 3');
  });

  it('auto runner falls through to a succeeding docker runner after host failure', () => {
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      const line = [command, ...args].join(' ');
      if (line.includes('preflight_local_dependencies.py')) return { status: 1, stderr: 'python3 missing' };
      if (command === 'docker' && args.join(' ').startsWith('image inspect')) return { status: 0, stdout: '[]' };
      if (line.includes('requirements_quality_check.py')) return { status: 0, stdout: requirementsOk };
      if (line.includes('repo_evidence_scan.py')) return { status: 0, stdout: evidenceWithTrustedDod };
      if (line.includes('run_assurance.py')) return { status: 0, stdout: scorecardDodPass };
      return { status: 0, stdout: '' };
    });

    const result = runStandardsEvidence(
      { standardsRunner: 'auto', kind: 'standards', standardsImage: DEFAULT_STANDARDS_IMAGE, skillRoot: '/skills' },
      { cwd: '/repo', spawnSync }
    );

    expect(result.runner).toBe('docker');
    expect(result.success).toBe(true);
    // The host failure message is carried onto the docker result.
    expect(result.hostFailure).toBeTruthy();
  });

  it('auto runner returns a combined failure when host and docker both fail', () => {
    const spawnSync = vi.fn((command: string, args: string[]): SpawnResult => {
      const line = [command, ...args].join(' ');
      if (line.includes('preflight_local_dependencies.py')) return { status: 1, stderr: 'python3 missing' };
      if (command === 'docker' && args.join(' ') === `image inspect ${DEFAULT_STANDARDS_IMAGE}`) {
        return { status: 1, stderr: 'missing' };
      }
      if (command === 'docker' && args[0] === 'pull') return { status: 1, stderr: 'denied' };
      return { status: 1, stderr: 'unexpected' };
    });

    const result = runStandardsEvidence(
      { standardsRunner: 'auto', kind: 'standards', standardsImage: DEFAULT_STANDARDS_IMAGE, skillRoot: '/skills' },
      { cwd: '/repo', spawnSync }
    );

    expect(result.runner).toBe('auto');
    expect(result.success).toBe(false);
    expect(result.failure).toContain('Standards evidence failed through host and Docker');
  });

  it('rejects a --save-dir that resolves outside the repository root', () => {
    const spawnSync = vi.fn();
    expect(() =>
      generateCloseoutEvidence(['--kind', 'standards', '--save-dir', '../outside-the-repo'], { spawnSync })
    ).toThrow(/inside the repository root/);
    // The guard rejects before any command is spawned.
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('rejects a --save-dir equal to the repository root', () => {
    const spawnSync = vi.fn();
    expect(() => generateCloseoutEvidence(['--kind', 'standards', '--save-dir', '.'], { spawnSync })).toThrow(
      /inside the repository root/
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns usage text for --help without deps and without spawning anything', () => {
    // No deps object is passed, exercising the generateCloseoutEvidence deps default.
    const result = generateCloseoutEvidence(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain('Usage: node scripts/generateCloseoutEvidence.js');
  });

  it('publishes the schema for --schema without deps', () => {
    const result = generateCloseoutEvidence(['--schema']);
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.markdown) as { $id: string }).$id).toBe(CLOSEOUT_SUMMARY_SCHEMA_ID);
  });

  it('main writes markdown and returns the exit code on success', () => {
    // No deps object is passed, exercising the main deps default parameter.
    expect(main(['--help'])).toBe(0);
  });

  it('main uses process.argv by default and returns 1 when parsing fails', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'generateCloseoutEvidence.js', '--kind', 'bogus-kind'];
    try {
      // Calling main() with no arguments exercises the argv default (process.argv.slice(2))
      // and the catch path; the invalid --kind throws before any command is spawned.
      expect(main()).toBe(1);
    } finally {
      process.argv = originalArgv;
    }
  });
});
