#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_IMAGE_REF =
  process.env.VIHS_WINDOWS_BENCHMARK_IMAGE ||
  'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main';
const DEFAULT_HARNESS_ID = 'HARNESS-VHS-002';
const DEFAULT_DOCKER_CONTEXT = 'desktop-windows';
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PROOF_ROOT_LINUX =
  '/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof';
const COMPARABLE_PREFIX_PACKET_RELATIVE = path.join(
  'docs',
  'product',
  'benchmark-packets',
  'HARNESS-VHS-002-comparable-prefix.json'
);
const CONTAINER_CACHE_ROOT = 'C:\\workspace\\.cache';
const CONTAINER_HARNESS_CACHE_ROOT = 'C:\\workspace\\.cache\\harnesses';
const CONTAINER_POWERSHELL =
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const CONTAINER_RUNNER_SCRIPT =
  'C:\\workspace\\docker\\github-windows-dashboard-benchmark\\run-benchmark.ps1';
const CONTAINER_BOOTSTRAP_COMMAND = [
  '& {',
  `$harnessRoot = '${CONTAINER_HARNESS_CACHE_ROOT}';`,
  'if (Test-Path -LiteralPath $harnessRoot) {',
  "Get-ChildItem -LiteralPath $harnessRoot -Directory | ForEach-Object { git config --global --add safe.directory ($_.FullName -replace '\\\\','/') | Out-Null }",
  '}',
  `& '${CONTAINER_RUNNER_SCRIPT}'`,
  '}'
].join(' ');
const LOCAL_HARNESS_SOURCE_CANDIDATES = {
  'HARNESS-VHS-001': [
    '/mnt/c/dev/ni-labview-icon-editor',
    '/mnt/c/Users/sveld/AppData/Local/VI History Suite/acceptance/host-machine/setup/install-root/fixtures-workspace/labview-icon-editor'
  ],
  'HARNESS-VHS-002': [
    '/mnt/c/dev/ni-labview-icon-editor',
    '/mnt/c/Users/sveld/AppData/Local/VI History Suite/acceptance/host-machine/setup/install-root/fixtures-workspace/labview-icon-editor'
  ]
};
const HARNESS_CLONE_DIRECTORY_BY_ID = {
  'HARNESS-VHS-001': 'ni-labview-icon-editor',
  'HARNESS-VHS-002': 'ni-labview-icon-editor'
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.helpRequested) {
    process.stdout.write(`${getUsage()}\n`);
    return;
  }

  const proofPaths = buildHostWindowsBenchmarkPaths(
    options.proofRootLinux,
    options.harnessId,
    options.now
  );
  const dashboardCommitWindow = resolveDashboardCommitWindow(options);
  await fsp.mkdir(proofPaths.cacheRootLinux, { recursive: true });
  const seededHarnessSource = await ensureSeededHarnessClone(options.harnessId, proofPaths);

  if (options.pull) {
    runDockerCommand(
      ['--context', options.dockerContext, 'pull', options.imageRef],
      options.proofRootLinux,
      'Failed to pull the Windows benchmark image.'
    );
  }

  const imageDigest = inspectImageDigest(options.imageRef, options.dockerContext);
  await fsp.writeFile(
    proofPaths.launchReceiptPathLinux,
    `${JSON.stringify(
      {
        startedAt: options.now().toISOString(),
        imageRef: options.imageRef,
        imageDigest,
        harnessId: options.harnessId,
        dashboardCommitWindow,
        seededHarnessSource,
        dockerContext: options.dockerContext,
        proofRootLinux: options.proofRootLinux,
        proofRootWindows: proofPaths.proofRootWindows,
        cacheRootLinux: proofPaths.cacheRootLinux,
        cacheRootWindows: proofPaths.cacheRootWindows,
        harnessCloneRootLinux: proofPaths.harnessCloneRootLinux,
        harnessClonePathLinux: proofPaths.harnessClonePathLinux,
        summaryPathLinux: proofPaths.summaryPathLinux,
        logPathLinux: proofPaths.logPathLinux
      },
      null,
      2
    )}\n`
  );

  const runArgs = buildDockerRunArgs({
    dockerContext: options.dockerContext,
    imageRef: options.imageRef,
    imageDigest,
    harnessId: options.harnessId,
    dashboardCommitWindow,
    cacheRootWindows: proofPaths.cacheRootWindows
  });
  const containerExitCode = await runDockerStreaming(runArgs, proofPaths.logPathLinux);

  if (!fs.existsSync(proofPaths.summaryPathLinux)) {
    throw new Error(
      `The Windows benchmark image run completed without retaining ${proofPaths.summaryPathLinux}.`
    );
  }
  if (containerExitCode !== 0) {
    throw new Error(
      `The host Windows benchmark image container exited with code ${String(containerExitCode)}. Retained summary: ${proofPaths.summaryPathLinux}. Retained log: ${proofPaths.logPathLinux}.`
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        imageRef: options.imageRef,
        imageDigest,
        dashboardCommitWindow,
        seededHarnessSource,
        summaryPathLinux: proofPaths.summaryPathLinux,
        logPathLinux: proofPaths.logPathLinux,
        launchReceiptPathLinux: proofPaths.launchReceiptPathLinux
      },
      null,
      2
    )}\n`
  );
}

function getUsage() {
  return [
    'Usage: node scripts/runHostWindowsBenchmarkImageProof.js [--image <ref>] [--harness-id <id>] [--dashboard-commit-window <count>] [--proof-root <linux-path>] [--docker-context <name>] [--no-pull]',
    '',
    'Options:',
    '  --image <ref>            Override the Windows benchmark image reference.',
    `  --harness-id <id>       Harness id to execute. Defaults to ${DEFAULT_HARNESS_ID}.`,
    '  --dashboard-commit-window <count> Override the retained dashboard commit window; defaults to the tracked comparable-prefix packet for HARNESS-VHS-002 when available.',
    `  --proof-root <path>     Linux-visible proof root. Defaults to ${DEFAULT_PROOF_ROOT_LINUX}.`,
    `  --docker-context <name> Docker context for Windows containers. Defaults to ${DEFAULT_DOCKER_CONTEXT}.`,
    '  --no-pull               Skip docker pull before launch.',
    '  --help                  Print this help and exit.'
  ].join('\n');
}

function parseArgs(argv) {
  let imageRef = DEFAULT_IMAGE_REF;
  let harnessId = DEFAULT_HARNESS_ID;
  let proofRootLinux = DEFAULT_PROOF_ROOT_LINUX;
  let dockerContext = DEFAULT_DOCKER_CONTEXT;
  let dashboardCommitWindow = readPositiveIntegerEnv(
    'VIHS_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW'
  );
  let pull = true;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return candidate;
    };

    if (current === '--image') {
      imageRef = requireValue('--image');
      continue;
    }
    if (current === '--harness-id') {
      harnessId = requireValue('--harness-id');
      continue;
    }
    if (current === '--proof-root') {
      proofRootLinux = requireValue('--proof-root');
      continue;
    }
    if (current === '--docker-context') {
      dockerContext = requireValue('--docker-context');
      continue;
    }
    if (current === '--dashboard-commit-window') {
      const candidate = Number.parseInt(requireValue('--dashboard-commit-window'), 10);
      if (!Number.isFinite(candidate) || candidate < 3) {
        throw new Error(`Unsupported value for --dashboard-commit-window: ${String(candidate)}.`);
      }
      dashboardCommitWindow = candidate;
      continue;
    }
    if (current === '--no-pull') {
      pull = false;
      continue;
    }
    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }
    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return {
    imageRef,
    harnessId,
    repoRoot: DEFAULT_REPO_ROOT,
    proofRootLinux: path.resolve(proofRootLinux),
    dockerContext,
    dashboardCommitWindow,
    pull,
    helpRequested,
    now: () => new Date()
  };
}

function buildHostWindowsBenchmarkPaths(proofRootLinux, harnessId, now = () => new Date()) {
  const proofRootWindows = toWindowsPathFromWsl(proofRootLinux);
  const cacheRootLinux = path.join(proofRootLinux, 'cache');
  const cacheRootWindows = `${proofRootWindows}\\cache`;
  const harnessCloneRootLinux = path.join(cacheRootLinux, 'harnesses');
  const cloneDirectoryName = getHarnessCloneDirectoryName(harnessId);
  const benchmarkRootLinux = path.join(
    cacheRootLinux,
    'github-experiments',
    'windows-dashboard-benchmark',
    harnessId
  );
  return {
    proofRootLinux,
    proofRootWindows,
    cacheRootLinux,
    cacheRootWindows,
    harnessCloneRootLinux,
    harnessClonePathLinux: cloneDirectoryName
      ? path.join(harnessCloneRootLinux, cloneDirectoryName)
      : undefined,
    benchmarkRootLinux,
    summaryPathLinux: path.join(benchmarkRootLinux, 'latest-summary.json'),
    launchReceiptPathLinux: path.join(proofRootLinux, 'latest-launch.json'),
    logPathLinux: path.join(proofRootLinux, `run-${buildRunId(now())}.log`)
  };
}

function toWindowsPathFromWsl(linuxPath) {
  const normalized = path.resolve(linuxPath).replace(/\\/g, '/');
  const match = normalized.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!match) {
    throw new Error(
      `Cannot translate ${linuxPath} to a Windows path. Use a /mnt/<drive>/... proof root.`
    );
  }
  const drive = match[1].toUpperCase();
  const remainder = match[2].split('/').filter(Boolean).join('\\');
  return `${drive}:\\${remainder}`;
}

function buildDockerRunArgs(options) {
  const args = [
    '--context',
    options.dockerContext,
    'run',
    '--rm',
    '-v',
    `${options.cacheRootWindows}:${CONTAINER_CACHE_ROOT}`,
    '-e',
    `VIHS_GITHUB_WINDOWS_BENCHMARK_HARNESS_ID=${options.harnessId}`,
    '-e',
    `VIHS_GITHUB_WINDOWS_BENCHMARK_IMAGE_REF=${options.imageRef}`,
    '-e',
    `VIHS_GITHUB_WINDOWS_BENCHMARK_IMAGE_DIGEST=${options.imageDigest ?? ''}`
  ];
  if (typeof options.dashboardCommitWindow === 'number') {
    args.push(
      '-e',
      `VIHS_GITHUB_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW=${options.dashboardCommitWindow}`
    );
  }
  args.push(
    options.imageRef,
    CONTAINER_POWERSHELL,
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    CONTAINER_BOOTSTRAP_COMMAND
  );
  return args;
}

function getHarnessCloneDirectoryName(harnessId) {
  return HARNESS_CLONE_DIRECTORY_BY_ID[harnessId];
}

function getLocalHarnessSourceCandidates(harnessId) {
  return [...(LOCAL_HARNESS_SOURCE_CANDIDATES[harnessId] ?? [])];
}

function resolveLocalHarnessSeedSource(harnessId, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  return getLocalHarnessSourceCandidates(harnessId).find((candidate) =>
    existsSync(path.join(candidate, '.git'))
  );
}

async function ensureSeededHarnessClone(harnessId, proofPaths) {
  const harnessClonePathLinux = proofPaths.harnessClonePathLinux;
  if (!harnessClonePathLinux) {
    return undefined;
  }

  try {
    const stats = await fsp.stat(path.join(harnessClonePathLinux, '.git'));
    if (stats.isDirectory()) {
      return 'existing-mounted-cache';
    }
  } catch {
    // Seed from a governed local clone if one is available.
  }

  const seedSource = resolveLocalHarnessSeedSource(harnessId);
  if (!seedSource) {
    return undefined;
  }

  await fsp.mkdir(proofPaths.harnessCloneRootLinux, { recursive: true });
  await fsp.rm(harnessClonePathLinux, { recursive: true, force: true });
  runHostGitCommand(
    ['clone', '--local', '--no-hardlinks', seedSource, harnessClonePathLinux],
    proofPaths.proofRootLinux,
    `Failed to seed the mounted harness cache from ${seedSource}.`
  );
  return seedSource;
}

function resolveDashboardCommitWindow(options, deps = {}) {
  if (typeof options.dashboardCommitWindow === 'number') {
    return options.dashboardCommitWindow;
  }

  return readComparablePrefixDashboardCommitWindow(
    options.repoRoot ?? DEFAULT_REPO_ROOT,
    options.harnessId,
    deps
  );
}

function readComparablePrefixDashboardCommitWindow(repoRoot, harnessId, deps = {}) {
  if (harnessId !== 'HARNESS-VHS-002') {
    return undefined;
  }

  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? fs.readFileSync;
  const packetPath = path.join(repoRoot, COMPARABLE_PREFIX_PACKET_RELATIVE);
  if (!existsSync(packetPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(packetPath, 'utf8'));
    const comparableWindow = parsed?.comparablePrefix?.dashboardCommitWindow;
    if (!Number.isFinite(comparableWindow) || comparableWindow < 3) {
      return undefined;
    }
    return comparableWindow;
  } catch {
    return undefined;
  }
}

function readPositiveIntegerEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

function inspectImageDigest(imageRef, dockerContext) {
  const result = spawnSync(
    'docker.exe',
    ['--context', dockerContext, 'image', 'inspect', imageRef, '--format', '{{index .RepoDigests 0}}'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  if (result.status !== 0) {
    return undefined;
  }
  const repoDigest = (result.stdout || '').trim();
  if (!repoDigest.includes('@')) {
    return undefined;
  }
  return repoDigest.split('@', 2)[1];
}

function runDockerCommand(args, cwd, failureMessage) {
  const result = spawnSync('docker.exe', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(failureMessage);
  }
}

function runHostGitCommand(args, cwd, failureMessage) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(failureMessage);
  }
}

async function runDockerStreaming(args, logPathLinux) {
  await fsp.mkdir(path.dirname(logPathLinux), { recursive: true });
  const logStream = fs.createWriteStream(logPathLinux, { flags: 'a' });
  const processRef = spawn('docker.exe', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const forwardStdout = (chunk) => {
    logStream.write(chunk);
    process.stdout.write(chunk);
  };
  const forwardStderr = (chunk) => {
    logStream.write(chunk);
    process.stderr.write(chunk);
  };
  processRef.stdout?.on('data', forwardStdout);
  processRef.stderr?.on('data', forwardStderr);

  return await new Promise((resolve, reject) => {
    processRef.once('error', reject);
    processRef.once('exit', (code) => {
      logStream.end();
      resolve(code ?? 1);
    });
  });
}

function buildRunId(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  buildHostWindowsBenchmarkPaths,
  toWindowsPathFromWsl,
  buildDockerRunArgs,
  getHarnessCloneDirectoryName,
  getLocalHarnessSourceCandidates,
  resolveLocalHarnessSeedSource,
  ensureSeededHarnessClone,
  resolveDashboardCommitWindow,
  readComparablePrefixDashboardCommitWindow,
  inspectImageDigest
};
