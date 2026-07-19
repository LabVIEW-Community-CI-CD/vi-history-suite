/**
 * VHS-REQ-677: runtime dev-tools version resolution for the MCP server launch.
 *
 * The Marketplace-installed extension always ships a *bundled* dev-tools build
 * under its own `out/`. Independently of a Marketplace republish, a user may
 * PIN an explicit dev-tools version from the independent SemVer 2.0 release line
 * (VHS-REQ-676, `devtools-vX.Y.Z`); when pinned, the extension launches the MCP
 * server from a verified copy of that release installed under global storage.
 *
 * This module is the PURE planning + verification layer:
 *   - normalize the `viHistorySuite.devTools.version` setting,
 *   - select which release tag a pinned version maps to,
 *   - resolve which MCP entrypoint script to launch (bundled vs pinned),
 *   - verify an installed dev-tools tree against its release manifest digests,
 *   - plan an opt-in "newer stable version available" check.
 * All filesystem and network access is dependency-injected by the caller, so
 * the policy is unit-testable in isolation and fails closed on any mismatch.
 */

import * as path from 'node:path';

import { compareSemVer, isSemVerGreater, isValidSemVer } from '../support/semver';

/** Sentinel value of `viHistorySuite.devTools.version` selecting the bundled build. */
export const DEVTOOLS_VERSION_BUNDLED = 'bundled';

/** Release tag prefix of the independent dev-tools SemVer 2.0 line (VHS-REQ-676). */
export const DEVTOOLS_RELEASE_TAG_PREFIX = 'devtools-v';

/**
 * Path segments, relative to a resolved dev-tools root, of the MCP server stdio
 * entrypoint. Matches the bundled layout so bundled and pinned installs launch
 * the same script under their respective roots.
 */
export const DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS = [
  'out',
  'cli',
  'runViSemanticMcpServer.js'
] as const;

/** Extracts the SemVer core+prerelease from a `devtools-vX.Y.Z` tag, else undefined. */
export function parseDevToolsReleaseTag(tag: string): string | undefined {
  if (!tag.startsWith(DEVTOOLS_RELEASE_TAG_PREFIX)) {
    return undefined;
  }
  const version = tag.slice(DEVTOOLS_RELEASE_TAG_PREFIX.length);
  return isValidSemVer(version) ? version : undefined;
}

/** True when a `devtools-vX.Y.Z` version carries a SemVer 2.0 prerelease (e.g. `-dev.7`). */
export function isPrereleaseDevToolsVersion(version: string): boolean {
  return /-/.test(version.replace(/^v/, ''));
}

export type DevToolsVersionSelection =
  | { readonly kind: 'bundled' }
  | { readonly kind: 'pinned'; readonly version: string; readonly tag: string };

/**
 * Normalizes the raw `viHistorySuite.devTools.version` setting. An unset, empty,
 * or `"bundled"` value selects the bundled build. A `devtools-vX.Y.Z` tag or a
 * bare SemVer 2.0 version pins that release. Any other value is rejected
 * (fail-closed) so a malformed setting never silently falls back to bundled.
 */
export function normalizeDevToolsVersionSetting(raw: string | undefined | null): DevToolsVersionSelection {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '' || trimmed === DEVTOOLS_VERSION_BUNDLED) {
    return { kind: 'bundled' };
  }
  const version = trimmed.startsWith(DEVTOOLS_RELEASE_TAG_PREFIX)
    ? trimmed.slice(DEVTOOLS_RELEASE_TAG_PREFIX.length)
    : trimmed;
  if (!isValidSemVer(version)) {
    throw new Error(
      `Invalid viHistorySuite.devTools.version "${raw}": expected "bundled" or a "${DEVTOOLS_RELEASE_TAG_PREFIX}X.Y.Z" SemVer 2.0 tag.`
    );
  }
  return { kind: 'pinned', version, tag: `${DEVTOOLS_RELEASE_TAG_PREFIX}${version}` };
}

