import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vagrantPreflight = require('../../scripts/vagrantLanePreflight.js');

const {
  DEFAULT_BOX_NAME,
  parseVagrantVersion,
  parseBoxList,
  boxIsRegistered,
  parseVagrantStatus,
  inspectVagrantLane,
  inspectVagrantStatus,
  formatPreflightReport,
  main
} = vagrantPreflight;

// path.join keeps fixtures separator-agnostic across Linux and Windows CI legs.
const FIXTURE_CWD = path.join(path.sep, 'repo');
const VAGRANTFILE = path.join(FIXTURE_CWD, 'vagrant', 'Vagrantfile');

type CommandResult = { status: number | null; stdout: string; stderr: string; error?: Error };

function existsSyncFor(present: Set<string>) {
  return (candidate: string): boolean => present.has(candidate);
}

function collectStream() {
  const writes: string[] = [];
  return {
    writes,
    stream: {
      write: (chunk: string): boolean => {
        writes.push(chunk);
        return true;
      }
    }
  };
}

const OK = (stdout: string): CommandResult => ({ status: 0, stdout, stderr: '' });
const NOT_FOUND: CommandResult = {
  status: null,
  stdout: '',
  stderr: '',
  error: new Error('ENOENT')
};

describe('vagrantLanePreflight parsers', () => {
  it('parses the vagrant version banner', () => {
    expect(parseVagrantVersion('Vagrant 2.4.9')).toBe('2.4.9');
    expect(parseVagrantVersion('nonsense')).toBeNull();
    expect(parseVagrantVersion(undefined)).toBeNull();
  });

  it('parses vagrant box list rows', () => {
    const rows = parseBoxList(
      'vihs/win11-labview2026 (virtualbox, 0, amd64)\n\nother/box (libvirt)\n'
    );
    expect(rows).toEqual([
      { name: 'vihs/win11-labview2026', provider: 'virtualbox', version: '0' },
      { name: 'other/box', provider: 'libvirt', version: null }
    ]);
    expect(parseBoxList(undefined)).toEqual([]);
  });

  it('parses the real nested-arch box list format', () => {
    const rows = parseBoxList('vihs/win11-labview2026 (virtualbox, 0, (amd64))\n');
    expect(rows[0].name).toBe('vihs/win11-labview2026');
    expect(rows[0].provider).toBe('virtualbox');
    expect(rows[0].version).toBe('0');
    expect(boxIsRegistered('vihs/win11-labview2026 (virtualbox, 0, (amd64))\n', DEFAULT_BOX_NAME)).toBe(
      true
    );
  });

  it('detects a registered box by name', () => {
    const stdout = 'vihs/win11-labview2026 (virtualbox, 0, amd64)\n';
    expect(boxIsRegistered(stdout, DEFAULT_BOX_NAME)).toBe(true);
    expect(boxIsRegistered(stdout, 'missing/box')).toBe(false);
  });

  it('parses the VM lifecycle state', () => {
    expect(parseVagrantStatus('  vihs-local-win11   not created (virtualbox)').state).toBe(
      'not created'
    );
    expect(parseVagrantStatus('  vihs-local-win11   running (virtualbox)').state).toBe('running');
    expect(parseVagrantStatus('no recognizable line').state).toBeNull();
  });
});

