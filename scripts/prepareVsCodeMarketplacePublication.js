#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscePat = require(path.join(__dirname, 'resolveLocalVscePat.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinnedVsce = require(path.join(__dirname, 'runPinnedVsce.js'));

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'vscode-marketplace-publication-prep',
  'latest'
);
const DEFAULT_TRANSACTION_RECEIPT_PATH =
  '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json';
const DEFAULT_MARKETPLACE_ITEM = 'svelderrainruiz.vi-history-suite';

function getUsage() {
  return [
    'Usage: node scripts/prepareVsCodeMarketplacePublication.js [--evidence-dir <path>] [--pat-path <path>] [--marketplace-item <publisher.extension>] [--transaction-receipt <path>] [--help]',
    '',
    'Prepare the governed VS Code Marketplace publication act without publishing.',
    'The command verifies the public GitHub exact-release gate, exact VSIX/checksum evidence, current Marketplace version,',
    'local VSCE PAT locator, and pinned vsce publish command shape, then writes JSON and Markdown receipts.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    patPath: null,
    marketplaceItem: DEFAULT_MARKETPLACE_ITEM,
    transactionReceiptPath: DEFAULT_TRANSACTION_RECEIPT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
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

    if (argument === '--pat-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --pat-path');
      }
      parsed.patPath = path.resolve(value);
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

    if (argument === '--transaction-receipt') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --transaction-receipt');
      }
      parsed.transactionReceiptPath = value.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function readJson(relativeOrAbsolutePath, fsApi = fs) {
  const targetPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);
  return JSON.parse(fsApi.readFileSync(targetPath, 'utf8'));
}

function computeFileSha256(filePath, fsApi = fs) {
  const hash = crypto.createHash('sha256');
  hash.update(fsApi.readFileSync(filePath));
  return hash.digest('hex');
}

function fetchJson(url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: body === null ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'vi-history-suite-marketplace-publication-prep',
          ...headers
        }
      },
      (response) => {
        let payload = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          payload += chunk;
        });
        response.on('end', () => {
          let json = null;
          if (payload.trim()) {
            try {
              json = JSON.parse(payload);
            } catch {
              json = null;
            }
          }
          resolve({
            statusCode: response.statusCode ?? 0,
            json
          });
        });
      }
    );
    request.on('error', reject);
    if (body !== null) {
      request.write(body);
    }
    request.end();
  });
}

async function fetchMarketplaceState(marketplaceItem) {
  const response = await fetchJson(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    JSON.stringify({
      filters: [
        {
          criteria: [
            {
              filterType: 7,
              value: marketplaceItem
            }
          ],
          pageNumber: 1,
          pageSize: 1,
          sortBy: 0,
          sortOrder: 0
        }
      ],
      assetTypes: [],
      flags: 103
    }),
    {
      Accept: 'application/json;api-version=3.0-preview.1',
      'X-Market-Client-Id': 'vi-history-suite'
    }
  );

  const extension =
    response.json?.results?.[0]?.extensions?.[0] ??
    response.json?.results?.[0]?.extensions?.find?.(() => true) ??
    null;
  const latestVersion = extension?.versions?.[0]?.version ?? null;

  return {
    statusCode: response.statusCode,
    marketplaceItem,
    currentPublishedVersion: latestVersion,
    found: Boolean(extension)
  };
}

function resolveManifestPaths(transactionReceipt, fsApi = fs) {
  const manifestPath = transactionReceipt.releaseManifest?.manifestPath
    ? path.resolve(repoRoot, transactionReceipt.releaseManifest.manifestPath)
    : null;
  const checksumPath = transactionReceipt.releaseManifest?.checksumPath
    ? path.resolve(repoRoot, transactionReceipt.releaseManifest.checksumPath)
    : null;
  const manifest = transactionReceipt.releaseManifest?.manifest ?? null;
  const vsixPath =
    manifest && manifestPath
      ? path.join(path.dirname(manifestPath), manifest.vsixArtifact.fileName)
      : null;

  return {
    manifestPath,
    checksumPath,
    vsixPath,
    manifestExists: Boolean(manifestPath && fsApi.existsSync(manifestPath)),
    checksumExists: Boolean(checksumPath && fsApi.existsSync(checksumPath)),
    vsixExists: Boolean(vsixPath && fsApi.existsSync(vsixPath))
  };
}

function buildPlannedVscePublishCommand(vsixPath) {
  const relativeVsixPath = path.relative(repoRoot, vsixPath).replaceAll(path.sep, '/');
  return {
    command: 'node',
    args: [
      'scripts/runPinnedVsce.js',
      'publish',
      '--packagePath',
      relativeVsixPath,
      '--pat',
      '<redacted>'
    ],
    display: `node scripts/runPinnedVsce.js publish --packagePath ${relativeVsixPath} --pat <redacted>`,
    pinnedPackage: pinnedVsce.VSCE_PACKAGE_SPEC
  };
}

