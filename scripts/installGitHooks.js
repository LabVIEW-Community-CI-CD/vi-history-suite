#!/usr/bin/env node

'use strict';

// VHS-REQ-697: idempotently enable the repository git hooks by pointing
// core.hooksPath at .githooks. Wired as the npm `prepare` lifecycle script so a
// fresh clone/install auto-enables the agent-environment-consistency hooks
// without a manual step. Safe/idempotent:
//   - no-ops when core.hooksPath is already .githooks;
//   - warns and exits 0 (never fails an install) when not inside a git work-tree
//     (e.g. a published tarball install) or when git is unavailable.

const { spawnSync } = require('node:child_process');

const HOOKS_PATH = '.githooks';

function runGit(args, deps = {}) {
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  return spawnSyncImpl('git', args, { encoding: 'utf8' });
}

// Returns a result describing what happened, for testability.
function installGitHooks(deps = {}) {
  const insideWorkTree = runGit(['rev-parse', '--is-inside-work-tree'], deps);
  if (insideWorkTree.error || (typeof insideWorkTree.status === 'number' && insideWorkTree.status !== 0)) {
    return { action: 'skipped', reason: 'not-a-git-work-tree' };
  }
  const current = runGit(['config', '--get', 'core.hooksPath'], deps);
  const currentValue = String(current.stdout || '').trim();
  if (currentValue === HOOKS_PATH) {
    return { action: 'already-set', hooksPath: HOOKS_PATH };
  }
  const set = runGit(['config', 'core.hooksPath', HOOKS_PATH], deps);
  if (set.error || (typeof set.status === 'number' && set.status !== 0)) {
    return { action: 'failed', reason: String(set.stderr || set.error || 'git config failed') };
  }
  return { action: 'set', hooksPath: HOOKS_PATH, previous: currentValue || undefined };
}

// Thin CLI reporter: run the installer and emit a one-line status. Extracted from
// the require.main block so its reporting/exit branches are unit-testable with an
// injected installer/streams/exit (no real git subprocess). Behavior is unchanged.
function main(deps = {}) {
  const install = deps.installGitHooks || installGitHooks;
  const out = deps.stdout || process.stdout;
  const err = deps.stderr || process.stderr;
  const exit = deps.exit || process.exit;
  const result = install(deps);
  if (result.action === 'set') {
    out.write(`[install-git-hooks] core.hooksPath set to ${HOOKS_PATH}\n`);
  } else if (result.action === 'already-set') {
    out.write(`[install-git-hooks] core.hooksPath already ${HOOKS_PATH}\n`);
  } else if (result.action === 'skipped') {
    out.write(`[install-git-hooks] skipped (${result.reason})\n`);
  } else {
    err.write(`[install-git-hooks] could not set core.hooksPath (${result.reason}); run 'npm run hooks:install'\n`);
  }
  // Never fail the install lifecycle on hook enablement.
  exit(0);
  return result;
}

module.exports = { HOOKS_PATH, installGitHooks, main };

if (require.main === module) {
  main();
}
