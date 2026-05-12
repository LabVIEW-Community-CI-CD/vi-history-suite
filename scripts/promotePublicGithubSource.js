#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const publicSourceTemplateRoot = path.join(repoRoot, 'public-github-source');
const DEFAULT_TARGET_ROOT = path.resolve(repoRoot, '..', 'vi-history-suite.public');
const DEFAULT_TARGET_ROOT_ENV = 'VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT';
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'public-github-source-promotion',
  'latest'
);
const EXPECTED_TARGET_REMOTE = 'https://github.com/svelderrainruiz/vi-history-suite.git';

const PUBLIC_DESIGN_CONTRACT_TESTS = [
  'tests/unit/bootstrapLinuxVsCodeHost.test.ts',
  'tests/unit/comparisonReportPreflight.test.ts',
  'tests/unit/comparisonReportRuntimeExecution.test.ts',
  'tests/unit/preparePublicRepoCloneScript.test.ts',
  'tests/unit/preparePublicTestFixtureScript.test.ts',
  'tests/unit/publicRepoPackageSurface.test.ts',
  'tests/unit/publicDevcontainerSurface.test.ts',
  'tests/unit/publicLinuxInstalledUserSmoke.test.ts',
  'tests/unit/publicWindowsInstalledUserContract.test.ts',
  'tests/unit/runLinuxIntegrationHost.test.ts',
  'tests/unit/linuxContainerRuntimeExecutionSurface.test.ts'
];

const MANAGED_ROOT_PATHS = [
  '.devcontainer',
  '.github',
  '.vscode',
  'src',
  'resources',
  'scripts',
  'tests',
  'README.md',
  'FIRST-RUN.md',
  'AGENTS.md',
  'INSTALL.md',
  'SUPPORT.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'LICENSE',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.integration.json',
  'vitest.config.ts',
  '.gitignore',
  'acceptance',
  'fixtures',
  'releases',
  'setup',
  'docker'
];

const AUTHORITY_COPY_PATHS = [
  '.devcontainer/devcontainer.json',
  '.github/workflows/public-linux-installed-user-smoke.yml',
  '.github/workflows/public-windows-installed-user-contract.yml',
  '.vscode/extensions.json',
  '.vscode/launch.json',
  '.vscode/tasks.json',
  '.gitignore',
  'CHANGELOG.md',
  'LICENSE',
  'package-lock.json',
  'resources/bundled-docs/manifest.json',
  'resources/bundled-docs/pages/user-workflow.html',
  'resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html',
  'resources/bundled-docs/pages/install-and-release.html',
  'resources/bundled-docs/pages/overview.html',
  'scripts/auditPackagedRuntimeSurface.js',
  'scripts/bootstrapLinuxVsCodeHost.js',
  'scripts/preparePublicRepoClone.js',
  'scripts/publicRepoCloneCore.js',
  'scripts/preparePublicTestFixture.js',
  'scripts/runPinnedVsce.js',
  'scripts/runPublicLinuxInstalledUserSmoke.js',
  'scripts/runPublicWindowsInstalledUserContract.js',
  'scripts/runLinuxIntegrationHost.js',
  'src',
  'tests/integration',
  'tests/unit/bootstrapLinuxVsCodeHost.test.ts',
  'tests/unit/comparisonReportPreflight.test.ts',
  'tests/unit/comparisonReportRuntimeExecution.test.ts',
  'tests/unit/preparePublicRepoCloneScript.test.ts',
  'tests/unit/preparePublicTestFixtureScript.test.ts',
  'tests/unit/publicDevcontainerSurface.test.ts',
  'tests/unit/publicLinuxInstalledUserSmoke.test.ts',
  'tests/unit/publicWindowsInstalledUserContract.test.ts',
  'tests/unit/localRuntimeSettingsCli.test.ts',
  'tests/unit/runLinuxIntegrationHost.test.ts',
  'tests/unit/linuxContainerRuntimeExecutionSurface.test.ts',
  'tsconfig.integration.json',
  'tsconfig.json',
  'vitest.config.ts'
];

