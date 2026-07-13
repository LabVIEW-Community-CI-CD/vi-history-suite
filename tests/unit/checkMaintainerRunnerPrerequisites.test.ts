import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const doctor = require('../../scripts/checkMaintainerRunnerPrerequisites.js') as {
  DEFAULT_WINDOWS_LOCAL_APP_DATA: string;
  SUPPORTED_PLATFORMS: readonly string[];
  buildPrerequisiteContract: (
    platform: string,
    env?: Record<string, string | undefined>
  ) => Array<{
    id: string;
    label: string;
    required: boolean;
    candidatePaths: string[];
    commandNames: string[];
    remediation: string;
  }>;
  resolveCommandOnPath: (
    commandName: string,
    platform: string,
    deps?: { existsSync?: (p: string) => boolean; env?: Record<string, string | undefined> }
  ) => string | undefined;
  inspectPrerequisite: (
    prerequisite: { id: string; candidatePaths: string[]; commandNames: string[]; required: boolean },
    platform: string,
    deps?: { existsSync?: (p: string) => boolean; env?: Record<string, string | undefined> }
  ) => { id: string; satisfied: boolean; detectedPath?: string; detectedVia?: string };
  inspectMaintainerRunnerPrerequisites: (
    platform?: string,
    deps?: { existsSync?: (p: string) => boolean; env?: Record<string, string | undefined> }
  ) => {
    platform: string;
    checks: Array<{ id: string; satisfied: boolean; required: boolean; detectedPath?: string }>;
    missingRequired: string[];
    satisfied: boolean;
  };
  formatPrerequisiteReport: (report: unknown) => string;
  DEFAULT_CLOCK_SKEW_THRESHOLD_MS: number;
  CLOCK_SKEW_TIME_SOURCE_URL: string;
  classifyClockSkew: (input: {
    localNowMs: number;
    authoritativeNowMs?: number;
    thresholdMs?: number;
  }) => { status: string; skewMs?: number; thresholdMs: number; authoritativeNowMs?: number };
  fetchAuthoritativeNowMsViaGithub: (deps?: {
    https?: unknown;
    timeSourceUrl?: string;
    requestTimeoutMs?: number;
  }) => Promise<number | undefined>;
  inspectClockSkew: (deps?: {
    now?: () => number;
    fetchAuthoritativeNowMs?: (deps?: unknown) => Promise<number | undefined>;
    clockSkewThresholdMs?: number;
  }) => Promise<{ status: string; skewMs?: number; thresholdMs: number }>;
  formatClockSkewReport: (skew: {
    status: string;
    skewMs?: number;
    thresholdMs: number;
  }) => string;
  getUsage: () => string;
  parseArgs: (argv: string[]) => { platform?: string; help: boolean; failOnClockSkew: boolean };
  main: (
    argv?: string[],
    deps?: {
      existsSync?: (p: string) => boolean;
      env?: Record<string, string | undefined>;
      platform?: string;
      now?: () => number;
      fetchAuthoritativeNowMs?: (deps?: unknown) => Promise<number | undefined>;
      clockSkewThresholdMs?: number;
      stdout?: { write: (chunk: string) => void };
      stderr?: { write: (chunk: string) => void };
    }
  ) => Promise<number>;
};

function createWritable(): { stream: { write: (chunk: string) => void }; text: () => string } {
  let buffer = '';
  return {
    stream: { write: (chunk: string) => { buffer += chunk; } },
    text: () => buffer
  };
}

const WINDOWS_VSCODE_SYSTEM_PATH = 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd';
const WINDOWS_LABVIEW_X64 = 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_LABVIEW_CLI_X86 =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';

