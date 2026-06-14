#!/usr/bin/env node

/**
 * VHS-REQ-598 / VHS-REQ-652 — Maintainer Runner Prerequisite Doctor.
 *
 * Validates the full host contract a trusted LabVIEW maintainer runner needs
 * before the heavyweight `windows-labview-maintainer.yml` /
 * `linux-labview-maintainer.yml` validation can succeed, and reports EVERY gap
 * in one pass with actionable remediation instead of letting the workflow
 * hard-fail one step at a time (each historically costing a release cycle to
 * fix workflow-side issues).
 *
 * Two roles:
 *   1. Self-service: a maintainer runs `node scripts/checkMaintainerRunnerPrerequisites.js`
 *      directly on the runner — no workflow, no trusted-ref gate, no release
 *      cycle — to see all missing prerequisites at once, fix them, then dispatch
 *      the validation once and have it work.
 *   2. Fail-fast CI gate: invoked early in both maintainer workflows (after
 *      checkout, before the 90-minute job) so the run aborts in seconds with a
 *      consolidated report rather than dying opaquely deep in the integration
 *      host step.
 *
 * The candidate-path contract below is the single source of truth that the
 * workflows' `Capture Environment Summary` probes mirror; a contract test keeps
 * them aligned. The script is dependency-free (pure Node) so it runs before
 * `npm ci`, and every collaborator is injectable for deterministic Linux unit
 * tests.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const DEFAULT_WINDOWS_LOCAL_APP_DATA = 'C:\\Users\\sveld\\AppData\\Local';
const SUPPORTED_PLATFORMS = Object.freeze(['win32', 'linux']);

/**
 * #527: advisory system-clock-skew preflight. A runner whose system clock is
 * skewed past this tolerance makes its session OAuth token look already-expired
 * to GitHub, so the runner silently goes offline with a misleading
 * "registration has been deleted" error even though it was never deregistered
 * (observed on the dual-boot maintainer host where Linux writes the RTC as UTC
 * and Windows reads it as local time). Default 60s matches the practical window
 * before GitHub rejects the session.
 */
const DEFAULT_CLOCK_SKEW_THRESHOLD_MS = 60_000;
const CLOCK_SKEW_TIME_SOURCE_URL = 'https://api.github.com';
const CLOCK_SKEW_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Build the ordered prerequisite contract for a platform. Each entry resolves
 * as satisfied when any of its absolute `candidatePaths` exists OR any of its
 * `commandNames` resolves on PATH.
 */
