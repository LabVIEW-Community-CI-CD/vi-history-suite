import { describe, expect, it } from 'vitest';

import {
  parseLabviewCliDiagnosticLogPath,
  resolveHostReadableDiagnosticPath,
  resolveMappedRuntimeDiagnosticPath,
  classifyLabviewCliDiagnosticText
} from '../../src/reporting/runtime/labviewCliDiagnostics';

describe('parseLabviewCliDiagnosticLogPath', () => {
  it('extracts the log path from the CLI banner', () => {
    expect(
      parseLabviewCliDiagnosticLogPath('LabVIEWCLI started logging in file: C:\\logs\\cli.log\n')
    ).toBe('C:\\logs\\cli.log');
  });

  it('returns undefined when the banner is absent', () => {
    expect(parseLabviewCliDiagnosticLogPath('no banner here')).toBeUndefined();
  });
});

describe('resolveMappedRuntimeDiagnosticPath', () => {
  it('maps a runtime-root path into the host root', () => {
    expect(
      resolveMappedRuntimeDiagnosticPath('/workspace/staging/cli.log', {
        runtimeRoot: '/workspace',
        hostRoot: '/home/user/report'
      })
    ).toBe('/home/user/report/staging/cli.log');
  });

  it('returns undefined without a mapping or when outside the runtime root', () => {
    expect(resolveMappedRuntimeDiagnosticPath('/workspace/cli.log')).toBeUndefined();
    expect(
      resolveMappedRuntimeDiagnosticPath('/elsewhere/cli.log', {
        runtimeRoot: '/workspace',
        hostRoot: '/home/user'
      })
    ).toBeUndefined();
  });
});

describe('resolveHostReadableDiagnosticPath', () => {
  it('prefers the mapped path when a mapping is provided', () => {
    expect(
      resolveHostReadableDiagnosticPath('/workspace/cli.log', 'linux', {
        runtimeRoot: '/workspace',
        hostRoot: '/home/user'
      })
    ).toBe('/home/user/cli.log');
  });

  it('returns the trimmed path on win32 with no mapping', () => {
    expect(resolveHostReadableDiagnosticPath('C:\\logs\\cli.log', 'win32')).toBe(
      'C:\\logs\\cli.log'
    );
  });

  it('passes an absolute posix path through on linux with no mapping', () => {
    expect(resolveHostReadableDiagnosticPath('/tmp/cli.log', 'linux')).toBe('/tmp/cli.log');
  });
});

describe('classifyLabviewCliDiagnosticText', () => {
  it('classifies invalid VI path errors', () => {
    const result = classifyLabviewCliDiagnosticText(
      'path invalid or does not exist: C:\\missing.vi'
    );
    expect(result.reason).toBe('labview-cli-invalid-vi-path');
    expect(result.notes.some((n) => n.includes('rejected one or more supplied paths'))).toBe(true);
  });

  it('classifies password-protected VIs', () => {
    const result = classifyLabviewCliDiagnosticText('VI is password protected.');
    expect(result.reason).toBe('labview-cli-vi-password-protected');
  });

  it('reports success with no reason when the operation succeeds', () => {
    const result = classifyLabviewCliDiagnosticText('CreateComparisonReport operation succeeded.');
    expect(result.reason).toBeUndefined();
    expect(result.notes.some((n) => n.includes('operation succeeded'))).toBe(true);
  });

  it('classifies the ignored -LabVIEWPath (matched selection) case', () => {
    const text =
      '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\NI\\LabVIEW.exe"';
    const result = classifyLabviewCliDiagnosticText(text, 'C:/NI/LabVIEW.exe');
    expect(result.reason).toBe('labview-path-ignored-last-used-matched-selection');
  });
});
