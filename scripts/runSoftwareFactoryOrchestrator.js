#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicationState = require(path.join(__dirname, 'releasePublicationState.js'));

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const PHASES = ['assess', 'rehearse', 'repair', 'publish', 'verify'];
const DEFAULT_EVIDENCE_ROOT = path.join(repoRoot, '.cache', 'software-factory-orchestrator', 'latest');
const DEFAULT_EVIDENCE_DIR = DEFAULT_EVIDENCE_ROOT;
const DEFAULT_TRANSACTION_RECEIPT_PATH =
  '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json';
const DEFAULT_MARKETPLACE_PREP_RECEIPT_PATH =
  '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json';
const DEFAULT_PHASE_EVIDENCE_DIRS = {
  assess: DEFAULT_EVIDENCE_ROOT,
  rehearse: path.join(DEFAULT_EVIDENCE_ROOT, 'rehearse'),
  repair: path.join(DEFAULT_EVIDENCE_ROOT, 'repair'),
  publish: path.join(DEFAULT_EVIDENCE_ROOT, 'publish'),
  verify: path.join(DEFAULT_EVIDENCE_ROOT, 'verify')
};
const DEFAULT_PHASE_RECEIPT_PATHS = {
  assess: '.cache/software-factory-orchestrator/latest/software-factory-state.json',
  rehearse: '.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json',
  repair: '.cache/software-factory-orchestrator/latest/repair/software-factory-state.json',
  publish: '.cache/software-factory-orchestrator/latest/publish/software-factory-state.json',
  verify: '.cache/software-factory-orchestrator/latest/verify/software-factory-state.json'
};

function getDefaultEvidenceDirForPhase(phase) {
  return DEFAULT_PHASE_EVIDENCE_DIRS[phase] ?? DEFAULT_EVIDENCE_DIR;
}

