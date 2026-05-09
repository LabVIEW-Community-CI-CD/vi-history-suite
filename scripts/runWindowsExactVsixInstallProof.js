#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicationState = require(path.join(__dirname, 'releasePublicationState.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const transaction = require(path.join(__dirname, 'runPublicGithubExactReleaseTransaction.js'));

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'windows-exact-vsix-install-proof',
  'latest'
);
const DEFAULT_CODE_COMMAND = 'code';
const DEFAULT_EXTENSION_ID = 'svelderrainruiz.vi-history-suite';
const WINDOWS_PATH_PREFIX = /^[A-Za-z]:[\\/]/;

function usesWindowsPathSemantics(targetPath) {
  return (
    typeof targetPath === 'string' &&
    (WINDOWS_PATH_PREFIX.test(targetPath) || targetPath.startsWith('\\\\'))
  );
}

function pathApiFor(targetPath) {
  return usesWindowsPathSemantics(targetPath) ? path.win32 : path;
}

function joinPathForTarget(targetPath, ...segments) {
  return pathApiFor(targetPath).join(targetPath, ...segments);
}

function normalizeExternalPath(targetPath) {
  if (!targetPath) {
    return targetPath;
  }

  return usesWindowsPathSemantics(targetPath)
    ? path.win32.normalize(targetPath)
    : path.resolve(targetPath);
}

function buildWindowsSystem32Path(systemRoot) {
  return path.win32.join(systemRoot, 'System32');
}

function getUsage() {
  return [
    'Usage: node scripts/runWindowsExactVsixInstallProof.js [--tag <vX.Y.Z>] [--evidence-dir <path>] [--code-command <path>] [--extension-id <publisher.extension>] [--vsix-path <path>] [--help]',
    '',
    'Install the exact authority VSIX into isolated Windows VS Code user-data/extensions roots,',
    'materialize the governed vihs launcher through the published bootstrap path, run `vihs`,',
    'run `vihs --validate`, and retain JSON/Markdown/log receipts without publishing to Marketplace.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    tag: null,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    codeCommand: DEFAULT_CODE_COMMAND,
    extensionId: DEFAULT_EXTENSION_ID,
    vsixPath: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--tag') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --tag');
      }
      parsed.tag = publicationState.normalizeTag(value);
      index += 1;
      continue;
    }

    if (argument === '--evidence-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-dir');
      }
      parsed.evidenceDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--code-command') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --code-command');
      }
      parsed.codeCommand = value;
      index += 1;
      continue;
    }

    if (argument === '--extension-id') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --extension-id');
      }
      parsed.extensionId = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--vsix-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --vsix-path');
      }
      parsed.vsixPath = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function computeFileSha256(filePath, fsApi = fs) {
  const hash = crypto.createHash('sha256');
  hash.update(fsApi.readFileSync(filePath));
  return hash.digest('hex');
}

function buildIsolatedRoots(evidenceDir, extensionId = DEFAULT_EXTENSION_ID) {
  const isolatedRoot = joinPathForTarget(evidenceDir, 'isolated-vscode');
  const homeRoot = joinPathForTarget(isolatedRoot, 'home');
  const appDataRoot = joinPathForTarget(isolatedRoot, 'appdata', 'Roaming');
  const userDataDir = joinPathForTarget(appDataRoot, 'Code');
  const extensionsRoot = joinPathForTarget(isolatedRoot, 'extensions');
  const settingsFilePath = joinPathForTarget(userDataDir, 'User', 'settings.json');
  const launcherRoot = joinPathForTarget(
    userDataDir,
    'User',
    'globalStorage',
    extensionId,
    'local-runtime-settings-cli'
  );

  return {
    isolatedRoot,
    homeRoot,
    appDataRoot,
    userDataDir,
    extensionsRoot,
    settingsFilePath,
    launcherRoot
  };
}

