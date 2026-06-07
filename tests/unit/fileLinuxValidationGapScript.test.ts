import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

interface IssueContent {
  title: string;
  body: string;
  labels: string[];
}

const {
  DEFAULT_REPO,
  DEFAULT_LABELS,
  isValidRepoSlug,
  isAllowedExecutableCommand,
  parseArgs,
  usage,
  readRunEvidence,
  detectGap,
  composeIssueContent,
  buildGhIssueCreateArgs,
  fileIssue,
  main
} = require('../../scripts/fileLinuxValidationGap.js') as {
  DEFAULT_REPO: string;
  DEFAULT_LABELS: string[];
  isValidRepoSlug: (repo: string) => boolean;
  isAllowedExecutableCommand: (command: string) => boolean;
  parseArgs: (argv: string[]) => {
    runDir?: string;
    note?: string;
    expectedBlock?: string;
    repo: string;
    dryRun: boolean;
    help: boolean;
  };
  usage: () => string;
  readRunEvidence: (
    runDir: string,
    deps?: { readFileSync?: unknown; existsSync?: unknown }
  ) => {
    runDir: string;
    metadataPresent: boolean;
    manifestPresent: boolean;
    provider?: string;
    reportStatus?: string;
    runtimeState?: string;
    failureReason?: string;
    blockedReason?: string;
    attempted?: boolean;
    reportExists?: boolean;
    manifestEntries: Array<{ kind?: string; filename?: string }>;
    hasFailureClassification: boolean;
  };
  detectGap: (
    evidence: Record<string, unknown>,
    options?: { note?: string; expectedBlock?: string }
  ) => { severity: 'hard' | 'observational' | 'none'; reasons: string[] };
  composeIssueContent: (
    evidence: Record<string, unknown>,
    gap: { severity: string; reasons: string[] },
    options?: { note?: string }
  ) => IssueContent;
  buildGhIssueCreateArgs: (content: IssueContent, repo: string, bodyFilePath: string) => string[];
  fileIssue: (
    content: IssueContent,
    options: { runDir: string; repo: string; dryRun: boolean },
    deps?: { writeFileSync?: unknown; spawnSync?: unknown }
  ) => { filed: boolean; bodyFilePath: string; title: string; labels: string[]; url?: string };
  main: (argv: string[], deps?: Record<string, unknown>) => void;
};

const RUN_DIR = '/tmp/run';
const METADATA_PATH = path.join(RUN_DIR, 'report-metadata.json');
const MANIFEST_PATH = path.join(RUN_DIR, 'diagnostics', 'diagnostics-manifest.json');

function fakeFs(files: Record<string, string>) {
  return {
    existsSync: (filePath: string) => Object.prototype.hasOwnProperty.call(files, filePath),
    readFileSync: (filePath: string) => {
      if (!Object.prototype.hasOwnProperty.call(files, filePath)) {
        throw new Error(`unexpected read: ${filePath}`);
      }
      return files[filePath];
    }
  };
}

function metadata(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    reportStatus: 'ready-for-runtime',
    runtimeSelection: { provider: 'host-native' },
    runtimeExecution: {
      state: 'succeeded',
      attempted: true,
      reportExists: true,
      failureReason: undefined,
      ...overrides
    }
  });
}

function manifest(entries: Array<{ kind: string; filename: string }>) {
  return JSON.stringify({
    schemaVersion: 1,
    entries
  });
}

describe('fileLinuxValidationGap parseArgs', () => {
  it('parses a full argument set', () => {
    const options = parseArgs([
      '--run-dir',
      RUN_DIR,
      '--note',
      'case mismatch on Dependencies',
      '--expected-block',
      'linux-vi-server-tcp-disabled',
      '--repo',
      'owner/repo',
      '--dry-run'
    ]);
    expect(options).toMatchObject({
      runDir: RUN_DIR,
      note: 'case mismatch on Dependencies',
      expectedBlock: 'linux-vi-server-tcp-disabled',
      repo: 'owner/repo',
      dryRun: true
    });
  });

  it('defaults the repo and requires a run dir', () => {
    expect(() => parseArgs([])).toThrow(/--run-dir is required/);
    expect(parseArgs(['--run-dir', RUN_DIR]).repo).toBe(DEFAULT_REPO);
  });

  it('rejects an invalid repo slug and unknown arguments', () => {
    expect(() => parseArgs(['--run-dir', RUN_DIR, '--repo', 'not-a-slug'])).toThrow(/owner\/repo/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });

  it('returns help without requiring a run dir', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(usage()).toContain('--run-dir');
  });
});

