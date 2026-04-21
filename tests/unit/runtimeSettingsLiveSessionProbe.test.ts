import { describe, expect, it } from 'vitest';

import { buildRuntimeSettingsLiveSessionProbeSummary } from '../../src/tooling/runtimeSettingsLiveSessionProbe';

describe('runtimeSettingsLiveSessionProbe', () => {
  it('marks drift when persisted and live provider facts diverge', () => {
    const summary = buildRuntimeSettingsLiveSessionProbeSummary({
      settingsFilePath: '/tmp/settings.json',
      persisted: {
        runtimeProvider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      live: {
        runtimeProvider: 'host',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      runtimeValidationOutcome: 'ready',
      runtimeProvider: 'windows-container',
      runtimeEngine: 'labview-cli',
      runtimeBlockedReason: undefined
    });

    expect(summary.outcome).toBe('probed-runtime-settings-live-session');
    expect(summary.providerDrift).toBe(true);
    expect(summary.versionDrift).toBe(false);
    expect(summary.bitnessDrift).toBe(false);
    expect(summary.driftDetected).toBe(true);
    expect(summary.liveUptakeObservation).toBe('reload-required');
    expect(summary.mutationTargetPersistedMatch).toBeUndefined();
    expect(summary.mutationTargetBaselineChanged).toBeUndefined();
    expect(summary.safeRestoreApplied).toBe(false);
    expect(summary.safeRestoreVerified).toBe(false);
  });

  it('keeps drift false when persisted and live facts match after normalization', () => {
    const summary = buildRuntimeSettingsLiveSessionProbeSummary({
      persisted: {
        runtimeProvider: 'HOST',
        labviewVersion: '2026',
        labviewBitness: 'X64'
      },
      baselinePersisted: {
        runtimeProvider: 'host',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      live: {
        runtimeProvider: 'host',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      runtimeValidationOutcome: 'blocked',
      runtimeProvider: 'unavailable',
      runtimeEngine: undefined,
      runtimeBlockedReason: 'installed-provider-invalid',
      mutationProviderTarget: 'DOCKER',
      safeRestoreApplied: true,
      safeRestoreVerified: true
    });

    expect(summary.providerDrift).toBe(false);
    expect(summary.versionDrift).toBe(false);
    expect(summary.bitnessDrift).toBe(false);
    expect(summary.driftDetected).toBe(false);
    expect(summary.liveUptakeObservation).toBe('in-session-updated');
    expect(summary.mutationProviderTarget).toBe('docker');
    expect(summary.mutationTargetPersistedMatch).toBe(false);
    expect(summary.mutationTargetBaselineChanged).toBe(false);
    expect(summary.safeRestoreApplied).toBe(true);
    expect(summary.safeRestoreVerified).toBe(true);
    expect(summary.runtimeValidationOutcome).toBe('blocked');
    expect(summary.runtimeProvider).toBe('unavailable');
  });
});
