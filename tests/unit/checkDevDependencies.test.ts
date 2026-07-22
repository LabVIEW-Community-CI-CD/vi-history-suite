import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const devDeps = require('../../scripts/checkDevDependencies.js');

const { inspectDevDependencies, formatRemediationMessage, main } = devDeps;

// path.join keeps fixtures separator-agnostic: the test and the script derive
// the same absolute strings from the same path module on any host OS.
const FIXTURE_CWD = path.join(path.sep, 'repo');
const NODE_MODULES = path.join(FIXTURE_CWD, 'node_modules');
const TYPESCRIPT_PKG = path.join(NODE_MODULES, 'typescript', 'package.json');

function existsSyncFor(presentPaths: Set<string>) {
  return (candidate: string): boolean => presentPaths.has(candidate);
}

function collectStderr() {
  const writes: string[] = [];
  return {
    writes,
    stderr: {
      write: (chunk: string): boolean => {
        writes.push(chunk);
        return true;
      }
    }
  };
}

describe('checkDevDependencies dev-loop preflight', () => {
  it('reports satisfied when node_modules and the typescript package are present', () => {
    const inspection = inspectDevDependencies({
      cwd: FIXTURE_CWD,
      existsSync: existsSyncFor(new Set([NODE_MODULES, TYPESCRIPT_PKG]))
    });

    expect(inspection.satisfied).toBe(true);
    expect(inspection.missing).toEqual([]);
  });

  it('flags a missing node_modules directory (fresh clone or wiped modules)', () => {
    const inspection = inspectDevDependencies({
      cwd: FIXTURE_CWD,
      existsSync: existsSyncFor(new Set<string>())
    });

    expect(inspection.satisfied).toBe(false);
    const missingIds = inspection.missing.map((item: { id: string }) => item.id);
    expect(missingIds).toContain('node_modules');
    expect(missingIds).toContain('typescript');
  });

  it('flags an omit-dev install where node_modules exists but typescript does not', () => {
    const inspection = inspectDevDependencies({
      cwd: FIXTURE_CWD,
      existsSync: existsSyncFor(new Set([NODE_MODULES]))
    });

    expect(inspection.satisfied).toBe(false);
    const missingIds = inspection.missing.map((item: { id: string }) => item.id);
    expect(missingIds).toEqual(['typescript']);
  });

  it('remediation message names the npm ci remedy and omit-dev guidance', () => {
    const inspection = inspectDevDependencies({
      cwd: FIXTURE_CWD,
      existsSync: existsSyncFor(new Set<string>())
    });

    const message = formatRemediationMessage(inspection);
    expect(message).toContain('npm ci');
    expect(message).toContain('npm_config_omit');
    expect(message).toContain('node_modules directory');
  });

  it('main returns 0 and stays silent when dependencies are satisfied', () => {
    const { writes, stderr } = collectStderr();

    const code = main({
      cwd: FIXTURE_CWD,
      existsSync: existsSyncFor(new Set([NODE_MODULES, TYPESCRIPT_PKG])),
      stderr
    });

    expect(code).toBe(0);
    expect(writes).toEqual([]);
  });

  it('main returns 1 and writes the remediation message when dependencies are missing', () => {
    const { writes, stderr } = collectStderr();

    const code = main({
      cwd: FIXTURE_CWD,
      existsSync: existsSyncFor(new Set<string>()),
      stderr
    });

    expect(code).toBe(1);
    expect(writes.join('')).toContain('npm ci');
  });
});

describe('checkDevDependencies default collaborators', () => {
  it('defaults cwd to the repo root and stderr to process.stderr when they are omitted', () => {
    // No cwd and no stderr: exercises the `deps.cwd ?? repoRoot` and
    // `deps.stderr ?? process.stderr` fallbacks. The injected existsSync keeps it
    // deterministic and satisfied so nothing is written to the real process.stderr.
    const code = main({ existsSync: () => true });
    expect(code).toBe(0);
  });

  it('uses the real fs.existsSync when no existsSync is injected', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-devdeps-'));
    try {
      const inspection = inspectDevDependencies({ cwd: tmpDir });
      // A bare temp dir has no node_modules, so the real fs reports both missing.
      expect(inspection.satisfied).toBe(false);
      expect(inspection.missing.map((item: { id: string }) => item.id)).toContain('node_modules');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to the raw target path when a missing check path equals the cwd', () => {
    const same = path.join(path.sep, 'x');
    // path.relative(same, same) === '' so the `|| item.targetPath` fallback renders.
    const message = formatRemediationMessage({
      cwd: same,
      missing: [{ id: 'node_modules', label: 'node_modules directory', targetPath: same }]
    });
    expect(message).toContain(same);
  });
});
