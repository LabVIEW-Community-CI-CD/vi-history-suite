import { describe, expect, it } from 'vitest';
import {
  evaluateLabviewContainerDiagnostics,
  CHECK_IDS,
  type LabviewContainerProbes
} from '../../src/reporting/containerDiagnostics/labviewContainerDiagnostics';

function probes(over: Partial<LabviewContainerProbes> = {}): LabviewContainerProbes {
  return {
    imageRef: 'nationalinstruments/labview:2026q1-linux',
    dockerCliAvailable: true,
    dockerServerVersion: '29.3.1',
    imagePresent: true,
    imageSizeBytes: 5_140_000_000,
    labviewCliPath: '/usr/local/bin/LabVIEWCLI',
    labviewEnginePath: '/usr/local/natinst/LabVIEW-2026-64',
    labviewYear: '2026',
    lvcomparePresent: true,
    licensing: 'activated',
    cliLaunch: null,
    comparisonSmoke: null,
    ...over
  };
}

describe('evaluateLabviewContainerDiagnostics staged checks (VHS-REQ-710.1)', () => {
  it('reports readyToCompare when every critical check passes', () => {
    const r = evaluateLabviewContainerDiagnostics(probes());
    expect(r.readyToCompare).toBe(true);
    expect(r.overall).toBe('pass');
    expect(r.failures).toHaveLength(0);
    expect(r.variant).toBe('linux-container');
    expect(r.checks.map((c) => c.checkId)).toEqual([...CHECK_IDS]);
  });

  it('fails closed and stages downstream checks as skip when docker is missing', () => {
    const r = evaluateLabviewContainerDiagnostics(probes({ dockerCliAvailable: false, dockerServerVersion: null, imagePresent: false }));
    expect(r.readyToCompare).toBe(false);
    expect(r.failures).toContain('docker-cli');
    const daemon = r.checks.find((c) => c.checkId === 'docker-daemon');
    const image = r.checks.find((c) => c.checkId === 'image-present');
    // Downstream checks are skipped (never a misleading pass) once a prerequisite fails.
    expect(daemon?.status).toBe('skip');
    expect(image?.status).toBe('skip');
    expect(r.checks.find((c) => c.checkId === 'labviewcli-present')?.status).toBe('skip');
  });

  it('fails the LabVIEWCLI check when the image lacks the CLI', () => {
    const r = evaluateLabviewContainerDiagnostics(probes({ labviewCliPath: null }));
    expect(r.failures).toContain('labviewcli-present');
    expect(r.readyToCompare).toBe(false);
  });

  it('throws on malformed probes (fail closed)', () => {
    expect(() => evaluateLabviewContainerDiagnostics({} as never)).toThrow(/imageRef/);
    expect(() => evaluateLabviewContainerDiagnostics(probes({ licensing: 'bogus' as never }))).toThrow(/licensing/);
  });
});

describe('evaluateLabviewContainerDiagnostics verdict + remediation (VHS-REQ-710.2)', () => {
  it('treats an unknown licensing state as an advisory warning that does not block readiness', () => {
    const r = evaluateLabviewContainerDiagnostics(probes({ licensing: 'unknown' }));
    expect(r.readyToCompare).toBe(true);
    expect(r.overall).toBe('warn');
    expect(r.checks.find((c) => c.checkId === 'licensing')?.status).toBe('warn');
  });

  it('names the first actionable remediation as the next action when not ready', () => {
    const r = evaluateLabviewContainerDiagnostics(probes({ imagePresent: false }));
    expect(r.readyToCompare).toBe(false);
    expect(r.nextAction).toMatch(/docker pull/);
  });

  it('returns a null next action when ready to compare', () => {
    expect(evaluateLabviewContainerDiagnostics(probes()).nextAction).toBeNull();
  });

  it('treats a missing LVCompare as advisory, never a readiness blocker (distinct from CreateComparisonReport)', () => {
    const r = evaluateLabviewContainerDiagnostics(probes({ lvcomparePresent: false }));
    // LVCompare is the SEPARATE source-control interactive diff tool, not a
    // CreateComparisonReport dependency, so its absence warns but never blocks readiness.
    expect(r.checks.find((c) => c.checkId === 'lvcompare-present')?.status).toBe('warn');
    expect(r.failures).not.toContain('lvcompare-present');
    expect(r.readyToCompare).toBe(true);
  });
});

