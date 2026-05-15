import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const history = require(path.join(repoRoot, 'scripts', 'summarizeVagrantLabviewStartupHistory.js')) as {
  SCHEMA: string;
  parseArgs: (argv: string[]) => {
    roots: string[];
    evidenceDir: string;
    json: boolean;
  };
  parseAcceptanceProvisionLog: (
    filePath: string,
    text: string
  ) => {
    ready: boolean;
    timeout: boolean;
    durationSec: number | null;
  };
  parseStartupReceipt: (
    filePath: string,
    text: string
  ) => {
    phase: string;
    failureCategory: string;
    nextAction: string;
    startupDurationSec: number | null;
    lastObservedLabVIEWState: string;
    timedOut: boolean;
  };
  summarizeVagrantLabviewStartupHistory: (
    options: { roots: string[]; evidenceDir?: string },
    deps: { now: () => Date; hostname: string }
  ) => {
    schema: string;
    successfulStartupDurationsSec: number[];
    stats: { count: number; min: number | null; p50: number | null; p90: number | null; p95: number | null; max: number | null };
    timeoutCount: number;
    recommendation: { recommendedTimeoutSec: number; basis: string };
  };
  runVagrantLabviewStartupHistoryCli: (
    argv: string[],
    deps: { now: () => Date; hostname: string; stdout: { write: (text: string) => void } }
  ) => string;
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-history-'));
  tempRoots.push(root);
  return root;
}

function writeEvidence(root: string, job: string, log: string, receipt: Record<string, unknown>) {
  const evidenceRoot = path.join(root, job, 'artifacts', 'vagrant', 'evidence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'acceptance-provision.log'), log, 'utf8');
  fs.writeFileSync(
    path.join(evidenceRoot, 'labview-startup.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8'
  );
}

describe('Vagrant LabVIEW startup history summarizer', () => {
  it('parses successful VI Server startup duration from acceptance logs', () => {
    const result = history.parseAcceptanceProvisionLog(
      '/tmp/acceptance-provision.log',
      [
        '[01:04:11 acceptance] Scheduled task triggered with a near-future fallback. Waiting up to 300s for LabVIEW to initialise VI Server...',
        '[01:04:23 acceptance] LabVIEW VI Server ready on port 3363.'
      ].join('\n')
    );

    expect(result.ready).toBe(true);
    expect(result.timeout).toBe(false);
    expect(result.durationSec).toBe(12);
  });

  it('summarizes successful starts and timeout receipts with a 60 second recommendation', () => {
    const root = makeTempRoot();
    for (const [index, duration] of [7, 12, 9, 6].entries()) {
      const endSecond = 10 + duration;
      writeEvidence(
        root,
        `job-success-${index}`,
        [
          '[01:00:10 acceptance] LabVIEW is running (Session 1). Waiting up to 300s for VI Server port 3363...',
          `[01:00:${String(endSecond).padStart(2, '0')} acceptance] LabVIEW VI Server ready on port 3363.`
        ].join('\n'),
        {
          schema: 'vi-history-suite/vagrant-labview-startup@v1',
          phase: 'vi-server-ready',
          viServerTimeoutSec: 300
        }
      );
    }
    writeEvidence(
      root,
      'job-timeout',
      [
        '[01:04:11 acceptance] Scheduled task triggered with a near-future fallback. Waiting up to 300s for LabVIEW to initialise VI Server...',
        'LabVIEW VI Server did not open port 3363 within 300 s.'
      ].join('\n'),
      {
        schema: 'vi-history-suite/vagrant-labview-startup@v1',
        phase: 'timeout',
        viServerTimeoutSec: 300
      }
    );

    const report = history.summarizeVagrantLabviewStartupHistory(
      { roots: [root] },
      {
        now: () => new Date('2026-05-14T09:00:00.000Z'),
        hostname: 'vihs-runner'
      }
    );

    expect(report.schema).toBe(history.SCHEMA);
    expect(report.successfulStartupDurationsSec.sort((left, right) => left - right)).toEqual([
      6,
      7,
      9,
      12
    ]);
    expect(report.stats).toEqual({
      count: 4,
      min: 6,
      p50: 7,
      p90: 12,
      p95: 12,
      max: 12
    });
    expect(report.timeoutCount).toBe(1);
    expect(report.recommendation.recommendedTimeoutSec).toBe(60);
  });

  it('writes stable JSON and Markdown evidence', () => {
    const root = makeTempRoot();
    const evidenceDir = path.join(makeTempRoot(), 'history');
    writeEvidence(
      root,
      'job-success',
      [
        '[23:59:58 acceptance] LabVIEW is running (Session 1). Waiting up to 300s for VI Server port 3363...',
        '[00:00:05 acceptance] LabVIEW VI Server ready on port 3363.'
      ].join('\n'),
      {
        schema: 'vi-history-suite/vagrant-labview-startup@v1',
        phase: 'vi-server-ready',
        viServerTimeoutSec: 300
      }
    );

    const stdout: string[] = [];
    const status = history.runVagrantLabviewStartupHistoryCli(
      ['--root', root, '--evidence-dir', evidenceDir, '--json'],
      {
        now: () => new Date('2026-05-14T09:00:00.000Z'),
        hostname: 'vihs-runner',
        stdout: { write: (text) => stdout.push(text) }
      }
    );

    expect(status).toBe('passed');
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      schema: history.SCHEMA,
      recommendation: { recommendedTimeoutSec: 60 }
    });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(evidenceDir, 'vagrant-labview-startup-history.json'), 'utf8')
      )
    ).toMatchObject({
      schema: history.SCHEMA,
      stats: { max: 7 }
    });
    expect(
      fs.readFileSync(path.join(evidenceDir, 'vagrant-labview-startup-history.md'), 'utf8')
    ).toContain('# Vagrant LabVIEW Startup History');
  });

  it('parses CLI roots and JSON mode', () => {
    const parsed = history.parseArgs(['--root', '/tmp/evidence', '--json']);

    expect(parsed.roots).toEqual(['/tmp/evidence']);
    expect(parsed.json).toBe(true);
  });

  it('retains timeout next-action diagnostics from startup receipts', () => {
    const receipt = history.parseStartupReceipt(
      '/tmp/labview-startup.json',
      JSON.stringify({
        schema: 'vi-history-suite/vagrant-labview-startup@v1',
        phase: 'timeout',
        failureCategory: 'vi-server-not-listening',
        nextAction:
          'LabVIEW is running in the interactive desktop but VI Server port 3363 did not listen.',
        startupDurationSec: 60.2,
        lastObservedLabVIEWState: 'interactive-running-vi-server-not-listening',
        viServerTimeoutSec: 60
      })
    );

    expect(receipt).toMatchObject({
      phase: 'timeout',
      failureCategory: 'vi-server-not-listening',
      nextAction:
        'LabVIEW is running in the interactive desktop but VI Server port 3363 did not listen.',
      startupDurationSec: 60.2,
      lastObservedLabVIEWState: 'interactive-running-vi-server-not-listening',
      timedOut: true
    });
  });
});
