import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  RuntimeSettingsLiveSessionHistoryStance,
  RuntimeSettingsLiveSessionProviderSelectionCoverage,
  RuntimeSettingsLiveSessionProofStatus,
  RuntimeSettingsLiveSessionProbeSummary,
  RuntimeSettingsLiveSessionProbeSummaryWithPacket,
  RuntimeSettingsLiveSessionUptakeObservation
} from './runtimeSettingsLiveSessionProbe';

export interface RuntimeSettingsLiveSessionProbePacketPaths {
  packetRunId: string;
  packetJsonPath: string;
  packetMarkdownPath: string;
  latestPacketJsonPath: string;
  latestPacketMarkdownPath: string;
}

interface RuntimeSettingsLiveSessionProbePacketDeps {
  fs?: Pick<typeof fs, 'mkdir' | 'readdir' | 'readFile' | 'writeFile'>;
  now?: () => Date;
}

interface RuntimeSettingsLiveSessionProbeHistoryCounts {
  totalRuns: number;
  reloadRequiredCount: number;
  inSessionUpdatedCount: number;
  unknownObservationCount: number;
  mutationTargetHostCount: number;
  mutationTargetDockerCount: number;
  mutationTargetUnknownCount: number;
  mutationTargetPersistedMatchCount: number;
  mutationTargetPersistedMismatchCount: number;
  mutationTargetPersistedUnknownCount: number;
  mutationTargetBaselineChangedCount: number;
  mutationTargetBaselineUnchangedCount: number;
  mutationTargetBaselineUnknownCount: number;
}

export async function persistRuntimeSettingsLiveSessionProbePacket(
  summary: RuntimeSettingsLiveSessionProbeSummary,
  globalStoragePath: string,
  deps: RuntimeSettingsLiveSessionProbePacketDeps = {}
): Promise<RuntimeSettingsLiveSessionProbeSummaryWithPacket> {
  const fsApi = deps.fs ?? fs;
  const now = deps.now ?? (() => new Date());
  const packetRunId = toPacketRunId(now());
  const packetRoot = path.join(
    globalStoragePath,
    'governed-proof',
    'runtime-provider-live-session-probe'
  );
  const runDirectory = path.join(packetRoot, packetRunId);
  const packetJsonPath = path.join(runDirectory, 'probe-summary.json');
  const packetMarkdownPath = path.join(runDirectory, 'probe-summary.md');
  const latestPacketJsonPath = path.join(packetRoot, 'latest-summary.json');
  const latestPacketMarkdownPath = path.join(packetRoot, 'latest-summary.md');
  const existingHistoryCounts = await collectExistingProbeHistoryCounts(packetRoot, fsApi);
  const historyCounts = mergeCurrentSummary(existingHistoryCounts, summary);
  const historyStance = classifyHistoryStance(historyCounts);
  const historyProofStatus = classifyHistoryProofStatus(historyStance);
  const providerSelectionCoverage = classifyProviderSelectionCoverage(historyCounts);

  const packetSummary: RuntimeSettingsLiveSessionProbeSummaryWithPacket = {
    ...summary,
    packetRunId,
    packetJsonPath,
    packetMarkdownPath,
    latestPacketJsonPath,
    latestPacketMarkdownPath,
    historyTotalRuns: historyCounts.totalRuns,
    historyReloadRequiredCount: historyCounts.reloadRequiredCount,
    historyInSessionUpdatedCount: historyCounts.inSessionUpdatedCount,
    historyUnknownObservationCount: historyCounts.unknownObservationCount,
    mutationTargetHostCount: historyCounts.mutationTargetHostCount,
    mutationTargetDockerCount: historyCounts.mutationTargetDockerCount,
    mutationTargetUnknownCount: historyCounts.mutationTargetUnknownCount,
    mutationTargetPersistedMatchCount: historyCounts.mutationTargetPersistedMatchCount,
    mutationTargetPersistedMismatchCount: historyCounts.mutationTargetPersistedMismatchCount,
    mutationTargetPersistedUnknownCount: historyCounts.mutationTargetPersistedUnknownCount,
    mutationTargetBaselineChangedCount: historyCounts.mutationTargetBaselineChangedCount,
    mutationTargetBaselineUnchangedCount: historyCounts.mutationTargetBaselineUnchangedCount,
    mutationTargetBaselineUnknownCount: historyCounts.mutationTargetBaselineUnknownCount,
    historyStance,
    historyProofStatus,
    providerSelectionCoverage
  };

  await fsApi.mkdir(runDirectory, { recursive: true });
  await fsApi.writeFile(packetJsonPath, `${JSON.stringify(packetSummary, null, 2)}\n`, 'utf8');
  await fsApi.writeFile(packetMarkdownPath, renderProbeSummaryMarkdown(packetSummary), 'utf8');
  await fsApi.writeFile(
    latestPacketJsonPath,
    `${JSON.stringify(packetSummary, null, 2)}\n`,
    'utf8'
  );
  await fsApi.writeFile(
    latestPacketMarkdownPath,
    renderProbeSummaryMarkdown(packetSummary),
    'utf8'
  );

  return packetSummary;
}

