import { describe, expect, it } from 'vitest';
import {
  evaluateLabviewContainerDiagnostics,
  buildVariantReadinessMatrix,
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

  it('fails critically when lvcompare is absent (lvmerge is out of scope)', () => {
    const r = evaluateLabviewContainerDiagnostics(probes({ lvcomparePresent: false }));
    expect(r.checks.find((c) => c.checkId === 'lvcompare-present')?.status).toBe('fail');
    expect(r.failures).toContain('lvcompare-present');
    expect(r.readyToCompare).toBe(false);
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
});

describe('buildVariantReadinessMatrix (VHS-REQ-710.6)', () => {
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

  it('aggregates per-variant diagnostics into a readiness matrix', () => {
    const container = evaluateLabviewContainerDiagnostics(probes({ variant: 'linux-container' }));
    const host = evaluateLabviewContainerDiagnostics(
      probes({ variant: 'linux-host-native', dockerCliAvailable: false, dockerServerVersion: null, imagePresent: false })
    );
    const matrix = buildVariantReadinessMatrix([container, host]);
    expect(matrix.variants.map((v) => v.variant)).toEqual(['linux-container', 'linux-host-native']);
    expect(matrix.anyReady).toBe(true);
    expect(matrix.allReady).toBe(true);
    expect(matrix.summary).toMatch(/2\/2 variant/);
  });

  it('reports allReady false when one variant is not ready', () => {
    const ok = evaluateLabviewContainerDiagnostics(probes({ variant: 'linux-container' }));
    const bad = evaluateLabviewContainerDiagnostics(probes({ variant: 'linux-container', imagePresent: false }));
    const matrix = buildVariantReadinessMatrix([ok, bad]);
    expect(matrix.anyReady).toBe(true);
    expect(matrix.allReady).toBe(false);
  });

  it('fails closed on an empty input', () => {
    expect(() => buildVariantReadinessMatrix([])).toThrow(/non-empty/);
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
});
