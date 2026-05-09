import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const assertion = require(path.join(
  repoRoot,
  'scripts',
  'assertVagrantVsixAcceptanceEvidence.js'
)) as {
  BASE_HASH: string;
  COLD_START_MARKERS: string[];
  HARNESS_ID: string;
  SCHEMA: string;
  SELECTED_HASH: string;
  assertVagrantVsixAcceptanceEvidence: (
    options: {
      evidenceRoot?: string;
      manifestPath?: string;
      acceptanceLogPath?: string;
    },
    deps?: { now?: () => Date }
  ) => {
    status: string;
    manifestPath: string;
    facts: {
      runtimeProvider: string;
      runtimeEngine: string;
      runtimeBitness: string;
      runtimeExecutionState: string;
      generatedReportExists: boolean;
    };
  };
  getVagrantVsixAcceptanceEvidenceUsage: () => string;
  parseVagrantVsixAcceptanceEvidenceArgs: (argv: string[]) => {
    helpRequested: boolean;
    evidenceRoot: string;
    manifestPath?: string;
    acceptanceLogPath?: string;
    receiptDir: string;
  };
  resolveLatestVagrantManifestPath: (evidenceRoot: string) => string;
  runVagrantVsixAcceptanceEvidenceAssertion: (
    argv: string[],
    deps?: { stdout?: { write: (text: string) => void }; now?: () => Date }
  ) => string;
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-assert-'));
  tempRoots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown, withBom = false): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${withBom ? '\uFEFF' : ''}${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function createEvidenceRun(options: {
  runId?: string;
  proofExitCode?: number;
  runtimeExecutionState?: string;
  generatedReportExists?: boolean;
  includeHtml?: boolean;
  acceptanceLogText?: string;
} = {}): {
  evidenceRoot: string;
  manifestPath: string;
  acceptanceLogPath: string;
  receiptDir: string;
} {
  const evidenceRoot = createTempRoot();
  const runId = options.runId ?? '20260507-184132';
  const runRoot = path.join(evidenceRoot, runId);
  const manifestPath = path.join(runRoot, 'manifest.json');
  const acceptanceLogPath = path.join(evidenceRoot, 'acceptance-provision.log');
  const receiptDir = path.join(evidenceRoot, 'assertion');
  const runtimeExecutionState = options.runtimeExecutionState ?? 'succeeded';
  const generatedReportExists = options.generatedReportExists ?? true;

  writeJson(
    manifestPath,
    {
      schema: assertion.SCHEMA,
      generatedAt: '2026-05-07T18:42:03.9345527-07:00',
      harnessId: assertion.HARNESS_ID,
      selectedHash: assertion.SELECTED_HASH,
      baseHash: assertion.BASE_HASH,
      labviewVersion: '2026',
      labviewBitness: 'x86',
      proofExitCode: options.proofExitCode ?? 0,
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState,
      evidenceRoot: `C:\\vihs-evidence\\${runId}`
    },
    true
  );
  writeJson(path.join(runRoot, 'harness-report', 'comparison-report-smoke.json'), {
    generatedAt: '2026-05-08T01:42:01.362Z',
    harnessId: assertion.HARNESS_ID,
    selectedHash: assertion.SELECTED_HASH,
    baseHash: assertion.BASE_HASH,
    reportStatus: 'ready-for-runtime',
    runtimeExecutionState,
    runtimeProvider: 'host-native',
    runtimeEngine: 'labview-cli',
    runtimeBitness: 'x86',
    generatedReportExists
  });

  if (options.includeHtml !== false) {
    writeText(path.join(runRoot, 'harness-report', 'comparison-report-smoke.html'), '<html>ok</html>');
  }

  writeText(
    acceptanceLogPath,
    options.acceptanceLogText ??
      [
        'LabVIEW not running. Launching via scheduled task...',
        'LabVIEW VI Server ready on port 3363.'
      ].join('\n')
  );

  return { evidenceRoot, manifestPath, acceptanceLogPath, receiptDir };
}

describe('Vagrant VSIX acceptance evidence assertion', () => {
  it('parses arguments and documents the receipt options', () => {
    const parsed = assertion.parseVagrantVsixAcceptanceEvidenceArgs([
      '--evidence-root',
      'vagrant/evidence',
      '--manifest',
      'vagrant/evidence/20260507-184132/manifest.json',
      '--acceptance-log',
      'vagrant/evidence/acceptance-provision.log',
      '--receipt-dir',
      'vagrant/evidence/assertion'
    ]);

    expect(parsed.helpRequested).toBe(false);
    expect(parsed.evidenceRoot).toBe(path.resolve('vagrant/evidence'));
    expect(parsed.manifestPath).toBe(
      path.resolve('vagrant/evidence/20260507-184132/manifest.json')
    );
    expect(parsed.acceptanceLogPath).toBe(path.resolve('vagrant/evidence/acceptance-provision.log'));
    expect(parsed.receiptDir).toBe(path.resolve('vagrant/evidence/assertion'));
    expect(assertion.getVagrantVsixAcceptanceEvidenceUsage()).toContain('--receipt-dir');
  });

  it('selects the latest timestamped run and validates BOM-safe evidence', () => {
    const older = createEvidenceRun({ runId: '20260506-100922' });
    const newerRunRoot = path.join(older.evidenceRoot, '20260507-184132');
    fs.mkdirSync(newerRunRoot, { recursive: true });
    fs.cpSync(path.dirname(older.manifestPath), newerRunRoot, { recursive: true, force: true });

    const latestManifest = assertion.resolveLatestVagrantManifestPath(older.evidenceRoot);
    const report = assertion.assertVagrantVsixAcceptanceEvidence(
      {
        evidenceRoot: older.evidenceRoot,
        acceptanceLogPath: older.acceptanceLogPath
      },
      { now: () => new Date('2026-05-08T00:00:00.000Z') }
    );

    expect(latestManifest).toBe(path.join(older.evidenceRoot, '20260507-184132', 'manifest.json'));
    expect(report.status).toBe('passed');
    expect(report.manifestPath).toBe(latestManifest);
    expect(report.facts).toMatchObject({
      runtimeProvider: 'host-native',
      runtimeEngine: 'labview-cli',
      runtimeBitness: 'x86',
      runtimeExecutionState: 'succeeded',
      generatedReportExists: true
    });
  });

  it('writes a retained assertion receipt from the CLI wrapper', () => {
    const evidence = createEvidenceRun();
    const stdout: string[] = [];

    expect(
      assertion.runVagrantVsixAcceptanceEvidenceAssertion(
        [
          '--evidence-root',
          evidence.evidenceRoot,
          '--acceptance-log',
          evidence.acceptanceLogPath,
          '--receipt-dir',
          evidence.receiptDir
        ],
        {
          stdout: { write: (text: string) => stdout.push(text) },
          now: () => new Date('2026-05-08T00:00:00.000Z')
        }
      )
    ).toBe('pass');

    const receiptPath = path.join(evidence.receiptDir, 'vagrant-vsix-acceptance-assertion.json');
    expect(stdout.join('')).toContain('Evidence assertion passed');
    expect(JSON.parse(fs.readFileSync(receiptPath, 'utf8'))).toMatchObject({
      status: 'passed',
      facts: {
        harnessId: assertion.HARNESS_ID,
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        runtimeBitness: 'x86'
      }
    });
  });

  it('fails closed when the manifest proof did not succeed', () => {
    const evidence = createEvidenceRun({ runtimeExecutionState: 'failed' });

    expect(() =>
      assertion.assertVagrantVsixAcceptanceEvidence({
        evidenceRoot: evidence.evidenceRoot,
        acceptanceLogPath: evidence.acceptanceLogPath
      })
    ).toThrow('Expected manifest.runtimeExecutionState=succeeded, found failed');
  });

  it('fails closed when generated report evidence is missing', () => {
    const evidence = createEvidenceRun({ generatedReportExists: false });

    expect(() =>
      assertion.assertVagrantVsixAcceptanceEvidence({
        evidenceRoot: evidence.evidenceRoot,
        acceptanceLogPath: evidence.acceptanceLogPath
      })
    ).toThrow('Expected harnessReport.generatedReportExists=true, found false');
  });

  it('fails closed when the generated HTML report is empty or absent', () => {
    const evidence = createEvidenceRun({ includeHtml: false });

    expect(() =>
      assertion.assertVagrantVsixAcceptanceEvidence({
        evidenceRoot: evidence.evidenceRoot,
        acceptanceLogPath: evidence.acceptanceLogPath
      })
    ).toThrow('Missing Vagrant generated comparison report HTML');
  });

  it('fails closed when cold-start markers are missing', () => {
    const evidence = createEvidenceRun({ acceptanceLogText: 'LabVIEW already running.' });

    expect(() =>
      assertion.assertVagrantVsixAcceptanceEvidence({
        evidenceRoot: evidence.evidenceRoot,
        acceptanceLogPath: evidence.acceptanceLogPath
      })
    ).toThrow('Missing Vagrant cold-start marker');
  });
});
