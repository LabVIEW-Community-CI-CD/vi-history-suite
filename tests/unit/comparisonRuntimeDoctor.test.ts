import { describe, expect, it } from 'vitest';

import { buildComparisonRuntimeDoctorSummaryFromFacts } from '../../src/reporting/comparisonRuntimeDoctor';

describe('comparisonRuntimeDoctor', () => {
  it('summarizes blocked runtime selection facts and next action', () => {
    const lines = buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus: 'blocked-runtime',
      runtimeSelection: {
        platform: 'win32',
        preferBitness: 'x64',
        provider: 'unavailable',
        blockedReason: 'comparison-tool-not-found',
        notes: ['Configured LabVIEW CLI path was missing.'],
        registryQueryPlans: [],
        candidates: []
      },
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'comparison-tool-not-found',
        diagnosticNotes: []
      }
    });

    expect(lines).toEqual([
      'Selected provider=unavailable; engine=none; platform=win32; preferBitness=x64.',
      'Selection notes: Configured LabVIEW CLI path was missing.',
      'Runtime blocked reason: comparison-tool-not-found.',
      'Next action: make the selected runtime provider available or adjust runtime settings, then rerun comparison report generation.'
    ]);
  });

  it('summarizes failed runtime execution with diagnostics and next action', () => {
    const lines = buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus: 'ready-for-runtime',
      runtimeSelection: {
        platform: 'win32',
        preferBitness: 'x86',
        provider: 'host-native',
        engine: 'labview-cli',
        labviewExe: {
          kind: 'labview-exe',
          path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
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
        notes: ['Host-native execution was selected.'],
        registryQueryPlans: [],
        candidates: []
      },
      runtimeExecution: {
        state: 'failed',
        attempted: true,
        reportExists: false,
        failureReason: 'labview-cli-log-only-no-labview-at-banner-snapshot',
        diagnosticReason: 'labview-path-ignored-last-used-matched-selection',
        diagnosticLogSourcePath: 'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
        observedProcessNames: ['LabVIEWCLI.exe'],
        diagnosticNotes: []
      }
    });

    expect(lines).toContain(
      'Selected provider=host-native; engine=labview-cli; platform=win32; preferBitness=x86.'
    );
    expect(lines).toContain(
      'Selected runtime tools: LabVIEW=C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe | LabVIEWCLI=C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe.'
    );
    expect(lines).toContain('Selection notes: Host-native execution was selected.');
    expect(lines).toContain(
      'Runtime failure reason: labview-cli-log-only-no-labview-at-banner-snapshot.'
    );
    expect(lines).toContain(
      'Runtime diagnostic reason: labview-path-ignored-last-used-matched-selection.'
    );
    expect(lines).toContain(
      'Diagnostic log source: C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log.'
    );
    expect(lines).toContain('Observed process names: LabVIEWCLI.exe.');
    expect(lines.at(-1)).toBe(
      'Next action: use the retained runtime notes, stdout/stderr artifacts, and diagnostic log to correct the runtime environment, then rerun comparison report generation.'
    );
  });

  it('summarizes successful execution with review-oriented next action', () => {
    const lines = buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus: 'ready-for-runtime',
      runtimeSelection: {
        platform: 'win32',
        preferBitness: 'auto',
        provider: 'windows-container',
        engine: 'labview-cli',
        windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
        notes: [],
        registryQueryPlans: [],
        candidates: []
      },
      runtimeExecution: {
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        diagnosticNotes: []
      }
    });

    expect(lines).toContain(
      'Selected provider=windows-container; engine=labview-cli; platform=win32; preferBitness=auto.'
    );
    expect(lines).toContain(
      'Selected runtime tools: ContainerImage=nationalinstruments/labview:2026q1-windows.'
    );
    expect(lines.at(-1)).toBe(
      'Next action: review the retained NI comparison report and use the concentrated dashboard metadata surfaces for multi-commit analysis.'
    );
  });
});