function getUsage() {
  return [
    'Usage: node scripts/runSoftwareFactoryOrchestrator.js [--phase <assess|rehearse|repair|publish|verify>] [--evidence-dir <path>] [--help]',
    '',
    'Assess, rehearse, repair, or retain the guarded non-mutating publish/verify contracts for the vi-history-suite software-factory control plane.',
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

function isMarketplacePublished(facts) {
  const expectedMarketplaceVersion = String(facts.exactLine ?? '').replace(/^v/, '');
  return facts.marketplaceVersion === expectedMarketplaceVersion;
}

function marketplaceAction(kind, facts) {
  return publicationState.buildMarketplaceFactoryAction(kind, facts.exactLine);
}

function buildCommonSections(facts, phase, options = {}) {
  const currentPhaseReceiptPath =
    options.currentPhaseReceiptPath ?? DEFAULT_PHASE_RECEIPT_PATHS[phase];
  const admittedNonProductionPhases = ['assess', 'rehearse', 'repair'];
  const guardedNonMutatingContractPhases = ['publish', 'verify'];
  const supportedPhases = [...admittedNonProductionPhases, ...guardedNonMutatingContractPhases];
  const expectedMarketplaceVersion = String(facts.exactLine ?? '').replace(/^v/, '');
  const marketplacePhaseStatus =
    facts.marketplaceVersion === expectedMarketplaceVersion ? 'pass' : 'blocked';

  return {
    schema: 'vi-history-suite/software-factory-orchestrator@v3',
    recordedAt: facts.recordedAt,
    repoRoot: facts.repoRoot,
    currentBranch: facts.currentBranch,
    contract: {
      currentPhase: phase,
      supportedPhases,
      admittedNonProductionPhases,
      guardedNonMutatingContractPhases,
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
      publicGitHubReleasePublished: facts.publicGitHubReleasePublished,
      publicGitHubPublishabilityBlockerCode: facts.blockerCode,
      vscodeMarketplaceItem: facts.marketplaceItem,
      vscodeMarketplaceVersion: facts.marketplaceVersion,
      expectedMarketplaceVersion
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
      admittedNonProductionPhases,
      guardedNonMutatingContractPhases,
      requiredSurfaces: [
        facts.preTagPublicExactProofPackageScript,
        facts.publicGitHubExactTransactionPackageScript,
        'npm run docs:gate:core',
        'npm run design:gate'
      ],
      rule: isMarketplacePublished(facts)
        ? 'The current exact line is closed across public GitHub and VS Code Marketplace; later production acts return to normal GitFlow and repo-owned factory governance.'
        : 'Future production publication acts must stay blocked until the factory control plane proves the recovery case through repo-owned assessment, non-production rehearsal, the non-production repair contract, and the guarded non-mutating publish/verify contracts before any later production mutation phase is admitted.'
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
      publish: 'repo-owned automatic guarded non-mutating publish-contract phase',
      verify: 'repo-owned automatic guarded non-mutating verify-contract phase',
      publishPublicGitHubRelease: isMarketplacePublished(facts)
        ? 'already retained for current exact line'
        : 'explicit later production approval required',
      publishMarketplace: isMarketplacePublished(facts)
        ? 'already retained for current exact line'
        : 'explicit later production approval required'
    },
    receiptContract: {
      packageScripts: {
        assess: 'npm run software:factory:assess',
        rehearse: 'npm run software:factory:rehearse',
        repair: 'npm run software:factory:repair',
        publish: 'npm run software:factory:publish',
        verify: 'npm run software:factory:verify',
        marketplacePrepare: 'npm run vscode:marketplace:prepare'
      },
      receiptPaths: {
        assess: DEFAULT_PHASE_RECEIPT_PATHS.assess,
        rehearse: DEFAULT_PHASE_RECEIPT_PATHS.rehearse,
        repair: DEFAULT_PHASE_RECEIPT_PATHS.repair,
        publish: DEFAULT_PHASE_RECEIPT_PATHS.publish,
        verify: DEFAULT_PHASE_RECEIPT_PATHS.verify,
        marketplacePrepare: DEFAULT_MARKETPLACE_PREP_RECEIPT_PATH
      },
      currentPhaseReceiptPath
    },
    marketplacePhaseStatus
  };
}

function buildPhaseSummary(phase, facts) {
  const releaseId = facts.publicGitHubDraftReleaseId ?? 'unknown';
  const marketplacePublished = isMarketplacePublished(facts);

  if (phase === 'assess') {
    return {
      currentPhaseLabel: 'assess',
      summary:
        facts.publicGitHubReleasePublished && marketplacePublished
          ? `Assessment confirms public GitHub ${facts.exactLine} and VS Code Marketplace ${String(facts.exactLine).replace(/^v/, '')} are closed.`
          : facts.publicGitHubReleasePublished
          ? `Assessment confirms public GitHub ${facts.exactLine} is closed and keeps Marketplace ${facts.marketplaceVersion} as the remaining separate publication act.`
          : `Assessment retains the frozen ${facts.exactLine} production recovery case and fails closed on ${facts.blockerCode ?? 'no-blocker'}.`
    };
  }

  if (phase === 'rehearse') {
    return {
      currentPhaseLabel: 'rehearse',
      summary:
        facts.publicGitHubReleasePublished && marketplacePublished
          ? `Non-production rehearsal confirms GitHub ${facts.exactLine} and Marketplace ${String(facts.exactLine).replace(/^v/, '')} are already closed without admitting any further production mutation.`
          : facts.publicGitHubReleasePublished
          ? `Non-production rehearsal confirms the GitHub ${facts.exactLine} release is already published and prepares the Marketplace-only boundary without admitting production mutation.`
          : `Non-production rehearsal retains the in-place ${facts.exactLine} repair candidate around draft release ${releaseId} without admitting any production mutation.`
    };
  }

  if (phase === 'repair') {
    return {
      currentPhaseLabel: 'repair',
      summary:
        facts.publicGitHubReleasePublished && marketplacePublished
          ? `The non-production repair contract records that GitHub ${facts.exactLine} and Marketplace ${String(facts.exactLine).replace(/^v/, '')} repair are closed.`
          : facts.publicGitHubReleasePublished
          ? `The non-production repair contract records that GitHub ${facts.exactLine} repair is no longer required and defers only the Marketplace publication act.`
          : `The non-production repair contract retains the deferred in-place ${facts.exactLine} recovery plan for draft release ${releaseId} without admitting any write action.`
    };
  }

  if (phase === 'publish') {
    return {
      currentPhaseLabel: 'publish',
      summary:
        facts.publicGitHubReleasePublished && marketplacePublished
          ? `The guarded non-mutating publish contract records that the ${facts.exactLine} production publish acts are already retained.`
          : facts.publicGitHubReleasePublished
          ? `The guarded non-mutating publish contract retains the VS Code Marketplace ${facts.exactLine} publication preconditions without admitting the production publish act.`
          : `The guarded non-mutating publish contract retains the exact ${facts.exactLine} transition requirements for draft release ${releaseId} without admitting any production mutation.`
    };
  }

  return {
    currentPhaseLabel: 'verify',
    summary:
      facts.publicGitHubReleasePublished && marketplacePublished
        ? `The guarded non-mutating verify contract confirms GitHub ${facts.exactLine} and Marketplace ${String(facts.exactLine).replace(/^v/, '')} are both retained live.`
        : facts.publicGitHubReleasePublished
        ? `The guarded non-mutating verify contract confirms GitHub ${facts.exactLine} and retains the Marketplace ${facts.exactLine} verification expectation.`
        : `The guarded non-mutating verify contract retains the exact ${facts.exactLine} publication-verification expectations around draft release ${releaseId} without admitting any production mutation.`
  };
}

function describeFactoryBranch(facts) {
  return facts.activeFeatureBranch
    ? `the active software-factory branch ${facts.activeFeatureBranch}`
    : 'no active software-factory branch retained on develop';
}

function describeMarketplaceBoundary(facts, marketplacePhaseStatus) {
  const expectedMarketplaceVersion = String(facts.exactLine ?? '').replace(/^v/, '');
  if (marketplacePhaseStatus === 'pass') {
    return `Marketplace already serves ${expectedMarketplaceVersion}.`;
  }
  if (facts.publicGitHubReleasePublished) {
    return `Public GitHub ${facts.exactLine} is closed; Marketplace still serves ${facts.marketplaceVersion ?? 'unknown'}, so the separate Marketplace publication act remains pending.`;
  }
  return `Marketplace stays blocked at ${facts.marketplaceVersion} until the public GitHub exact release closes cleanly.`;
}

function createAssessPhases(facts, marketplacePhaseStatus) {
  const marketplacePublished = isMarketplacePublished(facts);

  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and ${describeFactoryBranch(facts)}.`
    },
    {
      id: 'production-mutation-policy',
      status: 'pass',
      summary: marketplacePublished
        ? 'The software-factory control plane now records the current exact line as closed across public GitHub and VS Code Marketplace; no further production mutation remains for this line.'
        : 'The software-factory control plane now admits assess, rehearse, and repair plus guarded non-mutating publish/verify contract phases; Marketplace publication remains forbidden until the separate production act is explicitly approved.'
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
      summary: describeMarketplaceBoundary(facts, marketplacePhaseStatus)
    }
  ];
}

function createRehearsePhases(facts, marketplacePhaseStatus) {
  const rehearsalReady =
    facts.publicGitHubReleasePublished
      ? facts.releaseAssetsRetainedAgainstManifest
      : facts.repairInPlaceRequired &&
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
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and ${describeFactoryBranch(facts)}.`
    },
    {
      id: 'rehearsal-readiness',
      status: rehearsalReady ? 'pass' : 'blocked',
      summary: rehearsalReady
        ? facts.publicGitHubReleasePublished
          ? `Non-production rehearsal proves public GitHub ${facts.exactLine} is already closed and still carries the exact manifest-backed assets.`
          : `Non-production rehearsal proves the retained ${facts.exactLine} draft can still be read by id, still matches the authority tag, and still carries the exact manifest-backed assets.`
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
      summary: describeMarketplaceBoundary(facts, marketplacePhaseStatus)
    }
  ];
}

