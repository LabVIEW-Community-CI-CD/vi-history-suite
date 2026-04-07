import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

type SustainmentRules = {
  trancheId: string;
  issueId: string;
  programId: string;
  status: string;
  parallelOpenCloseout: {
    trancheId: string;
    issueId: string;
    programId: string;
    state: string;
  };
  releaseCadence: {
    model: string;
    versionLineContract: {
      retainedExactVersionReleases: string[];
      burnedExactVersionReleases?: string[];
      currentExactReleaseLine: string;
      currentMainPackageLine: string;
      currentDevelopPackageLine?: string;
      activeDevelopCandidateReleaseLine?: string | null;
      publicDefaultBranch?: string;
      publicCodespaceBranch: string;
      integrationBranch?: string;
      releaseBranch?: string;
      nextLineBranchModel?: string;
    };
    maintainedSurfaces: string[];
    refreshTriggers: string[];
    strictSemverRule?: string[];
    semverDecisionFramework?: {
      defaultGovernanceBump?: string;
      major?: string[];
      minor?: string[];
      patch?: string[];
      decisionRecordingRule?: string;
    };
    activeOpeningDecision?: {
      chosenBump?: string;
      targetDevelopCandidateReleaseLine?: string;
      rationale?: string[];
      rejectedAlternatives?: Record<string, string>;
    };
    explicitNonTriggers: string[];
  };
  benchmarkRefreshCadence: {
    model: string;
    acceptedComparablePrefix: {
      commitCount: number;
      pairCount: number;
    };
    acceptedCurrentContractBoundaries: Array<{
      surface: string;
      firstInvalidPair: number | string;
      characterization: string;
    }>;
    refreshTriggers: string[];
    explicitNonTriggers: string[];
    reopenTriggers: string[];
  };
  operatorSurfaceSustainment: {
    branchModel?: {
      model?: string;
      integrationBranch?: string;
      releaseBranch?: string;
      temporaryBranchPrefixes?: string[];
      promotionRules?: string[];
      requiredChecks?: string[];
      laneResponsibilities?: Record<string, string[]>;
    };
    requiredAuthorityUpdates: string[];
    requiredVerification: string[];
    requiredDerivedUpdatesWhenReaderFacingTruthChanges: string[];
    prohibitedBypasses: string[];
  };
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('post-release sustainment rules package', () => {
  it('keeps the active sustainment contract aligned across rules, queue, and entrypoint docs', () => {
    const rules = readJson<SustainmentRules>('docs/product/post-release-sustainment-rules.json');
    const rulesDoc = readText('docs/product/post-release-sustainment-rules.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const ship = readText('docs/product/SHIP-0001-releasable-vi-history-suite.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md'
    );
    const informationItemMap = readText('docs/information-item-map.md');

    expect(rules.trancheId).toBe('TRANCHE-012');
    expect(rules.issueId).toBe('ISSUE-0409');
    expect(rules.programId).toBe('PROGRAM-0004');
    expect(rules.status).toBe('active');
    expect(rules.parallelOpenCloseout).toEqual({
      trancheId: 'TRANCHE-010',
      issueId: 'ISSUE-0407',
      programId: 'PROGRAM-0002',
      state: 'reopened-on-docker-only-public-contract'
    });

    expect(rules.releaseCadence.model).toBe('event-driven');
    expect(rules.releaseCadence.versionLineContract).toEqual({
      retainedExactVersionReleases: ['v0.2.0', 'v1.0.0', 'v1.0.1', 'v1.0.2', 'v1.0.3', 'v1.0.4', 'v1.0.5', 'v1.0.6', 'v1.1.0'],
      burnedExactVersionReleases: ['v1.0.2'],
      currentExactReleaseLine: 'v1.1.0',
      currentMainPackageLine: '1.1.0',
      currentDevelopPackageLine: '1.1.0',
      activeDevelopCandidateReleaseLine: null,
      activeReleaseCandidateBranch: null,
      publicDefaultBranch: 'main',
      publicCodespaceBranch: 'develop',
      integrationBranch: 'develop',
      releaseBranch: 'main',
      nextLineBranchModel: 'gitflow-lite'
    });
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'preview-evidence/vi-history-suite-<version>.vsix'
    );
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'release-evidence/release-manifest.json'
    );
    expect(rules.releaseCadence.refreshTriggers).toContain('package.json version change');
    expect(rules.releaseCadence.refreshTriggers).toContain(
      'release-procedure, ship-control, or docs-workbench publication contract change'
    );
    expect(rules.releaseCadence.strictSemverRule).toEqual(
      expect.arrayContaining([
        'after an exact release is published, the current published package line on main shall match that exact release line',
        'when develop carries post-release work, the develop package line shall advance to the next exact release candidate before public-facing normalization continues',
        'any later repo change intended for publication shall advance package.json and the top CHANGELOG.md heading to the next SemVer line before further normalization or publication',
        'future sessions shall not treat an unreleased SemVer bump as complete until the matching public tag and public GitHub release are both published',
        'future sessions shall not keep landing post-release changes on the previous exact release version number',
        'future sessions shall not treat a burned exact release as the green release baseline for later publication'
      ])
    );
    expect(rules.releaseCadence.semverDecisionFramework).toEqual(
      expect.objectContaining({
        defaultGovernanceBump: 'patch',
        decisionRecordingRule:
          'record the chosen bump rationale in the control plane before further publication or release normalization continues'
      })
    );
    expect(rules.releaseCadence.semverDecisionFramework?.major).toEqual(
      expect.arrayContaining([
        'breaks or removes a governed public or maintainer contract on purpose'
      ])
    );
    expect(rules.releaseCadence.semverDecisionFramework?.minor).toEqual(
      expect.arrayContaining([
        'adds a new governed capability or supported workflow without breaking the current exact released line'
      ])
    );
    expect(rules.releaseCadence.semverDecisionFramework?.patch).toEqual(
      expect.arrayContaining([
        'fixes or hardens an existing workflow, release rule, procedure, branch policy, or CI posture without breaking the exact released contract'
      ])
    );
    expect(rules.releaseCadence.activeOpeningDecision).toEqual(
      expect.objectContaining({
        chosenBump: 'minor',
        targetDevelopCandidateReleaseLine: 'v1.1.0'
      })
    );
    expect(rules.releaseCadence.activeOpeningDecision?.rationale).toEqual(
      expect.arrayContaining([
        'the next line adds one governed hosted branch-protection and CI responsibility capability across authority GitLab, the public GitHub facade, and GitHub experiment lanes'
      ])
    );

    expect(rules.benchmarkRefreshCadence.model).toBe('event-driven-bounded');
    expect(rules.benchmarkRefreshCadence.acceptedComparablePrefix).toEqual({
      commitCount: 129,
      pairCount: 128
    });
    expect(rules.benchmarkRefreshCadence.acceptedCurrentContractBoundaries).toContainEqual({
      surface: 'windows-benchmark-image',
      firstInvalidPair: 129,
      characterization: 'mixed-bitness-call-by-reference-seam'
    });
    expect(rules.benchmarkRefreshCadence.acceptedCurrentContractBoundaries).toContainEqual({
      surface: 'linux-benchmark-image',
      firstInvalidPair: '135/138',
      characterization:
        'linux-headless-recursive-load / labview-cli-connection-failed after one CloseLabVIEW recovery attempt'
    });
    expect(rules.benchmarkRefreshCadence.reopenTriggers).toContain(
      'the current governed Windows benchmark image contract gains same-bitness x86 provisioning'
    );
    expect(rules.benchmarkRefreshCadence.explicitNonTriggers).toContain(
      'out-of-scope alternative Windows x86 provisioning that is not part of the current governed image contract'
    );

    expect(rules.operatorSurfaceSustainment.branchModel.model).toBe('gitflow-lite');
    expect(rules.operatorSurfaceSustainment.branchModel.integrationBranch).toBe('develop');
    expect(rules.operatorSurfaceSustainment.branchModel.releaseBranch).toBe('main');
    expect(rules.operatorSurfaceSustainment.branchModel.temporaryBranchPrefixes).toEqual([
      'feature/',
      'release/',
      'hotfix/'
    ]);
    expect(rules.operatorSurfaceSustainment.branchModel.promotionRules).toEqual(
      expect.arrayContaining([
        'public GitHub default branch remains main so readers land on the latest exact released line by default',
        'feature/* branches target develop',
        'release/* branches are cut from develop and merge to main plus back into develop',
        'hotfix/* branches are cut from main and merge to main plus back into develop',
        'exact SemVer tags are cut from main only after the protected main pipeline succeeds',
        'local public-source promotion/check binds the intended checkout through --target-root or VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT and fails closed when the target repo is dirty'
      ])
    );
    expect(rules.operatorSurfaceSustainment.branchModel.requiredChecks).toEqual([
      'docs_continuous_integration',
      'docs_public_continuous_integration',
      'docs_internal_continuous_integration',
      'test_extension',
      'package_extension_preview',
      'Public Facade Package Preview / package-preview',
      'Public Facade Linux Smoke / public-facade-linux-smoke'
    ]);
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities).toEqual({
      'feature/*': [
        'focused tests for the changed surface',
        'affected documentation or design gates before merge to develop'
      ],
      develop: [
        'required checks',
        'npm run design:gate',
        'npm run design:gate:assert-complete for governance or architecture work'
      ],
      'release/*': [
        'required checks',
        'design gates',
        'release-readiness normalization',
        'public-facade proof before merge to main'
      ],
      'hotfix/*': [
        'focused regression checks',
        'affected documentation or design gates',
        'exact released-line package audit before merge to main'
      ],
      main: ['protected exact-release branch', 'exact SemVer tags only after merged main is green']
    });
    expect(rules.operatorSurfaceSustainment.branchModel.publicSourcePromotion).toEqual({
      defaultTargetRoot: '../vi-history-suite.public',
      explicitBindingOptions: ['--target-root', 'VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT'],
      dirtyTargetPolicy: 'fail-closed-before-compare-or-write'
    });
    expect(rules.operatorSurfaceSustainment.branchModel.findingRequirementDiscipline).toEqual(
      expect.arrayContaining([
        'every governed finding is classified before slice closeout as requirements-update-required or no-requirement-impact'
      ])
    );
    expect(rules.operatorSurfaceSustainment.branchModel.findingAdrDiscipline).toEqual(
      expect.arrayContaining([
        'every governed finding is classified before slice closeout as adr-update-required or no-adr-impact'
      ])
    );
    expect(rules.operatorSurfaceSustainment.publicWorkflowGovernance).toEqual(
      expect.objectContaining({
        model: 'two-workflow-public-facade-pair',
        workflows: {
          packagePreview: expect.objectContaining({
            workflowName: 'Public Facade Package Preview',
            requiredCheckName: 'package-preview',
            featurePushLane: 'forbidden',
            concurrency: 'per-workflow-per-ref-cancel-in-progress'
          }),
          linuxSmoke: expect.objectContaining({
            workflowName: 'Public Facade Linux Smoke',
            requiredCheckName: 'public-facade-linux-smoke',
            featurePushLane: 'forbidden',
            concurrency: 'per-workflow-per-ref-cancel-in-progress'
          })
        }
      })
    );
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/hosted-ci-governance.md'
    );
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/hosted-ci-governance.json'
    );
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/post-release-sustainment-rules.md'
    );
    expect(rules.operatorSurfaceSustainment.requiredDerivedUpdatesWhenReaderFacingTruthChanges).toContain(
      'docs/product/wiki-publication-ledger.json'
    );
    expect(rules.operatorSurfaceSustainment.requiredVerification).toContain(
      'npm run design:gate:assert-complete'
    );
    expect(rules.operatorSurfaceSustainment.prohibitedBypasses).toContain(
      'execution-policy bypass that skips canonical execution-request validation'
    );
    expect(rules.operatorSurfaceSustainment.prohibitedBypasses).toContain(
      'PowerShell ExecutionPolicy Bypass on governed benchmark-image or host-proof helper surfaces'
    );

    expect(rulesDoc).toContain('## Release Refresh Rules');
    expect(rulesDoc).toContain('Current version-line contract:');
    expect(rulesDoc).toContain('Strict SemVer rule after an exact release');
    expect(rulesDoc).toContain('Decision framework for choosing `major`, `minor`, or `patch`:');
    expect(rulesDoc).toContain('## Benchmark Refresh Rules');
    expect(rulesDoc).toContain('## Operator And Documentation Upkeep Rules');
    expect(rulesDoc).toContain('public GitHub default branch: `main`');
    expect(rulesDoc).toContain('current exact released line: `v1.1.0`');
    expect(rulesDoc).toContain('no newer exact release candidate line is active on `develop` yet');
    expect(rulesDoc).toContain('chosen bump: `minor`');
    expect(rulesDoc).toContain('develop');
    expect(rulesDoc).toContain('release branch');
    expect(rulesDoc).toContain('required checks');
    expect(rulesDoc).toContain('gitflow-lite');
    expect(rulesDoc).toContain('Hosted automation governance is now retained explicitly:');
    expect(rulesDoc).toContain('Lane-specific CI and gate responsibilities:');
    expect(rulesDoc).toContain('Public GitHub workflow responsibility matrix:');
    expect(rulesDoc).toContain('preview VSIX packaging and preview-artifact upload');
    expect(rulesDoc).toContain('Docker Linux engine verification');
    expect(rulesDoc).toContain('per-workflow/per-ref concurrency');
    expect(rulesDoc).toContain('neither public GitHub workflow uses a `feature/*` push lane');
    expect(rulesDoc).toContain('feature/*');
    expect(rulesDoc).toContain('hotfix/*');
    expect(rulesDoc).toContain('design:gate');
    expect(rulesDoc).toContain('burned exact release line');
    expect(rulesDoc).toContain('PROGRAM-0002');
    expect(rulesDoc).toContain('execution-policy bypass');
    expect(rulesDoc).toContain('ExecutionPolicy Bypass');

    expect(readme).toContain(
      '[Post-Release Sustainment Rules](./docs/product/post-release-sustainment-rules.md)'
    );
    expect(currentState).toContain(
      '[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)'
    );
    expect(ship).toContain('[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)');
    expect(program).toContain('[post-release-sustainment-rules.md](../post-release-sustainment-rules.md)');
    expect(issue).toContain('docs/product/post-release-sustainment-rules.md');
    expect(issue).toContain('reopened `PROGRAM-0002`');

    expect(informationItemMap).toContain(
      '| Post-release sustainment rules | `docs/product/post-release-sustainment-rules.md` |'
    );
    expect(informationItemMap).toContain(
      '| Machine-readable post-release sustainment rules | `docs/product/post-release-sustainment-rules.json` |'
    );
  });
});
