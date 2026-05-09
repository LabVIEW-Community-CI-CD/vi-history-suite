#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');

function getPublicWindowsInstalledUserContractUsage() {
  return [
    'Usage: node scripts/runPublicWindowsInstalledUserContract.js [--evidence-dir <path>] [--help]',
    '',
    'Run the public Windows installed-user contract lane for the generated vihs launcher and runtime-settings CLI surface.',
    '',
    'Options:',
    '  --evidence-dir PATH   Retain JSON/Markdown/log evidence at PATH.',
    '  --help                Print this help text.'
  ].join('\n');
}

function parsePublicWindowsInstalledUserContractArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceDir: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
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

function createPublicWindowsInstalledUserContractSteps() {
  const vitestRunner = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
  return [
    {
      id: 'runtime-settings-cli-contract',
      title: 'Validate generated vihs launcher and runtime-settings CLI on Windows',
      command: process.execPath,
      args: [vitestRunner, 'run', 'tests/unit/localRuntimeSettingsCli.test.ts'],
      stdoutFileName: 'runtime-settings-cli-contract.stdout.log',
      stderrFileName: 'runtime-settings-cli-contract.stderr.log'
    },
    {
      id: 'public-windows-installed-user-contract',
      title: 'Validate the public Windows installed-user admission matrix surface',
      command: process.execPath,
      args: [vitestRunner, 'run', 'tests/unit/publicWindowsInstalledUserContract.test.ts'],
      stdoutFileName: 'public-windows-installed-user-contract.stdout.log',
      stderrFileName: 'public-windows-installed-user-contract.stderr.log'
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

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    const error = new Error(`Public Windows installed-user contract step failed: ${step.id}`);
    error.stepId = step.id;
    error.exitCode = result.status;
    throw error;
  }

  return {
    id: step.id,
    title: step.title,
    command: step.command,
    args: step.args,
    status: 'passed',
    stdoutPath,
    stderrPath
  };
}

function buildPublicWindowsInstalledUserContractReport(options) {
  return {
    schema: 'vi-history-suite/public-windows-installed-user-contract@v1',
    recordedAt: options.recordedAt,
    status: options.status,
    repoRoot: options.repoRoot,
    evidenceDir: options.evidenceDir,
    steps: options.steps,
    failure: options.failure ?? null
  };
}

function buildPublicWindowsInstalledUserContractMarkdown(report) {
  return [
    '# Public Windows Installed-User Contract Report',
    '',
    `- Status: ${report.status}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Repo root: ${report.repoRoot}`,
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

async function writePublicWindowsInstalledUserContractReport(evidenceDir, report) {
  const jsonPath = path.join(evidenceDir, 'public-windows-installed-user-contract.json');
  const markdownPath = path.join(evidenceDir, 'public-windows-installed-user-contract.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(
    markdownPath,
    `${buildPublicWindowsInstalledUserContractMarkdown(report)}\n`,
    'utf8'
  );
  return { jsonPath, markdownPath };
}

async function runPublicWindowsInstalledUserContract(argv = process.argv.slice(2), deps = {}) {
  const parsed = parsePublicWindowsInstalledUserContractArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.helpRequested) {
    stdout.write(`${getPublicWindowsInstalledUserContractUsage()}\n`);
    return 'help';
  }

  const evidenceDir =
    parsed.evidenceDir ??
    path.join(repoRoot, 'artifacts', 'public-windows-installed-user-contract');
  await ensureEvidenceDir(evidenceDir);

  const steps = createPublicWindowsInstalledUserContractSteps();
  const stepResults = [];
  let status = 'passed';
  let failure = null;

  for (const step of steps) {
    stdout.write(`[public-windows-contract] ${step.title}\n`);
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

  await writePublicWindowsInstalledUserContractReport(
    evidenceDir,
    buildPublicWindowsInstalledUserContractReport({
      recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
      status,
      repoRoot: deps.cwd ?? repoRoot,
      evidenceDir,
      steps: stepResults,
      failure
    })
  );

  if (status === 'failed') {
    throw new Error(failure?.message ?? 'Public Windows installed-user contract failed.');
  }

  stdout.write('[public-windows-contract] Public Windows installed-user contract passed.\n');
  return 'pass';
}

async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    await runPublicWindowsInstalledUserContract(argv, deps);
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
  buildPublicWindowsInstalledUserContractMarkdown,
  buildPublicWindowsInstalledUserContractReport,
  createPublicWindowsInstalledUserContractSteps,
  getPublicWindowsInstalledUserContractUsage,
  main,
  parsePublicWindowsInstalledUserContractArgs,
  runPublicWindowsInstalledUserContract,
  writePublicWindowsInstalledUserContractReport
};
