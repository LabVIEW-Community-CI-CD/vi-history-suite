import { describe, expect, it } from 'vitest';
import {
  main,
  parseArgs,
  gatherProbes,
  buildSchema,
  SCHEMA_ID
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} from '../../scripts/diagnoseLabviewContainer.js';
import {
  evaluateLabviewContainerDiagnostics,
  buildVariantReadinessMatrix
} from '../../src/reporting/containerDiagnostics/labviewContainerDiagnostics';

// VHS-REQ-710.3 — the diagnostics CLI. Docker probing is dependency-injected so
// these run without a container; the real pure engine is injected for parity.

const READY_IN_CONTAINER = JSON.stringify({
  labviewCliPath: '/usr/local/bin/LabVIEWCLI',
  labviewEnginePath: '/usr/local/natinst/LabVIEW-2026-64',
  labviewYear: '2026',
  lvcompare: true,
  licensing: 'activated'
});

function fakeDocker(readings) {
  return (args) => {
    if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
    if (args[0] === 'image' && args[1] === 'inspect') {
      return readings.imagePresent ? { ok: true, stdout: '5140000000\n', code: 0 } : { ok: false, stdout: '', stderr: 'No such image', code: 1 };
    }
    if (args[0] === 'run') return { ok: true, stdout: `${readings.inContainer}\n`, code: 0 };
    return { ok: false, stdout: '', code: 1 };
  };
}

function harness(readings, extra = {}) {
  const out = [];
  const err = [];
  return {
    out,
    err,
    deps: {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: (s) => err.push(s) },
      which: () => true,
      runDocker: fakeDocker(readings),
      evaluate: evaluateLabviewContainerDiagnostics,
      ...extra
    }
  };
}

