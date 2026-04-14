import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const historyScript = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'printRuntimeSettingsLiveSessionProbeHistory.js'
)) as {
  parseArgs: (argv: readonly string[]) => {
    helpRequested: boolean;
    json: boolean;
    packetRoot?: string;
  };
  collectRunSummaries: (
    packetRoot: string,
    fsApi?: {
      readdirSync: typeof import('node:fs').readdirSync;
      existsSync: typeof import('node:fs').existsSync;
      readFileSync: typeof import('node:fs').readFileSync;
    }
  ) => Array<{
    runId: string;
    summaryPath: string;
    summary: Record<string, unknown>;
  }>;
  summarizeHistory: (
    packetRoot: string,
    runSummaries: Array<{
      runId: string;
      summaryPath: string;
      summary: Record<string, unknown>;
    }>
  ) => {
    stance: string;
    totalRuns: number;
    reloadRequiredCount: number;
    inSessionUpdatedCount: number;
    mutationTargetHostCount: number;
    mutationTargetDockerCount: number;
    providerSelectionCoverage: string;
    proofStatus: string;
    mutationTargetPersistedMatchCount: number;
    mutationTargetPersistedMismatchCount: number;
    mutationTargetPersistedUnknownCount: number;
    latestObservation?: string;
  };
  run: (
    argv?: readonly string[],
    deps?: {
      stdout?: { write: (text: string) => void };
    }
  ) => { outcome: string; summary?: Record<string, unknown> };
};

describe('printRuntimeSettingsLiveSessionProbeHistory script', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('parses help/json and packet root arguments', () => {
    expect(historyScript.parseArgs(['--help'])).toEqual({
      helpRequested: true,
      json: false,
      packetRoot: undefined
    });
    expect(historyScript.parseArgs(['--json', '--packet-root', './packets'])).toEqual({
      helpRequested: false,
      json: true,
      packetRoot: './packets'
    });
  });

  it('summarizes retained runs and reports live-uptake-not-proven when reload-required exists', async () => {
    const packetRoot = await seedHistoryPackets([
      {
        runId: '2026-04-14T13-00-00-000Z',
        summary: {
          liveUptakeObservation: 'reload-required',
          mutationProviderTarget: 'docker',
          mutationTargetPersistedMatch: true,
          safeRestoreVerified: true
        }
      },
      {
        runId: '2026-04-14T12-00-00-000Z',
        summary: {
          liveUptakeObservation: 'in-session-updated',
          mutationProviderTarget: 'host',
          mutationTargetPersistedMatch: true,
          safeRestoreVerified: true
        }
      }
    ]);

    const runs = historyScript.collectRunSummaries(packetRoot);
    const summary = historyScript.summarizeHistory(packetRoot, runs);
    expect(summary.totalRuns).toBe(2);
    expect(summary.reloadRequiredCount).toBe(1);
    expect(summary.inSessionUpdatedCount).toBe(1);
    expect(summary.mutationTargetHostCount).toBe(1);
    expect(summary.mutationTargetDockerCount).toBe(1);
    expect(summary.mutationTargetPersistedMatchCount).toBe(2);
    expect(summary.mutationTargetPersistedMismatchCount).toBe(0);
    expect(summary.mutationTargetPersistedUnknownCount).toBe(0);
    expect(summary.providerSelectionCoverage).toBe('bidirectional-selection-observed');
    expect(summary.proofStatus).toBe('not-fully-proven');
    expect(summary.latestObservation).toBe('reload-required');
    expect(summary.stance).toBe('live-uptake-not-proven');
  });

  it('falls back to driftDetected when liveUptakeObservation is missing', async () => {
    const packetRoot = await seedHistoryPackets([
      {
        runId: '2026-04-14T13-00-00-000Z',
        summary: {
          driftDetected: false,
          safeRestoreVerified: true
        }
      }
    ]);

    const runs = historyScript.collectRunSummaries(packetRoot);
    const summary = historyScript.summarizeHistory(packetRoot, runs);
    expect(summary.totalRuns).toBe(1);
    expect(summary.inSessionUpdatedCount).toBe(1);
    expect(summary.reloadRequiredCount).toBe(0);
    expect(summary.mutationTargetHostCount).toBe(0);
    expect(summary.mutationTargetDockerCount).toBe(0);
    expect(summary.mutationTargetPersistedUnknownCount).toBe(1);
    expect(summary.providerSelectionCoverage).toBe('insufficient-evidence');
    expect(summary.proofStatus).toBe('re-evaluation-required');
    expect(summary.latestObservation).toBe('in-session-updated');
  });

  it('prints JSON output when requested', async () => {
    const packetRoot = await seedHistoryPackets([
      {
        runId: '2026-04-14T13-00-00-000Z',
        summary: {
          liveUptakeObservation: 'reload-required',
          safeRestoreVerified: true
        }
      }
    ]);
    const stdout: string[] = [];

    const result = historyScript.run(['--packet-root', packetRoot, '--json'], {
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      }
    });

    expect(result.outcome).toBe('ok');
    const parsed = JSON.parse(stdout.join('')) as {
      stance: string;
      totalRuns: number;
      providerSelectionCoverage: string;
      proofStatus: string;
    };
    expect(parsed.totalRuns).toBe(1);
    expect(parsed.stance).toBe('live-uptake-not-proven');
    expect(parsed.providerSelectionCoverage).toBe('insufficient-evidence');
    expect(parsed.proofStatus).toBe('not-fully-proven');
  });
});

async function seedHistoryPackets(
  runs: Array<{
    runId: string;
    summary: Record<string, unknown>;
  }>
): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-probe-history-'));
  const packetRoot = path.join(tempRoot, 'runtime-provider-live-session-probe');
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
