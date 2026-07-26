#!/usr/bin/env node
// prototype/win-lvkit/enumerateViChangePairs.cjs
//
// FIX (prioritized) for a dataset-sourcing bug. The previous approach picked ONE (base, selected)
// snapshot pair and ran `git diff base..selected --diff-filter=M -- '*.vi'`. That reports only the
// NET difference between two snapshots, so:
//   - any VI added AFTER `base` shows as A(dded), never M -- even if modified many times since;
//   - a change that nets out within the window is invisible.
// Result: it massively UNDERCOUNTED. actor-framework root..HEAD reported "0 modified / 405 added"
// and a narrow pair saw only 3 comparable VIs, while the repo's real history has 195 in-place VI
// modification events across 102 distinct VIs (icon-editor: 2084 events / 449 VIs).
//
// This enumerator sources candidates the CORRECT way: it walks real per-VI modification COMMITS
// (`git log --diff-filter=M --name-only`) and emits one comparable sample pair per modification --
// { repo, vi, base=firstParent, selected=commit, slug, subject } -- so every pair is an atomic,
// present-at-both, semantically-meaningful VI change (the commit subject is a natural label).
//
// Env:
//   ENUM_REPO       repo path (required)
//   ENUM_REPO_TAG   slug prefix / repo id (default = basename of repo path)
//   ENUM_MODE       'one-per-vi' (default: most-recent modification per VI) | 'all' (every event)
//   ENUM_LIMIT      cap emitted pairs (default 0 = no cap)
//   ENUM_OUT        write JSON here (default prototype/win-lvkit/correlation-fixtures/<tag>-change-pairs.json)
//   ENUM_ALL_REFS   '1' (default) to scan --all refs; '0' to scan only the current branch
// Prints a summary; writes the JSON array consumable as correlation-benchmark ALL_SAMPLES entries.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = process.env.ENUM_REPO;
if (!REPO) {
  console.error('ENUM_REPO is required (path to a git repo)');
  process.exit(2);
}
const REPO_TAG = (process.env.ENUM_REPO_TAG || path.basename(REPO)).replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
const MODE = process.env.ENUM_MODE || 'one-per-vi';
const LIMIT = Number(process.env.ENUM_LIMIT || 0);
const ALL_REFS = (process.env.ENUM_ALL_REFS ?? '1') !== '0';
const OUT =
  process.env.ENUM_OUT ||
  path.join(__dirname, 'correlation-fixtures', `${REPO_TAG}-change-pairs.json`);

const REC = '\u0001'; // record separator unlikely to appear in a subject
function git(args) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// One log pass: commit header line (REC + sha + tab + firstParent + tab + subject) followed by the
// modified .vi paths in that commit.
const args = ['log'];
if (ALL_REFS) args.push('--all');
args.push('--diff-filter=M', `--format=${REC}%H%x09%p%x09%s`, '--name-only', '--', '*.vi');

const raw = git(args);
const lines = raw.split(/\r?\n/);

function slugFor(vi) {
  const base = vi.split('/').pop().replace(/\.vi$/i, '');
  const kebab = base.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `${REPO_TAG}-${kebab}`;
}

const events = [];
let cur = null;
for (const line of lines) {
  if (line.startsWith(REC)) {
    const [sha, firstParent, ...subjParts] = line.slice(1).split('\t');
    cur = { sha, firstParent, subject: subjParts.join('\t') };
    continue;
  }
  if (!cur || !/\.vi$/i.test(line)) continue;
  if (!cur.firstParent) continue; // root commit has no parent -> not a comparable modification
  events.push({
    repo: REPO,
    repoTag: REPO_TAG,
    vi: line,
    base: cur.firstParent,
    selected: cur.sha,
    slug: slugFor(line),
    subject: cur.subject
  });
}

// `git log` is reverse-chronological, so the FIRST event per VI is its most recent modification.
let pairs = events;
if (MODE === 'one-per-vi') {
  const seen = new Set();
  pairs = [];
  for (const e of events) {
    if (seen.has(e.vi)) continue;
    seen.add(e.vi);
    pairs.push(e);
  }
}
// Stable, unique slug even when one-per-vi collides across identical basenames in a repo.
const slugCounts = new Map();
for (const p of pairs) {
  const n = (slugCounts.get(p.slug) || 0) + 1;
  slugCounts.set(p.slug, n);
  if (n > 1) p.slug = `${p.slug}-${n}`;
}
if (LIMIT > 0) pairs = pairs.slice(0, LIMIT);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pairs, null, 2));

const distinctVis = new Set(events.map((e) => e.vi)).size;
console.log(
  `ENUM_DONE repo=${REPO_TAG} mode=${MODE} allRefs=${ALL_REFS} modificationEvents=${events.length} distinctVIs=${distinctVis} emittedPairs=${pairs.length}`
);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
for (const p of pairs.slice(0, 8)) {
  console.log(`- ${p.vi} @ ${p.base.slice(0, 7)}..${p.selected.slice(0, 7)}  "${p.subject.slice(0, 60)}"`);
}
