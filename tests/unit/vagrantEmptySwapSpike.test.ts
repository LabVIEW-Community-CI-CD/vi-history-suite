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
  it('defines the four probe cases in order with correct directions and headless axis', () => {
    const matrix = buildSpikeMatrix({
      CONTROL_BASE: 'ctrlbase',
      CONTROL_HEAD: 'ctrlhead',
      EMPTY_SHA: 'emptysha',
      RICH_SHA: 'richsha'
    });
    expect(matrix.map((c) => c.label)).toEqual([
      'control-full-full',
      'empty2rich',
      'rich2empty',
      'empty2rich-headless'
    ]);
    // Directional-asymmetry probe: rich2empty is the reverse of empty2rich.
    const empty2rich = matrix.find((c) => c.label === 'empty2rich');
    const rich2empty = matrix.find((c) => c.label === 'rich2empty');
    expect(empty2rich).toMatchObject({ base: 'emptysha', selected: 'richsha', headless: false });
    expect(rich2empty).toMatchObject({ base: 'richsha', selected: 'emptysha', headless: false });
    // Only the dedicated case runs headless.
    expect(matrix.filter((c) => c.headless).map((c) => c.label)).toEqual(['empty2rich-headless']);
    // The control pair is the known-good full-vs-full baseline.
    expect(matrix[0]).toMatchObject({ base: 'ctrlbase', selected: 'ctrlhead', headless: false });
  });

  it('leaves base/selected empty when the corpus SHAs are unset', () => {
    const matrix = buildSpikeMatrix({});
    expect(matrix.every((c) => c.base === '' && c.selected === '')).toBe(true);
  });
});

describe('vagrantEmptySwapSpike.buildSpikeCaseGuestScript (VHS-REQ-706.2)', () => {
  const interactive = buildSpikeCaseGuestScript(PATHS, {
    label: 'empty2rich',
    base: 'emptysha',
    selected: 'richsha',
    headless: false
  });

  it('forces the host-native x86 2026 env contract and never a container/x64 provider', () => {
    expect(interactive).toContain('$env:WIN_LV_BITNESS = "x86"');
    expect(interactive).toContain('$env:WIN_LV_VERSION = "2026"');
    expect(interactive).not.toContain('WIN_LV_BITNESS = "x64"');
    expect(interactive).not.toContain('WIN_PROVIDER = "docker"');
  });

  it('wires the per-case label, base/selected, and interactive headless flag', () => {
    expect(interactive).toContain('$env:CASE_LABEL = "empty2rich"');
    expect(interactive).toContain('$env:WIN_BASE = "emptysha"');
    expect(interactive).toContain('$env:WIN_SELECTED = "richsha"');
    expect(interactive).toContain('$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = "0"');
  });

  it('sets headless=1 only for the headless case', () => {
    const headless = buildSpikeCaseGuestScript(PATHS, {
      label: 'empty2rich-headless',
      base: 'emptysha',
      selected: 'richsha',
      headless: true
    });
    expect(headless).toContain('$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = "1"');
  });

  it('fails fast in-guest and runs the committed guest driver with node (npm run is blocked)', () => {
    expect(interactive).toContain('$ErrorActionPreference = "Stop"');
    expect(interactive).toContain('cd C:\\vihs-workspace');
    expect(interactive).toContain('node vagrant\\empty-swap-hostnative-driver.cjs');
    expect(interactive).not.toContain('npm run');
  });

  it('points the corpus repo and VI path at the git-swap corpus', () => {
    expect(interactive).toContain(`$env:WIN_ICON_REPO = "${GUEST_CORPUS_REPO}"`);
    expect(interactive).toContain(`$env:WIN_VI_PATH = "${GUEST_VI_PATH}"`);
    expect(interactive).toContain(`$env:VIHS_WIN_REPO_ROOT = "${GUEST_WORKSPACE}"`);
  });
});

describe('vagrantEmptySwapSpike.parseArgs + main (VHS-REQ-706.3)', () => {
  it('parses --skip-up and --out', () => {
    expect(parseArgs(['--skip-up'])).toMatchObject({ skipUp: true });
    expect(parseArgs(['--out', 'C:\\tmp'])).toMatchObject({ out: 'C:\\tmp' });
  });

  it('runs every matrix case in-guest without a real VM via the injected runner, skipping vagrant up', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const run = (command: string, args: string[]) => {
      calls.push({ command, args });
      return { status: 0 } as { status: number };
    };
    process.env.CONTROL_BASE = 'ctrlbase';
    process.env.CONTROL_HEAD = 'ctrlhead';
    process.env.EMPTY_SHA = 'emptysha';
    process.env.RICH_SHA = 'richsha';
    const argv = process.argv;
    process.argv = ['node', 'vagrantEmptySwapSpike.cjs', '--skip-up'];
    try {
      const outcomes = main({ run });
      // One guest powershell invocation per matrix case; no `vagrant up` under --skip-up.
      expect(calls.every((c) => c.command === 'vagrant')).toBe(true);
      expect(calls.some((c) => c.args[0] === 'up')).toBe(false);
      const powershellCalls = calls.filter((c) => c.args[0] === 'powershell');
      expect(powershellCalls).toHaveLength(4);
      expect(outcomes.map((o: { label: string }) => o.label)).toEqual([
        'control-full-full',
        'empty2rich',
        'rich2empty',
        'empty2rich-headless'
      ]);
    } finally {
      process.argv = argv;
      delete process.env.CONTROL_BASE;
      delete process.env.CONTROL_HEAD;
      delete process.env.EMPTY_SHA;
      delete process.env.RICH_SHA;
    }
  });
});
