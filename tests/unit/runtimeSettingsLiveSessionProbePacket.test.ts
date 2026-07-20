import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { persistRuntimeSettingsLiveSessionProbePacket } from '../../src/tooling/runtimeSettingsLiveSessionProbePacket';

describe('runtimeSettingsLiveSessionProbePacket (VHS-REQ-687.2)', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('persists run-scoped and latest JSON/Markdown probe packets', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-probe-packet-'));
    temporaryDirectories.push(tempRoot);

    const summary = await persistRuntimeSettingsLiveSessionProbePacket(
      {
        outcome: 'probed-runtime-settings-live-session',
        settingsFilePath: '/tmp/settings.json',
        persistedProvider: 'docker',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: 'x64',
        baselinePersistedProvider: 'host',
        baselinePersistedLabviewVersion: '2026',
        baselinePersistedLabviewBitness: 'x64',
        liveProvider: 'host',
        liveLabviewVersion: '2026',
        liveLabviewBitness: 'x64',
        providerDrift: true,
        versionDrift: false,
        bitnessDrift: false,
        driftDetected: true,
        liveUptakeObservation: 'reload-required',
        mutationProviderTarget: 'docker',
        mutationTargetPersistedMatch: true,
        mutationTargetBaselineChanged: true,
        safeRestoreApplied: true,
        safeRestoreVerified: true,
        runtimeValidationOutcome: 'ready',
        runtimeProvider: 'windows-container',
        runtimeEngine: 'labview-cli',
        runtimeBlockedReason: undefined
      },
      tempRoot,
      {
        now: () => new Date('2026-04-14T13:07:33.123Z')
      }
    );

    expect(summary.packetRunId).toBe('2026-04-14T13-07-33-123Z');
    expect(summary.historyTotalRuns).toBe(1);
    expect(summary.historyReloadRequiredCount).toBe(1);
    expect(summary.historyInSessionUpdatedCount).toBe(0);
    expect(summary.historyUnknownObservationCount).toBe(0);
    expect(summary.mutationTargetHostCount).toBe(0);
    expect(summary.mutationTargetDockerCount).toBe(1);
    expect(summary.mutationTargetUnknownCount).toBe(0);
    expect(summary.mutationTargetPersistedMatchCount).toBe(1);
    expect(summary.mutationTargetPersistedMismatchCount).toBe(0);
    expect(summary.mutationTargetPersistedUnknownCount).toBe(0);
    expect(summary.mutationTargetBaselineChangedCount).toBe(1);
    expect(summary.mutationTargetBaselineUnchangedCount).toBe(0);
    expect(summary.mutationTargetBaselineUnknownCount).toBe(0);
    expect(summary.historyStance).toBe('live-uptake-not-proven');
    expect(summary.historyProofStatus).toBe('not-fully-proven');
    expect(summary.providerSelectionCoverage).toBe('single-provider-only');
    await expect(fs.access(summary.packetJsonPath)).resolves.toBeUndefined();
    await expect(fs.access(summary.packetMarkdownPath)).resolves.toBeUndefined();
    await expect(fs.access(summary.latestPacketJsonPath)).resolves.toBeUndefined();
    await expect(fs.access(summary.latestPacketMarkdownPath)).resolves.toBeUndefined();

    const packetJson = JSON.parse(await fs.readFile(summary.packetJsonPath, 'utf8')) as {
      packetRunId: string;
      driftDetected: boolean;
      providerDrift: boolean;
      packetMarkdownPath: string;
      historyStance: string;
      historyProofStatus: string;
      mutationTargetDockerCount: number;
      providerSelectionCoverage: string;
    };
    expect(packetJson.packetRunId).toBe('2026-04-14T13-07-33-123Z');
    expect(packetJson.driftDetected).toBe(true);
    expect(packetJson.providerDrift).toBe(true);
    expect(packetJson.historyStance).toBe('live-uptake-not-proven');
    expect(packetJson.historyProofStatus).toBe('not-fully-proven');
    expect(packetJson.mutationTargetDockerCount).toBe(1);
    expect(packetJson.providerSelectionCoverage).toBe('single-provider-only');
    expect(packetJson.packetMarkdownPath).toBe(summary.packetMarkdownPath);

    const packetMarkdown = await fs.readFile(summary.packetMarkdownPath, 'utf8');
    expect(packetMarkdown).toContain('# Runtime Settings Live-Session Probe Packet');
    expect(packetMarkdown).toContain('Drift detected: `yes`');
    expect(packetMarkdown).toContain('Live uptake observation: `reload-required`');
    expect(packetMarkdown).toContain(
      'Mutation target aligned with persisted provider: `yes`'
    );
    expect(packetMarkdown).toContain('Baseline provider changed after mutation: `yes`');
    expect(packetMarkdown).toContain('Safe restore applied: `yes`');
    expect(packetMarkdown).toContain('Safe restore verified: `yes`');
    expect(packetMarkdown).toContain('## History Receipt');
    expect(packetMarkdown).toContain('Provider selection coverage: `single-provider-only`');
    expect(packetMarkdown).toContain('Mutation target docker runs: `1`');
    expect(packetMarkdown).toContain('Mutation target mismatch runs: `0`');
    expect(packetMarkdown).toContain('Baseline-switch unknown runs: `0`');
    expect(packetMarkdown).toContain('History stance: `live-uptake-not-proven`');
    expect(packetMarkdown).toContain('History proof status: `not-fully-proven`');
    expect(packetMarkdown).toContain('## Baseline Persisted Settings Facts');
    expect(packetMarkdown).toContain('Provider: `docker`');
    expect(packetMarkdown).toContain('Provider: `host`');
  });

  it('retains bidirectional provider coverage and explicit alignment receipts across retained runs', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-probe-packet-coverage-'));
    temporaryDirectories.push(tempRoot);

    await persistRuntimeSettingsLiveSessionProbePacket(
      {
        outcome: 'probed-runtime-settings-live-session',
        settingsFilePath: '/tmp/settings.json',
        persistedProvider: 'docker',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: 'x64',
        baselinePersistedProvider: 'host',
        baselinePersistedLabviewVersion: '2026',
        baselinePersistedLabviewBitness: 'x64',
        liveProvider: 'docker',
        liveLabviewVersion: '2026',
        liveLabviewBitness: 'x64',
        providerDrift: false,
        versionDrift: false,
        bitnessDrift: false,
        driftDetected: false,
        liveUptakeObservation: 'in-session-updated',
        mutationProviderTarget: 'docker',
        mutationTargetPersistedMatch: true,
        mutationTargetBaselineChanged: true,
        safeRestoreApplied: true,
        safeRestoreVerified: true,
        runtimeValidationOutcome: 'ready',
        runtimeProvider: 'windows-container',
        runtimeEngine: 'labview-cli'
      },
      tempRoot,
      {
        now: () => new Date('2026-04-14T13:07:33.123Z')
      }
    );

    const summary = await persistRuntimeSettingsLiveSessionProbePacket(
      {
        outcome: 'probed-runtime-settings-live-session',
        settingsFilePath: '/tmp/settings.json',
        persistedProvider: 'host',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: 'x64',
        baselinePersistedProvider: 'docker',
        baselinePersistedLabviewVersion: '2026',
        baselinePersistedLabviewBitness: 'x64',
        liveProvider: 'host',
        liveLabviewVersion: '2026',
        liveLabviewBitness: 'x64',
        providerDrift: false,
        versionDrift: false,
        bitnessDrift: false,
        driftDetected: false,
        liveUptakeObservation: 'in-session-updated',
        mutationProviderTarget: 'host',
        mutationTargetPersistedMatch: true,
        mutationTargetBaselineChanged: true,
        safeRestoreApplied: true,
        safeRestoreVerified: true,
        runtimeValidationOutcome: 'ready',
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli'
      },
      tempRoot,
      {
        now: () => new Date('2026-04-14T13:08:33.123Z')
      }
    );

    expect(summary.historyTotalRuns).toBe(2);
    expect(summary.historyReloadRequiredCount).toBe(0);
    expect(summary.historyInSessionUpdatedCount).toBe(2);
    expect(summary.mutationTargetHostCount).toBe(1);
    expect(summary.mutationTargetDockerCount).toBe(1);
    expect(summary.mutationTargetUnknownCount).toBe(0);
    expect(summary.mutationTargetPersistedMatchCount).toBe(2);
    expect(summary.mutationTargetPersistedMismatchCount).toBe(0);
    expect(summary.mutationTargetPersistedUnknownCount).toBe(0);
    expect(summary.mutationTargetBaselineChangedCount).toBe(2);
    expect(summary.mutationTargetBaselineUnchangedCount).toBe(0);
    expect(summary.mutationTargetBaselineUnknownCount).toBe(0);
    expect(summary.providerSelectionCoverage).toBe('bidirectional-selection-observed');
    expect(summary.historyStance).toBe('candidate-live-uptake-observed');
    expect(summary.historyProofStatus).toBe('re-evaluation-required');
  });

  function baseSummary(
    overrides: Record<string, unknown> = {}
  ): Parameters<typeof persistRuntimeSettingsLiveSessionProbePacket>[0] {
    return {
      outcome: 'probed-runtime-settings-live-session',
      settingsFilePath: '/tmp/settings.json',
      persistedProvider: 'docker',
      persistedLabviewVersion: '2026',
      persistedLabviewBitness: 'x64',
      baselinePersistedProvider: 'host',
      baselinePersistedLabviewVersion: '2026',
      baselinePersistedLabviewBitness: 'x64',
      liveProvider: 'host',
      liveLabviewVersion: '2026',
      liveLabviewBitness: 'x64',
      providerDrift: true,
      versionDrift: false,
      bitnessDrift: false,
      driftDetected: true,
      liveUptakeObservation: 'reload-required',
      mutationProviderTarget: 'docker',
      mutationTargetPersistedMatch: true,
      mutationTargetBaselineChanged: true,
      safeRestoreApplied: true,
      safeRestoreVerified: true,
      runtimeValidationOutcome: 'ready',
      runtimeProvider: 'windows-container',
      runtimeEngine: 'labview-cli',
      runtimeBlockedReason: undefined,
      ...overrides
    } as Parameters<typeof persistRuntimeSettingsLiveSessionProbePacket>[0];
  }

  async function freshRoot(): Promise<string> {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-probe-branches-'));
    temporaryDirectories.push(tempRoot);
    return tempRoot;
  }

  it('classifies an all-unknown run as insufficient evidence with none receipts', async () => {
    const tempRoot = await freshRoot();
    const summary = await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({
        driftDetected: undefined,
        liveUptakeObservation: undefined,
        mutationProviderTarget: undefined,
        mutationTargetPersistedMatch: undefined,
        mutationTargetBaselineChanged: undefined
      }),
      tempRoot,
      { now: () => new Date('2026-04-14T13:07:33.123Z') }
    );

    expect(summary.historyUnknownObservationCount).toBe(1);
    expect(summary.mutationTargetUnknownCount).toBe(1);
    expect(summary.mutationTargetPersistedUnknownCount).toBe(1);
    expect(summary.mutationTargetBaselineUnknownCount).toBe(1);
    expect(summary.historyStance).toBe('insufficient-evidence');
    expect(summary.historyProofStatus).toBe('not-fully-proven');
    expect(summary.providerSelectionCoverage).toBe('insufficient-evidence');

    const markdown = await fs.readFile(summary.packetMarkdownPath, 'utf8');
    expect(markdown).toContain('Mutation target aligned with persisted provider: `<none>`');
    expect(markdown).toContain('Baseline provider changed after mutation: `<none>`');
  });

  it('counts false boolean receipts and a host mutation target as their own branches', async () => {
    const tempRoot = await freshRoot();
    const summary = await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({
        liveUptakeObservation: 'in-session-updated',
        mutationProviderTarget: 'host',
        mutationTargetPersistedMatch: false,
        mutationTargetBaselineChanged: false
      }),
      tempRoot,
      { now: () => new Date('2026-04-14T13:07:33.123Z') }
    );

    expect(summary.historyInSessionUpdatedCount).toBe(1);
    expect(summary.mutationTargetHostCount).toBe(1);
    expect(summary.mutationTargetPersistedMismatchCount).toBe(1);
    expect(summary.mutationTargetBaselineUnchangedCount).toBe(1);
    expect(summary.historyStance).toBe('candidate-live-uptake-observed');
    expect(summary.providerSelectionCoverage).toBe('single-provider-only');

    const markdown = await fs.readFile(summary.packetMarkdownPath, 'utf8');
    expect(markdown).toContain('Mutation target aligned with persisted provider: `no`');
    expect(markdown).toContain('Baseline provider changed after mutation: `no`');
  });

  it('derives a prior run live-uptake observation from persisted driftDetected when re-reading history', async () => {
    const reloadRoot = await freshRoot();
    await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({ liveUptakeObservation: undefined, driftDetected: true }),
      reloadRoot,
      { now: () => new Date('2026-04-14T13:07:33.123Z') }
    );
    const reloadSecond = await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({ liveUptakeObservation: 'reload-required', driftDetected: true }),
      reloadRoot,
      { now: () => new Date('2026-04-14T13:08:00.000Z') }
    );
    // The prior run contributed a reload-required observation derived from driftDetected.
    expect(reloadSecond.historyReloadRequiredCount).toBe(2);
    expect(reloadSecond.historyStance).toBe('live-uptake-not-proven');

    const inSessionRoot = await freshRoot();
    await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({ liveUptakeObservation: undefined, driftDetected: false }),
      inSessionRoot,
      { now: () => new Date('2026-04-14T13:07:33.123Z') }
    );
    const inSessionSecond = await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({ liveUptakeObservation: 'in-session-updated', driftDetected: false }),
      inSessionRoot,
      { now: () => new Date('2026-04-14T13:08:00.000Z') }
    );
    // Both runs resolve to in-session-updated (one direct, one via driftDetected=false).
    expect(inSessionSecond.historyInSessionUpdatedCount).toBe(2);
    expect(inSessionSecond.historyStance).toBe('candidate-live-uptake-observed');
  });

  it('treats an unrecognized mutation-provider-target string as unknown', async () => {
    const tempRoot = await freshRoot();
    const summary = await persistRuntimeSettingsLiveSessionProbePacket(
      baseSummary({ mutationProviderTarget: 'gpu' }),
      tempRoot,
      { now: () => new Date('2026-04-14T13:07:33.123Z') }
    );
    expect(summary.mutationTargetUnknownCount).toBe(1);
    expect(summary.mutationTargetHostCount).toBe(0);
    expect(summary.mutationTargetDockerCount).toBe(0);
  });
});
