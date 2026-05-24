import { describe, expect, it } from 'vitest';

import { buildComparisonRuntimeDoctorSummaryFromFacts } from '../../src/reporting/comparisonRuntimeDoctor';
import { ComparisonReportRuntimeExecution } from '../../src/reporting/comparisonReportPacket';
import { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';

function blockedSummary(
  blockedReason: string,
  selectionOverrides: Partial<ComparisonRuntimeSelection> = {},
  executionOverrides: Partial<ComparisonReportRuntimeExecution> = {}
): string[] {
  const runtimeSelection: ComparisonRuntimeSelection = {
    platform: 'win32',
    executionMode: 'host-only',
    requestedProvider: 'host',
    requestedLabviewVersion: '2026',
    bitness: 'x64',
    provider: 'unavailable',
    blockedReason,
    providerDecisions: [
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: blockedReason,
        detail: `Rejected because ${blockedReason}`
      }
    ],
    notes: [`Selection note for ${blockedReason}`],
    registryQueryPlans: [],
    candidates: [],
    ...selectionOverrides
  };
  const runtimeExecution: ComparisonReportRuntimeExecution = {
    state: 'not-available',
    attempted: false,
    reportExists: false,
    blockedReason,
    ...executionOverrides
  };

  return buildComparisonRuntimeDoctorSummaryFromFacts({
    reportStatus: 'blocked-runtime',
    runtimeSelection,
    runtimeExecution
  });
}

describe('comparisonRuntimeDoctor diagnostics', () => {
  it('summarizes requested and selected runtime facts for blocked selections', () => {
    const summary = blockedSummary('labview-exe-not-found');

    expect(summary).toContain(
      'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.'
    );
    expect(summary).toContain('Provider request=host.');
    expect(summary).toContain('Requested runtime: provider=host; LabVIEW=2026; bitness=x64.');
    expect(summary).toContain('Runtime blocked reason: labview-exe-not-found.');
  });

  it('gives an actionable next step for configured LabVIEWCLI path failures', () => {
    const summary = blockedSummary('configured-labview-cli-path-missing');

    expect(summary.at(-1)).toContain('correct or remove viHistorySuite.labviewCliPath');
    expect(summary.at(-1)).toContain('rerun comparison report generation');
  });

  it('gives an actionable next step for missing LabVIEW runtime', () => {
    const summary = blockedSummary('labview-exe-not-found');

    expect(summary.at(-1)).toContain('install the selected LabVIEW version and bitness');
    expect(summary.at(-1)).toContain('viHistorySuite.labviewVersion');
    expect(summary.at(-1)).toContain('viHistorySuite.labviewBitness');
  });

  it('gives an actionable next step for missing matching LabVIEWCLI', () => {
    const summary = blockedSummary('labview-cli-not-found-for-bitness');

    expect(summary.at(-1)).toContain('install the matching LabVIEWCLI');
    expect(summary.at(-1)).toContain('viHistorySuite.labviewBitness');
  });

  it('keeps unsupported LabVIEW version guidance version-specific', () => {
    const summary = blockedSummary('labview-version-unsupported-for-comparison-report', {
      requestedLabviewVersion: '2024'
    });

    expect(summary).toContain('Requested runtime: provider=host; LabVIEW=2024; bitness=x64.');
    expect(summary.at(-1)).toContain('set viHistorySuite.labviewVersion to 2025, 2026, or newer');
  });

  it('does not treat unimplemented Docker LabVIEW versions as Docker repair work', () => {
    const summary = blockedSummary('docker-provider-labview-version-not-implemented', {
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      requestedLabviewVersion: '2025',
      providerDecisions: [
        {
          provider: 'windows-container',
          outcome: 'rejected',
          reason: 'docker-provider-labview-version-not-implemented',
          detail: 'Requested Docker LabVIEW year is not implemented.'
        }
      ]
    });

    expect(summary).toContain('Requested runtime: provider=docker; LabVIEW=2025; bitness=x64.');
    expect(summary.at(-1)).toContain('use Docker with viHistorySuite.labviewVersion=2026');
    expect(summary.at(-1)).toContain('or switch viHistorySuite.runtimeProvider to host');
  });

  it('points failed container image acquisition at image recovery', () => {
    const summary = blockedSummary(
      'container-image-acquisition-failed',
      {
        executionMode: 'docker-only',
        requestedProvider: 'docker',
        provider: 'windows-container',
        containerImage: 'nationalinstruments/labview:2026q1-windows',
        dockerCliAvailable: true,
        dockerDaemonReachable: true,
        containerCapabilityAvailable: true,
        containerHostMode: 'windows',
        containerImageAvailable: false,
        containerAcquisitionState: 'failed'
      },
      {
        blockedReason: 'container-image-acquisition-failed'
      }
    );

    expect(summary.at(-1)).toContain('repair Docker connectivity or image registry access');
    expect(summary.at(-1)).toContain('nationalinstruments/labview:2026q1-windows');
  });

  it('retains settings freshness guidance for blocked requested providers', () => {
    const summary = blockedSummary('labview-runtime-selection-required', {
      requestedProvider: 'host'
    });

    expect(summary).toContain(
      'Settings freshness: review Compare or runtime validation again after the generated settings CLI update. Reload or restart the window only if this already-running VS Code session still shows stale provider or runtime facts.'
    );
  });
});
