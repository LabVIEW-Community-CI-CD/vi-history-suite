import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'runWindowsProofRuntimeRecoveryRehearsal.js'
)) as {
  parseArgs: (argv: string[]) => {
    helpRequested: boolean;
    repoRoot: string;
    evidenceRoot: string;
    labviewVersion: string;
    labviewBitness: string;
    labviewExePath?: string;
  };
  buildRehearsalPlan: (
    options: {
      repoRoot: string;
      evidenceRoot: string;
      labviewVersion: string;
      labviewBitness: string;
      labviewExePath?: string;
    },
    deps?: {
      nowIso?: () => string;
    }
  ) => {
    generatedAt: string;
    evidenceRunDirectory: string;
    receiptPath: string;
    latestReceiptPath: string;
    recoveryTranscriptPath: string;
  };
  runRecoveryRehearsal: (
    plan: {
      repoRoot: string;
      evidenceRoot: string;
      labviewVersion: string;
      labviewBitness: string;
      labviewExePath?: string;
      generatedAt: string;
      evidenceRunDirectory: string;
      receiptPath: string;
      latestReceiptPath: string;
      recoveryTranscriptPath: string;
    },
    deps?: {
      platform?: string;
      fspImpl?: typeof fsp;
      inspectHostRuntimeSurface?: () => Promise<{
        capturedAt: string;
        processes: Array<{ processName: string; pid: number; path?: string }>;
        processNames: string[];
      }>;
      launchHeadlessLabview?: (labviewExePath: string) => Promise<number>;
      locateRuntime?: (
        platform: string,
        settings: Record<string, unknown>,
        locatorDeps: Record<string, unknown>
      ) => Promise<{
        provider: string;
        labviewExe?: { path?: string };
        notes?: string[];
      }>;
      runtimeLocatorDeps?: Record<string, unknown>;
      runProcessImpl?: (
        command: string,
        args: string[],
        options?: { cwd?: string }
      ) => { status: number; stdout: string; stderr: string; error?: Error };
      sleepImpl?: (milliseconds: number) => Promise<void>;
      seedTimeoutMs?: number;
      seedPollIntervalMs?: number;
    }
  ) => Promise<{
    schema: string;
    evidenceRoot: string;
    latestReceiptPath: string;
    requestedLabviewVersion: string;
    requestedLabviewBitness: string;
    resolvedLabviewExePath: string;
    contaminationSeed: {
      mode: string;
      launchArguments: string[];
      launchedProcessId: number;
    };
    recovery: {
      script: string;
      transcriptPath: string;
      status: string;
      attemptCount: number;
    };
    postRecoverySurface: {
      processes: Array<{ processName: string; pid: number }>;
    };
    status: string;
  }>;
};