function buildPrerequisiteContract(platform, env = process.env) {
  if (platform === 'win32') {
    const localAppData =
      (env.LOCALAPPDATA && env.LOCALAPPDATA.trim()) || DEFAULT_WINDOWS_LOCAL_APP_DATA;
    const userScopedCode = path.win32.join(
      localAppData,
      'Programs',
      'Microsoft VS Code',
      'bin',
      'code.cmd'
    );
    return [
      {
        id: 'node',
        label: 'Node.js',
        required: true,
        candidatePaths: [],
        commandNames: ['node'],
        remediation:
          'Install Node.js LTS (winget install --id OpenJS.NodeJS.LTS --exact --source winget) and ensure node is on the runner PATH.'
      },
      {
        id: 'npm',
        label: 'npm',
        required: true,
        candidatePaths: [],
        commandNames: ['npm.cmd', 'npm'],
        remediation: 'npm ships with Node.js LTS; ensure the Node install directory is on the runner PATH.'
      },
      {
        id: 'git',
        label: 'Git',
        required: true,
        candidatePaths: [],
        commandNames: ['git'],
        remediation: 'Install Git for Windows (winget install --id Git.Git --exact) and ensure git is on the runner PATH.'
      },
      {
        id: 'vscode',
        label: 'VS Code (integration host)',
        required: true,
        candidatePaths: [
          'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
          userScopedCode
        ],
        commandNames: ['code.cmd', 'code'],
        remediation:
          'Install VS Code SYSTEM-WIDE at "C:\\Program Files\\Microsoft VS Code" (the System installer, NOT the User installer). A self-hosted runner running as a service account (e.g. NetworkService) cannot see a user-scoped install. See https://code.visualstudio.com/.'
      },
      {
        id: 'labview',
        label: 'LabVIEW 2026',
        required: true,
        candidatePaths: [
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        ],
        commandNames: [],
        remediation: 'Install LabVIEW 2026 (x64 and/or x86) under C:\\Program Files\\National Instruments.'
      },
      {
        id: 'labview-cli',
        label: 'LabVIEW CLI',
        required: true,
        candidatePaths: [
          'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
        ],
        commandNames: ['LabVIEWCLI'],
        remediation: 'Install the LabVIEW Command-Line Interface (LabVIEWCLI) shared component from NI.'
      }
    ];
  }

  if (platform === 'linux') {
    return [
      {
        id: 'node',
        label: 'Node.js',
        required: true,
        candidatePaths: [],
        commandNames: ['node'],
        remediation: 'Install Node.js LTS and ensure node is on the runner PATH.'
      },
      {
        id: 'npm',
        label: 'npm',
        required: true,
        candidatePaths: [],
        commandNames: ['npm'],
        remediation: 'npm ships with Node.js LTS; ensure the Node install directory is on the runner PATH.'
      },
      {
        id: 'git',
        label: 'Git',
        required: true,
        candidatePaths: [],
        commandNames: ['git'],
        remediation: 'Install Git (apt-get install git) and ensure git is on the runner PATH.'
      },
      {
        id: 'vscode',
        label: 'VS Code (integration host)',
        required: true,
        candidatePaths: ['/usr/bin/code', '/usr/share/code/bin/code', '/snap/bin/code'],
        commandNames: ['code'],
        remediation:
          'Install VS Code (apt package "code" or the snap) plus xvfb for a headless integration-host display. See https://code.visualstudio.com/.'
      },
      {
        id: 'labview',
        label: 'LabVIEW for Linux 2026',
        required: true,
        candidatePaths: [
          '/usr/local/natinst/LabVIEW-2026-64/labview',
          '/usr/local/natinst/LabVIEW-2026Q1-64/labview',
          '/usr/local/natinst/LabVIEW-2026Q3-64/labview'
        ],
        commandNames: [],
        remediation: 'Install LabVIEW for Linux 2026 under /usr/local/natinst.'
      },
      {
        id: 'labview-cli',
        label: 'LabVIEW CLI',
        required: true,
        candidatePaths: ['/usr/local/bin/labviewcli', '/usr/local/natinst/shared/nilvcli/nilvcli'],
        commandNames: ['labviewcli', 'nilvcli'],
        remediation: 'Install the LabVIEW Command-Line Interface for Linux from NI.'
      }
    ];
  }

  throw new Error(
    `Unsupported maintainer runner platform: ${platform}. Expected one of: ${SUPPORTED_PLATFORMS.join(', ')}.`
  );
}

/**
 * Resolve a command name against PATH, honoring Windows PATHEXT for names
 * without an explicit extension. Returns the resolved absolute path or
 * undefined. Fully injectable for deterministic tests.
 */