function buildWindowsHomeEnv(roots, baseEnv = process.env) {
  const pathApi = pathApiFor(roots.homeRoot);
  const parsedHomeRoot = pathApi.parse(roots.homeRoot);
  const homeDrive = parsedHomeRoot.root.replace(/[\\\/]+$/, '');
  const homePath = roots.homeRoot.slice(parsedHomeRoot.root.length - 1);

  return {
    ...baseEnv,
    HOME: roots.homeRoot,
    USERPROFILE: roots.homeRoot,
    HOMEDRIVE: homeDrive,
    HOMEPATH: homePath,
    APPDATA: roots.appDataRoot
  };
}

function buildBootstrapEnv(roots, baseEnv = process.env) {
  return buildWindowsHomeEnv(roots, baseEnv);
}

function buildLauncherCommandEnv(roots, baseEnv = process.env) {
  const systemRoot = baseEnv.SystemRoot ?? 'C:\\Windows';
  const system32Path = buildWindowsSystem32Path(systemRoot);
  const env = {
    ...buildWindowsHomeEnv(roots, baseEnv),
    SystemRoot: systemRoot,
    ComSpec: baseEnv.ComSpec ?? path.win32.join(system32Path, 'cmd.exe'),
    PATHEXT: baseEnv.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    TEMP: baseEnv.TEMP ?? joinPathForTarget(roots.isolatedRoot, 'temp'),
    TMP: baseEnv.TMP ?? joinPathForTarget(roots.isolatedRoot, 'tmp'),
    LOCALAPPDATA: baseEnv.LOCALAPPDATA,
    ProgramFiles: baseEnv.ProgramFiles,
    'ProgramFiles(x86)': baseEnv['ProgramFiles(x86)'],
    PATH: `${roots.launcherRoot};${system32Path}`
  };

  delete env.VI_HISTORY_SUITE_NODE_EXE;
  return env;
}

function parseKeyValueOutput(text) {
  const parsed = Object.create(null);
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    parsed[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }

  return parsed;
}

function findInstalledExtensionRoot(extensionsRoot, extensionId, fsApi = fs) {
  if (!fsApi.existsSync(extensionsRoot)) {
    return null;
  }

  const prefix = `${extensionId.toLowerCase()}-`;
  const candidates = fsApi
    .readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix))
    .map((entry) => path.join(extensionsRoot, entry.name))
    .sort();

  return candidates.at(-1) ?? null;
}

function buildBootstrapArgs(options, roots, vsixPath) {
  return [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(repoRoot, 'scripts', 'install-vihs-extension.ps1'),
    '-CodeCommand',
    options.codeCommand,
    '-ExtensionId',
    options.extensionId,
    '-VsixPath',
    vsixPath,
    '-UserDataDir',
    roots.userDataDir,
    '-ExtensionsRoot',
    roots.extensionsRoot,
    '-SkipUserPathPersist',
    '-NonInteractive'
  ];
}

async function ensureEvidenceDir(evidenceDir) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
}

async function ensureDir(targetPath) {
  await fsp.mkdir(targetPath, { recursive: true });
}

async function writeEvidenceFile(evidenceDir, fileName, content) {
  const targetPath = path.join(evidenceDir, fileName);
  await ensureDir(path.dirname(targetPath));
  await fsp.writeFile(targetPath, content, 'utf8');
  return targetPath;
}

function runStep(step, options) {
  const result = (options.spawnSync ?? spawnSync)(step.command, step.args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    statusCode: result.status ?? 1,
    stdoutText: String(result.stdout ?? ''),
    stderrText: String(result.stderr ?? ''),
    error: result.error ?? null
  };
}

function toRelativeReportPath(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath).replaceAll(path.sep, '/');
  return relativePath.length > 0 ? relativePath : '.';
}

function buildReport(report) {
  return {
    schema: 'vi-history-suite/windows-exact-vsix-install-proof@v1',
    recordedAt: report.recordedAt,
    status: report.status,
    productionMutationAttempted: false,
    repoRoot: report.repoRoot,
    authority: report.authority,
    isolation: report.isolation,
    launcher: report.launcher,
    commands: report.commands,
    failure: report.failure ?? null
  };
}