describe('diagnoseLabviewContainer CLI (VHS-REQ-710.3)', () => {
  it('parses image, smoke, and output flags', () => {
    const o = parseArgs(['--image', 'x/y:z', '--smoke', '--json']);
    expect(o.image).toBe('x/y:z');
    expect(o.smoke).toBe(true);
    expect(o.json).toBe(true);
  });

  it('rejects mutually exclusive output modes and unknown flags', () => {
    expect(() => parseArgs(['--json', '--schema'])).toThrow(/mutually exclusive/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });

  it('exits 0 and reports ready when the container is fully set up', () => {
    const { deps, out } = harness({ imagePresent: true, inContainer: READY_IN_CONTAINER });
    expect(main(['--json'], deps)).toBe(0);
    const packet = JSON.parse(out.join(''));
    expect(packet.readyToCompare).toBe(true);
    expect(packet.variant).toBe('linux-container');
  });

  it('exits 1 (fail-closed) when the image is not present', () => {
    const { deps } = harness({ imagePresent: false, inContainer: '' });
    expect(main([], deps)).toBe(1);
  });

  it('emits the schema without probing under --schema', () => {
    const { deps, out } = harness({ imagePresent: true, inContainer: READY_IN_CONTAINER });
    expect(main(['--schema'], deps)).toBe(0);
    expect(out.join('')).toContain(SCHEMA_ID);
    expect(buildSchema().$id).toBe(SCHEMA_ID);
  });

  it('exits 2 on a bad argument', () => {
    const { deps, err } = harness({ imagePresent: true, inContainer: READY_IN_CONTAINER });
    expect(main(['--nope'], deps)).toBe(2);
    expect(err.join('')).toMatch(/Unknown argument/);
  });

  it('exits 2 with a compile remedy when the engine cannot be loaded', () => {
    const out = [];
    const err = [];
    const deps = {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: (s) => err.push(s) },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: true, inContainer: READY_IN_CONTAINER }),
      cwd: '/no-compiled-out-here'
      // no injected evaluate -> require(out/...) throws -> exit 2
    };
    expect(main(['--json'], deps)).toBe(2);
    expect(err.join('')).toMatch(/npm run compile/);
  });

  it('gathers fail-closed probes when docker is unavailable', () => {
    const probes = gatherProbes({ image: 'a/b:c' }, { which: () => false, runDocker: () => ({ ok: false, stdout: '', code: 1 }) });
    expect(probes.dockerCliAvailable).toBe(false);
    expect(probes.imagePresent).toBe(false);
    expect(probes.imageRef).toBe('a/b:c');
  });

  it('parses --variant and rejects an unknown variant (VHS-REQ-710.5)', () => {
    expect(parseArgs(['--variant', 'linux-host-native']).variant).toBe('linux-host-native');
    expect(() => parseArgs(['--variant', 'mars'])).toThrow(/linux-container or linux-host-native/);
  });

  it('gathers host-native probes via the injected host runner (VHS-REQ-710.5)', () => {
    const runHost = (script) => {
      if (script.includes('command -v LabVIEWCLI')) return { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
      if (script.includes('LabVIEW-*-64')) return { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 };
      if (script.includes('lvcompare')) return { ok: true, stdout: 'true\n', code: 0 };
      return { ok: true, stdout: '', code: 0 };
    };
    const p = gatherProbes({ image: 'x', variant: 'linux-host-native' }, { runHost });
    expect(p.variant).toBe('linux-host-native');
    expect(p.labviewCliPath).toBe('/usr/local/bin/LabVIEWCLI');
    expect(p.labviewEnginePath).toBe('/usr/local/natinst/LabVIEW-2026-64');
    expect(p.lvcomparePresent).toBe(true);
    expect(p.dockerCliAvailable).toBe(false);
  });

  it('main exits 0 for a ready host-native install (VHS-REQ-710.5)', () => {
    const out = [];
    const runHost = (script) =>
      script.includes('lvcompare')
        ? { ok: true, stdout: 'true\n', code: 0 }
        : script.includes('LabVIEW-*-64')
          ? { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 }
          : { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
    const deps = {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: () => {} },
      runHost,
      evaluate: evaluateLabviewContainerDiagnostics
    };
    expect(main(['--variant', 'linux-host-native', '--json'], deps)).toBe(0);
    expect(JSON.parse(out.join('')).variant).toBe('linux-host-native');
  });

  it('emits an all-variants readiness matrix under --all-variants (VHS-REQ-710.6)', () => {
    const out = [];
    const runHost = (script) =>
      script.includes('lvcompare')
        ? { ok: true, stdout: 'true\n', code: 0 }
        : script.includes('LabVIEW-*-64')
          ? { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 }
          : { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
    const deps = {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: () => {} },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: true, inContainer: READY_IN_CONTAINER }),
      runHost,
      evaluate: evaluateLabviewContainerDiagnostics,
      buildMatrix: buildVariantReadinessMatrix
    };
    expect(main(['--all-variants', '--json'], deps)).toBe(0);
    const matrix = JSON.parse(out.join(''));
    expect(matrix.variants.map((v) => v.variant)).toEqual(['linux-container', 'linux-host-native']);
    expect(matrix.allReady).toBe(true);
  });

  it('prints usage under --help without probing (VHS-REQ-710.3)', () => {
    const { deps, out } = harness({ imagePresent: true, inContainer: READY_IN_CONTAINER });
    expect(main(['--help'], deps)).toBe(0);
    expect(out.join('')).toMatch(/--variant|--all-variants|Usage|diagnose/i);
  });

  it('renders a Markdown verdict under --markdown (VHS-REQ-710.3)', () => {
    const { deps, out } = harness({ imagePresent: true, inContainer: READY_IN_CONTAINER });
    expect(main(['--markdown'], deps)).toBe(0);
    const text = out.join('');
    expect(text).toContain('## NI LabVIEW diagnostics');
    expect(text).toContain('| Check | Status | Detail | Remediation |');
  });

  it('renders a not-ready Markdown verdict with remediation and next action (VHS-REQ-710.2)', () => {
    const { deps, out } = harness({ imagePresent: false, inContainer: '' });
    expect(main(['--markdown'], deps)).toBe(1);
    const text = out.join('');
    expect(text).toContain('❌ no');
    expect(text).toContain('**Next action:**');
  });

  it('renders a not-ready text verdict with remediation and next action (VHS-REQ-710.2)', () => {
    const { deps, out } = harness({ imagePresent: false, inContainer: '' });
    expect(main([], deps)).toBe(1);
    const text = out.join('');
    expect(text).toContain('readyToCompare=false');
    expect(text).toContain('next:');
    expect(text).toMatch(/→/);
  });

  it('renders the all-variants matrix as text without --json (VHS-REQ-710.6)', () => {
    const out = [];
    const runHost = (script) =>
      script.includes('lvcompare')
        ? { ok: true, stdout: 'true\n', code: 0 }
        : script.includes('LabVIEW-*-64')
          ? { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 }
          : { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
    const deps = {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: () => {} },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: true, inContainer: READY_IN_CONTAINER }),
      runHost,
      evaluate: evaluateLabviewContainerDiagnostics,
      buildMatrix: buildVariantReadinessMatrix
    };
    expect(main(['--all-variants'], deps)).toBe(0);
    const text = out.join('');
    expect(text).toContain('all-variants readiness matrix');
    expect(text).toMatch(/linux-container|linux-host-native/);
  });

  it('renders a not-ready variant in the matrix text (VHS-REQ-710.6)', () => {
    const out = [];
    // Host-native ready, container NOT ready (image absent) -> mixed matrix with
    // a not-ready row carrying a next action.
    const runHost = (script) =>
      script.includes('lvcompare')
        ? { ok: true, stdout: 'true\n', code: 0 }
        : script.includes('LabVIEW-*-64')
          ? { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 }
          : { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
    const deps = {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: () => {} },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: false, inContainer: '' }),
      runHost,
      evaluate: evaluateLabviewContainerDiagnostics,
      buildMatrix: buildVariantReadinessMatrix
    };
    expect(main(['--all-variants'], deps)).toBe(0);
    const text = out.join('');
    expect(text).toContain('✘ not-ready');
    expect(text).toContain('✔ ready');
    expect(text).toMatch(/→/);
  });

  it('gatherProbes: an image with a non-numeric reported size yields a null imageSizeBytes (VHS-REQ-710.3)', () => {
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
      if (args[0] === 'image' && args[1] === 'inspect') return { ok: true, stdout: 'not-a-number\n', code: 0 };
      if (args[0] === 'run') return { ok: true, stdout: `${READY_IN_CONTAINER}\n`, code: 0 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z' }, { which: () => true, runDocker });
    expect(p.imagePresent).toBe(true);
    expect(p.imageSizeBytes).toBeNull();
    expect(p.labviewCliPath).toBe('/usr/local/bin/LabVIEWCLI');
  });

  it('gatherProbes: an unreachable daemon leaves the server version null and the image absent (VHS-REQ-710.3)', () => {
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: false, stdout: '', stderr: 'cannot connect to the docker daemon', code: 1 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z' }, { which: () => true, runDocker });
    expect(p.dockerCliAvailable).toBe(true);
    expect(p.dockerServerVersion).toBeNull();
    expect(p.imagePresent).toBe(false);
  });

  it('gatherProbes: a non-JSON in-container probe line is swallowed and tool defaults are kept (VHS-REQ-710.3)', () => {
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
      if (args[0] === 'image' && args[1] === 'inspect') return { ok: true, stdout: '5140000000\n', code: 0 };
      if (args[0] === 'run') return { ok: true, stdout: 'this is not json at all\n', code: 0 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z' }, { which: () => true, runDocker });
    expect(p.imagePresent).toBe(true);
    expect(p.labviewCliPath).toBeNull();
    expect(p.lvcomparePresent).toBe(false);
    expect(p.licensing).toBe('unknown');
  });

  it('gatherProbes: an out-of-range in-container licensing value falls back to unknown (VHS-REQ-710.3)', () => {
    const inContainer = JSON.stringify({
      labviewCliPath: '/usr/local/bin/LabVIEWCLI',
      labviewEnginePath: '/usr/local/natinst/LabVIEW-2026-64',
      labviewYear: '2026',
      lvcompare: true,
      licensing: 'super-activated'
    });
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
      if (args[0] === 'image' && args[1] === 'inspect') return { ok: true, stdout: '5140000000\n', code: 0 };
      if (args[0] === 'run') return { ok: true, stdout: `${inContainer}\n`, code: 0 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z' }, { which: () => true, runDocker });
    expect(p.labviewCliPath).toBe('/usr/local/bin/LabVIEWCLI');
    expect(p.licensing).toBe('unknown');
  });

  it('gatherProbes: --smoke launches LabVIEWCLI in-container and records the version (VHS-REQ-710.4)', () => {
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
      if (args[0] === 'image' && args[1] === 'inspect') return { ok: true, stdout: '5140000000\n', code: 0 };
      if (args[0] === 'run' && String(args[args.length - 1]).includes('LabVIEWCLI -Version')) {
        return { ok: true, stdout: 'LabVIEWCLI 24.5.1f0\n', code: 0 };
      }
      if (args[0] === 'run') return { ok: true, stdout: `${READY_IN_CONTAINER}\n`, code: 0 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z', smoke: true }, { which: () => true, runDocker });
    expect(p.cliLaunch).not.toBeNull();
    expect(p.cliLaunch.ok).toBe(true);
    expect(p.cliLaunch.version).toBe('LabVIEWCLI 24.5.1f0');
  });

  it('gatherHostNativeProbes: --smoke launches the host CLI and a yearless engine yields a null year (VHS-REQ-710.5)', () => {
    const runHost = (script: string) => {
      if (script.includes('command -v LabVIEWCLI')) return { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
      if (script.includes('LabVIEW-*-64')) return { ok: true, stdout: '/opt/labview-current\n', code: 0 };
      if (script.includes('lvcompare')) return { ok: true, stdout: 'true\n', code: 0 };
      if (script.includes('LabVIEWCLI -Version')) return { ok: true, stdout: 'LabVIEWCLI 24.5.1f0\n', code: 0 };
      return { ok: true, stdout: '', code: 0 };
    };
    const p = gatherProbes({ image: 'x', variant: 'linux-host-native', smoke: true }, { runHost });
    expect(p.labviewYear).toBeNull();
    expect(p.cliLaunch).not.toBeNull();
    expect(p.cliLaunch.version).toBe('LabVIEWCLI 24.5.1f0');
  });

  it('main --all-variants exits 2 when the matrix engine cannot be loaded (VHS-REQ-710.6)', () => {
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: true, inContainer: READY_IN_CONTAINER }),
      runHost: () => ({ ok: true, stdout: '', code: 0 }),
      evaluate: evaluateLabviewContainerDiagnostics,
      cwd: '/no-compiled-out-here'
      // buildMatrix not injected -> require(out/...) throws -> exit 2
    };
    expect(main(['--all-variants', '--json'], deps)).toBe(2);
    expect(err.join('')).toMatch(/npm run compile/);
  });

  it('main --all-variants exits 2 when the matrix builder throws (VHS-REQ-710.6)', () => {
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: true, inContainer: READY_IN_CONTAINER }),
      runHost: () => ({ ok: true, stdout: '', code: 0 }),
      evaluate: evaluateLabviewContainerDiagnostics,
      buildMatrix: () => {
        throw new Error('boom-matrix');
      }
    };
    expect(main(['--all-variants', '--json'], deps)).toBe(2);
    expect(err.join('')).toMatch(/boom-matrix/);
  });

  it('main --all-variants exits 1 when no variant is ready to compare (VHS-REQ-710.6)', () => {
    const out: string[] = [];
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => {} },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: false, inContainer: '' }),
      runHost: () => ({ ok: true, stdout: '', code: 0 }),
      evaluate: evaluateLabviewContainerDiagnostics,
      buildMatrix: buildVariantReadinessMatrix
    };
    expect(main(['--all-variants'], deps)).toBe(1);
    const text = out.join('');
    expect(text).toContain('0/2 variant');
    expect(text).toContain('✘ not-ready');
  });

  it('main exits 2 when the diagnostics engine throws during evaluation (VHS-REQ-710.3)', () => {
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      which: () => true,
      runDocker: fakeDocker({ imagePresent: true, inContainer: READY_IN_CONTAINER }),
      evaluate: () => {
        throw new Error('boom-eval');
      }
    };
    expect(main(['--json'], deps)).toBe(2);
    expect(err.join('')).toMatch(/boom-eval/);
  });

  it('gatherProbes: --smoke with a version-less failed launch records a null version and ok=false (VHS-REQ-710.4)', () => {
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
      if (args[0] === 'image' && args[1] === 'inspect') return { ok: true, stdout: '5140000000\n', code: 0 };
      if (args[0] === 'run' && String(args[args.length - 1]).includes('LabVIEWCLI -Version')) {
        // No line matches \d+\.\d+ -> versionLine resolves to null; a non-zero
        // exit surfaces ok=false.
        return { ok: false, stdout: 'no version string here\n', code: 3 };
      }
      if (args[0] === 'run') return { ok: true, stdout: `${READY_IN_CONTAINER}\n`, code: 0 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z', smoke: true }, { which: () => true, runDocker });
    expect(p.cliLaunch).not.toBeNull();
    expect(p.cliLaunch.ok).toBe(false);
    expect(p.cliLaunch.version).toBeNull();
    expect(p.cliLaunch.exitCode).toBe(3);
  });

  it('gatherProbes: --smoke is a no-op when the container reports no LabVIEWCLI path (VHS-REQ-710.4)', () => {
    const inContainer = JSON.stringify({
      labviewCliPath: '',
      labviewEnginePath: '/usr/local/natinst/LabVIEW-2026-64',
      labviewYear: '2026',
      lvcompare: true,
      licensing: 'activated'
    });
    const runDocker = (args: string[]) => {
      if (args[0] === 'version') return { ok: true, stdout: '29.3.1\n', code: 0 };
      if (args[0] === 'image' && args[1] === 'inspect') return { ok: true, stdout: '5140000000\n', code: 0 };
      if (args[0] === 'run') return { ok: true, stdout: `${inContainer}\n`, code: 0 };
      return { ok: false, stdout: '', code: 1 };
    };
    const p = gatherProbes({ image: 'x/y:z', smoke: true }, { which: () => true, runDocker });
    expect(p.labviewCliPath).toBeNull();
    expect(p.cliLaunch).toBeNull();
  });

  it('gatherHostNativeProbes: --smoke is a no-op without a host CLI and reports lvcompare absent (VHS-REQ-710.5)', () => {
    const runHost = (script: string) => {
      if (script.includes('command -v LabVIEWCLI')) return { ok: true, stdout: '\n', code: 0 };
      if (script.includes('LabVIEW-*-64')) return { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 };
      if (script.includes('lvcompare')) return { ok: true, stdout: 'false\n', code: 0 };
      return { ok: true, stdout: '', code: 0 };
    };
    const p = gatherProbes({ image: 'x', variant: 'linux-host-native', smoke: true }, { runHost });
    expect(p.labviewCliPath).toBeNull();
    expect(p.lvcomparePresent).toBe(false);
    expect(p.cliLaunch).toBeNull();
  });

  it('gatherHostNativeProbes: --smoke with a version-less launch records a null version (VHS-REQ-710.5)', () => {
    const runHost = (script: string) => {
      if (script.includes('command -v LabVIEWCLI')) return { ok: true, stdout: '/usr/local/bin/LabVIEWCLI\n', code: 0 };
      if (script.includes('LabVIEW-*-64')) return { ok: true, stdout: '/usr/local/natinst/LabVIEW-2026-64\n', code: 0 };
      if (script.includes('lvcompare')) return { ok: true, stdout: 'true\n', code: 0 };
      if (script.includes('LabVIEWCLI -Version')) return { ok: true, stdout: 'no version here\n', code: 0 };
      return { ok: true, stdout: '', code: 0 };
    };
    const p = gatherProbes({ image: 'x', variant: 'linux-host-native', smoke: true }, { runHost });
    expect(p.cliLaunch).not.toBeNull();
    expect(p.cliLaunch.version).toBeNull();
  });
});

