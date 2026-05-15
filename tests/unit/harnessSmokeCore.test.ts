import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as path from 'node:path';

import { HARNESS_VHS_001 } from '../../src/harness/canonicalHarnesses';
import {
  ensureHarnessClone,
  runHarnessSmoke
} from '../../src/harness/harnessSmoke';

function createGovernedRunGitMock(options: {
  remoteUrl?: string;
  status?: string;
  trackedTarget?: string;
  head?: string;
} = {}) {
  return vi.fn(async (args: string[], _cwd?: string) => {
    const command = args.join(' ');
    if (command === 'config --global --add safe.directory /tmp/harnesses/ni-labview-icon-editor') {
      return '';
    }
    if (command === 'remote get-url origin') {
      return options.remoteUrl ?? 'https://github.com/ni/labview-icon-editor.git\n';
    }
    if (command === 'status --porcelain') {
      return options.status ?? '';
    }
    if (
      command ===
      'ls-files --error-unmatch Tooling/deployment/VIP_Pre-Install Custom Action.vi'
    ) {
      return options.trackedTarget ?? 'Tooling/deployment/VIP_Pre-Install Custom Action.vi\n';
    }
    if (command === 'rev-parse HEAD') {
      return options.head ?? 'abcdef1234567890abcdef1234567890abcdef12\n';
    }
    throw new Error(`unexpected git command: ${command}`);
  });
}

describe('ensureHarnessClone', () => {
  it('reuses an existing governed cache when identity, cleanliness, and target tracking match', async () => {
    const stat = vi.fn().mockResolvedValue({
      isDirectory: () => true
    });
    const mkdir = vi.fn();
    const runGit = createGovernedRunGitMock();
    const writes = new Map<string, string>();

    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat,
        mkdir,
        runGit,
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never,
        now: () => '2026-05-15T13:30:00.000Z'
      })
    ).resolves.toBe(path.join('/tmp/harnesses', 'ni-labview-icon-editor'));

    expect(stat).toHaveBeenCalledWith(
      path.join('/tmp/harnesses', 'ni-labview-icon-editor', '.git')
    );
    expect(mkdir).not.toHaveBeenCalled();
    expect(runGit).toHaveBeenCalledWith(
      ['config', '--global', '--add', 'safe.directory', path.join('/tmp/harnesses', 'ni-labview-icon-editor')],
      path.join('/tmp/harnesses', 'ni-labview-icon-editor')
    );
    expect(
      JSON.parse(
        writes.get(path.join('/tmp/harnesses', 'ni-labview-icon-editor.vihs-harness-cache.json')) ??
          '{}'
      )
    ).toMatchObject({
      schema: 'vi-history-suite/canonical-harness-cache@v1',
      harnessId: 'HARNESS-VHS-001',
      sourceRepositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
      acquisitionMode: 'reused',
      acquiredAt: '2026-05-15T13:30:00.000Z',
      head: 'abcdef1234567890abcdef1234567890abcdef12',
      clean: true,
      targetTracked: true,
      safeDirectoryConfigured: true
    });
  });

  it('clones on demand and records fresh canonical harness acquisition', async () => {
    const stat = vi.fn().mockRejectedValue(new Error('missing'));
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const governedGit = createGovernedRunGitMock();
    const runGit = vi.fn(async (args: string[], cwd: string) => {
      if (args[0] === 'clone') {
        return '';
      }
      return governedGit(args, cwd);
    });
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat,
        mkdir,
        runGit,
        writeFile,
        now: () => '2026-05-15T13:31:00.000Z'
      })
    ).resolves.toBe(path.join('/tmp/harnesses', 'ni-labview-icon-editor'));

    expect(mkdir).toHaveBeenCalledWith('/tmp/harnesses', { recursive: true });
    expect(runGit).toHaveBeenCalledWith(
      [
        'clone',
        '--filter=blob:none',
        'https://github.com/ni/labview-icon-editor.git',
        path.join('/tmp/harnesses', 'ni-labview-icon-editor')
      ],
      '/tmp/harnesses'
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('/tmp/harnesses', 'ni-labview-icon-editor.vihs-harness-cache.json'),
      expect.stringContaining('"acquisitionMode": "fresh-clone"')
    );
  });

  it('fails closed when a reused canonical harness cache is dirty', async () => {
    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
        runGit: createGovernedRunGitMock({ status: ' M resource/plugins/lv_icon.vi\n' })
      })
    ).rejects.toThrow('Canonical harness cache is dirty for HARNESS-VHS-001');
  });

  it('fails closed when a reused canonical harness cache points at a different remote', async () => {
    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
        runGit: createGovernedRunGitMock({
          remoteUrl: 'https://github.com/example/not-labview-icon-editor.git\n'
        })
      })
    ).rejects.toThrow('Canonical harness cache remote mismatch for HARNESS-VHS-001');
  });

  it('fails closed when a reused canonical harness cache is missing the target file', async () => {
    const runGit = vi.fn(async (args: string[]) => {
      const command = args.join(' ');
      if (command === 'config --global --add safe.directory /tmp/harnesses/ni-labview-icon-editor') {
        return '';
      }
      if (command === 'remote get-url origin') {
        return 'https://github.com/ni/labview-icon-editor.git\n';
      }
      if (command === 'status --porcelain') {
        return '';
      }
      if (
        command ===
        'ls-files --error-unmatch Tooling/deployment/VIP_Pre-Install Custom Action.vi'
      ) {
        return '';
      }
      if (command === 'rev-parse HEAD') {
        return 'abcdef1234567890abcdef1234567890abcdef12\n';
      }
      throw new Error(`unexpected git command: ${command}`);
    });

    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
        runGit
      })
    ).rejects.toThrow('Canonical harness cache is incomplete for HARNESS-VHS-001');
  });
});

