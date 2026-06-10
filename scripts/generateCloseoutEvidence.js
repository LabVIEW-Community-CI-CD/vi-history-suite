#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const STANDARDS_TOOLCHAIN_EXPECTED_COMMIT = 'd44f210ded557cda6d4598cdaffe938da51d873e';
const STANDARDS_TOOLCHAIN_GITLAB_URL = 'https://gitlab.com/svelderrainruiz/repo-standards-review.git';
const STANDARDS_TOOLCHAIN_GITHUB_URL = 'https://github.com/svelderrainruiz/repo-standards-review.git';
const STANDARDS_TOOLCHAIN_GITHUB_TAG = 'v0.2.19';
const STANDARDS_TOOLCHAIN_REGISTRY_IMAGE =
  'registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main';
const LOCAL_STANDARDS_IMAGE = 'repo-standards-review-assurance-workbench:local';
const DEFAULT_STANDARDS_IMAGE = STANDARDS_TOOLCHAIN_REGISTRY_IMAGE;
const DEFAULT_SAVE_DIR = 'assurance-closeout-evidence';
const DEFAULT_SKILL_ROOT = process.env.REPO_STANDARDS_REVIEW_ROOT ||
  'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review';
const TRUSTED_REPO_ROOT = path.resolve(__dirname, '..');
const COMMAND_TIMEOUT_MS = Object.freeze({
  gitRemote: 45000,
  ghApi: 45000,
  dockerManifestInspect: 45000,
  dockerImageInspect: 30000,
  dockerPull: 180000,
  dockerBuild: 900000,
  dockerRun: 900000,
  hostPython: 900000
});
const COMMAND_RETRY_ATTEMPTS = Object.freeze({
  none: 1,
  transientNetwork: 2
});
const ALLOWED_EXECUTABLE_COMMANDS = Object.freeze([
  'npm',
  'npm.cmd',
  'git',
  'docker',
  'python3',
  'gh'
]);
const GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT = Object.freeze([
  '.cache/',
  'win-validation/',
  'assurance-*-evidence/',
  'release-evidence/',
  'coverage/',
  'node_modules/',
  'out/',
  'out-tests/',
  'dist/',
  'tmp/',
  'vagrant/shared/',
  'vagrant/evidence/',
  'vagrant/.vagrant/',
  'vagrant/.vagrant-ci/'
]);

function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parseArgs(argv) {
  const options = {
    kind: undefined,
    issue: undefined,
    runGates: false,
    saveDir: undefined,
    standardsRunner: 'auto',
    standardsImage: DEFAULT_STANDARDS_IMAGE,
    skillRoot: DEFAULT_SKILL_ROOT,
    buildStandardsImage: false,
    releaseTag: undefined,
    releasePr: undefined,
    backSyncPr: undefined,
    marketplaceRun: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--kind') options.kind = next();
    else if (arg === '--issue') options.issue = next();
    else if (arg === '--run-gates') options.runGates = true;
    else if (arg === '--save-dir') options.saveDir = next() || DEFAULT_SAVE_DIR;
    else if (arg === '--standards-runner') options.standardsRunner = next();
    else if (arg === '--standards-image') options.standardsImage = next();
    else if (arg === '--skill-root') options.skillRoot = next();
    else if (arg === '--build-standards-image') options.buildStandardsImage = true;
    else if (arg === '--release-tag') options.releaseTag = next();
    else if (arg === '--release-pr') options.releasePr = next();
    else if (arg === '--back-sync-pr') options.backSyncPr = next();
    else if (arg === '--marketplace-run') options.marketplaceRun = next();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (!['standards', 'release'].includes(options.kind)) {
    throw new Error('--kind must be standards or release');
  }

  if (!['auto', 'host', 'docker'].includes(options.standardsRunner)) {
    throw new Error('--standards-runner must be auto, host, or docker');
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/generateCloseoutEvidence.js --kind standards|release [options]',
    '',
    'Options:',
    '  --issue <number>',
    '  --run-gates',
    '  --save-dir <path>',
    '  --standards-runner auto|host|docker',
    '  --standards-image <image>',
    '  --build-standards-image',
    '  --release-tag vX.Y.Z',
    '  --release-pr <number>',
    '  --back-sync-pr <number>',
    '  --marketplace-run <run-id-or-url>'
  ].join('\n');
}

function commandLine(command, args) {
  return [command, ...args].join(' ');
}

function isAllowedExecutableCommand(command) {
  return ALLOWED_EXECUTABLE_COMMANDS.includes(String(command || ''));
}

function assertAllowedExecutableCommand(command) {
  if (!isAllowedExecutableCommand(command)) {
    throw new Error(
      `Unsupported executable command '${command}'. Allowed commands: ${ALLOWED_EXECUTABLE_COMMANDS.join(', ')}`
    );
  }
}

function combinedCommandErrorText(commandResult) {
  return `${commandResult?.stderr || ''}\n${String(commandResult?.error || '')}`.toLowerCase();
}

function isSpawnTimeout(rawResult) {
  const code = String(rawResult?.error?.code || '').toUpperCase();
  const errorText = String(rawResult?.error?.message || rawResult?.error || '').toLowerCase();
  return code === 'ETIMEDOUT' || errorText.includes('timed out') || errorText.includes('timeout');
}

function isTransientNetworkFailure(commandResult) {
  if (commandResult?.timedOut) {
    return true;
  }

  const errorText = combinedCommandErrorText(commandResult);
  return [
    'tls handshake timeout',
    'i/o timeout',
    'connection reset',
    'econnreset',
    'network is unreachable',
    'temporary failure',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
    'eai_again',
    'etimedout',
    'ehostunreach',
    'no route to host'
  ].some((pattern) => errorText.includes(pattern));
}

function classifyDockerRegistryFailure(commandResult, image, commandDescription) {
  if (commandResult.status === 0) {
    return {
      category: 'none',
      message: 'Published Docker workbench image is accessible.'
    };
  }

  const errorText = combinedCommandErrorText(commandResult);
  const loginGuidance = "Run 'docker login registry.gitlab.com' and retry.";
  const credentialHelperGuidance =
    "Docker credential helper configuration failed; configure a supported helper in Docker config or clear invalid credHelpers settings, then retry.";
  const timeoutGuidance =
    'Registry command timed out; verify network connectivity and retry.';

  if (commandResult.timedOut || errorText.includes('timed out') || errorText.includes('timeout')) {
    return {
      category: 'timeout',
      message: `Published Docker workbench image access timed out during ${commandDescription}. ${timeoutGuidance}`
    };
  }

  if (
    errorText.includes('error getting credentials') ||
    errorText.includes('credential helper') ||
    errorText.includes('credsstore') ||
    errorText.includes('credhelpers') ||
    errorText.includes('not implemented')
  ) {
    return {
      category: 'credential-helper',
      message: `Published Docker workbench image access failed during ${commandDescription}. ${credentialHelperGuidance}`
    };
  }

  if (
    errorText.includes('authentication required') ||
    errorText.includes('unauthorized') ||
    errorText.includes('access forbidden') ||
    errorText.includes('requested access to the resource is denied') ||
    errorText.includes('pull access denied') ||
    errorText.includes('permission denied') ||
    errorText.includes('denied')
  ) {
    return {
      category: 'auth-denied',
      message: `Published Docker workbench image access failed during ${commandDescription}. ${loginGuidance}`
    };
  }

  if (
    errorText.includes('manifest unknown') ||
    errorText.includes('not found') ||
    errorText.includes('name unknown') ||
    errorText.includes('repository does not exist')
  ) {
    return {
      category: 'image-unavailable',
      message: `Published Docker workbench image '${image}' is unavailable in the registry; verify image publication and retry.`
    };
  }

  return {
    category: 'unknown',
    message: `Published Docker workbench image access failed during ${commandDescription}; inspect stderr and retry ${commandResult.command}.`
  };
}

function runCommand(command, args, deps = {}) {
  assertAllowedExecutableCommand(command);
  const policy = deps.commandPolicy || {};
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const platform = deps.platform || process.platform;
  const useWindowsCommandProcessor = platform === 'win32' && !deps.spawnSync;
  const maxAttempts = Math.max(1, Number(policy.maxAttempts || 1));
  const timeoutMs = Number(policy.timeoutMs || 0);
  const retryOnTransient = policy.retryOnTransient === true;
  let finalResult;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSyncImpl(
      useWindowsCommandProcessor ? 'cmd.exe' : command,
      useWindowsCommandProcessor ? ['/d', '/s', '/c', command, ...args] : args,
      {
        cwd: deps.cwd,
        encoding: 'utf8',
        shell: false,
        timeout: timeoutMs > 0 ? timeoutMs : undefined
      }
    );

    const normalized = {
      command: commandLine(command, args),
      status: result.status ?? (result.error ? 1 : 0),
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error ? String(result.error.message || result.error) : '',
      timedOut: isSpawnTimeout(result),
      attempts: attempt,
      maxAttempts,
      timeoutMs: timeoutMs > 0 ? timeoutMs : undefined
    };

    finalResult = normalized;
    if (normalized.status === 0) {
      break;
    }

    if (!(retryOnTransient && attempt < maxAttempts && isTransientNetworkFailure(normalized))) {
      break;
    }
  }

  return finalResult;
}

