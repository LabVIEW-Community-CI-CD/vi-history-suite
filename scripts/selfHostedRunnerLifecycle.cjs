#!/usr/bin/env node

'use strict';

// Self-hosted GitHub Actions runner lifecycle helper for vi-history-suite
// (maintainer-only, .cjs so it is exempt from the scripts/*.js traceability
// inventory glob and never ships in the VSIX).
//
// This machine hosts the `vihs-linux-labview-maintainer` self-hosted runner that
// the VHS-REQ-690 integration-coverage lane targets. Bringing it up by hand is a
// multi-step dance (mint a registration token, clear stale local config,
// ./config.sh, sudo ./svc.sh install/start). This helper makes it one idempotent
// command so a future local agent can manage the runner without re-deriving the
// steps.
//
// It NEVER prints or logs the registration token: it mints the token via
// `gh api` and pipes it directly into `config.sh` in the same child process.
//
// Usage:
//   node scripts/selfHostedRunnerLifecycle.cjs status      (default)
//   node scripts/selfHostedRunnerLifecycle.cjs up          configure (if needed) + install + start the service
//   node scripts/selfHostedRunnerLifecycle.cjs start|stop|restart
//   node scripts/selfHostedRunnerLifecycle.cjs reconfigure clear local config + re-register (fixes a stale/deleted runner)
//
// Env overrides: VIHS_RUNNER_DIR, VIHS_RUNNER_NAME, VIHS_RUNNER_LABEL,
// VIHS_RUNNER_USER, VIHS_RUNNER_REPO.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = process.env.VIHS_RUNNER_REPO || 'LabVIEW-Community-CI-CD/vi-history-suite';
const RUNNER_DIR = process.env.VIHS_RUNNER_DIR || path.join(os.homedir(), 'actions-runners', 'vi-history-suite');
const RUNNER_NAME = process.env.VIHS_RUNNER_NAME || 'vihs-linux-labview-maintainer';
const RUNNER_LABEL = process.env.VIHS_RUNNER_LABEL || 'vihs-linux-labview-maintainer';
const RUNNER_USER = process.env.VIHS_RUNNER_USER || os.userInfo().username;
const RUNNER_URL = `https://github.com/${REPO}`;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', cwd: RUNNER_DIR, ...opts });
  return { status: res.status, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), error: res.error };
}

// Mint a registration token via gh (uses the local keyring auth). Returns the
// token string; callers must pipe it straight into config.sh and never log it.
function mintRegistrationToken() {
  const res = spawnSync(
    'gh',
    ['api', '-X', 'POST', `repos/${REPO}/actions/runners/registration-token`, '--jq', '.token'],
    { encoding: 'utf8' }
  );
  if (res.status !== 0 || !res.stdout) {
    throw new Error(`could not mint a runner registration token via gh (need a repo-scoped token): ${(res.stderr || '').trim()}`);
  }
  return res.stdout.trim();
}

function runnerBinariesPresent() {
  return ['config.sh', 'run.sh', 'svc.sh'].every((f) => fs.existsSync(path.join(RUNNER_DIR, f)));
}

function isConfiguredLocally() {
  return fs.existsSync(path.join(RUNNER_DIR, '.runner'));
}

// Configure (register) the runner. `replace` clears any stale local config first,
// which is required when the server-side runner was deleted out from under us.
function configureRunner({ replace }) {
  if (replace) {
    // Best-effort graceful removal, then hard-clear the local config files.
    try {
      const token = mintRegistrationToken();
      run('./config.sh', ['remove', '--token', token]);
    } catch {
      // ignore; the server-side runner may already be gone
    }
    for (const f of ['.runner', '.credentials', '.credentials_rsaparams']) {
      try {
        fs.rmSync(path.join(RUNNER_DIR, f), { force: true });
      } catch {
        // ignore
      }
    }
  }
  const token = mintRegistrationToken();
  const res = run('./config.sh', [
    '--url', RUNNER_URL,
    '--token', token,
    '--name', RUNNER_NAME,
    '--labels', RUNNER_LABEL,
    '--unattended',
    '--replace'
  ]);
  if (res.status !== 0) {
    throw new Error(`config.sh failed: ${res.stderr || res.stdout}`);
  }
}

function svc(action) {
  const res = run('sudo', ['./svc.sh', action, ...(action === 'install' ? [RUNNER_USER] : [])]);
  return res;
}

function serviceStatusLine() {
  const res = spawnSync(
    'systemctl',
    ['list-units', '--type=service', '--all', '--no-legend'],
    { encoding: 'utf8' }
  );
  const line = (res.stdout || '')
    .split('\n')
    .find((l) => /actions\.runner\..*vi-history-suite/.test(l));
  return line ? line.trim() : null;
}

function reportStatus() {
  const parts = [];
  parts.push(`runner dir: ${RUNNER_DIR}`);
  parts.push(`binaries present: ${runnerBinariesPresent()}`);
  parts.push(`configured locally: ${isConfiguredLocally()}`);
  const svcLine = serviceStatusLine();
  parts.push(`systemd service: ${svcLine ? svcLine.split(/\s+/).slice(0, 4).join(' ') : 'not installed'}`);
  // Live registration/online state (best effort).
  const gh = spawnSync(
    'gh',
    ['api', `repos/${REPO}/actions/runners`, '--jq', `.runners[] | select(.name=="${RUNNER_NAME}") | .status`],
    { encoding: 'utf8' }
  );
  parts.push(`repo registration: ${(gh.stdout || '').trim() || 'not registered'}`);
  return parts.join('\n');
}

function up() {
  if (!runnerBinariesPresent()) {
    throw new Error(`runner binaries not found in ${RUNNER_DIR}; download the GitHub Actions runner there first`);
  }
  if (!isConfiguredLocally()) {
    configureRunner({ replace: false });
  }
  // Install is idempotent enough; if already installed svc.sh reports it.
  svc('install');
  svc('start');
}

function main() {
  const action = (process.argv[2] || 'status').toLowerCase();
  try {
    switch (action) {
      case 'status':
        process.stdout.write(reportStatus() + '\n');
        break;
      case 'up':
        up();
        process.stdout.write('[runner] up (installed + started)\n' + reportStatus() + '\n');
        break;
      case 'start':
      case 'stop':
      case 'restart': {
        const res = svc(action);
        process.stdout.write(`[runner] ${action}: exit ${res.status}\n`);
        break;
      }
      case 'reconfigure':
        configureRunner({ replace: true });
        svc('install');
        svc('start');
        process.stdout.write('[runner] reconfigured + started\n' + reportStatus() + '\n');
        break;
      default:
        process.stderr.write(`unknown action: ${action} (status|up|start|stop|restart|reconfigure)\n`);
        process.exit(2);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[runner] ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  REPO,
  RUNNER_DIR,
  RUNNER_NAME,
  RUNNER_LABEL,
  runnerBinariesPresent,
  isConfiguredLocally,
  reportStatus
};