/** One dev-tools release visible on the official repo, as needed for selection. */
export interface DevToolsRelease {
  readonly tag: string;
  readonly createdAt?: string;
}

/**
 * Selects the release matching a pinned version's exact tag. Returns undefined
 * when the pinned tag is not published (caller fails closed rather than guessing).
 */
export function selectDevToolsReleaseForVersion(
  releases: readonly DevToolsRelease[],
  version: string
): DevToolsRelease | undefined {
  const tag = `${DEVTOOLS_RELEASE_TAG_PREFIX}${version}`;
  return releases.find((release) => release.tag === tag);
}

export interface DevToolsUpdateCheckPlan {
  /** True when a newer STABLE dev-tools version exists than the current one. */
  readonly hasUpdate: boolean;
  /** The latest stable `X.Y.Z` version available, or undefined when none. */
  readonly latestStableVersion?: string;
  /** The latest stable release tag, or undefined when none. */
  readonly latestStableTag?: string;
}

/**
 * Plans an opt-in "newer stable dev-tools version available" check. Prereleases
 * (`devtools-vX.Y.Z-dev.<run>`) are ignored so tracking only surfaces stable
 * releases. `hasUpdate` is true only when the latest stable version is strictly
 * greater (SemVer 2.0 precedence, VHS-REQ-676) than `currentVersion`.
 */
export function planDevToolsUpdateCheck(options: {
  readonly currentVersion?: string;
  readonly releases: readonly DevToolsRelease[];
}): DevToolsUpdateCheckPlan {
  const stable = options.releases
    .map((release) => parseDevToolsReleaseTag(release.tag))
    .filter((version): version is string => version !== undefined && !isPrereleaseDevToolsVersion(version))
    .sort((a, b) => compareSemVer(b, a));
  const latestStableVersion = stable[0];
  if (latestStableVersion === undefined) {
    return { hasUpdate: false };
  }
  const latestStableTag = `${DEVTOOLS_RELEASE_TAG_PREFIX}${latestStableVersion}`;
  const hasUpdate =
    options.currentVersion !== undefined &&
    isSemVerGreater(latestStableVersion, options.currentVersion);
  return { hasUpdate, latestStableVersion, latestStableTag };
}

/**
 * Formats the opt-in "newer dev-tools version available" notification for a
 * plan, or undefined when there is nothing to surface. Kept pure so the message
 * is unit-testable without the VS Code notification API.
 */
export function formatDevToolsUpdateNotice(
  plan: DevToolsUpdateCheckPlan,
  currentVersion: string
): string | undefined {
  if (!plan.hasUpdate || plan.latestStableVersion === undefined) {
    return undefined;
  }
  return `A newer dev-tools version is available: ${DEVTOOLS_RELEASE_TAG_PREFIX}${plan.latestStableVersion} (you have ${DEVTOOLS_RELEASE_TAG_PREFIX}${currentVersion}). Update viHistorySuite.devTools.version to pin it.`;
}

export type DevToolsMcpLaunchSource = 'bundled' | 'pinned';

export interface DevToolsMcpLaunchResolution {
  readonly source: DevToolsMcpLaunchSource;
  /** Absolute path to the MCP server stdio entrypoint to launch. */
  readonly scriptPath: string;
  /** Dev-tools version being launched; undefined for the bundled build. */
  readonly version?: string;
  /** Absolute root of the resolved dev-tools tree. */
  readonly rootPath: string;
}

/**
 * Resolves which MCP server entrypoint to launch. Bundled selection launches the
 * script shipped under `bundledRootPath`; a pinned selection launches from
 * `<installBaseDir>/<version>` (the caller must have installed + verified it).
 * Pure over the selection and paths.
 */