function withCommandPolicy(deps, commandPolicy) {
  return {
    ...deps,
    commandPolicy
  };
}

function runGateCommands(options, deps = {}) {
  const platform = deps.platform || process.platform;
  const npm = npmCommand(platform);
  const gates = [
    ['traceability:audit', npm, ['run', 'traceability:audit']],
    ['docs:links', npm, ['run', 'docs:links']],
    ['dod:gate', npm, ['run', 'dod:gate']],
    ['check', npm, ['run', 'check']],
    ['test', npm, ['test']],
    ['package', npm, ['run', 'package']]
  ];

  return gates.map(([name, command, args]) => {
    const started = Date.now();
    const result = runCommand(command, args, deps);
    const durationMs = Date.now() - started;
    return {
      name,
      ...result,
      durationMs,
      success: result.status === 0
    };
  });
}

function parseTraceabilitySummary(output) {
  const inventoryMatch = output.match(/Total inventory entries:\s*(\d+)/);
  const gapMatch = output.match(/Gap entries pending classification:\s*(\d+)/);
  return {
    inventoryEntries: inventoryMatch ? Number(inventoryMatch[1]) : undefined,
    gapEntries: gapMatch ? Number(gapMatch[1]) : undefined
  };
}

function parseGitTrackedFiles(output) {
  return String(output || '')
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\\/g, '/'));
}

function createTrackedWorktreeSnapshot(repoRoot, deps = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const listFiles = runCommand('git', ['ls-files', '-z'], withCommandPolicy({ ...deps, cwd: resolvedRepoRoot }, {
    timeoutMs: COMMAND_TIMEOUT_MS.gitRemote,
    maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
    retryOnTransient: false
  }));
  if (listFiles.status !== 0) {
    throw new Error(`Unable to enumerate tracked files for standards audit snapshot. ${listFiles.stderr || listFiles.error}`.trim());
  }

  const trackedFiles = parseGitTrackedFiles(listFiles.stdout);
  const tmpRoot = deps.tmpdir ? deps.tmpdir() : os.tmpdir();
  const mkdtempSyncImpl = deps.mkdtempSync || fs.mkdtempSync;
  const mkdirSyncImpl = deps.mkdirSync || fs.mkdirSync;
  const lstatSyncImpl = deps.lstatSync || fs.lstatSync;
  const copyFileSyncImpl = deps.copyFileSync || fs.copyFileSync;
  const readlinkSyncImpl = deps.readlinkSync || fs.readlinkSync;
  const writeFileSyncImpl = deps.writeFileSync || fs.writeFileSync;
  const snapshotPath = mkdtempSyncImpl(path.join(tmpRoot, 'vi-history-suite-audit-snapshot-'));
  const symlinkFiles = [];
  const missingFiles = [];

  for (const trackedFile of trackedFiles) {
    const sourcePath = path.join(resolvedRepoRoot, trackedFile);
    const targetPath = path.join(snapshotPath, trackedFile);
    mkdirSyncImpl(path.dirname(targetPath), { recursive: true });

    try {
      const stat = lstatSyncImpl(sourcePath);
      if (stat.isSymbolicLink()) {
        writeFileSyncImpl(targetPath, readlinkSyncImpl(sourcePath), 'utf8');
        symlinkFiles.push(trackedFile);
      } else if (stat.isFile()) {
        copyFileSyncImpl(sourcePath, targetPath);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missingFiles.push(trackedFile);
        continue;
      }
      throw error;
    }
  }

  return {
    mode: 'tracked-worktree-snapshot',
    path: snapshotPath,
    trackedFileCount: trackedFiles.length,
    symlinkFiles,
    missingFiles,
    generatedRootsExcluded: [...GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT]
  };
}

function removeTrackedWorktreeSnapshot(snapshot, deps = {}) {
  if (!snapshot?.path) {
    return;
  }

  const rmSyncImpl = deps.rmSync || fs.rmSync;
  rmSyncImpl(snapshot.path, { recursive: true, force: true });
}