function resolveCommandOnPath(commandName, platform, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const env = deps.env ?? process.env;
  const pathModule = platform === 'win32' ? path.win32 : path.posix;
  const delimiter = platform === 'win32' ? ';' : ':';
  const rawPath = env.PATH ?? env.Path ?? '';
  const pathDirs = rawPath.split(delimiter).filter((entry) => entry.length > 0);
  const hasExplicitExtension = pathModule.extname(commandName).length > 0;
  const extensions =
    platform === 'win32' && !hasExplicitExtension
      ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((ext) => ext.length > 0)
      : [''];

  for (const dir of pathDirs) {
    const base = pathModule.join(dir, commandName);
    const candidates = hasExplicitExtension ? [base] : [base, ...extensions.map((ext) => `${base}${ext}`)];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function inspectPrerequisite(prerequisite, platform, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  for (const candidatePath of prerequisite.candidatePaths) {
    if (existsSync(candidatePath)) {
      return { ...prerequisite, satisfied: true, detectedPath: candidatePath, detectedVia: 'path' };
    }
  }
  for (const commandName of prerequisite.commandNames) {
    const resolved = resolveCommandOnPath(commandName, platform, deps);
    if (resolved) {
      return { ...prerequisite, satisfied: true, detectedPath: resolved, detectedVia: 'command' };
    }
  }
  return { ...prerequisite, satisfied: false, detectedPath: undefined, detectedVia: undefined };
}

function inspectMaintainerRunnerPrerequisites(platform = process.platform, deps = {}) {
  const contract = buildPrerequisiteContract(platform, deps.env ?? process.env);
  const checks = contract.map((prerequisite) => inspectPrerequisite(prerequisite, platform, deps));
  const missingRequired = checks
    .filter((check) => check.required && !check.satisfied)
    .map((check) => check.id);
  return {
    platform,
    checks,
    missingRequired,
    satisfied: missingRequired.length === 0
  };
}

function formatPrerequisiteReport(report) {
  const lines = [];
  lines.push(`[runner-doctor] Maintainer runner prerequisite check (platform: ${report.platform})`);
  for (const check of report.checks) {
    const status = check.satisfied ? 'OK     ' : 'MISSING';
    const requirement = check.required ? 'required' : 'optional';
    const detail = check.satisfied
      ? `detected at ${check.detectedPath}`
      : 'not found';
    lines.push(`[runner-doctor] ${status} ${check.label} (${requirement}): ${detail}`);
    if (!check.satisfied) {
      if (check.candidatePaths.length > 0) {
        lines.push(`[runner-doctor]         probed paths: ${check.candidatePaths.join(', ')}`);
      }
      if (check.commandNames.length > 0) {
        lines.push(`[runner-doctor]         probed PATH commands: ${check.commandNames.join(', ')}`);
      }
      lines.push(`[runner-doctor]         remediation: ${check.remediation}`);
    }
  }
  if (report.satisfied) {
    lines.push('[runner-doctor] All required prerequisites satisfied. Runner is ready for maintainer validation.');
  } else {
    lines.push(
      `[runner-doctor] ${report.missingRequired.length} required prerequisite(s) missing: ${report.missingRequired.join(', ')}.`
    );
    lines.push('[runner-doctor] Install the missing prerequisites above, then re-run this check or dispatch the validation.');
  }
  return lines.join('\n');
}

/**
 * #527: Pure clock-skew classifier. Returns `unknown` (advisory, never a
 * failure) when no authoritative time was obtained — e.g. the host has no
 * outbound network during the check. Otherwise `skewMs` is local minus
 * authoritative (positive = local clock ahead) and the status crosses to
 * `skewed` once the absolute skew exceeds `thresholdMs`.
 */
function classifyClockSkew({
  localNowMs,
  authoritativeNowMs,
  thresholdMs = DEFAULT_CLOCK_SKEW_THRESHOLD_MS
} = {}) {
  if (typeof authoritativeNowMs !== 'number' || !Number.isFinite(authoritativeNowMs)) {
    return {
      status: 'unknown',
      skewMs: undefined,
      thresholdMs,
      localNowMs,
      authoritativeNowMs: undefined
    };
  }
  const skewMs = localNowMs - authoritativeNowMs;
  return {
    status: Math.abs(skewMs) > thresholdMs ? 'skewed' : 'ok',
    skewMs,
    thresholdMs,
    localNowMs,
    authoritativeNowMs
  };
}

/**
 * #527: Default authoritative-time source. Dependency-free bounded HTTPS HEAD
 * against the GitHub API, reading the `Date` response header. Never throws and
 * resolves `undefined` on any error/timeout so an offline host degrades to an
 * advisory `unknown` instead of failing the doctor. Injectable for tests.
 */
function fetchAuthoritativeNowMsViaGithub(deps = {}) {
  const httpsModule = deps.https ?? https;
  const url = deps.timeSourceUrl ?? CLOCK_SKEW_TIME_SOURCE_URL;
  const timeoutMs = deps.requestTimeoutMs ?? CLOCK_SKEW_REQUEST_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const request = httpsModule.request(
        url,
        {
          method: 'HEAD',
          timeout: timeoutMs,
          // The GitHub API rejects requests without a User-Agent; send one so the
          // happy path resolves a real Date header on a runner.
          headers: { 'user-agent': 'vi-history-suite-runner-doctor' }
        },
        (response) => {
          const dateHeader = response.headers ? response.headers.date : undefined;
          response.resume();
          const parsed = typeof dateHeader === 'string' ? Date.parse(dateHeader) : NaN;
          finish(Number.isFinite(parsed) ? parsed : undefined);
        }
      );
      request.on('timeout', () => {
        request.destroy();
        finish(undefined);
      });
      request.on('error', () => finish(undefined));
      request.end();
    } catch {
      finish(undefined);
    }
  });
}

/**
 * #527: Resolve the advisory clock-skew classification using injectable `now`
 * and authoritative-time collaborators (deterministic in unit tests; real
 * `Date.now()` + GitHub HEAD on a runner).
 */
async function inspectClockSkew(deps = {}) {
  const now = deps.now ?? Date.now;
  const fetchAuthoritativeNowMs = deps.fetchAuthoritativeNowMs ?? fetchAuthoritativeNowMsViaGithub;
  const thresholdMs = deps.clockSkewThresholdMs ?? DEFAULT_CLOCK_SKEW_THRESHOLD_MS;
  const localNowMs = now();
  let authoritativeNowMs;
  try {
    authoritativeNowMs = await fetchAuthoritativeNowMs(deps);
  } catch {
    authoritativeNowMs = undefined;
  }
  return classifyClockSkew({ localNowMs, authoritativeNowMs, thresholdMs });
}

