import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_DIRECTORY_PREFIX,
  attemptDirectoryPath,
  createDiagnosticsRecorder,
  DIAGNOSTICS_DIRECTORY_NAME,
  DIAGNOSTICS_MANIFEST_FILENAME,
  DIAGNOSTICS_SCHEMA_VERSION,
  diagnosticsManifestFilePath,
  ENVIRONMENT_FINGERPRINT_FILENAME,
  environmentFingerprintFilePath,
  FAILURE_CLASSIFICATION_FILENAME,
  noopDiagnosticsRecorder,
  PRE_LAUNCH_BASELINE_FILENAME
} from '../../src/reporting/diagnostics/diagnosticsRecorder';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';
import {
  ObserveWindowsProcessesOptions,
  ObserveWindowsTcpListenersOptions,
  RuntimeProcessObservation,
  WindowsTcpListenerObservation
} from '../../src/reporting/comparisonReportRuntimeExecution';

interface WrittenFile {
  filePath: string;
  contents: string;
}

interface RecorderHarnessOptions {
  processPlatform?: NodeJS.Platform;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  observeWindowsTcpListeners?: (
    options: ObserveWindowsTcpListenersOptions
  ) => Promise<WindowsTcpListenerObservation[]>;
  readFile?: () => Promise<string | Buffer>;
  stat?: () => Promise<{ mtime: Date }>;
  resolveExtensionVersion?: () => string | undefined;
  failWrite?: boolean;
}

function createHarness(options: RecorderHarnessOptions = {}): {
  recorder: ReturnType<typeof createDiagnosticsRecorder>;
  writes: WrittenFile[];
  mkdirCalls: string[];
} {
  const writes: WrittenFile[] = [];
  const mkdirCalls: string[] = [];
  const recorder = createDiagnosticsRecorder({
    processPlatform: options.processPlatform ?? 'win32',
    nowIso: () => '2026-06-02T08:30:00.000Z',
    mkdir: (async (dir: string) => {
      mkdirCalls.push(String(dir));
    }) as never,
    writeFile: (async (filePath: string, contents: unknown) => {
      if (options.failWrite) {
        throw new Error('disk-full');
      }
      writes.push({
        filePath: String(filePath),
        contents: typeof contents === 'string' ? contents : Buffer.from(contents as Uint8Array).toString('utf8')
      });
    }) as never,
    readFile:
      (options.readFile as never) ??
      ((async () =>
        'server.tcp.enabled=True\nserver.tcp.port=3363\nLoadAddOns=False\n[other]\nignored=1\n') as never),
    stat:
      (options.stat as never) ??
      ((async () => ({ mtime: new Date('2026-04-01T00:00:00.000Z') })) as never),
    observeWindowsProcesses: options.observeWindowsProcesses,
    observeWindowsTcpListeners: options.observeWindowsTcpListeners,
    resolveExtensionVersion: options.resolveExtensionVersion ?? (() => '1.9.0')
  });
  return { recorder, writes, mkdirCalls };
}