function createRepairPhases(facts, marketplacePhaseStatus) {
  const repairContractReady =
    facts.publicGitHubReleasePublished || (facts.repairInPlaceRequired && facts.repairInPlaceAllowed);
  const marketplacePublished = isMarketplacePublished(facts);

  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and ${describeFactoryBranch(facts)}.`
    },
    {
      id: 'repair-contract',
      status: repairContractReady ? 'pass' : 'blocked',
      summary: repairContractReady
        ? facts.publicGitHubReleasePublished && marketplacePublished
          ? `The non-production repair contract records that GitHub ${facts.exactLine} and Marketplace ${String(facts.exactLine).replace(/^v/, '')} are closed.`
          : facts.publicGitHubReleasePublished
          ? `The non-production repair contract records that GitHub ${facts.exactLine} repair is closed; only the separate Marketplace act remains.`
          : `The non-production repair contract retains ${facts.exactLine} as an in-place recovery target against draft release ${facts.publicGitHubDraftReleaseId}.`
        : `The software-factory control plane cannot retain a non-production repair contract until the recovery case is explicitly classified as repair-in-place.`
    },
    {
      id: 'repair-write-boundary',
      status: facts.blockerCode ? 'blocked' : 'pass',
      summary: facts.blockerCode
        ? `Repair remains non-mutating and blocked by ${facts.blockerCode}; later publish/verify phases are not yet admitted.`
        : marketplacePublished
          ? 'Repair remains non-mutating; no current production repair or publish action remains for the exact line.'
          : 'Repair remains non-mutating, but the current recovery case is ready for later guarded publish/verify contract retention.'
    },
    {
      id: 'marketplace-boundary',
      status: marketplacePhaseStatus,
      summary: describeMarketplaceBoundary(facts, marketplacePhaseStatus)
    }
  ];
}

function createPublishPhases(facts, marketplacePhaseStatus) {
  const publishContractReady =
    facts.publicGitHubReleasePublished
      ? facts.releaseAssetsRetainedAgainstManifest
      : facts.repairInPlaceRequired &&
        facts.repairInPlaceAllowed &&
        facts.releaseAssetsRetainedAgainstManifest &&
        facts.draftPublishabilityByIdStatusCode === 200 &&
        facts.draftPublishabilityTagMatchesAuthority === true;
  const marketplacePublished = isMarketplacePublished(facts);

  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and ${describeFactoryBranch(facts)}.`
    },
    {
      id: 'publish-contract',
      status: publishContractReady ? 'pass' : 'blocked',
      summary: publishContractReady
        ? facts.publicGitHubReleasePublished && marketplacePublished
          ? `The guarded publish contract records that Marketplace ${String(facts.exactLine).replace(/^v/, '')} is already retained live.`
          : facts.publicGitHubReleasePublished
          ? `The guarded publish contract retains the Marketplace ${facts.exactLine} package, GitHub exact-release proof, and no-write boundary without performing a Marketplace publish mutation.`
          : `The guarded publish contract retains the exact ${facts.exactLine} release draft, manifest-backed assets, and in-place transition preconditions without performing a publish mutation.`
        : `The guarded publish contract cannot yet retain a trustworthy in-place transition because the current ${facts.exactLine} draft state is missing one or more retained prerequisites.`
    },
    {
      id: 'publish-mutation-boundary',
      status: marketplacePublished ? 'pass' : 'blocked',
      summary: facts.blockerCode
        ? `Publish remains contract-only and blocked by ${facts.blockerCode}; GitHub release publication is still forbidden in this slice.`
        : facts.publicGitHubReleasePublished && marketplacePublished
          ? 'No production publish mutation remains for the current exact line; publication is already retained.'
          : facts.publicGitHubReleasePublished
          ? 'Publish remains contract-only; VS Code Marketplace publication still requires later explicit production approval.'
          : 'Publish remains contract-only; GitHub release publication still requires later explicit production approval even if the current blocker clears.'
    },
    {
      id: 'marketplace-boundary',
      status: marketplacePhaseStatus,
      summary: describeMarketplaceBoundary(facts, marketplacePhaseStatus)
    }
  ];
}

