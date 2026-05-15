#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const marketplacePrep = require(path.join(__dirname, 'prepareVsCodeMarketplacePublication.js'));

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'vscode-marketplace-post-publication-verification',
  'latest'
);
const DEFAULT_MARKETPLACE_ITEM = marketplacePrep.DEFAULT_MARKETPLACE_ITEM;
const DEFAULT_EXPECTED_VERSION = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
).version;

function getUsage() {
  return [
    'Usage: node scripts/verifyVsCodeMarketplacePublication.js [--expected-version <version>] [--marketplace-item <publisher.extension>] [--evidence-dir <path>] [--clean-install-validation <deferred|performed>] [--install-validation-receipt <path>] [--defer-reason <text>] [--help]',
    '',
    'Retain non-mutating VS Code Marketplace post-publication verification evidence.',
    'The command queries the official Marketplace gallery API, verifies the live item serves',
    'the expected version, records update/query timestamps, and records whether a clean',
    'VS Code profile install validation was performed or explicitly deferred.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    expectedVersion: DEFAULT_EXPECTED_VERSION,
    marketplaceItem: DEFAULT_MARKETPLACE_ITEM,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    cleanInstallValidation: 'deferred',
    installValidationReceipt: null,
    deferReason:
      'clean VS Code profile install validation deferred; retained Windows exact-VSIX install proof and Marketplace gallery readback cover ledger normalization input'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--expected-version') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --expected-version');
      }
      parsed.expectedVersion = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--marketplace-item') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --marketplace-item');
      }
      parsed.marketplaceItem = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--evidence-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-dir');
      }
      parsed.evidenceDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--clean-install-validation') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --clean-install-validation');
      }
      if (!['deferred', 'performed'].includes(value)) {
        throw new Error('--clean-install-validation must be deferred or performed');
      }
      parsed.cleanInstallValidation = value;
      index += 1;
      continue;
    }

    if (argument === '--install-validation-receipt') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --install-validation-receipt');
      }
      parsed.installValidationReceipt = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--defer-reason') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --defer-reason');
      }
      parsed.deferReason = value.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (parsed.cleanInstallValidation === 'performed' && !parsed.installValidationReceipt) {
    throw new Error('--install-validation-receipt is required when clean install validation was performed');
  }

  return parsed;
}

function buildCleanInstallValidation(options, fsApi = fs) {
  if (options.cleanInstallValidation === 'performed') {
    const receiptPath = path.isAbsolute(options.installValidationReceipt)
      ? options.installValidationReceipt
      : path.join(repoRoot, options.installValidationReceipt);
    const receiptExists = fsApi.existsSync(receiptPath);
    return {
      status: receiptExists ? 'performed' : 'missing-receipt',
      performed: receiptExists,
      deferred: false,
      receiptPath: options.installValidationReceipt,
      receiptExists,
      deferReason: null
    };
  }

  return {
    status: 'deferred',
    performed: false,
    deferred: true,
    receiptPath: null,
    receiptExists: false,
    deferReason: options.deferReason
  };
}

function buildMarkdown(report) {
  return [
    '# VS Code Marketplace Post-Publication Verification',
    '',
    `- Recorded: ${report.queryTimestamp}`,
    `- Status: ${report.status}`,
    `- Marketplace item: ${report.marketplace.marketplaceItem}`,
    `- Expected version: ${report.marketplace.expectedVersion}`,
    `- Observed version: ${report.marketplace.observedVersion ?? 'unknown'}`,
    `- Observed update timestamp: ${report.marketplace.observedUpdateTimestamp ?? 'unknown'}`,
    `- Marketplace mutation attempted: ${report.productionMutationAttempted}`,
    `- Clean install validation: ${report.cleanInstallValidation.status}`,
    '',
    '## Ledger Normalization Fields',
    '',
    `- Marketplace item id: ${report.ledgerNormalizationFields.marketplaceItemId}`,
    `- Expected version: ${report.ledgerNormalizationFields.expectedVersion}`,
    `- Observed version: ${report.ledgerNormalizationFields.observedVersion ?? 'unknown'}`,
    `- Publication/update timestamp: ${report.ledgerNormalizationFields.observedUpdateTimestamp ?? 'unknown'}`,
    `- Verification/query timestamp: ${report.ledgerNormalizationFields.queryTimestamp}`,
    `- Clean install validation status: ${report.ledgerNormalizationFields.cleanInstallValidationStatus}`,
    `- Clean install validation receipt: ${report.ledgerNormalizationFields.cleanInstallValidationReceiptPath ?? 'none'}`,
    '',
    'No VS Code Marketplace publication was attempted by this verification surface.'
  ].join('\n');
}