describe('evaluateLabviewContainerDiagnostics host-native variant (VHS-REQ-710.5)', () => {
  function hostProbes(over: Partial<LabviewContainerProbes> = {}): LabviewContainerProbes {
    return probes({
      variant: 'linux-host-native',
      dockerCliAvailable: false,
      dockerServerVersion: null,
      imagePresent: false,
      imageSizeBytes: null,
      ...over
    });
  }

  it('skips docker/image checks and rests readiness on host LabVIEW tooling', () => {
    const r = evaluateLabviewContainerDiagnostics(hostProbes());
    expect(r.variant).toBe('linux-host-native');
    expect(r.checks.find((c) => c.checkId === 'docker-cli')?.status).toBe('skip');
    expect(r.checks.find((c) => c.checkId === 'docker-daemon')?.status).toBe('skip');
    expect(r.checks.find((c) => c.checkId === 'image-present')?.status).toBe('skip');
    // docker absent does NOT block readiness for the host-native variant.
    expect(r.readyToCompare).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it('fails host-native readiness when the host LabVIEWCLI is absent', () => {
    const r = evaluateLabviewContainerDiagnostics(hostProbes({ labviewCliPath: null }));
    expect(r.failures).toContain('labviewcli-present');
    expect(r.readyToCompare).toBe(false);
  });

  it('supports the Windows host-native variant: docker/image skipped, ready on host tooling', () => {
    const r = evaluateLabviewContainerDiagnostics(hostProbes({ variant: 'windows-host-native' }));
    expect(r.variant).toBe('windows-host-native');
    expect(r.checks.find((c) => c.checkId === 'docker-cli')?.status).toBe('skip');
    expect(r.checks.find((c) => c.checkId === 'image-present')?.status).toBe('skip');
    expect(r.readyToCompare).toBe(true);
  });

  it('emits Windows-appropriate remediation when Windows host tooling is absent', () => {
    const r = evaluateLabviewContainerDiagnostics(
      hostProbes({ variant: 'windows-host-native', labviewCliPath: null, lvcomparePresent: false })
    );
    expect(r.readyToCompare).toBe(false);
    const cliCheck = r.checks.find((c) => c.checkId === 'labviewcli-present');
    const lvcompareCheck = r.checks.find((c) => c.checkId === 'lvcompare-present');
    // Windows paths, not Linux /usr/local, so an agent on Windows gets actionable guidance.
    expect(cliCheck?.remediation).toMatch(/LabVIEWCLI\.exe/);
    expect(lvcompareCheck?.remediation).toMatch(/LVCompare\.exe/);
    expect(r.nextAction).toMatch(/LabVIEWCLI\.exe/);
  });
});

describe('evaluateLabviewContainerDiagnostics optional smoke checks (VHS-REQ-710.4)', () => {
  it('records passing cli-launch and comparison-smoke checks when tooling is present and probes succeed', () => {
    const r = evaluateLabviewContainerDiagnostics(
      probes({
        cliLaunch: { ok: true, version: '24.5.1', exitCode: 0 },
        comparisonSmoke: { ok: true, reportExists: true, failureReason: null }
      })
    );
    expect(r.checks.find((c) => c.checkId === 'cli-launch')?.status).toBe('pass');
    expect(r.checks.find((c) => c.checkId === 'comparison-smoke')?.status).toBe('pass');
    expect(r.readyToCompare).toBe(true);
    expect(r.overall).toBe('pass');
  });

  it('fails cli-launch and comparison-smoke when the probes report failure', () => {
    const r = evaluateLabviewContainerDiagnostics(
      probes({
        cliLaunch: { ok: false, version: null, exitCode: 1 },
        comparisonSmoke: { ok: false, reportExists: false, failureReason: 'VI Server unreachable' }
      })
    );
    const cli = r.checks.find((c) => c.checkId === 'cli-launch');
    const smoke = r.checks.find((c) => c.checkId === 'comparison-smoke');
    expect(cli?.status).toBe('fail');
    expect(cli?.remediation).toMatch(/headless/);
    expect(smoke?.status).toBe('fail');
    expect(smoke?.detail).toMatch(/VI Server unreachable/);
    expect(r.failures).toContain('cli-launch');
    expect(r.failures).toContain('comparison-smoke');
    // An attempted smoke probe that failed proves the runtime is unusable.
    expect(r.readyToCompare).toBe(false);
  });

  it('blocks readiness when an attempted smoke probe fails even though every critical check passes (VHS-REQ-710.2)', () => {
    // All critical checks pass (default probes), but the requested cli-launch smoke
    // probe actually ran and failed -> the runtime is proven unusable, so readiness
    // must be false and the failed probe's remediation becomes the next action.
    const r = evaluateLabviewContainerDiagnostics(
      probes({ cliLaunch: { ok: false, version: null, exitCode: 1 } })
    );
    expect(r.checks.find((c) => c.checkId === 'labviewcli-present')?.status).toBe('pass');
    expect(r.checks.find((c) => c.checkId === 'cli-launch')?.status).toBe('fail');
    expect(r.readyToCompare).toBe(false);
    expect(r.nextAction).toMatch(/headless/);
  });

  it('keeps readiness true when smoke probes were not attempted (skip does not block)', () => {
    // Default probes leave cliLaunch/comparisonSmoke null (not attempted) -> skip.
    const r = evaluateLabviewContainerDiagnostics(probes());
    expect(r.checks.find((c) => c.checkId === 'cli-launch')?.status).toBe('skip');
    expect(r.readyToCompare).toBe(true);
  });

  it('skips cli-launch and comparison-smoke when a probe was attempted but tooling is absent', () => {
    const r = evaluateLabviewContainerDiagnostics(
      probes({
        labviewCliPath: null,
        cliLaunch: { ok: true, version: '24.5.1', exitCode: 0 },
        comparisonSmoke: { ok: true, reportExists: true, failureReason: null }
      })
    );
    const cli = r.checks.find((c) => c.checkId === 'cli-launch');
    const smoke = r.checks.find((c) => c.checkId === 'comparison-smoke');
    expect(cli?.status).toBe('skip');
    expect(cli?.detail).toMatch(/tooling not present/);
    expect(smoke?.status).toBe('skip');
    expect(smoke?.detail).toMatch(/tooling not present/);
  });
});

describe('evaluateLabviewContainerDiagnostics probe validation (VHS-REQ-710.1)', () => {
  it('throws when probes is null or not an object', () => {
    expect(() => evaluateLabviewContainerDiagnostics(null as never)).toThrow(/must be an object/);
    expect(() => evaluateLabviewContainerDiagnostics(42 as never)).toThrow(/must be an object/);
  });

  it('throws when a required boolean flag is not a boolean', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ dockerCliAvailable: 'yes' as never }))).toThrow(
      /dockerCliAvailable must be a boolean/
    );
    expect(() => evaluateLabviewContainerDiagnostics(probes({ imagePresent: 1 as never }))).toThrow(/imagePresent must be a boolean/);
  });

  it('throws when a nullable string field is a non-null non-string (a truthy non-string must not read as present)', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ labviewCliPath: 5 as never }))).toThrow(
      /labviewCliPath must be a string or null/
    );
    expect(() => evaluateLabviewContainerDiagnostics(probes({ labviewEnginePath: {} as never }))).toThrow(
      /labviewEnginePath must be a string or null/
    );
    expect(() => evaluateLabviewContainerDiagnostics(probes({ dockerServerVersion: true as never }))).toThrow(
      /dockerServerVersion must be a string or null/
    );
  });

  it('throws when imageSizeBytes is a non-null non-finite number', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ imageSizeBytes: 'big' as never }))).toThrow(
      /imageSizeBytes must be a finite number or null/
    );
    expect(() => evaluateLabviewContainerDiagnostics(probes({ imageSizeBytes: Number.NaN }))).toThrow(
      /imageSizeBytes must be a finite number or null/
    );
  });

  it('throws when a nested smoke probe record is malformed rather than evaluating it', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ cliLaunch: { ok: 'yes' } as never }))).toThrow(
      /cliLaunch\.ok must be a boolean/
    );
    expect(() =>
      evaluateLabviewContainerDiagnostics(probes({ comparisonSmoke: { ok: true, reportExists: 1 } as never }))
    ).toThrow(/comparisonSmoke\.reportExists must be a boolean/);
  });

  it('throws when an optional variant label is a non-string', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ variant: 7 as never }))).toThrow(
      /variant must be a string when present/
    );
  });

  it('throws on every malformed cliLaunch sub-field (object/version/exitCode)', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ cliLaunch: 5 as never }))).toThrow(
      /cliLaunch must be an object or null/
    );
    expect(() =>
      evaluateLabviewContainerDiagnostics(probes({ cliLaunch: { ok: true, version: 1, exitCode: 0 } as never }))
    ).toThrow(/cliLaunch\.version must be a string or null/);
    expect(() =>
      evaluateLabviewContainerDiagnostics(probes({ cliLaunch: { ok: true, version: null, exitCode: Number.NaN } as never }))
    ).toThrow(/cliLaunch\.exitCode must be a finite number or null/);
  });

  it('throws on every malformed comparisonSmoke sub-field (object/ok/failureReason)', () => {
    expect(() => evaluateLabviewContainerDiagnostics(probes({ comparisonSmoke: 'x' as never }))).toThrow(
      /comparisonSmoke must be an object or null/
    );
    expect(() =>
      evaluateLabviewContainerDiagnostics(probes({ comparisonSmoke: { ok: 'no', reportExists: false, failureReason: null } as never }))
    ).toThrow(/comparisonSmoke\.ok must be a boolean/);
    expect(() =>
      evaluateLabviewContainerDiagnostics(
        probes({ comparisonSmoke: { ok: true, reportExists: true, failureReason: 5 } as never })
      )
    ).toThrow(/comparisonSmoke\.failureReason must be a string or null/);
  });
});