describe('checkMaintainerRunnerPrerequisites.buildPrerequisiteContract', () => {
  it('lists the Windows host contract including system + user-scoped VS Code paths', () => {
    const contract = doctor.buildPrerequisiteContract('win32', {
      LOCALAPPDATA: 'C:\\Users\\runner\\AppData\\Local'
    });
    const ids = contract.map((entry) => entry.id);
    expect(ids).toEqual(['node', 'npm', 'git', 'vscode', 'labview', 'labview-cli']);

    const vscode = contract.find((entry) => entry.id === 'vscode');
    expect(vscode?.candidatePaths).toContain(WINDOWS_VSCODE_SYSTEM_PATH);
    expect(vscode?.candidatePaths).toContain(
      'C:\\Users\\runner\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
    );
    expect(vscode?.required).toBe(true);
    // The remediation must call out the service-account / system-wide nuance.
    expect(vscode?.remediation).toMatch(/system-wide/i);
    expect(vscode?.remediation).toMatch(/service account/i);
  });

  it('falls back to the default LOCALAPPDATA when the env var is absent', () => {
    const contract = doctor.buildPrerequisiteContract('win32', {});
    const vscode = contract.find((entry) => entry.id === 'vscode');
    expect(vscode?.candidatePaths).toContain(
      `${doctor.DEFAULT_WINDOWS_LOCAL_APP_DATA}\\Programs\\Microsoft VS Code\\bin\\code.cmd`
    );
  });

  it('lists the Linux host contract with the documented code + LabVIEW paths', () => {
    const contract = doctor.buildPrerequisiteContract('linux', {});
    const ids = contract.map((entry) => entry.id);
    expect(ids).toEqual(['node', 'npm', 'git', 'vscode', 'labview', 'labview-cli']);

    const vscode = contract.find((entry) => entry.id === 'vscode');
    expect(vscode?.candidatePaths).toEqual(['/usr/bin/code', '/usr/share/code/bin/code', '/snap/bin/code']);

    const labview = contract.find((entry) => entry.id === 'labview');
    expect(labview?.candidatePaths).toContain('/usr/local/natinst/LabVIEW-2026-64/labview');
  });

  it('throws on an unsupported platform', () => {
    expect(() => doctor.buildPrerequisiteContract('darwin', {})).toThrow(/Unsupported maintainer runner platform/);
  });
});

describe('checkMaintainerRunnerPrerequisites.resolveCommandOnPath', () => {
  it('resolves a Windows command via PATHEXT when no extension is given', () => {
    const env = { PATH: 'C:\\tools\\bin;C:\\other', PATHEXT: '.EXE;.CMD' };
    const present = new Set(['C:\\tools\\bin\\git.EXE']);
    const resolved = doctor.resolveCommandOnPath('git', 'win32', {
      env,
      existsSync: (candidate) => present.has(candidate)
    });
    expect(resolved).toBe('C:\\tools\\bin\\git.EXE');
  });

  it('resolves a Linux command directly on PATH', () => {
    const env = { PATH: '/usr/bin:/usr/local/bin' };
    const resolved = doctor.resolveCommandOnPath('node', 'linux', {
      env,
      existsSync: (candidate) => candidate === '/usr/local/bin/node'
    });
    expect(resolved).toBe('/usr/local/bin/node');
  });

  it('returns undefined when the command is not on PATH', () => {
    const resolved = doctor.resolveCommandOnPath('code', 'win32', {
      env: { PATH: 'C:\\tools', PATHEXT: '.CMD' },
      existsSync: () => false
    });
    expect(resolved).toBeUndefined();
  });
});

describe('checkMaintainerRunnerPrerequisites.inspectPrerequisite', () => {
  const prerequisite = {
    id: 'vscode',
    required: true,
    candidatePaths: [WINDOWS_VSCODE_SYSTEM_PATH],
    commandNames: ['code.cmd', 'code']
  };

  it('marks a prerequisite satisfied when an absolute candidate path exists', () => {
    const result = doctor.inspectPrerequisite(prerequisite, 'win32', {
      existsSync: (candidate) => candidate === WINDOWS_VSCODE_SYSTEM_PATH,
      env: {}
    });
    expect(result.satisfied).toBe(true);
    expect(result.detectedPath).toBe(WINDOWS_VSCODE_SYSTEM_PATH);
    expect(result.detectedVia).toBe('path');
  });

  it('falls back to a PATH command when no absolute candidate exists', () => {
    const result = doctor.inspectPrerequisite(prerequisite, 'win32', {
      env: { PATH: 'C:\\vscode\\bin', PATHEXT: '.CMD' },
      existsSync: (candidate) => candidate === 'C:\\vscode\\bin\\code.cmd'
    });
    expect(result.satisfied).toBe(true);
    expect(result.detectedVia).toBe('command');
  });

  it('marks a prerequisite missing when neither a path nor a command resolves', () => {
    const result = doctor.inspectPrerequisite(prerequisite, 'win32', {
      env: { PATH: '', PATHEXT: '.CMD' },
      existsSync: () => false
    });
    expect(result.satisfied).toBe(false);
    expect(result.detectedPath).toBeUndefined();
  });
});

