#!/usr/bin/env node

/*
 * #2295 host-native empty-swap feasibility spike — automated Vagrant host wrapper
 * (VHS-REQ-706, feasibility spike governed by ADR-0027).
 *
 * Determines whether the empty->rich comparison `Error 66` /
 * `linux-headless-recursive-load` blocker is a Linux-headless ENVIRONMENT
 * artifact or an INTRINSIC empty->rich asymmetry, by rerunning the comparison on
 * the host-native Windows LabVIEW runtime and comparing typed outcomes across a
 * small case matrix.
 *
 * This is the AUTOMATED host wrapper (maintainer-run, non-interactive): it brings
 * the Vagrant Windows/LabVIEW guest up and runs, over WinRM, the committed
 * in-guest driver vagrant/empty-swap-hostnative-driver.cjs once per matrix case,
 * capturing each case's VIHS_SPIKE_RESULT_JSON. It never runs in hosted CI (needs
 * the local hypervisor + host LabVIEW); it is a .cjs so it stays outside the
 * scripts/*.js traceability glob and is not shipped.
 *
 * Corpus (maintainer prepares once, then passes SHAs via env): a git-swap repo —
 * two real commits of ONE tracked path — so the shipped preflight + git tree
 * materializer run unmodified (no blob injection). Cases:
 *   1. control    full  -> full   (known-good pair; MUST succeed = runtime healthy)
 *   2. empty2rich empty -> rich    (the primary probe)
 *   3. rich2empty rich  -> empty   (directional-asymmetry probe)
 *
 * All cases run host-native HEADLESS. WinRM has no interactive desktop, so an
 * unwrapped LabVIEWCLI invocation fails with -350000 (docs/vagrant.md); only the
 * headless prelaunch (LV_RTE_WIN_HOSTNATIVE_HEADLESS=1) works over `vagrant
 * powershell`. That does NOT weaken the experiment: the blocker under test
 * (`linux-headless-recursive-load`) is gated to the LINUX runtime, so a Windows
 * host-native HEADLESS run is a genuinely different environment — success here
 * still shows the blocker was Linux-specific, and an intrinsic asymmetry would
 * still surface the platform-independent `labview-cli-call-by-reference` Error-66.
 * A true interactive-desktop run would need a scheduled-task boundary and is out
 * of scope for this automated lane.
 *
 * Usage:
 *   node scripts/vagrantEmptySwapSpike.cjs [--skip-up] [--out <dir>]
 * Env (all in-guest SHAs of the corpus path WIN_VI_PATH in repo WIN_ICON_REPO):
 *   CONTROL_BASE / CONTROL_HEAD, EMPTY_SHA, RICH_SHA
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vagrantDir = path.join(repoRoot, 'vagrant');

// The Vagrantfile mounts the repo at C:\vihs-workspace; the guest driver reads
// VIHS_WIN_REPO_ROOT (out/) from there and WIN_ICON_REPO for the corpus repo.
const GUEST_WORKSPACE = 'C:\\vihs-workspace';
const GUEST_CORPUS_REPO = 'C:\\repos\\vihs-empty-swap-corpus';
const GUEST_VI_PATH = 'resource/plugins/lv_icon.vi';
const GUEST_OUT = 'C:\\vihs-proof-tmp';
// The Vagrant lane is host-native 32-bit LabVIEW 2026 only.
const LV_VERSION = '2026';
const LV_BITNESS = 'x86';

function log(message) {
  process.stdout.write(`[empty-swap-spike] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[empty-swap-spike] ERROR: ${message}\n`);
  process.exit(1);
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    cwd: options.cwd || repoRoot,
    env: { ...process.env, GH_PAGER: 'cat', HOME: process.env.HOME },
    ...options
  });
}

/**
 * The spike case matrix. Each case names the git-swap base/head revisions of the
 * corpus path. All cases run host-native HEADLESS (the only mode WinRM can drive;
 * see the header), so `headless` is constant true — the environmental-vs-
 * intrinsic question is answered by Windows-headless vs the Linux-headless
 * recursive-load path, not by a headless/interactive axis.
 */
function buildSpikeMatrix(env = process.env) {
  const control = { base: env.CONTROL_BASE || '', head: env.CONTROL_HEAD || '' };
  const empty = env.EMPTY_SHA || '';
  const rich = env.RICH_SHA || '';
  return [
    { label: 'control-full-full', base: control.base, selected: control.head, headless: true },
    { label: 'empty2rich', base: empty, selected: rich, headless: true },
    { label: 'rich2empty', base: rich, selected: empty, headless: true }
  ];
}

/**
 * Pure builder: the in-guest PowerShell for ONE spike case. Extracted and unit-
 * tested because the env contract is load-bearing — host-native x86 forcing
 * (WIN_LV_BITNESS=x86), the per-case base/head/headless wiring, and running the
 * committed guest driver (never a container provider) must not drift.
 */
