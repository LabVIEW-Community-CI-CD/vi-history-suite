#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinnedVsce = require(path.join(__dirname, 'runPinnedVsce.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicationState = require(path.join(__dirname, 'releasePublicationState.js'));

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'vscode-marketplace-community-validation-preview-prep',
  'latest'
);
const DEFAULT_MARKETPLACE_ITEM = 'svelderrainruiz.vi-history-suite';
const DEFAULT_TRACEABILITY_MATRIX_PATH = 'docs/requirements/rtm.csv';
const PREP_RECEIPT_FILE_NAME = 'vscode-marketplace-community-validation-preview-prep.json';
const PREP_MARKDOWN_FILE_NAME = 'vscode-marketplace-community-validation-preview-prep.md';

function getUsage() {
  return [
    'Usage: node scripts/prepareMarketplaceCommunityValidationPreview.js [--evidence-dir <path>] [--marketplace-item <publisher.extension>] [--target-version <major.minor.patch>] [--package-path <path>] [--help]',
    '',
    'Prepare the governed VS Code Marketplace community-validation preview path without publishing.',
    'The command writes JSON and Markdown receipts that disclose Linux/Docker evidence, deferred Windows proof,',
    'selectable-but-unproven Windows/LabVIEW feature policy, distinct Marketplace version readiness, and pinned vsce command shapes.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    marketplaceItem: DEFAULT_MARKETPLACE_ITEM,
    targetVersion: null,
    packagePath: null
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

    if (argument === '--marketplace-item') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --marketplace-item');
      }
      parsed.marketplaceItem = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--target-version') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --target-version');
      }
      parsed.targetVersion = normalizeMarketplaceVersion(value);
      index += 1;
      continue;
    }

    if (argument === '--package-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --package-path');
      }
      parsed.packagePath = value.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function readJson(relativeOrAbsolutePath, fsApi = fs) {
  const targetPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);
  return JSON.parse(fsApi.readFileSync(targetPath, 'utf8'));
}

function tryReadJson(relativeOrAbsolutePath, fsApi = fs) {
  try {
    return readJson(relativeOrAbsolutePath, fsApi);
  } catch {
    return null;
  }
}

function normalizeMarketplaceVersion(version) {
  const normalized = String(version ?? '').trim();
  if (!/^\d+\.\d+\.\d+$/u.test(normalized)) {
    throw new Error(
      `Marketplace community preview versions must use major.minor.patch without prerelease tags: ${normalized || '<empty>'}`
    );
  }
  return normalized;
}

function compareMarketplaceVersions(left, right) {
  const leftParts = normalizeMarketplaceVersion(left).split('.').map(Number);
  const rightParts = normalizeMarketplaceVersion(right).split('.').map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }
  return 0;
}

function toRelativePath(targetPath) {
  if (!targetPath) {
    return null;
  }
  const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.join(repoRoot, targetPath);
  return path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/') || '.';
}

function pathLooksVersioned(packagePath, version) {
  return Boolean(packagePath && path.basename(packagePath).includes(version));
}

function buildPackagePath(options, state, targetVersion) {
  if (options.packagePath) {
    return options.packagePath;
  }
  const previewVsixPath = state.developPreview?.previewVsixPath ?? null;
  if (previewVsixPath && pathLooksVersioned(previewVsixPath, targetVersion)) {
    return previewVsixPath;
  }
  return `preview-evidence/vi-history-suite-${targetVersion}.vsix`;
}

function buildPlannedVsceCommands(packagePath) {
  const relativePackagePath = toRelativePath(packagePath);
  return {
    packageCommand: {
      command: 'node',
      args: [
        'scripts/runPinnedVsce.js',
        'package',
        '--pre-release',
        '--out',
        relativePackagePath
      ],
      display: `node scripts/runPinnedVsce.js package --pre-release --out ${relativePackagePath}`,
      pinnedPackage: pinnedVsce.VSCE_PACKAGE_SPEC
    },
    publishCommand: {
      command: 'node',
      args: [
        'scripts/runPinnedVsce.js',
        'publish',
        '--pre-release',
        '--packagePath',
        relativePackagePath,
        '--pat',
        '<redacted>'
      ],
      display:
        `node scripts/runPinnedVsce.js publish --pre-release --packagePath ${relativePackagePath} --pat <redacted>`,
      pinnedPackage: pinnedVsce.VSCE_PACKAGE_SPEC
    }
  };
}

function buildPhase(id, status, summary, details = {}) {
  return { id, status, summary, details };
}

