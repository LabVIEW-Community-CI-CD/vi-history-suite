#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const PHASES = ['assess', 'rehearse', 'repair'];
const DEFAULT_EVIDENCE_ROOT = path.join(repoRoot, '.cache', 'software-factory-orchestrator', 'latest');
const DEFAULT_EVIDENCE_DIR = DEFAULT_EVIDENCE_ROOT;
const DEFAULT_TRANSACTION_RECEIPT_PATH =
  '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json';
const DEFAULT_PHASE_EVIDENCE_DIRS = {
  assess: DEFAULT_EVIDENCE_ROOT,
  rehearse: path.join(DEFAULT_EVIDENCE_ROOT, 'rehearse'),
  repair: path.join(DEFAULT_EVIDENCE_ROOT, 'repair')
};
const DEFAULT_PHASE_RECEIPT_PATHS = {
  assess: '.cache/software-factory-orchestrator/latest/software-factory-state.json',
  rehearse: '.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json',
  repair: '.cache/software-factory-orchestrator/latest/repair/software-factory-state.json'
};

function getDefaultEvidenceDirForPhase(phase) {
  return DEFAULT_PHASE_EVIDENCE_DIRS[phase] ?? DEFAULT_EVIDENCE_DIR;
}

function getUsage() {
  return [
    'Usage: node scripts/runSoftwareFactoryOrchestrator.js [--phase <assess|rehearse|repair>] [--evidence-dir <path>] [--help]',
    '',
    'Assess, rehearse, or retain the non-mutating repair contract for the vi-history-suite software-factory control plane.',
    '',
    'All admitted phases in this slice are non-production only. They do not publish to GitHub, publish to VS Code Marketplace,',
    'or mutate any production surface.'
  ].join('\n');
}

