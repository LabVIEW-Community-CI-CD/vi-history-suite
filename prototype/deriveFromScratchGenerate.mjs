// LINUX leg of derive-from-scratch (issue #2373, Ideas #2372). A VI's FIRST
// commit has no parent to diff, so its born-from-scratch initial state is
// captured by a full `lvkit generate` (Python mirroring the block diagram) and
// stored as that VI's FIRST content-addressed entry in the shipped
// `lvkit-vi-scan@v1` store -- the same store the diff/preview path already
// feeds and the `get_vi_generated_code` MCP tool reads.
//
// This driver runs `lvkit generate` inside the LabVIEW-free native container
// (vihs-lvkit-stage, per #2372 -- parity with WIN's Windows-container leg),
// captures the generated modules verbatim, then reuses the SHIPPED compiled
// model+store (out/semantic/lvkit/lvkitViScanModel + lvkitViScanStore) to build
// and persist a real `lvkit-vi-scan@v1` envelope. So the born-from-scratch
// generate becomes valid relay grounding consumable exactly like any other scan.
//
// Prototype harness (.mjs, inventory-exempt; not shipped, not in npm test). Run
// from the repo root AFTER `npm run compile`, Docker in linux-engine mode:
//   node prototype/deriveFromScratchGenerate.mjs
//
// Env:
//   VIHS_DFS_REPO     corpus git repo (default ~/repos/SerialPortNuggets)
//   VIHS_DFS_COMMIT   the born commit whose VIs are first-appearances (default 06939af)
//   VIHS_DFS_IMAGE    lvkit-in-container image (default vihs-lvkit-stage:local)
//   VIHS_DFS_RUNTIME  runtime label recorded in the envelope (default linux-container)
//   VIHS_DFS_LIMIT    max VIs to process (default 0 = all at the commit)
//   VIHS_DFS_OUT      write the typed evidence JSON to this path
//
// The store lands under <corpus>/.vihs/cache/lvkit-vi-scan (self-ignored),
// matching where the shipped get_vi_generated_code resolves it from a repo root.
// Exit 0 when the run completes; 2 on preflight (no compiled model / no image).

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const CORPUS = process.env.VIHS_DFS_REPO || path.join(os.homedir(), 'repos', 'SerialPortNuggets');
const COMMIT = process.env.VIHS_DFS_COMMIT || '06939af';
const IMAGE = process.env.VIHS_DFS_IMAGE || 'vihs-lvkit-stage:local';
const RUNTIME = process.env.VIHS_DFS_RUNTIME || 'linux-container';
const LIMIT = process.env.VIHS_DFS_LIMIT !== undefined ? Number(process.env.VIHS_DFS_LIMIT) : 0;
const OUT = process.env.VIHS_DFS_OUT || '';

const log = (m) => process.stderr.write('[derive-from-scratch] ' + m + '\n');

