import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { persistRuntimeSettingsLiveSessionProbePacket } from '../../src/tooling/runtimeSettingsLiveSessionProbePacket';

describe('runtimeSettingsLiveSessionProbePacket', () => {
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
        liveProvider: 'host',
        liveLabviewVersion: '2026',
        liveLabviewBitness: 'x64',
        providerDrift: true,
        versionDrift: false,
        bitnessDrift: false,
        driftDetected: true,
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
    await expect(fs.access(summary.packetJsonPath)).resolves.toBeUndefined();
    await expect(fs.access(summary.packetMarkdownPath)).resolves.toBeUndefined();
    await expect(fs.access(summary.latestPacketJsonPath)).resolves.toBeUndefined();
    await expect(fs.access(summary.latestPacketMarkdownPath)).resolves.toBeUndefined();

    const packetJson = JSON.parse(await fs.readFile(summary.packetJsonPath, 'utf8')) as {
      packetRunId: string;
      driftDetected: boolean;
      providerDrift: boolean;
      packetMarkdownPath: string;
    };
    expect(packetJson.packetRunId).toBe('2026-04-14T13-07-33-123Z');
    expect(packetJson.driftDetected).toBe(true);
    expect(packetJson.providerDrift).toBe(true);
    expect(packetJson.packetMarkdownPath).toBe(summary.packetMarkdownPath);

    const packetMarkdown = await fs.readFile(summary.packetMarkdownPath, 'utf8');
    expect(packetMarkdown).toContain('# Runtime Settings Live-Session Probe Packet');
    expect(packetMarkdown).toContain('Drift detected: `yes`');
    expect(packetMarkdown).toContain('Provider: `docker`');
    expect(packetMarkdown).toContain('Provider: `host`');
  });
});
