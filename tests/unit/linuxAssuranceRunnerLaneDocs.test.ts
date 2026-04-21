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

describe('linux assurance runner lane docs', () => {
  it('keeps the Linux assurance lane separate from Windows proof and wires the blocking/advisory assurance jobs', () => {
    const gitlabCi = readText('.gitlab-ci.yml');
    const runnerLaneDoc = readText('docs/product/linux-assurance-runner-lane.md');
    const windowsRunnerLaneDoc = readText('docs/product/windows-private-release-runner-lane.md');
    const hostedGovernanceDoc = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const packageManifest = readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(gitlabCi).toContain('assurance_release_gate:');
    expect(gitlabCi).toContain('governed_runner_admission:');
    expect(gitlabCi).toContain('stage: admission');
    expect(gitlabCi).toContain('npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence');
    expect(gitlabCi).toContain('assurance_26514_authority:');
    expect(gitlabCi).toContain('assurance_requirements_quality:');
    expect(gitlabCi).toContain('assurance_external_user_information:');
    expect(gitlabCi).toContain('assurance_audit_packet:');
    expect(gitlabCi).toContain('- linux');
    expect(gitlabCi).toContain('- assurance');
    expect(gitlabCi).toContain('VIHS_ASSURANCE_EXECUTOR: container');
    expect(gitlabCi).toContain('VIHS_ASSURANCE_IMAGE: registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(gitlabCi).toContain('docker pull "${VIHS_ASSURANCE_IMAGE}"');
    expect(gitlabCi).toContain('npm run assurance:release-gate -- --evidence-dir assurance-release-gate-evidence');
    expect(gitlabCi).toContain('npm run assurance:26514:authority -- --evidence-dir assurance-26514-authority-evidence');
    expect(gitlabCi).toContain('npm run assurance:requirements -- --evidence-dir assurance-requirements-quality-evidence');
    expect(gitlabCi).toContain('npm run assurance:user-info -- --evidence-dir assurance-external-user-information-evidence');
    expect(gitlabCi).toContain('npm run assurance:evidence-pack -- --evidence-dir assurance-audit-packet-evidence/evidence-pack');
    expect(gitlabCi).toContain('npm run assurance:uplift -- --evidence-dir assurance-audit-packet-evidence/uplift');
    expect(gitlabCi).toContain('- assurance_release_gate');
    expect(gitlabCi).toContain('- assurance_26514_authority');
    expect(gitlabCi).toContain('- assurance_requirements_quality');
    expect(gitlabCi).toContain('- assurance_external_user_information');

    expect(runnerLaneDoc).toContain('# Linux Assurance Runner Lane');
    expect(runnerLaneDoc).toContain('local-linux-assurance');
    expect(runnerLaneDoc).toContain('--tag-list "linux,x64,docker,assurance,private-release"');
    expect(runnerLaneDoc).toContain('assurance_release_gate');
    expect(runnerLaneDoc).toContain('assurance_26514_authority');
    expect(runnerLaneDoc).toContain('assurance_requirements_quality');
    expect(runnerLaneDoc).toContain('assurance_external_user_information');
    expect(runnerLaneDoc).toContain('assurance_audit_packet');
    expect(runnerLaneDoc).toContain('VIHS_ASSURANCE_REGISTRY_USER');
    expect(runnerLaneDoc).toContain('VIHS_ASSURANCE_REGISTRY_PASSWORD');
    expect(runnerLaneDoc).toContain('~/.gitlab-runner/config.toml');
    expect(runnerLaneDoc).toContain('concurrent = 2');
    expect(runnerLaneDoc).toContain('request_concurrency = 2');
    expect(runnerLaneDoc).toContain('vihs-linux-assurance-runner.service');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('scripts/doctorGovernedRunnerLanes.js');
    expect(runnerLaneDoc).toContain('npm run gitlab:runner:doctor');
    expect(runnerLaneDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(runnerLaneDoc).toContain('npm run gitlab:runner:assert');
    expect(runnerLaneDoc).toContain('$HOME/gitlab-runner/receipts/linux-assurance-startup/latest.json');
    expect(runnerLaneDoc).toContain('governed_runner_admission');
    expect(runnerLaneDoc).toContain('governed-runner-admission-evidence/runner-doctor.json');
    expect(runnerLaneDoc).toContain('bash ./scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('bash ./scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('bash ./scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('fails closed unless the configuration is normalized');
    expect(runnerLaneDoc).toContain('fails closed unless the installed helper');
    expect(runnerLaneDoc).toContain('separate from the Windows private-release proof lane');

    expect(windowsRunnerLaneDoc).toContain('linux-assurance-runner-lane.md');
    expect(hostedGovernanceDoc).toContain('linux-assurance');
    expect(hostedGovernanceDoc).toContain('concurrent = 2');
    expect(hostedGovernanceDoc).toContain('request_concurrency = 2');
    expect(hostedGovernanceDoc).toContain('vihs-linux-assurance-runner.service');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh');
    expect(hostedGovernanceDoc).toContain('scripts/doctorGovernedRunnerLanes.js');
    expect(hostedGovernanceDoc).toContain('npm run gitlab:runner:doctor');
    expect(hostedGovernanceDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(hostedGovernanceDoc).toContain('npm run gitlab:runner:assert');
    expect(hostedGovernanceDoc).toContain('governed_runner_admission');
    expect(hostedGovernanceDoc).toContain('windows-private-release');
    expect(hostedGovernanceJson.authorityGitLab.runnerLanes.linuxAssurance).toEqual(
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
            distro: 'Ubuntu',
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
    expect(hostedGovernanceJson.authorityGitLab.jobs.governed_runner_admission).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        stage: 'admission',
        packageScript: 'npm run gitlab:runner:doctor',
        evidenceRoot: 'governed-runner-admission-evidence/'
      })
    );
    expect(hostedGovernanceJson.authorityGitLab.jobs.assurance_audit_packet.classification).toBe(
      'advisory-governance-check'
    );

    expect(informationItemMap).toContain(
      '| Linux assurance runner lane | `docs/product/linux-assurance-runner-lane.md` |'
    );
    expect(packageManifest.scripts?.['assurance:release-gate']).toBe(
      'node scripts/runAssuranceAudit.js --lane release-gate'
    );
    expect(packageManifest.scripts?.['assurance:26514:authority']).toBe(
      'node scripts/runAssuranceAudit.js --lane 26514-authority'
    );
    expect(packageManifest.scripts?.['assurance:requirements']).toBe(
      'node scripts/runAssuranceAudit.js --lane requirements'
    );
    expect(packageManifest.scripts?.['assurance:user-info']).toBe(
      'node scripts/runAssuranceAudit.js --lane user-info'
    );
    expect(packageManifest.scripts?.['assurance:evidence-pack']).toBe(
      'node scripts/runAssuranceAudit.js --lane evidence-pack'
    );
    expect(packageManifest.scripts?.['assurance:uplift']).toBe(
      'node scripts/runAssuranceAudit.js --lane uplift'
    );
    expect(packageManifest.scripts?.['gitlab:runner:assert']).toBe(
      'node scripts/assertGovernedRunnerLanes.js'
    );
    expect(packageManifest.scripts?.['gitlab:runner:doctor']).toBe(
      'node scripts/doctorGovernedRunnerLanes.js'
    );
  });
});
