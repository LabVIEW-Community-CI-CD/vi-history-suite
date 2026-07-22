// Cross-platform / cross-host empty-swap comparison driver.
//
// Runs ONE real LabVIEW `CreateComparisonReport` for the empty-swap fixture
// (base = empty.vi bytes, selected = empty1.vi bytes on one tracked path) through
// the shipped compiled `out/` comparison primitives, exactly as the extension
// does (real git revisions, shipped preflight + git materializer, no blob
// injection). It is provider/platform/bitness-parameterized so the SAME driver
// runs the SAME comparison across hosts — linux-container (docker), linux
// host-native, windows host-native (Vagrant) — and emits a versioned, typed
// outcome so results are directly comparable cross-platform and cross-host.
//
// Maintainer `.cjs` (inventory-exempt); not shipped, not in npm test. Run from
// the repo root AFTER `npm run compile`.
//
// Env:
//   ESW_CORPUS     empty-swap corpus git repo (tracked path has base/selected commits)
//   ESW_VI_PATH    repo-relative tracked path (default empty.vi)
//   ESW_BASE       base git revision (empty.vi bytes)
//   ESW_SELECTED   selected git revision (empty1.vi bytes)
//   ESW_PROVIDER   host | docker (default host)
//   ESW_PLATFORM   linux | win32 (default = process.platform)
//   ESW_BITNESS    x64 | x86 (default x64)
//   ESW_LV_VERSION LabVIEW year (default 2026)
//   ESW_IMAGE      container image for the docker provider (default 2026q1-linux)
//   ESW_OUT        evidence JSON path
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(process.cwd(), 'out', 'reporting');
function need(rel) {
  const f = path.join(OUT, rel);
  if (!fs.existsSync(f)) {
    console.error(`[empty-swap] missing ${path.relative(process.cwd(), f)}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return require(f);
}

const { locateComparisonRuntime } = need('comparisonRuntimeLocator.js');
const { preflightComparisonReportRevisions } = need('comparisonReportPreflight.js');
const { persistComparisonReportPacket } = need('comparisonReportPacket.js');
const { executeComparisonReport, materializeSelectedRevisionTreeWithGit } = need('comparisonReportRuntimeExecution.js');
// VHS-REQ-711: the typed, testable cross-host validation contract lives in the
// shipped module; this harness owns only the real runtime run and I/O.
const {
  resolveEmptySwapOptions,
  buildEmptySwapEvidence,
  deriveReportSha256,
  summarizeComparisonOutcome,
  detectReportDifferences,
  classifyEmptySwapOutcome
} = need('comparisonValidation/emptySwapComparisonEvidence.js');

async function main() {
  const env = process.env;
  let options;
  try {
    options = resolveEmptySwapOptions(env, {
      repoRoot: path.join(process.env.HOME || '', 'repos', 'vihs-empty-swap-corpus'),
      platform: process.platform
    });
  } catch (error) {
    console.error(`[empty-swap] ${error && error.message ? error.message : String(error)}`);
    process.exit(2);
  }
  const { provider, platform, bitness, labviewVersion: lvVersion, containerImage, repoRoot, relativePath, baseHash, selectedHash } = options;
  const outPath = env.ESW_OUT || path.join(process.cwd(), `empty-swap-${provider}-${platform}-evidence.json`);
  const storageRoot = path.join(process.cwd(), 'lin-validation', 'empty-swap', `${provider}-${platform}`, 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  const evidence = buildEmptySwapEvidence(options, new Date().toISOString());

  try {
    const runtimeSelection = await locateComparisonRuntime(platform, {
      requestedProvider: provider,
      labviewVersion: lvVersion,
      bitness,
      linuxContainerImage: containerImage,
      requireVersionAndBitness: provider === 'host'
    });
    evidence.resolvedRuntimeProvider = runtimeSelection.provider;
    evidence.blockedReason = runtimeSelection.blockedReason ?? null;
    console.error(
      `[empty-swap] provider=${runtimeSelection.provider} engine=${runtimeSelection.engine} blocked=${runtimeSelection.blockedReason ?? 'none'}`
    );

    const preflight = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId: baseHash,
      rightRevisionId: selectedHash
    });
    console.error(`[empty-swap] preflight ready=${preflight.ready} blocked=${preflight.blockedReason ?? 'none'}`);

    const packet = await persistComparisonReportPacket({
      storageRoot,
      repositoryRoot: repoRoot,
      relativePath,
      reportType: 'diff',
      selectedHash,
      baseHash,
      preflight,
      runtimeSelection
    });

    let record = packet.record;
    if (record.reportStatus === 'ready-for-runtime') {
      console.error('[empty-swap] executing real CreateComparisonReport...');
      const result = await executeComparisonReport(
        { record, repositoryRoot: repoRoot },
        { materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit, cliConnectTimeoutSeconds: 120 }
      );
      record = result.record;
    }

    const outcome = summarizeComparisonOutcome(record);
    evidence.runtimeState = outcome.runtimeState;
    evidence.reportExists = outcome.reportExists;
    evidence.diagnosticReason = outcome.diagnosticReason;
    evidence.failureReason = outcome.failureReason;
    evidence.blockedReason = evidence.blockedReason ?? outcome.blockedReason;

    const reportPath = (record.artifactPlan || {}).reportFilePath;
    if (evidence.reportExists && reportPath && fs.existsSync(reportPath)) {
      const html = fs.readFileSync(reportPath, 'utf8');
      evidence.reportSha256 = deriveReportSha256(html);
      const differenceSummary = detectReportDifferences(html);
      evidence.differenceSummary = differenceSummary;
      evidence.differenceDetected = differenceSummary.hasDifferences;
    }
  } catch (error) {
    evidence.error = error && error.message ? error.message : String(error);
    console.error(`[empty-swap] ERROR: ${evidence.error}`);
  }

  evidence.verdict = classifyEmptySwapOutcome(evidence);
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ provider: evidence.provider, platform, runtimeState: evidence.runtimeState, reportExists: evidence.reportExists, differenceDetected: evidence.differenceDetected, verdict: evidence.verdict, reportSha256: evidence.reportSha256, diagnosticReason: evidence.diagnosticReason }, null, 2));
  console.error(`[empty-swap] evidence -> ${path.relative(process.cwd(), outPath)}`);
}

main().catch((error) => {
  console.error(`[empty-swap] FATAL: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
