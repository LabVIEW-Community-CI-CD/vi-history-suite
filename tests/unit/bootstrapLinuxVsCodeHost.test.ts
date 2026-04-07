import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bootstrap = require('../../scripts/bootstrapLinuxVsCodeHost.js') as {
  DISTRO_PACKAGES: Record<string, string[]>;
  buildInstallPlan: (family: string) => { packageFamily: string; packages: string[]; commands: string[][] };
  detectPackageFamily: (osReleaseText: string) => string;
  getUsage: () => string;
  parseOsRelease: (text: string) => Record<string, string>;
};

describe('bootstrapLinuxVsCodeHost', () => {
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
    expect(ubuntuPlan.packageFamily).toBe('ubuntu');
    expect(ubuntuPlan.packages).toContain('xvfb');
    expect(ubuntuPlan.packages).toContain('xauth');
    expect(ubuntuPlan.packages).toContain('libasound2t64');
    expect(debianPlan.commands).toEqual([
      ['sudo', 'apt-get', 'update'],
      ['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', ...bootstrap.DISTRO_PACKAGES.debian]
    ]);
    expect(bootstrap.getUsage()).toContain('print-plan');
  });
});