function formatClockSkewReport(skew) {
  const toleranceSeconds = Math.round(skew.thresholdMs / 1000);
  if (skew.status === 'unknown') {
    return '[runner-doctor] ADVISORY System clock skew: unknown (authoritative time source unreachable; skipped, not a failure).';
  }
  const absSeconds = (Math.abs(skew.skewMs) / 1000).toFixed(1);
  const direction = skew.skewMs >= 0 ? 'ahead of' : 'behind';
  if (skew.status === 'ok') {
    return `[runner-doctor] OK       System clock skew: ${absSeconds}s ${direction} authoritative time (within ${toleranceSeconds}s tolerance).`;
  }
  const lines = [];
  lines.push(
    `[runner-doctor] ADVISORY System clock skew: ${absSeconds}s ${direction} authoritative time exceeds the ${toleranceSeconds}s tolerance.`
  );
  lines.push(
    '[runner-doctor]         A skewed clock makes the runner session OAuth token look expired to GitHub, so the runner can go offline with a misleading "registration has been deleted" error even though it was never deregistered.'
  );
  lines.push(
    '[runner-doctor]         remediation: resync the clock (Windows: Start-Service w32time then w32tm /resync, or Set-Date), then on a dual-boot host set Linux to treat the RTC as local time (timedatectl set-local-rtc 1) or Windows to use UTC so future boots stop skewing it.'
  );
  return lines.join('\n');
}

function getUsage() {
  return [
    'Usage: node scripts/checkMaintainerRunnerPrerequisites.js [--platform <win32|linux>] [--fail-on-clock-skew]',
    '',
    'Validates the trusted LabVIEW maintainer runner host contract (VS Code,',
    'LabVIEW, LabVIEW CLI, Node, npm, Git) and reports every gap with',
    'remediation. Also runs an advisory system-clock-skew preflight (a skewed',
    'clock silently knocks the runner offline with a misleading GitHub',
    '"registration has been deleted" error). Exit code 0 when all required',
    'prerequisites are satisfied, 1 otherwise. Run directly on the runner to',
    'validate readiness without dispatching the (trusted-ref-gated) maintainer',
    'workflow.',
    '',
    'Options:',
    '  --platform <id>        Override the detected platform (win32 | linux).',
    '  --fail-on-clock-skew   Also exit non-zero when the clock skew exceeds the',
    '                         tolerance (advisory by default; an unreachable time',
    '                         source never fails).',
    '  --help, -h             Show this help text.'
  ].join('\n');
}

function parseArgs(argv) {
  const options = { platform: undefined, help: false, failOnClockSkew: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--fail-on-clock-skew') {
      options.failOnClockSkew = true;
    } else if (arg === '--platform') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--platform requires a value (win32 | linux)');
      }
      options.platform = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return Promise.resolve(1);
  }

  if (options.help) {
    stdout.write(`${getUsage()}\n`);
    return Promise.resolve(0);
  }

  const platform = options.platform ?? deps.platform ?? process.platform;
  let report;
  try {
    report = inspectMaintainerRunnerPrerequisites(platform, deps);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return Promise.resolve(1);
  }

  stdout.write(`${formatPrerequisiteReport(report)}\n`);

  // #527: advisory clock-skew preflight. Always surfaced so a maintainer gets a
  // fast signal even when every path/command prerequisite is present; it only
  // affects the exit code when --fail-on-clock-skew is set AND the skew is
  // known and over tolerance (an unreachable time source stays advisory).
  return inspectClockSkew(deps).then((skew) => {
    stdout.write(`${formatClockSkewReport(skew)}\n`);
    const clockSkewFails = options.failOnClockSkew && skew.status === 'skewed';
    return report.satisfied && !clockSkewFails ? 0 : 1;
  });
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  DEFAULT_WINDOWS_LOCAL_APP_DATA,
  SUPPORTED_PLATFORMS,
  DEFAULT_CLOCK_SKEW_THRESHOLD_MS,
  CLOCK_SKEW_TIME_SOURCE_URL,
  buildPrerequisiteContract,
  resolveCommandOnPath,
  inspectPrerequisite,
  inspectMaintainerRunnerPrerequisites,
  formatPrerequisiteReport,
  classifyClockSkew,
  fetchAuthoritativeNowMsViaGithub,
  inspectClockSkew,
  formatClockSkewReport,
  getUsage,
  parseArgs,
  main
};