function buildMarkdown(report) {
  return [
    '# Windows Exact VSIX Install Proof',
    '',
    `- Recorded at: ${report.recordedAt}`,
    `- Status: ${report.status}`,
    `- Authority tag: ${report.authority.tag}`,
    `- Authority package version: ${report.authority.packageVersion}`,
    `- VSIX path: ${report.authority.vsixPath}`,
    `- VSIX SHA-256 verified: ${report.authority.vsixSha256Verified}`,
    `- Settings path: ${report.isolation.settingsFilePath}`,
    `- Launcher root: ${report.isolation.launcherRoot}`,
    `- Installed extension root: ${report.isolation.installedExtensionRoot ?? 'missing'}`,
    `- PATH stripped to launcher + System32: ${report.launcher.pathStrippedToLauncherAndSystem32}`,
    `- Ambient Node.js on PATH required: ${report.launcher.ambientNodeOnPathRequired}`,
    '',
    '## Commands',
    '',
    ...report.commands.map(
      (step) =>
        `- ${step.id}: ${step.status} via \`${step.command} ${step.args.join(' ')}\``
    ),
    '',
    report.failure
      ? `## Failure\n\n- Step: ${report.failure.stepId}\n- Message: ${report.failure.message}`
      : '## Failure\n\n- none'
  ].join('\n');
}

