#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(repoRoot, '.cache', 'public-exact-pretag-proof', 'latest');
const DEFAULT_TARGET_ROOT = path.join(
  repoRoot,
  '.cache',
  'public-exact-pretag-proof',
  'staging',
  'public-github-source'
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const promotion = require(path.join(repoRoot, 'scripts', 'promotePublicGithubSource.js'));

const PUBLIC_EXACT_PRETAG_TESTS = [
  'tests/unit/publicRepoPackageSurface.test.ts',
  'tests/unit/publicDevcontainerSurface.test.ts'
];

function getPublicExactPretagProofUsage() {
  return [
    'Usage: node scripts/runPublicExactPretagProof.js [--target-root <path>] [--evidence-dir <path>] [--help]',
    '',
    'Promote the authority public facade into a clean local staging root and fail closed unless',
    'the staged public repo passes the pre-tag exact validation surface.',
    '',
    'Options:',
    '  --target-root PATH   Override the clean staging root used for the promoted public facade.',
    '  --evidence-dir PATH  Retain JSON/Markdown evidence at PATH.',
    '  --help               Print this help text.'
  ].join('\n');
}

function parsePublicExactPretagProofArgs(argv) {
  const parsed = {
    helpRequested: false,
    targetRoot: DEFAULT_TARGET_ROOT,
    evidenceDir: DEFAULT_EVIDENCE_DIR
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--target-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --target-root');
      }
      parsed.targetRoot = path.resolve(value);
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

function resolveNpmInvocation(
  npmExecPath = process.env.npm_execpath,
  nodePath = process.execPath,
  platform = process.platform
) {
  if (npmExecPath && nodePath) {
    return {
      command: nodePath,
      prefixArgs: [npmExecPath]
    };
  }

  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      prefixArgs: ['/d', '/s', '/c', 'npm']
    };
  }

  return {
    command: 'npm',
    prefixArgs: []
  };
}

function createPublicExactPretagProofPlan(options = {}) {
  const targetRoot = options.targetRoot ?? '<target-root>';
  const npmInvocation = options.npmInvocation ?? resolveNpmInvocation();
  const npmCommandLabel = npmInvocation.prefixArgs.length > 0
    ? [npmInvocation.command, ...npmInvocation.prefixArgs].join(' ')
    : npmInvocation.command;

  return [
    {
      id: 'promote-public-facade',
      title: 'Promote authority public facade into a clean staging root',
      command: 'internal',
      args: [targetRoot]
    },
    {
      id: 'install-public-dependencies',
      title: 'Install staged public facade dependencies',
      command: npmCommandLabel,
      args: ['ci']
    },
    {
      id: 'validate-public-design-contract',
      title: 'Validate the staged public exact unit surface',
      command: npmCommandLabel,
      args: ['exec', '--', 'vitest', 'run', ...PUBLIC_EXACT_PRETAG_TESTS]
    },
    {
      id: 'compile-public-integration-surface',
      title: 'Compile the staged public integration surface',
      command: npmCommandLabel,
      args: ['run', 'test:integration:compile']
    }
  ];
}

function buildPublicExactPretagProofMarkdown(report) {
  const lines = [
    '# Public Exact Pre-Tag Proof',
    '',
    `- Recorded: ${report.recordedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Target root: ${report.targetRoot}`,
    `- Status: ${report.status}`,
    `- Promoted file count: ${report.promotedFileCount}`
  ];

  if (report.failure) {
    lines.push(`- Failure step: ${report.failure.stepId}`);
    lines.push(`- Failure message: ${report.failure.message}`);
  }

  lines.push('', '| Step | Status | Duration (ms) |', '| --- | --- | ---: |');

  for (const step of report.steps) {
    lines.push(`| ${step.id} | ${step.status} | ${step.durationMs} |`);
  }

  return `${lines.join('\n')}\n`;
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function runCommand(command, args, cwd, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: String(result.stdout ?? ''),
    stderr: result.error
      ? `${String(result.stderr ?? '')}${String(result.error)}\n`
      : String(result.stderr ?? '')
  };
}

