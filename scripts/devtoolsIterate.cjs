#!/usr/bin/env node

/*
 * Autonomous dev-tools release + codespace injection loop (maintainer helper).
 *
 * Fully-automated single command for iterating a dev-tools release and pinning
 * it into a running codespace. It is intentionally a .cjs so it stays outside
 * the scripts/*.js traceability inventory glob and is never shipped in the VSIX.
 *
 * What it does (each run bumps the SemVer and publishes a fresh release):
 *   1. Read docs/devtools-release.manifest.json version; bump it (patch|minor|
 *      major, default patch) or use --set-version X.Y.Z.
 *   2. Commit the bump on a fresh feature/<issue>-devtools-vX-Y-Z branch and
 *      push to `upstream` (tags may be injected from feature branches — no wait
 *      for a develop merge).
 *   3. Dispatch .github/workflows/devtools-release.yml on that branch ref with
 *      channel=stable, dry_run=false. No environment approval gate (contents:
 *      write only). Publishes the tag devtools-vX.Y.Z (content-digest dedup: it
 *      only creates a release when the toolset content changed).
 *   4. Poll the run to completion and confirm the devtools-vX.Y.Z release exists.
 *   5. Inject into the codespace: set viHistorySuite.devTools.version=
 *      devtools-vX.Y.Z, drive the SHIPPED installPinnedDevTools headlessly
 *      (download + per-file+aggregate integrity verify into globalStorage), then
 *      run reportDevToolsStatus to confirm the pinned build is active.
 *
 * Usage:
 *   node scripts/devtoolsIterate.cjs [--bump patch|minor|major] [--set-version X.Y.Z]
 *       [--issue <n>] [--codespace <name>] [--repo <owner/name>] [--remote upstream]
 *       [--no-inject] [--dry-run]
 *
 * Env fallbacks: DEVTOOLS_ITERATE_CODESPACE, DEVTOOLS_ITERATE_REPO.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const MANIFEST = path.join(repoRoot, 'docs', 'devtools-release.manifest.json');
const DEFAULT_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';
const EXT_ID = 'svelderrainruiz.vi-history-suite';

function parseArgs(argv) {
  const opts = { bump: 'patch', remote: 'upstream', inject: true, dryRun: false, issue: '2065' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--bump') opts.bump = next();
    else if (a === '--set-version') opts.setVersion = next();
    else if (a === '--issue') opts.issue = next();
    else if (a === '--codespace') opts.codespace = next();
    else if (a === '--repo') opts.repo = next();
    else if (a === '--remote') opts.remote = next();
    else if (a === '--no-inject') opts.inject = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--publish-current-branch') opts.publishCurrentBranch = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  opts.repo = opts.repo ?? process.env.DEVTOOLS_ITERATE_REPO ?? DEFAULT_REPO;
  opts.codespace = opts.codespace ?? process.env.DEVTOOLS_ITERATE_CODESPACE;
  return opts;
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...options });
  if (res.status !== 0 && !options.allowFail) {
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    throw new Error(`Command failed (${cmd} ${args.join(' ')}):\n${out}`);
  }
  return res;
}

function nextVersion(current, bump, setVersion) {
  if (setVersion) {
    if (!/^\d+\.\d+\.\d+$/.test(setVersion)) throw new Error(`--set-version must be X.Y.Z, got ${setVersion}`);
    return setVersion;
  }
  const [maj, min, pat] = current.split('.').map((n) => Number.parseInt(n, 10));
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** Returns the higher of two X.Y.Z versions; tolerates undefined. */
function pickHigherVersion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? a : b;
  }
  return a;
}

function readManifestVersion() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).version;
}

