#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXECUTOR = 'local-skill';
const DEFAULT_CONTAINER_RUNTIME = 'docker';
const DEFAULT_ASSURANCE_IMAGE =
  'registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main';
const DEFAULT_SCOPE_ROOT = 'staged-target';
const AUTHORITY_DOCS_EXACT_PATHS = [
  'README.md',
  'INSTALL.md',
  'docs/user-guide.md',
  'docs/faq.md',
  'docs/glossary.md',
  'docs/quick-reference.md',
  'docs/documentation-workbench.md',
  'docs/information-item-map.md',
  'docs/product/current-state.md',
  'docs/release-procedure.md',
  'docs/product/private-release-windows-x64-v1.3.0.md',
  'docs/product/private-release-windows-x64-v1.3.0.json',
  'docs/product/public-release-candidate.md'
];
const AUTHORITY_DOCS_PREFIXES = ['docs/information-for-users/'];
const REPO_SCOPE_EXCLUDED_PREFIXES = [
  '.cache/',
  '.vscode-test/',
  'coverage/',
  'out/',
  'out-tests/',
  'node_modules/',
  'preview-evidence/',
  'release-evidence/',
  'docs-integration-evidence/',
  'wiki-workbench-evidence/',
  'docs-workbench-evidence/',
  'assurance-release-gate-evidence/',
  'assurance-26514-authority-evidence/',
  'assurance-requirements-quality-evidence/',
  'assurance-external-user-information-evidence/',
  'assurance-audit-packet-evidence/',
  'windows-private-release-evidence/'
];
const LANE_CONFIG = {
  'release-gate': {
    scope: 'repo',
    evidenceAlias: 'release-gate-scorecard.txt',
    output: 'gate-scorecard',
    reportLabel: 'release-gate'
  },
  '26514-authority': {
    scope: 'authority-docs',
    evidenceAlias: 'documentation-proof.txt',
    output: 'documentation-proof',
    profile: '26514-review',
    reportLabel: 'documentation-proof'
  },
  requirements: {
    scope: 'repo-root',
    jsonFile: 'requirements-quality.json',
    scriptName: 'requirements_quality_check.py'
  },
  'user-info': {
    scope: 'repo-root',
    jsonFile: 'external-user-information.json',
    scriptName: 'external_user_information_check.py'
  },
  'evidence-pack': {
    scope: 'repo',
    evidenceAlias: 'report.txt',
    mode: 'evidence-pack',
    output: 'gate-scorecard',
    reportLabel: 'evidence-pack'
  },
  uplift: {
    scope: 'repo',
    evidenceAlias: 'risk-register.txt',
    mode: 'uplift',
    output: 'risk-register',
    profile: 'compliance-uplift',
    reportLabel: 'risk-register'
  }
};

function getUsage() {
  return [
    'Usage: node scripts/runAssuranceAudit.js --lane <release-gate|26514-authority|requirements|user-info|evidence-pack|uplift> [--evidence-dir <path>] [--repo-root <path>] [--executor <local-skill|container>] [--help]',
    '',
    'Repo-owned assurance wrapper that stages governed audit targets before',
    'calling repo-standards-review through a local skill checkout or a',
    'self-hosted CI container lane.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    lane: '',
    repoRoot: DEFAULT_REPO_ROOT,
    evidenceRoot: '',
    executor: ''
  };

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

    if (current === '--help' || current === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--lane') {
      parsed.lane = requireValue('--lane');
      continue;
    }
    if (current === '--repo-root') {
      parsed.repoRoot = path.resolve(requireValue('--repo-root'));
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceRoot = path.resolve(requireValue('--evidence-dir'));
      continue;
    }
    if (current === '--executor') {
      parsed.executor = requireValue('--executor');
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  if (!parsed.helpRequested && !Object.prototype.hasOwnProperty.call(LANE_CONFIG, parsed.lane)) {
    throw new Error(`Unsupported or missing --lane.\n\n${getUsage()}`);
  }

  if (!parsed.evidenceRoot) {
    const directoryName =
      parsed.lane === '26514-authority'
        ? 'assurance-26514-authority-evidence'
        : `assurance-${parsed.lane.replace(/:/g, '-')}-evidence`;
    parsed.evidenceRoot = path.join(parsed.repoRoot, directoryName);
  }

  return parsed;
}

function normalizeRelativePath(candidatePath) {
  return String(candidatePath).replace(/\\/g, '/');
}

function quoteCommandSegment(segment) {
  if (/[\s"]/u.test(segment) || /^[A-Za-z]:\\/u.test(segment)) {
    return `"${String(segment).replace(/"/g, '\\"')}"`;
  }
  return String(segment);
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteCommandSegment).join(' ');
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, `${text.replace(/\r?\n$/, '')}\n`, 'utf8');
}

