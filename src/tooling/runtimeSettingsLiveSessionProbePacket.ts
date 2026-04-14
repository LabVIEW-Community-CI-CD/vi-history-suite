import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  RuntimeSettingsLiveSessionProbeSummary,
  RuntimeSettingsLiveSessionProbeSummaryWithPacket
} from './runtimeSettingsLiveSessionProbe';

export interface RuntimeSettingsLiveSessionProbePacketPaths {
  packetRunId: string;
  packetJsonPath: string;
  packetMarkdownPath: string;
  latestPacketJsonPath: string;
  latestPacketMarkdownPath: string;
}

interface RuntimeSettingsLiveSessionProbePacketDeps {
  fs?: Pick<typeof fs, 'mkdir' | 'writeFile'>;
  now?: () => Date;
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

  const packetSummary: RuntimeSettingsLiveSessionProbeSummaryWithPacket = {
    ...summary,
    packetRunId,
    packetJsonPath,
    packetMarkdownPath,
    latestPacketJsonPath,
    latestPacketMarkdownPath
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
    `- Provider drift: \`${summary.providerDrift ? 'yes' : 'no'}\``,
    `- Version drift: \`${summary.versionDrift ? 'yes' : 'no'}\``,
    `- Bitness drift: \`${summary.bitnessDrift ? 'yes' : 'no'}\``,
    `- Mutation provider target: \`${summary.mutationProviderTarget ?? '<none>'}\``,
    `- Safe restore applied: \`${summary.safeRestoreApplied ? 'yes' : 'no'}\``,
    `- Safe restore verified: \`${summary.safeRestoreVerified ? 'yes' : 'no'}\``,
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
