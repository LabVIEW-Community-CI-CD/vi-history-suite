// WIN end-to-end validation of the shipped lvkitViScanProvider projectRoot wiring
// (#2374/#2375, LINUX dd9f80a8): proves the SHIPPED provider (compiled out/), not
// just the raw lvkit CLI, yields a strict-clean born-from-scratch envelope when
// pointed at a cleanroom .lvkit/ primitive pack. Maintainer driver (.cjs,
// inventory-exempt), run in the provisioned Windows container
// lvkit-win-devtools-v2.2.1 which has BOTH node + lvkit (CI Windows leg must
// co-locate them). Requires the FRESHLY-compiled out/ (a stale out/ predating the
// placeholderOnUnresolved/projectRoot source changes silently drops both flags).
//
// Setup in-container: extract out/ + node_modules/jsonc-parser to C:\app, mount
// the SPN corpus at C:\corpus, then `node shipped-provider-projectroot-e2e.cjs`.
//
// Result 2026-07-25 (lvkit 0.5.2, born Write ASCII Message.vi @06939af):
//   WITHOUT projectRoot -> completed, inlineRaise=true  (1926 VISA Write raises inline)
//   WITH    projectRoot -> completed, strictClean=true  (cleanroom 1926 pack resolves it)
//   VERDICT PASS: the shipped provider is strict-clean ONLY with the cleanroom pack.
const path = require('path');
const fs = require('fs/promises');
const { execFileSync } = require('child_process');
const { promisify } = require('util');
const cp = require('child_process');
const { createLvkitViScanProvider } = require('./out/semantic/lvkit/lvkitViScanProvider');

const ROOT = 'C:\\app';
const REPO = path.join(ROOT, 'repo');
const PACK = path.join(ROOT, 'pack');
const REL = 'Write ASCII Message.vi';
const CORPUS = 'C:\\corpus';
const BORN = '06939af';

const PRIMS = {
  metadata: { description: 'cleanroom 1926 VISA Write', source: 'raise-diagnostic terminals + public VISA API (NOT vi.lib diagrams)' },
  primitives: {
    '1926': {
      name: 'VISA Write',
      terminals: [
        { index: 0, direction: 'out', name: 'error_out', type: 'Cluster' },
        { index: 2, direction: 'out', name: 'return_count', type: 'NumUInt32' },
        { index: 3, direction: 'out', name: 'visa_resource_out', type: 'Refnum' },
        { index: 8, direction: 'in', name: 'error_in', type: 'Cluster' },
        { index: 10, direction: 'in', name: 'message', type: 'String' },
        { index: 11, direction: 'in', name: 'visa_resource_in', type: 'Refnum' }
      ],
      python_code: { visa_resource_out: 'in_11', return_count: 'len(in_10)', error_out: 'in_8' }
    }
  }
};

async function main() {
  execFileSync('git', ['config', '--global', '--add', 'safe.directory', CORPUS], { stdio: 'ignore' });
  await fs.mkdir(REPO, { recursive: true });
  const blob = execFileSync('git', ['-C', CORPUS, 'cat-file', '-p', BORN + ':ASCII/Message/Write ASCII Message.vi'], { maxBuffer: 64 * 1024 * 1024 });
  await fs.writeFile(path.join(REPO, REL), blob);
  try { execFileSync('git', ['init', REPO], { stdio: 'ignore' }); } catch (e) { /* not required */ }
  await fs.mkdir(PACK, { recursive: true });
  execFileSync('lvkit', ['setup', '--no-skills', PACK], { stdio: 'ignore' });
  await fs.writeFile(path.join(PACK, '.lvkit', 'primitives.json'), JSON.stringify(PRIMS), 'utf8');

  const scan = createLvkitViScanProvider({});
  async function run(useProject) {
    const input = { repositoryRoot: REPO, relativePath: REL, runtime: 'host-native', placeholderOnUnresolved: true };
    if (useProject) input.projectRoot = PACK;
    const r = await scan(input);
    let raises = 'n/a';
    if (r.status === 'completed') raises = /raise\s+\w*ResolutionNeeded\s*\(/.test(JSON.stringify(r.envelope));
    return { status: r.status, strictClean: r.status === 'completed' && raises === false, inlineRaise: raises, reason: r.reason };
  }
  const a = await run(false);
  const b = await run(true);
  console.log('LVKIT=' + execFileSync('lvkit', ['--version']).toString().trim());
  console.log('WITHOUT projectRoot: ' + JSON.stringify(a));
  console.log('WITH    projectRoot: ' + JSON.stringify(b));
  console.log('VERDICT: ' + ((a.inlineRaise === true && b.strictClean === true)
    ? 'PASS -- shipped provider is strict-clean ONLY with the cleanroom projectRoot pack (dd9f80a8 works end-to-end)'
    : 'INCONCLUSIVE -- see A/B above'));
}
main().catch((e) => { console.error('HARNESS ERROR: ' + (e && e.stack || e)); process.exit(1); });
