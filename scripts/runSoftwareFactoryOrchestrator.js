#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(repoRoot, '.cache', 'software-factory-orchestrator', 'latest');
const DEFAULT_TRANSACTION_RECEIPT_PATH =
  '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json';

function getUsage() {
  return [
    'Usage: node scripts/runSoftwareFactoryOrchestrator.js [--evidence-dir <path>] [--help]',
    '',
    'Assess the vi-history-suite software-factory control plane and retain a resumable receipt.',
    '',
    'This initial contract is assess-only. It does not publish to GitHub, publish to VS Code Marketplace,',
    'or mutate any production surface.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceDir: DEFAULT_EVIDENCE_DIR
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

function readJson(relativePath, fsApi = fs) {
  return JSON.parse(fsApi.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
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

function assessFactoryState(facts) {
  const exactLine = facts.exactLine;
  const packageLine = facts.packageLine;
  const developPackageLine = facts.developPackageLine;
  const blockerCode = facts.blockerCode ?? null;
  const blockerSummary = facts.blockerSummary ?? 'No retained blocker summary.';
  const semverFrozen = facts.semverFrozen === true;
  const recoveryAllowed = facts.repairInPlaceAllowed === true;
  const recoveryRequired = facts.repairInPlaceRequired === true;
  const githubReleasePublished = facts.publicGitHubReleasePublished === true;
  const marketplaceVersion = facts.marketplaceVersion ?? null;
  const status = blockerCode ? 'blocked' : 'pass';
  const marketplacePhaseStatus = githubReleasePublished ? 'ready' : 'blocked';

  return {
    schema: 'vi-history-suite/software-factory-orchestrator@v1',
    recordedAt: facts.recordedAt,
    repoRoot: facts.repoRoot,
    currentBranch: facts.currentBranch,
    status,
    contract: {
      currentPhase: 'assess',
      supportedPhases: ['assess'],
      plannedPhases: ['rehearse', 'repair', 'publish', 'verify'],
      assessOnly: true,
      productionMutationAllowed: false,
      activeFoundationBranch: facts.activeFoundationBranch
    },
    semverFreeze: {
      status: semverFrozen ? 'frozen' : 'open',
      openingNewSemverAllowed: !semverFrozen,
      soleProductionRecoveryTarget: exactLine,
      rationale:
        facts.semverFreezeRationale ??
        `The current exact line ${exactLine} remains the sole production recovery case until the public GitHub exact transaction closes.`
    },
    authorityBoundary: {
      authorityRepoRoot: facts.repoRoot,
      authoritySystem: 'gitlab-authority',
      integrationBranch: facts.integrationBranch,
      exactReleaseLineBranch: facts.exactReleaseLineBranch,
      releaseBranchFamily: facts.releaseBranchFamily,
      hotfixBranchFamily: facts.hotfixBranchFamily,
      featureBranchFamily: facts.featureBranchFamily,
      currentExactLine: exactLine,
      currentMainPackageLine: packageLine,
      currentDevelopPackageLine: developPackageLine
    },
    stagingBoundary: {
      branchModel: 'gitflow',
      activeFoundationBranch: facts.activeFoundationBranch,
      requiredChecks: facts.requiredChecks,
      preTagPublicExactProofPackageScript: facts.preTagPublicExactProofPackageScript,
      publicGitHubExactTransactionPackageScript: facts.publicGitHubExactTransactionPackageScript,
      publicGitHubExactTransactionReceiptPath: facts.publicGitHubExactTransactionReceiptPath
    },
    productionBoundary: {
      publicGitHubMainCommit: facts.publicGitHubMainCommit,
      publicGitHubTag: facts.publicGitHubTag,
      publicGitHubDraftReleaseId: facts.publicGitHubDraftReleaseId,
      publicGitHubLastPublishedRelease: facts.publicGitHubLastPublishedRelease,
      publicGitHubPublishabilityBlockerCode: blockerCode,
      vscodeMarketplaceItem: facts.marketplaceItem,
      vscodeMarketplaceVersion: marketplaceVersion
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
      requiredSurfaces: [
        facts.preTagPublicExactProofPackageScript,
        facts.publicGitHubExactTransactionPackageScript,
        'npm run docs:gate:core',
        'npm run design:gate'
      ],
      rule:
        'Future production publication acts must stay blocked until the factory control plane proves the recovery case through repo-owned assessment and later repair/publish/verify phases.'
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
      id: `FACTORY-INCIDENT-${exactLine}`,
      class: blockerCode ? 'production-partial-public-state' : 'none',
      status,
      blockerCode,
      blockerSummary
    },
    recoveryRules: {
      repairInPlaceRequired: recoveryRequired,
      repairInPlaceAllowed: recoveryAllowed,
      noBumpRule: semverFrozen,
      receiptDrivenRecovery: true,
      publicGitHubExactTransactionReceiptPath: facts.publicGitHubExactTransactionReceiptPath,
      nextAllowedAction: facts.nextAllowedAction
    },
    approvalModel: {
      assess: 'repo-owned automatic',
      rehearse: 'repo-owned automatic when introduced later',
      repair: 'repo-owned repair phase only after assess classifies the recovery path',
      publishPublicGitHubRelease: 'explicit later production approval required',
      publishMarketplace: 'explicit later production approval required'
    },
    phases: [
      {
        id: 'authority-boundary',
        status: 'pass',
        summary: `Authority remains GitLab ${facts.integrationBranch} -> ${facts.exactReleaseLineBranch} with ${exactLine} retained as the current exact line.`
      },
      {
        id: 'staging-boundary',
        status: 'pass',
        summary: `GitFlow staging remains enforced through ${facts.integrationBranch}, ${facts.releaseBranchFamily}, ${facts.hotfixBranchFamily}, and the active foundation branch ${facts.activeFoundationBranch}.`
      },
      {
        id: 'production-mutation-policy',
        status: 'pass',
        summary: 'This initial factory contract is assess-only and forbids GitHub release, Marketplace, or other production mutation in this slice.'
      },
      {
        id: 'recovery-case',
        status,
        summary: blockerCode
          ? `Recovery remains frozen on ${exactLine}: ${blockerCode}.`
          : `No retained production blocker remains against ${exactLine}.`
      },
      {
        id: 'marketplace-boundary',
        status: marketplacePhaseStatus,
        summary: marketplacePhaseStatus === 'blocked'
          ? `Marketplace stays blocked at ${marketplaceVersion} until the public GitHub exact release closes cleanly.`
          : `Marketplace may proceed only after the public GitHub exact release is fully closed.`
      }
    ]
  };
}

function buildMarkdown(report) {
  const phaseLines = report.phases
    .map((phase) => `- ${phase.id}: \`${phase.status}\` - ${phase.summary}`)
    .join('\n');

  return [
    '# Software Factory Orchestrator Receipt',
    '',
    `- Recorded at: \`${report.recordedAt}\``,
    `- Status: \`${report.status}\``,
    `- Current branch: \`${report.currentBranch}\``,
    `- Current phase: \`${report.contract.currentPhase}\``,
    `- Supported phases: \`${report.contract.supportedPhases.join(', ')}\``,
    `- Planned phases: \`${report.contract.plannedPhases.join(', ')}\``,
    `- Production mutation allowed: \`${report.contract.productionMutationAllowed}\``,
    `- Sole production recovery target: \`${report.semverFreeze.soleProductionRecoveryTarget}\``,
    `- SemVer freeze: \`${report.semverFreeze.status}\``,
    `- Active foundation branch: \`${report.contract.activeFoundationBranch}\``,
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
    '- This contract is assess-only.',
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
    '## Phases',
    '',
    phaseLines,
    ''
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

  return {
    repoRoot,
    recordedAt: new Date().toISOString(),
    currentBranch: resolveCurrentBranch(spawnImpl),
    activeFoundationBranch: 'feature/software-factory-governance-foundation',
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
    publicGitHubExactTransactionReceiptPath:
      versionLineContract.publicGitHubExactTransactionReceiptPath ??
      DEFAULT_TRANSACTION_RECEIPT_PATH,
    publicGitHubMainCommit: currentTransaction.publicMainCommit,
    publicGitHubTag: currentTransaction.publicTag,
    publicGitHubDraftReleaseId: currentTransaction.draftReleaseId,
    publicGitHubLastPublishedRelease: publicReleaseCandidate.exactRelease?.version ?? null,
    blockerCode:
      currentTransaction.publishabilityBlockerCode ??
      currentTransaction.draftPublishabilityBlockerCode ??
      publicReleaseCandidate.activeBlockers?.[0]?.id ??
      null,
    blockerSummary:
      currentTransaction.publishabilityBlockerSummary ??
      currentTransaction.draftPublishabilityBlockerSummary ??
      publicReleaseCandidate.activeBlockers?.[0]?.summary ??
      null,
    repairInPlaceRequired: currentTransaction.repairInPlaceRequired === true,
    repairInPlaceAllowed: currentTransaction.repairInPlaceAllowed === true,
    nextAllowedAction: currentTransaction.nextAllowedAction ?? 'retain-current-blocker',
    publicGitHubReleasePublished:
      currentTransaction.publishabilityProbeStatus === 'passed' &&
      currentTransaction.safeToAttemptRepairPublish === true,
    marketplaceItem: publicReleaseCandidate.exactRelease?.marketplaceItemName ?? null,
    marketplaceVersion: publicReleaseCandidate.exactRelease?.marketplaceVersion ?? null
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
  const report = assessFactoryState(facts);
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
  DEFAULT_TRANSACTION_RECEIPT_PATH,
  assessFactoryState,
  buildMarkdown,
  collectFacts,
  getUsage,
  main,
  parseArgs,
  runAssessment,
  toRelativeReportPath
};