async function writeReport(report, evidenceDir) {
  const jsonPath = path.join(evidenceDir, 'windows-exact-vsix-install-proof.json');
  const markdownPath = path.join(evidenceDir, 'windows-exact-vsix-install-proof.md');
  const retainedReport = {
    ...report,
    receiptPaths: {
      json: toRelativeReportPath(jsonPath),
      markdown: toRelativeReportPath(markdownPath)
    }
  };
  await fsp.writeFile(jsonPath, `${JSON.stringify(retainedReport, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildMarkdown(retainedReport)}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

async function runWindowsExactVsixInstallProof(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (options.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') {
    throw new Error('Windows exact VSIX install proof is only admitted on Windows hosts.');
  }

  const fsApi = deps.fs ?? fs;
  const effectiveState = publicationState.resolvePublicationState(fsApi);
  const effectiveTag = options.tag ?? effectiveState.authority?.exactTag;
  if (!effectiveTag) {
    throw new Error('Unable to resolve the authority exact tag for the Windows exact VSIX install proof.');
  }

  const releaseManifest =
    deps.releaseManifest ??
    transaction.readReleaseManifest(effectiveTag, fsApi, deps.gitSpawnSync ?? deps.spawnSync);
  if (!releaseManifest?.manifestPath) {
    throw new Error(`Unable to resolve the authority release manifest for ${effectiveTag}.`);
  }

  const resolvedVsixPath = options.vsixPath ?? releaseManifest.vsixPath;
  if (!resolvedVsixPath || !fsApi.existsSync(resolvedVsixPath)) {
    throw new Error(`Exact VSIX for ${effectiveTag} was not found at ${resolvedVsixPath ?? '<missing>'}.`);
  }

  const roots = buildIsolatedRoots(options.evidenceDir, options.extensionId);
  await ensureEvidenceDir(options.evidenceDir);
  await Promise.all([
    ensureDir(roots.homeRoot),
    ensureDir(roots.appDataRoot),
    ensureDir(roots.userDataDir),
    ensureDir(roots.extensionsRoot)
  ]);

  const powershellCommand =
    deps.powershellCommand ??
    path.win32.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
  const bootstrapStep = {
    id: 'install-exact-vsix',
    title: 'Install the exact authority VSIX into isolated VS Code roots',
    command: powershellCommand,
    args: buildBootstrapArgs(options, roots, resolvedVsixPath),
    stdoutFileName: 'install-exact-vsix.stdout.log',
    stderrFileName: 'install-exact-vsix.stderr.log'
  };
  const bootstrapResult = runStep(bootstrapStep, {
    cwd: deps.cwd ?? repoRoot,
    env: buildBootstrapEnv(roots, deps.env ?? process.env),
    spawnSync: deps.spawnSync
  });
  const bootstrapStdoutPath = await writeEvidenceFile(
    options.evidenceDir,
    bootstrapStep.stdoutFileName,
    bootstrapResult.stdoutText
  );
  const bootstrapStderrPath = await writeEvidenceFile(
    options.evidenceDir,
    bootstrapStep.stderrFileName,
    bootstrapResult.stderrText
  );

  const stepResults = [];
  let status = 'passed';
  let failure = null;

  const bootstrapFacts = parseKeyValueOutput(bootstrapResult.stdoutText);
  const launcherRoot = bootstrapFacts.launcherRoot
    ? normalizeExternalPath(bootstrapFacts.launcherRoot)
    : roots.launcherRoot;

  if (bootstrapResult.error || bootstrapResult.statusCode !== 0) {
    status = 'failed';
    failure = {
      stepId: bootstrapStep.id,
      message:
        bootstrapResult.error?.message ??
        `Install bootstrap failed with exit code ${bootstrapResult.statusCode}.`,
      exitCode: bootstrapResult.statusCode
    };
  }

  stepResults.push({
    id: bootstrapStep.id,
    title: bootstrapStep.title,
    command: bootstrapStep.command,
    args: bootstrapStep.args,
    status: failure?.stepId === bootstrapStep.id ? 'failed' : 'passed',
    exitCode: bootstrapResult.statusCode,
    stdoutPath: toRelativeReportPath(bootstrapStdoutPath),
    stderrPath: toRelativeReportPath(bootstrapStderrPath)
  });

  const launcherPath = joinPathForTarget(launcherRoot, 'vihs.cmd');
  if (!failure && !fsApi.existsSync(launcherPath)) {
    status = 'failed';
    failure = {
      stepId: bootstrapStep.id,
      message: `Expected vihs launcher was not materialized at ${launcherPath}.`,
      exitCode: null
    };
  }

  const commandEnv = buildLauncherCommandEnv(roots, deps.env ?? process.env);
  const commandSteps = [
    {
      id: 'vihs',
      title: 'Run bare vihs from the isolated launcher PATH',
      command: deps.cmdCommand ?? (deps.env ?? process.env).ComSpec ?? 'cmd.exe',
      args: ['/d', '/c', 'vihs'],
      stdoutFileName: 'vihs.stdout.log',
      stderrFileName: 'vihs.stderr.log'
    },
    {
      id: 'vihs-validate',
      title: 'Run vihs --validate from the isolated launcher PATH',
      command: deps.cmdCommand ?? (deps.env ?? process.env).ComSpec ?? 'cmd.exe',
      args: ['/d', '/c', 'vihs --validate'],
      stdoutFileName: 'vihs-validate.stdout.log',
      stderrFileName: 'vihs-validate.stderr.log'
    }
  ];

  const commandFacts = Object.create(null);
  for (const step of commandSteps) {
    if (failure) {
      stepResults.push({
        id: step.id,
        title: step.title,
        command: step.command,
        args: step.args,
        status: 'skipped'
      });
      continue;
    }

    const result = runStep(step, {
      cwd: deps.cwd ?? repoRoot,
      env: commandEnv,
      spawnSync: deps.spawnSync
    });
    const stdoutPath = await writeEvidenceFile(
      options.evidenceDir,
      step.stdoutFileName,
      result.stdoutText
    );
    const stderrPath = await writeEvidenceFile(
      options.evidenceDir,
      step.stderrFileName,
      result.stderrText
    );
    const parsedFacts = parseKeyValueOutput(result.stdoutText);
    commandFacts[step.id] = parsedFacts;

    if (result.error || result.statusCode !== 0) {
      status = 'failed';
      failure = {
        stepId: step.id,
        message:
          result.error?.message ?? `${step.id} failed with exit code ${result.statusCode}.`,
        exitCode: result.statusCode
      };
    }

    if (!failure && step.id === 'vihs-validate' && parsedFacts.runtimeValidationOutcome !== 'ready') {
      status = 'failed';
      failure = {
        stepId: step.id,
        message:
          'vihs --validate did not retain runtimeValidationOutcome=ready on the isolated exact-VSIX install proof.',
        exitCode: result.statusCode
      };
    }

    stepResults.push({
      id: step.id,
      title: step.title,
      command: step.command,
      args: step.args,
      status: failure?.stepId === step.id ? 'failed' : 'passed',
      exitCode: result.statusCode,
      stdoutPath: toRelativeReportPath(stdoutPath),
      stderrPath: toRelativeReportPath(stderrPath),
      runtimeValidationOutcome:
        step.id === 'vihs-validate' ? parsedFacts.runtimeValidationOutcome ?? null : undefined
    });
  }

  const report = buildReport({
    recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
    status,
    repoRoot: deps.cwd ?? repoRoot,
    authority: {
      tag: effectiveTag,
      packageVersion:
        releaseManifest.manifest?.packageVersion ?? publicationState.versionFromTag(effectiveTag),
      releaseManifestPath: toRelativeReportPath(path.resolve(releaseManifest.manifestPath)),
      checksumPath: releaseManifest.checksumPath
        ? toRelativeReportPath(path.resolve(releaseManifest.checksumPath))
        : null,
      vsixPath: toRelativeReportPath(path.resolve(resolvedVsixPath)),
      expectedVsixSha256: releaseManifest.manifest?.vsixArtifact?.sha256 ?? null,
      observedVsixSha256: computeFileSha256(resolvedVsixPath, fsApi),
      vsixSha256Verified:
        releaseManifest.manifest?.vsixArtifact?.sha256 === computeFileSha256(resolvedVsixPath, fsApi)
    },
    isolation: {
      evidenceDir: toRelativeReportPath(options.evidenceDir),
      homeRoot: toRelativeReportPath(roots.homeRoot),
      appDataRoot: toRelativeReportPath(roots.appDataRoot),
      userDataDir: toRelativeReportPath(roots.userDataDir),
      extensionsRoot: toRelativeReportPath(roots.extensionsRoot),
      settingsFilePath:
        bootstrapFacts.settingsFilePath ?? toRelativeReportPath(roots.settingsFilePath),
      launcherRoot: toRelativeReportPath(launcherRoot),
      installedExtensionRoot: findInstalledExtensionRoot(
        roots.extensionsRoot,
        options.extensionId,
        fsApi
      )
        ? toRelativeReportPath(findInstalledExtensionRoot(roots.extensionsRoot, options.extensionId, fsApi))
        : null
    },
    launcher: {
      pathStrippedToLauncherAndSystem32:
        commandEnv.PATH === `${roots.launcherRoot};${buildWindowsSystem32Path(commandEnv.SystemRoot)}`,
      ambientNodeOnPathRequired: false,
      bootstrapPersistedUserPath: false
    },
    commands: stepResults,
    failure
  });
  const written = await writeReport(report, options.evidenceDir);

  if (status === 'failed') {
    const error = new Error(failure?.message ?? 'Windows exact VSIX install proof failed.');
    error.receiptPaths = {
      json: written.jsonPath,
      markdown: written.markdownPath
    };
    throw error;
  }

  stdout.write('[windows-exact-vsix-install-proof] Windows exact VSIX install proof passed.\n');
  return {
    outcome: 'passed',
    report: {
      ...report,
      receiptPaths: {
        json: toRelativeReportPath(written.jsonPath),
        markdown: toRelativeReportPath(written.markdownPath)
      }
    }
  };
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    const result = await runWindowsExactVsixInstallProof(argv, deps);
    if (result === 'help') {
      return 0;
    }
    stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  DEFAULT_CODE_COMMAND,
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_EXTENSION_ID,
  buildBootstrapArgs,
  buildBootstrapEnv,
  buildIsolatedRoots,
  buildLauncherCommandEnv,
  buildMarkdown,
  buildReport,
  computeFileSha256,
  findInstalledExtensionRoot,
  getUsage,
  main,
  parseArgs,
  parseKeyValueOutput,
  runWindowsExactVsixInstallProof,
  writeReport
};
