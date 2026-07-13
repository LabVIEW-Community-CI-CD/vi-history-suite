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

  it('reports the image-derived LabVIEW year for a container provider (VHS-REQ-657.6)', () => {
    const summary = blockedSummary('container-image-acquisition-failed', {
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      requestedLabviewVersion: undefined,
      provider: 'linux-container',
      containerImage: 'nationalinstruments/labview:2025q3-linux'
    });

    // Docker is LabVIEW-agnostic; the selected image governs the version, so the
    // requested-runtime line names 2025 (from the image) rather than a stale 2026.
    expect(summary).toContain('Requested runtime: provider=docker; LabVIEW=2025; bitness=x64.');
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

  it('guides a container image platform mismatch toward the engine or version fix (VHS-REQ-650.5)', () => {
    const summary = blockedSummary(
      'container-image-platform-mismatch',
      {
        executionMode: 'docker-only',
        requestedProvider: 'docker',
        provider: 'unavailable',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        dockerCliAvailable: true,
        dockerDaemonReachable: true,
        containerCapabilityAvailable: true,
        containerHostMode: 'windows'
      },
      {
        blockedReason: 'container-image-platform-mismatch'
      }
    );

    expect(summary).toContain('Runtime blocked reason: container-image-platform-mismatch.');
    expect(summary.at(-1)).toContain('viHistorySuite.container.imageVersion');
    expect(summary.at(-1)).toContain('windows-container mode');
    expect(summary.at(-1)).toContain('switch Docker to the matching container engine');
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

  it('gives an actionable next step for concurrent LabVIEW bitness conflict (VHS-REQ-621.4)', () => {
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

  it('falls back to a generic bitness message when the observed bitness is unknown (VHS-REQ-621.4)', () => {
    const summary = blockedSummary('windows-host-bitness-conflict', {
      bitness: 'x64',
      hostObservedLabviewBitness: 'unknown'
    });

    const action = summary.at(-1) ?? '';
    expect(action).toContain('match the running session');
    expect(action).toContain('currently x64');
  });

  it('gives an actionable next step for concurrent LabVIEW version conflict (VHS-REQ-653.5)', () => {
    const summary = blockedSummary('windows-host-version-conflict', {
      bitness: 'x64',
      requestedLabviewVersion: '2026',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewVersion: '2025',
      hostObservedLabviewExecutablePath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
    });

    const action = summary.at(-1) ?? '';
    expect(action).toContain('close the running LabVIEW 2025 session');
    expect(action).toContain('viHistorySuite.labviewVersion');
    expect(action).toContain('currently 2026');
    expect(action).toContain('Docker-backed x64 compare');
    expect(action).toContain('rerun comparison report generation');
  });

  it('gives an actionable next step for post-failure labview-host-bitness-conflict (VHS-REQ-621.4)', () => {
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

  it('gives an actionable next step for post-failure labview-vi-version-too-new (VHS-REQ-658.5)', () => {
    const runtimeSelection: ComparisonRuntimeSelection = {
      platform: 'win32',
      executionMode: 'host-only',
      requestedProvider: 'host',
      requestedLabviewVersion: '2025',
      bitness: 'x64',
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
      failureReason: 'labview-vi-version-too-new'
    };

    const summary = buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus: 'failed',
      runtimeSelection,
      runtimeExecution
    });

    const action = summary.at(-1) ?? '';
    expect(action).toContain('newer LabVIEW than the selected LabVIEW 2025 (x64)');
    expect(action).toContain('Pick a newer installed LabVIEW');
    expect(action).toContain('viHistorySuite.labviewVersion');
    expect(action).toContain('rerun comparison report generation');
  });

  it('names VI Server and the enable path for a Windows VI-Server-disabled block (VHS-REQ-628)', () => {
    const summary = blockedSummary(
      'windows-vi-server-tcp-disabled',
      { provider: 'host-native', engine: 'labview-cli' },
      { engine: 'labview-cli' }
    );

    const action = summary.at(-1) ?? '';
    expect(action).toContain('enable VI Server in LabVIEW');
    expect(action).toContain('Tools');
    expect(action).toContain('VI Server');
    expect(action).toContain('server.tcp.enabled=True');
    expect(action).toContain('restart LabVIEW');
    expect(action).toContain('rerun comparison report generation');
  });

  it('names VI Server and the enable path for a Linux VI-Server-disabled block (VHS-REQ-628)', () => {
    const summary = blockedSummary(
      'linux-vi-server-tcp-disabled',
      { platform: 'linux', provider: 'host-native', engine: 'labview-cli' },
      { engine: 'labview-cli' }
    );

    const action = summary.at(-1) ?? '';
    expect(action).toContain('enable VI Server TCP/IP');
    expect(action).toContain('server.tcp.enabled=True in labview.conf');
    expect(action).toContain('restart LabVIEW');
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

    it('names VI Server and the enable path as the next action (VHS-REQ-630)', () => {
      const action = buildLabviewCliConnectFailedSummary().at(-1) ?? '';
      expect(action).toContain('VI Server');
      expect(action).toContain('-350000');
      expect(action).toContain('Tools');
      expect(action).toContain('server.tcp.enabled=True');
      expect(action).toContain('restart LabVIEW');
      expect(action).toContain('rerun comparison report generation');
    });
  });
});

describe('comparisonRuntimeDoctor next-action taxonomy and fact surfaces', () => {
  function baseSelection(
    overrides: Partial<ComparisonRuntimeSelection> = {}
  ): ComparisonRuntimeSelection {
    return {
      platform: 'win32',
      executionMode: 'host-only',
      requestedProvider: 'host',
      requestedLabviewVersion: '2026',
      bitness: 'x64',
      provider: 'host-native',
      notes: [],
      registryQueryPlans: [],
      candidates: [],
      ...overrides
    };
  }

  function doctor(
    reportStatus: ComparisonReportPacketRecord['reportStatus'],
    selectionOverrides: Partial<ComparisonRuntimeSelection> = {},
    executionOverrides: Partial<ComparisonReportRuntimeExecution> = {},
    preflightBlockedReason?: string
  ): string[] {
    return buildComparisonRuntimeDoctorSummaryFromFacts({
      reportStatus,
      preflightBlockedReason,
      runtimeSelection: baseSelection(selectionOverrides),
      runtimeExecution: {
        state: 'not-run',
        attempted: true,
        reportExists: false,
        ...executionOverrides
      }
    });
  }

  it.each([
    ['installed-provider-invalid', 'set viHistorySuite.runtimeProvider to host or docker'],
    ['labview-version-required', 'set viHistorySuite.labviewVersion. Then'],
    ['labview-bitness-required', 'set viHistorySuite.labviewBitness. Then'],
    ['configured-labview-exe-path-missing', 'correct or remove viHistorySuite.labviewExePath'],
    ['labview-cli-not-found-for-bitness', 'install LabVIEWCLI, or set viHistorySuite.labviewCliPath'],
    ['labview-exe-ambiguous', 'set viHistorySuite.labviewExePath to the exact LabVIEW executable'],
    [
      'labview-cli-ambiguous-for-bitness',
      'set viHistorySuite.labviewCliPath to the exact LabVIEWCLI executable'
    ],
    ['comparison-tool-not-found', 'install LabVIEWCLI, or set viHistorySuite.labviewCliPath'],
    ['windows-vi-server-tcp-disabled', 'enable VI Server in LabVIEW (Tools'],
    ['linux-vi-server-tcp-disabled', 'enable VI Server TCP/IP for the selected LabVIEW'],
    ['docker-only-provider-not-supported-on-platform', 'runtimeProvider to host on this platform'],
    ['docker-provider-not-supported-on-platform', 'runtimeProvider to host on this platform'],
    ['docker-only-requires-windows-x64-provider', 'use Docker with viHistorySuite.labviewBitness=x64'],
    ['docker-provider-requires-windows-x64', 'use Docker with viHistorySuite.labviewBitness=x64']
  ])('gives a settings-oriented next action for %s', (reason, expected) => {
    const summary = blockedSummary(reason);
    expect(summary.at(-1)).toContain(expected);
    expect(summary.at(-1)).toContain('rerun comparison report generation');
  });

  it('offers both host and Docker recovery paths for a contaminated Windows host surface', () => {
    const hostSummary = blockedSummary('windows-host-runtime-surface-contaminated', {
      platform: 'win32',
      requestedProvider: 'host'
    });
    expect(hostSummary.at(-1)).toContain(
      'close existing LabVIEW/LabVIEWCLI/LVCompare sessions'
    );
    expect(hostSummary.at(-1)).toContain('switch to a Docker-backed compare path');

    const dockerSummary = blockedSummary('windows-host-runtime-surface-contaminated', {
      platform: 'win32',
      requestedProvider: 'docker',
      executionMode: 'docker-only',
      dockerCliAvailable: false
    });
    expect(dockerSummary.at(-1)).toContain('close existing LabVIEW/LabVIEWCLI/LVCompare sessions');
    expect(dockerSummary.at(-1)).toContain('install Docker Desktop');
  });

  it.each([
    [{ platform: 'win32', dockerCliAvailable: false }, 'install Docker Desktop'],
    [{ platform: 'linux', dockerCliAvailable: false }, 'install Docker, start the Docker daemon'],
    [
      { platform: 'win32', dockerCliAvailable: true, dockerDaemonReachable: false },
      'start Docker Desktop'
    ],
    [
      { platform: 'linux', dockerCliAvailable: true, dockerDaemonReachable: false },
      'start or reconnect the Docker daemon'
    ],
    [
      {
        platform: 'win32',
        dockerCliAvailable: true,
        dockerDaemonReachable: true,
        containerCapabilityAvailable: false
      },
      'switch Docker to a supported Linux or Windows container engine'
    ]
  ])('derives Docker recovery guidance %j', (overrides, expected) => {
    const summary = blockedSummary('docker-provider-unavailable', {
      requestedProvider: 'docker',
      executionMode: 'docker-only',
      ...(overrides as Partial<ComparisonRuntimeSelection>)
    });
    expect(summary.at(-1)).toContain(expected);
  });

  it('names the auto-Docker no-host-fallback rule for installed Docker Desktop', () => {
    const summary = blockedSummary('auto-docker-installed-provider-unavailable', {
      requestedProvider: 'docker',
      executionMode: 'docker-only',
      platform: 'win32',
      dockerCliAvailable: true,
      dockerDaemonReachable: false
    });
    expect(summary.at(-1)).toContain(
      'Windows auto execution will not fall back to host-native'
    );
  });

  it('names the container-image platform mismatch and both fixes (VHS-REQ-650.5)', () => {
    const summary = blockedSummary('container-image-platform-mismatch', {
      requestedProvider: 'docker',
      executionMode: 'docker-only',
      containerHostMode: 'windows'
    });
    expect(summary.at(-1)).toContain('different platform than the active Docker engine');
    expect(summary.at(-1)).toContain('windows-container mode');
  });

  it('falls back to the host-native guidance for an unmapped blocked reason with a host request', () => {
    const summary = blockedSummary('an-unmapped-future-reason', { requestedProvider: 'host' });
    expect(summary.at(-1)).toContain('make the selected host-native runtime available');
  });

  it('falls back to the generic provider guidance for an unmapped reason with an auto request', () => {
    const summary = blockedSummary('an-unmapped-future-reason', {
      requestedProvider: undefined,
      executionMode: 'auto'
    });
    expect(summary.at(-1)).toContain(
      'make the selected runtime provider available or adjust runtime settings'
    );
  });

  it('guides password-protected VI comparison failures', () => {
    const summary = doctor('ready-for-runtime', {}, {
      state: 'failed',
      diagnosticReason: 'labview-cli-vi-password-protected'
    });
    expect(summary.at(-1)).toContain('not password protected');
  });

  it('guides forward-version VI failures with the selected engine facts (VHS-REQ-658)', () => {
    const summary = doctor(
      'ready-for-runtime',
      { requestedLabviewVersion: '2025', bitness: 'x64' },
      { state: 'failed', failureReason: 'labview-vi-version-too-new' }
    );
    expect(summary.at(-1)).toContain('saved in a newer LabVIEW than the selected LabVIEW 2025 (x64)');
    expect(summary.at(-1)).toContain('Pick a newer installed LabVIEW');
  });

  it('guides host-native CreateComparisonReport timeouts through retained observations', () => {
    const summary = doctor(
      'ready-for-runtime',
      { platform: 'win32', provider: 'host-native' },
      {
        state: 'failed',
        failureReason: 'command-timed-out',
        diagnosticReason: 'labview-cli-timeout-no-labview-at-banner-snapshot'
      }
    );
    expect(summary.at(-1)).toContain('review the retained runtime process observations');
  });

  it('falls back to retained runtime notes for an unclassified failure', () => {
    const summary = doctor('ready-for-runtime', {}, {
      state: 'failed',
      failureReason: 'some-unclassified-failure'
    });
    expect(summary.at(-1)).toContain('use the retained runtime notes');
  });

  it('points a succeeded run at the retained report and dashboard surfaces', () => {
    const summary = doctor('ready-for-runtime', {}, { state: 'succeeded' });
    expect(summary.at(-1)).toContain('review the retained LabVIEW comparison report');
  });

  it('points an unrun trusted-workspace state at report generation', () => {
    const summary = doctor('ready-for-runtime', {}, { state: 'not-run' });
    expect(summary.at(-1)).toContain(
      'run comparison report generation from a trusted workspace'
    );
  });

  it('resolves a preflight block into a preflight next action', () => {
    const summary = doctor(
      'blocked-preflight',
      {},
      { state: 'not-run' },
      'unsupported-selected-file'
    );
    expect(summary.at(-1)).toContain('resolve the preflight block (unsupported-selected-file)');
    expect(summary).toContain('Preflight blocked reason: unsupported-selected-file.');
  });

  it('surfaces selected host runtime tool facts', () => {
    const summary = doctor(
      'ready-for-runtime',
      {
        provider: 'host-native',
        labviewExe: {
          kind: 'labview-exe',
          path: 'C:\\LV\\LabVIEW.exe',
          source: 'scan',
          exists: true,
          bitness: 'x64'
        },
        labviewCli: {
          kind: 'labview-cli',
          path: 'C:\\LV\\LabVIEWCLI.exe',
          source: 'scan',
          exists: true,
          bitness: 'x64'
        },
        hostLabviewIniPath: 'C:\\LV\\LabVIEW.ini',
        hostLabviewTcpPort: 3363,
        hostRuntimeConflictDetected: false
      },
      { state: 'succeeded' }
    );
    const toolLine = summary.find((line) => line.startsWith('Selected runtime tools:'));
    expect(toolLine).toBeDefined();
    expect(toolLine).toContain('LabVIEW=C:\\LV\\LabVIEW.exe');
    expect(toolLine).toContain('LabVIEWCLI=C:\\LV\\LabVIEWCLI.exe');
    expect(toolLine).toContain('HostLabVIEW.ini=C:\\LV\\LabVIEW.ini');
    expect(toolLine).toContain('HostVITcpPort=3363');
    expect(toolLine).toContain('HostConflictDetected=no');
  });

  it('reports a container-derived LabVIEW version label for container providers (VHS-REQ-657.6)', () => {
    const summary = doctor(
      'ready-for-runtime',
      {
        provider: 'linux-container',
        requestedProvider: 'docker',
        executionMode: 'docker-only',
        requestedLabviewVersion: undefined,
        containerImage: 'nationalinstruments/labview:2026q1patch2-windows'
      },
      { state: 'succeeded' }
    );
    expect(summary).toContain(
      'Requested runtime: provider=docker; LabVIEW=2026; bitness=x64.'
    );
  });
});
