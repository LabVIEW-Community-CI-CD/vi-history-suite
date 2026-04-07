#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createDocsGateSteps } = require('./run-docs-gate.js');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const PUBLIC_DOCS_TEST_FILES = [
  'tests/unit/bundledDocumentation.test.ts',
  'tests/unit/packageManifest.test.ts',
  'tests/unit/publicSurfaceBoundaryDocs.test.ts'
];
const INTERNAL_DOCS_TEST_FILES = [
  'tests/unit/postReleaseControlPlaneDocs.test.ts',
  'tests/unit/debtLedgerDocs.test.ts',
  'tests/unit/executionPolicyDocs.test.ts',
  'tests/unit/governedProofDocs.test.ts',
  'tests/unit/requirementsDocs.test.ts',
  'tests/unit/shipControlDocs.test.ts',
  'tests/unit/docsWorkbenchDocs.test.ts',
  'tests/unit/docsContinuousIntegration.test.ts',
  'tests/unit/syncBundledDocsScript.test.ts',
  'tests/unit/wikiCoverageDocs.test.ts',
  'tests/unit/runWikiWorkbenchCli.test.ts'
];

function getDocsContinuousIntegrationUsage() {
  return [
    'Usage: node scripts/run-docs-continuous-integration.js [--surface <all|public|internal>] [--skip-links] [--evidence-dir <path>] [--help]',
    '',
    'Run the documentation continuous-integration lane and retain evidence.',
    '',
    'Options:',
    '  --surface SCOPE     Run all, public-user, or internal-authority docs CI surfaces.',
    '  --skip-links         Skip the lychee link-check step.',
    '  --evidence-dir PATH  Retain JSON/Markdown/log evidence at PATH.',
    '  --help               Print this help text.'
  ].join('\n');
}