function buildMarkdown(report) {
  return [
    '# VS Code Marketplace Publication Prep',
    '',
    `- Recorded: ${report.recordedAt}`,
    `- Status: ${report.status}`,
    `- Authority tag: ${report.authority.tag}`,
    `- Expected Marketplace version: ${report.marketplace.expectedVersion}`,
    `- Current Marketplace version: ${report.marketplace.currentPublishedVersion ?? 'unknown'}`,
    `- GitHub exact verify gate: ${report.publicGitHub.verifyGateStatus}`,
    `- VSIX: ${report.assets.vsixPath ?? 'missing'}`,
    `- VSIX SHA-256 verified: ${report.assets.vsixSha256Verified}`,
    `- VSCE PAT locator: ${report.pat.ok ? 'ok' : 'blocked'}`,
    `- Planned publish command: \`${report.vsce.plannedPublishCommand.display}\``,
    '',
    '## Phases',
    '',
    '| Phase | Status | Summary |',
    '| --- | --- | --- |',
    ...report.phases.map((phase) => `| ${phase.id} | ${phase.status} | ${phase.summary} |`),
    '',
    'No VS Code Marketplace publication was attempted by this prep surface.'
  ].join('\n');
}

function buildPhase(id, status, summary, details = {}) {
  return { id, status, summary, details };
}

async function buildPrepReport(options, deps = {}) {
  const fsApi = deps.fs ?? fs;
  const fetchMarketplaceStateImpl = deps.fetchMarketplaceState ?? fetchMarketplaceState;
  const transactionReceipt = readJson(options.transactionReceiptPath, fsApi);
  const publicReleaseCandidate = readJson('docs/product/public-release-candidate.json', fsApi);
  const ledger = readJson('docs/product/vscode-marketplace-publication-ledger.json', fsApi);
  const expectedVersion = transactionReceipt.authority?.packageVersion ?? publicReleaseCandidate.versionLine;
  const expectedTag = transactionReceipt.authority?.tag ?? `v${expectedVersion}`;
  const manifestPaths = resolveManifestPaths(transactionReceipt, fsApi);
  const marketplace = await fetchMarketplaceStateImpl(options.marketplaceItem);
  const patInspection = vscePat.inspectVscePatFile(
    options.patPath ?? vscePat.resolveVscePatFilePath(),
    fsApi
  );

  const manifestSha = transactionReceipt.releaseManifest?.manifest?.vsixArtifact?.sha256 ?? null;
  const observedVsixSha =
    manifestPaths.vsixPath && manifestPaths.vsixExists
      ? computeFileSha256(manifestPaths.vsixPath, fsApi)
      : null;
  const checksumText =
    manifestPaths.checksumPath && manifestPaths.checksumExists
      ? fsApi.readFileSync(manifestPaths.checksumPath, 'utf8').trim()
      : '';
  const checksumDeclaresExpected = Boolean(
    manifestSha && checksumText.includes(manifestSha)
  );
  const vsixSha256Verified = Boolean(manifestSha && observedVsixSha === manifestSha);
  const githubVerifyGatePassed =
    transactionReceipt.verifyGate?.status === 'pass' &&
    transactionReceipt.verifyGate?.allowed === true &&
    transactionReceipt.publicRelease?.draft === false &&
    Boolean(transactionReceipt.publicRelease?.published_at);

  const plannedPublishCommand = manifestPaths.vsixPath
    ? buildPlannedVscePublishCommand(manifestPaths.vsixPath)
    : null;
  const phases = [
    buildPhase(
      'public-github-exact-release-verified',
      githubVerifyGatePassed ? 'pass' : 'blocked',
      githubVerifyGatePassed
        ? `Public GitHub exact release ${expectedTag} is published and verifyGate passed.`
        : `Public GitHub exact release ${expectedTag} is not yet verified as published.`,
      {
        releaseId: transactionReceipt.publicRelease?.id ?? null,
        verifyGateStatus: transactionReceipt.verifyGate?.status ?? null
      }
    ),
    buildPhase(
      'authority-vsix-evidence',
      manifestPaths.manifestExists &&
        manifestPaths.checksumExists &&
        manifestPaths.vsixExists &&
        vsixSha256Verified &&
        checksumDeclaresExpected
        ? 'pass'
        : 'blocked',
      vsixSha256Verified && checksumDeclaresExpected
        ? 'The retained authority VSIX and checksum match the release manifest.'
        : 'The retained authority VSIX/checksum evidence is missing or does not match the release manifest.',
      {
        manifestPath: manifestPaths.manifestPath,
        checksumPath: manifestPaths.checksumPath,
        vsixPath: manifestPaths.vsixPath,
        expectedSha256: manifestSha,
        observedSha256: observedVsixSha
      }
    ),
    buildPhase(
      'marketplace-current-version',
      marketplace.currentPublishedVersion === expectedVersion ? 'already-published' : 'pending',
      marketplace.currentPublishedVersion === expectedVersion
        ? `Marketplace already serves ${expectedVersion}.`
        : `Marketplace still serves ${marketplace.currentPublishedVersion ?? 'unknown'}, so ${expectedVersion} publication remains the next separate act.`,
      {
        marketplaceItem: options.marketplaceItem,
        expectedVersion,
        currentPublishedVersion: marketplace.currentPublishedVersion
      }
    ),
    buildPhase(
      'vsce-pat-locator',
      patInspection.ok ? 'pass' : 'blocked',
      patInspection.ok
        ? 'The local VS Code Marketplace PAT file is present and non-placeholder; the secret value was not retained.'
        : `The local VS Code Marketplace PAT file is not ready: ${patInspection.reason}.`,
      {
        path: patInspection.path,
        exists: patInspection.exists,
        tokenPresent: patInspection.tokenPresent,
        placeholder: patInspection.placeholder
      }
    ),
    buildPhase(
      'pinned-vsce-publish-command',
      plannedPublishCommand ? 'pass' : 'blocked',
      plannedPublishCommand
        ? 'The future Marketplace publish act has a pinned vsce command shape and exact VSIX package path.'
        : 'The future Marketplace publish act cannot be constructed without an exact VSIX path.',
      {
        plannedPublishCommand: plannedPublishCommand?.display ?? null,
        pinnedPackage: plannedPublishCommand?.pinnedPackage ?? null
      }
    )
  ];
  const blockingPhase = phases.find((phase) => phase.status === 'blocked');
  const status = blockingPhase ? 'blocked' : 'ready';

  return {
    schema: 'vi-history-suite/vscode-marketplace-publication-prep@v1',
    recordedAt: new Date().toISOString(),
    repoRoot,
    status,
    productionMutationAttempted: false,
    authority: {
      tag: expectedTag,
      packageVersion: expectedVersion,
      mainSha: transactionReceipt.authority?.mainSha ?? null,
      releaseManifestPath: transactionReceipt.releaseManifest?.manifestPath ?? null
    },
    publicGitHub: {
      releaseId: transactionReceipt.publicRelease?.id ?? null,
      releaseUrl: transactionReceipt.publicRelease?.html_url ?? null,
      verifyGateStatus: transactionReceipt.verifyGate?.status ?? null,
      verifyGateAllowed: transactionReceipt.verifyGate?.allowed === true
    },
    marketplace: {
      marketplaceItem: options.marketplaceItem,
      expectedVersion,
      currentPublishedVersion: marketplace.currentPublishedVersion,
      statusCode: marketplace.statusCode,
      listingUrl: ledger.listingUrl,
      homepageUrl: ledger.homepageUrl,
      nextAction: marketplace.currentPublishedVersion === expectedVersion
        ? 'retain-marketplace-publication'
        : 'publish-v1.3.7-to-vscode-marketplace-after-explicit-production-approval'
    },
    assets: {
      manifestPath: manifestPaths.manifestPath,
      checksumPath: manifestPaths.checksumPath,
      vsixPath: manifestPaths.vsixPath,
      expectedVsixSha256: manifestSha,
      observedVsixSha256: observedVsixSha,
      vsixSha256Verified,
      checksumDeclaresExpected
    },
    pat: {
      path: patInspection.path,
      exists: patInspection.exists,
      tokenPresent: patInspection.tokenPresent,
      placeholder: patInspection.placeholder,
      ok: patInspection.ok,
      secretRetained: false,
      reason: patInspection.reason ?? null
    },
    vsce: {
      pinnedPackage: pinnedVsce.VSCE_PACKAGE_SPEC,
      plannedPublishCommand
    },
    semverFreeze: {
      status: marketplace.currentPublishedVersion === expectedVersion ? 'clear' : 'frozen',
      openingNewSemverAllowed: marketplace.currentPublishedVersion === expectedVersion,
      rationale: marketplace.currentPublishedVersion === expectedVersion
        ? `Marketplace already serves ${expectedVersion}; normal next-line governance may proceed after retention.`
        : `Later SemVer openings remain frozen until VS Code Marketplace publishes ${expectedVersion} and that final publication act is retained.`
    },
    phases
  };
}