async function loadCompiled(rel) {
  const f = path.join(REPO, 'out', 'semantic', 'lvkit', rel);
  if (!fs.existsSync(f)) {
    log(`missing out/semantic/lvkit/${rel}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return import(path.sep === '\\' ? 'file://' + f.replace(/\\/g, '/') : f);
}

function gitBlob(vi, commit) {
  return execFileSync('git', ['-C', CORPUS, 'cat-file', '-p', `${commit}:${vi}`], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024
  });
}

function listFirstCommitVis() {
  return execFileSync('git', ['-C', CORPUS, 'ls-tree', '-r', '--name-only', COMMIT], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter((v) => /\.vi$/i.test(v));
}

// In-container: stage the first-commit VI, generate born-from-scratch (reproducible
// minimal, placeholder on unresolved primitives/vi.lib), and tar the output tree to
// stdout (binary-safe). lvkit chatter is redirected away so only the tar hits stdout.
const GEN_SCRIPT = [
  'git config --global --add safe.directory /repo >/dev/null 2>&1',
  'git -C /repo cat-file -p "$C:$V" > /tmp/cur.vi 2>/dev/null',
  'lvkit generate /tmp/cur.vi --load-mode minimal --no-auto-vilib --placeholder-on-unresolved -o /tmp/out >/dev/null 2>&1',
  'if [ -d /tmp/out ]; then cd /tmp/out && tar cf - .; fi'
].join('; ');

function generateModules(vi, commit) {
  const tarBytes = execFileSync(
    'docker',
    ['run', '--rm', '-e', `C=${commit}`, '-e', `V=${vi}`, '-v', `${CORPUS}:/repo:ro`, IMAGE, 'sh', '-c', GEN_SCRIPT],
    { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 }
  );
  if (!tarBytes || tarBytes.length === 0) {
    return [];
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-dfs-'));
  try {
    const tarPath = path.join(tmp, 'gen.tar');
    fs.writeFileSync(tarPath, tarBytes);
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    execFileSync('tar', ['xf', tarPath, '-C', dest]);
    const modules = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
        } else if (entry.isFile()) {
          modules.push({ relativePath: path.relative(dest, p).replace(/\\/g, '/'), python: fs.readFileSync(p, 'utf8') });
        }
      }
    };
    walk(dest);
    return modules;
  } catch {
    return [];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const { buildLvkitViScanEnvelope } = await loadCompiled('lvkitViScanModel.js');
  const { createDefaultLvkitViScanStore, computeLvkitViScanStoreKey } = await loadCompiled('lvkitViScanStore.js');
  const store = createDefaultLvkitViScanStore(CORPUS);

  // Two enumeration modes: a per-VI born-commit SET (VIHS_DFS_SET, a JSON array of
  // { viPath, commit } for corpora like icon-editor where first appearances are
  // scattered across commits), else every VI present at a single born COMMIT (for
  // corpora like SerialPortNuggets where one commit adds them all).
  const SET = process.env.VIHS_DFS_SET;
  let entries;
  if (SET) {
    entries = JSON.parse(fs.readFileSync(SET, 'utf8')).map((e) => ({ viPath: e.viPath, commit: e.commit || COMMIT }));
    log(`${entries.length} first-commit VI(s) from set ${SET} in ${CORPUS}`);
  } else {
    let vis = listFirstCommitVis();
    if (LIMIT > 0) {
      vis = vis.slice(0, LIMIT);
    }
    entries = vis.map((vi) => ({ viPath: vi, commit: COMMIT }));
    log(`${entries.length} first-commit VI(s) at ${COMMIT} in ${CORPUS}`);
  }

  const evidence = {
    schema: 'vi-history-suite/derive-from-scratch-linux@v1',
    generatedAt: new Date().toISOString(),
    corpus: CORPUS,
    commit: SET ? 'per-vi-set' : COMMIT,
    image: IMAGE,
    runtime: RUNTIME,
    storeDir: path.join(CORPUS, '.vihs', 'cache', 'lvkit-vi-scan'),
    entries: []
  };

  for (const { viPath: vi, commit } of entries) {
    const contentSignature = 'sha256:' + crypto.createHash('sha256').update(gitBlob(vi, commit)).digest('hex');
    const modules = generateModules(vi, commit);
    if (!modules.length) {
      evidence.entries.push({ vi, ok: false, reason: 'no-generated-output' });
      log(`  ! ${path.basename(vi)}: no generated output`);
      continue;
    }
    let envelope;
    try {
      envelope = buildLvkitViScanEnvelope({
        viPath: vi,
        contentSignature,
        runtime: RUNTIME,
        generatedAt: new Date().toISOString(),
        lvkitSource: 'path',
        modules
      });
    } catch (e) {
      evidence.entries.push({ vi, ok: false, reason: 'envelope-build: ' + (e && e.message ? e.message : e) });
      log(`  ! ${path.basename(vi)}: envelope build failed`);
      continue;
    }
    const stored = await store.put(envelope);
    const key = computeLvkitViScanStoreKey(vi, contentSignature);
    const cleanGenerate = envelope.errorModuleCount === 0;
    evidence.entries.push({
      vi,
      commit,
      ok: true,
      stored,
      key,
      moduleCount: envelope.moduleCount,
      errorModuleCount: envelope.errorModuleCount,
      resolvedModuleCount: envelope.resolvedModuleCount,
      cleanGenerate,
      primaryModule: envelope.primaryModule ? envelope.primaryModule.relativePath : null
    });
    log(`  + ${path.basename(vi)}: modules=${envelope.moduleCount} err=${envelope.errorModuleCount} clean=${cleanGenerate} stored=${stored} key=${key.slice(0, 12)}`);
  }

  const withOutput = evidence.entries.filter((e) => e.ok);
  const cleanGenerate = withOutput.filter((e) => e.cleanGenerate);
  evidence.summary = {
    total: entries.length,
    withOutput: withOutput.length,
    cleanGenerate: cleanGenerate.length,
    stored: withOutput.filter((e) => e.stored).length
  };

  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + '\n');
    log(`evidence -> ${OUT}`);
  }
  console.log(
    JSON.stringify(
      {
        summary: evidence.summary,
        storeDir: evidence.storeDir,
        cleanGenerate: cleanGenerate.map((e) => ({ vi: path.basename(e.vi), key: e.key, modules: e.moduleCount, primary: e.primaryModule }))
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  log('FATAL ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
