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

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('public GitHub community-validation intake promotion plan', () => {
  it('retains the verified public intake publication result and remaining no-mutation boundaries', () => {
    const plan = readText(
      'docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md'
    );
    const planJson = readJson<any>(
      'docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const marketplaceLedger = readJson<any>(
      'docs/product/vscode-marketplace-publication-ledger.json'
    );
    const intake = readJson<any>(
      'docs/product/marketplace-community-validation-intake-v1.3.10.json'
    );
    const publicSourceMap = collapseWhitespace(
      readText('docs/product/public-github-source-authority-map.md')
    );
    const releaseProcedure = collapseWhitespace(readText('docs/release-procedure.md'));
    const currentState = collapseWhitespace(readText('docs/product/current-state.md'));
    const informationItemMap = readText('docs/information-item-map.md');

    expect(planJson).toMatchObject({
      schema: 'vi-history-suite/public-github-community-validation-intake-promotion-plan@v1',
      status: 'published-and-verified',
      requiredTriggerPhrase: 'publish the public intake now',
      authority: {
        system: 'gitlab',
        branch: 'develop',
        sourcePacketPath: 'docs/product/marketplace-community-validation-intake-v1.3.10.md',
        promotionScript: 'scripts/promotePublicGithubSource.js'
      },
      target: {
        repoUrl: 'https://github.com/svelderrainruiz/vi-history-suite',
        remoteUrl: 'https://github.com/svelderrainruiz/vi-history-suite.git',
        branch: 'main',
        previousPublishedHead: 'fb0ef2b',
        currentPublishedHead: 'b56fde1',
        currentPublishedHeadSha: 'b56fde158fe151a736fe72c833efdfd0874d8537',
        currentPublishedLine: 'v1.3.9'
      },
      mutationState: {
        publicGitHubCheckoutWritten: true,
        publicGitHubRemotePushed: true,
        publicGitHubLabelsApplied: true,
        publicGitHubReleaseMutated: false,
        publicGitHubTagMutated: false,
        publicWikiMutated: false,
        marketplaceMutated: false
      }
    });
    expect(planJson.publicationResult).toMatchObject({
      status: 'published-and-verified',
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/45',
      mergeCommit: 'b56fde158fe151a736fe72c833efdfd0874d8537',
      mergeCommitShort: 'b56fde1',
      labelsApplied: true
    });

    expect(planJson.scope.intakeSpecificSources).toEqual(
      expect.arrayContaining([
        'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml',
        'public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml',
        'public-github-source/.github/ISSUE_TEMPLATE/labview-version-support.yml',
        'public-github-source/.github/ISSUE_TEMPLATE/feature-request.yml',
        'public-github-source/.github/ISSUE_TEMPLATE/config.yml',
        'public-github-source/.github/labels.yml',
        'public-github-source/README.md',
        'public-github-source/SUPPORT.md'
      ])
    );
    expect(planJson.scope.explicitExclusions).toEqual(
      expect.arrayContaining([
        'public-github-release-mutation',
        'public-github-tag-mutation',
        'vscode-marketplace-publication',
        'public-github-wiki-publication',
        'windows-labview-maintainer-proof-claim',
        'linux-docker-as-windows-labview-proof'
      ])
    );
    expect(planJson.gates.map((gate: { id: string }) => gate.id)).toEqual([
      'authority-readiness',
      'trigger-gate',
      'target-checkout-gate',
      'local-facade-promotion',
      'public-checkout-validation',
      'public-commit-and-push',
      'label-application',
      'post-publication-verification',
      'authority-closeout'
    ]);
    expect(planJson.gates.find((gate: any) => gate.id === 'label-application')).toMatchObject({
      requiresTrigger: true,
      sourceManifest: 'public-github-source/.github/labels.yml',
      verificationCommand: 'gh label list --repo svelderrainruiz/vi-history-suite --limit 100'
    });
    expect(planJson.knownLocalTargetConditionAtPreparation).toMatchObject({
      status: 'dirty-preexisting-side-work'
    });

    expect(plan).toContain('Required trigger phrase: `publish the public intake now`');
    expect(plan).toContain('Plan status: published and verified');
    expect(plan).toContain('Public GitHub mutation performed by this plan: yes');
    expect(plan).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/45');
    expect(plan).toContain('b56fde158fe151a736fe72c833efdfd0874d8537');
    expect(plan).toContain('Pushing `.github/labels.yml` does not by itself change repository labels.');
    expect(plan).toContain('Do not create or move a public GitHub tag.');
    expect(plan).toContain('Do not create or edit a public GitHub release.');
    expect(plan).toContain('Stop if the public checkout is dirty with unrelated work.');

    expect(releaseState.marketplaceCommunityValidationPreview).toMatchObject({
      intakeStatus: 'public-github-published-and-verified',
      publicGitHubIntakePromotionPlanStatus: 'published-and-verified',
      publicGitHubIntakePromotionPlanPath:
        'docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md',
      publicGitHubIntakePromotionRequiredTrigger: 'publish the public intake now',
      publicGitHubIntakePublishedShortCommit: 'b56fde1',
      publicGitHubIntakeLabelsApplied: true
    });
    expect(marketplaceLedger.communityValidationIntake).toMatchObject({
      status: 'public-github-published-and-verified',
      publicGitHubIntakePromotionPlanStatus: 'published-and-verified',
      publicGitHubIntakePromotionPlanPath:
        'docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md',
      publicGitHubIntakePromotionRequiredTrigger: 'publish the public intake now',
      publicGitHubPublishedShortCommit: 'b56fde1',
      publicGitHubLabelsApplied: true,
      publicGitHubMutationAttempted: true,
      marketplaceMutationAttempted: false
    });
    expect(intake.publicGitHubBoundary).toMatchObject({
      promotionPlanPath:
        'docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md',
      requiredPromotionTrigger: 'publish the public intake now',
      labelManifestRequiresSeparateApplication: true,
      publishedShortCommit: 'b56fde1',
      labelsApplied: true
    });
    expect(publicSourceMap).toContain('publish the public intake now');
    expect(publicSourceMap).toContain('publishing `.github/labels.yml` does not itself update');
    expect(publicSourceMap).toContain('b56fde1');
    expect(releaseProcedure).toContain(
      'public-github-community-validation-intake-promotion-plan-v1.3.10.md'
    );
    expect(releaseProcedure).toContain('publish the public intake now');
    expect(releaseProcedure).toContain('pushing the manifest does not itself update');
    expect(currentState).toContain(
      'public-github-community-validation-intake-promotion-plan-v1.3.10.md'
    );
    expect(informationItemMap).toContain(
      'Public GitHub community-validation intake promotion plan'
    );
  });
});