function buildReadiness(currentMarketplaceVersion, targetVersion, packageVersion, packagePath) {
  let versionReadiness = 'ready-distinct-higher-marketplace-version';
  if (currentMarketplaceVersion) {
    const comparison = compareMarketplaceVersions(targetVersion, currentMarketplaceVersion);
    if (comparison === 0) {
      versionReadiness = 'blocked-until-distinct-marketplace-version';
    } else if (comparison < 0) {
      versionReadiness = 'blocked-until-higher-marketplace-version';
    }
  }

  const packageManifestReadiness =
    packageVersion === targetVersion
      ? 'ready-target-version-in-package-manifest'
      : 'blocked-until-package-manifest-target-version';
  const packageArtifactReadiness = pathLooksVersioned(packagePath, targetVersion)
    ? 'ready-target-versioned-vsix-path'
    : 'blocked-until-target-versioned-vsix-path';
  const blockers = [
    versionReadiness.startsWith('blocked') ? versionReadiness : null,
    packageManifestReadiness.startsWith('blocked') ? packageManifestReadiness : null,
    packageArtifactReadiness.startsWith('blocked') ? packageArtifactReadiness : null
  ].filter(Boolean);

  return {
    versionReadiness,
    packageManifestReadiness,
    packageArtifactReadiness,
    publishReadiness:
      blockers.length === 0
        ? 'prepared-awaiting-user-says-publish-it-now'
        : 'prepared-with-blockers-before-user-says-publish-it-now',
    blockers
  };
}

