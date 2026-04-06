import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const comparablePacket = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'buildComparablePrefixBenchmarkPacket.js'
)) as {
  buildComparablePrefixBenchmarkPacket: (repoRoot: string, options?: { prefixPairCount?: number }) => {
    comparablePrefix: { comparePairCount: number; lastComparablePairId: string };
    surfaces: {
      windowsBenchmarkImage: {
        validatedComparablePairCount: number;
        firstInvalidPairIndex?: number;
        firstInvalidPairId?: string;
        firstInvalidReason?: string;
        comparablePrefixRuntimeTotalMs: number;
        runtimeSurface?: {
          state: string;
          latestPath?: string;
          assessment?: string;
          labviewCliBundleAvailability?: { x64: boolean; x86: boolean };
        };
      };
    };
  };
  summarizeDashboardPrefix: (
    dashboardJsonPath: string,
    comparablePairCount: number,
    options?: { linuxWorkspaceRoot?: string; windowsWorkspaceRoot?: string }
  ) => {
    representedPairCount: number;
    comparablePairCount: number;
    runtimeTotalMs: number;
    providerCounts: Record<string, number>;
    lastPairId: string;
  };
  normalizeArtifactPath: (
    filePath: string,
    options?: { linuxWorkspaceRoot?: string; windowsWorkspaceRoot?: string }
  ) => string;
  readWindowsExactPairDiagnosis: (
    reportPath: string,
    proofRootPath: string
  ) => {
    engine: string;
    proofRootPath: string;
    reportPath: string;
    generatedAt?: string;
    selectedHash?: string;
    baseHash?: string;
    runtimeProvider?: string;
    runtimeExecutionState?: string;
    runtimeFailureReason?: string;
    runtimeDiagnosticReason?: string;
    runtimeLabviewIniPath?: string;
    runtimeLabviewTcpPort?: number;
    runtimeExecutable?: string;
    runtimeExecutableBitness?: string;
    headlessSessionResetExecutable?: string;
    headlessSessionResetArgs: string[];
    headlessSessionResetLabviewPath?: string;
    headlessSessionResetLabviewBitness?: string;
    mixedBitnessObserved?: boolean;
    headlessSessionResetExitCode?: number;
    headlessSessionResetStdoutPath?: string;
    headlessSessionResetStderrPath?: string;
    executionSurfaceContext: string;
    executionSurfaceMarkers: string[];
    runtimeNotes: string[];
  };
  deriveWindowsExactPairDiagnosisContext: (report: Record<string, unknown>) => {
    context: string;
    markers: string[];
  };
  deriveWindowsBenchmarkImageBlockerCharacterization: (
    exactPairDiagnostics: Array<{
      engine: string;
      baseHash?: string;
      selectedHash?: string;
      runtimeFailureReason?: string;
      runtimeDiagnosticReason?: string;
      executionSurfaceContext?: string;
      runtimeExecutableBitness?: string;
      headlessSessionResetLabviewPath?: string;
      headlessSessionResetLabviewBitness?: string;
      mixedBitnessObserved?: boolean;
    }>
  ) => {
    state: string;
    classification: string;
    baseHash?: string;
    selectedHash?: string;
    executionSurfaceContext?: string;
    runtimeExecutableBitness?: string;
    headlessSessionResetLabviewPath?: string;
    headlessSessionResetLabviewBitness?: string;
    mixedBitnessObserved: boolean;
    supportingEngines: string[];
  } | undefined;
  isEligibleWindowsExactPairDiagnosisReport: (report: Record<string, unknown>) => boolean;
  selectHostWindowsExactPairDiagnosis: (
    repoRoot: string,
    engine: string
  ) =>
    | {
        exactPairDiagnosis?: {
          reportPath: string;
          executionSurfaceContext: string;
        };
        rejectedExactPairDiagnosis?: {
          reportPath: string;
          rejectionReason: string;
        };
      }
    | undefined;
  renderComparablePrefixBenchmarkPacketMarkdown: (packet: {
    generatedAt: string;
    proofState: string;
    targetRelativePath: string;
    fullWindow: { dashboardCommitWindow: number; comparePairCount: number };
    comparablePrefix: {
      dashboardCommitWindow: number;
      comparePairCount: number;
      lastComparablePairId: string;
    };
    surfaces: {
      windowsHost: {
        latestRunPath: string;
        dashboardJsonPath: string;
        validatedComparablePairCount: number;
        comparablePrefixRuntimeTotalMs: number;
      };
      linuxHost: {
        latestSummaryPath: string;
        dashboardJsonPath: string;
        validatedComparablePairCount: number;
        comparablePrefixRuntimeTotalMs: number;
        fullWindowBlocker: {
          terminalPairIndex: number;
          terminalPairFailureReason: string;
          terminalPairDiagnosticReason: string;
        };
      };
      windowsBenchmarkImage: {
        state: string;
        latestSummaryPath: string;
        dashboardJsonPath: string;
        imageRef: string;
        validatedComparablePairCount: number;
        comparablePrefixRuntimeTotalMs: number;
        exactPairDiagnosticsState?: string;
        blockerCharacterization?: {
          state: string;
          classification: string;
          baseHash?: string;
          selectedHash?: string;
          executionSurfaceContext?: string;
          runtimeExecutableBitness?: string;
          headlessSessionResetLabviewPath?: string;
          headlessSessionResetLabviewBitness?: string;
          mixedBitnessObserved: boolean;
          supportingEngines: string[];
        };
        runtimeSurface?: {
          state: string;
          latestPath?: string;
          scopeBoundary?: string;
          assessment?: string;
          labviewCliBundleAvailability?: { x64: boolean; x86: boolean };
          lvcompareBundleAvailability?: { x64: boolean; x86: boolean };
          scopeNotes?: string[];
        };
        fullWindowBlocker: {
          terminalPairIndex: number;
          terminalPairFailureReason: string;
          terminalPairDiagnosticReason: string;
        };
        exactPairDiagnostics?: Array<{
          engine: string;
          proofRootPath: string;
          reportPath: string;
          selectedHash?: string;
          baseHash?: string;
          runtimeFailureReason?: string;
          runtimeDiagnosticReason?: string;
          runtimeLabviewIniPath?: string;
          runtimeLabviewTcpPort?: number;
          runtimeExecutableBitness?: string;
          headlessSessionResetLabviewPath?: string;
          headlessSessionResetLabviewBitness?: string;
          mixedBitnessObserved?: boolean;
          executionSurfaceContext?: string;
          executionSurfaceMarkers?: string[];
        }>;
        rejectedExactPairDiagnostics?: Array<{
          engine: string;
          reportPath: string;
          rejectionReason?: string;
          executionSurfaceContext?: string;
          executionSurfaceMarkers?: string[];
        }>;
      };
    };
    comparison: {
      linuxVsWindowsRuntimeRatio?: number;
      windowsVsLinuxSpeedupFactor?: number;
      deltaRuntimeMs: number;
    };
  }) => string;
  isEligibleWindowsBenchmarkImageSurface: (
    summary: { terminalPairFailureReason?: string; notAvailablePairCount?: number },
    dashboardSmoke: { pairSummaries?: Array<{ runtimeExecutionState?: string }> }
  ) => boolean;
  findLatestHostWindowsBenchmarkImageProof: (repoRoot: string) =>
    | {
        summaryPath: string;
        dashboardSmokePath: string;
        dashboardJsonPath?: string;
        validatedPrefix?: {
          validatedPairCount: number;
          firstInvalidPairIndex?: number;
          firstInvalidPairId?: string;
          firstInvalidReason?: string;
        };
        prefixSummary?: {
          representedPairCount: number;
          comparablePairCount: number;
          runtimeTotalMs: number;
          providerCounts: Record<string, number>;
          lastPairId: string;
        };
        dashboardSmoke?: { dashboardJsonFilePath?: string };
        summary: { completedAt?: string; terminalPairDiagnosticReason?: string };
        runtimeSurfacePath?: string;
        runtimeSurface?: {
          scopeBoundary: string;
          assessment: string;
        };
      }
    | undefined;
  formatFullWindowOutcome: (
    outcome:
      | {
          completionState?: string;
          comparabilityState?: string;
          processedPairCount?: number;
          terminalPairIndex?: number;
          terminalPairFailureReason?: string;
          terminalPairDiagnosticReason?: string;
        }
      | undefined,
    comparePairCount: number
  ) => string;
};