function hostStandardsCommands(skillRoot) {
  const scripts = path.join(skillRoot, 'scripts');
  return [
    {
      name: 'preflight',
      file: 'standards-preflight.json',
      command: 'python3',
      args: [path.join(scripts, 'preflight_local_dependencies.py'), '--json']
    },
    {
      name: 'requirements-quality',
      file: 'requirements-quality.json',
      command: 'python3',
      args: [
        path.join(scripts, 'requirements_quality_check.py'),
        '.',
        '--requirements-spec-scope',
        'system',
        '--json'
      ]
    },
    {
      name: 'evidence-scan',
      file: 'repo-evidence-scan.json',
      command: 'python3',
      args: [
        path.join(scripts, 'repo_evidence_scan.py'),
        '.',
        '--format',
        'json',
        '--profile',
        'quick-triage',
        '--include-snippets'
      ]
    },
    {
      name: 'assurance-scorecard',
      file: 'assurance-scorecard.txt',
      command: 'python3',
      args: [
        path.join(scripts, 'run_assurance.py'),
        '.',
        '--profile',
        'quick-triage',
        '--output',
        'gate-scorecard'
      ]
    }
  ];
}

function parseJsonOrUndefined(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return undefined;
  }
}

function normalizeGateStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PASS' || normalized === 'FAIL' || normalized === 'N/A') {
    return normalized;
  }
  if (/^N\s*\/?\s*A$/u.test(normalized)) {
    return 'N/A';
  }
  return undefined;
}

function parseGateScorecard(scorecard) {
  const statuses = {};
  for (const line of String(scorecard || '').split(/\r?\n/u)) {
    if (!line.includes('|')) {
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2 || cells[0].toLowerCase() === 'gate' || /^-+$/u.test(cells[0])) {
      continue;
    }
    const status = normalizeGateStatus(cells[1]);
    if (status) {
      statuses[cells[0].toLowerCase()] = status;
    }
  }
  return statuses;
}

function normalizeEvidencePath(evidencePath) {
  return String(evidencePath || '').replace(/\\/g, '/');
}

function isCiWorkflowEvidencePath(evidencePath) {
  return /^\.github\/workflows\/ci\.yml$/iu.test(normalizeEvidencePath(evidencePath));
}

function isGeneratedAssuranceEvidencePath(evidencePath) {
  return /^assurance-[^/]*-evidence\//iu.test(normalizeEvidencePath(evidencePath));
}

function isGeneratedBuildEvidencePath(evidencePath) {
  return /^(?:out|dist|build|coverage)\//iu.test(normalizeEvidencePath(evidencePath));
}

function isTestFixtureEvidencePath(evidencePath) {
  const normalized = normalizeEvidencePath(evidencePath);
  return /^tests\//iu.test(normalized) || /\.test\.[cm]?[jt]sx?$/iu.test(normalized);
}

function classifyDodEvidenceSource(evidenceRecord) {
  const evidencePath = normalizeEvidencePath(evidenceRecord?.path);
  if (isCiWorkflowEvidencePath(evidencePath)) {
    return 'workflow';
  }
  if (isGeneratedAssuranceEvidencePath(evidencePath)) {
    return 'generated-assurance-evidence';
  }
  if (isGeneratedBuildEvidencePath(evidencePath)) {
    return 'generated-build-output';
  }
  if (isTestFixtureEvidencePath(evidencePath)) {
    return 'test-fixture';
  }
  return evidencePath ? 'untrusted-source' : 'missing-source';
}

function dodEvidenceRecords(evidenceScan) {
  return Array.isArray(evidenceScan?.evidence)
    ? evidenceScan.evidence.filter((item) => String(item?.rule_source || '').startsWith('GATE:dod:'))
    : [];
}

function summarizeDodGateEvidence(evidenceScan, scorecard) {
  const scorecardStatus = parseGateScorecard(scorecard).dod || 'FAIL';
  const sources = dodEvidenceRecords(evidenceScan).map((item) => ({
    path: normalizeEvidencePath(item.path),
    ruleSource: item.rule_source,
    matchedText: item.matched_text,
    lineStart: item.line_start,
    classification: classifyDodEvidenceSource(item)
  }));
  const trustedSources = sources.filter((item) => item.classification === 'workflow');
  const disqualifiedSources = sources.filter((item) => item.classification !== 'workflow');

  if (scorecardStatus === 'PASS' && trustedSources.length > 0) {
    return {
      status: 'PASS',
      scorecardStatus,
      source: 'workflow',
      trustedSources,
      disqualifiedSources,
      reason: 'Scanner-visible DoD evidence is present in .github/workflows/ci.yml.'
    };
  }

  if (scorecardStatus === 'PASS') {
    return {
      status: 'N/A',
      scorecardStatus,
      source: disqualifiedSources.length > 0 ? 'disqualified-only' : 'none',
      trustedSources,
      disqualifiedSources,
      reason: 'Raw DoD PASS ignored because .github/workflows/ci.yml does not supply scanner-visible DoD evidence.'
    };
  }

  if (scorecardStatus === 'FAIL') {
    return {
      status: 'FAIL',
      scorecardStatus,
      source: trustedSources.length > 0 ? 'workflow' : (disqualifiedSources.length > 0 ? 'disqualified-only' : 'none'),
      trustedSources,
      disqualifiedSources,
      reason: 'DoD scorecard row is FAIL or missing.'
    };
  }

  return {
    status: 'N/A',
    scorecardStatus,
    source: disqualifiedSources.length > 0 ? 'disqualified-only' : 'none',
    trustedSources,
    disqualifiedSources,
    reason: trustedSources.length > 0
      ? 'Workflow DoD evidence is visible, but the scorecard has not promoted DoD to PASS.'
      : 'No scanner-visible DoD evidence was found in .github/workflows/ci.yml.'
  };
}

function parseLsRemote(stdout) {
  return String(stdout || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [commit, ref] = line.split(/\s+/u);
      return { commit, ref };
    })
    .filter((entry) => entry.commit && entry.ref);
}

function findRemoteCommit(entries, refName) {
  return entries.find((entry) => entry.ref === refName)?.commit;
}

function findTagCommit(entries, tagName) {
  const tagRef = `refs/tags/${tagName}`;
  return (
    entries.find((entry) => entry.ref === `${tagRef}^{}`)?.commit ||
    entries.find((entry) => entry.ref === tagRef)?.commit
  );
}

function buildProvenanceCheck(name, commandResult, actualCommit, expectedCommit, unavailableMessage) {
  const success = commandResult.status === 0 && actualCommit === expectedCommit;
  let message = `${name} resolves to ${actualCommit || 'unknown'}.`;
  if (commandResult.status !== 0) {
    message = unavailableMessage;
  } else if (actualCommit !== expectedCommit) {
    message = `${name} resolved to ${actualCommit || 'unknown'}; expected ${expectedCommit}.`;
  }

  return {
    name,
    command: commandResult.command,
    status: commandResult.status,
    success,
    expectedCommit,
    actualCommit,
    message,
    stderr: commandResult.stderr,
    error: commandResult.error,
    timedOut: commandResult.timedOut,
    attempts: commandResult.attempts,
    maxAttempts: commandResult.maxAttempts,
    timeoutMs: commandResult.timeoutMs
  };
}