function buildPrepReport(options, deps = {}) {
  const fsApi = deps.fs ?? fs;
  const state = publicationState.resolvePublicationState(fsApi);
  const ledger = tryReadJson('docs/product/vscode-marketplace-publication-ledger.json', fsApi) ?? {};
  const packageManifest = tryReadJson('package.json', fsApi) ?? {};
  const targetVersion = normalizeMarketplaceVersion(
    options.targetVersion ??
      state.marketplaceCommunityValidationPreview?.targetVersion ??
      state.activeCandidate?.packageVersion ??
      state.authority?.packageVersion ??
      packageManifest.version
  );
  const currentMarketplaceVersion =
    ledger.currentPublishedVersion ??
    state.marketplace?.currentPublishedVersion ??
    null;
  const publishTrigger =
    state.marketplaceCommunityValidationPreview?.publishTrigger ??
    'blocked-until-user-says-publish-it-now';
  const packagePath = buildPackagePath(options, state, targetVersion);
  const plannedCommands = buildPlannedVsceCommands(packagePath);
  const readiness = buildReadiness(
    currentMarketplaceVersion,
    targetVersion,
    packageManifest.version,
    packagePath
  );
  if (readiness.blockers.length === 0 && publishTrigger === 'user-said-publish-it-now') {
    readiness.publishReadiness = 'prepared-user-trigger-present';
  }
  const activePreviewClaim =
    state.developPreview?.classification ?? 'linux-docker-validated-preview';
  const linuxDockerEvidenceRetained = activePreviewClaim.includes('linux-docker');
  const windowsInstalledUserProofState =
    state.developPreview?.windowsInstalledUserProofState ?? 'community-deferred';
  const windowsInstalledUserProofAdmitted = String(windowsInstalledUserProofState).startsWith(
    'admitted'
  );
  const proofDisclosureSurfaces = [
    'README.md',
    'docs/product/release-publication-state.md',
    'docs/product/vscode-marketplace-publication-ledger.md',
    'docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.md',
    DEFAULT_TRACEABILITY_MATRIX_PATH,
    'docs/information-for-users/command-reference.md'
  ];
  const phases = [
    buildPhase(
      'linux-docker-preview-evidence',
      linuxDockerEvidenceRetained ? 'retained' : 'blocked',
      linuxDockerEvidenceRetained
        ? 'The retained develop preview claim includes Linux/Docker validated preview evidence.'
        : `The active develop preview claim is ${activePreviewClaim}, not Linux/Docker validated preview.`,
      {
        retainedPacketPath: state.developPreview?.retainedPacketPath ?? null,
        retainedPacketJsonPath: state.developPreview?.retainedPacketJsonPath ?? null,
        previewEvidenceCommit: state.developPreview?.previewEvidenceCommit ?? null,
        previewVsixPath: state.developPreview?.previewVsixPath ?? null,
        previewVsixSha256: state.developPreview?.previewVsixSha256 ?? null
      }
    ),
    buildPhase(
      'windows-installed-user-proof',
      windowsInstalledUserProofAdmitted ? 'retained' : 'deferred',
      windowsInstalledUserProofAdmitted
        ? `Windows/LabVIEW installed-user proof is ${windowsInstalledUserProofState}.`
        : 'Windows/LabVIEW installed-user proof remains deferred and is not claimed by the community-validation preview.',
      {
        handoffPath: 'docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.md',
        proofState: windowsInstalledUserProofState
      }
    ),
    buildPhase(
      'feature-selectability-with-proof-disclosure',
      'retained',
      'Windows/LabVIEW provider, year, and bitness choices may stay selectable when the UI/CLI discloses proof status through validation output and traceability docs.',
      {
        traceabilityMatrixPath: DEFAULT_TRACEABILITY_MATRIX_PATH,
        userValidationCommand: 'vihs --validate'
      }
    ),
    buildPhase(
      'marketplace-version-readiness',
      readiness.versionReadiness.startsWith('blocked') ? 'blocked' : 'ready',
      readiness.versionReadiness.startsWith('blocked')
        ? `Target preview version ${targetVersion} cannot reuse or go below current Marketplace version ${currentMarketplaceVersion ?? 'unknown'}.`
        : `Target preview version ${targetVersion} is distinct from current Marketplace version ${currentMarketplaceVersion ?? 'unknown'}.`,
      {
        currentMarketplaceVersion,
        targetVersion
      }
    ),
    buildPhase(
      'package-version-readiness',
      readiness.packageManifestReadiness.startsWith('blocked') ? 'blocked' : 'ready',
      readiness.packageManifestReadiness.startsWith('blocked')
        ? `package.json currently declares ${packageManifest.version ?? 'unknown'}, so it must be updated before packaging ${targetVersion}.`
        : `package.json already declares target version ${targetVersion}.`,
      {
        packageJsonVersion: packageManifest.version ?? null,
        targetVersion
      }
    ),
    buildPhase(
      'pinned-vsce-pre-release-command-shape',
      'retained',
      'The future package and publish acts use the pinned vsce helper with the Marketplace pre-release flag and a redacted PAT placeholder.',
      {
        plannedPackageCommand: plannedCommands.packageCommand.display,
        plannedPublishCommand: plannedCommands.publishCommand.display,
        pinnedPackage: pinnedVsce.VSCE_PACKAGE_SPEC
      }
    ),
    buildPhase(
      'no-mutation-boundary',
      'retained',
      'This prep surface performs no public GitHub mutation and no VS Code Marketplace mutation.',
      {
        publicGitHubMutationAttempted: false,
        marketplaceMutationAttempted: false,
        publishTrigger
      }
    )
  ];

  return {
    schema: 'vi-history-suite/vscode-marketplace-community-validation-preview-prep@v1',
    recordedAt: new Date().toISOString(),
    repoRoot,
    status: readiness.blockers.length === 0 ? 'prepared' : 'prepared-with-blockers',
    productionMutationAttempted: false,
    publicGitHubMutationAttempted: false,
    marketplaceMutationAttempted: false,
    publicationClaim: 'community-validation-preview',
    activePreviewClaim,
    targetVersion,
    currentMarketplaceVersion,
    marketplace: {
      marketplaceItem: options.marketplaceItem,
      listingUrl:
        ledger.listingUrl ??
        `https://marketplace.visualstudio.com/items?itemName=${options.marketplaceItem}`,
      currentPublishedVersion: currentMarketplaceVersion,
      preferredMode: 'pre-release',
      targetVersion,
      publishTrigger
    },
    package: {
      packageJsonVersion: packageManifest.version ?? null,
      packagePath: toRelativePath(packagePath),
      packageVersionChangeRequired: packageManifest.version !== targetVersion,
      packageRebuildRequired: true
    },
    evidence: {
      developPreview: {
        retainedPacketPath: state.developPreview?.retainedPacketPath ?? null,
        retainedPacketJsonPath: state.developPreview?.retainedPacketJsonPath ?? null,
        previewEvidenceCommit: state.developPreview?.previewEvidenceCommit ?? null,
        packetEvidencePipelineId: state.developPreview?.packetEvidencePipelineId ?? null,
        packetMergeTrackingPolicy: state.developPreview?.packetMergeTrackingPolicy ?? null,
        retainedPacketMergeCommit: state.developPreview?.retainedPacketMergeCommit ?? null,
        retainedPacketMergePipelineId: state.developPreview?.retainedPacketMergePipelineId ?? null,
        previewVsixPath: state.developPreview?.previewVsixPath ?? null,
        previewVsixSha256: state.developPreview?.previewVsixSha256 ?? null
      },
      traceabilityMatrixPath: DEFAULT_TRACEABILITY_MATRIX_PATH,
      proofDisclosureSurfaces
    },
    windowsInstalledUserProof: {
      state: windowsInstalledUserProofState,
      claimMade: windowsInstalledUserProofAdmitted,
      handoffPath: 'docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.md'
    },
    windowsLabviewFeatures: {
      selectionPolicy: 'user-selectable-with-proof-status-disclosure',
      proofStatusDisclosure: [
        'vihs --validate output',
        DEFAULT_TRACEABILITY_MATRIX_PATH,
        'docs/product/release-publication-state.md'
      ],
      unsupportedOrBlockedRuntimeBehavior: 'fail-closed-with-visible-next-step-guidance'
    },
    vsce: {
      pinnedPackage: pinnedVsce.VSCE_PACKAGE_SPEC,
      plannedPackageCommand: plannedCommands.packageCommand,
      plannedPublishCommand: plannedCommands.publishCommand
    },
    readiness,
    nextAction:
      readiness.blockers.length > 0
        ? 'resolve-version-and-package-blockers-before-user-says-publish-it-now'
        : publishTrigger === 'user-said-publish-it-now'
          ? 'publish-marketplace-community-validation-preview'
          : 'await-user-says-publish-it-now',
    phases
  };
}

