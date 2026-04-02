import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HARNESS_VHS_001 } from '../../src/harness/canonicalHarnesses';
import {
  ensureHarnessClone,
  runHarnessSmoke
} from '../../src/harness/harnessSmoke';

describe('ensureHarnessClone', () => {
  it('reuses an existing clone when the .git directory already exists', async () => {
    const stat = vi.fn().mockResolvedValue({
      isDirectory: () => true
    });
    const mkdir = vi.fn();
    const runGit = vi.fn();

    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat,
        mkdir,
        runGit
      })
    ).resolves.toBe('/tmp/harnesses/ni-labview-icon-editor');

    expect(stat).toHaveBeenCalledWith('/tmp/harnesses/ni-labview-icon-editor/.git');
    expect(mkdir).not.toHaveBeenCalled();
    expect(runGit).not.toHaveBeenCalled();
  });

  it('clones on demand when the canonical harness is not present locally', async () => {
    const stat = vi.fn().mockRejectedValue(new Error('missing'));
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const runGit = vi.fn().mockResolvedValue('');

    await expect(
      ensureHarnessClone(HARNESS_VHS_001, '/tmp/harnesses', {
        stat,
        mkdir,
        runGit
      })
    ).resolves.toBe('/tmp/harnesses/ni-labview-icon-editor');

    expect(mkdir).toHaveBeenCalledWith('/tmp/harnesses', { recursive: true });
    expect(runGit).toHaveBeenCalledWith(
      [
        'clone',
        '--filter=blob:none',
        'https://github.com/ni/labview-icon-editor.git',
        '/tmp/harnesses/ni-labview-icon-editor'
      ],
      '/tmp/harnesses'
    );
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

    expect(mkdir).toHaveBeenCalledWith('/tmp/reports/HARNESS-VHS-001', { recursive: true });
    expect(result.report).toEqual({
      harnessId: 'HARNESS-VHS-001',
      repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
      cloneDirectory: '/tmp/harnesses/ni-labview-icon-editor',
      targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      head: 'abcdef1234567890',
      tracked: true,
      signature: 'LVIN',
      eligible: true,
      commitCount: 2,
      commits: model.commits,
      generatedAt: '2026-04-02T00:00:00.000Z'
    });
    expect(result.reportJsonPath).toBe('/tmp/reports/HARNESS-VHS-001/report.json');
    expect(result.reportMarkdownPath).toBe('/tmp/reports/HARNESS-VHS-001/report.md');
    expect(result.reportHtmlPath).toBe('/tmp/reports/HARNESS-VHS-001/report.html');
    expect(writes.get('/tmp/reports/HARNESS-VHS-001/report.json')).toContain(
      '"harnessId": "HARNESS-VHS-001"'
    );
    expect(writes.get('/tmp/reports/HARNESS-VHS-001/report.md')).toContain(
      'Commit count: 2'
    );
    expect(writes.get('/tmp/reports/HARNESS-VHS-001/report.html')).toContain(
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
      expect(writes.get('/tmp/reports/HARNESS-VHS-001/report.json')).toContain(
        '"generatedAt": "2026-04-03T01:02:03.000Z"'
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
