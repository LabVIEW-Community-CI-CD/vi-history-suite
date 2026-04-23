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
  currentBranch: 'feature/software-factory-publish-verify-contract',
  activeFeatureBranch: 'feature/software-factory-publish-verify-contract',
  integrationBranch: 'develop',
  exactReleaseLineBranch: 'main',
  releaseBranchFamily: 'release/*',
  hotfixBranchFamily: 'hotfix/*',
  featureBranchFamily: 'feature/*',
  exactLine: 'v1.3.6',
  packageLine: '1.3.6',
  developPackageLine: '1.3.6',
  semverFrozen: true,
  semverFreezeRationale:
    'Later SemVer openings remain frozen while the current exact public GitHub repair state on v1.3.6 stays incomplete.',
  requiredChecks: ['public_exact_pretag_proof', 'test_extension'],
  preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
  publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:assess',
  publicGitHubExactTransactionReceiptPath:
    '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
  publicGitHubMainCommit: 'bd81bfe6743348c9138c3f0f4967c790a235184f',
  publicGitHubTag: 'v1.3.6',
  publicGitHubDraftReleaseId: 312363117,
  publicGitHubLastPublishedRelease: 'v1.3.1',
  blockerCode: 'draft-release-tag-lookup-unavailable',
  blockerSummary:
    'Immutable releases are enabled while exact-tag release lookup still returns 404.',
  repairInPlaceRequired: true,
  repairInPlaceAllowed: true,
  nextAllowedAction:
    'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven',
  publicGitHubReleasePublished: false,
  marketplaceItem: 'svelderrainruiz.vi-history-suite',
  marketplaceVersion: '1.3.0',
  authorityReleaseManifestPath:
    '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json',
  releaseAssetsRetainedAgainstManifest: true,
  draftPublishabilityByIdStatusCode: 200,
  draftPublishabilityTagMatchesAuthority: true,
  safeToAttemptRepairPublish: false,
  draftReleaseUrl:
    'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
  draftReleaseTargetCommitish: 'main',
  draftReleaseLookupStatusCode: 404,
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

  it('retains an assess-phase blocked factory state for the frozen v1.3.6 recovery case', () => {
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
        activeFeatureBranch: 'feature/software-factory-publish-verify-contract'
      })
    );
    expect(report.receiptContract).toEqual({
      packageScripts: {
        assess: 'npm run software:factory:assess',
        rehearse: 'npm run software:factory:rehearse',
        repair: 'npm run software:factory:repair',
        publish: 'npm run software:factory:publish',
        verify: 'npm run software:factory:verify'
      },
      receiptPaths: orchestrator.DEFAULT_PHASE_RECEIPT_PATHS,
      currentPhaseReceiptPath: '.cache/software-factory-orchestrator/latest/software-factory-state.json'
    });
    expect(report.recoveryRules).toEqual({
      repairInPlaceRequired: true,
      repairInPlaceAllowed: true,
      noBumpRule: true,
      receiptDrivenRecovery: true,
      publicGitHubExactTransactionReceiptPath:
        '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
      nextAllowedAction:
        'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'authority-boundary', status: 'pass' }),
        expect.objectContaining({ id: 'production-mutation-policy', status: 'pass' }),
        expect.objectContaining({ id: 'recovery-case', status: 'blocked' }),
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
      targetTag: 'v1.3.6',
      targetDraftReleaseId: 312363117,
      targetDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json',
      exactAssetsRetainedAgainstManifest: true,
      draftReleaseReadableById: true,
      draftReleaseTagMatchesAuthority: true,
      immutableReleasesEnabled: true,
      safePublishTransitionProven: false,
      nextAllowedAction:
        'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rehearsal-readiness', status: 'pass' }),
        expect.objectContaining({ id: 'rehearsal-publishability-boundary', status: 'blocked' })
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
      targetMode: 'repair-in-place',
      targetTag: 'v1.3.6',
      targetDraftReleaseId: 312363117,
      targetDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json',
      exactAssetsRetainedAgainstManifest: true,
      draftReleaseReadableById: true,
      draftReleaseTagMatchesAuthority: true,
      safePublishTransitionProven: false,
      currentBlockerCode: 'draft-release-tag-lookup-unavailable',
      nextAllowedAction:
        'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven',
      deferredWriteActions: [
        'publish-existing-github-draft-release-in-place',
        'verify-public-github-release-publication',
        'verify-marketplace-remains-blocked-until-github-release-closes',
        'publish-vscode-marketplace-v1.3.6-after-github-release-verification'
      ],
      rule:
        'This repair contract remains non-mutating; later publish and verify phases still require separate explicit production approval after safe publishability is proven.'
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'repair-contract', status: 'pass' }),
        expect.objectContaining({ id: 'repair-write-boundary', status: 'blocked' })
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
      targetMode: 'publish-in-place-guard',
      targetTag: 'v1.3.6',
      targetDraftReleaseId: 312363117,
      targetDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json',
      exactAssetsRetainedAgainstManifest: true,
      draftReleaseReadableById: true,
      draftReleaseTagMatchesAuthority: true,
      safePublishTransitionProven: false,
      currentBlockerCode: 'draft-release-tag-lookup-unavailable',
      deferredWriteAction: 'publish-existing-github-draft-release-in-place',
      nextAllowedAction:
        'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven',
      rule:
        'This guarded publish contract remains non-mutating; it retains the exact in-place publish preconditions and still forbids GitHub release publication in this slice.'
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
      targetTag: 'v1.3.6',
      targetDraftReleaseId: 312363117,
      expectedGitHubRelease: 'v1.3.6',
      expectedMarketplaceVersion: '1.3.6',
      currentPublishedGitHubRelease: 'v1.3.1',
      currentMarketplaceVersion: '1.3.0',
      currentBlockerCode: 'draft-release-tag-lookup-unavailable',
      deferredReadActions: [
        'verify-public-github-release-publication',
        'verify-public-github-release-assets-and-checksums',
        'verify-marketplace-remains-blocked-until-github-release-closes',
        'verify-marketplace-v1.3.6-after-github-release-publication'
      ],
      nextAllowedAction:
        'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven',
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
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/repair/software-factory-state.json');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/publish/software-factory-state.json');
    expect(markdown).toContain('.cache/software-factory-orchestrator/latest/verify/software-factory-state.json');
    expect(markdown).toContain('## Verify Contract');
    expect(markdown).toContain('Deferred read actions: verify-public-github-release-publication');
    expect(markdown).toContain('No GitHub release publication, Marketplace publication, or other production mutation is permitted in this slice.');
  });
});
