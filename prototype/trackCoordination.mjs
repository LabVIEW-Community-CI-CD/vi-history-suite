// prototype/trackCoordination.mjs
//
// Parallel-track coordination for the two-plane merge-queue workflow (design
// source; graduates to scripts/ as a CJS port if we keep it, mirroring
// deriveAgentEnvironment / branchFlowEnforce / collabPromote).
//
// Problem: develop uses a merge queue (min_entries_to_merge_wait_minutes ~= 9,
// grouping ALLGREEN, max_entries_to_merge 15, REBASE, max_entries_to_build 1).
// A lone armed PR still waits the whole window; PRs armed + green within the
// same window co-batch and merge as one ALLGREEN group. To parallelize safely
// each plane runs a DISJOINT file "track" -- because the queue REBASES, two
// PRs that touch the same file collide (a red entry blocks the whole group).
//
// This module is PURE (no I/O): the bus/gh reads live in collab.mjs and are
// injected. Everything here is deterministic + unit-testable.

/** Normalize a declared track path entry into a matcher.
 *  - "dir/**" or "dir/"  -> directory prefix (covers everything under it)
 *  - "path/to/file.ts"    -> exact file
 */
export function normalizeTrackFile(entry) {
  const raw = String(entry || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.endsWith('/**')) {
    const prefix = raw.slice(0, -3).replace(/\/+$/, '') + '/';
    return { raw, kind: 'dir', prefix };
  }
  if (raw.endsWith('/')) {
    return { raw, kind: 'dir', prefix: raw };
  }
  return { raw, kind: 'file', path: raw };
}

function entriesOverlap(x, y) {
  if (!x || !y) return false;
  if (x.kind === 'file' && y.kind === 'file') return x.path === y.path;
  if (x.kind === 'dir' && y.kind === 'file') return y.path === x.prefix.slice(0, -1) || y.path.startsWith(x.prefix);
  if (x.kind === 'file' && y.kind === 'dir') return entriesOverlap(y, x);
  // both dirs: nested or equal
  return x.prefix.startsWith(y.prefix) || y.prefix.startsWith(x.prefix);
}

/** Return the human-readable overlaps between two declared file sets (empty = disjoint). */
export function filesOverlap(filesA, filesB) {
  const A = (filesA || []).map(normalizeTrackFile).filter(Boolean);
  const B = (filesB || []).map(normalizeTrackFile).filter(Boolean);
  const hits = [];
  for (const x of A) {
    for (const y of B) {
      if (entriesOverlap(x, y)) hits.push(x.raw === y.raw ? x.raw : `${x.raw} <-> ${y.raw}`);
    }
  }
  return [...new Set(hits)];
}

/** Parse a track CLAIM message body: "files=a,b,c | free note" -> {files, note}. */
export function parseTrackFiles(msg) {
  const s = String(msg || '');
  const m = /files=([^|]*)/i.exec(s);
  const files = m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  const note = s.replace(/files=[^|]*\|?/i, '').trim();
  return { files, note };
}

const CLOSE_TYPES = new Set(['DONE', 'RESOLVED', 'BLOCKED']);

/** Reduce bus messages to track lifecycle state.
 *  A track is task === "track:<name>"; a CLAIM opens it, a DONE/RESOLVED/BLOCKED
 *  on the same task closes it. Returns [{name, task, agent, files, note, ts, live}]. */
export function parseTrackClaims(messages) {
  const byTask = new Map();
  for (const m of messages || []) {
    const task = m.task || '';
    if (!task.startsWith('track:')) continue;
    if (!byTask.has(task)) byTask.set(task, []);
    byTask.get(task).push(m);
  }
  const out = [];
  for (const [task, msgs] of byTask) {
    msgs.sort((x, y) => (x.ts < y.ts ? -1 : 1));
    const lastClaim = [...msgs].reverse().find((m) => m.type === 'CLAIM');
    if (!lastClaim) continue;
    const closedAfter = msgs.some((m) => m.ts > lastClaim.ts && CLOSE_TYPES.has(m.type));
    const { files, note } = parseTrackFiles(lastClaim.msg);
    out.push({
      name: task.slice('track:'.length),
      task,
      agent: lastClaim.agent,
      files,
      note,
      ts: lastClaim.ts,
      live: !closedAfter
    });
  }
  out.sort((x, y) => (x.ts < y.ts ? 1 : -1));
  return out;
}

/** Among LIVE track claims, find pairwise file collisions (different owners). */
export function detectTrackCollisions(claims) {
  const live = (claims || []).filter((c) => c.live);
  const collisions = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      const overlap = filesOverlap(a.files, b.files);
      if (overlap.length) collisions.push({ a: a.name, aAgent: a.agent, b: b.name, bAgent: b.agent, overlap });
    }
  }
  return collisions;
}

/** Check a PROPOSED file set against existing live claims (used before claiming). */
export function proposeCollisions(proposedFiles, claims, { excludeAgent } = {}) {
  const live = (claims || []).filter((c) => c.live && (!excludeAgent || c.agent !== excludeAgent));
  const collisions = [];
  for (const c of live) {
    const overlap = filesOverlap(proposedFiles, c.files);
    if (overlap.length) collisions.push({ track: c.name, agent: c.agent, overlap });
  }
  return collisions;
}

/** Classify open feature PRs against the merge-queue policy for a co-batch readout.
 *  prs: [{number, headRefName, armed, mergeStateStatus, author}]
 *  policy: {waitMinutes, grouping, maxMerge, maxBuild, method} */
export function classifyCoBatch(prs, policy = {}) {
  const rows = (prs || []).map((p) => {
    const green = p.mergeStateStatus === 'CLEAN';
    const state = !p.armed ? 'unarmed' : green ? 'ready' : 'building';
    return { number: p.number, head: p.headRefName, author: p.author, armed: Boolean(p.armed), green, state };
  });
  const ready = rows.filter((r) => r.state === 'ready');
  const building = rows.filter((r) => r.state === 'building');
  const unarmed = rows.filter((r) => r.state === 'unarmed');
  return {
    policy: {
      waitMinutes: policy.waitMinutes ?? null,
      grouping: policy.grouping ?? null,
      maxMerge: policy.maxMerge ?? null,
      maxBuild: policy.maxBuild ?? null,
      method: policy.method ?? null
    },
    rows,
    counts: { total: rows.length, ready: ready.length, building: building.length, unarmed: unarmed.length },
    // ready PRs (armed + green) co-batch in the current window; building ones
    // won't join the current group (max_entries_to_build=1 serializes CI).
    coBatchNow: ready.map((r) => r.number),
    willFollow: building.map((r) => r.number)
  };
}
