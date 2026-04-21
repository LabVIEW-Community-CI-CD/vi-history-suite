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
  nextRuntimeProviderPublicAcceptanceGate?: {
    pathMd: string;
    pathJson: string;
    state: string;
    trancheId: string;
    issueId: string;
    programId: string;
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
      hotfixBranch?: string;
      exactReleaseLineBranch?: string;
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
    candidateStateModel?: {
      orderedStates?: string[];
      reviewReadyRule?: string;
      dirtyPublicSurfaceRule?: string;
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
      hotfixBranch?: string;
      exactReleaseLineBranch?: string;
      temporaryBranchPrefixes?: string[];
      promotionRules?: string[];
      requiredChecks?: string[];
      governedLaneBehaviors?: Record<string, unknown>;
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
      state: 'historical-docker-only-public-closeout'
    });
    expect(rules.nextRuntimeProviderPublicAcceptanceGate).toEqual({
      pathMd: 'docs/product/runtime-provider-public-acceptance-gate.md',
      pathJson: 'docs/product/runtime-provider-public-acceptance-gate.json',
      state: 'closed',
      trancheId: 'TRANCHE-016',
      issueId: 'ISSUE-0412',
      programId: 'PROGRAM-0005'
    });

    expect(rules.releaseCadence.model).toBe('event-driven');
    expect(rules.releaseCadence.versionLineContract).toEqual({
      retainedExactVersionReleases: ['v0.2.0', 'v1.0.0', 'v1.0.1', 'v1.0.2', 'v1.0.3', 'v1.0.4', 'v1.0.5', 'v1.0.6', 'v1.1.0', 'v1.2.0', 'v1.2.1', 'v1.2.2', 'v1.3.0'],
      burnedExactVersionReleases: ['v1.0.2'],
      currentExactReleaseLine: 'v1.3.0',
      currentMainPackageLine: '1.3.0',
      currentDevelopPackageLine: '1.3.0',
      activeDevelopCandidateReleaseLine: null,
      activeReleaseCandidateBranch: null,
      publicDefaultBranch: 'main',
      publicCodespaceBranch: 'develop',
      integrationBranch: 'develop',
      releaseBranch: 'release/*',
      hotfixBranch: 'hotfix/*',
      exactReleaseLineBranch: 'main',
      nextLineBranchModel: 'gitflow'
    });
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'preview-evidence/vi-history-suite-<version>.vsix'
    );
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'release-evidence/release-manifest.json'
    );
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'docs/product/vscode-marketplace-publication-ledger.md'
    );
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'VS Code Marketplace listing and installed-user homepage'
    );
    expect(rules.releaseCadence.refreshTriggers).toContain('package.json version change');
    expect(rules.releaseCadence.refreshTriggers).toContain(
      'Marketplace publication, listing identity, or homepage change'
    );
    expect(rules.releaseCadence.refreshTriggers).toContain(
      'release-procedure, ship-control, or docs-workbench publication contract change'
    );
    expect(rules.releaseCadence.strictSemverRule).toEqual(
      expect.arrayContaining([
        'after an exact release is published, the current published package line on main shall match that exact release line',
        'when develop carries post-release work, the develop package line shall advance to the next exact release candidate before public-facing normalization continues',
        'any later repo change intended for publication shall advance package.json and the top CHANGELOG.md heading to the next SemVer line before further normalization or publication',
        'future sessions shall not treat an unreleased SemVer bump as complete until the matching public tag, public GitHub release, and VS Code Marketplace version are all published',
        'future sessions shall not keep landing post-release changes on the previous exact release version number',
        'future sessions shall not treat a burned exact release as the green release baseline for later publication',
        'future sessions shall not treat an exact release as fully closed until the matching released main line has been back-merged into develop through the protected path and the resulting develop pipeline is green',
        'future sessions shall not treat a candidate line as review-ready until the maintained public develop candidate head and maintained public wiki head are both published and retained in the authority candidate package',
        'future sessions shall keep exact tagging blocked until the post-publication expert-agent review gate closes with no findings against the exact published public candidate heads retained in the authority candidate package',
        'optional product-owner exploratory review may happen separately, but it shall not replace the clean expert-agent review gate for exact tagging'
      ])
    );
    expect(rules.releaseCadence.candidateStateModel).toEqual(
      expect.objectContaining({
        reviewReadyRule:
          'local authority-green proof is necessary but not sufficient; review-ready opens only after the maintained public develop candidate head and maintained public wiki head are both live and retained in docs/product/public-release-candidate.{md,json}',
        dirtyPublicSurfaceRule:
          'preserve unrelated dirt, inspect overlapping files, patch only the maintained candidate slice narrowly, and pause only on direct unresolved conflicts instead of stopping publication merely because the worktree is dirty'
      })
    );
    expect(rules.releaseCadence.candidateStateModel?.orderedStates).toEqual([
      'local-authority-green',
      'public-develop-published',
      'public-wiki-published',
      'review-ready',
      'expert-agent-review-findings-received',
      'expert-agent-review-findings-folded',
      'tag-eligible'
    ]);
    expect(rules.releaseCadence.candidateStateModel?.expertAgentReviewSkill).toEqual(
      expect.objectContaining({
        skillName: 'vi-history-suite-expert-agent-reviewer',
        canonicalCodexSkillPath:
          '/mnt/c/Users/sveld/.codex/skills/vi-history-suite-expert-agent-reviewer'
      })
    );
    expect(rules.releaseCadence.candidateStateModel?.expertAgentReviewSkill?.gatingRule).toContain(
      'no findings'
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
        targetDevelopCandidateReleaseLine: 'v1.3.0'
      })
    );
    expect(rules.releaseCadence.activeOpeningDecision?.rationale).toEqual(
      expect.arrayContaining([
        'the next line adds a governed installed-user capability and supported workflow by promoting host-default Windows local LabVIEWCLI with bounded expert Docker instead of only hardening the exact released Docker-only surface',
        'the v1.3.0 line keeps exact v1.2.2 as the truthful published baseline while opening the next candidate line required for runtime-provider public publication work'
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

    expect(rules.operatorSurfaceSustainment.branchModel.model).toBe('gitflow');
    expect(rules.operatorSurfaceSustainment.branchModel.integrationBranch).toBe('develop');
    expect(rules.operatorSurfaceSustainment.branchModel.releaseBranch).toBe('release/*');
    expect(rules.operatorSurfaceSustainment.branchModel.hotfixBranch).toBe('hotfix/*');
    expect(rules.operatorSurfaceSustainment.branchModel.exactReleaseLineBranch).toBe('main');
    expect(rules.operatorSurfaceSustainment.branchModel.temporaryBranchPrefixes).toEqual([
      'feature/',
      'release/',
      'hotfix/'
    ]);
    expect(rules.operatorSurfaceSustainment.branchModel.promotionRules).toEqual(
      expect.arrayContaining([
        'public GitHub default branch remains main so readers land on the latest exact released line by default',
        'feature/* branches are cut from develop and merge back into develop',
        'the governed branch-baseline assertion surface fails closed when develop does not yet contain exact main before a new candidate line opens',
        'release/* branches are cut from develop, merge into main, merge back into develop, and are deleted only after both merges complete',
        'hotfix/* branches are cut from main, merge into main, merge back into develop, and are deleted only after both merges complete',
        'exact SemVer tags are cut from main only after the protected main pipeline succeeds',
        'local public-source promotion/check binds the intended checkout through --target-root or VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT and fails closed when the target repo is dirty',
        'candidate lines are not review-ready until the maintained public develop candidate head and maintained public wiki head are both published and retained in the authority candidate package',
        'dirty public-source/wiki worktrees are controlled publication surfaces: preserve unrelated dirt, patch overlapping maintained files narrowly, and pause only on direct unresolved conflicts'
      ])
    );
    expect(rules.operatorSurfaceSustainment.branchModel.requiredChecks).toEqual([
      'docs_continuous_integration',
      'docs_public_continuous_integration',
      'docs_internal_continuous_integration',
      'test_extension',
      'windows_private_release_acceptance',
      'package_extension_preview',
      'Public Facade Package Preview / package-preview',
      'Public Facade Linux Smoke / public-facade-linux-smoke'
    ]);
    expect(
      rules.operatorSurfaceSustainment.branchModel?.governedLaneBehaviors
    ).toEqual(
      expect.objectContaining({
        windows_private_release_acceptance: {
          hostApplySurface: {
            script: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
            scheduledTaskAction:
              'powershell.exe -NoLogo -NoProfile -File "C:\\GitLab-Runner\\start-governed-runner-lanes.ps1"',
            failurePolicy: 'fail-closed-unless-exactly-one-configured-manager-after-apply'
          },
          hostAssertionSurface: {
            script: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
            wrapperScript: 'scripts/assertGovernedRunnerLanes.js',
            packageScript: 'npm run gitlab:runner:assert',
            verification: [
              'bootstrap-hash-match',
              'scheduled-task-action-match',
              'scheduled-task-logon-trigger',
              'request-concurrency-two',
              'exactly-one-configured-runner-manager'
            ],
            failurePolicy: 'fail-closed-on-live-host-drift'
          },
          hostNativeMidSessionContaminationRecovery: {
            trigger: 'windows-host-runtime-cleanup-failed',
            recoveryScript:
              'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
            recoveryTranscript:
              'windows-private-release-evidence/host/proof-runtime-recovery.txt',
            retryDelayMs: 5000,
            maxProofRetries: 1,
            firstFailureTranscript:
              'windows-private-release-evidence/host/proof-run-pre-recovery.txt',
            failurePolicy: 'fail-closed-after-repo-recovery-script-and-single-retry'
          },
          hostNativeMidSessionRecoveryRehearsal: {
            script: 'scripts/runWindowsProofRuntimeRecoveryRehearsal.js',
            packageScript: 'npm run gitlab:runner:windows:recovery:rehearse',
            receiptRoot: '.cache/windows-proof-runtime-recovery-rehearsal',
            latestReceipt: '.cache/windows-proof-runtime-recovery-rehearsal/latest.json',
            requestedLabviewVersion: '2026',
            requestedLabviewBitness: 'x64',
            contaminationSeedMode: 'headless-labview-launch',
            recoveryTranscriptLeaf: 'proof-runtime-recovery.txt',
            failurePolicy: 'fail-closed-unless-clean-before-and-after-governed-recovery-rehearsal'
          }
        },
        linux_assurance: {
          hostApplySurface: {
            script: 'scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh',
            verification: ['systemctl-is-enabled', 'systemctl-is-active'],
            failurePolicy: 'fail-closed-unless-service-enabled-and-active'
          },
          hostAssertionSurface: {
            script: 'scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh',
            wrapperScript: 'scripts/assertGovernedRunnerLanes.js',
            packageScript: 'npm run gitlab:runner:assert',
            verification: [
              'helper-hash-match',
              'service-unit-hash-match',
              'request-concurrency-two',
              'service-fragment-path-match',
              'service-user-match',
              'service-working-directory-match',
              'exactly-one-configured-runner-process'
            ],
            failurePolicy: 'fail-closed-on-live-host-drift'
          }
        }
      })
    );
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
      'docs/product/vscode-marketplace-publication-ledger.md'
    );
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/vscode-marketplace-publication-ledger.json'
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
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/runtime-provider-public-acceptance-gate.md'
    );
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/runtime-provider-public-acceptance-gate.json'
    );
    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/linux-assurance-runner-lane.md'
    );
    expect(rules.operatorSurfaceSustainment.requiredDerivedUpdatesWhenReaderFacingTruthChanges).toContain(
      'docs/product/wiki-publication-ledger.json'
    );
    expect(rules.operatorSurfaceSustainment.requiredDerivedUpdatesWhenReaderFacingTruthChanges).toContain(
      'README.md'
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
    expect(rulesDoc).toContain('current exact released line: `v1.3.0`');
    expect(rulesDoc).toContain('current develop package line on `develop`: `1.3.0`');
    expect(rulesDoc).toContain('active exact release candidate line on `develop`: none; exact `v1.3.0`');
    expect(rulesDoc).toContain('active release-candidate branch: none');
    expect(rulesDoc).toContain('chosen bump: `minor`');
    expect(rulesDoc).toContain('develop');
    expect(rulesDoc).toContain('protected exact-release line');
    expect(rulesDoc).toContain('required checks');
    expect(rulesDoc).toContain('GitFlow');
    expect(rulesDoc).toContain('npm run branch:governance:assert');
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
    expect(rulesDoc).toContain('VS Code Marketplace exact publication state');
    expect(rulesDoc).toContain('future sessions shall not treat an exact release as fully closed');
    expect(rulesDoc).toContain('installed-user entry surfaces');
    expect(rulesDoc).toContain('PROGRAM-0002');
    expect(rulesDoc).toContain('historical public-closeout record');
    expect(rulesDoc).toContain('runtime-provider-public-acceptance-gate.md');
    expect(rulesDoc).toContain('linux-assurance-runner-lane.md');
    expect(rulesDoc).toContain('execution-policy bypass');
    expect(rulesDoc).toContain('ExecutionPolicy Bypass');
    expect(rulesDoc).toContain('proof-run-pre-recovery.txt');
    expect(rulesDoc).toContain('proof-runtime-recovery.txt');
    expect(rulesDoc).toContain('single retry');
    expect(rulesDoc).toContain('recover-windows-proof-runtime-surface.ps1');
    expect(rulesDoc).toContain('runWindowsProofRuntimeRecoveryRehearsal.js');
    expect(rulesDoc).toContain('npm run gitlab:runner:windows:recovery:rehearse');
    expect(rulesDoc).toContain('.cache/windows-proof-runtime-recovery-rehearsal/latest.json');
    expect(rulesDoc).toContain('apply-governed-runner-lanes.ps1');
    expect(rulesDoc).toContain('assert-governed-runner-lanes.ps1');
    expect(rulesDoc).toContain('apply-linux-assurance-runner.sh');
    expect(rulesDoc).toContain('assert-linux-assurance-runner.sh');
    expect(rulesDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(rulesDoc).toContain('npm run gitlab:runner:assert');
    expect(rulesDoc).toContain('without `ExecutionPolicy Bypass`');

    expect(readme).toContain('## Authority And Release Control');
    expect(readme).toContain(
      '[docs/product/public-release-candidate.md](./docs/product/public-release-candidate.md)'
    );
    expect(readme).toContain('[Release Procedure](./docs/release-procedure.md)');
    expect(currentState).toContain(
      '[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)'
    );
    expect(ship).toContain('[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)');
    expect(program).toContain('[post-release-sustainment-rules.md](../post-release-sustainment-rules.md)');
    expect(issue).toContain('docs/product/post-release-sustainment-rules.md');
    expect(issue).toContain('historical `PROGRAM-0002` closeout');
    expect(issue).toContain('runtime-provider public-acceptance gate');

    expect(informationItemMap).toContain(
      '| Post-release sustainment rules | `docs/product/post-release-sustainment-rules.md` |'
    );
    expect(informationItemMap).toContain(
      '| Machine-readable post-release sustainment rules | `docs/product/post-release-sustainment-rules.json` |'
    );
  });
});