describe('checkMaintainerRunnerPrerequisites.inspectMaintainerRunnerPrerequisites', () => {
  it('reports satisfied when every required prerequisite resolves', () => {
    const present = new Set([
      WINDOWS_VSCODE_SYSTEM_PATH,
      WINDOWS_LABVIEW_X64,
      WINDOWS_LABVIEW_CLI_X86,
      'C:\\tools\\node.exe',
      'C:\\tools\\npm.cmd',
      'C:\\tools\\git.exe'
    ].map((entry) => entry.toLowerCase()));
    const report = doctor.inspectMaintainerRunnerPrerequisites('win32', {
      env: { PATH: 'C:\\tools', PATHEXT: '.EXE;.CMD' },
      existsSync: (candidate) => present.has(candidate.toLowerCase())
    });
    expect(report.satisfied).toBe(true);
    expect(report.missingRequired).toEqual([]);
  });

  it('reproduces run 27477253718: LabVIEW present but VS Code missing fails the gate', () => {
    // Mirrors the real maintainer-runner evidence: LabVIEW 2026 + LabVIEW CLI
    // present, both VS Code candidate paths missing, and no code on PATH.
    const present = new Set([
      WINDOWS_LABVIEW_X64,
      WINDOWS_LABVIEW_CLI_X86,
      'C:\\tools\\node.exe',
      'C:\\tools\\npm.cmd',
      'C:\\tools\\git.exe'
    ].map((entry) => entry.toLowerCase()));
    const report = doctor.inspectMaintainerRunnerPrerequisites('win32', {
      env: { PATH: 'C:\\tools', PATHEXT: '.EXE;.CMD' },
      existsSync: (candidate) => present.has(candidate.toLowerCase())
    });
    expect(report.satisfied).toBe(false);
    expect(report.missingRequired).toEqual(['vscode']);
    const labview = report.checks.find((check) => check.id === 'labview');
    expect(labview?.satisfied).toBe(true);
  });

  it('surfaces every missing prerequisite at once rather than only the first (VHS-REQ-598.7, VHS-REQ-652.7)', () => {
    const report = doctor.inspectMaintainerRunnerPrerequisites('linux', {
      env: { PATH: '' },
      existsSync: () => false
    });
    expect(report.satisfied).toBe(false);
    expect(report.missingRequired).toEqual(['node', 'npm', 'git', 'vscode', 'labview', 'labview-cli']);
  });
});

describe('checkMaintainerRunnerPrerequisites.formatPrerequisiteReport', () => {
  it('includes actionable remediation for each missing prerequisite (VHS-REQ-652.7)', () => {
    const report = doctor.inspectMaintainerRunnerPrerequisites('win32', {
      env: { PATH: '', PATHEXT: '.CMD' },
      existsSync: () => false
    });
    const text = doctor.formatPrerequisiteReport(report);
    expect(text).toContain('MISSING VS Code (integration host)');
    expect(text).toMatch(/remediation:/);
    expect(text).toContain('required prerequisite(s) missing');
  });
});

