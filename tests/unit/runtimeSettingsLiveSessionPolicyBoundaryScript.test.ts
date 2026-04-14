import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const boundaryScript = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'assertRuntimeSettingsLiveSessionPolicyBoundary.js'
)) as {
  parseArgs: (argv: readonly string[]) => {
    helpRequested: boolean;
    json: boolean;
    packetRoot?: string;
  };
  run: (
    argv?: readonly string[],
    deps?: {
      stdout?: { write: (text: string) => void };
    }
  ) => { outcome: string; summary?: Record<string, unknown> };
};

describe('assertRuntimeSettingsLiveSessionPolicyBoundary script', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('parses help/json and packet-root arguments', () => {
    expect(boundaryScript.parseArgs(['--help'])).toEqual({
      helpRequested: true,
      json: false,
      packetRoot: undefined
    });
    expect(boundaryScript.parseArgs(['--json', '--packet-root', './packets'])).toEqual({
      helpRequested: false,
      json: true,
      packetRoot: './packets'
    });
  });

  it('passes when retained history stance is live-uptake-not-proven', async () => {
    const packetRoot = await seedHistoryPackets(temporaryDirectories, [
      {
        runId: '2026-04-14T13-00-00-000Z',
        summary: {
          liveUptakeObservation: 'reload-required',
          driftDetected: true,
          safeRestoreVerified: true
        }
      }
    ]);
    const stdout: string[] = [];

    const result = boundaryScript.run(['--packet-root', packetRoot], {
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      }
    });

    expect(result.outcome).toBe('pass');
    expect(stdout.join('')).toContain('Runtime settings live-session policy boundary: pass');
  });

  it('fails when retained history no longer supports unconditional reload guidance', async () => {
    const packetRoot = await seedHistoryPackets(temporaryDirectories, [
      {
        runId: '2026-04-14T13-00-00-000Z',
        summary: {
          liveUptakeObservation: 'in-session-updated',
          driftDetected: false,
          safeRestoreVerified: true
        }
      }
    ]);

    expect(() => boundaryScript.run(['--packet-root', packetRoot])).toThrow(
      'policy boundary no longer supports unconditional reload guidance'
    );
  });
});

async function seedHistoryPackets(
  temporaryDirectories: string[],
  runs: Array<{
    runId: string;
    summary: Record<string, unknown>;
  }>
): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-policy-boundary-'));
  const packetRoot = path.join(tempRoot, 'runtime-provider-live-session-probe');
  temporaryDirectories.push(tempRoot);
  await fs.mkdir(packetRoot, { recursive: true });
  for (const run of runs) {
    const runDirectory = path.join(packetRoot, run.runId);
    await fs.mkdir(runDirectory, { recursive: true });
    await fs.writeFile(
      path.join(runDirectory, 'probe-summary.json'),
      `${JSON.stringify(run.summary, null, 2)}\n`,
      'utf8'
    );
  }
  return packetRoot;
}