function setManifestVersion(version) {
  // Byte-preserving edit: only the version value changes.
  const raw = fs.readFileSync(MANIFEST, 'utf8');
  const updated = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`);
  if (updated === raw) throw new Error('Failed to locate the manifest version field.');
  fs.writeFileSync(MANIFEST, updated);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Latest published stable dev-tools version (from the release tags), or undefined.
 * The base version derives from what is ACTUALLY published, not the committed
 * manifest, so sequential iterations never collide even when develop lags.
 */
function latestPublishedVersion(repo) {
  const res = run(
    'gh',
    ['api', '--paginate', '--slurp', `/repos/${repo}/releases`],
    { allowFail: true }
  );
  if (res.status !== 0) return undefined;
  try {
    const pages = JSON.parse(res.stdout);
    const tags = pages
      .flat()
      .filter((r) => r.prerelease === false && typeof r.tag_name === 'string' && r.tag_name.startsWith('devtools-v'))
      .map((r) => r.tag_name.replace(/^devtools-v/, ''))
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v));
    tags.sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
    });
    return tags[tags.length - 1];
  } catch {
    return undefined;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Base the next version on the LATEST PUBLISHED release (not the committed
  // manifest), so sequential iterations never collide. Fall back to the manifest
  // when nothing is published yet.
  const published = latestPublishedVersion(opts.repo);
  const manifestVersion = readManifestVersion();
  const current = pickHigherVersion(published, manifestVersion);
  const version = nextVersion(current, opts.bump, opts.setVersion);
  const tag = `devtools-v${version}`;
  const branch = `feature/${opts.issue}-devtools-v${version.replace(/\./g, '-')}`;
  console.log(`[iterate] base=${current} (published=${published ?? 'none'}, manifest=${manifestVersion}) -> ${version} [${opts.bump}] (tag ${tag}, branch ${branch})`);
  if (opts.dryRun) {
    console.log('[iterate] --dry-run: stopping before any write/dispatch.');
    return;
  }

  // 1) Prepare the release branch. Default: fresh branch off develop with only
  //    the manifest bump. With --publish-current-branch, the CURRENT branch is
  //    used as-is (the caller has already committed a genuine toolset change),
  //    and only the manifest version is bumped on top.
  if (opts.publishCurrentBranch) {
    const cur = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    console.log(`[iterate] --publish-current-branch: using ${cur}`);
    setManifestVersion(version);
    run('git', ['add', 'docs/devtools-release.manifest.json']);
    run('git', ['commit', '--quiet', '-m', `release(devtools): set dev-tools version ${version}\n\nRefs #${opts.issue}`]);
    run('git', ['push', '-u', opts.remote, cur, '--force-with-lease']);
    opts.branchRef = cur;
  } else {
    run('git', ['fetch', opts.remote, 'develop', '--quiet']);
    run('git', ['checkout', '-B', branch, `${opts.remote}/develop`, '--quiet']);
    setManifestVersion(version);
    run('git', ['add', 'docs/devtools-release.manifest.json']);
    run('git', ['commit', '--quiet', '-m', `release(devtools): bump dev-tools version ${current} -> ${version}\n\nRefs #${opts.issue}`]);
    run('git', ['push', '-u', opts.remote, branch, '--force-with-lease']);
    opts.branchRef = branch;
  }
  console.log(`[iterate] pushed ${opts.branchRef}`);

  // 2) Dispatch the stable publish from the feature branch (no approval gate).
  run('gh', ['workflow', 'run', 'devtools-release.yml', '--repo', opts.repo, '--ref', opts.branchRef, '-f', 'channel=stable', '-f', 'dry_run=false']);
  console.log('[iterate] dispatched devtools-release (stable, publish)');
  await sleep(6000);
  const listRes = run('gh', ['run', 'list', '--repo', opts.repo, '--workflow', 'devtools-release.yml', '--limit', '1', '--json', 'databaseId,headBranch', '--jq', '.[0].databaseId']);
  const runId = listRes.stdout.trim();
  console.log(`[iterate] run ${runId}`);


  // 3) Poll to completion.
  let conclusion = '';
  for (let i = 0; i < 60; i += 1) {
    const s = run('gh', ['run', 'view', runId, '--repo', opts.repo, '--json', 'status,conclusion', '--jq', '.status+" "+(.conclusion//"")']).stdout.trim();
    const [status, concl] = s.split(' ');
    if (status === 'completed') { conclusion = concl; break; }
    await sleep(10000);
  }
  if (conclusion !== 'success') {
    throw new Error(`devtools-release run ${runId} did not succeed (conclusion=${conclusion || 'timeout'}). Inspect: gh run view ${runId} --repo ${opts.repo} --log-failed`);
  }
  // Confirm the release exists (dedup would skip creating it if content unchanged).
  const rel = run('gh', ['release', 'view', tag, '--repo', opts.repo, '--json', 'tagName', '--jq', '.tagName'], { allowFail: true });
  if (rel.status !== 0) {
    throw new Error(`Run succeeded but release ${tag} not found — likely content-digest dedup (toolset unchanged since the last stable release). Change tool content or accept the prior tag.`);
  }
  console.log(`[iterate] published ${tag}`);

  if (!opts.inject) {
    console.log('[iterate] --no-inject: done (release published, codespace not touched).');
    return;
  }
  if (!opts.codespace) {
    console.log('[iterate] no --codespace given; skipping injection. Release published.');
    return;
  }

  // 4) Inject into the codespace: set the pin + headless install + verify.
  console.log(`[iterate] injecting ${tag} into codespace ${opts.codespace}`);
  const injectScript = buildInjectScript(tag, version);
  const ssh = run('gh', ['codespace', 'ssh', '-c', opts.codespace, '--', 'bash', '-s'], { input: injectScript, allowFail: true });
  process.stdout.write(ssh.stdout ?? '');
  if (ssh.stderr) process.stderr.write(ssh.stderr);
  if (ssh.status !== 0) {
    throw new Error(`Injection failed on codespace ${opts.codespace}.`);
  }
  console.log(`[iterate] DONE. Pinned ${tag} active in ${opts.codespace}. Reload the codespace window to relaunch the MCP server from it.`);
}

