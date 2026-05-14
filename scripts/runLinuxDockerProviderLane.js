#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_LINUX_IMAGE = 'nationalinstruments/labview:2026q1-linux';
const SCHEMA = 'vi-history-suite/linux-docker-provider-lane@v1';

function getLinuxDockerProviderLaneUsage() {
  return [
    'Usage: node scripts/runLinuxDockerProviderLane.js [--linux-image <image>] [--evidence-dir <path>] [--help]',
    '',
    'Validate the governed Linux Docker Desktop/Docker Engine provider lane.',
    '',
    'Options:',
    '  --linux-image IMAGE   Override the governed Linux image reference.',
    '  --evidence-dir PATH   Retain JSON/Markdown/log evidence at PATH.',
    '  --help                Print this help text.'
  ].join('\n');
}

function parseLinuxDockerProviderLaneArgs(argv) {
  const parsed = {
    helpRequested: false,
    linuxImage: DEFAULT_LINUX_IMAGE,
    evidenceDir: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--linux-image') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --linux-image');
      }
      parsed.linuxImage = value;
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function createLinuxDockerProviderLaneSteps(options) {
  const settingsFilePath = options.settingsFilePath;

  return [
    {
      id: 'docker-info',
      title: 'Verify Docker Engine reports Linux containers',
      command: 'docker',
      args: [
        'info',
        '--format',
        'ostype={{.OSType}} server={{.ServerVersion}} driver={{.Driver}} cgroup={{.CgroupDriver}}'
      ],
      stdoutFileName: 'docker-info.stdout.log',
      stderrFileName: 'docker-info.stderr.log'
    },
    {
      id: 'docker-context-show',
      title: 'Record active Docker context',
      command: 'docker',
      args: ['context', 'show'],
      stdoutFileName: 'docker-context-show.stdout.log',
      stderrFileName: 'docker-context-show.stderr.log',
      allowFailure: true
    },
    {
      id: 'docker-context-ls',
      title: 'Record Docker context list',
      command: 'docker',
      args: ['context', 'ls', '--format', '{{json .}}'],
      stdoutFileName: 'docker-context-ls.stdout.log',
      stderrFileName: 'docker-context-ls.stderr.log',
      allowFailure: true
    },
    {
      id: 'linux-image-inspect',
      title: 'Inspect governed Linux LabVIEW image availability',
      command: 'docker',
      args: ['image', 'inspect', options.linuxImage],
      stdoutFileName: 'linux-image-inspect.stdout.log',
      stderrFileName: 'linux-image-inspect.stderr.log',
      allowFailure: true
    },
    {
      id: 'vihs-settings-update',
      title: 'Persist docker/2026/x64 runtime settings through vihs',
      command: process.execPath,
      args: [
        path.join(repoRoot, 'out', 'tooling', 'localRuntimeSettingsCli.js'),
        '--provider',
        'docker',
        '--labview-version',
        '2026',
        '--labview-bitness',
        'x64',
        '--settings-file',
        settingsFilePath
      ],
      stdoutFileName: 'vihs-settings-update.stdout.log',
      stderrFileName: 'vihs-settings-update.stderr.log'
    },
    {
      id: 'vihs-settings-validate',
      title: 'Validate docker settings resolve to linux-container runtime provider',
      command: process.execPath,
      args: [
        path.join(repoRoot, 'out', 'tooling', 'localRuntimeSettingsCli.js'),
        '--validate',
        '--settings-file',
        settingsFilePath
      ],
      stdoutFileName: 'vihs-settings-validate.stdout.log',
      stderrFileName: 'vihs-settings-validate.stderr.log'
    }
  ];
}

async function ensureEvidenceDir(evidenceDir) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
}

async function writeEvidenceFile(evidenceDir, fileName, content) {
  if (!fileName) {
    return undefined;
  }

  const targetPath = path.join(evidenceDir, fileName);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, content, 'utf8');
  return targetPath;
}

async function runStep(step, options) {
  const result = (options.spawnSync ?? spawnSync)(step.command, step.args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024
  });

  const stdoutText = result.stdout ?? '';
  const stderrText = result.stderr ?? '';
  options.stdout?.write(stdoutText);
  options.stderr?.write(stderrText);

  const stdoutPath = await writeEvidenceFile(options.evidenceDir, step.stdoutFileName, stdoutText);
  const stderrPath = await writeEvidenceFile(options.evidenceDir, step.stderrFileName, stderrText);

  if (result.error && !step.allowFailure) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0 && !step.allowFailure) {
    const error = new Error(`Linux Docker provider lane step failed: ${step.id}`);
    error.stepId = step.id;
    error.exitCode = result.status;
    throw error;
  }

  return {
    id: step.id,
    title: step.title,
    command: step.command,
    args: step.args,
    status:
      typeof result.status === 'number' && result.status !== 0 && step.allowFailure
        ? 'allowed-failure'
        : 'passed',
    stdoutPath,
    stderrPath,
    stdoutText,
    stderrText,
    exitCode: typeof result.status === 'number' ? result.status : null
  };
}

