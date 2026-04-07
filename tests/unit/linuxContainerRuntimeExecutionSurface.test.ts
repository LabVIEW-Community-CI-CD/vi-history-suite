import { describe, expect, it, vi } from 'vitest';

import type { ComparisonCommandPlan } from '../../src/reporting/comparisonReportPlan';
import {
  buildLinuxContainerCommandPlan,
  prepareLinuxContainerExecutionContext
} from '../../src/reporting/comparisonReportRuntimeExecution';
import type { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

function createLinuxContainerReadyRecord(fullFilename = 'foo.vi'): ComparisonReportPacketRecord {
  const reportFilename = `diff-report-${fullFilename}.html`;
  const leftFilename = `left-111111112222-${fullFilename}`;
  const rightFilename = `right-abcdef123456-${fullFilename}`;

  return {
    generatedAt: '2026-04-02T00:00:00.000Z',
    reportTitle: `VI Comparison Report: ${fullFilename}`,
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    artifactPlan: {
      repoId: 'repoid123456',
      fileId: 'fileid123456',
      reportType: 'diff',
      fullFilename,
      normalizedRelativePath: fullFilename,
      reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
      stagingDirectory: '/workspace/.storage/reports/repoid123456/fileid123456/staging',
      reportFilename,
      reportFilePath: `/workspace/.storage/reports/repoid123456/fileid123456/${reportFilename}`,
      packetFilename: 'report-packet.html',
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      runtimeStdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      runtimeStderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
      runtimeDiagnosticLogFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
      runtimeProcessObservationFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
      allowedLocalRootPaths: [
        '/workspace/.storage',
        '/workspace/.storage/reports/repoid123456'
      ]
    },
    stagedRevisionPlan: {
      leftFilename,
      leftFilePath: `/workspace/.storage/reports/repoid123456/fileid123456/staging/${leftFilename}`,
      rightFilename,
      rightFilePath: `/workspace/.storage/reports/repoid123456/fileid123456/staging/${rightFilename}`
    },
    preflight: {
      normalizedRelativePath: fullFilename,
      ready: true,
      left: {
        revisionId: '1111111122222222',
        blobSpecifier: `1111111122222222:${fullFilename}`,
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: 'abcdef1234567890',
        blobSpecifier: `abcdef1234567890:${fullFilename}`,
        signature: 'LVCC',
        isVi: true
      }
    },
    runtimeSelection: {
      platform: 'linux',
      containerRuntimePlatform: 'linux',
      bitness: 'x64',
      provider: 'linux-container',
      engine: 'labview-cli',
      containerImage: 'nationalinstruments/labview:2026q1-linux',
      labviewExe: {
        kind: 'labview-exe',
        path: '/usr/local/natinst/LabVIEW-2026-64/labview',
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: '/usr/local/bin/LabVIEWCLI',
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      lvCompare: {
        kind: 'lvcompare',
        path: '/usr/local/bin/LVCompare',
        source: 'scan',
        exists: true
      },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState: 'not-run',
    runtimeExecution: {
      state: 'not-run',
      attempted: false,
      reportExists: false,
      stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt'
    }
  };
}

function createLinuxContainerCommandPlan(record: ComparisonReportPacketRecord): ComparisonCommandPlan {
  return {
    executable: '/usr/local/bin/LabVIEWCLI',
    args: [
      '-OperationName',
      'CreateComparisonReport',
      '-VI1',
      record.stagedRevisionPlan.leftFilePath,
      '-VI2',
      record.stagedRevisionPlan.rightFilePath,
      '-ReportPath',
      record.artifactPlan.reportFilePath,
      '-LabVIEWPath',
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '-Headless'
    ]
  };
}

describe('linux container runtime execution surface', () => {
  it('prepares linux-container execution on native Linux hosts without Windows path normalization', async () => {
    const record = createLinuxContainerReadyRecord();

    const result = await prepareLinuxContainerExecutionContext(
      record,
      createLinuxContainerCommandPlan(record),
      undefined,
      {
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        processPlatform: 'linux',
        leftBlob: Buffer.from('left'),
        rightBlob: Buffer.from('right')
      }
    );

    expect(result.outcome).toBe('ready');
    expect(result.reportFilePath).toBe(record.artifactPlan.reportFilePath);
    expect(result.diagnosticPathMapping).toEqual({
      runtimeRoot: '/workspace/container-temp',
      hostRoot: '/workspace/.storage/reports/repoid123456/fileid123456/container-temp'
    });
    expect(result.commandPlan).toEqual({
      executable: 'docker',
      args: expect.arrayContaining([
        'run',
        '--rm',
        '-v',
        '/workspace/.storage/reports/repoid123456/fileid123456:/workspace',
        '-e',
        'TEMP=/workspace/container-temp',
        '-e',
        'TMP=/workspace/container-temp',
        '-e',
        'TMPDIR=/workspace/container-temp',
        'nationalinstruments/labview:2026q1-linux',
        'bash',
        '-lc'
      ])
    });
    expect(result.commandPlan?.args.at(-1)).toContain("cli_path='/usr/local/bin/LabVIEWCLI'");
    expect(result.commandPlan?.args.at(-1)).toContain("'/workspace/diff-report-foo.vi.html'");
  });

  it('builds linux-container command plans with direct docker execution on native Linux hosts', () => {
    const record = createLinuxContainerReadyRecord();

    const plan = buildLinuxContainerCommandPlan(record, createLinuxContainerCommandPlan(record), {
      hostReportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
      hostTempDirectory: '/workspace/.storage/reports/repoid123456/fileid123456/container-temp',
      containerWorkspaceRoot: '/workspace',
      containerImage: 'nationalinstruments/labview:2026q1-linux',
      processPlatform: 'linux'
    });

    expect(plan).toBeDefined();
    expect(plan).toEqual({
      executable: 'docker',
      args: expect.arrayContaining([
        'run',
        '--rm',
        '-v',
        '/workspace/.storage/reports/repoid123456/fileid123456:/workspace',
        '-e',
        'TEMP=/workspace/container-temp',
        '-e',
        'TMP=/workspace/container-temp',
        '-e',
        'TMPDIR=/workspace/container-temp',
        'nationalinstruments/labview:2026q1-linux',
        'bash',
        '-lc'
      ])
    });
    expect(plan?.args.at(-1)).toContain("cli_path='/usr/local/bin/LabVIEWCLI'");
    expect(plan?.args.at(-1)).toContain("'/workspace/diff-report-foo.vi.html'");
  });

  it('aliases spaced filenames before invoking Linux container CreateComparisonReport', async () => {
    const record = createLinuxContainerReadyRecord('VIP_Pre-Uninstall Custom Action.vi');
    const writeFile = vi.fn().mockResolvedValue(undefined) as never;

    const result = await prepareLinuxContainerExecutionContext(
      record,
      createLinuxContainerCommandPlan(record),
      undefined,
      {
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile,
        processPlatform: 'linux',
        leftBlob: Buffer.from('left'),
        rightBlob: Buffer.from('right')
      }
    );

    expect(result.outcome).toBe('ready');
    expect(result.reportFilePath).toBe(
      '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Uninstall_Custom_Action.vi.html'
    );
    expect(result.reportIdentityFilenames).toEqual([
      'left-111111112222-VIP_Pre-Uninstall_Custom_Action.vi',
      'right-abcdef123456-VIP_Pre-Uninstall_Custom_Action.vi'
    ]);
    expect(result.reportTextReplacements).toEqual(
      expect.arrayContaining([
        {
          from: 'left-111111112222-VIP_Pre-Uninstall_Custom_Action.vi',
          to: 'left-111111112222-VIP_Pre-Uninstall Custom Action.vi'
        },
        {
          from: 'right-abcdef123456-VIP_Pre-Uninstall_Custom_Action.vi',
          to: 'right-abcdef123456-VIP_Pre-Uninstall Custom Action.vi'
        },
        {
          from: 'diff-report-VIP_Pre-Uninstall_Custom_Action.vi.html',
          to: 'diff-report-VIP_Pre-Uninstall Custom Action.vi.html'
        }
      ])
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-VIP_Pre-Uninstall_Custom_Action.vi',
      Buffer.from('left')
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-VIP_Pre-Uninstall_Custom_Action.vi',
      Buffer.from('right')
    );
    expect(result.commandPlan?.args.at(-1)).toContain(
      "'/workspace/staging/left-111111112222-VIP_Pre-Uninstall_Custom_Action.vi'"
    );
    expect(result.commandPlan?.args.at(-1)).toContain(
      "'/workspace/staging/right-abcdef123456-VIP_Pre-Uninstall_Custom_Action.vi'"
    );
    expect(result.commandPlan?.args.at(-1)).toContain(
      "'/workspace/diff-report-VIP_Pre-Uninstall_Custom_Action.vi.html'"
    );
  });
});
