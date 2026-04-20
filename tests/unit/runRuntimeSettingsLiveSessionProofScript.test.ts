import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const proofScript = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'runRuntimeSettingsLiveSessionProof.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  parseArgs: (argv: readonly string[]) => {
    helpRequested: boolean;
    json: boolean;
    host: string;
    evidenceDir?: string;
  };
  resolveHost: (requestedHost?: string, platform?: NodeJS.Platform) => string;
  buildIntegrationProofCommand: (
    host: string,
    repoRoot: string,
    proofOutputDir: string,
    env?: NodeJS.ProcessEnv,
    nodeExecutable?: string
  ) => { command: string; args: string[]; env: NodeJS.ProcessEnv };
  run: (
    argv?: readonly string[],
    deps?: {
      stdout?: { write: (text: string) => void };
      stderr?: { write: (text: string) => void };
      repoRoot?: string;
      platform?: NodeJS.Platform;
      fs?: typeof import('node:fs');
      historyFs?: typeof import('node:fs');
      env?: NodeJS.ProcessEnv;
      nodeExecutable?: string;
      now?: () => Date;
      spawnSync?: typeof import('node:child_process').spawnSync;
      packetGate?: {
        run: (argv: readonly string[]) => {
          outcome: string;
          packetPath?: string;
          summary?: Record<string, unknown>;
        };
      };
      history?: {
        collectRunSummaries: (packetRoot: string, fsApi: unknown) => Array<Record<string, unknown>>;
        summarizeHistory: (packetRoot: string, runSummaries: Array<Record<string, unknown>>) => Record<string, unknown>;
        formatHistorySummary: (summary: Record<string, unknown>) => string;
      };
      policy?: {
        run: (
          argv: readonly string[],
          deps: { stdout: { write: (text: string) => void } }
        ) => { outcome: string; summary?: Record<string, unknown> };
      };
    }
  ) => {
    outcome: string;
    host?: string;
    evidenceDir?: string;
    receiptJsonPath?: string;
    receipt?: Record<string, unknown>;
  };
};