function verifyStandardsToolchainProvenance(options, deps = {}) {
  const existsSyncImpl = deps.existsSync || fs.existsSync;
  const expectedCommit = STANDARDS_TOOLCHAIN_EXPECTED_COMMIT;
  const gitRemoteDeps = withCommandPolicy(deps, {
    timeoutMs: COMMAND_TIMEOUT_MS.gitRemote,
    maxAttempts: COMMAND_RETRY_ATTEMPTS.transientNetwork,
    retryOnTransient: true
  });
  const gitlabMain = runCommand('git', [
    'ls-remote',
    STANDARDS_TOOLCHAIN_GITLAB_URL,
    'HEAD',
    'refs/heads/main'
  ], gitRemoteDeps);
  const githubMirror = runCommand('git', [
    'ls-remote',
    STANDARDS_TOOLCHAIN_GITHUB_URL,
    'HEAD',
    'refs/heads/main',
    `refs/tags/${STANDARDS_TOOLCHAIN_GITHUB_TAG}`,
    `refs/tags/${STANDARDS_TOOLCHAIN_GITHUB_TAG}^{}`
  ], gitRemoteDeps);
  const dockerManifestDeps = withCommandPolicy(deps, {
    timeoutMs: COMMAND_TIMEOUT_MS.dockerManifestInspect,
    maxAttempts: COMMAND_RETRY_ATTEMPTS.transientNetwork,
    retryOnTransient: true
  });
  const dockerManifest = runCommand('docker', [
    'manifest',
    'inspect',
    STANDARDS_TOOLCHAIN_REGISTRY_IMAGE
  ], dockerManifestDeps);
  const registryFailure = classifyDockerRegistryFailure(
    dockerManifest,
    STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
    'docker manifest inspect'
  );
  const gitlabEntries = parseLsRemote(gitlabMain.stdout);
  const githubEntries = parseLsRemote(githubMirror.stdout);
  const checks = [
    buildProvenanceCheck(
      'GitLab source main',
      gitlabMain,
      findRemoteCommit(gitlabEntries, 'refs/heads/main'),
      expectedCommit,
      `GitLab source is unavailable; verify access to ${STANDARDS_TOOLCHAIN_GITLAB_URL}.`
    ),
    buildProvenanceCheck(
      'GitHub mirror main',
      githubMirror,
      findRemoteCommit(githubEntries, 'refs/heads/main'),
      expectedCommit,
      `GitHub mirror is unavailable; verify access to ${STANDARDS_TOOLCHAIN_GITHUB_URL}.`
    ),
    buildProvenanceCheck(
      `GitHub mirror tag ${STANDARDS_TOOLCHAIN_GITHUB_TAG}`,
      githubMirror,
      findTagCommit(githubEntries, STANDARDS_TOOLCHAIN_GITHUB_TAG),
      expectedCommit,
      `GitHub mirror tag ${STANDARDS_TOOLCHAIN_GITHUB_TAG} is unavailable; verify mirror access.`
    )
  ];
  const skillCache = {
    path: options.skillRoot,
    exists: existsSyncImpl(options.skillRoot),
    authority: 'non-authoritative-cache',
    success: existsSyncImpl(options.skillRoot),
    message: existsSyncImpl(options.skillRoot)
      ? 'Local repo-standards-review skill cache exists but is not source authority.'
      : 'Local repo-standards-review skill cache is missing; install or refresh the local skill cache before closeout.'
  };
  const registry = {
    image: STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
    command: dockerManifest.command,
    status: dockerManifest.status,
    success: dockerManifest.status === 0,
    failureCategory: registryFailure.category,
    timedOut: dockerManifest.timedOut,
    attempts: dockerManifest.attempts,
    maxAttempts: dockerManifest.maxAttempts,
    timeoutMs: dockerManifest.timeoutMs,
    message: dockerManifest.status === 0
      ? 'Published Docker workbench image is accessible.'
      : `${registryFailure.message} Command: ${dockerManifest.command}.`,
    stderr: dockerManifest.stderr,
    error: dockerManifest.error
  };
  const success = checks.every((check) => check.success) && skillCache.success && registry.success;

  return {
    success,
    expectedCommit,
    gitlab: {
      url: STANDARDS_TOOLCHAIN_GITLAB_URL
    },
    github: {
      url: STANDARDS_TOOLCHAIN_GITHUB_URL,
      tag: STANDARDS_TOOLCHAIN_GITHUB_TAG
    },
    skillCache,
    registry,
    checks,
    failure: success
      ? undefined
      : [
        ...checks.filter((check) => !check.success).map((check) => check.message),
        skillCache.success ? undefined : skillCache.message,
        registry.success ? undefined : registry.message
      ].filter(Boolean).join(' ')
  };
}

function summarizeStandardsResults(results, runner) {
  const byName = new Map(results.map((result) => [result.name, result]));
  const preflight = parseJsonOrUndefined(byName.get('preflight')?.stdout || '');
  const requirementsQuality = parseJsonOrUndefined(byName.get('requirements-quality')?.stdout || '');
  const evidenceScan = parseJsonOrUndefined(byName.get('evidence-scan')?.stdout || '');
  const scorecard = byName.get('assurance-scorecard')?.stdout || '';
  const gateStatuses = parseGateScorecard(scorecard);
  const dodGateEvidence = summarizeDodGateEvidence(evidenceScan, scorecard);
  const failed = results.filter((result) => result.status !== 0);

  return {
    runner,
    success: failed.length === 0,
    failed,
    preflight,
    requirementsQuality,
    evidenceScan,
    scorecard,
    fileCount: evidenceScan?.inventory?.file_count,
    testSignal: evidenceScan?.areas?.TEST?.signal,
    reqSignal: evidenceScan?.areas?.REQ?.signal,
    coverageGate: gateStatuses.coverage,
    docGate: gateStatuses.doc,
    dodGate: dodGateEvidence.status,
    dodGateEvidence
  };
}

function runHostStandards(options, deps = {}) {
  const results = hostStandardsCommands(options.skillRoot).map((step) => ({
    ...step,
    ...runCommand(step.command, step.args, withCommandPolicy(deps, {
      timeoutMs: COMMAND_TIMEOUT_MS.hostPython,
      maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
      retryOnTransient: false
    }))
  }));
  const summary = summarizeStandardsResults(results, 'host');
  const preflightOk = summary.preflight?.ok === true;
  return {
    runner: 'host',
    success: summary.success && preflightOk,
    results,
    summary,
    failure: preflightOk ? undefined : 'Host standards preflight did not return ok: true.'
  };
}

