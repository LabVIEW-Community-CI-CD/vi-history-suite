import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const readiness = require(path.join(repoRoot, 'scripts', 'runVagrantAcceptanceRunnerReadiness.js')) as {
  SCHEMA: string;
  getUsage: () => string;
  parseArgs: (argv: string[], env?: Record<string, string>) => {
    activeRoot: string;
    standbyRoot: string;
    archiveRoot: string;
    evidenceDir: string;
    receiptRoot: string;
  };
  runVagrantAcceptanceRunnerReadiness: (
    options: {
      activeRoot: string;
      standbyRoot: string;
      archiveRoot: string;
      vagrantHome: string;
      evidenceDir?: string;
      receiptRoot?: string;
    },
    deps: {
      runStorageDoctor: () => Record<string, unknown>;
      runHostDoctor: () => { status?: number; exitCode?: number; stdout?: string; stderr?: string };
      now: () => Date;
      hostname: string;
    }
  ) => {
    schema: string;
    status: string;
    healthy: boolean;
    activeRoot: string;
    standbyRoot: string;
    archiveRoot: string;
    storageDoctor: { activeHealthy: boolean; issues: string[] };
    hostDoctor: { healthy: boolean; exitCode: number; stderr: string };
    issues: string[];
    nextAction: string;
    receiptPaths?: { latestReceiptPath: string; timestampedReceiptPath: string };
  };
  runVagrantAcceptanceRunnerReadinessCli: (
    argv: string[],
    deps: {
      env?: Record<string, string>;
      runStorageDoctor: () => Record<string, unknown>;
      runHostDoctor: () => { status?: number; exitCode?: number; stdout?: string; stderr?: string };
      now: () => Date;
      hostname: string;
      stdout: { write: (text: string) => void };
    }
  ) => string;
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-readiness-'));
  tempRoots.push(root);
  return root;
}

function createStorageDoctorReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'vi-history-suite/vagrant-storage-doctor@v1',
    generatedAt: '2026-05-14T07:25:02.389Z',
    hostname: 'vihs-runner',
    status: 'passed',
    healthy: true,
    activeHealthy: true,
    issues: [],
    warnings: [],
    active: { issues: [], warnings: [] },
    standby: { issues: [], warnings: [] },
    archive: { issues: [], warnings: [] },
    vagrantHome: { issues: [], warnings: [] },
    ...overrides
  };
}

function runReadiness(overrides: {
  storageDoctor?: Record<string, unknown>;
  hostDoctor?: { status?: number; exitCode?: number; stdout?: string; stderr?: string };
  evidenceDir?: string;
  receiptRoot?: string;
} = {}) {
  return readiness.runVagrantAcceptanceRunnerReadiness(
    {
      activeRoot: '/run/media/sergio/Data/vihs-vagrant',
      standbyRoot: '/run/media/sergio/Data1/vihs-vagrant',
      archiveRoot: '/run/media/sergio/MAJOR GENER/VI History Suite Evidence',
      vagrantHome: '/home/sergio/.vagrant.d',
      evidenceDir: overrides.evidenceDir,
      receiptRoot: overrides.receiptRoot
    },
    {
      runStorageDoctor: () => overrides.storageDoctor ?? createStorageDoctorReport(),
      runHostDoctor: () => overrides.hostDoctor ?? { status: 0, stdout: 'host ok\n', stderr: '' },
      now: () => new Date('2026-05-14T07:25:02.389Z'),
      hostname: 'vihs-runner'
    }
  );
}

describe('Vagrant acceptance runner readiness', () => {
  it('passes when storage and host doctors are healthy', () => {
    const report = runReadiness();

    expect(report.schema).toBe(readiness.SCHEMA);
    expect(report.status).toBe('passed');
    expect(report.healthy).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.nextAction).toContain('Runner ready');
  });

  it('fails with active storage next action when the active mount is missing', () => {
    const report = runReadiness({
      storageDoctor: createStorageDoctorReport({
        status: 'failed',
        healthy: false,
        activeHealthy: false,
        issues: ['active mount point is not mounted: /run/media/sergio/Data']
      })
    });

    expect(report.status).toBe('failed');
    expect(report.healthy).toBe(false);
    expect(report.issues).toContain('active mount point is not mounted: /run/media/sergio/Data');
    expect(report.nextAction).toContain('Mount /run/media/sergio/Data');
    expect(report.nextAction).toContain('/run/media/sergio/Data1/vihs-vagrant');
  });

  it('fails when the host doctor fails after healthy storage', () => {
    const report = runReadiness({
      hostDoctor: {
        status: 1,
        stdout: '',
        stderr: '[vagrant-host-doctor] ERROR: Golden VM not found\n'
      }
    });

    expect(report.status).toBe('failed');
    expect(report.storageDoctor.activeHealthy).toBe(true);
    expect(report.hostDoctor.healthy).toBe(false);
    expect(report.issues).toContain('Vagrant host doctor failed with exit code 1');
    expect(report.issues).toContain('ERROR: Golden VM not found');
    expect(report.nextAction).toContain('Repair the Vagrant/VirtualBox host doctor issues');
  });

  it('writes CI evidence and latest/timestamped host receipts', () => {
    const root = makeTempRoot();
    const evidenceDir = path.join(root, 'evidence');
    const receiptRoot = path.join(root, 'receipts');

    const report = runReadiness({ evidenceDir, receiptRoot });

    const evidenceJson = path.join(evidenceDir, 'vagrant-acceptance-runner-readiness.json');
    const evidenceMarkdown = path.join(evidenceDir, 'vagrant-acceptance-runner-readiness.md');
    const latestReceipt = path.join(receiptRoot, 'latest.json');
    const timestampedReceipt = path.join(receiptRoot, '2026-05-14T07-25-02-389Z.json');

    expect(report.receiptPaths).toEqual({
      latestReceiptPath: latestReceipt,
      timestampedReceiptPath: timestampedReceipt
    });
    expect(JSON.parse(fs.readFileSync(evidenceJson, 'utf8'))).toMatchObject({
      schema: readiness.SCHEMA,
      status: 'passed',
      activeRoot: '/run/media/sergio/Data/vihs-vagrant'
    });
    expect(fs.readFileSync(evidenceMarkdown, 'utf8')).toContain(
      '# Vagrant Acceptance Runner Readiness'
    );
    expect(JSON.parse(fs.readFileSync(latestReceipt, 'utf8'))).toMatchObject({
      latestReceiptPath: latestReceipt,
      timestampedReceiptPath: timestampedReceipt
    });
    expect(fs.existsSync(timestampedReceipt)).toBe(true);
  });

  it('defaults CI evidence and receipt roots from the environment', () => {
    const parsed = readiness.parseArgs([], {
      CI: 'true',
      VIHS_VAGRANT_READINESS_RECEIPT_ROOT: '/tmp/vihs-readiness'
    });

    expect(parsed.evidenceDir).toBe('vagrant-runner-readiness-evidence');
    expect(parsed.receiptRoot).toBe('/tmp/vihs-readiness');
    expect(readiness.getUsage()).toContain('vagrant-acceptance-runner-readiness@v1');
  });
});