const TEMPLATE_COPY_PATHS = [
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/feature-request.yml',
  '.github/ISSUE_TEMPLATE/feature-not-implemented.yml',
  '.github/ISSUE_TEMPLATE/labview-version-support.yml',
  '.github/ISSUE_TEMPLATE/validation-failure.yml',
  '.github/ISSUE_TEMPLATE/validation-success.yml',
  '.github/ISSUE_TEMPLATE/windows-docker-desktop-validation.yml',
  '.github/labels.yml',
  '.github/workflows/public-source-package-preview.yml',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'FIRST-RUN.md',
  'INSTALL.md',
  'README.md',
  'SUPPORT.md',
  'tests/unit/publicRepoPackageSurface.test.ts'
];

function getPublicGithubSourcePromotionUsage() {
  return [
    'Usage: node scripts/promotePublicGithubSource.js [--target-root <path>] [--evidence-dir <path>] [--check] [--help]',
    '',
    'Promote the curated public GitHub source facade from GitLab authority into the local public GitHub source checkout.',
    `When --target-root is omitted, ${DEFAULT_TARGET_ROOT_ENV} is honored before the default sibling checkout path.`,
    '',
    'Options:',
    '  --target-root PATH   Override the target public GitHub source repo root.',
    '  --evidence-dir PATH  Retain JSON/Markdown evidence at PATH.',
    '  --check              Compare the target repo against the generated public facade instead of writing.',
    '  --help               Print this help text.'
  ].join('\n');
}

function parsePublicGithubSourcePromotionArgs(argv) {
  const envTargetRoot = process.env[DEFAULT_TARGET_ROOT_ENV]?.trim();
  const parsed = {
    helpRequested: false,
    targetRoot: envTargetRoot ? path.resolve(envTargetRoot) : DEFAULT_TARGET_ROOT,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    check: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--check') {
      parsed.check = true;
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

function normalizeRelativePath(value) {
  return value.replaceAll(path.sep, '/');
}

function ensureParentDirSync(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function removeManagedRootPaths(targetRoot) {
  for (const relativePath of MANAGED_ROOT_PATHS) {
    fs.rmSync(path.join(targetRoot, relativePath), { recursive: true, force: true });
  }
}

function listFilesRecursive(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const results = [];
  const queue = [rootPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const children = fs.readdirSync(current).sort();
      for (const child of children.reverse()) {
        queue.push(path.join(current, child));
      }
      continue;
    }
    results.push(normalizeRelativePath(path.relative(rootPath, current)));
  }
  return results.sort();
}

function copyPathSync(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    return;
  }

  ensureParentDirSync(targetPath);
  fs.copyFileSync(sourcePath, targetPath);
}

function listManagedFiles(rootPath) {
  const results = [];
  for (const managedPath of MANAGED_ROOT_PATHS) {
    const absolutePath = path.join(rootPath, managedPath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      const nestedFiles = listFilesRecursive(absolutePath).map((relativePath) =>
        normalizeRelativePath(path.join(managedPath, relativePath))
      );
      results.push(...nestedFiles);
      continue;
    }
    results.push(normalizeRelativePath(managedPath));
  }
  return Array.from(new Set(results)).sort();
}

function readAuthorityPackageManifest() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
}

