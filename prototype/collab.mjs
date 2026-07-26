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

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as board from './boardStore.mjs';
import { deriveTeamName } from './deriveAgentEnvironment.mjs';

const OWNER = process.env.VIHS_COLLAB_OWNER || 'LabVIEW-Community-CI-CD';
const REPO = process.env.VIHS_COLLAB_REPO || 'vi-history-suite';
const CATEGORY = process.env.VIHS_COLLAB_CATEGORY || 'General';
const TITLE = process.env.VIHS_COLLAB_TITLE || 'Prototype handshake: Ollama × MCP × docker-linux (Windows↔Linux collab)';
// Self-identify: env override wins, else DERIVE the unique per-machine team name
// (issue #2392). Fail-safe to the legacy OS-plane label so identity derivation can
// never break the bus.
const AGENT = (() => {
  if (process.env.VIHS_COLLAB_AGENT) return process.env.VIHS_COLLAB_AGENT.toUpperCase();
  try {
    return deriveTeamName().toUpperCase();
  } catch {
    return process.platform === 'win32' ? 'WIN' : 'LINUX';
  }
})();
const BRANCH = 'prototype/ollama-mcp-linux-collab';
const SCHEMA = 'vihs-collab-msg@v1';
const TYPES = new Set(['CLAIM', 'ACK', 'PROGRESS', 'DONE', 'BLOCKED', 'HANDOFF', 'QUESTION', 'ANSWER', 'NOTE', 'READY', 'AUTHORIZE', 'REFINE', 'PROPOSE', 'ALIGN', 'SPAWNED', 'RESOLVED']);
// When true, the idempotency guard is bypassed (set from --force in main()).
let FORCE_POST = false;

// Readiness-probe targets (used by `checkin`), all env-overridable.
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
const IMAGE = 'nationalinstruments/labview:' + (process.env.VIHS_MCP_IMAGE_VERSION || '2026q1patch2-linux');
const CORPUS = process.env.VIHS_MCP_REPO || (process.platform === 'win32' ? 'C:\\repos\\ni\\labview-icon-editor' : path.join(os.homedir(), 'repos', 'labview-icon-editor'));
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
  const resolved = messages.find((m) => m.type === 'SPAWNED' || m.type === 'RESOLVED');
  let decided = false;
  let by = [];
  if (propose) {
    const otherAlign = aligns.find((x) => x.agent && x.agent !== propose.agent);
    if (otherAlign) {
      const blockedAfter = messages.some((m) => m.type === 'BLOCKED' && m.ts > otherAlign.ts);
      if (!blockedAfter) { decided = true; by = [propose.agent, otherAlign.agent]; }
    }
  }
  return { propose, aligns, spawned, resolved, decided, by, resolution: (propose && propose.resolution) || 'issue', refs: (propose && propose.refs) || [] };
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

function closeDiscussionResolved(number) {
  const d = getDiscussion(number);
  gql('mutation($id:ID!){closeDiscussion(input:{discussionId:$id,reason:RESOLVED}){discussion{closed}}}', [['id', d.id]]);
}
function createConsolidatedIssue(d, st, refs) {
  ensureLabels();
  const refLine = refs && refs.length ? '\n\nConsolidates: ' + refs.map((n) => '#' + n).join(', ') : '';
  const body = `${d.body || ''}${refLine}\n\n---\n_Converted from discussion #${d.number} (${d.url}) by ${st.by.join(' + ')} consensus._`;
  const created = sh('gh', ['issue', 'create', '--repo', `${OWNER}/${REPO}`, '--title', d.title, '--body', body, '--label', 'from-discussion', '--label', 'prototype']);
  const issueUrl = (created || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
  if (!issueUrl || !/\/issues\/\d+/.test(issueUrl)) throw new Error('gh issue create failed: ' + created);
  try {
    const lb = board.loadBoard() || board.initBoard(AGENT).board;
    if (!lb.items.some((it) => it.issueUrl === issueUrl)) { board.addItem(lb, { title: d.title, issueUrl, fields: { status: 'Triage', intakeStage: 'Spawned', sourceDiscussion: d.number, origin: 'collab' } }, AGENT); board.saveBoard(lb); }
  } catch { /* board best-effort */ }
  return issueUrl;
}
// Apply the decided resolution: close (no issue) | issue | convert (consolidate refs).
function resolveDiscussion(number) {
  const d = getDiscussion(number);
  const { messages } = readDiscussionMessages(number);
  const st = consensusState(messages);
  if (st.resolved) { console.log('already resolved (idempotent): ' + st.resolved.type + (st.resolved.ref ? ' ' + st.resolved.ref : '')); return; }
  if (!st.decided) { console.error('NOT decided: need a PROPOSE and an ALIGN from two DISTINCT machines, no later BLOCKED.'); process.exit(3); }
  if (st.resolution === 'close') {
    closeDiscussionResolved(number);
    postToDiscussion(number, { type: 'RESOLVED', task: (st.propose && st.propose.task) || 'work-item', msg: 'Aligned by ' + st.by.join(' + ') + ' — discussion CLOSED as RESOLVED, no issue. Kickoff successful.' });
    console.log('resolved #' + number + ': CLOSED (no issue) — kickoff successful');
    return;
  }
  if (st.resolution === 'convert') {
    const url = createConsolidatedIssue(d, st, st.refs);
    closeDiscussionResolved(number);
    postToDiscussion(number, { type: 'SPAWNED', task: 'issue', ref: url, msg: 'Aligned by ' + st.by.join(' + ') + ' — consolidated ' + st.refs.length + ' issue(s) into ' + url + '; discussion closed.' });
    console.log('resolved #' + number + ': converted -> ' + url);
    return;
  }
  spawnIssue(number);
}

function prune(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== true) r[k] = v;
  return r;
}

