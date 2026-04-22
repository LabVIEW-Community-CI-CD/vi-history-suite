import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('release governance package', () => {
  it('retains the semver decision framework and GitFlow branch/ci topology', () => {
    const rules = readJson<any>('docs/product/post-release-sustainment-rules.json');
    const adr = readText(
      'docs/architecture/adr/ADR-0030-semver-decision-framework-and-gitflow-branch-ci-topology.md'
    );
    const adr0 = readText(
      'docs/architecture/adr/ADR-0028-governed-authority-to-public-source-promotion-system.md'
    );
    const adr2 = readText(
      'docs/architecture/adr/ADR-0031-finding-driven-adr-and-requirement-evolution.md'
    );
    const adr3 = readText(
      'docs/architecture/adr/ADR-0032-public-facade-github-workflow-responsibility-matrix.md'
    );
    const adr4 = readText(
      'docs/architecture/adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md'
    );
    const adr5 = readText(
      'docs/architecture/adr/ADR-0034-public-codespaces-public-repo-bootstrap-and-default-branch-resolution.md'
    );
    const adr6 = readText(
      'docs/architecture/adr/ADR-0035-review-ready-candidate-publication-boundary-and-dirty-public-surface-handling.md'
    );
    const adr7 = readText(
      'docs/architecture/adr/ADR-0036-vscode-marketplace-publication-and-installed-user-entry-surface.md'
    );
    const adr8 = readText(
      'docs/architecture/adr/ADR-0037-expert-agent-review-gate-for-public-candidates.md'
    );
    const hostedGovernance = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md'
    );

    expect(rules.releaseCadence.semverDecisionFramework.defaultGovernanceBump).toBe('patch');
    expect(rules.releaseCadence.semverDecisionFramework.major).toContain(
      'breaks or removes a governed public or maintainer contract on purpose'
    );
    expect(rules.releaseCadence.semverDecisionFramework.minor).toContain(
      'adds a new governed capability or supported workflow without breaking the current exact released line'
    );
    expect(rules.releaseCadence.semverDecisionFramework.patch).toContain(
      'fixes or hardens an existing workflow, release rule, procedure, branch policy, or CI posture without breaking the exact released contract'
    );
    expect(rules.releaseCadence.activeOpeningDecision.chosenBump).toBe('patch');
    expect(rules.releaseCadence.activeOpeningDecision.targetFeatureBranch).toBeNull();
    expect(rules.releaseCadence.versionLineContract.publicDefaultBranch).toBe('main');
    expect(rules.operatorSurfaceSustainment.branchModel.model).toBe('gitflow');
    expect(rules.operatorSurfaceSustainment.branchModel.temporaryBranchPrefixes).toEqual([
      'feature/',
      'release/',
      'hotfix/'
    ]);
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities.develop).toContain(
      'npm run design:gate'
    );
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities['release/*']).toContain(
      'public-facade proof before merge to main'
    );
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities.main).toContain(
      'exact SemVer tags only after merged main is green'
    );

    expect(adr).toContain('# ADR-0030: SemVer Decision Framework And GitFlow Branch/CI Topology');
    expect(adr).toContain('choose `major` for intentional breaking contract changes');
    expect(adr).toContain('choose `minor` for additive governed capability changes');
    expect(adr).toContain('choose `patch` for fixes, hardening, governance, documentation-package, or');
    expect(adr).toContain('protected exact-release line and public default branch');
    expect(adr).toContain('`feature/*`');
    expect(adr).toContain('`release/*`');
    expect(adr).toContain('`hotfix/*`');
    expect(adr).toContain('`npm run design:gate`');
    expect(adr).toContain('`npm run branch:governance:assert`');
    expect(adr).toContain('back-merged into `develop`');
    expect(adr0).toContain('VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT');
    expect(adr0).toContain('rejecting a dirty target repo');
    expect(adr2).toContain('# ADR-0031: Finding-Driven ADR And Requirement Evolution');
    expect(adr2).toContain('every governed finding is classified for both requirement impact and ADR');
    expect(adr2).toContain('introduce a new ADR in the same slice');
    expect(adr3).toContain('# ADR-0032: Public Facade GitHub Workflow Responsibility Matrix');
    expect(adr3).toContain('Public Facade Package Preview');
    expect(adr3).toContain('Public Facade Linux Smoke');
    expect(adr3).toContain('do not create a `feature/*` push lane');
    expect(adr3).toContain('per-workflow/per-ref concurrency');
    expect(adr4).toContain('# ADR-0033: Hosted Automation Governance Matrix And Protection Semantics');
    expect(adr4).toContain('GitLab authority uses protected branches plus');
    expect(adr4).toContain('GitHub benchmark workflows remain governed characterization lanes');
    expect(adr5).toContain('# ADR-0034: Public Codespaces Public-Repo Bootstrap And Default-Branch Resolution');
    expect(adr5).toContain('public GitHub or public GitLab repo');
    expect(adr5).toContain('resolve the remote default branch from remote HEAD');
    expect(adr5).toContain('block the exact `v1.2.0` tag until the maintained public wiki procedures are');
    expect(adr6).toContain('# ADR-0035: Review-Ready Candidate Publication Boundary And Dirty Public Surface Handling');
    expect(adr6).toContain('review-ready');
    expect(adr6).toContain('maintained public `develop` candidate head');
    expect(adr6).toContain('preserve unrelated dirt');
    expect(adr7).toContain('# ADR-0036: VS Code Marketplace Publication And Installed-User Entry Surface');
    expect(adr7).toContain('VS Code Marketplace');
    expect(adr7).toContain('Marketplace: Manage');
    expect(adr7).toContain('manual Marketplace portal-upload fallback');
    expect(adr7).toContain('packaged extension `homepage` points to the maintained public wiki home');
    expect(adr8).toContain('# ADR-0037: Expert-Agent Review Gate For Public Candidates');
    expect(adr8).toContain('vi-history-suite-expert-agent-reviewer');
    expect(adr8).toContain('exact tagging and Marketplace publication blocked until the latest');
    expect(hostedGovernance).toContain('# Hosted CI Governance');
    expect(hostedGovernance).toContain('current `develop` package line: `1.3.5`');
    expect(hostedGovernance).toContain('active exact release candidate line on `develop`: none');
    expect(hostedGovernance).toContain('active release-candidate branch: none');
    expect(hostedGovernance).toContain('active exact hotfix candidate line on `main`: none');
    expect(hostedGovernance).toContain('active hotfix branch: none');
    expect(hostedGovernance).toContain('active feature-lane public-exact hardening branch on `develop`: none');
    expect(hostedGovernance).toContain('pre-tag public-exact proof hardening is now retained directly on `develop`');
    expect(hostedGovernance).toContain('chosen bump: `patch`');
    expect(hostedGovernance).toContain('public_exact_pretag_proof');
    expect(hostedGovernance).toContain('npm run public:exact:pretag:proof');
    expect(hostedGovernance).toContain('npm run branch:governance:assert');
    expect(hostedGovernanceJson.openingDecision.chosenBump).toBe('patch');
    expect(hostedGovernanceJson.authorityGitLab.mergeGate).toBe(
      'only_allow_merge_if_pipeline_succeeds'
    );
    expect(hostedGovernanceJson.githubExperiment.requiredForExactRelease).toBe(false);

    expect(srs).toContain('public GitHub `main` remains the default branch and protected exact-release line');
    expect(srs).toContain('PR-driven focused admission on `feature/*`');
    expect(srs).toContain('push plus PR validation for `release/*` and `hotfix/*`');
    expect(srs).toContain('continuously classify current and future governed findings for ADR impact');
    expect(srs).toContain('governed public GitHub workflow matrix');
    expect(srs).toContain('governed hosted automation matrix');
    expect(srs).toContain('`feature/*` branches are cut from `develop` and merge back into `develop`');
    expect(srs).toContain('fail closed on branch-model contradictions');
    expect(srs).toContain('VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT');
    expect(srs).toContain('fail closed when the bound target repo is dirty');
    expect(srs).toContain('VHS-REQ-515');
    expect(srs).toContain('npm run branch:governance:assert');
    expect(srs).toContain('generic `npm run public:repo:clone` command');
    expect(srs).toContain('public `github.com` or `gitlab.com` HTTPS repo URL');
    expect(srs).toContain('resolve the remote default branch from remote HEAD');
    expect(srs).toContain('VHS-REQ-519');
    expect(srs).toContain('fail-closed `review-ready` state');
    expect(srs).toContain('VHS-REQ-520');
    expect(srs).toContain('controlled patch targets');
    expect(srs).toContain('VHS-REQ-522');
    expect(srs).toContain('VS Code Marketplace publication ledger');
    expect(srs).toContain('VHS-REQ-523');
    expect(srs).toContain('VHS-REQ-524');
    expect(srs).toContain('Marketplace: Manage');
    expect(srs).toContain('VHS-REQ-525');
    expect(srs).toContain('packaged extension manifest homepage');
    expect(srs).toContain('VHS-REQ-526');
    expect(srs).toContain('installed-user local workflow guidance');
    expect(srs).toContain('VHS-REQ-527');
    expect(srs).toContain('back-merged into `develop`');
    expect(srs).toContain('VHS-REQ-528');
    expect(srs).toContain('missing Docker CLI or a stopped Docker daemon');
    expect(srs).toContain('VHS-REQ-529');
    expect(srs).toContain('vi-history-suite-expert-agent-reviewer');
    expect(rtm).toContain('public GitHub `main` remains the default branch and protected exact-release line');
    expect(rtm).toContain('PR-driven focused admission on `feature/*`');
    expect(rtm).toContain('push plus PR validation for `release/*` and `hotfix/*`');
    expect(rtm).toContain('Continuously classify current and future governed findings for ADR impact');
    expect(rtm).toContain('Retain a governed public GitHub workflow matrix');
    expect(rtm).toContain('Retain one governed hosted automation matrix');
    expect(rtm).toContain('Admit authority GitLab preview-package validation');
    expect(rtm).toContain('Fail closed on branch-model contradictions');
    expect(rtm).toContain('Bind the governed public-source promotion/check surface');
    expect(rtm).toContain('VHS-REQ-515');
    expect(rtm).toContain('VHS-REQ-516');
    expect(rtm).toContain('VHS-REQ-517');
    expect(rtm).toContain('VHS-REQ-518');
    expect(rtm).toContain('VHS-REQ-519');
    expect(rtm).toContain('VHS-REQ-520');
    expect(rtm).toContain('VHS-REQ-522');
    expect(rtm).toContain('VHS-REQ-523');
    expect(rtm).toContain('VHS-REQ-524');
    expect(rtm).toContain('VHS-REQ-525');
    expect(rtm).toContain('VHS-REQ-526');
    expect(rtm).toContain('VHS-REQ-527');
    expect(rtm).toContain('VHS-REQ-528');
    expect(rtm).toContain('VHS-REQ-529');
    expect(testPlan).toContain('public-default-branch');
    expect(testPlan).toContain('governed `GitFlow` branch model');
    expect(testPlan).toContain('release/hotfix merge-backs into `develop`');
    expect(testPlan).toContain('finding-to-ADR discipline');
    expect(testPlan).toContain('`no-adr-impact`');
    expect(testPlan).toContain('TEST-UNIT-324');
    expect(testPlan).toContain('TEST-DOC-089');
    expect(testPlan).toContain('TEST-UNIT-325');
    expect(testPlan).toContain('TEST-DOC-090');
    expect(testPlan).toContain('TEST-UNIT-328');
    expect(testPlan).toContain('TEST-DOC-093');
    expect(testPlan).toContain('TEST-UNIT-329');
    expect(testPlan).toContain('TEST-UNIT-330');
    expect(testPlan).toContain('TEST-UNIT-331');
    expect(testPlan).toContain('TEST-UNIT-332');
    expect(testPlan).toContain('TEST-UNIT-333');
    expect(testPlan).toContain('TEST-UNIT-334');
    expect(testPlan).toContain('TEST-UNIT-336');
    expect(testPlan).toContain('TEST-UNIT-337');
    expect(testPlan).toContain('TEST-DOC-094');
    expect(testPlan).toContain('TEST-DOC-095');
    expect(testPlan).toContain('TEST-DOC-096');
    expect(testPlan).toContain('TEST-DOC-097');
    expect(testPlan).toContain('TEST-DOC-098');
    expect(testPlan).toContain('TEST-DOC-099');
    expect(testPlan).toContain('TEST-DOC-100');
    expect(testPlan).toContain('TEST-UNIT-338');
    expect(testPlan).toContain('TEST-UNIT-339');
    expect(testPlan).toContain('TEST-UNIT-340');
    expect(testPlan).toContain('TEST-DOC-101');
    expect(testPlan).toContain('TEST-DOC-102');
    expect(testPlan).toContain('TEST-DOC-103');
    expect(readText('docs/release-procedure.md')).toContain(
      'node scripts/resolveLocalGitLabApiToken.js --json'
    );
    expect(readText('docs/release-procedure.md')).toContain(
      '%USERPROFILE%\\.config\\codex\\secrets\\vi-history-suite.gitlab-api-token.txt'
    );
    expect(readText('docs/release-procedure.md')).toContain(
      '$HOME/.config/codex/secrets/vi-history-suite.gitlab-api-token.txt'
    );
    expect(readText('docs/release-procedure.md')).toContain(
      'node scripts/queueGovernedMergeRequest.js'
    );
    expect(readText('docs/release-procedure.md')).toContain(
      'npm run gitlab:git-credential:refresh'
    );
    expect(readText('docs/release-procedure.md')).toContain(
      'git ls-remote origin HEAD'
    );
    expect(rules.operatorSurfaceSustainment.branchModel.findingAdrDiscipline).toEqual(
      expect.arrayContaining([
        'every governed finding is classified before slice closeout as adr-update-required or no-adr-impact'
      ])
    );
    expect(rules.releaseCadence.candidateStateModel.orderedStates).toEqual([
      'local-authority-green',
      'public-develop-published',
      'public-wiki-published',
      'review-ready',
      'expert-agent-review-findings-received',
      'expert-agent-review-findings-folded',
      'tag-eligible'
    ]);
    expect(rules.releaseCadence.candidateStateModel.reviewReadyRule).toContain(
      'maintained public develop candidate head and maintained public wiki head'
    );
    expect(rules.releaseCadence.candidateStateModel.expertAgentReviewSkill.skillName).toBe(
      'vi-history-suite-expert-agent-reviewer'
    );
    expect(rules.releaseCadence.candidateStateModel.dirtyPublicSurfaceRule).toContain(
      'preserve unrelated dirt'
    );
    expect(rules.operatorSurfaceSustainment.publicWorkflowGovernance.workflows.packagePreview.responsibilities).toEqual(
      expect.arrayContaining(['npm run test:design-contract', 'preview VSIX packaging'])
    );
    expect(rules.operatorSurfaceSustainment.publicWorkflowGovernance.workflows.linuxSmoke.responsibilities).toEqual(
      expect.arrayContaining(['Docker Linux engine verification', 'npm run public:smoke:linux'])
    );

    expect(program).toContain('branch-model and lane-specific CI governance');
    expect(program).toContain('ADR evolution from governed findings');
    expect(program).toContain('explicit SemVer-decision rationale');
    expect(program).toContain('public GitHub workflow responsibility and churn-control governance');
    expect(program).toContain('hosted GitLab/GitHub protection semantics');
    expect(program).toContain('public-source promotion target-root hygiene');
    expect(program).toContain('review-ready candidate publication boundary');
    expect(program).toContain('one governed expert-agent review gate');
    expect(program).toContain('VS Code Marketplace publication governance');
    expect(program).toContain('installed-user-first entry-surface redesign');
    expect(program).toContain('one governed exact-closeout back-merge rule');
    expect(issue).toContain('explicit major/minor/patch decision criteria');
    expect(issue).toContain('continuous refinement of ADR coverage from governed findings');
    expect(issue).toContain('branch-model and lane-specific CI/design-gate governance');
    expect(issue).toContain('workflow responsibility, trigger-boundary, and');
    expect(issue).toContain('hosted GitLab/GitHub branch-protection and workflow-lane');
    expect(issue).toContain('stale dirty side checkout');
    expect(issue).toContain('VS Code Marketplace publication governance');
    expect(issue).toContain('installed-user entry-surface redesign');
    expect(issue).toContain('exact-closeout back-merge governance');
    expect(issue).toContain('expert-agent review');
  });
});
