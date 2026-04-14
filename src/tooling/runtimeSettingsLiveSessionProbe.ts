export interface RuntimeSettingsLiveSessionFacts {
  runtimeProvider?: string;
  labviewVersion?: string;
  labviewBitness?: string;
}

export interface RuntimeSettingsLiveSessionProbeInput {
  settingsFilePath?: string;
  persisted: RuntimeSettingsLiveSessionFacts;
  live: RuntimeSettingsLiveSessionFacts;
  runtimeValidationOutcome?: 'ready' | 'blocked';
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimeBlockedReason?: string;
}

export interface RuntimeSettingsLiveSessionProbeSummary {
  outcome: 'probed-runtime-settings-live-session';
  settingsFilePath?: string;
  persistedProvider?: string;
  persistedLabviewVersion?: string;
  persistedLabviewBitness?: string;
  liveProvider?: string;
  liveLabviewVersion?: string;
  liveLabviewBitness?: string;
  providerDrift: boolean;
  versionDrift: boolean;
  bitnessDrift: boolean;
  driftDetected: boolean;
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
}

export function buildRuntimeSettingsLiveSessionProbeSummary(
  input: RuntimeSettingsLiveSessionProbeInput
): RuntimeSettingsLiveSessionProbeSummary {
  const persistedProvider = normalizeTrimmed(input.persisted.runtimeProvider);
  const persistedLabviewVersion = normalizeTrimmed(input.persisted.labviewVersion);
  const persistedLabviewBitness = normalizeTrimmed(input.persisted.labviewBitness);
  const liveProvider = normalizeTrimmed(input.live.runtimeProvider);
  const liveLabviewVersion = normalizeTrimmed(input.live.labviewVersion);
  const liveLabviewBitness = normalizeTrimmed(input.live.labviewBitness);

  const providerDrift =
    normalizeComparableProvider(persistedProvider) !== normalizeComparableProvider(liveProvider);
  const versionDrift = persistedLabviewVersion !== liveLabviewVersion;
  const bitnessDrift =
    normalizeComparableBitness(persistedLabviewBitness) !==
    normalizeComparableBitness(liveLabviewBitness);

  return {
    outcome: 'probed-runtime-settings-live-session',
    settingsFilePath: input.settingsFilePath,
    persistedProvider,
    persistedLabviewVersion,
    persistedLabviewBitness,
    liveProvider,
    liveLabviewVersion,
    liveLabviewBitness,
    providerDrift,
    versionDrift,
    bitnessDrift,
    driftDetected: providerDrift || versionDrift || bitnessDrift,
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
