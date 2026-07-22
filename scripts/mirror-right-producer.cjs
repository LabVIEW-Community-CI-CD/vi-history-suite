#!/usr/bin/env node
'use strict';

/**
 * Mirror-Mode Phase 3 (VHS-REQ-707, #2321) — Docker RIGHT-CHANNEL benchmark
 * PRODUCER driver.
 *
 * The right channel of Mirror Mode: runs a REAL LabVIEW VI comparison through the
 * shipped compiled `out/` primitives using the DOCKER provider (the NI LabVIEW
 * Windows/Linux container, x64, run-only), captures an IN-CONTAINER capability
 * fingerprint, computes the cross-actor parity digests (Phase 1 helper), and
 * records an idempotent row in the `vi-history-suite/mirror-benchmark@v1` ledger
 * (Phase 1 writer). It is the counterpart to the Vagrant left-channel producer
 * (vagrant/mirror-left-producer.cjs), differing in provider + capturedFrom.
 *
 * Best-effort EVIDENCE producer, not a gate: the heavy multi-GB image pull may
 * fail; a failure is captured, not fatal to the queue. The REQUIRED gate is the
 * deterministic reconciler ledger-read (Phase 4), never this pull (ADR-0028).
 *
 * The parity `recipe` is the ACTOR-NEUTRAL logical operation
 * (`createComparisonReport`) — provider (docker) and bitness are actor
 * fingerprint / run metadata, NOT part of the cross-actor parity key, so the
 * x64-Docker and x86-Vagrant mirrors of the same sample group together.
 *
 * The IN-CONTAINER fingerprint MUST be captured from inside the container (its
 * self-reported vCPU/RAM/disk), not the host's. This driver reads a
 * fingerprint-inputs JSON produced from within the container when
 * VIHS_R_FINGERPRINT is set; when that env var is set but the file is missing it
 * FAILS CLOSED. When VIHS_R_FINGERPRINT is NOT set it ALSO fails closed by default
 * (the Docker provider runs this driver on the host with docker as a child, so a
 * local os.* capture would be host readings mislabeled in-container and would
 * corrupt the actorRef); set VIHS_R_IN_CONTAINER only when the driver itself runs
 * inside the selected container.
 *
 * Maintainer/CI `.cjs` (inventory-exempt like scripts/req699-*-container-driver.cjs);
 * NOT in `npm test`. Requires `npm run compile`.
 *
 * Env:
 *   VIHS_R_REPO           fixture repo (default the icon-editor clone)
 *   VIHS_R_VI             VI under test, repo-relative (default resource/plugins/lv_icon.vi)
 *   VIHS_R_BASE           base git rev (default HEAD~1)
 *   VIHS_R_SELECTED       selected git rev (default HEAD)
 *   VIHS_R_IMAGE          container image for the ACTIVE platform (overrides the platform
 *                         default; Linux default 2026q1-linux, Windows default 2026q1-windows)
 *   VIHS_R_LINUX_IMAGE    explicit Linux-container image (default 2026q1-linux)
 *   VIHS_R_WINDOWS_IMAGE  explicit Windows-container image (default 2026q1-windows)
 *   VIHS_R_VERSION        LabVIEW year (default 2026)
 *   VIHS_R_BITNESS        x86 | x64 (default x64) — fingerprint metadata
 *   VIHS_R_BUILD          LabVIEW build string for the fingerprint (default <version>-unknown)
 *   VIHS_R_FINGERPRINT    from-within (in-container) fingerprint-inputs JSON (fail-closed if set+missing)
 *   VIHS_R_IN_CONTAINER   set truthy ONLY when this driver runs inside the container,
 *                         permitting a local os.* capture labeled in-container
 *   VIHS_R_DISK_FREE_BYTES in-container free-disk bytes for the fallback capture (positive)
 *   VIHS_R_ACTOR          actor id (default docker-x64)
 *   VIHS_R_ROLE           tangled-left | tangled-right | decoupled (default tangled-right)
 *   VIHS_R_LEDGER         ledger path, repo-relative (default docs/requirements/mirror-benchmark-ledger.json)
 *   VIHS_R_STORAGE        runtime storage root (default a temp dir under $HOME for snap docker)
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
    console.error(`[right] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

const env = process.env;
const isTruthy = (value) =>
  value !== undefined && value !== '' && value !== '0' && String(value).toLowerCase() !== 'false';
const fixtureRepo = env.VIHS_R_REPO || path.join(os.homedir(), 'repos', 'labview-icon-editor');
const viPath = env.VIHS_R_VI || 'resource/plugins/lv_icon.vi';
const baseRev = env.VIHS_R_BASE || 'HEAD~1';
const selectedRev = env.VIHS_R_SELECTED || 'HEAD';
const isWin32 = process.platform === 'win32';
const DEFAULT_LINUX_IMAGE = 'nationalinstruments/labview:2026q1-linux';
const DEFAULT_WINDOWS_IMAGE = 'nationalinstruments/labview:2026q1-windows';
// Keep a distinct tag per platform so a -linux image is never handed to Windows-
// container Docker (or vice-versa). VIHS_R_IMAGE overrides the ACTIVE platform's
// image; each platform otherwise keeps its own default.
const linuxContainerImage = env.VIHS_R_LINUX_IMAGE || (!isWin32 ? env.VIHS_R_IMAGE : undefined) || DEFAULT_LINUX_IMAGE;
const windowsContainerImage = env.VIHS_R_WINDOWS_IMAGE || (isWin32 ? env.VIHS_R_IMAGE : undefined) || DEFAULT_WINDOWS_IMAGE;
const activeImage = isWin32 ? windowsContainerImage : linuxContainerImage;
const version = env.VIHS_R_VERSION || '2026';
const bitness = env.VIHS_R_BITNESS || 'x64';
const actor = env.VIHS_R_ACTOR || 'docker-x64';
const role = env.VIHS_R_ROLE || 'tangled-right';
const ledgerRel = env.VIHS_R_LEDGER || 'docs/requirements/mirror-benchmark-ledger.json';
const mode = env.VIHS_R_MODE || 'cold';
// Actor-neutral logical recipe — provider/bitness are metadata, NOT in parityKey.
const RECIPE = 'createComparisonReport';

const digest = need('out/reporting/mirror/mirrorParityDigest.js');
const capability = need('out/reporting/mirror/mirrorCapabilityFingerprint.js');
const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { preflightComparisonReportRevisions } = need('out/reporting/comparisonReportPreflight.js');
const { persistComparisonReportPacket } = need('out/reporting/comparisonReportPacket.js');
const { executeComparisonReport, materializeSelectedRevisionTreeWithGit } = need('out/reporting/comparisonReportRuntimeExecution.js');

// --- capability fingerprint (in-container, from-within) -----------------------
function loadFingerprint() {
  if (env.VIHS_R_FINGERPRINT !== undefined) {
    if (!fs.existsSync(env.VIHS_R_FINGERPRINT)) {
      throw new Error(`VIHS_R_FINGERPRINT set to "${env.VIHS_R_FINGERPRINT}" but the file does not exist (refusing host fallback).`);
    }
    const inputs = JSON.parse(fs.readFileSync(env.VIHS_R_FINGERPRINT, 'utf8'));
    return capability.buildCapabilityFingerprint(inputs);
  }
  // No explicit in-container fingerprint. The Docker provider normally runs THIS
  // driver on the host (docker as a child provider), so a local os.* capture would
  // be host readings mislabeled 'in-container' and corrupt the actorRef. Fail
  // closed unless the operator asserts the driver itself runs inside the container.
  if (!isTruthy(env.VIHS_R_IN_CONTAINER)) {
    throw new Error(
      'No VIHS_R_FINGERPRINT provided: the Docker right channel must supply an in-container ' +
        'capability fingerprint (VIHS_R_FINGERPRINT=<from-within JSON>). Refusing to use host os.* ' +
        'readings labeled in-container. Set VIHS_R_IN_CONTAINER=1 only when this driver itself runs ' +
        'inside the selected container.'
    );
  }
  // Local capture (guarded by the in-container opt-in above). diskFreeBytes via
  // VIHS_R_DISK_FREE_BYTES or statfs; fail closed if neither is available.
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
          `set VIHS_R_DISK_FREE_BYTES to an in-container value.`
      );
    }
  }
  const inputs = capability.captureLocalCapabilityInputs({
    actor,
    role,
    capturedFrom: 'in-container',
    labviewBuild: env.VIHS_R_BUILD || `${version}-unknown`,
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

  console.log(`[right] actor=${actor} actorRef=${actorRef.slice(0, 12)}… parityKey=${parityKey.slice(0, 12)}… image=${activeImage}`);

  const storageRoot = env.VIHS_R_STORAGE || fs.mkdtempSync(path.join(os.homedir(), '.cache-mirror-right-'));

  const runtimeSelection = await locateComparisonRuntime(process.platform, {
    requestedProvider: 'docker',
    labviewVersion: version,
    bitness,
    linuxContainerImage,
    windowsContainerImage
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
      { materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit, cliConnectTimeoutSeconds: 60 }
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
    // Best-effort producer: a failed/blocked docker run is recorded as a blocked
    // outcome (the reconciler treats a non-ok run as not-fresh evidence), NOT a
    // fabricated ok row.
    outcome = 'blocked';
    reportSha256 = digest.deriveReportSha256(`blocked:${record.blockedReason || rt.failureReason || 'unknown'}`);
    console.error(`[right] docker run did not produce a report (runtimeState=${rt.state}, blocked=${record.blockedReason || rt.failureReason || 'n/a'}); recording a blocked row.`);
  }

  const fpRel = path.join('.mirror-fp', `mirror-fp-r-${actorRef.slice(0, 8)}.json`);
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

  const evidence = { actor, actorRef, parityKey, fixtureSha, sourceRevision, provider: 'docker', image: activeImage, reportSha256, previewImageCount, wallMs, mode, outcome, ledger: ledgerRel };
  if (env.VIHS_R_OUT) {
    fs.writeFileSync(env.VIHS_R_OUT, JSON.stringify(evidence, null, 2));
  }
  console.log(`[right] recorded: ${JSON.stringify(evidence, null, 2)}`);
}

main().catch((error) => {
  console.error(`[right] failed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