function renderPublicPackageManifest(authorityManifest = readAuthorityPackageManifest()) {
  const publicScripts = {
    clean: authorityManifest.scripts.clean,
    compile: authorityManifest.scripts.compile,
    check: authorityManifest.scripts.check,
    'dev:watch': authorityManifest.scripts['dev:watch'],
    'test:integration:compile': authorityManifest.scripts['test:integration:compile'],
    'test:integration':
      authorityManifest.scripts['test:integration'],
    'test:integration:linux': authorityManifest.scripts['test:integration:linux'],
    'public:host:bootstrap-linux': authorityManifest.scripts['public:host:bootstrap-linux'],
    'public:repo:clone': authorityManifest.scripts['public:repo:clone'],
    'test:design-contract': `npm exec -- vitest run ${PUBLIC_DESIGN_CONTRACT_TESTS.join(' ')}`,
    test: 'npm run test:design-contract',
    'public:smoke:linux': authorityManifest.scripts['public:smoke:linux'],
    'public:contract:windows-installed-user':
      authorityManifest.scripts['public:contract:windows-installed-user'],
    'public:fixture:icon-editor': authorityManifest.scripts['public:fixture:icon-editor'],
    'package:audit': authorityManifest.scripts['package:audit'],
    package: 'npm run compile && npm run package:audit && node scripts/runPinnedVsce.js package'
  };

  return {
    name: authorityManifest.name,
    displayName: authorityManifest.displayName,
    description: authorityManifest.description,
    version: authorityManifest.version,
    publisher: authorityManifest.publisher,
    license: authorityManifest.license,
    private: authorityManifest.private,
    repository: authorityManifest.repository,
    homepage: authorityManifest.homepage,
    bugs: authorityManifest.bugs,
    engines: authorityManifest.engines,
    capabilities: authorityManifest.capabilities,
    categories: authorityManifest.categories,
    main: authorityManifest.main,
    files: authorityManifest.files,
    activationEvents: authorityManifest.activationEvents,
    extensionDependencies: authorityManifest.extensionDependencies,
    contributes: authorityManifest.contributes,
    scripts: publicScripts,
    dependencies: authorityManifest.dependencies ?? {},
    devDependencies: authorityManifest.devDependencies
  };
}

function writeRenderedPackageManifest(targetRoot) {
  const targetPath = path.join(targetRoot, 'package.json');
  ensureParentDirSync(targetPath);
  fs.writeFileSync(
    targetPath,
    `${JSON.stringify(renderPublicPackageManifest(), null, 2)}\n`,
    'utf8'
  );
  return 'package.json';
}

function createPublicGithubSourcePromotionPlan() {
  return {
    expectedTargetRemote: EXPECTED_TARGET_REMOTE,
    managedRootPaths: [...MANAGED_ROOT_PATHS],
    authorityCopyPaths: [...AUTHORITY_COPY_PATHS],
    templateCopyPaths: [...TEMPLATE_COPY_PATHS],
    publicDesignContractTests: [...PUBLIC_DESIGN_CONTRACT_TESTS]
  };
}

function writePromotedTree(targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  removeManagedRootPaths(targetRoot);

  for (const relativePath of AUTHORITY_COPY_PATHS) {
    const sourcePath = path.join(repoRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Authority copy path is missing: ${relativePath}`);
    }
    copyPathSync(sourcePath, targetPath);
  }

  for (const relativePath of TEMPLATE_COPY_PATHS) {
    const sourcePath = path.join(publicSourceTemplateRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Public source template path is missing: ${relativePath}`);
    }
    copyPathSync(sourcePath, targetPath);
  }

  writeRenderedPackageManifest(targetRoot);

  return listManagedFiles(targetRoot);
}