describe('runRuntimeSettingsLiveSessionProof script', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('parses host, evidence-dir, and json arguments', () => {
    expect(proofScript.parseArgs(['--help'])).toEqual({
      helpRequested: true,
      json: false,
      host: 'auto',
      evidenceDir: undefined
    });
    expect(
      proofScript.parseArgs(['--json', '--host', 'windows', '--evidence-dir', './receipt'])
    ).toEqual({
      helpRequested: false,
      json: true,
      host: 'windows',
      evidenceDir: './receipt'
    });
  });

  it('maps auto host to the current platform and rejects cross-host requests', () => {
    expect(proofScript.resolveHost('auto', 'win32')).toBe('windows');
    expect(proofScript.resolveHost('auto', 'linux')).toBe('linux');
    expect(() => proofScript.resolveHost('linux', 'win32')).toThrow(
      'Host linux is not supported from the current win32 proof surface'
    );
  });

  it('builds a node-based integration proof command for the selected host', () => {
    const repoRoot = path.resolve('repo-root');
    const command = proofScript.buildIntegrationProofCommand(
      'windows',
      repoRoot,
      path.join(repoRoot, '.cache', 'runtime-settings-live-session-proof', 'latest'),
      { APPDATA: 'C:\\Users\\sveld\\AppData\\Roaming' },
      'C:\\node.exe'
    );

    expect(command.command).toBe('C:\\node.exe');
    expect(command.args).toEqual([
      path.join(repoRoot, 'scripts', 'runWindowsIntegrationHost.js')
    ]);
    expect(command.env.APPDATA).toBe('C:\\Users\\sveld\\AppData\\Roaming');
    expect(command.env.VI_HISTORY_SUITE_RUNTIME_SETTINGS_LIVE_SESSION_PROOF_OUTPUT_DIR).toContain(
      '.cache'
    );
  });

  it('runs the proof lane, snapshots retained evidence, and writes a receipt', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-proof-'));
    temporaryDirectories.push(tempRoot);

    const repoRoot = path.join(tempRoot, 'repo');
    const evidenceDir = path.join(repoRoot, '.cache', 'runtime-settings-live-session-proof', 'latest');
    const packetRoot = path.join(tempRoot, 'packets');
    const packetJsonPath = path.join(packetRoot, '2026-04-20T02-00-00-000Z', 'probe-summary.json');
    const packetMarkdownPath = path.join(packetRoot, '2026-04-20T02-00-00-000Z', 'probe-summary.md');
    const latestPacketPath = path.join(packetRoot, 'latest-summary.json');
    const retainedPacketRoot = path.join(evidenceDir, 'integration-proof-output', 'packet-root');

    await fs.mkdir(path.dirname(packetJsonPath), { recursive: true });
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.writeFile(packetJsonPath, '{"outcome":"probed-runtime-settings-live-session"}\n', 'utf8');
    await fs.writeFile(packetMarkdownPath, '# Probe Packet\n', 'utf8');
    await fs.mkdir(retainedPacketRoot, { recursive: true });
    await fs.writeFile(path.join(retainedPacketRoot, 'latest-summary.json'), '{}\n', 'utf8');

    const stdout: string[] = [];
    const stderr: string[] = [];
    const historySummary = {
      packetRoot,
      totalRuns: 1,
      reloadRequiredCount: 1,
      inSessionUpdatedCount: 0,
      unknownObservationCount: 0,
      safeRestoreVerifiedCount: 1,
      mutationTargetHostCount: 1,
      mutationTargetDockerCount: 1,
      mutationTargetUnknownCount: 0,
      mutationTargetPersistedMatchCount: 1,
      mutationTargetPersistedMismatchCount: 0,
      mutationTargetPersistedUnknownCount: 0,
      mutationTargetBaselineChangedCount: 1,
      mutationTargetBaselineUnchangedCount: 0,
      mutationTargetBaselineUnknownCount: 0,
      providerDriftTrueCount: 1,
      providerDriftFalseCount: 0,
      providerDriftUnknownCount: 0,
      latestRunId: '2026-04-20T02-00-00-000Z',
      latestSummaryPath: packetJsonPath,
      latestObservation: 'reload-required',
      latestMutationTarget: 'docker',
      latestProviderDrift: true,
      stance: 'live-uptake-not-proven',
      proofStatus: 'not-fully-proven',
      providerSelectionCoverage: 'bidirectional-selection-observed',
      recommendation:
        'Keep reload-or-restart guidance active; retained history still contains reload-required runs.'
    };

    const result = proofScript.run(['--json'], {
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      },
      stderr: {
        write(text: string) {
          stderr.push(text);
        }
      },
      repoRoot,
      platform: 'win32',
      fs: require('node:fs'),
      historyFs: require('node:fs'),
      now: () => new Date('2026-04-20T02:05:00.000Z'),
      spawnSync: vi.fn().mockReturnValue({
        status: 0,
        stdout: 'integration ok\n',
        stderr: ''
      }) as never,
      packetGate: {
        run: (argv: readonly string[]) => ({
          outcome: 'pass',
          packetPath: latestPacketPath,
          summary: {
            packetRunId: '2026-04-20T02-00-00-000Z',
            liveUptakeObservation: 'reload-required',
            packetJsonPath,
            packetMarkdownPath,
            latestPacketJsonPath: latestPacketPath,
            latestPacketMarkdownPath: path.join(packetRoot, 'latest-summary.md')
          }
        })
      },
      history: {
        collectRunSummaries: vi.fn().mockReturnValue([{ summaryPath: packetJsonPath }]),
        summarizeHistory: vi.fn().mockReturnValue(historySummary),
        formatHistorySummary: vi.fn().mockReturnValue('history summary\n')
      },
      policy: {
        run: vi.fn().mockReturnValue({
          outcome: 'pass',
          summary: historySummary
        })
      }
    });

    expect(result.outcome).toBe('pass');
    expect(result.host).toBe('windows');
    expect(result.evidenceDir).toBe(evidenceDir);
    expect(stdout.join('')).toContain('integration ok');
    expect(stdout.join('')).toContain('"schema": "vi-history-suite/runtime-settings-live-session-proof@v1"');
    expect(stderr.join('')).toBe('');
    await expect(fs.readFile(path.join(evidenceDir, 'probe-summary.json'), 'utf8')).resolves.toContain(
      'probed-runtime-settings-live-session'
    );
    await expect(
      fs.readFile(path.join(evidenceDir, 'runtime-settings-live-session-proof.md'), 'utf8')
    ).resolves.toContain('Runtime Settings Live-Session Proof Receipt');
  });

  it('fails when the integration proof lane returns a non-zero exit code', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-live-proof-fail-'));
    temporaryDirectories.push(tempRoot);
    const repoRoot = path.join(tempRoot, 'repo');
    await fs.mkdir(repoRoot, { recursive: true });

    expect(() =>
      proofScript.run([], {
        repoRoot,
        platform: 'win32',
        fs: require('node:fs'),
        historyFs: require('node:fs'),
        spawnSync: vi.fn().mockReturnValue({
          status: 2,
          stdout: 'bad\n',
          stderr: 'worse\n'
        }) as never
      })
    ).toThrow('Runtime-settings live-session proof integration lane failed with exit code 2');
  });
});