function writeJson(filePath, payload) {
  writeText(filePath, JSON.stringify(payload, null, 2));
}

function ensureLaneConfig(lane) {
  const config = LANE_CONFIG[lane];
  if (!config) {
    throw new Error(`Unsupported lane: ${lane}`);
  }
  return config;
}

function resolveExecutor(explicitExecutor, env = process.env) {
  const candidate = `${explicitExecutor || env.VIHS_ASSURANCE_EXECUTOR || DEFAULT_EXECUTOR}`.trim();
  if (candidate !== 'local-skill' && candidate !== 'container') {
    throw new Error(
      `Unsupported assurance executor: ${candidate}. Expected local-skill or container.`
    );
  }
  return candidate;
}

function defaultSkillRootCandidates(env = process.env, homeDirectory = os.homedir()) {
  return [
    `${env.VIHS_ASSURANCE_SKILL_ROOT || ''}`.trim(),
    path.join(homeDirectory, '.codex', 'skills', 'repo-standards-review'),
    path.join(homeDirectory, '.codex', 'skills', 'repo-standards-review'),
    '/mnt/c/Users/sveld/.codex/skills/repo-standards-review'
  ].filter((candidate, index, values) => candidate && values.indexOf(candidate) === index);
}

function resolveSkillRoot(env = process.env, existsSyncImpl = fs.existsSync) {
  for (const candidate of defaultSkillRootCandidates(env)) {
    const scriptPath = path.join(candidate, 'scripts', 'run_assurance.py');
    if (existsSyncImpl(scriptPath)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(
    'Could not resolve the local repo-standards-review skill root. Set VIHS_ASSURANCE_SKILL_ROOT.'
  );
}

function getWindowsPythonExecutableCandidates(env = process.env) {
  const candidates = new Set();
  const versionDirectories = ['Python313', 'Python312', 'Python311', 'Python310', 'Python39'];
  const localAppData = `${env.LocalAppData || ''}`.trim();
  const programRoots = [env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)']]
    .map((value) => `${value || ''}`.trim())
    .filter((value) => value.length > 0);

  if (localAppData) {
    for (const versionDirectory of versionDirectories) {
      candidates.add(
        path.win32.join(localAppData, 'Programs', 'Python', versionDirectory, 'python.exe')
      );
    }
  }

  for (const programRoot of programRoots) {
    for (const versionDirectory of versionDirectories) {
      candidates.add(path.win32.join(programRoot, versionDirectory, 'python.exe'));
    }
  }

  return [...candidates];
}

function resolvePythonInvocation(
  env = process.env,
  platform = process.platform,
  existsSyncImpl = fs.existsSync
) {
  const explicit = `${env.VIHS_ASSURANCE_PYTHON || ''}`.trim();
  if (explicit) {
    return { command: explicit, args: [] };
  }

  if (platform === 'win32') {
    for (const candidate of getWindowsPythonExecutableCandidates(env)) {
      if (existsSyncImpl(candidate)) {
        return { command: candidate, args: [] };
      }
    }

    return { command: 'py', args: ['-3'] };
  }

  return { command: 'python3', args: [] };
}

function toWslMountedPath(candidatePath) {
  const normalized = String(candidatePath).replace(/\\/g, '/');
  const driveMatch = /^([A-Za-z]):(.*)$/.exec(normalized);
  if (!driveMatch) {
    return normalized;
  }

  return `/mnt/${driveMatch[1].toLowerCase()}${driveMatch[2]}`;
}

function resolveWindowsWslExecutable(env = process.env, existsSyncImpl = fs.existsSync) {
  const systemRoot = `${env.SystemRoot || 'C:\\Windows'}`.trim();
  const candidate = path.win32.join(systemRoot, 'System32', 'wsl.exe');
  return existsSyncImpl(candidate) ? candidate : '';
}

function resolveWindowsAssuranceDistro(env = process.env) {
  return `${env.VIHS_LINUX_ASSURANCE_DISTRO || 'Ubuntu-24.04'}`.trim() || 'Ubuntu-24.04';
}

function normalizeWslAssuranceArgument(argument) {
  return /^[A-Za-z]:[\\/]/u.test(argument) || String(argument).includes('\\')
    ? toWslMountedPath(argument)
    : String(argument);
}

function buildWslPythonInvocation(scriptPath, scriptArgs, env = process.env, existsSyncImpl = fs.existsSync) {
  const wslExecutable = resolveWindowsWslExecutable(env, existsSyncImpl);
  if (!wslExecutable) {
    return null;
  }

  return {
    command: wslExecutable,
    args: [
      '-d',
      resolveWindowsAssuranceDistro(env),
      '--exec',
      'python3',
      toWslMountedPath(scriptPath),
      ...scriptArgs.map((argument) => normalizeWslAssuranceArgument(argument))
    ]
  };
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error
  };
}

function ensureProcessSucceeded(result, commandSummary) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${String(result.status)}: ${commandSummary}\n${(result.stderr || result.stdout || '').trim()}`
    );
  }
}

function gitTrackedFiles(repoRoot, spawnImpl = runProcess) {
  const result = spawnImpl('git', ['-C', repoRoot, 'ls-files', '-z']);
  ensureProcessSucceeded(result, `git -C ${repoRoot} ls-files -z`);
  return result.stdout
    .split('\0')
    .map((entry) => normalizeRelativePath(entry.trim()))
    .filter((entry) => entry.length > 0);
}

function isRepoScopePathIncluded(relativePath) {
  return !REPO_SCOPE_EXCLUDED_PREFIXES.some(
    (prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix)
  );
}

function isAuthorityDocsPathIncluded(relativePath) {
  return (
    AUTHORITY_DOCS_EXACT_PATHS.includes(relativePath) ||
    AUTHORITY_DOCS_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  );
}

function selectScopePaths(scope, trackedFiles) {
  if (scope === 'repo-root') {
    return [];
  }

  if (scope === 'repo') {
    return trackedFiles.filter((relativePath) => isRepoScopePathIncluded(relativePath));
  }

  if (scope === 'authority-docs') {
    const selected = trackedFiles.filter((relativePath) =>
      isAuthorityDocsPathIncluded(relativePath)
    );
    const selectedSet = new Set(selected);
    const missingRequired = AUTHORITY_DOCS_EXACT_PATHS.filter(
      (requiredPath) => !selectedSet.has(requiredPath)
    );
    if (missingRequired.length > 0) {
      throw new Error(
        `Authority-docs staging is missing required tracked paths: ${missingRequired.join(', ')}`
      );
    }
    return selected;
  }

  throw new Error(`Unsupported staging scope: ${scope}`);
}

async function stageRelativePaths(repoRoot, stageRoot, relativePaths) {
  await fsp.rm(stageRoot, { recursive: true, force: true });
  await fsp.mkdir(stageRoot, { recursive: true });

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(repoRoot, relativePath);
    const destinationPath = path.join(stageRoot, relativePath);
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsp.copyFile(sourcePath, destinationPath);
  }
}

function resolveSavedTargetDirectory(rawOutputRoot) {
  if (!fs.existsSync(rawOutputRoot)) {
    throw new Error(`Expected saved assurance output under ${rawOutputRoot}, but the directory is missing.`);
  }

  const childDirectories = fs
    .readdirSync(rawOutputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rawOutputRoot, entry.name));

  if (childDirectories.length !== 1) {
    throw new Error(
      `Expected exactly one saved assurance target under ${rawOutputRoot}, found ${String(childDirectories.length)}.`
    );
  }

  return childDirectories[0];
}

async function copyFileIfPresent(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  await fsp.copyFile(sourcePath, destinationPath);
  return true;
}

async function normalizeRunAssuranceArtifacts(rawOutputRoot, evidenceRoot, laneConfig) {
  const savedTargetRoot = resolveSavedTargetDirectory(rawOutputRoot);
  await copyFileIfPresent(path.join(savedTargetRoot, 'evidence.json'), path.join(evidenceRoot, 'evidence.json'));
  await copyFileIfPresent(path.join(savedTargetRoot, 'score.json'), path.join(evidenceRoot, 'score.json'));

  const reportPath = path.join(savedTargetRoot, 'report.txt');
  if (fs.existsSync(reportPath)) {
    await fsp.copyFile(reportPath, path.join(evidenceRoot, 'report.txt'));
    if (laneConfig.evidenceAlias && laneConfig.evidenceAlias !== 'report.txt') {
      await fsp.copyFile(reportPath, path.join(evidenceRoot, laneConfig.evidenceAlias));
    }
  }

  await copyFileIfPresent(
    path.join(savedTargetRoot, 'documentation-proof.json'),
    path.join(evidenceRoot, 'documentation-proof.json')
  );
  await copyFileIfPresent(
    path.join(savedTargetRoot, 'documentation-proof.txt'),
    path.join(evidenceRoot, 'documentation-proof.txt')
  );
}

function buildRunAssuranceArgs(lane, targetPath, rawOutputRoot) {
  const laneConfig = ensureLaneConfig(lane);
  return [
    targetPath,
    '--profile',
    laneConfig.profile ?? 'release-gate',
    '--output',
    laneConfig.output,
    '--save-dir',
    rawOutputRoot,
    ...(laneConfig.mode ? ['--mode', laneConfig.mode] : [])
  ];
}

function buildLocalSkillInvocation(
  lane,
  targetPath,
  rawOutputRoot,
  env = process.env,
  platform = process.platform,
  existsSyncImpl = fs.existsSync
) {
  const laneConfig = ensureLaneConfig(lane);
  const skillRoot = resolveSkillRoot(env, existsSyncImpl);
  const python = resolvePythonInvocation(env, platform, existsSyncImpl);

  if (lane === 'requirements' || lane === 'user-info') {
    const scriptPath = path.join(skillRoot, 'scripts', laneConfig.scriptName);
    const scriptArgs = [targetPath, '--json'];
    if (platform === 'win32' && python.command === 'py') {
      const wslInvocation = buildWslPythonInvocation(scriptPath, scriptArgs, env, existsSyncImpl);
      if (wslInvocation) {
        return wslInvocation;
      }
    }

    return {
      command: python.command,
      args: [...python.args, scriptPath, ...scriptArgs]
    };
  }

  const runAssurancePath = path.join(skillRoot, 'scripts', 'run_assurance.py');
  const scriptArgs = buildRunAssuranceArgs(lane, targetPath, rawOutputRoot);
  if (platform === 'win32' && python.command === 'py') {
    const wslInvocation = buildWslPythonInvocation(
      runAssurancePath,
      scriptArgs,
      env,
      existsSyncImpl
    );
    if (wslInvocation) {
      return wslInvocation;
    }
  }

  return {
    command: python.command,
    args: [...python.args, runAssurancePath, ...scriptArgs]
  };
}

function buildContainerInvocation(
  lane,
  targetPath,
  rawOutputRoot,
  env = process.env,
  platform = process.platform
) {
  if (platform === 'win32') {
    throw new Error('Container executor is supported only on Linux hosts for this repo-owned runner model.');
  }

  const laneConfig = ensureLaneConfig(lane);
  const containerRuntime = `${env.VIHS_ASSURANCE_CONTAINER_RUNTIME || DEFAULT_CONTAINER_RUNTIME}`.trim();
  const assuranceImage = `${env.VIHS_ASSURANCE_IMAGE || DEFAULT_ASSURANCE_IMAGE}`.trim();
  const containerUser = `${env.VIHS_ASSURANCE_CONTAINER_USER || ''}`.trim();
  const resolvedContainerUser =
    containerUser ||
    (typeof process.getuid === 'function' && typeof process.getgid === 'function'
      ? `${String(process.getuid())}:${String(process.getgid())}`
      : '');
  const targetMountPath = '/target';
  const outputMountPath = '/output';

  if (lane === 'requirements' || lane === 'user-info') {
    return {
      command: containerRuntime,
      args: [
        'run',
        '--rm',
        ...(resolvedContainerUser ? ['--user', resolvedContainerUser] : []),
        '-v',
        `${targetPath}:${targetMountPath}:ro`,
        assuranceImage,
        'python3',
        `/opt/repo-standards-review/scripts/${laneConfig.scriptName}`,
        targetMountPath,
        '--json'
      ]
    };
  }

  return {
    command: containerRuntime,
    args: [
      'run',
      '--rm',
      ...(resolvedContainerUser ? ['--user', resolvedContainerUser] : []),
      '-v',
      `${targetPath}:${targetMountPath}:ro`,
      '-v',
      `${rawOutputRoot}:${outputMountPath}`,
      assuranceImage,
      'python3',
      '/opt/repo-standards-review/scripts/run_assurance.py',
      ...buildRunAssuranceArgs(lane, targetMountPath, outputMountPath)
    ]
  };
}

async function normalizeJsonOutput(stdout, evidenceRoot, jsonFileName) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Expected JSON output for ${jsonFileName}, but parsing failed: ${String(error)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || parsed.ok !== true) {
    throw new Error(`${jsonFileName} returned a non-passing payload.`);
  }

  writeJson(path.join(evidenceRoot, jsonFileName), parsed);
}

function buildLaneManifest({
  lane,
  executor,
  repoRoot,
  evidenceRoot,
  targetRoot,
  scope,
  stagedFiles,
  invocation
}) {
  return {
    schema: 'vi-history-suite/assurance-lane@v1',
    generatedAt: new Date().toISOString(),
    lane,
    executor,
    repoRoot,
    evidenceRoot,
    scope,
    targetRoot,
    excludedPathClasses:
      scope === 'repo'
        ? REPO_SCOPE_EXCLUDED_PREFIXES
        : scope === 'authority-docs'
          ? [
              'docs/requirements/**',
              'docs/testing/**',
              '.cache/**',
              '.vscode-test/**',
              'coverage/**',
              'out/**',
              'out-tests/**',
              'node_modules/**'
            ]
          : [],
    includedRootPaths:
      scope === 'authority-docs'
        ? [...AUTHORITY_DOCS_EXACT_PATHS, ...AUTHORITY_DOCS_PREFIXES.map((prefix) => `${prefix}**`)]
        : scope === 'repo'
          ? ['tracked repo files minus governed transient roots']
          : [normalizeRelativePath(path.relative(repoRoot, targetRoot)) || '.'],
    stagedFiles,
    invokedCommand: formatCommand(invocation.command, invocation.args)
  };
}

async function runLane(options, env = process.env) {
  const laneConfig = ensureLaneConfig(options.lane);
  const executor = resolveExecutor(options.executor, env);
  const trackedFiles = gitTrackedFiles(options.repoRoot);
  const scopePaths = selectScopePaths(laneConfig.scope, trackedFiles);
  const evidenceRoot = options.evidenceRoot;
  const rawOutputRoot = path.join(evidenceRoot, 'raw-output');
  const stageParentRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'vihs-assurance-'));
  const stageRoot = path.join(stageParentRoot, DEFAULT_SCOPE_ROOT);
  const targetRoot = laneConfig.scope === 'repo-root' ? options.repoRoot : stageRoot;

  await fsp.rm(evidenceRoot, { recursive: true, force: true });
  await fsp.mkdir(evidenceRoot, { recursive: true });

  if (laneConfig.scope !== 'repo-root') {
    await stageRelativePaths(options.repoRoot, stageRoot, scopePaths);
  }

  if (options.lane === 'requirements' || options.lane === 'user-info') {
    await fsp.mkdir(evidenceRoot, { recursive: true });
  } else {
    await fsp.mkdir(rawOutputRoot, { recursive: true });
  }

  const invocation =
    executor === 'container'
      ? buildContainerInvocation(options.lane, targetRoot, rawOutputRoot, env)
      : buildLocalSkillInvocation(options.lane, targetRoot, rawOutputRoot, env);
  const commandSummary = formatCommand(invocation.command, invocation.args);
  const result = runProcess(invocation.command, invocation.args, { cwd: options.repoRoot });
  writeText(
    path.join(evidenceRoot, 'command.txt'),
    [`$ ${commandSummary}`, '', result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n')
  );
  ensureProcessSucceeded(result, commandSummary);

  if (options.lane === 'requirements' || options.lane === 'user-info') {
    await normalizeJsonOutput(result.stdout, evidenceRoot, laneConfig.jsonFile);
  } else {
    await normalizeRunAssuranceArtifacts(rawOutputRoot, evidenceRoot, laneConfig);
  }

  writeJson(
    path.join(evidenceRoot, 'lane-manifest.json'),
    buildLaneManifest({
      lane: options.lane,
      executor,
      repoRoot: options.repoRoot,
      evidenceRoot,
      targetRoot,
      scope: laneConfig.scope,
      stagedFiles: scopePaths,
      invocation
    })
  );
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    process.stdout.write(`${getUsage()}\n`);
    return;
  }

  await runLane(parsed);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  AUTHORITY_DOCS_EXACT_PATHS,
  AUTHORITY_DOCS_PREFIXES,
  DEFAULT_ASSURANCE_IMAGE,
  DEFAULT_CONTAINER_RUNTIME,
  DEFAULT_EXECUTOR,
  LANE_CONFIG,
  REPO_SCOPE_EXCLUDED_PREFIXES,
  buildContainerInvocation,
  buildLocalSkillInvocation,
  buildRunAssuranceArgs,
  defaultSkillRootCandidates,
  isAuthorityDocsPathIncluded,
  isRepoScopePathIncluded,
  parseArgs,
  resolveExecutor,
  getWindowsPythonExecutableCandidates,
  resolvePythonInvocation,
  runLane,
  selectScopePaths
};
