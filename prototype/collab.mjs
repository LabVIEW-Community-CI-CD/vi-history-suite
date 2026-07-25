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

const OWNER = process.env.VIHS_COLLAB_OWNER || 'LabVIEW-Community-CI-CD';
const REPO = process.env.VIHS_COLLAB_REPO || 'vi-history-suite';
const CATEGORY = process.env.VIHS_COLLAB_CATEGORY || 'General';
const TITLE = process.env.VIHS_COLLAB_TITLE || 'Prototype handshake: Ollama × MCP × docker-linux (Windows↔Linux collab)';
const AGENT = (process.env.VIHS_COLLAB_AGENT || (process.platform === 'win32' ? 'WIN' : 'LINUX')).toUpperCase();
const BRANCH = 'prototype/ollama-mcp-linux-collab';
const SCHEMA = 'vihs-collab-msg@v1';
const TYPES = new Set(['CLAIM', 'ACK', 'PROGRESS', 'DONE', 'BLOCKED', 'HANDOFF', 'QUESTION', 'ANSWER', 'NOTE']);

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

function resolveContext() {
  const q = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id discussionCategories(first:30){nodes{id name}}}}';
  const r = gql(q, [['owner', OWNER], ['name', REPO]]);
  const repo = r.data.repository;
  const cat = (repo.discussionCategories.nodes || []).find((c) => c.name.toLowerCase() === CATEGORY.toLowerCase());
  if (!cat) throw new Error(`discussion category "${CATEGORY}" not found`);
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

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest);
  if (a.agent && cmd !== 'poll') { /* agent override only meaningful for poll filter */ }

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
  if (!TYPES.has((cmd || '').toUpperCase()) && !['claim', 'ack', 'done', 'handoff'].includes(cmd)) {
    console.error('usage: init | poll | post --type T --task X | claim|ack|done|handoff --task X ...');
    process.exit(2);
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
    const r = post({ type: 'CLAIM', task, msg: a.msg || undefined });
    console.log((otherClaim && !resolvedAfter ? 'posted CLAIM (CONFLICT — see above) ' : 'posted CLAIM ') + r.comment.url);
    return;
  }
  if (cmd === 'ack') { const r = post({ type: 'ACK', task: req(a, 'task'), msg: a.msg || undefined }); console.log('posted ACK ' + r.comment.url); return; }
  if (cmd === 'done') { const r = post({ type: 'DONE', task: req(a, 'task'), ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined }); console.log('posted DONE ' + r.comment.url); return; }
  if (cmd === 'handoff') { const r = post({ type: 'HANDOFF', task: req(a, 'task'), to: a.to || undefined, ref: a.ref || undefined, msg: a.msg || undefined }); console.log('posted HANDOFF ' + r.comment.url); return; }

  // generic post
  const type = cmd.toUpperCase();
  const r = post({ type, task: a.task || undefined, ref: a.ref || undefined, msg: a.msg || undefined, next: a.next || undefined, to: a.to || undefined });
  console.log('posted ' + type + ' ' + r.comment.url);
}

function req(a, key) {
  if (!a[key] || a[key] === true) { console.error('missing --' + key); process.exit(2); }
  return String(a[key]);
}

main();
