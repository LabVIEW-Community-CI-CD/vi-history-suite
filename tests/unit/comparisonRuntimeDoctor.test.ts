import { describe, expect, it } from 'vitest';

import { buildComparisonRuntimeDoctorSummaryFromFacts } from '../../src/reporting/comparisonRuntimeDoctor';
import {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution
} from '../../src/reporting/comparisonReportPacket';
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

  it('gives an actionable next step for missing LabVIEWCLI', () => {
    const summary = blockedSummary('canonical-labview-cli-not-found');

    expect(summary.at(-1)).toContain('install LabVIEWCLI');
    expect(summary.at(-1)).toContain('viHistorySuite.labviewCliPath');
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

  it('includes provider decisions in summary lines (VHS-REQ-155)', () => {
    const summary = blockedSummary('labview-exe-not-found', {
      providerDecisions: [
        {
          provider: 'host-native',
          outcome: 'rejected',
          reason: 'labview-exe-not-found',
          detail: 'LabVIEW 2026 x64 executable was not found at the expected path.'
        }
      ]
    });

    const joinedSummary = summary.join('\n');
    expect(joinedSummary).toContain('Provider decision: rejected host-native');
    expect(joinedSummary).toContain('LabVIEW 2026 x64 executable was not found');
  });

  it('includes checked tool facts in summary for blocked host selection (VHS-REQ-155)', () => {
    const summary = blockedSummary('labview-exe-not-found', {
      labviewExe: undefined,
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'scan',
        exists: true,
        bitness: 'x86'
      }
    });

    const joinedSummary = summary.join('\n');
    expect(joinedSummary).toContain('Selected runtime tools:');
    expect(joinedSummary).toContain('LabVIEWCLI=');
  });

  it('includes checked container facts in summary for blocked Docker selection (VHS-REQ-155)', () => {
    const summary = blockedSummary('docker-provider-unavailable', {
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      containerImage: 'nationalinstruments/labview:2026q1-windows',
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      containerCapabilityAvailable: false,
      containerHostMode: undefined,
      containerImageAvailable: undefined,
      providerDecisions: [
        {
          provider: 'windows-container',
          outcome: 'rejected',
          reason: 'docker-provider-unavailable',
          detail: 'Docker CLI is not available.'
        }
      ]
    });

    const joinedSummary = summary.join('\n');
    expect(joinedSummary).toContain('Selected runtime tools:');
    expect(joinedSummary).toContain('ContainerImage=nationalinstruments/labview:2026q1-windows');
    expect(joinedSummary).toContain('DockerCliAvailable=no');
    expect(joinedSummary).toContain('DockerDaemonReachable=no');
    expect(joinedSummary).toContain('Provider decision: rejected windows-container');
  });

  it('includes selection notes in summary for blocked selections (VHS-REQ-155)', () => {
    const summary = blockedSummary('labview-exe-not-found', {
      notes: [
        'No matching LabVIEW x64 installation detected.',
        'Detected installed LabVIEW 2026 x86, but will not auto-switch bitness.'
      ]
    });

    const joinedSummary = summary.join('\n');
    expect(joinedSummary).toContain('Selection notes:');
    expect(joinedSummary).toContain('No matching LabVIEW x64 installation detected');
    expect(joinedSummary).toContain('will not auto-switch bitness');
  });

  it('gives an actionable next step for concurrent LabVIEW bitness conflict (VHS-REQ-621)', () => {
    const summary = blockedSummary('windows-host-bitness-conflict', {
      bitness: 'x86',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewExecutablePath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    });

    const action = summary.at(-1) ?? '';
    expect(action).toContain('close the running LabVIEW x64 session');
    expect(action).toContain('viHistorySuite.labviewBitness');
    expect(action).toContain('currently x86');
    expect(action).toContain('rerun comparison report generation');
  });

  it('falls back to a generic bitness message when the observed bitness is unknown (VHS-REQ-621)', () => {
    const summary = blockedSummary('windows-host-bitness-conflict', {
      bitness: 'x64',
      hostObservedLabviewBitness: 'unknown'
    });

    const action = summary.at(-1) ?? '';
    expect(action).toContain('match the running session');
    expect(action).toContain('currently x64');
  });

  it('gives an actionable next step for post-failure labview-host-bitness-conflict (VHS-REQ-621)', () => {
    const runtimeSelection: ComparisonRuntimeSelection = {
      platform: 'win32',
      executionMode: 'host-only',
      requestedProvider: 'host',
      requestedLabviewVersion: '2026',
      bitness: 'x86',
      provider: 'host-native',
      providerDecisions: [],
      notes: [],
      registryQueryPlans: [],
      candidates: []
    };
    const runtimeExecution: ComparisonReportRuntimeExecution = {
      state: 'failed',
      attempted: true,
      reportExists: false,
      failureReason: 'labview-host-bitness-conflict'
    };

    const summary = buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus: 'failed',
      runtimeSelection,
      runtimeExecution
    });

    const action = summary.at(-1) ?? '';
    expect(action).toContain('close the running LabVIEW session');
    expect(action).toContain('viHistorySuite.labviewBitness');
    expect(action).toContain('currently x86');
    expect(action).toContain('rerun comparison report generation');
  });

  describe('cli connect window surfacing (VHS-REQ-148)', () => {
    function buildLabviewCliConnectFailedSummary(
      executionOverrides: Partial<ComparisonReportRuntimeExecution> = {}
    ): string[] {
      const runtimeSelection: ComparisonRuntimeSelection = {
        platform: 'win32',
        executionMode: 'host-only',
        requestedProvider: 'host',
        requestedLabviewVersion: '2026',
        bitness: 'x64',
        provider: 'host-native',
        engine: 'labview-cli',
        providerDecisions: [],
        notes: [],
        registryQueryPlans: [],
        candidates: []
      };
      const runtimeExecution: ComparisonReportRuntimeExecution = {
        state: 'failed',
        attempted: true,
        reportExists: false,
        failureReason: 'labview-cli-connection-failed',
        ...executionOverrides
      };
      return buildComparisonRuntimeDoctorSummaryFromFacts({
        reportStatus: 'failed' as ComparisonReportPacketRecord['reportStatus'],
        runtimeSelection,
        runtimeExecution
      });
    }

    it('emits applied=true line when hardening succeeded', () => {
      const summary = buildLabviewCliConnectFailedSummary({
        cliConnectTimeoutHardening: { applied: true, requestedValue: 180 }
      });
      expect(summary).toContain('cli connect window: applied=true requestedValue=180.');
    });

    it('emits applied=false line with reason when hardening did not apply', () => {
      const summary = buildLabviewCliConnectFailedSummary({
        cliConnectTimeoutHardening: {
          applied: false,
          requestedValue: 180,
          reason: 'no-candidate'
        }
      });
      expect(summary).toContain(
        'cli connect window: applied=false requestedValue=180 reason=no-candidate.'
      );
    });

    it('omits the line when cliConnectTimeoutHardening is absent', () => {
      const summary = buildLabviewCliConnectFailedSummary();
      expect(summary.some((line) => line.startsWith('cli connect window:'))).toBe(false);
    });

    it('omits the line for other failure reasons even when hardening data is present', () => {
      const summary = buildLabviewCliConnectFailedSummary({
        failureReason: 'labview-host-bitness-conflict',
        cliConnectTimeoutHardening: { applied: true, requestedValue: 180 }
      });
      expect(summary.some((line) => line.startsWith('cli connect window:'))).toBe(false);
    });
  });
});
