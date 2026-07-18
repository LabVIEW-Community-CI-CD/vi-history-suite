#!/usr/bin/env node

/**
 * Contributor dev-loop dependency preflight (dev-only tooling).
 *
 * Converts the cryptic first-run failure
 *   Windows: 'tsc' is not recognized as an internal or external command
 *   POSIX:   tsc: command not found
 * — emitted when `npm run compile`, `npm run check`, or the F5 "npm: compile"
 * preLaunchTask runs against a missing or partial node_modules (fresh clone,
 * wiped node_modules, or an omit-dev install) — into a single actionable
 * message that names the exact remedy (`npm ci`).
 *
 * Wired as the `precompile` and `precheck` npm hooks so it runs at the precise
 * point the raw `tsc` invocation would otherwise fail opaquely, and exposed as
 * `npm run deps:check` for manual use. It is dependency-free pure Node so it
 * works even when node_modules is entirely absent, and every collaborator is
 * injectable for deterministic unit tests.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

/**
 * Inspect whether the local TypeScript toolchain the compile/check scripts
 * depend on is installed. Blocks only on authoritative "dependencies not
 * installed" signals (node_modules absent, or the pinned typescript package
 * unresolvable) so a working install is never falsely blocked.
 *
 * @param {{ cwd?: string, existsSync?: (candidate: string) => boolean }} [deps]
 * @returns {{ cwd: string, satisfied: boolean, missing: Array<{ id: string, label: string, targetPath: string }>, checks: Array<{ id: string, label: string, targetPath: string }> }}
 */
function inspectDevDependencies(deps = {}) {
  const cwd = deps.cwd ?? repoRoot;
  const existsSync = deps.existsSync ?? fs.existsSync;

  const nodeModulesDir = path.join(cwd, 'node_modules');
  const typescriptPackageJson = path.join(nodeModulesDir, 'typescript', 'package.json');

  const checks = [
    { id: 'node_modules', label: 'node_modules directory', targetPath: nodeModulesDir },
    { id: 'typescript', label: 'typescript package (local tsc)', targetPath: typescriptPackageJson }
  ];

  const missing = checks.filter((check) => !existsSync(check.targetPath));
  return { cwd, satisfied: missing.length === 0, missing, checks };
}

/**
 * Build the actionable remediation message for a failed inspection.
 *
 * @param {ReturnType<typeof inspectDevDependencies>} inspection
 * @returns {string}
 */
function formatRemediationMessage(inspection) {
  const lines = [
    "[dev-deps] Local development dependencies are missing or incomplete, so 'tsc'",
    'cannot be found and the build cannot run.',
    '',
    'Missing:'
  ];
  for (const item of inspection.missing) {
    const relative = path.relative(inspection.cwd, item.targetPath) || item.targetPath;
    lines.push(`  - ${item.label} (${relative})`);
  }
  lines.push(
    '',
    'Install dependencies from the repository root, then re-run your command',
    '(npm run compile / npm run check / F5):',
    '',
    '  npm ci',
    '',
    'If npm ci still does not restore typescript, confirm dev dependencies are not',
    'being omitted (NODE_ENV and npm_config_omit must not be set to "dev" or',
    '"production").'
  );
  return lines.join('\n');
}

/**
 * Thin CLI entrypoint. Returns a process exit code and stays silent on success
 * so it adds no noise to normal build output.
 *
 * @param {{ cwd?: string, existsSync?: (candidate: string) => boolean, stderr?: { write: (chunk: string) => unknown } }} [deps]
 * @returns {number}
 */
function main(deps = {}) {
  const stderr = deps.stderr ?? process.stderr;
  const inspection = inspectDevDependencies(deps);
  if (inspection.satisfied) {
    return 0;
  }
  stderr.write(`${formatRemediationMessage(inspection)}\n`);
  return 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { inspectDevDependencies, formatRemediationMessage, main };
