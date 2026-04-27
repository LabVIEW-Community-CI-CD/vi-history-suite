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

describe('Windows Docker Desktop proof intake', () => {
  it('retains the issue #65 admissibility packet and public template contract', () => {
    const packet = readText('docs/product/windows-docker-desktop-proof-intake-v1.3.13.md');
    const packetJson = readJson<any>(
      'docs/product/windows-docker-desktop-proof-intake-v1.3.13.json'
    );
    const publicValidation = readJson<any>('docs/product/public-validation-prerelease-v1.3.13.json');
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const marketplaceLedger = readJson<any>(
      'docs/product/vscode-marketplace-publication-ledger.json'
    );
    const issueTemplate = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/windows-docker-desktop-validation.yml'
    );
    const issueConfig = readText('public-github-source/.github/ISSUE_TEMPLATE/config.yml');
    const labels = readText('public-github-source/.github/labels.yml');

    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/windows-docker-desktop-proof-intake@v1',
      status: 'prepared-gitlab-authority',
      packageVersion: '1.3.13',
      publicIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/65',
      fixture: {
        repository: 'https://github.com/ni/labview-icon-editor',
        viPath: 'resource/plugins/lv_icon.vi',
        oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
        newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd',
        windowsDockerImage: 'nationalinstruments/labview:2026q1-windows'
      },
      environmentPrerequisites: {
        platform: 'win32',
        dockerContainerMode: 'windows-containers',
        requiredDockerOSType: 'windows',
        extensionVersion: '1.3.13'
      },
      admissibleSuccess: {
        selectedVariant: {
          platform: 'win32',
          provider: 'docker',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        },
        result: {
          runtimeProvider: 'windows-container',
          runtimeEngine: 'labview-cli',
          runtimeExecutionState: 'succeeded',
          generatedReportExists: true
        }
      },
      publicIntake: {
        templatePath:
          'public-github-source/.github/ISSUE_TEMPLATE/windows-docker-desktop-validation.yml'
      },
      publicFacadePromotionCloseout: {
        status: 'published-and-verified',
        gitlabAuthorityMergeRequest:
          'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/189',
        gitlabAuthorityDevelopCommit: '1e0a69a666213e3513f22ce0fe6d82ccc1170ce0',
        gitlabAuthorityDevelopPipeline:
          'https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2481415396',
        publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
        publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
        publicMainShortCommit: '220111e',
        publicLabelsApplied: ['windows-docker-desktop'],
        marketplaceMutation: 'not-performed'
      },
      proofBoundary: {
        windowsDockerDesktopWindowsContainers:
          'community-deferred-until-issue-65-packet-is-admitted',
        marketplaceMutation: 'not-required-for-this-intake-slice'
      }
    });

    expect(packet).toContain('public issue #65');
    expect(packet).toContain('docker info --format "{{.OSType}} {{.OperatingSystem}}"');
    expect(packet).toContain('nationalinstruments/labview:2026q1-windows');
    expect(packet).toContain('runtimeProvider=windows-container');
    expect(packet).toContain('generatedReportExists=true');
    expect(packet).toContain('Platform-injected or simulated `win32` unit tests');
    expect(packet).toContain('Public Facade Promotion Closeout');
    expect(packet).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/68');
    expect(packet).toContain('220111eae3ac214e99f2233e2bfe6b320edf383d');
    expect(packet).toContain('Marketplace mutation: not performed');

    expect(publicValidation.windowsDockerDesktopProofIntake).toMatchObject({
      status: 'prepared-gitlab-authority',
      requiredDockerOSType: 'windows',
      publicIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/65'
    });
    expect(releaseState.developPreview.windowsDockerDesktopProofIntake).toMatchObject({
      status: 'prepared-gitlab-authority',
      requiredDockerOSType: 'windows',
      publicFacadePromotionCloseout: {
        status: 'published-and-verified',
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
        publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
        marketplaceMutation: 'not-performed'
      }
    });
    expect(releaseState.publicValidationPrereleaseV1313.windowsDockerDesktopProofIntake).toMatchObject({
      templatePath:
        'public-github-source/.github/ISSUE_TEMPLATE/windows-docker-desktop-validation.yml',
      publicFacadePromotionCloseout: {
        status: 'published-and-verified',
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
        publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
        marketplaceMutation: 'not-performed'
      }
    });
    expect(marketplaceLedger.publicValidationPrereleaseV1313.windowsDockerDesktopProofIntake)
      .toMatchObject({
        publicIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/65',
        requiredDockerOSType: 'windows',
        publicFacadePromotionCloseout: {
          status: 'published-and-verified',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
          publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
          marketplaceMutation: 'not-performed'
        }
      });

    expect(issueTemplate).toContain('Windows Docker Desktop validation');
    expect(issueTemplate).toContain('public issue #65');
    expect(issueTemplate).toContain('Docker Desktop was switched to Windows containers');
    expect(issueTemplate).toContain('runtimeProvider');
    expect(issueTemplate).toContain('runtimeExecutionState');
    expect(issueTemplate).toContain('generatedReportExists');
    expect(issueConfig).toContain('Windows Docker Desktop validation');
    expect(labels).toContain('name: windows-docker-desktop');
  });

  it('keeps the Windows Docker Desktop intake traced through requirements and tests', () => {
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const informationItemMap = readText('docs/information-item-map.md');

    for (const surface of [srs, rtm, testPlan]) {
      expect(surface).toContain('VHS-REQ-590');
      expect(surface).toContain('Windows Docker Desktop');
      expect(surface).toContain('public issue #65');
      expect(surface).toContain('runtimeProvider=windows-container');
      expect(surface).toContain('generatedReportExists=true');
    }

    expect(rtm).toContain('TEST-UNIT-397; TEST-DOC-149');
    expect(testPlan).toContain('TEST-UNIT-397');
    expect(testPlan).toContain('TEST-DOC-149');
    expect(informationItemMap).toContain('Windows Docker Desktop proof intake v1.3.13');
  });
});