async function buildVerificationReport(options, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const fetchMarketplaceState = deps.fetchMarketplaceState ?? marketplacePrep.fetchMarketplaceState;
  const fsApi = deps.fs ?? fs;
  const queryTimestamp = now();
  const marketplace = await fetchMarketplaceState(options.marketplaceItem);
  const cleanInstallValidation = buildCleanInstallValidation(options, fsApi);
  const observedVersion = marketplace.currentPublishedVersion ?? null;
  const observedUpdateTimestamp =
    marketplace.currentPublishedVersionLastUpdated ??
    marketplace.latestMarketplaceVersionLastUpdated ??
    null;
  const versionMatches = observedVersion === options.expectedVersion;
  const cleanInstallReceiptReady =
    cleanInstallValidation.status === 'deferred' || cleanInstallValidation.status === 'performed';
  const status = marketplace.found && versionMatches && cleanInstallReceiptReady ? 'pass' : 'fail';

  return {
    schema: 'vi-history-suite/vscode-marketplace-post-publication-verification@v1',
    queryTimestamp,
    repoRoot,
    status,
    productionMutationAttempted: false,
    marketplace: {
      marketplaceItem: options.marketplaceItem,
      expectedVersion: options.expectedVersion,
      observedVersion,
      observedUpdateTimestamp,
      latestMarketplaceVersion: marketplace.latestMarketplaceVersion ?? null,
      latestMarketplaceVersionLastUpdated: marketplace.latestMarketplaceVersionLastUpdated ?? null,
      latestPreReleaseVersion: marketplace.latestPreReleaseVersion ?? null,
      latestPreReleaseVersionLastUpdated: marketplace.latestPreReleaseVersionLastUpdated ?? null,
      statusCode: marketplace.statusCode,
      found: marketplace.found === true,
      versionMatches
    },
    cleanInstallValidation,
    ledgerNormalizationFields: {
      marketplaceItemId: options.marketplaceItem,
      expectedVersion: options.expectedVersion,
      observedVersion,
      observedUpdateTimestamp,
      queryTimestamp,
      cleanInstallValidationStatus: cleanInstallValidation.status,
      cleanInstallValidationReceiptPath: cleanInstallValidation.receiptPath,
      proofReceiptPaths: {
        json: path
          .relative(repoRoot, path.join(options.evidenceDir, 'vscode-marketplace-post-publication-verification.json'))
          .replaceAll(path.sep, '/'),
        markdown: path
          .relative(repoRoot, path.join(options.evidenceDir, 'vscode-marketplace-post-publication-verification.md'))
          .replaceAll(path.sep, '/')
      }
    },
    failure: status === 'pass'
      ? null
      : {
          marketplaceFound: marketplace.found === true,
          versionMatches,
          cleanInstallValidationStatus: cleanInstallValidation.status
        }
  };
}

async function writeReport(report, evidenceDir) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, 'vscode-marketplace-post-publication-verification.json');
  const markdownPath = path.join(evidenceDir, 'vscode-marketplace-post-publication-verification.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildMarkdown(report)}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

async function runVerification(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    return {
      outcome: 'help',
      usage: getUsage()
    };
  }

  const report = await buildVerificationReport(options, deps);
  const written = await writeReport(report, options.evidenceDir);
  return {
    outcome: report.status,
    report: {
      ...report,
      receiptPaths: {
        json: path.relative(repoRoot, written.jsonPath).replaceAll(path.sep, '/'),
        markdown: path.relative(repoRoot, written.markdownPath).replaceAll(path.sep, '/')
      }
    }
  };
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    const result = await runVerification(argv, deps);
    if (result.outcome === 'help') {
      stdout.write(`${result.usage}\n`);
      return 0;
    }
    stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    return result.outcome === 'pass' ? 0 : 1;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_EXPECTED_VERSION,
  DEFAULT_MARKETPLACE_ITEM,
  buildCleanInstallValidation,
  buildMarkdown,
  buildVerificationReport,
  getUsage,
  parseArgs,
  runVerification
};
