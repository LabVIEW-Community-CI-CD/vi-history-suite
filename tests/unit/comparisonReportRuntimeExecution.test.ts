import { afterEach, describe, expect, it, vi } from 'vitest';

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  defaultNowIso,
  defaultNowMs,
  executeComparisonReport,
  normalizeComparisonProcessError,
  pathExistsForReport,
  runComparisonCommandPlan
} from '../../src/reporting/comparisonReportRuntimeExecution';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

function createReadyRecord(): ComparisonReportPacketRecord {
  return {
    generatedAt: '2026-04-02T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    artifactPlan: {
      repoId: 'repoid123456',
      fileId: 'fileid123456',
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: 'foo.vi',
      reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
      stagingDirectory: '/workspace/.storage/reports/repoid123456/fileid123456/staging',
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      runtimeStdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      runtimeStderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
      allowedLocalRootPaths: [
        '/workspace/.storage',
        '/workspace/.storage/reports/repoid123456'
      ]
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi'
    },
    preflight: {
      normalizedRelativePath: 'foo.vi',
      ready: true,
      left: {
        revisionId: '1111111122222222',
        blobSpecifier: '1111111122222222:foo.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: 'abcdef1234567890',
        blobSpecifier: 'abcdef1234567890:foo.vi',
        signature: 'LVCC',
        isVi: true
      }
    },
    runtimeSelection: {
      platform: 'win32',
      preferBitness: 'x86',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'configured',
        exists: true,
        bitness: 'x86'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
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

describe('comparisonReportRuntimeExecution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stages revision blobs, runs the governed command, and retains successful execution evidence', async () => {
    const writes: Array<{ filePath: string; value: string | Buffer }> = [];
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn(async (filePath: string, value: string | Buffer) => {
          writes.push({ filePath, value });
        }) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'command stdout',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValueOnce('2026-04-02T01:00:00.000Z').mockReturnValueOnce('2026-04-02T01:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord
      }
    );

    expect(result.record.runtimeExecutionState).toBe('succeeded');
    expect(result.record.runtimeExecution.reportExists).toBe(true);
    expect(result.record.runtimeExecution.durationMs).toBe(3000);
    expect(result.record.runtimeExecution.executable).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(writes).toEqual(
      expect.arrayContaining([
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          value: Buffer.from('left')
        },
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          value: Buffer.from('right')
        },
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
          value: 'command stdout'
        },
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
          value: ''
        }
      ])
    );
    expect(writePacketRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeExecutionState: 'succeeded'
      }),
      expect.any(Object)
    );
  });

  it('fails with an explicit reason when the governed command exits without generating the report file', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: '',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1001),
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('report-file-not-generated');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
  });

  it('retains a command-exited-nonzero failure when the tool reports an error', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 2,
          stdout: '',
          stderr: 'tool failed'
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1005),
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-exited-nonzero');
    expect(result.record.runtimeExecution.exitCode).toBe(2);
    expect(result.record.runtimeExecution.reportExists).toBe(true);
  });

  it('fails closed before command launch when staging the left revision blob fails', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi.fn().mockRejectedValue(new Error('missing blob')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn(),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('left-stage-blob-write-failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
  });

  it('retains blocked runtime state without attempting execution when the governed plan is unavailable', async () => {
    const record = createReadyRecord();
    record.reportStatus = 'blocked-runtime';
    record.runtimeSelection.provider = 'unavailable';
    record.runtimeSelection.blockedReason = 'comparison-tool-not-found';
    delete record.runtimeSelection.engine;

    const readRevisionBlob = vi.fn();
    const runCommand = vi.fn();

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob,
        runCommand,
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('not-available');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.blockedReason).toBe('comparison-tool-not-found');
    expect(readRevisionBlob).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('retains a failed execution-plan-blocked state when preflight is blocked before runtime execution', async () => {
    const record = createReadyRecord();
    record.reportStatus = 'blocked-preflight';
    record.preflight.ready = false;
    record.preflight.blockedReason = 'right-blob-not-vi';

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('execution-plan-blocked');
    expect(result.record.runtimeExecution.blockedReason).toBe('right-blob-not-vi');
  });

  it('fails closed before command launch when staging the right revision blob fails', async () => {
    const runCommand = vi.fn();
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockRejectedValueOnce(new Error('missing blob')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('right-stage-blob-write-failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('retains command-spawn-failed with normalized stdout and stderr when the tool cannot be launched', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockRejectedValue({
          stdout: 'partial stdout',
          stderr: 'spawn failed',
          signal: 'SIGTERM'
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:02.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-spawn-failed');
    expect(result.record.runtimeExecution.attempted).toBe(true);
    expect(result.record.runtimeExecution.signal).toBe('SIGTERM');
    expect(result.record.runtimeExecution.durationMs).toBe(2000);
  });

  it('runs a simple command plan and resolves nonzero exits without throwing', async () => {
    await expect(
      runComparisonCommandPlan({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("ok"); process.stderr.write("warn");']
      })
    ).resolves.toEqual({
      exitCode: 0,
      stdout: 'ok',
      stderr: 'warn'
    });

    await expect(
      runComparisonCommandPlan({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("x"); process.stderr.write("bad"); process.exit(3);']
      })
    ).resolves.toEqual({
      exitCode: 3,
      signal: undefined,
      stdout: 'x',
      stderr: 'bad'
    });
  });

  it('rejects raw execFile failures when the process never returns a numeric exit code', async () => {
    const execFileImpl = vi.fn(
      (
        _file: string,
        _args: readonly string[] | undefined,
        _options:
          | { encoding: BufferEncoding; maxBuffer: number; windowsHide: boolean }
          | undefined,
        callback:
          | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)
          | undefined
      ) => {
        const error = Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
        callback?.(error, '', '');
      }
    );

    await expect(
      runComparisonCommandPlan({
        executable: 'missing-command',
        args: []
      }, {
        execFileImpl: execFileImpl as never
      })
    ).rejects.toMatchObject({
      message: 'spawn failed',
      code: 'ENOENT'
    });
  });

  it('normalizes comparison-process errors and report-path existence using the default helpers', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-runtime-execution-'));
    const existingPath = path.join(tempRoot, 'report.html');
    await fs.writeFile(existingPath, '<html></html>');

    await expect(pathExistsForReport(existingPath)).resolves.toBe(true);
    await expect(pathExistsForReport(path.join(tempRoot, 'missing.html'))).resolves.toBe(false);

    expect(
      normalizeComparisonProcessError({
        stdout: 'a',
        stderr: 'b',
        signal: 'SIGKILL'
      })
    ).toEqual({
      stdout: 'a',
      stderr: 'b',
      signal: 'SIGKILL'
    });

    expect(normalizeComparisonProcessError('plain failure')).toEqual({
      stdout: '',
      stderr: 'plain failure'
    });

    expect(defaultNowIso()).toMatch(/^20\d\d-\d\d-\d\dT/);
    expect(defaultNowMs()).toBeTypeOf('number');

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
