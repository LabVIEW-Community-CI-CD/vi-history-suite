import { describe, expect, it } from 'vitest';

import { buildLinuxContainerLabviewCliScript } from '../../src/reporting/comparisonReportRuntimeExecution';

// VHS-REQ-148 (Linux container parity for the #579 cold-launch fix, released in
// 1.32.0): the Linux container LabVIEW CLI script must widen the connect window
// in the per-version LabVIEW `.conf` the launched headless LabVIEW reads
// (configurable via viHistorySuite.runtime.cliConnectTimeoutSeconds, default
// 180s) and retry once on the cold-launch VI Server connectivity failure
// (-350000 / -350051). This mirrors windowsContainerLabviewCliScript.test.ts so
// the Linux builder carries the same regression guard as the Windows one.
describe('buildLinuxContainerLabviewCliScript connect-window parity (VHS-REQ-148)', () => {
  const executable = '/usr/local/natinst/LabVIEW-2026/LabVIEWCLI';
  const args = ['--operation', 'Compare'];

  it('uses the 180s default connect window when no override is supplied', () => {
    const script = buildLinuxContainerLabviewCliScript(executable, args, 'cli-headless');
    expect(script).toContain('open_app_timeout=180');
    expect(script).toContain('after_launch_timeout=180');
  });

  it('substitutes the configured cliConnectTimeoutSeconds into the connect window', () => {
    const script = buildLinuxContainerLabviewCliScript(executable, args, 'cli-headless', {
      connectTimeoutSeconds: 240
    });
    expect(script).toContain('open_app_timeout=240');
    expect(script).toContain('after_launch_timeout=240');
    expect(script).not.toContain('open_app_timeout=180');
  });

  it('falls back to the 180s default when the override is not a positive integer', () => {
    for (const invalid of [0, 90.5, -10]) {
      const script = buildLinuxContainerLabviewCliScript(executable, args, 'cli-headless', {
        connectTimeoutSeconds: invalid
      });
      expect(script).toContain('open_app_timeout=180');
    }
  });

  it('hardens the per-version LabVIEW .conf connect-window keys fail-soft', () => {
    const script = buildLinuxContainerLabviewCliScript(executable, args, 'cli-headless');
    expect(script).toContain('OpenAppReferenceTimeoutInSecond');
    expect(script).toContain('AfterLaunchOpenAppReferenceTimeoutInSecond');
    // All .conf mutation is fail-soft so a read-only or unexpected layout never
    // blocks the compare; the deterministic guarantee is the one-shot retry.
    expect(script).toContain('|| true');
  });

  it('retries once on the cold-launch VI Server connectivity failure (-350000/-350051)', () => {
    const script = buildLinuxContainerLabviewCliScript(executable, args, 'cli-headless');
    expect(script).toContain('max_attempts=2');
    expect(script).toContain('-350000');
    expect(script).toContain('-350051');
  });
});
