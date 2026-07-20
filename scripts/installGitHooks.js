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

module.exports = { HOOKS_PATH, installGitHooks };

if (require.main === module) {
  const result = installGitHooks();
  if (result.action === 'set') {
    process.stdout.write(`[install-git-hooks] core.hooksPath set to ${HOOKS_PATH}\n`);
  } else if (result.action === 'already-set') {
    process.stdout.write(`[install-git-hooks] core.hooksPath already ${HOOKS_PATH}\n`);
  } else if (result.action === 'skipped') {
    process.stdout.write(`[install-git-hooks] skipped (${result.reason})\n`);
  } else {
    process.stderr.write(`[install-git-hooks] could not set core.hooksPath (${result.reason}); run 'npm run hooks:install'\n`);
  }
  // Never fail the install lifecycle on hook enablement.
  process.exit(0);
}