function readGitRemote(rootPath) {
  if (!fs.existsSync(path.join(rootPath, '.git'))) {
    return null;
  }

  const result = spawnSync('git', ['-C', rootPath, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    shell: false
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return String(result.stdout ?? '').trim() || null;
}

function readGitStatusPorcelain(rootPath) {
  if (!fs.existsSync(path.join(rootPath, '.git'))) {
    return null;
  }

  const result = spawnSync('git', ['-C', rootPath, 'status', '--short'], {
    encoding: 'utf8',
    shell: false
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return String(result.stdout ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function compareFileTrees(expectedRoot, actualRoot) {
  const expectedFiles = listManagedFiles(expectedRoot);
  const actualFiles = listManagedFiles(actualRoot);
  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);

  const missingFiles = expectedFiles.filter((file) => !actualSet.has(file));
  const unexpectedFiles = actualFiles.filter((file) => !expectedSet.has(file));
  const mismatchedFiles = expectedFiles.filter((file) => {
    if (!actualSet.has(file)) {
      return false;
    }
    const expectedText = fs.readFileSync(path.join(expectedRoot, file), 'utf8');
    const actualText = fs.readFileSync(path.join(actualRoot, file), 'utf8');
    return expectedText !== actualText;
  });

  return {
    expectedFiles,
    actualFiles,
    missingFiles,
    unexpectedFiles,
    mismatchedFiles,
    clean:
      missingFiles.length === 0 && unexpectedFiles.length === 0 && mismatchedFiles.length === 0
  };
}

async function ensureEvidenceDir(evidenceDir) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
}

function buildPromotionReport(options) {
  return {
    schema: 'vi-history-suite/public-github-source-promotion@v1',
    recordedAt: options.recordedAt,
    status: options.status,
    mode: options.mode,
    sourceRoot: repoRoot,
    publicSourceTemplateRoot,
    targetRoot: options.targetRoot,
    expectedTargetRemote: EXPECTED_TARGET_REMOTE,
    observedTargetRemote: options.observedTargetRemote,
    defaultTargetRootEnv: DEFAULT_TARGET_ROOT_ENV,
    targetRootDirtyEntries: options.targetRootDirtyEntries ?? [],
    managedRootPaths: MANAGED_ROOT_PATHS,
    authorityCopyPaths: AUTHORITY_COPY_PATHS,
    templateCopyPaths: TEMPLATE_COPY_PATHS,
    publicDesignContractTests: PUBLIC_DESIGN_CONTRACT_TESTS,
    writtenFiles: options.writtenFiles ?? [],
    comparison: options.comparison ?? null,
    failure: options.failure ?? null
  };
}

function buildPromotionMarkdown(report) {
  const lines = [
    '# Public GitHub Source Promotion Report',
    '',
    `- Status: ${report.status}`,
    `- Mode: ${report.mode}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Source root: ${report.sourceRoot}`,
    `- Target root: ${report.targetRoot}`,
    `- Expected target remote: ${report.expectedTargetRemote}`,
    `- Observed target remote: ${report.observedTargetRemote ?? 'none'}`,
    `- Target root env var: ${report.defaultTargetRootEnv}`,
    '',
    '## Managed Root Paths',
    '',
    ...report.managedRootPaths.map((value) => `- \`${value}\``),
    '',
    '## Written Files',
    '',
    ...(report.writtenFiles.length > 0
      ? report.writtenFiles.map((value) => `- \`${value}\``)
      : ['- none']),
    '',
    '## Comparison',
    ''
  ];

  if (report.comparison) {
    lines.push(`- Missing files: ${report.comparison.missingFiles.length}`);
    lines.push(`- Unexpected files: ${report.comparison.unexpectedFiles.length}`);
    lines.push(`- Mismatched files: ${report.comparison.mismatchedFiles.length}`);
  } else {
    lines.push('- none');
  }

  lines.push('', '## Failure', '');
  if (report.failure) {
    lines.push(`- ${report.failure}`);
  } else {
    lines.push('- none');
  }

  lines.push('', '## Target Root Git Status', '');
  if (report.targetRootDirtyEntries.length > 0) {
    lines.push(...report.targetRootDirtyEntries.map((entry) => `- \`${entry}\``));
  } else {
    lines.push('- clean or unavailable');
  }

  return `${lines.join('\n')}\n`;
}

async function writePromotionEvidence(evidenceDir, report) {
  const jsonPath = path.join(evidenceDir, 'public-github-source-promotion.json');
  const markdownPath = path.join(evidenceDir, 'public-github-source-promotion.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, buildPromotionMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}

async function runPublicGithubSourcePromotion(argv = process.argv.slice(2), deps = {}) {
  const parsed = parsePublicGithubSourcePromotionArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.helpRequested) {
    stdout.write(`${getPublicGithubSourcePromotionUsage()}\n`);
    return 'help';
  }

  await ensureEvidenceDir(parsed.evidenceDir);

  const observedTargetRemote = readGitRemote(parsed.targetRoot);
  const targetRootDirtyEntries = readGitStatusPorcelain(parsed.targetRoot) ?? [];
  if (
    observedTargetRemote &&
    observedTargetRemote !== EXPECTED_TARGET_REMOTE &&
    parsed.targetRoot === DEFAULT_TARGET_ROOT
  ) {
    const report = buildPromotionReport({
      recordedAt: new Date().toISOString(),
      status: 'failed',
      mode: parsed.check ? 'check' : 'write',
      targetRoot: parsed.targetRoot,
      observedTargetRemote,
      targetRootDirtyEntries,
      failure: `Target repo remote mismatch: expected ${EXPECTED_TARGET_REMOTE}, got ${observedTargetRemote}`
    });
    await writePromotionEvidence(parsed.evidenceDir, report);
    throw new Error(report.failure);
  }

  if (targetRootDirtyEntries.length > 0) {
    const report = buildPromotionReport({
      recordedAt: new Date().toISOString(),
      status: 'failed',
      mode: parsed.check ? 'check' : 'write',
      targetRoot: parsed.targetRoot,
      observedTargetRemote,
      targetRootDirtyEntries,
      failure:
        `Target root has uncommitted changes and cannot be used for governed public-source promotion: ${parsed.targetRoot}. ` +
        `Clean the repo first or bind the intended checkout explicitly with --target-root or ${DEFAULT_TARGET_ROOT_ENV}.`
    });
    await writePromotionEvidence(parsed.evidenceDir, report);
    throw new Error(report.failure);
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'vihs-public-source-'));
  try {
    const expectedRoot = path.join(tempRoot, 'expected');
    const writtenFiles = writePromotedTree(expectedRoot);
    const mode = parsed.check ? 'check' : 'write';

    if (parsed.check) {
      if (!fs.existsSync(parsed.targetRoot)) {
        const report = buildPromotionReport({
          recordedAt: new Date().toISOString(),
          status: 'failed',
          mode,
          targetRoot: parsed.targetRoot,
          observedTargetRemote,
          targetRootDirtyEntries,
          writtenFiles,
          failure: `Target root does not exist for check mode: ${parsed.targetRoot}`
        });
        await writePromotionEvidence(parsed.evidenceDir, report);
        throw new Error(report.failure);
      }

      const comparison = compareFileTrees(expectedRoot, parsed.targetRoot);
      const report = buildPromotionReport({
        recordedAt: new Date().toISOString(),
        status: comparison.clean ? 'passed' : 'failed',
        mode,
        targetRoot: parsed.targetRoot,
        observedTargetRemote,
        targetRootDirtyEntries,
        writtenFiles,
        comparison,
        failure: comparison.clean
          ? null
          : `Public GitHub source repo drift detected: ${comparison.missingFiles.length} missing, ${comparison.unexpectedFiles.length} unexpected, ${comparison.mismatchedFiles.length} mismatched.`
      });
      await writePromotionEvidence(parsed.evidenceDir, report);
      if (!comparison.clean) {
        throw new Error(report.failure);
      }
      stdout.write('[public-source] Public GitHub source repo matches the governed promotion output.\n');
      return 'pass';
    }

    writePromotedTree(parsed.targetRoot);
    const comparison = compareFileTrees(expectedRoot, parsed.targetRoot);
    const report = buildPromotionReport({
      recordedAt: new Date().toISOString(),
      status: comparison.clean ? 'passed' : 'failed',
      mode,
      targetRoot: parsed.targetRoot,
      observedTargetRemote,
      targetRootDirtyEntries,
      writtenFiles,
      comparison,
      failure: comparison.clean
        ? null
        : 'Promotion write completed, but the target root does not match the governed output.'
    });
    await writePromotionEvidence(parsed.evidenceDir, report);
    if (!comparison.clean) {
      throw new Error(report.failure);
    }
    stdout.write('[public-source] Promoted governed public GitHub source facade successfully.\n');
    return 'pass';
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    throw error;
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  runPublicGithubSourcePromotion()
    .then((result) => {
      if (result === 'help' || result === 'pass') {
        process.exitCode = 0;
        return;
      }
      process.exitCode = 1;
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  AUTHORITY_COPY_PATHS,
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_TARGET_ROOT,
  DEFAULT_TARGET_ROOT_ENV,
  EXPECTED_TARGET_REMOTE,
  MANAGED_ROOT_PATHS,
  PUBLIC_DESIGN_CONTRACT_TESTS,
  TEMPLATE_COPY_PATHS,
  buildPromotionReport,
  compareFileTrees,
  createPublicGithubSourcePromotionPlan,
  getPublicGithubSourcePromotionUsage,
  parsePublicGithubSourcePromotionArgs,
  readGitStatusPorcelain,
  renderPublicPackageManifest,
  runPublicGithubSourcePromotion,
  writePromotedTree
};