function parseDocsContinuousIntegrationArgs(argv) {
  const parsed = {
    helpRequested: false,
    surface: 'all',
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

    if (argument === '--surface') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --surface');
      }
      if (!['all', 'public', 'internal'].includes(value)) {
        throw new Error(`Unsupported --surface value: ${value}`);
      }
      parsed.surface = value;
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

function resolveDocsContinuousIntegrationSurfacePaths(options = {}) {
  const surface = options.surface ?? 'all';
  const repoRootPath = options.repoRoot ?? repoRoot;
  const env = options.env ?? process.env;

  return {
    wikiRoot:
      env.VIHS_WIKI_REPO_ROOT
        ? path.resolve(env.VIHS_WIKI_REPO_ROOT)
        : path.resolve(
            repoRootPath,
            '..',
            surface === 'public' ? 'vi-history-suite.github.wiki' : 'vi-history-suite.wiki'
          ),
    ledgerPath:
      env.VIHS_LEDGER_PATH
        ? path.resolve(env.VIHS_LEDGER_PATH)
        : path.join(
            repoRootPath,
            'docs',
            'product',
            surface === 'public'
              ? 'public-github-wiki-publication-ledger.json'
              : 'wiki-publication-ledger.json'
          )
  };
}

function resolveDocsContinuousIntegrationEvidenceDir(surface, explicitEvidenceDir, repoRootPath) {
  if (explicitEvidenceDir) {
    return explicitEvidenceDir;
  }

  return path.join(
    repoRootPath,
    surface === 'public'
      ? path.join('.cache', 'docs-integration', 'public', 'latest')
      : surface === 'internal'
        ? path.join('.cache', 'docs-integration', 'internal', 'latest')
        : path.join('.cache', 'docs-integration', 'latest')
  );
}

function createDocsContinuousIntegrationSteps(options = {}) {
  const surface = options.surface ?? 'all';
  const evidenceDir = resolveDocsContinuousIntegrationEvidenceDir(
    surface,
    options.evidenceDir,
    options.repoRoot ?? repoRoot
  );
  const bundleReportPath = path.join(evidenceDir, 'bundled-docs-check.json');
  const bundlePaths = resolveDocsContinuousIntegrationSurfacePaths({
    surface: surface === 'internal' ? 'internal' : 'public',
    repoRoot: options.repoRoot ?? repoRoot,
    env: options.env ?? process.env
  });
  const steps = [
    {
      id: 'compile',
      title: 'Compile TypeScript surfaces',
      command: 'npm',
      args: ['run', 'compile'],
      stdoutFileName: 'compile.stdout.log',
      stderrFileName: 'compile.stderr.log'
    }
  ];

  if (surface === 'all' || surface === 'public') {
    steps.push(
      {
        id: 'public-docs-tests',
        title: 'Run public-user documentation alignment tests',
        command: 'npx',
        args: ['vitest', 'run', ...PUBLIC_DOCS_TEST_FILES],
        stdoutFileName: 'public-docs-tests.stdout.log',
        stderrFileName: 'public-docs-tests.stderr.log'
      },
      {
        id: 'bundle-check',
        title: 'Check bundled documentation drift',
        command: 'node',
        args: ['scripts/syncBundledDocs.js', '--check', '--report', bundleReportPath],
        env: {
          VIHS_WIKI_REPO_ROOT: bundlePaths.wikiRoot,
          VIHS_LEDGER_PATH: bundlePaths.ledgerPath
        },
        stdoutFileName: 'bundle-check.stdout.log',
        stderrFileName: 'bundle-check.stderr.log'
      }
    );

    if (!options.skipLinks) {
      steps.push({
        id: 'links',
        title: 'Check README and docs links',
        command: 'lychee',
        args: ['--verbose', '--no-progress', '--include-fragments', 'README.md', 'docs/**/*.md'],
        stdoutFileName: 'links.stdout.log',
        stderrFileName: 'links.stderr.log'
      });
    }
  }

  if (surface === 'all' || surface === 'internal') {
    steps.push(
      {
        id: 'internal-docs-tests',
        title: 'Run internal-authority documentation alignment tests',
        command: 'npx',
        args: ['vitest', 'run', ...INTERNAL_DOCS_TEST_FILES],
        stdoutFileName: 'internal-docs-tests.stdout.log',
        stderrFileName: 'internal-docs-tests.stderr.log'
      },
      {
      id: 'wiki-doctor',
      title: 'Run wiki workbench doctor',
      command: 'node',
      args: ['out/cli/runWikiWorkbench.js', 'doctor', '--format', 'json'],
      stdoutFileName: 'wiki-doctor.json',
      stderrFileName: 'wiki-doctor.stderr.log'
      },
      {
      id: 'wiki-plan',
      title: 'Run wiki workbench page plan',
      command: 'node',
      args: ['out/cli/runWikiWorkbench.js', 'plan-pages', '--format', 'json'],
      stdoutFileName: 'wiki-plan.json',
      stderrFileName: 'wiki-plan.stderr.log'
      }
    );
  }

  return steps;
}

function writeStdStream(stream, text) {
  if (!text) {
    return;
  }
  stream.write(text);
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
    env: {
      ...options.env,
      ...(step.env ?? {})
    },
    encoding: 'utf8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024
  });

  const stdoutText = result.stdout ?? '';
  const stderrText = result.stderr ?? '';
  writeStdStream(options.stdout, stdoutText);
  writeStdStream(options.stderr, stderrText);

  const stdoutPath = await writeEvidenceFile(options.evidenceDir, step.stdoutFileName, stdoutText);
  const stderrPath = await writeEvidenceFile(options.evidenceDir, step.stderrFileName, stderrText);

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    const error = new Error(`Documentation integration step failed: ${step.id}`);
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

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectInstalledUserTruths(repoRootPath) {
  const userWorkflowPath = path.join(
    repoRootPath,
    'resources',
    'bundled-docs',
    'pages',
    'user-workflow.html'
  );
  const html = fs.existsSync(userWorkflowPath) ? fs.readFileSync(userWorkflowPath, 'utf8') : '';

  return {
    windowsAutoUsesDockerWhenInstalled: html.includes(
      'on Windows, use the governed Windows container whenever Docker Desktop is installed'
    ),
    noSilentProviderFallback: html.includes(
      'no mode silently falls back to a different provider'
    ),
    dockerRequiredHardStop: html.includes(
      'if Docker is required but unavailable, the extension stops and tells you what to fix'
    ),
    providerChoiceAndProgressVisible: html.includes(
      'compare progress, provider choice, and Windows image acquisition state stay visible'
    )
  };
}

