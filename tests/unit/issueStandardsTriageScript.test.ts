import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  DEFAULT_REPO,
  DEFAULT_SAVE_DIR,
  TRIAGE_SUMMARY_SCHEMA_ID,
  TRIAGE_SUMMARY_JSON_SCHEMA,
  ISSUE_JSON_FIELDS,
  parseArgs,
  renderSchema,
  issueViewArgs,
  standardsDockerSteps,
  replaceSnapshotMount,
  runIssueStandardsTriage
} = require('../../scripts/runIssueStandardsTriage.js') as {
  DEFAULT_REPO: string;
  DEFAULT_SAVE_DIR: string;
  TRIAGE_SUMMARY_SCHEMA_ID: string;
  TRIAGE_SUMMARY_JSON_SCHEMA: { required: string[]; properties: Record<string, { const?: unknown }> };
  ISSUE_JSON_FIELDS: string[];
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
  renderSchema: (options?: { provenance?: unknown }) => string;
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
  ) => {
    exitCode: number;
    markdown: string;
    context: {
      outputDir: string;
      imageAccess?: string;
      imagePreparation?: Array<{ name: string; status: number }>;
      standards: Array<{ status: number }>;
    };
  };
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

describe('issue standards triage script (VHS-REQ-700.2)', () => {
  it('parses defaults and accepts the issue as a positional argument', () => {
    const options = parseArgs(['1040']);

    expect(options.issue).toBe('1040');
    expect(options.repo).toBe(DEFAULT_REPO);
    expect(options.profile).toBe('quick-triage');
    expect(options.requirementsSpecScope).toBe('system');
    expect(options.saveDir).toBe(DEFAULT_SAVE_DIR);
    expect(options.skipIssueFetch).toBe(false);
  });

  it('publishes the triage-summary JSON Schema via --schema without fetching or spawning (VHS-REQ-601)', () => {
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };
    expect(schema.$id).toBe(TRIAGE_SUMMARY_SCHEMA_ID);
    expect(schema.properties.$schema.const).toBe(TRIAGE_SUMMARY_SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(1);

    // --schema attaches provenance under the shared extension key.
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });

    // --schema does not require --issue and never spawns docker/gh.
    const spawnSync = vi.fn();
    const result = runIssueStandardsTriage(['--schema'], { spawnSync });
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.markdown) as Record<string, unknown>).$id).toBe(TRIAGE_SUMMARY_SCHEMA_ID);
    expect(spawnSync).not.toHaveBeenCalled();
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
            author: { login: 'copilot' },
            body: 'Use standards review locally.',
            createdAt: '2026-07-14T00:00:00Z',
            labels: [{ name: 'enhancement' }],
            milestone: { title: 'MVP' },
            number: 1040,
            state: 'OPEN',
            title: 'Add local standards-review issue triage helper',
            updatedAt: '2026-07-14T01:00:00Z',
            url: 'https://example.test/issues/1040'
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
        return {
          status: 0,
          stdout: [
            'Gate Scorecard',
            '| Gate | Status |',
            '| --- | --- |',
            '| req | PASS |',
            '| test | PASS |'
          ].join('\n')
        };
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
    const issueJsonPath = path.join(root, 'evidence', 'issue-1040', 'issue.json');
    expect(fs.existsSync(issueJsonPath)).toBe(true);
    const retainedIssue = JSON.parse(fs.readFileSync(issueJsonPath, 'utf8')) as {
      author: { login: string };
      body: string;
      createdAt: string;
      labels: Array<{ name: string }>;
      milestone: { title: string };
      number: number;
      state: string;
      title: string;
      updatedAt: string;
      url: string;
    };
    expect(fs.readFileSync(path.join(root, 'evidence', 'issue-1040', 'assurance-scorecard.txt'), 'utf8')).toContain('| req | PASS |');
    const triageSummaryPath = path.join(root, 'evidence', 'issue-1040', 'triage-summary.json');
    expect(fs.existsSync(triageSummaryPath)).toBe(true);
    const triageSummary = JSON.parse(fs.readFileSync(triageSummaryPath, 'utf8')) as {
      $schema: string;
      schemaVersion: number;
      options: {
        issue: string;
        repo: string;
        image: string;
        profile: string;
        requirementsSpecScope: string;
        saveDir: string;
        skipIssueFetch: boolean;
        keepSnapshot: boolean;
        help: boolean;
      };
      outputDir: string;
      issue: {
        skipped: boolean;
        status: number;
        json: {
          author: { login: string };
          body: string;
          createdAt: string;
          labels: Array<{ name: string }>;
          milestone: { title: string };
          number: number;
          state: string;
          title: string;
          updatedAt: string;
          url: string;
        };
        command: string;
      };
      imageInspect: { status: number; command: string };
      imageAccess: string;
      imagePreparation: Array<{ name: string; file: string; status: number; command: string }>;
      snapshot: {
        mode: string;
        path: string;
        trackedFileCount: number;
        symlinkFiles: string[];
        missingFiles: string[];
        generatedRootsExcluded: string[];
        removed: boolean;
      };
      standards: Array<{
        name: string;
        status: number;
        file: string;
        command: string;
        requirementsQuality?: { ok: boolean; findingCount: number };
        evidenceScan?: { fileCount: number; areas: Record<string, string> };
        scorecard?: Record<string, string>;
      }>;
      success: boolean;
    };
    const requirementsQuality = triageSummary.standards.find((step) => step.name === 'requirements-quality')!;
    const evidenceScan = triageSummary.standards.find((step) => step.name === 'evidence-scan')!;
    const assuranceScorecard = triageSummary.standards.find((step) => step.name === 'assurance-scorecard')!;
    expect(Object.keys(triageSummary)).toEqual([
      '$schema',
      'schemaVersion',
      'options',
      'outputDir',
      'issue',
      'imageInspect',
      'imageAccess',
      'imagePreparation',
      'snapshot',
      'standards',
      'success'
    ]);
    // The retained packet self-describes and satisfies the published schema contract (no drift).
    expect(triageSummary.$schema).toBe(TRIAGE_SUMMARY_SCHEMA_ID);
    expect(TRIAGE_SUMMARY_JSON_SCHEMA.required.filter((key) => !(key in triageSummary))).toEqual([]);
    expect(triageSummary.$schema).toBe(
      (TRIAGE_SUMMARY_JSON_SCHEMA.properties.$schema as { const: string }).const
    );
    expect(Object.keys(triageSummary.options)).toEqual([
      'issue',
      'repo',
      'image',
      'profile',
      'requirementsSpecScope',
      'saveDir',
      'skipIssueFetch',
      'keepSnapshot',
      'schema',
      'help'
    ]);
    expect(Object.keys(retainedIssue)).toEqual(ISSUE_JSON_FIELDS);
    expect(Object.keys(retainedIssue.author)).toEqual(['login']);
    expect(Object.keys(retainedIssue.labels[0])).toEqual(['name']);
    expect(Object.keys(retainedIssue.milestone)).toEqual(['title']);
    expect(Object.keys(triageSummary.issue)).toEqual(['skipped', 'status', 'json', 'command']);
    expect(Object.keys(triageSummary.issue.json)).toEqual(ISSUE_JSON_FIELDS);
    expect(triageSummary.issue.json).toEqual(retainedIssue);
    expect(Object.keys(triageSummary.issue.json.author)).toEqual(['login']);
    expect(Object.keys(triageSummary.issue.json.labels[0])).toEqual(['name']);
    expect(Object.keys(triageSummary.imageInspect)).toEqual(['status', 'command']);
    expect(Object.keys(triageSummary.imagePreparation[0])).toEqual(['name', 'file', 'status', 'command']);
    expect(Object.keys(triageSummary.snapshot)).toEqual([
      'mode',
      'path',
      'trackedFileCount',
      'symlinkFiles',
      'missingFiles',
      'generatedRootsExcluded',
      'removed'
    ]);
    expect(Object.keys(requirementsQuality)).toEqual([
      'name',
      'status',
      'file',
      'command',
      'requirementsQuality'
    ]);
    expect(Object.keys(requirementsQuality.requirementsQuality ?? {})).toEqual(['ok', 'findingCount']);
    expect(Object.keys(evidenceScan)).toEqual(['name', 'status', 'file', 'command', 'evidenceScan']);
    expect(Object.keys(evidenceScan.evidenceScan ?? {})).toEqual(['fileCount', 'areas']);
    expect(Object.keys(evidenceScan.evidenceScan?.areas ?? {})).toEqual(['REQ']);
    expect(Object.keys(assuranceScorecard)).toEqual(['name', 'status', 'file', 'command', 'scorecard']);
    expect(Object.keys(assuranceScorecard.scorecard ?? {})).toEqual(['req', 'test']);
    expect(triageSummary.schemaVersion).toBe(1);
    expect(triageSummary.success).toBe(true);
    expect(calls.filter((call) => call.command === 'docker' && call.args[0] === 'run')).toHaveLength(3);
    expect(calls.some((call) => call.args.includes(`${snapshotPath}:/target`))).toBe(true);
    expect(removeTrackedWorktreeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: snapshotPath }),
      expect.any(Object)
    );
  });

  it('pulls the default standards image after an inspect miss', () => {
    const root = makeTempRoot();
    const snapshotPath = path.join(root, 'snapshot');
    let inspectCount = 0;
    const calls: Array<{ command: string; args: string[] }> = [];
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === 'docker' && args[0] === 'image') {
        inspectCount += 1;
        return inspectCount === 1
          ? { status: 1, stderr: 'No such image' }
          : { status: 0, stdout: '[{"Id":"pulled-image"}]' };
      }
      if (command === 'docker' && args[0] === 'pull') {
        return { status: 0, stdout: 'Downloaded newer image' };
      }
      if (args.includes('scripts/requirements_quality_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [] }) };
      }
      if (args.includes('scripts/repo_evidence_scan.py')) {
        return { status: 0, stdout: JSON.stringify({ inventory: { file_count: 2 }, areas: {} }) };
      }
      if (args.includes('scripts/run_assurance.py')) {
        return { status: 0, stdout: 'REQ: PASS\n' };
      }
      return { status: 99, stderr: `unexpected ${command} ${args.join(' ')}` };
    });

    const result = runIssueStandardsTriage(
      ['--issue', '1042', '--skip-issue-fetch', '--save-dir', path.join(root, 'evidence')],
      {
        cwd: repoRoot,
        spawnSync,
        createTrackedWorktreeSnapshot: () => ({
          mode: 'tracked-worktree-snapshot',
          path: snapshotPath,
          trackedFileCount: 2,
          symlinkFiles: [],
          missingFiles: [],
          generatedRootsExcluded: []
        }),
        removeTrackedWorktreeSnapshot: vi.fn()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.context.imageAccess).toBe('pulled');
    expect(result.context.imagePreparation?.map((step) => step.name)).toEqual([
      'docker-image-inspect',
      'docker-image-pull',
      'docker-image-after-pull'
    ]);
    expect(calls.filter((call) => call.command === 'docker' && call.args[0] === 'pull')).toHaveLength(1);
    expect(calls.filter((call) => call.command === 'docker' && call.args[0] === 'run')).toHaveLength(3);
    expect(fs.readFileSync(path.join(root, 'evidence', 'issue-1042', 'docker-image-pull.stdout.txt'), 'utf8')).toContain('Downloaded newer image');
  });

  it('fails fast when an explicit standards Docker image override is unavailable', () => {
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

    const result = runIssueStandardsTriage(['--issue', '1040', '--image', 'local/missing:image', '--save-dir', path.join(root, 'evidence')], {
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
    expect(spawnSync.mock.calls.filter(([command, args]) => command === 'docker' && args[0] === 'pull')).toHaveLength(0);
    expect(spawnSync.mock.calls.filter(([command, args]) => command === 'docker' && args[0] === 'run')).toHaveLength(0);
    expect(fs.readFileSync(path.join(root, 'evidence', 'issue-1040', 'docker-image-inspect.stderr.txt'), 'utf8')).toContain('No such image');
  });
});