function buildMarkdown(report) {
  return [
    '# VS Code Marketplace Community-Validation Preview Prep',
    '',
    `- Recorded: ${report.recordedAt}`,
    `- Status: ${report.status}`,
    `- Publication claim: ${report.publicationClaim}`,
    `- Active preview claim: ${report.activePreviewClaim}`,
    `- Marketplace item: ${report.marketplace.marketplaceItem}`,
    `- Current Marketplace version: ${report.currentMarketplaceVersion ?? 'unknown'}`,
    `- Target preview version: ${report.targetVersion}`,
    `- Publish trigger: ${report.marketplace.publishTrigger}`,
    `- Public GitHub mutation attempted: ${report.publicGitHubMutationAttempted}`,
    `- Marketplace mutation attempted: ${report.marketplaceMutationAttempted}`,
    `- Windows installed-user proof: ${report.windowsInstalledUserProof.state}`,
    `- Windows/LabVIEW selection policy: ${report.windowsLabviewFeatures.selectionPolicy}`,
    `- Traceability matrix: ${report.evidence.traceabilityMatrixPath}`,
    `- Planned package command: \`${report.vsce.plannedPackageCommand.display}\``,
    `- Planned publish command: \`${report.vsce.plannedPublishCommand.display}\``,
    '',
    '## Readiness',
    '',
    `- Version readiness: ${report.readiness.versionReadiness}`,
    `- Package manifest readiness: ${report.readiness.packageManifestReadiness}`,
    `- Package artifact readiness: ${report.readiness.packageArtifactReadiness}`,
    `- Publish readiness: ${report.readiness.publishReadiness}`,
    `- Blockers: ${report.readiness.blockers.length > 0 ? report.readiness.blockers.join('; ') : 'none'}`,
    '',
    '## Phases',
    '',
    '| Phase | Status | Summary |',
    '| --- | --- | --- |',
    ...report.phases.map((phase) => `| ${phase.id} | ${phase.status} | ${phase.summary} |`),
    '',
    'No public GitHub or VS Code Marketplace publication was attempted by this prep surface.'
  ].join('\n');
}

async function writeReport(report, evidenceDir) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, PREP_RECEIPT_FILE_NAME);
  const markdownPath = path.join(evidenceDir, PREP_MARKDOWN_FILE_NAME);
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildMarkdown(report)}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

async function runPrep(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    return {
      outcome: 'help',
      usage: getUsage()
    };
  }

  const report = buildPrepReport(options, deps);
  const written = await writeReport(report, options.evidenceDir);
  return {
    outcome: report.status,
    report: {
      ...report,
      receiptPaths: {
        json: toRelativePath(written.jsonPath),
        markdown: toRelativePath(written.markdownPath)
      }
    }
  };
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    const result = await runPrep(argv, deps);
    if (result.outcome === 'help') {
      stdout.write(`${result.usage}\n`);
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
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_MARKETPLACE_ITEM,
  DEFAULT_TRACEABILITY_MATRIX_PATH,
  PREP_MARKDOWN_FILE_NAME,
  PREP_RECEIPT_FILE_NAME,
  buildMarkdown,
  buildPlannedVsceCommands,
  buildPrepReport,
  buildReadiness,
  compareMarketplaceVersions,
  getUsage,
  normalizeMarketplaceVersion,
  parseArgs,
  readJson,
  runPrep
};
