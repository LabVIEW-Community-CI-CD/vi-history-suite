#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'first-time-installed-user-activation-smoke',
  'latest'
);
const DEFAULT_CODE_COMMAND = 'code';
const DEFAULT_EXTENSION_ID = 'svelderrainruiz.vi-history-suite';
const DEFAULT_PROVIDER = 'host';
const DEFAULT_LABVIEW_VERSION = '2026';
const DEFAULT_LABVIEW_BITNESS = 'x64';
const GITLAB_WORK_ITEM_URL =
  'https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/2';

function getUsage() {
  return [
    'Usage: node scripts/runFirstTimeInstalledUserActivationSmoke.js [--evidence-dir <path>] [--code-command <path>] [--vsix-path <path>] [--provider <host|docker>] [--labview-version <year>] [--labview-bitness <x86|x64>] [--help]',
    '',
    'Install the current packaged VSIX into isolated VS Code roots, run a clean',
    'first-time installed-user activation smoke, and retain JSON/Markdown receipts',
    'for GitLab work item #2 without publishing or mutating Marketplace state.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    codeCommand: DEFAULT_CODE_COMMAND,
    extensionId: DEFAULT_EXTENSION_ID,
    vsixPath: null,
    provider: DEFAULT_PROVIDER,
    labviewVersion: DEFAULT_LABVIEW_VERSION,
    labviewBitness: DEFAULT_LABVIEW_BITNESS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = (flag) => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return value;
    };

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (argument === '--evidence-dir') {
      parsed.evidenceDir = path.resolve(readValue('--evidence-dir'));
      continue;
    }
    if (argument === '--code-command') {
      parsed.codeCommand = readValue('--code-command');
      continue;
    }
    if (argument === '--vsix-path') {
      parsed.vsixPath = path.resolve(readValue('--vsix-path'));
      continue;
    }
    if (argument === '--provider') {
      const provider = readValue('--provider');
      if (!['host', 'docker'].includes(provider)) {
        throw new Error(`Unsupported provider: ${provider}. Expected host or docker.`);
      }
      parsed.provider = provider;
      continue;
    }
    if (argument === '--labview-version') {
      parsed.labviewVersion = readValue('--labview-version');
      continue;
    }
    if (argument === '--labview-bitness') {
      const bitness = readValue('--labview-bitness');
      if (!['x86', 'x64'].includes(bitness)) {
        throw new Error(`Unsupported LabVIEW bitness: ${bitness}. Expected x86 or x64.`);
      }
      parsed.labviewBitness = bitness;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}\n\n${getUsage()}`);
  }

  return parsed;
}

function computeFileSha256(filePath, fsApi = fs) {
  const hash = crypto.createHash('sha256');
  hash.update(fsApi.readFileSync(filePath));
  return hash.digest('hex');
}

function toRelativeReportPath(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath).replaceAll(path.sep, '/');
  return relativePath.length > 0 ? relativePath : '.';
}

function parseKeyValueOutput(text) {
  const parsed = {};
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    parsed[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForRunnerSummary(runnerOutputPath, options = {}) {
  const timeoutMs = options.timeoutMs ?? 240000;
  const pollMs = options.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastReadError = null;

  while (Date.now() <= deadline) {
    if (fs.existsSync(runnerOutputPath)) {
      try {
        const summary = JSON.parse(await fsp.readFile(runnerOutputPath, 'utf8'));
        if (summary && typeof summary === 'object' && summary.finishedAt) {
          return summary;
        }
      } catch (error) {
        lastReadError = error;
      }
    }
    await sleep(pollMs);
  }

  const suffix = lastReadError
    ? ` Last read error: ${
        lastReadError instanceof Error ? lastReadError.message : String(lastReadError)
      }`
    : '';
  throw new Error(
    `Timed out waiting for installed-user smoke runner summary at ${runnerOutputPath}.${suffix}`
  );
}

function buildIsolatedRoots(evidenceDir, extensionId = DEFAULT_EXTENSION_ID) {
  const isolatedRoot = path.join(evidenceDir, 'isolated-vscode');
  const userDataDir = path.join(isolatedRoot, 'user-data');
  const extensionsRoot = path.join(isolatedRoot, 'extensions');
  const globalStorageRoot = path.join(
    userDataDir,
    'User',
    'globalStorage',
    extensionId,
    'local-runtime-settings-cli'
  );
  return {
    isolatedRoot,
    userDataDir,
    extensionsRoot,
    globalStorageRoot
  };
}

function resolveCodeCliCommand(command, deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32' || command !== DEFAULT_CODE_COMMAND) {
    return command;
  }

  const result = (deps.spawnSync ?? spawnSync)('where.exe', [command], {
    encoding: 'utf8',
    shell: false,
    timeout: 30000
  });
  if (result.error || result.status !== 0) {
    return command;
  }

  const candidates = String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    candidates.find((candidate) => candidate.toLowerCase().endsWith('\\bin\\code.cmd')) ??
    candidates.find((candidate) => candidate.toLowerCase().endsWith('\\bin\\code')) ??
    candidates.find((candidate) => {
      const normalized = candidate.toLowerCase();
      if (!normalized.endsWith('\\code.exe')) {
        return false;
      }
      return fs.existsSync(path.win32.join(path.win32.dirname(candidate), 'bin', 'code.cmd'));
    }) ??
    command
  );
}

function runStep(step, options = {}) {
  const invocation = buildProcessInvocation(step.command, step.args, options);
  const result = (options.spawnSync ?? spawnSync)(invocation.command, invocation.args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    timeout: step.timeoutMs ?? 180000,
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    id: step.id,
    title: step.title,
    command: step.command,
    args: step.args,
    spawnCommand: invocation.command,
    spawnArgs: invocation.args,
    statusCode: result.status ?? (result.error ? 1 : 0),
    stdoutText: String(result.stdout ?? ''),
    stderrText: String(result.stderr ?? ''),
    errorMessage: result.error ? result.error.message : null,
    timedOut: result.error?.code === 'ETIMEDOUT'
  };
}

function buildProcessInvocation(command, args, options = {}) {
  if (
    (options.platform ?? process.platform) === 'win32' &&
    /\.(?:cmd|bat)$/iu.test(command)
  ) {
    return {
      command: (options.env ?? process.env).ComSpec ?? 'cmd.exe',
      args: ['/d', '/c', buildWindowsCommandLine(command, args)],
      windowsVerbatimArguments: true
    };
  }

  return { command, args, windowsVerbatimArguments: false };
}

function buildWindowsCommandLine(command, args) {
  return [command, ...args].map(quoteWindowsCommandSegment).join(' ');
}

function quoteWindowsCommandSegment(segment) {
  const value = String(segment);
  if (!/[\s"&|<>^]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function writeStepLogs(evidenceDir, stepResult) {
  const stdoutPath = path.join(evidenceDir, `${stepResult.id}.stdout.log`);
  const stderrPath = path.join(evidenceDir, `${stepResult.id}.stderr.log`);
  await fsp.writeFile(stdoutPath, stepResult.stdoutText, 'utf8');
  await fsp.writeFile(
    stderrPath,
    stepResult.stderrText ||
      (stepResult.errorMessage ? `${stepResult.errorMessage}\n` : ''),
    'utf8'
  );
  return {
    ...stepResult,
    stdoutPath: toRelativeReportPath(stdoutPath),
    stderrPath: toRelativeReportPath(stderrPath),
    stdoutText: undefined,
    stderrText: undefined,
    status: stepResult.statusCode === 0 && !stepResult.errorMessage ? 'passed' : 'failed'
  };
}

function readPackageVersion(fsApi = fs) {
  const manifest = JSON.parse(fsApi.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return manifest.version;
}

function buildNpmInvocation(args, fsApi = fs) {
  const npmCliPath = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js'
  );
  if (fsApi.existsSync(npmCliPath)) {
    return {
      command: process.execPath,
      args: [npmCliPath, ...args]
    };
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm', ...args].join(' ')]
    };
  }

  return {
    command: 'npm',
    args
  };
}

async function resolveVsixPath(options, evidenceDir, deps = {}) {
  const fsApi = deps.fs ?? fs;
  if (options.vsixPath) {
    if (!fsApi.existsSync(options.vsixPath)) {
      throw new Error(`VSIX path not found: ${options.vsixPath}`);
    }
    return {
      vsixPath: options.vsixPath,
      packagedByScript: false,
      packageStep: null
    };
  }

  const packageVersion = readPackageVersion(fsApi);
  const packageDir = path.join(evidenceDir, 'package');
  await fsp.mkdir(packageDir, { recursive: true });
  const vsixPath = path.join(packageDir, `vi-history-suite-${packageVersion}.vsix`);
  const packageInvocation = buildNpmInvocation(
    ['run', 'package', '--', '--out', vsixPath],
    fsApi
  );
  const packageStep = runStep(
    {
      id: 'package-vsix',
      title: 'Package current extension VSIX for isolated first-time smoke',
      command: packageInvocation.command,
      args: packageInvocation.args,
      timeoutMs: 600000
    },
    deps
  );
  const retainedPackageStep = await writeStepLogs(evidenceDir, packageStep);
  if (retainedPackageStep.status !== 'passed') {
    const error = new Error('VSIX packaging failed before first-time activation smoke.');
    error.step = retainedPackageStep;
    throw error;
  }
  if (!fsApi.existsSync(vsixPath)) {
    throw new Error(`VSIX packaging completed but ${vsixPath} was not produced.`);
  }

  return {
    vsixPath,
    packagedByScript: true,
    packageStep: retainedPackageStep
  };
}

function buildInstallStep(options, roots, vsixPath) {
  return {
    id: 'install-vsix',
    title: 'Install packaged VSIX into clean isolated VS Code roots',
    command: options.codeCommand,
    args: [
      '--install-extension',
      vsixPath,
      '--force',
      '--user-data-dir',
      roots.userDataDir,
      '--extensions-dir',
      roots.extensionsRoot
    ],
    timeoutMs: 180000
  };
}

function buildCodeSmokeStep(options, roots, workspacePath, runnerPath, testExtensionRoot) {
  return {
    id: 'run-vscode-smoke',
    title: 'Run installed extension first-time activation smoke in VS Code',
    command: options.codeCommand,
    args: [
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--disable-updates',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      '--new-window',
      '--user-data-dir',
      roots.userDataDir,
      '--extensions-dir',
      roots.extensionsRoot,
      `--extensionDevelopmentPath=${testExtensionRoot}`,
      `--extensionTestsPath=${runnerPath}`,
      workspacePath
    ],
    timeoutMs: 240000
  };
}

function readProcessSnapshot(deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') {
    return {
      supported: false,
      processes: [],
      counts: {}
    };
  }

  const result = (deps.spawnSync ?? spawnSync)('tasklist.exe', ['/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    shell: false,
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024
  });
  const watched = new Set(['labview.exe', 'labviewcli.exe', 'git.exe']);
  const processes = [];
  for (const line of String(result.stdout ?? '').split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const fields = parseCsvLine(line);
    const imageName = String(fields[0] ?? '').toLowerCase();
    if (!watched.has(imageName)) {
      continue;
    }
    processes.push({
      imageName,
      pid: fields[1] ?? ''
    });
  }

  const counts = {};
  for (const processInfo of processes) {
    counts[processInfo.imageName] = (counts[processInfo.imageName] ?? 0) + 1;
  }
  return {
    supported: true,
    statusCode: result.status ?? 0,
    errorMessage: result.error ? result.error.message : null,
    processes,
    counts
  };
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

async function prepareSmokeWorkspace(baseDirectory, deps = {}) {
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  await fsp.mkdir(baseDirectory, { recursive: true });
  const workspacePath = await fsp.mkdtemp(path.join(baseDirectory, 'vihs-first-time-'));
  const eligibleRelativePath = 'Tooling/deployment/VIP_Pre-Install Custom Action.vi';
  const ineligibleRelativePath = 'fixtures/ineligible-content-detected.bin';

  runGit(['init'], workspacePath, spawnSyncImpl);
  runGit(['config', 'user.name', 'VI History Suite First-Time Smoke'], workspacePath, spawnSyncImpl);
  runGit(
    ['config', 'user.email', 'vihs-first-time-smoke@example.invalid'],
    workspacePath,
    spawnSyncImpl
  );
  runGit(
    ['remote', 'add', 'origin', 'https://github.com/ni/labview-icon-editor.git'],
    workspacePath,
    spawnSyncImpl
  );

  await writeViFixture(path.join(workspacePath, eligibleRelativePath), 'eligible-1');
  await writeViFixture(path.join(workspacePath, ineligibleRelativePath), 'ineligible-only');
  runGit(['add', '.'], workspacePath, spawnSyncImpl);
  runGit(['commit', '-m', 'Add initial first-time smoke fixtures'], workspacePath, spawnSyncImpl);

  await writeViFixture(path.join(workspacePath, eligibleRelativePath), 'eligible-2');
  runGit(['add', '.'], workspacePath, spawnSyncImpl);
  runGit(['commit', '-m', 'Update eligible first-time smoke fixture'], workspacePath, spawnSyncImpl);

  return {
    workspacePath,
    eligibleRelativePath,
    ineligibleRelativePath
  };
}

function runGit(args, cwd, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`
    );
  }
}

