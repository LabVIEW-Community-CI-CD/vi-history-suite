import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const orchestrator = require(path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'runSoftwareFactoryOrchestrator.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  DEFAULT_PHASE_RECEIPT_PATHS: Record<string, string>;
  PHASES: string[];
  assessFactoryState: (facts: Record<string, unknown>) => Record<string, any>;
  rehearseFactoryState: (facts: Record<string, unknown>) => Record<string, any>;
  repairFactoryState: (facts: Record<string, unknown>) => Record<string, any>;
  publishFactoryState: (facts: Record<string, unknown>) => Record<string, any>;
  verifyFactoryState: (facts: Record<string, unknown>) => Record<string, any>;
  buildMarkdown: (report: Record<string, any>) => string;
  parseArgs: (argv: string[]) => {
    helpRequested: boolean;
    phase: string;
    evidenceDir: string;
  };
};

const baseFacts = {
  recordedAt: '2026-04-22T23:59:59.000Z',
  repoRoot: 'C:/dev/vihs',
  currentBranch: 'feature/vscode-marketplace-v1.3.7-publication-prep',
  activeFeatureBranch: null,
  integrationBranch: 'develop',
  exactReleaseLineBranch: 'main',
  releaseBranchFamily: 'release/*',
  hotfixBranchFamily: 'hotfix/*',
  featureBranchFamily: 'feature/*',
  exactLine: 'v1.3.7',
  packageLine: '1.3.7',
  developPackageLine: '1.3.7',
  semverFrozen: true,
  semverFreezeRationale:
    'Later SemVer openings remain frozen while exact v1.3.7 is closed on public GitHub but still pending the separate VS Code Marketplace publication act.',
  requiredChecks: ['public_exact_pretag_proof', 'test_extension'],
  preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
  publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:assess',
  publicGitHubExactTransactionReceiptPath:
    '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
  publicGitHubMainCommit: '704e629eed72d7ea5f46e2e45b1e17e58655edce',
  publicGitHubTag: 'v1.3.7',
  publicGitHubDraftReleaseId: 312517425,
  publicGitHubLastPublishedRelease: 'v1.3.7',
  blockerCode: null,
  blockerSummary: null,
  repairInPlaceRequired: false,
  repairInPlaceAllowed: false,
  nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation',
  publicGitHubReleasePublished: true,
  marketplaceItem: 'svelderrainruiz.vi-history-suite',
  marketplaceVersion: '1.3.0',
  authorityReleaseManifestPath:
    '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json',
  releaseAssetsRetainedAgainstManifest: true,
  draftPublishabilityByIdStatusCode: 200,
  draftPublishabilityTagMatchesAuthority: true,
  safeToAttemptRepairPublish: false,
  draftReleaseUrl:
    'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7',
  draftReleaseTargetCommitish: 'main',
  draftReleaseLookupStatusCode: 200,
  immutableReleasesEnabled: true,
  immutableReleasesEnforcedByOwner: false
};

