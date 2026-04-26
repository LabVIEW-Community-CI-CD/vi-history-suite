import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const fixtureRepository = 'https://github.com/ni/labview-icon-editor';
const fixtureViPath = 'resource/plugins/lv_icon.vi';
const oldCommit = 'ab94f6c4b375062492036c63a6dab7ea8824748a';
const newCommit = '8741bb08026c104100720c0ef48621e4ab7762fd';
const dockerImage = 'nationalinstruments/labview:2026q1-linux';

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('canonical public Docker fixture battery docs', () => {
  it('retains the battery evidence model across release-control JSON surfaces', () => {
    const packet = readJson<any>('docs/product/public-validation-prerelease-v1.3.11.json');
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const marketplaceLedger = readJson<any>(
      'docs/product/vscode-marketplace-publication-ledger.json'
    );

    const expectedBattery = {
      status: 'public-reported-success-retained',
      fixtureRepository,
      fixtureViPath,
      oldCommit: {
        sha: oldCommit,
        date: '2025-06-29'
      },
      newCommit: {
        sha: newCommit,
        date: '2026-02-24'
      },
      viSignature: 'LVIN',
      dockerRuntime: {
        image: dockerImage,
        firstPullApproximateSize: '1.4 GB',
        acquisition: 'pulled-on-first-compare-when-not-cached'
      },
      batteryCases: {
        positiveHistoricalCompare: {
          status: 'succeeded',
          exitCode: 0,
          runtimeSecondsApprox: 112,
          reportFile: 'diff-report-lv_icon.vi.html',
          reportSizeApprox: '395 KB',
          evidence: 'LabVIEW CreateComparisonReport operation succeeded'
        },
        noChangeControl: {
          status: 'succeeded',
          exitCode: 0,
          runtimeSecondsApprox: 24.7,
          reportSizeApprox: '395 KB',
          evidence: 'same VI revision generated a valid no-change report'
        },
        missingFileControl: {
          status: 'blocked-before-docker',
          blockedReason: 'left-blob-read-failed',
          evidence: 'preflight blocked before Docker invocation'
        }
      },
      docsGapsClosed: {
        installCompileAfterTagCheckout:
          'https://github.com/svelderrainruiz/vi-history-suite/issues/55',
        issueTemplateContactLinks: 'https://github.com/svelderrainruiz/vi-history-suite/issues/57',
        dockerImageFirstPullWarning:
          'https://github.com/svelderrainruiz/vi-history-suite/issues/58',
        repeatableFixtureRecipe: 'https://github.com/svelderrainruiz/vi-history-suite/issues/59'
      },
      windowsHostLabviewProof: 'community-deferred',
      publicFacadeDocsPromotionDecision: 'needed-after-gitlab-authority-mr-green',
      publicGitHubMutationDuringAuthorityCloseout: false,
      marketplaceMutationDuringAuthorityCloseout: false
    };

    expect(packet.canonicalPublicDockerFixtureBattery).toMatchObject(expectedBattery);
    expect(releaseState.publicValidationPrerelease.canonicalPublicDockerFixtureBattery).toMatchObject(
      expectedBattery
    );
    expect(marketplaceLedger.publicValidationPrerelease.canonicalPublicDockerFixtureBattery).toMatchObject(
      expectedBattery
    );

    expect(packet.canonicalPublicDockerFixtureBattery.retainedEvidence).toMatchObject({
      parentIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/48',
      validationSuccessIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/49',
      docsFixtureRecipeIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/59',
      issueRange: '#48-#59'
    });
    expect(packet.authoritySurfaces).toEqual(
      expect.arrayContaining([
        'README.md',
        'INSTALL.md',
        'public-github-source/README.md',
        'public-github-source/INSTALL.md',
        'public-github-source/.github/ISSUE_TEMPLATE/config.yml',
        'docs/information-for-users/command-reference.md',
        'docs/product/public-validation-prerelease-v1.3.11.md',
        'docs/product/release-publication-state.md',
        'docs/product/vscode-marketplace-publication-ledger.md',
        'docs/requirements/rtm.csv'
      ])
    );
    expect(releaseState.publicValidationPrerelease.docsGapsClosedByAuthorityCloseout).toEqual([
      'https://github.com/svelderrainruiz/vi-history-suite/issues/55',
      'https://github.com/svelderrainruiz/vi-history-suite/issues/57',
      'https://github.com/svelderrainruiz/vi-history-suite/issues/58',
      'https://github.com/svelderrainruiz/vi-history-suite/issues/59'
    ]);
  });

  it('retains the repeatable fixture recipe in user docs and release-control text', () => {
    const textSurfaces = [
      'README.md',
      'INSTALL.md',
      'public-github-source/README.md',
      'public-github-source/INSTALL.md',
      'docs/information-for-users/command-reference.md',
      'docs/product/public-validation-prerelease-v1.3.11.md',
      'docs/product/release-publication-state.md',
      'docs/product/vscode-marketplace-publication-ledger.md',
      'docs/product/current-state.md',
      'docs/release-procedure.md'
    ];

    for (const surface of textSurfaces) {
      const text = readText(surface);
      expect(text).toContain(fixtureRepository);
      expect(text).toContain(fixtureViPath);
      expect(text).toContain(oldCommit);
      expect(text).toContain(newCommit);
      expect(text).toContain('left-blob-read-failed');
      expect(text).toContain(dockerImage);
      expect(text).toContain('1.4 GB');
      expect(text).toContain('Windows');
    }

    const packet = readText('docs/product/public-validation-prerelease-v1.3.11.md');
    expect(packet).toContain('diff-report-lv_icon.vi.html');
    expect(packet).toContain('about `112` seconds');
    expect(packet).toContain('about `24.7` seconds');
    expect(packet).toContain('about `395 KB`');
    expect(packet).toContain('issues/48');
    expect(packet).toContain('issues/59');
    expect(packet).toContain('Public GitHub and Marketplace mutation are not part of this');

    const install = readText('INSTALL.md');
    const publicInstall = readText('public-github-source/INSTALL.md');
    for (const sourceInstall of [install, publicInstall]) {
      expect(sourceInstall).toContain('npm run compile');
      expect(sourceInstall).toContain('post-start step');
      expect(sourceInstall).toContain('does not rerun automatically after a checkout');
      expect(sourceInstall).toContain('git show');
      expect(sourceInstall).toContain('/tmp/lv_icon-old.vi');
      expect(sourceInstall).toContain('/tmp/lv_icon-new.vi');
    }

    const commandReference = readText('docs/information-for-users/command-reference.md');
    const collapsedCommandReference = collapseWhitespace(commandReference);
    expect(commandReference).toContain('npm run public:fixture:icon-editor');
    expect(commandReference).toContain('positive historical compare succeeded');
    expect(collapsedCommandReference).toContain(
      'daemon reachability and runtime selection are valid'
    );
  });

  it('retains public issue chooser routes for success, failure, and not-implemented reports', () => {
    const issueConfig = readText('public-github-source/.github/ISSUE_TEMPLATE/config.yml');
    const collapsedIssueConfig = collapseWhitespace(issueConfig);

    expect(issueConfig).toContain('validation-success.yml');
    expect(issueConfig).toContain('validation-failure.yml');
    expect(issueConfig).toContain('feature-not-implemented.yml');
    expect(collapsedIssueConfig).toContain('Docker/Linux validation success');
    expect(collapsedIssueConfig).toContain('Validation failure');
    expect(collapsedIssueConfig).toContain('Feature not implemented');
    expect(collapsedIssueConfig).toContain('VIHS_E code');
  });

  it('keeps the fixture battery traced in requirements and the test plan', () => {
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    for (const surface of [srs, rtm, testPlan]) {
      expect(surface).toContain('VHS-REQ-586');
      expect(surface).toContain(fixtureRepository);
      expect(surface).toContain(fixtureViPath);
      expect(surface).toContain(oldCommit);
      expect(surface).toContain(newCommit);
      expect(surface).toContain('left-blob-read-failed');
      expect(surface).toContain(dockerImage);
      expect(surface).toContain('1.4 GB');
      expect(surface).toContain('community/deferred');
    }

    expect(rtm).toContain('TEST-UNIT-393; TEST-DOC-145');
    expect(rtm).toContain('tests/unit/publicDockerFixtureBatteryDocs.test.ts');
    expect(testPlan).toContain('TEST-UNIT-393');
    expect(testPlan).toContain('TEST-DOC-145');
  });
});
