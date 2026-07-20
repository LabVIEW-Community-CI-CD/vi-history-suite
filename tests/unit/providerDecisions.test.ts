import { describe, expect, it } from 'vitest';

import { buildProviderDecisions } from '../../src/reporting/runtime/providerDecisions';
import type { BuildProviderDecisionsOptions } from '../../src/reporting/comparisonRuntimeLocator';

/**
 * Direct branch-coverage tests for buildProviderDecisions (supporting VHS-REQ-657).
 * The assembler is a pure mapping from a probed provider-selection snapshot to the
 * ordered RuntimeProviderDecision[] the doctor reports. Assertions target the
 * deterministic provider/outcome/reason triples owned by this function rather than
 * the human-readable detail strings, which are produced by already-covered helpers.
 */

function baseOptions(overrides: Partial<BuildProviderDecisionsOptions> = {}): BuildProviderDecisionsOptions {
  return {
    platform: 'win32',
    executionMode: 'auto',
    bitness: 'x64',
    configuredWindowsContainerImage: 'win-image:latest',
    configuredLinuxContainerImage: 'linux-image:latest',
    containerAvailable: false,
    ...overrides
  };
}

function reasonFor(
  decisions: ReturnType<typeof buildProviderDecisions>,
  provider: string,
  outcome: 'selected' | 'rejected'
): string | undefined {
  return decisions.find((d) => d.provider === provider && d.outcome === outcome)?.reason;
}

function detailFor(
  decisions: ReturnType<typeof buildProviderDecisions>,
  provider: string,
  outcome: 'selected' | 'rejected'
): string | undefined {
  return decisions.find((d) => d.provider === provider && d.outcome === outcome)?.detail;
}

describe('buildProviderDecisions container selection (VHS-REQ-657)', () => {
  it('selects the container and rejects host-native when the docker provider is requested', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ requestedProvider: 'docker', selectedProvider: 'windows-container' })
    );
    expect(reasonFor(decisions, 'windows-container', 'selected')).toBe(
      'provider-request-docker-selected-windows-container'
    );
    expect(reasonFor(decisions, 'host-native', 'rejected')).toBe(
      'provider-request-docker-disallows-host-native'
    );
  });

  it('selects the container for docker-only execution', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ executionMode: 'docker-only', selectedProvider: 'linux-container', platform: 'linux', containerRuntimePlatform: 'linux' })
    );
    expect(reasonFor(decisions, 'linux-container', 'selected')).toBe(
      'execution-mode-docker-only-selected-linux-container'
    );
    expect(reasonFor(decisions, 'host-native', 'rejected')).toBe(
      'execution-mode-docker-only-disallows-host-native'
    );
  });

  it('auto-selects the container when Docker Desktop is installed on Windows', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'auto',
        selectedProvider: 'windows-container',
        containerEvaluated: true,
        dockerCliAvailable: true
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'selected')).toBe(
      'auto-selected-windows-container-because-docker-installed'
    );
    expect(reasonFor(decisions, 'host-native', 'rejected')).toBe(
      'auto-docker-installed-disallows-host-native'
    );
  });

  it('requires the container when a host-runtime conflict is detected', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        selectedProvider: 'windows-container',
        hostRuntimeConflictDetected: true
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'selected')).toBe(
      'auto-required-docker-because-host-runtime-conflict'
    );
    expect(reasonFor(decisions, 'host-native', 'rejected')).toBe(
      'host-native-runtime-surface-contaminated'
    );
  });

  it('selects the container when the host runtime is unavailable', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ selectedProvider: 'windows-container', labviewExeFound: false })
    );
    expect(reasonFor(decisions, 'windows-container', 'selected')).toBe(
      'windows-container-selected-host-runtime-unavailable'
    );
  });

  it('selects the container when the host comparison tool is missing', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        selectedProvider: 'windows-container',
        labviewExeFound: true,
        labviewCliFound: false,
        lvCompareFound: false
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'selected')).toBe(
      'windows-container-selected-because-host-comparison-tool-missing'
    );
  });

  it('selects the preferred-and-available container as the fallback', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        selectedProvider: 'windows-container',
        labviewExeFound: true,
        labviewCliFound: true,
        lvCompareFound: true
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'selected')).toBe(
      'windows-container-preferred-and-available'
    );
  });
});

describe('buildProviderDecisions host-native selection (VHS-REQ-657)', () => {
  it('selects host-native when the host provider is requested', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ requestedProvider: 'host', selectedProvider: 'host-native' })
    );
    expect(reasonFor(decisions, 'host-native', 'selected')).toBe(
      'provider-request-host-selected-host-native'
    );
  });

  it('selects host-native for host-only execution', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ executionMode: 'host-only', selectedProvider: 'host-native' })
    );
    expect(reasonFor(decisions, 'host-native', 'selected')).toBe(
      'execution-mode-host-only-selected-host-native'
    );
  });

  it('auto-selects host-native when Docker Desktop is missing on Windows', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'auto',
        selectedProvider: 'host-native',
        containerEvaluated: true,
        dockerCliAvailable: false
      })
    );
    expect(reasonFor(decisions, 'host-native', 'selected')).toBe(
      'auto-selected-host-native-because-docker-not-installed'
    );
  });

  it('selects host-native via the LabVIEWCLI fallback', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ selectedProvider: 'host-native' })
    );
    expect(reasonFor(decisions, 'host-native', 'selected')).toBe('host-native-labview-cli-selected');
  });
});

