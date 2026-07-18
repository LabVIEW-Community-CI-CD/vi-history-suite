import { describe, expect, it } from 'vitest';

import {
  buildRecoveredExecutionResult,
  buildColdLaunchRetryExecutionResult
} from '../../src/reporting/runtime/recoveryExecutionResults';
import type { ComparisonReportRuntimeExecution } from '../../src/reporting/comparisonReportPacket';

function execution(
  overrides: Partial<ComparisonReportRuntimeExecution> = {}
): ComparisonReportRuntimeExecution {
  return {
    state: 'succeeded',
    ...overrides
  } as ComparisonReportRuntimeExecution;
}

describe('buildRecoveredExecutionResult (VHS-REQ-148)', () => {
  it('accumulates duration, merges notes, and attaches session-reset artifacts', () => {
    const initial = execution({
      startedAt: '2026-07-18T00:00:00.000Z',
      durationMs: 100,
      diagnosticNotes: ['initial-note']
    });
    const retried = execution({
      startedAt: '2026-07-18T00:05:00.000Z',
      durationMs: 200,
      diagnosticNotes: ['retry-note']
    });

    const result = buildRecoveredExecutionResult(
      initial,
      {
        notes: ['reset-note'],
        durationMs: 50,
        executable: 'LabVIEWCLI',
        args: ['-OperationName', 'CloseLabVIEW'],
        exitCode: 0,
        stdoutFilePath: '/tmp/reset-out.txt',
        stderrFilePath: '/tmp/reset-err.txt'
      },
      retried,
      'recovered-note'
    );

    expect(result.startedAt).toBe('2026-07-18T00:00:00.000Z');
    expect(result.durationMs).toBe(350);
    expect(result.diagnosticNotes).toEqual(['retry-note', 'recovered-note', 'reset-note']);
    expect(result.headlessSessionResetExecutable).toBe('LabVIEWCLI');
    expect(result.headlessSessionResetArgs).toEqual(['-OperationName', 'CloseLabVIEW']);
    expect(result.headlessSessionResetExitCode).toBe(0);
    expect(result.headlessSessionResetStdoutFilePath).toBe('/tmp/reset-out.txt');
    expect(result.headlessSessionResetStderrFilePath).toBe('/tmp/reset-err.txt');
  });

  it('falls back to the retried startedAt and treats missing durations as zero', () => {
    const initial = execution({ diagnosticNotes: undefined });
    const retried = execution({ startedAt: '2026-07-18T01:00:00.000Z' });

    const result = buildRecoveredExecutionResult(
      initial,
      {
        notes: [],
        durationMs: 25,
        executable: 'LabVIEWCLI',
        args: [],
        stdoutFilePath: '/tmp/o.txt',
        stderrFilePath: '/tmp/e.txt'
      },
      retried,
      'note'
    );

    expect(result.startedAt).toBe('2026-07-18T01:00:00.000Z');
    expect(result.durationMs).toBe(25);
  });
});

describe('buildColdLaunchRetryExecutionResult (VHS-REQ-148)', () => {
  it('accumulates duration and prepends the recovery note without session-reset artifacts', () => {
    const initial = execution({
      startedAt: '2026-07-18T02:00:00.000Z',
      durationMs: 300
    });
    const retried = execution({
      startedAt: '2026-07-18T02:10:00.000Z',
      durationMs: 400,
      diagnosticNotes: ['retry-note']
    });

    const result = buildColdLaunchRetryExecutionResult(initial, retried, 'cold-launch-note');

    expect(result.startedAt).toBe('2026-07-18T02:00:00.000Z');
    expect(result.durationMs).toBe(700);
    expect(result.diagnosticNotes).toEqual(['retry-note', 'cold-launch-note']);
    expect(result.headlessSessionResetExecutable).toBeUndefined();
  });

  it('dedupes a recovery note already present on the retried result', () => {
    const initial = execution({ durationMs: 10 });
    const retried = execution({ durationMs: 20, diagnosticNotes: ['dup-note'] });

    const result = buildColdLaunchRetryExecutionResult(initial, retried, 'dup-note');

    expect(result.durationMs).toBe(30);
    expect(result.diagnosticNotes).toEqual(['dup-note']);
  });
});