function assertKnownPhase(phase) {
  if (!PHASES.includes(phase)) {
    throw new Error(`Unknown phase: ${phase}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    phase: 'assess',
    evidenceDir: getDefaultEvidenceDirForPhase('assess')
  };
  let evidenceDirExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--phase') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --phase');
      }
      assertKnownPhase(value);
      parsed.phase = value;
      if (!evidenceDirExplicit) {
        parsed.evidenceDir = getDefaultEvidenceDirForPhase(value);
      }
      index += 1;
      continue;
    }

    if (argument === '--evidence-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-dir');
      }
      evidenceDirExplicit = true;
      parsed.evidenceDir = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function readJson(relativePath, fsApi = fs) {
  return JSON.parse(fsApi.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function tryReadJson(relativePath, fsApi = fs) {
  try {
    return readJson(relativePath, fsApi);
  } catch {
    return null;
  }
}

function runGit(args, cwd = repoRoot, spawnImpl = spawnSync) {
  const result = spawnImpl('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim()
  };
}

function resolveCurrentBranch(spawnImpl = spawnSync) {
  const result = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot, spawnImpl);
  if (result.status !== 0 || !result.stdout) {
    return 'unknown';
  }

  return result.stdout;
}

function toRelativeReportPath(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath).replaceAll(path.sep, '/');
  return relativePath.length > 0 ? relativePath : '.';
}

function summarizeRecoveryBlocker(facts) {
  return facts.blockerCode
    ? `${facts.exactLine}: ${facts.blockerCode}`
    : `No retained production blocker remains against ${facts.exactLine}.`;
}

function determineStatus(phases) {
  return phases.some((phase) => phase.status === 'blocked') ? 'blocked' : 'pass';
}

function buildCommonSections(facts, phase, options = {}) {
  const currentPhaseReceiptPath =
    options.currentPhaseReceiptPath ?? DEFAULT_PHASE_RECEIPT_PATHS[phase];
  const admittedPhases = ['assess', 'rehearse', 'repair'];
  const marketplacePhaseStatus = facts.publicGitHubReleasePublished === true ? 'ready' : 'blocked';

  return {
    schema: 'vi-history-suite/software-factory-orchestrator@v2',
    recordedAt: facts.recordedAt,
    repoRoot: facts.repoRoot,
    currentBranch: facts.currentBranch,
    contract: {
      currentPhase: phase,
      supportedPhases: admittedPhases,
      plannedPhases: ['publish', 'verify'],
      assessOnly: false,
      nonProductionOnly: true,
      productionMutationAllowed: false,
      activeFeatureBranch: facts.activeFeatureBranch
    },
    semverFreeze: {
      status: facts.semverFrozen ? 'frozen' : 'open',
      openingNewSemverAllowed: !facts.semverFrozen,
      soleProductionRecoveryTarget: facts.exactLine,
      rationale:
        facts.semverFreezeRationale ??
        `The current exact line ${facts.exactLine} remains the sole production recovery case until the public GitHub exact transaction closes.`
    },
    authorityBoundary: {
      authorityRepoRoot: facts.repoRoot,
      authoritySystem: 'gitlab-authority',
      integrationBranch: facts.integrationBranch,
      exactReleaseLineBranch: facts.exactReleaseLineBranch,
      releaseBranchFamily: facts.releaseBranchFamily,
      hotfixBranchFamily: facts.hotfixBranchFamily,
      featureBranchFamily: facts.featureBranchFamily,
      currentExactLine: facts.exactLine,
      currentMainPackageLine: facts.packageLine,
      currentDevelopPackageLine: facts.developPackageLine
    },
    stagingBoundary: {
      branchModel: 'gitflow',
      activeFeatureBranch: facts.activeFeatureBranch,
      requiredChecks: facts.requiredChecks,
      preTagPublicExactProofPackageScript: facts.preTagPublicExactProofPackageScript,
      publicGitHubExactTransactionPackageScript: facts.publicGitHubExactTransactionPackageScript,
      publicGitHubExactTransactionReceiptPath: facts.publicGitHubExactTransactionReceiptPath
    },
    productionBoundary: {
      publicGitHubMainCommit: facts.publicGitHubMainCommit,
      publicGitHubTag: facts.publicGitHubTag,
      publicGitHubDraftReleaseId: facts.publicGitHubDraftReleaseId,
      publicGitHubDraftReleaseUrl: facts.draftReleaseUrl,
      publicGitHubLastPublishedRelease: facts.publicGitHubLastPublishedRelease,
      publicGitHubPublishabilityBlockerCode: facts.blockerCode,
      vscodeMarketplaceItem: facts.marketplaceItem,
      vscodeMarketplaceVersion: facts.marketplaceVersion
    },
    trustModel: {
      authoritySurfaces: ['GitLab authority repo', 'protected GitLab branches', 'repo-owned receipts'],
      productionSurfaces: ['public GitHub main/tag/release', 'VS Code Marketplace'],
      operatorSurfaces: ['Windows operator host', 'self-hosted Windows runner', 'self-hosted Linux assurance runner'],
      secretClasses: ['GitLab project access token', 'GitHub token', 'VS Code Marketplace PAT'],
      trustRule:
        'Production mutation is forbidden outside the repo-owned orchestrator contract; local operators, runners, and token locators remain governed prerequisites rather than ambient trust.'
    },
    environmentBaseline: {
      operatorHost: 'Windows host with standard installs only',
      standardToolchains: ['Git for Windows', 'Node.js 22 LTS', 'Python 3.12 x64'],
      linuxAssuranceDistro: 'Ubuntu-24.04',
      runnerSurface: 'repo-owned governed runner asset pack plus startup receipts and doctor/assert wrappers',
      standardsSkill: 'repo-standards-review preflight must pass before governed requirements/control-surface edits'
    },
    rehearsalPolicy: {
      policy: 'production-is-not-the-first-proof-surface',
      admittedNonProductionPhases: admittedPhases,
      requiredSurfaces: [
        facts.preTagPublicExactProofPackageScript,
        facts.publicGitHubExactTransactionPackageScript,
        'npm run docs:gate:core',
        'npm run design:gate'
      ],
      rule:
        'Future production publication acts must stay blocked until the factory control plane proves the recovery case through repo-owned assessment, non-production rehearsal, and non-production repair-contract phases before later publish/verify phases are admitted.'
    },
    incidentClasses: [
      'production-partial-public-state',
      'production-mutation-policy-violation',
      'runner-or-host-readiness-drift',
      'credential-or-capability-boundary-missing',
      'externally-blocked-publication',
      'externally-impossible-publication'
    ],
    currentIncident: {
      id: `FACTORY-INCIDENT-${facts.exactLine}`,
      class: facts.blockerCode ? 'production-partial-public-state' : 'none',
      status: facts.blockerCode ? 'blocked' : 'pass',
      blockerCode: facts.blockerCode,
      blockerSummary: facts.blockerSummary ?? 'No retained blocker summary.'
    },
    recoveryRules: {
      repairInPlaceRequired: facts.repairInPlaceRequired,
      repairInPlaceAllowed: facts.repairInPlaceAllowed,
      noBumpRule: facts.semverFrozen,
      receiptDrivenRecovery: true,
      publicGitHubExactTransactionReceiptPath: facts.publicGitHubExactTransactionReceiptPath,
      nextAllowedAction: facts.nextAllowedAction
    },
    approvalModel: {
      assess: 'repo-owned automatic',
      rehearse: 'repo-owned automatic non-production phase',
      repair: 'repo-owned automatic non-production repair-contract phase',
      publishPublicGitHubRelease: 'explicit later production approval required',
      publishMarketplace: 'explicit later production approval required'
    },
    receiptContract: {
      packageScripts: {
        assess: 'npm run software:factory:assess',
        rehearse: 'npm run software:factory:rehearse',
        repair: 'npm run software:factory:repair'
      },
      receiptPaths: {
        assess: DEFAULT_PHASE_RECEIPT_PATHS.assess,
        rehearse: DEFAULT_PHASE_RECEIPT_PATHS.rehearse,
        repair: DEFAULT_PHASE_RECEIPT_PATHS.repair
      },
      currentPhaseReceiptPath
    },
    marketplacePhaseStatus
  };
}

function buildPhaseSummary(phase, facts) {
  const releaseId = facts.publicGitHubDraftReleaseId ?? 'unknown';

  if (phase === 'assess') {
    return {
      currentPhaseLabel: 'assess',
      summary:
        `Assessment retains the frozen ${facts.exactLine} production recovery case and fails closed on ${facts.blockerCode ?? 'no-blocker'}.`
    };
  }

  if (phase === 'rehearse') {
    return {
      currentPhaseLabel: 'rehearse',
      summary:
        `Non-production rehearsal retains the in-place ${facts.exactLine} repair candidate around draft release ${releaseId} without admitting any production mutation.`
    };
  }

  return {
    currentPhaseLabel: 'repair',
    summary:
      `The non-production repair contract retains the deferred in-place ${facts.exactLine} recovery plan for draft release ${releaseId} without admitting any write action.`
  };
}

function createAssessPhases(facts, marketplacePhaseStatus) {
  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and the active software-factory branch ${facts.activeFeatureBranch}.`
    },
    {
      id: 'production-mutation-policy',
      status: 'pass',
      summary: 'The software-factory control plane now admits only non-production assess, rehearse, and repair-contract phases; GitHub release and Marketplace publication remain forbidden.'
    },
    {
      id: 'recovery-case',
      status: facts.blockerCode ? 'blocked' : 'pass',
      summary: facts.blockerCode
        ? `Recovery remains frozen on ${facts.exactLine}: ${facts.blockerCode}.`
        : `No retained production blocker remains against ${facts.exactLine}.`
    },
    {
      id: 'marketplace-boundary',
      status: marketplacePhaseStatus,
      summary: marketplacePhaseStatus === 'blocked'
        ? `Marketplace stays blocked at ${facts.marketplaceVersion} until the public GitHub exact release closes cleanly.`
        : 'Marketplace may proceed only after the public GitHub exact release is fully closed.'
    }
  ];
}