function buildDocsContinuousIntegrationReport(options) {
  const surfacePaths = resolveDocsContinuousIntegrationSurfacePaths({
    surface: options.surface,
    repoRoot: options.repoRoot,
    env: options.env
  });
  const coverageMatrix = readJsonIfPresent(
    path.join(options.repoRoot, 'docs', 'product', 'wiki-coverage-matrix.json')
  );
  const internalPublicationLedger = readJsonIfPresent(
    path.join(options.repoRoot, 'docs', 'product', 'wiki-publication-ledger.json')
  );
  const publicPublicationLedger = readJsonIfPresent(
    path.join(options.repoRoot, 'docs', 'product', 'public-github-wiki-publication-ledger.json')
  );
  const bundledManifest = readJsonIfPresent(
    path.join(options.repoRoot, 'resources', 'bundled-docs', 'manifest.json')
  );
  const bundleCheck = readJsonIfPresent(path.join(options.evidenceDir, 'bundled-docs-check.json'));
  const wikiDoctor = readJsonIfPresent(path.join(options.evidenceDir, 'wiki-doctor.json'));
  const wikiPlan = readJsonIfPresent(path.join(options.evidenceDir, 'wiki-plan.json'));
  const installedUserTruths = collectInstalledUserTruths(options.repoRoot);

  return {
    schema: 'vi-history-suite/docs-continuous-integration@v1',
    recordedAt: options.recordedAt,
    status: options.status,
    surface: options.surface,
    repoRoot: options.repoRoot,
    wikiRoot: surfacePaths.wikiRoot,
    ledgerPath: surfacePaths.ledgerPath,
    evidenceDir: options.evidenceDir,
    skipLinks: options.skipLinks,
    steps: options.steps,
    failure: options.failure ?? null,
    bundleCheck,
    wikiDoctorIssueCount: Array.isArray(wikiDoctor?.issues) ? wikiDoctor.issues.length : null,
    wikiPlanPageCount: Array.isArray(wikiPlan?.pages) ? wikiPlan.pages.length : null,
    wikiNextPageId:
      Array.isArray(wikiPlan?.pages)
        ? wikiPlan.pages.find((page) => page.status === 'next')?.id ?? null
        : null,
    coverageSourceCount: Array.isArray(coverageMatrix?.coverage)
      ? coverageMatrix.coverage.length
      : null,
    internalPublishedWikiPageCount: Array.isArray(internalPublicationLedger?.pages)
      ? internalPublicationLedger.pages.filter((page) => page.status === 'published').length
      : null,
    publicPublishedWikiPageCount: Array.isArray(publicPublicationLedger?.pages)
      ? publicPublicationLedger.pages.filter((page) => page.status === 'published').length
      : null,
    bundledPageCount: Array.isArray(bundledManifest?.pages) ? bundledManifest.pages.length : null,
    installedUserTruths
  };
}