function parseDockerInfo(stdoutText) {
  const trimmed = stdoutText.trim();
  if (!trimmed) {
    throw new Error('Docker info returned empty output.');
  }

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error('Docker info output was not valid JSON.');
    }
  }

  const facts = {};
  for (const part of trimmed.split(/\s+/u)) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex > 0) {
      facts[part.slice(0, separatorIndex)] = part.slice(separatorIndex + 1);
    }
  }

  return {
    OSType: facts.ostype,
    ServerVersion: facts.server,
    Driver: facts.driver,
    CgroupDriver: facts.cgroup
  };
}

function parseVihsValidation(stdoutText) {
  const facts = {};
  for (const line of stdoutText.split(/\r?\n/u)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    facts[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return facts;
}

function assertLinuxDockerProviderFacts(stepResults) {
  const dockerInfoStep = stepResults.find((step) => step.id === 'docker-info');
  const validationStep = stepResults.find((step) => step.id === 'vihs-settings-validate');

  const dockerInfo = parseDockerInfo(dockerInfoStep?.stdoutText ?? '');
  if (dockerInfo.OSType !== 'linux') {
    throw new Error(
      `Linux Docker provider lane requires Docker OSType linux, got ${dockerInfo.OSType || 'empty'}.`
    );
  }

  const validationFacts = parseVihsValidation(validationStep?.stdoutText ?? '');
  const requiredFacts = {
    runtimeValidationOutcome: 'ready',
    runtimeProvider: 'linux-container',
    runtimeEngine: 'labview-cli',
    runtimeBlockedReason: '<none>'
  };

  for (const [name, expectedValue] of Object.entries(requiredFacts)) {
    if (validationFacts[name] !== expectedValue) {
      throw new Error(
        `Linux Docker provider lane expected ${name}=${expectedValue}, got ${validationFacts[name] || '<missing>'}.`
      );
    }
  }

  return {
    dockerInfo,
    validationFacts
  };
}

function buildLinuxDockerProviderLaneReport(options) {
  const imageInspectStep = options.steps.find((step) => step.id === 'linux-image-inspect');
  const contextShowStep = options.steps.find((step) => step.id === 'docker-context-show');
  const imageAvailable = imageInspectStep?.status === 'passed';

  return {
    schema: SCHEMA,
    recordedAt: options.recordedAt,
    status: options.status,
    repoRoot: options.repoRoot,
    evidenceDir: options.evidenceDir,
    claimScope: 'linux-docker-validated-preview',
    providerLane: {
      hostContract: 'linux-docker-desktop-or-docker-engine',
      selectedProviderSetting: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      runtimeProvider: options.validationFacts?.runtimeProvider ?? null,
      runtimeEngine: options.validationFacts?.runtimeEngine ?? null,
      runtimeValidationOutcome: options.validationFacts?.runtimeValidationOutcome ?? null,
      runtimeBlockedReason: options.validationFacts?.runtimeBlockedReason ?? null,
      linuxImage: options.linuxImage,
      linuxImageAvailable: imageAvailable,
      linuxImageAcquisitionState: imageAvailable
        ? 'available-before-lane-run'
        : 'acquisition-required-before-first-compare-run'
    },
    docker: {
      ostype: options.dockerInfo?.OSType ?? null,
      serverVersion: options.dockerInfo?.ServerVersion ?? null,
      driver: options.dockerInfo?.Driver ?? null,
      cgroupDriver: options.dockerInfo?.CgroupDriver ?? null,
      context: contextShowStep?.stdoutText?.trim() || null
    },
    settingsFilePath: options.settingsFilePath,
    windowsLabviewProof: {
      included: false,
      state: 'admitted-separate-windows-host-proof',
      requiredForThisLane: false,
      requiredBeforeWindowsInstalledUserClaim: false,
      requiredBeforeWindowsDockerDesktopClaim: true,
      releaseClaimLedger:
        'docs/product/windows-installed-user-release-claim-ledger-2026-05-14.json',
      deferredEvidence: [
        'Windows Docker Desktop Windows-container execution',
        'windows_private_release_acceptance aggregate host+container proof'
      ]
    },
    publicGitHubMutation: 'not-performed',
    marketplaceMutation: 'not-performed',
    steps: options.steps.map((step) => ({
      id: step.id,
      title: step.title,
      command: step.command,
      args: step.args,
      status: step.status,
      exitCode: step.exitCode,
      stdoutPath: step.stdoutPath,
      stderrPath: step.stderrPath
    })),
    failure: options.failure ?? null
  };
}

function buildLinuxDockerProviderLaneMarkdown(report) {
  return [
    '# Linux Docker Provider Lane Evidence',
    '',
    `- Status: ${report.status}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Claim scope: ${report.claimScope}`,
    `- Docker OSType: ${report.docker.ostype ?? 'unknown'}`,
    `- Docker server: ${report.docker.serverVersion ?? 'unknown'}`,
    `- Docker context: ${report.docker.context ?? 'unknown'}`,
    `- Runtime provider: ${report.providerLane.runtimeProvider ?? 'unknown'}`,
    `- Runtime engine: ${report.providerLane.runtimeEngine ?? 'unknown'}`,
    `- Runtime validation: ${report.providerLane.runtimeValidationOutcome ?? 'unknown'}`,
    `- Runtime blocked reason: ${report.providerLane.runtimeBlockedReason ?? 'unknown'}`,
    `- Governed Linux image: ${report.providerLane.linuxImage}`,
    `- Linux image acquisition state: ${report.providerLane.linuxImageAcquisitionState}`,
    `- Windows/LabVIEW proof: ${report.windowsLabviewProof.state}`,
    `- Public GitHub mutation: ${report.publicGitHubMutation}`,
    `- Marketplace mutation: ${report.marketplaceMutation}`,
    '',
    '## Steps',
    '',
    ...report.steps.map(
      (step) => `- ${step.id}: ${step.status} via \`${step.command} ${step.args.join(' ')}\``
    ),
    '',
    report.failure
      ? `## Failure\n\n- Step: ${report.failure.stepId ?? 'unknown'}\n- Message: ${report.failure.message}`
      : '## Failure\n\n- none'
  ].join('\n');
}

async function writeLinuxDockerProviderLaneReport(evidenceDir, report) {
  const jsonPath = path.join(evidenceDir, 'linux-docker-provider-lane.json');
  const markdownPath = path.join(evidenceDir, 'linux-docker-provider-lane.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(
    markdownPath,
    `${buildLinuxDockerProviderLaneMarkdown(report)}\n`,
    'utf8'
  );
  return { jsonPath, markdownPath };
}

async function runLinuxDockerProviderLane(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseLinuxDockerProviderLaneArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.helpRequested) {
    stdout.write(`${getLinuxDockerProviderLaneUsage()}\n`);
    return 'help';
  }

  const evidenceDir =
    parsed.evidenceDir ?? path.join(repoRoot, 'artifacts', 'linux-docker-provider-lane');
  await ensureEvidenceDir(evidenceDir);

  const settingsFilePath = path.join(evidenceDir, 'settings', 'linux-docker-provider-settings.json');
  const steps = createLinuxDockerProviderLaneSteps({
    linuxImage: parsed.linuxImage,
    settingsFilePath
  });
  const stepResults = [];
  let status = 'passed';
  let failure = null;
  let dockerInfo = null;
  let validationFacts = null;

  try {
    for (const step of steps) {
      stdout.write(`[linux-docker-provider-lane] ${step.title}\n`);
      stepResults.push(
        await runStep(step, {
          cwd: deps.cwd ?? repoRoot,
          env: deps.env ?? process.env,
          evidenceDir,
          stdout,
          stderr,
          spawnSync: deps.spawnSync
        })
      );
    }

    ({ dockerInfo, validationFacts } = assertLinuxDockerProviderFacts(stepResults));
  } catch (error) {
    status = 'failed';
    failure = {
      stepId: error.stepId ?? stepResults.at(-1)?.id ?? 'unknown',
      message: error instanceof Error ? error.message : String(error),
      exitCode: error.exitCode ?? null
    };
  }

  const report = buildLinuxDockerProviderLaneReport({
    recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
    status,
    repoRoot: deps.cwd ?? repoRoot,
    evidenceDir,
    linuxImage: parsed.linuxImage,
    settingsFilePath,
    dockerInfo,
    validationFacts,
    steps: stepResults,
    failure
  });

  await writeLinuxDockerProviderLaneReport(evidenceDir, report);

  if (status === 'failed') {
    throw new Error(failure?.message ?? 'Linux Docker provider lane failed.');
  }

  stdout.write('[linux-docker-provider-lane] Linux Docker provider lane passed.\n');
  return 'pass';
}

async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    await runLinuxDockerProviderLane(argv, deps);
    return 0;
  } catch (error) {
    const stderr = deps.stderr ?? process.stderr;
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  assertLinuxDockerProviderFacts,
  buildLinuxDockerProviderLaneMarkdown,
  buildLinuxDockerProviderLaneReport,
  createLinuxDockerProviderLaneSteps,
  getLinuxDockerProviderLaneUsage,
  main,
  parseLinuxDockerProviderLaneArgs,
  runLinuxDockerProviderLane,
  writeLinuxDockerProviderLaneReport
};