function toPacketRunId(value: Date): string {
  return value.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function renderProbeSummaryMarkdown(summary: RuntimeSettingsLiveSessionProbeSummaryWithPacket): string {
  return [
    '# Runtime Settings Live-Session Probe Packet',
    '',
    `- Run id: \`${summary.packetRunId}\``,
    `- Drift detected: \`${summary.driftDetected ? 'yes' : 'no'}\``,
    `- Live uptake observation: \`${summary.liveUptakeObservation}\``,
    `- Provider drift: \`${summary.providerDrift ? 'yes' : 'no'}\``,
    `- Version drift: \`${summary.versionDrift ? 'yes' : 'no'}\``,
    `- Bitness drift: \`${summary.bitnessDrift ? 'yes' : 'no'}\``,
    `- Mutation provider target: \`${summary.mutationProviderTarget ?? '<none>'}\``,
    `- Mutation target aligned with persisted provider: \`${formatBooleanReceipt(summary.mutationTargetPersistedMatch)}\``,
    `- Baseline provider changed after mutation: \`${formatBooleanReceipt(summary.mutationTargetBaselineChanged)}\``,
    `- Safe restore applied: \`${summary.safeRestoreApplied ? 'yes' : 'no'}\``,
    `- Safe restore verified: \`${summary.safeRestoreVerified ? 'yes' : 'no'}\``,
    '',
    '## History Receipt',
    '',
    `- Total retained runs: \`${summary.historyTotalRuns}\``,
    `- Reload-required runs: \`${summary.historyReloadRequiredCount}\``,
    `- In-session-updated runs: \`${summary.historyInSessionUpdatedCount}\``,
    `- Unknown-observation runs: \`${summary.historyUnknownObservationCount}\``,
    `- Provider selection coverage: \`${summary.providerSelectionCoverage}\``,
    `- Mutation target host runs: \`${summary.mutationTargetHostCount}\``,
    `- Mutation target docker runs: \`${summary.mutationTargetDockerCount}\``,
    `- Mutation target unknown runs: \`${summary.mutationTargetUnknownCount}\``,
    `- Mutation target aligned runs: \`${summary.mutationTargetPersistedMatchCount}\``,
    `- Mutation target mismatch runs: \`${summary.mutationTargetPersistedMismatchCount}\``,
    `- Mutation target alignment unknown runs: \`${summary.mutationTargetPersistedUnknownCount}\``,
    `- Baseline-switch changed runs: \`${summary.mutationTargetBaselineChangedCount}\``,
    `- Baseline-switch unchanged runs: \`${summary.mutationTargetBaselineUnchangedCount}\``,
    `- Baseline-switch unknown runs: \`${summary.mutationTargetBaselineUnknownCount}\``,
    `- History stance: \`${summary.historyStance}\``,
    `- History proof status: \`${summary.historyProofStatus}\``,
    '',
    '## Baseline Persisted Settings Facts',
    '',
    `- Provider: \`${summary.baselinePersistedProvider ?? '<none>'}\``,
    `- LabVIEW version: \`${summary.baselinePersistedLabviewVersion ?? '<none>'}\``,
    `- LabVIEW bitness: \`${summary.baselinePersistedLabviewBitness ?? '<none>'}\``,
    '',
    '## Persisted Settings Facts',
    '',
    `- Provider: \`${summary.persistedProvider ?? '<none>'}\``,
    `- LabVIEW version: \`${summary.persistedLabviewVersion ?? '<none>'}\``,
    `- LabVIEW bitness: \`${summary.persistedLabviewBitness ?? '<none>'}\``,
    '',
    '## Live Session Facts',
    '',
    `- Provider: \`${summary.liveProvider ?? '<none>'}\``,
    `- LabVIEW version: \`${summary.liveLabviewVersion ?? '<none>'}\``,
    `- LabVIEW bitness: \`${summary.liveLabviewBitness ?? '<none>'}\``,
    '',
    '## Runtime Validation',
    '',
    `- Validation outcome: \`${summary.runtimeValidationOutcome ?? '<none>'}\``,
    `- Runtime provider: \`${summary.runtimeProvider ?? '<none>'}\``,
    `- Runtime engine: \`${summary.runtimeEngine ?? '<none>'}\``,
    `- Runtime blocked reason: \`${summary.runtimeBlockedReason ?? '<none>'}\``,
    ''
  ].join('\n');
}

async function collectExistingProbeHistoryCounts(
  packetRoot: string,
  fsApi: Pick<typeof fs, 'readdir' | 'readFile'>
): Promise<RuntimeSettingsLiveSessionProbeHistoryCounts> {
  const counts: RuntimeSettingsLiveSessionProbeHistoryCounts = {
    totalRuns: 0,
    reloadRequiredCount: 0,
    inSessionUpdatedCount: 0,
    unknownObservationCount: 0,
    mutationTargetHostCount: 0,
    mutationTargetDockerCount: 0,
    mutationTargetUnknownCount: 0,
    mutationTargetPersistedMatchCount: 0,
    mutationTargetPersistedMismatchCount: 0,
    mutationTargetPersistedUnknownCount: 0,
    mutationTargetBaselineChangedCount: 0,
    mutationTargetBaselineUnchangedCount: 0,
    mutationTargetBaselineUnknownCount: 0
  };

  let entries: Array<{ isDirectory: () => boolean; name: string }>;
  try {
    const rawEntries = await fsApi.readdir(packetRoot, { withFileTypes: true });
    entries = rawEntries.map((entry) => ({
      isDirectory: () => entry.isDirectory(),
      name: String(entry.name)
    }));
  } catch {
    return counts;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const runSummaryPath = path.join(packetRoot, entry.name, 'probe-summary.json');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fsApi.readFile(runSummaryPath, 'utf8'));
    } catch {
      continue;
    }

    counts.totalRuns += 1;
    incrementObservationCount(counts, normalizeLiveUptakeObservation(parsed));
    incrementMutationTargetCount(
      counts,
      normalizeMutationProviderTarget((parsed as { mutationProviderTarget?: unknown }).mutationProviderTarget)
    );
    incrementBooleanReceiptCount(
      normalizeBooleanReceipt((parsed as { mutationTargetPersistedMatch?: unknown }).mutationTargetPersistedMatch),
      () => {
        counts.mutationTargetPersistedMatchCount += 1;
      },
      () => {
        counts.mutationTargetPersistedMismatchCount += 1;
      },
      () => {
        counts.mutationTargetPersistedUnknownCount += 1;
      }
    );
    incrementBooleanReceiptCount(
      normalizeBooleanReceipt((parsed as { mutationTargetBaselineChanged?: unknown }).mutationTargetBaselineChanged),
      () => {
        counts.mutationTargetBaselineChangedCount += 1;
      },
      () => {
        counts.mutationTargetBaselineUnchangedCount += 1;
      },
      () => {
        counts.mutationTargetBaselineUnknownCount += 1;
      }
    );
  }

  return counts;
}

