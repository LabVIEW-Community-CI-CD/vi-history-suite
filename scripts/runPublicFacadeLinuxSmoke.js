#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_LINUX_IMAGE = 'nationalinstruments/labview:2026q1-linux';

function getPublicFacadeLinuxSmokeUsage() {
  return [
    'Usage: node scripts/runPublicFacadeLinuxSmoke.js [--linux-image <image>] [--evidence-dir <path>] [--skip-image-remove] [--help]',
    '',
    'Run the public-facade Linux smoke lane against the Docker-only installed extension contract.',
    '',
    'Options:',
    '  --linux-image IMAGE   Override the governed Linux image reference.',
    '  --evidence-dir PATH   Retain JSON/Markdown/log evidence at PATH.',
    '  --skip-image-remove   Keep the local Linux image instead of forcing a cold pull.',
    '  --help                Print this help text.'
  ].join('\n');
}

function parsePublicFacadeLinuxSmokeArgs(argv) {
  const parsed = {
    helpRequested: false,
    linuxImage: DEFAULT_LINUX_IMAGE,
    evidenceDir: undefined,
    skipImageRemove: false
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

    if (argument === '--skip-image-remove') {
      parsed.skipImageRemove = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function createPublicFacadeLinuxSmokeSteps(options = {}) {
  const steps = [
    {
      id: 'docker-engine',
      title: 'Verify Docker Linux engine',
      command: 'docker',
      args: ['info', '--format', '{{.OSType}}'],
      stdoutFileName: 'docker-engine.stdout.log',
      stderrFileName: 'docker-engine.stderr.log',
      requiredStdout: 'linux'
    }
  ];

  if (!options.skipImageRemove) {
    steps.push({
      id: 'remove-governed-image',
      title: 'Remove governed Linux image to force a cold pull',
      command: 'docker',
      args: ['image', 'rm', '-f', options.linuxImage ?? DEFAULT_LINUX_IMAGE],
      stdoutFileName: 'remove-governed-image.stdout.log',
      stderrFileName: 'remove-governed-image.stderr.log',
      allowFailure: true
    });
  }

  steps.push({
    id: 'integration-linux',
    title: 'Run Linux-hosted extension integration smoke',
    command: 'npm',
    args: ['run', 'test:integration:linux'],
    stdoutFileName: 'integration-linux.stdout.log',
    stderrFileName: 'integration-linux.stderr.log'
  });

  return steps;
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

  if (step.requiredStdout && stdoutText.trim() !== step.requiredStdout) {
    const error = new Error(
      `Public facade Linux smoke requires Docker OSType ${step.requiredStdout}, got ${stdoutText.trim() || 'empty'}.`
    );
    error.stepId = step.id;
    throw error;
  }

  if (typeof result.status === 'number' && result.status !== 0 && !step.allowFailure) {
    const error = new Error(`Public facade Linux smoke step failed: ${step.id}`);
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
    stderrPath
  };
}

function buildPublicFacadeLinuxSmokeReport(options) {
  return {
    schema: 'vi-history-suite/public-facade-linux-smoke@v1',
    recordedAt: options.recordedAt,
    status: options.status,
    repoRoot: options.repoRoot,
    linuxImage: options.linuxImage,
    skipImageRemove: options.skipImageRemove,
    evidenceDir: options.evidenceDir,
    steps: options.steps,
    failure: options.failure ?? null
  };
}

function buildPublicFacadeLinuxSmokeMarkdown(report) {
  return [
    '# Public Facade Linux Smoke Report',
    '',
    `- Status: ${report.status}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Governed Linux image: ${report.linuxImage}`,
    `- Skip image remove: ${String(report.skipImageRemove)}`,
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

async function writePublicFacadeLinuxSmokeReport(evidenceDir, report) {
  const jsonPath = path.join(evidenceDir, 'public-facade-linux-smoke.json');
  const markdownPath = path.join(evidenceDir, 'public-facade-linux-smoke.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildPublicFacadeLinuxSmokeMarkdown(report)}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

async function runPublicFacadeLinuxSmoke(argv = process.argv.slice(2), deps = {}) {
  const parsed = parsePublicFacadeLinuxSmokeArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.helpRequested) {
    stdout.write(`${getPublicFacadeLinuxSmokeUsage()}\n`);
    return 'help';
  }

  const evidenceDir =
    parsed.evidenceDir ?? path.join(repoRoot, 'artifacts', 'public-facade-linux-smoke');
  await ensureEvidenceDir(evidenceDir);

  const steps = createPublicFacadeLinuxSmokeSteps({
    linuxImage: parsed.linuxImage,
    skipImageRemove: parsed.skipImageRemove
  });
  const stepResults = [];
  let status = 'passed';
  let failure = null;

  for (const step of steps) {
    stdout.write(`[public-smoke] ${step.title}\n`);
    try {
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
    } catch (error) {
      status = 'failed';
      failure = {
        stepId: error.stepId ?? step.id,
        message: error instanceof Error ? error.message : String(error),
        exitCode: error.exitCode ?? null
      };
      stepResults.push({
        id: step.id,
        title: step.title,
        command: step.command,
        args: step.args,
        status: 'failed'
      });
      break;
    }
  }

  await writePublicFacadeLinuxSmokeReport(
    evidenceDir,
    buildPublicFacadeLinuxSmokeReport({
      recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
      status,
      repoRoot: deps.cwd ?? repoRoot,
      linuxImage: parsed.linuxImage,
      skipImageRemove: parsed.skipImageRemove,
      evidenceDir,
      steps: stepResults,
      failure
    })
  );

  if (status === 'failed') {
    throw new Error(failure?.message ?? 'Public facade Linux smoke failed.');
  }

  stdout.write('[public-smoke] Public facade Linux smoke passed.\n');
  return 'pass';
}

async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    await runPublicFacadeLinuxSmoke(argv, deps);
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
  buildPublicFacadeLinuxSmokeMarkdown,
  buildPublicFacadeLinuxSmokeReport,
  createPublicFacadeLinuxSmokeSteps,
  getPublicFacadeLinuxSmokeUsage,
  main,
  parsePublicFacadeLinuxSmokeArgs,
  runPublicFacadeLinuxSmoke,
  writePublicFacadeLinuxSmokeReport
};
