import { describe, expect, it } from 'vitest';

import {
  classifyRuntimeFailure,
  classifyCancelledRuntimeFailure,
  classifyTimedOutRuntimeDiagnostic
} from '../../src/reporting/runtime/runtimeFailureClassification';

describe('classifyRuntimeFailure', () => {
  it('reports report-file-not-generated on clean exit without a report', () => {
    expect(
      classifyRuntimeFailure({ exitCode: 0, reportExists: false, stdout: '', stderr: '' }).reason
    ).toBe('report-file-not-generated');
  });

  it('reports lvcompare-exited-zero-without-report for lvcompare', () => {
    expect(
      classifyRuntimeFailure({
        engine: 'lvcompare',
        exitCode: 0,
        reportExists: false,
        stdout: '',
        stderr: ''
      }).reason
    ).toBe('lvcompare-exited-zero-without-report');
  });

  it('detects a forward-version VI error from stderr', () => {
    expect(
      classifyRuntimeFailure({
        engine: 'labview-cli',
        exitCode: 1125,
        reportExists: false,
        stdout: '',
        stderr: 'File version is later than the current LabVIEW version'
      }).reason
    ).toBe('labview-vi-version-too-new');
  });

  it('detects the -350000 VI Server connection failure', () => {
    expect(
      classifyRuntimeFailure({
        engine: 'labview-cli',
        exitCode: 1,
        reportExists: false,
        stdout: 'other',
        stderr: 'Error code : -350000'
      }).reason
    ).toBe('labview-cli-connection-failed');
  });

  it('falls back to command-exited-nonzero', () => {
    expect(
      classifyRuntimeFailure({
        engine: 'labview-cli',
        exitCode: 3,
        reportExists: false,
        stdout: 'other output',
        stderr: 'some unrelated error'
      }).reason
    ).toBe('command-exited-nonzero');
  });
});

describe('classifyCancelledRuntimeFailure', () => {
  it('preserves a Call By Reference failure as a nonzero exit', () => {
    expect(
      classifyCancelledRuntimeFailure({
        engine: 'labview-cli',
        diagnosticReason: 'labview-cli-call-by-reference'
      }).reason
    ).toBe('command-exited-nonzero');
  });

  it('reports command-cancelled otherwise', () => {
    expect(classifyCancelledRuntimeFailure({}).reason).toBe('command-cancelled');
  });
});

describe('classifyTimedOutRuntimeDiagnostic', () => {
  it('returns no reason when the CLI banner condition is not met', () => {
    expect(classifyTimedOutRuntimeDiagnostic({ engine: 'lvcompare' })).toEqual({ notes: [] });
  });

  it('classifies a timeout with no LabVIEW at the banner snapshot', () => {
    const result = classifyTimedOutRuntimeDiagnostic({
      engine: 'labview-cli',
      processObservation: {
        trigger: 'cli-log-banner',
        capturedAt: '2026-01-01T00:00:00.000Z',
        observedProcessNames: ['LabVIEWCLI.exe'],
        labviewProcessObserved: false,
        labviewCliProcessObserved: true,
        lvcompareProcessObserved: false
      }
    });
    expect(result.reason).toBe('labview-cli-timeout-no-labview-at-banner-snapshot');
  });
});