// --- P0/P1 collaboration-ergonomics helpers ---------------------------------
// Resolve a message from --msg-file <path> | --msg-stdin | --msg "...". Reading
// from a file or stdin sidesteps outer-shell quoting entirely (apostrophes, {},
// $-interpolation) — the class of message-corruption that bit the bus before.
function resolveMessageArg(a) {
  if (a['msg-file'] && a['msg-file'] !== true) return fs.readFileSync(String(a['msg-file']), 'utf8').replace(/\s+$/, '');
  if (a['msg-stdin']) return fs.readFileSync(0, 'utf8').replace(/\s+$/, '');
  return a.msg && a.msg !== true ? String(a.msg) : undefined;
}

// Validate a cited --ref: it must resolve locally (catch typos); we NOTE (not
// fail) when it is not yet on origin — the expected publish-before-push window.
// URL/path-like refs (e.g. issue URLs) skip git validation.
function validateRef(ref) {
  if (/^https?:\/\//i.test(ref) || ref.includes('/')) return ref;
  const type = sh('git', ['cat-file', '-t', ref]);
  if (!type) { console.error('collab: --ref "' + ref + '" is not a valid git object here (typo, or not committed yet). Aborting.'); process.exit(2); }
  const isAncestor = sh('git', ['merge-base', '--is-ancestor', ref, 'origin/' + BRANCH]);
  if (isAncestor === null) console.error('collab: note — --ref ' + ref.slice(0, 12) + ' is not yet on origin/' + BRANCH + ' (fine if publishing before push; push right after).');
  return ref;
}

// Idempotency guard: an identical (agent,type,task,msg) main-bus post within a
// 10-minute window (a spurious ^C-retried post) is a duplicate.
function isDuplicatePost(messages, type, task, msg) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  return messages.some((m) => m.agent === AGENT && m.type === type && (m.task || '') === (task || '') && (m.msg || '') === (msg || '') && m.ts >= cutoff);
}

