import { describe, expect, it, vi } from 'vitest';

import {
  formatHarnessDecisionRecordSuccess,
  getHarnessDecisionRecordUsage,
  maybeRunHarnessDecisionRecordCliAsMain,
  parseHarnessDecisionRecordArgs,
  runHarnessDecisionRecordCli
} from '../../src/cli/runHarnessDecisionRecord';

const WINDOWS_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_LABVIEW_EXE_PATH =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';

describe('runHarnessDecisionRecordCli', () => {
  it('parses reviewer and outcome arguments', () => {
    expect(
      parseHarnessDecisionRecordArgs([
        '--harness-id',
        'HARNESS-VHS-001',
        '--scenario-id',
        'SCENARIO-VHS-001',
        '--reviewer',
        'Reviewer',
        '--review-question',
        'Question?',
        '--outcome',
        'needs-more-review',
        '--confidence',
        'medium',
        '--decision-rationale',
        'Rationale',
        '--platform',
        'win32',
        '--bitness',
        'x86',
        '--labview-cli-path',
        WINDOWS_LABVIEW_CLI_PATH,
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH,
        '--dashboard-commit-window',
        '4',
        '--strict-rsrc-header',
        '--additional-report-generation-required',
        '--additional-manual-labview-inspection-required',
        '--issue',
        'ISSUE-0999'
      ])
    ).toMatchObject({
      harnessId: 'HARNESS-VHS-001',
      scenarioId: 'SCENARIO-VHS-001',
      reviewer: 'Reviewer',
      reviewQuestion: 'Question?',
      outcome: 'needs-more-review',
      confidence: 'medium',
      decisionRationale: 'Rationale',
      runtimePlatform: 'win32',
      bitness: 'x86',
      labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
      labviewExePath: WINDOWS_LABVIEW_EXE_PATH,
      dashboardCommitWindow: 4,
      strictRsrcHeader: true,
      additionalReportGenerationRequired: true,
      additionalManualLabVIEWInspectionRequired: true,
      issuesOrBacklogItemsCreated: ['ISSUE-0999']
    });
  });

  it('fails closed on unsupported outcome', () => {
    expect(() => parseHarnessDecisionRecordArgs(['--outcome', 'maybe'])).toThrow(
      'Unsupported value for --outcome: maybe'
    );
  });

  it('fails closed on unsupported confidence, platform, bitness, dashboard window, and unknown args', () => {
    expect(() => parseHarnessDecisionRecordArgs(['--confidence', 'certain'])).toThrow(
      'Unsupported value for --confidence: certain'
    );
    expect(() => parseHarnessDecisionRecordArgs(['--platform', 'amiga'])).toThrow(
      'Unsupported value for --platform: amiga'
    );
    expect(() => parseHarnessDecisionRecordArgs(['--bitness', 'x128'])).toThrow(
      'Unsupported value for --bitness: x128'
    );
    expect(() => parseHarnessDecisionRecordArgs(['--dashboard-commit-window', '2'])).toThrow(
      'Unsupported value for --dashboard-commit-window: 2'
    );
    expect(() =>
      parseHarnessDecisionRecordArgs([
        '--platform',
        'win32',
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH
      ])
    ).toThrow('Canonical CreateComparisonReport proof-admission overrides require both --labview-cli-path and --labview-exe-path.');
    expect(() => parseHarnessDecisionRecordArgs(['--unknown'])).toThrow('Unknown argument: --unknown');
  });

  it('fails closed when required flag values are missing', () => {
    expect(() => parseHarnessDecisionRecordArgs(['--scenario-id'])).toThrow(
      'Missing value for --scenario-id.'
    );
    expect(() => parseHarnessDecisionRecordArgs(['--labview-cli-path'])).toThrow(
      'Missing value for --labview-cli-path.'
    );
    expect(() => parseHarnessDecisionRecordArgs(['--labview-exe-path'])).toThrow(
      'Missing value for --labview-exe-path.'
    );
  });

  it('prints help without running the harness', async () => {
    const stdout = { write: vi.fn() };
    const runner = vi.fn();

    await expect(runHarnessDecisionRecordCli(['--help'], { stdout, runner })).resolves.toBe('help');
    expect(stdout.write).toHaveBeenCalledWith(`${getHarnessDecisionRecordUsage()}\n`);
    expect(runner).not.toHaveBeenCalled();
  });

  it('requires reviewer, question, outcome, confidence, and rationale', async () => {
    await expect(runHarnessDecisionRecordCli([])).rejects.toThrow(
      'Missing required reviewer, review-question, outcome, confidence, or decision-rationale.'
    );
  });

  it('passes explicit proof-admission overrides and follow-up flags to the harness runner', async () => {
    const stdout = { write: vi.fn() };
    const runner = vi.fn(async () => ({
      report: {
        harnessId: 'HARNESS-VHS-001',
        scenarioId: 'SCENARIO-VHS-001',
        generatedAt: '2026-04-03T12:34:56.000Z',
        reviewer: 'Reviewer',
        outcome: 'rejected' as const,
        confidence: 'low' as const,
        dashboardSmokeJsonPath: '/tmp/dashboard-smoke.json',
        dashboardJsonPath: '/tmp/dashboard.json',
        dashboardHtmlPath: '/tmp/dashboard.html',
        decisionRecordJsonPath: '/tmp/decision-record.json',
        decisionRecordMarkdownPath: '/tmp/decision-record.md'
      },
      reportJsonPath: '/tmp/decision-record.json',
      reportMarkdownPath: '/tmp/decision-record.md'
    }));

    await expect(
      runHarnessDecisionRecordCli(
        [
          '--harness-id',
          'HARNESS-VHS-001',
          '--scenario-id',
          'SCENARIO-VHS-001',
          '--reviewer',
          'Reviewer',
          '--review-question',
          'Question?',
          '--outcome',
          'rejected',
          '--confidence',
          'low',
          '--decision-rationale',
          'Rationale',
          '--platform',
          'win32',
          '--bitness',
          'x86',
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_LABVIEW_EXE_PATH,
          '--dashboard-commit-window',
          '5',
          '--additional-report-generation-required',
          '--additional-manual-labview-inspection-required',
          '--issue',
          'ISSUE-1000'
        ],
        {
          repoRoot: '/repo',
          runner,
          stdout
        }
      )
    ).resolves.toBe('pass');

    expect(runner).toHaveBeenCalledWith('HARNESS-VHS-001', {
      cloneRoot: '/repo/.cache/harnesses',
      reportRoot: '/repo/.cache/harness-reports',
      scenarioId: 'SCENARIO-VHS-001',
      reviewer: 'Reviewer',
      reviewQuestion: 'Question?',
      outcome: 'rejected',
      confidence: 'low',
      decisionRationale: 'Rationale',
      strictRsrcHeader: false,
      runtimePlatform: 'win32',
      dashboardCommitWindow: 5,
      additionalReportGenerationRequired: true,
      additionalManualLabVIEWInspectionRequired: true,
      issuesOrBacklogItemsCreated: ['ISSUE-1000'],
      runtimeSettings: {
        bitness: 'x86',
        labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
        labviewExePath: WINDOWS_LABVIEW_EXE_PATH
      }
    });
    expect(stdout.write).toHaveBeenCalledWith('Harness decision record completed for HARNESS-VHS-001\n');
  });

  it('formats success output with decision and dashboard artifact paths', () => {
    expect(
      formatHarnessDecisionRecordSuccess(
        {
          report: {
            harnessId: 'HARNESS-VHS-001',
            scenarioId: 'SCENARIO-VHS-001',
            generatedAt: '2026-04-03T12:34:56.000Z',
            reviewer: 'Reviewer',
            outcome: 'approved',
            confidence: 'high',
            dashboardSmokeJsonPath: '/tmp/dashboard-smoke.json',
            dashboardJsonPath: '/tmp/dashboard.json',
            dashboardHtmlPath: '/tmp/dashboard.html',
            decisionRecordJsonPath: '/tmp/decision-record.json',
            decisionRecordMarkdownPath: '/tmp/decision-record.md'
          },
          reportJsonPath: '/tmp/decision-record.json',
          reportMarkdownPath: '/tmp/decision-record.md'
        },
        'HARNESS-VHS-001'
      )
    ).toEqual([
      'Harness decision record completed for HARNESS-VHS-001',
      'Scenario: SCENARIO-VHS-001',
      'Reviewer: Reviewer',
      'Outcome: approved',
      'Confidence: high',
      'Decision JSON: /tmp/decision-record.json',
      'Decision Markdown: /tmp/decision-record.md',
      'Dashboard JSON: /tmp/dashboard.json',
      'Dashboard HTML: /tmp/dashboard.html'
    ]);
  });

  it('rejects direct legacy decision-record execution and points callers to runGovernedProof', () => {
    const processLike: { exitCode?: number } = {};
    const stderrWrites: string[] = [];
    const stderr = {
      write(text: string) {
        stderrWrites.push(text);
        return true;
      }
    };

    expect(
      maybeRunHarnessDecisionRecordCliAsMain(
        [],
        {} as NodeModule,
        {} as NodeModule,
        processLike,
        stderr
      )
    ).toBe(false);

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunHarnessDecisionRecordCliAsMain(
        [],
        sharedModule,
        sharedModule,
        processLike,
        stderr
      )
    ).toBe(true);
    expect(processLike.exitCode).toBe(1);
    expect(stderrWrites.join('')).toContain('single public proof entrypoint');
    expect(stderrWrites.join('')).toContain('npm run proof:run -- decision-record');
  });
});
