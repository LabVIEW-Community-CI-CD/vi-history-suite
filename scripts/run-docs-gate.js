#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');

function getDocsGateUsage() {
  return [
    'Usage: node scripts/run-docs-gate.js [--skip-links] [--help]',
    '',
    'Runs the governed documentation-package gate for vi-history-suite.',
    '',
    'Options:',
    '  --skip-links  Skip the lychee link-check step.',
    '  --help        Print this help text.'
  ].join('\n');
}

function parseDocsGateArgs(argv) {
  const parsed = {
    helpRequested: false,
    skipLinks: false
  };

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--skip-links') {
      parsed.skipLinks = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function resolveNodeToolCommand(command, platform = process.platform) {
  if (platform === 'win32') {
    if (command === 'npm' || command === 'npx') {
      return 'cmd.exe';
    }
  }

  return command;
}

function resolveNodeToolArgs(command, args, platform = process.platform) {
  if (platform === 'win32' && (command === 'npm' || command === 'npx')) {
    return ['/d', '/s', '/c', [command, ...args].join(' ')];
  }

  return args;
}

function createDocsGateSteps(options = {}) {
  const platform = options.platform ?? process.platform;
  const steps = [
    {
      id: 'compile',
      title: 'Compile TypeScript surfaces',
      command: resolveNodeToolCommand('npm', platform),
      args: resolveNodeToolArgs('npm', ['run', 'compile'], platform)
    },
    {
      id: 'docs-tests',
      title: 'Run documentation-package alignment tests',
      command: resolveNodeToolCommand('npx', platform),
      args: resolveNodeToolArgs('npx', [
        'vitest',
        'run',
        'tests/unit/bundledDocumentation.test.ts',
        'tests/unit/postReleaseControlPlaneDocs.test.ts',
        'tests/unit/publicSurfaceBoundaryDocs.test.ts',
        'tests/unit/publicForkOwnerProcedureDocs.test.ts',
        'tests/unit/debtLedgerDocs.test.ts',
        'tests/unit/executionPolicyDocs.test.ts',
        'tests/unit/governedProofDocs.test.ts',
        'tests/unit/firstTimeOverviewVideoPlan.test.ts',
        'tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts',
        'tests/unit/informationForUsersAudienceDocs.test.ts',
        'tests/unit/informationForUsersQualityDocs.test.ts',
        'tests/unit/informationForUsersSupportDocs.test.ts',
        'tests/unit/installVihsExtensionScript.test.ts',
        'tests/unit/requirementsDocs.test.ts',
        'tests/unit/packageManifest.test.ts',
        'tests/unit/shipControlDocs.test.ts',
        'tests/unit/docsWorkbenchDocs.test.ts',
        'tests/unit/docsContinuousIntegration.test.ts',
        'tests/unit/syncBundledDocsScript.test.ts',
        'tests/unit/wikiCoverageDocs.test.ts',
        'tests/unit/runWikiWorkbenchCli.test.ts'
      ], platform)
    },
    {
      id: 'bundle-check',
      title: 'Check bundled documentation drift',
      command: 'node',
      args: ['scripts/syncBundledDocs.js', '--check']
    }
  ];

  if (!options.skipLinks) {
    steps.push({
      id: 'links',
      title: 'Check README and docs links',
      command: 'lychee',
      args: ['--verbose', '--no-progress', '--include-fragments', 'README.md', 'docs/**/*.md']
    });
  }

  return steps;
}

function runDocsGate(argv = process.argv.slice(2), deps = {}) {
  const options = parseDocsGateArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const cwd = deps.cwd ?? repoRoot;

  if (options.helpRequested) {
    stdout.write(`${getDocsGateUsage()}\n`);
    return 'help';
  }

  const steps = createDocsGateSteps({
    ...options,
    platform: deps.platform ?? process.platform
  });

  for (const step of steps) {
    stdout.write(`[docs-gate] ${step.title}\n`);
    const result = spawnSyncImpl(step.command, step.args, {
      cwd,
      stdio: 'inherit',
      shell: false
    });

    if (result.error) {
      if (result.error.code === 'ENOENT' && step.command === 'lychee') {
        throw new Error(
          'Documentation gate requires `lychee` for link checking. Run `npm run docs:workbench:gate` or install `lychee` locally.'
        );
      }

      throw result.error;
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      throw new Error(`Documentation gate step failed: ${step.id}`);
    }
  }

  stdout.write('[docs-gate] Documentation package gate passed.\n');
  return 'pass';
}

function main(argv = process.argv.slice(2), deps = {}, stderr = process.stderr) {
  try {
    runDocsGate(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  createDocsGateSteps,
  getDocsGateUsage,
  main,
  parseDocsGateArgs,
  resolveNodeToolArgs,
  resolveNodeToolCommand,
  runDocsGate
};