function dockerStandardsCommands(image) {
  return [
    {
      name: 'requirements-quality',
      file: 'requirements-quality.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        '${REPO}:/target',
        image,
        'python3',
        'scripts/requirements_quality_check.py',
        '/target',
        '--requirements-spec-scope',
        'system',
        '--json'
      ]
    },
    {
      name: 'evidence-scan',
      file: 'repo-evidence-scan.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        '${REPO}:/target',
        image,
        'python3',
        'scripts/repo_evidence_scan.py',
        '/target',
        '--format',
        'json',
        '--profile',
        'quick-triage',
        '--include-snippets'
      ]
    },
    {
      name: 'assurance-scorecard',
      file: 'assurance-scorecard.txt',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        '${REPO}:/target',
        image,
        'python3',
        'scripts/run_assurance.py',
        '/target',
        '--profile',
        'quick-triage',
        '--output',
        'gate-scorecard'
      ]
    }
  ];
}

function replaceRepoMount(args, repoRoot) {
  return args.map((arg) => arg === '${REPO}:/target' ? `${repoRoot}:/target` : arg);
}

function runDockerStandards(options, deps = {}) {
  const repoRoot = deps.auditTarget?.path || deps.cwd || TRUSTED_REPO_ROOT;
  const inspect = runCommand('docker', ['image', 'inspect', options.standardsImage], withCommandPolicy(deps, {
    timeoutMs: COMMAND_TIMEOUT_MS.dockerImageInspect,
    maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
    retryOnTransient: false
  }));
  const results = [{
    name: 'docker-preflight',
    file: 'standards-docker-preflight.txt',
    ...inspect
  }];
  let imageAvailable = inspect.status === 0;
  let imageAccess = imageAvailable ? 'present' : 'missing';
  const usesPublishedRegistryImage = options.standardsImage === STANDARDS_TOOLCHAIN_REGISTRY_IMAGE;

  if (!imageAvailable) {
    if (usesPublishedRegistryImage) {
      const pull = runCommand('docker', ['pull', options.standardsImage], withCommandPolicy(deps, {
        timeoutMs: COMMAND_TIMEOUT_MS.dockerPull,
        maxAttempts: COMMAND_RETRY_ATTEMPTS.transientNetwork,
        retryOnTransient: true
      }));
      results.push({ name: 'docker-pull', file: 'standards-docker-pull.txt', ...pull });
      if (pull.status !== 0) {
        const pullFailure = classifyDockerRegistryFailure(
          pull,
          options.standardsImage,
          'docker pull'
        );
        return {
          runner: 'docker',
          image: options.standardsImage,
          imageAccess: 'pull-failed',
          failureCategory: pullFailure.category,
          success: false,
          results,
          summary: {
            runner: 'docker',
            success: false,
            scorecard: '',
            failed: [{ name: 'docker-pull', ...pull }]
          },
          failure: `${pullFailure.message} Command: ${pull.command}.`
        };
      }

      const verifyPulledImage = runCommand('docker', ['image', 'inspect', options.standardsImage], withCommandPolicy(deps, {
        timeoutMs: COMMAND_TIMEOUT_MS.dockerImageInspect,
        maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
        retryOnTransient: false
      }));
      results.push({
        name: 'docker-image-after-pull',
        file: 'standards-docker-image-after-pull.txt',
        ...verifyPulledImage
      });
      imageAvailable = verifyPulledImage.status === 0;
      imageAccess = imageAvailable ? 'pulled' : 'pull-unverified';
      if (!imageAvailable) {
        return {
          runner: 'docker',
          image: options.standardsImage,
          imageAccess,
          success: false,
          results,
          summary: {
            runner: 'docker',
            success: false,
            scorecard: '',
            failed: [{ name: 'docker-image-after-pull', ...verifyPulledImage }]
          },
          failure: `Docker standards image '${options.standardsImage}' was pulled, but it could not be inspected.`
        };
      }
    } else {
    if (!options.buildStandardsImage) {
      return {
        runner: 'docker',
        image: options.standardsImage,
        imageAccess: 'missing',
        success: false,
        results,
        summary: {
          runner: 'docker',
          success: false,
          scorecard: '',
          failed: results
        },
        failure: `Docker standards image '${options.standardsImage}' is missing. Use the published default image or build the explicit local override with: docker build -f "${path.join(options.skillRoot, 'docker', 'assurance-workbench', 'Dockerfile')}" -t ${options.standardsImage} "${options.skillRoot}"`
      };
    }

    const build = runCommand('docker', [
      'build',
      '-f',
      path.join(options.skillRoot, 'docker', 'assurance-workbench', 'Dockerfile'),
      '-t',
      options.standardsImage,
      options.skillRoot
    ], withCommandPolicy(deps, {
      timeoutMs: COMMAND_TIMEOUT_MS.dockerBuild,
      maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
      retryOnTransient: false
    }));
    results.push({ name: 'docker-build', file: 'standards-docker-build.txt', ...build });
    if (build.status !== 0) {
      return {
        runner: 'docker',
        image: options.standardsImage,
        imageAccess: 'build-failed',
        success: false,
        results,
        summary: {
          runner: 'docker',
          success: false,
          scorecard: '',
          failed: [{ name: 'docker-build', ...build }]
        },
        failure: 'Docker standards image build failed.'
      };
    }

    const verifyImage = runCommand('docker', ['image', 'inspect', options.standardsImage], withCommandPolicy(deps, {
      timeoutMs: COMMAND_TIMEOUT_MS.dockerImageInspect,
      maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
      retryOnTransient: false
    }));
    results.push({
      name: 'docker-image-after-build',
      file: 'standards-docker-image-after-build.txt',
      ...verifyImage
    });
    imageAvailable = verifyImage.status === 0;
    imageAccess = imageAvailable ? 'built-local' : 'build-unverified';
    if (!imageAvailable) {
      return {
        runner: 'docker',
        image: options.standardsImage,
        imageAccess,
        success: false,
        results,
        summary: {
          runner: 'docker',
          success: false,
          scorecard: '',
          failed: [{ name: 'docker-image-after-build', ...verifyImage }]
        },
        failure: 'Docker standards image build completed, but the image could not be inspected.'
      };
    }
    }
  }

  results.push(
    ...dockerStandardsCommands(options.standardsImage).map((step) => ({
      ...step,
      args: replaceRepoMount(step.args, repoRoot),
      ...runCommand(step.command, replaceRepoMount(step.args, repoRoot), withCommandPolicy(deps, {
        timeoutMs: COMMAND_TIMEOUT_MS.dockerRun,
        maxAttempts: COMMAND_RETRY_ATTEMPTS.none,
        retryOnTransient: false
      }))
    }))
  );
  const summary = summarizeStandardsResults(
    results.filter((result) => !result.name.startsWith('docker-')),
    'docker'
  );
  return {
    runner: 'docker',
    image: options.standardsImage,
    imageAccess,
    success: imageAvailable && summary.success,
    results,
    summary,
    failure: summary.success ? undefined : 'Docker standards evidence failed.'
  };
}

