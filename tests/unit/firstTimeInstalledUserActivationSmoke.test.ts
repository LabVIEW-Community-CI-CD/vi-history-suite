import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const tempRoots = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const smoke = require(path.join(
  repoRoot,
  'scripts',
  'runFirstTimeInstalledUserActivationSmoke.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  buildIsolatedRoots: (evidenceDir: string, extensionId?: string) => Record<string, string>;
  buildReport: (input: Record<string, unknown>) => Record<string, any>;
  buildSmokeRunnerSource: () => string;
  evaluateSmokeResult: (
    runnerSummary: Record<string, any>,
    processSnapshots: Record<string, any>
  ) => Record<string, any>;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  parseKeyValueOutput: (text: string) => Record<string, string>;
  runFirstTimeInstalledUserActivationSmoke: (
    argv?: string[],
    deps?: Record<string, unknown>
  ) => Promise<{ outcome: string; report: Record<string, any> } | string>;
  waitForRunnerSummary: (
    runnerOutputPath: string,
    options?: { timeoutMs?: number; pollMs?: number }
  ) => Promise<Record<string, any>>;
};

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.add(root);
  return root;
}

function buildPassingRunnerSummary(): Record<string, any> {
  return {
    status: 'passed',
    finishedAt: '2026-05-15T10:00:00.000Z',
    checks: {
      startupSelectionQuiet: true,
      documentationOnly: true,
      prepareCliFirstFlowConfirmed: true,
      explicitCompareBoundaryConfirmed: true
    },
    vihs: {
      update: {
        facts: {
          settingsTarget: 'explicit-settings-file',
          settingsFilePath: 'C:\\isolated\\User\\settings.json',
          'viHistorySuite.runtimeProvider': 'host',
          'viHistorySuite.labviewVersion': '2026',
          'viHistorySuite.labviewBitness': 'x64'
        }
      },
      validate: {
        facts: {
          settingsTarget: 'explicit-settings-file',
          settingsFilePath: 'C:\\isolated\\User\\settings.json',
          runtimeValidationOutcome: 'ready'
        }
      }
    }
  };
}

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  tempRoots.clear();
});