describe('inspectVagrantLane', () => {
  function runCommandFor(map: Record<string, CommandResult>) {
    return (command: string, args: string[]): CommandResult => {
      const key = `${command} ${args.join(' ')}`;
      return map[key] ?? NOT_FOUND;
    };
  }

  it('reports satisfied when every required check passes', () => {
    const report = inspectVagrantLane({
      cwd: FIXTURE_CWD,
      env: {},
      existsSync: existsSyncFor(new Set([VAGRANTFILE])),
      runCommand: runCommandFor({
        'vagrant --version': OK('Vagrant 2.4.9'),
        'VBoxManage --version': OK('7.2.6r170137'),
        'vagrant box list': OK('vihs/win11-labview2026 (virtualbox, 0, amd64)\n')
      })
    });

    expect(report.satisfied).toBe(true);
    expect(report.failures).toHaveLength(0);
    expect(report.boxName).toBe(DEFAULT_BOX_NAME);
    expect(report.checks.find((c: { id: string }) => c.id === 'box-registered').ok).toBe(true);
  });

  it('honors VIHS_VAGRANT_BOX override', () => {
    const report = inspectVagrantLane({
      cwd: FIXTURE_CWD,
      env: { VIHS_VAGRANT_BOX: 'custom/box' },
      existsSync: existsSyncFor(new Set([VAGRANTFILE])),
      runCommand: runCommandFor({
        'vagrant --version': OK('Vagrant 2.4.9'),
        'VBoxManage --version': OK('7.2.6'),
        'vagrant box list': OK('custom/box (virtualbox, 0, amd64)\n')
      })
    });

    expect(report.boxName).toBe('custom/box');
    expect(report.satisfied).toBe(true);
  });

  it('fails closed when the vagrant CLI is missing and skips the box check', () => {
    const report = inspectVagrantLane({
      cwd: FIXTURE_CWD,
      env: {},
      existsSync: existsSyncFor(new Set([VAGRANTFILE])),
      runCommand: runCommandFor({
        'VBoxManage --version': OK('7.2.6')
      })
    });

    expect(report.satisfied).toBe(false);
    const ids = report.failures.map((f: { id: string }) => f.id);
    expect(ids).toContain('vagrant-cli');
    expect(ids).toContain('box-registered');
    const boxCheck = report.checks.find((c: { id: string }) => c.id === 'box-registered');
    expect(boxCheck.detail).toContain('vagrant CLI unavailable');
  });

  it('fails when the Vagrantfile is absent', () => {
    const report = inspectVagrantLane({
      cwd: FIXTURE_CWD,
      env: {},
      existsSync: existsSyncFor(new Set()),
      runCommand: runCommandFor({
        'vagrant --version': OK('Vagrant 2.4.9'),
        'VBoxManage --version': OK('7.2.6'),
        'vagrant box list': OK('vihs/win11-labview2026 (virtualbox, 0, amd64)\n')
      })
    });

    expect(report.satisfied).toBe(false);
    expect(report.failures.map((f: { id: string }) => f.id)).toContain('vagrantfile');
  });

  it('fails when the expected box is not registered', () => {
    const report = inspectVagrantLane({
      cwd: FIXTURE_CWD,
      env: {},
      existsSync: existsSyncFor(new Set([VAGRANTFILE])),
      runCommand: runCommandFor({
        'vagrant --version': OK('Vagrant 2.4.9'),
        'VBoxManage --version': OK('7.2.6'),
        'vagrant box list': OK('other/box (virtualbox, 0, amd64)\n')
      })
    });

    expect(report.satisfied).toBe(false);
    const boxCheck = report.checks.find((c: { id: string }) => c.id === 'box-registered');
    expect(boxCheck.ok).toBe(false);
    expect(boxCheck.detail).toContain('not registered');
  });
});

describe('inspectVagrantStatus', () => {
  it('returns the parsed lifecycle state', () => {
    const status = inspectVagrantStatus({
      cwd: FIXTURE_CWD,
      runCommand: () => OK('  vihs-local-win11   poweroff (virtualbox)\n')
    });
    expect(status.state).toBe('poweroff');
    expect(status.ok).toBe(true);
  });

  it('reports unavailable when vagrant status fails', () => {
    const status = inspectVagrantStatus({
      cwd: FIXTURE_CWD,
      runCommand: () => NOT_FOUND
    });
    expect(status.ok).toBe(false);
    expect(status.detail).toContain('unavailable');
  });
});

describe('formatPreflightReport + main', () => {
  const readyDeps = {
    cwd: FIXTURE_CWD,
    env: {},
    existsSync: existsSyncFor(new Set([VAGRANTFILE])),
    runCommand: (command: string, args: string[]): CommandResult => {
      const key = `${command} ${args.join(' ')}`;
      const map: Record<string, CommandResult> = {
        'vagrant --version': OK('Vagrant 2.4.9'),
        'VBoxManage --version': OK('7.2.6'),
        'vagrant box list': OK('vihs/win11-labview2026 (virtualbox, 0, amd64)\n')
      };
      return map[key] ?? NOT_FOUND;
    }
  };

  it('renders a PASS report when ready', () => {
    const rendered = formatPreflightReport(inspectVagrantLane(readyDeps));
    expect(rendered).toContain('[PASS] Vagrant CLI available');
    expect(rendered).toContain("Ready. You can run 'cd vagrant && vagrant up'.");
  });

  it('main returns 0 and writes to stdout when ready', () => {
    const out = collectStream();
    const err = collectStream();
    const code = main({ ...readyDeps, argv: ['preflight'], stdout: out.stream, stderr: err.stream });
    expect(code).toBe(0);
    expect(out.writes.join('')).toContain('[PASS]');
    expect(err.writes).toHaveLength(0);
  });

  it('main returns 1 and writes to stderr when not ready', () => {
    const out = collectStream();
    const err = collectStream();
    const code = main({
      cwd: FIXTURE_CWD,
      env: {},
      existsSync: existsSyncFor(new Set()),
      runCommand: () => NOT_FOUND,
      argv: ['preflight'],
      stdout: out.stream,
      stderr: err.stream
    });
    expect(code).toBe(1);
    expect(err.writes.join('')).toContain('Not ready');
  });

  it('main status mode always returns 0', () => {
    const out = collectStream();
    const code = main({
      cwd: FIXTURE_CWD,
      argv: ['status'],
      runCommand: () => OK('  vihs-local-win11   running (virtualbox)\n'),
      stdout: out.stream
    });
    expect(code).toBe(0);
    expect(out.writes.join('')).toContain('VM state: running');
  });
});
