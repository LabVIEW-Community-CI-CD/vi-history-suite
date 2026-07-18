#!/usr/bin/env node

/**
 * Vagrant lane preflight and status reporter (dev-only maintainer tooling).
 *
 * The Vagrant Windows/LabVIEW VM is an OPTIONAL local isolation helper for
 * maintainers (see docs/vagrant.md). It is never a required CI gate. This tool
 * gives a single, deterministic readiness signal for the lane so a maintainer
 * can tell — before the heavy `vagrant up` — whether the host prerequisites and
 * the registered box/VM are in the expected state.
 *
 * Modes (argv[2]):
 *   preflight (default) - checks host prerequisites, the Vagrantfile, and whether
 *                         the expected box is registered; exits non-zero if any
 *                         required check fails.
 *   status              - prints the current VM lifecycle state; always exits 0.
 *
 * Every external boundary (command execution, filesystem, environment) is
 * injectable so the pure logic is unit-tested without a real Vagrant/VirtualBox
 * install. This mirrors the injectable-boundary pattern used by the other
 * scripts in this directory.
 */

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_BOX_NAME = 'vihs/win11-labview2026';

/**
 * Parse a `vagrant --version` banner into a version string.
 * @param {string} stdout
 * @returns {string|null}
 */
function parseVagrantVersion(stdout) {
  if (typeof stdout !== 'string') {
    return null;
  }
  const match = stdout.match(/Vagrant\s+(\d+\.\d+\.\d+)/i);
  return match ? match[1] : null;
}

/**
 * Parse `vagrant box list` output into structured rows.
 * Example line: "vihs/win11-labview2026 (virtualbox, 0, amd64)".
 * @param {string} stdout
 * @returns {Array<{ name: string, provider: string|null, version: string|null }>}
 */
function parseBoxList(stdout) {
  if (typeof stdout !== 'string') {
    return [];
  }
  const rows = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = line.match(/^(\S+)\s*\((.*)\)\s*$/);
    if (!match) {
      continue;
    }
    const parts = match[2].split(',').map((part) => part.trim());
    rows.push({
      name: match[1],
      provider: parts[0] || null,
      version: parts[1] || null
    });
  }
  return rows;
}

/**
 * Determine whether a box name is registered.
 * @param {string} stdout
 * @param {string} boxName
 * @returns {boolean}
 */
function boxIsRegistered(stdout, boxName) {
  return parseBoxList(stdout).some((row) => row.name === boxName);
}

/**
 * Parse `vagrant status` output into a lifecycle state.
 * Example line: "  vihs-local-win11         not created (virtualbox)".
 * Recognizes the VirtualBox provider lifecycle states Vagrant reports: not
 * created, running, poweroff, saved, aborted, stopped, stopping, paused, and
 * inaccessible.
 * @param {string} stdout
 * @returns {{ state: string|null }}
 */
function parseVagrantStatus(stdout) {
  if (typeof stdout !== 'string') {
    return { state: null };
  }
  const match = stdout.match(
    /^\s*\S+\s+(not created|running|poweroff|saved|aborted|stopped|stopping|paused|inaccessible)\b/im
  );
  return { state: match ? match[1] : null };
}

/**
 * Inspect the Vagrant lane readiness. Pure aside from the injected boundaries.
 *
 * @param {{
 *   cwd?: string,
 *   platform?: string,
 *   env?: Record<string, string | undefined>,
 *   existsSync?: (candidate: string) => boolean,
 *   runCommand?: (command: string, args: string[]) => { status: number|null, stdout: string, stderr: string, error?: Error }
 * }} [deps]
 */