function createRehearsePhases(facts, marketplacePhaseStatus) {
  const rehearsalReady =
    facts.repairInPlaceRequired &&
    facts.repairInPlaceAllowed &&
    facts.releaseAssetsRetainedAgainstManifest &&
    facts.draftPublishabilityByIdStatusCode === 200 &&
    facts.draftPublishabilityTagMatchesAuthority === true;

  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and the active software-factory branch ${facts.activeFeatureBranch}.`
    },
    {
      id: 'rehearsal-readiness',
      status: rehearsalReady ? 'pass' : 'blocked',
      summary: rehearsalReady
        ? `Non-production rehearsal proves the retained ${facts.exactLine} draft can still be read by id, still matches the authority tag, and still carries the exact manifest-backed assets.`
        : `Non-production rehearsal cannot yet prove the retained ${facts.exactLine} draft has the manifest-backed by-id prerequisites needed for an in-place repair candidate.`
    },
    {
      id: 'rehearsal-publishability-boundary',
      status: facts.blockerCode ? 'blocked' : 'pass',
      summary: facts.blockerCode
        ? `Rehearsal still fails closed on ${facts.blockerCode}; safe in-place publish transition remains unproven.`
        : `Rehearsal proves the retained recovery case can move toward a later repair/publish boundary.`
    },
    {
      id: 'marketplace-boundary',
      status: marketplacePhaseStatus,
      summary: marketplacePhaseStatus === 'blocked'
        ? `Marketplace stays blocked at ${facts.marketplaceVersion} until the public GitHub exact release closes cleanly.`
        : 'Marketplace may proceed only after the public GitHub exact release is fully closed.'
    }
  ];
}

function createRepairPhases(facts, marketplacePhaseStatus) {
  const repairContractReady = facts.repairInPlaceRequired && facts.repairInPlaceAllowed;

  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and the active software-factory branch ${facts.activeFeatureBranch}.`
    },
    {
      id: 'repair-contract',
      status: repairContractReady ? 'pass' : 'blocked',
      summary: repairContractReady
        ? `The non-production repair contract retains ${facts.exactLine} as an in-place recovery target against draft release ${facts.publicGitHubDraftReleaseId}.`
        : `The software-factory control plane cannot retain a non-production repair contract until the recovery case is explicitly classified as repair-in-place.`
    },
    {
      id: 'repair-write-boundary',
      status: facts.blockerCode ? 'blocked' : 'pass',
      summary: facts.blockerCode
        ? `Repair remains non-mutating and blocked by ${facts.blockerCode}; later publish/verify phases are not yet admitted.`
        : 'Repair remains non-mutating, but the current recovery case is ready for later explicit publish/verify approval.'
    },
    {
      id: 'marketplace-boundary',
      status: marketplacePhaseStatus,
      summary: marketplacePhaseStatus === 'blocked'
        ? `Marketplace stays blocked at ${facts.marketplaceVersion} until the public GitHub exact release closes cleanly.`
        : 'Marketplace may proceed only after the public GitHub exact release is fully closed.'
    }
  ];
}