async function runPublicExactPretagProof(argv = [], deps = {}) {
  const parsed = parsePublicExactPretagProofArgs(argv);
  if (parsed.helpRequested) {
    (deps.stdout ?? process.stdout).write(`${getPublicExactPretagProofUsage()}\n`);
    return parsed.evidenceDir;
  }

  const recordedAt = (deps.now ?? (() => new Date().toISOString()))();
  const evidenceDir = parsed.evidenceDir;
  const runCommandImpl = deps.runCommand ?? runCommand;
  const writePromotedTree = deps.writePromotedTree ?? promotion.writePromotedTree;

  await (deps.rm ?? fsp.rm)(parsed.targetRoot, { recursive: true, force: true });
  await (deps.rm ?? fsp.rm)(evidenceDir, { recursive: true, force: true });
  await (deps.mkdir ?? fsp.mkdir)(parsed.targetRoot, { recursive: true });
  await (deps.mkdir ?? fsp.mkdir)(evidenceDir, { recursive: true });

  const steps = [];
  let promotedFiles = [];
  let failure;

  const promoteStartedAt = Date.now();
  try {
    promotedFiles = writePromotedTree(parsed.targetRoot);
    steps.push({
      id: 'promote-public-facade',
      title: 'Promote authority public facade into a clean staging root',
      command: 'internal',
      args: [parsed.targetRoot],
      status: 'passed',
      exitCode: 0,
      durationMs: Date.now() - promoteStartedAt
    });
  } catch (error) {
    failure = {
      stepId: 'promote-public-facade',
      message: String(error)
    };
    steps.push({
      id: 'promote-public-facade',
      title: 'Promote authority public facade into a clean staging root',
      command: 'internal',
      args: [parsed.targetRoot],
      status: 'failed',
      exitCode: 1,
      durationMs: Date.now() - promoteStartedAt
    });
  }

  const npmInvocation = resolveNpmInvocation();
  if (!failure) {
    const runnableSteps = [
      {
        id: 'install-public-dependencies',
        title: 'Install staged public facade dependencies',
        args: ['ci']
      },
      {
        id: 'validate-public-design-contract',
        title: 'Validate the staged public exact unit surface',
        args: ['exec', '--', 'vitest', 'run', ...PUBLIC_EXACT_PRETAG_TESTS]
      },
      {
        id: 'compile-public-integration-surface',
        title: 'Compile the staged public integration surface',
        args: ['run', 'test:integration:compile']
      }
    ];

    for (const step of runnableSteps) {
      const startedAt = Date.now();
      const invocationArgs =
        npmInvocation.command === 'cmd.exe'
          ? [...npmInvocation.prefixArgs.slice(0, 3), [npmInvocation.prefixArgs[3], ...step.args].join(' ')]
          : [...npmInvocation.prefixArgs, ...step.args];
      const result = runCommandImpl(
        npmInvocation.command,
        invocationArgs,
        parsed.targetRoot,
        deps.spawnSyncImpl
      );
      const stdoutFileName = `${step.id}.stdout.txt`;
      const stderrFileName = `${step.id}.stderr.txt`;
      writeText(path.join(evidenceDir, stdoutFileName), result.stdout);
      writeText(path.join(evidenceDir, stderrFileName), result.stderr);
      steps.push({
        id: step.id,
        title: step.title,
        command: npmInvocation.command,
        args: invocationArgs,
        status: result.status === 0 ? 'passed' : 'failed',
        exitCode: result.status,
        durationMs: Date.now() - startedAt,
        stdoutPath: stdoutFileName,
        stderrPath: stderrFileName
      });

      if (result.status !== 0) {
        failure = {
          stepId: step.id,
          message: `command failed with exit code ${result.status}`
        };
        break;
      }
    }
  }

  const report = {
    schema: 'vi-history-suite/public-exact-pretag-proof@v1',
    recordedAt,
    repoRoot,
    targetRoot: parsed.targetRoot,
    status: failure ? 'fail' : 'pass',
    promotedFileCount: promotedFiles.length,
    steps,
    failure: failure ?? null
  };

  writeText(
    path.join(evidenceDir, 'public-exact-pretag-proof.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  writeText(
    path.join(evidenceDir, 'public-exact-pretag-proof.md'),
    buildPublicExactPretagProofMarkdown(report)
  );

  if (failure) {
    throw new Error(`Public exact pre-tag proof failed at ${failure.stepId}: ${failure.message}`);
  }

  return evidenceDir;
}

if (require.main === module) {
  runPublicExactPretagProof(process.argv.slice(2)).catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  PUBLIC_EXACT_PRETAG_TESTS,
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_TARGET_ROOT,
  buildPublicExactPretagProofMarkdown,
  createPublicExactPretagProofPlan,
  getPublicExactPretagProofUsage,
  parsePublicExactPretagProofArgs,
  resolveNpmInvocation,
  runPublicExactPretagProof
};