function runStandardsEvidence(options, deps = {}) {
  if (options.standardsRunner === 'host') {
    return runHostStandards(options, deps);
  }

  if (options.standardsRunner === 'docker') {
    return runDockerStandards(options, deps);
  }

  const host = runHostStandards(options, deps);
  if (host.success) {
    return host;
  }

  const docker = runDockerStandards(options, deps);
  if (docker.success) {
    docker.hostFailure = host.failure || host.summary.failed?.[0]?.stderr || 'Host standards runner failed.';
    return docker;
  }

  return {
    runner: 'auto',
    success: false,
    results: [
      ...host.results.map((result) => ({ ...result, file: `host-${result.file}` })),
      ...docker.results.map((result) => ({ ...result, file: `docker-${result.file}` }))
    ],
    summary: {
      runner: 'auto',
      success: false,
      scorecard: docker.summary.scorecard || host.summary.scorecard || '',
      failed: [...(host.summary.failed || []), ...(docker.summary.failed || [])]
    },
    failure: `Standards evidence failed through host and Docker. Host: ${host.failure || 'failed'}. Docker: ${docker.failure || 'failed'}.`
  };
}

function tryGhJson(args, deps = {}) {
  const result = runCommand('gh', args, withCommandPolicy(deps, {
    timeoutMs: COMMAND_TIMEOUT_MS.ghApi,
    maxAttempts: COMMAND_RETRY_ATTEMPTS.transientNetwork,
    retryOnTransient: true
  }));
  if (result.status !== 0) {
    return undefined;
  }
  return parseJsonOrUndefined(result.stdout);
}

function collectGitContext(deps = {}) {
  const branch = runCommand('git', ['branch', '--show-current'], deps);
  const commit = runCommand('git', ['rev-parse', '--short=8', 'HEAD'], deps);
  const fullCommit = runCommand('git', ['rev-parse', 'HEAD'], deps);
  return {
    branch: branch.status === 0 ? branch.stdout.trim() : 'unknown',
    commit: commit.status === 0 ? commit.stdout.trim() : 'unknown',
    fullCommit: fullCommit.status === 0 ? fullCommit.stdout.trim() : 'unknown'
  };
}

function collectGithubContext(options, deps = {}) {
  const context = {
    issue: undefined,
    releasePr: undefined,
    backSyncPr: undefined
  };

  if (options.issue) {
    context.issue = tryGhJson([
      'issue',
      'view',
      String(options.issue),
      '--json',
      'number,title,state,url'
    ], deps);
  }

  if (options.releasePr) {
    context.releasePr = tryGhJson([
      'pr',
      'view',
      String(options.releasePr),
      '--json',
      'number,title,state,url,mergeCommit'
    ], deps);
  }

  if (options.backSyncPr) {
    context.backSyncPr = tryGhJson([
      'pr',
      'view',
      String(options.backSyncPr),
      '--json',
      'number,title,state,url,mergeCommit'
    ], deps);
  }

  return context;
}

function prepareEvidenceDirectory(saveDir, cwd) {
  if (!saveDir) {
    return;
  }

  const resolvedSaveDir = path.resolve(saveDir);
  const resolvedCwd = path.resolve(cwd);
  const relative = path.relative(resolvedCwd, resolvedSaveDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--save-dir must resolve to a directory inside the repository root');
  }

  fs.rmSync(resolvedSaveDir, { recursive: true, force: true });
}

function writeEvidenceFiles(saveDir, records) {
  if (!saveDir) {
    return;
  }
  fs.mkdirSync(saveDir, { recursive: true });
  for (const record of records) {
    const body = record.stdout || record.stderr || record.error || '';
    fs.writeFileSync(path.join(saveDir, record.file || `${record.name}.txt`), body, 'utf8');
  }
}

function markdownTable(rows) {
  return rows.join('\n');
}

function renderGateTable(gates, traceabilitySummary) {
  if (!gates) {
    return [
      '| Gate | Status | Evidence |',
      '| --- | --- | --- |',
      '| local gates | NOT RUN | Not closable yet until `--run-gates` is used or equivalent results are supplied. |'
    ].join('\n');
  }

  const rows = [
    '| Gate | Status | Evidence |',
    '| --- | --- | --- |'
  ];
  for (const gate of gates) {
    rows.push(`| ${gate.name} | ${gate.success ? 'PASS' : 'FAIL'} | ${gate.command} |`);
  }
  if (traceabilitySummary.inventoryEntries !== undefined) {
    rows.push(`| traceability summary | INFO | ${traceabilitySummary.inventoryEntries} inventory entries; ${traceabilitySummary.gapEntries ?? 'unknown'} gaps |`);
  }
  return rows.join('\n');
}

function formatDodGateSummary(dodGateEvidence) {
  if (!dodGateEvidence) {
    return 'FAIL';
  }

  const trusted = dodGateEvidence.trustedSources.map((item) => item.path).join(', ') || 'none';
  const disqualified = dodGateEvidence.disqualifiedSources
    .map((item) => `${item.classification}:${item.path}`)
    .join(', ') || 'none';
  return `${dodGateEvidence.status} (raw=${dodGateEvidence.scorecardStatus}; source=${dodGateEvidence.source}; workflow=${trusted}; disqualified=${disqualified})`;
}

function renderStandardsSummary(standards) {
  if (!standards.success) {
    return [
      `- Standards runner: ${standards.runner}`,
      `- Standards evidence failed: ${standards.failure || 'unknown failure'}`
    ].join('\n');
  }

  const summary = standards.summary;
  const lines = [
    `- Standards runner: ${summary.runner}`,
    standards.auditTarget
      ? `- Audit target: ${standards.auditTarget.mode}; ${standards.auditTarget.trackedFileCount} tracked files; generated roots excluded.`
      : undefined,
    `- Requirements quality: ${summary.requirementsQuality?.ok === true ? 'PASS' : 'see raw evidence'}`,
    `- Evidence scan: ${summary.fileCount ?? 'unknown'} files; REQ=${summary.reqSignal ?? 'unknown'}; TEST=${summary.testSignal ?? 'unknown'}`,
    `- Gate scorecard: coverage=${summary.coverageGate ?? 'FAIL'}; doc=${summary.docGate ?? 'FAIL'}; dod=${formatDodGateSummary(summary.dodGateEvidence)}`,
    '- Definition-of-Done evidence: local `dod:gate` and standards scorecard status are retained in closeout evidence.'
  ].filter(Boolean);
  if (standards.runner === 'docker') {
    lines.splice(1, 0, `- Docker image: ${standards.image}; image access=${standards.imageAccess}`);
  }
  return lines.join('\n');
}