function assessFactoryState(facts) {
  const common = buildCommonSections(facts, 'assess');
  const phases = createAssessPhases(facts, common.marketplacePhaseStatus);
  const phaseSummary = buildPhaseSummary('assess', facts);

  return {
    ...common,
    status: determineStatus(phases),
    phaseSummary,
    phases
  };
}

function rehearseFactoryState(facts) {
  const common = buildCommonSections(facts, 'rehearse');
  const phases = createRehearsePhases(facts, common.marketplacePhaseStatus);
  const rehearsalReady = phases.find((phase) => phase.id === 'rehearsal-readiness')?.status === 'pass';
  const phaseSummary = buildPhaseSummary('rehearse', facts);

  return {
    ...common,
    status: determineStatus(phases),
    phaseSummary,
    rehearsalContract: {
      status: rehearsalReady ? 'pass' : 'blocked',
      nonMutating: true,
      packageScript: 'npm run software:factory:rehearse',
      receiptPath: DEFAULT_PHASE_RECEIPT_PATHS.rehearse,
      transactionReceiptPath: facts.publicGitHubExactTransactionReceiptPath,
      targetTag: facts.exactLine,
      targetDraftReleaseId: facts.publicGitHubDraftReleaseId,
      targetDraftReleaseUrl: facts.draftReleaseUrl,
      authorityReleaseManifestPath: facts.authorityReleaseManifestPath,
      exactAssetsRetainedAgainstManifest: facts.releaseAssetsRetainedAgainstManifest,
      draftReleaseReadableById: facts.draftPublishabilityByIdStatusCode === 200,
      draftReleaseTagMatchesAuthority: facts.draftPublishabilityTagMatchesAuthority,
      immutableReleasesEnabled: facts.immutableReleasesEnabled,
      safePublishTransitionProven: facts.safeToAttemptRepairPublish,
      nextAllowedAction: facts.nextAllowedAction
    },
    phases
  };
}

