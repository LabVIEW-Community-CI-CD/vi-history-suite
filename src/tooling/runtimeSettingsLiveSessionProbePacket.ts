import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  RuntimeSettingsLiveSessionHistoryStance,
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
  const currentObservation = normalizeLiveUptakeObservation(summary);
  const historyCounts = mergeCurrentObservation(existingHistoryCounts, currentObservation);
  const historyStance = classifyHistoryStance(historyCounts);
  const historyProofStatus = classifyHistoryProofStatus(historyStance);

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
    historyStance,
    historyProofStatus
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
    unknownObservationCount: 0
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
    const observation = normalizeLiveUptakeObservation(parsed);
    if (observation === 'reload-required') {
      counts.reloadRequiredCount += 1;
    } else if (observation === 'in-session-updated') {
      counts.inSessionUpdatedCount += 1;
    } else {
      counts.unknownObservationCount += 1;
    }
  }

  return counts;
}

function mergeCurrentObservation(
  existing: RuntimeSettingsLiveSessionProbeHistoryCounts,
  currentObservation: RuntimeSettingsLiveSessionUptakeObservation | undefined
): RuntimeSettingsLiveSessionProbeHistoryCounts {
  const merged: RuntimeSettingsLiveSessionProbeHistoryCounts = {
    totalRuns: existing.totalRuns + 1,
    reloadRequiredCount: existing.reloadRequiredCount,
    inSessionUpdatedCount: existing.inSessionUpdatedCount,
    unknownObservationCount: existing.unknownObservationCount
  };

  if (currentObservation === 'reload-required') {
    merged.reloadRequiredCount += 1;
    return merged;
  }
  if (currentObservation === 'in-session-updated') {
    merged.inSessionUpdatedCount += 1;
    return merged;
  }

  merged.unknownObservationCount += 1;
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

function formatBooleanReceipt(value: boolean | undefined): string {
  if (value === true) {
    return 'yes';
  }
  if (value === false) {
    return 'no';
  }
  return '<none>';
}
