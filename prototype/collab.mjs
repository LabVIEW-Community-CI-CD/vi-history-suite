// Cross-machine collaboration + HANDSHAKE bus over GitHub Discussions.
//
// The two machines (this Windows setup and the Linux setup) coordinate on the
// shared branch `prototype/ollama-mcp-linux-collab`. The BRANCH carries the
// artifacts (commits); this helper turns a GitHub *Discussion* into the async
// HANDSHAKE + status bus so each agent can claim work, acknowledge, report
// progress/done/blocked, and hand off — human-auditable and machine-parseable.
//
// Every message is posted as a Discussion comment that is BOTH readable prose
// AND a fenced JSON block (schema `vihs-collab-msg@v1`) so agents parse it and
// humans skim it. Uses the authenticated `gh` CLI (GraphQL); no extra deps.
//
// Self-identify with VIHS_COLLAB_AGENT=WIN|LINUX (default from process.platform).
//
// Usage (run from the repo root; `gh auth login` first):
//   node prototype/collab.mjs init                         # create/find the bus discussion
//   node prototype/collab.mjs poll [--limit 30] [--type X] [--agent LINUX]
//   node prototype/collab.mjs post  --type PROGRESS --task <id> [--ref <sha>] [--msg "..."] [--next "..."]
//   node prototype/collab.mjs claim --task <id> [--msg "..."]   # advisory lock: warns on a live conflicting claim
//   node prototype/collab.mjs ack   --task <id> [--msg "..."]
//   node prototype/collab.mjs done  --task <id> --ref <sha> [--msg "..."]
//   node prototype/collab.mjs handoff --to LINUX --task <id> [--msg "..."]
//
// Message types: CLAIM, ACK, PROGRESS, DONE, BLOCKED, HANDOFF, QUESTION, ANSWER, NOTE.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as board from './boardStore.mjs';

const OWNER = process.env.VIHS_COLLAB_OWNER || 'LabVIEW-Community-CI-CD';
const REPO = process.env.VIHS_COLLAB_REPO || 'vi-history-suite';
const CATEGORY = process.env.VIHS_COLLAB_CATEGORY || 'General';
const TITLE = process.env.VIHS_COLLAB_TITLE || 'Prototype handshake: Ollama × MCP × docker-linux (Windows↔Linux collab)';
const AGENT = (process.env.VIHS_COLLAB_AGENT || (process.platform === 'win32' ? 'WIN' : 'LINUX')).toUpperCase();
const BRANCH = 'prototype/ollama-mcp-linux-collab';
const SCHEMA = 'vihs-collab-msg@v1';
const TYPES = new Set(['CLAIM', 'ACK', 'PROGRESS', 'DONE', 'BLOCKED', 'HANDOFF', 'QUESTION', 'ANSWER', 'NOTE', 'READY', 'AUTHORIZE', 'REFINE', 'PROPOSE', 'ALIGN', 'SPAWNED']);

// Readiness-probe targets (used by `checkin`), all env-overridable.
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
const IMAGE = 'nationalinstruments/labview:' + (process.env.VIHS_MCP_IMAGE_VERSION || '2026q1patch2-linux');
const CORPUS = process.env.VIHS_MCP_REPO || (process.platform === 'win32' ? 'C:\\repos\\labview-icon-editor' : path.join(os.homedir(), 'repos', 'labview-icon-editor'));
const CORPUS_BASE = process.env.VIHS_MCP_BASE || '9545c483f2b947c71de68c7f70aedefaedadabf7';
const CORPUS_HEAD = process.env.VIHS_MCP_ALT || 'f57c3cfd6494abf1da968ddcc116222e93e953b4';

// Discussion -> issue -> board flow (prototype governance): every issue spawns
// from a dedicated Ideas discussion once BOTH machines have aligned on it.
const ITEM_CATEGORY = process.env.VIHS_COLLAB_ITEM_CATEGORY || 'Ideas';
const PROJECT = process.env.VIHS_COLLAB_PROJECT || null; // board number; board-add is deferred until the board exists
const PROJECT_OWNER = process.env.VIHS_COLLAB_PROJECT_OWNER || OWNER;