function repairFactoryState(facts) {
  const common = buildCommonSections(facts, 'repair');
  const phases = createRepairPhases(facts, common.marketplacePhaseStatus);
  const repairContractReady = phases.find((phase) => phase.id === 'repair-contract')?.status === 'pass';
  const phaseSummary = buildPhaseSummary('repair', facts);

  return {
    ...common,
    status: determineStatus(phases),
    phaseSummary,
    repairContract: {
      status: repairContractReady ? 'pass' : 'blocked',
      nonMutating: true,
      mutationPermitted: false,
      packageScript: 'npm run software:factory:repair',
      receiptPath: DEFAULT_PHASE_RECEIPT_PATHS.repair,
      targetMode: 'repair-in-place',
      targetTag: facts.exactLine,
      targetDraftReleaseId: facts.publicGitHubDraftReleaseId,
      targetDraftReleaseUrl: facts.draftReleaseUrl,
      authorityReleaseManifestPath: facts.authorityReleaseManifestPath,
      exactAssetsRetainedAgainstManifest: facts.releaseAssetsRetainedAgainstManifest,
      draftReleaseReadableById: facts.draftPublishabilityByIdStatusCode === 200,
      draftReleaseTagMatchesAuthority: facts.draftPublishabilityTagMatchesAuthority,
      safePublishTransitionProven: facts.safeToAttemptRepairPublish,
      currentBlockerCode: facts.blockerCode,
      nextAllowedAction: facts.nextAllowedAction,
      deferredWriteActions: [
        'publish-existing-github-draft-release-in-place',
        'verify-public-github-release-publication',
        'verify-marketplace-remains-blocked-until-github-release-closes',
        'publish-vscode-marketplace-v1.3.6-after-github-release-verification'
      ],
      rule:
        'This repair contract remains non-mutating; later publish and verify phases still require separate explicit production approval after safe publishability is proven.'
    },
    phases
  };
}

function buildPhaseReport(facts, phase) {
  if (phase === 'assess') {
    return assessFactoryState(facts);
  }

  if (phase === 'rehearse') {
    return rehearseFactoryState(facts);
  }

  return repairFactoryState(facts);
}