describe('fileLinuxValidationGap guards', () => {
  it('validates repo slugs', () => {
    expect(isValidRepoSlug('owner/repo')).toBe(true);
    expect(isValidRepoSlug('owner')).toBe(false);
    expect(isValidRepoSlug('a/b/c')).toBe(false);
  });

  it('only allow-lists gh', () => {
    expect(isAllowedExecutableCommand('gh')).toBe(true);
    expect(isAllowedExecutableCommand('rm')).toBe(false);
  });
});

describe('fileLinuxValidationGap readRunEvidence', () => {
  it('reads provider, runtime state, and manifest entries', () => {
    const deps = fakeFs({
      [METADATA_PATH]: metadata({ state: 'failed', failureReason: 'report-finalize-failed' }),
      [MANIFEST_PATH]: manifest([
        { kind: 'environment-fingerprint', filename: 'environment-fingerprint.json' },
        { kind: 'failure-classification', filename: 'failure-classification.json' }
      ])
    });
    const evidence = readRunEvidence(RUN_DIR, deps);
    expect(evidence).toMatchObject({
      metadataPresent: true,
      manifestPresent: true,
      provider: 'host-native',
      runtimeState: 'failed',
      failureReason: 'report-finalize-failed',
      hasFailureClassification: true
    });
    expect(evidence.manifestEntries).toHaveLength(2);
  });

  it('flags missing metadata without throwing', () => {
    const evidence = readRunEvidence(RUN_DIR, fakeFs({}));
    expect(evidence.metadataPresent).toBe(false);
    expect(evidence.manifestPresent).toBe(false);
  });
});

describe('fileLinuxValidationGap detectGap', () => {
  const base = {
    runDir: RUN_DIR,
    metadataPresent: true,
    manifestPresent: true,
    manifestEntries: [],
    hasFailureClassification: false
  };

  it('treats an unexpected failure as a hard gap', () => {
    const gap = detectGap({ ...base, runtimeState: 'failed', failureReason: 'command-spawn-failed' }, {});
    expect(gap.severity).toBe('hard');
  });

  it('treats a matched expected-block failure as no gap', () => {
    const gap = detectGap(
      { ...base, runtimeState: 'failed', failureReason: 'linux-vi-server-tcp-disabled' },
      { expectedBlock: 'linux-vi-server-tcp-disabled' }
    );
    expect(gap.severity).toBe('none');
  });

  it('treats success without a report as a hard gap', () => {
    const gap = detectGap({ ...base, runtimeState: 'succeeded', reportExists: false }, {});
    expect(gap.severity).toBe('hard');
  });

  it('files an observational gap when a note is supplied on a clean run', () => {
    const gap = detectGap(
      { ...base, runtimeState: 'succeeded', reportExists: true },
      { note: 'Dependencies folder cased differently on disk' }
    );
    expect(gap.severity).toBe('observational');
  });

  it('reports no gap for a clean run with no note', () => {
    const gap = detectGap({ ...base, runtimeState: 'succeeded', reportExists: true }, {});
    expect(gap.severity).toBe('none');
  });
});

