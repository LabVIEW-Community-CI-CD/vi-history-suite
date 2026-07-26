#!/usr/bin/env node
'use strict';

/**
 * Mirror-Mode decoupled DECOUPLED-CHANNEL benchmark PRODUCER driver (VHS-REQ-707, #2315).
 *
 * The third, decoupled actor of Mirror Mode: runs a REAL LabVIEW VI comparison through the
 * shipped compiled `out/` primitives using the HOST-NATIVE provider (native LabVIEW 2026 x64 on
 * the Linux host itself -- no Docker, no VM), captures a from-within capability fingerprint (for
 * the host-native actor the host IS the actor, so a local os.* capture is correct and labeled
 * `host`), computes the cross-actor parity digests (Phase 1 helper), and records an idempotent row
 * in the `vi-history-suite/mirror-benchmark@v1` ledger (Phase 1 writer). It is the counterpart to
 * the Docker right-channel producer (scripts/mirror-right-producer.cjs) and the Vagrant left-channel
 * producer (vagrant/mirror-left-producer.cjs), differing in provider (host-native) + capturedFrom
 * (host) + actor role (decoupled) -- an independent, non-Docker/non-VM third signal for the
 * reconciler (ADR-0028: the decoupled mirror is a benchmark/independent-signal actor, NOT a merge
 * gate; the deterministic reconciler ledger-read remains the required gate, never this run).
 *
 * The parity `recipe` is the ACTOR-NEUTRAL logical operation (`createComparisonReport`) -- provider
 * (host-native) and bitness are actor fingerprint / run metadata, NOT part of the cross-actor parity
 * key, so the x64-host-native, x64-Docker, and x86-Vagrant mirrors of the same sample group together.
 *
 * The FROM-WITHIN rule (ADR-0028): the fingerprint must be captured from inside the actor's own
 * runtime context. For the decoupled host-native actor the host IS the actor, so `os.*` readings
 * are the correct in-actor readings (capturedFrom `host`) -- unlike the Docker right channel (where
 * the driver runs on the host with docker as a child, so a host os.* capture would be mislabeled).
 *
 * Best-effort EVIDENCE producer, not a gate: a failed/blocked native run is recorded as a blocked
 * row (the reconciler treats a non-ok run as not-fresh evidence), NOT a fabricated ok row.
 *
 * Maintainer/CI `.cjs` (inventory-exempt like scripts/mirror-right-producer.cjs); NOT in `npm test`.
 * Requires `npm run compile`.
 *
 * Env:
 *   VIHS_R_REPO           fixture repo (default the icon-editor clone)
 *   VIHS_R_VI             VI under test, repo-relative (default resource/plugins/lv_icon.vi)
 *   VIHS_R_BASE           base git rev (default HEAD~1)
 *   VIHS_R_SELECTED       selected git rev (default HEAD)
 *   VIHS_R_VERSION        LabVIEW year (default 2026)
 *   VIHS_R_BITNESS        x86 | x64 (default x64) -- fingerprint metadata
 *   VIHS_R_BUILD          LabVIEW build string for the fingerprint (default <version>-hostnative)
 *   VIHS_R_DISK_FREE_BYTES override for free-disk bytes (default fs.statfsSync on the fixture repo)
 *   VIHS_R_ACTOR          actor id (default linux-host-native-x64)
 *   VIHS_R_LEDGER         ledger path, repo-relative (default docs/requirements/mirror-benchmark-ledger.json)
 *   VIHS_R_MODE           cold | warm (default cold)
 *   VIHS_R_OUT            optional JSON evidence path
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function need(rel) {
  const f = path.join(repoRoot, rel);
  if (!fs.existsSync(f)) {
    console.error(`[decoupled] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

const env = process.env;
const fixtureRepo = env.VIHS_R_REPO || path.join(os.homedir(), 'repos', 'labview-icon-editor');
const viPath = env.VIHS_R_VI || 'resource/plugins/lv_icon.vi';
const baseRev = env.VIHS_R_BASE || 'HEAD~1';
const selectedRev = env.VIHS_R_SELECTED || 'HEAD';
const version = env.VIHS_R_VERSION || '2026';
const bitness = env.VIHS_R_BITNESS || 'x64';
const actor = env.VIHS_R_ACTOR || 'linux-host-native-x64';
// This producer IS the decoupled host-native actor -- role/provider/capturedFrom are fixed.
const role = 'decoupled';
const provider = 'host-native';
const ledgerRel = env.VIHS_R_LEDGER || 'docs/requirements/mirror-benchmark-ledger.json';
const mode = env.VIHS_R_MODE || 'cold';
// Actor-neutral logical recipe -- provider/bitness are metadata, NOT in parityKey.
const RECIPE = 'createComparisonReport';

const digest = need('out/reporting/mirror/mirrorParityDigest.js');
const capability = need('out/reporting/mirror/mirrorCapabilityFingerprint.js');
const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { preflightComparisonReportRevisions } = need('out/reporting/comparisonReportPreflight.js');
const { persistComparisonReportPacket } = need('out/reporting/comparisonReportPacket.js');
const { executeComparisonReport, materializeSelectedRevisionTreeWithGit } = need('out/reporting/comparisonReportRuntimeExecution.js');

// --- capability fingerprint (from-within: host IS the actor) ------------------
function loadFingerprint() {
  // For the decoupled host-native actor the host IS the actor, so a local os.* capture is the
  // correct in-actor reading (capturedFrom 'host'). No in-container fail-closed applies here.
  let diskFreeBytes;
  if (env.VIHS_R_DISK_FREE_BYTES !== undefined) {
    diskFreeBytes = Number(env.VIHS_R_DISK_FREE_BYTES);
    if (!Number.isFinite(diskFreeBytes) || diskFreeBytes <= 0) {
      throw new Error(`VIHS_R_DISK_FREE_BYTES must be a positive number; received "${env.VIHS_R_DISK_FREE_BYTES}".`);
    }
  } else {
    try {
      const st = fs.statfsSync(fixtureRepo);
      diskFreeBytes = st.bavail * st.bsize;
    } catch (error) {
      throw new Error(
        `Could not determine free disk via fs.statfsSync (${error && error.message ? error.message : error}); ` +
          `set VIHS_R_DISK_FREE_BYTES.`
      );
    }
  }
  const inputs = capability.captureLocalCapabilityInputs({
    actor,
    role,
    capturedFrom: 'host',
    labviewBuild: env.VIHS_R_BUILD || `${version}-hostnative`,
    labviewBitness: bitness,
    diskFreeBytes
  });
  return capability.buildCapabilityFingerprint(inputs);
}

function fixtureShaFor(rev, rel) {
  const gitRel = rel.replace(/\\/g, '/');
  const blob = execFileSync('git', ['-C', fixtureRepo, 'rev-parse', `${rev}:${gitRel}`], { encoding: 'utf8' }).trim();
  return crypto.createHash('sha256').update(blob, 'utf8').digest('hex');
}

async function main() {
  const fingerprint = loadFingerprint();
  const actorRef = digest.deriveActorFingerprintId(fingerprint);
  const fixtureSha = fixtureShaFor(selectedRev, viPath);
  const parityKey = digest.deriveParityKey({ version, fixtureSha, viPath, recipe: RECIPE });

  console.log(`[decoupled] actor=${actor} actorRef=${actorRef.slice(0, 12)}… parityKey=${parityKey.slice(0, 12)}… provider=${provider}`);

  const storageRoot = env.VIHS_R_STORAGE || fs.mkdtempSync(path.join(os.homedir(), '.cache-mirror-decoupled-'));

  const runtimeSelection = await locateComparisonRuntime(process.platform, {
    requestedProvider: 'host',
    labviewVersion: version,
    bitness
  });
  const preflight = await preflightComparisonReportRevisions({
    repoRoot: fixtureRepo,
    relativePath: viPath,
    leftRevisionId: baseRev,
    rightRevisionId: selectedRev
  });
  const packet = await persistComparisonReportPacket({
    storageRoot,
    repositoryRoot: fixtureRepo,
    relativePath: viPath,
    reportType: 'diff',
    selectedHash: selectedRev,
    baseHash: baseRev,
    preflight,
    runtimeSelection
  });

  let record = packet.record;
  const started = Date.now();
  if (record.reportStatus === 'ready-for-runtime') {
    const result = await executeComparisonReport(
      { record, repositoryRoot: fixtureRepo },
      { materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit, cliConnectTimeoutSeconds: 120 }
    );
    record = result.record;
  }
  const wallMs = Date.now() - started;

  const rt = record.runtimeExecution || {};
  const reportPath = (record.artifactPlan || {}).reportFilePath;
  let outcome = 'ok';
  let reportSha256;
  let previewImageCount = 0;
  if (rt.reportExists && reportPath && fs.existsSync(reportPath)) {
    const html = fs.readFileSync(reportPath, 'utf8');
    reportSha256 = digest.deriveReportSha256(html);
    previewImageCount = (html.match(/data:image\/png;base64/g) || []).length;
  } else {
    // Best-effort producer: a failed/blocked native run is recorded as a blocked outcome (the
    // reconciler treats a non-ok run as not-fresh evidence), NOT a fabricated ok row.
    outcome = 'blocked';
    reportSha256 = digest.deriveReportSha256(`blocked:${record.blockedReason || rt.failureReason || 'unknown'}`);
    console.error(`[decoupled] host-native run did not produce a report (runtimeState=${rt.state}, blocked=${record.blockedReason || rt.failureReason || 'n/a'}); recording a blocked row.`);
  }

  const fpRel = path.join('.mirror-fp', `mirror-fp-d-${actorRef.slice(0, 8)}.json`);
  const fpFile = path.join(repoRoot, fpRel);
  fs.mkdirSync(path.dirname(fpFile), { recursive: true });
  fs.writeFileSync(fpFile, JSON.stringify(fingerprint, null, 2));

  const sourceRevision = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const args = [
    'scripts/recordMirrorBenchmark.js',
    '--parity-key', parityKey,
    '--actor-ref', actorRef,
    '--source-revision', sourceRevision,
    '--vi-path', viPath,
    '--fixture-sha', fixtureSha,
    '--recipe', RECIPE,
    '--mode', mode,
    '--outcome', outcome,
    '--report-sha256', reportSha256,
    '--preview-image-count', String(previewImageCount),
    '--wall-ms', String(wallMs),
    '--fingerprint-file', fpRel,
    '--ledger', ledgerRel
  ];
  execFileSync('node', args, { cwd: repoRoot, stdio: 'inherit' });
  fs.rmSync(fpFile, { force: true });

  const evidence = { actor, actorRef, parityKey, fixtureSha, sourceRevision, provider, reportSha256, previewImageCount, wallMs, mode, outcome, ledger: ledgerRel };
  if (env.VIHS_R_OUT) {
    fs.writeFileSync(env.VIHS_R_OUT, JSON.stringify(evidence, null, 2));
  }
  console.log(`[decoupled] recorded: ${JSON.stringify(evidence, null, 2)}`);
}

main().catch((error) => {
  console.error(`[decoupled] failed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