function gh(args) {
  try {
    const out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PAGER: 'cat' } });
    return JSON.parse(out);
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString();
    throw new Error('gh ' + args.slice(0, 3).join(' ') + ' failed: ' + msg.slice(0, 500));
  }
}
function gql(query, fields = []) {
  const args = ['api', 'graphql', '-f', 'query=' + query];
  for (const [k, v, int] of fields) args.push(int ? '-F' : '-f', `${k}=${v}`);
  return gh(args);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
      a[key] = val;
    }
  }
  return a;
}

function resolveContext(categoryName = CATEGORY) {
  const q = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id discussionCategories(first:30){nodes{id name}}}}';
  const r = gql(q, [['owner', OWNER], ['name', REPO]]);
  const repo = r.data.repository;
  const cat = (repo.discussionCategories.nodes || []).find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (!cat) throw new Error(`discussion category "${categoryName}" not found`);
  return { repoId: repo.id, categoryId: cat.id };
}

function findDiscussion() {
  const q = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussions(first:50,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number title id url}}}}';
  const r = gql(q, [['owner', OWNER], ['name', REPO]]);
  return (r.data.repository.discussions.nodes || []).find((d) => d.title === TITLE) || null;
}

function ensureDiscussion() {
  const existing = findDiscussion();
  if (existing) return existing;
  const { repoId, categoryId } = resolveContext();
  const body = [
    'Coordination + **handshake bus** between the Windows setup and the Linux setup for the',
    `\`${BRANCH}\` prototype branch (Ollama × VI-History MCP × Docker Linux containers).`,
    '',
    'Each comment is a structured `vihs-collab-msg@v1` message. Agents post via',
    '`node prototype/collab.mjs post|claim|ack|done|handoff` and read via `node prototype/collab.mjs poll`.',
    '',
    'Protocol: **poll** before starting → **claim** a task and wait for **ack** (or no conflicting live claim)',
    'before editing shared files → **progress** while working → **done** with the pushed commit SHA →',
    '**handoff** to the other agent. The branch carries the artifacts; this thread carries the coordination.'
  ].join('\n');
  const m = 'mutation($repo:ID!,$cat:ID!,$title:String!,$body:String!){createDiscussion(input:{repositoryId:$repo,categoryId:$cat,title:$title,body:$body}){discussion{number url id}}}';
  const r = gql(m, [['repo', repoId], ['cat', categoryId], ['title', TITLE], ['body', body]]);
  return r.data.createDiscussion.discussion;
}

function renderBody(msg) {
  const header = `### [${msg.agent}] ${msg.type}${msg.task ? ' · task: ' + msg.task : ''} · ${msg.ts}`;
  const lines = [header, ''];
  if (msg.msg) lines.push(msg.msg, '');
  if (msg.ref) lines.push('- ref: `' + msg.ref + '`');
  if (msg.next) lines.push('- next: ' + msg.next);
  if (msg.to) lines.push('- to: ' + msg.to);
  if (msg.checks) lines.push('', 'checks: ' + Object.entries(msg.checks).map(([k, v]) => k + '=' + (v === true ? 'ok' : v === false ? 'FAIL' : v === null ? '-' : v)).join(', '));
  if (Array.isArray(msg.blockers) && msg.blockers.length) lines.push('', 'blockers:', ...msg.blockers.map((b) => '- ' + b));
  lines.push('', '```json', JSON.stringify(msg), '```');
  return lines.join('\n');
}

function post(msg) {
  const d = ensureDiscussion();
  const full = { schema: SCHEMA, v: 1, agent: AGENT, ts: new Date().toISOString(), branch: BRANCH, ...msg };
  const body = renderBody(full);
  const m = 'mutation($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{url createdAt}}}';
  const r = gql(m, [['id', d.id], ['body', body]]);
  return { discussion: d, comment: r.data.addDiscussionComment.comment, msg: full };
}

