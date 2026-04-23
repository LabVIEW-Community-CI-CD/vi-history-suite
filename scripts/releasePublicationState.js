#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_PUBLICATION_STATE_PATH = 'docs/product/release-publication-state.json';

function readJson(relativeOrAbsolutePath, fsApi = fs) {
  const targetPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);
  return JSON.parse(fsApi.readFileSync(targetPath, 'utf8'));
}

function tryReadJson(relativeOrAbsolutePath, fsApi = fs) {
  try {
    return readJson(relativeOrAbsolutePath, fsApi);
  } catch {
    return null;
  }
}

function normalizeTag(tagOrVersion) {
  const value = String(tagOrVersion ?? '').trim();
  if (!value) {
    return null;
  }
  return value.startsWith('v') ? value : `v${value}`;
}

function versionFromTag(tagOrVersion) {
  const tag = normalizeTag(tagOrVersion);
  return tag ? tag.replace(/^v/, '') : null;
}

function buildMarketplacePublishNextAction(versionOrTag) {
  const version = versionFromTag(versionOrTag);
  return version
    ? `publish-v${version}-to-vscode-marketplace-after-explicit-production-approval`
    : 'publish-selected-version-to-vscode-marketplace-after-explicit-production-approval';
}

function buildMarketplaceFactoryAction(kind, versionOrTag) {
  const version = versionFromTag(versionOrTag);
  const versionSegment = version ? `v${version}` : 'selected-version';
  const actions = {
    prepare: `prepare-vscode-marketplace-${versionSegment}-publication`,
    publishAfterApproval: `publish-vscode-marketplace-${versionSegment}-after-explicit-approval`,
    publishAfterGitHub: `publish-vscode-marketplace-${versionSegment}-after-github-release-verification`,
    publishWithPinnedVsce: `publish-vscode-marketplace-${versionSegment}-with-pinned-vsce`,
    verify: `verify-vscode-marketplace-${versionSegment}-publication`,
    verifyAfterPublication: `verify-marketplace-${versionSegment}-after-marketplace-publication`
  };
  return actions[kind] ?? `${kind}-${versionSegment}`;
}

function loadPublicationState(fsApi = fs, statePath = DEFAULT_PUBLICATION_STATE_PATH) {
  return tryReadJson(statePath, fsApi);
}

function resolvePublicationStateFallback(fsApi = fs) {
  const publicReleaseCandidate = tryReadJson('docs/product/public-release-candidate.json', fsApi) ?? {};
  const sustainmentRules = tryReadJson('docs/product/post-release-sustainment-rules.json', fsApi) ?? {};
  const versionLineContract = sustainmentRules.releaseCadence?.versionLineContract ?? {};
  const exactTag = normalizeTag(
    versionLineContract.currentExactReleaseLine ??
      publicReleaseCandidate.exactRelease?.version ??
      publicReleaseCandidate.versionLine
  );
  const packageVersion = versionFromTag(exactTag);
  const activeCandidateVersion =
    publicReleaseCandidate.versionLine ??
    versionLineContract.activeHotfixCandidateReleaseLine ??
    versionLineContract.activeDevelopCandidateReleaseLine ??
    null;

  return {
    schema: 'vi-history-suite/release-publication-state@v1',
    authority: {
      exactTag,
      packageVersion,
      integrationBranch: versionLineContract.integrationBranch ?? 'develop',
      exactReleaseLineBranch: versionLineContract.exactReleaseLineBranch ?? 'main',
      gitlabArtifactAuthority: '.cache/gitlab-release-artifacts/<tag>/expanded/release-evidence/'
    },
    publicGitHub: {
      mainCommit:
        publicReleaseCandidate.localProofs?.publicGitHubExactTransaction?.publicMainCommit ?? null,
      tag: publicReleaseCandidate.localProofs?.publicGitHubExactTransaction?.publicTag ?? exactTag,
      release: {
        id:
          publicReleaseCandidate.localProofs?.publicGitHubExactTransaction?.publicReleaseId ??
          publicReleaseCandidate.localProofs?.publicGitHubExactTransaction?.draftReleaseId ??
          null,
        tag: exactTag,
        published:
          publicReleaseCandidate.localProofs?.publicGitHubExactTransaction?.verifyGateStatus === 'pass',
        immutable: null,
        assetStatus:
          publicReleaseCandidate.localProofs?.publicGitHubExactTransaction
            ?.releaseAssetsRetainedAgainstManifest === true
            ? 'verified'
            : 'unknown'
      }
    },
    marketplace: {
      itemName:
        publicReleaseCandidate.exactRelease?.marketplaceItemName ??
        'svelderrainruiz.vi-history-suite',
      currentPublishedVersion: publicReleaseCandidate.exactRelease?.marketplaceVersion ?? null,
      expectedVersion: packageVersion
    },
    incident: {
      active: false,
      classification: 'none',
      blockerCode: null
    },
    activeCandidate: activeCandidateVersion
      ? {
          packageVersion: versionFromTag(activeCandidateVersion),
          tag: normalizeTag(activeCandidateVersion)
        }
      : null,
    nextAdmittedAction: null
  };
}

function resolvePublicationState(fsApi = fs, statePath = DEFAULT_PUBLICATION_STATE_PATH) {
  const retainedState = loadPublicationState(fsApi, statePath);
  return retainedState ?? resolvePublicationStateFallback(fsApi);
}

function deriveTargetFromReceiptOrState(transactionReceipt, fsApi = fs) {
  const state = resolvePublicationState(fsApi);
  const tag =
    transactionReceipt?.authority?.tag ??
    state.activeCandidate?.tag ??
    state.authority?.exactTag ??
    normalizeTag(state.publicGitHub?.release?.tag);
  const packageVersion =
    transactionReceipt?.authority?.packageVersion ??
    state.activeCandidate?.packageVersion ??
    state.authority?.packageVersion ??
    versionFromTag(tag);

  return {
    tag: normalizeTag(tag),
    packageVersion,
    marketplaceItem:
      state.marketplace?.itemName ??
      transactionReceipt?.marketplace?.marketplaceItem ??
      'svelderrainruiz.vi-history-suite',
    currentMarketplaceVersion: state.marketplace?.currentPublishedVersion ?? null,
    state
  };
}

module.exports = {
  DEFAULT_PUBLICATION_STATE_PATH,
  buildMarketplaceFactoryAction,
  buildMarketplacePublishNextAction,
  deriveTargetFromReceiptOrState,
  loadPublicationState,
  normalizeTag,
  readJson,
  resolvePublicationState,
  resolvePublicationStateFallback,
  tryReadJson,
  versionFromTag
};
