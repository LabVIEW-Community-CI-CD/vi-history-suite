import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

type CampaignPacket = {
  status: string;
  gitlabWorkItem: string;
  currentExactVersion: string;
  marketplaceItemId: string;
  publicationBoundary: {
    publicGitHubReleaseMutationAdmitted: boolean;
    marketplaceMutationAdmitted: boolean;
    releaseBranchDeletionAdmitted: boolean;
    marketplacePublicationProvesInstalledUserAcceptance: boolean;
  };
  acceptancePath: Array<{
    id: string;
    state: 'observed' | 'deferred' | 'separate-gate';
    evidence: string | null;
  }>;
  videoObservationPolicy: {
    placeholderVideoUrlsAllowed: boolean;
    fakeThumbnailsAllowed: boolean;
    deadMediaEmbedsAllowed: boolean;
  };
  nextSemVerDecision: {
    default: string;
    openPatchWhen: string[];
    windowsDockerDesktopDecisionSurface: string;
  };
};

type ObservationCadencePacket = {
  status: string;
  sourceWorkItem: string;
  predecessorCampaignWorkItem: string;
  cadenceModel: string;
  publicFeedbackIntake: {
    url: string;
    state: string;
    commentCount: number;
    labels: string[];
  };
  nextCycleRunsWhen: string[];
  cycleOutputs: string[];
  factBuckets: Record<string, string>;
  routingRules: {
    documentation: string;
    videoPlan: string;
    semver: string;
  };
  windowsDockerDesktopBoundary: {
    state: string;
    issue: string;
    path: string;
  };
  publicationBoundary: {
    publicGitHubReleaseMutationAdmitted: boolean;
    marketplaceMutationAdmitted: boolean;
    releaseBranchDeletionAdmitted: boolean;
    marketplacePublicationProvesInstalledUserAcceptance: boolean;
  };
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('post-publication installed-user acceptance campaign', () => {
  it('retains a planned campaign without treating publication as acceptance proof', () => {
    const campaign = readJson<CampaignPacket>(
      'docs/product/post-publication-installed-user-acceptance-campaign-2026-05-15.json'
    );
    const campaignDoc = readText(
      'docs/product/post-publication-installed-user-acceptance-campaign-2026-05-15.md'
    );

    expect(campaign).toMatchObject({
      status: 'planned-after-publication',
      gitlabWorkItem: 'gitlab#10',
      currentExactVersion: '1.3.16',
      marketplaceItemId: 'svelderrainruiz.vi-history-suite'
    });
    expect(campaign.publicationBoundary).toEqual({
      publicGitHubReleaseMutationAdmitted: false,
      marketplaceMutationAdmitted: false,
      releaseBranchDeletionAdmitted: false,
      marketplacePublicationProvesInstalledUserAcceptance: false
    });
    expect(campaign.acceptancePath).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'marketplace-listing-readback', state: 'observed' }),
        expect.objectContaining({ id: 'exact-vsix-install-proof', state: 'observed' }),
        expect.objectContaining({ id: 'clean-windows-marketplace-install', state: 'deferred' }),
        expect.objectContaining({ id: 'quiet-extension-selection', state: 'deferred' }),
        expect.objectContaining({ id: 'prepare-local-runtime-settings-cli', state: 'deferred' }),
        expect.objectContaining({ id: 'host-runtime-validate', state: 'deferred' }),
        expect.objectContaining({ id: 'first-canonical-vi-compare', state: 'deferred' }),
        expect.objectContaining({ id: 'report-and-evidence-review', state: 'deferred' }),
        expect.objectContaining({
          id: 'windows-docker-desktop-windows-container-proof',
          state: 'separate-gate'
        })
      ])
    );
    expect(campaign.videoObservationPolicy).toMatchObject({
      placeholderVideoUrlsAllowed: false,
      fakeThumbnailsAllowed: false,
      deadMediaEmbedsAllowed: false
    });
    expect(campaign.nextSemVerDecision.default).toBe('sustainment-only');
    expect(campaign.nextSemVerDecision.windowsDockerDesktopDecisionSurface).toBe('ISSUE-0415');

    expect(campaignDoc).toContain('No VS Code Marketplace mutation.');
    expect(campaignDoc).toContain('No claim that Marketplace publication itself proves');
    expect(campaignDoc).toContain('Default decision: sustainment-only.');
    expect(campaignDoc).toMatch(/placeholder video URLs,\s+fake\s+thumbnails, or dead media embeds/);
  });

  it('wires the campaign into authority state as the next product-observation action', () => {
    const releaseState = readJson<{
      nextAdmittedAction: string;
      postPublicationInstalledUserAcceptanceCampaign?: {
        status: string;
        gitlabWorkItem: string;
        packetPath: string;
        packetJsonPath: string;
        marketplacePublicationProvesInstalledUserAcceptance: boolean;
        publicationMutationAdmitted: boolean;
        nextProductAction: string;
        separateWindowsDockerDesktopGate: string;
      };
      postPublicationInstalledUserObservationCadence?: {
        status: string;
        gitlabWorkItem: string;
        packetPath: string;
        packetJsonPath: string;
        cadenceModel: string;
        nextCycleNoLaterThan: string;
        nextProductAction: string;
        publicFeedbackIntakeState: string;
        publicFeedbackIntakeCommentCount: number;
        requiredCycleOutputs: string[];
        separateWindowsDockerDesktopGate: string;
      };
    }>('docs/product/release-publication-state.json');
    const releaseStateDoc = readText('docs/product/release-publication-state.md');
    const currentState = readText('docs/product/current-state.md');
    const maintainerIndex = readText('docs/product/maintainer-control-plane-index.md');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(releaseState.nextAdmittedAction).toBe(
      'retain-v1.3.16-marketplace-closeout-on-protected-develop'
    );
    expect(releaseState.postPublicationInstalledUserAcceptanceCampaign).toEqual(
      expect.objectContaining({
        status: 'planned-after-publication',
        gitlabWorkItem: 'gitlab#10',
        packetPath: 'docs/product/post-publication-installed-user-acceptance-campaign-2026-05-15.md',
        packetJsonPath:
          'docs/product/post-publication-installed-user-acceptance-campaign-2026-05-15.json',
        marketplacePublicationProvesInstalledUserAcceptance: false,
        publicationMutationAdmitted: false,
        nextProductAction: 'run-post-publication-installed-user-acceptance-campaign',
        separateWindowsDockerDesktopGate:
          'docs/product/issues/ISSUE-0415-windows-docker-desktop-launch-gate.md'
      })
    );
    expect(releaseState.postPublicationInstalledUserObservationCadence).toEqual(
      expect.objectContaining({
        status: 'active-recurring-cadence',
        gitlabWorkItem: 'gitlab#22',
        packetPath:
          'docs/product/post-publication-installed-user-observation-cadence-2026-05-16.md',
        packetJsonPath:
          'docs/product/post-publication-installed-user-observation-cadence-2026-05-16.json',
        cadenceModel: 'event-driven-with-monthly-review-while-public-intake-open',
        nextCycleNoLaterThan: '2026-06-14',
        nextProductAction: 'run-installed-user-observation-cycle',
        publicFeedbackIntakeState: 'open',
        publicFeedbackIntakeCommentCount: 0,
        separateWindowsDockerDesktopGate:
          'docs/product/issues/ISSUE-0415-windows-docker-desktop-launch-gate.md'
      })
    );
    expect(releaseState.postPublicationInstalledUserObservationCadence?.requiredCycleOutputs).toEqual(
      expect.arrayContaining([
        'observedFacts',
        'deferredFacts',
        'blockedFacts',
        'documentationCandidates',
        'videoPlanCandidates',
        'semverRecommendation',
        'windowsDockerDesktopGateReference'
      ])
    );
    expect(releaseStateDoc).toContain('## Post-Publication Installed-User Acceptance Campaign');
    expect(releaseStateDoc).toContain('## Post-Publication Installed-User Observation Cadence');
    expect(releaseStateDoc).toContain('Marketplace publication is not treated as first-time installed-user');
    expect(releaseStateDoc).toContain('event-driven-with-monthly-review-while-public-intake-open');
    expect(releaseStateDoc).toContain('Next cycle no later than: `2026-06-14`');
    expect(currentState).toContain('current next product-observation action');
    expect(currentState).toContain('installed-user observation cadence model');
    expect(currentState).toContain('no later than `2026-06-14`');
    expect(currentState).toContain('first-time installed-user acceptance remains a');
    expect(maintainerIndex).toContain('next product-observation action');
    expect(maintainerIndex).toContain('installed-user observation cadence model');
    expect(maintainerIndex).toContain('published Marketplace state is not first-time');
    expect(informationItemMap).toContain('Post-publication installed-user acceptance campaign');
    expect(informationItemMap).toContain('Post-publication installed-user observation cadence');
  });

  it('defines the recurring observation cadence without admitting publication mutation', () => {
    const cadence = readJson<ObservationCadencePacket>(
      'docs/product/post-publication-installed-user-observation-cadence-2026-05-16.json'
    );
    const cadenceDoc = readText(
      'docs/product/post-publication-installed-user-observation-cadence-2026-05-16.md'
    );

    expect(cadence).toMatchObject({
      status: 'active-recurring-cadence',
      sourceWorkItem: 'gitlab#22',
      predecessorCampaignWorkItem: 'gitlab#10',
      cadenceModel: 'event-driven-with-monthly-review-while-public-intake-open'
    });
    expect(cadence.publicFeedbackIntake).toMatchObject({
      url: 'https://github.com/svelderrainruiz/vi-history-suite/issues/98',
      state: 'open',
      commentCount: 0
    });
    expect(cadence.publicFeedbackIntake.labels).toEqual(
      expect.arrayContaining(['installed-user-ux', 'user-docs', 'public-facade'])
    );
    expect(cadence.nextCycleRunsWhen).toEqual(
      expect.arrayContaining([
        'a new exact VS Code Marketplace publication closes',
        'public feedback intake receives a new installed-user report or confusion signal',
        'no later than 2026-06-14 while the public feedback intake remains open'
      ])
    );
    expect(cadence.cycleOutputs).toEqual(
      expect.arrayContaining([
        'observedFacts',
        'deferredFacts',
        'blockedFacts',
        'documentationCandidates',
        'videoPlanCandidates',
        'semverRecommendation',
        'windowsDockerDesktopGateReference'
      ])
    );
    expect(Object.keys(cadence.factBuckets).sort()).toEqual(['blocked', 'deferred', 'observed']);
    expect(cadence.routingRules.documentation).toContain('Repeated confusion');
    expect(cadence.routingRules.videoPlan).toContain('no placeholder URLs');
    expect(cadence.routingRules.semver).toContain('Default to sustainment-only');
    expect(cadence.windowsDockerDesktopBoundary).toEqual(
      expect.objectContaining({
        state: 'separate-gate',
        issue: 'ISSUE-0415',
        path: 'docs/product/issues/ISSUE-0415-windows-docker-desktop-launch-gate.md'
      })
    );
    expect(cadence.publicationBoundary).toEqual({
      publicGitHubReleaseMutationAdmitted: false,
      marketplaceMutationAdmitted: false,
      releaseBranchDeletionAdmitted: false,
      marketplacePublicationProvesInstalledUserAcceptance: false
    });

    expect(cadenceDoc).toContain('Run a new installed-user observation cycle');
    expect(cadenceDoc).toContain('no later than 2026-06-14');
    expect(cadenceDoc).toContain('observed facts');
    expect(cadenceDoc).toContain('deferred facts');
    expect(cadenceDoc).toContain('blocked facts');
    expect(cadenceDoc).toContain('No VS Code Marketplace mutation.');
    expect(cadenceDoc).toContain('Windows Docker Desktop Windows-container proof remains a separate gate');
  });
});