function mergeCurrentSummary(
  existing: RuntimeSettingsLiveSessionProbeHistoryCounts,
  currentSummary: RuntimeSettingsLiveSessionProbeSummary
): RuntimeSettingsLiveSessionProbeHistoryCounts {
  const merged: RuntimeSettingsLiveSessionProbeHistoryCounts = {
    totalRuns: existing.totalRuns + 1,
    reloadRequiredCount: existing.reloadRequiredCount,
    inSessionUpdatedCount: existing.inSessionUpdatedCount,
    unknownObservationCount: existing.unknownObservationCount,
    mutationTargetHostCount: existing.mutationTargetHostCount,
    mutationTargetDockerCount: existing.mutationTargetDockerCount,
    mutationTargetUnknownCount: existing.mutationTargetUnknownCount,
    mutationTargetPersistedMatchCount: existing.mutationTargetPersistedMatchCount,
    mutationTargetPersistedMismatchCount: existing.mutationTargetPersistedMismatchCount,
    mutationTargetPersistedUnknownCount: existing.mutationTargetPersistedUnknownCount,
    mutationTargetBaselineChangedCount: existing.mutationTargetBaselineChangedCount,
    mutationTargetBaselineUnchangedCount: existing.mutationTargetBaselineUnchangedCount,
    mutationTargetBaselineUnknownCount: existing.mutationTargetBaselineUnknownCount
  };

  incrementObservationCount(merged, currentSummary.liveUptakeObservation);
  incrementMutationTargetCount(merged, normalizeMutationProviderTarget(currentSummary.mutationProviderTarget));
  incrementBooleanReceiptCount(
    currentSummary.mutationTargetPersistedMatch,
    () => {
      merged.mutationTargetPersistedMatchCount += 1;
    },
    () => {
      merged.mutationTargetPersistedMismatchCount += 1;
    },
    () => {
      merged.mutationTargetPersistedUnknownCount += 1;
    }
  );
  incrementBooleanReceiptCount(
    currentSummary.mutationTargetBaselineChanged,
    () => {
      merged.mutationTargetBaselineChangedCount += 1;
    },
    () => {
      merged.mutationTargetBaselineUnchangedCount += 1;
    },
    () => {
      merged.mutationTargetBaselineUnknownCount += 1;
    }
  );
  return merged;
}