function readMessages(limit = 50) {
  const d = findDiscussion();
  if (!d) return { discussion: null, messages: [] };
  const q = 'query($owner:String!,$name:String!,$num:Int!,$last:Int!){repository(owner:$owner,name:$name){discussion(number:$num){comments(last:$last){nodes{author{login} createdAt body url}}}}}';
  const r = gql(q, [['owner', OWNER], ['name', REPO], ['num', String(d.number), true], ['last', String(limit), true]]);
  const nodes = r.data.repository.discussion.comments.nodes || [];
  const messages = [];
  for (const n of nodes) {
    const fence = /```json\s*(\{[\s\S]*?\})\s*```/.exec(n.body || '');
    if (!fence) continue;
    try {
      const parsed = JSON.parse(fence[1]);
      if (parsed.schema === SCHEMA) messages.push({ ...parsed, login: n.author?.login, url: n.url });
    } catch {
      /* skip unparseable */
    }
  }
  return { discussion: d, messages };
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch {
    return null;
  }
}
async function httpJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// Probe the local environment so the other agent can decide GO / REFINE.
async function probeEnv() {
  const c = {};
  c.platform = process.platform;
  c.node = process.version;
  c.npm = sh('npm', ['--version']);
  c.branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  c.head = sh('git', ['rev-parse', '--short', 'HEAD']);
  c.clean = sh('git', ['status', '--porcelain']) === '';
  sh('git', ['fetch', 'origin', BRANCH]);
  const local = sh('git', ['rev-parse', 'HEAD']);
  const remote = sh('git', ['rev-parse', 'origin/' + BRANCH]);
  c.inSyncWithOrigin = Boolean(local && remote && local === remote);
  c.compiled = fs.existsSync(path.join(process.cwd(), 'out', 'cli', 'runViSemanticMcpServer.js'));
  c.dockerServerOs = sh('docker', ['version', '--format', '{{.Server.Os}}']);
  c.image = sh('docker', ['image', 'inspect', IMAGE, '--format', '{{.Id}}']) ? IMAGE : null;
  const ov = await httpJson(OLLAMA + '/api/version');
  c.ollama = ov ? (ov.version || true) : null;
  const tags = await httpJson(OLLAMA + '/api/tags');
  c.model = tags && (tags.models || []).some((m) => m.name === MODEL || m.name === MODEL + ':latest') ? MODEL : null;
  c.corpus = fs.existsSync(CORPUS) ? CORPUS : null;
  if (c.corpus) {
    c.corpusClean = sh('git', ['-C', CORPUS, 'status', '--porcelain']) === '';
    c.corpusBase = Boolean(sh('git', ['-C', CORPUS, 'cat-file', '-t', CORPUS_BASE]));
    c.corpusHead = Boolean(sh('git', ['-C', CORPUS, 'cat-file', '-t', CORPUS_HEAD]));
  }
  c.gh = Boolean(sh('gh', ['auth', 'token']));
  return c;
}

function readinessBlockers(c) {
  const b = [];
  if (c.branch !== BRANCH) b.push(`not on branch ${BRANCH} (on ${c.branch})`);
  if (!c.inSyncWithOrigin) b.push('local HEAD is not in sync with origin/' + BRANCH + ' (git pull --rebase)');
  if (!c.compiled) b.push('out/ not built (npm ci && npm run compile)');
  if (c.dockerServerOs !== 'linux') b.push(`docker engine is "${c.dockerServerOs}", not linux`);
  if (!c.image) b.push(`image ${IMAGE} missing (docker pull ${IMAGE})`);
  if (!c.ollama) b.push('ollama not reachable at ' + OLLAMA);
  if (!c.model) b.push(`model ${MODEL} not pulled (ollama pull ${MODEL})`);
  if (!c.corpus) b.push('corpus repo missing (clone it and set VIHS_MCP_REPO)');
  if (c.corpus && (!c.corpusBase || !c.corpusHead)) b.push('corpus missing base/head commits (git fetch origin pull/537/head)');
  if (!c.gh) b.push('gh not authenticated (gh auth login)');
  return b;
}

