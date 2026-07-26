import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bootstrap = require('../../scripts/bootstrapLinuxVsCodeHost.js') as {
  DISTRO_PACKAGES: Record<string, string[]>;
  buildInstallPlan: (family: string) => { packageFamily: string; packages: string[]; commands: string[][] };
  detectPackageFamily: (osReleaseText: string) => string;
  getUsage: () => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => void;
  parseOsRelease: (text: string) => Record<string, string>;
};

describe('bootstrapLinuxVsCodeHost (VHS-REQ-684.1)', () => {
  it('detects Debian and Ubuntu package families from /etc/os-release content', () => {
    expect(
      bootstrap.parseOsRelease('ID=debian\nVERSION_CODENAME=bookworm\n')
    ).toMatchObject({
      ID: 'debian',
      VERSION_CODENAME: 'bookworm'
    });
    expect(bootstrap.detectPackageFamily('ID=ubuntu\nID_LIKE=debian\n')).toBe('ubuntu');
    expect(bootstrap.detectPackageFamily('ID=debian\n')).toBe('debian');
    expect(bootstrap.detectPackageFamily('ID=unknown\nID_LIKE=debian\n')).toBe('debian');
  });

  it('builds an apt install plan that includes Xvfb and the VS Code runtime libraries', () => {
    const debianPlan = bootstrap.buildInstallPlan('debian');
    const ubuntuPlan = bootstrap.buildInstallPlan('ubuntu');

    expect(debianPlan.packageFamily).toBe('debian');
    expect(debianPlan.packages).toContain('xvfb');
    expect(debianPlan.packages).toContain('xauth');
    expect(debianPlan.packages).toContain('libasound2');
    expect(debianPlan.packages).not.toContain('libei1');
    expect(debianPlan.packages).toContain('libpipewire-0.3-0');
    expect(ubuntuPlan.packageFamily).toBe('ubuntu');
    expect(ubuntuPlan.packages).toContain('xvfb');
    expect(ubuntuPlan.packages).toContain('xauth');
    expect(ubuntuPlan.packages).toContain('libasound2t64');
    expect(ubuntuPlan.packages).toContain('libei1');
    expect(ubuntuPlan.packages).toContain('libpipewire-0.3-0');
    expect(debianPlan.commands).toEqual([
      ['sudo', 'apt-get', 'update'],
      ['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', ...bootstrap.DISTRO_PACKAGES.debian]
    ]);
    expect(bootstrap.getUsage()).toContain('print-plan');
  });
});

describe('bootstrapLinuxVsCodeHost main (VHS-REQ-684.1)', () => {
  const capture = () => {
    let out = '';
    return { write: (s: string) => { out += s; }, get: () => out };
  };

  it('prints usage for help/--help/-h WITHOUT reading /etc/os-release', () => {
    for (const arg of ['help', '--help', '-h']) {
      const stdout = capture();
      // No osReleaseText dep: the help guard must return before readOsRelease
      // (which throws ENOENT off-Linux), so this never throws on any host.
      expect(() => bootstrap.main([arg], { stdout })).not.toThrow();
      expect(stdout.get()).toContain('print-plan');
    }
  });

  it('print-plan emits the install-plan JSON for the injected os-release', () => {
    const stdout = capture();
    bootstrap.main(['print-plan'], { stdout, osReleaseText: 'ID=debian\n' });
    const plan = JSON.parse(stdout.get());
    expect(plan.packageFamily).toBe('debian');
    expect(plan.packages).toContain('xvfb');
  });

  it('install (the default action) runs the apt plan via the injected spawnSync', () => {
    const calls: string[][] = [];
    const spawnSync = (cmd: string, args: string[]) => { calls.push([cmd, ...args]); return { status: 0 }; };
    const stdout = capture();
    bootstrap.main([], { stdout, osReleaseText: 'ID=ubuntu\n', spawnSync });
    expect(calls[0]).toEqual(['sudo', 'apt-get', 'update']);
    expect(calls[1]).toContain('xvfb');
    expect(stdout.get()).toContain('Installing Linux VS Code host packages for ubuntu');
  });

  it('throws on an unsupported action', () => {
    expect(() => bootstrap.main(['bogus'], { osReleaseText: 'ID=debian\n', stdout: { write() {} } })).toThrow(/Unsupported action/);
  });
});
