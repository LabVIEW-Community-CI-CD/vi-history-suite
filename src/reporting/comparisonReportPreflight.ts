import { detectViSignature, ViSignature } from '../domain/viMagicCore';
import { normalizeRelativeGitPath, runGit } from '../git/gitCli';

export interface ComparisonReportPreflightOptions {
  repoRoot: string;
  relativePath: string;
  leftRevisionId: string;
  rightRevisionId: string;
  strictRsrcHeader?: boolean;
}

export interface ComparisonReportPreflightBlobResult {
  revisionId: string;
  resolvedRelativePath?: string;
  blobSpecifier: string;
  signature?: ViSignature;
  isVi: boolean;
  blockedReason?: 'blob-read-failed' | 'blob-not-vi';
}

export interface ComparisonReportPreflightResult {
  normalizedRelativePath: string;
  ready: boolean;
  blockedReason?:
    | 'left-blob-read-failed'
    | 'right-blob-read-failed'
    | 'left-blob-not-vi'
    | 'right-blob-not-vi';
  left: ComparisonReportPreflightBlobResult;
  right: ComparisonReportPreflightBlobResult;
}

export interface ComparisonReportPreflightDeps {
  readRevisionBlob?: typeof readRevisionBlob;
  resolveRevisionRelativePaths?: typeof resolveRevisionRelativePaths;
}

export function buildRevisionBlobSpecifier(revisionId: string, relativePath: string): string {
  return `${requireNonEmpty(revisionId, 'revisionId')}:${requireNonEmpty(
    normalizeRelativeGitPath(relativePath),
    'relativePath'
  )}`;
}

export async function readRevisionBlob(
  repoRoot: string,
  revisionId: string,
  relativePath: string
): Promise<Buffer> {
  const stdout = await runGit(['show', buildRevisionBlobSpecifier(revisionId, relativePath)], repoRoot, 'buffer');
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout), 'utf8');
}

export async function preflightComparisonReportRevisions(
  options: ComparisonReportPreflightOptions,
  deps: ComparisonReportPreflightDeps = {}
): Promise<ComparisonReportPreflightResult> {
  const normalizedRelativePath = requireNonEmpty(
    normalizeRelativeGitPath(options.relativePath),
    'relativePath'
  );
  const resolvedRelativePaths = await (
    deps.resolveRevisionRelativePaths ?? resolveRevisionRelativePaths
  )(options.repoRoot, normalizedRelativePath, [options.leftRevisionId, options.rightRevisionId]);
  const leftRelativePath =
    resolvedRelativePaths.get(options.leftRevisionId) ?? normalizedRelativePath;
  const rightRelativePath =
    resolvedRelativePaths.get(options.rightRevisionId) ?? normalizedRelativePath;

  const left = await inspectRevisionBlob(
    options.repoRoot,
    options.leftRevisionId,
    leftRelativePath,
    options.strictRsrcHeader ?? false,
    deps.readRevisionBlob ?? readRevisionBlob
  );
  const right = await inspectRevisionBlob(
    options.repoRoot,
    options.rightRevisionId,
    rightRelativePath,
    options.strictRsrcHeader ?? false,
    deps.readRevisionBlob ?? readRevisionBlob
  );

  return {
    normalizedRelativePath,
    ready: left.isVi && right.isVi,
    blockedReason: deriveBlockedReason(left, right),
    left,
    right
  };
}

async function inspectRevisionBlob(
  repoRoot: string,
  revisionId: string,
  relativePath: string,
  strictRsrcHeader: boolean,
  readBlob: typeof readRevisionBlob
): Promise<ComparisonReportPreflightBlobResult> {
  const blobSpecifier = buildRevisionBlobSpecifier(revisionId, relativePath);

  try {
    const bytes = await readBlob(repoRoot, revisionId, relativePath);
    const signature = detectViSignature(bytes, { strictRsrcHeader });
    if (!signature) {
      return {
        revisionId,
        resolvedRelativePath: relativePath,
        blobSpecifier,
        isVi: false,
        blockedReason: 'blob-not-vi'
      };
    }

    return {
      revisionId,
      resolvedRelativePath: relativePath,
      blobSpecifier,
      signature,
      isVi: true
    };
  } catch {
    return {
      revisionId,
      resolvedRelativePath: relativePath,
      blobSpecifier,
      isVi: false,
      blockedReason: 'blob-read-failed'
    };
  }
}

