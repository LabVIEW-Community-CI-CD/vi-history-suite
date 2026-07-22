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
 *   4. empty2rich-headless (LV_RTE_WIN_HOSTNATIVE_HEADLESS=1) — isolates whether
 *      headless-ness itself (independent of Linux) triggers Error 66
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
 * corpus path and whether it runs headless. `base`/`selected` are resolved from
 * the maintainer-provided env SHAs so the matrix stays declarative.
 */
function buildSpikeMatrix(env = process.env) {
  const control = { base: env.CONTROL_BASE || '', head: env.CONTROL_HEAD || '' };
  const empty = env.EMPTY_SHA || '';
  const rich = env.RICH_SHA || '';
  return [
    { label: 'control-full-full', base: control.base, selected: control.head, headless: false },
    { label: 'empty2rich', base: empty, selected: rich, headless: false },
    { label: 'rich2empty', base: rich, selected: empty, headless: false },
    { label: 'empty2rich-headless', base: empty, selected: rich, headless: true }
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
    // Toggle host-native headless per case so we can isolate headless-ness from
    // the (Linux-only) recursive-load classification.
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
      options.out = argv[i + 1];
      i += 1;
    }
  }
  return options;
}

function main(deps = {}) {
  const run = deps.run || defaultRun;
  const options = parseArgs(process.argv.slice(2));
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
  return outcomes;
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