function inspectVagrantLane(deps = {}) {
  const cwd = deps.cwd ?? repoRoot;
  const env = deps.env ?? process.env;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const runCommand =
    deps.runCommand ??
    ((command, args) => {
      const result = childProcess.spawnSync(command, args, { encoding: 'utf8' });
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error
      };
    });

  const boxName = env.VIHS_VAGRANT_BOX || DEFAULT_BOX_NAME;
  const vagrantDir = path.join(cwd, 'vagrant');
  const vagrantfilePath = path.join(vagrantDir, 'Vagrantfile');
  const checks = [];

  const commandAvailable = (command, args, versionParser) => {
    const result = runCommand(command, args);
    if (result.error || result.status !== 0) {
      return { ok: false, detail: null };
    }
    const detail = versionParser ? versionParser(result.stdout) : null;
    return { ok: true, detail };
  };

  // 1. Vagrant CLI.
  const vagrant = commandAvailable('vagrant', ['--version'], parseVagrantVersion);
  checks.push({
    id: 'vagrant-cli',
    label: 'Vagrant CLI available',
    required: true,
    ok: vagrant.ok,
    detail: vagrant.ok ? `Vagrant ${vagrant.detail ?? '(version unknown)'}` : 'vagrant not found on PATH'
  });

  // 2. VirtualBox management CLI.
  const vbox = commandAvailable('VBoxManage', ['--version'], (out) => out.trim());
  checks.push({
    id: 'virtualbox-cli',
    label: 'VirtualBox VBoxManage available',
    required: true,
    ok: vbox.ok,
    detail: vbox.ok ? `VBoxManage ${vbox.detail ?? '(version unknown)'}` : 'VBoxManage not found on PATH'
  });

  // 3. Vagrantfile present.
  const vagrantfileExists = existsSync(vagrantfilePath);
  checks.push({
    id: 'vagrantfile',
    label: 'vagrant/Vagrantfile present',
    required: true,
    ok: vagrantfileExists,
    detail: vagrantfileExists ? vagrantfilePath : `missing: ${vagrantfilePath}`
  });

  // 4. Expected box registered (only meaningful when the CLI is available).
  let boxRegistered = false;
  let boxDetail = 'vagrant CLI unavailable; cannot list boxes';
  if (vagrant.ok) {
    const boxList = runCommand('vagrant', ['box', 'list']);
    if (!boxList.error && boxList.status === 0) {
      boxRegistered = boxIsRegistered(boxList.stdout, boxName);
      boxDetail = boxRegistered
        ? `${boxName} registered`
        : `${boxName} not registered (run 'vagrant box add' or mount the box store)`;
    } else {
      boxDetail = "'vagrant box list' failed";
    }
  }
  checks.push({
    id: 'box-registered',
    label: `Expected box '${boxName}' registered`,
    required: true,
    ok: boxRegistered,
    detail: boxDetail
  });

  const failures = checks.filter((check) => check.required && !check.ok);
  return {
    cwd,
    boxName,
    platform: deps.platform ?? process.platform,
    checks,
    satisfied: failures.length === 0,
    failures
  };
}

/**
 * Read the VM lifecycle state (best effort).
 * @param {Parameters<typeof inspectVagrantLane>[0]} [deps]
 * @returns {{ state: string|null, ok: boolean, detail: string }}
 */
function inspectVagrantStatus(deps = {}) {
  const cwd = deps.cwd ?? repoRoot;
  const runCommand =
    deps.runCommand ??
    ((command, args, options) => {
      const result = childProcess.spawnSync(command, args, { encoding: 'utf8', ...options });
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error
      };
    });

  const vagrantDir = path.join(cwd, 'vagrant');
  const result = runCommand('vagrant', ['status'], { cwd: vagrantDir });
  if (result.error || result.status !== 0) {
    return { state: null, ok: false, detail: "'vagrant status' unavailable" };
  }
  const { state } = parseVagrantStatus(result.stdout);
  return {
    state,
    ok: state !== null,
    detail: state ? `VM state: ${state}` : 'VM state could not be parsed'
  };
}

/**
 * Render the preflight report for humans.
 * @param {ReturnType<typeof inspectVagrantLane>} report
 * @returns {string}
 */
function formatPreflightReport(report) {
  const lines = ['[vagrant-preflight] Vagrant lane readiness (optional local helper):', ''];
  for (const check of report.checks) {
    const marker = check.ok ? 'PASS' : 'FAIL';
    lines.push(`  [${marker}] ${check.label}${check.detail ? ` - ${check.detail}` : ''}`);
  }
  lines.push('');
  if (report.satisfied) {
    lines.push("[vagrant-preflight] Ready. You can run 'cd vagrant && vagrant up'.");
  } else {
    lines.push('[vagrant-preflight] Not ready. Resolve the FAIL items above.');
    lines.push('[vagrant-preflight] See docs/vagrant.md for host recovery and box-store mounting.');
  }
  return lines.join('\n');
}

function main(deps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const mode = argv[0] || 'preflight';

  if (mode === 'status') {
    const status = inspectVagrantStatus(deps);
    stdout.write(`[vagrant-status] ${status.detail}\n`);
    return 0;
  }

  const report = inspectVagrantLane(deps);
  const rendered = formatPreflightReport(report);
  if (report.satisfied) {
    stdout.write(`${rendered}\n`);
    return 0;
  }
  stderr.write(`${rendered}\n`);
  return 1;
}

module.exports = {
  DEFAULT_BOX_NAME,
  parseVagrantVersion,
  parseBoxList,
  boxIsRegistered,
  parseVagrantStatus,
  inspectVagrantLane,
  inspectVagrantStatus,
  formatPreflightReport,
  main
};

if (require.main === module) {
  process.exit(main());
}