function createVerifyPhases(facts, marketplacePhaseStatus) {
  const verifyContractReady =
    Boolean(facts.exactLine) &&
    Boolean(facts.publicGitHubTag) &&
    facts.releaseAssetsRetainedAgainstManifest;
  const githubReleaseVerified = facts.publicGitHubLastPublishedRelease === facts.exactLine;
  const marketplaceVersionExpected = String(facts.exactLine ?? '').replace(/^v/, '');
  const marketplaceVerified = facts.marketplaceVersion === marketplaceVersionExpected;

  return [
    {
      id: 'authority-boundary',
      status: 'pass',
      summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${facts.exactLine} retained as the current exact line.`
    },
    {
      id: 'staging-boundary',
      status: 'pass',
      summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and ${describeFactoryBranch(facts)}.`
    },
    {
      id: 'verify-contract',
      status: verifyContractReady ? 'pass' : 'blocked',
      summary: verifyContractReady
        ? `The guarded verify contract retains the exact ${facts.exactLine} GitHub-release and Marketplace verification expectations without performing any production mutation.`
        : `The guarded verify contract cannot yet retain the exact ${facts.exactLine} verification expectations because the retained publication facts remain incomplete.`
    },
    {
      id: 'verify-production-readiness',
      status: githubReleaseVerified && marketplaceVerified ? 'pass' : 'blocked',
      summary:
        githubReleaseVerified && marketplaceVerified
          ? `Verification expectations are satisfied: GitHub exact release ${facts.exactLine} and Marketplace ${marketplaceVersionExpected} are both live.`
          : `Verification remains contract-only: GitHub still publishes ${facts.publicGitHubLastPublishedRelease ?? 'unknown'}, Marketplace still serves ${facts.marketplaceVersion ?? 'unknown'}, and no production verification claim is admitted yet.`
    },
    {
      id: 'marketplace-boundary',
      status: marketplacePhaseStatus,
      summary: describeMarketplaceBoundary(facts, marketplacePhaseStatus)
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

  const marketplacePublished = isMarketplacePublished(facts);

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
      targetMode: facts.publicGitHubReleasePublished && marketplacePublished
        ? 'no-repair-required-final-publication-retained'
        : facts.publicGitHubReleasePublished
        ? 'github-release-repair-not-required-marketplace-pending'
        : 'repair-in-place',
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
      deferredWriteActions: facts.publicGitHubReleasePublished && marketplacePublished
        ? []
        : facts.publicGitHubReleasePublished
        ? [
            marketplaceAction('prepare', facts),
            marketplaceAction('publishAfterApproval', facts),
            marketplaceAction('verify', facts)
          ]
        : [
            'publish-existing-github-draft-release-in-place',
            'verify-public-github-release-publication',
            'verify-marketplace-remains-blocked-until-github-release-closes',
            marketplaceAction('publishAfterGitHub', facts)
          ],
      rule:
        facts.publicGitHubReleasePublished && marketplacePublished
          ? 'This repair contract remains non-mutating; GitHub and VS Code Marketplace closeout are already retained for the current exact line.'
          : facts.publicGitHubReleasePublished
          ? 'This repair contract remains non-mutating; GitHub repair is closed and the later Marketplace publish/verify phases still require separate explicit production approval.'
          : 'This repair contract remains non-mutating; later publish and verify phases still require separate explicit production approval after safe publishability is proven.'
    },
    phases
  };
}