async function writeViFixture(targetPath, payload) {
  const content = Buffer.concat([
    Buffer.from('RSRC\r\n\x00\x03', 'binary'),
    Buffer.from('LVIN', 'ascii'),
    Buffer.from(payload, 'utf8')
  ]);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, content);
}

async function writeSmokeTestHarnessExtension(testExtensionRoot) {
  await fsp.mkdir(testExtensionRoot, { recursive: true });
  await fsp.writeFile(
    path.join(testExtensionRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'vihs-first-time-smoke-test-harness',
        displayName: 'VI History First-Time Smoke Test Harness',
        publisher: 'vihs',
        version: '0.0.0',
        engines: {
          vscode: '^1.90.0'
        },
        main: './extension.js',
        activationEvents: []
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await fsp.writeFile(
    path.join(testExtensionRoot, 'extension.js'),
    [
      'function activate() {',
      '  return {};',
      '}',
      '',
      'function deactivate() {}',
      '',
      'module.exports = { activate, deactivate };',
      ''
    ].join('\n'),
    'utf8'
  );
}

function buildSmokeRunnerSource() {
  return String.raw`
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const vscode = require('vscode');

const execFileAsync = promisify(execFile);
const EXTENSION_ID = process.env.VIHS_FIRST_TIME_SMOKE_EXTENSION_ID || 'svelderrainruiz.vi-history-suite';

function parseKeyValueOutput(text) {
  const parsed = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    parsed[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return parsed;
}

async function executeOptionalCommand(summary, id, command, ...args) {
  try {
    await vscode.commands.executeCommand(command, ...args);
    summary.optionalCommands.push({ id, command, status: 'passed' });
  } catch (error) {
    summary.optionalCommands.push({
      id,
      command,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function runVihsCommand(entrypoint, workspacePath, commandLine) {
  const env = {
    ...process.env,
    PATH: String(entrypoint.pathPrependValue || '') + String(process.env.PATH || '')
  };
  const execution = await execFileAsync('cmd.exe', ['/d', '/c', commandLine], {
    cwd: workspacePath,
    env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    commandLine,
    stdout: execution.stdout,
    stderr: execution.stderr,
    facts: parseKeyValueOutput(execution.stdout)
  };
}

function quoteCmdSegment(value) {
  const text = String(value);
  if (!/[\s"&|<>^]/u.test(text)) {
    return text;
  }
  return '"' + text.replace(/"/g, '\\"') + '"';
}

function buildVihsCommand(args) {
  return ['vihs', ...args].map(quoteCmdSegment).join(' ');
}

exports.run = async function run() {
  const outputPath = process.env.VIHS_FIRST_TIME_SMOKE_OUTPUT;
  const workspacePath = process.env.VIHS_FIRST_TIME_SMOKE_WORKSPACE;
  const eligibleRelativePath = process.env.VIHS_FIRST_TIME_SMOKE_ELIGIBLE;
  const settingsFilePath = process.env.VIHS_FIRST_TIME_SMOKE_SETTINGS_FILE;
  const provider = process.env.VIHS_FIRST_TIME_SMOKE_PROVIDER || 'host';
  const labviewVersion = process.env.VIHS_FIRST_TIME_SMOKE_LABVIEW_VERSION || '2026';
  const labviewBitness = process.env.VIHS_FIRST_TIME_SMOKE_LABVIEW_BITNESS || 'x64';
  if (!outputPath || !workspacePath || !eligibleRelativePath || !settingsFilePath) {
    throw new Error('First-time smoke runner is missing required environment.');
  }

  const summary = {
    schema: 'vi-history-suite/first-time-installed-user-activation-smoke-runner@v1',
    startedAt: new Date().toISOString(),
    optionalCommands: [],
    checks: {}
  };

  try {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    summary.extension = {
      id: EXTENSION_ID,
      installed: Boolean(extension),
      isActiveBeforeCommands: extension ? extension.isActive : null,
      activationEvents: extension?.packageJSON?.activationEvents || []
    };
    if (!extension) {
      throw new Error('Installed VI History Suite extension was not found in the isolated VS Code root.');
    }

    await executeOptionalCommand(summary, 'show-extensions-view', 'workbench.view.extensions');
    await executeOptionalCommand(
      summary,
      'search-installed-extension',
      'workbench.extensions.search',
      '@installed vi-history-suite'
    );
    summary.extension.isActiveAfterExtensionView = extension.isActive;
    summary.checks.startupSelectionQuiet =
      summary.extension.isActiveBeforeCommands === false &&
      summary.extension.isActiveAfterExtensionView === false &&
      !summary.extension.activationEvents.includes('onStartupFinished');

    await vscode.commands.executeCommand('labviewViHistory.openDocumentation');
    const api = extension.exports;
    summary.documentation = {
      extensionActiveAfterDocumentation: extension.isActive,
      openDocumentationPanelCount: api.getOpenDocumentationPanelCount(),
      eligibilitySnapshotAfterDocumentation: api.getEligibilityDebugSnapshot(),
      terminalEntrypointAdmittedAfterDocumentation:
        Boolean(api.getLocalRuntimeSettingsTerminalEntrypoint())
    };
    summary.checks.documentationOnly =
      summary.documentation.openDocumentationPanelCount >= 1 &&
      summary.documentation.eligibilitySnapshotAfterDocumentation.eligiblePathCount === 0 &&
      summary.documentation.terminalEntrypointAdmittedAfterDocumentation === false;

    const prepared = await vscode.commands.executeCommand(
      'labviewViHistory.prepareLocalRuntimeSettingsCli'
    );
    const entrypoint = api.getLocalRuntimeSettingsTerminalEntrypoint();
    summary.prepareCli = {
      outcome: prepared?.outcome,
      terminalCommandName: prepared?.terminalCommandName,
      currentPlatformTerminalEntrypointPath: prepared?.currentPlatformTerminalEntrypointPath,
      apiEntrypointAdmitted: Boolean(entrypoint)
    };
    if (!entrypoint) {
      throw new Error('Prepare Local Runtime Settings CLI did not admit a terminal entrypoint.');
    }

    const updateCommand = buildVihsCommand([
      '--settings-file',
      settingsFilePath,
      '--provider',
      provider,
      '--labview-version',
      labviewVersion,
      '--labview-bitness',
      labviewBitness
    ]);
    const updated = await runVihsCommand(entrypoint, workspacePath, updateCommand);
    const validated = await runVihsCommand(
      entrypoint,
      workspacePath,
      buildVihsCommand(['--validate', '--settings-file', settingsFilePath])
    );
    summary.vihs = {
      update: {
        commandLine: updated.commandLine,
        facts: updated.facts
      },
      validate: {
        commandLine: validated.commandLine,
        facts: validated.facts
      }
    };
    summary.checks.prepareCliFirstFlowConfirmed =
      summary.prepareCli.outcome === 'prepared-local-runtime-settings-cli' &&
      summary.vihs.update.facts['viHistorySuite.runtimeProvider'] === provider &&
      summary.vihs.update.facts['viHistorySuite.labviewVersion'] === labviewVersion &&
      summary.vihs.update.facts['viHistorySuite.labviewBitness'] === labviewBitness &&
      Boolean(summary.vihs.validate.facts.runtimeValidationOutcome);

    const targetUri = vscode.Uri.file(path.join(workspacePath, eligibleRelativePath));
    await vscode.commands.executeCommand('labviewViHistory.open', targetUri);
    const panel = api.getLastOpenedPanel();
    summary.openViHistory = {
      targetFsPath: panel?.targetFsPath,
      eligible: panel?.eligible,
      commitCount: panel?.commitCount,
      panelActionCountAfterOpen: api.getPanelActionCount(),
      eligibilitySnapshotAfterOpen: api.getEligibilityDebugSnapshot(),
      renderedExplicitCompareAction:
        typeof panel?.renderedHtml === 'string' &&
        panel.renderedHtml.includes('data-testid="history-action-compare-selected"')
    };
    summary.checks.explicitCompareBoundaryConfirmed =
      summary.openViHistory.eligible === true &&
      summary.openViHistory.commitCount >= 2 &&
      summary.openViHistory.panelActionCountAfterOpen === 0 &&
      summary.openViHistory.renderedExplicitCompareAction === true;

    summary.status = Object.values(summary.checks).every(Boolean) ? 'passed' : 'failed';
  } catch (error) {
    summary.status = 'failed';
    summary.failure = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
  } finally {
    summary.finishedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }

  if (summary.status !== 'passed') {
    throw new Error(summary.failure?.message || 'First-time installed-user activation smoke failed.');
  }
};
`;
}

function evaluateSmokeResult(runnerSummary, processSnapshots) {
  const beforeCounts = processSnapshots.before?.counts ?? {};
  const afterCounts = processSnapshots.after?.counts ?? {};
  const labviewProcessDelta =
    (afterCounts['labview.exe'] ?? 0) - (beforeCounts['labview.exe'] ?? 0);
  const labviewCliProcessDelta =
    (afterCounts['labviewcli.exe'] ?? 0) - (beforeCounts['labviewcli.exe'] ?? 0);

  const assertions = {
    startupSelectionQuiet: runnerSummary?.checks?.startupSelectionQuiet === true,
    documentationOnly: runnerSummary?.checks?.documentationOnly === true,
    prepareCliFirstFlowConfirmed:
      runnerSummary?.checks?.prepareCliFirstFlowConfirmed === true,
    explicitCompareBoundaryConfirmed:
      runnerSummary?.checks?.explicitCompareBoundaryConfirmed === true,
    noLabviewLaunchDuringSmoke: labviewProcessDelta <= 0 && labviewCliProcessDelta <= 0
  };

  return {
    assertions,
    labviewProcessDelta,
    labviewCliProcessDelta,
    status: Object.values(assertions).every(Boolean) ? 'passed' : 'failed'
  };
}

function buildReport(input) {
  const evaluation = evaluateSmokeResult(input.runnerSummary, input.processSnapshots);
  return {
    schema: 'vi-history-suite/first-time-installed-user-activation-smoke@v1',
    recordedAt: input.recordedAt,
    status: evaluation.status,
    workItem: {
      tracker: 'GitLab',
      iid: 2,
      title: 'Run clean first-time installed-user activation smoke after MR !229',
      url: GITLAB_WORK_ITEM_URL
    },
    productionMutationAttempted: false,
    repoRoot: input.repoRoot,
    authority: input.authority,
    isolation: input.isolation,
    requestedRuntimeSettings: input.requestedRuntimeSettings,
    processEvaluation: {
      labviewProcessDelta: evaluation.labviewProcessDelta,
      labviewCliProcessDelta: evaluation.labviewCliProcessDelta
    },
    assertions: evaluation.assertions,
    commands: input.commands,
    runnerSummary: input.runnerSummary,
    failure: evaluation.status === 'passed' ? null : { message: 'One or more smoke assertions failed.' }
  };
}

function buildMarkdown(report) {
  return [
    '# First-Time Installed-User Activation Smoke',
    '',
    `- Recorded at: ${report.recordedAt}`,
    `- Status: ${report.status}`,
    `- Work item: GitLab #${report.workItem.iid}`,
    `- Package version: ${report.authority.packageVersion}`,
    `- VSIX: ${report.authority.vsixPath}`,
    `- VSIX SHA-256: ${report.authority.vsixSha256}`,
    `- Production mutation attempted: ${report.productionMutationAttempted}`,
    '',
    '## Assertions',
    '',
    ...Object.entries(report.assertions).map(
      ([key, value]) => `- ${key}: ${value ? 'pass' : 'fail'}`
    ),
    '',
    '## Runtime Settings',
    '',
    `- Provider: ${report.requestedRuntimeSettings.provider}`,
    `- LabVIEW version: ${report.requestedRuntimeSettings.labviewVersion}`,
    `- LabVIEW bitness: ${report.requestedRuntimeSettings.labviewBitness}`,
    `- Settings file: ${
      report.runnerSummary?.vihs?.validate?.facts?.settingsFilePath ??
      report.isolation?.settingsFilePath ??
      '<missing>'
    }`,
    `- Validation outcome: ${
      report.runnerSummary?.vihs?.validate?.facts?.runtimeValidationOutcome ?? '<missing>'
    }`,
    `- Validation blocked reason: ${
      report.runnerSummary?.vihs?.validate?.facts?.runtimeBlockedReason ?? '<none>'
    }`,
    `- Validation error code: ${
      report.runnerSummary?.vihs?.validate?.facts?.runtimeErrorCode ?? '<none>'
    }`,
    '',
    '## Process Delta',
    '',
    `- LabVIEW.exe delta: ${report.processEvaluation.labviewProcessDelta}`,
    `- LabVIEWCLI.exe delta: ${report.processEvaluation.labviewCliProcessDelta}`,
    '',
    '## Commands',
    '',
    ...report.commands.map(
      (step) =>
        `- ${step.id}: ${step.status} via \`${step.command} ${step.args.join(' ')}\``
    ),
    '',
    report.failure ? `## Failure\n\n- ${report.failure.message}` : '## Failure\n\n- none'
  ].join('\n');
}

async function writeReport(report, evidenceDir) {
  const jsonPath = path.join(evidenceDir, 'first-time-installed-user-activation-smoke.json');
  const markdownPath = path.join(evidenceDir, 'first-time-installed-user-activation-smoke.md');
  const retainedReport = {
    ...report,
    receiptPaths: {
      json: toRelativeReportPath(jsonPath),
      markdown: toRelativeReportPath(markdownPath)
    }
  };
  await fsp.writeFile(jsonPath, `${JSON.stringify(retainedReport, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildMarkdown(retainedReport)}\n`, 'utf8');
  return {
    jsonPath,
    markdownPath
  };
}

async function runFirstTimeInstalledUserActivationSmoke(
  argv = process.argv.slice(2),
  deps = {}
) {
  const options = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  if (options.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') {
    throw new Error('First-time installed-user activation smoke is admitted only on Windows hosts.');
  }
  const effectiveOptions = {
    ...options,
    codeCommand: resolveCodeCliCommand(options.codeCommand, { ...deps, platform })
  };

  await fsp.rm(effectiveOptions.evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(effectiveOptions.evidenceDir, { recursive: true });

  const roots = buildIsolatedRoots(effectiveOptions.evidenceDir, effectiveOptions.extensionId);
  await Promise.all([
    fsp.mkdir(roots.userDataDir, { recursive: true }),
    fsp.mkdir(roots.extensionsRoot, { recursive: true })
  ]);

  const commands = [];
  const resolvedVsix = await resolveVsixPath(effectiveOptions, effectiveOptions.evidenceDir, deps);
  if (resolvedVsix.packageStep) {
    commands.push(resolvedVsix.packageStep);
  }

  const vsixSha256 = computeFileSha256(resolvedVsix.vsixPath, deps.fs ?? fs);
  const workspace = await prepareSmokeWorkspace(path.join(effectiveOptions.evidenceDir, 'workspace'), deps);
  const runnerPath = path.join(effectiveOptions.evidenceDir, 'smoke-runner.js');
  const runnerOutputPath = path.join(effectiveOptions.evidenceDir, 'runner-summary.json');
  const testExtensionRoot = path.join(effectiveOptions.evidenceDir, 'test-harness-extension');
  await fsp.writeFile(runnerPath, buildSmokeRunnerSource(), 'utf8');
  await writeSmokeTestHarnessExtension(testExtensionRoot);

  const processBefore = readProcessSnapshot(deps);
  const installStep = runStep(buildInstallStep(effectiveOptions, roots, resolvedVsix.vsixPath), deps);
  const retainedInstallStep = await writeStepLogs(effectiveOptions.evidenceDir, installStep);
  commands.push(retainedInstallStep);
  if (retainedInstallStep.status !== 'passed') {
    throw new Error('VSIX install failed before first-time activation smoke.');
  }

  const smokeEnv = {
    ...(deps.env ?? process.env),
    VIHS_FIRST_TIME_SMOKE_OUTPUT: runnerOutputPath,
    VIHS_FIRST_TIME_SMOKE_WORKSPACE: workspace.workspacePath,
    VIHS_FIRST_TIME_SMOKE_ELIGIBLE: workspace.eligibleRelativePath,
    VIHS_FIRST_TIME_SMOKE_SETTINGS_FILE: path.join(roots.userDataDir, 'User', 'settings.json'),
    VIHS_FIRST_TIME_SMOKE_EXTENSION_ID: effectiveOptions.extensionId,
    VIHS_FIRST_TIME_SMOKE_PROVIDER: effectiveOptions.provider,
    VIHS_FIRST_TIME_SMOKE_LABVIEW_VERSION: effectiveOptions.labviewVersion,
    VIHS_FIRST_TIME_SMOKE_LABVIEW_BITNESS: effectiveOptions.labviewBitness
  };
  const codeSmokeStep = runStep(
    buildCodeSmokeStep(
      effectiveOptions,
      roots,
      workspace.workspacePath,
      runnerPath,
      testExtensionRoot
    ),
    {
      ...deps,
      env: smokeEnv
    }
  );
  const retainedCodeSmokeStep = await writeStepLogs(effectiveOptions.evidenceDir, codeSmokeStep);
  commands.push(retainedCodeSmokeStep);
  let runnerSummary = null;
  let runnerSummaryWaitError = null;
  if (retainedCodeSmokeStep.status === 'passed') {
    try {
      runnerSummary = await waitForRunnerSummary(runnerOutputPath, {
        timeoutMs: deps.runnerSummaryTimeoutMs,
        pollMs: deps.runnerSummaryPollMs
      });
    } catch (error) {
      runnerSummaryWaitError = error;
    }
  } else if (fs.existsSync(runnerOutputPath)) {
    runnerSummary = JSON.parse(await fsp.readFile(runnerOutputPath, 'utf8'));
  }
  const processAfter = readProcessSnapshot(deps);

  const report = buildReport({
    recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
    repoRoot,
    authority: {
      packageVersion: readPackageVersion(deps.fs ?? fs),
      vsixPath: toRelativeReportPath(path.resolve(resolvedVsix.vsixPath)),
      vsixSha256,
      packagedByScript: resolvedVsix.packagedByScript
    },
    isolation: {
      evidenceDir: toRelativeReportPath(effectiveOptions.evidenceDir),
      userDataDir: toRelativeReportPath(roots.userDataDir),
      extensionsRoot: toRelativeReportPath(roots.extensionsRoot),
      workspacePath: toRelativeReportPath(workspace.workspacePath),
      runnerPath: toRelativeReportPath(runnerPath),
      testExtensionRoot: toRelativeReportPath(testExtensionRoot),
      settingsFilePath: toRelativeReportPath(smokeEnv.VIHS_FIRST_TIME_SMOKE_SETTINGS_FILE),
      runnerOutputPath: toRelativeReportPath(runnerOutputPath)
    },
    requestedRuntimeSettings: {
      provider: effectiveOptions.provider,
      labviewVersion: effectiveOptions.labviewVersion,
      labviewBitness: effectiveOptions.labviewBitness
    },
    processSnapshots: {
      before: processBefore,
      after: processAfter
    },
    commands,
    runnerSummary
  });
  if (runnerSummaryWaitError) {
    report.failure = {
      message:
        runnerSummaryWaitError instanceof Error
          ? runnerSummaryWaitError.message
          : String(runnerSummaryWaitError)
    };
  }
  const written = await writeReport(report, effectiveOptions.evidenceDir);

  if (retainedCodeSmokeStep.status !== 'passed' || report.status !== 'passed') {
    const error = new Error(
      report.failure?.message ?? 'First-time installed-user activation smoke failed.'
    );
    error.receiptPaths = {
      json: written.jsonPath,
      markdown: written.markdownPath
    };
    throw error;
  }

  stdout.write('[first-time-activation-smoke] First-time installed-user smoke passed.\n');
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
    const result = await runFirstTimeInstalledUserActivationSmoke(argv, deps);
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
  buildIsolatedRoots,
  buildMarkdown,
  buildNpmInvocation,
  buildProcessInvocation,
  buildReport,
  buildSmokeRunnerSource,
  computeFileSha256,
  evaluateSmokeResult,
  getUsage,
  parseArgs,
  parseKeyValueOutput,
  readProcessSnapshot,
  resolveCodeCliCommand,
  runFirstTimeInstalledUserActivationSmoke,
  waitForRunnerSummary
};
