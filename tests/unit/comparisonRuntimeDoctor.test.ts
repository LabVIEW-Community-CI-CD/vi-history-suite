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
        providerDecisions: [
          {
            provider: 'windows-container',
            outcome: 'rejected',
            reason: 'windows-container-image-unavailable',
            detail:
              'Windows container image nationalinstruments/labview:2026q1-windows was not available to the current host.'
          },
          {
            provider: 'host-native',
            outcome: 'rejected',
            reason: 'host-native-comparison-tool-not-found',
            detail:
              'A supported LabVIEW 2026 executable was located, but neither LabVIEWCLI nor LVCompare was located for host-native comparison-report execution.'
          }
        ],
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
      'Selected execution mode=auto.',
      'Provider decision: rejected windows-container because Windows container image nationalinstruments/labview:2026q1-windows was not available to the current host.',
      'Provider decision: rejected host-native because A supported LabVIEW 2026 executable was located, but neither LabVIEWCLI nor LVCompare was located for host-native comparison-report execution.',
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
        executionMode: 'host-only',
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
        providerDecisions: [
          {
            provider: 'windows-container',
            outcome: 'rejected',
            reason: 'windows-x86-reference-lane-stays-host-native',
            detail:
              'Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.'
          },
          {
            provider: 'host-native',
            outcome: 'selected',
            reason: 'host-native-labview-cli-selected',
            detail:
              'Host-native LabVIEW 2026 and LabVIEWCLI were available, and the Windows x86 lane prefers host-native execution.'
          }
        ],
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
    expect(lines).toContain('Selected execution mode=host-only.');
    expect(lines).toContain(
      'Selected runtime tools: LabVIEW=C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe | LabVIEWCLI=C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe.'
    );
    expect(lines).toContain(
      'Provider decision: rejected windows-container because Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.'
    );
    expect(lines).toContain(
      'Provider decision: selected host-native because Host-native LabVIEW 2026 and LabVIEWCLI were available, and the Windows x86 lane prefers host-native execution.'
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
        executionMode: 'docker-only',
        preferBitness: 'auto',
        provider: 'windows-container',
        engine: 'labview-cli',
        windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
        providerDecisions: [
          {
            provider: 'windows-container',
            outcome: 'selected',
            reason: 'windows-container-preferred-and-available',
            detail:
              'Windows container image nationalinstruments/labview:2026q1-windows is available and Windows 64-bit comparison-report execution prefers isolation.'
          },
          {
            provider: 'host-native',
            outcome: 'rejected',
            reason: 'windows-container-preferred-over-host-native',
            detail:
              'Host-native Windows 64-bit execution was not selected because isolated Windows container execution is preferred when available.'
          }
        ],
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
    expect(lines).toContain('Selected execution mode=docker-only.');
    expect(lines).toContain(
      'Selected runtime tools: ContainerImage=nationalinstruments/labview:2026q1-windows.'
    );
    expect(lines).toContain(
      'Provider decision: selected windows-container because Windows container image nationalinstruments/labview:2026q1-windows is available and Windows 64-bit comparison-report execution prefers isolation.'
    );
    expect(lines).toContain(
      'Provider decision: rejected host-native because Host-native Windows 64-bit execution was not selected because isolated Windows container execution is preferred when available.'
    );
    expect(lines.at(-1)).toBe(
      'Next action: review the retained LabVIEW comparison report and use the concentrated dashboard metadata surfaces for multi-commit analysis.'
    );
  });

  it('uses mode-aware next action guidance for docker-only blocks', () => {
    const lines = buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus: 'blocked-runtime',
      runtimeSelection: {
        platform: 'win32',
        executionMode: 'docker-only',
        preferBitness: 'x64',
        provider: 'unavailable',
        blockedReason: 'docker-only-provider-unavailable',
        providerDecisions: [
          {
            provider: 'windows-container',
            outcome: 'rejected',
            reason: 'docker-only-provider-unavailable',
            detail:
              'Docker-only execution was requested, but Windows container image nationalinstruments/labview:2026q1-windows was not available to the current host.'
          },
          {
            provider: 'host-native',
            outcome: 'rejected',
            reason: 'execution-mode-docker-only-disallows-host-native',
            detail:
              'Host-native execution was not selected because docker-only execution was requested.'
          }
        ],
        notes: [],
        registryQueryPlans: [],
        candidates: []
      },
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'docker-only-provider-unavailable',
        diagnosticNotes: []
      }
    });

    expect(lines).toContain('Selected execution mode=docker-only.');
    expect(lines.at(-1)).toBe(
      'Next action: install, enable, or switch Docker to Windows-container mode, or change execution mode, then rerun comparison report generation.'
    );
  });
});