function publishFactoryState(facts) {
  const common = buildCommonSections(facts, 'publish');
  const phases = createPublishPhases(facts, common.marketplacePhaseStatus);
  const publishContractReady = phases.find((phase) => phase.id === 'publish-contract')?.status === 'pass';
  const phaseSummary = buildPhaseSummary('publish', facts);

  const marketplacePublished = isMarketplacePublished(facts);

  return {
    ...common,
    status: determineStatus(phases),
    phaseSummary,
    publishContract: {
      status: publishContractReady ? 'pass' : 'blocked',
      nonMutating: true,
      mutationPermitted: false,
      packageScript: 'npm run software:factory:publish',
      receiptPath: DEFAULT_PHASE_RECEIPT_PATHS.publish,
      targetMode: facts.publicGitHubReleasePublished && marketplacePublished
        ? 'publication-retained-no-publish-required'
        : facts.publicGitHubReleasePublished
        ? 'vscode-marketplace-publication-guard'
        : 'publish-in-place-guard',
      targetTag: facts.exactLine,
      targetDraftReleaseId: facts.publicGitHubDraftReleaseId,
      targetDraftReleaseUrl: facts.draftReleaseUrl,
      authorityReleaseManifestPath: facts.authorityReleaseManifestPath,
      exactAssetsRetainedAgainstManifest: facts.releaseAssetsRetainedAgainstManifest,
      draftReleaseReadableById: facts.draftPublishabilityByIdStatusCode === 200,
      draftReleaseTagMatchesAuthority: facts.draftPublishabilityTagMatchesAuthority,
      safePublishTransitionProven: facts.safeToAttemptRepairPublish,
      currentBlockerCode: facts.blockerCode,
      deferredWriteAction: facts.publicGitHubReleasePublished && marketplacePublished
        ? 'none-final-publication-retained'
        : facts.publicGitHubReleasePublished
        ? marketplaceAction('publishWithPinnedVsce', facts)
        : 'publish-existing-github-draft-release-in-place',
      nextAllowedAction: facts.nextAllowedAction,
      rule:
        facts.publicGitHubReleasePublished && marketplacePublished
          ? 'This guarded publish contract remains non-mutating; the current exact line is already published and retained across public GitHub and VS Code Marketplace.'
          : facts.publicGitHubReleasePublished
          ? 'This guarded publish contract remains non-mutating; it retains the exact Marketplace publish preconditions and still forbids VS Code Marketplace publication in this slice.'
          : 'This guarded publish contract remains non-mutating; it retains the exact in-place publish preconditions and still forbids GitHub release publication in this slice.'
    },
    phases
  };
}

