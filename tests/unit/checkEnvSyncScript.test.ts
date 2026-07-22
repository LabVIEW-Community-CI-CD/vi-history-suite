import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// VHS-REQ-697: agent-environment-consistency gate. Deterministic unit coverage of
// the pure evaluation and the injectable collectors/recorder — no real fs, no git.

const {
  INSTALLED_LOCK_HASH_MARKER,
  evaluateEnvSync,
  computeLockHash,
  readInstalledLockHash,
  recordInstalledLockHash,
  collectEnvFacts,
  renderReport,
  run
} = require('../../scripts/checkEnvSync.js') as {
  INSTALLED_LOCK_HASH_MARKER: string;
  evaluateEnvSync: (facts: Record<string, unknown>) => { problems: Array<Record<string, unknown>>; hardStale: boolean };
  computeLockHash: (repoRoot: string, deps?: Record<string, unknown>) => string | undefined;
  readInstalledLockHash: (repoRoot: string, deps?: Record<string, unknown>) => string | undefined;
  recordInstalledLockHash: (repoRoot: string, deps?: Record<string, unknown>) => Record<string, unknown>;
  collectEnvFacts: (options: Record<string, unknown>, deps?: Record<string, unknown>) => Record<string, unknown>;
  renderReport: (result: Record<string, unknown>, ctx: Record<string, unknown>) => string[];
  run: (argv: string[], deps?: Record<string, unknown>) => { exitCode: number; stdout?: string };
};

const tempRoots: string[] = [];

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('checkEnvSync: evaluateEnvSync (VHS-REQ-697.1)', () => {
  it('is in sync when the lock hash matches, out is present, and nothing changed', () => {
    const r = evaluateEnvSync({ lockHashMatches: true, outPresent: true, sourcesChanged: false, requirementsChanged: false });
    expect(r.problems).toEqual([]);
    expect(r.hardStale).toBe(false);
  });

  it('flags node_modules stale as HARD when the marker is missing', () => {
    const r = evaluateEnvSync({ lockHashMatches: undefined, outPresent: true });
    expect(r.hardStale).toBe(true);
    expect(r.problems.find((p) => p.id === 'node-modules-stale')).toMatchObject({ hard: true, remedy: 'npm ci' });
  });

  it('flags node_modules stale as HARD when the lock hash mismatches', () => {
    const r = evaluateEnvSync({ lockHashMatches: false, outPresent: true });
    expect(r.hardStale).toBe(true);
  });

  it('treats out/ missing and sources-changed as ADVISORY (not hard)', () => {
    const missing = evaluateEnvSync({ lockHashMatches: true, outPresent: false });
    expect(missing.hardStale).toBe(false);
    expect(missing.problems.find((p) => p.id === 'out-stale')).toMatchObject({ hard: false });

    const changed = evaluateEnvSync({ lockHashMatches: true, outPresent: true, sourcesChanged: true });
    expect(changed.hardStale).toBe(false);
    expect(changed.problems.find((p) => p.id === 'out-stale')).toBeDefined();
  });

  it('treats requirements-changed as ADVISORY', () => {
    const r = evaluateEnvSync({ lockHashMatches: true, outPresent: true, requirementsChanged: true });
    expect(r.hardStale).toBe(false);
    expect(r.problems.find((p) => p.id === 'requirements-changed')).toMatchObject({ hard: false });
  });
});