function renderProvenanceSummary(provenance) {
  const rows = [
    '| Surface | Status | Evidence |',
    '| --- | --- | --- |'
  ];
  for (const check of provenance.checks) {
    rows.push(`| ${check.name} | ${check.success ? 'PASS' : 'FAIL'} | ${check.message} |`);
  }
  rows.push(
    `| local skill cache | ${provenance.skillCache.success ? 'PASS' : 'FAIL'} | ${provenance.skillCache.message} Authority: ${provenance.skillCache.authority}. |`
  );
  rows.push(
    `| Docker registry image | ${provenance.registry.success ? 'PASS' : 'FAIL'} | ${provenance.registry.message} |`
  );
  if (!provenance.success && provenance.failure) {
    rows.push(`| provenance decision | FAIL | ${provenance.failure} |`);
  }
  return rows.join('\n');
}

function renderReleaseReferences(options, githubContext) {
  if (options.kind !== 'release') {
    return '';
  }

  return [
    '## Release References',
    '',
    `- Release tag: ${options.releaseTag || 'not supplied'}`,
    `- Release PR: ${githubContext.releasePr?.url || options.releasePr || 'not supplied'}`,
    `- Back-sync PR: ${githubContext.backSyncPr?.url || options.backSyncPr || 'not supplied'}`,
    `- Marketplace workflow run: ${options.marketplaceRun || 'not supplied'}`
  ].join('\n');
}

function evaluateClosureDecision(context) {
  const localGatesRan = Array.isArray(context.gates);
  const localGatesPassed = localGatesRan ? context.gates.every((gate) => gate.success) : false;
  const failedLocalGates = localGatesRan
    ? context.gates.filter((gate) => !gate.success).map((gate) => gate.name)
    : [];
  const standardsPassed = context.standards?.success === true;
  const provenancePassed = context.provenance?.success === true;
  const reasons = [];

  if (!localGatesRan) {
    reasons.push('Local gates were not run; use --run-gates or provide equivalent gate evidence.');
  } else if (!localGatesPassed) {
    reasons.push(`Local gate failures detected: ${failedLocalGates.join(', ')}.`);
  }

  if (!standardsPassed) {
    reasons.push(context.standards?.failure || 'Standards evidence failed.');
  }

  if (!provenancePassed) {
    reasons.push(context.provenance?.failure || 'Standards toolchain provenance failed.');
  }

  return {
    closable: localGatesPassed && standardsPassed && provenancePassed,
    localGatesRan,
    localGatesPassed,
    failedLocalGates,
    standardsPassed,
    provenancePassed,
    reasons
  };
}

function buildMachineReadableCloseoutSummary(context, exitCode) {
  const closureDecision = context.closureDecision || evaluateClosureDecision(context);
  const standardsSummary = context.standards?.summary || {};

  return {
    schemaVersion: 1,
    kind: context.options.kind,
    issueNumber: context.options.issue ? Number(context.options.issue) : undefined,
    githubIssueUrl: context.githubContext.issue?.url,
    git: {
      branch: context.git.branch,
      commit: context.git.fullCommit,
      shortCommit: context.git.commit
    },
    localGates: {
      ran: closureDecision.localGatesRan,
      passed: closureDecision.localGatesPassed,
      failed: closureDecision.failedLocalGates,
      traceabilitySummary: {
        inventoryEntries: context.traceabilitySummary?.inventoryEntries,
        gapEntries: context.traceabilitySummary?.gapEntries
      },
      results: (context.gates || []).map((gate) => ({
        name: gate.name,
        status: gate.success ? 'PASS' : 'FAIL',
        command: gate.command,
        durationMs: gate.durationMs
      }))
    },
    standards: {
      runner: context.standards.runner,
      success: context.standards.success,
      failure: context.standards.failure,
      failureCategory: context.standards.failureCategory,
      image: context.standards.image,
      imageAccess: context.standards.imageAccess,
      hostFailure: context.standards.hostFailure,
      auditTarget: context.standards.auditTarget ? {
        mode: context.standards.auditTarget.mode,
        trackedFileCount: context.standards.auditTarget.trackedFileCount,
        generatedRootsExcluded: context.standards.auditTarget.generatedRootsExcluded
      } : undefined,
      summary: {
        fileCount: standardsSummary.fileCount,
        reqSignal: standardsSummary.reqSignal,
        testSignal: standardsSummary.testSignal,
        coverageGate: standardsSummary.coverageGate,
        docGate: standardsSummary.docGate,
        dodGate: standardsSummary.dodGate,
        dodGateEvidence: standardsSummary.dodGateEvidence
      }
    },
    provenance: {
      success: context.provenance.success,
      failure: context.provenance.failure,
      expectedCommit: context.provenance.expectedCommit,
      checks: context.provenance.checks.map((check) => ({
        name: check.name,
        success: check.success,
        expectedCommit: check.expectedCommit,
        actualCommit: check.actualCommit,
        message: check.message,
        status: check.status,
        timedOut: check.timedOut,
        attempts: check.attempts,
        maxAttempts: check.maxAttempts,
        timeoutMs: check.timeoutMs
      })),
      skillCache: {
        path: context.provenance.skillCache.path,
        exists: context.provenance.skillCache.exists,
        authority: context.provenance.skillCache.authority,
        success: context.provenance.skillCache.success,
        message: context.provenance.skillCache.message
      },
      registry: {
        image: context.provenance.registry.image,
        success: context.provenance.registry.success,
        failureCategory: context.provenance.registry.failureCategory,
        message: context.provenance.registry.message,
        timedOut: context.provenance.registry.timedOut,
        attempts: context.provenance.registry.attempts,
        maxAttempts: context.provenance.registry.maxAttempts,
        timeoutMs: context.provenance.registry.timeoutMs
      }
    },
    closureDecision: {
      closable: closureDecision.closable,
      requirements: {
        localGates: closureDecision.localGatesPassed,
        standardsEvidence: closureDecision.standardsPassed,
        standardsProvenance: closureDecision.provenancePassed
      },
      reasons: closureDecision.reasons
    },
    exitCode
  };
}