async function writeReport(report, evidenceDir) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, 'vscode-marketplace-publication-prep.json');
  const markdownPath = path.join(evidenceDir, 'vscode-marketplace-publication-prep.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, `${buildMarkdown(report)}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

function toRelativeReportPath(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath).replaceAll(path.sep, '/');
  return relativePath.length > 0 ? relativePath : '.';
}

async function runPrep(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    return {
      outcome: 'help',
      usage: getUsage()
    };
  }

  const report = await buildPrepReport(options, deps);
  const written = await writeReport(report, options.evidenceDir);
  return {
    outcome: report.status,
    report: {
      ...report,
      receiptPaths: {
        json: toRelativeReportPath(written.jsonPath),
        markdown: toRelativeReportPath(written.markdownPath)
      }
    }
  };
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    const result = await runPrep(argv, deps);
    if (result.outcome === 'help') {
      stdout.write(`${result.usage}\n`);
      return 0;
    }
    stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    return result.outcome === 'blocked' ? 1 : 0;
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
  DEFAULT_MARKETPLACE_ITEM,
  DEFAULT_TRANSACTION_RECEIPT_PATH,
  buildPlannedVscePublishCommand,
  buildPrepReport,
  computeFileSha256,
  fetchMarketplaceState,
  getUsage,
  parseArgs,
  readJson,
  resolveManifestPaths,
  runPrep
};