export async function resolveRevisionRelativePaths(
  repoRoot: string,
  relativePath: string,
  revisionIds: string[]
): Promise<Map<string, string>> {
  const normalizedRelativePath = requireNonEmpty(
    normalizeRelativeGitPath(relativePath),
    'relativePath'
  );
  const requestedRevisionIds = new Set(
    revisionIds.map((value) => requireNonEmpty(value, 'revisionId'))
  );
  if (requestedRevisionIds.size === 0) {
    return new Map();
  }

  try {
    const stdout = await runGit(
      ['log', '--follow', '--name-status', '--format=COMMIT %H', '--', normalizedRelativePath],
      repoRoot,
      'utf8'
    );
    return parseRevisionRelativePathHistory(
      String(stdout),
      normalizedRelativePath,
      requestedRevisionIds
    );
  } catch {
    return new Map();
  }
}

function parseRevisionRelativePathHistory(
  output: string,
  fallbackRelativePath: string,
  requestedRevisionIds: ReadonlySet<string>
): Map<string, string> {
  const resolved = new Map<string, string>();
  let currentCommit: string | undefined;
  let currentStatusLines: string[] = [];
  let followedRelativePath = fallbackRelativePath;

  const finalizeCurrentCommit = (): void => {
    if (!currentCommit) {
      return;
    }

    const { pathAtCommit, olderPath } = deriveRevisionPathsForCommit(
      currentStatusLines,
      followedRelativePath
    );
    if (requestedRevisionIds.has(currentCommit)) {
      resolved.set(currentCommit, pathAtCommit);
    }
    followedRelativePath = olderPath;
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith('COMMIT ')) {
      finalizeCurrentCommit();
      currentCommit = line.slice('COMMIT '.length).trim();
      currentStatusLines = [];
      continue;
    }

    if (line.length === 0) {
      continue;
    }

    currentStatusLines.push(line);
  }

  finalizeCurrentCommit();
  return resolved;
}

function deriveRevisionPathsForCommit(
  statusLines: readonly string[],
  fallbackRelativePath: string
): { pathAtCommit: string; olderPath: string } {
  for (const line of statusLines) {
    const [status, ...rest] = line.split('\t');
    if (!status) {
      continue;
    }

    if ((status.startsWith('R') || status.startsWith('C')) && rest.length >= 2) {
      const olderPath = normalizeRelativeGitPath(rest[0]);
      const pathAtCommit = normalizeRelativeGitPath(rest[1]);
      return { pathAtCommit, olderPath };
    }

    if (rest.length >= 1) {
      const normalizedPath = normalizeRelativeGitPath(rest[0]);
      return { pathAtCommit: normalizedPath, olderPath: normalizedPath };
    }
  }

  return {
    pathAtCommit: fallbackRelativePath,
    olderPath: fallbackRelativePath
  };
}

function deriveBlockedReason(
  left: ComparisonReportPreflightBlobResult,
  right: ComparisonReportPreflightBlobResult
): ComparisonReportPreflightResult['blockedReason'] {
  if (!left.isVi) {
    return left.blockedReason === 'blob-read-failed' ? 'left-blob-read-failed' : 'left-blob-not-vi';
  }

  if (!right.isVi) {
    return right.blockedReason === 'blob-read-failed'
      ? 'right-blob-read-failed'
      : 'right-blob-not-vi';
  }

  return undefined;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be non-empty`);
  }

  return trimmed;
}
