import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const probeGate = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'assertRuntimeSettingsLiveSessionProbePacket.js'
)) as {
  parseArgs: (argv: readonly string[]) => { helpRequested: boolean; packetPath?: string };
  resolveDefaultPacketPath: (
    platform?: NodeJS.Platform,
    env?: NodeJS.ProcessEnv,
    homedir?: () => string
  ) => string;
  validateProbePacket: (summary: Record<string, unknown>) => string[];
  run: (
    argv?: readonly string[],
    deps?: {
      stdout?: { write: (text: string) => void };
      env?: NodeJS.ProcessEnv;
    }
  ) => { outcome: string; packetPath?: string };
};

describe('assertRuntimeSettingsLiveSessionProbePacket script', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('parses help and explicit packet arguments', () => {
    expect(probeGate.parseArgs(['--help'])).toEqual({ helpRequested: true, packetPath: undefined });
    expect(probeGate.parseArgs(['--packet', './packet.json'])).toEqual({
      helpRequested: false,
      packetPath: './packet.json'
    });
  });

  it('resolves default packet paths for Windows and Linux', () => {
    expect(
      probeGate.resolveDefaultPacketPath(
        'win32',
        { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' },
        () => 'C:\\Users\\tester'
      )
    ).toContain(
      'C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\globalStorage\\svelderrainruiz.vi-history-suite'
    );

    expect(probeGate.resolveDefaultPacketPath('linux', {}, () => '/home/tester')).toContain(
      '/home/tester/.config/Code/User/globalStorage/svelderrainruiz.vi-history-suite'
    );
  });

  it('fails validation when driftDetected does not match drift booleans', () => {
    const failures = probeGate.validateProbePacket({
      outcome: 'probed-runtime-settings-live-session',
      packetRunId: '2026-04-14T13-07-33-123Z',
      packetJsonPath: '/tmp/packet.json',
      packetMarkdownPath: '/tmp/packet.md',
      latestPacketJsonPath: '/tmp/latest-summary.json',
      latestPacketMarkdownPath: '/tmp/latest-summary.md',
      mutationProviderTarget: 'docker',
      liveUptakeObservation: 'reload-required',
      safeRestoreApplied: true,
      safeRestoreVerified: true,
      providerDrift: true,
      versionDrift: false,
      bitnessDrift: false,
      driftDetected: false
    });

    expect(failures).toContain(
      'driftDetected must equal providerDrift || versionDrift || bitnessDrift (true)'
    );
  });

  it('fails validation when live uptake observation conflicts with drift facts', () => {
    const failures = probeGate.validateProbePacket({
      outcome: 'probed-runtime-settings-live-session',
      packetRunId: '2026-04-14T13-07-33-123Z',
      packetJsonPath: '/tmp/packet.json',
      packetMarkdownPath: '/tmp/packet.md',
      latestPacketJsonPath: '/tmp/latest-summary.json',
      latestPacketMarkdownPath: '/tmp/latest-summary.md',
      mutationProviderTarget: 'host',
      liveUptakeObservation: 'in-session-updated',
      safeRestoreApplied: true,
      safeRestoreVerified: true,
      providerDrift: true,
      versionDrift: false,
      bitnessDrift: false,
      driftDetected: true
    });

    expect(failures).toContain('liveUptakeObservation in-session-updated requires driftDetected=false');
  });

  it('passes on a valid packet file via --packet', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-probe-gate-'));
    temporaryDirectories.push(tempRoot);
    const packetPath = path.join(tempRoot, 'latest-summary.json');
    await fs.writeFile(
      packetPath,
      `${JSON.stringify(
        {
          outcome: 'probed-runtime-settings-live-session',
          packetRunId: '2026-04-14T13-07-33-123Z',
          packetJsonPath: packetPath,
          packetMarkdownPath: path.join(tempRoot, 'latest-summary.md'),
          latestPacketJsonPath: packetPath,
          latestPacketMarkdownPath: path.join(tempRoot, 'latest-summary.md'),
          mutationProviderTarget: 'host',
          liveUptakeObservation: 'in-session-updated',
          safeRestoreApplied: true,
          safeRestoreVerified: true,
          providerDrift: false,
          versionDrift: false,
          bitnessDrift: false,
          driftDetected: false
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const stdout: string[] = [];
    const result = probeGate.run(['--packet', packetPath], {
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      }
    });

    expect(result.outcome).toBe('pass');
    expect(result.packetPath).toBe(packetPath);
    expect(stdout.join('')).toContain('Runtime settings live-session probe packet: pass');
  });
});
