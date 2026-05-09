import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const publicPullRequest = 'https://github.com/svelderrainruiz/vi-history-suite/pull/60';
const publicMainCommit = 'ce6dbd0b1b5783f7015b9d0589f3803636564789';
const publicMainShortCommit = 'ce6dbd0';
const authorityMergeRequest =
  'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/181';
const authorityDevelopPipeline =
  'https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2480821467';

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function expectPublicPr60(text: string): void {
  expect(text).toMatch(/(PR\s+`?#60`?|pull\/60)/);
}

describe('public GitHub fixture docs promotion closeout', () => {
  it('retains public PR #60 and post-merge public checks in authority JSON', () => {
    const packet = readJson<any>('docs/product/public-validation-prerelease-v1.3.11.json');
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const marketplaceLedger = readJson<any>(
      'docs/product/vscode-marketplace-publication-ledger.json'
    );
    const publicSourceLedger = readJson<any>(
      'docs/product/public-github-source-publication-ledger.json'
    );
    const publicReleaseCandidate = readJson<any>('docs/product/public-release-candidate.json');

    const expectedCloseout = {
      status: 'published-and-verified',
      repository: 'github.com/svelderrainruiz/vi-history-suite',
      pullRequest: publicPullRequest,
      publicBranch: 'main',
      sourceBranch: 'codex/canonical-public-docker-fixture-docs',
      headCommit: 'd9942a87fcf139e259eca65fd9af0b93a89507e8',
      mergeCommit: publicMainCommit,
      publicMainCommit,
      publicMainShortCommit,
      mergedAt: '2026-04-26T19:53:22Z',
      promotedFiles: ['README.md', 'INSTALL.md', '.github/ISSUE_TEMPLATE/config.yml'],
      governedAuthorityMergeRequest: authorityMergeRequest,
      governedAuthorityDevelopCommit: '88c60fead29aae8cc250bbbb6381697595c63e4c',
      governedAuthorityDevelopPipeline: authorityDevelopPipeline,
      marketplaceMutation: 'not-performed'
    };

    for (const closeout of [
      packet.publicationTargets.publicGitHub.publicFacadeDocsPromotionCloseout,
      packet.canonicalPublicDockerFixtureBattery.publicFacadeDocsPromotionCloseout,
      releaseState.publicGitHub.sourcePublication.publicFacadeDocsPromotionCloseout,
      releaseState.publicValidationPrerelease.publicFacadeDocsPromotionCloseout,
      releaseState.publicValidationPrerelease.canonicalPublicDockerFixtureBattery
        .publicFacadeDocsPromotionCloseout,
      marketplaceLedger.publicValidationPrerelease.publicFacadeDocsPromotionCloseout,
      marketplaceLedger.publicValidationPrerelease.canonicalPublicDockerFixtureBattery
        .publicFacadeDocsPromotionCloseout,
      publicSourceLedger.publicFacadeDocsPromotionCloseout,
      publicReleaseCandidate.publishedPublicSource.latestPublicFacadeDocsPromotion
    ]) {
      expect(closeout).toMatchObject(expectedCloseout);
      expect(closeout.postMergeMainChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workflowName: 'Public Source Package Preview',
            runId: 24965599550,
            conclusion: 'success',
            headSha: publicMainCommit
          }),
          expect.objectContaining({
            workflowName: 'Public Windows Installed-User Contract',
            runId: 24965599548,
            conclusion: 'success',
            headSha: publicMainCommit
          }),
          expect.objectContaining({
            workflowName: 'Public Linux Installed-User Smoke',
            runId: 24965599557,
            conclusion: 'success',
            headSha: publicMainCommit
          })
        ])
      );
      expect(closeout.marketplaceBoundary).toContain('Marketplace remained untouched');
    }

    expect(releaseState.publicGitHub).toMatchObject({
      mainCommit: 'f1cb60900820ea17328b9eec595579768491e22a',
      sourcePublication: {
        status:
          'public-source-and-tag-v1.3.14-promoted-release-publication-blocked',
        currentMainCommit: 'f1cb60900820ea17328b9eec595579768491e22a',
        currentMainShortCommit: 'f1cb609',
        latestPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
        latestPublicValidationFixturePullRequest:
          'https://github.com/svelderrainruiz/vi-history-suite/pull/63',
        latestWindowsDockerDesktopIntakePromotionCloseout: expect.objectContaining({
          status: 'published-and-verified',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
          publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
          publicMainShortCommit: '220111e',
          marketplaceMutation: 'not-performed'
        }),
        latestPublicSourceAndTagHandoffCloseout: expect.objectContaining({
          status: 'published-and-verified-release-publication-blocked',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
          publicMainCommit: 'f1cb60900820ea17328b9eec595579768491e22a',
          publicMainShortCommit: 'f1cb609',
          publicTag: 'v1.3.14',
          publicTagObjectSha: 'b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae',
          publicGitHubReleasePublication: 'not-performed',
          marketplaceMutation: 'not-performed'
        }),
        publicDevelopSync: expect.objectContaining({
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/64',
          status: 'not-applied-requires-separate-branch-policy-decision'
        })
      }
    });
    expect(releaseState.publicValidationPrerelease.publicFacadeDocsPromotionDecision).toBe(
      'completed-through-public-pr-60-after-gitlab-authority-green'
    );
    expect(publicSourceLedger).toMatchObject({
      publishedHeadCommit: 'f1cb609',
      publishedHeadCommitSha: 'f1cb60900820ea17328b9eec595579768491e22a'
    });
    expect(publicSourceLedger.publications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'public-source-v1-3-11-canonical-docker-fixture-docs-promotion',
          repoCommit: publicMainShortCommit,
          repoCommitSha: publicMainCommit,
          pullRequest: publicPullRequest,
          marketplaceMutation: 'not-performed'
        })
      ])
    );
    expect(publicReleaseCandidate.publishedPublicSource).toMatchObject({
      currentPublicSourceHead: 'f1cb609',
      currentPublicSourceHeadSha: 'f1cb60900820ea17328b9eec595579768491e22a',
      latestPublicSourceAndTagHandoff: expect.objectContaining({
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
        publicMainCommit: 'f1cb60900820ea17328b9eec595579768491e22a',
        publicMainShortCommit: 'f1cb609',
        publicTag: 'v1.3.14',
        publicTagObjectSha: 'b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae'
      }),
      latestPublicFacadeDocsPromotion: expect.objectContaining({
        pullRequest: publicPullRequest,
        publicMainCommit,
        publicMainShortCommit
      })
    });
  });

  it('retains the closeout in authority Markdown and traceability surfaces', () => {
    const textSurfaces = [
      'README.md',
      'docs/product/current-state.md',
      'docs/product/public-validation-prerelease-v1.3.11.md',
      'docs/product/release-publication-state.md',
      'docs/product/vscode-marketplace-publication-ledger.md',
      'docs/product/public-github-source-publication-ledger.md',
      'docs/product/public-release-candidate.md',
      'docs/release-procedure.md',
      'docs/requirements/srs.md',
      'docs/requirements/rtm.csv',
      'docs/testing/test-plan.md'
    ];

    for (const surface of textSurfaces) {
      const collapsed = collapseWhitespace(readText(surface));
      expectPublicPr60(collapsed);
      expect(collapsed).toContain(publicMainShortCommit);
      expect(collapsed).toContain('Marketplace');
    }

    const packet = readText('docs/product/public-validation-prerelease-v1.3.11.md');
    expect(packet).toContain(publicPullRequest);
    expect(packet).toContain(authorityMergeRequest);
    expect(packet).toContain(authorityDevelopPipeline);
    expect(packet).toContain(publicMainCommit);
    expect(packet).toContain('Public Source Package Preview');
    expect(packet).toContain('24965599550');
    expect(packet).toContain('Public Windows Installed-User Contract');
    expect(packet).toContain('24965599548');
    expect(packet).toContain('Public Linux Installed-User Smoke');
    expect(packet).toContain('24965599557');
    expect(packet).toContain('Marketplace mutation: not performed');

    const rtm = readText('docs/requirements/rtm.csv');
    const srs = readText('docs/requirements/srs.md');
    const testPlan = readText('docs/testing/test-plan.md');
    for (const surface of [rtm, srs, testPlan]) {
      expect(surface).toContain('VHS-REQ-587');
      expect(surface).toContain(publicMainCommit);
    }
    for (const surface of [rtm, testPlan]) {
      expect(surface).toContain('TEST-UNIT-394');
      expect(surface).toContain('TEST-DOC-146');
    }
  });
});