describe('first-time installed-user activation smoke', () => {
  it('exposes deterministic CLI defaults and parsing helpers', () => {
    expect(smoke.parseArgs([])).toEqual({
      helpRequested: false,
      evidenceDir: smoke.DEFAULT_EVIDENCE_DIR,
      codeCommand: 'code',
      extensionId: 'svelderrainruiz.vi-history-suite',
      vsixPath: null,
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });

    const roots = smoke.buildIsolatedRoots(path.join('C:', 'evidence'));
    expect(roots.userDataDir).toBe(path.join('C:', 'evidence', 'isolated-vscode', 'user-data'));
    expect(roots.extensionsRoot).toBe(
      path.join('C:', 'evidence', 'isolated-vscode', 'extensions')
    );

    expect(
      smoke.parseKeyValueOutput(
        [
          'settingsTarget=default-user-settings',
          'viHistorySuite.runtimeProvider=host',
          'runtimeValidationOutcome=ready'
        ].join('\n')
      )
    ).toEqual({
      settingsTarget: 'default-user-settings',
      'viHistorySuite.runtimeProvider': 'host',
      runtimeValidationOutcome: 'ready'
    });

    const runnerSource = smoke.buildSmokeRunnerSource();
    expect(runnerSource).toContain('summary.extension.isActiveBeforeCommands === false');
    expect(runnerSource).toContain('data-testid="history-action-compare-selected"');
    expect(runnerSource).toContain('VIHS_FIRST_TIME_SMOKE_SETTINGS_FILE');
    expect(runnerSource).toContain('--settings-file');
  });

  it('evaluates quiet activation and process deltas fail-closed', () => {
    const passing = smoke.evaluateSmokeResult(buildPassingRunnerSummary(), {
      before: { counts: { 'labview.exe': 1, 'labviewcli.exe': 0 } },
      after: { counts: { 'labview.exe': 1, 'labviewcli.exe': 0 } }
    });
    expect(passing.status).toBe('passed');
    expect(passing.assertions).toMatchObject({
      startupSelectionQuiet: true,
      documentationOnly: true,
      prepareCliFirstFlowConfirmed: true,
      explicitCompareBoundaryConfirmed: true,
      noLabviewLaunchDuringSmoke: true
    });

    const failing = smoke.evaluateSmokeResult(buildPassingRunnerSummary(), {
      before: { counts: { 'labview.exe': 0, 'labviewcli.exe': 0 } },
      after: { counts: { 'labview.exe': 0, 'labviewcli.exe': 1 } }
    });
    expect(failing.status).toBe('failed');
    expect(failing.assertions.noLabviewLaunchDuringSmoke).toBe(false);
  });

  it('waits for the VS Code runner to finish writing its retained summary', async () => {
    const tempRoot = makeTempRoot('vihs-first-time-smoke-wait-');
    const runnerOutputPath = path.join(tempRoot, 'runner-summary.json');

    fs.writeFileSync(runnerOutputPath, '{"status":"passed"}', 'utf8');
    setTimeout(() => {
      fs.writeFileSync(
        runnerOutputPath,
        `${JSON.stringify({ status: 'passed', finishedAt: '2026-05-15T10:00:00.000Z' })}\n`,
        'utf8'
      );
    }, 25);

    await expect(
      smoke.waitForRunnerSummary(runnerOutputPath, { timeoutMs: 1000, pollMs: 10 })
    ).resolves.toMatchObject({
      status: 'passed',
      finishedAt: '2026-05-15T10:00:00.000Z'
    });
  });

  it('retains a receipt when the installed VSIX smoke passes under isolated roots', async () => {
    const tempRoot = makeTempRoot('vihs-first-time-smoke-');
    const evidenceDir = path.join(tempRoot, 'evidence');
    const vsixPath = path.join(tempRoot, 'vi-history-suite-1.3.16.vsix');
    fs.writeFileSync(vsixPath, 'first-time-smoke-vsix', 'utf8');

    const result = await smoke.runFirstTimeInstalledUserActivationSmoke(
      ['--evidence-dir', evidenceDir, '--vsix-path', vsixPath],
      {
        platform: 'win32',
        now: () => new Date('2026-05-15T10:00:00.000Z'),
        runnerSummaryPollMs: 10,
        runnerSummaryTimeoutMs: 1000,
        stdout: { write: () => undefined },
        spawnSync: (command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
          if (command === 'where.exe' && args.join(' ') === 'code') {
            return {
              status: 0,
              stdout: 'C:\\Users\\sveld\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe\r\nC:\\Users\\sveld\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd\r\n',
              stderr: ''
            };
          }
          if (command === 'git') {
            return { status: 0, stdout: '', stderr: '' };
          }
          if (command === 'tasklist.exe') {
            return {
              status: 0,
              stdout: '"Image Name","PID","Session Name","Session#","Mem Usage"\r\n',
              stderr: ''
            };
          }
          if (command.toLowerCase().endsWith('cmd.exe') && args.join(' ').includes('--install-extension')) {
            return { status: 0, stdout: 'installed\n', stderr: '' };
          }
          if (
            command.toLowerCase().endsWith('cmd.exe') &&
            args.join(' ').includes('--extensionTestsPath=')
          ) {
            const outputPath = options.env?.VIHS_FIRST_TIME_SMOKE_OUTPUT;
            if (!outputPath) {
              throw new Error('missing runner output env');
            }
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(
              outputPath,
              `${JSON.stringify(buildPassingRunnerSummary(), null, 2)}\n`,
              'utf8'
            );
            return { status: 0, stdout: 'smoke passed\n', stderr: '' };
          }

          throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
        }
      }
    );

    expect(result).toMatchObject({
      outcome: 'passed',
      report: {
        status: 'passed',
        workItem: {
          iid: 2
        },
        productionMutationAttempted: false,
        assertions: {
          startupSelectionQuiet: true,
          documentationOnly: true,
          prepareCliFirstFlowConfirmed: true,
          explicitCompareBoundaryConfirmed: true,
          noLabviewLaunchDuringSmoke: true
        },
        isolation: {
          settingsFilePath: path
            .relative(
              repoRoot,
              path.join(evidenceDir, 'isolated-vscode', 'user-data', 'User', 'settings.json')
            )
            .replaceAll(path.sep, '/')
        }
      }
    });

    const receiptPath = path.join(
      evidenceDir,
      'first-time-installed-user-activation-smoke.json'
    );
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(receipt.receiptPaths).toEqual({
      json: path.relative(repoRoot, receiptPath).replaceAll(path.sep, '/'),
      markdown: path
        .relative(
          repoRoot,
          path.join(evidenceDir, 'first-time-installed-user-activation-smoke.md')
        )
        .replaceAll(path.sep, '/')
    });
    expect(receipt.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'install-vsix', status: 'passed' }),
        expect.objectContaining({ id: 'run-vscode-smoke', status: 'passed' })
      ])
    );
  });
});