function buildMarkdown(report) {
  const phaseLines = report.phases
    .map((phase) => `- ${phase.id}: \`${phase.status}\` - ${phase.summary}`)
    .join('\n');
  const receiptLines = Object.entries(report.receiptContract.receiptPaths)
    .map(([phase, receiptPath]) => `- ${phase}: \`${receiptPath}\``)
    .join('\n');
  const extraSections = [];

  if (report.rehearsalContract) {
    extraSections.push(
      '## Rehearsal Contract',
      '',
      `- Status: \`${report.rehearsalContract.status}\``,
      `- Package script: \`${report.rehearsalContract.packageScript}\``,
      `- Receipt path: \`${report.rehearsalContract.receiptPath}\``,
      `- Target draft release: \`${report.rehearsalContract.targetDraftReleaseId}\``,
      `- Draft readable by id: \`${report.rehearsalContract.draftReleaseReadableById}\``,
      `- Draft matches authority tag: \`${report.rehearsalContract.draftReleaseTagMatchesAuthority}\``,
      `- Exact assets retained against manifest: \`${report.rehearsalContract.exactAssetsRetainedAgainstManifest}\``,
      `- Safe publish transition proven: \`${report.rehearsalContract.safePublishTransitionProven}\``,
      ''
    );
  }

  if (report.repairContract) {
    extraSections.push(
      '## Repair Contract',
      '',
      `- Status: \`${report.repairContract.status}\``,
      `- Package script: \`${report.repairContract.packageScript}\``,
      `- Receipt path: \`${report.repairContract.receiptPath}\``,
      `- Target mode: \`${report.repairContract.targetMode}\``,
      `- Target draft release: \`${report.repairContract.targetDraftReleaseId}\``,
      `- Mutation permitted: \`${report.repairContract.mutationPermitted}\``,
      `- Current blocker: \`${report.repairContract.currentBlockerCode ?? 'none'}\``,
      `- Deferred write actions: ${report.repairContract.deferredWriteActions.join(', ')}`,
      ''
    );
  }

  return [
    '# Software Factory Orchestrator Receipt',
    '',
    `- Recorded at: \`${report.recordedAt}\``,
    `- Status: \`${report.status}\``,
    `- Current branch: \`${report.currentBranch}\``,
    `- Current phase: \`${report.contract.currentPhase}\``,
    `- Phase summary: ${report.phaseSummary.summary}`,
    `- Supported phases: \`${report.contract.supportedPhases.join(', ')}\``,
    `- Planned phases: \`${report.contract.plannedPhases.join(', ')}\``,
    `- Non-production only: \`${report.contract.nonProductionOnly}\``,
    `- Production mutation allowed: \`${report.contract.productionMutationAllowed}\``,
    `- Sole production recovery target: \`${report.semverFreeze.soleProductionRecoveryTarget}\``,
    `- SemVer freeze: \`${report.semverFreeze.status}\``,
    `- Active software-factory branch: \`${report.contract.activeFeatureBranch}\``,
    '',
    '## Boundaries',
    '',
    `- Authority: GitLab \`${report.authorityBoundary.integrationBranch}\` -> \`${report.authorityBoundary.exactReleaseLineBranch}\` with exact line \`${report.authorityBoundary.currentExactLine}\``,
    `- Staging: \`${report.stagingBoundary.branchModel}\` through \`${report.authorityBoundary.integrationBranch}\`, \`${report.authorityBoundary.releaseBranchFamily}\`, and \`${report.authorityBoundary.hotfixBranchFamily}\``,
    `- Production: public GitHub \`${report.productionBoundary.publicGitHubMainCommit}\` / tag \`${report.productionBoundary.publicGitHubTag}\`, Marketplace \`${report.productionBoundary.vscodeMarketplaceVersion}\``,
    `- Recovery: blocker \`${report.currentIncident.blockerCode ?? 'none'}\` with next action \`${report.recoveryRules.nextAllowedAction}\``,
    '',
    '## Mutation Policy',
    '',
    '- This contract admits only non-production assess, rehearse, and repair phases.',
    '- No GitHub release publication, Marketplace publication, or other production mutation is permitted in this slice.',
    '- Production publish phases require later explicit approval after the frozen recovery case is closed.',
    '',
    '## Trust Model',
    '',
    `- Authority surfaces: ${report.trustModel.authoritySurfaces.join(', ')}`,
    `- Production surfaces: ${report.trustModel.productionSurfaces.join(', ')}`,
    `- Operator surfaces: ${report.trustModel.operatorSurfaces.join(', ')}`,
    `- Secret classes: ${report.trustModel.secretClasses.join(', ')}`,
    '',
    '## Environment Baseline',
    '',
    `- Operator host: ${report.environmentBaseline.operatorHost}`,
    `- Standard toolchains: ${report.environmentBaseline.standardToolchains.join(', ')}`,
    `- Linux assurance distro: ${report.environmentBaseline.linuxAssuranceDistro}`,
    `- Standards skill gate: ${report.environmentBaseline.standardsSkill}`,
    '',
    '## Receipt Contract',
    '',
    `- assess script: \`${report.receiptContract.packageScripts.assess}\``,
    `- rehearse script: \`${report.receiptContract.packageScripts.rehearse}\``,
    `- repair script: \`${report.receiptContract.packageScripts.repair}\``,
    receiptLines,
    '',
    '## Phases',
    '',
    phaseLines,
    '',
    ...extraSections
  ].join('\n');
}

async function ensureEvidenceDir(targetDir) {
  await fsp.rm(targetDir, { recursive: true, force: true });
  await fsp.mkdir(targetDir, { recursive: true });
}