function classifyHistoryStance(
  counts: RuntimeSettingsLiveSessionProbeHistoryCounts
): RuntimeSettingsLiveSessionHistoryStance {
  if (counts.reloadRequiredCount > 0) {
    return 'live-uptake-not-proven';
  }
  if (counts.inSessionUpdatedCount > 0 && counts.unknownObservationCount === 0) {
    return 'candidate-live-uptake-observed';
  }
  return 'insufficient-evidence';
}

function classifyHistoryProofStatus(
  stance: RuntimeSettingsLiveSessionHistoryStance
): RuntimeSettingsLiveSessionProofStatus {
  return stance === 'candidate-live-uptake-observed'
    ? 're-evaluation-required'
    : 'not-fully-proven';
}

function classifyProviderSelectionCoverage(
  counts: RuntimeSettingsLiveSessionProbeHistoryCounts
): RuntimeSettingsLiveSessionProviderSelectionCoverage {
  if (counts.mutationTargetHostCount > 0 && counts.mutationTargetDockerCount > 0) {
    return 'bidirectional-selection-observed';
  }
  if (counts.mutationTargetHostCount > 0 || counts.mutationTargetDockerCount > 0) {
    return 'single-provider-only';
  }
  return 'insufficient-evidence';
}

function normalizeLiveUptakeObservation(
  value: unknown
): RuntimeSettingsLiveSessionUptakeObservation | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const summary = value as {
    liveUptakeObservation?: unknown;
    driftDetected?: unknown;
  };

  if (summary.liveUptakeObservation === 'reload-required') {
    return 'reload-required';
  }
  if (summary.liveUptakeObservation === 'in-session-updated') {
    return 'in-session-updated';
  }
  if (summary.driftDetected === true) {
    return 'reload-required';
  }
  if (summary.driftDetected === false) {
    return 'in-session-updated';
  }
  return undefined;
}

function normalizeMutationProviderTarget(value: unknown): 'host' | 'docker' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'host' || normalized === 'docker' ? normalized : undefined;
}

function normalizeBooleanReceipt(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function incrementObservationCount(
  counts: RuntimeSettingsLiveSessionProbeHistoryCounts,
  observation: RuntimeSettingsLiveSessionUptakeObservation | undefined
): void {
  if (observation === 'reload-required') {
    counts.reloadRequiredCount += 1;
    return;
  }
  if (observation === 'in-session-updated') {
    counts.inSessionUpdatedCount += 1;
    return;
  }
  counts.unknownObservationCount += 1;
}

function incrementMutationTargetCount(
  counts: RuntimeSettingsLiveSessionProbeHistoryCounts,
  mutationTarget: 'host' | 'docker' | undefined
): void {
  if (mutationTarget === 'host') {
    counts.mutationTargetHostCount += 1;
    return;
  }
  if (mutationTarget === 'docker') {
    counts.mutationTargetDockerCount += 1;
    return;
  }
  counts.mutationTargetUnknownCount += 1;
}

function incrementBooleanReceiptCount(
  value: boolean | undefined,
  whenTrue: () => void,
  whenFalse: () => void,
  whenUnknown: () => void
): void {
  if (value === true) {
    whenTrue();
    return;
  }
  if (value === false) {
    whenFalse();
    return;
  }
  whenUnknown();
}

function formatBooleanReceipt(value: boolean | undefined): string {
  if (value === true) {
    return 'yes';
  }
  if (value === false) {
    return 'no';
  }
  return '<none>';
}