function renderCloseoutMarkdown(context) {
  const closureDecision = context.closureDecision || evaluateClosureDecision(context);
  const closable = closureDecision.closable;
  const traceabilitySummary = context.traceabilitySummary || {};
  const issueLabel = context.options.issue ? `#${context.options.issue}` : 'unspecified issue';
  const releaseReferences = renderReleaseReferences(context.options, context.githubContext);

  return [
    `# Closeout Evidence: ${issueLabel}`,
    '',
    `- Kind: ${context.options.kind}`,
    `- Branch: ${context.git.branch}`,
    `- Commit: ${context.git.fullCommit}`,
    `- GitHub issue: ${context.githubContext.issue?.url || 'unavailable; supply manually if needed'}`,
    '',
    releaseReferences,
    releaseReferences ? '' : undefined,
    '## Local Gates',
    '',
    renderGateTable(context.gates, traceabilitySummary),
    '',
    '## Standards Evidence',
    '',
    renderStandardsSummary(context.standards),
    '',
    '## Standards Toolchain Provenance',
    '',
    renderProvenanceSummary(context.provenance),
    '',
    '## Closure Decision',
    '',
    closable
      ? '- Closable: yes. Mandatory standards evidence, standards toolchain provenance, and local gates passed.'
      : '- Closable: no. Not closable yet until mandatory standards evidence, standards toolchain provenance, and local gates are all clean.',
    '',
    '## Follow-Up',
    '',
    '- Resolve any non-PASS Definition-of-Done evidence before umbrella closeout, or record the blocking follow-up issue.'
  ].filter((line) => line !== undefined).join('\n');
}

function generateCloseoutEvidence(argv, deps = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    return { exitCode: 0, markdown: usage(), context: { options } };
  }

  const cwd = TRUSTED_REPO_ROOT;
  const saveDir = options.saveDir ? path.resolve(cwd, options.saveDir) : undefined;
  prepareEvidenceDirectory(saveDir, cwd);
  const git = collectGitContext({ ...deps, cwd });
  const githubContext = collectGithubContext(options, { ...deps, cwd });
  const gates = options.runGates ? runGateCommands(options, { ...deps, cwd }) : undefined;
  const traceabilityGate = gates?.find((gate) => gate.name === 'traceability:audit');
  const traceabilitySummary = parseTraceabilitySummary(
    `${traceabilityGate?.stdout || ''}\n${traceabilityGate?.stderr || ''}`
  );
  const auditTarget = createTrackedWorktreeSnapshot(cwd, deps);
  let standards;
  try {
    standards = runStandardsEvidence(options, { ...deps, cwd: auditTarget.path, auditTarget });
    standards.auditTarget = auditTarget;
  } finally {
    removeTrackedWorktreeSnapshot(auditTarget, deps);
  }
  const provenance = verifyStandardsToolchainProvenance(options, { ...deps, cwd });
  const evidenceHygiene = {
    auditTarget: {
      mode: standards.auditTarget?.mode,
      trackedFileCount: standards.auditTarget?.trackedFileCount,
      generatedRootsExcluded: standards.auditTarget?.generatedRootsExcluded,
      symlinkFiles: standards.auditTarget?.symlinkFiles,
      missingFiles: standards.auditTarget?.missingFiles
    },
    dodGate: standards.summary?.dodGateEvidence,
    policy: {
      passSource: 'Only scanner-visible DoD evidence in .github/workflows/ci.yml can promote DoD to PASS.',
      disqualifiedSources: [
        'assurance-*-evidence generated evidence',
        'out/dist/build/coverage generated output',
        'tests/ unit or integration fixture text',
        'documentation-only references'
      ]
    }
  };
  const records = [
    ...(gates || []).map((gate) => ({ ...gate, file: `gate-${gate.name.replace(/[:/\\]/g, '-')}.txt` })),
    ...standards.results,
    {
      name: 'standards-evidence-hygiene',
      file: 'standards-evidence-hygiene.json',
      stdout: JSON.stringify(evidenceHygiene, null, 2),
      stderr: '',
      error: '',
      status: 0
    },
    {
      name: 'standards-audit-target',
      file: 'standards-audit-target.json',
      stdout: JSON.stringify(standards.auditTarget, null, 2),
      stderr: '',
      error: '',
      status: 0
    },
    {
      name: 'standards-toolchain-provenance',
      file: 'standards-toolchain-provenance.json',
      stdout: JSON.stringify(provenance, null, 2),
      stderr: '',
      error: '',
      status: provenance.success ? 0 : 1
    }
  ];

  const context = {
    options,
    git,
    githubContext,
    gates,
    traceabilitySummary,
    standards,
    provenance
  };
  const closureDecision = evaluateClosureDecision(context);
  context.closureDecision = closureDecision;
  const gateFailure = closureDecision.localGatesRan ? !closureDecision.localGatesPassed : false;
  const exitCode = standards.success && provenance.success && !gateFailure ? 0 : 1;
  const machineReadableSummary = buildMachineReadableCloseoutSummary(context, exitCode);
  context.machineReadableSummary = machineReadableSummary;
  records.push({
    name: 'closeout-summary',
    file: 'closeout-summary.json',
    stdout: JSON.stringify(machineReadableSummary, null, 2),
    stderr: '',
    error: '',
    status: exitCode
  });

  writeEvidenceFiles(saveDir, records);

  const markdown = renderCloseoutMarkdown(context);
  return {
    exitCode,
    markdown,
    context
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = generateCloseoutEvidence(argv, deps);
    process.stdout.write(`${result.markdown}\n`);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  ALLOWED_EXECUTABLE_COMMANDS,
  DEFAULT_SAVE_DIR,
  DEFAULT_STANDARDS_IMAGE,
  GENERATED_ROOTS_EXCLUDED_FROM_STANDARDS_AUDIT,
  LOCAL_STANDARDS_IMAGE,
  STANDARDS_TOOLCHAIN_EXPECTED_COMMIT,
  STANDARDS_TOOLCHAIN_GITHUB_TAG,
  STANDARDS_TOOLCHAIN_GITHUB_URL,
  STANDARDS_TOOLCHAIN_GITLAB_URL,
  STANDARDS_TOOLCHAIN_REGISTRY_IMAGE,
  collectGithubContext,
  collectGitContext,
  createTrackedWorktreeSnapshot,
  dockerStandardsCommands,
  findRemoteCommit,
  findTagCommit,
  generateCloseoutEvidence,
  hostStandardsCommands,
  parseGateScorecard,
  main,
  parseArgs,
  parseGitTrackedFiles,
  parseLsRemote,
  parseTraceabilitySummary,
  renderCloseoutMarkdown,
  removeTrackedWorktreeSnapshot,
  isAllowedExecutableCommand,
  assertAllowedExecutableCommand,
  runCommand,
  evaluateClosureDecision,
  buildMachineReadableCloseoutSummary,
  runDockerStandards,
  runGateCommands,
  runHostStandards,
  runStandardsEvidence,
  summarizeStandardsResults,
  summarizeDodGateEvidence,
  verifyStandardsToolchainProvenance,
  classifyDockerRegistryFailure,
  isTransientNetworkFailure
};
