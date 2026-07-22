import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const spike = require('../../scripts/vagrantEmptySwapSpike.cjs');

const {
  GUEST_WORKSPACE,
  GUEST_CORPUS_REPO,
  GUEST_VI_PATH,
  LV_VERSION,
  LV_BITNESS,
  buildSpikeMatrix,
  buildSpikeCaseGuestScript,
  parseArgs,
  main
} = spike;

const PATHS = {
  workspace: GUEST_WORKSPACE,
  corpusRepo: GUEST_CORPUS_REPO,
  viPath: GUEST_VI_PATH,
  out: 'C:\\vihs-proof-tmp',
  lvVersion: LV_VERSION,
  lvBitness: LV_BITNESS
};

describe('vagrantEmptySwapSpike.buildSpikeMatrix (VHS-REQ-706.1)', () => {
  it('defines the control + directional probe cases in order, all host-native headless', () => {
    const matrix = buildSpikeMatrix({
      CONTROL_BASE: 'ctrlbase',
      CONTROL_HEAD: 'ctrlhead',
      EMPTY_SHA: 'emptysha',
      RICH_SHA: 'richsha'
    });
    expect(matrix.map((c) => c.label)).toEqual(['control-full-full', 'empty2rich', 'rich2empty']);
    // Directional-asymmetry probe: rich2empty is the reverse of empty2rich.
    const empty2rich = matrix.find((c) => c.label === 'empty2rich');
    const rich2empty = matrix.find((c) => c.label === 'rich2empty');
    expect(empty2rich).toMatchObject({ base: 'emptysha', selected: 'richsha' });
    expect(rich2empty).toMatchObject({ base: 'richsha', selected: 'emptysha' });
    // All cases run headless (the only mode WinRM can drive).
    expect(matrix.every((c) => c.headless === true)).toBe(true);
    // The control pair is the known-good full-vs-full baseline.
    expect(matrix[0]).toMatchObject({ base: 'ctrlbase', selected: 'ctrlhead' });
  });

  it('leaves base/selected empty when the corpus SHAs are unset', () => {
    const matrix = buildSpikeMatrix({});
    expect(matrix.every((c) => c.base === '' && c.selected === '')).toBe(true);
  });
});

describe('vagrantEmptySwapSpike.buildSpikeCaseGuestScript (VHS-REQ-706.2)', () => {
  const script = buildSpikeCaseGuestScript(PATHS, {
    label: 'empty2rich',
    base: 'emptysha',
    selected: 'richsha',
    headless: true
  });

  it('forces the host-native x86 2026 headless env contract and never a container/x64 provider', () => {
    expect(script).toContain('$env:WIN_LV_BITNESS = "x86"');
    expect(script).toContain('$env:WIN_LV_VERSION = "2026"');
    // WinRM has no interactive desktop, so every automated case must be headless.
    expect(script).toContain('$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = "1"');
    expect(script).not.toContain('WIN_LV_BITNESS = "x64"');
    expect(script).not.toContain('WIN_PROVIDER = "docker"');
  });

  it('wires the per-case label and base/selected revisions', () => {
    expect(script).toContain('$env:CASE_LABEL = "empty2rich"');
    expect(script).toContain('$env:WIN_BASE = "emptysha"');
    expect(script).toContain('$env:WIN_SELECTED = "richsha"');
  });

  it('fails fast in-guest and runs the committed guest driver with node (npm run is blocked)', () => {
    expect(script).toContain('$ErrorActionPreference = "Stop"');
    expect(script).toContain('cd C:\\vihs-workspace');
    expect(script).toContain('node vagrant\\empty-swap-hostnative-driver.cjs');
    expect(script).not.toContain('npm run');
  });

  it('points the corpus repo and VI path at the git-swap corpus', () => {
    expect(script).toContain(`$env:WIN_ICON_REPO = "${GUEST_CORPUS_REPO}"`);
    expect(script).toContain(`$env:WIN_VI_PATH = "${GUEST_VI_PATH}"`);
    expect(script).toContain(`$env:VIHS_WIN_REPO_ROOT = "${GUEST_WORKSPACE}"`);
  });
});

describe('vagrantEmptySwapSpike.parseArgs (VHS-REQ-706.3)', () => {
  it('parses --skip-up and --out', () => {
    expect(parseArgs(['--skip-up']).options).toMatchObject({ skipUp: true });
    expect(parseArgs(['--out', 'C:\\tmp']).options).toMatchObject({ out: 'C:\\tmp' });
  });

  it('fails fast on --out without a value and on unknown arguments', () => {
    expect(parseArgs(['--out']).error).toMatch(/requires a directory value/);
    expect(parseArgs(['--out', '--skip-up']).error).toMatch(/requires a directory value/);
    expect(parseArgs(['--bogus']).error).toMatch(/Unknown argument/);
  });
});

describe('vagrantEmptySwapSpike.main (VHS-REQ-706.3)', () => {
  function withCorpusEnv(fn: () => void): void {
    const keys = ['CONTROL_BASE', 'CONTROL_HEAD', 'EMPTY_SHA', 'RICH_SHA'];
    const saved = new Map(keys.map((k) => [k, process.env[k]]));
    const savedArgv = process.argv;
    const savedExitCode = process.exitCode;
    process.env.CONTROL_BASE = 'ctrlbase';
    process.env.CONTROL_HEAD = 'ctrlhead';
    process.env.EMPTY_SHA = 'emptysha';
    process.env.RICH_SHA = 'richsha';
    try {
      fn();
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
      process.argv = savedArgv;
      process.exitCode = savedExitCode;
    }
  }

  it('compiles on the host first, then runs each case in-guest via the injected runner (--skip-up)', () => {
    withCorpusEnv(() => {
      const calls: Array<{ command: string; args: string[] }> = [];
      const run = (command: string, args: string[]) => {
        calls.push({ command, args });
        return { status: 0 } as { status: number };
      };
      process.argv = ['node', 'vagrantEmptySwapSpike.cjs', '--skip-up'];
      const { outcomes, controlHealthy } = main({ run });
      // Host compile happens before any guest work; no `vagrant up` under --skip-up.
      expect(calls[0]).toMatchObject({ command: 'npm', args: ['run', 'compile'] });
      expect(calls.some((c) => c.command === 'vagrant' && c.args[0] === 'up')).toBe(false);
      const powershellCalls = calls.filter((c) => c.command === 'vagrant' && c.args[0] === 'powershell');
      expect(powershellCalls).toHaveLength(3);
      expect(outcomes.map((o: { label: string }) => o.label)).toEqual([
        'control-full-full',
        'empty2rich',
        'rich2empty'
      ]);
      expect(controlHealthy).toBe(true);
    });
  });

  it('fails closed (exitCode 1, controlHealthy false) when the control case does not succeed', () => {
    withCorpusEnv(() => {
      const run = (command: string, args: string[]) => {
        // npm compile + vagrant up succeed; the control powershell case fails.
        if (command === 'vagrant' && args[0] === 'powershell' && args[2].includes('control-full-full')) {
          return { status: 1 } as { status: number };
        }
        return { status: 0 } as { status: number };
      };
      process.argv = ['node', 'vagrantEmptySwapSpike.cjs', '--skip-up'];
      const { controlHealthy } = main({ run });
      expect(controlHealthy).toBe(false);
      expect(process.exitCode).toBe(1);
    });
  });
});