export function resolveDevToolsMcpLaunch(options: {
  readonly selection: DevToolsVersionSelection;
  readonly bundledRootPath: string;
  readonly installBaseDir: string;
}): DevToolsMcpLaunchResolution {
  if (options.selection.kind === 'bundled') {
    return {
      source: 'bundled',
      rootPath: options.bundledRootPath,
      scriptPath: path.join(options.bundledRootPath, ...DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS)
    };
  }
  const rootPath = path.join(options.installBaseDir, options.selection.version);
  return {
    source: 'pinned',
    version: options.selection.version,
    rootPath,
    scriptPath: path.join(rootPath, ...DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS)
  };
}

/** Minimal shape of the dev-tools release manifest needed for verification. */
export interface DevToolsReleaseManifestForVerify {
  readonly version: string;
  readonly contentDigest: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
}

export interface DevToolsVerificationResult {
  readonly ok: boolean;
  /** Stable machine reason on failure (empty when ok). */
  readonly reason: string;
  /** Human-facing detail on failure (empty when ok). */
  readonly detail: string;
}

const OK_VERIFICATION: DevToolsVerificationResult = { ok: true, reason: '', detail: '' };

/**
 * Verifies an installed dev-tools tree against its release manifest: every
 * manifest file must exist under `installDir` with a byte-for-byte matching
 * SHA-256, and the aggregate `contentDigest` must fold to the manifest's value
 * (using the same deterministic sorted "path:sha256" scheme as the builder,
 * VHS-REQ-676). Fails closed on the first mismatch. `computeSha256` and
 * `readFileExists` are injected so this is testable without touching disk.
 */
export async function verifyDevToolsInstallation(options: {
  readonly manifest: DevToolsReleaseManifestForVerify;
  readonly installDir: string;
  readonly deps: {
    readonly hashFile: (absolutePath: string) => Promise<string | undefined>;
    readonly foldContentDigest: (lines: readonly string[]) => string;
  };
}): Promise<DevToolsVerificationResult> {
  const { manifest, installDir, deps } = options;
  if (manifest.files.length === 0) {
    return { ok: false, reason: 'empty-manifest', detail: 'Release manifest lists no files.' };
  }
  const lines: string[] = [];
  for (const entry of manifest.files) {
    const absolute = path.join(installDir, entry.path);
    const actual = await deps.hashFile(absolute);
    if (actual === undefined) {
      return {
        ok: false,
        reason: 'missing-file',
        detail: `Expected dev-tools file is missing: ${entry.path}`
      };
    }
    if (actual !== entry.sha256) {
      return {
        ok: false,
        reason: 'digest-mismatch',
        detail: `Dev-tools file failed integrity check: ${entry.path}`
      };
    }
    lines.push(`${entry.path}:${entry.sha256}`);
  }
  const aggregate = deps.foldContentDigest(lines.slice().sort());
  if (aggregate !== manifest.contentDigest) {
    return {
      ok: false,
      reason: 'content-digest-mismatch',
      detail: 'Aggregate dev-tools content digest does not match the release manifest.'
    };
  }
  return OK_VERIFICATION;
}

export type DevToolsInstallStatus = 'ready' | 'install-required' | 'blocked-untrusted';

export interface DevToolsLaunchDecision {
  readonly status: DevToolsInstallStatus;
  readonly resolution: DevToolsMcpLaunchResolution;
  /** Stable machine reason when status is not `ready` (empty otherwise). */
  readonly reason: string;
}

/**
 * Decides how to launch the MCP server for a configured selection, WITHOUT any
 * IO: `isVerifiedInstall` reports whether a pinned version is already installed
 * and integrity-verified under global storage. Bundled always launches. A
 * pinned selection launches only when the workspace is trusted AND the install
 * is verified; otherwise the caller must install it (or the untrusted host is
 * blocked). This keeps a pinned pin from silently downgrading to bundled — the
 * caller surfaces the reason rather than launching mismatched code.
 */