async function writeReport(report, evidenceDir) {
  await ensureEvidenceDir(evidenceDir);
  const jsonPath = path.join(evidenceDir, 'software-factory-state.json');
  const markdownPath = path.join(evidenceDir, 'software-factory-state.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildMarkdown(report)}\n`, 'utf8');
  return {
    jsonPath,
    markdownPath
  };
}

function collectFacts(fsApi = fs, spawnImpl = spawnSync) {
  const sustainmentRules = readJson('docs/product/post-release-sustainment-rules.json', fsApi);
  const publicReleaseCandidate = readJson('docs/product/public-release-candidate.json', fsApi);
  const versionLineContract = sustainmentRules.releaseCadence.versionLineContract;
  const currentTransaction =
    publicReleaseCandidate.localProofs?.publicGitHubExactTransaction ?? Object.create(null);
  const softwareFactoryGovernance =
    publicReleaseCandidate.softwareFactoryGovernance ??
    sustainmentRules.softwareFactoryGovernance ??
    Object.create(null);
  const transactionReceiptPath =
    versionLineContract.publicGitHubExactTransactionReceiptPath ??
    DEFAULT_TRANSACTION_RECEIPT_PATH;
  const transactionReceipt = tryReadJson(transactionReceiptPath, fsApi);
  const publicReleaseAssetsPhase = transactionReceipt?.phases?.find(
    (phase) => phase.id === 'public-release-assets'
  );
  const draftPublishabilityPhase = transactionReceipt?.phases?.find(
    (phase) => phase.id === 'public-release-draft-publishability'
  );

  return {
    repoRoot,
    recordedAt: new Date().toISOString(),
    currentBranch: resolveCurrentBranch(spawnImpl),
    activeFeatureBranch:
      softwareFactoryGovernance.activeFeatureBranch ??
      softwareFactoryGovernance.activeFoundationBranch ??
      'feature/software-factory-rehearse-repair-contract',
    integrationBranch: versionLineContract.integrationBranch,
    exactReleaseLineBranch: versionLineContract.exactReleaseLineBranch,
    releaseBranchFamily: versionLineContract.releaseBranch,
    hotfixBranchFamily: versionLineContract.hotfixBranch,
    featureBranchFamily: 'feature/*',
    exactLine: versionLineContract.currentExactReleaseLine,
    packageLine: versionLineContract.currentMainPackageLine,
    developPackageLine: versionLineContract.currentDevelopPackageLine,
    semverFrozen: versionLineContract.activeFeatureBranch === null,
    semverFreezeRationale:
      'Later SemVer openings remain frozen while the current exact public GitHub repair state on v1.3.6 stays incomplete.',
    requiredChecks: publicReleaseCandidate.authorityRepo.requiredChecks,
    preTagPublicExactProofPackageScript: versionLineContract.preTagPublicExactProofPackageScript,
    publicGitHubExactTransactionPackageScript:
      versionLineContract.publicGitHubExactTransactionPackageScript,
    publicGitHubExactTransactionReceiptPath: transactionReceiptPath,
    publicGitHubMainCommit: currentTransaction.publicMainCommit ?? transactionReceipt?.publicSource?.mainSha ?? null,
    publicGitHubTag: currentTransaction.publicTag ?? transactionReceipt?.publicRelease?.tag_name ?? null,
    publicGitHubDraftReleaseId:
      currentTransaction.draftReleaseId ??
      transactionReceipt?.publicRelease?.id ??
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.draftReleaseId ??
      null,
    publicGitHubLastPublishedRelease: publicReleaseCandidate.exactRelease?.version ?? null,
    blockerCode:
      currentTransaction.publishabilityBlockerCode ??
      currentTransaction.draftPublishabilityBlockerCode ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.blockerCode ??
      draftPublishabilityPhase?.details?.draftPublishabilityProbe?.blockerCode ??
      publicReleaseCandidate.activeBlockers?.[0]?.id ??
      null,
    blockerSummary:
      currentTransaction.publishabilityBlockerSummary ??
      currentTransaction.draftPublishabilityBlockerSummary ??
      draftPublishabilityPhase?.summary ??
      publicReleaseCandidate.activeBlockers?.[0]?.summary ??
      null,
    repairInPlaceRequired: currentTransaction.repairInPlaceRequired === true,
    repairInPlaceAllowed: currentTransaction.repairInPlaceAllowed === true,
    nextAllowedAction: currentTransaction.nextAllowedAction ?? 'retain-current-blocker',
    publicGitHubReleasePublished:
      currentTransaction.publishabilityProbeStatus === 'passed' &&
      currentTransaction.safeToAttemptRepairPublish === true,
    marketplaceItem: publicReleaseCandidate.exactRelease?.marketplaceItemName ?? null,
    marketplaceVersion: publicReleaseCandidate.exactRelease?.marketplaceVersion ?? null,
    authorityReleaseManifestPath:
      currentTransaction.authorityReleaseManifestPath ??
      transactionReceipt?.releaseManifest?.manifestPath ??
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.authorityReleaseManifestPath ??
      null,
    releaseAssetsRetainedAgainstManifest:
      currentTransaction.releaseAssetsRetainedAgainstManifest === true ||
      transactionReceipt?.draftPublishabilityProbe?.exactAssetsRetained === true ||
      publicReleaseAssetsPhase?.status === 'pass',
    draftPublishabilityByIdStatusCode:
      currentTransaction.draftPublishabilityByIdStatusCode ??
      transactionReceipt?.publicReleaseByIdLookup?.statusCode ??
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.draftReleaseByIdStatusCode ??
      null,
    draftPublishabilityTagMatchesAuthority:
      currentTransaction.draftPublishabilityTagMatchesAuthority === true ||
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.draftReleaseTagMatchesAuthority === true ||
      transactionReceipt?.publicRelease?.tag_name === versionLineContract.currentExactReleaseLine,
    safeToAttemptRepairPublish:
      currentTransaction.safeToAttemptRepairPublish === true ||
      transactionReceipt?.repairInPlace?.status === 'allowed-and-safe' ||
      false,
    draftReleaseUrl:
      currentTransaction.draftReleaseUrl ??
      transactionReceipt?.publicRelease?.html_url ??
      publicReleaseCandidate.exactReleaseReopening?.publicGitHubDraftReleaseUrl ??
      null,
    draftReleaseTargetCommitish:
      currentTransaction.draftReleaseTargetCommitish ??
      transactionReceipt?.publicRelease?.target_commitish ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.draftReleaseTargetCommitish ??
      null,
    draftReleaseLookupStatusCode:
      currentTransaction.draftReleaseLookupStatusCode ??
      transactionReceipt?.publicReleaseLookup?.statusCode ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.draftReleaseLookupStatusCode ??
      null,
    immutableReleasesEnabled:
      currentTransaction.immutableReleasesEnabled ??
      transactionReceipt?.immutableReleasePolicy?.enabled ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.immutableReleasesEnabled ??
      null,
    immutableReleasesEnforcedByOwner:
      currentTransaction.immutableReleasesEnforcedByOwner ??
      transactionReceipt?.immutableReleasePolicy?.enforcedByOwner ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.immutableReleasesEnforcedByOwner ??
      null
  };
}

async function runAssessment(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    return {
      outcome: 'help',
      usage: getUsage()
    };
  }

  const facts = collectFacts(deps.fs ?? fs, deps.spawnSync ?? spawnSync);
  const report = buildPhaseReport(facts, options.phase);
  const written = await writeReport(report, options.evidenceDir);

  return {
    outcome: report.status,
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
    const result = await runAssessment(argv, deps);
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
  DEFAULT_EVIDENCE_ROOT,
  DEFAULT_PHASE_EVIDENCE_DIRS,
  DEFAULT_PHASE_RECEIPT_PATHS,
  DEFAULT_TRANSACTION_RECEIPT_PATH,
  PHASES,
  assessFactoryState,
  buildMarkdown,
  buildPhaseReport,
  collectFacts,
  getDefaultEvidenceDirForPhase,
  getUsage,
  main,
  parseArgs,
  repairFactoryState,
  rehearseFactoryState,
  runAssessment,
  toRelativeReportPath
};