describe('checkEnvSync: hash marker (VHS-REQ-697.2)', () => {
  const files: Record<string, string> = {
    '/repo/package-lock.json': '{"lockfileVersion":3}'
  };
  const deps = {
    readFileSync: (p: string) => {
      const key = String(p).replace(/\\/g, '/');
      if (key in files) return Buffer.from(files[key]);
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw err;
    },
    existsSync: (p: string) => {
      const k = String(p).replace(/\\/g, '/');
      return k === '/repo/node_modules' || k === '/repo/out';
    },
    writeFileSync: (p: string, content: string) => {
      files[String(p).replace(/\\/g, '/')] = content;
    }
  };

  it('computes a stable sha256 of the lockfile', () => {
    const h = computeLockHash('/repo', deps);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records the marker and a later collect reports in-sync', () => {
    const rec = recordInstalledLockHash('/repo', deps);
    expect(rec).toMatchObject({ action: 'recorded' });
    const facts = collectEnvFacts({ repoRoot: '/repo' }, deps);
    expect(facts.lockHashMatches).toBe(true);
    expect(facts.outPresent).toBe(true);
  });

  it('reports lockHashMatches=false when the lockfile changes after recording', () => {
    files['/repo/package-lock.json'] = '{"lockfileVersion":3,"changed":true}';
    const facts = collectEnvFacts({ repoRoot: '/repo' }, deps);
    expect(facts.lockHashMatches).toBe(false);
  });

  it('skips recording when node_modules is absent', () => {
    const noNodeModules = { ...deps, existsSync: () => false };
    expect(recordInstalledLockHash('/repo', noNodeModules)).toMatchObject({ action: 'skipped', reason: 'no-node-modules' });
  });

  it('reports lockHashMatches=undefined (hard) when the marker is missing', () => {
    const noMarker = {
      ...deps,
      readFileSync: (p: string) => {
        const key = String(p).replace(/\\/g, '/');
        if (key === '/repo/package-lock.json') return Buffer.from('{"lockfileVersion":3}');
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
    };
    const facts = collectEnvFacts({ repoRoot: '/repo' }, noMarker);
    expect(facts.lockHashMatches).toBeUndefined();
  });
});

describe('checkEnvSync: run (VHS-REQ-697.3)', () => {
  const inSyncDeps = {
    repoRoot: '/repo',
    readFileSync: (p: string) => {
      const key = String(p).replace(/\\/g, '/');
      if (key === '/repo/package-lock.json') return Buffer.from('{"lockfileVersion":3}');
      if (key.endsWith('.vihs-installed-lock-hash')) return computeLockHash('/repo', { readFileSync: () => Buffer.from('{"lockfileVersion":3}') }) as string;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    existsSync: () => true
  };

  it('--enforce exits 0 when in sync', () => {
    const out = run(['--enforce', '--label', 't'], inSyncDeps);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('environment is in sync');
  });

  it('--enforce exits 1 when node_modules is hard-stale (marker missing)', () => {
    const staleDeps = {
      repoRoot: '/repo',
      readFileSync: (p: string) => {
        if (String(p).replace(/\\/g, '/') === '/repo/package-lock.json') return Buffer.from('{"lockfileVersion":3}');
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      existsSync: (p: string) => String(p).replace(/\\/g, '/') === '/repo/out'
    };
    const out = run(['--enforce', '--label', 't'], staleDeps);
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toContain('BLOCKING');
    expect(out.stdout).toContain('npm ci');
  });

  it('--report never fails even when hard-stale', () => {
    const staleDeps = {
      repoRoot: '/repo',
      readFileSync: (p: string) => {
        if (String(p).replace(/\\/g, '/') === '/repo/package-lock.json') return Buffer.from('{"lockfileVersion":3}');
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      existsSync: () => false
    };
    const out = run(['--report'], staleDeps);
    expect(out.exitCode).toBe(0);
  });

  it('--record-lock-hash exits 0', () => {
    const captured: Record<string, string> = {};
    const recDeps = {
      repoRoot: '/repo',
      readFileSync: (p: string) => {
        if (String(p).replace(/\\/g, '/') === '/repo/package-lock.json') return Buffer.from('{"lockfileVersion":3}');
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      existsSync: () => true,
      writeFileSync: (p: string, c: string) => {
        captured[String(p).replace(/\\/g, '/')] = c;
      }
    };
    const out = run(['--record-lock-hash'], recDeps);
    expect(out.exitCode).toBe(0);
    expect(Object.keys(captured).some((k) => k.endsWith('.vihs-installed-lock-hash'))).toBe(true);
  });
});

describe('checkEnvSync: renderReport + marker path', () => {
  it('renders an in-sync line and a labelled blocking report', () => {
    expect(renderReport({ problems: [], hardStale: false }, { label: 'x' })[0]).toContain('in sync');
    const lines = renderReport(
      { problems: [{ id: 'node-modules-stale', hard: true, message: 'm', remedy: 'npm ci' }], hardStale: true },
      { label: 'x' }
    );
    expect(lines.some((l) => l.includes('BLOCKING'))).toBe(true);
  });

  it('marker lives under node_modules (git-ignored)', () => {
    expect(INSTALLED_LOCK_HASH_MARKER.replace(/\\/g, '/')).toBe('node_modules/.vihs-installed-lock-hash');
  });
});

describe('checkEnvSync: default fs factories and error paths (VHS-REQ-697.4)', () => {
  it('computeLockHash uses the real fs by default and returns undefined when the lockfile is absent', () => {
    const root = makeTempRoot('vihs-envsync-lock-');
    // No package-lock.json in the temp root -> default fs.readFileSync throws
    // ENOENT -> the catch returns undefined.
    expect(computeLockHash(root)).toBeUndefined();
    // With a real lockfile the default fs path hashes it deterministically.
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    expect(computeLockHash(root)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('readInstalledLockHash uses the real fs by default and returns undefined when the marker is missing', () => {
    const root = makeTempRoot('vihs-envsync-marker-');
    expect(readInstalledLockHash(root)).toBeUndefined();
  });

  it('recordInstalledLockHash skips when the lockfile is absent (computeLockHash undefined)', () => {
    // readFileSync throws for every path -> computeLockHash returns undefined ->
    // the recorder skips with the no-package-lock reason before touching disk.
    const throwing = {
      readFileSync: () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      existsSync: () => true,
      writeFileSync: () => undefined
    };
    expect(recordInstalledLockHash('/repo', throwing)).toMatchObject({
      action: 'skipped',
      reason: 'no-package-lock'
    });
  });

  it('recordInstalledLockHash reports a failed action when the marker write throws', () => {
    const failingWrite = {
      readFileSync: () => Buffer.from('{"lockfileVersion":3}'),
      existsSync: () => true,
      writeFileSync: () => {
        throw new Error('disk full');
      }
    };
    const outcome = recordInstalledLockHash('/repo', failingWrite);
    expect(outcome).toMatchObject({ action: 'failed' });
    expect(String((outcome as { reason?: string }).reason)).toContain('disk full');
  });

  it('recordInstalledLockHash records via the real fs when a lockfile and node_modules exist', () => {
    const root = makeTempRoot('vihs-envsync-record-');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    const outcome = recordInstalledLockHash(root);
    expect(outcome).toMatchObject({ action: 'recorded' });
    // The marker was written to the real path and later reads back as in-sync.
    expect(readInstalledLockHash(root)).toBe(computeLockHash(root));
    const facts = collectEnvFacts({ repoRoot: root });
    expect(facts.lockHashMatches).toBe(true);
    expect(facts.outPresent).toBe(false);
  });

  it('collectEnvFacts treats an existsSync failure as out/ absent', () => {
    const deps = {
      readFileSync: (p: string) => {
        if (String(p).replace(/\\/g, '/').endsWith('package-lock.json')) {
          return Buffer.from('{"lockfileVersion":3}');
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      existsSync: () => {
        throw new Error('permission denied');
      }
    };
    const facts = collectEnvFacts({ repoRoot: '/repo' }, deps);
    expect(facts.outPresent).toBe(false);
    // Marker missing -> hard-stale signal preserved.
    expect(facts.lockHashMatches).toBeUndefined();
  });

  it('collectEnvFacts defaults repoRoot to the process cwd and uses the real fs', () => {
    // No repoRoot and no deps -> options.repoRoot falls back to process.cwd() and
    // the default fs.existsSync probes the real out/ directory. The suite runs
    // from the repo root where out/ is present after compile, but the assertion
    // only requires a boolean so it holds regardless of compile state.
    const facts = collectEnvFacts({});
    expect(typeof facts.outPresent).toBe('boolean');
  });

  it('run emits JSON when --json is supplied', () => {
    const inSyncDeps = {
      repoRoot: '/repo',
      readFileSync: (p: string) => {
        const key = String(p).replace(/\\/g, '/');
        if (key === '/repo/package-lock.json') return Buffer.from('{"lockfileVersion":3}');
        if (key.endsWith('.vihs-installed-lock-hash')) {
          return computeLockHash('/repo', { readFileSync: () => Buffer.from('{"lockfileVersion":3}') }) as string;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      existsSync: () => true
    };
    const out = run(['--json'], inSyncDeps);
    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(String(out.stdout));
    expect(parsed).toMatchObject({ problems: [], hardStale: false });
  });

  it('run defaults repoRoot to the process cwd for a --report and never fails', () => {
    // No repoRoot in deps -> run() falls back to process.cwd() and reads the real
    // repository via the default fs factories; --report is advisory-only (exit 0).
    const out = run(['--report']);
    expect(out.exitCode).toBe(0);
    expect(typeof out.stdout).toBe('string');
  });
});
