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
  getUsage: () => string;
  parseArgs: (argv: string[]) => { platform?: string; help: boolean };
  main: (
    argv?: string[],
    deps?: {
      existsSync?: (p: string) => boolean;
      env?: Record<string, string | undefined>;
      platform?: string;
      stdout?: { write: (chunk: string) => void };
      stderr?: { write: (chunk: string) => void };
    }
  ) => number;
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

  it('surfaces every missing prerequisite at once rather than only the first', () => {
    const report = doctor.inspectMaintainerRunnerPrerequisites('linux', {
      env: { PATH: '' },
      existsSync: () => false
    });
    expect(report.satisfied).toBe(false);
    expect(report.missingRequired).toEqual(['node', 'npm', 'git', 'vscode', 'labview', 'labview-cli']);
  });
});

describe('checkMaintainerRunnerPrerequisites.formatPrerequisiteReport', () => {
  it('includes actionable remediation for each missing prerequisite', () => {
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
  it('exits non-zero and prints the report when prerequisites are missing', () => {
    const stdout = createWritable();
    const code = doctor.main([], {
      platform: 'linux',
      env: { PATH: '' },
      existsSync: () => false,
      stdout: stdout.stream
    });
    expect(code).toBe(1);
    expect(stdout.text()).toContain('[runner-doctor]');
  });

  it('exits zero when all required prerequisites are satisfied', () => {
    const stdout = createWritable();
    const present = new Set([
      '/usr/bin/code',
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/bin/labviewcli',
      '/usr/bin/node',
      '/usr/bin/npm',
      '/usr/bin/git'
    ]);
    const code = doctor.main([], {
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      existsSync: (candidate) => present.has(candidate),
      stdout: stdout.stream
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('All required prerequisites satisfied');
  });

  it('prints usage for --help and rejects unknown args', () => {
    const stdout = createWritable();
    expect(doctor.main(['--help'], { stdout: stdout.stream })).toBe(0);
    expect(stdout.text()).toContain('Usage: node scripts/checkMaintainerRunnerPrerequisites.js');

    const stderr = createWritable();
    expect(doctor.main(['--bogus'], { stderr: stderr.stream })).toBe(1);
    expect(stderr.text()).toContain('Unknown argument: --bogus');
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
