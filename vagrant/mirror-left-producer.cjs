/**
 * Mirror-Mode Phase 2 (VHS-REQ-707.9/.10) maintainer driver: the Vagrant
 * LEFT-CHANNEL benchmark PRODUCER.
 *
 * Runs a REAL LabVIEW VI comparison through the shipped compiled `out/`
 * primitives (locateComparisonRuntime -> preflight -> persist ->
 * executeComparisonReport), captures a FROM-WITHIN capability fingerprint,
 * computes the cross-actor parity digests (Phase 1 helper), and records an
 * idempotent row in the `vi-history-suite/mirror-benchmark@v1` ledger (Phase 1
 * writer). This is the left channel and the sole human-authored VI surface; it
 * only RUNS comparisons on already-authored VIs and never authors `.vi` binaries.
 *
 * Fail-closed: it records a ledger row ONLY when a real comparison actually
 * produced a report; there is no placeholder/trusted-file path (a stale or
 * unrelated file must never be recorded as parity evidence).
 *
 * The parity `recipe` is the ACTOR-NEUTRAL logical operation
 * (`createComparisonReport`) — provider (host/docker) and bitness are actor
 * fingerprint / run metadata, NOT part of the cross-actor parity key, so the
 * x86-Vagrant(host) and x64-Docker mirrors of the same sample group together.
 *
 * Maintainer-only `.cjs` under vagrant/, inventory-exempt, NOT shipped and NOT in
 * `npm test`. Requires `npm run compile`. Intended to run in the Vagrant guest
 * (LabVIEW Community 2026 x86).
 *
 * The from-within fingerprint MUST be captured inside the actor. This driver
 * reads a fingerprint-inputs JSON produced from within the guest (e.g. via
 * Get-CimInstance / Get-PSDrive) when VIHS_L_FINGERPRINT is set; when that env
 * var is set but the file is missing/unreadable it FAILS CLOSED (it never
 * silently falls back to a host capture that would violate the from-within rule).
 * Only when VIHS_L_FINGERPRINT is unset does it capture the local host actor.
 *
 * Env:
 *   VIHS_L_REPO          fixture repo (default C:\repos\labview-icon-editor on win32)
 *   VIHS_L_VI            VI under test, repo-relative (default resource/plugins/lv_icon.vi)
 *   VIHS_L_BASE          base git rev (default HEAD~1)
 *   VIHS_L_SELECTED      selected git rev (default HEAD)
 *   VIHS_L_PROVIDER      host | docker (default host) — run metadata, not in parityKey
 *   VIHS_L_VERSION       LabVIEW year (default 2026)
 *   VIHS_L_BITNESS       x86 | x64 (default x86 in guest) — fingerprint metadata
 *   VIHS_L_FINGERPRINT   path to a from-within fingerprint-inputs JSON (fail-closed if set+missing)
 *   VIHS_L_ACTOR / VIHS_L_ROLE / VIHS_L_BUILD
 *   VIHS_L_LEDGER        ledger path, repo-relative (default docs/requirements/mirror-benchmark-ledger.json)
 *   VIHS_L_STORAGE       runtime storage root (default a temp dir)
 *   VIHS_L_DISK_FREE_BYTES  explicit from-within free-disk bytes; REQUIRED where
 *                        fs.statfsSync is unavailable (commonly win32)
 *   VIHS_L_MODE          cold | warm (default cold)
 *   VIHS_L_OUT           optional JSON evidence path
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function need(rel) {
  const f = path.join(repoRoot, rel);
  if (!fs.existsSync(f)) {
    console.error(`[left] missing ${rel}; run \`npm run compile\` first.`);
    process.exit(1);
  }
  return require(f);
}

const env = process.env;
const fixtureRepo =
  env.VIHS_L_REPO || (process.platform === 'win32' ? 'C:\\repos\\labview-icon-editor' : path.join(os.homedir(), 'repos', 'labview-icon-editor'));
const viPath = env.VIHS_L_VI || 'resource/plugins/lv_icon.vi';
const baseRev = env.VIHS_L_BASE || 'HEAD~1';
const selectedRev = env.VIHS_L_SELECTED || 'HEAD';
const provider = env.VIHS_L_PROVIDER || 'host';
const version = env.VIHS_L_VERSION || '2026';
const bitness = env.VIHS_L_BITNESS || (process.platform === 'win32' ? 'x86' : 'x64');
const actor = env.VIHS_L_ACTOR || (process.platform === 'win32' ? 'vagrant-x86' : 'linux-host-native-x64');
const role = env.VIHS_L_ROLE || (process.platform === 'win32' ? 'tangled-left' : 'decoupled');
const ledgerRel = env.VIHS_L_LEDGER || 'docs/requirements/mirror-benchmark-ledger.json';
const mode = env.VIHS_L_MODE || 'cold';
// Actor-neutral logical recipe — provider/bitness are metadata, NOT in parityKey.
const RECIPE = 'createComparisonReport';

const digest = need('out/reporting/mirror/mirrorParityDigest.js');
const capability = need('out/reporting/mirror/mirrorCapabilityFingerprint.js');
const { locateComparisonRuntime } = need('out/reporting/comparisonRuntimeLocator.js');
const { preflightComparisonReportRevisions } = need('out/reporting/comparisonReportPreflight.js');
const { persistComparisonReportPacket } = need('out/reporting/comparisonReportPacket.js');
const { executeComparisonReport, materializeSelectedRevisionTreeWithGit } = need('out/reporting/comparisonReportRuntimeExecution.js');

// --- capability fingerprint (from-within) -------------------------------------
function loadFingerprint() {
  if (env.VIHS_L_FINGERPRINT !== undefined) {
    // Env var present => the caller intends a specific from-within capture. Fail
    // closed if it is missing/unreadable rather than silently using a host capture.
    if (!fs.existsSync(env.VIHS_L_FINGERPRINT)) {
      throw new Error(`VIHS_L_FINGERPRINT set to "${env.VIHS_L_FINGERPRINT}" but the file does not exist (refusing host fallback).`);
    }
    const inputs = JSON.parse(fs.readFileSync(env.VIHS_L_FINGERPRINT, 'utf8'));
    return capability.buildCapabilityFingerprint(inputs);
  }
  // Host-native fallback: capture from this host's own os.* (the from-within
  // Free disk (bytes) for the fingerprint. An explicit VIHS_L_DISK_FREE_BYTES
  // override wins (for platforms where fs.statfsSync is unsupported); otherwise
  // probe statfs. FAIL CLOSED if neither is available — a silent placeholder
  // (e.g. 1 byte -> diskFreeGb 0.0) would fork the actorRef and mis-attribute the
  // ledger row to a different actor identity.
  let diskFreeBytes;
  if (env.VIHS_L_DISK_FREE_BYTES !== undefined) {
    diskFreeBytes = Number(env.VIHS_L_DISK_FREE_BYTES);
    if (!Number.isFinite(diskFreeBytes) || diskFreeBytes <= 0) {
      throw new Error(`VIHS_L_DISK_FREE_BYTES must be a positive number; received "${env.VIHS_L_DISK_FREE_BYTES}".`);
    }
  } else {
    try {
      // Probe the filesystem the comparison actually uses (the fixture repo
      // that holds the compared VIs), not this tool's repoRoot — a repo/fixture
      // on different volumes would otherwise record the wrong disk capacity and
      // fork the derived actorRef.
      const st = fs.statfsSync(fixtureRepo);
      diskFreeBytes = st.bavail * st.bsize;
    } catch (error) {
      throw new Error(
        `Could not determine free disk via fs.statfsSync (${error && error.message ? error.message : error}); ` +
          `set VIHS_L_DISK_FREE_BYTES to a from-within value.`
      );
    }
  }
  const inputs = capability.captureLocalCapabilityInputs({
    actor,
    role,
    capturedFrom: process.platform === 'win32' ? 'in-guest' : 'host',
    labviewBuild: env.VIHS_L_BUILD || `${version}-unknown`,
    labviewBitness: bitness,
    diskFreeBytes
  });
  return capability.buildCapabilityFingerprint(inputs);
}

// git blob id for the selected VI, hashed to a 64-hex sha256 fixture identity.
function fixtureShaFor(rev, rel) {
  const blob = execFileSync('git', ['-C', fixtureRepo, 'rev-parse', `${rev}:${rel}`], { encoding: 'utf8' }).trim();
  return crypto.createHash('sha256').update(blob, 'utf8').digest('hex');
}

async function main() {
  const fingerprint = loadFingerprint();
  const actorRef = digest.deriveActorFingerprintId(fingerprint);
  const fixtureSha = fixtureShaFor(selectedRev, viPath);
  const parityKey = digest.deriveParityKey({ version, fixtureSha, viPath, recipe: RECIPE });

  console.log(`[left] actor=${actor} actorRef=${actorRef.slice(0, 12)}… parityKey=${parityKey.slice(0, 12)}…`);
  console.log(`[left] fixture ${viPath} ${baseRev}..${selectedRev} (fixtureSha ${fixtureSha.slice(0, 12)}…) provider=${provider}`);

  const storageRoot = env.VIHS_L_STORAGE || fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-left-'));

  // --- real comparison run through the shipped primitives ---------------------
  const runtimeSelection = await locateComparisonRuntime(process.platform, {
    requestedProvider: provider,
    labviewVersion: version,
    bitness,
    requireVersionAndBitness: process.platform === 'win32'
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
  // The canonical report path is record.artifactPlan.reportFilePath (also
  // packet.reportFilePath); ComparisonReportRuntimeExecution carries no path.
  const reportPath = (record.artifactPlan || {}).reportFilePath;
  if (!rt.reportExists || !reportPath || !fs.existsSync(reportPath)) {
    console.error(`[left] no real report produced (runtimeState=${rt.state}, blocked=${record.blockedReason || rt.failureReason || 'n/a'}); refusing to record a placeholder ledger row.`);
    process.exit(1);
  }

  const html = fs.readFileSync(reportPath, 'utf8');
  const reportSha256 = digest.deriveReportSha256(html);
  const previewImageCount = (html.match(/data:image\/png;base64/g) || []).length;

  // Persist the fingerprint JSON for the writer, then record the ledger row.
  const fpFile = path.join(os.tmpdir(), `mirror-fp-${actorRef.slice(0, 8)}.json`);
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
    '--outcome', 'ok',
    '--report-sha256', reportSha256,
    '--preview-image-count', String(previewImageCount),
    '--wall-ms', String(wallMs),
    '--fingerprint-file', fpFile,
    '--ledger', ledgerRel
  ];
  execFileSync('node', args, { cwd: repoRoot, stdio: 'inherit' });

  const evidence = { actor, actorRef, parityKey, fixtureSha, sourceRevision, provider, reportSha256, previewImageCount, wallMs, mode, ledger: ledgerRel };
  if (env.VIHS_L_OUT) {
    fs.writeFileSync(env.VIHS_L_OUT, JSON.stringify(evidence, null, 2));
  }
  console.log(`[left] recorded: ${JSON.stringify(evidence, null, 2)}`);
}

main().catch((error) => {
  console.error(`[left] failed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
