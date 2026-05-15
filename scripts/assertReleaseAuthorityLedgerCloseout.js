#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const RELEASE_STATE_PATH = 'docs/product/release-publication-state.json';
const MARKETPLACE_LEDGER_PATH = 'docs/product/vscode-marketplace-publication-ledger.json';

const REQUIRED_CLOSEOUT_FIELDS = [
  'marketplaceItemId',
  'expectedVersion',
  'observedMarketplaceVersion',
  'publicationTimestamp',
  'verificationTimestamp',
  'packageSha256',
  'proofReceiptPaths.publicGitHubExactTransaction',
  'proofReceiptPaths.marketplacePreparation',
  'proofReceiptPaths.marketplacePostPublicationVerification',
  'proofReceiptPaths.windowsExactVsixInstallProof'
];

const REQUIRED_LEDGER_FILES = [
  'docs/product/release-publication-state.md',
  'docs/product/release-publication-state.json',
  'docs/product/vscode-marketplace-publication-ledger.md',
  'docs/product/vscode-marketplace-publication-ledger.json',
  'docs/product/public-github-source-publication-ledger.md',
  'docs/product/public-github-source-publication-ledger.json'
];

function readJson(relativePath, fsApi = fs) {
  return JSON.parse(fsApi.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function getPathValue(source, dottedPath) {
  return dottedPath.split('.').reduce((current, segment) => current?.[segment], source);
}

function isPresent(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function collectMissingCloseoutFields(closeout) {
  return REQUIRED_CLOSEOUT_FIELDS.filter((field) => !isPresent(getPathValue(closeout, field)));
}

function collectMissingLedgerFiles(files) {
  const fileSet = new Set(files ?? []);
  return REQUIRED_LEDGER_FILES.filter((file) => !fileSet.has(file));
}

function assertReleaseAuthorityLedgerCloseout(fsApi = fs) {
  const releaseState = readJson(RELEASE_STATE_PATH, fsApi);
  const marketplaceLedger = readJson(MARKETPLACE_LEDGER_PATH, fsApi);
  const releaseCloseout = releaseState.marketplacePostPublicationCloseout;
  const ledgerCloseout = marketplaceLedger.latestExactRelease?.postPublicationCloseout;
  const issues = [];

  if (!releaseCloseout) {
    issues.push('release-publication-state.json missing marketplacePostPublicationCloseout');
  } else {
    issues.push(
      ...collectMissingCloseoutFields(releaseCloseout).map(
        (field) => `release-publication-state.json missing marketplacePostPublicationCloseout.${field}`
      )
    );
  }

  if (!ledgerCloseout) {
    issues.push('vscode-marketplace-publication-ledger.json missing latestExactRelease.postPublicationCloseout');
  } else {
    issues.push(
      ...collectMissingCloseoutFields(ledgerCloseout).map(
        (field) => `vscode-marketplace-publication-ledger.json missing latestExactRelease.postPublicationCloseout.${field}`
      )
    );
  }

  if (releaseCloseout && ledgerCloseout) {
    for (const field of REQUIRED_CLOSEOUT_FIELDS) {
      const releaseValue = getPathValue(releaseCloseout, field);
      const ledgerValue = getPathValue(ledgerCloseout, field);
      if (isPresent(releaseValue) && isPresent(ledgerValue) && releaseValue !== ledgerValue) {
        issues.push(`closeout field mismatch for ${field}: release=${releaseValue} ledger=${ledgerValue}`);
      }
    }
  }

  const normalizedPath = releaseState.postPublicationLedgerNormalization?.normalizedCloseoutPath;
  if (normalizedPath !== 'marketplacePostPublicationCloseout') {
    issues.push('postPublicationLedgerNormalization.normalizedCloseoutPath must be marketplacePostPublicationCloseout');
  }
  issues.push(
    ...collectMissingLedgerFiles(releaseState.postPublicationLedgerNormalization?.requiredLedgerFiles).map(
      (file) => `postPublicationLedgerNormalization.requiredLedgerFiles missing ${file}`
    )
  );

  const publicGitHubState = releaseState.publicGitHub?.release?.published === true
    ? 'published'
    : releaseState.publicGitHub?.release?.published;
  if (releaseCloseout?.publicGitHubReleaseState !== publicGitHubState) {
    issues.push('marketplacePostPublicationCloseout.publicGitHubReleaseState must mirror the public GitHub release state');
  }
  if (releaseCloseout?.marketplacePublicationState !== 'published-and-verified') {
    issues.push('marketplacePostPublicationCloseout.marketplacePublicationState must be published-and-verified');
  }

  return {
    status: issues.length === 0 ? 'passed' : 'failed',
    checkedFiles: [RELEASE_STATE_PATH, MARKETPLACE_LEDGER_PATH],
    requiredCloseoutFields: REQUIRED_CLOSEOUT_FIELDS,
    requiredLedgerFiles: REQUIRED_LEDGER_FILES,
    issues
  };
}

function main() {
  const report = assertReleaseAuthorityLedgerCloseout();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === 'passed' ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REQUIRED_CLOSEOUT_FIELDS,
  REQUIRED_LEDGER_FILES,
  assertReleaseAuthorityLedgerCloseout,
  collectMissingCloseoutFields,
  collectMissingLedgerFiles
};
