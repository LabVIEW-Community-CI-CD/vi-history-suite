#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_LEDGER_PATH = path.join(
  DEFAULT_REPO_ROOT,
  'docs',
  'product',
  'windows-installed-user-release-claim-ledger-2026-05-14.json'
);
const DEFAULT_EVIDENCE_ROOT = path.join(
  DEFAULT_REPO_ROOT,
  '.cache',
  'windows-installed-user-release-claim-assertion',
  'latest'
);

function getUsage() {
  return [
    'Usage: node scripts/assertWindowsInstalledUserReleaseClaim.js [--ledger <path>] [--host-proof <path>] [--vsix-proof <path>] [--docker-blocker <path>] [--docker-proof <path>] [--evidence-dir <path>] [--json] [--help]',
    '',
    'Asserts the tracked Windows installed-user release-claim ledger against',
    'retained local evidence. The gate admits host-native LabVIEW 2026 x64',
    'proof only, verifies exact VSIX installed-user proof, and fails closed',
    'if Windows Docker Desktop proof is missing, stale, or accidentally',
    'admissible while the ledger still classifies it as blocked.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    repoRoot: DEFAULT_REPO_ROOT,
    ledgerPath: DEFAULT_LEDGER_PATH,
    hostProofPath: '',
    vsixProofPath: '',
    dockerBlockerPath: '',
    dockerProofPath: '',
    evidenceRoot: DEFAULT_EVIDENCE_ROOT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return candidate;
    };

    if (current === '--help' || current === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--json') {
      parsed.json = true;
      continue;
    }
    if (current === '--repo-root') {
      parsed.repoRoot = path.resolve(requireValue('--repo-root'));
      continue;
    }
    if (current === '--ledger') {
      parsed.ledgerPath = path.resolve(requireValue('--ledger'));
      continue;
    }
    if (current === '--host-proof') {
      parsed.hostProofPath = path.resolve(requireValue('--host-proof'));
      continue;
    }
    if (current === '--vsix-proof') {
      parsed.vsixProofPath = path.resolve(requireValue('--vsix-proof'));
      continue;
    }
    if (current === '--docker-blocker') {
      parsed.dockerBlockerPath = path.resolve(requireValue('--docker-blocker'));
      continue;
    }
    if (current === '--docker-proof') {
      parsed.dockerProofPath = path.resolve(requireValue('--docker-proof'));
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceRoot = path.resolve(requireValue('--evidence-dir'));
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return parsed;
}

function evaluateReleaseClaimLedger(options, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const failures = [];
  const ledgerRead = readJson(fsImpl, options.ledgerPath);
  if (!ledgerRead.ok) {
    return buildOutcome(options, undefined, {}, [
      {
        id: 'ledger-readable',
        message: ledgerRead.error
      }
    ]);
  }

  const ledger = ledgerRead.value;
  const receiptPaths = resolveReceiptPaths(options, ledger);
  const reads = {
    hostProof: readJson(fsImpl, receiptPaths.hostProofPath),
    vsixProof: readJson(fsImpl, receiptPaths.vsixProofPath),
    dockerBlocker: readJson(fsImpl, receiptPaths.dockerBlockerPath),
    dockerProof: readJson(fsImpl, receiptPaths.dockerProofPath)
  };

  for (const [id, read] of Object.entries(reads)) {
    if (!read.ok) {
      failures.push({
        id: `${id}-readable`,
        message: read.error
      });
    }
  }

  validateLedger(ledger, failures);
  validateHostProof(reads.hostProof.value, failures);
  validateVsixProof(ledger, reads.vsixProof.value, failures);
  validateDockerBlocker(reads.dockerBlocker.value, failures);
  validateDockerProof(reads.dockerProof.value, failures);

  return buildOutcome(options, ledger, receiptPaths, failures, {
    hostProof: summarizeHostProof(reads.hostProof.value),
    vsixProof: summarizeVsixProof(reads.vsixProof.value),
    dockerBlocker: summarizeDockerBlocker(reads.dockerBlocker.value),
    dockerProof: summarizeDockerProof(reads.dockerProof.value)
  });
}

function resolveReceiptPaths(options, ledger) {
  const hostProofPath =
    options.hostProofPath ||
    resolveRepoPath(
      options.repoRoot,
      ledger?.admittedProofs?.windowsHostLabview2026x64?.receiptPath
    );
  const vsixProofPath =
    options.vsixProofPath ||
    resolveRepoPath(options.repoRoot, ledger?.admittedProofs?.exactVsixInstalledUser?.receiptPath);
  const dockerBlockerPath =
    options.dockerBlockerPath ||
    resolveRepoPath(
      options.repoRoot,
      ledger?.blockedProofs?.windowsDockerDesktopWindowsContainers?.blockerReceiptPath
    );
  const dockerProofPath =
    options.dockerProofPath ||
    resolveRepoPath(
      options.repoRoot,
      ledger?.blockedProofs?.windowsDockerDesktopWindowsContainers?.canonicalProofReceiptPath
    );

  return {
    hostProofPath,
    vsixProofPath,
    dockerBlockerPath,
    dockerProofPath
  };
}

function resolveRepoPath(repoRoot, candidate) {
  if (!candidate) {
    return '';
  }
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.join(repoRoot, candidate);
}

function readJson(fsImpl, candidatePath) {
  if (!candidatePath) {
    return {
      ok: false,
      error: 'No path was provided.'
    };
  }
  try {
    return {
      ok: true,
      value: JSON.parse(fsImpl.readFileSync(candidatePath, 'utf8'))
    };
  } catch (error) {
    return {
      ok: false,
      error: `${candidatePath}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function validateLedger(ledger, failures) {
  expectEqual(
    failures,
    'ledger-schema',
    ledger?.schema,
    'vi-history-suite/windows-installed-user-release-claim-ledger@v1'
  );
  expectEqual(
    failures,
    'ledger-status',
    ledger?.status,
    'host-proof-admitted-docker-proof-blocked-no-mutation'
  );
  expectEqual(
    failures,
    'ledger-claim-scope',
    ledger?.claim?.scope,
    'installed-user-host-labview-2026-x64'
  );
  expectEqual(
    failures,
    'ledger-host-proof-state',
    ledger?.admittedProofs?.windowsHostLabview2026x64?.status,
    'admitted'
  );
  expectEqual(
    failures,
    'ledger-exact-vsix-proof-state',
    ledger?.admittedProofs?.exactVsixInstalledUser?.status,
    'admitted'
  );
  expectEqual(
    failures,
    'ledger-docker-proof-state',
    ledger?.blockedProofs?.windowsDockerDesktopWindowsContainers?.status,
    'blocked-not-admitted'
  );
  expectEqual(
    failures,
    'ledger-docker-admission-rule',
    ledger?.blockedProofs?.windowsDockerDesktopWindowsContainers?.admissionRule,
    'do-not-substitute-host-proof-for-windows-container-proof'
  );
  expectMutationBoundary(ledger?.mutationBoundary, failures);
}

function validateHostProof(proof, failures) {
  if (!proof) {
    return;
  }
  expectEqual(failures, 'host-proof-schema', proof.schema, 'vi-history-suite/public-fixture-validation-proof@v1');
  expectEqual(failures, 'host-proof-classification', proof.classification, 'validation-success');
  expectEqual(failures, 'host-proof-platform', proof.selectedVariant?.platform, 'win32');
  expectEqual(failures, 'host-proof-provider-request', proof.selectedVariant?.provider, 'host');
  expectEqual(failures, 'host-proof-labview-version', proof.selectedVariant?.labviewVersion, '2026');
  expectEqual(failures, 'host-proof-labview-bitness', proof.selectedVariant?.labviewBitness, 'x64');
  expectEqual(failures, 'host-proof-runtime-state', proof.result?.runtimeExecutionState, 'succeeded');
  expectEqual(failures, 'host-proof-runtime-provider', proof.result?.runtimeProvider, 'host-native');
  expectEqual(failures, 'host-proof-runtime-engine', proof.result?.runtimeEngine, 'labview-cli');
  expectEqual(failures, 'host-proof-generated-report', proof.result?.generatedReportExists, true);
  expectEqual(failures, 'host-proof-runtime-blocked-reason', proof.result?.runtimeBlockedReason, null);
  expectEqual(failures, 'host-proof-runtime-failure-reason', proof.result?.runtimeFailureReason, null);
}

function validateVsixProof(ledger, proof, failures) {
  if (!proof) {
    return;
  }
  expectEqual(
    failures,
    'vsix-proof-schema',
    proof.schema,
    'vi-history-suite/windows-exact-vsix-install-proof@v1'
  );
  expectEqual(failures, 'vsix-proof-status', proof.status, 'passed');
  expectEqual(failures, 'vsix-proof-production-mutation', proof.productionMutationAttempted, false);
  expectEqual(failures, 'vsix-proof-version', proof.authority?.packageVersion, ledger?.claim?.packageVersion);
  expectEqual(failures, 'vsix-proof-tag', proof.authority?.tag, ledger?.claim?.authorityTag);
  expectEqual(failures, 'vsix-proof-sha-verified', proof.authority?.vsixSha256Verified, true);
  expectEqual(
    failures,
    'vsix-proof-sha-match',
    proof.authority?.observedVsixSha256,
    proof.authority?.expectedVsixSha256
  );
  expectCommandPassed(failures, proof.commands, 'install-exact-vsix');
  expectCommandPassed(failures, proof.commands, 'vihs');
  expectCommandPassed(failures, proof.commands, 'vihs-validate');
  const validateCommand = proof.commands?.find((command) => command?.id === 'vihs-validate');
  expectEqual(
    failures,
    'vsix-proof-runtime-validation-outcome',
    validateCommand?.runtimeValidationOutcome,
    'ready'
  );
}

function validateDockerBlocker(blocker, failures) {
  if (!blocker) {
    return;
  }
  expectEqual(
    failures,
    'docker-blocker-schema',
    blocker.schema,
    'vi-history-suite/windows-docker-desktop-proof-blocker@v1'
  );
  expectEqual(failures, 'docker-blocker-status', blocker.status, 'blocked');
  expectEqual(failures, 'docker-blocker-decision', blocker.decision, 'not-admitted');
  expectEqual(failures, 'docker-blocker-required-ostype', blocker.docker?.requiredOSType, 'windows');
  expectEqual(failures, 'docker-blocker-observed-ostype', blocker.docker?.observedOSType, 'windows');
  expectEqual(
    failures,
    'docker-blocker-admissible-success-blocked',
    blocker.blocker?.admissibleSuccessBlocked,
    true
  );
  expectEqual(failures, 'docker-blocker-public-github-release', blocker.mutations?.publicGitHubRelease, 'not-performed');
  expectEqual(failures, 'docker-blocker-marketplace', blocker.mutations?.vscodeMarketplace, 'not-performed');
  expectEqual(failures, 'docker-blocker-git-tags', blocker.mutations?.gitTags, 'not-performed');
  expectEqual(failures, 'docker-blocker-release-branches', blocker.mutations?.releaseBranches, 'not-deleted');
  expectEqual(failures, 'docker-blocker-evidence-deleted', blocker.mutations?.retainedEvidenceDeleted, false);
}

function validateDockerProof(proof, failures) {
  if (!proof) {
    return;
  }
  expectEqual(failures, 'docker-proof-schema', proof.schema, 'vi-history-suite/public-fixture-validation-proof@v1');
  expectEqual(failures, 'docker-proof-platform', proof.selectedVariant?.platform, 'win32');
  expectEqual(failures, 'docker-proof-provider-request', proof.selectedVariant?.provider, 'docker');
  expectEqual(failures, 'docker-proof-labview-version', proof.selectedVariant?.labviewVersion, '2026');
  expectEqual(failures, 'docker-proof-labview-bitness', proof.selectedVariant?.labviewBitness, 'x64');
  expectEqual(failures, 'docker-proof-runtime-provider', proof.result?.runtimeProvider, 'windows-container');
  expectEqual(failures, 'docker-proof-runtime-engine', proof.result?.runtimeEngine, 'labview-cli');

  const dockerProofIsAdmissible =
    proof.classification === 'validation-success' &&
    proof.result?.runtimeExecutionState === 'succeeded' &&
    proof.result?.generatedReportExists === true;

  if (dockerProofIsAdmissible) {
    failures.push({
      id: 'docker-proof-still-blocked',
      message:
        'The Docker proof receipt is now admissible, but the tracked ledger still classifies Windows Docker Desktop proof as blocked.'
    });
    return;
  }

  expectEqual(failures, 'docker-proof-classification', proof.classification, 'validation-failure');
  expectEqual(failures, 'docker-proof-runtime-state', proof.result?.runtimeExecutionState, 'failed');
  expectEqual(failures, 'docker-proof-generated-report', proof.result?.generatedReportExists, false);
}

function expectMutationBoundary(boundary, failures) {
  expectEqual(failures, 'mutation-public-github-release', boundary?.publicGitHubRelease, 'not-performed');
  expectEqual(failures, 'mutation-public-github-source', boundary?.publicGitHubSource, 'not-performed');
  expectEqual(failures, 'mutation-marketplace', boundary?.vscodeMarketplace, 'not-performed');
  expectEqual(failures, 'mutation-git-tags', boundary?.gitTags, 'not-performed');
  expectEqual(failures, 'mutation-release-branches', boundary?.releaseBranches, 'not-deleted');
  expectEqual(failures, 'mutation-evidence-deleted', boundary?.retainedEvidenceDeleted, false);
}

function expectCommandPassed(failures, commands, commandId) {
  const command = commands?.find((candidate) => candidate?.id === commandId);
  expectEqual(failures, `vsix-command-${commandId}`, command?.status, 'passed');
  expectEqual(failures, `vsix-command-${commandId}-exit`, command?.exitCode, 0);
}

function expectEqual(failures, id, observed, expected) {
  if (observed === expected) {
    return;
  }
  failures.push({
    id,
    message: `Expected ${formatValue(expected)}, observed ${formatValue(observed)}.`
  });
}

function formatValue(value) {
  if (value === undefined) {
    return '<undefined>';
  }
  return JSON.stringify(value);
}

function summarizeHostProof(proof) {
  return {
    classification: proof?.classification,
    platform: proof?.selectedVariant?.platform,
    provider: proof?.selectedVariant?.provider,
    labviewVersion: proof?.selectedVariant?.labviewVersion,
    labviewBitness: proof?.selectedVariant?.labviewBitness,
    runtimeExecutionState: proof?.result?.runtimeExecutionState,
    runtimeProvider: proof?.result?.runtimeProvider,
    runtimeEngine: proof?.result?.runtimeEngine,
    generatedReportExists: proof?.result?.generatedReportExists
  };
}

function summarizeVsixProof(proof) {
  return {
    status: proof?.status,
    productionMutationAttempted: proof?.productionMutationAttempted,
    packageVersion: proof?.authority?.packageVersion,
    tag: proof?.authority?.tag,
    vsixSha256Verified: proof?.authority?.vsixSha256Verified
  };
}

function summarizeDockerBlocker(blocker) {
  return {
    status: blocker?.status,
    decision: blocker?.decision,
    dockerOSType: blocker?.docker?.observedOSType,
    dockerServerVersion: blocker?.docker?.observedServerVersion,
    blockerCode: blocker?.blocker?.code,
    publicGitHubRelease: blocker?.mutations?.publicGitHubRelease,
    vscodeMarketplace: blocker?.mutations?.vscodeMarketplace
  };
}

function summarizeDockerProof(proof) {
  return {
    classification: proof?.classification,
    platform: proof?.selectedVariant?.platform,
    provider: proof?.selectedVariant?.provider,
    labviewVersion: proof?.selectedVariant?.labviewVersion,
    labviewBitness: proof?.selectedVariant?.labviewBitness,
    runtimeExecutionState: proof?.result?.runtimeExecutionState,
    runtimeProvider: proof?.result?.runtimeProvider,
    runtimeEngine: proof?.result?.runtimeEngine,
    generatedReportExists: proof?.result?.generatedReportExists,
    runtimeFailureReason: proof?.result?.runtimeFailureReason
  };
}

function buildOutcome(options, ledger, receiptPaths, failures, facts = {}) {
  return {
    schema: 'vi-history-suite/windows-installed-user-release-claim-assertion@v1',
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'passed' : 'failed',
    claimId: ledger?.claim?.claimId,
    packageVersion: ledger?.claim?.packageVersion,
    ledgerPath: toRepoRelativePath(options.repoRoot, options.ledgerPath),
    checkedReceipts: {
      hostProof: toRepoRelativePath(options.repoRoot, receiptPaths.hostProofPath),
      exactVsixProof: toRepoRelativePath(options.repoRoot, receiptPaths.vsixProofPath),
      dockerBlocker: toRepoRelativePath(options.repoRoot, receiptPaths.dockerBlockerPath),
      dockerProof: toRepoRelativePath(options.repoRoot, receiptPaths.dockerProofPath)
    },
    facts,
    failures
  };
}

function toRepoRelativePath(repoRoot, candidatePath) {
  if (!candidatePath) {
    return '';
  }
  const relative = path.relative(repoRoot, candidatePath).replace(/\\/g, '/');
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative;
  }
  return candidatePath;
}

function buildMarkdownReport(outcome) {
  const lines = [
    '# Windows Installed-User Release Claim Assertion',
    '',
    `- Status: ${outcome.status}`,
    `- Claim: ${outcome.claimId || '<none>'}`,
    `- Package version: ${outcome.packageVersion || '<none>'}`,
    `- Host proof: ${outcome.checkedReceipts.hostProof || '<none>'}`,
    `- Exact VSIX proof: ${outcome.checkedReceipts.exactVsixProof || '<none>'}`,
    `- Docker blocker: ${outcome.checkedReceipts.dockerBlocker || '<none>'}`,
    `- Docker proof: ${outcome.checkedReceipts.dockerProof || '<none>'}`,
    `- Host runtime: ${outcome.facts.hostProof?.runtimeProvider || '<none>'} / ${outcome.facts.hostProof?.runtimeEngine || '<none>'} / ${outcome.facts.hostProof?.runtimeExecutionState || '<none>'}`,
    `- Docker state: ${outcome.facts.dockerProof?.runtimeExecutionState || '<none>'}; generated report: ${String(outcome.facts.dockerProof?.generatedReportExists)}`,
    ''
  ];

  if (outcome.failures.length > 0) {
    lines.push('## Failures', '');
    for (const failure of outcome.failures) {
      lines.push(`- ${failure.id}: ${failure.message}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function writeOutcome(options, outcome) {
  await fsp.mkdir(options.evidenceRoot, { recursive: true });
  const jsonPath = path.join(options.evidenceRoot, 'windows-installed-user-release-claim-assertion.json');
  const markdownPath = path.join(options.evidenceRoot, 'windows-installed-user-release-claim-assertion.md');
  await fsp.writeFile(jsonPath, `${JSON.stringify(outcome, null, 2)}\n`, 'utf8');
  await fsp.writeFile(markdownPath, buildMarkdownReport(outcome), 'utf8');
  return {
    jsonPath,
    markdownPath
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.helpRequested) {
    process.stdout.write(`${getUsage()}\n`);
    return;
  }

  const outcome = evaluateReleaseClaimLedger(options);
  const receiptPaths = await writeOutcome(options, outcome);
  const output = {
    ...outcome,
    receiptPaths: {
      json: toRepoRelativePath(options.repoRoot, receiptPaths.jsonPath),
      markdown: toRepoRelativePath(options.repoRoot, receiptPaths.markdownPath)
    }
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(buildMarkdownReport(output));
  }

  if (outcome.status !== 'passed') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  evaluateReleaseClaimLedger,
  buildMarkdownReport,
  getUsage
};