function verifyFactoryState(facts) {
  const common = buildCommonSections(facts, 'verify');
  const phases = createVerifyPhases(facts, common.marketplacePhaseStatus);
  const verifyContractReady = phases.find((phase) => phase.id === 'verify-contract')?.status === 'pass';
  const phaseSummary = buildPhaseSummary('verify', facts);

  return {
    ...common,
    status: determineStatus(phases),
    phaseSummary,
    verifyContract: {
      status: verifyContractReady ? 'pass' : 'blocked',
      nonMutating: true,
      mutationPermitted: false,
      packageScript: 'npm run software:factory:verify',
      receiptPath: DEFAULT_PHASE_RECEIPT_PATHS.verify,
      targetMode: 'post-publish-verify-guard',
      targetTag: facts.exactLine,
      targetDraftReleaseId: facts.publicGitHubDraftReleaseId,
      expectedGitHubRelease: facts.exactLine,
      expectedMarketplaceVersion: String(facts.exactLine ?? '').replace(/^v/, ''),
      currentPublishedGitHubRelease: facts.publicGitHubLastPublishedRelease,
      currentMarketplaceVersion: facts.marketplaceVersion,
      currentBlockerCode: facts.blockerCode,
      deferredReadActions: [
        'verify-public-github-release-publication',
        'verify-public-github-release-assets-and-checksums',
        marketplaceAction('prepare', facts),
        marketplaceAction('verifyAfterPublication', facts)
      ],
      nextAllowedAction: facts.nextAllowedAction,
      rule:
        'This guarded verify contract remains non-mutating; it retains the exact post-publish verification expectations and still forbids any production mutation in this slice.'
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

  if (phase === 'repair') {
    return repairFactoryState(facts);
  }

  if (phase === 'publish') {
    return publishFactoryState(facts);
  }

  return verifyFactoryState(facts);
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

  if (report.publishContract) {
    extraSections.push(
      '## Publish Contract',
      '',
      `- Status: \`${report.publishContract.status}\``,
      `- Package script: \`${report.publishContract.packageScript}\``,
      `- Receipt path: \`${report.publishContract.receiptPath}\``,
      `- Target mode: \`${report.publishContract.targetMode}\``,
      `- Target draft release: \`${report.publishContract.targetDraftReleaseId}\``,
      `- Mutation permitted: \`${report.publishContract.mutationPermitted}\``,
      `- Current blocker: \`${report.publishContract.currentBlockerCode ?? 'none'}\``,
      `- Deferred write action: \`${report.publishContract.deferredWriteAction}\``,
      ''
    );
  }

  if (report.verifyContract) {
    extraSections.push(
      '## Verify Contract',
      '',
      `- Status: \`${report.verifyContract.status}\``,
      `- Package script: \`${report.verifyContract.packageScript}\``,
      `- Receipt path: \`${report.verifyContract.receiptPath}\``,
      `- Target mode: \`${report.verifyContract.targetMode}\``,
      `- Expected GitHub release: \`${report.verifyContract.expectedGitHubRelease}\``,
      `- Expected Marketplace version: \`${report.verifyContract.expectedMarketplaceVersion}\``,
      `- Current GitHub release: \`${report.verifyContract.currentPublishedGitHubRelease ?? 'unknown'}\``,
      `- Current Marketplace version: \`${report.verifyContract.currentMarketplaceVersion ?? 'unknown'}\``,
      `- Deferred read actions: ${report.verifyContract.deferredReadActions.join(', ')}`,
      ''
    );
  }

  const marketplaceClosed =
    report.productionBoundary.vscodeMarketplaceVersion ===
    report.productionBoundary.expectedMarketplaceVersion;
  const mutationPolicyLines = marketplaceClosed
    ? [
        '- This contract records the current exact line as closed across public GitHub and VS Code Marketplace.',
        '- The `publish` and `verify` phases here are retained receipt surfaces only; no further production mutation remains for this exact line.',
        '- Later production acts return to normal GitFlow and repo-owned factory governance.'
      ]
    : [
        '- This contract admits non-production `assess`, `rehearse`, and `repair` plus guarded non-mutating `publish` and `verify` contract phases.',
        '- The `publish` and `verify` phases here are contract-definition/readiness surfaces only; they do not publish to GitHub or VS Code Marketplace.',
        '- No GitHub release publication, Marketplace publication, or other production mutation is permitted in this slice.',
        '- Production publish phases require later explicit approval after the frozen recovery case is closed.'
      ];

  return [
    '# Software Factory Orchestrator Receipt',
    '',
    `- Recorded at: \`${report.recordedAt}\``,
    `- Status: \`${report.status}\``,
    `- Current branch: \`${report.currentBranch}\``,
    `- Current phase: \`${report.contract.currentPhase}\``,
    `- Phase summary: ${report.phaseSummary.summary}`,
    `- Supported phases: \`${report.contract.supportedPhases.join(', ')}\``,
    `- Admitted non-production phases: \`${report.contract.admittedNonProductionPhases.join(', ')}\``,
    `- Guarded non-mutating contract phases: \`${report.contract.guardedNonMutatingContractPhases.join(', ')}\``,
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
    ...mutationPolicyLines,
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
    `- publish script: \`${report.receiptContract.packageScripts.publish}\``,
    `- verify script: \`${report.receiptContract.packageScripts.verify}\``,
    `- Marketplace prep script: \`${report.receiptContract.packageScripts.marketplacePrepare}\``,
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
  const releasePublicationState = publicationState.resolvePublicationState(fsApi);
  const activePublicationIncident = releasePublicationState.incident?.active === true;
  const activeCandidateTag = publicationState.normalizeTag(
    releasePublicationState.activeCandidate?.tag ??
      releasePublicationState.activeCandidate?.packageVersion ??
      versionLineContract.activeHotfixCandidateReleaseLine ??
      versionLineContract.activeDevelopCandidateReleaseLine ??
      null
  );
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
  const publicReleasePublished =
    currentTransaction.verifyGateStatus === 'pass' ||
    transactionReceipt?.verifyGate?.status === 'pass' ||
    transactionReceipt?.phases?.find((phase) => phase.id === 'public-release-published')?.status === 'pass';
  const activeFeatureBranch =
    Object.prototype.hasOwnProperty.call(softwareFactoryGovernance, 'activeFeatureBranch')
      ? softwareFactoryGovernance.activeFeatureBranch
      : Object.prototype.hasOwnProperty.call(softwareFactoryGovernance, 'activeFoundationBranch')
        ? softwareFactoryGovernance.activeFoundationBranch
        : null;
  const exactLine =
    activeCandidateTag ??
    (activePublicationIncident
      ? releasePublicationState.authority?.exactTag
      : versionLineContract.currentExactReleaseLine);
  const exactPackageVersion = String(exactLine ?? '').replace(/^v/, '');
  const marketplaceVersion =
    releasePublicationState.marketplace?.currentPublishedVersion ??
    publicReleaseCandidate.exactRelease?.marketplaceVersion ??
    null;
  const marketplacePublished = marketplaceVersion === exactPackageVersion;
  const retainedBlockerCode =
    activePublicationIncident
      ? releasePublicationState.incident?.blockerCode ?? 'externally-blocked-publication'
      : publicReleasePublished
      ? null
      : currentTransaction.publishabilityBlockerCode ??
        currentTransaction.draftPublishabilityBlockerCode ??
        versionLineContract.publicGitHubExactPublishabilityProbe?.blockerCode ??
        draftPublishabilityPhase?.details?.draftPublishabilityProbe?.blockerCode ??
        publicReleaseCandidate.activeBlockers?.[0]?.id ??
        null;

  return {
    repoRoot,
    recordedAt: new Date().toISOString(),
    currentBranch: resolveCurrentBranch(spawnImpl),
    activeFeatureBranch,
    integrationBranch: versionLineContract.integrationBranch,
    exactReleaseLineBranch: versionLineContract.exactReleaseLineBranch,
    releaseBranchFamily: versionLineContract.releaseBranch,
    hotfixBranchFamily: versionLineContract.hotfixBranch,
    featureBranchFamily: 'feature/*',
    exactLine,
    packageLine: versionLineContract.currentMainPackageLine,
    developPackageLine: versionLineContract.currentDevelopPackageLine,
    semverFrozen: !marketplacePublished,
    semverFreezeRationale: activePublicationIncident
      ? releasePublicationState.incident?.summary ??
        `Later SemVer openings remain frozen while ${exactLine} is externally blocked.`
      : marketplacePublished
      ? `Exact ${exactLine} is fully published across public GitHub and VS Code Marketplace.`
      : `Later SemVer openings remain frozen while exact ${exactLine} is closed on public GitHub but still pending the separate VS Code Marketplace publication act.`,
    requiredChecks: publicReleaseCandidate.authorityRepo.requiredChecks,
    preTagPublicExactProofPackageScript: versionLineContract.preTagPublicExactProofPackageScript,
    publicGitHubExactTransactionPackageScript:
      versionLineContract.publicGitHubExactTransactionPackageScript,
    publicGitHubExactTransactionReceiptPath: transactionReceiptPath,
    publicGitHubMainCommit:
      releasePublicationState.publicGitHub?.mainCommit ??
      currentTransaction.publicMainCommit ??
      transactionReceipt?.publicSource?.mainSha ??
      null,
    publicGitHubTag:
      releasePublicationState.publicGitHub?.tag ??
      currentTransaction.publicTag ??
      transactionReceipt?.publicRelease?.tag_name ??
      null,
    publicGitHubDraftReleaseId:
      releasePublicationState.publicGitHub?.release?.id ??
      currentTransaction.draftReleaseId ??
      currentTransaction.publicReleaseId ??
      transactionReceipt?.publicRelease?.id ??
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.draftReleaseId ??
      null,
    publicGitHubLastPublishedRelease: activePublicationIncident
      ? releasePublicationState.publicGitHub?.lastCompleteReleaseTag ??
        publicReleaseCandidate.exactRelease?.version ??
        null
      : publicReleasePublished
        ? exactLine
        : publicReleaseCandidate.exactRelease?.version ?? null,
    blockerCode: retainedBlockerCode,
    blockerSummary: activePublicationIncident
      ? releasePublicationState.incident?.summary ?? null
      : publicReleasePublished
      ? null
      : currentTransaction.publishabilityBlockerSummary ??
        currentTransaction.draftPublishabilityBlockerSummary ??
        draftPublishabilityPhase?.summary ??
        publicReleaseCandidate.activeBlockers?.[0]?.summary ??
        null,
    repairInPlaceRequired: activePublicationIncident
      ? false
      : publicReleasePublished ? false : currentTransaction.repairInPlaceRequired === true,
    repairInPlaceAllowed: activePublicationIncident
      ? false
      : publicReleasePublished ? false : currentTransaction.repairInPlaceAllowed === true,
    nextAllowedAction:
      releasePublicationState.nextAdmittedAction ??
      currentTransaction.nextAllowedAction ??
      'retain-current-blocker',
    publicGitHubReleasePublished: activePublicationIncident
      ? releasePublicationState.publicGitHub?.release?.assetStatus === 'verified'
      : Boolean(publicReleasePublished),
    marketplaceItem:
      releasePublicationState.marketplace?.itemName ??
      publicReleaseCandidate.exactRelease?.marketplaceItemName ??
      null,
    marketplaceVersion,
    authorityReleaseManifestPath:
      releasePublicationState.authority?.gitlabReleaseManifestPath ??
      currentTransaction.authorityReleaseManifestPath ??
      transactionReceipt?.releaseManifest?.manifestPath ??
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.authorityReleaseManifestPath ??
      null,
    releaseAssetsRetainedAgainstManifest:
      releasePublicationState.publicGitHub?.release?.assetStatus === 'verified' ||
      currentTransaction.releaseAssetsRetainedAgainstManifest === true ||
      transactionReceipt?.draftPublishabilityProbe?.exactAssetsRetained === true ||
      publicReleaseAssetsPhase?.status === 'pass',
    draftPublishabilityByIdStatusCode:
      releasePublicationState.publicGitHub?.release?.byIdStatusCode ??
      currentTransaction.draftPublishabilityByIdStatusCode ??
      transactionReceipt?.publicReleaseByIdLookup?.statusCode ??
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.draftReleaseByIdStatusCode ??
      null,
    draftPublishabilityTagMatchesAuthority:
      releasePublicationState.publicGitHub?.release?.tagMatchesAuthority === true ||
      currentTransaction.draftPublishabilityTagMatchesAuthority === true ||
      versionLineContract.publicGitHubExactDraftPublishabilityProbe?.draftReleaseTagMatchesAuthority === true ||
      transactionReceipt?.publicRelease?.tag_name === versionLineContract.currentExactReleaseLine,
    safeToAttemptRepairPublish:
      releasePublicationState.publicGitHub?.release?.safeToPublish === true ||
      currentTransaction.safeToAttemptRepairPublish === true ||
      transactionReceipt?.repairInPlace?.status === 'allowed-and-safe' ||
      false,
    draftReleaseUrl:
      releasePublicationState.publicGitHub?.release?.url ??
      currentTransaction.draftReleaseUrl ??
      transactionReceipt?.publicRelease?.html_url ??
      publicReleaseCandidate.exactReleaseReopening?.publicGitHubDraftReleaseUrl ??
      null,
    draftReleaseTargetCommitish:
      releasePublicationState.publicGitHub?.release?.targetCommitish ??
      currentTransaction.draftReleaseTargetCommitish ??
      transactionReceipt?.publicRelease?.target_commitish ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.draftReleaseTargetCommitish ??
      null,
    draftReleaseLookupStatusCode:
      releasePublicationState.publicGitHub?.release?.tagLookupStatusCode ??
      currentTransaction.draftReleaseLookupStatusCode ??
      transactionReceipt?.publicReleaseLookup?.statusCode ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.draftReleaseLookupStatusCode ??
      null,
    immutableReleasesEnabled:
      releasePublicationState.publicGitHub?.immutableReleasesEnabled ??
      currentTransaction.immutableReleasesEnabled ??
      transactionReceipt?.immutableReleasePolicy?.enabled ??
      versionLineContract.publicGitHubExactPublishabilityProbe?.immutableReleasesEnabled ??
      null,
    immutableReleasesEnforcedByOwner:
      releasePublicationState.publicGitHub?.immutableReleasesEnforcedByOwner ??
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
  DEFAULT_MARKETPLACE_PREP_RECEIPT_PATH,
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
  publishFactoryState,
  verifyFactoryState,
  runAssessment,
  toRelativeReportPath
};