describe('fileLinuxValidationGap composeIssueContent', () => {
  it('embeds the run facts and references the validation issue', () => {
    const evidence = readRunEvidence(
      RUN_DIR,
      fakeFs({
        [METADATA_PATH]: metadata({ state: 'failed', failureReason: 'report-finalize-failed' }),
        [MANIFEST_PATH]: manifest([
          { kind: 'failure-classification', filename: 'failure-classification.json' }
        ])
      })
    );
    const gap = detectGap(evidence, {});
    const content = composeIssueContent(evidence, gap, {});
    expect(content.title).toContain('host-native');
    expect(content.title).toContain('report-finalize-failed');
    expect(content.body).toContain('#259');
    expect(content.body).toContain('report-finalize-failed');
    expect(content.body).toContain(RUN_DIR);
    expect(content.body).toContain('failure-classification');
    expect(content.labels).toEqual([...DEFAULT_LABELS]);
  });

  it('uses the operator note for an observational gap', () => {
    const evidence = readRunEvidence(
      RUN_DIR,
      fakeFs({ [METADATA_PATH]: metadata(), [MANIFEST_PATH]: manifest([]) })
    );
    const note = 'Dependencies folder cased differently on disk';
    const gap = detectGap(evidence, { note });
    const content = composeIssueContent(evidence, gap, { note });
    expect(content.body).toContain('Operator note');
    expect(content.body).toContain(note);
  });
});

describe('fileLinuxValidationGap fileIssue', () => {
  const content = {
    title: 'Linux validation gap (host-native): report-finalize-failed',
    body: '## Summary\nbody',
    labels: ['copilot-target', 'bug']
  };

  it('builds gh issue create args with repo, title, labels, and body file', () => {
    const args = buildGhIssueCreateArgs(content, 'owner/repo', '/tmp/run/body.md');
    expect(args).toEqual([
      'issue',
      'create',
      '--repo',
      'owner/repo',
      '--title',
      content.title,
      '--label',
      'copilot-target',
      '--label',
      'bug',
      '--body-file',
      '/tmp/run/body.md'
    ]);
  });

  it('writes the body file and spawns gh on a real file', () => {
    const writeFileSync = vi.fn();
    const spawnSync = vi.fn().mockReturnValue({ status: 0, stdout: 'https://issue/1\n', stderr: '' });
    const result = fileIssue(
      content,
      { runDir: RUN_DIR, repo: 'owner/repo', dryRun: false },
      { writeFileSync, spawnSync }
    );
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'create']), expect.any(Object));
    expect(result).toMatchObject({ filed: true, url: 'https://issue/1' });
  });

  it('does not spawn on a dry run', () => {
    const writeFileSync = vi.fn();
    const spawnSync = vi.fn();
    const result = fileIssue(
      content,
      { runDir: RUN_DIR, repo: 'owner/repo', dryRun: true },
      { writeFileSync, spawnSync }
    );
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(result.filed).toBe(false);
  });

  it('throws when gh exits nonzero', () => {
    const writeFileSync = vi.fn();
    const spawnSync = vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: 'auth required' });
    expect(() =>
      fileIssue(
        content,
        { runDir: RUN_DIR, repo: 'owner/repo', dryRun: false },
        { writeFileSync, spawnSync }
      )
    ).toThrow(/auth required/);
  });
});

describe('fileLinuxValidationGap main', () => {
  it('files nothing for a clean run', () => {
    const writes: string[] = [];
    const spawnSync = vi.fn();
    main(['--run-dir', RUN_DIR], {
      ...fakeFs({ [METADATA_PATH]: metadata(), [MANIFEST_PATH]: manifest([]) }),
      writeFileSync: vi.fn(),
      spawnSync,
      stdout: { write: (text: string) => writes.push(text) }
    });
    expect(spawnSync).not.toHaveBeenCalled();
    expect(writes.join('')).toContain('Nothing filed');
  });

  it('files a hard gap end to end', () => {
    const writes: string[] = [];
    const spawnSync = vi.fn().mockReturnValue({ status: 0, stdout: 'https://issue/9\n', stderr: '' });
    main(['--run-dir', RUN_DIR], {
      ...fakeFs({
        [METADATA_PATH]: metadata({ state: 'failed', failureReason: 'command-spawn-failed' }),
        [MANIFEST_PATH]: manifest([])
      }),
      writeFileSync: vi.fn(),
      spawnSync,
      stdout: { write: (text: string) => writes.push(text) }
    });
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(writes.join('')).toContain('https://issue/9');
  });
});
