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
  DEFAULT_TRANSACTION_RECEIPT_PATH: string;
  assessFactoryState: (facts: Record<string, unknown>) => {
    status: string;
    contract: {
      currentPhase: string;
      supportedPhases: string[];
      plannedPhases: string[];
      assessOnly: boolean;
      productionMutationAllowed: boolean;
      activeFoundationBranch: string;
    };
    semverFreeze: {
      status: string;
      openingNewSemverAllowed: boolean;
      soleProductionRecoveryTarget: string;
    };
    currentIncident: {
      blockerCode: string | null;
      status: string;
    };
    recoveryRules: {
      repairInPlaceRequired: boolean;
      repairInPlaceAllowed: boolean;
      nextAllowedAction: string;
    };
    productionBoundary: {
      publicGitHubDraftReleaseId: number;
      publicGitHubLastPublishedRelease: string;
      vscodeMarketplaceVersion: string;
    };
    phases: Array<{ id: string; status: string; summary: string }>;
  };
  buildMarkdown: (report: Record<string, any>) => string;
  parseArgs: (argv: string[]) => {
    helpRequested: boolean;
    evidenceDir: string;
  };
};

describe('software factory orchestrator contract', () => {
  it('parses default and explicit evidence-dir arguments', () => {
    expect(orchestrator.parseArgs([])).toEqual({
      helpRequested: false,
      evidenceDir: orchestrator.DEFAULT_EVIDENCE_DIR
    });

    const explicitDir = path.resolve('tmp', 'factory-assess');
    expect(orchestrator.parseArgs(['--evidence-dir', explicitDir])).toEqual({
      helpRequested: false,
      evidenceDir: explicitDir
    });
  });

  it('retains an assess-only blocked factory state for the frozen v1.3.6 recovery case', () => {
    const report = orchestrator.assessFactoryState({
      recordedAt: '2026-04-22T23:59:59.000Z',
      repoRoot: 'C:/dev/vihs',
      currentBranch: 'feature/software-factory-governance-foundation',
      activeFoundationBranch: 'feature/software-factory-governance-foundation',
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
      publicGitHubExactTransactionPackageScript:
        'npm run public:github:exact:transaction:assess',
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
      marketplaceVersion: '1.3.0'
    });

    expect(report.status).toBe('blocked');
    expect(report.contract).toEqual(
      expect.objectContaining({
        currentPhase: 'assess',
        supportedPhases: ['assess'],
        plannedPhases: ['rehearse', 'repair', 'publish', 'verify'],
        assessOnly: true,
        productionMutationAllowed: false,
        activeFoundationBranch: 'feature/software-factory-governance-foundation'
      })
    );
    expect(report.semverFreeze).toEqual({
      status: 'frozen',
      openingNewSemverAllowed: false,
      soleProductionRecoveryTarget: 'v1.3.6',
      rationale:
        'Later SemVer openings remain frozen while the current exact public GitHub repair state on v1.3.6 stays incomplete.'
    });
    expect(report.currentIncident).toEqual({
      id: 'FACTORY-INCIDENT-v1.3.6',
      class: 'production-partial-public-state',
      status: 'blocked',
      blockerCode: 'draft-release-tag-lookup-unavailable',
      blockerSummary:
        'Immutable releases are enabled while exact-tag release lookup still returns 404.'
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
    expect(report.productionBoundary).toEqual(
      expect.objectContaining({
        publicGitHubDraftReleaseId: 312363117,
        publicGitHubLastPublishedRelease: 'v1.3.1',
        vscodeMarketplaceVersion: '1.3.0'
      })
    );
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'authority-boundary', status: 'pass' }),
        expect.objectContaining({ id: 'production-mutation-policy', status: 'pass' }),
        expect.objectContaining({ id: 'recovery-case', status: 'blocked' }),
        expect.objectContaining({ id: 'marketplace-boundary', status: 'blocked' })
      ])
    );
  });

  it('renders the factory boundaries and frozen recovery case in markdown', () => {
    const markdown = orchestrator.buildMarkdown({
      recordedAt: '2026-04-22T23:59:59.000Z',
      status: 'blocked',
      currentBranch: 'feature/software-factory-governance-foundation',
      contract: {
        currentPhase: 'assess',
        supportedPhases: ['assess'],
        plannedPhases: ['rehearse', 'repair', 'publish', 'verify'],
        productionMutationAllowed: false,
        activeFoundationBranch: 'feature/software-factory-governance-foundation'
      },
      semverFreeze: {
        soleProductionRecoveryTarget: 'v1.3.6',
        status: 'frozen'
      },
      authorityBoundary: {
        integrationBranch: 'develop',
        exactReleaseLineBranch: 'main',
        currentExactLine: 'v1.3.6',
        releaseBranchFamily: 'release/*',
        hotfixBranchFamily: 'hotfix/*'
      },
      stagingBoundary: {
        branchModel: 'gitflow'
      },
      productionBoundary: {
        publicGitHubMainCommit: 'bd81bfe',
        publicGitHubTag: 'v1.3.6',
        vscodeMarketplaceVersion: '1.3.0'
      },
      currentIncident: {
        blockerCode: 'draft-release-tag-lookup-unavailable'
      },
      recoveryRules: {
        nextAllowedAction:
          'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven'
      },
      trustModel: {
        authoritySurfaces: ['GitLab authority repo'],
        productionSurfaces: ['public GitHub main/tag/release', 'VS Code Marketplace'],
        operatorSurfaces: ['Windows operator host'],
        secretClasses: ['GitHub token', 'VS Code Marketplace PAT']
      },
      environmentBaseline: {
        operatorHost: 'Windows host with standard installs only',
        standardToolchains: ['Git for Windows', 'Node.js 22 LTS', 'Python 3.12 x64'],
        linuxAssuranceDistro: 'Ubuntu-24.04',
        standardsSkill: 'repo-standards-review preflight must pass before governed requirements/control-surface edits'
      },
      phases: [
        {
          id: 'recovery-case',
          status: 'blocked',
          summary: 'Recovery remains frozen on v1.3.6: draft-release-tag-lookup-unavailable.'
        }
      ]
    });

    expect(markdown).toContain('# Software Factory Orchestrator Receipt');
    expect(markdown).toContain('Current phase: `assess`');
    expect(markdown).toContain('Sole production recovery target: `v1.3.6`');
    expect(markdown).toContain('Production mutation allowed: `false`');
    expect(markdown).toContain('public GitHub `bd81bfe` / tag `v1.3.6`, Marketplace `1.3.0`');
    expect(markdown).toContain('repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven');
    expect(markdown).toContain('No GitHub release publication, Marketplace publication, or other production mutation is permitted in this slice.');
    expect(markdown).toContain('GitLab authority repo');
    expect(markdown).toContain('GitHub token, VS Code Marketplace PAT');
  });
});
