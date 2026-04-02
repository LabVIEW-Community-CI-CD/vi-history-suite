import { describe, expect, it, vi } from 'vitest';

import {
  formatHarnessSmokeSuccess,
  getHarnessSmokeUsage,
  parseHarnessSmokeArgs,
  runHarnessSmokeCli
} from '../../src/cli/runHarnessSmoke';

describe('runHarnessSmokeCli', () => {
  it('parses the default harness, explicit options, help, and invalid arguments deterministically', () => {
    expect(parseHarnessSmokeArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: false
    });

    expect(parseHarnessSmokeArgs(['--harness-id', 'HARNESS-VHS-009', '--strict-rsrc-header']))
      .toEqual({
        harnessId: 'HARNESS-VHS-009',
        strictRsrcHeader: true,
        helpRequested: false
      });

    expect(parseHarnessSmokeArgs(['--help'])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: true
    });

    expect(() => parseHarnessSmokeArgs(['--harness-id'])).toThrow(
      /Missing value for --harness-id/
    );
    expect(() => parseHarnessSmokeArgs(['--unknown-flag'])).toThrow(
      /Unknown argument: --unknown-flag/
    );
    expect(getHarnessSmokeUsage()).toContain('--strict-rsrc-header');
  });

  it('prints the deterministic success summary and forwards governed options to the harness runner', async () => {
    const writes: string[] = [];
    const runner = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        cloneDirectory: '/tmp/harnesses/ni-labview-icon-editor',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        head: 'abcdef1234567890',
        tracked: true,
        signature: 'LVIN',
        eligible: true,
        commitCount: 18,
        commits: [],
        generatedAt: '2026-04-02T00:00:00.000Z'
      },
      reportJsonPath: '/tmp/reports/HARNESS-VHS-001/report.json',
      reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/report.md',
      reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/report.html'
    });

    await expect(
      runHarnessSmokeCli(['--strict-rsrc-header'], {
        repoRoot: '/tmp/vi-history-suite',
        runner,
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('pass');

    expect(runner).toHaveBeenCalledWith('HARNESS-VHS-001', {
      cloneRoot: '/tmp/vi-history-suite/.cache/harnesses',
      reportRoot: '/tmp/vi-history-suite/.cache/harness-reports',
      strictRsrcHeader: true
    });
    expect(writes.join('')).toContain('Harness smoke completed for HARNESS-VHS-001');
    expect(writes.join('')).toContain('JSON: /tmp/reports/HARNESS-VHS-001/report.json');
    expect(writes.join('')).toContain('Eligible: yes');
    expect(writes.join('')).toContain('Signature: LVIN');
    expect(writes.join('')).toContain('Commit count: 18');
  });

  it('supports help without invoking the harness runner', async () => {
    const writes: string[] = [];
    const runner = vi.fn();

    await expect(
      runHarnessSmokeCli(['--help'], {
        runner,
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('help');

    expect(runner).not.toHaveBeenCalled();
    expect(writes.join('')).toContain('Usage: runHarnessSmoke');
  });

  it('formats the success output in a stable order', () => {
    expect(
      formatHarnessSmokeSuccess(
        {
          report: {
            harnessId: 'HARNESS-VHS-001',
            repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
            cloneDirectory: '/tmp/harnesses/ni-labview-icon-editor',
            targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            head: 'abcdef1234567890',
            tracked: true,
            signature: 'LVIN',
            eligible: true,
            commitCount: 18,
            commits: [],
            generatedAt: '2026-04-02T00:00:00.000Z'
          },
          reportJsonPath: '/tmp/reports/HARNESS-VHS-001/report.json',
          reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/report.md',
          reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/report.html'
        },
        'HARNESS-VHS-001'
      )
    ).toEqual([
      'Harness smoke completed for HARNESS-VHS-001',
      'JSON: /tmp/reports/HARNESS-VHS-001/report.json',
      'Markdown: /tmp/reports/HARNESS-VHS-001/report.md',
      'HTML: /tmp/reports/HARNESS-VHS-001/report.html',
      'Eligible: yes',
      'Signature: LVIN',
      'Commit count: 18'
    ]);
  });
});