describe('buildComparablePrefixBenchmarkPacket script', () => {
  it('summarizes a comparable dashboard prefix from retained metadata', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-prefix-packet-'));
    const reportHistoryRoot = path.join(tempRoot, 'report-history');
    const firstPairDirectory = path.join(reportHistoryRoot, 'pairs', 'pair-a');
    const secondPairDirectory = path.join(reportHistoryRoot, 'pairs', 'pair-b');
    const dashboardJsonPath = path.join(tempRoot, 'dashboard.json');

    await fs.mkdir(firstPairDirectory, { recursive: true });
    await fs.mkdir(secondPairDirectory, { recursive: true });
    await fs.writeFile(
      path.join(firstPairDirectory, 'report-metadata.json'),
      JSON.stringify({
        runtimeExecution: {
          durationMs: 40
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(secondPairDirectory, 'report-metadata.json'),
      JSON.stringify({
        runtimeExecution: {
          durationMs: 60
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      dashboardJsonPath,
      JSON.stringify({
        summary: {
          representedPairCount: 3
        },
        entries: [
          {
            pairId: 'pair-a',
            metadataFilePath: path.join(firstPairDirectory, 'report-metadata.json'),
            runtimeProviderLabel: 'windows-container / labview-cli / auto / win32'
          },
          {
            pairId: 'pair-b',
            metadataFilePath: path.join(secondPairDirectory, 'report-metadata.json'),
            runtimeProviderLabel: 'windows-container / labview-cli / auto / win32'
          },
          {
            pairId: 'pair-c',
            metadataFilePath: path.join(secondPairDirectory, 'report-metadata.json'),
            runtimeProviderLabel: 'windows-container / labview-cli / auto / win32'
          }
        ]
      }),
      'utf8'
    );

    const summary = comparablePacket.summarizeDashboardPrefix(dashboardJsonPath, 2);
    expect(summary.representedPairCount).toBe(3);
    expect(summary.comparablePairCount).toBe(2);
    expect(summary.runtimeTotalMs).toBe(100);
    expect(summary.providerCounts).toEqual({
      'windows-container / labview-cli / auto / win32': 2
    });
    expect(summary.lastPairId).toBe('pair-b');
  });

  it('maps /workspace and Windows drive paths into local host paths', () => {
    expect(
      comparablePacket.normalizeArtifactPath('C:\\Users\\sveld\\report-metadata.json')
    ).toBe('/mnt/c/Users/sveld/report-metadata.json');
    expect(
      comparablePacket.normalizeArtifactPath(
        'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\dashboard-smoke.json',
        {
          windowsWorkspaceRoot:
            '/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof'
        }
      )
    ).toBe(
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof/cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.json'
    );
    expect(
      comparablePacket.normalizeArtifactPath('/workspace/.cache/report-metadata.json', {
        linuxWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current'
      })
    ).toBe(
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current/.cache/report-metadata.json'
    );
  });

  it('reads a retained Windows exact-pair diagnosis report', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exact-pair-'));
    const reportPath = path.join(
      tempRoot,
      'cache',
      'harness-reports',
      'HARNESS-VHS-002',
      'comparison-report-smoke.json'
    );

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        generatedAt: '2026-04-05T17:38:27.680Z',
        cloneDirectory: 'C:\\workspace\\.cache\\harnesses\\ni-labview-icon-editor',
        packetFilePath:
          'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\workspace-storage\\reports\\a1fa155b16ea\\0ded7fc226bb\\report-packet.html',
        reportFilePath:
          'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\workspace-storage\\reports\\a1fa155b16ea\\0ded7fc226bb\\diff-report-lv_icon.vi.html',
        metadataFilePath:
          'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\workspace-storage\\reports\\a1fa155b16ea\\0ded7fc226bb\\report-metadata.json',
        runtimeEngine: 'labview-cli',
        runtimeProvider: 'host-native',
        selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
        baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
        runtimeExecutionState: 'failed',
        runtimeFailureReason: 'command-exited-nonzero',
        runtimeDiagnosticReason: 'labview-cli-call-by-reference',
        runtimeDiagnosticLogSourcePath:
          'C:\\Users\\ContainerAdministrator\\AppData\\Local\\Temp\\lvtemporary_69132.log',
        runtimeLabviewIniPath:
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
        runtimeLabviewTcpPort: 3363,
        runtimeExecutable:
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        headlessSessionResetExecutable:
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        headlessSessionResetArgs: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CloseLabVIEW',
          '-LabVIEWPath',
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          '-Headless',
          'true'
        ],
        headlessSessionResetExitCode: 1,
        headlessSessionResetStdoutPath: 'C:\\workspace\\.cache\\headless-session-reset-stdout.txt',
        headlessSessionResetStderrPath: 'C:\\workspace\\.cache\\headless-session-reset-stderr.txt',
        runtimeNotes: ['Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW.']
      }),
      'utf8'
    );

    const summary = comparablePacket.readWindowsExactPairDiagnosis(reportPath, tempRoot);
    expect(summary).toEqual({
      engine: 'labview-cli',
      proofRootPath: tempRoot,
      reportPath,
      generatedAt: '2026-04-05T17:38:27.680Z',
      selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
      baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
      runtimeProvider: 'host-native',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'command-exited-nonzero',
      runtimeDiagnosticReason: 'labview-cli-call-by-reference',
      runtimeLabviewIniPath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
      runtimeLabviewTcpPort: 3363,
      runtimeExecutable:
        'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      runtimeExecutableBitness: 'x86',
      headlessSessionResetExecutable:
        'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      headlessSessionResetArgs: [
        '-LogToConsole',
        'TRUE',
        '-OperationName',
        'CloseLabVIEW',
        '-LabVIEWPath',
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        '-Headless',
        'true'
      ],
      headlessSessionResetLabviewPath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      headlessSessionResetLabviewBitness: 'x64',
      mixedBitnessObserved: true,
      headlessSessionResetExitCode: 1,
      headlessSessionResetStdoutPath: 'C:\\workspace\\.cache\\headless-session-reset-stdout.txt',
      headlessSessionResetStderrPath: 'C:\\workspace\\.cache\\headless-session-reset-stderr.txt',
      executionSurfaceContext: 'windows-benchmark-image',
      executionSurfaceMarkers: [
        'cloneDirectory',
        'packetFilePath',
        'reportFilePath',
        'metadataFilePath',
        'containerDiagnosticLogSourcePath'
      ],
      runtimeNotes: ['Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW.']
    });
  });

  it('prefers explicit execution-surface fields when retained on the smoke receipt', () => {
    expect(
      comparablePacket.deriveWindowsExactPairDiagnosisContext({
        executionSurfaceContext: 'windows-benchmark-image',
        executionSurfaceMarkers: ['cloneDirectory', 'packetFilePath']
      })
    ).toEqual({
      context: 'windows-benchmark-image',
      markers: ['cloneDirectory', 'packetFilePath']
    });
  });

  it('characterizes the Windows benchmark-image blocker from exact-pair evidence', () => {
    expect(
      comparablePacket.deriveWindowsBenchmarkImageBlockerCharacterization([
        {
          engine: 'labview-cli',
          baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
          selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
          runtimeFailureReason: 'command-exited-nonzero',
          runtimeDiagnosticReason: 'labview-cli-call-by-reference',
          executionSurfaceContext: 'windows-benchmark-image',
          runtimeExecutableBitness: 'x86',
          headlessSessionResetLabviewPath:
            'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          headlessSessionResetLabviewBitness: 'x64',
          mixedBitnessObserved: true
        },
        {
          engine: 'lvcompare',
          baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
          selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
          runtimeFailureReason: 'command-timed-out',
          executionSurfaceContext: 'windows-benchmark-image',
          runtimeExecutableBitness: 'x64',
          mixedBitnessObserved: false
        }
      ])
    ).toEqual({
      state: 'exact-pair-characterized',
      classification: 'mixed-bitness-call-by-reference-seam',
      baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
      selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
      executionSurfaceContext: 'windows-benchmark-image',
      runtimeExecutableBitness: 'x86',
      headlessSessionResetLabviewPath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      headlessSessionResetLabviewBitness: 'x64',
      mixedBitnessObserved: true,
      supportingEngines: [
        'labview-cli=command-exited-nonzero (labview-cli-call-by-reference)',
        'lvcompare=command-timed-out'
      ]
    });
  });

  it('prefers the latest eligible exact-pair snapshot and retains a newer rejected rerun', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exact-pair-select-'));
    const proofRoot = path.join(tempRoot, '.cache', 'windows-benchmark-image-pair129-labviewcli');
    const latestRejectedReportPath = path.join(
      proofRoot,
      'cache',
      'harness-reports',
      'HARNESS-VHS-002',
      'comparison-report-smoke.json'
    );
    const olderEligibleReportPath = path.join(
      proofRoot,
      'cache',
      'harness-reports',
      'HARNESS-VHS-002.prev-20260405T173526Z',
      'comparison-report-smoke.json'
    );

    await fs.mkdir(path.dirname(latestRejectedReportPath), { recursive: true });
    await fs.mkdir(path.dirname(olderEligibleReportPath), { recursive: true });
    await fs.writeFile(
      latestRejectedReportPath,
      JSON.stringify({
        generatedAt: '2026-04-05T20:00:00.000Z',
        runtimeEngine: 'labview-cli',
        runtimeProvider: 'host-native',
        selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
        baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
        cloneDirectory: 'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\pair129\\clone',
        packetFilePath: 'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\pair129\\report-packet.html',
        reportFilePath: 'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\pair129\\report.html',
        metadataFilePath:
          'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\pair129\\report-metadata.json'
      }),
      'utf8'
    );
    await fs.writeFile(
      olderEligibleReportPath,
      JSON.stringify({
        generatedAt: '2026-04-05T19:30:00.000Z',
        runtimeEngine: 'labview-cli',
        runtimeProvider: 'host-native',
        selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
        baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
        cloneDirectory: 'C:\\workspace\\.cache\\harnesses\\ni-labview-icon-editor',
        packetFilePath:
          'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\workspace-storage\\reports\\a1fa155b16ea\\0ded7fc226bb\\report-packet.html',
        reportFilePath:
          'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\workspace-storage\\reports\\a1fa155b16ea\\0ded7fc226bb\\diff-report-lv_icon.vi.html',
        metadataFilePath:
          'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\workspace-storage\\reports\\a1fa155b16ea\\0ded7fc226bb\\report-metadata.json',
        runtimeDiagnosticLogSourcePath:
          'C:\\Users\\ContainerAdministrator\\AppData\\Local\\Temp\\lvtemporary_69132.log'
      }),
      'utf8'
    );

    const selection = comparablePacket.selectHostWindowsExactPairDiagnosis(
      tempRoot,
      'labview-cli'
    );

    expect(selection?.exactPairDiagnosis?.reportPath).toBe(olderEligibleReportPath);
    expect(selection?.exactPairDiagnosis?.executionSurfaceContext).toBe(
      'windows-benchmark-image'
    );
    expect(selection?.rejectedExactPairDiagnosis?.reportPath).toBe(latestRejectedReportPath);
    expect(selection?.rejectedExactPairDiagnosis?.rejectionReason).toBe(
      'missing-windows-benchmark-image-surface-markers'
    );
  });

  it('renders a concise comparable-prefix markdown packet', () => {
    const markdown = comparablePacket.renderComparablePrefixBenchmarkPacketMarkdown({
      generatedAt: '2026-04-05T07:30:00.000Z',
      proofState: 'bounded-prefix-comparable',
      targetRelativePath: 'resource/plugins/lv_icon.vi',
      fullWindow: {
        dashboardCommitWindow: 139,
        comparePairCount: 138
      },
      comparablePrefix: {
        dashboardCommitWindow: 129,
        comparePairCount: 128,
        lastComparablePairId: '87792a7b6545'
      },
      surfaces: {
        windowsHost: {
          latestRunPath: '/tmp/latest-dashboard-run.json',
          dashboardJsonPath: '/tmp/windows-dashboard.json',
          validatedComparablePairCount: 128,
          comparablePrefixRuntimeTotalMs: 4432457
        },
        linuxHost: {
          latestSummaryPath: '/tmp/latest-summary.json',
          dashboardJsonPath: '/tmp/linux-dashboard.json',
          validatedComparablePairCount: 134,
          comparablePrefixRuntimeTotalMs: 489440,
          fullWindowBlocker: {
            terminalPairIndex: 135,
            terminalPairFailureReason: 'command-exited-nonzero',
            terminalPairDiagnosticReason: 'linux-headless-recursive-load'
          }
        },
        windowsBenchmarkImage: {
          state: 'bounded-blocked',
          latestSummaryPath: '/tmp/windows-image-summary.json',
          dashboardJsonPath: '/tmp/windows-image-dashboard.json',
          imageRef:
            'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:sha-b679b8761f09df3f39d1a2d35addad2aaf0654b9',
          validatedComparablePairCount: 128,
          comparablePrefixRuntimeTotalMs: 623664,
          exactPairDiagnosticsState: 'available',
          runtimeSurface: {
            state: 'available',
            latestPath: '/tmp/windows-image-runtime-surface.json',
            scopeBoundary: 'current-governed-benchmark-image-contract',
            assessment: 'mixed-bitness-only-labview-cli-surface',
            labviewCliBundleAvailability: {
              x64: false,
              x86: false
            },
            lvcompareBundleAvailability: {
              x64: true,
              x86: false
            },
            scopeNotes: [
              'Out-of-scope alternative Windows x86 provisioning may exist through slower NI Package Manager plus ISO installation, but that is not part of the current governed Windows benchmark image contract.'
            ]
          },
          blockerCharacterization: {
            state: 'exact-pair-characterized',
            classification: 'mixed-bitness-call-by-reference-seam',
            baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
            selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
            executionSurfaceContext: 'windows-benchmark-image',
            runtimeExecutableBitness: 'x86',
            headlessSessionResetLabviewPath:
              'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
            headlessSessionResetLabviewBitness: 'x64',
            mixedBitnessObserved: true,
            supportingEngines: [
              'labview-cli=command-exited-nonzero (labview-cli-call-by-reference)',
              'lvcompare=command-timed-out'
            ]
          },
          fullWindowBlocker: {
            terminalPairIndex: 129,
            terminalPairFailureReason: 'command-exited-nonzero',
            terminalPairDiagnosticReason: 'labview-cli-call-by-reference'
          },
          exactPairDiagnostics: [
            {
              engine: 'labview-cli',
              proofRootPath: '/tmp/windows-benchmark-image-pair129-labviewcli',
              reportPath: '/tmp/windows-benchmark-image-pair129-labviewcli/comparison-report-smoke.json',
              baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
              selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
              runtimeFailureReason: 'command-exited-nonzero',
              runtimeDiagnosticReason: 'labview-cli-call-by-reference',
              runtimeLabviewIniPath:
                'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
              runtimeLabviewTcpPort: 3363,
              runtimeExecutableBitness: 'x86',
              headlessSessionResetLabviewPath:
                'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
              headlessSessionResetLabviewBitness: 'x64',
              mixedBitnessObserved: true,
              executionSurfaceContext: 'windows-benchmark-image',
              executionSurfaceMarkers: [
                'cloneDirectory',
                'packetFilePath',
                'reportFilePath',
                'metadataFilePath',
                'containerDiagnosticLogSourcePath'
              ],
              headlessSessionResetExitCode: 1,
              headlessSessionResetStdoutPath: '/tmp/windows-benchmark-image-pair129-labviewcli/headless-session-reset-stdout.txt',
              headlessSessionResetStderrPath: '/tmp/windows-benchmark-image-pair129-labviewcli/headless-session-reset-stderr.txt'
            },
            {
              engine: 'lvcompare',
              proofRootPath: '/tmp/windows-benchmark-image-pair129-lvcompare',
              reportPath: '/tmp/windows-benchmark-image-pair129-lvcompare/comparison-report-smoke.json',
              baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
              selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
              runtimeFailureReason: 'command-timed-out',
              runtimeExecutableBitness: 'x64',
              mixedBitnessObserved: false,
              executionSurfaceContext: 'windows-benchmark-image',
              executionSurfaceMarkers: [
                'cloneDirectory',
                'packetFilePath',
                'reportFilePath',
                'metadataFilePath'
              ]
            }
          ],
          rejectedExactPairDiagnostics: []
        }
      },
      comparison: {
        linuxVsWindowsRuntimeRatio: 0.1104,
        windowsVsLinuxSpeedupFactor: 9.0556,
        deltaRuntimeMs: 3943017
      }
    });

    expect(markdown).toContain('Comparable Prefix Benchmark Packet');
    expect(markdown).toContain('129 commits / 128 pairs');
    expect(markdown).toContain('linux-headless-recursive-load');
    expect(markdown).toContain('labview-cli-call-by-reference');
    expect(markdown).toContain('bounded-blocked');
    expect(markdown).toContain('Exact-pair diagnosis state: available');
    expect(markdown).toContain('Runtime surface assessment: mixed-bitness-only-labview-cli-surface');
    expect(markdown).toContain('Runtime surface LabVIEWCLI bundles: x64=no, x86=no');
    expect(markdown).toContain('Runtime surface LVCompare bundles: x64=yes, x86=no');
    expect(markdown).toContain('current governed Windows benchmark image contract');
    expect(markdown).toContain('Blocker characterization: mixed-bitness-call-by-reference-seam');
    expect(markdown).toContain('Blocker mixed bitness observed: yes');
    expect(markdown).toContain('## Windows Exact-Pair Diagnosis');
    expect(markdown).toContain(
      'labview-cli: 6dd65df67428 -> 3408654e6802 :: command-exited-nonzero (labview-cli-call-by-reference)'
    );
    expect(markdown).toContain(
      'labview-cli execution surface: windows-benchmark-image [cloneDirectory, packetFilePath, reportFilePath, metadataFilePath, containerDiagnosticLogSourcePath]'
    );
    expect(markdown).toContain(
      'labview-cli selected LabVIEW.ini: C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    );
    expect(markdown).toContain('labview-cli selected LabVIEW TCP port: 3363');
    expect(markdown).toContain('labview-cli runtime executable bitness: x86');
    expect(markdown).toContain(
      'labview-cli headless-reset LabVIEW bitness: x64'
    );
    expect(markdown).toContain('labview-cli mixed bitness observed: yes');
    expect(markdown).toContain('labview-cli recovery exit code: 1');
    expect(markdown).toContain(
      'labview-cli recovery stderr: /tmp/windows-benchmark-image-pair129-labviewcli/headless-session-reset-stderr.txt'
    );
    expect(markdown).toContain(
      'lvcompare: 6dd65df67428 -> 3408654e6802 :: command-timed-out'
    );
  });

  it('rejects contaminated Windows benchmark-image summaries for packet selection', () => {
    expect(
      comparablePacket.isEligibleWindowsBenchmarkImageSurface(
        {
          completionState: 'failed',
          terminalPairFailureReason: 'windows-host-runtime-surface-contaminated',
          notAvailablePairCount: 128
        },
        {
          pairSummaries: [{ runtimeExecutionState: 'not-available' }]
        }
      )
    ).toBe(false);

    expect(
      comparablePacket.isEligibleWindowsBenchmarkImageSurface(
        {
          completionState: 'failed',
          terminalPairFailureReason: 'command-exited-nonzero',
          notAvailablePairCount: 0
        },
        {
          pairSummaries: [{ runtimeExecutionState: 'succeeded' }]
        }
      )
    ).toBe(true);
  });

  it('prefers the latest eligible timestamped Windows benchmark-image run within one proof root', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-win-proof-root-'));
    const benchmarkRoot = path.join(
      tempRoot,
      '.cache',
      'windows-benchmark-image-proof',
      'cache',
      'github-experiments',
      'windows-dashboard-benchmark',
      'HARNESS-VHS-002'
    );

    await fs.mkdir(benchmarkRoot, { recursive: true });
    await fs.writeFile(
      path.join(benchmarkRoot, '2026-04-05-010000000.json'),
      JSON.stringify({
        benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK',
        completedAt: '2026-04-05T01:00:00.000Z',
        retainedArtifacts: {
          runSmokeJsonPath: path.join(benchmarkRoot, '2026-04-05-010000000-dashboard-smoke.json')
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(benchmarkRoot, '2026-04-05-010000000-dashboard-smoke.json'),
      JSON.stringify({
        pairSummaries: [{ runtimeExecutionState: 'succeeded' }]
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(benchmarkRoot, '2026-04-05-020000000.json'),
      JSON.stringify({
        benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK',
        completedAt: '2026-04-05T02:00:00.000Z',
        notAvailablePairCount: 1,
        terminalPairFailureReason: 'windows-host-runtime-surface-contaminated',
        retainedArtifacts: {
          runSmokeJsonPath: path.join(benchmarkRoot, '2026-04-05-020000000-dashboard-smoke.json')
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(benchmarkRoot, '2026-04-05-020000000-dashboard-smoke.json'),
      JSON.stringify({
        pairSummaries: [{ runtimeExecutionState: 'not-available' }]
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(benchmarkRoot, 'runtime-surface-20260405-010000.json'),
      JSON.stringify({
        scopeBoundary: 'current-governed-benchmark-image-contract',
        assessment: 'mixed-bitness-only-labview-cli-surface',
        observedPaths: {},
        labviewCliBundleAvailability: {
          x64: false,
          x86: false
        }
      }),
      'utf8'
    );

    const selected = comparablePacket.findLatestHostWindowsBenchmarkImageProof(tempRoot);

    expect(selected?.summaryPath).toBe(
      path.join(benchmarkRoot, '2026-04-05-010000000.json')
    );
    expect(selected?.dashboardSmokePath).toBe(
      path.join(benchmarkRoot, '2026-04-05-010000000-dashboard-smoke.json')
    );
    expect(selected?.runtimeSurfacePath).toBe(
      path.join(benchmarkRoot, 'runtime-surface-20260405-010000.json')
    );
    expect(selected?.runtimeSurface?.assessment).toBe(
      'mixed-bitness-only-labview-cli-surface'
    );
  });

  it('falls back to the retained comparable-prefix packet when the latest live Windows proof root is contaminated', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-win-proof-packet-fallback-'));
    const benchmarkRoot = path.join(
      tempRoot,
      '.cache',
      'windows-benchmark-image-proof',
      'cache',
      'github-experiments',
      'windows-dashboard-benchmark',
      'HARNESS-VHS-002'
    );
    const retainedDashboardJsonPath = path.join(
      tempRoot,
      'retained-windows-benchmark-image-dashboard.json'
    );
    const retainedPacketPath = path.join(
      tempRoot,
      'docs',
      'product',
      'benchmark-packets',
      'HARNESS-VHS-002-comparable-prefix.json'
    );

    await fs.mkdir(benchmarkRoot, { recursive: true });
    await fs.mkdir(path.dirname(retainedPacketPath), { recursive: true });
    await fs.writeFile(
      path.join(benchmarkRoot, '2026-04-05-020000000.json'),
      JSON.stringify({
        benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK',
        completedAt: '2026-04-05T02:00:00.000Z',
        notAvailablePairCount: 1,
        terminalPairFailureReason: 'windows-host-runtime-surface-contaminated',
        retainedArtifacts: {
          runSmokeJsonPath: path.join(benchmarkRoot, '2026-04-05-020000000-dashboard-smoke.json')
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(benchmarkRoot, '2026-04-05-020000000-dashboard-smoke.json'),
      JSON.stringify({
        pairSummaries: [{ runtimeExecutionState: 'not-available' }]
      }),
      'utf8'
    );
    await fs.writeFile(
      retainedDashboardJsonPath,
      JSON.stringify({
        entries: [],
        summary: { representedPairCount: 128 }
      }),
      'utf8'
    );
    await fs.writeFile(
      retainedPacketPath,
      JSON.stringify({
        generatedAt: '2026-04-05T01:00:00.000Z',
        comparison: {
          lastComparablePairId: '87792a7b6545'
        },
        surfaces: {
          windowsBenchmarkImage: {
            latestSummaryPath: '/retained/summary.json',
            dashboardSmokePath: '/retained/dashboard-smoke.json',
            dashboardJsonPath: retainedDashboardJsonPath,
            imageRef: 'ghcr.io/example/windows-dashboard-benchmark:sha-old',
            imageDigest: 'sha256:old',
            validatedComparablePairCount: 128,
            firstInvalidPairIndex: 129,
            firstInvalidPairId: '3da72eea60aa',
            firstInvalidReason: 'runtime-failed',
            providerCounts: {
              'host-native / labview-cli / auto / win32': 128
            },
            representedPairCount: 134,
            comparablePrefixRuntimeTotalMs: 464798,
            runtimeSurface: {
              scopeBoundary: 'current-governed-benchmark-image-contract',
              assessment: 'mixed-bitness-only-labview-cli-surface',
              observedPaths: {},
              labviewCliBundleAvailability: {
                x64: false,
                x86: false
              }
            },
            fullWindowBlocker: {
              completionState: 'failed',
              comparabilityState: 'characterization-only',
              processedPairCount: 129,
              generatedReportCount: 128,
              terminalPairIndex: 129,
              terminalPairFailureReason: 'command-exited-nonzero',
              terminalPairDiagnosticReason: 'labview-cli-call-by-reference'
            }
          }
        },
        retainedArtifacts: {
          windowsBenchmarkImageLatestSummaryPath: '/retained/summary.json',
          windowsBenchmarkImageDashboardSmokePath: '/retained/dashboard-smoke.json',
          windowsBenchmarkImageRuntimeSurfacePath: '/retained/runtime-surface.json'
        }
      }),
      'utf8'
    );

    const selected = comparablePacket.findLatestHostWindowsBenchmarkImageProof(tempRoot);

    expect(selected?.summaryPath).toBe('/retained/summary.json');
    expect(selected?.dashboardSmoke?.dashboardJsonFilePath).toBe(retainedDashboardJsonPath);
    expect(selected?.dashboardJsonPath).toBe(retainedDashboardJsonPath);
    expect(selected?.validatedPrefix).toEqual({
      validatedPairCount: 128,
      firstInvalidPairIndex: 129,
      firstInvalidPairId: '3da72eea60aa',
      firstInvalidReason: 'runtime-failed'
    });
    expect(selected?.prefixSummary).toEqual({
      representedPairCount: 134,
      comparablePairCount: 128,
      runtimeTotalMs: 464798,
      providerCounts: {
        'host-native / labview-cli / auto / win32': 128
      },
      lastPairId: '87792a7b6545'
    });
    expect(selected?.summary?.terminalPairDiagnosticReason).toBe(
      'labview-cli-call-by-reference'
    );
    expect(selected?.runtimeSurfacePath).toBe('/retained/runtime-surface.json');
    expect(selected?.runtimeSurface?.assessment).toBe(
      'mixed-bitness-only-labview-cli-surface'
    );
  });

  it('formats completed full-window outcomes without inventing a blocker pair', () => {
    expect(
      comparablePacket.formatFullWindowOutcome(
        {
          completionState: 'completed',
          comparabilityState: 'comparable-to-linux-benchmark-image',
          processedPairCount: 128
        },
        128
      )
    ).toBe('completed (comparable-to-linux-benchmark-image) after 128 / 128 pairs');
  });
});