// Check-before-publish rule: surface every comment the OTHER agent posted since
// our last message, so a publish never talks over an unread reply.
function otherAgentSinceMyLastPost(messages) {
  const mine = messages.filter((m) => m.agent === AGENT).map((m) => m.ts).sort();
  const myLast = mine.length ? mine[mine.length - 1] : '';
  return messages.filter((m) => m.agent !== AGENT && m.ts > myLast).sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

// CLI posting choke point: (1) surface any newer other-agent comment (check-before-
// publish), (2) apply the idempotency guard, then post to the main bus.
function cliPost(payload) {
  let messages = [];
  try { messages = readMessages(15).messages; } catch { /* offline: skip guards */ }
  const newer = otherAgentSinceMyLastPost(messages);
  if (newer.length) {
    console.error('collab: NOTE -- the other agent posted ' + newer.length + ' comment(s) since your last message; confirm this post accounts for them:');
    for (const m of newer.slice(-3)) console.error('  [' + m.ts + '] ' + m.agent + ' ' + m.type + (m.task ? ' ' + m.task : '') + (m.msg ? ' -- ' + String(m.msg).replace(/\s+/g, ' ').slice(0, 180) : ''));
  }
  if (!FORCE_POST && isDuplicatePost(messages, payload.type, payload.task, payload.msg)) {
    console.error('collab: identical ' + payload.type + (payload.task ? ' ' + payload.task : '') + ' by ' + AGENT + ' within 10m already on the bus -- skipping (use --force to repost).');
    return null;
  }
  return post(payload);
}

// Local (uncommitted) per-agent read cursor for `poll --new`.
function cursorPath() { return path.join(os.tmpdir(), 'vihs-collab-cursor-' + AGENT + '.json'); }
function readCursor() { try { return JSON.parse(fs.readFileSync(cursorPath(), 'utf8')).lastTs || null; } catch { return null; } }
function writeCursor(ts) { try { fs.writeFileSync(cursorPath(), JSON.stringify({ lastTs: ts, updatedAt: new Date().toISOString() })); } catch { /* best effort */ } }

// Parallel-track coordination (issue #2392 follow-on): claim a DISJOINT file
// track, list live tracks + flag file collisions, and read the merge-queue
// co-batch window so both planes make parallel forward progress safely.
async function trackCommand(rest, a) {
  const tc = await import('./trackCoordination.mjs');
  const sub = rest[0] && !rest[0].startsWith('--') ? rest[0] : 'status';
  const splitFiles = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

  if (sub === 'claim') {
    const name = req(a, 'name');
    const files = splitFiles(a.files);
    if (!files.length) { console.error('track claim: --files "a,b,c" required — declare your DISJOINT file set (dir prefixes allowed: "src/git/**")'); process.exit(2); }
    const { messages } = readMessages(80);
    const claims = tc.parseTrackClaims(messages);
    const conflicts = tc.proposeCollisions(files, claims, { excludeTrack: name });
    if (conflicts.length) {
      console.error('CONFLICT: proposed files overlap ' + conflicts.length + ' live track(s) — the queue REBASES, so overlap = a red entry blocks the ALLGREEN group:');
      for (const c of conflicts) console.error('  track:' + c.track + ' [' + c.agent + ']  overlaps: ' + c.overlap.join(', '));
      console.error('Pick a disjoint file set or coordinate first (poll/handoff). Re-run with --force to claim anyway.');
      if (!FORCE_POST) { process.exit(3); }
    }
    const note = a.msg && a.msg !== true ? String(a.msg) : (a.issue && a.issue !== true ? 'issue #' + a.issue : 'parallel track');
    const r = cliPost({ type: 'CLAIM', task: 'track:' + name, msg: 'files=' + files.join(',') + ' | ' + note });
    if (r) console.log('claimed track:' + name + '  files=[' + files.join(', ') + ']  ' + r.comment.url);
    return;
  }

  if (sub === 'release') {
    const name = req(a, 'name');
    const r = cliPost({ type: 'DONE', task: 'track:' + name, ref: a.ref && a.ref !== true ? a.ref : undefined, msg: a.msg && a.msg !== true ? a.msg : 'track released' });
    if (r) console.log('released track:' + name + '  ' + r.comment.url);
    return;
  }

  if (sub === 'list') {
    const { messages } = readMessages(80);
    const claims = tc.parseTrackClaims(messages);
    const live = claims.filter((c) => c.live);
    console.log('# parallel tracks (' + live.length + ' live / ' + claims.length + ' total)');
    for (const c of claims) console.log('  ' + (c.live ? '[live]' : '[done]') + ' track:' + c.name + '  [' + c.agent + ']  files=[' + c.files.join(', ') + ']' + (c.note ? '  ' + c.note : '') + '  ' + c.ts);
    const collisions = tc.detectTrackCollisions(claims);
    if (collisions.length) {
      console.log('\n! COLLISIONS between live tracks (coordinate — a queue rebase will conflict):');
      for (const x of collisions) console.log('  track:' + x.a + ' [' + x.aAgent + '] <-> track:' + x.b + ' [' + x.bAgent + ']  overlap: ' + x.overlap.join(', '));
      process.exitCode = 3;
    } else if (live.length) {
      console.log('\nAll live tracks are file-disjoint — safe to parallelize.');
    }
    return;
  }

  if (sub === 'status') {
    // Read the develop merge-queue policy (best-effort) + open feature PRs, then
    // classify which PRs co-batch in the current ~9-min ALLGREEN window.
    let policy = { waitMinutes: 9, grouping: 'ALLGREEN', maxMerge: 15, maxBuild: 1, method: 'REBASE', source: 'default' };
    try {
      const rulesets = gh(['api', 'repos/' + OWNER + '/' + REPO + '/rulesets']);
      for (const rs of rulesets || []) {
        if (rs.target !== 'branch') continue;
        const full = gh(['api', 'repos/' + OWNER + '/' + REPO + '/rulesets/' + rs.id]);
        const mq = (full.rules || []).find((r) => r.type === 'merge_queue');
        if (mq && mq.parameters) {
          const p = mq.parameters;
          policy = { waitMinutes: p.min_entries_to_merge_wait_minutes, grouping: p.grouping_strategy, maxMerge: p.max_entries_to_merge, maxBuild: p.max_entries_to_build, method: p.merge_method, source: full.name || rs.id };
          break;
        }
      }
    } catch (e) { console.error('track status: could not read merge-queue policy (' + (e.message || e) + '); using defaults'); }

    let prs = [];
    try {
      const raw = gh(['pr', 'list', '--repo', OWNER + '/' + REPO, '--state', 'open', '--json', 'number,headRefName,mergeStateStatus,autoMergeRequest,author']);
      prs = (raw || [])
        .filter((p) => String(p.headRefName || '').startsWith('feature/'))
        .map((p) => ({ number: p.number, headRefName: p.headRefName, mergeStateStatus: p.mergeStateStatus, armed: p.autoMergeRequest != null, author: p.author && p.author.login }));
    } catch (e) { console.error('track status: could not read open PRs (' + (e.message || e) + ')'); }

    const out = tc.classifyCoBatch(prs, policy);
    console.log('# merge-queue co-batch (policy from ' + policy.source + '): wait~' + out.policy.waitMinutes + 'min  grouping=' + out.policy.grouping + '  maxMerge=' + out.policy.maxMerge + '  maxBuild=' + out.policy.maxBuild + '  method=' + out.policy.method);
    for (const r of out.rows) console.log('  #' + r.number + ' [' + (r.author || '?') + '] ' + r.head + '  ' + r.state + (r.armed ? ' armed' : '') + '  (mss via green=' + r.green + ')');
    console.log('co-batch NOW (armed+green): ' + (out.coBatchNow.length ? out.coBatchNow.map((n) => '#' + n).join(', ') : 'none') + '  | will follow (armed, still building): ' + (out.willFollow.length ? out.willFollow.map((n) => '#' + n).join(', ') : 'none'));
    console.log('note: armed reads can be transiently false for a PR already IN the queue; and maxBuild=1 serializes CI so a still-building PR will not join the current group.');
    return;
  }

  console.error('usage: track claim --name X --files a,b,c [--issue N] [--force] | track list | track status | track release --name X');
  process.exit(2);
}

// Agent gateway (issue #2392 follow-on): the SINGLE entry point the coordinator
// and its subagents share for (1) agent identification and (2) deterministic
// serialization of stateful ops via a lease/mutex under the shared git common
// dir (so it spans every worktree + the main clone on one machine).
function resolveGateDir() {
  let common = sh('git', ['rev-parse', '--git-common-dir']) || '.git';
  if (!path.isAbsolute(common)) common = path.resolve(process.cwd(), common);
  return path.join(common, 'vihs-gate');
}
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best effort */ } }