// These tests exercise the real DEFAULT probe runners (defaultRunDocker, the
// default `which` arrow, and the default host-native `runHost` arrow) by NOT
// injecting runDocker/which/runHost and instead injecting a fake execFileSync
// (deps.execFileSync). The default runners therefore execute end-to-end while the
// only real-subprocess seam is replaced, closing the previously-uncovered
// real-spawn branches deterministically. (VHS-REQ-710.3/710.4/710.5.)
describe('diagnoseLabviewContainer default runners over an injected execFileSync (VHS-REQ-710.3)', () => {
  type ExecCall = { command: string; args: readonly string[]; options: unknown };

  function fakeExec(handler: (command: string, args: readonly string[]) => string) {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = [], options?: unknown) => {
      calls.push({ command, args, options });
      return handler(command, args);
    };
    return { exec, calls };
  }

  function execFailure(
    message: string,
    extra: { status?: number; stdout?: string; stderr?: string } = {}
  ): Error {
    const error = new Error(message) as Error & { status?: number; stdout?: string; stderr?: string };
    if (extra.status !== undefined) error.status = extra.status;
    if (extra.stdout !== undefined) error.stdout = extra.stdout;
    if (extra.stderr !== undefined) error.stderr = extra.stderr;
    return error;
  }

  it('main --json drives defaultRunDocker + the default which runner and reports ready (VHS-REQ-710.3)', () => {
    const { exec, calls } = fakeExec((command, args) => {
      if (command === 'sh') return ''; // which('docker') via `command -v docker` succeeds
      if (command === 'docker') {
        if (args[0] === 'version') return '29.3.1\n';
        if (args[0] === 'image' && args[1] === 'inspect') return '5140000000\n';
        if (args[0] === 'run') return `${READY_IN_CONTAINER}\n`;
      }
      return '';
    });
    const out: string[] = [];
    // No runDocker/which injected -> the DEFAULT runners run against the fake exec.
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => {} },
      evaluate: evaluateLabviewContainerDiagnostics,
      execFileSync: exec
    };
    expect(main(['--json'], deps)).toBe(0);
    const packet = JSON.parse(out.join(''));
    expect(packet.readyToCompare).toBe(true);
    expect(packet.variant).toBe('linux-container');
    // Proves the real default runners shelled out: `sh` (default which) + `docker`.
    const commands = calls.map((call) => call.command);
    expect(commands).toContain('sh');
    expect(commands).toContain('docker');
  });

  it('the default which runner returns false when `command -v docker` throws (VHS-REQ-710.3)', () => {
    const { exec, calls } = fakeExec((command, args) => {
      if (command === 'sh' && String(args[1]).includes('command -v docker')) {
        throw execFailure('not found', { status: 1 });
      }
      return '';
    });
    // No which injected -> the default which arrow's catch (return false) executes.
    const probes = gatherProbes(
      { image: 'nationalinstruments/labview:x', variant: 'linux-container' },
      { execFileSync: exec }
    );
    expect(probes.dockerCliAvailable).toBe(false);
    expect(probes.imagePresent).toBe(false);
    // Docker was never probed because the CLI check failed closed.
    expect(calls.some((call) => call.command === 'docker')).toBe(false);
  });

  it('defaultRunDocker returns ok=false (with the exit status) when the docker CLI throws (VHS-REQ-710.3)', () => {
    const { exec, calls } = fakeExec((command) => {
      if (command === 'sh') return ''; // which('docker')=true
      if (command === 'docker') {
        throw execFailure('docker: daemon not running', { status: 125, stdout: '', stderr: 'cannot connect' });
      }
      return '';
    });
    // No runDocker injected -> defaultRunDocker's catch branch executes.
    const probes = gatherProbes(
      { image: 'nationalinstruments/labview:x', variant: 'linux-container' },
      { execFileSync: exec }
    );
    expect(probes.dockerCliAvailable).toBe(true);
    expect(probes.dockerServerVersion).toBeNull();
    expect(probes.imagePresent).toBe(false);
    expect(calls.some((call) => call.command === 'docker')).toBe(true);
  });

  it('defaultRunDocker honors the explicit smoke timeout and records the launched version (VHS-REQ-710.4)', () => {
    const { exec, calls } = fakeExec((command, args) => {
      if (command === 'sh') return '';
      if (command === 'docker') {
        if (args[0] === 'version') return '29.3.1\n';
        if (args[0] === 'image' && args[1] === 'inspect') return '5140000000\n';
        if (args[0] === 'run') {
          const last = String(args[args.length - 1]);
          if (last.includes('LabVIEWCLI -Version')) return 'LabVIEWCLI 24.5.1f0\n';
          return `${READY_IN_CONTAINER}\n`;
        }
      }
      return '';
    });
    const probes = gatherProbes(
      { image: 'nationalinstruments/labview:x', variant: 'linux-container', smoke: true },
      { execFileSync: exec }
    );
    expect(probes.cliLaunch).not.toBeNull();
    expect(probes.cliLaunch.ok).toBe(true);
    expect(probes.cliLaunch.version).toBe('LabVIEWCLI 24.5.1f0');
    // The smoke launch passes an explicit { timeoutMs: 240000 } into defaultRunDocker,
    // exercising the branch where the default timeout is overridden.
    const smokeCall = calls.find(
      (call) => call.command === 'docker' && String(call.args[call.args.length - 1]).includes('LabVIEWCLI -Version')
    );
    expect(smokeCall).toBeDefined();
    expect((smokeCall?.options as { timeout?: number } | undefined)?.timeout).toBe(240000);
  });

  it('main --variant linux-host-native drives the default runHost runner and reports ready (VHS-REQ-710.5)', () => {
    const { exec, calls } = fakeExec((command, args) => {
      const script = command === 'sh' ? String(args[1]) : '';
      if (script.includes('command -v LabVIEWCLI')) return '/usr/local/bin/LabVIEWCLI\n';
      if (script.includes('LabVIEW-*-64')) return '/usr/local/natinst/LabVIEW-2026-64\n';
      if (script.includes('lvcompare')) return 'true\n';
      return '';
    });
    const out: string[] = [];
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => {} },
      evaluate: evaluateLabviewContainerDiagnostics,
      execFileSync: exec
    };
    expect(main(['--variant', 'linux-host-native', '--json'], deps)).toBe(0);
    const packet = JSON.parse(out.join(''));
    expect(packet.variant).toBe('linux-host-native');
    expect(packet.readyToCompare).toBe(true);
    // The host runner shells out via `sh -lc <script>` only (never docker).
    const commands = calls.map((call) => call.command);
    expect(commands).toContain('sh');
    expect(commands).not.toContain('docker');
  });

  it('the default runHost runner returns ok=false when `sh` throws, leaving the host CLI unresolved (VHS-REQ-710.5)', () => {
    const { exec, calls } = fakeExec(() => {
      throw execFailure('sh: not available', { status: 127, stdout: '' });
    });
    // No runHost injected -> the default host-native runHost arrow's catch executes.
    const probes = gatherProbes({ image: 'x', variant: 'linux-host-native' }, { execFileSync: exec });
    expect(probes.variant).toBe('linux-host-native');
    expect(probes.labviewCliPath).toBeNull();
    expect(probes.labviewEnginePath).toBeNull();
    expect(probes.lvcomparePresent).toBe(false);
    // The host runner only ever invokes `sh`.
    expect(calls.every((call) => call.command === 'sh')).toBe(true);
  });
});