function buildDocsContinuousIntegrationMarkdown(report) {
  return [
    '# Documentation Continuous Integration Report',
    '',
    `- Status: ${report.status}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Surface: ${report.surface}`,
    `- Repo root: ${report.repoRoot}`,
    `- Wiki root: ${report.wikiRoot}`,
    `- Ledger path: ${report.ledgerPath}`,
    `- Skip links: ${String(report.skipLinks)}`,
    `- Bundle check: ${report.bundleCheck?.status ?? 'not-retained'}`,
    `- Wiki doctor issues: ${String(report.wikiDoctorIssueCount ?? 'not-retained')}`,
    `- Planned wiki pages: ${String(report.wikiPlanPageCount ?? 'not-retained')}`,
    `- Next wiki page: ${report.wikiNextPageId ?? 'none'}`,
    `- Internal published wiki pages: ${String(report.internalPublishedWikiPageCount ?? 'not-retained')}`,
    `- Public published wiki pages: ${String(report.publicPublishedWikiPageCount ?? 'not-retained')}`,
    `- Bundled pages: ${String(report.bundledPageCount ?? 'not-retained')}`,
    '',
    '## Installed-User Truth Checks',
    '',
    `- Windows auto uses Docker when installed: ${String(report.installedUserTruths.windowsAutoUsesDockerWhenInstalled)}`,
    `- No silent provider fallback: ${String(report.installedUserTruths.noSilentProviderFallback)}`,
    `- Docker-required hard stop documented: ${String(report.installedUserTruths.dockerRequiredHardStop)}`,
    `- Provider choice and progress visibility documented: ${String(report.installedUserTruths.providerChoiceAndProgressVisible)}`,
    '',
    '## Steps',
    '',
    ...report.steps.map(
      (step) =>
        `- ${step.id}: ${step.status} via \`${step.command} ${step.args.join(' ')}\``
    ),
    '',
    report.failure
      ? `## Failure\n\n- Step: ${report.failure.stepId ?? 'unknown'}\n- Message: ${report.failure.message}`
      : '## Failure\n\n- none'
  ].join('\n');
}

async function writeDocsContinuousIntegrationReport(evidenceDir, report) {
  const jsonPath = path.join(evidenceDir, 'docs-integration-report.json');
  const markdownPath = path.join(evidenceDir, 'docs-integration-report.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildDocsContinuousIntegrationMarkdown(report)}\n`, 'utf8');
  return {
    jsonPath,
    markdownPath
  };
}

async function runDocsContinuousIntegration(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseDocsContinuousIntegrationArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.helpRequested) {
    stdout.write(`${getDocsContinuousIntegrationUsage()}\n`);
    return 'help';
  }

  const evidenceDir =
    resolveDocsContinuousIntegrationEvidenceDir(parsed.surface, parsed.evidenceDir, repoRoot);
  await ensureEvidenceDir(evidenceDir);

  const steps = createDocsContinuousIntegrationSteps({
    surface: parsed.surface,
    skipLinks: parsed.skipLinks,
    evidenceDir
  });
  const stepResults = [];
  let status = 'passed';
  let failure = null;

  for (const step of steps) {
    stdout.write(`[docs-ci] ${step.title}\n`);

    try {
      const stepResult = await runStep(step, {
        cwd: deps.cwd ?? repoRoot,
        env: deps.env ?? process.env,
        evidenceDir,
        stdout,
        stderr,
        spawnSync: deps.spawnSync
      });
      stepResults.push(stepResult);
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

  const report = buildDocsContinuousIntegrationReport({
    recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
    status,
    repoRoot: deps.cwd ?? repoRoot,
    evidenceDir,
    skipLinks: parsed.skipLinks,
    surface: parsed.surface,
    steps: stepResults,
    failure,
    env: deps.env ?? process.env
  });

  await writeDocsContinuousIntegrationReport(evidenceDir, report);

  if (status === 'failed') {
    throw new Error(failure?.message ?? 'Documentation continuous integration failed.');
  }

  stdout.write('[docs-ci] Documentation continuous integration passed.\n');
  return 'pass';
}

async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    await runDocsContinuousIntegration(argv, deps);
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
  buildDocsContinuousIntegrationMarkdown,
  buildDocsContinuousIntegrationReport,
  createDocsContinuousIntegrationSteps,
  INTERNAL_DOCS_TEST_FILES,
  PUBLIC_DOCS_TEST_FILES,
  getDocsContinuousIntegrationUsage,
  main,
  parseDocsContinuousIntegrationArgs,
  resolveDocsContinuousIntegrationSurfacePaths,
  resolveDocsContinuousIntegrationEvidenceDir,
  runDocsContinuousIntegration,
  writeDocsContinuousIntegrationReport
};
