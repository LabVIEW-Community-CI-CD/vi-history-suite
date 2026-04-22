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

describe('hosted ci governance docs', () => {
  it('retains one hosted automation matrix across GitLab, public GitHub, and experiment lanes', () => {
    const matrix = readJson<any>('docs/product/hosted-ci-governance.json');
    const matrixDoc = readText('docs/product/hosted-ci-governance.md');
    const adr = readText(
      'docs/architecture/adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md'
    );
    const gitlabCi = readText('.gitlab-ci.yml');
    const cmPlan = readText('docs/cm/cm-plan.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const linuxBenchmarkWorkflow = readText('.github/workflows/linux-runtime-benchmark-experiment.yml');
    const windowsBenchmarkWorkflow = readText('.github/workflows/windows-runtime-benchmark-image.yml');

    expect(matrix.openingDecision).toEqual(
      expect.objectContaining({
        currentExactReleaseLine: 'v1.3.6',
        currentMainPackageLine: '1.3.6',
        currentDevelopPackageLine: '1.3.6',
        activeDevelopCandidateReleaseLine: null,
        activeReleaseCandidateBranch: null,
        activeHotfixCandidateReleaseLine: null,
        activeHotfixBranch: null,
        activeFeatureBranch: null,
        preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
        preTagPublicExactProofJob: 'public_exact_pretag_proof',
        publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:assess',
        chosenBump: 'patch'
      })
    );
    expect(matrix.authorityGitLab.mergeGate).toBe('only_allow_merge_if_pipeline_succeeds');
    expect(matrix.authorityGitLab.namedRequiredChecks).toBe(false);
    expect(matrix.authorityGitLab.jobs.package_extension_preview.admittedRefs).toEqual(
      expect.arrayContaining([
        'merge_request_event',
        'develop',
        'release/*',
        'hotfix/*',
        'main',
        'vX.Y.Z-tags'
      ])
    );
    expect(matrix.authorityGitLab.jobs.governed_runner_admission).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        stage: 'admission',
        packageScript: 'npm run gitlab:runner:doctor',
        evidenceRoot: 'governed-runner-admission-evidence/'
      })
    );
    expect(matrix.authorityGitLab.jobs.public_exact_pretag_proof).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        stage: 'test',
        packageScript: 'npm run public:exact:pretag:proof',
        evidenceRoot: 'public-exact-pretag-proof-evidence/'
      })
    );
    expect(matrix.authorityGitLab.jobs.windows_private_release_acceptance).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        admittedRefs: expect.arrayContaining([
          'merge_request_event',
          'develop',
          'release/*',
          'hotfix/*',
          'main',
          'vX.Y.Z-tags'
        ]),
        runtimeContaminationRecovery: {
          laneId: 'windows-host-native',
          trigger: 'windows-host-runtime-cleanup-failed',
          recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          recoveryTranscript: 'windows-private-release-evidence/host/proof-runtime-recovery.txt',
          retryDelayMs: 5000,
          maxProofRetries: 1,
          firstFailureTranscript: 'windows-private-release-evidence/host/proof-run-pre-recovery.txt',
          failurePolicy: 'fail-closed-after-repo-recovery-script-and-single-retry'
        }
      })
    );
    expect(matrix.authorityGitLab.jobs.assurance_release_gate).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        admittedRefs: expect.arrayContaining([
          'merge_request_event',
          'develop',
          'release/*',
          'hotfix/*',
          'main',
          'vX.Y.Z-tags'
        ])
      })
    );
    expect(matrix.authorityGitLab.jobs.assurance_26514_authority.classification).toBe(
      'required-governance-check'
    );
    expect(matrix.authorityGitLab.jobs.assurance_requirements_quality.classification).toBe(
      'required-governance-check'
    );
    expect(matrix.authorityGitLab.jobs.assurance_external_user_information.classification).toBe(
      'required-governance-check'
    );
    expect(matrix.authorityGitLab.jobs.assurance_audit_packet.classification).toBe(
      'advisory-governance-check'
    );
    expect(matrix.authorityGitLab.runnerLanes.linuxAssurance).toEqual(
      expect.objectContaining({
        description: 'local-linux-assurance',
        runnerContractDoc: 'docs/product/linux-assurance-runner-lane.md',
        operatorModel: expect.objectContaining({
          configPath: '~/.gitlab-runner/config.toml',
          globalConcurrency: 2,
          requestConcurrency: 2,
          lifecycleOwner: 'systemd',
          serviceUnit: 'vihs-linux-assurance-runner.service',
          repoOwnedApplyScript: 'scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh',
          repoOwnedHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
          repoOwnedDoctorScript: 'scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh',
          repoOwnedServiceUnit: 'scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service',
          repoOwnedAssertScript: 'scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh',
          combinedDoctorScript: 'scripts/doctorGovernedRunnerLanes.js',
          combinedDoctorPackageScript: 'npm run gitlab:runner:doctor',
          combinedAssertionScript: 'scripts/assertGovernedRunnerLanes.js',
          combinedAssertionPackageScript: 'npm run gitlab:runner:assert',
          startupReceipt: {
            latestPath: '$HOME/gitlab-runner/receipts/linux-assurance-startup/latest.json',
            schema: 'vi-history-suite/linux-assurance-startup@v1',
            requiredFacts: [
              'config-hash-before-after',
              'service-state-before-after',
              'global-concurrency-before-after',
              'request-concurrency-before-after',
              'runner-process-count-after',
              'healthy'
            ]
          },
          doctorSurface: {
            script: 'scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh',
            wrapperScript: 'scripts/doctorGovernedRunnerLanes.js',
            packageScript: 'npm run gitlab:runner:doctor',
            failurePolicy:
              'non-mutating-readback; combined surface may fail closed on drift when requested'
          },
          applyVerification: {
            requiredUser: 'sveld',
            requiredHome: '/home/sveld',
            checks: [
              'node-available',
              'config-global-concurrency-two',
              'config-request-concurrency-two',
              'systemctl-is-enabled',
              'systemctl-is-active'
            ],
            failurePolicy: 'fail-closed-unless-config-normalized-and-service-enabled-and-active'
          },
          helperVerification: {
            distro: 'Ubuntu-24.04',
            distroOverrideEnvironmentVariable: 'VIHS_LINUX_ASSURANCE_DISTRO',
            wakeAttempts: 12,
            wakeDelaySeconds: 10,
            checks: [
              'config-global-concurrency-two',
              'config-request-concurrency-two',
              'systemctl-is-enabled',
              'systemctl-is-active',
              'exactly-one-configured-runner-process',
              'writes-startup-receipt'
            ],
            failurePolicy: 'fail-closed-unless-wsl-bootstrap-observes-live-linux-assurance-service'
          },
          assertVerification: {
            checks: [
              'helper-hash-match',
              'service-unit-hash-match',
              'global-concurrency-two',
              'request-concurrency-two',
              'systemctl-is-enabled',
              'systemctl-is-active',
              'service-fragment-path-match',
              'service-user-match',
              'service-working-directory-match',
              'exactly-one-configured-runner-process'
            ],
            failurePolicy: 'fail-closed-on-live-host-drift'
          }
        })
      })
    );
    expect(matrix.authorityGitLab.runnerLanes.windowsPrivateRelease).toEqual(
      expect.objectContaining({
        description: 'ghost',
        runnerContractDoc: 'docs/product/windows-private-release-runner-lane.md',
        operatorModel: expect.objectContaining({
          configPath: 'C:\\GitLab-Runner\\config.toml',
          requestConcurrency: 2,
          bootstrapScript: 'C:\\GitLab-Runner\\start-governed-runner-lanes.ps1',
          scheduledTask: 'VIHS Governed Runner Lanes',
          lifecycleOwner: 'interactive-current-user-scheduled-task',
          repoOwnedApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          bootstrapTaskAction: {
            executable: 'powershell.exe',
            arguments:
              '-NoLogo -NoProfile -File "C:\\GitLab-Runner\\start-governed-runner-lanes.ps1"',
            executionPolicy: 'ambient-no-bypass'
          },
          duplicateProcessPolicy: 'collapse-duplicates-per-config',
          coldAdmissionRuntimeCleanup: {
            processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
            terminationStrategy: [
              'stop-process-force-by-pid',
              'taskkill-pid-tree',
              'taskkill-image-tree'
            ],
            failurePolicy: 'fail-closed-before-runner-start'
          },
          repoOwnedBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          repoOwnedDoctorScript: 'scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1',
          repoOwnedAssertScript: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
          repoOwnedRecoveryScript:
            'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          repoOwnedRecoveryRehearsalScript: 'scripts/runWindowsProofRuntimeRecoveryRehearsal.js',
          repoOwnedLinuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
          repoOwnedLinuxDoctorScript: 'scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh',
          linuxAssuranceBootstrap: {
            distro: 'Ubuntu-24.04',
            distroOverrideEnvironmentVariable: 'VIHS_LINUX_ASSURANCE_DISTRO',
            bootstrapCommand: '$HOME/gitlab-runner/start-linux-assurance.sh',
            wakeAttempts: 12,
            wakeDelaySeconds: 10,
            failurePolicy: 'fail-closed-unless-linux-assurance-helper-observes-live-service'
          },
          startupReceipt: {
            latestPath: 'C:\\GitLab-Runner\\receipts\\governed-runner-startup\\latest.json',
            schema: 'vi-history-suite/governed-runner-startup@v1',
            requiredFacts: [
              'duplicate-runner-collapse',
              'cold-admission-runtime-cleanup',
              'linux-helper-attempts',
              'linux-helper-receipt-links',
              'runner-process-count-after',
              'healthy'
            ]
          },
          doctorSurface: {
            script: 'scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1',
            linuxDoctorScript: 'scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh',
            wrapperScript: 'scripts/doctorGovernedRunnerLanes.js',
            packageScript: 'npm run gitlab:runner:doctor',
            failurePolicy:
              'non-mutating-readback; combined surface may fail closed on drift when requested'
          },
          combinedDoctorScript: 'scripts/doctorGovernedRunnerLanes.js',
          combinedDoctorPackageScript: 'npm run gitlab:runner:doctor',
          combinedAssertionScript: 'scripts/assertGovernedRunnerLanes.js',
          combinedAssertionPackageScript: 'npm run gitlab:runner:assert',
          recoveryRehearsal: {
            packageScript: 'npm run gitlab:runner:windows:recovery:rehearse',
            receiptRoot: '.cache/windows-proof-runtime-recovery-rehearsal',
            latestReceipt: '.cache/windows-proof-runtime-recovery-rehearsal/latest.json',
            requestedLabviewVersion: '2026',
            requestedLabviewBitness: 'x64',
            contaminationSeedMode: 'headless-labview-launch',
            recoveryTranscriptLeaf: 'proof-runtime-recovery.txt',
            failurePolicy: 'fail-closed-unless-clean-before-and-after-governed-recovery-rehearsal'
          },
          applyVerification: {
            checks: ['scheduled-task-registered', 'exactly-one-configured-runner-manager'],
            failurePolicy: 'fail-closed-unless-scheduled-task-and-runner-process-are-live'
          },
          assertVerification: {
            checks: [
              'bootstrap-hash-match',
              'scheduled-task-action-match',
              'scheduled-task-logon-trigger',
              'request-concurrency-two',
              'exactly-one-configured-runner-manager'
            ],
            failurePolicy: 'fail-closed-on-live-host-drift'
          }
        })
      })
    );
    expect(matrix.publicGitHub.requiredChecks).toEqual([
      'package-preview',
      'public-facade-linux-smoke'
    ]);
    expect(matrix.githubExperiment).toEqual(
      expect.objectContaining({
        classification: 'characterization-only',
        requiredForExactRelease: false
      })
    );

    expect(matrixDoc).toContain('current exact release line: `v1.3.0`');
    expect(matrixDoc).toContain('current `main` package line: `1.3.0`');
    expect(matrixDoc).toContain('current exact release line: `v1.3.6`');
    expect(matrixDoc).toContain('current `main` package line: `1.3.6`');
    expect(matrixDoc).toContain('current `develop` package line: `1.3.6`');
    expect(matrixDoc).toContain('active exact release candidate line on `develop`: none');
    expect(matrixDoc).toContain('active release-candidate branch: none');
    expect(matrixDoc).toContain('active exact hotfix candidate line on `main`: none');
    expect(matrixDoc).toContain('active hotfix branch: none');
    expect(matrixDoc).toContain('active feature-lane public GitHub release hardening branch on `develop`:');
    expect(matrixDoc).toContain('none');
    expect(matrixDoc).toContain('chosen bump: `patch`');
    expect(matrixDoc).toContain('Current Control Decision For Public Exact Hardening');
    expect(matrixDoc).toContain('npm run public:github:exact:transaction:assess');
    expect(matrixDoc).toContain('npm run branch:governance:assert');
    expect(matrixDoc).toContain('merge gate: `only_allow_merge_if_pipeline_succeeds=true`');
    expect(matrixDoc).toContain('classification: characterization-only experiment automation');
    expect(matrixDoc).toContain('protected back-merge');
    expect(matrixDoc).toContain('resulting green `develop`');
    expect(matrixDoc).toContain('linux-assurance');
    expect(matrixDoc).toContain('`windows_private_release_acceptance`');
    expect(matrixDoc).toContain('`governed_runner_admission`');
    expect(matrixDoc).toContain('`public_exact_pretag_proof`');
    expect(matrixDoc).toContain('`assurance_release_gate`');
    expect(matrixDoc).toContain('`assurance_26514_authority`');
    expect(matrixDoc).toContain('`assurance_requirements_quality`');
    expect(matrixDoc).toContain('`assurance_external_user_information`');
    expect(matrixDoc).toContain('`assurance_audit_packet`');
    expect(matrixDoc).toContain('repo-standards-review');
    expect(matrixDoc).toContain('concurrent = 2');
    expect(matrixDoc).toContain('request_concurrency = 2');
    expect(matrixDoc).toContain('vihs-linux-assurance-runner.service');
    expect(matrixDoc).toContain('VIHS Governed Runner Lanes');
    expect(matrixDoc).toContain('apply-linux-assurance-runner.sh');
    expect(matrixDoc).toContain('apply-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('cold-admission');
    expect(matrixDoc).toContain('fail-closed cleanup');
    expect(matrixDoc).toContain('doctor-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('doctor-linux-assurance-runner.sh');
    expect(matrixDoc).toContain('scripts/doctorGovernedRunnerLanes.js');
    expect(matrixDoc).toContain('npm run gitlab:runner:doctor');
    expect(matrixDoc).toContain('npm run public:exact:pretag:proof');
    expect(matrixDoc).toContain('public-exact-pretag-proof-evidence');
    expect(matrixDoc).toContain('governed-runner-admission-evidence');
    expect(matrixDoc).toContain(
      '`LabVIEW` / `LabVIEWCLI` / `LVCompare` runtime processes'
    );
    expect(matrixDoc).toContain('taskkill /PID /T /F');
    expect(matrixDoc).toContain('taskkill /IM /T /F');
    expect(matrixDoc).toContain('proof-run-pre-recovery.txt');
    expect(matrixDoc).toContain('proof-runtime-recovery.txt');
    expect(matrixDoc).toContain('`5000` ms');
    expect(matrixDoc).toContain('retries that host-native proof once');
    expect(matrixDoc).toContain('recover-windows-proof-runtime-surface.ps1');
    expect(matrixDoc).toContain('runWindowsProofRuntimeRecoveryRehearsal.js');
    expect(matrixDoc).toContain('npm run gitlab:runner:windows:recovery:rehearse');
    expect(matrixDoc).toContain('.cache/windows-proof-runtime-recovery-rehearsal/latest.json');
    expect(matrixDoc).toContain('without `ExecutionPolicy Bypass`');
    expect(matrixDoc).toContain('start-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('assert-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1');
    expect(matrixDoc).toContain('scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1');
    expect(matrixDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(matrixDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(matrixDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(matrixDoc).toContain('scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh');
    expect(matrixDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(matrixDoc).toContain('npm run gitlab:runner:assert');
    expect(matrixDoc).toContain('bounded Linux-distro wake-up');
    expect(matrixDoc).toContain('Ubuntu-24.04');
    expect(matrixDoc).toContain('VIHS_LINUX_ASSURANCE_DISTRO');
    expect(adr).toContain('GitLab authority uses protected branches plus');
    expect(adr).toContain('GitHub benchmark workflows remain governed characterization lanes');

    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH == "develop"'`);
    expect(gitlabCi).toContain(
      `- if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "develop"'`
    );
    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH =~ /^release\\/.+$/'`);
    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH =~ /^hotfix\\/.+$/'`);
    expect(gitlabCi).toContain('governed_runner_admission:');
    expect(gitlabCi).toContain('public_exact_pretag_proof:');
    expect(gitlabCi).toContain('stage: admission');
    expect(gitlabCi).toContain('npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence');
    expect(gitlabCi).toContain('npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence');
    expect(gitlabCi).toContain('windows_private_release_acceptance:');
    expect(gitlabCi).toContain('npm run acceptance:windows:private-release');
    expect(gitlabCi).toContain('windows-private-release-evidence/');
    expect(gitlabCi).toContain('assurance_release_gate:');
    expect(gitlabCi).toContain('assurance_26514_authority:');
    expect(gitlabCi).toContain('assurance_requirements_quality:');
    expect(gitlabCi).toContain('assurance_external_user_information:');
    expect(gitlabCi).toContain('assurance_audit_packet:');
    expect(gitlabCi).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(gitlabCi).toContain('VIHS_ASSURANCE_EXECUTOR: container');
    expect(gitlabCi).toContain('docker pull "${VIHS_ASSURANCE_IMAGE}"');
    expect(gitlabCi).toContain('npm run assurance:release-gate -- --evidence-dir assurance-release-gate-evidence');
    expect(gitlabCi).toContain('npm run assurance:26514:authority -- --evidence-dir assurance-26514-authority-evidence');
    expect(gitlabCi).toContain('npm run assurance:requirements -- --evidence-dir assurance-requirements-quality-evidence');
    expect(gitlabCi).toContain('npm run assurance:user-info -- --evidence-dir assurance-external-user-information-evidence');
    expect(gitlabCi).toContain('allow_failure: true');
    expect(gitlabCi).not.toContain(`- if: '$CI_COMMIT_BRANCH'`);

    expect(cmPlan).toContain(
      '`develop` is the working integration branch, `feature/*` branches are cut from `develop` and merge back into `develop`, `release/*` branches are cut from `develop`, merge into `main`, merge back into `develop`, and are deleted only after both merges complete, and `main` remains the protected exact-release line'
    );
    expect(readme).toContain('[docs/product/public-release-candidate.md](./docs/product/public-release-candidate.md)');
    expect(readme).toContain('[docs/information-item-map.md](./docs/information-item-map.md)');
    expect(currentState).toContain('[hosted-ci-governance.md](./hosted-ci-governance.md)');
    expect(currentState).toContain(
      '- hosted automation governance matrix: [hosted-ci-governance.md](./hosted-ci-governance.md)'
    );
    expect(currentState).toContain('governed_runner_admission');
    expect(currentState).toContain('public_exact_pretag_proof');
    expect(currentState).toContain('assurance_release_gate');
    expect(currentState).toContain('assurance_26514_authority');
    expect(currentState).toContain('doctor-governed-runner-lanes.ps1');
    expect(currentState).toContain('doctor-linux-assurance-runner.sh');
    expect(currentState).toContain('npm run gitlab:runner:doctor');
    expect(currentState).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(releaseProcedure).toContain('The hosted automation governance matrix is retained in:');
    expect(releaseProcedure).toContain('governed_runner_admission');
    expect(releaseProcedure).toContain('public_exact_pretag_proof');
    expect(releaseProcedure).toContain('assurance_release_gate');
    expect(releaseProcedure).toContain('assurance_26514_authority');
    expect(releaseProcedure).toContain('npm run gitlab:runner:doctor');
    expect(releaseProcedure).toContain('repo-standards-review/assurance-workbench:main');

    expect(linuxBenchmarkWorkflow).toContain('name: Linux Runtime Benchmark Experiment');
    expect(linuxBenchmarkWorkflow).toContain('- experiment/**');
    expect(windowsBenchmarkWorkflow).toContain('name: Windows Runtime Benchmark Image');
    expect(windowsBenchmarkWorkflow).toContain('- experiment/**');
  });
});