describe('checkMaintainerRunnerPrerequisites.main', () => {
  it('exits non-zero and prints the report when prerequisites are missing (VHS-REQ-652.7)', async () => {
    const stdout = createWritable();
    const code = await doctor.main([], {
      platform: 'linux',
      env: { PATH: '' },
      existsSync: () => false,
      // Deterministic, no-network clock-skew source for the unit run.
      fetchAuthoritativeNowMs: async () => undefined,
      stdout: stdout.stream
    });
    expect(code).toBe(1);
    expect(stdout.text()).toContain('[runner-doctor]');
  });

  it('exits zero when all required prerequisites are satisfied and the clock is within tolerance', async () => {
    const stdout = createWritable();
    const present = new Set([
      '/usr/bin/code',
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/bin/labviewcli',
      '/usr/bin/node',
      '/usr/bin/npm',
      '/usr/bin/git'
    ]);
    const code = await doctor.main([], {
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      existsSync: (candidate) => present.has(candidate),
      now: () => 1_000_000,
      fetchAuthoritativeNowMs: async () => 1_000_000,
      stdout: stdout.stream
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('All required prerequisites satisfied');
    // The advisory clock-skew line is always surfaced.
    expect(stdout.text()).toContain('System clock skew: 0.0s');
  });

  it('keeps a known clock skew advisory by default (exit code unaffected) (VHS-REQ-598.7, VHS-REQ-652.7)', async () => {
    const stdout = createWritable();
    const present = new Set([
      '/usr/bin/code',
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/bin/labviewcli',
      '/usr/bin/node',
      '/usr/bin/npm',
      '/usr/bin/git'
    ]);
    const code = await doctor.main([], {
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      existsSync: (candidate) => present.has(candidate),
      now: () => 1_000_000,
      // 2h behind authoritative time, like the dual-boot trap in #527.
      fetchAuthoritativeNowMs: async () => 1_000_000 + 7_200_000,
      stdout: stdout.stream
    });
    // Advisory by default: a skewed clock alone does not fail the doctor.
    expect(code).toBe(0);
    expect(stdout.text()).toContain('exceeds the 60s tolerance');
    expect(stdout.text()).toContain('registration has been deleted');
  });

  it('fails on a known over-tolerance skew only with --fail-on-clock-skew (VHS-REQ-652.7)', async () => {
    const stdout = createWritable();
    const present = new Set([
      '/usr/bin/code',
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/bin/labviewcli',
      '/usr/bin/node',
      '/usr/bin/npm',
      '/usr/bin/git'
    ]);
    const code = await doctor.main(['--fail-on-clock-skew'], {
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      existsSync: (candidate) => present.has(candidate),
      now: () => 1_000_000,
      fetchAuthoritativeNowMs: async () => 1_000_000 + 7_200_000,
      stdout: stdout.stream
    });
    expect(code).toBe(1);
    expect(stdout.text()).toContain('exceeds the 60s tolerance');
  });

  it('never fails on an unreachable time source even with --fail-on-clock-skew (VHS-REQ-652.7)', async () => {
    const stdout = createWritable();
    const present = new Set([
      '/usr/bin/code',
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/bin/labviewcli',
      '/usr/bin/node',
      '/usr/bin/npm',
      '/usr/bin/git'
    ]);
    const code = await doctor.main(['--fail-on-clock-skew'], {
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      existsSync: (candidate) => present.has(candidate),
      fetchAuthoritativeNowMs: async () => undefined,
      stdout: stdout.stream
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('authoritative time source unreachable');
  });

  it('prints usage for --help and rejects unknown args (VHS-REQ-652.7)', async () => {
    const stdout = createWritable();
    expect(await doctor.main(['--help'], { stdout: stdout.stream })).toBe(0);
    expect(stdout.text()).toContain('Usage: node scripts/checkMaintainerRunnerPrerequisites.js');

    const stderr = createWritable();
    expect(await doctor.main(['--bogus'], { stderr: stderr.stream })).toBe(1);
    expect(stderr.text()).toContain('Unknown argument: --bogus');
  });
});

describe('checkMaintainerRunnerPrerequisites clock-skew preflight (#527)', () => {
  it('classifies skew within tolerance as ok', () => {
    const skew = doctor.classifyClockSkew({
      localNowMs: 1_000_000,
      authoritativeNowMs: 1_030_000,
      thresholdMs: 60_000
    });
    expect(skew.status).toBe('ok');
    expect(skew.skewMs).toBe(-30_000);
  });

  it('classifies skew over tolerance as skewed', () => {
    const skew = doctor.classifyClockSkew({
      localNowMs: 1_000_000,
      authoritativeNowMs: 1_000_000 - 120_000,
      thresholdMs: 60_000
    });
    expect(skew.status).toBe('skewed');
    expect(skew.skewMs).toBe(120_000);
  });

  it('classifies a missing authoritative time as unknown (advisory)', () => {
    const skew = doctor.classifyClockSkew({ localNowMs: 1_000_000, thresholdMs: 60_000 });
    expect(skew.status).toBe('unknown');
    expect(skew.skewMs).toBeUndefined();
  });

  it('defaults the tolerance to the exported threshold', () => {
    const skew = doctor.classifyClockSkew({
      localNowMs: 0,
      authoritativeNowMs: doctor.DEFAULT_CLOCK_SKEW_THRESHOLD_MS + 1
    });
    expect(skew.status).toBe('skewed');
  });

  it('inspectClockSkew degrades to unknown when the source rejects', async () => {
    const skew = await doctor.inspectClockSkew({
      now: () => 5_000,
      fetchAuthoritativeNowMs: async () => {
        throw new Error('offline');
      }
    });
    expect(skew.status).toBe('unknown');
  });

  it('inspectClockSkew resolves a real skew through injected collaborators', async () => {
    const skew = await doctor.inspectClockSkew({
      now: () => 200_000,
      clockSkewThresholdMs: 60_000,
      fetchAuthoritativeNowMs: async () => 50_000
    });
    expect(skew.status).toBe('skewed');
    expect(skew.skewMs).toBe(150_000);
  });

  it('fetchAuthoritativeNowMsViaGithub parses the Date header via an injected https client', async () => {
    const fixedIso = 'Sun, 14 Jun 2026 12:00:00 GMT';
    const fakeHttps = {
      request(
        _url: string,
        _options: unknown,
        callback: (response: {
          headers: { date: string };
          resume: () => void;
        }) => void
      ) {
        const handlers: Record<string, () => void> = {};
        queueMicrotask(() => callback({ headers: { date: fixedIso }, resume: () => undefined }));
        return {
          on(event: string, handler: () => void) {
            handlers[event] = handler;
            return this;
          },
          end() {
            return this;
          },
          destroy() {
            return this;
          }
        };
      }
    };
    const ms = await doctor.fetchAuthoritativeNowMsViaGithub({ https: fakeHttps });
    expect(ms).toBe(Date.parse(fixedIso));
  });

  it('fetchAuthoritativeNowMsViaGithub resolves undefined when the request errors', async () => {
    const fakeHttps = {
      request(_url: string, _options: unknown, _callback: unknown) {
        const handlers: Record<string, (error?: Error) => void> = {};
        queueMicrotask(() => handlers.error?.(new Error('ECONNREFUSED')));
        return {
          on(event: string, handler: (error?: Error) => void) {
            handlers[event] = handler;
            return this;
          },
          end() {
            return this;
          },
          destroy() {
            return this;
          }
        };
      }
    };
    const ms = await doctor.fetchAuthoritativeNowMsViaGithub({ https: fakeHttps });
    expect(ms).toBeUndefined();
  });

  it('formats each advisory state with actionable text', () => {
    expect(doctor.formatClockSkewReport({ status: 'unknown', thresholdMs: 60_000 })).toContain(
      'unknown'
    );
    expect(
      doctor.formatClockSkewReport({ status: 'ok', skewMs: 2_000, thresholdMs: 60_000 })
    ).toContain('within 60s tolerance');
    const skewed = doctor.formatClockSkewReport({
      status: 'skewed',
      skewMs: -7_200_000,
      thresholdMs: 60_000
    });
    expect(skewed).toContain('exceeds the 60s tolerance');
    expect(skewed).toContain('remediation:');
  });
});

describe('checkMaintainerRunnerPrerequisites contract alignment', () => {
  function readWorkflow(name: string): string {
    return fs
      .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', name), 'utf8')
      .replace(/\r\n/g, '\n');
  }

  it('keeps the Windows doctor candidate paths aligned with the workflow env-probe contract', () => {
    const workflow = readWorkflow('windows-labview-maintainer.yml');
    const contract = doctor.buildPrerequisiteContract('win32', {});
    const probedIds = ['vscode', 'labview', 'labview-cli'];
    for (const id of probedIds) {
      const entry = contract.find((candidate) => candidate.id === id);
      // The system-wide VS Code path and the LabVIEW/CLI absolute paths the
      // doctor gates on must be the same ones the workflow summary probes, so
      // the two never drift.
      const systemPaths = entry!.candidatePaths.filter((candidate) => !candidate.includes('AppData'));
      for (const candidatePath of systemPaths) {
        expect(workflow).toContain(candidatePath);
      }
    }
  });

  it('keeps the Linux doctor candidate paths aligned with the workflow env-probe contract', () => {
    const workflow = readWorkflow('linux-labview-maintainer.yml');
    const contract = doctor.buildPrerequisiteContract('linux', {});
    for (const id of ['vscode', 'labview', 'labview-cli']) {
      const entry = contract.find((candidate) => candidate.id === id);
      for (const candidatePath of entry!.candidatePaths) {
        expect(workflow).toContain(candidatePath);
      }
    }
  });
});