describe('runWindowsProofRuntimeRecoveryRehearsal script', () => {
  it('builds a timestamped rehearsal evidence plan', () => {
    const parsed = script.parseArgs([]);
    const plan = script.buildRehearsalPlan(
      {
        repoRoot: parsed.repoRoot,
        evidenceRoot: parsed.evidenceRoot,
        labviewVersion: parsed.labviewVersion,
        labviewBitness: parsed.labviewBitness
      },
      {
        nowIso: () => '2026-04-19T21:15:16.170Z'
      }
    );

    expect(parsed.helpRequested).toBe(false);
    expect(parsed.labviewVersion).toBe('2026');
    expect(parsed.labviewBitness).toBe('x64');
    expect(plan.generatedAt).toBe('2026-04-19T21:15:16.170Z');
    expect(plan.evidenceRunDirectory.replaceAll('\\', '/')).toContain(
      '.cache/windows-proof-runtime-recovery-rehearsal/2026-04-19T21-15-16-170Z'
    );
    expect(plan.receiptPath.replaceAll('\\', '/')).toContain('/recovery-rehearsal.json');
    expect(plan.latestReceiptPath.replaceAll('\\', '/')).toContain(
      '.cache/windows-proof-runtime-recovery-rehearsal/latest.json'
    );
    expect(plan.recoveryTranscriptPath.replaceAll('\\', '/')).toContain(
      '/proof-runtime-recovery.txt'
    );
  });

  it('retains a governed rehearsal receipt after seeding contamination and recovering the host', async () => {
    const tempRoot = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'vihs-windows-proof-runtime-recovery-rehearsal-')
    );
    const evidenceRoot = path.join(tempRoot, '.cache', 'windows-proof-runtime-recovery-rehearsal');
    const recoveryScriptPath = path.join(
      tempRoot,
      'scripts',
      'gitlab-runner',
      'windows',
      'recover-windows-proof-runtime-surface.ps1'
    );
    const resolvedLabviewExePath = path.join(tempRoot, 'LabVIEW.exe');

    await fsp.mkdir(path.dirname(recoveryScriptPath), { recursive: true });
    await fsp.writeFile(recoveryScriptPath, "Write-Output '{\"status\":\"clean\"}'\n", 'utf8');
    await fsp.writeFile(resolvedLabviewExePath, '', 'utf8');

    const plan = script.buildRehearsalPlan(
      {
        repoRoot: tempRoot,
        evidenceRoot,
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      {
        nowIso: () => '2026-04-19T21:20:00.000Z'
      }
    );

    const inspectedSurfaces = [
      {
        capturedAt: '2026-04-19T21:20:01.000Z',
        processes: [],
        processNames: []
      },
      {
        capturedAt: '2026-04-19T21:20:02.000Z',
        processes: [
          {
            processName: 'LabVIEW',
            pid: 4242,
            path: resolvedLabviewExePath
          }
        ],
        processNames: ['LabVIEW']
      },
      {
        capturedAt: '2026-04-19T21:20:03.000Z',
        processes: [],
        processNames: []
      }
    ];
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const receipt = await script.runRecoveryRehearsal(plan, {
      platform: 'win32',
      fspImpl: fsp,
      inspectHostRuntimeSurface: async () => {
        const next = inspectedSurfaces.shift();
        if (!next) {
          throw new Error('unexpected extra inspection');
        }
        return next;
      },
      launchHeadlessLabview: async (candidatePath) => {
        expect(candidatePath).toBe(resolvedLabviewExePath);
        return 4242;
      },
      locateRuntime: async () => ({
        provider: 'host-native',
        labviewExe: {
          path: resolvedLabviewExePath
        },
        notes: []
      }),
      runProcessImpl: (command, args, options) => {
        calls.push({ command, args, cwd: options?.cwd });
        return {
          status: 0,
          stdout:
            '{\n  "status": "clean",\n  "attemptCount": 1,\n  "terminationStrategy": ["taskkill-image-tree"],\n  "remainingProcesses": []\n}\n',
          stderr: ''
        };
      },
      sleepImpl: async () => {
      }
    });

    expect(calls).toEqual([
      expect.objectContaining({
        command: 'powershell.exe',
        cwd: tempRoot,
        args: expect.arrayContaining([
          '-NoLogo',
          '-NoProfile',
          '-File',
          recoveryScriptPath
        ])
      })
    ]);
    expect(receipt.schema).toBe('vi-history-suite/windows-proof-runtime-recovery-rehearsal@v1');
    expect(receipt.evidenceRoot).toBe(
      '.cache/windows-proof-runtime-recovery-rehearsal/2026-04-19T21-20-00-000Z'
    );
    expect(receipt.latestReceiptPath).toBe('.cache/windows-proof-runtime-recovery-rehearsal/latest.json');
    expect(receipt.requestedLabviewVersion).toBe('2026');
    expect(receipt.requestedLabviewBitness).toBe('x64');
    expect(receipt.resolvedLabviewExePath).toBe(resolvedLabviewExePath);
    expect(receipt.contaminationSeed).toEqual({
      mode: 'headless-labview-launch',
      launchArguments: ['--headless'],
      launchedProcessId: 4242
    });
    expect(receipt.recovery).toEqual(
      expect.objectContaining({
        script: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
        transcriptPath:
          '.cache/windows-proof-runtime-recovery-rehearsal/2026-04-19T21-20-00-000Z/proof-runtime-recovery.txt',
        status: 'clean',
        attemptCount: 1
      })
    );
    expect(receipt.postRecoverySurface.processes).toEqual([]);
    expect(receipt.status).toBe('recovered');

    await expect(fsp.readFile(plan.receiptPath, 'utf8')).resolves.toContain(
      '"status": "recovered"'
    );
    await expect(fsp.readFile(plan.latestReceiptPath, 'utf8')).resolves.toContain(
      '"latestReceiptPath": ".cache/windows-proof-runtime-recovery-rehearsal/latest.json"'
    );
    await expect(fsp.readFile(plan.recoveryTranscriptPath, 'utf8')).resolves.toContain(
      '"attemptCount": 1'
    );
  });

  it('fails closed when the host is already contaminated before the rehearsal begins', async () => {
    const tempRoot = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'vihs-windows-proof-runtime-recovery-dirty-')
    );
    const plan = script.buildRehearsalPlan(
      {
        repoRoot: tempRoot,
        evidenceRoot: path.join(tempRoot, '.cache', 'windows-proof-runtime-recovery-rehearsal'),
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      {
        nowIso: () => '2026-04-19T21:30:00.000Z'
      }
    );

    await expect(
      script.runRecoveryRehearsal(plan, {
        platform: 'win32',
        fspImpl: fsp,
        inspectHostRuntimeSurface: async () => ({
          capturedAt: '2026-04-19T21:30:01.000Z',
          processes: [
            {
              processName: 'LabVIEW',
              pid: 5151
            }
          ],
          processNames: ['LabVIEW']
        }),
        locateRuntime: async () => ({
          provider: 'host-native',
          labviewExe: {
            path: path.join(tempRoot, 'LabVIEW.exe')
          }
        }),
        launchHeadlessLabview: async () => 5151,
        runProcessImpl: () => ({
          status: 0,
          stdout: '{"status":"clean","attemptCount":0,"remainingProcesses":[]}\n',
          stderr: ''
        }),
        sleepImpl: async () => {
        }
      })
    ).rejects.toThrow(
      'Windows proof runtime recovery rehearsal requires a clean host runtime surface before seeding contamination.'
    );

    expect(fs.existsSync(plan.receiptPath)).toBe(false);
    expect(fs.existsSync(plan.latestReceiptPath)).toBe(false);
  });
});
