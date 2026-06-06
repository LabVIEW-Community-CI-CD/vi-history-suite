import * as path from 'node:path';

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
  blockedReason?: 'revision-id-missing' | 'blob-read-failed' | 'blob-not-vi';
}

export interface ComparedViLibraryMembership {
  isMember: boolean;
  /** Repo-relative path of the owning `.lvlib`/`.lvclass`, when detected. */
  libraryRelativePath?: string;
  libraryKind?: 'lvlib' | 'lvclass';
}

export interface ComparisonReportPreflightResult {
  normalizedRelativePath: string;
  ready: boolean;
  blockedReason?:
    | 'left-revision-id-missing'
    | 'right-revision-id-missing'
    | 'left-blob-read-failed'
    | 'right-blob-read-failed'
    | 'left-blob-not-vi'
    | 'right-blob-not-vi';
  left: ComparisonReportPreflightBlobResult;
  right: ComparisonReportPreflightBlobResult;
  /**
   * VHS-REQ-625: whether the compared VI is a member of a LabVIEW library/class
   * at the selected (right) revision. Best-effort; omitted when not detected.
   */
  comparedViLibraryMembership?: ComparedViLibraryMembership;
}

export interface ComparisonReportPreflightDeps {
  readRevisionBlob?: typeof readRevisionBlob;
  resolveRevisionRelativePaths?: typeof resolveRevisionRelativePaths;
  detectComparedViLibraryMembership?: typeof detectComparedViLibraryMembership;
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
  const leftRevisionId = options.leftRevisionId.trim();
  const rightRevisionId = options.rightRevisionId.trim();
  const requestedRevisionIds = [leftRevisionId, rightRevisionId].filter((value) => value.length > 0);
  const resolvedRelativePaths =
    requestedRevisionIds.length > 0
      ? await (deps.resolveRevisionRelativePaths ?? resolveRevisionRelativePaths)(
          options.repoRoot,
          normalizedRelativePath,
          requestedRevisionIds
        )
      : new Map<string, string>();

  const left = leftRevisionId
    ? await inspectRevisionBlob(
        options.repoRoot,
        leftRevisionId,
        normalizeResolvedRelativePath(
          resolvedRelativePaths.get(leftRevisionId),
          normalizedRelativePath
        ),
        options.strictRsrcHeader ?? false,
        deps.readRevisionBlob ?? readRevisionBlob
      )
    : createMissingRevisionBlobResult();
  const right = rightRevisionId
    ? await inspectRevisionBlob(
        options.repoRoot,
        rightRevisionId,
        normalizeResolvedRelativePath(
          resolvedRelativePaths.get(rightRevisionId),
          normalizedRelativePath
        ),
        options.strictRsrcHeader ?? false,
        deps.readRevisionBlob ?? readRevisionBlob
      )
    : createMissingRevisionBlobResult();

  // VHS-REQ-625: best-effort detection of whether the compared VI is a library
  // member at the selected (right) revision. Never blocks the comparison.
  let comparedViLibraryMembership: ComparedViLibraryMembership | undefined;
  if (right.isVi && rightRevisionId) {
    try {
      const detected = await (
        deps.detectComparedViLibraryMembership ?? detectComparedViLibraryMembership
      )(
        options.repoRoot,
        rightRevisionId,
        right.resolvedRelativePath ?? normalizedRelativePath
      );
      if (detected.isMember) {
        comparedViLibraryMembership = detected;
      }
    } catch {
      comparedViLibraryMembership = undefined;
    }
  }

  return {
    normalizedRelativePath,
    ready: left.isVi && right.isVi,
    blockedReason: deriveBlockedReason(left, right),
    left,
    right,
    ...(comparedViLibraryMembership ? { comparedViLibraryMembership } : {})
  };
}

/**
 * VHS-REQ-625: determines whether `normalizedRelativePath` is listed as a member
 * of any `.lvlib`/`.lvclass` at `revisionId`. LabVIEW libraries list members as
 * `<Item ... URL="relative/path"/>` resolved against the library file's
 * directory. Best-effort and git-only; no VI parsing.
 */
export async function detectComparedViLibraryMembership(
  repoRoot: string,
  revisionId: string,
  relativePath: string,
  runGitImpl: typeof runGit = runGit
): Promise<ComparedViLibraryMembership> {
  const normalizedTarget = normalizeRelativeGitPath(relativePath);
  if (!normalizedTarget) {
    return { isMember: false };
  }

  let treeListing: string;
  try {
    const stdout = await runGitImpl(['ls-tree', '-r', '--name-only', revisionId], repoRoot, 'utf8');
    treeListing = String(stdout);
  } catch {
    return { isMember: false };
  }

  const libraryPaths = treeListing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\.(lvlib|lvclass)$/iu.test(line));

  for (const libraryPath of libraryPaths) {
    let libraryContent: string;
    try {
      const stdout = await runGitImpl(
        ['show', `${revisionId}:${libraryPath}`],
        repoRoot,
        'utf8'
      );
      libraryContent = String(stdout);
    } catch {
      continue;
    }

    const libraryDirectory = path.posix.dirname(libraryPath.replace(/\\/g, '/'));
    const memberUrls = [...libraryContent.matchAll(/URL\s*=\s*"([^"]+)"/giu)].map(
      (match) => match[1]
    );
    for (const memberUrl of memberUrls) {
      const resolvedMember = normalizeRelativeGitPath(
        path.posix.join(libraryDirectory === '.' ? '' : libraryDirectory, memberUrl.replace(/\\/g, '/'))
      );
      if (resolvedMember && resolvedMember === normalizedTarget) {
        return {
          isMember: true,
          libraryRelativePath: libraryPath,
          libraryKind: /\.lvclass$/iu.test(libraryPath) ? 'lvclass' : 'lvlib'
        };
      }
    }
  }

  return { isMember: false };
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

function createMissingRevisionBlobResult(): ComparisonReportPreflightBlobResult {
  return {
    revisionId: '',
    blobSpecifier: '[missing revision id]',
    isVi: false,
    blockedReason: 'revision-id-missing'
  };
}

function normalizeResolvedRelativePath(
  relativePath: string | undefined,
  fallbackRelativePath: string
): string {
  return requireNonEmpty(normalizeRelativeGitPath(relativePath ?? fallbackRelativePath), 'relativePath');
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
    if (left.blockedReason === 'revision-id-missing') {
      return 'left-revision-id-missing';
    }

    return left.blockedReason === 'blob-read-failed' ? 'left-blob-read-failed' : 'left-blob-not-vi';
  }

  if (!right.isVi) {
    if (right.blockedReason === 'revision-id-missing') {
      return 'right-revision-id-missing';
    }

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