async function gateCommand(rest, a) {
  const gw = await import('./agentGateway.mjs');
  const sub = rest[0] && !rest[0].startsWith('--') ? rest[0] : 'status';
  const gateDir = resolveGateDir();
  const sa = gw.resolveSubagentId(process.env, { cwdBasename: path.basename(process.cwd()), pid: process.pid, repoBasename: 'vi-history-suite' });
  const identity = gw.formatIdentity(AGENT, sa.id);

  if (sub === 'whoami') {
    console.log('identity=' + identity + '  (plane=' + AGENT + ', lane=' + sa.id + ' via ' + sa.source + ')');
    console.log('gateDir=' + gateDir + '  (shared across all worktrees + the main clone)');
    return;
  }
  if (sub === 'acquire') {
    const resource = req(a, 'resource');
    const ttlSec = a.ttl && a.ttl !== true ? Number(a.ttl) : 300;
    const wait = Boolean(a.wait);
    const timeoutMs = (a.timeout && a.timeout !== true ? Number(a.timeout) : 120) * 1000;
    const start = Date.now();
    for (;;) {
      const r = gw.acquireLease(gateDir, resource, identity, { ttlSec });
      if (r.granted) {
        console.log('GRANTED ' + resource + ' -> ' + identity + '  token=' + r.token + (r.reclaimedFrom ? '  (reclaimed from ' + r.reclaimedFrom + ')' : ''));
        console.log('release with: node prototype/collab.mjs gate release --resource ' + resource + ' --token ' + r.token);
        return;
      }
      if (!wait || Date.now() - start > timeoutMs) {
        console.error('BUSY ' + resource + ' -- ' + gw.describeLease(r.holder) + (wait ? ' (wait timed out)' : ''));
        process.exit(3);
      }
      sleepSync(1000);
    }
  }
  if (sub === 'release') {
    const resource = req(a, 'resource');
    const token = req(a, 'token');
    const r = gw.releaseLease(gateDir, resource, token);
    if (r.released) { console.log('RELEASED ' + resource + ' by ' + identity); return; }
    console.error('NOT RELEASED ' + resource + ' -- ' + r.reason + (r.holder ? ' (held by ' + r.holder.owner + ')' : ''));
    process.exit(3);
  }
  if (sub === 'status') {
    if (a.resource && a.resource !== true) { console.log(gw.describeLease(gw.readLease(gateDir, String(a.resource)))); return; }
    const leases = gw.listLeases(gateDir);
    console.log('# gate leases (' + leases.length + ') @ ' + gateDir);
    for (const l of leases) console.log('  ' + gw.describeLease(l));
    if (!leases.length) console.log('  (none held -- gate is free)');
    return;
  }
  console.error('usage: gate whoami | gate acquire --resource R [--ttl N] [--wait] [--timeout S] | gate release --resource R --token T | gate status [--resource R]');
  process.exit(2);
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
  // P0: message from file/stdin (shell-quoting-proof) + fail-loud --ref + --force.
  if (cmd !== 'run') {
    const resolvedMsg = resolveMessageArg(a);
    if (resolvedMsg !== undefined) a.msg = resolvedMsg;
    if (a.ref && a.ref !== true) a.ref = validateRef(String(a.ref));
    FORCE_POST = Boolean(a.force);
  }

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
    // P1: --to-me (from the other agent, addressed to me or unaddressed),
    //     --unanswered (a QUESTION with no later ANSWER on the same task),
    //     --new (since the local read cursor), --tail N (last N after filters).
    if (a['to-me']) out = out.filter((m) => m.agent !== AGENT && (!m.to || m.to === AGENT));
    if (a.unanswered) out = out.filter((m) => m.type === 'QUESTION' && !messages.some((x) => x.type === 'ANSWER' && (x.task || '') === (m.task || '') && x.ts > m.ts));
    const cursor = a.new ? readCursor() : null;
    if (a.new && cursor) out = out.filter((m) => m.ts > cursor);
    if (a.tail && a.tail !== true) out = out.slice(-Number(a.tail));
    console.log('# ' + discussion.url + '  (' + out.length + ' message' + (out.length === 1 ? '' : 's') + (a.new && cursor ? ' since ' + cursor : '') + ')');
    for (const m of out) console.log(`[${m.ts}] ${m.agent} ${m.type}${m.task ? ' ' + m.task : ''}${m.ref ? ' @' + m.ref : ''}${m.msg ? ' — ' + m.msg : ''}`);
    if (a.new) { const maxTs = messages.reduce((mx, m) => (m.ts > mx ? m.ts : mx), cursor || ''); if (maxTs) writeCursor(maxTs); }
    return;
  }
  if (cmd === 'checkin') {
    await checkin(a);
    return;
  }
  if (cmd === 'whoami') {
    // Read-only agent-environment derivation (issue #2392). `--register` persists
    // the roster row (explicit self-registration); default is side-effect-free.
    const { deriveAgentEnvironment } = await import('./deriveAgentEnvironment.mjs');
    const d = deriveAgentEnvironment({ write: Boolean(a.register) });
    const { machineId, ...safe } = d; // never print the raw machineId (local-only)
    if (a.json) {
      console.log(JSON.stringify(safe, null, 2));
      return;
    }
    console.log(
      `teamName=${d.teamName} (via ${d.source.resolvedBy})  plane=${d.plane}  os=${d.osPlatform}/${d.arch}  host=${d.source.hostname}`
    );
    console.log(
      `machineIdHash=${d.machineIdHash}  labviewNative=${d.facets.labviewNative?.present}  ` +
        `docker=${d.capabilities.docker?.present}(${d.capabilities.docker?.osType})${a.register ? '  [registered]' : ''}`
    );
    return;
  }
  if (cmd === 'promote') {
    // Phase-2 mirror-mode `promote` verb (issue #2392): explicit prototype->develop
    // slice with a pre-promote validation gate BEFORE opening/arming. --dry-run
    // validates the orchestration + runs the real gate WITHOUT mutating git or gh.
    const { runPromote } = await import('./collabPromote.mjs');
    const dryRun = Boolean(a['dry-run']);
    const splitList = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : undefined);
    const spec = {
      issue: Number(a.issue),
      slug: a.slug === true ? undefined : a.slug,
      commits: splitList(a.commits),
      reconcileFiles: splitList(a['reconcile-files']),
      provenance: splitList(a.provenance),
      base: a.base && a.base !== true ? a.base : 'develop',
      summary: a.summary && a.summary !== true ? a.summary : undefined
    };
    let result;
    try {
      result = await runPromote(spec, buildPromoteDeps(dryRun));
    } catch (err) {
      console.error(`[promote] aborted: ${err && err.message ? err.message : err}`);
      process.exit(2);
    }
    const { pr, gate, ...rest } = result;
    console.log(JSON.stringify({ dryRun, ...rest, pr: pr ? { number: pr.number, url: pr.url } : undefined }, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  const SPECIAL = ['claim', 'ack', 'done', 'handoff', 'authorize', 'refine', 'post', 'propose', 'align', 'spawn-issue', 'resolve', 'ask', 'answer', 'status', 'board', 'ship', 'tasks', 'run', 'whoami', 'promote', 'track', 'gate'];
  if (!TYPES.has((cmd || '').toUpperCase()) && !SPECIAL.includes(cmd)) {
    console.error('usage: init | poll [--new|--to-me|--unanswered|--tail N] | whoami [--json|--register] | promote --issue N --slug X (--commits sha,.. | --reconcile-files f,.. --provenance sha,..) [--base develop] [--dry-run] | track claim --name X --files a,b,c [--issue N] | track list | track status | track release --name X | gate whoami | gate acquire --resource R [--ttl N] [--wait] | gate release --resource R --token T | gate status | checkin | tasks [--open] | ship --to X --task Y [--msg-file f] [--no-verify] | run --label X [--eta-min N] -- <cmd> | propose --title X | ask|answer --discussion N --msg X | align|status|resolve|spawn-issue --discussion N | post --type T [--discussion N] | claim|ack|done|handoff|authorize|refine ...\n  message input: --msg "..." | --msg-file <path> | --msg-stdin   (file/stdin avoid shell-quoting corruption)');
    process.exit(2);
  }

  if (cmd === 'propose') {
    const title = req(a, 'title');
    const resolution = ['close', 'issue', 'convert'].includes(a.resolution) ? a.resolution : 'issue';
    const refs = a.refs && a.refs !== true ? String(a.refs).split(',').map((s) => Number(s.trim())).filter((n) => n) : [];
    const bodyText = a['body-file'] && a['body-file'] !== true ? fs.readFileSync(a['body-file'], 'utf8') : (a.body && a.body !== true ? a.body : '');
    const parts = [];
    if (bodyText) parts.push(bodyText);
    if (refs.length) parts.push('\n**Consolidates issues:** ' + refs.map((n) => '#' + n).join(', '));
    if (a.acceptance) parts.push('\n**Acceptance:** ' + a.acceptance);
    parts.push('\n**On consensus:** ' + (resolution === 'close' ? 'close this discussion as RESOLVED (no issue)' : resolution === 'convert' ? 'convert into a consolidated issue' : 'spawn a tracking issue') + '. Both machines (WIN + LINUX) must align.');
    const d = createDiscussionIn(ITEM_CATEGORY, title, parts.join('\n') || title);
    postToDiscussion(d.number, { type: 'PROPOSE', task: a.task || 'work-item', resolution, refs, msg: a.msg || ('Proposed: ' + title) });
    console.log('proposed discussion #' + d.number + '  ' + d.url + '  (on consensus: ' + resolution + ')');
    return;
  }
  if (cmd === 'align') {
    const n = Number(req(a, 'discussion'));
    postToDiscussion(n, { type: 'ALIGN', task: a.task || 'work-item', msg: a.msg || undefined });
    const { messages } = readDiscussionMessages(n);
    const st = consensusState(messages);
    if (st.resolved) { console.log('aligned; already resolved (' + st.resolved.type + (st.resolved.ref ? ' ' + st.resolved.ref : '') + ')'); return; }
    if (st.decided) { console.log('consensus reached (' + st.by.join(' + ') + ') — applying resolution "' + st.resolution + '" autonomously...'); resolveDiscussion(n); return; }
    console.log('aligned; not yet decided (need the other machine to PROPOSE/ALIGN on discussion #' + n + ')');
    return;
  }
  if (cmd === 'spawn-issue') { spawnIssue(Number(req(a, 'discussion'))); return; }
  if (cmd === 'resolve') { resolveDiscussion(Number(req(a, 'discussion'))); return; }
  if (cmd === 'ask') { const r = postToDiscussion(Number(req(a, 'discussion')), { type: 'QUESTION', task: a.task || 'work-item', to: a.to || undefined, msg: req(a, 'msg') }); console.log('asked QUESTION on #' + a.discussion + '  ' + r.comment.url); return; }
  if (cmd === 'answer') { const r = postToDiscussion(Number(req(a, 'discussion')), { type: 'ANSWER', task: a.task || 'work-item', msg: req(a, 'msg') }); console.log('answered on #' + a.discussion + '  ' + r.comment.url); return; }
  if (cmd === 'status') {
    const n = Number(req(a, 'discussion'));
    const { messages } = readDiscussionMessages(n);
    const st = consensusState(messages);
    const questions = messages.filter((m) => m.type === 'QUESTION').length;
    const answers = messages.filter((m) => m.type === 'ANSWER').length;
    console.log('discussion #' + n + '  resolution=' + st.resolution + '  proposed=' + Boolean(st.propose) + '  aligns=' + JSON.stringify(st.aligns.map((x) => x.agent)) + '  decided=' + st.decided + (st.decided ? ' by ' + st.by.join('+') : '') + '  resolved=' + Boolean(st.resolved) + '  Q=' + questions + '  A=' + answers);
    console.log(st.decided ? 'ALIGNED — active development may begin.' : 'NOT ALIGNED — do not begin active development; align in the discussion first.');
    process.exitCode = st.decided ? 0 : 3;
    return;
  }
  if (cmd === 'board') { boardCommand(rest, a); return; }
  if (cmd === 'track') { await trackCommand(rest, a); return; }
  if (cmd === 'gate') { await gateCommand(rest, a); return; }

  if (cmd === 'ship') {
    // Encode publish-before-push atomically: assert clean + rebased -> publish
    // (citing HEAD) -> push -> confirm the ref landed on origin.
    const to = a.to && a.to !== true ? String(a.to) : (AGENT === 'WIN' ? 'LINUX' : 'WIN');
    const task = req(a, 'task');
    const type = a.type && a.type !== true ? String(a.type).toUpperCase() : 'HANDOFF';
    if (!['HANDOFF', 'DONE'].includes(type)) { console.error('ship: --type must be HANDOFF or DONE'); process.exit(2); }
    const dirty = sh('git', ['status', '--porcelain']);
    if (dirty === null) { console.error('ship: git status failed (not a repo?)'); process.exit(1); }
    if (dirty !== '') { console.error('ship: working tree is NOT clean — commit or stash first:\n' + dirty); process.exit(3); }
    sh('git', ['fetch', 'origin', BRANCH]);
    const behind = sh('git', ['rev-list', '--count', 'HEAD..origin/' + BRANCH]);
    if (behind === null) { console.error('ship: cannot compare to origin/' + BRANCH); process.exit(1); }
    if (Number(behind) > 0) { console.error('ship: local is BEHIND origin/' + BRANCH + ' by ' + behind + ' — rebase first: git rebase origin/' + BRANCH); process.exit(3); }
    const ahead = sh('git', ['rev-list', '--count', 'origin/' + BRANCH + '..HEAD']);
    if (Number(ahead) === 0) { console.error('ship: nothing to ship (HEAD == origin/' + BRANCH + ')'); process.exit(3); }
    const head = sh('git', ['rev-parse', 'HEAD']);
    const r = cliPost({ type, task, to, ref: head, msg: a.msg || undefined, next: a.next || undefined });
    if (r) console.log('ship: published ' + type + ' (publish-before-push) ' + r.comment.url);
    else console.log('ship: publish skipped as duplicate; proceeding to push ' + head.slice(0, 12));
    const pushArgs = ['push']; if (a['no-verify']) pushArgs.push('--no-verify'); pushArgs.push('origin', BRANCH);
    let pushed = true; let pushErr = '';
    try { execFileSync('git', pushArgs, { encoding: 'utf8', stdio: 'pipe', timeout: 300000 }); } catch (e) { pushed = false; pushErr = (e.stderr || e.stdout || e.message || '').toString(); }
    if (!pushed) { console.error('ship: git push FAILED (bus message already posted). If it is the advisory pre-push gate, re-run: git push --no-verify origin ' + BRANCH + '\n' + pushErr.slice(0, 600)); process.exit(1); }
    sh('git', ['fetch', 'origin', BRANCH]);
    const stillAhead = sh('git', ['rev-list', '--count', 'origin/' + BRANCH + '..HEAD']);
    console.log(Number(stillAhead) === 0 ? 'ship: pushed + CONFIRMED origin/' + BRANCH + ' @ ' + head.slice(0, 12) : 'ship: push returned ok but origin still behind — verify manually');
    return;
  }
  if (cmd === 'tasks') {
    const { discussion, messages } = readMessages(Number(a.limit) || 80);
    if (!discussion) { console.log('no bus discussion yet; run `node prototype/collab.mjs init`'); return; }
    const byTask = new Map();
    for (const m of messages) { const t = m.task || '(none)'; if (!byTask.has(t)) byTask.set(t, []); byTask.get(t).push(m); }
    const rows = [];
    for (const [task, msgs] of byTask) {
      msgs.sort((x, y) => (x.ts < y.ts ? -1 : 1));
      const last = msgs[msgs.length - 1];
      const lastRefMsg = [...msgs].reverse().find((m) => m.ref);
      const openQ = msgs.filter((m) => m.type === 'QUESTION' && !msgs.some((x) => x.type === 'ANSWER' && x.ts > m.ts)).length;
      const lastHandoff = [...msgs].reverse().find((m) => (m.type === 'HANDOFF' || m.type === 'AUTHORIZE') && m.to);
      const done = msgs.some((m) => m.type === 'DONE' || m.type === 'RESOLVED');
      const waitingOn = done ? '-' : (lastHandoff ? lastHandoff.to : last.agent);
      rows.push({ task, last: last.type, by: last.agent, ts: last.ts, waitingOn, openQ, ref: lastRefMsg ? String(lastRefMsg.ref) : '', done });
    }
    rows.sort((x, y) => (x.ts < y.ts ? 1 : -1));
    const show = a.open ? rows.filter((r) => !r.done) : rows;
    console.log('# tasks on ' + discussion.url + '  (' + show.length + ')');
    for (const r of show) console.log('  ' + (r.done ? '[done]' : '[open]') + ' ' + r.task + '  last=' + r.last + ' by ' + r.by + '  waitingOn=' + r.waitingOn + (r.openQ ? '  openQ=' + r.openQ : '') + (r.ref ? '  ref=' + r.ref.slice(0, 12) : '') + '  ' + r.ts);
    return;
  }
  if (cmd === 'run') {
    // File-per-cycle + ETA discipline in-tool: run a DIRECT executable (not a
    // shell one-liner), tee combined output to a stable file, stamp actual-vs-ETA.
    const dd = rest.indexOf('--');
    const flags = parseArgs(dd >= 0 ? rest.slice(0, dd) : rest);
    const argv = dd >= 0 ? rest.slice(dd + 1) : [];
    if (!argv.length) { console.error('usage: run --label X [--eta-min N] -- <command> [args...]   (direct executable, not a shell one-liner)'); process.exit(2); }
    const label = (flags.label && flags.label !== true ? String(flags.label) : 'run').replace(/[^a-z0-9._-]/gi, '-');
    const dir = path.join(os.tmpdir(), 'vihs-collab-run'); fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, label + '.out.txt'); const metaPath = path.join(dir, label + '.meta.json');
    const etaMin = flags['eta-min'] && flags['eta-min'] !== true ? Number(flags['eta-min']) : null;
    const start = new Date();
    console.log('run [' + label + '] start=' + start.toISOString() + (etaMin != null ? '  eta~' + new Date(start.getTime() + etaMin * 60000).toISOString() + ' (~' + etaMin + ' min)' : '') + '  out=' + outPath);
    const res = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const end = new Date(); const elapsedSec = Math.round((end - start) / 1000);
    fs.writeFileSync(outPath, (res.stdout || '') + (res.stderr || ''));
    const meta = { label, start: start.toISOString(), end: end.toISOString(), elapsedSec, exitCode: res.status, etaMin, etaAccuracy: etaMin != null ? { estimateSec: etaMin * 60, actualSec: elapsedSec, deltaSec: elapsedSec - etaMin * 60 } : null };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log('run [' + label + '] done exit=' + res.status + ' elapsed=' + elapsedSec + 's' + (etaMin != null ? ' (eta ' + (etaMin * 60) + 's, delta ' + (elapsedSec - etaMin * 60) + 's)' : '') + '  meta=' + metaPath);
    process.exit(typeof res.status === 'number' ? res.status : 0);
  }

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
    const r = cliPost({ type: 'CLAIM', task, msg: a.msg || undefined });
    if (r) console.log((otherClaim && !resolvedAfter ? 'posted CLAIM (CONFLICT — see above) ' : 'posted CLAIM ') + r.comment.url);
    return;
  }
  if (cmd === 'ack') { const r = cliPost({ type: 'ACK', task: req(a, 'task'), msg: a.msg || undefined }); if (r) console.log('posted ACK ' + r.comment.url); return; }
  if (cmd === 'done') { const r = cliPost({ type: 'DONE', task: req(a, 'task'), ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined }); if (r) console.log('posted DONE ' + r.comment.url); return; }
  if (cmd === 'handoff') { const r = cliPost({ type: 'HANDOFF', task: req(a, 'task'), to: a.to || undefined, ref: a.ref || undefined, msg: a.msg || undefined }); if (r) console.log('posted HANDOFF ' + r.comment.url); return; }
  if (cmd === 'authorize') { const r = cliPost({ type: 'AUTHORIZE', task: req(a, 'task'), to: a.to || 'LINUX', ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined }); if (r) console.log('posted AUTHORIZE ' + r.comment.url); return; }
  if (cmd === 'refine') { const r = cliPost({ type: 'REFINE', task: req(a, 'task'), ref: req(a, 'ref'), to: a.to || 'LINUX', msg: a.msg || undefined, next: a.next || undefined }); if (r) console.log('posted REFINE ' + r.comment.url); return; }
  if (cmd === 'post') {
    const type = req(a, 'type').toUpperCase();
    if (!TYPES.has(type)) { console.error('unknown --type ' + type + ' (valid: ' + [...TYPES].join(', ') + ')'); process.exit(2); }
    const payload = { type, task: a.task || undefined, ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined, to: a.to || undefined };
    const r = a.discussion && a.discussion !== true ? postToDiscussion(Number(a.discussion), payload) : cliPost(payload);
    if (r) console.log('posted ' + type + (a.discussion ? ' on #' + a.discussion : '') + '  ' + r.comment.url);
    return;
  }

  // generic post
  const type = cmd.toUpperCase();
  const r = cliPost({ type, task: a.task || undefined, ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined, to: a.to || undefined });
  if (r) console.log('posted ' + type + ' ' + r.comment.url);
}

