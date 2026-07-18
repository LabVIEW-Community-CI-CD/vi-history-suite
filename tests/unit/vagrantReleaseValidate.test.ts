import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const releaseValidate = require('../../scripts/vagrantReleaseValidate.cjs');

const { TRACK_ID, buildReleaseComparisonGuestScript } = releaseValidate;

const PATHS = {
  repo: 'C:\\vihs-workspace',
  viPath: 'resource/plugins/lv_icon.vi',
  base: '5376833',
  selected: 'fc09736'
};

describe('vagrantReleaseValidate.buildReleaseComparisonGuestScript', () => {
  const script = buildReleaseComparisonGuestScript(PATHS);

  it('enforces the VHS-REQ-665 x86 host-native headless env contract', () => {
    // This track (vagrant-win-x86-hostnative) attests exactly this mode; a drift
    // here would silently record a wrong-mode attestation.
    expect(TRACK_ID).toBe('vagrant-win-x86-hostnative');
    expect(script).toContain('$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = "1"');
    expect(script).toContain('$env:WIN_PROVIDER = "host"');
    expect(script).toContain('$env:WIN_LV_BITNESS = "x86"');
    // Never a container provider or x64 bitness on this release-gating track.
    expect(script).not.toContain('WIN_PROVIDER = "docker"');
    expect(script).not.toContain('WIN_LV_BITNESS = "x64"');
  });

  it('fails fast in-guest and stops on first error', () => {
    expect(script).toContain('$ErrorActionPreference = "Stop"');
  });

  it('injects the provided repo/vi/base/selected paths', () => {
    expect(script).toContain(`$env:WIN_REPO_ROOT = "${PATHS.repo}"`);
    expect(script).toContain(`$env:WIN_VI_PATH = "${PATHS.viPath}"`);
    expect(script).toContain(`$env:WIN_BASE = "${PATHS.base}"`);
    expect(script).toContain(`$env:WIN_SELECTED = "${PATHS.selected}"`);
    expect(script).toContain(`cd ${PATHS.repo}`);
  });

  it('compiles then runs the in-repo windows compare driver', () => {
    const compileAt = script.indexOf('npm run compile');
    const driverAt = script.indexOf('node scripts\\windows-compare-driver.cjs');
    expect(compileAt).toBeGreaterThanOrEqual(0);
    expect(driverAt).toBeGreaterThan(compileAt);
  });
});
