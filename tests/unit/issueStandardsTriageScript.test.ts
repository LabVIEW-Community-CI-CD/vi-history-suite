import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  DEFAULT_REPO,
  DEFAULT_SAVE_DIR,
  parseArgs,
  issueViewArgs,
  standardsDockerSteps,
  replaceSnapshotMount,
  runIssueStandardsTriage
} = require('../../scripts/runIssueStandardsTriage.js') as {
  DEFAULT_REPO: string;
  DEFAULT_SAVE_DIR: string;
  parseArgs: (argv: string[]) => {
    issue?: string;
    repo: string;
    image: string;
    profile: string;
    requirementsSpecScope: string;
    saveDir: string;
    skipIssueFetch: boolean;
    keepSnapshot: boolean;
    help: boolean;
  };
  issueViewArgs: (issue: string, repo: string) => string[];
  standardsDockerSteps: (options: {
    image: string;
    profile: string;
    requirementsSpecScope: string;
  }) => Array<{ name: string; file: string; command: string; args: string[] }>;
  replaceSnapshotMount: (args: string[], snapshotPath: string) => string[];
  runIssueStandardsTriage: (
    argv: string[],
    deps: {
      cwd?: string;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean; timeout?: number }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
      createTrackedWorktreeSnapshot?: (repoRoot: string) => {
        mode: string;
        path: string;
        trackedFileCount: number;
        symlinkFiles: string[];
        missingFiles: string[];
        generatedRootsExcluded: string[];
      };
      removeTrackedWorktreeSnapshot?: (snapshot: { path: string }) => void;
    }
  ) => { exitCode: number; markdown: string; context: { outputDir: string; standards: Array<{ status: number }> } };
};

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-standards-triage-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('issue standards triage script', () => {
  it('parses defaults and accepts the issue as a positional argument', () => {
    const options = parseArgs(['1040']);

    expect(options.issue).toBe('1040');
    expect(options.repo).toBe(DEFAULT_REPO);
    expect(options.profile).toBe('quick-triage');
    expect(options.requirementsSpecScope).toBe('system');
    expect(options.saveDir).toBe(DEFAULT_SAVE_DIR);
    expect(options.skipIssueFetch).toBe(false);
  });

  it('builds issue and Docker standards commands with explicit profile and scope', () => {
    expect(issueViewArgs('1040', 'owner/repo')).toEqual([
      'issue',
      'view',
      '1040',
      '--repo',
      'owner/repo',
      '--json',
      'author,body,createdAt,labels,milestone,number,state,title,updatedAt,url'
    ]);

    const steps = standardsDockerSteps({
      image: 'registry/image:tag',
      profile: 'release-gate',
      requirementsSpecScope: 'system'
    });
    expect(steps.map((step) => step.name)).toEqual([
      'requirements-quality',
      'evidence-scan',
      'assurance-scorecard'
    ]);
    expect(steps[0].args).toContain('scripts/requirements_quality_check.py');
    expect(steps[1].args).toContain('release-gate');
    expect(steps[2].args).toContain('gate-scorecard');
    expect(replaceSnapshotMount(steps[0].args, '/home/user/snapshot')).toContain('/home/user/snapshot:/target');
  });

  it('captures issue metadata and standards artifacts from a tracked snapshot', () => {
    const root = makeTempRoot();
    const snapshotPath = path.join(root, 'snapshot');
    fs.mkdirSync(snapshotPath, { recursive: true });
    const calls: Array<{ command: string; args: string[] }> = [];
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === 'gh') {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 1040,
            title: 'Add local standards-review issue triage helper',
            state: 'OPEN',
            url: 'https://example.test/issues/1040',
            labels: [{ name: 'enhancement' }],
            body: 'Use standards review locally.'
          })
        };
      }
      if (command === 'docker' && args[0] === 'image') {
        return { status: 0, stdout: '[{"Id":"image"}]' };
      }
      if (args.includes('scripts/requirements_quality_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [] }) };
      }
      if (args.includes('scripts/repo_evidence_scan.py')) {
        return {
          status: 0,
          stdout: JSON.stringify({ inventory: { file_count: 3 }, areas: { REQ: { signal: 'strong' } } })
        };
      }
      if (args.includes('scripts/run_assurance.py')) {
        return { status: 0, stdout: 'REQ: PASS\nTEST: PASS\n' };
      }
      return { status: 99, stderr: `unexpected ${command} ${args.join(' ')}` };
    });
    const createTrackedWorktreeSnapshot = vi.fn(() => ({
      mode: 'tracked-worktree-snapshot',
      path: snapshotPath,
      trackedFileCount: 3,
      symlinkFiles: [],
      missingFiles: [],
      generatedRootsExcluded: []
    }));
    const removeTrackedWorktreeSnapshot = vi.fn();

    const result = runIssueStandardsTriage(['--issue', '1040', '--save-dir', path.join(root, 'evidence')], {
      cwd: repoRoot,
      spawnSync,
      createTrackedWorktreeSnapshot,
      removeTrackedWorktreeSnapshot
    });

    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain('Issue: #1040 Add local standards-review issue triage helper');
    expect(result.markdown).toContain('REQ=strong');
    expect(fs.existsSync(path.join(root, 'evidence', 'issue-1040', 'issue.json'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'evidence', 'issue-1040', 'assurance-scorecard.txt'), 'utf8')).toContain('REQ: PASS');
    expect(fs.existsSync(path.join(root, 'evidence', 'issue-1040', 'triage-summary.json'))).toBe(true);
    expect(calls.filter((call) => call.command === 'docker' && call.args[0] === 'run')).toHaveLength(3);
    expect(calls.some((call) => call.args.includes(`${snapshotPath}:/target`))).toBe(true);
    expect(removeTrackedWorktreeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: snapshotPath }),
      expect.any(Object)
    );
  });

  it('fails fast when the standards Docker image is unavailable', () => {
    const root = makeTempRoot();
    const snapshotPath = path.join(root, 'snapshot');
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'gh') {
        return { status: 0, stdout: JSON.stringify({ number: 1040, title: 'Issue', state: 'OPEN' }) };
      }
      if (command === 'docker' && args[0] === 'image') {
        return { status: 1, stderr: 'No such image' };
      }
      return { status: 99, stderr: 'docker run should not execute' };
    });

    const result = runIssueStandardsTriage(['--issue', '1040', '--save-dir', path.join(root, 'evidence')], {
      cwd: repoRoot,
      spawnSync,
      createTrackedWorktreeSnapshot: () => ({
        mode: 'tracked-worktree-snapshot',
        path: snapshotPath,
        trackedFileCount: 1,
        symlinkFiles: [],
        missingFiles: [],
        generatedRootsExcluded: []
      }),
      removeTrackedWorktreeSnapshot: vi.fn()
    });

    expect(result.exitCode).toBe(1);
    expect(result.context.standards).toEqual([]);
    expect(spawnSync.mock.calls.filter(([command, args]) => command === 'docker' && args[0] === 'run')).toHaveLength(0);
    expect(fs.readFileSync(path.join(root, 'evidence', 'issue-1040', 'docker-image-inspect.stderr.txt'), 'utf8')).toContain('No such image');
  });
});