function createRecord(overrides?: Partial<ComparisonReportPacketRecord>): ComparisonReportPacketRecord {
  const reportDirectory = '/reports/repoid/fileid';
  return {
    generatedAt: '2026-06-02T08:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef',
    baseHash: '111111',
    artifactPlan: {
      repoId: 'repoid',
      fileId: 'fileid',
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: 'foo.vi',
      reportDirectory,
      stagingDirectory: `${reportDirectory}/staging`,
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: `${reportDirectory}/diff-report-foo.vi.html`,
      packetFilename: 'report-packet.html',
      packetFilePath: `${reportDirectory}/report-packet.html`,
      metadataFilePath: `${reportDirectory}/report-metadata.json`,
      runtimeStdoutFilePath: `${reportDirectory}/runtime-stdout.txt`,
      runtimeStderrFilePath: `${reportDirectory}/runtime-stderr.txt`,
      runtimeDiagnosticLogFilePath: `${reportDirectory}/runtime-diagnostic-log.txt`,
      runtimeProcessObservationFilePath: `${reportDirectory}/runtime-process-observation.json`,
      allowedLocalRootPaths: ['/reports']
    },
    stagedRevisionPlan: {
      leftFilename: 'left-foo.vi',
      leftFilePath: `${reportDirectory}/staging/left-foo.vi`,
      rightFilename: 'right-foo.vi',
      rightFilePath: `${reportDirectory}/staging/right-foo.vi`
    },
    preflight: {
      normalizedRelativePath: 'foo.vi',
      ready: true,
      left: { revisionId: '111111', blobSpecifier: '111111:foo.vi', signature: 'LVIN', isVi: true },
      right: { revisionId: 'abcdef', blobSpecifier: 'abcdef:foo.vi', signature: 'LVIN', isVi: true }
    },
    runtimeSelection: {
      platform: 'win32',
      bitness: 'x64',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'configured',
        exists: true,
        bitness: 'x86'
      },
      lvCompare: {
        kind: 'lv-compare',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      hostLabviewIniPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
      hostLabviewTcpPort: 3363,
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState: 'not-run',
    runtimeExecution: {
      state: 'not-run',
      attempted: false,
      reportExists: false
    },
    ...overrides
  } as ComparisonReportPacketRecord;
}

describe('diagnosticsRecorder', () => {
  describe('attemptDirectoryPath', () => {
    it('builds a deterministic per-attempt directory under diagnostics/', () => {
      const result = attemptDirectoryPath('/reports/repo/file', 1);
      expect(result.replace(/\\/g, '/')).toBe(
        `/reports/repo/file/${DIAGNOSTICS_DIRECTORY_NAME}/${ATTEMPT_DIRECTORY_PREFIX}1`
      );
    });

    it('rejects non-positive attempt indices', () => {
      expect(() => attemptDirectoryPath('/r', 0)).toThrow();
      expect(() => attemptDirectoryPath('/r', -1)).toThrow();
      expect(() => attemptDirectoryPath('/r', 1.5)).toThrow();
    });
  });

  describe('environment fingerprint', () => {
    it('captures schema-versioned snapshot with extension version, OS, provider, and ini hash', async () => {
      const harness = createHarness();
      const record = createRecord();
      await harness.recorder.recordEnvironmentFingerprint(record);

      const fingerprintWrite = harness.writes.find((w) =>
        w.filePath.includes(ENVIRONMENT_FINGERPRINT_FILENAME)
      );
      expect(fingerprintWrite, 'environment fingerprint must be written').toBeDefined();
      expect(fingerprintWrite!.filePath.replace(/\\/g, '/')).toBe(
        environmentFingerprintFilePath(record.artifactPlan.reportDirectory).replace(/\\/g, '/')
      );

      const parsed = JSON.parse(fingerprintWrite!.contents);
      expect(parsed.schemaVersion).toBe(DIAGNOSTICS_SCHEMA_VERSION);
      expect(parsed.extensionVersion).toBe('1.9.0');
      expect(parsed.os.platform).toBe('win32');
      expect(parsed.reportingProvider).toMatchObject({
        provider: 'host-native',
        engine: 'labview-cli',
        bitness: 'x64',
        platform: 'win32'
      });
      expect(parsed.toolchain.labviewExecutablePath).toContain('LabVIEW.exe');
      expect(parsed.toolchain.labviewCliExecutablePath).toContain('LabVIEWCLI.exe');
      expect(parsed.toolchain.lvCompareExecutablePath).toContain('LVCompare.exe');
      expect(parsed.toolchain.labviewTcpPort).toBe(3363);
      expect(parsed.toolchain.labviewIniSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.toolchain.labviewIniStartupKeys).toMatchObject({
        'server.tcp.enabled': 'True',
        'server.tcp.port': '3363',
        LoadAddOns: 'False'
      });
      expect(parsed.toolchain.labviewIniStartupKeys.ignored).toBeUndefined();
    });

    it('never throws when filesystem writes fail', async () => {
      const harness = createHarness({ failWrite: true });
      await expect(
        harness.recorder.recordEnvironmentFingerprint(createRecord())
      ).resolves.toBeUndefined();
    });

    it('omits cliConnectTimeoutHardening when no context is provided', async () => {
      const harness = createHarness();
      const record = createRecord();
      await harness.recorder.recordEnvironmentFingerprint(record);
      const fingerprintWrite = harness.writes.find((w) =>
        w.filePath.includes(ENVIRONMENT_FINGERPRINT_FILENAME)
      );
      const parsed = JSON.parse(fingerprintWrite!.contents);
      expect(parsed.cliConnectTimeoutHardening).toBeUndefined();
    });

    it('emits the cliConnectTimeoutHardening block when context supplies it', async () => {
      const harness = createHarness();
      const record = createRecord();
      await harness.recorder.recordEnvironmentFingerprint(record, {
        cliConnectTimeoutHardening: {
          applied: true,
          requestedValue: 180,
          iniPath: 'C:\\fake\\LabVIEWCLI.ini',
          previousValues: {
            OpenAppReferenceTimeoutInSecond: '30',
            AfterLaunchOpenAppReferenceTimeoutInSecond: '30'
          },
          currentValues: {
            OpenAppReferenceTimeoutInSecond: '180',
            AfterLaunchOpenAppReferenceTimeoutInSecond: '180'
          },
          backupCreated: true
        }
      });
      const fingerprintWrite = harness.writes.find((w) =>
        w.filePath.includes(ENVIRONMENT_FINGERPRINT_FILENAME)
      );
      const parsed = JSON.parse(fingerprintWrite!.contents);
      expect(parsed.cliConnectTimeoutHardening).toEqual({
        applied: true,
        requestedValue: 180,
        iniPath: 'C:\\fake\\LabVIEWCLI.ini',
        previousValues: {
          OpenAppReferenceTimeoutInSecond: '30',
          AfterLaunchOpenAppReferenceTimeoutInSecond: '30'
        },
        currentValues: {
          OpenAppReferenceTimeoutInSecond: '180',
          AfterLaunchOpenAppReferenceTimeoutInSecond: '180'
        },
        backupCreated: true
      });
    });

    it('emits a non-applied cliConnectTimeoutHardening block with reason when supplied', async () => {
      const harness = createHarness();
      const record = createRecord();
      await harness.recorder.recordEnvironmentFingerprint(record, {
        cliConnectTimeoutHardening: {
          applied: false,
          requestedValue: 180,
          reason: 'no-candidate'
        }
      });
      const fingerprintWrite = harness.writes.find((w) =>
        w.filePath.includes(ENVIRONMENT_FINGERPRINT_FILENAME)
      );
      const parsed = JSON.parse(fingerprintWrite!.contents);
      expect(parsed.cliConnectTimeoutHardening).toEqual({
        applied: false,
        requestedValue: 180,
        reason: 'no-candidate'
      });
    });
  });

  describe('pre-launch baseline', () => {
    it('captures process and TCP listener observations on Windows host-native', async () => {
      const observedProcess: RuntimeProcessObservation = {
        capturedAt: '2026-06-02T08:30:00.000Z',
        hostPlatform: 'win32',
        runtimePlatform: 'win32',
        trigger: 'pre-launch-baseline',
        observedProcesses: [],
        observedProcessNames: [],
        labviewProcessObserved: false,
        labviewCliProcessObserved: false,
        lvcompareProcessObserved: false
      };
      const harness = createHarness({
        observeWindowsProcesses: async () => observedProcess,
        observeWindowsTcpListeners: async () => [
          { localAddress: '0.0.0.0', localPort: 3363, pid: 1234, processName: 'LabVIEW.exe' }
        ]
      });
      const record = createRecord();
      await harness.recorder.recordPreLaunchBaseline(record, 1, { requestedTcpPort: 3363 });

      const baselineWrite = harness.writes.find((w) =>
        w.filePath.includes(PRE_LAUNCH_BASELINE_FILENAME)
      );
      expect(baselineWrite).toBeDefined();
      expect(baselineWrite!.filePath.replace(/\\/g, '/')).toContain('attempt-1/');
      const parsed = JSON.parse(baselineWrite!.contents);
      expect(parsed.attemptIndex).toBe(1);
      expect(parsed.applicable).toBe(true);
      expect(parsed.requestedTcpPort).toBe(3363);
      expect(parsed.observedListenerOnRequestedPort).toBe(true);
      expect(parsed.processObservation).toEqual(observedProcess);
      expect(parsed.listenerObservations).toHaveLength(1);
    });

    it('records non-applicable baseline on non-Windows hosts', async () => {
      const harness = createHarness({ processPlatform: 'linux' });
      await harness.recorder.recordPreLaunchBaseline(createRecord(), 1, { requestedTcpPort: 3363 });
      const baselineWrite = harness.writes.find((w) =>
        w.filePath.includes(PRE_LAUNCH_BASELINE_FILENAME)
      );
      expect(baselineWrite).toBeDefined();
      const parsed = JSON.parse(baselineWrite!.contents);
      expect(parsed.applicable).toBe(false);
      expect(parsed.notApplicableReason).toMatch(/windows-host-native/);
    });

    it('records non-applicable baseline when observe deps are not injected', async () => {
      const harness = createHarness();
      await harness.recorder.recordPreLaunchBaseline(createRecord(), 1, { requestedTcpPort: 3363 });
      const baselineWrite = harness.writes.find((w) =>
        w.filePath.includes(PRE_LAUNCH_BASELINE_FILENAME)
      );
      const parsed = JSON.parse(baselineWrite!.contents);
      expect(parsed.applicable).toBe(false);
      expect(parsed.notApplicableReason).toMatch(/observeWindowsProcesses-not-injected/);
    });
  });

  describe('failure classification', () => {
    it('writes a clamped, attempt-scoped classification record', async () => {
      const harness = createHarness();
      const record = createRecord();
      const longFragment = 'x'.repeat(800);
      await harness.recorder.recordFailureClassification(record, 2, {
        failureReason: 'labview-cli-connection-failed',
        diagnosticReason: 'labview-cli-call-by-reference',
        exitCode: 1,
        signal: undefined,
        durationMs: 65878,
        matchedFragment: longFragment,
        matchedFragmentSource: 'stderr',
        artifactPaths: {
          stdout: '/reports/repoid/fileid/runtime-stdout.txt'
        }
      });

      const classificationWrite = harness.writes.find((w) =>
        w.filePath.includes(FAILURE_CLASSIFICATION_FILENAME)
      );
      expect(classificationWrite).toBeDefined();
      expect(classificationWrite!.filePath.replace(/\\/g, '/')).toContain('attempt-2/');
      const parsed = JSON.parse(classificationWrite!.contents);
      expect(parsed.attemptIndex).toBe(2);
      expect(parsed.failureReason).toBe('labview-cli-connection-failed');
      expect(parsed.matchedFragment.length).toBe(501); // 500 chars + ellipsis
      expect(parsed.matchedFragment.endsWith('…')).toBe(true);
      expect(parsed.durationMs).toBe(65878);
    });
  });

  describe('manifest', () => {
    it('lists every emitted artifact and includes existing runtime files', async () => {
      const harness = createHarness({
        observeWindowsProcesses: async () => undefined,
        observeWindowsTcpListeners: async () => []
      });
      const record = createRecord();

      await harness.recorder.recordEnvironmentFingerprint(record);
      await harness.recorder.recordPreLaunchBaseline(record, 1, { requestedTcpPort: 3363 });
      await harness.recorder.recordFailureClassification(record, 1, {
        failureReason: 'labview-cli-connection-failed',
        artifactPaths: {}
      });
      await harness.recorder.flushManifest(record);

      const manifestWrite = harness.writes.find((w) =>
        w.filePath.endsWith(DIAGNOSTICS_MANIFEST_FILENAME)
      );
      expect(manifestWrite).toBeDefined();
      expect(manifestWrite!.filePath.replace(/\\/g, '/')).toBe(
        diagnosticsManifestFilePath(record.artifactPlan.reportDirectory).replace(/\\/g, '/')
      );

      const manifest = JSON.parse(manifestWrite!.contents);
      expect(manifest.schemaVersion).toBe(DIAGNOSTICS_SCHEMA_VERSION);
      expect(manifest.analysisHint).toMatch(/Open this manifest first/);

      const kinds = manifest.entries.map((e: { kind: string }) => e.kind);
      expect(kinds).toEqual(expect.arrayContaining([
        'environment-fingerprint',
        'pre-launch-baseline',
        'failure-classification',
        'runtime-stdout',
        'runtime-stderr',
        'runtime-diagnostic-log',
        'runtime-process-observation',
        'report-metadata',
        'report-packet'
      ]));

      const baselineEntry = manifest.entries.find(
        (e: { kind: string }) => e.kind === 'pre-launch-baseline'
      );
      expect(baselineEntry.attemptIndex).toBe(1);
    });
  });

  describe('archiveAttemptArtifacts', () => {
    it('copies canonical runtime artifacts into attempt-N and registers manifest entries', async () => {
      const reads: Record<string, string> = {
        '/reports/repoid/fileid/runtime-stdout.txt': 'STDOUT-CONTENT',
        '/reports/repoid/fileid/runtime-stderr.txt': 'STDERR-CONTENT',
        '/reports/repoid/fileid/runtime-diagnostic-log.txt': 'DIAG-LOG',
        '/reports/repoid/fileid/runtime-process-observation.json': '{"k":"v"}'
      };
      const harness = createHarness({
        readFile: (async (filePath: string) => {
          const value = reads[String(filePath).replace(/\\/g, '/')];
          if (value == null) {
            throw new Error('ENOENT');
          }
          return value;
        }) as never
      });
      const record = createRecord();

      await harness.recorder.archiveAttemptArtifacts(record, 2);
      await harness.recorder.flushManifest(record);

      const archivedStdout = harness.writes.find((w) =>
        w.filePath.replace(/\\/g, '/').endsWith('attempt-2/runtime-stdout.txt')
      );
      expect(archivedStdout).toBeDefined();
      expect(archivedStdout!.contents).toBe('STDOUT-CONTENT');

      const manifest = JSON.parse(
        harness.writes.find((w) => w.filePath.endsWith(DIAGNOSTICS_MANIFEST_FILENAME))!.contents
      );
      const archivedKinds = manifest.entries
        .filter((e: { attemptIndex?: number }) => e.attemptIndex === 2)
        .map((e: { kind: string }) => e.kind)
        .sort();
      expect(archivedKinds).toEqual(
        [
          'runtime-diagnostic-log',
          'runtime-process-observation',
          'runtime-stderr',
          'runtime-stdout'
        ].sort()
      );
    });

    it('skips silently when sources are missing', async () => {
      const harness = createHarness({
        readFile: (async () => {
          throw new Error('ENOENT');
        }) as never
      });
      const record = createRecord();
      await harness.recorder.archiveAttemptArtifacts(record, 1);
      const archived = harness.writes.filter((w) =>
        w.filePath.replace(/\\/g, '/').includes('/attempt-1/')
      );
      expect(archived.length).toBe(0);
    });
  });

  describe('failure fragment extraction', () => {
    it('extracts a context window around -350000 from stderr when no fragment supplied', async () => {
      const stderr =
        'INFO 2026-06-02 11:00:00 LV starting\nERROR: VI Server connect failed\nDetails: Error code : -350000\nLabVIEW could not establish a connection.\n';
      const reads: Record<string, string> = {
        '/reports/repoid/fileid/runtime-stderr.txt': stderr
      };
      const harness = createHarness({
        readFile: (async (filePath: string) => {
          const value = reads[String(filePath).replace(/\\/g, '/')];
          if (value == null) {
            throw new Error('ENOENT');
          }
          return value;
        }) as never
      });
      const record = createRecord();
      await harness.recorder.recordFailureClassification(record, 1, {
        failureReason: 'labview-cli-connection-failed',
        artifactPaths: {
          stderr: '/reports/repoid/fileid/runtime-stderr.txt'
        }
      });

      const classificationWrite = harness.writes.find((w) =>
        w.filePath.includes(FAILURE_CLASSIFICATION_FILENAME)
      );
      expect(classificationWrite).toBeDefined();
      const parsed = JSON.parse(classificationWrite!.contents);
      expect(parsed.matchedFragmentSource).toBe('stderr');
      expect(parsed.matchedFragment).toContain('-350000');
    });

    it('returns no fragment when reason has no anchor', async () => {
      const harness = createHarness({
        readFile: (async () => 'ERROR: something failed\n') as never
      });
      const record = createRecord();
      await harness.recorder.recordFailureClassification(record, 1, {
        failureReason: 'report-file-not-generated',
        artifactPaths: {
          stderr: '/reports/repoid/fileid/runtime-stderr.txt'
        }
      });

      const classificationWrite = harness.writes.find((w) =>
        w.filePath.includes(FAILURE_CLASSIFICATION_FILENAME)
      );
      const parsed = JSON.parse(classificationWrite!.contents);
      expect(parsed.matchedFragment).toBeUndefined();
      expect(parsed.matchedFragmentSource).toBeUndefined();
    });

    it('falls back to the diagnostic log when the stderr read fails', async () => {
      const diagnosticLog =
        'DEBUG launcher\nError code : -350000 while opening the VI reference\ntrailing context\n';
      const reads: Record<string, string> = {
        '/reports/repoid/fileid/runtime-diagnostic-log.txt': diagnosticLog
      };
      const harness = createHarness({
        readFile: (async (filePath: string) => {
          const value = reads[String(filePath).replace(/\\/g, '/')];
          if (value == null) {
            // stderr path is not in `reads`, so its read fails and the loop
            // must continue to the diagnostic-log source.
            throw new Error('ENOENT');
          }
          return value;
        }) as never
      });
      const record = createRecord();
      await harness.recorder.recordFailureClassification(record, 1, {
        failureReason: 'labview-cli-connection-failed',
        artifactPaths: {
          stderr: '/reports/repoid/fileid/runtime-stderr.txt',
          diagnosticLog: '/reports/repoid/fileid/runtime-diagnostic-log.txt'
        }
      });

      const classificationWrite = harness.writes.find((w) =>
        w.filePath.includes(FAILURE_CLASSIFICATION_FILENAME)
      );
      const parsed = JSON.parse(classificationWrite!.contents);
      expect(parsed.matchedFragmentSource).toBe('diagnostic-log');
      expect(parsed.matchedFragment).toContain('-350000');
    });

    it('skips sources without a configured path and matches stdout', async () => {
      const stdout = 'Error code : -350000 reported by the CLI\n';
      const reads: Record<string, string> = {
        '/reports/repoid/fileid/runtime-stdout.txt': stdout
      };
      const harness = createHarness({
        readFile: (async (filePath: string) => {
          const value = reads[String(filePath).replace(/\\/g, '/')];
          if (value == null) {
            throw new Error('ENOENT');
          }
          return value;
        }) as never
      });
      const record = createRecord();
      // Only stdout is configured; stderr/diagnostic-log candidates are skipped.
      await harness.recorder.recordFailureClassification(record, 1, {
        failureReason: 'labview-cli-connection-failed',
        artifactPaths: {
          stdout: '/reports/repoid/fileid/runtime-stdout.txt'
        }
      });

      const classificationWrite = harness.writes.find((w) =>
        w.filePath.includes(FAILURE_CLASSIFICATION_FILENAME)
      );
      const parsed = JSON.parse(classificationWrite!.contents);
      expect(parsed.matchedFragmentSource).toBe('stdout');
      expect(parsed.matchedFragment).toContain('-350000');
    });
  });

  describe('noopDiagnosticsRecorder', () => {
    it('returns a recorder that performs no work and never throws', async () => {
      const recorder = noopDiagnosticsRecorder();
      const record = createRecord();
      await expect(recorder.recordEnvironmentFingerprint(record)).resolves.toBeUndefined();
      await expect(
        recorder.recordPreLaunchBaseline(record, 1, { requestedTcpPort: 3363 })
      ).resolves.toBeUndefined();
      await expect(
        recorder.recordFailureClassification(record, 1, {
          failureReason: 'x',
          artifactPaths: {}
        })
      ).resolves.toBeUndefined();
      await expect(recorder.archiveAttemptArtifacts(record, 1)).resolves.toBeUndefined();
      await expect(recorder.flushManifest(record)).resolves.toBeUndefined();
    });
  });
});