describe('software factory orchestrator contract', () => {
  it('parses default and explicit phase/evidence-dir arguments', () => {
    expect(orchestrator.parseArgs([])).toEqual({
      helpRequested: false,
      phase: 'assess',
      evidenceDir: orchestrator.DEFAULT_EVIDENCE_DIR
    });

    const explicitDir = path.resolve('tmp', 'factory-rehearse');
    expect(orchestrator.parseArgs(['--phase', 'rehearse', '--evidence-dir', explicitDir])).toEqual(
      {
        helpRequested: false,
        phase: 'rehearse',
        evidenceDir: explicitDir
      }
    );
  });

  it('retains an assess-phase factory state for GitHub-closed v1.3.7 with Marketplace pending', () => {
    const report = orchestrator.assessFactoryState(baseFacts);

    expect(report.status).toBe('blocked');
    expect(report.contract).toEqual(
      expect.objectContaining({
        currentPhase: 'assess',
        supportedPhases: ['assess', 'rehearse', 'repair', 'publish', 'verify'],
        admittedNonProductionPhases: ['assess', 'rehearse', 'repair'],
        guardedNonMutatingContractPhases: ['publish', 'verify'],
        assessOnly: false,
        nonProductionOnly: true,
        productionMutationAllowed: false,
        activeFeatureBranch: null
      })
    );
    expect(report.receiptContract).toEqual({
      packageScripts: {
        assess: 'npm run software:factory:assess',
        rehearse: 'npm run software:factory:rehearse',
        repair: 'npm run software:factory:repair',
        publish: 'npm run software:factory:publish',
        verify: 'npm run software:factory:verify',
        marketplacePrepare: 'npm run vscode:marketplace:prepare'
      },
      receiptPaths: {
        ...orchestrator.DEFAULT_PHASE_RECEIPT_PATHS,
        marketplacePrepare:
          '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json'
      },
      currentPhaseReceiptPath: '.cache/software-factory-orchestrator/latest/software-factory-state.json'
    });
    expect(report.recoveryRules).toEqual({
      repairInPlaceRequired: false,
      repairInPlaceAllowed: false,
      noBumpRule: true,
      receiptDrivenRecovery: true,
      publicGitHubExactTransactionReceiptPath:
        '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
      nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'authority-boundary', status: 'pass' }),
        expect.objectContaining({ id: 'production-mutation-policy', status: 'pass' }),
        expect.objectContaining({ id: 'recovery-case', status: 'pass' }),
        expect.objectContaining({ id: 'marketplace-boundary', status: 'blocked' })
      ])
    );
  });

  it('retains a non-production rehearse contract without admitting production mutation', () => {
    const report = orchestrator.rehearseFactoryState(baseFacts);

    expect(report.status).toBe('blocked');
    expect(report.contract.currentPhase).toBe('rehearse');
    expect(report.rehearsalContract).toEqual({
      status: 'pass',
      nonMutating: true,
      packageScript: 'npm run software:factory:rehearse',
      receiptPath: '.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json',
      transactionReceiptPath:
        '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
      targetTag: 'v1.3.7',
      targetDraftReleaseId: 312517425,
      targetDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json',
      exactAssetsRetainedAgainstManifest: true,
      draftReleaseReadableById: true,
      draftReleaseTagMatchesAuthority: true,
      immutableReleasesEnabled: true,
      safePublishTransitionProven: false,
      nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rehearsal-readiness', status: 'pass' }),
        expect.objectContaining({ id: 'rehearsal-publishability-boundary', status: 'pass' })
      ])
    );
  });

  it('retains a non-production repair contract with deferred write actions only', () => {
    const report = orchestrator.repairFactoryState(baseFacts);

    expect(report.status).toBe('blocked');
    expect(report.contract.currentPhase).toBe('repair');
    expect(report.repairContract).toEqual({
      status: 'pass',
      nonMutating: true,
      mutationPermitted: false,
      packageScript: 'npm run software:factory:repair',
      receiptPath: '.cache/software-factory-orchestrator/latest/repair/software-factory-state.json',
      targetMode: 'github-release-repair-not-required-marketplace-pending',
      targetTag: 'v1.3.7',
      targetDraftReleaseId: 312517425,
      targetDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json',
      exactAssetsRetainedAgainstManifest: true,
      draftReleaseReadableById: true,
      draftReleaseTagMatchesAuthority: true,
      safePublishTransitionProven: false,
      currentBlockerCode: null,
      nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation',
      deferredWriteActions: [
        'prepare-vscode-marketplace-v1.3.7-publication',
        'publish-vscode-marketplace-v1.3.7-after-explicit-approval',
        'verify-vscode-marketplace-v1.3.7-publication'
      ],
      rule:
        'This repair contract remains non-mutating; GitHub repair is closed and the later Marketplace publish/verify phases still require separate explicit production approval.'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'repair-contract', status: 'pass' }),
        expect.objectContaining({ id: 'repair-write-boundary', status: 'pass' })
      ])
    );
  });

  it('retains a guarded non-mutating publish contract without admitting any production write action', () => {
    const report = orchestrator.publishFactoryState(baseFacts);

    expect(report.status).toBe('blocked');
    expect(report.contract.currentPhase).toBe('publish');
    expect(report.publishContract).toEqual({
      status: 'pass',
      nonMutating: true,
      mutationPermitted: false,
      packageScript: 'npm run software:factory:publish',
      receiptPath: '.cache/software-factory-orchestrator/latest/publish/software-factory-state.json',
      targetMode: 'vscode-marketplace-publication-guard',
      targetTag: 'v1.3.7',
      targetDraftReleaseId: 312517425,
      targetDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json',
      exactAssetsRetainedAgainstManifest: true,
      draftReleaseReadableById: true,
      draftReleaseTagMatchesAuthority: true,
      safePublishTransitionProven: false,
      currentBlockerCode: null,
      deferredWriteAction: 'publish-vscode-marketplace-v1.3.7-with-pinned-vsce',
      nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation',
      rule:
        'This guarded publish contract remains non-mutating; it retains the exact Marketplace publish preconditions and still forbids VS Code Marketplace publication in this slice.'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'publish-contract', status: 'pass' }),
        expect.objectContaining({ id: 'publish-mutation-boundary', status: 'blocked' })
      ])
    );
  });

  it('retains a guarded non-mutating verify contract without claiming live publication verification', () => {
    const report = orchestrator.verifyFactoryState(baseFacts);

    expect(report.status).toBe('blocked');
    expect(report.contract.currentPhase).toBe('verify');
    expect(report.verifyContract).toEqual({
      status: 'pass',
      nonMutating: true,
      mutationPermitted: false,
      packageScript: 'npm run software:factory:verify',
      receiptPath: '.cache/software-factory-orchestrator/latest/verify/software-factory-state.json',
      targetMode: 'post-publish-verify-guard',
      targetTag: 'v1.3.7',
      targetDraftReleaseId: 312517425,
      expectedGitHubRelease: 'v1.3.7',
      expectedMarketplaceVersion: '1.3.7',
      currentPublishedGitHubRelease: 'v1.3.7',
      currentMarketplaceVersion: '1.3.0',
      currentBlockerCode: null,
      deferredReadActions: [
        'verify-public-github-release-publication',
        'verify-public-github-release-assets-and-checksums',
        'prepare-vscode-marketplace-v1.3.7-publication',
        'verify-marketplace-v1.3.7-after-marketplace-publication'
      ],
      nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation',
      rule:
        'This guarded verify contract remains non-mutating; it retains the exact post-publish verification expectations and still forbids any production mutation in this slice.'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'verify-contract', status: 'pass' }),
        expect.objectContaining({ id: 'verify-production-readiness', status: 'blocked' })
      ])
    );
  });

  it('renders the admitted non-production phases and deferred repair actions in markdown', () => {
    const markdown = orchestrator.buildMarkdown(orchestrator.verifyFactoryState(baseFacts));

    expect(markdown).toContain('# Software Factory Orchestrator Receipt');
    expect(markdown).toContain('Current phase: `verify`');
    expect(markdown).toContain('Supported phases: `assess, rehearse, repair, publish, verify`');
    expect(markdown).toContain('Admitted non-production phases: `assess, rehearse, repair`');
    expect(markdown).toContain('Guarded non-mutating contract phases: `publish, verify`');
    expect(markdown).toContain('Non-production only: `true`');
    expect(markdown).toContain('`npm run software:factory:rehearse`');
    expect(markdown).toContain('`npm run software:factory:repair`');
    expect(markdown).toContain('`npm run software:factory:publish`');
    expect(markdown).toContain('`npm run software:factory:verify`');
    expect(markdown).toContain('`npm run vscode:marketplace:prepare`');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/repair/software-factory-state.json');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/publish/software-factory-state.json');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/verify/software-factory-state.json');
    expect(markdown).toContain('## Verify Contract');
    expect(markdown).toContain('Deferred read actions: verify-public-github-release-publication');
    expect(markdown).toContain('No GitHub release publication, Marketplace publication, or other production mutation is permitted in this slice.');
  });
});
