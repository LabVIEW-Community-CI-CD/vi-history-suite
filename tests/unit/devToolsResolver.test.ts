import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS,
  DEVTOOLS_RELEASE_TAG_PREFIX,
  DEVTOOLS_VERSION_BUNDLED,
  decideDevToolsLaunch,
  formatDevToolsUpdateNotice,
  installDevToolsRelease,
  isPrereleaseDevToolsVersion,
  normalizeDevToolsVersionSetting,
  parseDevToolsReleaseTag,
  planDevToolsUpdateCheck,
  resolveDevToolsMcpLaunch,
  selectDevToolsReleaseForVersion,
  verifyDevToolsInstallation,
  type DevToolsReleaseManifestForVerify
} from '../../src/tooling/devToolsResolver';

// Deterministic fold matching scripts/buildDevToolsRelease.js computeContentDigest.
function foldContentDigest(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

const SCRIPT_TAIL = DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS.join('/');

describe('normalizeDevToolsVersionSetting (VHS-REQ-677.1)', () => {
  it('treats unset, empty, and "bundled" as the bundled build', () => {
    expect(normalizeDevToolsVersionSetting(undefined)).toEqual({ kind: 'bundled' });
    expect(normalizeDevToolsVersionSetting('')).toEqual({ kind: 'bundled' });
    expect(normalizeDevToolsVersionSetting('  ')).toEqual({ kind: 'bundled' });
    expect(normalizeDevToolsVersionSetting(DEVTOOLS_VERSION_BUNDLED)).toEqual({ kind: 'bundled' });
  });

  it('pins a devtools-v tag or bare semver', () => {
    expect(normalizeDevToolsVersionSetting('devtools-v1.2.3')).toEqual({
      kind: 'pinned',
      version: '1.2.3',
      tag: 'devtools-v1.2.3'
    });
    expect(normalizeDevToolsVersionSetting('2.0.0')).toEqual({
      kind: 'pinned',
      version: '2.0.0',
      tag: 'devtools-v2.0.0'
    });
  });

  it('fails closed on a malformed version rather than silently bundling', () => {
    expect(() => normalizeDevToolsVersionSetting('latest')).toThrow(/Invalid viHistorySuite\.devTools\.version/);
    expect(() => normalizeDevToolsVersionSetting('1.2')).toThrow();
    expect(() => normalizeDevToolsVersionSetting('devtools-v01.2.3')).toThrow();
  });
});

describe('release tag parsing (VHS-REQ-677.1)', () => {
  it('parses valid devtools-v tags and rejects others', () => {
    expect(parseDevToolsReleaseTag('devtools-v1.2.3')).toBe('1.2.3');
    expect(parseDevToolsReleaseTag('devtools-v1.2.3-dev.7')).toBe('1.2.3-dev.7');
    expect(parseDevToolsReleaseTag('v1.2.3')).toBeUndefined();
    expect(parseDevToolsReleaseTag('devtools-vlatest')).toBeUndefined();
  });

  it('detects prerelease versions', () => {
    expect(isPrereleaseDevToolsVersion('1.2.3-dev.7')).toBe(true);
    expect(isPrereleaseDevToolsVersion('1.2.3')).toBe(false);
  });

  it('selects a release by exact pinned tag', () => {
    const releases = [{ tag: 'devtools-v1.0.0' }, { tag: 'devtools-v1.2.3' }];
    expect(selectDevToolsReleaseForVersion(releases, '1.2.3')).toEqual({ tag: 'devtools-v1.2.3' });
    expect(selectDevToolsReleaseForVersion(releases, '9.9.9')).toBeUndefined();
  });
});

describe('resolveDevToolsMcpLaunch (VHS-REQ-677.2)', () => {
  it('launches the bundled script under the bundled root', () => {
    const resolution = resolveDevToolsMcpLaunch({
      selection: { kind: 'bundled' },
      bundledRootPath: '/ext',
      installBaseDir: '/store/devtools'
    });
    expect(resolution.source).toBe('bundled');
    expect(resolution.scriptPath.replace(/\\/g, '/')).toBe(`/ext/${SCRIPT_TAIL}`);
  });

  it('launches a pinned version under its per-version install dir', () => {
    const resolution = resolveDevToolsMcpLaunch({
      selection: { kind: 'pinned', version: '1.2.3', tag: 'devtools-v1.2.3' },
      bundledRootPath: '/ext',
      installBaseDir: '/store/devtools'
    });
    expect(resolution.source).toBe('pinned');
    expect(resolution.version).toBe('1.2.3');
    expect(resolution.scriptPath.replace(/\\/g, '/')).toBe(`/store/devtools/1.2.3/${SCRIPT_TAIL}`);
  });
});

describe('decideDevToolsLaunch (VHS-REQ-677.2)', () => {
  const base = {
    bundledRootPath: '/ext',
    installBaseDir: '/store/devtools',
    isWorkspaceTrusted: true,
    isVerifiedInstall: () => true
  };

  it('is always ready for the bundled build', () => {
    const decision = decideDevToolsLaunch({ ...base, selection: { kind: 'bundled' }, isVerifiedInstall: () => false });
    expect(decision.status).toBe('ready');
  });

  it('is ready for a verified pin in a trusted workspace', () => {
    const decision = decideDevToolsLaunch({
      ...base,
      selection: { kind: 'pinned', version: '1.2.3', tag: 'devtools-v1.2.3' }
    });
    expect(decision.status).toBe('ready');
    expect(decision.resolution.source).toBe('pinned');
  });

  it('blocks a pin in an untrusted workspace', () => {
    const decision = decideDevToolsLaunch({
      ...base,
      isWorkspaceTrusted: false,
      selection: { kind: 'pinned', version: '1.2.3', tag: 'devtools-v1.2.3' }
    });
    expect(decision.status).toBe('blocked-untrusted');
    expect(decision.reason).toBe('workspace-not-trusted');
  });

  it('requires install when the pin is not verified', () => {
    const decision = decideDevToolsLaunch({
      ...base,
      isVerifiedInstall: () => false,
      selection: { kind: 'pinned', version: '1.2.3', tag: 'devtools-v1.2.3' }
    });
    expect(decision.status).toBe('install-required');
    expect(decision.reason).toBe('pinned-install-missing');
  });
});

describe('planDevToolsUpdateCheck / formatDevToolsUpdateNotice (VHS-REQ-677.4)', () => {
  const releases = [
    { tag: 'devtools-v1.0.0' },
    { tag: 'devtools-v1.2.0' },
    { tag: 'devtools-v1.3.0-dev.9' },
    { tag: 'not-a-devtools-tag' }
  ];

  it('surfaces only the latest STABLE version', () => {
    const plan = planDevToolsUpdateCheck({ currentVersion: '1.0.0', releases });
    expect(plan.hasUpdate).toBe(true);
    expect(plan.latestStableVersion).toBe('1.2.0');
    expect(plan.latestStableTag).toBe('devtools-v1.2.0');
  });

  it('reports no update when current is already latest stable', () => {
    const plan = planDevToolsUpdateCheck({ currentVersion: '1.2.0', releases });
    expect(plan.hasUpdate).toBe(false);
  });

  it('never claims an update against the bundled build (no current version)', () => {
    const plan = planDevToolsUpdateCheck({ releases });
    expect(plan.hasUpdate).toBe(false);
    expect(plan.latestStableVersion).toBe('1.2.0');
  });

  it('formats a notice only when an update exists', () => {
    const plan = planDevToolsUpdateCheck({ currentVersion: '1.0.0', releases });
    expect(formatDevToolsUpdateNotice(plan, '1.0.0')).toContain('devtools-v1.2.0');
    expect(formatDevToolsUpdateNotice({ hasUpdate: false }, '1.2.0')).toBeUndefined();
  });
});

describe('verifyDevToolsInstallation (VHS-REQ-677.3)', () => {
  const files = [
    { path: 'out/cli/runViSemanticMcpServer.js', sha256: 'a'.repeat(64) },
    { path: 'out/a.js', sha256: 'b'.repeat(64) }
  ];
  const contentDigest = foldContentDigest(
    files.map((f) => `${f.path}:${f.sha256}`).slice().sort()
  );
  const manifest: DevToolsReleaseManifestForVerify = { version: '1.2.3', contentDigest, files };
  const goodHash = (abs: string): Promise<string | undefined> => {
    const entry = files.find((f) => abs.replace(/\\/g, '/').endsWith(f.path));
    return Promise.resolve(entry?.sha256);
  };

  it('passes a byte-identical tree', async () => {
    const result = await verifyDevToolsInstallation({
      manifest,
      installDir: '/store/devtools/1.2.3',
      deps: { hashFile: goodHash, foldContentDigest }
    });
    expect(result.ok).toBe(true);
  });

  it('fails closed on a missing file', async () => {
    const result = await verifyDevToolsInstallation({
      manifest,
      installDir: '/x',
      deps: { hashFile: () => Promise.resolve(undefined), foldContentDigest }
    });
    expect(result).toMatchObject({ ok: false, reason: 'missing-file' });
  });

  it('fails closed on a digest mismatch', async () => {
    const result = await verifyDevToolsInstallation({
      manifest,
      installDir: '/x',
      deps: { hashFile: () => Promise.resolve('c'.repeat(64)), foldContentDigest }
    });
    expect(result).toMatchObject({ ok: false, reason: 'digest-mismatch' });
  });

  it('fails closed when the aggregate content digest disagrees', async () => {
    const result = await verifyDevToolsInstallation({
      manifest: { ...manifest, contentDigest: 'f'.repeat(64) },
      installDir: '/x',
      deps: { hashFile: goodHash, foldContentDigest }
    });
    expect(result).toMatchObject({ ok: false, reason: 'content-digest-mismatch' });
  });

  it('fails closed on an empty manifest', async () => {
    const result = await verifyDevToolsInstallation({
      manifest: { version: '1.2.3', contentDigest, files: [] },
      installDir: '/x',
      deps: { hashFile: goodHash, foldContentDigest }
    });
    expect(result).toMatchObject({ ok: false, reason: 'empty-manifest' });
  });
});

describe('installDevToolsRelease (VHS-REQ-677.3)', () => {
  const files = [{ path: 'out/a.js', sha256: 'b'.repeat(64) }];
  const contentDigest = foldContentDigest([`${files[0].path}:${files[0].sha256}`]);
  const manifest: DevToolsReleaseManifestForVerify = { version: '1.2.3', contentDigest, files };

  function makeDeps(overrides: Record<string, unknown> = {}) {
    const removed: string[] = [];
    const marked: string[] = [];
    const deps = {
      listReleases: () => Promise.resolve([{ tag: 'devtools-v1.2.3' }]),
      downloadRelease: () => Promise.resolve({ manifest }),
      hashFile: () => Promise.resolve('b'.repeat(64)),
      foldContentDigest,
      removeDir: (dir: string) => {
        removed.push(dir);
        return Promise.resolve();
      },
      markVerified: (dir: string) => {
        marked.push(dir);
        return Promise.resolve();
      },
      ...overrides
    };
    return { deps, removed, marked };
  }

  it('installs, verifies, and marks a good release', async () => {
    const { deps, marked } = makeDeps();
    const result = await installDevToolsRelease({
      version: '1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      deps
    });
    expect(result.ok).toBe(true);
    expect(marked[0].replace(/\\/g, '/')).toBe('/store/devtools/1.2.3');
  });

  it('refuses to install in an untrusted workspace', async () => {
    const { deps } = makeDeps();
    const result = await installDevToolsRelease({
      version: '1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: false,
      deps
    });
    expect(result).toMatchObject({ ok: false, reason: 'workspace-not-trusted' });
  });

  it('fails closed when the pinned release is not published', async () => {
    const { deps } = makeDeps({ listReleases: () => Promise.resolve([]) });
    const result = await installDevToolsRelease({
      version: '1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      deps
    });
    expect(result).toMatchObject({ ok: false, reason: 'release-not-found' });
  });

  it('removes a partial install and fails when verification fails', async () => {
    const { deps, removed, marked } = makeDeps({ hashFile: () => Promise.resolve('z'.repeat(64)) });
    const result = await installDevToolsRelease({
      version: '1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      deps
    });
    expect(result.ok).toBe(false);
    expect(marked).toHaveLength(0);
    expect(removed.some((d) => d.replace(/\\/g, '/') === '/store/devtools/1.2.3')).toBe(true);
  });

  it('fails closed when the downloaded manifest version disagrees', async () => {
    const { deps } = makeDeps({
      downloadRelease: () => Promise.resolve({ manifest: { ...manifest, version: '9.9.9' } })
    });
    const result = await installDevToolsRelease({
      version: '1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      deps
    });
    expect(result).toMatchObject({ ok: false, reason: 'manifest-version-mismatch' });
  });

  it('fails closed when the download fails', async () => {
    const { deps } = makeDeps({ downloadRelease: () => Promise.resolve(undefined) });
    const result = await installDevToolsRelease({
      version: '1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      deps
    });
    expect(result).toMatchObject({ ok: false, reason: 'download-failed' });
  });

  it('fails closed on an invalid version', async () => {
    const { deps } = makeDeps();
    const result = await installDevToolsRelease({
      version: 'latest',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      deps
    });
    expect(result).toMatchObject({ ok: false, reason: 'invalid-version' });
  });
});

describe('constants', () => {
  it('mirrors the bundled MCP script tail', () => {
    expect(SCRIPT_TAIL).toBe('out/cli/runViSemanticMcpServer.js');
    expect(DEVTOOLS_RELEASE_TAG_PREFIX).toBe('devtools-v');
  });
});
