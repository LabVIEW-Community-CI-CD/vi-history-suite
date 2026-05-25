import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const UNKNOWN_COMMIT = '<unknown>';
const UNKNOWN_SHORT_COMMIT = 'unknown';

export interface BuildInfo {
  extensionVersion: string;
  extensionCommit: string;
  extensionBuildRef: string;
}

export interface BuildInfoDeps {
  fs?: Pick<typeof fs, 'readFile'>;
  buildInfoPath?: string;
  packageJsonPath?: string;
}

interface RawBuildInfo {
  extensionVersion?: unknown;
  extensionCommit?: unknown;
}

interface RawPackageJson {
  version?: unknown;
}

function formatShortCommit(commit: string): string {
  if (commit === UNKNOWN_COMMIT) {
    return UNKNOWN_SHORT_COMMIT;
  }
  return commit.slice(0, 7);
}

function formatBuildRef(version: string, commit: string): string {
  return `${version}+${formatShortCommit(commit)}`;
}

function isValidBuildInfo(data: unknown): data is RawBuildInfo {
  return typeof data === 'object' && data !== null;
}

function extractVersionFromBuildInfo(data: RawBuildInfo): string | undefined {
  if (typeof data.extensionVersion === 'string' && data.extensionVersion.trim()) {
    return data.extensionVersion.trim();
  }
  return undefined;
}

function extractCommitFromBuildInfo(data: RawBuildInfo): string {
  if (typeof data.extensionCommit === 'string' && data.extensionCommit.trim()) {
    const trimmed = data.extensionCommit.trim();
    if (trimmed !== UNKNOWN_COMMIT && trimmed !== UNKNOWN_SHORT_COMMIT) {
      return trimmed;
    }
  }
  return UNKNOWN_COMMIT;
}

async function readPackageJsonVersion(
  packageJsonPath: string,
  fsApi: Pick<typeof fs, 'readFile'>
): Promise<string> {
  try {
    const content = await fsApi.readFile(packageJsonPath, 'utf8');
    const data = JSON.parse(content) as RawPackageJson;
    if (typeof data.version === 'string' && data.version.trim()) {
      return data.version.trim();
    }
  } catch {
    // Fall through to default
  }
  return '0.0.0';
}

export function resolveBuildInfoPath(extensionPath?: string): string {
  const basePath = extensionPath ?? path.resolve(__dirname, '..');
  return path.join(basePath, 'buildInfo.json');
}

export function resolvePackageJsonPath(extensionPath?: string): string {
  const basePath = extensionPath ?? path.resolve(__dirname, '..', '..');
  return path.join(basePath, 'package.json');
}

export async function readBuildInfo(deps: BuildInfoDeps = {}): Promise<BuildInfo> {
  const fsApi = deps.fs ?? fs;
  const buildInfoPath = deps.buildInfoPath ?? resolveBuildInfoPath();
  const packageJsonPath = deps.packageJsonPath ?? resolvePackageJsonPath();

  let extensionVersion: string | undefined;
  let extensionCommit = UNKNOWN_COMMIT;

  try {
    const content = await fsApi.readFile(buildInfoPath, 'utf8');
    const data: unknown = JSON.parse(content);

    if (isValidBuildInfo(data)) {
      extensionVersion = extractVersionFromBuildInfo(data);
      extensionCommit = extractCommitFromBuildInfo(data);
    }
  } catch {
    // Build info is missing or malformed; fall back to package.json
  }

  if (!extensionVersion) {
    extensionVersion = await readPackageJsonVersion(packageJsonPath, fsApi);
  }

  return {
    extensionVersion,
    extensionCommit,
    extensionBuildRef: formatBuildRef(extensionVersion, extensionCommit)
  };
}

export { UNKNOWN_COMMIT, UNKNOWN_SHORT_COMMIT, formatShortCommit, formatBuildRef };
