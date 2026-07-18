import { describe, expect, it } from 'vitest';

import {
  deriveComparisonRuntimeNextAction,
  deriveRejectedProviderSummaryFromDoctorSummary,
  deriveRuntimeProviderFromDoctorSummary,
  deriveRuntimeProviderRequestFromDoctorSummary,
  deriveWindowsContainerAcquisitionStateFromDoctorSummary,
  mapLegacyExecutionModeToProviderRequest
} from '../../src/commands/comparisonRuntimeDoctorSummaryParsing';

describe('deriveComparisonRuntimeNextAction', () => {
  it('finds the Next action line or returns undefined', () => {
    expect(deriveComparisonRuntimeNextAction(['x', 'Next action: retry'])).toBe('Next action: retry');
    expect(deriveComparisonRuntimeNextAction(['x'])).toBeUndefined();
    expect(deriveComparisonRuntimeNextAction(undefined)).toBeUndefined();
  });
});

describe('deriveRuntimeProviderFromDoctorSummary', () => {
  it('parses the selected provider up to the first semicolon', () => {
    expect(deriveRuntimeProviderFromDoctorSummary(['Selected provider=host; more'])).toBe('host');
    expect(deriveRuntimeProviderFromDoctorSummary(['no match'])).toBeUndefined();
  });
});

describe('deriveRuntimeProviderRequestFromDoctorSummary', () => {
  it('prefers Provider request, else maps legacy execution mode', () => {
    expect(deriveRuntimeProviderRequestFromDoctorSummary(['Provider request=docker.'])).toBe('docker');
    expect(
      deriveRuntimeProviderRequestFromDoctorSummary(['Selected execution mode=host-only.'])
    ).toBe('host');
    expect(deriveRuntimeProviderRequestFromDoctorSummary(['nothing'])).toBeUndefined();
  });
});

describe('deriveWindowsContainerAcquisitionStateFromDoctorSummary', () => {
  it('parses the container acquisition state from the tool-facts line', () => {
    expect(
      deriveWindowsContainerAcquisitionStateFromDoctorSummary([
        'Tool facts: ContainerAcquisitionState=acquired; other=1'
      ])
    ).toBe('acquired');
    expect(deriveWindowsContainerAcquisitionStateFromDoctorSummary(['Tool facts: other=1'])).toBeUndefined();
    expect(deriveWindowsContainerAcquisitionStateFromDoctorSummary(undefined)).toBeUndefined();
  });
});

describe('deriveRejectedProviderSummaryFromDoctorSummary', () => {
  it('summarizes rejected provider decisions joined by a pipe', () => {
    expect(
      deriveRejectedProviderSummaryFromDoctorSummary([
        'Provider decision: rejected docker because daemon unreachable.',
        'Provider decision: rejected host because bitness mismatch.'
      ])
    ).toBe('docker because daemon unreachable | host because bitness mismatch');
    expect(deriveRejectedProviderSummaryFromDoctorSummary(['no rejections'])).toBeUndefined();
  });
});

describe('mapLegacyExecutionModeToProviderRequest', () => {
  it('maps legacy modes and passes through others', () => {
    expect(mapLegacyExecutionModeToProviderRequest('host-only')).toBe('host');
    expect(mapLegacyExecutionModeToProviderRequest('docker-only')).toBe('docker');
    expect(mapLegacyExecutionModeToProviderRequest('auto')).toBe('auto');
    expect(mapLegacyExecutionModeToProviderRequest(undefined)).toBeUndefined();
  });
});