function buildInjectScript(tag, version) {
  // Runs INSIDE the codespace over `gh codespace ssh -- bash -s`.
  // Uses whatever vi-history-suite extension version is installed (must be the
  // one shipping out/tooling/devToolsRuntime.js, i.e. >= 1.34.3).
  return `
set -euo pipefail
EXT_ID='${EXT_ID}'
TAG='${tag}'
EXTDIR=$(ls -d ~/.vscode-remote/extensions/\${EXT_ID}-* 2>/dev/null | sort -V | tail -1)
[ -n "$EXTDIR" ] || { echo "extension not installed"; exit 1; }
RUNTIME="$EXTDIR/out/tooling/devToolsRuntime.js"
[ -f "$RUNTIME" ] || { echo "installed extension lacks devToolsRuntime.js (needs >= 1.34.3): $EXTDIR"; exit 1; }
SETTINGS="$HOME/.config/Code/User/settings.json"
INSTALL_BASE="$HOME/.vscode-remote/data/User/globalStorage/\${EXT_ID}/devtools"
mkdir -p "$INSTALL_BASE"
python3 - "$SETTINGS" "$TAG" <<'PY'
import json,sys,os
p,tag=sys.argv[1],sys.argv[2]
s=json.load(open(p)) if os.path.exists(p) else {}
s["viHistorySuite.devTools.version"]=tag
json.dump(s,open(p,"w"),indent=2)
print("[inject] set viHistorySuite.devTools.version =",tag)
PY
cat > /tmp/devtools-inject.cjs <<CJS
const { installPinnedDevTools, reportDevToolsStatus } = require("$RUNTIME");
const base = "$INSTALL_BASE";
(async () => {
  const notifier = { info: m => console.log("[info]", m), warn: m => console.log("[warn]", m), error: m => console.log("[error]", m) };
  const res = await installPinnedDevTools({ versionSetting: "$TAG", installBaseDir: base, isWorkspaceTrusted: true, notifier });
  console.log("[inject] install:", JSON.stringify(res));
  if (!res || !res.ok) process.exit(1);
  await reportDevToolsStatus({ installBaseDir: base, versionSetting: "$TAG", checkForUpdates: false, notifier });
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
CJS
node /tmp/devtools-inject.cjs
`;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[iterate] ERROR ${err && err.stack ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, nextVersion, buildInjectScript };