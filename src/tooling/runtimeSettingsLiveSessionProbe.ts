export interface RuntimeSettingsLiveSessionFacts {
  runtimeProvider?: string;
  labviewVersion?: string;
  labviewBitness?: string;
}

export interface RuntimeSettingsLiveSessionProbeInput {
  settingsFilePath?: string;
  persisted: RuntimeSettingsLiveSessionFacts;
  baselinePersisted?: RuntimeSettingsLiveSessionFacts;
  live: RuntimeSettingsLiveSessionFacts;
  runtimeValidationOutcome?: 'ready' | 'blocked';
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimeBlockedReason?: string;
  mutationProviderTarget?: string;
  safeRestoreApplied?: boolean;
  safeRestoreVerified?: boolean;
}

export type RuntimeSettingsLiveSessionUptakeObservation =
  | 'in-session-updated'
  | 'reload-required';

export type RuntimeSettingsLiveSessionHistoryStance =
  | 'live-uptake-not-proven'
  | 'candidate-live-uptake-observed'
  | 'insufficient-evidence';

export interface RuntimeSettingsLiveSessionProbeSummary {
  outcome: 'probed-runtime-settings-live-session';
  settingsFilePath?: string;
  persistedProvider?: string;
  persistedLabviewVersion?: string;
  persistedLabviewBitness?: string;
  baselinePersistedProvider?: string;
  baselinePersistedLabviewVersion?: string;
  baselinePersistedLabviewBitness?: string;
  liveProvider?: string;
  liveLabviewVersion?: string;
  liveLabviewBitness?: string;
  providerDrift: boolean;
  versionDrift: boolean;
  bitnessDrift: boolean;
  driftDetected: boolean;
  liveUptakeObservation: RuntimeSettingsLiveSessionUptakeObservation;
  mutationProviderTarget?: string;
  safeRestoreApplied: boolean;
  safeRestoreVerified: boolean;
  runtimeValidationOutcome?: 'ready' | 'blocked';
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimeBlockedReason?: string;
}

export interface RuntimeSettingsLiveSessionProbeSummaryWithPacket
  extends RuntimeSettingsLiveSessionProbeSummary {
  packetRunId: string;
  packetJsonPath: string;
  packetMarkdownPath: string;
  latestPacketJsonPath: string;
  latestPacketMarkdownPath: string;
  historyTotalRuns: number;
  historyReloadRequiredCount: number;
  historyInSessionUpdatedCount: number;
  historyUnknownObservationCount: number;
  historyStance: RuntimeSettingsLiveSessionHistoryStance;
}

export function buildRuntimeSettingsLiveSessionProbeSummary(
  input: RuntimeSettingsLiveSessionProbeInput
): RuntimeSettingsLiveSessionProbeSummary {
  const persistedProvider = normalizeTrimmed(input.persisted.runtimeProvider);
  const persistedLabviewVersion = normalizeTrimmed(input.persisted.labviewVersion);
  const persistedLabviewBitness = normalizeTrimmed(input.persisted.labviewBitness);
  const baselinePersistedProvider = normalizeTrimmed(input.baselinePersisted?.runtimeProvider);
  const baselinePersistedLabviewVersion = normalizeTrimmed(input.baselinePersisted?.labviewVersion);
  const baselinePersistedLabviewBitness = normalizeTrimmed(input.baselinePersisted?.labviewBitness);
  const liveProvider = normalizeTrimmed(input.live.runtimeProvider);
  const liveLabviewVersion = normalizeTrimmed(input.live.labviewVersion);
  const liveLabviewBitness = normalizeTrimmed(input.live.labviewBitness);

  const providerDrift =
    normalizeComparableProvider(persistedProvider) !== normalizeComparableProvider(liveProvider);
  const versionDrift = persistedLabviewVersion !== liveLabviewVersion;
  const bitnessDrift =
    normalizeComparableBitness(persistedLabviewBitness) !==
    normalizeComparableBitness(liveLabviewBitness);
  const driftDetected = providerDrift || versionDrift || bitnessDrift;

  return {
    outcome: 'probed-runtime-settings-live-session',
    settingsFilePath: input.settingsFilePath,
    persistedProvider,
    persistedLabviewVersion,
    persistedLabviewBitness,
    baselinePersistedProvider,
    baselinePersistedLabviewVersion,
    baselinePersistedLabviewBitness,
    liveProvider,
    liveLabviewVersion,
    liveLabviewBitness,
    providerDrift,
    versionDrift,
    bitnessDrift,
    driftDetected,
    liveUptakeObservation: classifyLiveUptakeObservation(driftDetected),
    mutationProviderTarget: normalizeComparableProvider(input.mutationProviderTarget),
    safeRestoreApplied: input.safeRestoreApplied === true,
    safeRestoreVerified: input.safeRestoreVerified === true,
    runtimeValidationOutcome: input.runtimeValidationOutcome,
    runtimeProvider: input.runtimeProvider,
    runtimeEngine: input.runtimeEngine,
    runtimeBlockedReason: input.runtimeBlockedReason
  };
}

function normalizeTrimmed(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeComparableProvider(value: string | undefined): string | undefined {
  return value?.toLowerCase();
}

function normalizeComparableBitness(value: string | undefined): string | undefined {
  return value?.toLowerCase();
}

function classifyLiveUptakeObservation(
  driftDetected: boolean
): RuntimeSettingsLiveSessionUptakeObservation {
  return driftDetected ? 'reload-required' : 'in-session-updated';
}
