import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const history = require(path.join(repoRoot, 'scripts', 'summarizeVagrantRunnerReadinessHistory.js')) as {
  SCHEMA: string;
  parseArgs: (argv: string[]) => {
    roots: string[];
    evidenceDir: string;
    currentTimerSec: number;
    json: boolean;
  };
  classifyIssue: (issue: string) => string;
  summarizeVagrantRunnerReadinessHistory: (
    options: { roots: string[]; evidenceDir?: string; currentTimerSec?: number },
    deps: { now: () => Date; hostname: string }
  ) => {
    schema: string;
    receiptCount: number;
    statusCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    intervalStatsSec: { p50: number | null; p90: number | null };
    timerDecisionSignals: {
      activeStorageDriftIncidentCount: number;
      activeStorageDriftReceiptCount: number;
      activeStorageWorstDetectionWindowSec: number | null;
      activeStorageWorstRecoveryWindowSec: number | null;
      busyContextReceiptCount: number;
      observedCadenceSec: { p50: number | null; p90: number | null; p95: number | null };
    };
    incidents: Array<{
      categories: string[];
      detectionWindowSec: number | null;
      recoveryWindowSec: number | null;
      failureReceiptCount: number;
    }>;
    recommendation: {
      decision: string;
      recommendedTimerSec: number;
      adaptiveCandidate: boolean;
      basis: string;
    };
  };
  runVagrantRunnerReadinessHistoryCli: (
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-readiness-history-'));
  tempRoots.push(root);
  return root;
}

function timestampLeaf(value: string): string {
  return value.replace(/[:.]/gu, '-');
}

function writeReceipt(
  root: string,
  generatedAt: string,
  status: 'passed' | 'failed' | 'busy',
  issues: string[] = []
) {
  const payload = {
    schema: 'vi-history-suite/vagrant-acceptance-runner-readiness@v1',
    generatedAt,
    hostname: 'runner',
    status,
    healthy: status === 'passed',
    activeRoot: '/run/media/sergio/Data/vihs-vagrant',
    standbyRoot: '/run/media/sergio/Data1/vihs-vagrant',
    archiveRoot: '/run/media/sergio/MAJOR GENER/VI History Suite Evidence',
    issues,
    nextAction: status === 'passed'
      ? 'Runner ready for Vagrant Windows VSIX acceptance.'
      : status === 'busy'
        ? 'Runner is busy with the disposable Vagrant CI VM; let the current Vagrant job finish.'
        : 'Mount /run/media/sergio/Data or restore the active mirror from /run/media/sergio/Data1/vihs-vagrant before retrying the Vagrant acceptance lane.'
  };
  fs.writeFileSync(
    path.join(root, `${timestampLeaf(generatedAt)}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );
}

describe('Vagrant runner readiness history summarizer', () => {
  it('classifies storage drift and expected busy host-doctor failures', () => {
    expect(history.classifyIssue('active mount point is not mounted: /run/media/sergio/Data')).toBe(
      'active-storage-drift'
    );
    expect(history.classifyIssue("ERROR: Vagrant CI VM 'vihs-ci-win11' is already running")).toBe(
      'runner-busy'
    );
    expect(
      history.classifyIssue(
        "ERROR: Golden VM 'vihs-win11-labview2026-golden' exists but is 'running', expected 'poweroff'"
      )
    ).toBe('golden-vm-active');
  });

  it('keeps the five minute timer when history shows storage detection plus busy noise', () => {
    const root = makeTempRoot();
    writeReceipt(root, '2026-05-14T18:00:00.000Z', 'passed');
    writeReceipt(root, '2026-05-14T18:05:00.000Z', 'failed', [
      'active mount point is not mounted: /run/media/sergio/Data',
      'active storage root is missing: /run/media/sergio/Data/vihs-vagrant'
    ]);
    writeReceipt(root, '2026-05-14T18:10:00.000Z', 'failed', [
      'active mount point is not mounted: /run/media/sergio/Data'
    ]);
    writeReceipt(root, '2026-05-14T18:15:00.000Z', 'passed');
    writeReceipt(root, '2026-05-14T18:20:00.000Z', 'busy', [
      "Vagrant host doctor failed with exit code 1",
      "ERROR: Vagrant CI VM 'vihs-ci-win11' is already running"
    ]);
    writeReceipt(root, '2026-05-14T18:25:00.000Z', 'passed');

    const report = history.summarizeVagrantRunnerReadinessHistory(
      { roots: [root], currentTimerSec: 300 },
      {
        now: () => new Date('2026-05-14T19:00:00.000Z'),
        hostname: 'vihs-runner'
      }
    );

    expect(report.schema).toBe(history.SCHEMA);
    expect(report.receiptCount).toBe(6);
    expect(report.statusCounts).toEqual({ passed: 3, failed: 2, busy: 1 });
    expect(report.categoryCounts).toMatchObject({
      'active-storage-drift': 2,
      'runner-busy': 1
    });
    expect(report.intervalStatsSec).toMatchObject({ p50: 300, p90: 300 });
    expect(report.incidents).toHaveLength(1);
    expect(report.incidents[0]).toMatchObject({
      categories: ['active-storage-drift'],
      detectionWindowSec: 300,
      recoveryWindowSec: 300,
      failureReceiptCount: 2
    });
    expect(report.timerDecisionSignals).toMatchObject({
      activeStorageDriftIncidentCount: 1,
      activeStorageDriftReceiptCount: 2,
      activeStorageWorstDetectionWindowSec: 300,
      activeStorageWorstRecoveryWindowSec: 300,
      busyContextReceiptCount: 1,
      observedCadenceSec: { p50: 300, p90: 300, p95: 300 }
    });
    expect(report.recommendation).toMatchObject({
      decision: 'keep-current-timer',
      recommendedTimerSec: 300,
      adaptiveCandidate: true
    });
    expect(report.recommendation.basis).toContain('Shortening the timer would increase expected busy receipts');
  });

  it('writes stable JSON and Markdown evidence', () => {
    const root = makeTempRoot();
    const evidenceDir = path.join(makeTempRoot(), 'history');
    writeReceipt(root, '2026-05-14T18:00:00.000Z', 'passed');
    writeReceipt(root, '2026-05-14T18:05:00.000Z', 'passed');

    const stdout: string[] = [];
    const status = history.runVagrantRunnerReadinessHistoryCli(
      ['--root', root, '--evidence-dir', evidenceDir, '--json'],
      {
        now: () => new Date('2026-05-14T19:00:00.000Z'),
        hostname: 'vihs-runner',
        stdout: { write: (text) => stdout.push(text) }
      }
    );

    expect(status).toBe('passed');
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      schema: history.SCHEMA,
      recommendation: { recommendedTimerSec: 300 }
    });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(evidenceDir, 'vagrant-runner-readiness-history.json'), 'utf8')
      )
    ).toMatchObject({
      schema: history.SCHEMA,
      receiptCount: 2
    });
    expect(
      fs.readFileSync(path.join(evidenceDir, 'vagrant-runner-readiness-history.md'), 'utf8')
    ).toContain('Active storage drift incidents: 0');
  });

  it('parses CLI roots, current timer, and JSON mode', () => {
    const parsed = history.parseArgs([
      '--root',
      '/tmp/readiness',
      '--current-timer-sec',
      '600',
      '--json'
    ]);

    expect(parsed.roots).toEqual(['/tmp/readiness']);
    expect(parsed.currentTimerSec).toBe(600);
    expect(parsed.json).toBe(true);
  });
});