function buildSpikeCaseGuestScript(paths, caseSpec) {
  const lines = [
    '$ErrorActionPreference = "Stop"',
    `$env:VIHS_WIN_REPO_ROOT = "${paths.workspace}"`,
    `$env:WIN_ICON_REPO = "${paths.corpusRepo}"`,
    `$env:WIN_VI_PATH = "${paths.viPath}"`,
    `$env:VIHS_WIN_OUT = "${paths.out}"`,
    `$env:WIN_LV_VERSION = "${paths.lvVersion}"`,
    // Host-native 32-bit LabVIEW 2026 lane; never x64 or a container provider.
    `$env:WIN_LV_BITNESS = "${paths.lvBitness}"`,
    `$env:CASE_LABEL = "${caseSpec.label}"`,
    `$env:WIN_BASE = "${caseSpec.base}"`,
    `$env:WIN_SELECTED = "${caseSpec.selected}"`,
    // Toggle host-native headless per case. All automated cases run headless
    // (WinRM has no interactive desktop); the builder keeps the flag explicit.
    `$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = "${caseSpec.headless ? '1' : '0'}"`,
    `cd ${paths.workspace}`,
    // npm run is blocked by the guest execution policy; call node directly. out/
    // is built on the HOST before vagrant up and synced via the mount.
    'node vagrant\\empty-swap-hostnative-driver.cjs'
  ];
  return lines.join('; ');
}

function parseArgs(argv) {
  const options = { skipUp: false, out: GUEST_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-up') {
      options.skipUp = true;
    } else if (arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { options, error: '--out requires a directory value.' };
      }
      options.out = value;
      i += 1;
    } else {
      return { options, error: `Unknown argument: ${arg}` };
    }
  }
  return { options };
}

function main(deps = {}) {
  const run = deps.run || defaultRun;
  const { options, error } = parseArgs(process.argv.slice(2));
  if (error) {
    fail(error);
  }
  const paths = {
    workspace: GUEST_WORKSPACE,
    corpusRepo: GUEST_CORPUS_REPO,
    viPath: GUEST_VI_PATH,
    out: options.out,
    lvVersion: LV_VERSION,
    lvBitness: LV_BITNESS
  };

  const matrix = buildSpikeMatrix(process.env);
  const missing = matrix.filter((c) => !c.base || !c.selected).map((c) => c.label);
  if (missing.length > 0) {
    fail(
      `Missing corpus SHAs for case(s): ${missing.join(', ')}. Set CONTROL_BASE/CONTROL_HEAD/EMPTY_SHA/RICH_SHA to the git-swap revisions of ${GUEST_VI_PATH} in ${GUEST_CORPUS_REPO}.`
    );
  }

  // Build out/ on the HOST before vagrant up: out/ is gitignored, the guest
  // driver imports out/reporting/* at module load, and `npm run` is blocked in
  // the guest. Compiling here guarantees the guest exercises the reviewed
  // primitives (not a missing or stale build); fail closed if it does not build.
  log('Compiling out/ on the host (guest imports out/reporting/*; npm run is blocked in-guest)...');
  const compile = run('npm', ['run', 'compile']);
  if (compile.status !== 0) {
    fail('Host compile failed; out/ would be missing or stale in the guest. Fix the build before running the spike.');
  }

  if (!options.skipUp) {
    log('Bringing the Windows/LabVIEW guest up (vagrant up)...');
    const up = run('vagrant', ['up', '--provider', 'virtualbox'], { cwd: vagrantDir });
    if (up.status !== 0) {
      fail('vagrant up failed. Inspect the guest console (docs/vagrant.md); the self-heal task clears a restricted account.');
    }
  } else {
    log('--skip-up: assuming the guest is already running.');
  }

  const outcomes = [];
  for (const caseSpec of matrix) {
    log(`Running spike case "${caseSpec.label}" (headless=${caseSpec.headless}) in-guest over WinRM...`);
    const script = buildSpikeCaseGuestScript(paths, caseSpec);
    const guest = run('vagrant', ['powershell', '-c', script], { cwd: vagrantDir });
    outcomes.push({ label: caseSpec.label, status: guest.status });
    if (guest.status !== 0) {
      log(`Case "${caseSpec.label}" exited non-zero; its result JSON at ${options.out} records the typed diagnostic. Continuing.`);
    }
  }

  log('Spike matrix complete. Per-case result JSON + NDJSON progress are under the guest VIHS_WIN_OUT.');
  log('Interpret: control-full-full MUST succeed; then compare empty2rich {runtimeState,diagnosticReason}');
  log('to decide environmental (Linux-headless) vs intrinsic (labview-cli-call-by-reference) blocker; post to #2295.');

  // The control case is load-bearing: if full->full did not even succeed, the
  // host-native runtime is not healthy and NO empty->rich outcome can be trusted.
  // Fail closed so an unhealthy run is never mistaken for a valid experiment.
  const control = outcomes.find((o) => o.label === 'control-full-full');
  const controlHealthy = control !== undefined && control.status === 0;
  if (!controlHealthy) {
    process.stderr.write(
      '[empty-swap-spike] ERROR: the control-full-full case did not succeed; the host-native runtime is not proven healthy and the empty->rich outcomes are NOT trustworthy. Investigate before interpreting.\n'
    );
    process.exitCode = 1;
  }
  return { outcomes, controlHealthy };
}

module.exports = {
  GUEST_WORKSPACE,
  GUEST_CORPUS_REPO,
  GUEST_VI_PATH,
  LV_VERSION,
  LV_BITNESS,
  buildSpikeMatrix,
  buildSpikeCaseGuestScript,
  parseArgs,
  main
};

if (require.main === module) {
  main();
}