// The Linux agent's FIRST action on the single-word kickoff trigger: probe the
// environment and post READY (all green) or BLOCKED (with the exact remedies).
async function checkin(a) {
  const checks = await probeEnv();
  const blockers = readinessBlockers(checks);
  const type = blockers.length ? 'BLOCKED' : 'READY';
  const msg = blockers.length
    ? 'Not ready — ' + blockers.length + ' blocker(s). See remedies below.'
    : `Ready on ${checks.platform} (node ${checks.node}, docker=${checks.dockerServerOs}, image ok, ollama=${checks.ollama}/${MODEL}, corpus clean & at base/head, branch in sync). Awaiting AUTHORIZE.`;
  const r = post({ type, task: a.task || 'kickoff', ref: checks.head || undefined, msg, checks, blockers });
  console.log('posted ' + type + ' ' + r.comment.url);
  for (const b of blockers) console.log('  BLOCKER: ' + b);
}

// --- Discussion -> issue -> board flow ---------------------------------------
function createDiscussionIn(categoryName, title, body) {
  const { repoId, categoryId } = resolveContext(categoryName);
  const m = 'mutation($repo:ID!,$cat:ID!,$title:String!,$body:String!){createDiscussion(input:{repositoryId:$repo,categoryId:$cat,title:$title,body:$body}){discussion{number url id}}}';
  const r = gql(m, [['repo', repoId], ['cat', categoryId], ['title', title], ['body', body || title]]);
  return r.data.createDiscussion.discussion;
}
function getDiscussion(number) {
  const q = 'query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){discussion(number:$num){id number title body url}}}';
  const r = gql(q, [['owner', OWNER], ['name', REPO], ['num', String(number), true]]);
  const d = r.data.repository.discussion;
  if (!d) throw new Error('discussion #' + number + ' not found');
  return d;
}
function readDiscussionMessages(number, limit = 100) {
  const q = 'query($owner:String!,$name:String!,$num:Int!,$last:Int!){repository(owner:$owner,name:$name){discussion(number:$num){comments(last:$last){nodes{author{login} createdAt body url}}}}}';
  const r = gql(q, [['owner', OWNER], ['name', REPO], ['num', String(number), true], ['last', String(limit), true]]);
  const nodes = r.data.repository.discussion.comments.nodes || [];
  const messages = [];
  for (const nd of nodes) {
    const f = /```json\s*(\{[\s\S]*?\})\s*```/.exec(nd.body || '');
    if (!f) continue;
    try { const p = JSON.parse(f[1]); if (p.schema === SCHEMA) messages.push({ ...p, login: nd.author?.login, url: nd.url }); } catch { /* skip */ }
  }
  return { messages };
}
function postToDiscussion(number, msg) {
  const d = getDiscussion(number);
  const full = { schema: SCHEMA, v: 1, agent: AGENT, ts: new Date().toISOString(), branch: BRANCH, discussion: number, ...msg };
  const m = 'mutation($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{url}}}';
  const r = gql(m, [['id', d.id], ['body', renderBody(full)]]);
  return { comment: r.data.addDiscussionComment.comment, msg: full };
}
function ensureLabels() {
  sh('gh', ['label', 'create', 'from-discussion', '--repo', `${OWNER}/${REPO}`, '--color', '1D76DB', '--description', 'Issue spawned from a GitHub Discussion by two-machine consensus']);
  sh('gh', ['label', 'create', 'prototype', '--repo', `${OWNER}/${REPO}`, '--color', '5319E7', '--description', 'Prototype-branch pioneering work']);
}
// Consensus = a PROPOSE and an ALIGN from two DISTINCT machines, no later BLOCKED.
function consensusState(messages) {
  const propose = messages.find((m) => m.type === 'PROPOSE');
  const aligns = messages.filter((m) => m.type === 'ALIGN');
  const spawned = messages.find((m) => m.type === 'SPAWNED');
  let decided = false;
  let by = [];
  if (propose) {
    const otherAlign = aligns.find((x) => x.agent && x.agent !== propose.agent);
    if (otherAlign) {
      const blockedAfter = messages.some((m) => m.type === 'BLOCKED' && m.ts > otherAlign.ts);
      if (!blockedAfter) { decided = true; by = [propose.agent, otherAlign.agent]; }
    }
  }
  return { propose, aligns, spawned, decided, by };
}
function spawnIssue(number) {
  const d = getDiscussion(number);
  const { messages } = readDiscussionMessages(number);
  const st = consensusState(messages);
  if (st.spawned) { console.log('already spawned (idempotent): ' + (st.spawned.ref || '')); return st.spawned.ref; }
  if (!st.decided) {
    console.error('NOT decided: need a PROPOSE and an ALIGN from two DISTINCT machines with no later BLOCKED. ' +
      'propose=' + (st.propose ? st.propose.agent : 'none') + ' aligns=' + JSON.stringify(st.aligns.map((x) => x.agent)));
    process.exit(3);
  }
  ensureLabels();
  const body = `${d.body || ''}\n\n---\n_Spawned from discussion #${number} (${d.url}) by ${st.by.join(' + ')} consensus (prototype flow: discussion → issue → board)._`;
  const created = sh('gh', ['issue', 'create', '--repo', `${OWNER}/${REPO}`, '--title', d.title, '--body', body, '--label', 'from-discussion', '--label', 'prototype']);
  const issueUrl = (created || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
  if (!issueUrl || !/\/issues\/\d+/.test(issueUrl)) throw new Error('gh issue create did not return an issue URL: ' + created);
  // Offline-first LOCAL board is the primary board (git-synced between machines).
  let localNote;
  try {
    const lb = board.loadBoard() || board.initBoard(AGENT).board;
    const drift = board.schemaState(lb).drift;
    if (lb.items.some((it) => it.issueUrl === issueUrl)) {
      localNote = 'already on local board';
    } else {
      const item = board.addItem(lb, { title: d.title, issueUrl, fields: { status: 'Triage', intakeStage: 'Spawned', sourceDiscussion: number, origin: 'collab' } }, AGENT);
      board.saveBoard(lb);
      localNote = 'local board ' + item.id + (drift ? ' [SCHEMA DRIFT — run `board schema-bump`]' : '') + ' (commit prototype/board/board.json to share)';
    }
  } catch (e) {
    localNote = 'local board update FAILED: ' + e.message;
  }
  let remoteNote = ' | remote board deferred';
  if (PROJECT) { const r = sh('gh', ['project', 'item-add', PROJECT, '--owner', PROJECT_OWNER, '--url', issueUrl]); remoteNote = r ? ' | remote board ' + PROJECT : ' | remote board-add FAILED'; }
  postToDiscussion(number, { type: 'SPAWNED', task: 'issue', ref: issueUrl, msg: 'Issue created by ' + st.by.join(' + ') + ' consensus: ' + issueUrl + ' — ' + localNote + remoteNote });
  console.log('spawned ' + issueUrl + '  [' + localNote + remoteNote + ']');
  return issueUrl;
}

function prune(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== true) r[k] = v;
  return r;
}