describe('buildProviderDecisions container rejection (VHS-REQ-657)', () => {
  it('rejects docker for host-only execution', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ platform: 'win32', executionMode: 'host-only' })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'execution-mode-host-only-disallows-docker'
    );
  });

  it('rejects docker for host-only execution when the host provider was requested', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ platform: 'win32', executionMode: 'host-only', requestedProvider: 'host' })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'provider-request-host-disallows-docker'
    );
  });

  it('rejects docker-only when the LabVIEW version is unsupported', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'docker-only',
        containerEvaluated: true,
        blockedReason: 'labview-version-unsupported-for-comparison-report'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'labview-version-unsupported-for-comparison-report'
    );
  });

  it('rejects docker-only when the version has no docker implementation', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'docker-only',
        containerEvaluated: true,
        blockedReason: 'docker-provider-labview-version-not-implemented'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'docker-provider-labview-version-not-implemented'
    );
  });

  it('rejects the docker provider request when windows x64 is required', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'docker-only',
        containerEvaluated: true,
        requestedProvider: 'docker',
        blockedReason: 'docker-provider-requires-windows-x64'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'docker-provider-windows-x64-required'
    );
  });

  it('rejects docker-only when windows x64 provider is required', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'docker-only',
        containerEvaluated: true,
        blockedReason: 'docker-only-requires-windows-x64-provider'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'docker-only-windows-x64-provider-required'
    );
  });

  it('rejects docker-only as provider-unavailable fallback', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ executionMode: 'docker-only', containerEvaluated: true })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe('docker-only-provider-unavailable');
  });

  it('rejects the requested docker provider as provider-unavailable fallback', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ executionMode: 'docker-only', containerEvaluated: true, requestedProvider: 'docker' })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe('docker-provider-unavailable');
  });

  it('rejects auto docker when Docker Desktop is not installed on Windows', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ executionMode: 'auto', containerEvaluated: true, dockerCliAvailable: false })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe('auto-docker-not-installed');
  });

  it('keeps the windows x86 reference lane host-native', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'auto',
        containerEvaluated: true,
        dockerCliAvailable: true,
        bitness: 'x86'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'windows-x86-reference-lane-stays-host-native'
    );
  });

  it('rejects docker as image-unavailable fallback in auto mode', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ executionMode: 'auto', containerEvaluated: true, dockerCliAvailable: true })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe('docker-container-image-unavailable');
  });
});

describe('buildProviderDecisions container rejection edge branches (VHS-REQ-657)', () => {
  it('derives the linux-container label for a container-relevant linux host-only rejection', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        platform: 'linux',
        executionMode: 'host-only',
        containerEvaluated: true,
        containerHostMode: 'linux',
        containerRuntimePlatform: 'linux'
      })
    );
    expect(reasonFor(decisions, 'linux-container', 'rejected')).toBe(
      'execution-mode-host-only-disallows-docker'
    );
  });

  it('rejects auto docker as installed-but-provider-unavailable with a described image', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'auto',
        containerEvaluated: true,
        dockerCliAvailable: true,
        blockedReason: 'auto-docker-installed-provider-unavailable',
        containerImage: 'nationalinstruments/labview:2026q1-windows'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'auto-docker-installed-provider-unavailable'
    );
    expect(detailFor(decisions, 'windows-container', 'rejected')).toContain('Docker Desktop was detected');
  });

  it('rejects auto docker required by a host-runtime conflict but reported unavailable', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'auto',
        containerEvaluated: true,
        dockerCliAvailable: true,
        blockedReason: 'windows-host-runtime-surface-contaminated',
        containerImage: 'nationalinstruments/labview:2026q1-windows'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe(
      'auto-required-docker-because-host-runtime-conflict-but-provider-unavailable'
    );
    expect(detailFor(decisions, 'windows-container', 'rejected')).toContain(
      'Validated Windows host runtime facts required Docker'
    );
  });

  it('describes the configured image on a docker-only provider-unavailable rejection', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'docker-only',
        containerEvaluated: true,
        requestedProvider: 'docker',
        containerImage: 'nationalinstruments/labview:2026q1-windows'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe('docker-provider-unavailable');
    expect(detailFor(decisions, 'windows-container', 'rejected')).toContain(
      'The Docker provider was requested'
    );
  });

  it('describes the configured image on an auto image-unavailable fallback', () => {
    const decisions = buildProviderDecisions(
      baseOptions({
        executionMode: 'auto',
        containerEvaluated: true,
        dockerCliAvailable: true,
        containerImage: 'nationalinstruments/labview:2026q1-windows'
      })
    );
    expect(reasonFor(decisions, 'windows-container', 'rejected')).toBe('docker-container-image-unavailable');
    expect(detailFor(decisions, 'windows-container', 'rejected')).toContain(
      'nationalinstruments/labview:2026q1-windows'
    );
  });
});

describe('buildProviderDecisions host-native selection detail branches (VHS-REQ-657)', () => {
  it('notes the x86 host-native preference in the selected detail', () => {
    const decisions = buildProviderDecisions(
      baseOptions({ selectedProvider: 'host-native', bitness: 'x86' })
    );
    expect(reasonFor(decisions, 'host-native', 'selected')).toBe('host-native-labview-cli-selected');
    expect(detailFor(decisions, 'host-native', 'selected')).toContain(
      'Windows x86 lane prefers host-native execution'
    );
  });
});