function req(a, key) {
  if (!a[key] || a[key] === true) { console.error('missing --' + key); process.exit(2); }
  return String(a[key]);
}

/** Builds the real git/gh side-effect deps for the `promote` verb (issue #2392).
 *  In --dry-run every MUTATION is skipped + logged; the read-only branch-collision
 *  check and the validation GATE (npm run check) still run so the plan is real. */
function buildPromoteDeps(dryRun) {
  const sh = (bin, args) => spawnSync(bin, args, { encoding: 'utf8' });
  const log = (m) => console.error(`[promote]${dryRun ? ' (dry-run)' : ''} ${m}`);
  return {
    log,
    git: {
      branchExists: (b) => {
        const local = sh('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]).status === 0;
        const remote = String(sh('git', ['ls-remote', '--heads', 'origin', b]).stdout || '').trim().length > 0;
        return local || remote;
      },
      createBranch: (b, base) => {
        if (dryRun) return log(`would create ${b} off origin/${base}`);
        const r = sh('git', ['checkout', '-b', b, `origin/${base}`]);
        if (r.status !== 0) throw new Error(`createBranch failed: ${r.stderr}`);
      },
      applyCommits: (shas) => {
        if (dryRun) return log(`would cherry-pick ${shas.join(' ')}`);
        const r = sh('git', ['cherry-pick', ...shas]);
        if (r.status !== 0) throw new Error(`cherry-pick failed: ${r.stderr}`);
      },
      applyReconcile: (files) => {
        if (dryRun) return log(`would apply reconciled file-set: ${files.join(', ')}`);
        throw new Error('reconcile apply is not implemented in the prototype driver (use --dry-run to preview)');
      },
      push: (b) => {
        if (dryRun) return log(`would push ${b} to origin`);
        const r = sh('git', ['push', '-u', 'origin', b]);
        if (r.status !== 0) throw new Error(`push failed: ${r.stderr}`);
      }
    },
    runGate: ({ mode }) => {
      log(`running pre-promote gate (mode=${mode}): npm run check`);
      // Node 20+/24 on Windows refuses to spawn a `.cmd` (npm.cmd) without a shell
      // (EINVAL), so run the gate through a shell as a single command string. Found via
      // the promote --dry-run experiment (a spawn error had looked like a gate failure).
      const r = spawnSync('npm run --silent check', { encoding: 'utf8', shell: true });
      if (r.error) log(`gate spawn error: ${r.error.message}`);
      const ok = r.status === 0;
      if (!ok) log(`gate FAILED (tail):\n${String(r.stdout || '').slice(-1500)}\n${String(r.stderr || '').slice(-1500)}`);
      return { ok, summary: ok ? 'check green' : 'check FAILED' };
    },
    openPr: (opts) => {
      if (dryRun) {
        log(`would open PR base=${opts.base} head=${opts.head} title="${opts.title}"\n--- PR body ---\n${opts.body}\n---------------`);
        return { number: 0, url: '(dry-run: not opened)' };
      }
      const r = sh('gh', ['pr', 'create', '--repo', `${OWNER}/${REPO}`, '--base', opts.base, '--head', opts.head, '--title', opts.title, '--body', opts.body]);
      if (r.status !== 0) throw new Error(`gh pr create failed: ${r.stderr}`);
      const url = String(r.stdout).trim();
      return { number: Number((url.match(/\/pull\/(\d+)/) || [])[1]) || 0, url };
    },
    arm: (n) => {
      if (dryRun) return log(`would arm auto-merge --rebase on PR #${n} (develop queue owns the strategy)`);
      const r = sh('gh', ['pr', 'merge', String(n), '--auto', '--rebase']);
      if (r.status !== 0) throw new Error(`gh pr merge failed: ${r.stderr}`);
    }
  };
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
