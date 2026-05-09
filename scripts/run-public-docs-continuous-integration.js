#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');

function getPublicDocsContinuousIntegrationUsage() {
  return [
    'Usage: node scripts/run-public-docs-continuous-integration.js [--skip-links] [--evidence-dir <path>] [--help]',
    '',
    'Run the public-user documentation continuous-integration lane and retain evidence.',
    '',
    'Options:',
    '  --skip-links         Skip the lychee link-check step.',
    '  --evidence-dir PATH  Retain JSON/Markdown/log evidence at PATH.',
    '  --help               Print this help text.'
  ].join('\n');
}

function parsePublicDocsContinuousIntegrationArgs(argv) {
  const parsed = {
    helpRequested: false,
    skipLinks: false,
    evidenceDir: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (argument === '--skip-links') {
      parsed.skipLinks = true;
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

function createPublicDocsContinuousIntegrationSteps(options = {}) {
  const evidenceDir =
    options.evidenceDir ?? path.join(repoRoot, '.cache', 'docs-integration', 'public', 'latest');

  const steps = [
    {
      id: 'compile',
      title: 'Compile TypeScript surfaces',
      command: 'npm',
      args: ['run', 'compile'],
      stdoutFileName: 'compile.stdout.log',
      stderrFileName: 'compile.stderr.log'
    },
    {
      id: 'public-docs-tests',
      title: 'Run public-user documentation alignment tests',
      command: 'npx',
      args: [
        'vitest',
        'run',
        'tests/unit/bundledDocumentation.test.ts',
        'tests/unit/packageManifest.test.ts',
        'tests/unit/publicDevcontainerSurface.test.ts',
        'tests/unit/publicDocsContinuousIntegration.test.ts',
        'tests/unit/publicLinuxInstalledUserSmoke.test.ts',
        'tests/unit/publicForkOwnerProcedureDocs.test.ts',
        'tests/unit/publicSurfaceBoundaryDocs.test.ts',
        'tests/unit/repoAgnosticWorkflowDocs.test.ts'
      ],
      stdoutFileName: 'public-docs-tests.stdout.log',
      stderrFileName: 'public-docs-tests.stderr.log'
    },
    {
      id: 'bundle-check',
      title: 'Check bundled documentation drift',
      command: 'node',
      args: [
        'scripts/syncBundledDocs.js',
        '--check',
        '--report',
        path.join(evidenceDir, 'bundled-docs-check.json')
      ],
      stdoutFileName: 'bundle-check.stdout.log',
      stderrFileName: 'bundle-check.stderr.log'
    }
  ];

  if (!options.skipLinks) {
    steps.push({
      id: 'links',
      title: 'Check public README links',
      command: 'lychee',
      args: ['--verbose', '--no-progress', '--include-fragments', 'README.md'],
      stdoutFileName: 'links.stdout.log',
      stderrFileName: 'links.stderr.log'
    });
  }

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

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    const error = new Error(`Public docs CI step failed: ${step.id}`);
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

function buildPublicDocsContinuousIntegrationReport(options) {
  return {
    schema: 'vi-history-suite/public-docs-continuous-integration@v1',
    recordedAt: options.recordedAt,
    status: options.status,
    repoRoot: options.repoRoot,
    evidenceDir: options.evidenceDir,
    skipLinks: options.skipLinks,
    audience: 'public-user',
    steps: options.steps,
    failure: options.failure ?? null
  };
}

function buildPublicDocsContinuousIntegrationMarkdown(report) {
  return [
    '# Public Docs Continuous Integration Report',
    '',
    `- Status: ${report.status}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Audience: ${report.audience}`,
    `- Repo root: ${report.repoRoot}`,
    `- Skip links: ${String(report.skipLinks)}`,
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

async function writePublicDocsContinuousIntegrationReport(evidenceDir, report) {
  const jsonPath = path.join(evidenceDir, 'public-docs-integration-report.json');
  const markdownPath = path.join(evidenceDir, 'public-docs-integration-report.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildPublicDocsContinuousIntegrationMarkdown(report)}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

async function runPublicDocsContinuousIntegration(argv = process.argv.slice(2), deps = {}) {
  const parsed = parsePublicDocsContinuousIntegrationArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.helpRequested) {
    stdout.write(`${getPublicDocsContinuousIntegrationUsage()}\n`);
    return 'help';
  }

  const evidenceDir =
    parsed.evidenceDir ?? path.join(repoRoot, '.cache', 'docs-integration', 'public', 'latest');
  await ensureEvidenceDir(evidenceDir);

  const steps = createPublicDocsContinuousIntegrationSteps({
    skipLinks: parsed.skipLinks,
    evidenceDir
  });
  const stepResults = [];
  let status = 'passed';
  let failure = null;

  for (const step of steps) {
    stdout.write(`[public-docs-ci] ${step.title}\n`);
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

  await writePublicDocsContinuousIntegrationReport(
    evidenceDir,
    buildPublicDocsContinuousIntegrationReport({
      recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
      status,
      repoRoot: deps.cwd ?? repoRoot,
      evidenceDir,
      skipLinks: parsed.skipLinks,
      steps: stepResults,
      failure
    })
  );

  if (status === 'failed') {
    throw new Error(failure?.message ?? 'Public docs continuous integration failed.');
  }

  stdout.write('[public-docs-ci] Public docs continuous integration passed.\n');
  return 'pass';
}

async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    await runPublicDocsContinuousIntegration(argv, deps);
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
  buildPublicDocsContinuousIntegrationMarkdown,
  buildPublicDocsContinuousIntegrationReport,
  createPublicDocsContinuousIntegrationSteps,
  getPublicDocsContinuousIntegrationUsage,
  main,
  parsePublicDocsContinuousIntegrationArgs,
  runPublicDocsContinuousIntegration,
  writePublicDocsContinuousIntegrationReport
};