describe('runHarnessSmoke', () => {
  const model = {
    repositoryName: 'ni-labview-icon-editor',
    repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN' as const,
    eligible: true,
    commits: [
      {
        hash: 'abcdef1234567890',
        authorDate: '2026-04-02T00:00:00Z',
        authorName: 'A User',
        subject: 'Improve deployment behavior',
        previousHash: '1111111122222222'
      },
      {
        hash: '1111111122222222',
        authorDate: '2026-04-01T00:00:00Z',
        authorName: 'B User',
        subject: 'Initial deployment behavior'
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes factual smoke artifacts from the shared history-model path', async () => {
    const writes = new Map<string, string>();
    const mkdir = vi.fn().mockResolvedValue(undefined);

    const result = await runHarnessSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        strictRsrcHeader: true,
        historyLimit: 25
      },
      {
        stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
        runGit: createGovernedRunGitMock(),
        mkdir,
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890'),
        listTrackedFiles: vi
          .fn()
          .mockResolvedValue(['Tooling/deployment/VIP_Pre-Install Custom Action.vi']),
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue(model),
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          commitHashes: ['abcdef1234567890', '1111111122222222'],
          eligible: true
        }),
        now: () => '2026-04-02T00:00:00.000Z'
      }
    );

    expect(mkdir).toHaveBeenCalledWith(path.join('/tmp/reports', 'HARNESS-VHS-001'), {
      recursive: true
    });
    expect(result.report).toEqual({
      harnessId: 'HARNESS-VHS-001',
      repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
      cloneDirectory: path.join('/tmp/harnesses', 'ni-labview-icon-editor'),
      targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      head: 'abcdef1234567890',
      tracked: true,
      signature: 'LVIN',
      eligible: true,
      commitCount: 2,
      commits: model.commits,
      generatedAt: '2026-04-02T00:00:00.000Z'
    });
    expect(result.reportJsonPath).toBe(path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.json'));
    expect(result.reportMarkdownPath).toBe(
      path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.md')
    );
    expect(result.reportHtmlPath).toBe(
      path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.html')
    );
    expect(writes.get(path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.json'))).toContain(
      '"harnessId": "HARNESS-VHS-001"'
    );
    expect(writes.get(path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.md'))).toContain(
      'Commit count: 2'
    );
    expect(writes.get(path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.html'))).toContain(
      'Harness Smoke Report'
    );
  });

  it('fails closed for eligibility when the target is not tracked even if the model says eligible', async () => {
    const result = await runHarnessSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports'
      },
      {
        stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
        runGit: createGovernedRunGitMock(),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890'),
        listTrackedFiles: vi.fn().mockResolvedValue(['other/file.vi']),
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue(model),
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          commitHashes: ['abcdef1234567890', '1111111122222222'],
          eligible: true
        }),
        now: () => '2026-04-02T00:00:00.000Z'
      }
    );

    expect(result.report.tracked).toBe(false);
    expect(result.report.eligible).toBe(false);
    expect(result.report.signature).toBe('LVIN');
    expect(result.report.commitCount).toBe(2);
  });

  it('stamps generated reports from the default ISO clock path when no injected time source is supplied', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T01:02:03.000Z'));

    const writes = new Map<string, string>();

    try {
      const result = await runHarnessSmoke(
        'HARNESS-VHS-001',
        {
          cloneRoot: '/tmp/harnesses',
          reportRoot: '/tmp/reports'
        },
        {
          stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
          runGit: createGovernedRunGitMock(),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn(async (filePath: string, contents: string) => {
            writes.set(filePath, contents);
          }) as never,
          getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890'),
          listTrackedFiles: vi
            .fn()
            .mockResolvedValue(['Tooling/deployment/VIP_Pre-Install Custom Action.vi']),
          loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue(model),
          evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
            repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
            relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            commitHashes: ['abcdef1234567890', '1111111122222222'],
            eligible: true
          })
        }
      );

      expect(result.report.generatedAt).toBe('2026-04-03T01:02:03.000Z');
      expect(writes.get(path.join('/tmp/reports', 'HARNESS-VHS-001', 'report.json'))).toContain(
        '"generatedAt": "2026-04-03T01:02:03.000Z"'
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