export function decideDevToolsLaunch(options: {
  readonly selection: DevToolsVersionSelection;
  readonly bundledRootPath: string;
  readonly installBaseDir: string;
  readonly isWorkspaceTrusted: boolean;
  readonly isVerifiedInstall: (version: string) => boolean;
}): DevToolsLaunchDecision {
  const resolution = resolveDevToolsMcpLaunch({
    selection: options.selection,
    bundledRootPath: options.bundledRootPath,
    installBaseDir: options.installBaseDir
  });
  if (options.selection.kind === 'bundled') {
    return { status: 'ready', resolution, reason: '' };
  }
  if (!options.isWorkspaceTrusted) {
    return { status: 'blocked-untrusted', resolution, reason: 'workspace-not-trusted' };
  }
  if (!options.isVerifiedInstall(options.selection.version)) {
    return { status: 'install-required', resolution, reason: 'pinned-install-missing' };
  }
  return { status: 'ready', resolution, reason: '' };
}

export interface DevToolsInstallResult {
  readonly ok: boolean;
  readonly version: string;
  readonly reason: string;
  readonly detail: string;
}

/**
 * Orchestrates installing a pinned dev-tools release under global storage with
 * all IO/network injected and every failure fail-closed:
 *   1. select the exact release tag from the OFFICIAL repo's releases,
 *   2. download the release archive + its manifest,
 *   3. extract into a clean per-version install directory,
 *   4. re-verify the extracted tree against the manifest digests,
 *   5. mark the install verified only on success (partial installs are removed).
 * The workspace-trust gate is enforced by the caller (see `decideDevToolsLaunch`);
 * this function additionally refuses to run when `isWorkspaceTrusted` is false.
 */
export async function installDevToolsRelease(options: {
  readonly version: string;
  readonly installBaseDir: string;
  readonly isWorkspaceTrusted: boolean;
  readonly deps: {
    readonly listReleases: () => Promise<readonly DevToolsRelease[]>;
    readonly downloadRelease: (
      tag: string,
      targetDir: string
    ) => Promise<{ manifest: DevToolsReleaseManifestForVerify } | undefined>;
    readonly hashFile: (absolutePath: string) => Promise<string | undefined>;
    readonly foldContentDigest: (lines: readonly string[]) => string;
    readonly removeDir: (dir: string) => Promise<void>;
    readonly markVerified: (dir: string, version: string) => Promise<void>;
  };
}): Promise<DevToolsInstallResult> {
  const { version, installBaseDir, deps } = options;
  if (!isValidSemVer(version)) {
    return { ok: false, version, reason: 'invalid-version', detail: `Not a SemVer 2.0 version: ${version}` };
  }
  if (!options.isWorkspaceTrusted) {
    return {
      ok: false,
      version,
      reason: 'workspace-not-trusted',
      detail: 'Installing a pinned dev-tools version requires a trusted workspace.'
    };
  }
  const targetDir = path.join(installBaseDir, version);
  const releases = await deps.listReleases();
  const release = selectDevToolsReleaseForVersion(releases, version);
  if (release === undefined) {
    return {
      ok: false,
      version,
      reason: 'release-not-found',
      detail: `No published dev-tools release for ${DEVTOOLS_RELEASE_TAG_PREFIX}${version}.`
    };
  }
  await deps.removeDir(targetDir);
  const downloaded = await deps.downloadRelease(release.tag, targetDir);
  if (downloaded === undefined) {
    await deps.removeDir(targetDir);
    return { ok: false, version, reason: 'download-failed', detail: `Failed to download ${release.tag}.` };
  }
  if (downloaded.manifest.version !== version) {
    await deps.removeDir(targetDir);
    return {
      ok: false,
      version,
      reason: 'manifest-version-mismatch',
      detail: `Downloaded manifest version ${downloaded.manifest.version} does not match requested ${version}.`
    };
  }
  const verification = await verifyDevToolsInstallation({
    manifest: downloaded.manifest,
    installDir: targetDir,
    deps: { hashFile: deps.hashFile, foldContentDigest: deps.foldContentDigest }
  });
  if (!verification.ok) {
    await deps.removeDir(targetDir);
    return { ok: false, version, reason: verification.reason, detail: verification.detail };
  }
  await deps.markVerified(targetDir, version);
  return { ok: true, version, reason: '', detail: '' };
}
