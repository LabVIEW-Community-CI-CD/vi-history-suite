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

  const left = await inspectRevisionBlob(
    options.repoRoot,
    options.leftRevisionId,
    normalizedRelativePath,
    options.strictRsrcHeader ?? false,
    deps.readRevisionBlob ?? readRevisionBlob
  );
  const right = await inspectRevisionBlob(
    options.repoRoot,
    options.rightRevisionId,
    normalizedRelativePath,
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
        blobSpecifier,
        isVi: false,
        blockedReason: 'blob-not-vi'
      };
    }

    return {
      revisionId,
      blobSpecifier,
      signature,
      isVi: true
    };
  } catch {
    return {
      revisionId,
      blobSpecifier,
      isVi: false,
      blockedReason: 'blob-read-failed'
    };
  }
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