function boardCommand(rest, a) {
  const sub = rest[0] && !rest[0].startsWith('--') ? rest[0] : 'show';
  if (sub === 'init') {
    const { created, board: b } = board.initBoard(AGENT);
    console.log((created ? 'created ' : 'exists ') + board.BOARD_PATH + '  (schema v' + b.schemaVersion + ', ' + b.fields.length + ' fields)');
    return;
  }
  const b = board.loadBoard();
  if (!b) { console.error('no local board; run: node prototype/collab.mjs board init'); process.exit(2); }
  const ss = board.schemaState(b);
  if (sub === 'show' || sub === 'list') {
    console.log(b.board.name + '  schema v' + b.schemaVersion + (ss.drift ? '  [SCHEMA DRIFT]' : '') + '  items=' + b.items.length);
    for (const it of b.items) console.log('  ' + it.id + '  [' + (it.fields.status || '?') + ' / ' + (it.fields.intakeStage || '?') + ']  ' + it.title + (it.issueUrl ? '  ' + it.issueUrl : '') + (it.fields.sourceDiscussion ? '  disc#' + it.fields.sourceDiscussion : ''));
    return;
  }
  if (sub === 'schema-check') {
    console.log('schema v' + ss.version + '  recorded=' + ss.recorded + '  current=' + ss.current + '  drift=' + ss.drift);
    if (ss.drift) { console.log('SCHEMA DRIFT: fields changed without a version bump -> node prototype/collab.mjs board schema-bump --note "..."'); process.exitCode = 3; }
    return;
  }
  if (sub === 'schema-bump') {
    board.schemaBump(b, a.note || 'schema change', AGENT);
    board.saveBoard(b);
    console.log('schema bumped to v' + b.schemaVersion + '  digest=' + b.schemaDigest + ' (commit prototype/board/board.json)');
    return;
  }
  if (sub === 'add') {
    const item = board.addItem(b, { title: req(a, 'title'), issueUrl: a.issue && a.issue !== true ? a.issue : null, fields: prune({ status: a.status || 'Triage', intakeStage: a.intake || (a.issue ? 'Spawned' : 'Proposed'), sourceDiscussion: a.discussion, origin: a.origin || AGENT }) }, AGENT);
    board.saveBoard(b);
    console.log('added ' + item.id + ' (commit prototype/board/board.json to share)');
    return;
  }
  if (sub === 'set') {
    const item = board.setField(b, req(a, 'item'), req(a, 'field'), req(a, 'value'), AGENT);
    board.saveBoard(b);
    console.log('set ' + item.id + '.' + a.field + ' = ' + a.value + ' (commit prototype/board/board.json)');
    return;
  }
  if (sub === 'sync') {
    if (ss.drift) { console.error('SYNC BLOCKED: schema drift — run `board schema-bump`, then migrate the remote to the new version.'); process.exit(3); }
    const configured = PROJECT || b.board.remote.projectNumber;
    if (!configured) {
      const unpushed = b.items.filter((it) => !it.remoteItemId).length;
      console.log('No remote GitHub Project configured yet — local board is authoritative offline.');
      console.log('Sync plan (when the org project is created):');
      console.log('  - push ' + unpushed + ' local item(s) as project items');
      console.log('  - map fields: ' + b.fields.map((f) => f.name).join(', '));
      console.log('  - reconcile conflicts by ' + b.sync.conflictPolicy + ' (per-field fieldMeta.ts)');
      console.log('  - require remote schema == local schema v' + b.schemaVersion + ' (else migrate first)');
      console.log('Set VIHS_COLLAB_PROJECT + board.remote.projectNumber, then re-run to apply.');
      return;
    }
    console.log('Live remote apply is intentionally not wired yet (safe by design). Local schema v' + b.schemaVersion + ' is ready to push to project ' + configured + '.');
    return;
  }
  console.error('board subcommands: init | show | list | add | set | schema-check | schema-bump | sync');
  process.exit(2);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest);

  if (cmd === 'init') {
    const d = ensureDiscussion();
    console.log('discussion #' + d.number + '  ' + d.url);
    return;
  }
  if (cmd === 'poll') {
    const { discussion, messages } = readMessages(Number(a.limit) || 40);
    if (!discussion) { console.log('no bus discussion yet; run `node prototype/collab.mjs init`'); return; }
    let out = messages;
    if (a.type) out = out.filter((m) => m.type === String(a.type).toUpperCase());
    if (a.agent) out = out.filter((m) => m.agent === String(a.agent).toUpperCase());
    if (a.since) out = out.filter((m) => m.ts >= a.since);
    console.log('# ' + discussion.url + '  (' + out.length + ' messages)');
    for (const m of out) console.log(`[${m.ts}] ${m.agent} ${m.type}${m.task ? ' ' + m.task : ''}${m.ref ? ' @' + m.ref : ''}${m.msg ? ' — ' + m.msg : ''}`);
    return;
  }
  if (cmd === 'checkin') {
    await checkin(a);
    return;
  }
  const SPECIAL = ['claim', 'ack', 'done', 'handoff', 'authorize', 'refine', 'post', 'propose', 'align', 'spawn-issue', 'board'];
  if (!TYPES.has((cmd || '').toUpperCase()) && !SPECIAL.includes(cmd)) {
    console.error('usage: init | poll | checkin | propose --title X | align --discussion N | spawn-issue --discussion N | post --type T --task X | claim|ack|done|handoff|authorize|refine --task X ...');
    process.exit(2);
  }

  if (cmd === 'propose') {
    const title = req(a, 'title');
    const parts = [];
    if (a.body) parts.push(a.body);
    if (a.acceptance) parts.push('\n**Acceptance:** ' + a.acceptance);
    const d = createDiscussionIn(ITEM_CATEGORY, title, parts.join('\n') || title);
    postToDiscussion(d.number, { type: 'PROPOSE', task: a.task || 'work-item', msg: a.msg || ('Proposed: ' + title) });
    console.log('proposed discussion #' + d.number + '  ' + d.url);
    return;
  }
  if (cmd === 'align') {
    const n = Number(req(a, 'discussion'));
    postToDiscussion(n, { type: 'ALIGN', task: a.task || 'work-item', msg: a.msg || undefined });
    const { messages } = readDiscussionMessages(n);
    const st = consensusState(messages);
    if (st.spawned) { console.log('aligned; issue already spawned: ' + st.spawned.ref); return; }
    if (st.decided) { console.log('consensus reached (' + st.by.join(' + ') + ') — spawning issue autonomously...'); spawnIssue(n); return; }
    console.log('aligned; not yet decided (need the other machine to PROPOSE/ALIGN on discussion #' + n + ')');
    return;
  }
  if (cmd === 'spawn-issue') { spawnIssue(Number(req(a, 'discussion'))); return; }
  if (cmd === 'board') { boardCommand(rest, a); return; }

  if (cmd === 'claim') {
    // advisory lock: warn if the OTHER agent has a live CLAIM on this task with no later DONE/HANDOFF/ACK from us.
    const task = req(a, 'task');
    const { messages } = readMessages(60);
    const rel = messages.filter((m) => m.task === task);
    const otherClaim = [...rel].reverse().find((m) => m.type === 'CLAIM' && m.agent !== AGENT);
    const resolvedAfter = otherClaim && rel.some((m) => m.ts > otherClaim.ts && ['DONE', 'HANDOFF', 'ACK', 'BLOCKED'].includes(m.type));
    if (otherClaim && !resolvedAfter) {
      console.error(`CONFLICT: ${otherClaim.agent} has a live CLAIM on "${task}" (${otherClaim.ts}). Coordinate before proceeding (poll, then ack/handoff).`);
    }
    const r = post({ type: 'CLAIM', task, msg: a.msg || undefined });
    console.log((otherClaim && !resolvedAfter ? 'posted CLAIM (CONFLICT — see above) ' : 'posted CLAIM ') + r.comment.url);
    return;
  }
  if (cmd === 'ack') { const r = post({ type: 'ACK', task: req(a, 'task'), msg: a.msg || undefined }); console.log('posted ACK ' + r.comment.url); return; }
  if (cmd === 'done') { const r = post({ type: 'DONE', task: req(a, 'task'), ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined }); console.log('posted DONE ' + r.comment.url); return; }
  if (cmd === 'handoff') { const r = post({ type: 'HANDOFF', task: req(a, 'task'), to: a.to || undefined, ref: a.ref || undefined, msg: a.msg || undefined }); console.log('posted HANDOFF ' + r.comment.url); return; }
  if (cmd === 'authorize') { const r = post({ type: 'AUTHORIZE', task: req(a, 'task'), to: a.to || 'LINUX', ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined }); console.log('posted AUTHORIZE ' + r.comment.url); return; }
  if (cmd === 'refine') { const r = post({ type: 'REFINE', task: req(a, 'task'), ref: req(a, 'ref'), to: a.to || 'LINUX', msg: a.msg || undefined, next: a.next || undefined }); console.log('posted REFINE ' + r.comment.url); return; }
  if (cmd === 'post') {
    const type = req(a, 'type').toUpperCase();
    if (!TYPES.has(type)) { console.error('unknown --type ' + type + ' (valid: ' + [...TYPES].join(', ') + ')'); process.exit(2); }
    const r = post({ type, task: a.task || undefined, ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined, to: a.to || undefined });
    console.log('posted ' + type + ' ' + r.comment.url);
    return;
  }

  // generic post
  const type = cmd.toUpperCase();
  const r = post({ type, task: a.task || undefined, ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined, to: a.to || undefined });
  console.log('posted ' + type + ' ' + r.comment.url);
}

function req(a, key) {
  if (!a[key] || a[key] === true) { console.error('missing --' + key); process.exit(2); }
  return String(a[key]);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
